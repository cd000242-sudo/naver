/**
 * publishingStrategy.ts
 *
 * 계정 성숙도·요일·공휴일에 따라 발행 한도와 스케줄을 동적으로 산출한다.
 * smartScheduler의 OPTIMAL_PUBLISH_TIMES / CATEGORY_TIME_ADJUSTMENTS를 참조하여
 * 자연스러운 시간 분산을 생성한다.
 */

import {
  OPTIMAL_PUBLISH_TIMES,
  CATEGORY_TIME_ADJUSTMENTS,
} from './scheduler/smartScheduler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountMaturity = 'new' | 'growing' | 'mature' | 'veteran';

export interface AccountAge {
  readonly createdAt: Date;
  readonly totalPosts: number;
  readonly maturity: AccountMaturity;
}

export interface PublishingLimits {
  readonly dailyMax: number;
  readonly minIntervalMs: number;
  readonly hourlyMax: number;
  readonly dayType: 'weekday' | 'weekend' | 'holiday';
  readonly maturity: AccountMaturity;
}

export interface ScheduleSlot {
  readonly time: string;        // HH:mm
  readonly score: number;       // 최적도 점수
  readonly description: string;
}

export interface PublishSchedule {
  readonly slots: readonly ScheduleSlot[];
  readonly date: string;        // YYYY-MM-DD
  readonly dayType: 'weekday' | 'weekend' | 'holiday';
}

// ---------------------------------------------------------------------------
// Constants – maturity thresholds & limits
// ---------------------------------------------------------------------------

const MATURITY_THRESHOLDS: ReadonlyArray<{
  readonly maxMonths: number;
  readonly maturity: AccountMaturity;
}> = [
  { maxMonths: 3, maturity: 'new' },
  { maxMonths: 12, maturity: 'growing' },
  { maxMonths: 36, maturity: 'mature' },
  { maxMonths: Infinity, maturity: 'veteran' },
];

const MATURITY_LIMITS: Readonly<
  Record<AccountMaturity, { dailyMax: number; minIntervalMs: number; hourlyMax: number }>
> = {
  new:     { dailyMax: 1, minIntervalMs: 4 * 60 * 60 * 1000, hourlyMax: 1 },
  growing: { dailyMax: 2, minIntervalMs: 3 * 60 * 60 * 1000, hourlyMax: 1 },
  mature:  { dailyMax: 3, minIntervalMs: 2 * 60 * 60 * 1000, hourlyMax: 2 },
  veteran: { dailyMax: 5, minIntervalMs: 1.5 * 60 * 60 * 1000, hourlyMax: 2 },
};

// ---------------------------------------------------------------------------
// Korean holidays (양력 고정 + 2026 음력 하드코딩)
// ---------------------------------------------------------------------------

/** 양력 고정 공휴일 (month는 0-indexed) */
const SOLAR_HOLIDAYS: ReadonlyArray<{ month: number; day: number }> = [
  { month: 0, day: 1 },   // 신정
  { month: 2, day: 1 },   // 삼일절
  { month: 4, day: 5 },   // 어린이날
  { month: 5, day: 6 },   // 현충일
  { month: 7, day: 15 },  // 광복절
  { month: 9, day: 3 },   // 개천절
  { month: 9, day: 9 },   // 한글날
  { month: 11, day: 25 }, // 크리스마스
];

/** 2026년 음력 공휴일 (설날·추석·석가탄신일) */
const LUNAR_HOLIDAYS_2026: ReadonlyArray<{ month: number; day: number }> = [
  // 설날 연휴 (2026-02-16 ~ 2026-02-18)
  { month: 1, day: 16 },
  { month: 1, day: 17 },
  { month: 1, day: 18 },
  // 석가탄신일 (2026-05-24)
  { month: 4, day: 24 },
  // 추석 연휴 (2026-09-24 ~ 2026-09-26)
  { month: 8, day: 24 },
  { month: 8, day: 25 },
  { month: 8, day: 26 },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 계정 생성일과 총 포스트 수로 AccountAge 객체를 생성한다.
 * maturity는 계정 나이(월)로 자동 산출된다.
 */
export function createAccountAge(createdAt: Date, totalPosts: number): AccountAge {
  const monthsOld = monthsBetween(createdAt, new Date());
  const maturity = resolveMaturity(monthsOld);
  return { createdAt, totalPosts, maturity };
}

/**
 * 계정 성숙도에 따른 안전 발행 한도를 산출한다.
 * dayType은 기본 'weekday'로 설정되며, adjustForDayType으로 보정할 수 있다.
 */
export function calculateSafeLimit(accountAge: AccountAge): PublishingLimits {
  const limits = MATURITY_LIMITS[accountAge.maturity];
  return {
    ...limits,
    dayType: 'weekday',
    maturity: accountAge.maturity,
  };
}

/**
 * 주말·공휴일에 맞춰 한도를 보정한다.
 * - 주말: dailyMax -1, 간격 +30분
 * - 공휴일: dailyMax -1
 * dailyMax는 최소 1 이하로 내려가지 않는다.
 */
export function adjustForDayType(
  baseLimits: PublishingLimits,
  date: Date = new Date(),
): PublishingLimits {
  if (isKoreanHoliday(date)) {
    return {
      ...baseLimits,
      dailyMax: Math.max(1, baseLimits.dailyMax - 1),
      dayType: 'holiday',
    };
  }

  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend) {
    const thirtyMinMs = 30 * 60 * 1000;
    return {
      ...baseLimits,
      dailyMax: Math.max(1, baseLimits.dailyMax - 1),
      minIntervalMs: baseLimits.minIntervalMs + thirtyMinMs,
      dayType: 'weekend',
    };
  }

  return { ...baseLimits, dayType: 'weekday' };
}

