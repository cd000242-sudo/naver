/**
 * Affiliate(쇼핑커넥트) 모드 평가기 — 끝판왕 Phase 1 (v2.10.177)
 *
 * 평가 항목 (가중치 합 100):
 *   1. 제품명/브랜드 명시 (15점)
 *   2. 가격/스펙 정보 (15점)
 *   3. 사용 경험 톤 (직접 써봄) (20점)
 *   4. 비교/장단점 구조 (15점)
 *   5. CTA 위치 (글 후반) (10점)
 *   6. 후기 자연스러움 (쇼핑몰 상투어 없음) (10점)
 *   7. 추천 대상 명시 (해당 가구/연령/상황) (10점)
 *   8. 사진/이미지 언급 신호 (5점)
 *
 * 진단: 쇼핑커넥트는 구매 전환이 핵심. 직접 사용한 듯한 진정성 + 비교/추천 구조.
 *   reviewer #9: CTA urgency가 LOW_QUALITY_PATTERNS에 차단되는 문제 → 본 evaluator는 *허용* 평가.
 */

import type { SubScore, EvaluationInput } from '../qualityEvaluator';

const USAGE_TONE = ['직접 써', '직접 사용', '사용해보', '써본', '겪어', '경험해', '체험', '실제로', '한 달', '일주일', '며칠'];
const COMPARISON = ['비교', '대비', '차이', '장점', '단점', '아쉬운', '좋은 점', '나쁜 점', 'vs', '대신', '반면'];
const CTA_WORDS = ['추천', '권', '구매', '확인', '알아보', '둘러보', '한정', '특가', '할인', '쿠폰', '링크'];
const SHOPPING_CLICHE = ['재구매', '배송 빨랐', '재구매 의사', '강추', '인생템', '갓성비', '5점 만점', '100% 만족', '강력 추천'];
const RECOMMEND_TARGET = ['추천드려', '에게 추천', '이런 분', '하시는 분', '필요하신 분', '고민하시', '워킹맘', '직장인', '주부', '학생', '신혼', '어린이'];

function countMatches(text: string, words: readonly string[]): number {
  let count = 0;
  for (const w of words) {
    const m = text.match(new RegExp(w, 'g'));
    if (m) count += m.length;
  }
  return count;
}

