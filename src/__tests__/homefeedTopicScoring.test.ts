import { describe, expect, it } from 'vitest';
import { parseHomefeedBenchmarkFeed, type HomefeedCandidate } from '../analytics/homefeedBenchmarkFeed.js';
import { parseTopicBriefs, type LewordPick } from '../analytics/lewordBoard.js';
import { scoreHomefeedTopics, topicMatches } from '../homefeedAutopilot/topicScoring.js';

/**
 * [2026-10-15] Homefeed autopilot P1 — the app now reads the leadernam homefeed benchmark
 * (previously site-only) and scores topics by homefeed odds x traffic before Claude picks one.
 */

const NOW = Date.parse('2026-10-15T20:00:00.000Z');

function benchCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    keyword: '나는솔로 34기 영숙',
    title: '나는솔로 34기 영숙 저축 안 해요',
    category: '사회·이슈',
    status: 'review-now',
    priority: 89,
    publishedAt: '2026-10-15T17:00:00.000Z',
    why: ['9개 채널에서 관련 제목 발견 · 독립 사실 확인과는 다릅니다.'],
    summary: '요약',
    homeTitles: [],
    writingDirection: '',
    mustInclude: [],
    mustAvoid: [],
    metrics: { reactionGrowth: { likes: { change: 7 } } },
    flags: [],
    sources: [
      { id: 'a', url: 'https://blog.naver.com/a/1' },
      { id: 'b', url: 'https://blog.naver.com/b/2' },
    ],
    ...overrides,
  };
}

function candidate(overrides: Partial<HomefeedCandidate> = {}): HomefeedCandidate {
  return {
    id: 'x', keyword: '키워드', title: '제목', category: '분야', status: 'review-now', priority: 60,
    publishedAt: '2026-10-15T18:00:00.000Z', channels: 3, sourceUrls: [], likesGrowth: null, flags: [],
    why: [], summary: '', homeTitles: [], guide: null, ...overrides,
  };
}

const brief = (keyword: string, searchVolume: number | null, verdict = 'NOW'): LewordPick => ({
  keyword, searchVolume, documentCount: 100, verdict, lane: '분야', recommended: true, briefTitle: `${keyword} 브리프`,
});

describe('parseHomefeedBenchmarkFeed', () => {
  it('joins guides and titles by source URL and reads the channel count from why', () => {
    const feed = parseHomefeedBenchmarkFeed(
      { generatedAt: 'g', candidates: [benchCandidate()], trends: { writing: { guide: ['길이는 36~49자'] } } },
      { entries: [{ urls: ['https://blog.naver.com/b/2'], titles: ['"저축 안 해요" 영숙'] }] },
      { guides: [{ urls: ['https://blog.naver.com/a/1'], guide: { direction: '각도', mustInclude: ['회차'], mustAvoid: [], checkBefore: ['방영일'] } }] },
    );
    expect(feed.candidates).toHaveLength(1);
    const [c] = feed.candidates;
    expect(c.channels).toBe(9);
    expect(c.likesGrowth).toBe(7);
    expect(c.homeTitles).toEqual(['"저축 안 해요" 영숙']);
    expect(c.guide).toEqual({ direction: '각도', mustInclude: ['회차'], mustAvoid: [], checkBefore: ['방영일'] });
    expect(feed.titleRules).toEqual(['길이는 36~49자']);
  });

  it("prefers the candidate's own writing direction over a joined guide", () => {
    const feed = parseHomefeedBenchmarkFeed(
      { candidates: [benchCandidate({ writingDirection: '자체 방향', mustInclude: ['A'] })] },
      undefined,
      { guides: [{ urls: ['https://blog.naver.com/a/1'], guide: { direction: '조인 방향' } }] },
    );
    expect(feed.candidates[0].guide?.direction).toBe('자체 방향');
  });

  it('returns an empty feed for malformed input instead of throwing', () => {
    expect(parseHomefeedBenchmarkFeed(null).candidates).toEqual([]);
    expect(parseHomefeedBenchmarkFeed({ candidates: 'nope' }).candidates).toEqual([]);
    expect(parseHomefeedBenchmarkFeed({ candidates: [{ title: 'no keyword' }] }).candidates).toEqual([]);
  });
});

