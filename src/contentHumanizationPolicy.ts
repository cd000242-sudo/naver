import type { PromptMode } from './promptLoader.js';

export type HumanizeIntensity = 'off' | 'light' | 'strong';

/**
 * [2026-09-22 SPEC — 후처리 결정론화] 이전(2026-07-30) 정책은 전 모드 무조건 'strong'을
 * 반환했다 — "사람보다 더 사람처럼"을 위해 어미 다양화·동의어 치환 등 Math.random 기반
 * 변주를 항상 켰다. aiHumanizer.humanizeContent 자체가 이제 Math.random 기반 변주를
 * 전부 제거해 결정론적으로 동작하므로("strong"도 더 이상 무작위 동의어/어미 변형을 하지
 * 않는다), 이 함수의 기본값도 "항상 최대 강도"에서 "명시적으로 설정하지 않으면 안전한
 * light"로 낮춘다. 기존처럼 강한 톤 변환이 필요한 호출자는 `configured` 인자로 'strong'을
 * 명시해야 한다 — 기본값에 의존하지 않는다.
 *
 * ⚠️ 통합 담당자 확인 필요: src/contentGenerator.ts:7932의
 * `resolveHumanizeIntensity((source.contentMode || 'seo') as PromptMode)` 호출은 configured를
 * 넘기지 않으므로, 이 변경이 병합되면 즉시 'strong' → 'light'로 프로덕션 기본값이 바뀐다.
 * 기존 강도를 유지하려면 호출부에서 `resolveHumanizeIntensity(mode, 'strong')`으로 명시할 것.
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