export function evaluateAffiliate(input: EvaluationInput): SubScore {
  const body = input.body || '';
  const title = input.title || '';
  const fullText = body + ' ' + title;

  const details: Record<string, number> = {};
  const issues: string[] = [];
  const suggestions: string[] = [];
  let total = 0;

  // 1. 제품명/브랜드 명시 (15점) — 영문 대문자 단어 또는 한글 고유명사 출현
  const productMentions = (body.match(/[A-Z][a-zA-Z0-9]{2,}/g) ?? []).length
    + (body.match(/[가-힣]{2,}\s*(제품|상품|모델|브랜드)/g) ?? []).length;
  let pmScore = 0;
  if (productMentions >= 3) pmScore = 15;
  else if (productMentions >= 1) pmScore = 10;
  else {
    pmScore = 3;
    issues.push('제품명/브랜드 명시 부족 — 구체적 모델명 노출 권장');
    suggestions.push('상품명/브랜드를 본문에 2~3회 자연스럽게 명시');
  }
  details.productMention = pmScore;
  total += pmScore;

  // 2. 가격/스펙 정보 (15점)
  const hasPrice = /\d+(?:,\d{3})*\s*원|\d+만\s*원|\$\s*\d|￦\s*\d/.test(body);
  const hasSpec = /\d+(?:\.\d+)?\s*(kg|g|cm|mm|ml|L|W|V|GB|TB|MB|inch|인치)/i.test(body);
  let psScore = 0;
  if (hasPrice && hasSpec) psScore = 15;
  else if (hasPrice || hasSpec) psScore = 10;
  else {
    psScore = 4;
    issues.push('가격 또는 스펙 수치 부재 — 구매 결정에 필요한 정보 부족');
    suggestions.push('가격대 또는 핵심 스펙 (용량/크기/무게) 명시');
  }
  details.priceSpec = psScore;
  total += psScore;

  // 3. 사용 경험 톤 (20점) — 직접 써본 듯한 표현
  const usageCount = countMatches(body, USAGE_TONE);
  let useScore = 0;
  if (usageCount >= 3) useScore = 20;
  else if (usageCount >= 1) useScore = 12;
  else {
    useScore = 4;
    issues.push('사용 경험 표현 부재 — "직접 써본" 톤 부족');
    suggestions.push('"한 달 써봤어요", "직접 사용해보니", "처음 받았을 때" 같은 체험 표현 배치');
  }
  details.usageExperience = useScore;
  total += useScore;

  // 4. 비교/장단점 구조 (15점)
  const comparisonCount = countMatches(body, COMPARISON);
  let cmpScore = 0;
  if (comparisonCount >= 3) cmpScore = 15;
  else if (comparisonCount >= 1) cmpScore = 10;
  else {
    cmpScore = 4;
    issues.push('비교/장단점 구조 부재 — 구매 판단 근거 약함');
    suggestions.push('장점/단점 또는 다른 제품과 비교 섹션 추가');
  }
  details.comparisonStructure = cmpScore;
  total += cmpScore;

  // 5. CTA 위치 — 글 후반 (10점)
  const half = Math.floor(body.length / 2);
  const lastQuarter = body.slice(Math.floor(body.length * 0.6));
  const ctaInLastHalf = countMatches(lastQuarter, CTA_WORDS);
  const ctaInFirstHalf = countMatches(body.slice(0, half), CTA_WORDS);
  let ctaScore = 0;
  if (ctaInLastHalf >= 2 && ctaInLastHalf > ctaInFirstHalf) ctaScore = 10;
  else if (ctaInLastHalf >= 1) ctaScore = 7;
  else if (ctaInFirstHalf >= 1) {
    ctaScore = 4;
    issues.push('CTA가 글 전반에만 배치 — 후반 강화 권장 (전환율 ↑)');
  } else {
    ctaScore = 3;
    issues.push('CTA(추천/확인/구매) 표현 부재');
    suggestions.push('글 마무리에 "~분께 추천", "확인해보세요" 같은 자연스러운 CTA 1~2회');
  }
  details.ctaPosition = ctaScore;
  total += ctaScore;

  // 6. 후기 자연스러움 (10점) — 쇼핑몰 상투어 감점
  const clicheCount = countMatches(fullText, SHOPPING_CLICHE);
  let naturalScore = 10;
  if (clicheCount >= 3) {
    naturalScore = 2;
    issues.push(`쇼핑몰 상투어 ${clicheCount}회 출현 — "재구매/강추/인생템" 등 → 광고성 톤`);
    suggestions.push('상투어 대신 구체적 경험 묘사로 교체');
  } else if (clicheCount >= 1) {
    naturalScore = 6;
    issues.push(`쇼핑몰 상투어 ${clicheCount}회 — 자연스러운 톤 권장`);
  }
  details.naturalTone = naturalScore;
  total += naturalScore;

  // 7. 추천 대상 명시 (10점)
  const targetCount = countMatches(body, RECOMMEND_TARGET);
  let targetScore = 0;
  if (targetCount >= 2) targetScore = 10;
  else if (targetCount >= 1) targetScore = 6;
  else {
    targetScore = 3;
    issues.push('추천 대상 명시 부족 — 구매 매칭률 약화');
    suggestions.push('"~한 분께", "워킹맘", "직장인 출퇴근" 같은 구체 추천 대상 명시');
  }
  details.recommendTarget = targetScore;
  total += targetScore;

  // 8. 사진/이미지 신호 (5점)
  const imgRef = /사진|이미지|보시면|위 그림|아래 사진|찍어/.test(body);
  details.imageRef = imgRef ? 5 : 2;
  total += details.imageRef;
  if (!imgRef) suggestions.push('사진/이미지 언급 추가 — 시각 신뢰도 ↑');

  return {
    score: Math.round(Math.max(0, Math.min(100, total))),
    details,
    issues,
    suggestions,
  };
}
