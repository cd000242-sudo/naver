// src/image/fullAuto/gensparkBodyPrefetch.ts
// [2026-10-10] 젠스파크 발행 이미지 "미리 한꺼번에": 썸네일을 뺀 본문 소제목 이미지를 한 번에 요청해(엔진이 4장씩 동시 생성)
//   받은 것은 소제목 이름으로 칸에 맞춘다. 못 받은 칸은 호출자(generateImagesForAutomation)가 지금처럼 1장씩 다시 만든다.
//   썸네일은 연출(director)이 한 장짜리 호출에만 붙으므로 여기서 빼고 호출자가 따로 만든다.
//   렌더러 단일 스코프에 인라인되므로 import 없이 순수하게 둔다(식별자는 gsPrefetch 접두로 전역 유일).

export interface GsPrefetchItem {
  heading?: unknown;
  isThumbnail?: unknown;
  originalIndex?: unknown;
}

/** 미리 요청할 본문 항목(썸네일 제외)의 위치. 젠스파크가 아니거나 2장 미만이면 빈 배열(한꺼번에 이득 없음). */
export function gsPrefetchBodyIndexes(provider: unknown, items: readonly GsPrefetchItem[]): number[] {
  if (String(provider || '').trim() !== 'genspark') return [];
  const indexes = items.map((item, index) => (item && item.isThumbnail !== true ? index : -1)).filter((index) => index >= 0);
  return indexes.length >= 2 ? indexes : [];
}

function gsPrefetchHeadingKey(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** 받은 이미지를 소제목 이름으로 칸(items 위치)에 맞춘다. 끝난 순서·번호는 믿지 않고, 이미지 하나는 한 칸에만 쓴다. */
export function gsPrefetchMatchImages(
  items: readonly GsPrefetchItem[],
  bodyIndexes: readonly number[],
  images: readonly any[],
): Map<number, any> {
  const matched = new Map<number, any>();
  const used = new Set<number>();
  for (const index of bodyIndexes) {
    const item = items[index];
    const key = gsPrefetchHeadingKey(item?.heading);
    if (!key) continue;
    const found = images.findIndex((img, i) => !used.has(i) && Boolean(img)
      && gsPrefetchHeadingKey(img.heading) === key && Boolean(img.filePath || img.previewDataUrl || img.url));
    if (found < 0) continue;
    used.add(found);
    matched.set(index, { ...images[found], heading: images[found].heading || item.heading, isThumbnail: false, originalIndex: item.originalIndex });
  }
  return matched;
}

/** 한꺼번에 요청할 제한 시간 — 시작 3분 + 4장 한 묶음마다 4분. 이미지 단계 전체 한도의 절반을 넘기지 않아 1장씩 다시 만들 시간을 남긴다. */
export function gsPrefetchTimeoutMs(count: number, batchTimeoutMs: number): number {
  const rounds = Math.max(1, Math.ceil(count / 4));
  return Math.min(Math.floor(batchTimeoutMs / 2), 180000 + rounds * 240000);
}
