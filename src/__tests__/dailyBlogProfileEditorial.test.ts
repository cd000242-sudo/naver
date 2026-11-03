import { describe, expect, it, vi } from 'vitest';
import { selectDailyHomefeedTopics, windowSourceBody } from '../main/services/dailyHomefeedEditorial.js';
import { reviewDailyPublishingTitle } from '../main/services/dailyPublishingTitleReview.js';
import type { SourceDocument } from '../content/sourceDocument.js';

const now = new Date('2026-10-20T09:00:00Z');
const scene = '촬영하는 날이면 동료 배우가 직접 집 앞으로 데리러 왔다.';
const gap = '당시 그는 정식 매니저가 아니라 같은 작품에 출연하는 배우였다.';
const lateAnswer = '그가 매번 데리러 온 이유는 사고 이후 운전을 못 하게 된 친구와의 약속 때문이었다고 밝혔다.';
const filler = '취재 자료의 문맥입니다. '.repeat(500);
const doc = (id: string, body: string): SourceDocument => ({
  id, title: `배우의 촬영 이야기 ${id}`, url: `https://news.example.com/${id}`, body,
  sourceTier: 'NEWS', sourceType: 'news', dateStatus: 'KNOWN', pubDate: '2026-10-20',
});
const review = (payoff: string, sourceId = 'D1') => ({ sourceId, decision: 'select', reason: '행동과 관계의 대비를 원문으로 설명할 수 있다.',
  angle: { scene, expectationGap: gap, visualHook: scene, bodyPayoff: payoff,
    targetReader: '배우의 작품 밖 관계가 궁금한 독자', readerQuestion: '같은 배우가 왜 매번 집 앞까지 왔을까?',
    whyCareNow: '오늘 공개한 촬영 일화에서 행동의 이유를 확인할 수 있다.', titleDirection: '데리러 온 행동과 실제 이유를 대비한다.' } });
const profile = { profileVersion: 2, status: 'confirmed', intent: 'homefeed', topics: ['연예 이슈'], exclusions: ['열애설 추측'], reader: '방송을 본 시청자', situations: [], questions: ['그 장면 뒤 실제 사연'], purpose: '방송 뒤 사연' };

describe('daily topic selection with a blog profile', () => {
  it('passes the blog profile as untrusted data and asks to reject off-profile sources', async () => {
    const complete = vi.fn(async (_prompt: string) => JSON.stringify({ reviews: [{ sourceId: 'D1', decision: 'reject', reason: 'off_profile', angle: null }] }));
    const result = await selectDailyHomefeedTopics([doc('a', `${scene} ${gap} ${lateAnswer} ${filler.slice(0, 2000)}`)], { topic: '이슈', complete, now, blogProfile: profile });
    expect(result).toEqual([]);
    const prompt = complete.mock.calls[0][0];
    const dataStart = prompt.indexOf('UNTRUSTED_SOURCE_DATA\n');
    expect(prompt.indexOf('"blogProfile"')).toBeGreaterThan(dataStart);
    expect(prompt).toContain('열애설 추측');
    expect(prompt).toContain('off_profile');
  });

  it('passes measured blog performance as untrusted data with an observational caveat', async () => {
    const complete = vi.fn(async (_prompt: string) => JSON.stringify({ reviews: [review(lateAnswer)] }));
    const blogPerformance = { windows: [{ window: '72h', measured: 2, missing: 0, medianPv: 60, medianHomefeed: 1, top: [{ title: '트렁크 경고음 원인', pv: 120, homefeed: 1 }], low: [{ title: '신차 출시 소식', pv: 3, homefeed: 0 }] }], caveats: ['관측 비교'] };
    await selectDailyHomefeedTopics([doc('a', `${scene} ${gap} ${lateAnswer} ${filler.slice(0, 2000)}`)], { topic: '이슈', complete, now, blogPerformance });
    const prompt = complete.mock.calls[0][0];
    expect(prompt.indexOf('"blogPerformance"')).toBeGreaterThan(prompt.indexOf('UNTRUSTED_SOURCE_DATA\n'));
    expect(prompt).toContain('인과');
  });

  it('without a profile the prompt carries no profile data (old behaviour)', async () => {
    const complete = vi.fn(async (_prompt: string) => JSON.stringify({ reviews: [review(lateAnswer)] }));
    await selectDailyHomefeedTopics([doc('a', `${scene} ${gap} ${lateAnswer} ${filler.slice(0, 2000)}`)], { topic: '이슈', complete, now });
    expect(complete.mock.calls[0][0]).not.toContain('"blogProfile"');
  });

  it('a decisive answer far after the first 4,800 characters is still shown and can be cited', async () => {
    const body = `${scene} ${gap} ${filler} ${lateAnswer} ${filler}`;
    expect(body.indexOf(lateAnswer)).toBeGreaterThan(4_800);
    const complete = vi.fn(async (_prompt: string) => JSON.stringify({ reviews: [review(lateAnswer)] }));
    const result = await selectDailyHomefeedTopics([doc('late', body)], { topic: '이슈', complete, now });
    expect(complete.mock.calls[0][0]).toContain(lateAnswer);
    expect(result[0].editorial.bodyPayoff).toBe(lateAnswer);
  });
});

describe('source windowing', () => {
  it('keeps short bodies unchanged and long bodies within the budget, with verbatim sentences only', () => {
    expect(windowSourceBody('짧은 원문', 4800)).toBe('짧은 원문');
    const body = `${scene} ${filler} ${lateAnswer} ${filler}`;
    const windowed = windowSourceBody(body, 4800);
    expect(windowed.length).toBeLessThanOrEqual(4800);
    expect(windowed.startsWith(scene)).toBe(true);
    expect(windowed).toContain(lateAnswer);
    for (const part of windowed.split('\n…\n')) expect(body).toContain(part);
  });
});

describe('daily title review with a blog profile', () => {
  it('includes the blog profile in the title data', async () => {
    const callText = vi.fn(async (_prompt: string) => '{}');
    await reviewDailyPublishingTitle({ title: '원래 제목', body: `${scene} ${lateAnswer}`, sourceGrounding: `${scene} ${lateAnswer}`, blogProfile: profile }, { callText })
      .catch(() => undefined);
    expect(callText.mock.calls[0][0]).toContain('"blogProfile"');
    expect(callText.mock.calls[0][0]).toContain('방송을 본 시청자');
  });
});
