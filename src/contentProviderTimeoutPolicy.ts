/** 입력이 이 크기를 넘어가면 그 초과분만큼 시간을 더 준다. */
const LARGE_PROMPT_BASELINE_CHARS = 20_000;
/** 초과분 20,000자마다 더해 주는 시간. */
const EXTRA_MS_PER_20K_CHARS = 15_000;
/** 입력 가산 상한 — 최대 베이스(180초)+90초=270초로, 렌더러의 360초 상위 예산 안에 남는다. */
const MAX_INPUT_EXTRA_MS = 90_000;

export function getContentProviderTimeoutMs(
  minChars: number,
  retryAttempt = 0,
  promptChars = 0,
): number {
  const normalizedMinChars = Math.max(0, Math.round(Number(minChars) || 0));
  const normalizedRetryAttempt = Math.max(0, Math.round(Number(retryAttempt) || 0));

  let baseTimeout: number;
  if (normalizedMinChars < 1000) baseTimeout = 60_000;
  else if (normalizedMinChars < 3000) baseTimeout = 90_000;
  else if (normalizedMinChars < 5000) baseTimeout = 120_000;
  else if (normalizedMinChars < 10000) baseTimeout = 150_000;
  else baseTimeout = 180_000;

  /*
   * [2026-09-22 실사고 20260922-231111] 창은 **출력 목표 글자수만** 보고 정해졌다. 그런데 같은
   * 2,500자 글이라도 입력이 96,272자(≈56,600 토큰)면 모델이 입력을 읽는 데만 한참 걸린다.
   * claude-sonnet-5 API 가 90초 창에서 잘렸고 글이 통째로 버려졌다(GENERATION_FAILED).
   * 입력 크기를 창에 반영한다 — 생성 품질과 무관한 순수 대기 시간 문제다.
   */
  const normalizedPromptChars = Math.max(0, Math.round(Number(promptChars) || 0));
  const excessChars = Math.max(0, normalizedPromptChars - LARGE_PROMPT_BASELINE_CHARS);
  const inputExtra = Math.min(
    MAX_INPUT_EXTRA_MS,
    Math.floor((excessChars / 20_000) * EXTRA_MS_PER_20K_CHARS),
  );

  const multiplier = 1 + (Math.min(normalizedRetryAttempt, 2) * 0.05);
  return Math.floor((baseTimeout + inputExtra) * multiplier);
}

/**
 * GPT-5.6 long-form calls need a wider single-request window than fast
 * providers. This prevents a completed/billable Sol request from being cut off
 * at the former shared 90-second limit while staying below the renderer's
 * 360-second top-level budget.
 */
export function getOpenAiContentTimeoutMs(
  minChars: number,
  modelName: string,
  retryAttempt = 0,
  promptChars = 0,
): number {
  const baseTimeout = getContentProviderTimeoutMs(minChars, retryAttempt, promptChars);
  const normalizedMinChars = Math.max(0, Math.round(Number(minChars) || 0));
  const model = String(modelName || '').trim().toLowerCase();

  if (model === 'gpt-5.6-sol') {
    return Math.max(baseTimeout, normalizedMinChars < 1000 ? 120_000 : 240_000);
  }
  if (model === 'gpt-5.6-terra') {
    return Math.max(baseTimeout, normalizedMinChars < 1000 ? 120_000 : 180_000);
  }
  return baseTimeout;
}
