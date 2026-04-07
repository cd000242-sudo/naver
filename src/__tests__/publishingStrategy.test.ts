import { describe, it, expect } from 'vitest';
import {
  createAccountAge,
  calculateSafeLimit,
  adjustForDayType,
  generateNaturalSchedule,
  isKoreanHoliday,
} from '../publishingStrategy';

describe('createAccountAge', () => {
  it('3개월 미만 계정을 new로 분류한다', () => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const age = createAccountAge(twoMonthsAgo, 10);
    expect(age.maturity).toBe('new');
  });

  it('12개월 이상 계정을 mature로 분류한다', () => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1, oneYearAgo.getMonth() - 1);
    const age = createAccountAge(oneYearAgo, 100);
    expect(age.maturity).toBe('mature');
  });

  it('36개월 이상 계정을 veteran으로 분류한다', () => {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 4);
    const age = createAccountAge(threeYearsAgo, 500);
    expect(age.maturity).toBe('veteran');
  });
});

describe('calculateSafeLimit', () => {
  it('신규 계정에 보수적 한도를 반환한다', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 1);
    const age = createAccountAge(recent, 5);
    const limits = calculateSafeLimit(age);

    expect(limits.dailyMax).toBeLessThanOrEqual(2);
    expect(limits.minIntervalMs).toBeGreaterThanOrEqual(3 * 60 * 60 * 1000); // 3시간+
  });

  it('베테랑 계정에 넉넉한 한도를 반환한다', () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 4);
    const age = createAccountAge(oldDate, 1000);
    const limits = calculateSafeLimit(age);

    expect(limits.dailyMax).toBeGreaterThanOrEqual(4);
    expect(limits.minIntervalMs).toBeLessThanOrEqual(2 * 60 * 60 * 1000);
  });
});

describe('adjustForDayType', () => {
  it('주말에 한도를 줄인다', () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 2);
    const age = createAccountAge(oldDate, 200);
    const base = calculateSafeLimit(age);

    // 2026-04-11 = 토요일
    const saturday = new Date('2026-04-11');
    const adjusted = adjustForDayType(base, saturday);

    expect(adjusted.dailyMax).toBeLessThanOrEqual(base.dailyMax);
    expect(adjusted.dayType).toBe('weekend');
  });
});

describe('isKoreanHoliday', () => {
  it('1월 1일을 공휴일로 인식한다', () => {
    expect(isKoreanHoliday(new Date('2026-01-01'))).toBe(true);
  });

  it('3월 1일을 공휴일로 인식한다', () => {
    expect(isKoreanHoliday(new Date('2026-03-01'))).toBe(true);
  });

  it('일반 평일을 공휴일이 아닌 것으로 인식한다', () => {
    expect(isKoreanHoliday(new Date('2026-04-07'))).toBe(false);
  });
});

describe('generateNaturalSchedule', () => {
  it('요청한 수만큼 슬롯을 반환한다', () => {
    const schedule = generateNaturalSchedule(3);
    expect(schedule.slots.length).toBeLessThanOrEqual(3);
    expect(schedule.slots.length).toBeGreaterThan(0);
  });

  it('슬롯이 유효한 시간 형식이다', () => {
    const schedule = generateNaturalSchedule(5);
    for (const slot of schedule.slots) {
      // HH:mm 형식 검증
      expect(slot.time).toMatch(/^\d{2}:\d{2}$/);
      const [h, m] = slot.time.split(':').map(Number);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(24);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(60);
    }
  });

  it('각 슬롯에 점수와 설명이 있다', () => {
    const schedule = generateNaturalSchedule(2);
    for (const slot of schedule.slots) {
      expect(typeof slot.time).toBe('string');
      expect(slot.time).toMatch(/^\d{2}:\d{2}$/);
      expect(typeof slot.score).toBe('number');
      expect(typeof slot.description).toBe('string');
    }
  });

  it('dayType이 올바르게 설정된다', () => {
    // 2026-04-11 = 토요일
    const schedule = generateNaturalSchedule(2, new Date('2026-04-11'));
    expect(schedule.dayType).toBe('weekend');
  });
});
