import type { InferenceResponse, NarrativeSection } from '../types.js';

/*
 * [2026-09-09 사장님] "여행을 3군데 갔는데 한 글로 작성하잖아. 그럼 소제목 하나에
 * 여행할 곳을 전부 설명해줘야 되지 않니? 근포땅굴 소제목 아래 근포땅굴 이미지를
 * 이미지-설명 이미지-설명 이런 식으로 마무리하고, 다음 소제목에 한꼬막 두꼬막."
 *
 * 장소 하나가 소제목 하나이고 그 아래에 그 장소 사진이 전부 들어가야 한다.
 * 4장 상한은 한 장소에서 사진을 여러 장 찍는 실제 사용과 맞지 않아 8장으로 올린다.
 * (상한 자체는 남긴다 — 한 섹션이 20장이면 글이 아니라 앨범이 된다.)
 */
export const MAX_IMAGES_PER_NARRATIVE_SECTION = 8;

export function buildNarrativeSections(
  results: readonly InferenceResponse[],
): NarrativeSection[] {
  if (results.length === 0) return [];

  const sections: NarrativeSection[] = [];
  const headingCounts = new Map<string, number>();
  let currentKey = getGroupKey(results[0]!);
  let currentItems: InferenceResponse[] = [results[0]!];

  for (let i = 1; i < results.length; i++) {
    const item = results[i]!;
    const key = getGroupKey(item);
    const shouldStartNewSection =
      !isSameLocationKey(key, currentKey) ||
      currentItems.length >= MAX_IMAGES_PER_NARRATIVE_SECTION;

    if (shouldStartNewSection) {
      sections.push(makeSection(currentKey, currentItems, headingCounts));
      currentKey = key;
      currentItems = [item];
    } else {
      currentItems = [...currentItems, item];
    }
  }

  sections.push(makeSection(currentKey, currentItems, headingCounts));
  return sections;
}

function getGroupKey(item: InferenceResponse): string {
  const loc = item.result.location_hint.trim();
  return loc || item.result.scene_type;
}

/**
 * [2026-09-09] 같은 장소를 같은 장소로 묶기 위한 정규화.
 *
 * location_hint 는 사진마다 Vision 이 따로 뽑는 자유 문자열이다. 같은 근포땅굴인데
 * "근포땅굴" / "거제 근포땅굴" / "근포땅굴 입구" 처럼 조금씩 달라지면, 문자열이 다르다는
 * 이유만으로 사진 한 장마다 소제목이 하나씩 생겼다(사장님 실측: 소제목 4개 × 사진 1장).
 * 공백·기호를 털고 비교해, 한쪽이 다른 쪽을 품으면 같은 장소로 본다.
 */
function normalizeLocationKey(raw: string): string {
  return String(raw || '')
    .replace(/\s+/g, '')
    // 한글·영문·숫자만 남긴다 — 괄호·따옴표·가운뎃점 같은 표기 차이를 흡수한다.
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase();
}

/** 두 장소 표기가 같은 곳을 가리키는가. 포함 관계면 같은 곳으로 본다. */
export function isSameLocationKey(a: string, b: string): boolean {
  const left = normalizeLocationKey(a);
  const right = normalizeLocationKey(b);
  if (!left || !right) return left === right;
  if (left === right) return true;
  // "근포땅굴" ⊂ "거제근포땅굴" — 짧은 쪽이 2글자 이상일 때만 포함을 인정한다.
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 2 && longer.includes(shorter);
}

function makeSection(
  key: string,
  items: readonly InferenceResponse[],
  headingCounts: Map<string, number>,
): NarrativeSection {
  const baseHeading = buildHeading(key, items);
  const seenCount = headingCounts.get(baseHeading) ?? 0;
  headingCounts.set(baseHeading, seenCount + 1);

  const heading = seenCount === 0
    ? baseHeading
    : `${baseHeading} ${seenCount + 1}`;

  return {
    heading,
    imageRefs: items.map((it) => it.imageId),
    beats: items.map((it) => it.result.description_ko).filter(Boolean),
  };
}

function buildHeading(key: string, items: readonly InferenceResponse[]): string {
  const sceneHeadings: Record<string, string> = {
    travel: '여행 장면',
    food: '맛있는 한 끼',
    lodging: '숙소 풍경',
    daily: '일상의 순간',
    review: '리뷰',
    cafe: '카페 방문',
    auto: '사진 기록',
  };

  if (sceneHeadings[key]) {
    const foods = items.flatMap((it) => [...it.result.food_items]).slice(0, 2);
    if (foods.length > 0) return `${foods.join(', ')} 먹방`;
    return sceneHeadings[key]!;
  }

  return key;
}
