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

/** 소제목이 하나뿐인 글이 되지 않게 지키는 최소 개수. */
export const MIN_TARGET_SECTIONS = 3;
/** 한 소제목이 가져갈 최소 사진 수 — 이보다 잘게 나누면 사진 1장짜리 소제목이 늘어난다. */
export const MIN_IMAGES_PER_SPLIT_PART = 2;
/** 장소가 여러 곳일 때 한 장소가 가져갈 수 있는 소제목 수 상한. */
export const MAX_SECTIONS_PER_LOCATION = 2;
/** 이 장수를 넘으면 장소가 여러 곳이어도 그 장소를 둘로 나눈다. */
export const SPLIT_LOCATION_OVER = 6;

/**
 * 목표 소제목 수.
 *
 * 사장님 규칙: "장소가 많으면 지금처럼 장소끼리 묶고 함축적으로 장소당 소제목 1~2개,
 * 1~2개의 장소면 소제목을 그만큼 자동으로 쪼개줘야지."
 */
export function resolveTargetSections(locationCount: number): number {
  return locationCount >= 3 ? locationCount : MIN_TARGET_SECTIONS;
}

export function buildNarrativeSections(
  results: readonly InferenceResponse[],
): NarrativeSection[] {
  if (results.length === 0) return [];

  // 1) 장소로 묶는다. 여기서는 상한을 적용하지 않는다 —
  //    상한 때문에 쪼개진 조각을 "다른 장소" 로 세면 장소 수를 잘못 읽는다.
  const groups = groupByLocation(results);

  // 2) 장소 수에 맞춰 각 장소를 몇 조각으로 낼지 정한다.
  const partCounts = resolvePartCounts(groups.map((g) => g.items.length));

  // 3) 조각을 만들고 소제목 번호를 한 곳에서 붙인다(번호 충돌 방지).
  const headingCounts = new Map<string, number>();
  const sections: NarrativeSection[] = [];
  groups.forEach((group, index) => {
    const parts = partCounts[index]!;
    const chunks = chunkItems(group.items, parts);
    for (const chunk of chunks) {
      sections.push(makeSection(group.key, chunk, headingCounts));
    }
  });
  return sections;
}

interface LocationGroup {
  readonly key: string;
  readonly items: InferenceResponse[];
}

function groupByLocation(results: readonly InferenceResponse[]): LocationGroup[] {
  const groups: LocationGroup[] = [];
  let currentKey = getGroupKey(results[0]!);
  let currentItems: InferenceResponse[] = [results[0]!];

  for (let i = 1; i < results.length; i += 1) {
    const item = results[i]!;
    const key = getGroupKey(item);
    if (isSameLocationKey(key, currentKey)) {
      currentItems = [...currentItems, item];
    } else {
      groups.push({ key: currentKey, items: currentItems });
      currentKey = key;
      currentItems = [item];
    }
  }
  groups.push({ key: currentKey, items: currentItems });
  return groups;
}

/** 순서를 지키며 items 를 parts 조각으로 고르게 나눈다. */
function chunkItems(items: readonly InferenceResponse[], parts: number): InferenceResponse[][] {
  const safeParts = Math.max(1, Math.min(parts, items.length));
  const base = Math.floor(items.length / safeParts);
  const remainder = items.length % safeParts;

  const out: InferenceResponse[][] = [];
  let cursor = 0;
  for (let i = 0; i < safeParts; i += 1) {
    const take = base + (i < remainder ? 1 : 0);
    out.push([...items.slice(cursor, cursor + take)]);
    cursor += take;
  }
  return out;
}

/**
 * [2026-09-09] 장소마다 소제목을 몇 개 낼지 정한다.
 *
 * 사장님 규칙: "장소가 많으면 지금처럼 장소끼리 묶고 함축적으로 장소당 소제목 1~2개,
 * 1~2개의 장소면 소제목을 그만큼 자동으로 쪼개줘야지."
 *   - 장소 3곳 이상 → 장소당 1개가 기본, 사진이 많은 장소만 2개까지.
 *   - 장소 1~2곳 → 소제목 하나짜리 글이 되지 않게 최소 3개가 되도록 나눈다.
 * 어느 경우든 한 조각이 2장 미만이 되게는 나누지 않는다(사진 1장짜리 소제목 방지)
 * 그리고 한 조각이 상한(8장)을 넘지 않게 한다.
 */
export function resolvePartCounts(groupSizes: readonly number[]): number[] {
  const locationCount = groupSizes.length;
  const target = resolveTargetSections(locationCount);
  const perLocationCap = locationCount >= 3
    ? MAX_SECTIONS_PER_LOCATION
    : Number.POSITIVE_INFINITY;

  // 상한(8장) 때문에 반드시 나눠야 하는 최소 조각 수부터 잡는다.
  const parts = groupSizes.map((size) =>
    Math.max(1, Math.ceil(size / MAX_IMAGES_PER_NARRATIVE_SECTION)));

  const maxPartsFor = (size: number) => Math.max(1, Math.floor(size / MIN_IMAGES_PER_SPLIT_PART));

  // 장소가 여러 곳일 때: 사진이 많은 장소만 2개로 (장소당 1~2개)
  if (locationCount >= 3) {
    groupSizes.forEach((size, i) => {
      if (size >= SPLIT_LOCATION_OVER && maxPartsFor(size) >= 2) {
        parts[i] = Math.min(MAX_SECTIONS_PER_LOCATION, Math.max(parts[i]!, 2));
      }
    });
  }

  // 목표 개수에 못 미치면 사진이 가장 많은 장소부터 한 조각씩 더 나눈다.
  let total = parts.reduce((sum, n) => sum + n, 0);
  while (total < target) {
    let bestIndex = -1;
    let bestPerPart = 0;
    groupSizes.forEach((size, i) => {
      if (parts[i]! >= perLocationCap) return;
      if (parts[i]! + 1 > maxPartsFor(size)) return; // 더 나누면 2장 미만 조각이 생긴다
      const perPart = size / parts[i]!;
      if (perPart > bestPerPart) {
        bestPerPart = perPart;
        bestIndex = i;
      }
    });
    if (bestIndex < 0) break;
    parts[bestIndex] = parts[bestIndex]! + 1;
    total += 1;
  }

  return parts;
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
