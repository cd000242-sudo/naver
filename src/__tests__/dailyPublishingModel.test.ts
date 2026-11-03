import { describe, expect, it } from 'vitest';
import { dailyClaimKey, nextDailyRunAt, validateDailyPlans } from '../scheduler/dailyPublishingModel.js';

export const samplePlan = (overrides = {}) => ({
  accountId: 'account-1', categoryId: '1', enabled: true, mode: 'publish',
  slots: [{ time: '07:00', count: 2 }], generator: 'app-settings', topic: '', ...overrides,
});

describe('daily publishing model', () => {
  it('normalizes a strict plan without retaining unknown data', () => {
    expect(validateDailyPlans([samplePlan()])).toEqual([{ ...samplePlan(), imageMode: 'ai-generated' }]);
    expect(() => validateDailyPlans([samplePlan({ password: 'secret' })])).toThrow();
    expect(validateDailyPlans([samplePlan({ imageSource: 'imagefx' })])[0].imageSource).toBe('imagefx');
    expect(validateDailyPlans([samplePlan({ imageSource: '' })])[0]).not.toHaveProperty('imageSource');
  });
  it.each([
    { accountId: '../unsafe' }, { accountId: '' }, { categoryId: '<script>' },
    { enabled: 'true' }, { mode: 'schedule' }, { generator: '../model' },
    { categoryId: '' }, { categoryId: 'word' }, { imageSource: '../secret' }, { imageSource: 'a'.repeat(81) },
    { topic: 'x'.repeat(2001) }, { topic: 'bad\u0000' },
    { slots: [] }, { slots: [{ time: '7:00', count: 1 }] },
    { slots: [{ time: '24:00', count: 1 }] }, { slots: [{ time: '07:60', count: 1 }] },
    { slots: [{ time: '07:00', count: 0 }] }, { slots: [{ time: '07:00', count: 1.5 }] },
    { slots: [{ time: '07:00', count: 21 }] },
    { slots: [{ time: '07:00', count: 1 }, { time: '07:00', count: 1 }] },
    { slots: [{ time: '07:00', count: 20 }, { time: '18:00', count: 1 }] },
  ])('rejects invalid boundary input: %j', (change) => {
    expect(() => validateDailyPlans([samplePlan(change)])).toThrow('DAILY_PLAN_INVALID');
  });
  it('rejects duplicate accounts and invalid collections', () => {
    expect(() => validateDailyPlans([samplePlan(), samplePlan()])).toThrow();
    expect(() => validateDailyPlans(null)).toThrow();
    expect(() => validateDailyPlans(Array.from({ length: 101 }, (_, i) => samplePlan({ accountId: `a${i}` })))).toThrow();
  });
  it('uses KST dates and a revision-independent claim identity', () => {
    expect(dailyClaimKey('a-1', new Date('2026-10-19T22:00:00Z'), '07:00', 1))
      .toBe('a-1:2026-10-20:0700:1');
  });
  it('finds the next KST slot and does not catch up missed slots', () => {
    const plan = validateDailyPlans([samplePlan()])[0];
    expect(nextDailyRunAt(plan, new Date('2026-10-19T21:59:00Z'))).toBe('2026-10-19T22:00:00.000Z');
    expect(nextDailyRunAt(plan, new Date('2026-10-19T22:00:30Z'))).toBe('2026-10-20T22:00:00.000Z');
    expect(nextDailyRunAt({ ...plan, enabled: false }, new Date())).toBeNull();
  });
});
