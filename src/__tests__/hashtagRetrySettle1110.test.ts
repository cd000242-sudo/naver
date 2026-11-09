/**
 * [2026-11-10] 고객 진단 리포트(느린 PC, 11/9 05:02): "해시태그 1차 입력 검증 실패 → 누락분 재입력" 직후
 * 본문 끝(706자)에 #강화도여행 이 2번 들어 있었고, 본문 글자 수가 정확히 91 = 45 x 2 + 1 늘었다.
 * 1차 입력은 실제로 들어갔는데, 입력 300ms 뒤 한 번 읽은 값(입력 전과 같은 2265자)만 믿고 5개 전부를 다시 쳤다.
 * 재입력 전에 본문을 폴링해 늦게 반영된 태그를 걸러낸다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { waitForExpectedHashtags, type PrePublishStats } from '../automation/prePublishAssertion';

const expectations = { expectedHashtags: ['강화도여행', '화개정원', '강화도가볼만한곳'] };
const stats = (bodyText: string) => ({ bodyText } as unknown as PrePublishStats);
const ALL = '본문 #강화도여행 #화개정원 #강화도가볼만한곳';

function makeClock() {
  const waits: number[] = [];
  return { waits, delay: async (ms: number) => { waits.push(ms); } };
}

describe('waitForExpectedHashtags', () => {
  it('a lagging editor: the tags show up on the third read, so nothing is missing and nothing needs typing again', async () => {
    const clock = makeClock();
    const reads = [stats('본문'), stats('본문'), stats(ALL)];
    const result = await waitForExpectedHashtags(async () => reads.shift() ?? stats(ALL), expectations, { windowMs: 5000, stepMs: 500, delay: clock.delay });

    expect(result.missing).toEqual([]);
    expect(clock.waits).toEqual([500, 500, 500]);
  });

  it('only the tags still absent after the window are reported (so only those are typed again)', async () => {
    const clock = makeClock();
    const result = await waitForExpectedHashtags(async () => stats('본문 #강화도여행'), expectations, { windowMs: 2000, stepMs: 500, delay: clock.delay });

    expect(result.missing).toEqual(['화개정원', '강화도가볼만한곳']);
    expect(clock.waits).toHaveLength(4);
  });

  it('tags that never show: reports all of them after exactly the window, last stats returned', async () => {
    const clock = makeClock();
    const result = await waitForExpectedHashtags(async () => stats('본문만'), expectations, { windowMs: 1000, stepMs: 500, delay: clock.delay });

    expect(result.missing).toEqual(['강화도여행', '화개정원', '강화도가볼만한곳']);
    expect(result.stats?.bodyText).toBe('본문만');
  });

  it('an unreadable read (null) does not count as "all present" and does not throw', async () => {
    const clock = makeClock();
    const result = await waitForExpectedHashtags(async () => null, expectations, { windowMs: 1000, stepMs: 500, delay: clock.delay });

    expect(result.stats).toBeNull();
    expect(result.missing).toEqual([]);
  });

  it('a read that throws is treated like an unreadable read', async () => {
    const clock = makeClock();
    const result = await waitForExpectedHashtags(async () => { throw new Error('detached'); }, expectations, { windowMs: 500, stepMs: 500, delay: clock.delay });

    expect(result.stats).toBeNull();
  });
});

describe('applyHashtagsInBody wiring', () => {
  const code = readFileSync(resolve(__dirname, '..', 'naverBlogAutomation.ts'), 'utf8');
  const apply = code.slice(code.indexOf('private async applyHashtagsInBody'), code.indexOf('// CTA'));

  it('settles (re-reads) before typing the "missing" tags again, and types only what is still missing', () => {
    const settle = apply.indexOf('waitForExpectedHashtags(');
    const retype = apply.indexOf('await typeHashtagBatch(toRetype');
    expect(settle).toBeGreaterThan(-1);
    expect(retype).toBeGreaterThan(settle);
    expect(apply).not.toMatch(/await typeHashtagBatch\(stillMissing/);
    expect(apply.indexOf('toRetype.length === 0')).toBeGreaterThan(settle);
    expect(apply.indexOf('toRetype.length === 0')).toBeLessThan(retype);
  });
});
