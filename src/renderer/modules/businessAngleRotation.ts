// SPEC-STABILITY-2026 — business promo angle rotation.
//
// Same business published repeatedly produced same-frame posts (사용자 실측:
// "카테고리가 같은 맥락 홍보글로 즐비"). Rotate through 8 emphasis angles per
// business so every post leads with a different frame while all converge on
// 문의 전환. History persists per business name in localStorage; the picker
// is a pure function so the cycle is unit-testable.

export interface BusinessPromoAngle {
  id: string;
  label: string;
  directive: string;
}

export const BUSINESS_PROMO_ANGLES: ReadonlyArray<BusinessPromoAngle> = [
  { id: 'price', label: '가격·견적 기준', directive: '비용이 어떻게 결정되는지(기준·범위·확인 절차)를 중심으로 풀어라. 입력 정보에 없는 금액은 만들지 말고, 견적 문의로 자연 연결하라.' },
  { id: 'case', label: '사례·결과 중심', directive: '입력된 특징/경력과 수집 자료의 실제 사례·결과를 중심으로 신뢰를 쌓아라. 없는 사례를 지어내지 마라.' },
  { id: 'warranty', label: 'A/S·보증·사후관리', directive: '구매/계약 이후가 걱정인 독자를 향해 보증·지원·사후관리 조건을 중심으로 풀어라.' },
  { id: 'speed', label: '속도·일정·절차', directive: '문의부터 완료까지의 절차와 소요 기간을 단계별로 정리하라. 빠른 진행이 강점이면 그 근거를 보여라.' },
  { id: 'benefit', label: '혜택·이벤트·조건', directive: '지금 문의/구매 시 받는 실제 혜택과 조건을 중심으로 풀어라. 입력 정보에 있는 혜택만 사용하라.' },
  { id: 'expertise', label: '전문성·자격·차별점', directive: '왜 이 업체/상품이어야 하는지를 자격·경력·차별점 중심으로 증명하라.' },
  { id: 'faq', label: 'FAQ·의심 해소', directive: '문의 전 독자가 가장 많이 묻는 질문과 의심(가격? 조건? 환불? 환경?)을 직답으로 해소하는 구성으로 써라.' },
  { id: 'compare', label: '비교·선택 가이드', directive: '대안(직접 하기, 일반적 다른 방식)과 비교해 어떤 사람에게 맞는지 선택 기준을 제시하라. 특정 경쟁사 비방은 금지.' },
];

/** Pure picker: first angle not used in the recent window — full 8-cycle before repeats. */
export function pickNextBusinessAngle(history: ReadonlyArray<string>): BusinessPromoAngle {
  const windowSize = BUSINESS_PROMO_ANGLES.length - 1;
  const recent = history.slice(-windowSize);
  return BUSINESS_PROMO_ANGLES.find(a => !recent.includes(a.id)) || BUSINESS_PROMO_ANGLES[0];
}

/** Rotate + persist per-business history. Storage failure degrades to in-memory pick. */
export function rotateBusinessAngle(businessName: string): BusinessPromoAngle {
  const key = `businessAngleHistory_${String(businessName || 'default').trim()}`;
  let history: string[] = [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) history = parsed.filter(v => typeof v === 'string');
  } catch { /* corrupt history — restart cycle */ }

  const angle = pickNextBusinessAngle(history);
  try {
    localStorage.setItem(key, JSON.stringify([...history, angle.id].slice(-16)));
  } catch { /* quota — rotation still proceeds for this run */ }
  return angle;
}

if (typeof window !== 'undefined') {
  (window as any).rotateBusinessAngle = rotateBusinessAngle;
  console.log('[BusinessAngleRotation] 📦 모듈 로드됨!');
}
