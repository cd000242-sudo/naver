import { describe, expect, it } from 'vitest';
import { pendingCollection, manualObservation } from '../analytics/blogPerformanceReconcile.js';

const now = new Date('2026-10-28T12:00:00+09:00');
const published = (logNo: string, at: string, blogId = 'car') => ({ blogId, logNo, url: `https://blog.naver.com/${blogId}/${logNo}`, title: `글 ${logNo}`, publishedAt: at });
const observed = (postId: string, window: '24h' | '72h' | '7d') => ({ blogId: 'car', postId, url: '', title: '', window, publishedAt: null,
  metrics: { pv: 1, homefeed: null, search: null, dwellSeconds: null, impressions: null }, source: { kind: 'csv' as const, fileName: 'x', importedAt: 'x' } });

describe('publication reconciliation', () => {
  it('lists only due windows that have no measurement, for this blog only', () => {
    const list = pendingCollection([
      published('224450000001', '2026-10-20T08:00:00+09:00'),   // 8일 지남 → 24h · 72h · 7d 모두 대상
      published('224450000002', '2026-10-26T08:00:00+09:00'),   // 2일 → 24h 만
      published('224450000003', '2026-10-28T08:00:00+09:00'),   // 4시간 → 아직 없음
      published('224450000004', '2026-10-20T08:00:00+09:00', 'other'),
    ], [observed('224450000001', '24h')], 'car', now);
    expect(list).toEqual([
      { postId: '224450000002', url: 'https://blog.naver.com/car/224450000002', title: '글 224450000002', publishedAt: '2026-10-26T08:00:00+09:00', missing: ['24h'] },
      { postId: '224450000001', url: 'https://blog.naver.com/car/224450000001', title: '글 224450000001', publishedAt: '2026-10-20T08:00:00+09:00', missing: ['72h', '7d'] },
    ]);
  });
});

describe('manual measurement entry', () => {
  it('keeps blanks as missing and refuses another blog or impossible numbers', () => {
    const o = manualObservation({ url: 'https://blog.naver.com/car/224450000002', window: '24h', pv: '12', homefeed: '', search: '0' }, 'car', new Date('2026-10-28T00:00:00Z'));
    expect(o.metrics).toEqual({ pv: 12, homefeed: null, search: 0, dwellSeconds: null, impressions: null });
    expect(o.source.kind).toBe('manual');
    expect(() => manualObservation({ url: 'https://blog.naver.com/other/224450000002', window: '24h', pv: '1' }, 'car')).toThrow('PERFORMANCE_OTHER_BLOG');
    expect(() => manualObservation({ url: 'https://blog.naver.com/car/224450000002', window: '24h', pv: '-3' }, 'car')).toThrow('PERFORMANCE_INVALID');
    expect(() => manualObservation({ url: 'https://blog.naver.com/car/224450000002', window: '1h' as never, pv: '3' }, 'car')).toThrow('PERFORMANCE_INVALID');
    expect(() => manualObservation({ url: 'https://blog.naver.com/car/224450000002', window: '24h' }, 'car')).toThrow('PERFORMANCE_INVALID');
  });
});
