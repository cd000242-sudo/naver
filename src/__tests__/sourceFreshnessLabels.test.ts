import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import {
  parseNaverPostDate,
  monthsBetween,
  buildFreshnessLabel,
  withFreshnessLabel,
  isStaleSource,
  mergeRecentFirst,
  STALE_AFTER_MONTHS,
} from '../content/sourceFreshness';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-11] 작년 조건이 올해 글에 섞이던 문제 (Orbit 에서 먼저 드러남).
 *
 * "2026 부산 청년 게임개발자 정착지원사업" 글에 2024년 조건이 그대로 실렸다:
 *   임차보증금 이자 지원 · 선정 후 2주 계약 · 소득/주택소유 무관.
 * 원인은 모델이 아니라 재료였다 — 본문 수집이 sort=sim 이라 첫 시행 연도(2024)
 * 글이 상위로 오는데, API 가 주는 postdate 를 **버려서** 재료에 날짜가 없었다.
 */
const NOW = new Date('2026-08-11T00:00:00Z');

describe('parseNaverPostDate', () => {
  it('네이버 postdate(YYYYMMDD)를 ISO 로 바꾼다', () => {
    expect(parseNaverPostDate('20240315')).toBe('2024-03-15');
    expect(parseNaverPostDate('20260801')).toBe('2026-08-01');
  });

  it('형식이 아니면 빈 문자열 — 없는 날짜를 지어내지 않는다', () => {
    expect(parseNaverPostDate('')).toBe('');
    expect(parseNaverPostDate('2024')).toBe('');
    expect(parseNaverPostDate('20241332')).toBe('');
    expect(parseNaverPostDate(undefined)).toBe('');
  });
});

describe('시점 라벨', () => {
  it('최근 자료는 날짜만 붙인다', () => {
    const label = buildFreshnessLabel('2026-06-11', NOW);
    expect(label).toContain('2026-06-11 작성');
    expect(label).not.toContain('⚠️');
  });

  it('사고를 낸 2024년 자료에는 "그대로 옮기지 말라"고 붙인다', () => {
    const label = buildFreshnessLabel('2024-03-15', NOW);
    expect(label).toContain('2년 5개월 전');
    expect(label).toContain('⚠️');
    expect(label).toContain('옮기지 마세요');
  });

  it('경계는 12개월', () => {
    expect(isStaleSource('2025-08-11', NOW)).toBe(true);
    expect(isStaleSource('2025-09-11', NOW)).toBe(false);
    expect(STALE_AFTER_MONTHS).toBe(12);
  });

  it('날짜를 모르면 원문 그대로 (동작 후퇴 없음)', () => {
    expect(buildFreshnessLabel('', NOW)).toBe('');
    expect(withFreshnessLabel('본문입니다', '', NOW)).toBe('본문입니다');
    expect(monthsBetween('2027-01-01', NOW)).toBe(0);
  });

  it('본문 앞에 시점을 박는다', () => {
    const out = withFreshnessLabel('임차보증금 이자와 월세의 최대 50%', '2024-03-15', NOW);
    expect(out.startsWith('[2024-03-15 작성')).toBe(true);
    expect(out).toContain('임차보증금 이자');
  });
});

describe('mergeRecentFirst — 오래된 글 독점 방지', () => {
  const item = (id: string) => ({ link: `https://blog.naver.com/x/${id}` });
  const key = (r: { link: string }) => r.link;

  it('최신을 앞에 두고 유사도로 나머지를 채운다', () => {
    const recent = [item('r1'), item('r2'), item('r3')];
    const similar = [item('s1'), item('s2'), item('s3')];
    const merged = mergeRecentFirst(recent, similar, 4, key);

    expect(merged).toHaveLength(4);
    // 최신 쪽에 하나 더 준다(4건이면 2건) — 틀린 정보의 비용이 관련성 저하보다 크다
    expect(merged.slice(0, 2)).toEqual([recent[0], recent[1]]);
    expect(merged).toContain(similar[0]);
  });

  it('중복 링크는 한 번만 넣는다', () => {
    const shared = item('same');
    const merged = mergeRecentFirst([shared], [shared, item('s1')], 3, key);
    expect(merged.filter((m) => m.link === shared.link)).toHaveLength(1);
  });

  it('최신이 없으면 유사도만으로 채운다 (검색 실패해도 후퇴 없음)', () => {
    const similar = [item('s1'), item('s2')];
    expect(mergeRecentFirst([], similar, 5, key)).toEqual(similar);
  });
});

describe('배선', () => {
  const assembler = read('sourceAssembler.ts');
  const promptFormat = read('contentJsonPromptFormat.ts');

  it('검색 결과가 postdate 를 보존한다 (예전엔 버렸다)', () => {
    expect(assembler).toContain('postdate: typeof item.postdate');
    expect(assembler).toMatch(/interface NaverSearchResult[\s\S]{0,400}postdate\?: string/);
  });

  it('본문 수집이 최신순을 섞는다 (sim 단독 금지)', () => {
    // [2026-09-01] 호출 인자까지 통째로 박제했더니, 검색어 변수명이 바뀌자
    //   ('keyword' -> 'searchKeyword', 문장형 키워드 좁힘) 의도와 무관하게 깨졌다.
    //   이 테스트의 뜻은 "date 정렬을 함께 긁는가" 하나다. 그것만 본다.
    expect(assembler).toMatch(/searchNaverForContent\([^)]*'blog',\s*8,\s*'date'\)/u);
    expect(assembler).toContain('mergeRecentFirst(recentBlogs, blogLinks');
  });

  it('발췌마다 시점 라벨을 붙인다', () => {
    expect(assembler).toContain('withFreshnessLabel(excerpt, parseNaverPostDate(candidate.postdate))');
  });

  it('모델에게 라벨을 어떻게 다룰지 알려준다', () => {
    expect(promptFormat).toContain('작성]');
    expect(promptFormat).toContain('가장 최근 자료를 따른다');
    expect(promptFormat).toContain('빼는 것이 틀리는 것보다 낫다');
  });
});
