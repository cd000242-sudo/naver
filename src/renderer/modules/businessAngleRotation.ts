// SPEC-STABILITY-2026 — business promo angle rotation.
//
// Same business published repeatedly produced same-frame posts (사용자 실측:
// "카테고리가 같은 맥락 홍보글로 즐비"). Rotate through 8 emphasis angles per
// business so every post leads with a different frame while all converge on
// 문의 전환. History persists per business name in localStorage; the picker
// is a pure function so the cycle is unit-testable.
//
// [2026-11-05] Industry filter: medical ads may not show case/result, price or
// inducement frames; professionals may not show case/benefit; shops have no A/S.
// Every directive is gated on "입력에 있을 때만" so a thin input never invents a fact.

import { excludedBusinessAngleIds, resolveBusinessIndustry } from '../../content/businessIndustryDetector.js';

export interface BusinessPromoAngle {
  id: string;
  label: string;
  directive: string;
}

export const BUSINESS_PROMO_ANGLES: ReadonlyArray<BusinessPromoAngle> = [
  { id: 'price', label: '가격·견적 기준', directive: '비용이 어떻게 결정되는지(기준·범위·확인 절차)를 중심으로 풀어라. 금액은 입력에 있을 때만 그 값 그대로 쓰고, 없으면 견적이 갈리는 조건과 문의 때 물을 것으로 답하라.' },
  { id: 'case', label: '사례·결과 중심', directive: '입력된 특징/경력과 수집 자료의 실제 사례·결과는 입력에 있을 때만 근거로 써라. 없으면 진행 순서와 확인 항목으로 대신하고, 사례를 지어내지 마라.' },
  { id: 'warranty', label: 'A/S·보증·사후관리', directive: '구매/계약 이후가 걱정인 독자를 향해 보증·지원·사후관리 조건을 중심으로 풀어라. 조건은 입력에 있을 때만 쓰고, 없으면 문의 때 확인할 항목으로 안내하라.' },
  { id: 'speed', label: '속도·일정·절차', directive: '문의부터 완료까지의 절차와 소요 기간을 단계별로 정리하라. 절차와 기간은 입력에 있을 때만 업체 방식으로 쓰고, 없으면 일반적인 순서로 안내하라. 빠른 진행은 입력에 근거가 있을 때만 강점으로 써라.' },
  { id: 'benefit', label: '혜택·이벤트·조건', directive: '지금 문의/구매 시 받는 혜택과 조건을 중심으로 풀어라. 혜택은 입력에 있을 때만 쓰고, 없으면 이 각도 대신 문의 전 확인할 조건으로 풀어라.' },
  { id: 'expertise', label: '전문성·자격·차별점', directive: '자격·경력·차별점은 입력에 있을 때만 근거로 쓰고, 그 사실이 고객에게 무엇을 바꾸는지로 이어라. 입력이 없으면 작업 기준과 점검 포인트를 설명하라.' },
  { id: 'faq', label: 'FAQ·의심 해소', directive: '문의 전 독자가 가장 많이 묻는 질문(가격? 조건? 환불? 환경?)을 첫 문장 직답으로 해소하라. 질문은 입력된 자주 묻는 것과 수집된 질문에서 고르고, 업체 사실은 입력에 있을 때만 답에 써라.' },
  { id: 'compare', label: '비교·선택 가이드', directive: '직접 하기나 다른 방식 같은 대안과 견주어 어떤 사람에게 맞는지, 어떤 경우에 다른 선택이 나은지 기준을 제시하라. 업체 사실은 입력에 있을 때만 쓰고, 특정 업체를 지목하지 마라.' },
];

/** Pure picker: first angle not used in the recent window — full cycle of the allowed pool before repeats. */
export function pickNextBusinessAngle(
  history: ReadonlyArray<string>,
  excludedIds: ReadonlyArray<string> = [],
): BusinessPromoAngle {
  const pool = BUSINESS_PROMO_ANGLES.filter(a => !excludedIds.includes(a.id));
  const allowed = pool.length > 0 ? pool : BUSINESS_PROMO_ANGLES;
  const recent = history.slice(-(allowed.length - 1));
  return allowed.find(a => !recent.includes(a.id)) || allowed[0];
}

export interface BusinessAngleInfoHint {
  industry?: unknown;
  name?: unknown;
  extra?: unknown;
}

/** Rotate + persist per-business history. Storage failure degrades to in-memory pick. */
export function rotateBusinessAngle(
  businessName: string,
  info?: BusinessAngleInfoHint,
  extraText?: string,
): BusinessPromoAngle {
  const key = `businessAngleHistory_${String(businessName || 'default').trim()}`;
  let history: string[] = [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) history = parsed.filter(v => typeof v === 'string');
  } catch { /* corrupt history — restart cycle */ }

  const industry = resolveBusinessIndustry(info?.industry, businessName, info?.extra, extraText);
  const angle = pickNextBusinessAngle(history, excludedBusinessAngleIds(industry));
  try {
    localStorage.setItem(key, JSON.stringify([...history, angle.id].slice(-16)));
  } catch { /* quota — rotation still proceeds for this run */ }
  return angle;
}

if (typeof window !== 'undefined') {
  (window as any).rotateBusinessAngle = rotateBusinessAngle;
  console.log('[BusinessAngleRotation] 📦 모듈 로드됨!');
}
