/**
 * [v2.8.0 Starter Kit Phase 7 — Category Recommender Engine]
 *
 * 사용자의 현재 이웃 구성·과거 포스팅·목표 수익을 분석해 최적 카테고리 추천.
 *
 * 원칙:
 *   1. 이웃의 관심 카테고리와 일치하는 주제 → 초기 유입 극대화
 *   2. 목표 수익 × CPM 고려 → 경제적 현실 반영
 *   3. 계정 숙성도 × 카테고리 진입장벽 매칭
 */

import type { CTRCategory } from './ctrCombat.js';
import { CATEGORY_CPM, requiredVisitsForTarget } from './adsPostEngine.js';
import { CATEGORY_ECONOMICS } from './revenueEngine.js';

export interface CategoryRecommendation {
  category: CTRCategory;
  score: number;                // 종합 적합도 0-100
  feasibilityMonths: number;    // 목표 달성 예상 개월
  monthlyRevenueCeiling: number;
  fitReasons: string[];
  cautions: string[];
}

export interface UserContext {
  accountAgeMonths: number;
  currentNeighborCount: number;
  currentDailyVisits: number;
  currentCategory?: CTRCategory;
  pastCategoryDistribution?: Record<CTRCategory, number>;  // 과거 포스팅 비율
  targetMonthlyRevenue: number;
  expertiseAreas?: string[];    // 자기 전문 주제 (선택)
  riskTolerance?: 'low' | 'medium' | 'high';
}

/**
 * [v2.8.0] 카테고리 전환 시 점진 비율 권장
 * 급전환은 저품질 트리거. 80% 유지 + 20% 신규 → 30일 후 60:40 → 60일 후 40:60
 */
export interface TransitionPlan {
  fromCategory: CTRCategory;
  toCategory: CTRCategory;
  weeks: { week: number; fromPct: number; toPct: number; note: string }[];
  estimatedTransitionMonths: number;
  risks: string[];
}

export function generateTransitionPlan(from: CTRCategory, to: CTRCategory): TransitionPlan {
  const fromEco = CATEGORY_ECONOMICS[from];
  const toEco = CATEGORY_ECONOMICS[to];

  const weeks: TransitionPlan['weeks'] = [
    { week: 1, fromPct: 90, toPct: 10, note: `${to} 시험 포스팅 1~2편 (독자 반응 테스트)` },
    { week: 2, fromPct: 80, toPct: 20, note: `${to} 카테고리 2~3편 연재 (연관성 확립)` },
    { week: 3, fromPct: 70, toPct: 30, note: `${to} 주력 1편/일 + 기존 유지` },
    { week: 4, fromPct: 60, toPct: 40, note: '절반 전환 — 이웃 이탈 모니터링' },
    { week: 6, fromPct: 40, toPct: 60, note: `${to} 우위 확립` },
    { week: 8, fromPct: 30, toPct: 70, note: '타겟 비율 안정기 진입' },
  ];

  const risks: string[] = [];
  if (fromEco.avgCPC > toEco.avgCPC) {
    risks.push(`단가 하락: ${from} CPC ₩${fromEco.avgCPC} → ${to} CPC ₩${toEco.avgCPC}`);
  }
  if (fromEco.avgConversionRate !== toEco.avgConversionRate) {
    risks.push(`전환율 변동: ${fromEco.avgConversionRate}% → ${toEco.avgConversionRate}%`);
  }
  // 인접성 체크 — 완전 이질 카테고리는 이웃 이탈 위험
  const relatedMap: Partial<Record<CTRCategory, CTRCategory[]>> = {
    food: ['lifestyle', 'travel'],
    parenting: ['lifestyle', 'health', 'beauty'],
    beauty: ['lifestyle', 'health', 'parenting'],
    health: ['beauty', 'parenting', 'finance'],
    travel: ['food', 'lifestyle'],
    tech: ['finance'],
    lifestyle: ['food', 'parenting', 'beauty'],
    entertainment: ['lifestyle'],
    finance: ['tech', 'health'],
  };
  const isRelated = (relatedMap[from] || []).includes(to);
  if (!isRelated) {
    risks.push('⚠️ 인접성 낮은 카테고리 전환 — 이웃 이탈 20~30% 가능');
  }

  return {
    fromCategory: from,
    toCategory: to,
    weeks,
    estimatedTransitionMonths: 2,
    risks,
  };
}

/**
 * [v2.8.0] 사용자 상태 기반 카테고리 추천 (최대 3개)
 */
