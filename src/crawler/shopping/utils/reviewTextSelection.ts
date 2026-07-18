const HTML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
});

const UI_NOISE_PATTERNS: readonly RegExp[] = Object.freeze([
  /옵션\s*선택|상품\s*보기|신고하기|도움이\s*돼요|도움돼요|리뷰\s*쓰기/i,
  /포토\s*리뷰\s*모아보기|리뷰\s*전체\s*보기|구매\s*옵션|판매자\s*답글/i,
  /^(?:리뷰|후기|별점|평점|좋아요|좋습니다|만족|만족해요|최고|추천|굿|good)[.!~\s]*$/i,
  /^(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|별\s*[1-5]개)$/i,
]);

const DECISION_SIGNAL_PATTERN = /설치|타공|구멍|천장|전원|배선|교체|조립|연결|크기|무게|공간|손잡이|편하|소리|소음|조용|진동|냄새|온도|따뜻|차갑|바람|건조|제습|물기|습기|청소|세척|필터|물통|관리|시간|\d+\s*(?:분|시간|일|주|개월)|불편|어렵|힘들|아쉽|단점|장점|문제|해결|효과|성능|속도|배송|포장|고장|AS|교환|반품|내구|전기|요금|사용 후|써보니/i;

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/gi, entity => HTML_ENTITIES[entity.toLowerCase()] || entity)
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function reviewIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
}

function isDecisionUseful(value: string): boolean {
  if (value.length < 12 || value.length > 600) return false;
  if (!/[가-힣a-z]/i.test(value)) return false;
  if (UI_NOISE_PATTERNS.some(pattern => pattern.test(value))) return false;
  if (DECISION_SIGNAL_PATTERN.test(value)) return true;
  return value.length >= 45 && /(?:했|됐|였|습니다|어요|네요|지만|때문|보다|후에|경우)/.test(value);
}

function usefulnessScore(value: string): number {
  const signalCount = (value.match(new RegExp(DECISION_SIGNAL_PATTERN.source, 'gi')) || []).length;
  const numberBonus = /\d/.test(value) ? 3 : 0;
  const contrastBonus = /하지만|다만|반면|대신|아쉽|불편|문제/.test(value) ? 3 : 0;
  return Math.min(value.length, 240) + signalCount * 20 + numberBonus + contrastBonus;
}

/**
 * Selects verbatim buyer-review evidence that can change a purchase decision.
 * It never summarizes or rewrites claims; ranking is used only when the source
 * contains more useful reviews than the bounded prompt budget can accept.
 */
export function selectDecisionUsefulReviewTexts(
  input: unknown,
  maxReviews = 8,
): string[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const selected = input.flatMap((raw, sourceIndex) => {
    if (typeof raw !== 'string') return [];
    const text = decodeHtml(raw);
    if (!isDecisionUseful(text)) return [];
    const identity = reviewIdentity(text);
    if (!identity || seen.has(identity)) return [];
    seen.add(identity);
    return [{ text, sourceIndex, score: usefulnessScore(text) }];
  });

  const boundedMax = Math.max(1, Math.min(20, Math.floor(maxReviews) || 8));
  if (selected.length <= boundedMax) return selected.map(item => item.text);

  return [...selected]
    .sort((a, b) => (b.score - a.score) || (a.sourceIndex - b.sourceIndex))
    .slice(0, boundedMax)
    .sort((a, b) => a.sourceIndex - b.sourceIndex)
    .map(item => item.text);
}
