// src/image/nanoBanana21Guard.ts
// [2026-10-20] 나노바나나2 엔진의 모델을 Nano Banana 2.1(gemini-nano-banana-2.1)로 올렸다. Google 모델 목록 API 에는
//   있지만 이 PC 키가 선불 크레딧 소진(402)이라 실호출로 확인하지 못했다. 나노바나나2 는 "사용자 선택 잠금"이라 모델
//   오류(400/404)가 나면 다른 모델로 가지 않고 같은 모델로 재시도하다 실패한다.
//   여기서는 같은 엔진(나노바나나2) 안의 버전만 다룬다: 2.1 이 모델 오류를 내면 이번 실행 동안 직전 버전
//   gemini-3.1-flash-image 를 쓴다. 다른 엔진·다른 벤더로는 절대 넘어가지 않고, 넘어갈 때는 화면 로그를 남긴다.

export const NANO_BANANA_21_MODEL = 'gemini-nano-banana-2.1';
export const NANO_BANANA_2_PREVIOUS_MODEL = 'gemini-3.1-flash-image';

let nanoBanana21Unavailable = false;

/** The model to actually call: 2.1 unless this run already saw 2.1 rejected as a model. */
export function applyNanoBanana21Availability(model: string): string {
  return model === NANO_BANANA_21_MODEL && nanoBanana21Unavailable ? NANO_BANANA_2_PREVIOUS_MODEL : model;
}

/**
 * Marks 2.1 unavailable when the failure is about the model itself (404, or 400 naming the model / support).
 * Billing (402), quota (429), auth (401/403) and server (5xx) errors never switch the version.
 * Returns true only on the call that flips the switch.
 */
export function markNanoBanana21UnavailableIfModelError(
  model: string,
  statusCode: unknown,
  message: string,
): boolean {
  if (model !== NANO_BANANA_21_MODEL || nanoBanana21Unavailable) return false;
  const status = Number(statusCode);
  const text = String(message || '').toLowerCase();
  const modelError = status === 404
    || (status === 400 && (text.includes('model') || text.includes('not found') || text.includes('not supported')
      || text.includes('response modalit')));
  if (!modelError) return false;
  nanoBanana21Unavailable = true;
  return true;
}

export const NANO_BANANA_21_FALLBACK_NOTICE =
  'ℹ️ 나노바나나 2.1 모델을 현재 API 키로 쓸 수 없어, 같은 나노바나나2 의 직전 버전(Gemini 3.1 Flash Image)으로 다시 시도합니다.';

/** Test-only reset. */
export function resetNanoBanana21AvailabilityForTest(): void {
  nanoBanana21Unavailable = false;
}
