/**
 * [v2.2.0 Starter Kit Phase 1 — AdsPost Optimization Engine]
 *
 * 네이버 애드포스트 CPM 최적화 엔진. 초보자 월 100만 달성의 1순위 레버.
 *
 * 배경: LDF 전체는 제휴 수익 전제로 설계됐지만, 초보자 실제 수익의 60~80%는
 *       **애드포스트 광고 노출료(CPM)**. 애드포스트는 본문 품질·광고 위치·
 *       체류시간·카테고리별 광고 단가에 따라 CPM이 ₩300~₩2,000까지 편차.
 *
 * 목표: 같은 방문 수에서 CPM을 1.5~2배 끌어올려 애드포스트 수익 증폭.
 *
 * 핵심 레버 4개:
 *  1. 광고 단가 높은 카테고리 키워드 주입 (Keyword Premium)
 *  2. 본문 길이·체류시간 최적화 (1,500~2,500자 스위트 스팟)
 *  3. 광고 노출 기회 극대화 (본문 중간 광고 공간 확보)
 *  4. 저CPM 카테고리 회피 (엔터·연예 광고 단가 낮음)
 */

import type { CTRCategory } from './ctrCombat.js';

// ═══════════════════════════════════════════════════════════════════
// 1. 카테고리별 애드포스트 CPM 벤치마크 (네이버 실측 경험값, 원)
// ═══════════════════════════════════════════════════════════════════

export interface AdsPostCPM {
  avgCPM: number;              // 평균 CPM (1000 노출당 수익, 원)
  topCPM: number;              // 상위 10% CPM
  advertiserDensity: 'high' | 'medium' | 'low';  // 광고주 경쟁 강도
  seasonalBonus: number;       // 성수기 계수 (1.0~1.5)
  notes: string;
}

export const CATEGORY_CPM: Record<CTRCategory, AdsPostCPM> = {
  finance: {
    avgCPM: 2500,
    topCPM: 5000,
    advertiserDensity: 'high',
    seasonalBonus: 1.2,         // 연말정산·연초 피크
    notes: '금융·보험·카드 광고 단가 최고. 전문성 요구 엄격.',
  },
  health: {
    avgCPM: 1500,
    topCPM: 3500,
    advertiserDensity: 'high',
    seasonalBonus: 1.1,
    notes: '건강기능식품·의료 광고 단가 높음. 과장 표현 주의.',
  },
  tech: {
    avgCPM: 1200,
    topCPM: 2800,
    advertiserDensity: 'medium',
    seasonalBonus: 1.0,
    notes: '신제품 출시 시즌 급등. 평시엔 중간 수준.',
  },
  beauty: {
    avgCPM: 1100,
    topCPM: 2500,
    advertiserDensity: 'high',
    seasonalBonus: 1.3,         // 봄·가을 신제품 러시
    notes: '화장품·뷰티 광고 풍부. 반복 광고 노출 유리.',
  },
  travel: {
    avgCPM: 900,
    topCPM: 2200,
    advertiserDensity: 'medium',
    seasonalBonus: 1.5,         // 여름·겨울 성수기
    notes: '성수기 편차 큼. 항공·호텔·투어 광고 집중.',
  },
  parenting: {
    avgCPM: 850,
    topCPM: 2000,
    advertiserDensity: 'medium',
    seasonalBonus: 1.0,
    notes: '육아용품·교육 광고. 안정적 수요.',
  },
  food: {
    avgCPM: 500,
    topCPM: 1500,
    advertiserDensity: 'medium',
    seasonalBonus: 1.0,
    notes: '배달·식품 광고. 트래픽 높지만 단가 낮음.',
  },
  lifestyle: {
    avgCPM: 450,
    topCPM: 1200,
    advertiserDensity: 'low',
    seasonalBonus: 1.0,
    notes: '광범위하나 전문성 부족. 단가 낮은 편.',
  },
  entertainment: {
    avgCPM: 300,
    topCPM: 800,
    advertiserDensity: 'low',
    seasonalBonus: 1.0,
    notes: '트래픽 최고지만 CPM 최하. 애드포스트 수익성 나쁨.',
  },
  general: {
    avgCPM: 600,
    topCPM: 1500,
    advertiserDensity: 'medium',
    seasonalBonus: 1.0,
    notes: '평균치.',
  },
};