export function recommendCategories(context: UserContext): CategoryRecommendation[] {
  const allCategories: CTRCategory[] = ['finance', 'health', 'beauty', 'tech', 'travel', 'parenting', 'lifestyle', 'food', 'entertainment'];
  const recommendations: CategoryRecommendation[] = [];

  for (const cat of allCategories) {
    let score = 50;
    const fitReasons: string[] = [];
    const cautions: string[] = [];
    const cpm = CATEGORY_CPM[cat];
    const eco = CATEGORY_ECONOMICS[cat];

    // 1. 목표 수익 달성 가능성 (0-30점)
    const required = requiredVisitsForTarget(cat, 70, context.targetMonthlyRevenue);
    const currentMonthly = context.currentDailyVisits * 30;
    if (currentMonthly >= required.minMonthlyVisits) {
      score += 30;
      fitReasons.push(`현재 방문으로 월 ₩${context.targetMonthlyRevenue.toLocaleString()} 도달 가능`);
    } else if (currentMonthly >= required.minMonthlyVisits / 3) {
      score += 20;
      fitReasons.push('3개월 내 달성 가능');
    } else if (currentMonthly >= required.minMonthlyVisits / 10) {
      score += 10;
    } else {
      score -= 10;
      cautions.push(`방문 ${required.minDailyVisits}명/일 필요 (현재 ${context.currentDailyVisits}명)`);
    }

    // 2. 계정 숙성도와 카테고리 난이도 매칭 (0-20점)
    const hardCategories: CTRCategory[] = ['finance', 'health'];
    if (hardCategories.includes(cat)) {
      if (context.accountAgeMonths >= 6) {
        score += 20;
        fitReasons.push('계정 숙성 충분 — 고단가 도전 가능');
      } else if (context.accountAgeMonths >= 3) {
        score += 10;
        cautions.push('3~6개월 계정 — 고단가 도전 보통 수준');
      } else {
        score -= 10;
        cautions.push(`신규 계정(${context.accountAgeMonths}개월)엔 ${cat} 진입장벽 높음`);
      }
    } else {
      score += 15;
      fitReasons.push('진입장벽 낮은 카테고리');
    }

    // 3. 이웃 관심 매칭 (0-25점) — pastCategoryDistribution 기반
    if (context.pastCategoryDistribution && context.pastCategoryDistribution[cat]) {
      const historyShare = context.pastCategoryDistribution[cat];
      if (historyShare >= 30) {
        score += 25;
        fitReasons.push(`과거 포스팅 ${historyShare}% — 이웃 관심도 확립됨`);
      } else if (historyShare >= 10) {
        score += 15;
        fitReasons.push(`과거 포스팅 ${historyShare}% — 일부 관심도 있음`);
      } else {
        score += 5;
      }
    }

    // 현재 카테고리 보너스
    if (context.currentCategory === cat) {
      score += 15;
      fitReasons.push('현재 주력 카테고리 — 전환 비용 없음');
    }

    // 4. 수익 상한 (0-15점)
    if (eco.monthlyCeiling >= context.targetMonthlyRevenue * 3) {
      score += 15;
      fitReasons.push(`수익 상한 월 ₩${(eco.monthlyCeiling / 10000).toLocaleString()}만 — 목표 3배 여유`);
    } else if (eco.monthlyCeiling >= context.targetMonthlyRevenue) {
      score += 10;
    } else {
      score -= 5;
      cautions.push(`수익 상한 월 ₩${(eco.monthlyCeiling / 10000).toLocaleString()}만 — 목표 대비 작음`);
    }

    // 5. 리스크 감수도 (0-10점)
    const riskCategories: CTRCategory[] = ['finance', 'health'];
    if (riskCategories.includes(cat)) {
      if (context.riskTolerance === 'high') {
        score += 10;
        fitReasons.push('고위험·고수익 성향 매칭');
      } else if (context.riskTolerance === 'low') {
        score -= 10;
        cautions.push('규제·심사 엄격 — 리스크 회피 성향 맞지 않음');
      }
    }

    // 6. 전문성 체크
    if (context.expertiseAreas && context.expertiseAreas.length > 0) {
      const areaStr = context.expertiseAreas.join(' ').toLowerCase();
      const categoryKeywords: Record<CTRCategory, string[]> = {
        finance: ['금융', '투자', '주식', '부동산', '재테크', '경제'],
        health: ['건강', '의료', '운동', '다이어트', '영양'],
        beauty: ['뷰티', '화장품', '미용', '스킨케어'],
        tech: ['IT', '개발', '컴퓨터', '테크', '프로그래밍'],
        travel: ['여행', '관광'],
        parenting: ['육아', '출산', '엄마'],
        food: ['요리', '맛집', '음식'],
        lifestyle: ['일상', '인테리어', '홈'],
        entertainment: ['영화', '드라마', '음악', '연예'],
        general: [],
      };
      const matches = categoryKeywords[cat].filter(kw => areaStr.includes(kw));
      if (matches.length > 0) {
        score += 10;
        fitReasons.push(`전문 영역 일치: ${matches.join(', ')}`);
      }
    }

    score = Math.max(0, Math.min(100, score));

    // 달성 예상 기간
    let feasibilityMonths: number;
    if (currentMonthly >= required.minMonthlyVisits) feasibilityMonths = 1;
    else if (currentMonthly >= required.minMonthlyVisits / 2) feasibilityMonths = 2;
    else if (currentMonthly >= required.minMonthlyVisits / 4) feasibilityMonths = 3;
    else if (currentMonthly >= required.minMonthlyVisits / 10) feasibilityMonths = 6;
    else feasibilityMonths = 12;

    recommendations.push({
      category: cat,
      score,
      feasibilityMonths,
      monthlyRevenueCeiling: eco.monthlyCeiling,
      fitReasons,
      cautions,
    });
  }

  return recommendations.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * [v2.8.0] 최우선 추천 카테고리 + 근거 요약
 */
export function pickBestCategory(context: UserContext): {
  top: CategoryRecommendation;
  alternatives: CategoryRecommendation[];
  transitionPlan?: TransitionPlan;
  summary: string;
} {
  const recs = recommendCategories(context);
  const top = recs[0];
  const alternatives = recs.slice(1, 4);

  let transitionPlan: TransitionPlan | undefined;
  if (context.currentCategory && context.currentCategory !== top.category) {
    transitionPlan = generateTransitionPlan(context.currentCategory, top.category);
  }

  const summary = `최우선: ${top.category} (점수 ${top.score}/100, 달성 ${top.feasibilityMonths}개월). 근거: ${top.fitReasons.slice(0, 2).join(' / ')}`;

  return { top, alternatives, transitionPlan, summary };
}
