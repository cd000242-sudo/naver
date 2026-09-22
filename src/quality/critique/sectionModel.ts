// [2026-09-22 Critique Loop] Section model of the article the reader actually sees.
//
// Publishing (editorHelpers.applyStructuredContent) types: introduction -> for each heading,
// the slice of bodyPlain between that heading title and the next one (when bodyPlain carries
// the titles) or heading.content (when it does not) -> conclusion -> CTA -> hashtags. The
// Critic and the Judge must see exactly that, so this model is built with the same rules,
// and edits are written back to BOTH headings[].content and bodyPlain (literal replacement)
// so the two never drift apart.

import type { StructuredContent } from '../../contentGenerator';
import type { ArticleModel, ArticleSection } from './types';

const MIN_INFERRED_INTRO_CHARS = 20;

function clean(value: unknown): string {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function stripLeadingTitle(text: string, title: string): string {
  const lines = text.split('\n');
  const first = (lines[0] || '').replace(/^#{1,6}\s*/, '').trim();
  if (title && first === title) return lines.slice(1).join('\n').trim();
  return text.trim();
}

function headingLevel(title: string): 'h2' | 'h3' {
  return /^###\s/.test(title) ? 'h3' : 'h2';
}

function normalizeTitle(title: string): string {
  return title.replace(/^#{1,6}\s*/, '').trim();
}

/** Same test as editorHelpers: any heading title literally present in bodyPlain. */
export function bodyHasHeadingMarkers(bodyPlain: string, titles: readonly string[]): boolean {
  return titles.some((t) => t.length > 0 && bodyPlain.includes(t));
}

function inferIntroduction(bodyPlain: string, firstTitle: string, articleTitle: string): string {
  if (!firstTitle) return '';
  const pos = bodyPlain.indexOf(firstTitle);
  if (pos <= 0) return '';
  let intro = bodyPlain.slice(0, pos).trim();
  const lines = intro.split('\n').map((l) => l.trim());
  if (lines.length > 0 && articleTitle && lines[0].replace(/\s+/g, ' ') === articleTitle.replace(/\s+/g, ' ')) {
    intro = lines.slice(1).join('\n').trim();
  }
  return intro.length > MIN_INFERRED_INTRO_CHARS ? intro : '';
}

function sliceSectionsFromBody(
  bodyPlain: string,
  titles: readonly string[],
  conclusion: string,
): string[] {
  const out: string[] = [];
  let cursor = 0;
  const positions: number[] = titles.map((t) => {
    const p = t ? bodyPlain.indexOf(t, cursor) : -1;
    if (p >= 0) cursor = p + t.length;
    return p;
  });
  for (let i = 0; i < titles.length; i += 1) {
    const start = positions[i];
    if (start < 0) { out.push(''); continue; }
    let end = bodyPlain.length;
    for (let j = i + 1; j < titles.length; j += 1) {
      if (positions[j] > start) { end = positions[j]; break; }
    }
    let text = bodyPlain.slice(start + titles[i].length, end).trim();
    if (i === titles.length - 1 && conclusion && text.endsWith(conclusion)) {
      text = text.slice(0, text.length - conclusion.length).trim();
    }
    out.push(text);
  }
  return out;
}

/** Build the reader-visible section model from a StructuredContent. */
export function buildArticleModel(content: StructuredContent): ArticleModel {
  const bodyPlain = clean(content.bodyPlain);
  const headings = Array.isArray(content.headings) ? content.headings : [];
  const titles = headings.map((h) => clean(h?.title));
  const markers = bodyHasHeadingMarkers(bodyPlain, titles);
  const conclusion = clean(content.conclusion);
  const articleTitle = clean(content.selectedTitle);
  const explicitIntro = clean(content.introduction);
  const intro = explicitIntro || (markers ? inferIntroduction(bodyPlain, titles[0] || '', articleTitle) : '');
  const sliced = markers ? sliceSectionsFromBody(bodyPlain, titles, conclusion) : [];

  const sections: ArticleSection[] = [];
  if (intro) sections.push({ id: 'intro', kind: 'intro', title: '도입부', text: intro });
  headings.forEach((h, i) => {
    const fromBody = markers ? sliced[i] : '';
    const text = fromBody || stripLeadingTitle(clean(h?.content), titles[i]);
    sections.push({
      id: `s${i + 1}`,
      kind: 'section',
      title: normalizeTitle(titles[i]),
      text,
      headingIndex: i,
      level: headingLevel(titles[i]),
    });
  });
  if (conclusion) sections.push({ id: 'conclusion', kind: 'conclusion', title: '마무리', text: conclusion });
  const cta = clean(content.cta?.text);
  if (cta) sections.push({ id: 'cta', kind: 'cta', title: 'CTA', text: cta });

  return {
    title: articleTitle,
    sections,
    hashtags: Array.isArray(content.hashtags) ? content.hashtags.map((t) => clean(t)).filter(Boolean) : [],
    bodyHasHeadingMarkers: markers,
  };
}

function replaceFirst(haystack: string, needle: string, replacement: string): string {
  if (!needle) return haystack;
  const idx = haystack.indexOf(needle);
  if (idx < 0) return haystack;
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

/**
 * Apply section edits and return a NEW StructuredContent. Only ids present in `edits` change.
 * headings[].content and bodyPlain are both updated so the publish path (which may read either)
 * shows the revised text.
 */
export function applySectionEdits(
  content: StructuredContent,
  model: ArticleModel,
  edits: Readonly<Record<string, string>>,
): StructuredContent {
  let bodyPlain = String(content.bodyPlain ?? '');
  let introduction = content.introduction;
  let conclusion = content.conclusion;
  let cta = content.cta;
  const headings = Array.isArray(content.headings) ? content.headings.map((h) => ({ ...h })) : [];

  for (const section of model.sections) {
    const next = edits[section.id];
    if (typeof next !== 'string' || next.trim() === section.text.trim()) continue;
    const replacement = next.trim();
    if (section.kind === 'intro') {
      introduction = replacement;
      bodyPlain = replaceFirst(bodyPlain, section.text, replacement);
    } else if (section.kind === 'conclusion') {
      conclusion = replacement;
      bodyPlain = replaceFirst(bodyPlain, section.text, replacement);
    } else if (section.kind === 'cta') {
      cta = { ...(cta || { text: '' }), text: replacement };
    } else if (typeof section.headingIndex === 'number' && headings[section.headingIndex]) {
      const h = headings[section.headingIndex];
      headings[section.headingIndex] = { ...h, content: replacement };
      bodyPlain = replaceFirst(bodyPlain, section.text, replacement);
    }
  }
  return { ...content, bodyPlain, introduction, conclusion, cta, headings };
}

/** Plain rendering of the visible article (what the Judge reads). */
export function renderVisibleArticle(model: ArticleModel): string {
  const parts: string[] = [`# ${model.title}`];
  for (const s of model.sections) {
    if (s.kind === 'intro') parts.push(s.text);
    else if (s.kind === 'section') parts.push(`${s.level === 'h3' ? '###' : '##'} ${s.title}\n${s.text}`);
    else if (s.kind === 'conclusion') parts.push(s.text);
    else parts.push(`[CTA] ${s.text}`);
  }
  if (model.hashtags.length > 0) parts.push(model.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' '));
  return parts.join('\n\n');
}

/** Section listing for prompts: id / title / text, optionally restricted to given ids. */
export function describeSections(model: ArticleModel, ids?: readonly string[]): string {
  const wanted = ids ? new Set(ids) : null;
  return model.sections
    .filter((s) => !wanted || wanted.has(s.id))
    .map((s) => `[${s.id}] ${s.kind === 'section' ? `(${s.level}) ` : ''}${s.title}\n${s.text}`)
    .join('\n\n');
}

export function findSection(model: ArticleModel, id: string): ArticleSection | undefined {
  return model.sections.find((s) => s.id === id);
}
