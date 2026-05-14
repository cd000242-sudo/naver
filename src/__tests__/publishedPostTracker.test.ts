/**
 * publishedPostTracker + calibration 단위 테스트
 *
 * 실측 데이터 기반 임계 보정 시스템 검증.
 * 네트워크 의존 0, 임시 디렉토리 사용.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadPublishedPosts,
  trackPublishedPost,
  getPostsNeedingExposureCheck,
  recordExposureCheck,
  splitExposureGroups,
  clearPublishedPosts,
  type PublishedPost,
} from '../analytics/publishedPostTracker';
import { computeCalibration } from '../analytics/calibration';
import { matchPostInCards } from '../analytics/exposureChecker';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-tracker-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

function makePost(overrides: Partial<Omit<PublishedPost, 'id'>> = {}): Omit<PublishedPost, 'id'> {
  return {
    publishedAt: '2026-05-15T10:00:00.000Z',
    keyword: '무선 충전기',
    mode: 'seo',
    blogId: 'testblog',
    logNo: '223000001',
    url: 'https://blog.naver.com/testblog/223000001',
    title: '테스트 글',
    evaluator: {
      finalScore: 75,
      modeScore: 80,
      safetyScore: 85,
      humanlikeScore: 65,
      decision: 'pass',
      details: {},
    },
    ...overrides,
  };
}

describe('trackPublishedPost + loadPublishedPosts', () => {
  it('새 글 추가 + 로드', () => {
    const result = trackPublishedPost(tmpDir, makePost());
    expect(result.ok).toBe(true);
    expect(result.id).toBeTruthy();
    const loaded = loadPublishedPosts(tmpDir);
    expect(loaded.length).toBe(1);
  });

  it('maxPosts 초과 시 오래된 것 제거', () => {
    for (let i = 0; i < 5; i++) {
      trackPublishedPost(tmpDir, makePost({ logNo: `K${i}` }), 3);
    }
    const loaded = loadPublishedPosts(tmpDir);
    expect(loaded.length).toBe(3);
  });

  it('파일 없으면 빈 배열', () => {
    expect(loadPublishedPosts(tmpDir)).toEqual([]);
  });
});

describe('getPostsNeedingExposureCheck', () => {
  it('24시간 후 글 검출 — 시간 윈도우 내', () => {
    const now = new Date('2026-05-16T10:00:00.000Z').getTime();
    const posts: PublishedPost[] = [
      { ...makePost({ publishedAt: '2026-05-15T10:00:00.000Z' }), id: 'p1' },  // 24h 지남
      { ...makePost({ publishedAt: '2026-05-16T08:00:00.000Z' }), id: 'p2' },  // 2시간 (아직)
    ];
    const need = getPostsNeedingExposureCheck(posts, 24, now);
    expect(need.length).toBe(1);
    expect(need[0].id).toBe('p1');
  });

  it('이미 같은 시점 체크한 글은 skip', () => {
    const now = new Date('2026-05-16T10:00:00.000Z').getTime();
    const posts: PublishedPost[] = [{
      ...makePost({ publishedAt: '2026-05-15T10:00:00.000Z' }),
      id: 'p1',
      exposureChecks: [{
        checkedAt: '2026-05-16T08:00:00.000Z',
        hoursAfter: 24,
        searchedKeyword: '무선 충전기',
        position: 3,
        hasSmartblock: true,
      }],
    }];
    const need = getPostsNeedingExposureCheck(posts, 24, now);
    expect(need.length).toBe(0);
  });

  it('너무 늦은 글 제외 (±6h 윈도우)', () => {
    const now = new Date('2026-05-16T20:00:00.000Z').getTime(); // 발행 후 34h
    const posts: PublishedPost[] = [{
      ...makePost({ publishedAt: '2026-05-15T10:00:00.000Z' }),
      id: 'p1',
    }];
    const need24 = getPostsNeedingExposureCheck(posts, 24, now);
    expect(need24.length).toBe(0); // 24h 윈도우 (18~30h) 벗어남
  });
});

describe('recordExposureCheck', () => {
  it('체크 결과 추가', () => {
    const result = trackPublishedPost(tmpDir, makePost());
    expect(result.ok).toBe(true);
    recordExposureCheck(tmpDir, result.id!, {
      checkedAt: '2026-05-16T10:00:00.000Z',
      hoursAfter: 24,
      searchedKeyword: '무선 충전기',
      position: 5,
      hasSmartblock: true,
    });
    const loaded = loadPublishedPosts(tmpDir);
    expect(loaded[0].exposureChecks?.length).toBe(1);
    expect(loaded[0].exposureChecks?.[0].position).toBe(5);
  });
});

describe('splitExposureGroups', () => {
  it('노출/비노출/미확인 그룹 분리', () => {
    const posts: PublishedPost[] = [
      { ...makePost(), id: 'p1', exposureChecks: [{ checkedAt: '', hoursAfter: 24, searchedKeyword: 'k', position: 3, hasSmartblock: false }] },
      { ...makePost(), id: 'p2', exposureChecks: [{ checkedAt: '', hoursAfter: 24, searchedKeyword: 'k', position: null, hasSmartblock: false }] },
      { ...makePost(), id: 'p3' }, // 체크 안 함
      { ...makePost(), id: 'p4', exposureChecks: [{ checkedAt: '', hoursAfter: 24, searchedKeyword: 'k', position: 15, hasSmartblock: false }] }, // top10 외
    ];
    const split = splitExposureGroups(posts);
    expect(split.exposed.length).toBe(1);     // p1만 (position 3 = top10)
    expect(split.notExposed.length).toBe(2);  // p2 (null), p4 (15)
    expect(split.unknownCheck.length).toBe(1); // p3
  });
});

describe('matchPostInCards (exposureChecker)', () => {
  it('blogId + logNo 매칭', () => {
    const cards = [
      { position: 1, url: 'https://blog.naver.com/other/111' },
      { position: 2, url: 'https://blog.naver.com/testblog/223000001' },
      { position: 3, url: 'https://blog.naver.com/another/222' },
    ];
    expect(matchPostInCards(cards, 'testblog', '223000001')).toBe(2);
    expect(matchPostInCards(cards, 'notfound', '999')).toBeNull();
  });

  it('대소문자 무관', () => {
    const cards = [{ position: 1, url: 'https://blog.naver.com/TestBlog/223' }];
    expect(matchPostInCards(cards, 'testblog', '223')).toBe(1);
  });
});

describe('computeCalibration', () => {
  function postWithEval(finalScore: number, position: number | null, id: string): PublishedPost {
    return {
      ...makePost({
        evaluator: { finalScore, modeScore: 80, safetyScore: 85, humanlikeScore: 65, decision: 'pass', details: {} },
      }),
      id,
      exposureChecks: [{
        checkedAt: '',
        hoursAfter: 24,
        searchedKeyword: 'k',
        position,
        hasSmartblock: false,
      }],
    };
  }

  it('10건 미만이면 canCalibrate=false', () => {
    const posts = Array.from({ length: 5 }, (_, i) => postWithEval(70, 3, `p${i}`));
    const result = computeCalibration(posts);
    expect(result.canCalibrate).toBe(false);
    expect(result.reason).toContain('최소 10건');
  });

  it('노출 ≥3건 + 비노출 ≥3건이면 calibrate 가능', () => {
    const posts: PublishedPost[] = [
      // 노출 5건 (높은 점수)
      ...[80, 85, 78, 90, 88].map((s, i) => postWithEval(s, 2, `e${i}`)),
      // 비노출 5건 (낮은 점수)
      ...[55, 60, 50, 65, 58].map((s, i) => postWithEval(s, null, `n${i}`)),
    ];
    const result = computeCalibration(posts);
    expect(result.canCalibrate).toBe(true);
    expect(result.exposedCount).toBe(5);
    expect(result.notExposedCount).toBe(5);
    expect(result.exposed.avgFinalScore).toBeGreaterThan(result.notExposed.avgFinalScore);
    expect(result.signalGap.finalScore).toBeGreaterThan(0);
  });

  it('권장 임계는 노출 글 하위 25%', () => {
    const posts: PublishedPost[] = [
      ...[70, 75, 80, 85, 90].map((s, i) => postWithEval(s, 2, `e${i}`)),
      ...[40, 50, 55, 45, 60].map((s, i) => postWithEval(s, null, `n${i}`)),
    ];
    const result = computeCalibration(posts);
    expect(result.canCalibrate).toBe(true);
    // 노출 글 [70,75,80,85,90] 정렬 → p25 = index 1 = 75
    expect(result.recommendedThreshold).toBe(75);
  });
});

describe('clearPublishedPosts', () => {
  it('전체 삭제', () => {
    trackPublishedPost(tmpDir, makePost());
    expect(loadPublishedPosts(tmpDir).length).toBe(1);
    clearPublishedPosts(tmpDir);
    expect(loadPublishedPosts(tmpDir).length).toBe(0);
  });
});
