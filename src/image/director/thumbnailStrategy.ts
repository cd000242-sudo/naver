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

const POSTER_SUBJECT: Readonly<Record<ThumbnailDirection, string>> = Object.freeze({
  comparison: 'Subject: a Korean adult who fits the article\'s audience, waist-up, with the two things being compared as real props side by side, natural believable expression.',
  numeric: 'Subject: a Korean adult who fits the article\'s audience (a young worker, a parent, a senior — as the title implies), waist-up, holding or beside one to three real props that stand for the topic and its number, such as a piggy bank, coins, banknotes, a bankbook, documents, a calculator, or a miniature house. Natural believable expression.',
  'problem-scene': 'Subject: the problem shown with real objects (a notice, documents, a phone screen, a damaged item); if a person appears, a Korean adult with a concerned but natural expression.',
  'real-reconstruct': 'Subject: a Korean adult who fits the article\'s audience in the real situation the title promises, waist-up, with one to three real props that stand for the topic. Natural believable expression.',
});

/**
 * [2026-10-08 사장님] Cover lines when the engine draws the whole title itself: a square Korean blog
 * poster — headline on one side, a believable person with topic props on the other (the leadernam
 * youth-housing covers). Replaces the "do not draw digits" numeric line, since the digits are the headline.
 */
export function posterCoverLines(direction: ThumbnailDirection, options: { cardPromise?: string }): string[] {
  const promise = String(options.cardPromise || '').replace(/\s+/gu, ' ').replace(/"/gu, "'").trim().slice(0, 160);
  return [
    promise ? `The cover must make this one point obvious: "${promise}".` : '',
    'Square Korean blog cover poster, read as a small card in a phone feed: the title headline fills one side (about half the width); the photo subject fills the other side. Bright, clean, uncluttered background — a soft solid color or a softly blurred real room or street.',
    POSTER_SUBJECT[direction],
    'If the story is about a real, named person, do not depict that person\'s face or a lookalike; use objects and the setting instead.',
  ].filter(Boolean);
}
