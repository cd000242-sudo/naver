import { describe, expect, it, vi } from 'vitest';
import { validateScheduleDate } from '../automation/scheduleDatePolicy';

describe('validateScheduleDate', () => {
  it('accepts a future date within one year', () => {
    const now = new Date('2026-06-16T10:00:00');
    expect(() => validateScheduleDate('2026-06-17 09:30', now)).not.toThrow();
  });

  it('rejects invalid format', () => {
    expect(() => validateScheduleDate('2026-06-17T09:30', new Date('2026-06-16T10:00:00'))).toThrow(
      '날짜 형식이 올바르지 않습니다.',
    );
  });

  it('rejects past dates', () => {
    expect(() => validateScheduleDate('2026-06-16 09:30', new Date('2026-06-16T10:00:00'))).toThrow(
      '예약 날짜는 현재 시각보다 미래여야 합니다.',
    );
  });

  it('rejects dates more than one year away', () => {
    expect(() => validateScheduleDate('2027-06-17 10:00', new Date('2026-06-16T10:00:00'))).toThrow(
      '예약 날짜는 1년 이내로 설정해야 합니다.',
    );
  });

  it('defaults current time to new Date when omitted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T10:00:00'));
    expect(() => validateScheduleDate('2026-06-16 10:01')).not.toThrow();
    vi.useRealTimers();
  });
});
