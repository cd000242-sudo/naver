/**
 * 소제목마다 카메라 시점을 돌린다.
 *
 * 사장님 실측: "이미지 생성을 하면 왜 전부 다 위에서 내려다보는 전신샷만 나오니?"
 *
 * 책임 공백이었다. 프롬프트 생성기(getTranslationPrompt)의 4번 규칙이
 * "DO NOT include camera angle — these are added separately by the system" 인데,
 * 그 "시스템" 은 Flow 뿐이다. flowPromptInjection 의 시점 순환을 부르는 곳이
 * flowGenerator 두 군데밖에 없어, 덕테이프 · 나노바나나에는 아무도 각도를 넣지 않았다.
 *
 * LLM 은 쓰지 말라니 안 쓰고, 시스템은 넣지 않고, 이미지 모델은 지시가 없으니
 * 가장 안전한 구도 — 중앙 정렬 부감 — 로 수렴한다. 소제목이 무엇이든 같은 그림이 된다.
 *
 * 여기서는 무엇을 그릴지에는 손대지 않는다. 어떻게 잡을지만 더한다.
 */

export const IMAGE_VIEWPOINT_HINTS: readonly string[] = Object.freeze([
  'Camera: eye-level medium shot, natural daylight, neutral background.',
  'Camera: low-angle close-up, shallow depth of field, soft natural light.',
  'Camera: wide-angle establishing view, deep depth of field, ambient lighting.',
  'Camera: over-the-shoulder perspective, mid-distance, warm golden-hour light.',
  'Camera: tight macro detail shot, isolated subject, soft diffused light.',
  'Camera: top-down flat-lay composition, even lighting.',
  'Camera: candid documentary framing, environmental context, available light.',
  'Camera: dramatic side-light, high contrast, focused subject.',
]);

/**
 * 이 엔진에는 시스템이 이미 시점을 주입하는가.
 *
 * Flow 는 flowPromptInjection.injectHeadingVariation 이 넣는다 — 두 번 넣으면 충돌한다.
 */
export function engineInjectsViewpoint(engine: string | undefined): boolean {
  return /flow/iu.test(String(engine || ''));
}

/**
 * [2026-09-06 R-A] Does the engine rotate its own viewpoint from `diversityIndex`?
 *
 * The contextual brief in main is the single owner of the camera line. Engines that
 * already prepend their own angle (flow via injectHeadingVariation; openai/deepinfra/
 * leonardo via getImageDiversityHints) must not get a second, conflicting one.
 */
export function engineRotatesViewpoint(engine: string | undefined): boolean {
  const normalized = String(engine || '').trim().toLowerCase();
  if (!normalized) return false;
  return engineInjectsViewpoint(normalized)
    || /openai|gpt-image|deepinfra|leonardo/u.test(normalized);
}

/** 원본 프롬프트 뒤에 시점 한 줄을 덧붙인다. 무엇을 그릴지는 건드리지 않는다. */
export function appendViewpointHint(prompt: string | undefined, headingIndex: number): string {
  const base = String(prompt ?? '');
  if (!base.trim()) return base;
  const index = Number.isFinite(headingIndex) ? Math.abs(Math.trunc(headingIndex)) : 0;
  const hint = IMAGE_VIEWPOINT_HINTS[index % IMAGE_VIEWPOINT_HINTS.length];
  return `${base}\n\n${hint}`;
}
