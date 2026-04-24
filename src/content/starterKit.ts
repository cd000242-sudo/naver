/**
 * [v2.4.0 Starter Kit Phase 3 — Onboarding Wizard + Home Entry Checklist]
 *
 * 초보자 월 100만 애드포스트 달성을 위한 온보딩 + 홈판 진입 판정.
 *
 * 대상: LDF 7개 레이어 복잡성에 압도되는 초보자. 뭐부터 해야 할지 모름.
 * 해결: 3단계 마법사로 질문 답변 → 개인 맞춤 실행 플랜 생성.
 */

import type { CTRCategory } from './ctrCombat.js';
import { CATEGORY_CPM, requiredVisitsForTarget } from './adsPostEngine.js';

// ═══════════════════════════════════════════════════════════════════
// 1. 초보자 프로필 수집
// ═══════════════════════════════════════════════════════════════════

export interface BeginnerProfile {
  accountAgeMonths: number;       // 블로그 개설 후 월수
  currentNeighborCount: number;
  currentDailyVisits: number;
  currentCategory?: CTRCategory;
  availableHoursPerDay: number;   // 하루 투자 가능 시간
  targetMonthlyRevenue: number;   // 목표 월 수익 (기본 1,000,000)
  hasAffiliateAccount: boolean;   // 쿠팡 파트너스 등 제휴사 가입 여부
  experienceLevel: 'none' | 'some' | 'intermediate';
}

export interface BeginnerRoadmap {
  currentStage: 'pre-launch' | 'warmup' | 'growth' | 'scaling' | 'mature';
  recommendedCategory: CTRCategory;
  weeklyPlan: { week: number; targetPosts: number; focusActions: string[] }[];
  estimatedMonthsToTarget: number;
  monthlyRevenueAtTarget: number;
  criticalWarnings: string[];
  quickWins: string[];
}

/**
 * [v2.4.0] 초보자 프로필 → 개인 맞춤 로드맵 생성
 */
