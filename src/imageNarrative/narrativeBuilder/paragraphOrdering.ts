// src/imageNarrative/narrativeBuilder/paragraphOrdering.ts
// [2026-09-09] 사진과 그 사진 이야기를 짝지어 두기 위한 순수 정렬기.
//
// 사고: "근포땅굴 이미지인데 왜 갑자기 한꼬막 두꼬막 식당 주차장 내용이 나오는 거니?"
// v2.11.235 에서 이미지와 글을 번갈아 넣는 모양은 만들었지만, 짝을 맞추지 않았다.
// 문단 개수만 세서 앞에서부터 순서대로 붙였을 뿐이라 사진과 글이 따로 놀았다.
//
// 재료는 이미 있었다 — sectionBuilder 가 beats 를 imageRefs 와 같은 순서로 만든다.
//   beats: items.map((it) => it.result.description_ko)
// 그런데 글 쓰는 단계에서 한 덩어리 content 로 뭉개면서 그 짝이 사라졌다.
// 모델에게 사진별 문단을 받아, 사진 순서대로 다시 세운다.

export interface ImageParagraph {
  readonly imageRef?: unknown;
  readonly text?: unknown;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanRef(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 사진별 문단을 imageRefs 순서로 세워 본문 하나로 만든다.
 *
 * 엄격하게 판단한다 — 사진 하나라도 짝이 없으면 null 을 돌려주고 호출부가 기존
 * content 를 쓰게 한다. 반쯤 맞은 짝은 안 맞은 것보다 나쁘다(어떤 사진은 맞고
 * 어떤 사진은 엉뚱한 글이 붙으면 사용자는 무엇을 믿을지 알 수 없다).
 *
 * @returns 사진 순서대로 이어 붙인 본문, 또는 짝을 온전히 못 세우면 null
 */
export function orderParagraphsByImageRefs(
  paragraphs: readonly ImageParagraph[] | undefined,
  imageRefs: readonly string[] | undefined,
): string | null {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) return null;
  if (!Array.isArray(imageRefs) || imageRefs.length === 0) return null;

  const byRef = new Map<string, string>();
  for (const paragraph of paragraphs) {
    const ref = cleanRef(paragraph?.imageRef);
    const text = cleanText(paragraph?.text);
    if (!ref || !text) continue;
    // 같은 사진에 두 문단이 오면 먼저 온 것을 쓴다.
    if (!byRef.has(ref)) byRef.set(ref, text);
  }

  const ordered: string[] = [];
  for (const ref of imageRefs) {
    const text = byRef.get(cleanRef(ref));
    if (!text) return null; // 짝이 빈 사진이 있으면 통째로 포기한다
    ordered.push(text);
  }

  return ordered.join('\n\n');
}

/**
 * 짝이 온전한지만 알려준다(로그·진단용).
 * 왜 기존 content 로 떨어졌는지 사용자가 로그에서 볼 수 있어야 한다.
 */
export function describeParagraphPairing(
  paragraphs: readonly ImageParagraph[] | undefined,
  imageRefs: readonly string[] | undefined,
): string {
  const paragraphCount = Array.isArray(paragraphs) ? paragraphs.length : 0;
  const imageCount = Array.isArray(imageRefs) ? imageRefs.length : 0;
  if (paragraphCount === 0) return `사진별 문단 없음 (사진 ${imageCount}장)`;
  if (imageCount === 0) return `사진 없음 (문단 ${paragraphCount}개)`;
  return `문단 ${paragraphCount}개 / 사진 ${imageCount}장`;
}
