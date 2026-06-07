import type { InferenceResponse, NarrativeSection } from '../types.js';

export const MAX_IMAGES_PER_NARRATIVE_SECTION = 4;

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
      key !== currentKey ||
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
