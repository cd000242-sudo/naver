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

  // Indirect experience phrasing that bypassed the v1 scanner during the
  // option-A auto-promote regression (2026-04-18 gpt-4o-mini expert_review).
  '되더라고요',
  '제 일상에',
  '내 일상에',
  '자주 찾게 되',
  '스며들었',
  '먹어보니',
  '발라보니',
  '만져보니',
  '아이들이 간식',
  '아이들이 좋아',

  // Unsubstantiated category-level generalisation (expert_review fabricated
  // "일반적으로 이 제품들은…", "보통 이 가격대는…" etc.)
  '일반적으로 이 제품',
  '일반적으로 이 가격',
  '일반적으로 이 카테고리',
  '보통 이 가격대',
  '보통 이 카테고리',
  '이 카테고리 제품들은 보통',
  '대부분의 사용자가',
  '많은 분들이 선택',

  // Fabricated comparative numbers (no competitor data is actually collected).
  '비슷한 가격대의 다른',
  '비슷한 스펙의 제품',
  '비슷한 성능의 제품',
  '2배 가격대',
  '두 배 가격',
  '2배 이상의 가격',
  '두 배 이상의 가격',
  '1/2 가격',
  '반값에',

  // Fabricated value-translation math ("하루 커피 한 잔 값" etc.)
  '커피 한 잔 값',
  '하루 커피',
  '커피 한 잔',

  // Fabricated sensory/visual descriptions (the model didn't actually see it)
  '뚜껑 닫히',
  '뚜껑이 닫히',
  '마감 품질',
  '고급스러운 느낌',
  '플라스틱 느낌',
] as const;

// Meta-critique leakage from self-check checklist instructions in the prompt.
// The model occasionally treats "[자가 점검 체크리스트]" / "[최종 자가검수]"
// blocks as content rather than silent verification, and writes phrases like
// "솔직하게 자체비평하겠습니다" or "자가검수를 진행하겠습니다" into the article.
// These should never appear in the published post — they're the LLM's
// internal monologue leaking into the output.
//
// `stripMetaCritiqueLines` (in contentGenerator.ts) deletes whole lines that
// contain any of these phrases, since they always introduce a meta paragraph
// rather than a normal sentence.
export const META_CRITIQUE_PHRASES: readonly string[] = [
  '자체비평',
  '자체 비평',
  '자기비평',
  '자기 비평',
  '자가검수',
  '자가 검수',
  '자가점검',
  '자가 점검',
  '자체점검',
  '자체 점검',
  '자체검수',
  '자체 검수',
  '솔직하게 자체',
  '솔직히 자체',
  '솔직하게 평가하',
  '솔직히 평가하',
  '평가해보겠',
  '평가해 보겠',
  '점검해보겠',
  '점검해 보겠',
  '검수해보겠',
  '검수해 보겠',
  '체크리스트',
  '체크 리스트',
  '메타 검수',
  '메타검수',
  '자체 평가하',
  '자체평가하',
  '자기 평가하',
  '자기평가하',
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
