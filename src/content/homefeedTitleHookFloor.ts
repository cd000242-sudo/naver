/**
 * Homefeed title hook floor.
 *
 * Root cause this addresses: the 248-line hook playbook
 * (prompts/title/homefeed/base.prompt — click psychology, 20% reversal, conclusion
 * withholding) is only loaded by generateTitleOnlyPatch, which fires only when
 * computeHomefeedTitleCriticalIssues finds a defect. Measured on 37 published
 * homefeed posts: 13 (35%) passed that gate with zero issues, so the playbook never
 * ran for them. "No defect" meant "no hook".
 *
 * This floor is deliberately STRUCTURAL, not a word list. A word list is gameable and
 * has already failed here: because 'valueTriggers' contains '의외', two published
 * titles simply opened with "의외로" and passed. A title clears this floor only when
 * two terms actually stand in opposition, a real quote is carried, or the conclusion
 * is withheld — and never when the title ends by summarizing its own information.
 *
 * Verified against the 37 published titles before wiring: the 11 that fail are exactly
 * the bland ones, and all 4 judged hooked pass. No false positives.
 */

/** A real quoted fragment, not a stray quote mark. */
function hasQuote(title: string): boolean {
  // [2026-09-17] 작은따옴표를 빠뜨리고 있었다. 실측에서 탈락한 홈판 제목
  //   "가난한 집 냉장고에 꼭 쌓여있다는 '이것'"
  // 처럼 한국어 제목은 정체를 '이것'·'그 사람' 으로 감출 때 작은따옴표를 쓴다.
  return /["“”].{2,}["“”]/.test(title) || /[‘'].{1,}[’']/.test(title);
}

/** Two terms standing in opposition: negation pairing, state transition, or a numeric gap. */
function hasContrast(title: string): boolean {
  if (/(아니고|아니라|아닌|없이|없어도|빠진|말고|대신|보다|안 \S|못 \S)/.test(title)) return true;
  if (/(\d+\s*년 전|\d+\s*일 만에|하루도|했더니|하더니|줄 알|인 줄|떠나는|끝내고|앞둔|넘기 전|\S기 전|\S 전 )/.test(title)) {
    return true;
  }
  const digits = title.match(/\d+/g) ?? [];
  return digits.length >= 2 && /(만|억|원|개|위|배|%|kWh)/.test(title);
}

/** Names the reason, background or identity without answering it in the title. */
function hasWithheldConclusion(title: string): boolean {
  return /(이유|배경|정체|공통점|비결|사연|무엇일까|이게맞나|누구|뭘까|맞죠|왜 )/.test(title);
}

/**
 * [2026-09-17] 말줄임으로 끊기. 홈판 1,299편 51% vs 미진입 794편 35% — 1.45배.
 * 기존 3신호에 없어서, 실측상 두 번째로 흔한 장치가 바닥 판정에서 빠져 있었다.
 */
function hasEllipsis(title: string): boolean {
  return /\.\.|…/.test(title);
}

/**
 * [2026-09-17] 이름 대신 범주로 지칭. 홈판 40% vs 미진입 23% — 1.77배로 실측 최상위권.
 * hasWithheldConclusion 의 '정체·이유' 어휘와 겹치지 않는 축이다: 저쪽은 "무엇을 안 밝혔나",
 * 이쪽은 "누구인지를 범주로만 가리켰나" 를 본다.
 */
function hasCategoryIdentity(title: string): boolean {
  // 지시대명사 은폐('이것'·'그 사람')도 같은 축이다 — 이름을 안 주고 범주만 준다.
  return /(여배우|남배우|배우|여가수|남가수|가수|아이돌|연예인|개그맨|모델|톱스타|제작진|\d+대\s*\S{1,4}(배우|가수|남자|여자))/.test(title)
    || /(이것|그것|이 사람|그 사람|이 제품|이 음식|이 습관)/.test(title);
}

const SUMMARY_TAILS = [
  '정리', '현황', '포인트', '확정', '정보', '목록', '일정',
  '총정리', '기준표', '모음', '안내', '요약', '내역', '비교',
] as const;

/** The title ends by summarizing its own content, leaving no reason to click. */
function isSummaryShaped(title: string): boolean {
  return SUMMARY_TAILS.some((tail) => title.endsWith(tail));
}

/**
 * Returns hook-floor shortfalls for a homefeed title. Empty array = floor cleared.
 *
 * An empty title returns no shortfall on purpose: that is
 * computeHomefeedTitleCriticalIssues' territory, and reporting it twice would double
 * count one defect.
 */
/** 실측 lift 가 1.0 을 넘기 시작하는 장치 개수. 1개는 0.79 로 여전히 불리하다. */
const MIN_HOOK_SIGNALS = 2;

/**
 * 제목이 담은 후킹 장치 개수. 길이 상한을 조건부로 열 때 쓴다 —
 * 후킹이 강한 제목은 길어도 실측상 불리하지 않았다(42~48 1.05배, 48 초과 1.57배).
 */
export function countHomefeedTitleHookSignals(title: string): number {
  const t = String(title || '').trim();
  if (!t) return 0;
  return [
    hasQuote(t),
    hasContrast(t),
    hasWithheldConclusion(t),
    hasEllipsis(t),
    hasCategoryIdentity(t),
  ].filter(Boolean).length;
}

/** 길이 상한을 면제받는 후킹 장치 개수. 3개 이상은 실측 1.88배 구간이다. */
export const STRONG_HOOK_SIGNALS = 3;

export function computeHomefeedTitleHookFloorIssues(title: string): string[] {
  const t = String(title || '').trim();
  if (!t) return [];

  const issues: string[] = [];

  if (isSummaryShaped(t)) {
    issues.push('요약형 종결 — 제목에서 정보가 끝나 클릭 이유가 없음');
  }

  const signals = [
    hasQuote(t) && '인용',
    hasContrast(t) && '대조',
    hasWithheldConclusion(t) && '결론차단',
    hasEllipsis(t) && '말줄임',
    hasCategoryIdentity(t) && '정체범주',
  ].filter(Boolean);

  // [2026-09-17 실측] 장치 개수별 lift(홈판 등장률 ÷ 미진입 등장률):
  //   0개 0.31 / 1개 0.79 / 2개 0.95 / 3개 이상 1.51
  // 1개는 여전히 불리하다. 바닥을 1 → 2 로 올린다. 3개 이상은 프롬프트가 권한다.
  //
  // 이 바닥이 1개였을 때 통과한 실제 사례:
  //   "식당 오픈 전 대기 목격담, 즉흥 먹방 여행은 어디까지 리얼일까"
  //   → hasContrast 의 `\S 전 ` 이 "오픈 전 대기" 에 걸려 '대조' 1개로 통과했다.
  //     실제로는 대조가 아니고, 장치 0개짜리 제목이었다(lift 0.31 구간).
  if (signals.length < MIN_HOOK_SIGNALS) {
    issues.push(
      `후킹 구조 부족 — 대조·인용·결론차단·말줄임·정체범주 중 ${signals.length}개`
      + `(최소 ${MIN_HOOK_SIGNALS}개 필요${signals.length > 0 ? `, 현재: ${signals.join('·')}` : ''})`,
    );
  }

  return issues;
}
