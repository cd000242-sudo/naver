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
import { countHomefeedTitleHookSignals, STRONG_HOOK_SIGNALS } from './homefeedTitleHookFloor.js';

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
  /*
   * [2026-09-17 실측 재조정] 28~42 → 33~48.
   *
   * 홈판 1,299편 vs 같은 블로그의 미진입 794편, 폭 구간별 등장률 비(lift):
   *   28 미만 0.69 · 28~33 0.97 · 33~38 1.20 · 38~42 1.15 · 42~48 1.05 · 48 초과 1.57
   * 평균 순위는 전 구간 8.9~10.4 로 평평했다 — 길어서 잘리는 것이 순위를 깎는다는
   * 근거가 없다. 반면 28~33 은 0.97 로 이득이 없는 무풍지대였고, 하한이 28 이라
   * 생성물이 계속 30 근처에 붙었다(실측 3회 연속 30.0~30.5).
   * 하한을 이득이 시작되는 33 으로 올린다.
   *
   * 상한 42 는 그대로 둔다. 42 초과가 실측상 불리하지 않은 것은 맞지만, 사장님이 직접
   * 지적했던 53자 제목(폭 46.5, 키워드 나열형)이 상한을 48 로 열면 되살아난다.
   * 길이 자체보다 그 제목의 나열·중복이 문제였고, 그 판정은 다른 검사기가 한다.
   * 근거가 갈리는 구간을 여는 대신, 이득이 확실한 33~42 로 좁힌다.
   */
  homefeed: { min: 33, max: 42 },
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

/**
 * True when the title's length is acceptable for the mode.
 *
 * [2026-09-17] 홈판에서는 짧은 쪽도 탈락시킨다.
 * 예전 주석은 "짧은 것은 잘리는 것보다 약한 문제"였는데, 실측은 반대였다 —
 * 홈판 1,299편 vs 같은 블로그의 미진입 794편에서 폭 28 미만은 0.69배로 불리했고
 * 42 초과는 1.26배로 오히려 유리했다. 피드에서는 장치를 담을 자리가 없는 제목이
 * 잘리는 제목보다 나쁘다. 검색으로 싸우는 모드는 근거가 없으므로 기존대로 둔다.
 */
export function isWithinTitleLength(
  title: string | undefined,
  mode: TitleLengthMode | undefined,
): boolean {
  const { status } = judgeTitleLength(title, mode);
  if (mode === 'homefeed') {
    // 짧은 쪽은 무조건 탈락(0.69배). 긴 쪽은 후킹이 강하면 통과시킨다 —
    // 후보 재선정이 여기서 긴 후킹 제목을 짧은 것으로 되돌리면 상한 완화가 무의미해진다.
    if (status === 'under') return false;
    if (status === 'over') return countHomefeedTitleHookSignals(String(title || '')) >= STRONG_HOOK_SIGNALS;
    return true;
  }
  return status !== 'over';
}

/** Phrase for the JSON schema field, where the model actually reads it. */
export function describeTitleLength(mode: TitleLengthMode | undefined): string {
  const { min, max } = resolveTitleLengthRange(mode);
  return `${min}~${max}자`;
}
