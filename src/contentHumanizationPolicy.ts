import type { PromptMode } from './promptLoader.js';

export type HumanizeIntensity = 'light' | 'medium' | 'strong';

/**
 * [2026-07-30] 사용자 지시: 전 모드 강한 휴머나이즈 — "사람보다 더 사람처럼".
 * 기존 light는 의미 보존 명분으로 seo/homefeed/mate의 어미 다양화·구어 변환까지
 * 껐고, 그 결과 ~합니다/~해요 단조 어미가 AI 티의 주범이 됐다(라이브 실측).
 * 표·수치는 shield/보호 로직이 따로 지키므로 스타일 변환은 전 모드에서 켠다.
 */
export function resolveHumanizeIntensity(_mode?: PromptMode): HumanizeIntensity {
  return 'strong';
}
