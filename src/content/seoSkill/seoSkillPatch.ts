/**
 * claude-seo review pass — reading the model's edit list, applying it to the article sections, and the safety gate.
 * Pure functions, no I/O.
 *
 * The model returns only the phrases to change (never the whole article): re-typing a whole post took 197 seconds
 * for a 14,000-character article in a live Orbit run (2026-11-16) against 31 seconds for the edit list.
 * Edits are applied to the section texts the reader sees (introduction / heading bodies / conclusion), never to the
 * title, the heading titles, the CTA or the hashtags.
 */
import type { ArticleModel } from '../../quality/critique/types.js';

export interface ReviewPatch { readonly find: string; readonly replace: string }

/** At most this many edits are applied from one answer. */
export const MAX_PATCHES = 12;
/** A phrase shorter than this is too likely to be ambiguous or to hit the wrong spot. */
const MIN_FIND_CHARS = 15;
const MAX_NOTES = 3;

const stripFence = (text: string): string => {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] ?? '' : text).trim();
};

/**
 * Takes the edit list between ARTICLE_PATCH_BEGIN / ARTICLE_PATCH_END and up to three "changed" lines after it.
 * Strict on purpose: no markers, or no JSON array between them, means no result.
 */
export function parsePatchReply(reply: string): { patches: ReviewPatch[]; dropped: number; notes: string[] } | null {
  const raw = String(reply || '');
  const re = /ARTICLE_PATCH_BEGIN\s*([\s\S]*?)\s*ARTICLE_PATCH_END/gi;
  let found: { items: unknown[]; end: number } | null = null;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    try {
      const value: unknown = JSON.parse(stripFence(String(m[1] || '')));
      if (Array.isArray(value)) found = { items: value, end: m.index + m[0].length };
    } catch { /* a marker mentioned in prose, or broken JSON: keep looking */ }
  }
  if (!found) return null;

  const patches: ReviewPatch[] = [];
  let dropped = 0;
  for (const item of found.items) {
    const entry = item as { find?: unknown; replace?: unknown } | null;
    if (entry && typeof entry.find === 'string' && typeof entry.replace === 'string') patches.push({ find: entry.find, replace: entry.replace });
    else dropped += 1;
  }
  const notes = raw.slice(found.end).split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•·]|\d+[.)])\s+/, '').replace(/^바꾼 곳\s*[:：]\s*/, '').trim())
    .filter((line) => line && !/^바꾼 곳\s*[:：]?$/.test(line))
    .slice(0, MAX_NOTES);
  return { patches, dropped, notes };
}

const countOccurrences = (text: string, part: string): number => (part ? text.split(part).length - 1 : 0);
const lineBreaks = (text: string): number => (text.match(/\n/g) || []).length;

export interface PatchResult {
  /** New text per section id, only for sections that changed (feeds sectionModel.applySectionEdits). */
  readonly edits: Record<string, string>;
  readonly applied: number;
  readonly skipped: string[];
}

/**
 * Applies the edits one by one to the section texts. An edit that breaks a rule is skipped on its own (with the
 * reason) and the others still apply. Rules: the phrase is at least 15 characters and appears exactly once in the
 * whole article (every section counted) and inside an editable section; the replacement is a real change and keeps
 * the same number of line breaks (paragraph rhythm stays as it was).
 */
export function applyArticlePatches(
  model: ArticleModel,
  patches: readonly ReviewPatch[],
  editableKinds: ReadonlySet<string>,
): PatchResult {
  const texts = new Map(model.sections.map((s) => [s.id, s.text] as [string, string]));
  const kinds = new Map(model.sections.map((s) => [s.id, s.kind] as [string, string]));
  let applied = 0;
  const skipped: string[] = [];
  patches.forEach((patch, i) => {
    const label = `${i + 1}번`;
    if (i >= MAX_PATCHES) { skipped.push(`${label} 개수 초과`); return; }
    const { find, replace } = patch;
    if (find.trim().length < MIN_FIND_CHARS) { skipped.push(`${label} 찾을 구절이 짧음`); return; }
    if (!replace.trim() || replace === find) { skipped.push(`${label} 바꿀 내용 없음`); return; }
    if (lineBreaks(replace) !== lineBreaks(find)) { skipped.push(`${label} 문단 나눔 바뀜`); return; }
    const hits = [...texts].filter(([, text]) => text.includes(find));
    const total = hits.reduce((sum, [, text]) => sum + countOccurrences(text, find), 0);
    if (total !== 1) { skipped.push(`${label} 찾을 구절 ${total}곳`); return; }
    const [id, text] = hits[0] as [string, string];
    if (!editableKinds.has(kinds.get(id) || '')) { skipped.push(`${label} 고칠 수 없는 자리(${id})`); return; }
    const at = text.indexOf(find);
    texts.set(id, text.slice(0, at) + replace + text.slice(at + find.length));
    applied += 1;
  });
  const edits: Record<string, string> = {};
  for (const s of model.sections) {
    const next = texts.get(s.id);
    if (typeof next === 'string' && next !== s.text) edits[s.id] = next;
  }
  return { edits, applied, skipped };
}

export interface SafetyVerdict { readonly ok: boolean; readonly reason: string }

/** Numbers such as 1,200 / 2026 / 35% / 3.5. A comma only counts inside a thousands group. */
const NUMBER_RE = /\d+(?:,\d{3})*(?:\.\d+)?%?/g;
const MIN_RATIO = 0.8;
const MAX_RATIO = 1.25;

/** Decides whether the reviewed article text may replace the draft. The first failed check wins. */
export function checkArticleSafety(before: string, after: string): SafetyVerdict {
  const draft = String(before || '');
  const reviewed = String(after || '');
  if (!reviewed.trim()) return { ok: false, reason: '빈 글' };
  const was = draft.replace(/\s+/g, '').length;
  if (was === 0) return { ok: false, reason: '원래 글에 본문 글자가 없음' };
  const ratio = reviewed.replace(/\s+/g, '').length / was;
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) return { ok: false, reason: `글자 수 ${Math.round(ratio * 100)}% (허용 80~125%)` };
  // Every number of the draft must still be somewhere in the reviewed text (order does not matter).
  const kept = new Set(reviewed.match(NUMBER_RE) || []);
  const lost = [...new Set(draft.match(NUMBER_RE) || [])].filter((token) => !kept.has(token));
  if (lost.length > 0) return { ok: false, reason: `숫자 사라짐: ${lost.slice(0, 5).join(', ')}${lost.length > 5 ? ' 외' : ''}` };
  return { ok: true, reason: '' };
}
