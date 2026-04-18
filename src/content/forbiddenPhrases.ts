// Forbidden experiential phrases injected via the P0 review guard (SPEC-REVIEW-001).
// When no review data is supplied, these phrases are the primary hallucination signal
// the model leaks ("써봤는데", "2주 테스트", etc.). The guard prompt forbids them,
// the smoke test asserts their absence, and a post-generation scrub may strip them.
//
// Keep this list in sync with:
//   - src/content/reviewGuard.ts (the block injected into prompts)
//   - src/__tests__/smoke/review-guard.test.ts (the acceptance check)

export const FORBIDDEN_EXPERIENTIAL_PHRASES: readonly string[] = [
  // Direct experience claims
  '써봤',
  '써본',
  '써보니',
  '써보고',
  '사용해보니',
  '사용해봤',
  '사용한 지',
  '직접 써보',
  '직접 사용',
  '직접 경험',
  '경험상',
  '경험해보니',

  // Testing claims
  '테스트해보니',
  '테스트 해보니',
  '테스트했더니',
  '테스트해봤',

  // Duration-based experience
  '2주 썼',
  '2주 사용',
  '2주 동안',
  '2주간',
  '한 달 썼',
  '한 달 사용',
  '한 달 동안',
  '한달 동안',
  '한달간',
  '3개월 써',
  '3개월 사용',
  '3달 써',
  '3달 사용',
  '100일 써',
  '100일 사용',

  // Reception / unboxing claims
  '구매해서 받아보니',
  '배송받자마자',
  '배송받고 바로',
  '받자마자 써',
  '받자마자 사용',
  '도착하자마자 써',
  '도착하자마자 사용',

  // Social-proof fabrication (found in live LLM failure 2026-04-18)
  '가족들이 이 제품을 사용',
  '가족이 이 제품을 사용',
  '가족들이 사용해',
  '가족이 사용해',
  '가족한테 써',
  '가족도 써',
  '가족 반응',
  '주변 반응',
  '지인 반응',
  '주변에서도 써',
  '친구도 써',

  // Unsubstantiated value-for-money claims (gpt-4o-mini slipped these past the
  // shopping_review.prompt red-card list on 2026-04-18).
  '가성비가 뛰어나',
  '가성비 뛰어나',
  '가성비가 좋',
  '가성비 훌륭',
  '가성비가 훌륭',
  '가성비 우수',
  '가성비가 우수',
  '가성비 최상',
  '가성비 압도',
] as const;

export interface ForbiddenScanResult {
  clean: boolean;
  matches: string[];
}

export function findForbiddenPhrases(text: string): string[] {
  if (!text) return [];
  const matches = new Set<string>();
  for (const phrase of FORBIDDEN_EXPERIENTIAL_PHRASES) {
    if (text.includes(phrase)) matches.add(phrase);
  }
  return Array.from(matches);
}

export function scanForbiddenPhrases(text: string): ForbiddenScanResult {
  const matches = findForbiddenPhrases(text);
  return { clean: matches.length === 0, matches };
}
