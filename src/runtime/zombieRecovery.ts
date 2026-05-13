/**
 * [v2.10.155] 좀비 프로세스 회복 시스템 — Layer 2
 *
 * 배경: Layer 1(v2.10.151~154) cleanup이 못 잡은 좀비 (SIGKILL/OS crash/정전)를
 * 다음 앱 시작 시 자동 회복. 사용자 통찰 "버벅거림 진짜 원인 = 좀비 누적".
 *
 * 안전 설계 (security + architect agent 통합):
 *   - PID + cmdline fingerprint 2중 검증 (PID Recycling 차단)
 *   - cmdline에 우리 앱 userDataDir(`.naver-blog-automation`) 포함 여부 검증
 *     → 일반 사용자 Chrome 절대 보호
 *   - allowlist: chrome/chromium만 kill, 다른 프로세스 무시
 *   - System PID(<100) 차단
 *   - 5초 timeout (앱 부팅 차단 방지)
 *
 * 흐름:
 *   1. 앱 시작 → loadPreviousLock() → 이전 세션 PID 목록
 *   2. PowerShell CIM으로 살아있는 프로세스 cmdline 조회
 *   3. ZombieDetector: PID + cmdline 2중 검증 통과 후보만 추출
 *   4. ZombieKiller: taskkill /F /PID /T 실행 (rate-limit 5개)
 *   5. 새 세션 시작 → initSession() + 추적 시작
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface ZombieLockEntry {
  pid: number;
  kind: 'puppeteer-chrome' | 'playwright-chromium' | 'spawned-child';
  cmdlineFingerprint: string;  // userDataDir 경로 — 우리 앱 고유 식별
  label: string;
  spawnedAt: number;
}

interface ZombieLockFile {
  version: 1;
  mainPid: number;
  appVersion: string;
  writtenAt: number;
  entries: ZombieLockEntry[];
}

export interface RecoveryReport {
  scanned: number;       // 이전 lock의 entry 수
  candidates: number;    // 2중 검증 통과한 후보
  killed: number[];      // 실제 kill한 PID
  failed: { pid: number; reason: string }[];
  skippedReason?: string;
  durationMs: number;
}

const LOCK_VERSION = 1;
const LOCK_FILENAME = 'zombie-lock.json';
const RATE_LIMIT = 10; // 부팅당 최대 kill 수 (security agent 권고)
const TIMEOUT_MS = 5000;

// [v2.10.157] 우리 앱 fingerprint 패턴 — 다음 2개 중 하나라도 cmdline에 있어야 kill 후보
//   1. .naver-blog-automation — browserSessionManager/naverBlogAutomation 메인 자동화 (os.homedir 하위)
//   2. better-life-naver — ImageFX/Flow 등 Electron userData 하위 (productName 기반)
// 둘 다 우리 앱 고유 경로. 일반 사용자 Chrome cmdline에 절대 안 들어감.
const APP_FINGERPRINTS = ['.naver-blog-automation', 'better-life-naver'];

function _hasAppFingerprint(cmdline: string): boolean {
  return APP_FINGERPRINTS.some(fp => cmdline.includes(fp));
}

// allowlist (executable basename) — security agent 권고
const ALLOWED_NAMES = new Set(['chrome.exe', 'chromium.exe', 'msedge.exe']);

// System PID 차단
const MIN_SAFE_PID = 100;

let _lockPath: string | null = null;
let _currentEntries: Map<number, ZombieLockEntry> = new Map();
let _writeTimer: NodeJS.Timeout | null = null;

/**
 * 좀비 회복 시스템 초기화 (앱 시작 직후 호출)
 */
export function initZombieRecovery(opts: { userDataDir: string }): void {
  try {
    _lockPath = path.join(opts.userDataDir, LOCK_FILENAME);
  } catch (e) {
    console.warn('[ZombieRecovery] init 실패:', (e as Error).message);
  }
}

/**
 * 새 세션 시작 — lock file 초기화 + 현재 main PID 기록
 */
