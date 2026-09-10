/**
 * [2026-09-10] 노출률 83% 는 허수였다. 툴이 **자기 제목으로 검색**하고 있었다.
 *
 * policyService.ts:446 가 이렇게 기록했다:
 *   keyword: primary_keyword || draft.title
 * 키워드가 없으면 제목을 키워드 자리에 넣는다. 그러면 노출 체크가 그 제목으로 검색하고,
 * 경쟁 문서가 0개라 자기 글을 1위로 찾는다.
 *
 * 실측: 저장된 100편 중 64편이 keyword === title. 그 글들의 키워드 평균 길이는 36자다.
 * 네이버 데이터랩에 그 문장을 넣으면 data:[] — 검색량이 측정 하한 미만이다.
 * 아무도 검색하지 않는 문장으로 1위를 하고 "노출 성공" 으로 기록됐다.
 *
 * 계약: 잴 수 없으면 재지 않는다. 제목을 키워드로 둔갑시키지 않는다.
 * 측정 불가를 "성공" 으로 적는 것은 데이터가 아니라 잡음이고, 잡음은 없는 것만 못하다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { getPostsNeedingExposureCheck, type PublishedPost } from '../analytics/publishedPostTracker';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const live = (p: string, needle: string): number => src(p)
  .split(String.fromCharCode(10))
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
  .filter((l) => l.includes(needle))
  .length;

const post = (id: string, keyword: string): PublishedPost => ({
  id, publishedAt: '2026-09-09T10:00:00.000Z', keyword, mode: 'seo',
  blogId: 'b', logNo: id, url: `https://blog.naver.com/b/${id}`, title: '어떤 제목입니다',
  evaluator: { finalScore: 80, modeScore: 80, safetyScore: 80, humanlikeScore: 80, decision: 'pass', details: {} },
  exposureChecks: [],
});

describe('키워드 없는 글은 노출 측정 대상이 아니다', () => {
  const now = new Date('2026-09-10T10:00:00.000Z').getTime();

  it('키워드가 비면 노출 체크를 하지 않는다', () => {
    const ids = getPostsNeedingExposureCheck([post('a', ''), post('b', '전기요금 폭탄')], 24, now).map((p) => p.id);
    expect(ids).toEqual(['b']);
  });

  it('공백만 있어도 측정하지 않는다', () => {
    expect(getPostsNeedingExposureCheck([post('a', '   ')], 24, now)).toEqual([]);
  });

  it('정상 키워드는 종전대로 측정한다', () => {
    expect(getPostsNeedingExposureCheck([post('a', '근로장려금 안내문 안옴')], 24, now).map((p) => p.id)).toEqual(['a']);
  });
});

describe('발행 기록 배선 핀', () => {
  it('키워드 자리에 제목을 넣지 않는다', () => {
    expect(live('../contentPolicy/policyService.ts', 'primary_keyword || draft.title')).toBe(0);
  });

  it('키워드가 없으면 빈 값으로 남긴다 — 측정 불가는 측정 불가로 적는다', () => {
    expect(src('../contentPolicy/policyService.ts')).toMatch(/primary_keyword\b[^\n]*\|\|\s*''/);
  });
});
