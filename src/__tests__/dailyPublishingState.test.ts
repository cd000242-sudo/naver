import { describe, expect, it } from 'vitest';
import { boundDailyRuns, validateDailyState } from '../scheduler/dailyPublishingState.js';
import { confirmedDailyUrl, dailyKst } from '../scheduler/dailyPublishingModel.js';
import type { DailyPublishingJob } from '../scheduler/dailyPublishingTypes.js';

const job = (overrides = {}): DailyPublishingJob => ({
  accountId: 'a', date: '2026-10-20', time: '07:00', ordinal: 1, key: 'a:2026-10-20:0700:1',
  status: 'confirmed', createdAt: '2026-10-19T22:00:00.000Z', updatedAt: '2026-10-19T22:00:00.000Z', ...overrides,
});
const state = (runs = [job()]) => ({ version: 1, revision: 0, plans: [], runs });

describe('daily durable state safety', () => {
  it('loads an empty state and defensive snapshots', () => {
    expect(validateDailyState(undefined)).toEqual(state([]));
    const raw = state();
    const validated = validateDailyState(raw);
    raw.runs[0].status = 'needs_review';
    expect(validated.runs[0].status).toBe('confirmed');
  });
  it.each([
    { date: '2026-02-30' }, { date: 'nonsense' }, { ordinal: 0 }, { ordinal: 21 },
    { key: 'wrong' }, { status: 'retry' }, { createdAt: '2026' }, { updatedAt: null },
    { reason: 'private-token' }, { publishedUrl: 'https://evil.example/' }, { secret: 'private' },
  ])('rejects malformed saved jobs: %j', (overrides) => {
    expect(() => validateDailyState(state([job(overrides)]))).toThrow('DAILY_STATE_INVALID');
  });
  it('rejects unknown top-level fields, revisions and duplicate claims', () => {
    for (const value of [{ ...state(), password: 'secret' }, { ...state(), revision: -1 },
      { ...state(), runs: {} }, state([job(), job()])]) {
      expect(() => validateDailyState(value)).toThrow('DAILY_STATE_INVALID');
    }
  });
  it('keeps only fourteen KST calendar dates', () => {
    const now = new Date('2026-10-19T22:00:00Z');
    const runs = [job({ date: '2026-10-06' }), job({ date: '2026-10-07' }), job()];
    expect(boundDailyRuns(runs, now).map((r) => r.date)).toEqual(['2026-10-07', '2026-10-20']);
  });
  it('bounds history while retaining every current-day claim', () => {
    const old = Array.from({ length: 2000 }, (_, ordinal) => job({ date: '2026-10-19', ordinal }));
    const bounded = boundDailyRuns([...old, job()], new Date('2026-10-19T22:00:00Z'));
    expect(bounded).toHaveLength(2000);
    expect(bounded.at(-1)!.date).toBe('2026-10-20');
    expect(() => boundDailyRuns(Array.from({ length: 2001 }, () => job()), new Date('2026-10-19T22:00:00Z')))
      .toThrow('DAILY_LOG_CAPACITY');
  });
  it('rejects invalid clocks', () => {
    expect(() => dailyKst(new Date(NaN))).toThrow('DAILY_CLOCK_INVALID');
  });
  it.each([
    'http://blog.naver.com/owner/123', 'https://evil.example/owner/123',
    'https://user:pass@blog.naver.com/owner/123', 'https://blog.naver.com:444/owner/123',
    'https://blog.naver.com/PostWriteForm.naver?blogId=owner&logNo=123',
    'https://blog.naver.com/arbitrary?blogId=owner&logNo=123',
    'https://blog.naver.com/owner/0', 'not a url', 'x'.repeat(2049),
  ])('rejects nonconcrete or credential-bearing URLs: %s', (url) => {
    expect(confirmedDailyUrl(url)).toBeNull();
  });
  it('canonicalizes valid published identities without query data', () => {
    expect(confirmedDailyUrl('https://m.blog.naver.com/PostView.naver?blogId=owner&logNo=123&secret=private'))
      .toBe('https://blog.naver.com/owner/123');
    expect(confirmedDailyUrl('https://blog.naver.com/owner?logNo=123'))
      .toBe('https://blog.naver.com/owner/123');
    expect(confirmedDailyUrl('https://blog.naver.com/owner/123?tracking=private'))
      .toBe('https://blog.naver.com/owner/123');
  });
});