export function generateBeginnerRoadmap(profile: BeginnerProfile): BeginnerRoadmap {
  const criticalWarnings: string[] = [];
  const quickWins: string[] = [];

  // 1. 현재 단계 판정
  let currentStage: BeginnerRoadmap['currentStage'];
  if (profile.accountAgeMonths < 1) currentStage = 'pre-launch';
  else if (profile.accountAgeMonths < 3 || profile.currentNeighborCount < 50) currentStage = 'warmup';
  else if (profile.currentNeighborCount < 200 || profile.currentDailyVisits < 500) currentStage = 'growth';
  else if (profile.currentDailyVisits < 2000) currentStage = 'scaling';
  else currentStage = 'mature';

  // 2. 카테고리 추천 (초보자는 낮은 진입장벽 우선)
  let recommendedCategory: CTRCategory;
  if (profile.targetMonthlyRevenue >= 2_000_000 && profile.experienceLevel !== 'none') {
    recommendedCategory = 'health'; // 고단가 + 진입 가능
  } else if (profile.targetMonthlyRevenue >= 1_000_000) {
    // 월 100만 목표 + 초보자: 접근성 좋은 카테고리
    if (profile.currentCategory && ['parenting', 'beauty', 'lifestyle', 'food'].includes(profile.currentCategory)) {
      recommendedCategory = profile.currentCategory; // 이미 운영 중이면 유지
    } else {
      recommendedCategory = 'lifestyle'; // 초보자 친화
    }
  } else {
    recommendedCategory = profile.currentCategory || 'lifestyle';
  }

  // 3. 주차별 플랜 (4주 기본)
  const weeklyPlan: BeginnerRoadmap['weeklyPlan'] = [];
  if (currentStage === 'pre-launch' || currentStage === 'warmup') {
    weeklyPlan.push(
      { week: 1, targetPosts: 3, focusActions: ['첫 포스팅 3개 작성', '프로필·카테고리 세팅', '애드포스트 승인 신청'] },
      { week: 2, targetPosts: 5, focusActions: ['이웃 20명 신청', '카테고리 일관성 유지', '썸네일 테스트'] },
      { week: 3, targetPosts: 7, focusActions: ['이웃 50명 달성', '프리미엄 키워드 3개 주입 연습', '애드포스트 승인 확인'] },
      { week: 4, targetPosts: 10, focusActions: ['이웃 100명 달성', '본문 2000자 표준화', '제휴사 가입 (쿠팡 파트너스)'] },
    );
    criticalWarnings.push('🚨 신규 계정은 첫 2주 하루 5개 초과 금지 (저품질 트리거)');
    criticalWarnings.push('🚨 애드포스트 승인 조건: 포스팅 30개 + 방문 누적 + 승인 신청');
  } else if (currentStage === 'growth') {
    weeklyPlan.push(
      { week: 1, targetPosts: 10, focusActions: ['주 카테고리 집중', '이웃 300명 목표', '프리미엄 키워드 주입'] },
      { week: 2, targetPosts: 15, focusActions: ['광고 배치 최적화 (H2 4~5개, 이미지 3장+)', 'CTR Combat 적용'] },
      { week: 3, targetPosts: 20, focusActions: ['홈판 피크 시간대 발행', '체류시간 개선 (1500~2200자)'] },
      { week: 4, targetPosts: 25, focusActions: ['상위 10% 포스팅 패턴 분석', '이웃 500명 달성'] },
    );
  } else {
    weeklyPlan.push(
      { week: 1, targetPosts: 20, focusActions: ['다중계정 2~3개로 분산', '고단가 카테고리 섞기'] },
      { week: 2, targetPosts: 25, focusActions: ['Attribution UTM 주입 시작', 'Winner Pattern 추출'] },
      { week: 3, targetPosts: 30, focusActions: ['튜닝 제안 반영', '이웃 1000명+'] },
      { week: 4, targetPosts: 30, focusActions: ['월 수익 리포트 확인', 'v2.1.3 A/B 적극 활용'] },
    );
  }

  // 4. 달성 예상 기간
  const cpm = CATEGORY_CPM[recommendedCategory];
  const required = requiredVisitsForTarget(recommendedCategory, 70, profile.targetMonthlyRevenue);
  let estimatedMonthsToTarget: number;
  if (profile.currentDailyVisits >= required.minDailyVisits) estimatedMonthsToTarget = 1;
  else if (profile.currentDailyVisits >= required.minDailyVisits / 2) estimatedMonthsToTarget = 2;
  else if (profile.currentDailyVisits >= required.minDailyVisits / 4) estimatedMonthsToTarget = 3;
  else if (profile.currentDailyVisits >= 100) estimatedMonthsToTarget = 4;
  else estimatedMonthsToTarget = 6;

  // 5. Quick Wins
  if (profile.currentDailyVisits >= 100) {
    quickWins.push(`✅ 일 방문 ${profile.currentDailyVisits}명 — 기초 체력 OK`);
  }
  if (profile.currentNeighborCount >= 100) {
    quickWins.push(`✅ 이웃 ${profile.currentNeighborCount}명 — 홈판 진입 임계치 돌파`);
  }
  if (profile.hasAffiliateAccount) {
    quickWins.push('✅ 제휴 계정 보유 — 애드포스트 외 추가 수익선 확보');
  } else {
    criticalWarnings.push('⚠️ 제휴사(쿠팡 파트너스) 미가입 — 지금 신청 (승인 1~2주)');
  }

  if (!profile.currentCategory) {
    criticalWarnings.push('⚠️ 카테고리 미설정 — 추천: ' + recommendedCategory);
  }
  if (profile.availableHoursPerDay < 1) {
    criticalWarnings.push('⚠️ 하루 1시간 미만 투자로는 월 100만 어려움');
  }

  return {
    currentStage,
    recommendedCategory,
    weeklyPlan,
    estimatedMonthsToTarget,
    monthlyRevenueAtTarget: profile.targetMonthlyRevenue,
    criticalWarnings,
    quickWins,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 2. 홈판 진입 체크리스트
// ═══════════════════════════════════════════════════════════════════

export interface HomeEntryReadiness {
  overallReady: boolean;
  readinessScore: number;         // 0-100
  passedChecks: string[];
  failedChecks: { check: string; severity: 'blocker' | 'warning'; howToFix: string }[];
  nextActionPriority: string;
}

/**
 * [v2.4.0] 홈판 노출 진입 가능성 진단
 * 사용자의 현재 상태 체크 → "지금 홈판 갈 준비 됐나?" 판정
 */
export function diagnoseHomeEntryReadiness(profile: BeginnerProfile): HomeEntryReadiness {
  const passed: string[] = [];
  const failed: HomeEntryReadiness['failedChecks'] = [];

  // 1. 계정 나이 (가장 중요)
  if (profile.accountAgeMonths >= 3) {
    passed.push(`✅ 계정 나이 ${profile.accountAgeMonths}개월 (홈판 알고리즘 신뢰 확보)`);
  } else {
    failed.push({
      check: `계정 나이 ${profile.accountAgeMonths}개월 (최소 3개월 필요)`,
      severity: profile.accountAgeMonths < 1 ? 'blocker' : 'warning',
      howToFix: `${3 - profile.accountAgeMonths}개월 더 꾸준히 포스팅 유지`,
    });
  }

  // 2. 이웃 수
  if (profile.currentNeighborCount >= 100) {
    passed.push(`✅ 이웃 ${profile.currentNeighborCount}명 (관계 신호 임계치 돌파)`);
  } else {
    failed.push({
      check: `이웃 ${profile.currentNeighborCount}명 (최소 100명 권장)`,
      severity: profile.currentNeighborCount < 50 ? 'blocker' : 'warning',
      howToFix: `일 15~30명 신청 (Growth Loop 활용)`,
    });
  }

  // 3. 일 방문
  if (profile.currentDailyVisits >= 100) {
    passed.push(`✅ 일 방문 ${profile.currentDailyVisits}명 (기초 트래픽 확보)`);
  } else {
    failed.push({
      check: `일 방문 ${profile.currentDailyVisits}명 (최소 100명 권장)`,
      severity: 'warning',
      howToFix: 'SEO 키워드 포스팅 + 이웃 증가로 자연 유입 확보',
    });
  }

  // 4. 카테고리 명확성
  if (profile.currentCategory) {
    passed.push(`✅ 주 카테고리 설정 (${profile.currentCategory})`);
  } else {
    failed.push({
      check: '주 카테고리 미설정',
      severity: 'warning',
      howToFix: '한 카테고리 80% 집중 → 알고리즘 전문성 인식',
    });
  }

  // 5. 투자 시간
  if (profile.availableHoursPerDay >= 1) {
    passed.push(`✅ 하루 ${profile.availableHoursPerDay}시간 투자`);
  } else {
    failed.push({
      check: '하루 1시간 미만 투자',
      severity: 'warning',
      howToFix: '하루 최소 1시간 확보 (포스팅 1~2개 필수)',
    });
  }

  // 점수 계산
  const totalChecks = passed.length + failed.length;
  const passWeight = passed.length;
  const failWeight = failed.reduce((s, f) => s - (f.severity === 'blocker' ? 2 : 1), 0);
  const readinessScore = Math.max(0, Math.min(100, Math.round(((passWeight + failWeight) / totalChecks) * 100)));

  const blockerCount = failed.filter(f => f.severity === 'blocker').length;
  const overallReady = blockerCount === 0 && readinessScore >= 60;

  let nextActionPriority: string;
  if (blockerCount > 0) {
    nextActionPriority = failed.find(f => f.severity === 'blocker')!.howToFix;
  } else if (failed.length > 0) {
    nextActionPriority = failed[0].howToFix;
  } else {
    nextActionPriority = '모든 조건 충족 — LDF 전 레이어 활성화 + 일 포스팅 증가 권장';
  }

  return {
    overallReady,
    readinessScore,
    passedChecks: passed,
    failedChecks: failed,
    nextActionPriority,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 3. 월 100만 애드포스트 달성 여부 최종 판정
// ═══════════════════════════════════════════════════════════════════

export interface MillionReadiness {
  canAchieveThisMonth: boolean;
  monthsEstimated: number;
  currentMonthlyRevenue: number;    // 추정
  targetMonthlyRevenue: number;
  gapAnalysis: string[];
  accelerators: string[];
}

export function assessMillionReadiness(profile: BeginnerProfile): MillionReadiness {
  const cpm = CATEGORY_CPM[profile.currentCategory || 'lifestyle'];
  const monthlyVisits = profile.currentDailyVisits * 30;
  // 가정: 친화도 70점 기준 = 1.55 multiplier
  const currentMonthlyRevenue = Math.round((monthlyVisits * 2.1 / 1000) * cpm.avgCPM * 1.55);

  const target = profile.targetMonthlyRevenue;
  const gap = target - currentMonthlyRevenue;
  const ratio = target / Math.max(currentMonthlyRevenue, 1);

  let monthsEstimated: number;
  if (ratio <= 1) monthsEstimated = 1;
  else if (ratio <= 2) monthsEstimated = 2;
  else if (ratio <= 4) monthsEstimated = 3;
  else if (ratio <= 8) monthsEstimated = 4;
  else monthsEstimated = 6;

  const gapAnalysis: string[] = [];
  if (gap > 0) {
    gapAnalysis.push(`현재 월 ₩${currentMonthlyRevenue.toLocaleString()} → 목표 월 ₩${target.toLocaleString()}`);
    gapAnalysis.push(`갭 ₩${gap.toLocaleString()} (현재 대비 ${Math.round(ratio * 100 - 100)}% 더 필요)`);
    gapAnalysis.push(`방문 증가 필요: ${Math.ceil(profile.currentDailyVisits * ratio).toLocaleString()}명/일 목표`);
  } else {
    gapAnalysis.push(`현재 수익이 목표 초과 가능 (현재 월 ₩${currentMonthlyRevenue.toLocaleString()})`);
  }

  const accelerators: string[] = [];
  if (profile.currentCategory && !['finance', 'health', 'tech', 'beauty'].includes(profile.currentCategory)) {
    accelerators.push('🚀 카테고리 부분 전환 (현재 카테고리 70% + health/beauty 30% 섞기)');
  }
  if (profile.currentNeighborCount < 500) {
    accelerators.push('🚀 이웃 500명 + 목표 (일 15~30명 신청)');
  }
  if (profile.availableHoursPerDay < 2) {
    accelerators.push('🚀 하루 투자 2시간+ (포스팅 3~5개)');
  }
  accelerators.push('🚀 프리미엄 키워드 주입 (CPM +30%)');
  accelerators.push('🚀 본문 2000자 표준 + 이미지 3장+ (광고 슬롯 +1)');

  return {
    canAchieveThisMonth: monthsEstimated <= 1,
    monthsEstimated,
    currentMonthlyRevenue,
    targetMonthlyRevenue: target,
    gapAnalysis,
    accelerators,
  };
}
