/**
 * Homefeed-optimal publish slot calculator.
 *
 * From SPEC-HOMEFEED-100 W4 and the 2026-04-20 industry research synthesis:
 * the Naver homefeed (탐색 피드) amplification window is strongest when a
 * post gets immediate engagement (likes/comments/shares) in the first
 * 24-48 hours. Publishing when your target audience is active maximizes
 * the chance of hitting that window.
 *
 * Three KST slots (all local Seoul time):
 *   - Morning commute:  07:00 ~ 09:00
 *   - Lunch break:      12:00 ~ 13:00
 *   - Evening leisure:  20:00 ~ 22:00
 *
 * This module returns SLOT metadata — it does NOT actually schedule anything.
 * The existing smartScheduler.ts wires this into the daily queue. Keeping the
 * slot definitions pure and side-effect-free makes them unit-testable and
 * easy to override in tests with a frozen clock.
 */

export interface OptimalSlot {
  /** Human label for logs / UI. */
  label: 'morning' | 'lunch' | 'evening';
  /** Slot start, in KST hours (0-23). */
  startHourKST: number;
  /** Slot end (exclusive), in KST hours. */
  endHourKST: number;
  /** One-line rationale. */
  reason: string;
}

export const HOMEFEED_OPTIMAL_SLOTS: readonly OptimalSlot[] = [
  {
    label: 'morning',
    startHourKST: 7,
    endHourKST: 9,
    reason: '출근길 모바일 체크 피크',
  },
  {
    label: 'lunch',
    startHourKST: 12,
    endHourKST: 13,
    reason: '점심시간 짧은 훑어보기',
  },
  {
    label: 'evening',
    startHourKST: 20,
    endHourKST: 22,
    reason: '저녁 여가 시간 피크',
  },
];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKSTHour(date: Date): number {
  const kstMs = date.getTime() + KST_OFFSET_MS;
  return new Date(kstMs).getUTCHours();
}

/**
 * Is the given moment inside any optimal slot? Default `now` uses the
 * system clock; tests inject a fixed Date to freeze time.
 */
export function isInOptimalSlot(now: Date = new Date()): boolean {
  const hour = toKSTHour(now);
  return HOMEFEED_OPTIMAL_SLOTS.some(
    (s) => hour >= s.startHourKST && hour < s.endHourKST,
  );
}

/**
 * Which slot is the given moment in? Returns null when outside all slots.
 */
export function currentOptimalSlot(now: Date = new Date()): OptimalSlot | null {
  const hour = toKSTHour(now);
  return (
    HOMEFEED_OPTIMAL_SLOTS.find(
      (s) => hour >= s.startHourKST && hour < s.endHourKST,
    ) ?? null
  );
}

/**
 * Minutes until the next optimal slot opens. Returns 0 when we are already
 * inside a slot (so callers can branch on "publish now vs wait").
 */
export function minutesUntilNextSlot(now: Date = new Date()): number {
  if (isInOptimalSlot(now)) return 0;

  const kstMs = now.getTime() + KST_OFFSET_MS;
  const kstDate = new Date(kstMs);
  const hour = kstDate.getUTCHours();
  const minute = kstDate.getUTCMinutes();

  // Find the next slot start strictly after current hour.
  const upcoming = HOMEFEED_OPTIMAL_SLOTS.find((s) => s.startHourKST > hour);
  if (upcoming) {
    const hoursAway = upcoming.startHourKST - hour - 1;
    const minutesLeftInCurrentHour = 60 - minute;
    return hoursAway * 60 + minutesLeftInCurrentHour;
  }

  // Past the last slot today — wrap to tomorrow morning.
  const first = HOMEFEED_OPTIMAL_SLOTS[0];
  const hoursAway = 24 - hour + first.startHourKST - 1;
  const minutesLeftInCurrentHour = 60 - minute;
  return hoursAway * 60 + minutesLeftInCurrentHour;
}

/**
 * Convenience: pick the next optimal slot start as a Date in the machine's
 * local timezone. Callers feed this into setTimeout / cron / a queue.
 */
export function nextOptimalSlotStart(now: Date = new Date()): Date {
  const minutes = minutesUntilNextSlot(now);
  if (minutes === 0) return new Date(now.getTime());
  return new Date(now.getTime() + minutes * 60 * 1000);
}
