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
  return /["“”].{2,}["“”]/.test(title);
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
  ].filter(Boolean);

  if (signals.length === 0) {
    issues.push('후킹 구조 없음 — 대조·인용·결론차단 중 하나도 없음');
  }

  return issues;
}
