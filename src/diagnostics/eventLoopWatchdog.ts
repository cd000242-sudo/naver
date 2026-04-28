// v2.7.27 — Event Loop Watchdog (+ Adaptive Limiter & Runtime Stats 연동)
// 메인 프로세스의 이벤트 루프 lag을 측정해 일정 임계 이상 막히면 자동 로그 + 자기 조절.

import path from 'path';
import fs from 'fs';
import { globalLimiter } from '../runtime/adaptiveLimiter.js';
import { recordFreeze, recordSevereLag } from '../runtime/runtimeStats.js';

const INTERVAL_MS = 1000;          // 1초마다 측정
const WARN_LAG_MS = 200;            // 200ms 이상 → 경고
const SEVERE_LAG_MS = 1000;         // 1초 이상 → 심각 (응답없음 임박)
const FREEZE_LAG_MS = 5000;         // 5초 이상 → "응답없음" 발생 가능

let intervalHandle: NodeJS.Timeout | null = null;
let lastCheck = Date.now();
let totalSamples = 0;
let warnCount = 0;
let severeCount = 0;
let freezeCount = 0;

interface WatchdogOptions {
  logFilePath?: string;
  onSevereLag?: (lagMs: number) => void;
}

let logFilePath: string | null = null;
let onSevereLagCallback: ((lagMs: number) => void) | null = null;

function appendLog(line: string): void {
  const stamped = `[${new Date().toISOString()}] ${line}\n`;
  // eslint-disable-next-line no-console
  console.warn(`[Watchdog] ${line}`);
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, stamped);
    } catch {
      // 로그 실패는 무시 (watchdog 자체가 앱 실행을 방해해선 안 됨)
    }
  }
}

export function startEventLoopWatchdog(opts: WatchdogOptions = {}): void {
  if (intervalHandle) return;

  logFilePath = opts.logFilePath || path.join(process.env.TEMP || '/tmp', 'bln-watchdog.log');
  onSevereLagCallback = opts.onSevereLag || null;

  appendLog(`Watchdog started (interval=${INTERVAL_MS}ms, warn=${WARN_LAG_MS}ms, severe=${SEVERE_LAG_MS}ms)`);
  lastCheck = Date.now();

  intervalHandle = setInterval(() => {
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
        try {
          onSevereLagCallback(lagMs);
        } catch {
          // ignore
        }
      }
    } else if (lagMs >= SEVERE_LAG_MS) {
      severeCount++;
      appendLog(`⚠️ SEVERE lag: ${lagMs}ms (>= ${SEVERE_LAG_MS}ms). 무거운 작업이 메인 스레드를 막고 있음.`);
      try { recordSevereLag(); } catch { /* ignore */ }
      try { globalLimiter.onLagDetected(lagMs); } catch { /* ignore */ }
      if (onSevereLagCallback) {
        try {
          onSevereLagCallback(lagMs);
        } catch {
          // ignore
        }
      }
    } else if (lagMs >= WARN_LAG_MS) {
      warnCount++;
      // 경고 수준은 1분에 1번만 로그 (스팸 방지)
      if (warnCount % 60 === 1) {
        appendLog(`⏱️ WARN lag: ${lagMs}ms (>= ${WARN_LAG_MS}ms). 누적 ${warnCount}회.`);
      }
      try { globalLimiter.onHealthySample(lagMs); } catch { /* ignore */ }
    } else {
      // 정상 범위 — Limiter에 healthy 샘플 통지 (5초 연속이면 max ↑)
      try { globalLimiter.onHealthySample(lagMs); } catch { /* ignore */ }
    }
  }, INTERVAL_MS);

  // Node 종료 시 핸들 정리 (앱 종료 막지 않도록 unref)
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

export function getWatchdogStats(): {
  totalSamples: number;
  warnCount: number;
  severeCount: number;
  freezeCount: number;
} {
  return { totalSamples, warnCount, severeCount, freezeCount };
}
