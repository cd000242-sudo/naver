// src/crawler/issueHarness/analysisInput.ts
// [2026-11-03 사장님] "제목을 보고 수집할 게 아니라 제목과 본문 소제목 전부 다 분석해서 찾아오게."
//
// Builds the text the search-plan model reads: title + intro + every heading with its own paragraph
// + (when the headings carry no paragraphs) the whole article body. Long input is compacted by a
// fixed budget — the head of each paragraph, shares water-filled so short paragraphs free budget
// for long ones. No second model call: compaction is deterministic and free.

import type { IssueHeadingInput } from './types.js';

export const ANALYSIS_BUDGET = Object.freeze({
  /** Intro (사건 맥락이 가장 진한 부분). */
  introChars: 900,
  /** Total characters for all heading paragraphs together. */
  sectionsTotalChars: 6000,
  minPerHeading: 200,
  maxPerHeading: 1200,
  /** Whole-article block when headings carry no paragraphs: head + tail with a gap marker. */
  articleHeadChars: 2800,
  articleTailChars: 1000,
});

export interface AnalysisInput {
  headings: IssueHeadingInput[];
  intro?: string;
  articleBody?: string;
}

export interface AnalysisBlocks {
  introBlock: string;
  sectionsBlock: string;
  /** Empty when the heading paragraphs already cover the article. */
  articleBlock: string;
  headingsWithBody: number;
}

const squash = (text: unknown): string => String(text ?? '').replace(/\s+/g, ' ').trim();

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/** Water-filling: shortest paragraphs first, so unused share flows to the longer ones. */
function allocate(lengths: readonly number[]): number[] {
  const limits = lengths.map(() => 0);
  const order = lengths.map((len, index) => ({ len, index })).filter((x) => x.len > 0).sort((a, b) => a.len - b.len);
  let remaining: number = ANALYSIS_BUDGET.sectionsTotalChars;
  let left = order.length;
  for (const { len, index } of order) {
    const share = Math.floor(remaining / left);
    const cap = Math.max(ANALYSIS_BUDGET.minPerHeading, Math.min(ANALYSIS_BUDGET.maxPerHeading, share));
    limits[index] = Math.min(len, cap);
    remaining = Math.max(0, remaining - limits[index]);
    left -= 1;
  }
  return limits;
}

function compactArticle(text: string): string {
  const { articleHeadChars: head, articleTailChars: tail } = ANALYSIS_BUDGET;
  if (text.length <= head + tail) return text;
  return `${text.slice(0, head).trimEnd()} …(중략)… ${text.slice(text.length - tail).trimStart()}`;
}

export function buildAnalysisBlocks(input: AnalysisInput): AnalysisBlocks {
  const bodies = input.headings.map((h) => squash(h.body));
  const limits = allocate(bodies.map((b) => b.length));
  const sectionsBlock = input.headings
    .map((h, i) => `${i + 1}. 소제목: ${h.title}\n   본문: ${bodies[i] ? clip(bodies[i], limits[i]) : '(없음)'}`)
    .join('\n');
  const headingsWithBody = bodies.filter(Boolean).length;
  const article = squash(input.articleBody);
  // The article block is redundant once at least half of the headings carry their own paragraph.
  const needsArticle = article.length > 0 && headingsWithBody * 2 < Math.max(1, input.headings.length);
  return {
    introBlock: clip(squash(input.intro), ANALYSIS_BUDGET.introChars),
    sectionsBlock,
    articleBlock: needsArticle ? compactArticle(article) : '',
    headingsWithBody,
  };
}
