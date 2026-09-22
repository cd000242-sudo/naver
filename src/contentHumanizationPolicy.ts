import type { PromptMode } from './promptLoader.js';

export type HumanizeIntensity = 'off' | 'light' | 'strong';

/**
 * [2026-09-22 P1 확정 — DEFAULT = LIGHT] 사장님 결정. 2026-07-30 "전 모드 무조건 strong"
 * 지침은 폐기됐다 — 다시 되돌리지 않는다.
 *
 * - 기본값은 항상 'light'. 어떤 모드(seo/homefeed/affiliate/…)도 기본값을 바꾸지 않는다.
 * - 'strong' 은 사용자가 설정(`config.humanizerIntensity`)·요청(`source.humanizerIntensity`)·
 *   환경변수(`HUMANIZER_INTENSITY`)로 **명시적으로** 고른 경우에만 반환한다.
 * - 강도와 무관하게 aiHumanizer 는 결정론적이며 숫자·금액·날짜·정책명·기관명·제품명·인물명·
 *   고유명사·직접 인용은 보호 스팬으로 손대지 않는다.
 *
 * 회귀 가드: src/__tests__/contentPostGenerationIntegrity.test.ts, humanVoicePalette.test.ts,
 * aiHumanizer.test.ts (protected spans).
 */
export function resolveHumanizeIntensity(
  _mode?: PromptMode,
  configured?: HumanizeIntensity,
): HumanizeIntensity {
  if (configured === 'off' || configured === 'light' || configured === 'strong') {
    return configured;
  }
  return 'light';
}
