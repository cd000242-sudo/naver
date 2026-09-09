/**
 * [2026-09-10] 노출 측정 실패를 "미노출"로 기록하던 구멍.
 * 실측: published-posts.json 208건 체크 중 124건이 "상위 0개 중 미발견" — 프로브가
 * 카드를 0개 받아온 것(8/19 이전 셀렉터 사망)인데 비노출로 분류돼 calibration·
 * 복리 루프(exposureWinnersBlock)에 오염 데이터로 들어갔다. 이 파일은
 * (1) 카드 0개 = 판정 불가, (2) 판정 불가는 재시도 대상, (3) 통계에서 unknown 분리를 잠근다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPostsNeedingExposureCheck,
  splitExposureGroups,
  isProbeFailedCheck,
  type PublishedPost,
} from '../analytics/publishedPostTracker';

const probeMock = vi.fn();
vi.mock('../analytics/dynamicSerpProbe', () => ({
  probeDynamicSerp: (...args: unknown[]) => probeMock(...args),
}));

import { checkPostExposure } from '../analytics/exposureChecker';

type Check = NonNullable<PublishedPost['exposureChecks']>[number];

const post = (id: string, checks: Check[]): PublishedPost => ({
  id,
  publishedAt: '2026-09-01T10:00:00.000Z',
  keyword: 'k',
  mode: 'homefeed',
  blogId: 'b',
  logNo: '1',
  url: 'https://blog.naver.com/b/1',
  title: 't',
  evaluator: { finalScore: 86, modeScore: 80, safetyScore: 90, humanlikeScore: 70, decision: 'pass', details: {} },
  exposureChecks: checks,
});

const check = (partial: Partial<Check>): Check => ({
  checkedAt: '2026-09-02T10:00:00.000Z',
  hoursAfter: 24,
  searchedKeyword: 'k',
  position: null,
  hasSmartblock: false,
  ...partial,
});

describe('isProbeFailedCheck — 판정 불가 분류', () => {
  it('probeFailed 플래그가 있으면 실패', () => {
    expect(isProbeFailedCheck(check({ probeFailed: true }))).toBe(true);
  });

  it('레거시 기록: "상위 0개 중 미발견" / "fetch 실패" / "오류:" 노트는 실패로 본다', () => {
    expect(isProbeFailedCheck(check({ notes: '상위 0개 중 미발견' }))).toBe(true);
    expect(isProbeFailedCheck(check({ notes: 'fetch 실패' }))).toBe(true);
    expect(isProbeFailedCheck(check({ notes: '오류: timeout of 10000ms exceeded' }))).toBe(true);
  });

  it('카드가 실제로 있었던 미발견과 노출 성공은 유효한 판정', () => {
    expect(isProbeFailedCheck(check({ notes: '상위 30개 중 미발견' }))).toBe(false);
    expect(isProbeFailedCheck(check({ position: 1, notes: '통합탭 1위 노출' }))).toBe(false);
  });
});

describe('getPostsNeedingExposureCheck — 판정 불가는 같은 시점을 다시 잰다', () => {
  const now = new Date('2026-09-02T10:00:00.000Z').getTime();

  it('실패 기록만 있으면 아직 체크 안 한 것으로 취급', () => {
    const posts = [post('p1', [check({ probeFailed: true })])];
    expect(getPostsNeedingExposureCheck(posts, 24, now).map((p) => p.id)).toEqual(['p1']);
  });

  it('유효 기록이 있으면 skip (기존 계약 유지)', () => {
    const posts = [post('p1', [check({ notes: '상위 30개 중 미발견' })])];
    expect(getPostsNeedingExposureCheck(posts, 24, now)).toEqual([]);
  });
});

describe('splitExposureGroups — 판정 불가는 unknown', () => {
  it('실패 기록만 있는 글은 notExposed 가 아니라 unknownCheck', () => {
    const posts = [
      post('dead', [check({ notes: '상위 0개 중 미발견' }), check({ hoursAfter: 48, probeFailed: true })]),
      post('miss', [check({ notes: '상위 30개 중 미발견' })]),
      post('hit', [check({ position: 8, notes: '통합탭 8위 노출' })]),
    ];
    const split = splitExposureGroups(posts);
    expect(split.unknownCheck.map((p) => p.id)).toEqual(['dead']);
    expect(split.notExposed.map((p) => p.id)).toEqual(['miss']);
    expect(split.exposed.map((p) => p.id)).toEqual(['hit']);
  });

  it('최신 체크가 실패여도 그 전 유효 체크로 판정한다', () => {
    const posts = [post('p', [
      check({ hoursAfter: 24, position: 3, notes: '통합탭 3위 노출' }),
      check({ hoursAfter: 48, probeFailed: true, notes: 'fetch 실패' }),
    ])];
    expect(splitExposureGroups(posts).exposed.map((p) => p.id)).toEqual(['p']);
  });
});

describe('checkPostExposure — 카드 0개는 판정 불가', () => {
  beforeEach(() => probeMock.mockReset());

  it('fetch 는 됐지만 카드 0개면 fetchSuccess=false + 판정 불가 노트', async () => {
    probeMock.mockResolvedValue({ fetchSuccess: true, totalCards: 0, cards: [], hasSmartblock: false });
    const r = await checkPostExposure('k', 'b', '1');
    expect(r.fetchSuccess).toBe(false);
    expect(r.position).toBeNull();
    expect(r.notes).toMatch(/카드 0개/);
    expect(r.notes).not.toMatch(/미발견/);
  });

  it('카드가 있고 우리 글이 없으면 유효한 미발견', async () => {
    probeMock.mockResolvedValue({
      fetchSuccess: true, totalCards: 2, hasSmartblock: false,
      cards: [{ position: 1, url: 'https://blog.naver.com/x/9' }, { position: 2, url: 'https://blog.naver.com/y/8' }],
    });
    const r = await checkPostExposure('k', 'b', '1');
    expect(r.fetchSuccess).toBe(true);
    expect(r.notes).toBe('상위 2개 중 미발견');
  });
});

describe('exposurePoller 배선 핀', () => {
  it('폴러가 probeFailed 를 기록에 싣는다', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../analytics/exposurePoller.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/probeFailed:\s*!r\.result\.fetchSuccess/);
  });
});
