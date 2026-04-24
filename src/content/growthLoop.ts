/**
 * [v1.8.3 LDF Phase 4 — L5 Growth Loop]
 *
 * 이웃·구독자 확보 자동화 엔진.
 *
 * 철학: 홈판 메인 노출 가중치의 40% 이상이 "관계 신호"(이웃 상호방문,
 *       공감·댓글 누적, 복귀율). 글 품질이 아무리 좋아도 이웃 0인 블로그는
 *       메인 못 감. 이 레이어가 "반복 노출 → 친밀감 → 알고리즘 신뢰" 루프를
 *       돌린다.
 *
 * 주의: 본 모듈은 **전략 엔진**만 제공. 실제 DOM 자동화는 renderer/engagement
 *       레이어에서 수행. 여기선 "누구에게, 얼마나, 언제" 결정만.
 *
 * 준수 사항:
 *   - 네이버 이웃 신청 일일 한도(50명)
 *   - 인위적 패턴 감지 회피 (간격 ±랜덤, 요일 분산)
 *   - 본 블로거와 카테고리 매칭 (관련성 없는 대량 팔로우 = 저품질 신호)
 */

import type { CTRCategory } from './ctrCombat.js';
import { resolveCTRCategory } from './ctrCombat.js';

export interface NeighborCandidate {
  blogId: string;
  displayName?: string;
  category?: CTRCategory;
  activityScore?: number;  // 0-100, 최근 7일 활동도
  lastSeenAt?: number;     // 마지막 포스팅 타임스탬프
  reasons?: string[];      // 매칭 근거
}

export interface GrowthQuota {
  dailyNeighborRequest: number;   // 일 이웃 신청 한도
  dailyMutualVisit: number;        // 일 상호방문 수
  dailyEmpathyComment: number;     // 일 공감+댓글 수
  intervalSeconds: { min: number; max: number };  // 액션 간격
}

/**
 * [v1.8.3] 계정 상태별 일일 쿼터 산정
 *   - 신규 계정(이웃<10): 보수적 (신청 15명/일) — 저품질 트리거 회피
 *   - 성장기(이웃 10-100): 표준 (신청 30명/일)
 *   - 안정기(이웃 100+): 적극적 (신청 50명/일, 네이버 상한)
 */
export function calculateDailyQuota(currentNeighborCount: number): GrowthQuota {
  if (currentNeighborCount < 10) {
    return {
      dailyNeighborRequest: 15,
      dailyMutualVisit: 20,
      dailyEmpathyComment: 5,
      intervalSeconds: { min: 90, max: 300 }, // 1.5~5분
    };
  }
  if (currentNeighborCount < 100) {
    return {
      dailyNeighborRequest: 30,
      dailyMutualVisit: 40,
      dailyEmpathyComment: 10,
      intervalSeconds: { min: 60, max: 240 }, // 1~4분
    };
  }
  return {
    dailyNeighborRequest: 50, // 네이버 상한
    dailyMutualVisit: 60,
    dailyEmpathyComment: 20,
    intervalSeconds: { min: 45, max: 180 }, // 45초~3분
  };
}

/**
 * [v1.8.3] 이웃 후보 우선순위 점수
 *  - 카테고리 일치: 40점 (최우선)
 *  - 활동도: 30점 (최근 포스팅 많은 활성 블로거)
 *  - 이웃 수 중간대: 20점 (500~5000 — 응답률 높음)
 *  - 최근 활동: 10점 (1주 내 포스팅 있음)
 *
 * 거대 블로거(이웃 10만+)는 응답률 낮으니 제외 가까운 점수.
 * 비활성 블로거(3개월 무활동)도 제외.
 */
