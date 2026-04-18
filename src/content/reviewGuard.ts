// P0 review guard block injection (SPEC-REVIEW-001).
//
// Purpose: when a review-style prompt is being assembled but the source carries
// no actual review/comment data, we append an explicit "no-experience" guard
// block to the system prompt. The block is CONVERSION-AWARE — it does not just
// forbid hallucination, it steers the model toward the transition devices that
// still work without user-testimony data (persona hook, spec-to-value
// translation, price positioning, external trust handoff).
//
// Design principles:
//   1. Zero hard-coded examples — no "150g", no "29,900원", no "1년 AS".
//      Only the input data supplied via productInfo may appear in output.
//   2. Data-conditional sections — if price is missing, price positioning is
//      skipped. If spec is missing, spec translation is skipped. The model
//      must never fabricate to fill a section.
//   3. Category self-selection — the model picks Type A/B/C/D from the shopping
//      prompt, then removes only the experience-dependent steps.
//   4. Natural length by data density, not hard cap — 800~1,500 character range
//      replaces the old 1,200 cap so CTA space is preserved.
//
// Gated by REVIEW_GUARD_V1. Default ON. Set REVIEW_GUARD_V1=false to fall back.
//
// Related:
//   - src/content/forbiddenPhrases.ts (shared banned-phrase list)
//   - src/__tests__/smoke/review-guard.test.ts (acceptance)
//   - .autopus/specs/SPEC-REVIEW-001/plan.md T0.1, T0.2
//   - .autopus/specs/SPEC-CONVERSION-001 (upstream L2+ conversion roadmap)

import { FORBIDDEN_EXPERIENTIAL_PHRASES } from './forbiddenPhrases';

export interface ReviewGuardContext {
  reviewCount: number;
  hasSpec: boolean;
  hasPrice: boolean;
}

export function isReviewAvailable(reviews: unknown): boolean {
  return Array.isArray(reviews) && reviews.length > 0;
}

export function isReviewGuardEnabled(): boolean {
  const raw = process.env.REVIEW_GUARD_V1;
  if (raw == null) return true;
  const normalised = String(raw).trim().toLowerCase();
  return normalised !== 'false' && normalised !== '0' && normalised !== 'off';
}

