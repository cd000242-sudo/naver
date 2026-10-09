/**
 * [2026-10-09 고객 진단 파일] 진단 파일이 기록 마지막 500줄만 담아, 오류 뒤에 작업을 더 하면 원인 줄이 밀려 사라졌다.
 * 오늘 기록 전체에서 오류·경고 줄만 따로 골라 담는다. 성능 측정·내부 디버그처럼 매번 찍히는 소음은 뺀다.
 */
const PROBLEM = /❌|⚠️|\[ERROR\]|실패|오류|IMAGE_INSERTION|LOGIN_REQUIRED|LOGIN_CHALLENGE|ACCOUNT_PROTECTED|ACCOUNT_MISMATCH|NETWORK_WAIT|PUBLISH_OUTCOME_UNKNOWN|\[RunEnd\]|\[AccountGuard\]/;
// [2026-10-09] 실제 기록에서 확인된 반복 소음. `[Config]` 전체는 빼지 않는다(`[ERROR] [Config] 설정 파일 읽기 실패`는 진짜 문제).
const NOISE = new RegExp([
  '\\[AdaptiveLimiter\\]', '\\[IPCTiming\\]', '\\[TailDebug\\]', '\\[Watchdog\\]',
  '\\[Config\\] ⚠️ primaryGeminiTextModel\\(',
  '\\[LicenseManager\\] [^\\n]*AbortError',
  'performServerSync: 서버 연결 실패 \\(This operation was aborted\\)',
  '(?:AdsPower|프록시) ❌ 비활성',
  '엔진 실패 시 동작:',
  '\\[(?:Wipe|CacheClear)\\] ⚠️ [^\\n]*삭제 실패',
  'Another instance is already running',
].join('|'));
// 실행 줄(진행 시각·실행 끝·계정 멈춤·이미지 실패)은 상한이 모자랄 때 먼저 남긴다.
const RUN = /\[\+\d+(?:\.\d+)?s\]|\[RunEnd\]|\[AccountGuard\]|IMAGE_INSERTION_FAILED/;
const MAX_LINE_CHARS = 500;

/** 오래된 것부터, 가장 최근 maxLines 줄까지. 상한을 넘으면 실행 줄을 먼저 채우고 남은 칸을 나머지 최근 줄로 채운다. */
export function pickProblemLogLines(lines: readonly string[], maxLines = 300): string[] {
  const candidates: Array<{ index: number; text: string; run: boolean }> = [];
  lines.forEach((line, index) => {
    if (!PROBLEM.test(line) || NOISE.test(line)) return;
    candidates.push({ index, text: line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) : line, run: RUN.test(line) });
  });
  if (candidates.length <= maxLines) return candidates.map((c) => c.text);
  const runs = candidates.filter((c) => c.run).slice(-maxLines);
  const others = candidates.filter((c) => !c.run).slice(-(maxLines - runs.length));
  return [...runs, ...others].sort((a, b) => a.index - b.index).map((c) => c.text);
}
