/**
 * [v1.8.2 LDF Phase 3 — L3 Publishing Scheduler]
 *
 * 홈판 메인 노출을 위한 "언제 올릴지" 전략 엔진.
 * 글 품질만큼 중요한 것이 **발행 시간·빈도·계정 분산**.
 *
 * 원칙:
 *  1. 카테고리별 독자 활동 피크 시간대 공략
 *  2. 10개 계정이 같은 시간 같은 주제 금지 (저품질 회피)
 *  3. 주 5~7회 리듬 유지 (알고리즘 신뢰도 누적)
 *  4. 발행 간격 자연 편차 (±30분 지터)
 *
 * 주의: 본 모듈은 "권장 시각"을 반환하며, 실제 스케줄 등록은 renderer의
 *       continuousPublishing·scheduleManager가 수행. 본 모듈은 결정 엔진.
 */

import type { CTRCategory } from './ctrCombat.js';
import { resolveCTRCategory } from './ctrCombat.js';

export interface ScheduleSlot {
  hour: number;          // 0-23
  minute: number;        // 0-59
  category: CTRCategory;
  score: number;         // 피크 매칭 점수 (0-100)
  reasoning: string;     // "저녁 식사 시간대 맛집 피크"
}

/**
 * 카테고리별 홈판 피드 최적 시간대 (경험값 기반 매트릭스)
 * 한국어 블로그 독자 활동 패턴 참조:
 *   - 맛집: 점심·저녁 식사 준비 시간 (11-13, 17-19)
 *   - 육아: 오전 한숨 돌릴 때(10-11) + 낮잠 시간(14-15)
 *   - 뷰티: 출퇴근 통근 시간(8-9, 18-19) + 주말 오후
 *   - 건강: 아침(7-8) + 밤 루틴(21-23)
 *   - 여행: 주말 오전(9-11) + 평일 점심(12-13)
 *   - 테크/가전: 평일 저녁(19-22)
 *   - 라이프스타일: 저녁 감성시간(20-22)
 *   - 엔터: 저녁 후(21-23) + 주말
 *   - 금융: 평일 아침(7-9) + 점심(12-13)
 */
export const PEAK_HOURS: Record<CTRCategory, number[]> = {
  food: [11, 12, 17, 18, 19, 20],
  parenting: [10, 11, 14, 15, 21, 22],
  beauty: [8, 9, 18, 19, 20, 21],
  health: [7, 8, 21, 22, 23],
  travel: [9, 10, 11, 12, 13, 20, 21],
  tech: [19, 20, 21, 22],
  lifestyle: [19, 20, 21, 22, 23],
  entertainment: [21, 22, 23, 24 % 24],
  finance: [7, 8, 9, 12, 13, 22],
  general: [12, 13, 18, 19, 20, 21],
};

/**
 * 요일별 가중치 (0=일, 6=토)
 * 카테고리마다 주말 vs 평일 피크 다름
 */
export const DAY_WEIGHTS: Record<CTRCategory, number[]> = {
  food: [1.3, 0.9, 0.9, 0.9, 1.0, 1.2, 1.4],       // 주말 점심 피크
  parenting: [1.2, 1.0, 1.0, 1.0, 1.0, 1.0, 1.2],  // 주말 +가족시간
  beauty: [1.1, 0.9, 0.9, 0.9, 1.0, 1.1, 1.3],     // 주말 외출 준비
  health: [1.2, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1],     // 주일 루틴 시작
  travel: [1.4, 0.8, 0.8, 0.8, 1.0, 1.3, 1.5],     // 주말 여행 계획
  tech: [0.8, 1.1, 1.1, 1.1, 1.1, 1.0, 0.8],       // 평일 퇴근 후
  lifestyle: [1.1, 1.0, 1.0, 1.0, 1.0, 1.1, 1.2],  // 주말 감성
  entertainment: [1.2, 0.9, 0.9, 0.9, 1.0, 1.3, 1.4], // 주말 드라마 몰아보기
  finance: [0.7, 1.2, 1.2, 1.2, 1.1, 0.8, 0.7],    // 평일 투자 관심
  general: [1.1, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1],
};

/**
 * [v1.8.2] 다음 최적 발행 시각 추천
 * @param categoryHint 카테고리 힌트
 * @param now 기준 시각 (기본 현재)
 * @param offsetMinutes 최소 대기 분 (기본 10분)
 */