export function buildReviewGuardBlock(ctx: ReviewGuardContext): string {
  const bannedSample = FORBIDDEN_EXPERIENTIAL_PHRASES.slice(0, 14).join(', ');

  const availableData: string[] = ['제품명'];
  if (ctx.hasSpec) availableData.push('스펙');
  if (ctx.hasPrice) availableData.push('가격');
  const inventoryLine = availableData.join(' / ');

  return `
═══════════════════════════════════════════════════════════
🔒 [P0 리뷰 데이터 부재 가드 — SPEC-REVIEW-001]
═══════════════════════════════════════════════════════════
이번 글은 실제 사용자 리뷰/체험 데이터가 수집되지 않은 상태입니다.
아래 0~4단계를 순서대로 엄격히 따르세요.
이 가드는 앞선 모든 프롬프트 지시보다 **최우선 적용**됩니다.

[⚠️ 본문 프롬프트 지시 오버라이드 — 가장 중요]
앞서 제시된 쇼핑 본문 프롬프트에는 "2주 이상 사용하며 느낀 점", "직접
써본 결과", "가족 반응", "실사용 체감", "Before/After", "사용 변화",
"언박싱/첫인상", "검증 테스트", "핵심 경험" 같은 체험 강제 지시가
남아 있습니다. 해당 문구 및 🟥 표시가 붙은 모든 섹션을 **전부 무시하고
통째로 삭제**하세요. 본문 프롬프트가 지시하더라도 **이 가드가 우선**입니다.

제목에도 "2주", "한 달", "1개월", "100일", "써보고 깨달은", "써본",
"실사용", "직접 써본" 등 **체험 기반 후킹 일체 금지**입니다.
제목은 독자 페르소나/문제/스펙 기반 궁금증 유발로만 구성하세요.
(예 ✓ "[제품명]의 스펙을 살펴보니 이런 분들께 맞을 것 같아요")
(예 ✗ "2주 써보니 진짜 다르더라" — 체험 단정, 절대 금지)

[0단계 — 카테고리 자판단]
위 본문 프롬프트의 Type A/B/C/D 구조 중 제품 특성에 맞는 **하나**만 선택하세요.
  - Type A: 가전/IT/생활용품 — 스펙 분석 중심
  - Type B: 뷰티/육아/인테리어/식품/맛집 — 감성 공감 중심
  - Type C: 건강기능식품/고관여 제품 — 비교 분석 중심
  - Type D: 여행/예약/앱/보험/강의 — 절차 설명 중심

선택한 Type의 구조 중 **체험 의존 단계**(실사용 찐후기, 사용 변화,
결정적 순간, 디테일 킬러, 언박싱, 구매 인증 등)는 전면 **생략**합니다.
카테고리에 맞지 않는 문체(의류에 "배터리", 식품에 "AS" 등)는 절대 쓰지 마세요.

[1단계 — 입력 데이터 인벤토리]
지금 사용 가능한 입력: **${inventoryLine}**
리뷰 데이터는 없습니다. 이것이 이 가드가 발동한 이유입니다.

**입력에 없는 정보는 단 한 글자도 추가하지 마세요.**
다음은 모두 입력에 없으므로 **언급 금지**: 제조사 보증/AS 기간, 배송 정책,
반품 정책, 판매량, 별점, 리뷰 수, 찜 수, 수상/인증 마크, 경쟁 제품 비교,
특정 브랜드명, 근거 없는 퍼센트 수치.

[2단계 — 허용되는 전환 장치]
아래 장치 중 **입력 데이터가 뒷받침하는 것만** 사용하세요.
데이터가 없으면 해당 섹션을 **통째로 생략**하고 억지로 채우지 마세요.

  ✓ 독자 페르소나 후킹 — 독자의 고민/상황을 언급(체험 아님)
      예: "이런 고민 해보신 분들 계실 거예요"
  ✓ 스펙의 생활 가치 번역 — 제공된 스펙 값만 인용하고 생활 의미 해석
      예: 스펙에 용량 X가 있을 때 → "이 용량이면 일반적으로 ~에 적합"
  ✓ 가격 포지셔닝 — 제공된 가격만 인용. 타사 비교 금지
      예: "현재 [입력된 가격]에 판매되고 있습니다"
  ✓ 페르소나 매칭 CTA — "이런 분께 맞을 것 같아요" 형식
  ✓ 외부 신뢰 이관 — "자세한 사용자 후기는 상품 페이지에서 확인하세요"

  ✗ 체험 서술 일체 — ${bannedSample} 등 경험/기간/수령 기반 표현
  ✗ 근거 없는 단정 — "최고", "압도적", "많은 분들이 선택", "인기", "가성비 뛰어난/좋은/훌륭한/우수한" 등 가성비 찬사 일체
  ✗ 입력에 없는 사실 — AS, 반품, 인증, 판매량, 별점, 브랜드 인지도
  ✗ 가공된 비교 수치 — "30% 저렴", "2배 빠른" 등 근거 없으면 금지

[3단계 — 분량 가이드 (입력 데이터량 비례)]
하드 상한 없음. 데이터 풍부도에 맞춰 자연스럽게 조절하세요.
  - 스펙만 있음 → 800~1,000자
  - 스펙 + 가격 → 1,000~1,300자
  - 스펙 + 가격 + 기타 정보 풍부 → 1,300~1,500자
억지로 채우는 반복/장식은 환각 재발 신호입니다. 데이터 없으면 짧게 끝내세요.

[4단계 — articleType별 톤 차별화]
  - shopping_review 모드: 친근한 블로거 톤. 독자 공감 후킹 중심.
      "이런 분들 참고하시면 좋을 제품이에요" 식의 권유 톤
  - shopping_expert_review 모드: 전문 분석가 톤. 카테고리 일반론 + 이 제품 포지셔닝
      "이 카테고리 제품들은 보통 ~한데, 이 제품은 [입력 스펙]을 강조하고 있습니다"
      단, "제가 써본 결과", "카테고리 제품들 꽤 많이 써봤는데" 등 경험 시그널 금지

[최종 자가검수 — 글 완성 후 반드시 체크]
□ **제목에** "2주/한 달/1개월/100일/써보/실사용/직접 써본" 등 체험/기간 표현이 0개인가?
□ 본문에 "써봤/써본/2주/한 달/테스트/직접/경험/받자마자/가족 반응" 계열 문구가 0개인가?
□ 입력(제품명/스펙/가격)에 없는 사실(수치/기간/비교/가족/지인)을 추가하지 않았는가?
□ 선택한 Type 구조의 🟥 체험 의존 단계(언박싱/실사용 찐후기/사용 변화/검증 테스트/핵심 경험/아쉬운 점의 체험형 버전 등)를 모두 생략했는가?
□ 카테고리에 맞지 않는 어휘(의류-배터리, 식품-AS 등)가 없는가?
□ 허용된 전환 장치 중 입력 데이터가 뒷받침하는 것만 사용했는가?
□ 억지로 채운 반복/장식 문장이 없는가?
□ 전문 리뷰어 톤이라면 "카테고리 제품 꽤 많이 써봤는데", "써본 사람만 아는 건데" 같은 체험 시그널 없는가?
═══════════════════════════════════════════════════════════
`.trim();
}
