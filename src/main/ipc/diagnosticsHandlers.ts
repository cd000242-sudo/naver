/**
 * One-click diagnostic report.
 *
 * Breaks the "works on my machine → release → customer broken → no data → guess
 * again" loop. On a publish failure (or on demand) this captures the exact data
 * needed to diagnose environment-specific bugs — app version, OS, WHICH browser
 * the client used (the #1 dev/deploy variable), and the tail of the main log —
 * into a text file on the Desktop the customer can simply send.
 */
import { ipcMain, app } from 'electron';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { getChromiumExecutablePath } from '../../browserUtils.js';
import { pickProblemLogLines } from './diagnosticsLogFilter.js';
import { maskUserNameInPaths } from '../../debug/privacyScrubber.js';

/** [2026-10-09] 파일마다 끝 8MB만 읽는다(회전본이 70MB를 넘은 적이 있다). */
const MAX_LOG_TAIL_BYTES = 8 * 1024 * 1024;
let mainLogFileGetter: () => string | null = () => null;

function resolveMainLogFiles(): string[] {
  const todayFile = path.join(app.getPath('userData'), 'logs', `main-${new Date().toISOString().slice(0, 10)}.log`);
  let current = todayFile;
  try { current = mainLogFileGetter() || todayFile; } catch { current = todayFile; }
  // 오래된 회전본(.1)을 먼저, 현재 파일을 나중에 둔다.
  return [`${current}.1`, current].filter((file) => fs.existsSync(file));
}

function describeLogSources(): string {
  const files = resolveMainLogFiles();
  if (!files.length) return '(없음)';
  const current = files[files.length - 1];
  const rotated = files.length > 1 || current.endsWith('.1');
  return `${path.basename(current.replace(/\.1$/, ''))}${rotated ? ' (+.1)' : ''}`;
}

function readFileTailLines(file: string): string[] {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, MAX_LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    const lines = buffer.toString('utf8').split('\n');
    // 중간에서 잘렸으면 첫 줄은 온전하지 않으니 버린다.
    return size > length ? lines.slice(1) : lines;
  } finally {
    fs.closeSync(fd);
  }
}

function readTodayMainLogLines(): string[] | string {
  try {
    const files = resolveMainLogFiles();
    if (!files.length) return '(오늘 날짜 로그 파일이 없습니다)';
    return files.flatMap(readFileTailLines);
  } catch (e) {
    return `(로그 읽기 실패: ${(e as Error).message})`;
  }
}

function readRecentMainLog(maxLines = 500): string {
  const lines = readTodayMainLogLines();
  return typeof lines === 'string' ? lines : lines.slice(-maxLines).join('\n');
}

/** [2026-10-09] 마지막 500줄 밖으로 밀려난 오류도 남도록 오늘 기록의 오류·경고 줄을 따로 담는다. */
function readTodayProblemLines(): string {
  const lines = readTodayMainLogLines();
  if (typeof lines === 'string') return lines;
  const picked = pickProblemLogLines(lines);
  return picked.length ? picked.join('\n') : '(오늘 기록에 오류·경고 줄이 없습니다)';
}

async function describeBrowser(): Promise<string[]> {
  const out: string[] = [];
  try {
    const browserPath = await getChromiumExecutablePath();
    out.push(`발행 브라우저 경로: ${browserPath || '없음 → 최초 발행 시 자동 다운로드 대상'}`);
    const isSystem = !!browserPath && /Program Files|Google\\Chrome|Google Chrome/i.test(browserPath);
    const isManaged = !!browserPath && /browsers[\\/]chrome/i.test(browserPath);
    out.push(`브라우저 종류: ${isSystem ? '시스템 Chrome' : isManaged ? '자동설치 Chrome' : browserPath ? '기타/번들' : '없음'}`);
  } catch (e) {
    out.push(`브라우저 확인 실패: ${(e as Error).message}`);
  }
  out.push(`PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH || '(미설정)'}`);
  return out;
}

export async function generateDiagnosticReport(context?: { lastError?: string; stage?: string }): Promise<{ ok: boolean; savedPath: string; report: string }> {
  // [2026-07-03 FIX] 헤더 시각을 KST로 표기 — 기존 UTC(Z) 표기가 실제 로컬(한국) 시간과 9시간
  //   차이나 사용자가 혼동(예: 오전 7시인데 22시로 보임). 로그 파일 조회(readRecentMainLog)는
  //   로거 파일명 규약과 맞춰야 하므로 건드리지 않고, 표시 시각만 KST로 변환한다.
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const lines: string[] = [];
  lines.push('===== Better Life Naver 진단 리포트 =====');
  lines.push(`생성시각: ${nowKst} (KST)`);
  lines.push(`앱 버전: ${app.getVersion()}`);
  lines.push(`OS: ${process.platform} ${os.release()} (${os.arch()})`);
  try {
    lines.push(`CPU: ${os.cpus()[0]?.model ?? '?'} x${os.cpus().length}`);
    lines.push(`메모리: ${Math.round(os.totalmem() / 1e9)}GB`);
  } catch { /* best-effort */ }
  lines.push(...(await describeBrowser()));
  lines.push(`기록 파일: ${describeLogSources()}`);
  if (context?.stage) lines.push(`실패 단계: ${context.stage}`);
  if (context?.lastError) {
    lines.push('');
    lines.push('----- 마지막 오류 -----');
    lines.push(context.lastError);
  }
  lines.push('');
  lines.push('----- 오늘 기록 중 오류·경고 줄 (최대 300줄, 오래된 것부터) -----');
  lines.push(readTodayProblemLines());
  lines.push('');
  lines.push('----- 최근 로그 (main, 마지막 500줄) -----');
  lines.push(readRecentMainLog());
  // [2026-10-09] 보고서 전체에서 PC 사용자 이름을 가린다.
  const report = maskUserNameInPaths(lines.join('\n'));

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const fileName = `BetterLifeNaver-진단리포트-${stamp}.txt`;
  let savedPath = '';
  for (const baseDir of ['desktop', 'userData'] as const) {
    try {
      const candidate = path.join(app.getPath(baseDir), fileName);
      fs.writeFileSync(candidate, report, 'utf8');
      savedPath = candidate;
      break;
    } catch {
      // try next location
    }
  }
  return { ok: !!savedPath, savedPath, report };
}

/** [2026-10-09] 실제로 쓰고 있는 기록 파일을 main.ts 가 알려준다(앱을 켠 날 기준이라 자정을 넘겨도 맞다). */
export function setMainLogFileGetter(getter: () => string | null): void {
  mainLogFileGetter = getter;
}

export function registerDiagnosticsHandlers(): void {
  ipcMain.handle('diagnostics:generateReport', async (_e, context?: { lastError?: string; stage?: string }) => {
    try {
      return await generateDiagnosticReport(context);
    } catch (e) {
      return { ok: false, savedPath: '', report: `진단 리포트 생성 실패: ${(e as Error).message}` };
    }
  });
}
