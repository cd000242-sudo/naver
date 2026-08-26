/**
 * Single source for title length per content mode.
 *
 * [2026-08-27] A homefeed article shipped with a 53-character title. The evaluator scored
 * it 29/100 and named the exact reason (-60, "42자 초과"), and it published anyway: the
 * candidate picker takes the highest of three, with no floor, so three long titles yield
 * the least-bad long title.
 *
 * The rule itself existed in four places that did not agree — the evaluator (>42), the
 * situation contract prose (28~42 / 25~45), the title prompts (28~42 / 25~40), and the
 * homefeed base prompt, which called it 권장. None of them reached the JSON schema field,
 * which is the position this codebase has repeatedly found to be the binding one:
 * hashtags, the summary table and the fact list were all ignored as prose and obeyed as
 * schema fields.
 *
 * Values here are copied from the evaluator and the title prompts. This module records the
 * existing policy in one place; it does not invent a new one.
 */

export type TitleLengthMode = 'seo' | 'homefeed' | 'affiliate' | 'business' | 'mate' | 'custom';

export interface TitleLengthRange {
  readonly min: number;
  readonly max: number;
}

export type TitleLengthStatus = 'ok' | 'under' | 'over' | 'unknown';

export interface TitleLengthVerdict {
  readonly status: TitleLengthStatus;
  readonly length: number;
  readonly range: TitleLengthRange;
}

/** Widest range — used when the mode is unknown, so an unknown mode never blocks. */
const FALLBACK: TitleLengthRange = { min: 22, max: 45 };

const RANGES: Record<string, TitleLengthRange> = {
  // contentTitleEvaluator: >42 → -60 (homefeed) / 28~42 → 이상적 길이
  homefeed: { min: 28, max: 42 },
  // title/seo/base.prompt: "반드시 25~40자" (평가기의 22~40 이상적 구간을 포함한다)
  seo: { min: 25, max: 40 },
  // title/affiliate/base.prompt: "반드시 28~42자. 42자를 넘기면 0점"
  affiliate: { min: 28, max: 42 },
  // title/business/base.prompt: "28~42자 골든존 (43자 이상 0점)"
  business: { min: 28, max: 42 },
  // mate 는 seo 계약을 따른다(프롬프트가 seo/base 를 함께 싣는다).
  mate: { min: 25, max: 40 },
};

export function resolveTitleLengthRange(mode: TitleLengthMode | undefined): TitleLengthRange {
  const key = String(mode || '').trim();
  return RANGES[key] || FALLBACK;
}

/** Where a title sits against its mode's range. Never throws. */
export function judgeTitleLength(
  title: string | undefined,
  mode: TitleLengthMode | undefined,
): TitleLengthVerdict {
  const range = resolveTitleLengthRange(mode);
  const length = String(title || '').trim().length;
  if (!length) return { status: 'unknown', length: 0, range };
  if (length > range.max) return { status: 'over', length, range };
  if (length < range.min) return { status: 'under', length, range };
  return { status: 'ok', length, range };
}

/** True when the title is not too long. Under-length is a weaker problem than truncation. */
export function isWithinTitleLength(
  title: string | undefined,
  mode: TitleLengthMode | undefined,
): boolean {
  return judgeTitleLength(title, mode).status !== 'over';
}

/** Phrase for the JSON schema field, where the model actually reads it. */
export function describeTitleLength(mode: TitleLengthMode | undefined): string {
  const { min, max } = resolveTitleLengthRange(mode);
  return `${min}~${max}자`;
}
