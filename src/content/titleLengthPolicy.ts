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
  /** Raw character count, spaces included. Kept for logs. */
  readonly length: number;
  /** What the reader actually sees — the number the verdict is based on. */
  readonly width: number;
  readonly range: TitleLengthRange;
}

/*
 * [2026-08-27 사장님 지적] "글자수가 33자인데? 띄어쓰기는 왜 카운팅하는 거니?"
 *
 * 세어 보니 사장님이 센 33자는 공백을 뺀 값이고, 코드는 공백 포함 44자로 보고 있었다.
 * 공백을 세는 것 자체는 맞다 — 잘림은 글자 수가 아니라 폭으로 정해지고 공백도 자리를
 * 차지한다. 틀린 건 한글과 공백·숫자·영문을 같은 한 칸으로 센 것이다. 한글은 넓고
 * 나머지는 절반쯤이라, 숫자·영문이 섞인 제목이 실제보다 길게 계산돼 억울하게 걸렸다.
 *
 * 사장님 판단: "실측한들 어차피 그 기준만 두는 제목이 나올 수 없어." 맞는 말이다.
 * 정확한 경계를 찾기보다 재는 방식을 실제 보이는 것에 맞춘다.
 *
 * 상한 숫자는 그대로 둔다 — 순한글 제목은 예전과 똑같이 걸리고, 섞인 제목에만 여유가 생긴다.
 */
const NARROW_WIDTH = 0.5;

/** 한글·한자·가나는 한 칸, 나머지(공백·숫자·영문·기호)는 반 칸. */
export function measureTitleWidth(title: string | undefined): number {
  try {
    let width = 0;
    for (const ch of String(title || '')) {
      const code = ch.codePointAt(0) ?? 0;
      const isWide = (code >= 0xac00 && code <= 0xd7a3)   // 한글 음절
        || (code >= 0x1100 && code <= 0x11ff)             // 한글 자모
        || (code >= 0x3130 && code <= 0x318f)             // 호환 자모
        || (code >= 0x3040 && code <= 0x30ff)             // 가나
        || (code >= 0x4e00 && code <= 0x9fff);            // 한자
      width += isWide ? 1 : NARROW_WIDTH;
    }
    return width;
  } catch {
    return 0;
  }
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
  const trimmed = String(title || '').trim();
  const length = trimmed.length;
  const width = measureTitleWidth(trimmed);
  if (!length) return { status: 'unknown', length: 0, width: 0, range };
  // 판정은 폭으로 한다 — 독자가 보는 것은 글자 수가 아니라 잘리는 자리다.
  if (width > range.max) return { status: 'over', length, width, range };
  if (width < range.min) return { status: 'under', length, width, range };
  return { status: 'ok', length, width, range };
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