export function scoreNeighborCandidate(
  candidate: NeighborCandidate,
  myCategory?: CTRCategory,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (myCategory && candidate.category === myCategory) {
    score += 40;
    reasons.push(`카테고리 일치(${candidate.category})`);
  } else if (myCategory && candidate.category) {
    // 부분 매칭 — food ↔ lifestyle 같이 연관 있으면 일부 가점
    const related: Partial<Record<CTRCategory, CTRCategory[]>> = {
      food: ['lifestyle', 'travel'],
      parenting: ['lifestyle', 'health'],
      beauty: ['lifestyle', 'health'],
      health: ['beauty', 'parenting'],
      travel: ['food', 'lifestyle'],
      tech: ['finance'],
      lifestyle: ['food', 'parenting', 'beauty'],
      entertainment: ['lifestyle'],
      finance: ['tech'],
    };
    if ((related[myCategory] || []).includes(candidate.category)) {
      score += 20;
      reasons.push(`인접 카테고리(${candidate.category})`);
    }
  }

  if (typeof candidate.activityScore === 'number') {
    if (candidate.activityScore >= 70) {
      score += 30;
      reasons.push('활동도 높음 (최근 7일 많은 포스팅)');
    } else if (candidate.activityScore >= 40) {
      score += 15;
      reasons.push('활동도 중간');
    } else {
      reasons.push('활동도 낮음');
    }
  }

  if (typeof candidate.lastSeenAt === 'number') {
    const daysSince = (Date.now() - candidate.lastSeenAt) / (86400 * 1000);
    if (daysSince <= 7) {
      score += 10;
      reasons.push('최근 1주 활동');
    } else if (daysSince > 90) {
      score -= 30;
      reasons.push('3개월 무활동 (제외 권장)');
    }
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * [v1.8.3] 행동 간격 지터 — 인간스러운 자연 간격
 * 연속 액션 사이에 랜덤 대기 시간 반환 (초 단위)
 */
export function getNaturalDelaySeconds(quota: GrowthQuota): number {
  const range = quota.intervalSeconds.max - quota.intervalSeconds.min;
  return quota.intervalSeconds.min + Math.floor(Math.random() * range);
}

/**
 * [v1.8.3] 오늘의 성장 액션 플랜 생성
 * 쿼터를 시간대별로 분산. 한 번에 몰지 않고 자연스럽게.
 */
export interface GrowthAction {
  type: 'neighbor_request' | 'mutual_visit' | 'empathy_comment';
  scheduledAt: Date;
  targetBlogId?: string;  // 구체 타깃 (후보 스코어링 후 결정)
}

export function planTodayGrowthActions(
  quota: GrowthQuota,
  baseTime: Date = new Date(),
): GrowthAction[] {
  const actions: GrowthAction[] = [];
  const today = new Date(baseTime);
  today.setHours(0, 0, 0, 0);

  // 활동 시간대: 9~22시 (13시간 = 780분)
  const activeMinutesInDay = 780;
  const startMinute = 9 * 60;

  const total = quota.dailyNeighborRequest + quota.dailyMutualVisit + quota.dailyEmpathyComment;
  if (total === 0) return actions;

  const minuteInterval = activeMinutesInDay / total;
  let cursor = startMinute;

  const queue: GrowthAction['type'][] = [];
  for (let i = 0; i < quota.dailyNeighborRequest; i++) queue.push('neighbor_request');
  for (let i = 0; i < quota.dailyMutualVisit; i++) queue.push('mutual_visit');
  for (let i = 0; i < quota.dailyEmpathyComment; i++) queue.push('empathy_comment');
  // Fisher-Yates 셔플로 유형 혼재 (같은 유형 연속 금지)
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  for (const type of queue) {
    const jitter = (Math.random() - 0.5) * minuteInterval * 0.6; // ±30% 지터
    const minute = cursor + jitter;
    const scheduledAt = new Date(today.getTime() + minute * 60 * 1000);
    actions.push({ type, scheduledAt });
    cursor += minuteInterval;
  }

  return actions.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/**
 * [v1.8.3] 주간 이웃 증가 리포트 계산
 * 현재 이웃 수 vs 7일 전 = 순증 + 일평균
 */
export interface GrowthReport {
  currentCount: number;
  netGain: number;
  dailyAverage: number;
  trend: 'growing' | 'stable' | 'declining';
  suggestion: string;
}

export function computeWeeklyGrowthReport(
  currentCount: number,
  sevenDaysAgoCount: number,
): GrowthReport {
  const netGain = currentCount - sevenDaysAgoCount;
  const dailyAverage = netGain / 7;

  let trend: GrowthReport['trend'] = 'stable';
  if (netGain > 7) trend = 'growing';
  else if (netGain < -3) trend = 'declining';

  let suggestion: string;
  if (trend === 'growing') {
    suggestion = '성장 중. 현재 쿼터 유지하며 컨텐츠 품질에 집중.';
  } else if (trend === 'declining') {
    suggestion = '이웃 감소. 콘텐츠 카테고리 집중도 점검 + 상호방문 쿼터 +20% 상향 권장.';
  } else {
    suggestion = '정체 구간. 이웃 신청 대상을 인접 카테고리까지 확장 권장.';
  }

  return {
    currentCount,
    netGain,
    dailyAverage: Math.round(dailyAverage * 10) / 10,
    trend,
    suggestion,
  };
}

/**
 * [v1.8.3] 카테고리 힌트로 이웃 후보 필터링
 * 외부에서 가져온 후보 목록을 내 카테고리에 맞게 정렬
 */
export function rankNeighborCandidates(
  candidates: NeighborCandidate[],
  myCategoryHint?: string,
  limit: number = 50,
): NeighborCandidate[] {
  const myCat = resolveCTRCategory(myCategoryHint);

  const scored = candidates.map(c => ({
    ...c,
    ...scoreNeighborCandidate(c, myCat),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter(c => c.score >= 30)  // 최소 관련성 임계값
    .slice(0, limit);
}

/**
 * [v1.8.3] 이웃 신청 안전 체크
 * 오늘 이미 진행한 액션 수 확인 후 쿼터 초과 방지
 */
export function canPerformActionToday(
  actionType: GrowthAction['type'],
  performedToday: Record<GrowthAction['type'], number>,
  quota: GrowthQuota,
): { allowed: boolean; remaining: number; reason?: string } {
  const limits: Record<GrowthAction['type'], number> = {
    neighbor_request: quota.dailyNeighborRequest,
    mutual_visit: quota.dailyMutualVisit,
    empathy_comment: quota.dailyEmpathyComment,
  };

  const limit = limits[actionType];
  const performed = performedToday[actionType] || 0;
  const remaining = limit - performed;

  if (remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      reason: `오늘 ${actionType} 한도 ${limit}회 초과 (네이버 저품질 회피)`,
    };
  }

  return { allowed: true, remaining };
}
