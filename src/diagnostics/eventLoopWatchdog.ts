// v2.7.46 — Event Loop Watchdog (게임 모드 친화 버전)
//
// 사용자 보고 (재발):
//   "서든어택 게임 중 시작작업줄이 없어졌다 생겼다 반복"
//
// 원인 추정:
//   1초 setInterval + fs.appendFileSync(매 임계 초과) 활동이
//   fullscreen 게임의 Windows shell(explorer.exe)을 깜빡이게 함.
//
// 수정:
//   1. 메인 윈도우 blur(포커스 잃음) 또는 minimize 시 watchdog 자동 일시 중단
//   2. fs.appendFileSync → fs.promises.appendFile (비동기, 게임 디스크 I/O 충돌 차단)
//   3. 기본 setInterval 폴링 1s → 5s로 완화 (게임 깜빡임 감소)
//   4. 외부에서 setActive(false) 호출 시 즉시 일시 중단 가능

import path from 'path';
import { promises as fsAsync } from 'fs';
import { globalLimiter } from '../runtime/adaptiveLimiter.js';
import { recordFreeze, recordSevereLag } from '../runtime/runtimeStats.js';

// ✅ [v2.7.46] 폴링 1s → 5s 완화 (게임 깜빡임 차단). 임계 비례 조정.
const INTERVAL_MS = 5000;
const WARN_LAG_MS = 500;        // 200 → 500ms (5s 폴링이라 비례)
const SEVERE_LAG_MS = 2000;     // 1s → 2s
const FREEZE_LAG_MS = 7000;     // 5s → 7s

let intervalHandle: NodeJS.Timeout | null = null;
let lastCheck = Date.now();
let totalSamples = 0;
let warnCount = 0;
let severeCount = 0;
let freezeCount = 0;

// ✅ [v2.7.46] 활성 상태 — 메인 윈도우가 사용자 시야에 있을 때만 watchdog 동작
let isActive = true;

interface WatchdogOptions {
  logFilePath?: string;
  onSevereLag?: (lagMs: number) => void;
}

let logFilePath: string | null = null;
let onSevereLagCallback: ((lagMs: number) => void) | null = null;

// ✅ [v2.7.46] 비동기 큐 — appendFileSync 디스크 sync 차단
let writeQueue: Promise<void> = Promise.resolve();

function appendLog(line: string): void {
  const stamped = `[${new Date().toISOString()}] ${line}\n`;
  // eslint-disable-next-line no-console
  console.warn(`[Watchdog] ${line}`);
  if (logFilePath) {
    // 큐에 비동기 쓰기 추가 — 매 호출마다 디스크 sync 안 함
    writeQueue = writeQueue.then(() => {
      if (logFilePath) {
        return fsAsync.appendFile(logFilePath, stamped).catch(() => undefined);
      }
      return undefined;
    });
  }
}

export function startEventLoopWatchdog(opts: WatchdogOptions = {}): void {
  if (intervalHandle) return;

  logFilePath = opts.logFilePath || path.join(process.env.TEMP || '/tmp', 'bln-watchdog.log');
  onSevereLagCallback = opts.onSevereLag || null;

  appendLog(`Watchdog started (interval=${INTERVAL_MS}ms, warn=${WARN_LAG_MS}ms, severe=${SEVERE_LAG_MS}ms)`);
  lastCheck = Date.now();

  intervalHandle = setInterval(() => {
    // ✅ [v2.7.46] 비활성 상태(게임/백그라운드)에서는 측정 스킵
    if (!isActive) {
      lastCheck = Date.now(); // 다음 활성 시 정확한 lag 측정 위해 reset
      return;
    }

    const expectedCheck = lastCheck + INTERVAL_MS;
    const now = Date.now();
    const lagMs = now - expectedCheck;
    lastCheck = now;
    totalSamples++;

    if (lagMs >= FREEZE_LAG_MS) {
      freezeCount++;
      appendLog(`🚨 FREEZE detected: lag=${lagMs}ms (>= ${FREEZE_LAG_MS}ms). UI 응답없음 표시 가능.`);
      try { recordFreeze(); } catch { /* ignore */ }
      try { globalLimiter.onLagDetected(lagMs); } catch { /* ignore */ }
      if (onSevereLagCallback) {
        try { onSevereLagCallback(lagMs); } catch { /* ignore */ }
      }
    } else if (lagMs >= SEVERE_LAG_MS) {
      severeCount++;
      appendLog(`⚠️ SEVERE lag: ${lagMs}ms (>= ${SEVERE_LAG_MS}ms). 무거운 작업이 메인 스레드를 막고 있음.`);
      try { recordSevereLag(); } catch { /* ignore */ }
      try { globalLimiter.onLagDetected(lagMs); } catch { /* ignore */ }
      if (onSevereLagCallback) {
        try { onSevereLagCallback(lagMs); } catch { /* ignore */ }
      }
    } else if (lagMs >= WARN_LAG_MS) {
      warnCount++;
      if (warnCount % 12 === 1) { // 5s × 12 = 1분에 1번
        appendLog(`⏱️ WARN lag: ${lagMs}ms (>= ${WARN_LAG_MS}ms). 누적 ${warnCount}회.`);
      }
      try { globalLimiter.onHealthySample(lagMs); } catch { /* ignore */ }
    } else {
      try { globalLimiter.onHealthySample(lagMs); } catch { /* ignore */ }
    }
  }, INTERVAL_MS);

  if (intervalHandle && typeof (intervalHandle as { unref?: () => void }).unref === 'function') {
    (intervalHandle as { unref: () => void }).unref();
  }
}

export function stopEventLoopWatchdog(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    appendLog(`Watchdog stopped (samples=${totalSamples}, warn=${warnCount}, severe=${severeCount}, freeze=${freezeCount})`);
  }
}

/**
 * ✅ [v2.7.46] 외부에서 watchdog 활성/비활성 토글
 *   메인 윈도우가 blur/minimize되면 false 호출 → 게임 등 fullscreen 앱 친화
 *   focus 복귀 시 true 호출 → 측정 재개
 */
export function setWatchdogActive(active: boolean): void {
  if (isActive === active) return;
  isActive = active;
  appendLog(`Watchdog ${active ? '활성' : '일시중단'} (외부 토글)`);
  if (active) {
    lastCheck = Date.now(); // 비활성 기간을 lag으로 오인 방지
  }
}

export function getWatchdogStats(): {
  totalSamples: number;
  warnCount: number;
  severeCount: number;
  freezeCount: number;
  isActive: boolean;
} {
  return { totalSamples, warnCount, severeCount, freezeCount, isActive };
}
