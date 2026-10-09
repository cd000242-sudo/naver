/**
 * [2026-10-09 고객 진단 파일] 진단 파일이 기록 마지막 500줄만 담아, 오류 뒤에 작업을 더 하면 원인 줄이 밀려 사라졌다.
 * 오늘 기록 전체에서 오류·경고 줄만 따로 골라 담는다. 성능 측정·내부 디버그처럼 매번 찍히는 소음은 뺀다.
 */
const PROBLEM = /❌|⚠️|\[ERROR\]|실패|오류|IMAGE_INSERTION|LOGIN_REQUIRED|LOGIN_CHALLENGE|ACCOUNT_PROTECTED|ACCOUNT_MISMATCH|NETWORK_WAIT|PUBLISH_OUTCOME_UNKNOWN/;
const NOISE = /\[AdaptiveLimiter\]|\[IPCTiming\]|\[TailDebug\]|\[Watchdog\]/;

/** 오래된 것부터, 가장 최근 maxLines 줄까지. */
export function pickProblemLogLines(lines: readonly string[], maxLines = 300): string[] {
  return lines.filter((line) => PROBLEM.test(line) && !NOISE.test(line)).slice(-maxLines);
}