/**
 * 주어진 날짜가 한국 공휴일인지 판별한다.
 * 양력 고정 공휴일 + 2026년 음력 하드코딩.
 */
export function isKoreanHoliday(date: Date): boolean {
  const month = date.getMonth();
  const day = date.getDate();
  const year = date.getFullYear();

  const isSolarHoliday = SOLAR_HOLIDAYS.some(
    (h) => h.month === month && h.day === day,
  );
  if (isSolarHoliday) return true;

  if (year === 2026) {
    return LUNAR_HOLIDAYS_2026.some(
      (h) => h.month === month && h.day === day,
    );
  }

  return false;
}

/**
 * count건의 포스트를 자연스러운 시간에 분산 배치한다.
 * - smartScheduler의 OPTIMAL_PUBLISH_TIMES를 기반으로 점수 상위 슬롯 선택
 * - 카테고리별 CATEGORY_TIME_ADJUSTMENTS 보너스 적용
 * - 완전 동일 간격 방지를 위해 ±15~45분 지터 부여
 * - 식사시간(12-13시) 전후에 자연스럽게 집중
 */
export function generateNaturalSchedule(
  count: number,
  date: Date = new Date(),
  category?: string,
): PublishSchedule {
  const dayOfWeek = date.getDay();
  const holiday = isKoreanHoliday(date);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const dayType: PublishSchedule['dayType'] = holiday
    ? 'holiday'
    : isWeekend
      ? 'weekend'
      : 'weekday';

  // 주말/공휴일은 weekend 시간대, 평일은 weekday 시간대
  const baseTimes =
    dayType === 'weekday'
      ? OPTIMAL_PUBLISH_TIMES.weekday
      : OPTIMAL_PUBLISH_TIMES.weekend;

  const categoryAdjust = category
    ? CATEGORY_TIME_ADJUSTMENTS[category] ?? null
    : null;

  // 점수 산출
  const scored = baseTimes.map((t) => {
    let score = t.score;
    if (categoryAdjust && categoryAdjust.preferredHours.includes(t.hour)) {
      score += categoryAdjust.boost;
    }
    // 식사시간(12-13시) 전후 보너스
    if (t.hour >= 11 && t.hour <= 13) {
      score += 5;
    }
    return { ...t, score };
  });

  // 점수 내림차순 정렬 후 상위 count개 선택
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const selected = sorted.slice(0, Math.min(count, sorted.length));

  // 시간순 재정렬
  const byTime = [...selected].sort(
    (a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute),
  );

  // 지터 적용 (±15~45분, 결정론적 시드 기반)
  const slots: ScheduleSlot[] = byTime.map((t, idx) => {
    const jitterMinutes = applyJitter(idx, count);
    const totalMinutes = t.hour * 60 + t.minute + jitterMinutes;

    // 0:00~23:59 범위 클램핑
    const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
    const hour = Math.floor(clamped / 60);
    const minute = Math.floor(clamped % 60);

    return {
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      score: t.score,
      description: t.description,
    };
  });

  const dateStr = formatDate(date);

  return { slots, date: dateStr, dayType };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function monthsBetween(from: Date, to: Date): number {
  const years = to.getFullYear() - from.getFullYear();
  const months = to.getMonth() - from.getMonth();
  return years * 12 + months;
}

function resolveMaturity(monthsOld: number): AccountMaturity {
  for (const threshold of MATURITY_THRESHOLDS) {
    if (monthsOld < threshold.maxMonths) {
      return threshold.maturity;
    }
  }
  return 'veteran';
}

/** 인덱스 기반 결정론적 지터: ±15~45분 범위 */
function applyJitter(index: number, total: number): number {
  // 간단한 해시: 인덱스에 따라 -45~+45분 범위에서 분산
  const seed = ((index + 1) * 2654435761) >>> 0; // Knuth multiplicative hash
  const normalized = (seed % 61) - 30; // -30 ~ +30
  // 부호에 따라 15분 오프셋 추가
  if (normalized >= 0) {
    return 15 + (normalized % 31); // +15 ~ +45
  }
  return -15 + (normalized % 31);   // -45 ~ -15
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
