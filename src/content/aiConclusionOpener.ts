/**
 * [2026-09-03 self-run 07:55] The closing paragraph opened with "정리하면 …" — the phrase
 * contentQualityChecker flags as an AI wrap-up (Critical, warning-only). The prompt bans it and
 * the model wrote it anyway, so paragraph-leading openers are dropped deterministically at
 * finalize: "정리하면 흰 메밀꽃과 문학 산책은 평창" → "흰 메밀꽃과 문학 산책은 평창".
 * Only a paragraph's first words are touched; "이를 정리하면" mid-sentence stays.
 * Openers are derived from the checker's own list (phrases shaped like 으로/하면/자면),
 * resolved lazily so module load order never matters.
 */
import { AI_CONCLUSION_PHRASES } from '../contentQualityChecker.js';

const MIN_REMAINDER_CHARS = 4;

function conclusionOpeners(): string[] {
  return AI_CONCLUSION_PHRASES.filter((phrase) => /(?:으로|하면|자면)$/u.test(phrase));
}

function trimOpenerTail(rest: string): string {
  let out = rest;
  while (out.length > 0 && (out[0] === ',' || out[0] === '，' || out[0] === ' ' || out[0] === '\t')) out = out.slice(1);
  return out;
}

/** Drops an AI wrap-up opener from the start of one line; returns the line unchanged otherwise. */
export function stripAiConclusionOpenerFromLine(line: string): string {
  const body = line.trimStart();
  const leading = line.slice(0, line.length - body.length);
  const opener = conclusionOpeners().find((phrase) => body.startsWith(phrase));
  if (!opener) return line;
  const rest = trimOpenerTail(body.slice(opener.length));
  if (rest.length < MIN_REMAINDER_CHARS) return line;
  return leading + rest;
}

/**
 * [2026-09-03 self-run 08:14] "… 결정하는 편이 맞겠네요. 정리하면 9월 초 주말이라면 …" — the opener
 * sat mid-paragraph, past both the checker's window and the line-start strip. A sentence start
 * after ./!/? counts the same as a paragraph start.
 */
function stripAiConclusionOpenersInSentences(line: string): string {
  const pieces = line.split(/(?<=[.!?。])\s+/u);
  if (pieces.length < 2) return stripAiConclusionOpenerFromLine(line);
  return pieces.map(stripAiConclusionOpenerFromLine).join(' ');
}

export function stripAiConclusionOpeners(text: string): string {
  if (!text) return text;
  return text.split('\n').map(stripAiConclusionOpenersInSentences).join('\n');
}

/** HTML variant: a paragraph starts right after the closing '>' of its opening tag. */
export function stripAiConclusionOpenersFromHtml(html: string): string {
  if (!html) return html;
  return html.split('>').map((segment, index) => (index === 0 ? segment : stripAiConclusionOpenerFromLine(segment))).join('>');
}

interface ContentLike {
  readonly headings?: ReadonlyArray<{ readonly title?: unknown; readonly content?: unknown }>;
  readonly introduction?: unknown;
  readonly conclusion?: unknown;
  readonly bodyPlain?: unknown;
  readonly bodyHtml?: unknown;
}

function stripIfString(value: unknown, fn: (text: string) => string): unknown {
  return typeof value === 'string' ? fn(value) : value;
}

/** Returns a new content object; every text field that can open a paragraph is cleaned. */
export function stripAiConclusionOpenersFromContent<T extends ContentLike>(content: T): T {
  if (!content) return content;
  const headings = Array.isArray(content.headings)
    ? content.headings.map((heading) => ({ ...heading, content: stripIfString(heading.content, stripAiConclusionOpeners) }))
    : content.headings;
  return {
    ...content,
    headings,
    introduction: stripIfString(content.introduction, stripAiConclusionOpeners),
    conclusion: stripIfString(content.conclusion, stripAiConclusionOpeners),
    bodyPlain: stripIfString(content.bodyPlain, stripAiConclusionOpeners),
    bodyHtml: stripIfString(content.bodyHtml, stripAiConclusionOpenersFromHtml),
  };
}
