/**
 * outcomeFeatures.ts — post features computed once, at publish time (pure, no I/O).
 *
 * [2026-11-08 exposure-measurement plan, step 2]
 * These numbers are stored next to the post in outcome-dataset-v1.json, keyed by blogId+logNo, so the later
 * analysis never has to re-match posts by title. Only numbers and short labels are produced here — never body text.
 * The outside-corpus collector (plan section 8) must call this same function so both sides share one definition.
 */
export interface OutcomeFeatures {
  readonly featureVersion: 1;
  readonly titleType: string | null;
  readonly headingsCount: number;
  readonly bodyChars: number;
  readonly sentenceLenStdDev: number;
  readonly questionCount: number;
  readonly imageCount: number;
  /** 0-23 in KST, or -1 when the publish time could not be read. */
  readonly publishHourKst: number;
  /** Filled once keyword difficulty is recorded (serpBenchmark is empty for all stored posts today). */
  readonly keywordDifficulty: string | null;
}

export interface OutcomeFeatureInput {
  readonly title: unknown;
  readonly body: unknown;
  readonly headings?: readonly unknown[];
  readonly headingsCount?: number;
  readonly imageCount: unknown;
  readonly publishedAt: unknown;
}

const KST_OFFSET_HOURS = 9;
const QUESTION_ENDING = /(일까|할까|나요|까요|인가요|있을까)\s*$/u;
const nonSpaceLength = (text: string): number => text.replace(/\s+/g, '').length;
const wholeNonNegative = (value: unknown): number => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** question / number / two-part (comma or colon split) / statement. Empty title has no type. */
export function classifyTitleType(title: unknown): string | null {
  const text = String(title ?? '').trim();
  if (!text) return null;
  if (/[?？]/u.test(text) || QUESTION_ENDING.test(text)) return 'question';
  if (/\d/u.test(text)) return 'number';
  if (/[,，:：…]|—/u.test(text)) return 'two-part';
  return 'statement';
}

function sentenceLengthStdDev(body: string): number {
  const lengths = body
    .split(/[.!?。！？…]+|\n+/u)
    .map(nonSpaceLength)
    .filter((len) => len > 0);
  if (lengths.length < 2) return 0;
  const mean = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
  const variance = lengths.reduce((sum, len) => sum + (len - mean) ** 2, 0) / lengths.length;
  return Math.round(Math.sqrt(variance) * 100) / 100;
}

function publishHourKst(publishedAt: unknown): number {
  const ms = Date.parse(String(publishedAt ?? ''));
  if (!Number.isFinite(ms)) return -1;
  return (new Date(ms).getUTCHours() + KST_OFFSET_HOURS) % 24;
}

export function computeOutcomeFeatures(input: OutcomeFeatureInput): OutcomeFeatures {
  const body = String(input.body ?? '');
  return {
    featureVersion: 1,
    titleType: classifyTitleType(input.title),
    headingsCount: input.headings ? input.headings.length : wholeNonNegative(input.headingsCount),
    bodyChars: nonSpaceLength(body),
    sentenceLenStdDev: sentenceLengthStdDev(body),
    questionCount: (body.match(/[?？]/gu) || []).length,
    imageCount: wholeNonNegative(input.imageCount),
    publishHourKst: publishHourKst(input.publishedAt),
    keywordDifficulty: null,
  };
}