export function startSession(opts: { mainPid: number; appVersion: string }): void {
  if (!_lockPath) return;
  _currentEntries = new Map();
  const lock: ZombieLockFile = {
    version: LOCK_VERSION,
    mainPid: opts.mainPid,
    appVersion: opts.appVersion,
    writtenAt: Date.now(),
    entries: [],
  };
  _writeAtomic(lock);
}

/**
 * Browser PID 추적 등록 (puppeteer/playwright launch 후 호출)
 *
 * @example trackBrowserPid({ pid: browser.process()?.pid, kind: 'puppeteer-chrome',
 *                            cmdlineFingerprint: profileDir, label: 'naver-blog' })
 */
export function trackBrowserPid(entry: Omit<ZombieLockEntry, 'spawnedAt'>): void {
  if (!_lockPath) return;
  if (!entry.pid || entry.pid < MIN_SAFE_PID) return;
  if (!entry.cmdlineFingerprint || !_hasAppFingerprint(entry.cmdlineFingerprint)) {
    // fingerprint가 우리 앱 경로 아니면 추적 안 함 (kill 후보 안 됨)
    return;
  }
  _currentEntries.set(entry.pid, {
    ...entry,
    spawnedAt: Date.now(),
  });
  _scheduleWrite();
}

/**
 * Browser PID 추적 해제 (정상 close 후 호출)
 */
export function untrackBrowserPid(pid: number): void {
  if (_currentEntries.delete(pid)) {
    _scheduleWrite();
  }
}

/**
 * 정상 종료 시 호출 — entries 비우고 flush
 */
export function clearLockOnNormalExit(): void {
  if (!_lockPath) return;
  if (_writeTimer) {
    clearTimeout(_writeTimer);
    _writeTimer = null;
  }
  try {
    fs.unlinkSync(_lockPath);
  } catch { /* 파일 없음 — 정상 */ }
}

/**
 * 시작 시 이전 세션 좀비 회복 — 5초 timeout, non-blocking caller에 의해 호출.
 */
