/**
 * Image-ratio scanner (advisory).
 *
 * SPEC-AEO-EXPOSURE-2026 R1.
 *
 * 단락 대비 이미지가 너무 적으면 체류시간/가독성이 떨어진다. 이 스캐너는 단락 수
 * 대비 이미지 비율만 측정한다(권장 ≈ 단락 3개당 1장). 강제하지 않으며 수정하지
 * 않는다. 발행 파이프라인 미연결.
 */

export interface ImageRatioResult {
  imageCount: number;
  paragraphCount: number;
  /** imageCount / paragraphCount (0 when no paragraphs). */
  ratio: number;
  meetsRecommended: boolean;
  warnings: string[];
}

/** ≈ 1 image per 3 paragraphs. */
const MIN_RATIO = 0.33;

function countParagraphs(bodyText: string): number {
  return (bodyText ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0).length;
}

export function scanImageRatio(
  bodyText: string,
  imageCount: number,
  minRatio: number = MIN_RATIO,
): ImageRatioResult {
  const paragraphCount = countParagraphs(bodyText);
  const safeImages = Math.max(0, imageCount || 0);
  const ratio = paragraphCount > 0 ? safeImages / paragraphCount : 0;
  const meetsRecommended = paragraphCount > 0 && ratio >= minRatio;

  const warnings: string[] = [];
  if (!meetsRecommended && paragraphCount > 0) {
    warnings.push(
      `이미지 비율이 낮습니다(${safeImages}장 / ${paragraphCount}단락). 단락 3개당 1장 이상 권장(선택)`,
    );
  }

  return { imageCount: safeImages, paragraphCount, ratio, meetsRecommended, warnings };
}