export function suggestNextPublishTime(
  categoryHint?: string,
  now: Date = new Date(),
  offsetMinutes: number = 10,
): ScheduleSlot {
  const cat = resolveCTRCategory(categoryHint);
  const peakHours = PEAK_HOURS[cat];
  const dayWeights = DAY_WEIGHTS[cat];

  const baseTime = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  const currentDay = baseTime.getDay();
  const currentHour = baseTime.getHours();

  // 오늘 남은 피크 시간대 중 가장 가까운 곳
  const todayRemaining = peakHours.filter(h => h > currentHour);
  let targetHour: number;
  let targetDay: number = currentDay;
  let daysAhead = 0;

  if (todayRemaining.length > 0) {
    targetHour = todayRemaining[0];
  } else {
    // 오늘 피크 지남 → 내일 첫 피크
    targetHour = peakHours[0];
    targetDay = (currentDay + 1) % 7;
    daysAhead = 1;
  }

  // 지터 ±30분 (자연스러운 변동)
  const jitterMinutes = Math.floor(Math.random() * 61) - 30;
  const finalMinute = Math.max(0, Math.min(59, 15 + jitterMinutes));

  const target = new Date(baseTime);
  target.setDate(target.getDate() + daysAhead);
  target.setHours(targetHour, finalMinute, 0, 0);

  // 스코어링
  const dayWeight = dayWeights[targetDay];
  const peakDepth = peakHours.indexOf(targetHour) / peakHours.length;
  const score = Math.round(70 + dayWeight * 20 - peakDepth * 10);

  return {
    hour: targetHour,
    minute: finalMinute,
    category: cat,
    score: Math.max(0, Math.min(100, score)),
    reasoning: `${cat} 카테고리 ${targetHour}시 피크 시간대${daysAhead > 0 ? ' (내일)' : ''}, 요일 가중 ×${dayWeight.toFixed(1)}`,
  };
}

/**
 * [v1.8.2] N개 계정의 분산 스케줄 생성
 * - 같은 시간대에 2개 이상 계정이 같은 카테고리 발행 금지
 * - 최소 간격 20분 보장
 * - 계정별 지터 적용으로 "기계적 패턴" 회피
 */
export function buildMultiAccountSchedule(
  accounts: { id: string; categoryHint?: string }[],
  startTime: Date = new Date(),
): { accountId: string; scheduledAt: Date; slot: ScheduleSlot }[] {
  const results: { accountId: string; scheduledAt: Date; slot: ScheduleSlot }[] = [];
  const usedSlots = new Set<string>(); // "YYYY-MM-DD HH:MM:category" 조합 중복 방지

  let cumulativeOffset = 0;
  for (const acc of accounts) {
    let attempts = 0;
    let slot: ScheduleSlot;
    let scheduledAt: Date;
    let slotKey: string;

    do {
      const offsetMin = cumulativeOffset + 20 + Math.floor(Math.random() * 20); // 20~40분 추가
      slot = suggestNextPublishTime(acc.categoryHint, startTime, offsetMin);
      scheduledAt = new Date(startTime);
      scheduledAt.setHours(slot.hour, slot.minute, 0, 0);
      // 오늘 지났으면 내일로 자동 조정됨 (suggestNextPublishTime 내부에서)
      if (slot.hour <= startTime.getHours()) {
        scheduledAt.setDate(scheduledAt.getDate() + 1);
      }
      const yyyymmdd = scheduledAt.toISOString().substring(0, 10);
      slotKey = `${yyyymmdd} ${slot.hour.toString().padStart(2, '0')}:${Math.floor(slot.minute / 20) * 20}:${slot.category}`;
      attempts++;
      cumulativeOffset += 20;
    } while (usedSlots.has(slotKey) && attempts < 5);

    usedSlots.add(slotKey);
    results.push({ accountId: acc.id, scheduledAt, slot });
  }

  return results;
}

/**
 * [v1.8.2] 주간 발행 리듬 권장
 * - 계정별 주 5~7회
 * - 같은 요일에 몰지 말고 분산
 */
export function recommendWeeklyCadence(accountCount: number): {
  postsPerAccountPerWeek: number;
  totalWeeklyPosts: number;
  distributionTip: string;
} {
  const perAccount = accountCount >= 5 ? 5 : 6; // 계정 많으면 개별 부담 낮춤
  const total = perAccount * accountCount;

  return {
    postsPerAccountPerWeek: perAccount,
    totalWeeklyPosts: total,
    distributionTip: accountCount >= 3
      ? '각 계정이 다른 요일에 집중 발행하도록 스케줄링 (월/수/금 vs 화/목/토)'
      : '주 5~7회 균등 분산, 같은 요일에 2회 이상 발행하지 말 것',
  };
}

/**
 * [v1.8.2] 현재 시각이 피크인지 체크 (즉시 발행 판단용)
 */
export function isCurrentlyPeakTime(categoryHint?: string, now: Date = new Date()): {
  isPeak: boolean;
  score: number;
  reasoning: string;
} {
  const cat = resolveCTRCategory(categoryHint);
  const peakHours = PEAK_HOURS[cat];
  const dayWeights = DAY_WEIGHTS[cat];
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  const isPeak = peakHours.includes(currentHour);
  const dayWeight = dayWeights[currentDay];
  const score = Math.round((isPeak ? 80 : 40) * dayWeight);

  return {
    isPeak,
    score: Math.max(0, Math.min(100, score)),
    reasoning: isPeak
      ? `${cat} 피크 시간대(${currentHour}시) + 요일 가중 ×${dayWeight.toFixed(1)}`
      : `${cat} 비피크(${currentHour}시) — ${peakHours[0]}시까지 대기 권장`,
  };
}
