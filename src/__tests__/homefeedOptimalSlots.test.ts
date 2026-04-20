import { describe, it, expect } from 'vitest';
import {
  HOMEFEED_OPTIMAL_SLOTS,
  isInOptimalSlot,
  currentOptimalSlot,
  minutesUntilNextSlot,
  nextOptimalSlotStart,
} from '../scheduler/homefeedOptimalSlots';

/** Build a UTC Date representing a given KST hour/minute today. */
function kstToUtc(kstHour: number, kstMinute = 0): Date {
  // UTC = KST - 9 hours. Use a fixed reference date for determinism.
  const ref = new Date('2026-04-20T00:00:00Z');
  const utcHour = (kstHour - 9 + 24) % 24;
  // If we crossed midnight backwards, pull the date back by a day.
  const dayShift = kstHour - 9 < 0 ? -1 : 0;
  return new Date(
    Date.UTC(
      ref.getUTCFullYear(),
      ref.getUTCMonth(),
      ref.getUTCDate() + dayShift,
      utcHour,
      kstMinute,
      0,
    ),
  );
}

describe('HOMEFEED_OPTIMAL_SLOTS — shape', () => {
  it('defines exactly 3 slots', () => {
    expect(HOMEFEED_OPTIMAL_SLOTS).toHaveLength(3);
  });

  it('slots are in ascending hour order', () => {
    for (let i = 1; i < HOMEFEED_OPTIMAL_SLOTS.length; i++) {
      expect(HOMEFEED_OPTIMAL_SLOTS[i].startHourKST).toBeGreaterThan(
        HOMEFEED_OPTIMAL_SLOTS[i - 1].startHourKST,
      );
    }
  });

  it('each slot has end > start', () => {
    for (const slot of HOMEFEED_OPTIMAL_SLOTS) {
      expect(slot.endHourKST).toBeGreaterThan(slot.startHourKST);
    }
  });
});

describe('isInOptimalSlot', () => {
  it('returns true during morning commute (08:00 KST)', () => {
    expect(isInOptimalSlot(kstToUtc(8))).toBe(true);
  });

  it('returns true during lunch (12:30 KST)', () => {
    expect(isInOptimalSlot(kstToUtc(12, 30))).toBe(true);
  });

  it('returns true during evening leisure (21:00 KST)', () => {
    expect(isInOptimalSlot(kstToUtc(21))).toBe(true);
  });

  it('returns false at dawn (04:00 KST)', () => {
    expect(isInOptimalSlot(kstToUtc(4))).toBe(false);
  });

  it('returns false mid-afternoon (15:00 KST)', () => {
    expect(isInOptimalSlot(kstToUtc(15))).toBe(false);
  });

  it('is exclusive at slot end: 09:00 KST is OUT of morning slot', () => {
    expect(isInOptimalSlot(kstToUtc(9))).toBe(false);
  });
});

describe('currentOptimalSlot', () => {
  it('returns morning slot for 07:30 KST', () => {
    const slot = currentOptimalSlot(kstToUtc(7, 30));
    expect(slot?.label).toBe('morning');
  });

  it('returns null at 03:00 KST', () => {
    expect(currentOptimalSlot(kstToUtc(3))).toBeNull();
  });

  it('returns evening slot for 20:30 KST', () => {
    expect(currentOptimalSlot(kstToUtc(20, 30))?.label).toBe('evening');
  });
});

describe('minutesUntilNextSlot', () => {
  it('returns 0 when already inside a slot', () => {
    expect(minutesUntilNextSlot(kstToUtc(8))).toBe(0);
  });

  it('returns positive minutes when outside a slot', () => {
    expect(minutesUntilNextSlot(kstToUtc(15))).toBeGreaterThan(0);
  });

  it('wraps to next day after the last slot ends', () => {
    // 23:00 KST is past the evening slot (20-22). Next slot is morning 7:00 tomorrow.
    const minutes = minutesUntilNextSlot(kstToUtc(23));
    expect(minutes).toBeGreaterThan(0);
    // From 23:00 to 07:00 next day is 8 hours = 480 minutes.
    expect(minutes).toBe(8 * 60);
  });
});

describe('nextOptimalSlotStart', () => {
  it('returns the current moment when already inside a slot', () => {
    const now = kstToUtc(8);
    const next = nextOptimalSlotStart(now);
    expect(next.getTime()).toBe(now.getTime());
  });

  it('returns a future moment when outside', () => {
    const now = kstToUtc(15);
    const next = nextOptimalSlotStart(now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });
});
