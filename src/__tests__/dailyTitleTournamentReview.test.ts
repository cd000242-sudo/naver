import { describe, expect, it, vi } from 'vitest';
import { reviewDailyPublishingTitle } from '../main/services/dailyPublishingTitleReview.js';

// 2026-10-21: 토너먼트를 켜면 캐기 → 토너먼트 → 기존 3~5개 확정 → 비평 순서. 기존 근거 검사는 그대로.
const source = '강신일은 설경구가 매니저를 자처했다고 전했습니다. 촬영하는 날이면 직접 집 앞으로 데리러 왔다고 말했습니다. 두 배우는 극단 학전 시절부터 30년 우정을 이어왔습니다.';
const body = `${source} 가까운 동료가 촬영 이동까지 챙겼던 기억이었습니다.`;
const input = { title: '강신일과 설경구의 오랜 우정', body, sourceGrounding: source };
const candidate = (id: string, title: string) => ({ id, title, readerQuestion: '동료가 직접 데리러 간 까닭은 무엇인가',
  expectedBelief: '유명 배우에게는 별도 매니저가 있을 것이라는 예상', surprisingFact: '설경구가 촬영 이동을 직접 챙겼다는 사실', clickReason: '동료가 직접 데리러 간 행동의 배경이 궁금해진다',
  sourceAnchors: [source], bodyAnchors: [body] });
const verdict = (id: string) => ({ id, eligible: true, concreteSubject: true, specificCuriosity: true, realScene: true, faithful: true, payoff: true, notRoutineAnnouncement: true, distinctQuestion: true,
  reason: '행동과 본문 설명이 연결된다', sourceAnchors: ['설경구가 매니저를 자처했다고 전했습니다.'], bodyAnchors: ['설경구가 매니저를 자처했다고 전했습니다.'] });
const mined = ['촬영 날마다 집 앞으로 온 설경구', '강신일의 매니저를 자처한 동료 배우', '학전에서 시작된 30년, 촬영장 배웅까지', '설경구가 직접 운전대를 잡은 이유']
  .map(title => ({ axis: 'Curiosity', readerQuestion: '왜 직접 데리러 왔을까?', title, answer: '촬영하는 날이면 직접 집 앞으로 데리러 왔다고 말했습니다.' }));

function stagedCaller(ranking: unknown = { ranking: ['t2', 't1'] }) {
  return vi.fn(async (_prompt: string, options: { stage: string }) => {
    if (options.stage === 'mining') return JSON.stringify({ candidates: mined });
    if (options.stage === 'tournament') return JSON.stringify(ranking);
    if (options.stage === 'candidates') return JSON.stringify({ candidates: [candidate('c1', '강신일의 매니저를 자처한 동료 배우, 촬영 날마다 집 앞에 왔다'),
      { ...candidate('c2', '촬영 날마다 집 앞으로 온 설경구…학전부터 30년'), readerQuestion: '두 사람의 인연은 어디서 시작됐나' },
      { ...candidate('c3', '강신일이 떠올린 설경구의 매니저 시절'), readerQuestion: '강신일이 특별히 기억하는 장면은 무엇인가' }] });
    return JSON.stringify({ selectedId: 'c1', reviews: [verdict('c1'), verdict('c2'), verdict('c3')] });
  });
}

describe('title review with the internal tournament', () => {
  it('runs mining and tournament first, passes the shortlist to the anchored candidate stage and reports it', async () => {
    const callText = stagedCaller();
    const result = await reviewDailyPublishingTitle(input, { callText, tournament: true });
    expect(callText.mock.calls.map(c => c[1].stage)).toEqual(['mining', 'tournament', 'candidates', 'review']);
    const candidatesPrompt = callText.mock.calls[2][0];
    expect(candidatesPrompt).toContain('"internalShortlist"');
    expect(candidatesPrompt).toContain('강신일의 매니저를 자처한 동료 배우');
    expect(result.tournament).toMatchObject({ status: 'ranked', stats: { generated: 4 } });
    expect(result.title).toBe('강신일의 매니저를 자처한 동료 배우, 촬영 날마다 집 앞에 왔다');
  });

  it('a failed tournament is recorded but the normal grounded review still decides (no silent success claim)', async () => {
    const callText = stagedCaller({ ranking: ['nope'] });
    const result = await reviewDailyPublishingTitle(input, { callText, tournament: true });
    expect(result.tournament).toMatchObject({ status: 'failed', reason: 'TOURNAMENT_RANKING_INVALID' });
    expect(callText.mock.calls[2][0]).not.toContain('"internalShortlist"');
  });

  it('without the option the review keeps its two-call shape', async () => {
    const callText = stagedCaller();
    await reviewDailyPublishingTitle(input, { callText });
    expect(callText.mock.calls.map(c => c[1].stage)).toEqual(['candidates', 'review']);
  });
});
