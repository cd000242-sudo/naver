import { describe, expect, it, vi } from 'vitest';
import type { HomefeedCandidate } from '../analytics/homefeedBenchmarkFeed.js';
import type { ScoredTopic } from '../homefeedAutopilot/topicScoring.js';
import { buildTopicJudgePrompt, judgeHomefeedTopic, parseTopicJudgeReply } from '../homefeedAutopilot/topicJudge.js';

/**
 * [2026-10-15] Homefeed autopilot P1 — Claude picks one topic from the scored shortlist and it is
 * adopted automatically. A bad or missing reply must still adopt the score #1, never nothing.
 */

function topic(keyword: string, score: number, candidate?: Partial<HomefeedCandidate>): ScoredTopic {
  return {
    keyword,
    title: `${keyword} 제목`,
    category: '사회·이슈',
    score,
    breakdown: { demand: 0, freshness: 0, traffic: 0, priority: 0, reaction: 0, penalty: 0 },
    reasons: [`${keyword} 근거`],
    candidate: candidate ? {
      id: keyword, keyword, title: `${keyword} 제목`, category: '사회·이슈', status: 'review-now', priority: 80,
      publishedAt: '', channels: 5, sourceUrls: [`https://blog.naver.com/${score}`], likesGrowth: null, flags: [],
      why: [], summary: '', homeTitles: [`${keyword} 홈판 제목`], guide: null, ...candidate,
    } : undefined,
  };
}

const SHORTLIST = [
  topic('일순위', 80, { guide: { direction: '점수 각도', mustInclude: ['회차'], mustAvoid: ['스포'], checkBefore: ['방영일'] } }),
  topic('이순위', 70, {}),
  topic('삼순위', 60, {}),
];

describe('parseTopicJudgeReply', () => {
  it('reads the JSON even when wrapped in prose or code fences', () => {
    const reply = parseTopicJudgeReply('결과입니다\n```json\n{"pick": 1, "homeTitle": "T", "angle": "A", "reasons": ["r"], "alternatives": [{"pick": 0, "reason": "차선"}]}\n```', 3);
    expect(reply).toEqual({ pick: 1, homeTitle: 'T', angle: 'A', reasons: ['r'], alternatives: [{ pick: 0, reason: '차선' }] });
  });

  it('rejects picks outside the shortlist and drops alternatives equal to the pick', () => {
    expect(parseTopicJudgeReply('{"pick": 3}', 3)).toBeNull();
    expect(parseTopicJudgeReply('{"pick": -1}', 3)).toBeNull();
    expect(parseTopicJudgeReply('not json', 3)).toBeNull();
    expect(parseTopicJudgeReply('{"pick": 0, "alternatives": [{"pick": 0}, {"pick": 9}]}', 3)?.alternatives).toEqual([]);
  });
});

describe('buildTopicJudgePrompt', () => {
  it('lists every shortlist entry with its index, signals and the title rules', () => {
    const prompt = buildTopicJudgePrompt(SHORTLIST, ['길이는 36~49자']);
    expect(prompt).toContain('[0] 키워드: 일순위');
    expect(prompt).toContain('[2] 키워드: 삼순위');
    expect(prompt).toContain('작성 방향: 점수 각도');
    expect(prompt).toContain('- 길이는 36~49자');
    expect(prompt).toContain('후보에 없는 사실을 지어내지 않는다');
  });
});

describe('judgeHomefeedTopic', () => {
  it("adopts Claude's pick with its title and angle", async () => {
    const callModel = vi.fn(async () => '{"pick": 1, "homeTitle": "이순위 홈판 제목 제안", "angle": "비어 있는 각도", "reasons": ["채널 수요"], "alternatives": [{"pick": 0, "reason": "검색량"}]}');
    const { decision, warning } = await judgeHomefeedTopic(SHORTLIST, [], callModel);
    expect(warning).toBeUndefined();
    expect(decision).toMatchObject({
      keyword: '이순위', homeTitle: '이순위 홈판 제목 제안', angle: '비어 있는 각도', decidedBy: 'llm',
      alternatives: [{ keyword: '일순위', reason: '검색량' }],
    });
    expect(decision?.reasons[0]).toBe('채널 수요');
  });

  it('adopts the score #1 with its guide when there is no Claude key', async () => {
    const { decision, warning } = await judgeHomefeedTopic(SHORTLIST, []);
    expect(decision).toMatchObject({
      keyword: '일순위', homeTitle: '일순위 홈판 제목', angle: '점수 각도', decidedBy: 'score',
      mustInclude: ['회차'], mustAvoid: ['스포'], checkBefore: ['방영일'],
    });
    expect(warning).toContain('API 키');
  });

  it('falls back to the score #1 when the call throws or the reply is unusable', async () => {
    const failing = await judgeHomefeedTopic(SHORTLIST, [], vi.fn(async () => { throw new Error('Claude 529'); }));
    expect(failing.decision?.keyword).toBe('일순위');
    expect(failing.warning).toContain('Claude 529');
    const garbled = await judgeHomefeedTopic(SHORTLIST, [], vi.fn(async () => '{"pick": 42}'));
    expect(garbled.decision?.decidedBy).toBe('score');
  });

  it('returns no decision when there are no candidates', async () => {
    expect((await judgeHomefeedTopic([], [])).decision).toBeNull();
  });
});
