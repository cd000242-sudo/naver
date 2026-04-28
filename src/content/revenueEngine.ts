/**
 * [v1.9.0 LDF Phase 5 — L0/L1 Business Model + Revenue Funnel]
 *
 * 수익 동선 설계 엔진. "일 100만원 수익 증명"을 위한 역산·모델링·귀속 레이어.
 *
 * 지금까지 L2(CTR)·L3(스케줄)·L4(정체성)·L5(관계)는 "어떻게 상위 노출할지"의
 * 공급 쪽 엔진이었다면, 본 모듈은 **"어떻게 돈으로 변환할지"**의 수요 쪽 엔진.
 *
 * 구성:
 *  1. Business Model Canvas — 목표 수익 역산 시뮬레이터
 *  2. 카테고리 수익성 DB — 9개 카테고리 × 수익 구조 매트릭스
 *  3. 키워드 수익성 점수 — 검색량 × CPC × 전환율 3축
 *  4. 제휴 상품 매칭 — 카테고리 × 계절 × 제휴사
 *  5. CTA 배치 전략 — 본문 3구간 가중치
 *  6. 비용 모델 — 이미지·텍스트·프록시·API 합산
 *  7. 손익 시뮬레이터 — 월 수익 - 월 비용 = 순이익
 */

import type { CTRCategory } from './ctrCombat.js';

// ═══════════════════════════════════════════════════════════════════
// 1. Business Model Canvas — 목표 역산
// ═══════════════════════════════════════════════════════════════════

export interface BusinessGoal {
  dailyRevenueTarget: number;    // 목표 일 수익 (원)
  accountCount: number;           // 보유 계정 수
  postsPerAccountPerDay: number;  // 계정당 일 포스팅 수
  avgCTR: number;                 // 평균 CTR (홈판 노출 → 클릭, %)
  avgCVR: number;                 // 평균 CVR (클릭 → 구매, %)
  avgCommission: number;          // 건당 평균 수수료 (원)
}

export interface BusinessFeasibility {
  dailyPosts: number;
  estimatedImpressions: number;
  estimatedClicks: number;
  estimatedConversions: number;
  estimatedRevenue: number;
  targetRevenue: number;
  feasibilityGap: number;          // 목표 대비 갭 (원, 음수=부족)
  recommendations: string[];
}

/**
 * [v1.9.0] 목표 수익 달성 가능성 역산
 * 입력값 기반으로 실제 도달 가능한 수익 시뮬레이션
 */
