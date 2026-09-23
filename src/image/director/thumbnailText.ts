/**
 * SPEC-NAVER-IMAGE-2026 — thumbnail text: AUTO / include / exclude, and never the whole title.
 *
 * NAVER IMAGE PIPELINE V1 §9: "텍스트를 넣어도 제목 전체를 복사하지 않는다." The overlays used to print
 * the full post title (3 lines of 18 chars) on the cover; on a ~200px home-feed card that is noise.
 * This module picks one or two short meaning chunks instead, deterministically, from words that are
 * already in the title (or card promise), so the text can never claim something the article does not.
 */
import { extractThumbnailHook } from './thumbnailHook.js';
import type { ArticleVisualKind } from './sectionRolePlanner.js';

export type ThumbnailTextMode = 'auto' | 'include' | 'exclude';

/** Card text budget: two short lines (about 8 characters each) at a readable size on a 200px card. */
export const THUMBNAIL_TEXT_MAX_CHARS = 16;
const DANGLING_END = /(?:는|던|할|될|을|를|의|에|며|고|서)$/u;

const QUOTED = /[‘'"“「『]([^’'"”」』]{2,20})[’'"”」』]/u;
const CLAUSE_SPLIT = /[…,，·|!?]|\.{2,}|\s[-–—]\s/u;

/** 'true'/true/'include' → include · 'false'/false/'exclude' → exclude · anything else → auto. */
export function normalizeThumbnailTextMode(raw: unknown): ThumbnailTextMode {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'true' || value === 'include' || value === '포함') return 'include';
  if (value === 'false' || value === 'exclude' || value === '미포함') return 'exclude';
  return 'auto';
}

function compact(text: string): string {
  return String(text || '').replace(/\s+/gu, ' ').trim();
}

/** Cut at a word boundary to the card budget (keeps whole words; never mid-word unless one word is too long). */
function fitWords(text: string, max = THUMBNAIL_TEXT_MAX_CHARS): string {
  const words = compact(text).split(' ');
  const kept: string[] = [];
  for (const word of words) {
    if ([...kept, word].join(' ').length > max) break;
    kept.push(word);
  }
  // When the phrase had to be cut, do not end on a dangling modifier ("소희 양말 신던").
  if (kept.length < words.length) {
    while (kept.length > 1 && DANGLING_END.test(kept[kept.length - 1])) kept.pop();
  }
  return kept.join(' ') || compact(text).slice(0, max);
}

/** True when the text is (almost) the whole title — the V1 spec's "긴 제목 복사". */
export function isFullTitleCopy(text: string | null | undefined, title: string): boolean {
  const a = compact(String(text || '')).replace(/\s/gu, '');
  const b = compact(title).replace(/\s/gu, '');
  if (!a || !b) return false;
  if (a === b) return true;
  return b.length > THUMBNAIL_TEXT_MAX_CHARS && b.includes(a) && a.length >= b.length * 0.8;
}

/**
 * Short card text from the title: number phrase → quoted phrase → first clause. null when the title
 * offers nothing short and meaningful. A title that is already short is returned as is.
 */
export function deriveThumbnailText(title: string, cardPromise?: string): string | null {
  const clean = compact(title);
  if (!clean) return null;
  if (clean.length <= THUMBNAIL_TEXT_MAX_CHARS) return clean;
  const hook = extractThumbnailHook(clean, cardPromise);
  if (hook) return hook.main;
  const quoted = clean.match(QUOTED)?.[1];
  if (quoted && compact(quoted).length >= 3) return fitWords(quoted);
  const firstClause = compact(clean.split(CLAUSE_SPLIT)[0] || '');
  if (firstClause.length >= 4 && firstClause.length < clean.length) return fitWords(firstClause);
  return null;
}

/** Text for the legacy title overlays: short text, or the first words — never the whole long title. */
export function resolveThumbnailOverlayText(title: string): string {
  const clean = compact(title);
  return deriveThumbnailText(clean) ?? fitWords(clean);
}

export interface ThumbnailTextDecision {
  readonly include: boolean;
  readonly text: string | null;
  readonly reason: string;
}

/**
 * AUTO (V1 §9): include a short phrase for numbers, prices, dates, quotes, questions and issue hooks
 * (the spec's own 박서함 target keeps "짧은 텍스트" even on real photos); leave the picture alone when a
 * product or a travel place is itself the point and there is no number to add.
 */
export function decideThumbnailText(input: {
  readonly mode: ThumbnailTextMode;
  readonly title: string;
  readonly cardPromise?: string;
  readonly realPhotoCover: boolean;
  readonly kind: ArticleVisualKind;
}): ThumbnailTextDecision {
  if (input.mode === 'exclude') return { include: false, text: null, reason: '사용자 설정: 미포함' };
  const text = deriveThumbnailText(input.title, input.cardPromise);
  if (!text || isFullTitleCopy(text, input.title) && compact(input.title).length > THUMBNAIL_TEXT_MAX_CHARS) {
    return { include: false, text: null, reason: '짧게 줄일 문구 없음' };
  }
  if (input.mode === 'include') return { include: true, text, reason: '사용자 설정: 포함' };
  const hasNumber = extractThumbnailHook(input.title, input.cardPromise) !== null;
  if (hasNumber) return { include: true, text, reason: '자동: 숫자·금액·기간' };
  if (QUOTED.test(input.title)) return { include: true, text, reason: '자동: 짧은 발언' };
  if (input.kind === 'product' || input.kind === 'travel') {
    return { include: false, text: null, reason: '자동: 제품·장소 자체가 핵심' };
  }
  return {
    include: true,
    text,
    reason: input.realPhotoCover ? '자동: 실제 사진 + 짧은 핵심 문구' : '자동: 짧은 핵심 문구',
  };
}