describe('parseTopicBriefs keeps the angle fields', () => {
  it('passes primaryIntent, value and differentiation through', () => {
    const board = parseTopicBriefs({
      briefs: [{ coreKeyword: '코난 30호', timing: 'NOW', primaryIntent: '더빙 확정?', value: '8년 만', differentiation: '확정 여부 먼저' }],
    });
    expect(board.picks[0]).toMatchObject({ primaryIntent: '더빙 확정?', briefValue: '8년 만', differentiation: '확정 여부 먼저' });
  });
});

describe('topicMatches', () => {
  it('matches containment and shared tokens, but not short generic words', () => {
    expect(topicMatches('나는솔로 34기 영숙', '나는솔로 34기 영숙 저축 해요')).toBe(true);
    expect(topicMatches('명탐정 코난 30호', '코난 30호 살인 사건 더빙')).toBe(true);
    expect(topicMatches('연금', '국민연금 개편안')).toBe(false);
    expect(topicMatches('하정우 결혼', '빅나티 결혼')).toBe(false);
  });
});

describe('scoreHomefeedTopics', () => {
  it('ranks a fresh, widely posted topic above a stale-ish one', () => {
    const scored = scoreHomefeedTopics({
      candidates: [
        candidate({ keyword: '오래된 소재', publishedAt: '2026-10-13T20:00:00.000Z', channels: 3 }),
        candidate({ keyword: '방금 뜬 소재', publishedAt: '2026-10-15T18:00:00.000Z', channels: 7 }),
      ],
      briefs: [],
      now: NOW,
    });
    expect(scored.map((s) => s.keyword)).toEqual(['방금 뜬 소재', '오래된 소재']);
    expect(scored[0].breakdown.freshness).toBe(25);
  });

  it('adds search traffic when a LEWORD brief overlaps the homefeed topic', () => {
    const scored = scoreHomefeedTopics({
      candidates: [candidate({ keyword: '명탐정 코난 30호 살인 사건' })],
      briefs: [brief('명탐정 코난 30호 살인 사건', 11600)],
      now: NOW,
    });
    expect(scored).toHaveLength(1);
    expect(scored[0].brief?.searchVolume).toBe(11600);
    expect(scored[0].breakdown.traffic).toBeGreaterThan(19);
    expect(scored[0].reasons.join(' ')).toContain('월 검색량 11,600');
  });

  it('penalizes risky flags and pending verification, and drops stale topics', () => {
    const scored = scoreHomefeedTopics({
      candidates: [
        candidate({ keyword: '깨끗한 소재' }),
        candidate({ keyword: '민감한 소재', flags: ['sensitive-claim'], status: 'verify' }),
        candidate({ keyword: '묵은 소재', status: 'stale' }),
      ],
      briefs: [],
      now: NOW,
    });
    expect(scored.map((s) => s.keyword)).toEqual(['깨끗한 소재', '민감한 소재']);
    expect(scored[1].breakdown.penalty).toBe(-20);
  });

  it('keeps unmatched briefs as search-traffic candidates and skips recently written topics', () => {
    const scored = scoreHomefeedTopics({
      candidates: [candidate({ keyword: '이미 쓴 소재 이야기' })],
      briefs: [brief('청주 특례시 복지', 5100), brief('지난주 쓴 지원금', 900)],
      now: NOW,
      excludeKeywords: ['이미 쓴 소재 이야기', '지난주 쓴 지원금'],
    });
    expect(scored.map((s) => s.keyword)).toEqual(['청주 특례시 복지']);
    expect(scored[0].candidate).toBeUndefined();
    expect(scored[0].reasons.join(' ')).toContain('홈판 벤치마크에는 아직 없음');
  });
});