export function simulateBusinessFeasibility(goal: BusinessGoal): BusinessFeasibility {
  const dailyPosts = goal.accountCount * goal.postsPerAccountPerDay;
  // 홈판 노출률 가정: 계정 성숙도 평균 기준 포스팅당 평균 500~2000 노출
  const avgImpressionsPerPost = 1000;
  const estimatedImpressions = dailyPosts * avgImpressionsPerPost;
  const estimatedClicks = estimatedImpressions * (goal.avgCTR / 100);
  const estimatedConversions = estimatedClicks * (goal.avgCVR / 100);
  const estimatedRevenue = estimatedConversions * goal.avgCommission;
  const feasibilityGap = estimatedRevenue - goal.dailyRevenueTarget;

  const recommendations: string[] = [];
  if (feasibilityGap < 0) {
    const deficitPct = Math.abs(feasibilityGap / goal.dailyRevenueTarget) * 100;
    recommendations.push(`목표 달성까지 ${deficitPct.toFixed(0)}% 부족`);
    if (goal.accountCount < 10) {
      recommendations.push(`계정 수를 ${goal.accountCount} → ${Math.ceil(goal.accountCount * 1.5)}개로 확장 권장`);
    }
    if (goal.postsPerAccountPerDay < 3) {
      recommendations.push(`계정당 포스팅을 ${goal.postsPerAccountPerDay} → 3~5개/일로 증가 권장`);
    }
    if (goal.avgCTR < 4) {
      recommendations.push(`CTR ${goal.avgCTR}% → 5%+ 개선: 제목 골든존·썸네일 4축 공식 재점검`);
    }
    if (goal.avgCVR < 2) {
      recommendations.push(`CVR ${goal.avgCVR}% → 3%+ 개선: 카테고리 고수익군 전환 고려`);
    }
    if (goal.avgCommission < 3000) {
      recommendations.push(`수수료 평균 ₩${goal.avgCommission} → 건강·금융 고단가 카테고리 비중 증가`);
    }
  } else {
    recommendations.push(`목표 초과 달성 가능. 여유 ${(feasibilityGap / goal.dailyRevenueTarget * 100).toFixed(0)}%`);
  }

  return {
    dailyPosts,
    estimatedImpressions: Math.round(estimatedImpressions),
    estimatedClicks: Math.round(estimatedClicks),
    estimatedConversions: Math.round(estimatedConversions * 10) / 10,
    estimatedRevenue: Math.round(estimatedRevenue),
    targetRevenue: goal.dailyRevenueTarget,
    feasibilityGap: Math.round(feasibilityGap),
    recommendations,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 2. 카테고리 수익성 DB
// ═══════════════════════════════════════════════════════════════════

export interface CategoryEconomics {
  type: '박리다매' | '고수익소량' | '중수익균형' | '누적형';
  avgCPC: number;                // 평균 CPC (광고주 입찰가, 원)
  avgCommission: number;          // 건당 수수료 (원)
  avgConversionRate: number;      // 기대 전환율 (%)
  competitionLevel: 'low' | 'medium' | 'high';
  monthlyCeiling: number;         // 단일 계정 월 수익 상한 추정 (원)
  notes: string;
}

export const CATEGORY_ECONOMICS: Record<CTRCategory, CategoryEconomics> = {
  food: {
    type: '박리다매',
    avgCPC: 350,
    avgCommission: 2800,
    avgConversionRate: 2.3,
    competitionLevel: 'high',
    monthlyCeiling: 2_000_000,
    notes: '트래픽 높음, 광고 단가 낮음. 배달·프랜차이즈 제휴 유리.',
  },
  parenting: {
    type: '중수익균형',
    avgCPC: 650,
    avgCommission: 4500,
    avgConversionRate: 3.1,
    competitionLevel: 'medium',
    monthlyCeiling: 5_000_000,
    notes: '엄마 구매력 높음, 재방문·재구매 강함. 육아용품·교육 제휴.',
  },
  beauty: {
    type: '누적형',
    avgCPC: 800,
    avgCommission: 5500,
    avgConversionRate: 3.8,
    competitionLevel: 'high',
    monthlyCeiling: 6_000_000,
    notes: '반복 구매 강함, 리뷰 누적이 자산. 브랜드 협찬도 큼.',
  },
  health: {
    type: '고수익소량',
    avgCPC: 1200,
    avgCommission: 12000,
    avgConversionRate: 2.8,
    competitionLevel: 'high',
    monthlyCeiling: 10_000_000,
    notes: '건강기능식품·의료기기 CPA 높음. 전문성 앵커 필수.',
  },
  travel: {
    type: '중수익균형',
    avgCPC: 500,
    avgCommission: 6000,
    avgConversionRate: 2.5,
    competitionLevel: 'medium',
    monthlyCeiling: 4_000_000,
    notes: '계절 편차 큼. 성수기(여름·겨울) 집중 발행 전략.',
  },
  tech: {
    type: '중수익균형',
    avgCPC: 700,
    avgCommission: 8000,
    avgConversionRate: 1.8,
    competitionLevel: 'medium',
    monthlyCeiling: 5_000_000,
    notes: '객단가 높음, 전환율 낮음. 신제품 출시 타이밍 중요.',
  },
  lifestyle: {
    type: '누적형',
    avgCPC: 450,
    avgCommission: 3500,
    avgConversionRate: 2.8,
    competitionLevel: 'medium',
    monthlyCeiling: 3_000_000,
    notes: '이웃 관계 누적형. 홈데코·생활용품 중저가 반복 구매.',
  },
  entertainment: {
    type: '박리다매',
    avgCPC: 280,
    avgCommission: 1800,
    avgConversionRate: 1.5,
    competitionLevel: 'high',
    monthlyCeiling: 1_500_000,
    notes: '트래픽 매우 높음, 수익화 어려움. 광고 수익 위주.',
  },
  finance: {
    type: '고수익소량',
    avgCPC: 2500,
    avgCommission: 20000,
    avgConversionRate: 1.2,
    competitionLevel: 'high',
    monthlyCeiling: 15_000_000,
    notes: '신용카드·대출·증권 CPA 최고. 규제·신뢰성 진입장벽 높음.',
  },
  general: {
    type: '중수익균형',
    avgCPC: 500,
    avgCommission: 3000,
    avgConversionRate: 2.0,
    competitionLevel: 'medium',
    monthlyCeiling: 2_000_000,
    notes: '기본값. 특화 없음.',
  },
};

/**
 * [v1.9.0] 목표 수익 기준 권장 카테고리 조합
 * 단일 카테고리로 월 ₩3,000만(일 100만)은 건강/금융 외에는 힘듦.
 * → 고수익 + 누적형 혼합 전략 권장
 */
export function recommendCategoryPortfolio(monthlyTarget: number): {
  primary: CTRCategory;
  secondary: CTRCategory;
  rationale: string;
  expectedShare: { primary: number; secondary: number };
} {
  if (monthlyTarget >= 20_000_000) {
    return {
      primary: 'finance',
      secondary: 'health',
      rationale: '월 2,000만원+ 목표는 고단가 카테고리(금융·건강) 필수. 금융 60% + 건강 40%.',
      expectedShare: { primary: 0.6, secondary: 0.4 },
    };
  }
  if (monthlyTarget >= 10_000_000) {
    return {
      primary: 'health',
      secondary: 'beauty',
      rationale: '월 1,000만원대 목표는 건강+뷰티 조합 유리. 건강 70% + 뷰티 30%.',
      expectedShare: { primary: 0.7, secondary: 0.3 },
    };
  }
  if (monthlyTarget >= 5_000_000) {
    return {
      primary: 'beauty',
      secondary: 'parenting',
      rationale: '월 500만원대는 뷰티 누적 + 육아 재구매 강세 조합. 뷰티 60% + 육아 40%.',
      expectedShare: { primary: 0.6, secondary: 0.4 },
    };
  }
  return {
    primary: 'parenting',
    secondary: 'lifestyle',
    rationale: '월 500만원 미만은 육아+라이프 진입 장벽 낮은 조합. 80% + 20%.',
    expectedShare: { primary: 0.8, secondary: 0.2 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// 3. 키워드 수익성 점수
// ═══════════════════════════════════════════════════════════════════

export interface KeywordMetrics {
  keyword: string;
  monthlySearchVolume: number;    // 월 검색량
  documentCount?: number;          // 네이버 문서수 (경쟁)
  estimatedCPC?: number;           // 추정 CPC (원)
  competitionScore?: number;       // 0-100
}

export interface KeywordProfitability {
  keyword: string;
  score: number;                   // 0-100
  tier: 'gold' | 'silver' | 'bronze' | 'avoid';
  expectedMonthlyRevenue: number;  // 포스팅 1건 기준 월 수익 추정
  reasoning: string;
}

/**
 * [v1.9.0] 키워드 수익성 3축 점수화 (검색량 × CPC × 경쟁도)
 */
export function scoreKeywordProfitability(
  km: KeywordMetrics,
  categoryEco: CategoryEconomics,
): KeywordProfitability {
  let score = 0;
  const reasons: string[] = [];

  // 검색량 점수 (0-40)
  if (km.monthlySearchVolume >= 50000) {
    score += 40;
    reasons.push('검색량 매우 높음');
  } else if (km.monthlySearchVolume >= 10000) {
    score += 30;
    reasons.push('검색량 높음');
  } else if (km.monthlySearchVolume >= 3000) {
    score += 20;
    reasons.push('검색량 중간');
  } else if (km.monthlySearchVolume >= 1000) {
    score += 10;
    reasons.push('검색량 낮음');
  } else {
    reasons.push('검색량 매우 낮음');
  }

  // CPC 점수 (0-30)
  const cpc = km.estimatedCPC || categoryEco.avgCPC;
  if (cpc >= 1500) {
    score += 30;
    reasons.push(`CPC 최상(₩${cpc})`);
  } else if (cpc >= 800) {
    score += 20;
    reasons.push(`CPC 상(₩${cpc})`);
  } else if (cpc >= 400) {
    score += 10;
    reasons.push(`CPC 중(₩${cpc})`);
  }

  // 경쟁도 (역점수, 경쟁 낮을수록 +)
  const docCount = km.documentCount || 0;
  const compScore = km.competitionScore;
  if (typeof compScore === 'number') {
    if (compScore < 30) {
      score += 30;
      reasons.push('경쟁 낮음');
    } else if (compScore < 60) {
      score += 15;
      reasons.push('경쟁 중간');
    } else {
      reasons.push('경쟁 높음');
    }
  } else if (docCount > 0) {
    const ratio = km.monthlySearchVolume / docCount;
    if (ratio >= 3) {
      score += 30;
      reasons.push(`수요/공급 비율 우수(${ratio.toFixed(1)})`);
    } else if (ratio >= 1) {
      score += 15;
      reasons.push(`수요/공급 비율 중간(${ratio.toFixed(1)})`);
    }
  }

  // 티어 결정
  let tier: KeywordProfitability['tier'];
  if (score >= 80) tier = 'gold';
  else if (score >= 60) tier = 'silver';
  else if (score >= 40) tier = 'bronze';
  else tier = 'avoid';

  // 월 수익 추정
  const expectedClicks = km.monthlySearchVolume * 0.1;  // 상위 노출 기준 검색량의 10% 유입
  const expectedMonthlyRevenue = Math.round(
    expectedClicks * (categoryEco.avgConversionRate / 100) * categoryEco.avgCommission,
  );

  return {
    keyword: km.keyword,
    score: Math.max(0, Math.min(100, score)),
    tier,
    expectedMonthlyRevenue,
    reasoning: reasons.join(' | '),
  };
}

// ═══════════════════════════════════════════════════════════════════
// 4. CTA 배치 전략
// ═══════════════════════════════════════════════════════════════════

export interface CTAPlacement {
  section: 'intro' | 'middle' | 'outro';
  weight: number;                  // 전환 기여도 (%)
  style: string;                   // CTA 말투 스타일
  example: string;
}

/**
 * [v1.9.0] 본문 CTA 배치 전략 — 3구간 가중치 배분
 * 홈판 독자는 중반 이탈 많음 → 중반 가중치 가장 크게
 */
export const CTA_PLACEMENT_STRATEGY: CTAPlacement[] = [
  {
    section: 'intro',
    weight: 15,
    style: '암시형 (직접 구매 유도 X, 호기심 유발)',
    example: '이 제품 궁금하신 분들 계속 읽어보세요',
  },
  {
    section: 'middle',
    weight: 45,
    style: '경험담 연결형 (자연스러운 링크 노출)',
    example: '제가 써본 제품은 여기서 구매했어요. ⬇️ [링크]',
  },
  {
    section: 'outro',
    weight: 40,
    style: '요약 + 추천형 (의사결정 직전)',
    example: '관심 있으신 분은 아래 링크 참고하세요 → [공식 구매처]',
  },
];

// ═══════════════════════════════════════════════════════════════════
// 5. 비용 모델
// ═══════════════════════════════════════════════════════════════════

export interface CostModel {
  monthlyContentGen: number;       // 텍스트 생성 API 비용
  monthlyImageGen: number;         // 이미지 생성 비용
  monthlyProxy: number;            // 프록시 구독
  monthlyElectricity: number;      // PC 전기·인터넷
  monthlyOther: number;            // 기타 (도메인·툴 등)
  total: number;
}

/**
 * [v1.9.0] 월 운영 비용 추정
 * 이미지 엔진 선택에 따라 크게 달라짐 (Flow 무료 vs 덕트테이프 유료)
 */
export function estimateMonthlyCosts(config: {
  dailyPosts: number;
  imageEngine: 'flow' | 'nano-banana-2' | 'duct-tape-med' | 'duct-tape-high';
  textProvider: 'gemini-flash' | 'claude-sonnet' | 'gpt-4' | 'claude-opus';
  accountCount: number;
}): CostModel {
  const monthlyPosts = config.dailyPosts * 30;

  // 이미지 비용 (포스팅당 7장 기준)
  const imageCostPerPost: Record<typeof config.imageEngine, number> = {
    'flow': 0,
    'nano-banana-2': 378,       // ₩54 × 7 (gemini-2.5-flash-image 정식 단가)
    'duct-tape-med': 539,        // ₩77 × 7
    'duct-tape-high': 1960,      // ₩280 × 7
  };
  const monthlyImageGen = monthlyPosts * imageCostPerPost[config.imageEngine];

  // 텍스트 비용 (포스팅당 토큰 평균 3000 in + 2000 out 가정)
  const textCostPerPost: Record<typeof config.textProvider, number> = {
    'gemini-flash': 50,
    'claude-sonnet': 400,
    'gpt-4': 600,
    'claude-opus': 1800,
  };
  const monthlyContentGen = monthlyPosts * textCostPerPost[config.textProvider];

  // 프록시 (계정당 월 ₩5,000 가정)
  const monthlyProxy = config.accountCount * 5000;

  // 기타 고정 비용
  const monthlyElectricity = 30000;
  const monthlyOther = 20000;

  const total = monthlyContentGen + monthlyImageGen + monthlyProxy + monthlyElectricity + monthlyOther;

  return {
    monthlyContentGen: Math.round(monthlyContentGen),
    monthlyImageGen: Math.round(monthlyImageGen),
    monthlyProxy,
    monthlyElectricity,
    monthlyOther,
    total: Math.round(total),
  };
}

// ═══════════════════════════════════════════════════════════════════
// 6. 손익 시뮬레이터
// ═══════════════════════════════════════════════════════════════════

export interface ProfitSimulation {
  monthlyRevenue: number;
  monthlyCost: number;
  netProfit: number;
  marginPct: number;
  breakEvenPosts: number;          // 손익분기 월 포스팅 수
  advice: string;
}

/**
 * [v1.9.0] 월 손익 시뮬레이션
 */
export function simulateMonthlyProfit(
  goal: BusinessGoal,
  costs: CostModel,
): ProfitSimulation {
  const feasibility = simulateBusinessFeasibility(goal);
  const monthlyRevenue = feasibility.estimatedRevenue * 30;
  const netProfit = monthlyRevenue - costs.total;
  const marginPct = monthlyRevenue > 0 ? (netProfit / monthlyRevenue) * 100 : 0;

  // 포스팅당 기여 수익
  const revenuePerPost = monthlyRevenue / (feasibility.dailyPosts * 30);
  const breakEvenPosts = revenuePerPost > 0 ? Math.ceil(costs.total / revenuePerPost) : -1;

  let advice: string;
  if (marginPct >= 80) {
    advice = '매우 건강한 마진. 현재 구조 유지하며 확장 검토.';
  } else if (marginPct >= 50) {
    advice = '양호한 마진. 이미지 엔진 단가 재검토로 추가 절감 여지.';
  } else if (marginPct >= 20) {
    advice = '마진 타이트. Flow 무료 전환 + 저가 텍스트 모델 혼용 권장.';
  } else if (marginPct >= 0) {
    advice = '손익분기 근처. 카테고리 고수익군 전환 필수.';
  } else {
    advice = '적자 구조. 근본 재설계 필요: 계정 수 확장 + 고단가 카테고리 + 무료 이미지 엔진.';
  }

  return {
    monthlyRevenue: Math.round(monthlyRevenue),
    monthlyCost: costs.total,
    netProfit: Math.round(netProfit),
    marginPct: Math.round(marginPct * 10) / 10,
    breakEvenPosts,
    advice,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 7. 종합 리포트 빌더
// ═══════════════════════════════════════════════════════════════════

export interface BusinessReport {
  goal: BusinessGoal;
  feasibility: BusinessFeasibility;
  portfolio: ReturnType<typeof recommendCategoryPortfolio>;
  primaryEco: CategoryEconomics;
  secondaryEco: CategoryEconomics;
  costs: CostModel;
  profit: ProfitSimulation;
  keyInsights: string[];
}

/**
 * [v1.9.0] 종합 비즈니스 리포트 생성 — 대시보드용 원데이터
 */
export function buildBusinessReport(
  goal: BusinessGoal,
  imageEngine: 'flow' | 'nano-banana-2' | 'duct-tape-med' | 'duct-tape-high' = 'flow',
  textProvider: 'gemini-flash' | 'claude-sonnet' | 'gpt-4' | 'claude-opus' = 'claude-sonnet',
): BusinessReport {
  const monthlyTarget = goal.dailyRevenueTarget * 30;
  const portfolio = recommendCategoryPortfolio(monthlyTarget);
  const primaryEco = CATEGORY_ECONOMICS[portfolio.primary];
  const secondaryEco = CATEGORY_ECONOMICS[portfolio.secondary];
  const feasibility = simulateBusinessFeasibility(goal);
  const costs = estimateMonthlyCosts({
    dailyPosts: feasibility.dailyPosts,
    imageEngine,
    textProvider,
    accountCount: goal.accountCount,
  });
  const profit = simulateMonthlyProfit(goal, costs);

  const keyInsights: string[] = [];
  keyInsights.push(
    `월 목표 ₩${(monthlyTarget / 10000).toLocaleString()}만 → 권장 카테고리: ${portfolio.primary} ${portfolio.expectedShare.primary * 100}% + ${portfolio.secondary} ${portfolio.expectedShare.secondary * 100}%`,
  );
  keyInsights.push(
    `일 발행 ${feasibility.dailyPosts}개 → 예상 수익 ₩${feasibility.estimatedRevenue.toLocaleString()}/일 (목표 ${feasibility.feasibilityGap >= 0 ? '달성 가능' : `₩${Math.abs(feasibility.feasibilityGap).toLocaleString()} 부족`})`,
  );
  keyInsights.push(
    `월 비용 ₩${costs.total.toLocaleString()} / 월 수익 ₩${profit.monthlyRevenue.toLocaleString()} = 순이익 ₩${profit.netProfit.toLocaleString()} (마진 ${profit.marginPct}%)`,
  );
  if (feasibility.recommendations.length > 0) {
    keyInsights.push(...feasibility.recommendations);
  }
  keyInsights.push(profit.advice);

  return {
    goal,
    feasibility,
    portfolio,
    primaryEco,
    secondaryEco,
    costs,
    profit,
    keyInsights,
  };
}
