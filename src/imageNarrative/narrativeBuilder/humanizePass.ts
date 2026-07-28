import { humanizeContent } from '../../aiHumanizer.js';
import { resolveHumanizeIntensity } from '../../contentHumanizationPolicy.js';
import type { StructuredContent } from '../../contentGenerator.js';
import type { PromptMode } from '../../promptLoader.js';

/**
 * [2026-07-30] image-narrative(사진 모드)의 조기 리턴이 후처리 레이어 전체를
 * 우회해 휴머나이저가 한 번도 돌지 않던 공백 봉인. 다른 모드와 동일한 strong
 * 휴머나이즈를 통과시킨다 (스타일 변환 실패는 발행을 막지 않는다).
 *
 * contentGenerator의 humanizeContent 단일 호출부 불변식(post-draft mutation
 * policy 테스트)을 지키기 위해 별도 모듈로 둔다 — 이 경로는 legacy 강제
 * 모드라 V3 게이트와 충돌하지 않는다.
 */
export function applyNarrativeHumanizePass(
  content: StructuredContent,
  toneStyle?: string,
): StructuredContent {
  const intensity = resolveHumanizeIntensity('image-narrative' as PromptMode);
  try {
    if (content?.bodyPlain) {
      content.bodyPlain = humanizeContent(content.bodyPlain, intensity, false, toneStyle);
    }
    if (Array.isArray(content?.headings)) {
      content.headings = content.headings.map((h: any) => ({
        ...h,
        content: h?.content ? humanizeContent(h.content, intensity, false, toneStyle) : h?.content,
      }));
    }
  } catch (error) {
    console.warn(`[image-narrative] 휴머나이즈 실패 (원문 유지): ${(error as Error).message}`);
  }
  return content;
}
