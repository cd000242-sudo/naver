// src/automation/imageTextInterleavePlan.ts
// [2026-09-09] 한 소제목 안에서 이미지와 본문을 번갈아 넣기 위한 순수 계획기.
//
// 왜: 지금까지 섹션은 "이미지 전부 → 본문 전부" 순서로 들어갔다. 사진이 4장이면
// 사진 4장이 연달아 나오고 그 뒤에 글이 뭉텅이로 붙는다(사용자 실측 발행글).
// 읽는 사람은 사진과 그 사진을 설명하는 문장을 따로 보게 된다.
// 사장님 요청: "추론한 이미지 → 글 → 추론한 이미지 → 글" 로 같이 보이게.
//
// 이 파일은 순서만 정한다. 실제 삽입/타이핑은 editorHelpers 가 한다.

export interface InterleaveStep<TImage> {
  /** 이 단계에서 먼저 넣을 이미지들 (없으면 빈 배열). */
  readonly images: readonly TImage[];
  /** 이미지 뒤에 이어 쓸 본문 조각 (없으면 빈 문자열). */
  readonly text: string;
}

/** 문단이 이보다 짧으면 앞 문단에 붙인다 — 한 줄짜리 조각 사이에 사진이 끼는 것을 막는다. */
const MIN_CHUNK_CHARS = 60;

/**
 * 본문을 문단 단위로 쪼갠다.
 *
 * 네이버 본문은 빈 줄로 문단을 나누기도 하고 단일 개행만 쓰기도 한다. 빈 줄 기준으로
 * 먼저 나누고, 그것으로 조각이 하나뿐이면 개행 기준으로 다시 나눈다.
 */
export function splitBodyIntoParagraphs(body: string): string[] {
  const normalized = String(body || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const byBlankLine = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;

  return normalized
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * 너무 짧은 조각을 앞 조각에 흡수시킨다. 한 줄짜리 문단 사이마다 사진이 끼면
 * 오히려 읽기가 끊긴다.
 */
function mergeTinyChunks(paragraphs: readonly string[]): string[] {
  const merged: string[] = [];
  for (const paragraph of paragraphs) {
    if (merged.length > 0 && merged[merged.length - 1]!.length < MIN_CHUNK_CHARS) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n${paragraph}`;
      continue;
    }
    merged.push(paragraph);
  }
  return merged;
}

/**
 * 문단들을 groupCount 개 묶음으로 고르게 나눈다.
 * 앞쪽 묶음이 한 문단씩 더 가져간다(나머지 배분).
 */
function groupParagraphs(paragraphs: readonly string[], groupCount: number): string[] {
  if (groupCount <= 1) return [paragraphs.join('\n\n')];

  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  const base = Math.floor(paragraphs.length / groupCount);
  const remainder = paragraphs.length % groupCount;

  let cursor = 0;
  for (let g = 0; g < groupCount; g += 1) {
    const take = base + (g < remainder ? 1 : 0);
    for (let k = 0; k < take; k += 1) {
      groups[g]!.push(paragraphs[cursor]!);
      cursor += 1;
    }
  }
  return groups.map((g) => g.join('\n\n')).filter((t) => t.trim().length > 0);
}

/**
 * 한 소제목의 이미지와 본문을 "이미지 → 글 → 이미지 → 글" 순서로 배치한다.
 *
 * 교차하지 않고 기존처럼 한 번에 넣어야 하는 경우(이미지 1장 이하, 본문 조각 1개 이하,
 * 본문 없음)에는 단계 하나만 돌려준다 — 호출부는 분기 없이 같은 코드로 처리하면 된다.
 */
export function planImageTextInterleave<TImage>(
  images: readonly TImage[],
  body: string,
): Array<InterleaveStep<TImage>> {
  const text = String(body || '').trim();
  const imageList = Array.isArray(images) ? images.slice() : [];

  // 교차할 것이 없으면 기존 동작 그대로: 이미지 전부 먼저, 그다음 본문.
  if (imageList.length === 0 || !text) {
    return [{ images: imageList, text }];
  }

  const paragraphs = mergeTinyChunks(splitBodyIntoParagraphs(text));
  if (imageList.length < 2 || paragraphs.length < 2) {
    return [{ images: imageList, text }];
  }

  const stepCount = Math.min(imageList.length, paragraphs.length);
  const textGroups = groupParagraphs(paragraphs, stepCount);
  const steps: Array<InterleaveStep<TImage>> = [];

  for (let s = 0; s < textGroups.length; s += 1) {
    const isLast = s === textGroups.length - 1;
    // 마지막 단계가 남은 이미지를 모두 흡수한다 — 사진이 문단보다 많아도 버리지 않는다.
    const stepImages = isLast ? imageList.slice(s) : [imageList[s]!];
    steps.push({ images: stepImages, text: textGroups[s]! });
  }

  return steps;
}