export async function recoverZombiesOnStartup(opts: {
  currentMainPid: number;
}): Promise<RecoveryReport> {
  const startedAt = Date.now();
  const report: RecoveryReport = {
    scanned: 0,
    candidates: 0,
    killed: [],
    failed: [],
    durationMs: 0,
  };

  if (!_lockPath) {
    report.skippedReason = 'not-initialized';
    return report;
  }

  // 이전 lock 로드
  let previous: ZombieLockFile | null = null;
  try {
    if (fs.existsSync(_lockPath)) {
      const raw = fs.readFileSync(_lockPath, 'utf-8');
      previous = JSON.parse(raw);
    }
  } catch (e) {
    report.skippedReason = `load-failed: ${(e as Error).message}`;
    return report;
  }

  if (!previous || previous.version !== LOCK_VERSION || !previous.entries?.length) {
    report.skippedReason = 'no-previous-entries';
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  // 가드: 이전 mainPid가 현재 mainPid면 skip (자기 자신 kill 방지)
  if (previous.mainPid === opts.currentMainPid) {
    report.skippedReason = 'same-mainpid';
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  report.scanned = previous.entries.length;

  // 살아있는 프로세스 조회 (PowerShell CIM)
  let liveProcesses: Map<number, { name: string; cmdline: string }>;
  try {
    liveProcesses = await _queryProcessesByPids(
      previous.entries.map(e => e.pid),
      TIMEOUT_MS - (Date.now() - startedAt),
    );
  } catch (e) {
    report.skippedReason = `query-failed: ${(e as Error).message}`;
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  // 2중 검증 (PID + cmdline + allowlist)
  const candidates: ZombieLockEntry[] = [];
  for (const entry of previous.entries) {
    // 1차: PID 존재
    const live = liveProcesses.get(entry.pid);
    if (!live) continue;

    // 2차: System PID 차단
    if (entry.pid < MIN_SAFE_PID) continue;

    // 3차: allowlist (chrome/chromium만 — 다른 프로세스는 무시)
    const nameOk = ALLOWED_NAMES.has(live.name.toLowerCase());
    if (!nameOk) continue;

    // 4차: cmdline fingerprint 검증 — PID Recycling 차단의 핵심
    //   우리 앱 fingerprint(.naver-blog-automation 또는 better-life-naver) 중 하나라도 포함되어야 kill 후보
    if (!_hasAppFingerprint(live.cmdline)) continue;

    // 5차: 우리 앱의 fingerprint 경로와 정확히 일치
    if (!live.cmdline.includes(entry.cmdlineFingerprint)) continue;

    candidates.push(entry);
  }

  report.candidates = candidates.length;

  // Rate-limit 적용
  const toKill = candidates.slice(0, RATE_LIMIT);

  for (const c of toKill) {
    try {
      const ok = await _killPid(c.pid, TIMEOUT_MS - (Date.now() - startedAt));
      if (ok) {
        report.killed.push(c.pid);
      } else {
        report.failed.push({ pid: c.pid, reason: 'kill-failed' });
      }
    } catch (e) {
      report.failed.push({ pid: c.pid, reason: (e as Error).message });
    }
  }

  report.durationMs = Date.now() - startedAt;
  return report;
}

// ───────────────────────── 내부 헬퍼 ─────────────────────────

function _scheduleWrite(): void {
  if (_writeTimer || !_lockPath) return;
  _writeTimer = setTimeout(() => {
    _writeTimer = null;
    if (!_lockPath) return;
    const lock: ZombieLockFile = {
      version: LOCK_VERSION,
      mainPid: process.pid,
      appVersion: process.env.npm_package_version || 'unknown',
      writtenAt: Date.now(),
      entries: Array.from(_currentEntries.values()),
    };
    _writeAtomic(lock);
  }, 1000); // 1초 debounce
}

function _writeAtomic(lock: ZombieLockFile): void {
  if (!_lockPath) return;
  try {
    const tmp = _lockPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(lock, null, 2), 'utf-8');
    fs.renameSync(tmp, _lockPath);
  } catch (e) {
    console.warn('[ZombieRecovery] lock 저장 실패:', (e as Error).message);
  }
}

async function _queryProcessesByPids(
  pids: number[],
  timeoutMs: number,
): Promise<Map<number, { name: string; cmdline: string }>> {
  const result = new Map<number, { name: string; cmdline: string }>();
  if (pids.length === 0 || process.platform !== 'win32') return result;

  const pidFilter = pids.map(p => `ProcessId=${p}`).join(' OR ');
  const psScript = `Get-CimInstance Win32_Process -Filter "${pidFilter}" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`;

  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      windowsHide: true,
      shell: false,
    });
    let stdout = '';
    const timer = setTimeout(() => {
      try { ps.kill('SIGKILL'); } catch { /* ignore */ }
      resolve(result);
    }, Math.max(timeoutMs, 1000));

    ps.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    ps.on('error', () => { clearTimeout(timer); resolve(result); });
    ps.on('close', () => {
      clearTimeout(timer);
      try {
        const trimmed = stdout.trim();
        if (!trimmed) return resolve(result);
        const parsed = JSON.parse(trimmed);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (typeof item.ProcessId === 'number') {
            result.set(item.ProcessId, {
              name: String(item.Name || ''),
              cmdline: String(item.CommandLine || ''),
            });
          }
        }
      } catch { /* JSON parse 실패 — 빈 결과 반환 */ }
      resolve(result);
    });
  });
}

async function _killPid(pid: number, timeoutMs: number): Promise<boolean> {
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch { return false; }
  }
  return new Promise((resolve) => {
    const tk = spawn('taskkill.exe', ['/F', '/PID', String(pid), '/T'], {
      windowsHide: true,
      shell: false,
    });
    const timer = setTimeout(() => {
      try { tk.kill('SIGKILL'); } catch { /* ignore */ }
      resolve(false);
    }, Math.max(timeoutMs, 1000));
    tk.on('error', () => { clearTimeout(timer); resolve(false); });
    tk.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}
