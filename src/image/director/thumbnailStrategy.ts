/**
 * SPEC-NAVER-IMAGE-2026 — cover direction for the AI thumbnail.
 *
 * Before this, the common image-tab path translated the literal slot name "🖼️ 썸네일" into a prompt
 * and sent it as a section image, so the cover was never driven by the title. The director now sends
 * the title, the card promise, and one of these directions as the cover brief.
 */

export type ThumbnailDirection =
  | 'comparison'
  | 'numeric'
  | 'problem-scene'
  | 'real-reconstruct';

const COMPARISON = /차이|비교|대비|\bvs\b|보다|대신|어느 쪽|둘 중/iu;
const PROBLEM = /논란|피해|고소|사고|사기|분쟁|갈등|폭로|의혹|혐의|거절|탈락|실수|위험|부작용|적발/u;
const MONEY_OR_COUNT = /\d[\d,.]*\s*(?:만|억|천)?\s*원|\d+(?:\.\d+)?\s*%|\d+\s*(?:배|명|개|곳|가지|년|개월)/u;
const TWO_AMOUNTS = /(\d[\d,.]*\s*(?:만|억|천)?\s*원)[\s\S]*?(\d[\d,.]*\s*(?:만|억|천)?\s*원)/u;

export function chooseThumbnailDirection(title: string, cardPromise = ''): ThumbnailDirection {
  const text = `${title || ''} ${cardPromise || ''}`;
  if (COMPARISON.test(text) || TWO_AMOUNTS.test(text)) return 'comparison';
  if (PROBLEM.test(text)) return 'problem-scene';
  if (MONEY_OR_COUNT.test(text)) return 'numeric';
  return 'real-reconstruct';
}

const DIRECTION_LINE: Readonly<Record<ThumbnailDirection, string>> = Object.freeze({
  comparison: 'Show the two things being compared side by side at the same scale, so the difference is visible at a glance.',
  numeric: 'Show the concrete objects behind the key number (documents, bills, the counted items) so the number feels tangible; do not draw digits.',
  'problem-scene': 'Show the problem moment plainly — the thing that went wrong or the tense setting — with faces out of frame.',
  'real-reconstruct': 'A literal, photoreal reconstruction of the situation the title promises, as a candid real photo rather than a staged stock image.',
});

/** Cover brief lines (English). The title and card promise already travel in the brief anchors. */
export function coverDirectionLines(
  direction: ThumbnailDirection,
  options: { titleBandPlanned: boolean; cardPromise?: string },
): string[] {
  const promise = String(options.cardPromise || '').replace(/\s+/gu, ' ').replace(/"/gu, "'").trim().slice(0, 160);
  return [
    promise ? `The cover must make this one point obvious: "${promise}".` : '',
    DIRECTION_LINE[direction],
    'It is seen as a small card in a phone feed (about 200px wide): one clear main subject filling at least half the frame, a simple uncluttered background, strong contrast.',
    options.titleBandPlanned ? 'Keep the bottom third free of the key subject; a title band will be placed there.' : '',
    'If the story is about a real, named person, do not depict that person\'s face or a lookalike; show the setting or objects instead.',
  ].filter(Boolean);
}
