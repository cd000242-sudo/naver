/**
 * [v2.10.298] ImageFX / Flow 일별 성공 카운터.
 *
 * 목적: HTTP 429 응답이 왔을 때 "진짜 한도 초과" vs "봇 감지로 인한 동적 차단"을 구분.
 *
 * 배경: Google ImageFX/Flow는 명시적 한도(예: 1000장/일)를 공개하지 않고,
 *       자동화 감지 시 HTTP 429를 동일하게 반환. 사용자는 "1시간 기다려도 안 됨" 무한 대기.
 *
 * 휴리스틱:
 *   - 오늘 성공 0~9장 → 429 발생 = 봇감지 99% (진짜 한도 도달 불가능)
 *   - 오늘 성공 10~99장 → 429 발생 = 봇감지 가능성 ↑ (한도가 100장 미만일 가능성 ↓)
 *   - 오늘 성공 100장+ → 429 발생 = 진짜 한도 가능성 ↑
 *
 * 일별 리셋: PT(태평양시간) 자정 = 한국 오후 4-5시. UTC 기준 16시.
 *            단순화: 앱 재시작 시 리셋 + UTC 16시 경계 자동 리셋.
 */

type Engine = 'imagefx' | 'flow';

interface DailyCount {
  date: string;       // YYYY-MM-DD (UTC, 16시 offset 적용)
  successCount: number;
}

const counters = new Map<Engine, DailyCount>();

/**
 * 현재 PT(태평양시간) 기준 날짜를 YYYY-MM-DD로 반환.
 * PT = UTC-8 (PST, 겨울) or UTC-7 (PDT, 서머타임).
 * 정확한 PST/PDT 분기는 복잡하므로 평균치 UTC-7.5 ≈ UTC-8 적용 (보수적).
 */
function getPtDateKey(): string {
  const now = new Date();
  const ptOffsetMs = 8 * 60 * 60 * 1000; // UTC-8
  const pt = new Date(now.getTime() - ptOffsetMs);
  return pt.toISOString().split('T')[0];
}

export function incrementDailySuccess(engine: Engine): number {
  const today = getPtDateKey();
  const current = counters.get(engine);
  if (!current || current.date !== today) {
    counters.set(engine, { date: today, successCount: 1 });
    return 1;
  }
  current.successCount += 1;
  return current.successCount;
}

export function getDailySuccess(engine: Engine): number {
  const today = getPtDateKey();
  const current = counters.get(engine);
  if (!current || current.date !== today) return 0;
  return current.successCount;
}

/**
 * HTTP 429 등 한도성 에러 발생 시 호출 — 봇감지인지 진짜 한도인지 분류.
 *
 * @returns 'bot_detected' (봇감지 강력 의심) | 'likely_bot' (의심) | 'quota_likely' (진짜 한도 의심)
 */
export function classifyQuotaError(engine: Engine): 'bot_detected' | 'likely_bot' | 'quota_likely' {
  const count = getDailySuccess(engine);
  if (count < 10) return 'bot_detected';   // 10장 미만 → 한도 불가능
  if (count < 100) return 'likely_bot';    // 100장 미만 → 봇감지 가능성 큼
  return 'quota_likely';                   // 100장 이상 → 진짜 한도 가능성
}

/** 디버그/모니터링용 */
export function resetDailyCounter(engine?: Engine): void {
  if (engine) counters.delete(engine);
  else counters.clear();
}