// ═══════════════════════════════════════════════════════════════════
// 2. CPM 증폭 키워드 사전 (본문에 자연 주입 시 단가 상승)
// ═══════════════════════════════════════════════════════════════════

export const CPM_PREMIUM_KEYWORDS: Record<CTRCategory, string[]> = {
  finance: ['신용대출', '전세자금', '주식투자', '펀드', '보험가입', '세금공제', '재테크', '부동산투자', '연금저축', '신용카드혜택'],
  health: ['건강검진', '영양제', '다이어트보조제', '비타민', '프로바이오틱스', '관절영양제', '혈압관리', '당뇨관리', '콜라겐', '홍삼'],
  tech: ['노트북추천', '스마트폰비교', '태블릿리뷰', '에어컨설치', 'TV구매', '청소기비교', '가전제품', '건조기', '식기세척기', '공기청정기'],
  beauty: ['화장품추천', '스킨케어', '앰플', '에센스', '자외선차단제', '클렌징', '탈모케어', '다이어트', '네일케어', '향수'],
  travel: ['제주도숙소', '해외여행', '항공권예약', '호텔추천', '패키지여행', '투어예약', '렌터카', '여행자보험', '캠핑장', '글램핑'],
  parenting: ['유아용품', '아기띠', '분유추천', '이유식', '어린이영어', '유치원', '학습지', '어린이보험', '가족여행', '육아템'],
  food: ['배달음식', '밀키트', '반찬정기', '간편식', '다이어트식단', '고기구이', '맛집추천', '카페디저트', '홈술', '수제맥주'],
  lifestyle: ['인테리어', '홈데코', '가구추천', '이사준비', '청소용품', '세탁세제', '주방용품', '수납정리', '홈카페', '반려용품'],
  entertainment: ['넷플릭스추천', '영화리뷰', '드라마정리', 'OTT비교', '게임추천'],
  general: ['후기', '추천', '비교', '리뷰', '정리'],
};

/**
 * [v2.2.0] 카테고리 기반 CPM 프리미엄 키워드 샘플 추출 (본문 주입용)
 * 매번 3~5개 랜덤 선택으로 반복 패턴 회피
 */
export function samplePremiumKeywords(category: CTRCategory, count: number = 4): string[] {
  const pool = CPM_PREMIUM_KEYWORDS[category] || CPM_PREMIUM_KEYWORDS.general;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, pool.length));
}

// ═══════════════════════════════════════════════════════════════════
// 3. 본문 길이 최적 스위트 스팟
// ═══════════════════════════════════════════════════════════════════

export interface LengthOptimization {
  targetMin: number;           // 최소 글자수
  targetMax: number;           // 최대 글자수
  adSlotsExpected: number;     // 예상 애드포스트 자동 광고 슬롯 수
  cpmMultiplier: number;       // CPM 배수 (기준 1.0)
  reasoning: string;
}

/**
 * 네이버 애드포스트는 본문 길이에 비례해 광고 슬롯 자동 삽입.
 * 하지만 2,500자 초과 시 체류시간 하락 → CPM 역효과.
 * 스위트 스팟: 1,800~2,200자
 */
export function getLengthOptimization(category: CTRCategory): LengthOptimization {
  const base: LengthOptimization = {
    targetMin: 1800,
    targetMax: 2200,
    adSlotsExpected: 3,
    cpmMultiplier: 1.0,
    reasoning: '표준 길이 — 광고 슬롯 3개 확보 + 체류시간 균형',
  };

  // 카테고리별 조정
  if (category === 'finance' || category === 'health') {
    return {
      ...base,
      targetMin: 2200,
      targetMax: 2800,
      adSlotsExpected: 4,
      cpmMultiplier: 1.2,
      reasoning: '고단가 카테고리 — 전문성 길이 + 광고 슬롯 4개',
    };
  }
  if (category === 'entertainment' || category === 'food') {
    return {
      ...base,
      targetMin: 1500,
      targetMax: 1900,
      adSlotsExpected: 2,
      cpmMultiplier: 0.9,
      reasoning: '박리다매 카테고리 — 짧고 빠른 소비 최적화',
    };
  }
  return base;
}

// ═══════════════════════════════════════════════════════════════════
// 4. 광고 친화도 스코어 (본문 분석)
// ═══════════════════════════════════════════════════════════════════

export interface AdFriendlinessScore {
  score: number;               // 0-100
  estimatedCPMMultiplier: number;  // 추정 CPM 배수 (0.5~2.0)
  issues: string[];
  improvements: string[];
}

/**
 * [v2.2.0] 본문 텍스트 기반 애드포스트 친화도 분석
 * 높을수록 광고주 입찰 경쟁 + CPM 상승
 */
export function scoreAdFriendliness(content: string, category: CTRCategory): AdFriendlinessScore {
  const issues: string[] = [];
  const improvements: string[] = [];
  let score = 50; // 기준 50점

  // 1. 길이 체크
  const opt = getLengthOptimization(category);
  const len = content.length;
  if (len >= opt.targetMin && len <= opt.targetMax) {
    score += 15;
  } else if (len < opt.targetMin) {
    score -= 10;
    issues.push(`본문이 ${len}자로 짧음 (권장 ${opt.targetMin}~${opt.targetMax}자)`);
    improvements.push(`본문 ${opt.targetMin - len}자 추가 → 광고 슬롯 1개 더 확보`);
  } else if (len > opt.targetMax + 300) {
    score -= 5;
    issues.push(`본문이 ${len}자로 지나치게 김 (체류시간 하락 위험)`);
  }

  // 2. 프리미엄 키워드 매칭
  const premiumKws = CPM_PREMIUM_KEYWORDS[category] || [];
  const matched = premiumKws.filter(kw => content.includes(kw));
  if (matched.length >= 3) {
    score += 15;
  } else if (matched.length >= 1) {
    score += 7;
  } else {
    issues.push('CPM 프리미엄 키워드 미포함');
    improvements.push(`${category} 프리미엄 키워드 2~3개 자연 주입 (예: ${premiumKws.slice(0, 3).join(', ')})`);
  }

  // 3. 광고 적대적 키워드 감지 (정치·자극·선정)
  const adHostile = ['정치', '대선', '북한', '사이비', '도박', '성인', '자살', '약물', '폭력'];
  const hostileHits = adHostile.filter(w => content.includes(w));
  if (hostileHits.length > 0) {
    score -= 30;
    issues.push(`광고 적대 키워드 감지: ${hostileHits.join(', ')} (광고주 기피)`);
    improvements.push('해당 주제 제거 또는 완화 필요');
  }

  // 4. 구조화 품질 (H2·H3 헤딩, 리스트)
  const headingCount = (content.match(/#{2,3}\s/g) || []).length;
  const listCount = (content.match(/^[\s]*[-*•]\s/gm) || []).length;
  if (headingCount >= 3) score += 10;
  else improvements.push('H2 헤딩 3개 이상으로 구조화 → 애드포스트 자동 광고 배치 최적화');
  if (listCount >= 3) score += 5;

  // 5. 이미지 수 (텍스트 중간 광고 슬롯 확보)
  const imgCount = (content.match(/!\[.*?\]\(.*?\)|<img/g) || []).length;
  if (imgCount >= 3) score += 10;
  else improvements.push('이미지 3장 이상 → 본문 중간 광고 슬롯 확보');

  score = Math.max(0, Math.min(100, score));
  const estimatedCPMMultiplier = 0.5 + (score / 100) * 1.5; // 50점=1.25배, 100점=2.0배

  return {
    score,
    estimatedCPMMultiplier: Math.round(estimatedCPMMultiplier * 100) / 100,
    issues,
    improvements,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 5. 월 수익 시뮬레이션 (애드포스트 중심)
// ═══════════════════════════════════════════════════════════════════

export interface AdsPostProjection {
  monthlyVisits: number;
  estimatedImpressionsPerVisit: number;  // 방문당 평균 광고 노출
  monthlyImpressions: number;
  effectiveCPM: number;                   // 최종 CPM (베이스 × 승수 × 시즌)
  monthlyRevenue: number;
  targetGap: number;                      // 월 목표 대비 (+/-)
  advice: string[];
}

/**
 * [v2.2.0] 월 100만 애드포스트 시뮬레이션
 */
export function projectAdsPostRevenue(config: {
  monthlyVisits: number;
  category: CTRCategory;
  adFriendlinessScore: number;    // scoreAdFriendliness 결과 점수
  targetMonthlyRevenue: number;   // 목표 월 수익 (기본 ₩1,000,000)
}): AdsPostProjection {
  const cpm = CATEGORY_CPM[config.category];
  const lengthOpt = getLengthOptimization(config.category);

  // 방문당 평균 광고 노출 = 광고 슬롯 수 × 실제 노출률 0.7
  const impressionsPerVisit = lengthOpt.adSlotsExpected * 0.7;
  const monthlyImpressions = config.monthlyVisits * impressionsPerVisit;

  // 친화도 승수
  const friendlinessMultiplier = 0.5 + (config.adFriendlinessScore / 100) * 1.5;

  // 최종 CPM
  const effectiveCPM = cpm.avgCPM * friendlinessMultiplier * cpm.seasonalBonus;

  // 월 수익
  const monthlyRevenue = Math.round((monthlyImpressions / 1000) * effectiveCPM);
  const targetGap = monthlyRevenue - config.targetMonthlyRevenue;

  const advice: string[] = [];
  if (targetGap < 0) {
    const deficitPct = Math.abs(targetGap / config.targetMonthlyRevenue) * 100;
    advice.push(`월 ${deficitPct.toFixed(0)}% 부족 (₩${Math.abs(targetGap).toLocaleString()} 추가 필요)`);

    // 구체 조언
    const neededVisits = Math.ceil(config.targetMonthlyRevenue / (effectiveCPM * impressionsPerVisit / 1000));
    const neededMultiplier = config.targetMonthlyRevenue / monthlyRevenue;
    if (neededMultiplier <= 2) {
      advice.push(`방문 ${(neededMultiplier * 100 - 100).toFixed(0)}% 증가 필요 (현재 ${config.monthlyVisits.toLocaleString()}명 → ${neededVisits.toLocaleString()}명)`);
    } else {
      advice.push(`방문만으로 부족 — 카테고리 전환 권장 (현재 ${config.category} CPM ₩${cpm.avgCPM} → finance/health CPM ₩1,500~2,500)`);
    }

    if (config.adFriendlinessScore < 70) {
      advice.push(`광고 친화도 ${config.adFriendlinessScore}점 → 80점+ 개선 (본문 길이·프리미엄 키워드·이미지 3장+)`);
    }
  } else {
    advice.push(`월 목표 초과 달성 가능. ${(targetGap / config.targetMonthlyRevenue * 100).toFixed(0)}% 여유`);
  }

  return {
    monthlyVisits: config.monthlyVisits,
    estimatedImpressionsPerVisit: Math.round(impressionsPerVisit * 10) / 10,
    monthlyImpressions: Math.round(monthlyImpressions),
    effectiveCPM: Math.round(effectiveCPM),
    monthlyRevenue,
    targetGap,
    advice,
  };
}

/**
 * [v2.2.0] 카테고리별 월 100만 달성 최소 방문 수 역산
 */
export function requiredVisitsForTarget(
  category: CTRCategory,
  adFriendlinessScore: number = 70,
  targetMonthlyRevenue: number = 1_000_000,
): { minMonthlyVisits: number; minDailyVisits: number; feasibility: string } {
  const cpm = CATEGORY_CPM[category];
  const lengthOpt = getLengthOptimization(category);
  const impressionsPerVisit = lengthOpt.adSlotsExpected * 0.7;
  const friendlinessMultiplier = 0.5 + (adFriendlinessScore / 100) * 1.5;
  const effectiveCPM = cpm.avgCPM * friendlinessMultiplier * cpm.seasonalBonus;

  const minMonthlyVisits = Math.ceil(targetMonthlyRevenue / (effectiveCPM * impressionsPerVisit / 1000));
  const minDailyVisits = Math.ceil(minMonthlyVisits / 30);

  let feasibility: string;
  if (minDailyVisits <= 500) feasibility = '매우 쉬움 (초보자도 2~3개월 가능)';
  else if (minDailyVisits <= 1500) feasibility = '도달 가능 (3~6개월 꾸준 운영)';
  else if (minDailyVisits <= 5000) feasibility = '어려움 (6~12개월 또는 전문성 필요)';
  else feasibility = '매우 어려움 (카테고리 전환 권장)';

  return { minMonthlyVisits, minDailyVisits, feasibility };
}
