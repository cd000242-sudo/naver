import { describe, expect, it } from 'vitest';
import {
  buildKeywordInferencePrompt,
  parseKeywordCandidates,
  pickPrimaryKeyword,
} from '../content/urlModeKeywordPicker';

/**
 * [2026-08-23] 사용자 실측: 특별재난지역 기사 URL을 SEO 모드로 넣으니
 *   "거제 통영 특별재난지역, 통영은 왜 2곳만 먼저인가" — 기사 제목을 흉내 낸 제목이 나왔다.
 *   정작 그때 검색량이 오르던 말은 "재난지원금"이었다.
 *   원인: SEO 강제 로직이 metadata.keywords[0]에 매여 있는데 URL 입력엔 그게 비어 있었다.
 */
describe('URL 모드 키워드 후보 파싱', () => {
  it('JSON 배열을 읽는다', () => {
    expect(parseKeywordCandidates('["재난지원금","특별재난지역","거제 폭우"]'))
      .toEqual(['재난지원금', '특별재난지역', '거제 폭우']);
  });

  it('코드펜스로 감싼 JSON도 읽는다', () => {
    expect(parseKeywordCandidates('```json\n["재난지원금","통영 침수"]\n```'))
      .toEqual(['재난지원금', '통영 침수']);
  });

  it('줄바꿈·번호·불릿 목록도 읽는다', () => {
    expect(parseKeywordCandidates('1. 재난지원금\n- 특별재난지역\n• 거제 폭우'))
      .toEqual(['재난지원금', '특별재난지역', '거제 폭우']);
  });

  it('실제 배열 입력을 그대로 받는다', () => {
    expect(parseKeywordCandidates(['재난지원금', '재난지원금', '특별재난지역']))
      .toEqual(['재난지원금', '특별재난지역']);
  });

  it('잡토큰과 길이 이탈은 버린다', () => {
    const got = parseKeywordCandidates('["2026","기자","연합뉴스","재난지원금","' + '가'.repeat(21) + '"]');
    expect(got).toEqual(['재난지원금']);
  });

  it('최대 5개까지만 남긴다', () => {
    const got = parseKeywordCandidates(['가나', '다라', '마바', '사아', '자차', '카타']);
    expect(got).toHaveLength(5);
  });

  it('빈 응답은 빈 배열', () => {
    expect(parseKeywordCandidates('')).toEqual([]);
    expect(parseKeywordCandidates(null)).toEqual([]);
    expect(parseKeywordCandidates(undefined)).toEqual([]);
  });
});

describe('검색량으로 확정', () => {
  const candidates = ['특별재난지역', '재난지원금', '거제 폭우'];

  it('검색량이 가장 많은 후보를 고른다 — 모델 1순위가 아니라', () => {
    const pick = pickPrimaryKeyword(candidates, [
      { keyword: '특별재난지역', monthlySearches: 8_100 },
      { keyword: '재난지원금', monthlySearches: 74_000 },
      { keyword: '거제 폭우', monthlySearches: 1_200 },
    ]);
    expect(pick.keyword).toBe('재난지원금');
    expect(pick.decidedBy).toBe('search-volume');
    expect(pick.monthlySearches).toBe(74_000);
  });

  it('검색량을 하나도 못 구하면 모델 1순위로 간다 (조용히 미선정되지 않는다)', () => {
    const pick = pickPrimaryKeyword(candidates, []);
    expect(pick.keyword).toBe('특별재난지역');
    expect(pick.decidedBy).toBe('llm-first');
    expect(pick.monthlySearches).toBeNull();
  });

  it('0 이하 검색량은 조회 실패로 보고 무시한다', () => {
    const pick = pickPrimaryKeyword(candidates, [
      { keyword: '특별재난지역', monthlySearches: 0 },
      { keyword: '재난지원금', monthlySearches: null },
    ]);
    expect(pick.decidedBy).toBe('llm-first');
  });

  it('일부만 조회돼도 조회된 것 중 최대를 고른다', () => {
    const pick = pickPrimaryKeyword(candidates, [
      { keyword: '거제 폭우', monthlySearches: 1_200 },
    ]);
    expect(pick.keyword).toBe('거제 폭우');
    expect(pick.decidedBy).toBe('search-volume');
  });

  it('후보가 없으면 미선정 — 기존 동작 그대로 둔다', () => {
    const pick = pickPrimaryKeyword([], [{ keyword: '재난지원금', monthlySearches: 74_000 }]);
    expect(pick.keyword).toBe('');
    expect(pick.decidedBy).toBe('none');
  });
});

describe('추론 프롬프트', () => {
  it('기사 제목 답습을 금지하고 JSON 배열만 요구한다', () => {
    const prompt = buildKeywordInferencePrompt('본문'.repeat(50), '거제·통영 특별재난지역 선포');
    expect(prompt).toContain('네이버 검색창에 실제로 칠 말');
    expect(prompt).toContain('기사 제목을 그대로 쓰지 마라');
    expect(prompt).toContain('JSON 배열만 출력하라');
    expect(prompt).toContain('거제·통영 특별재난지역 선포');
  });

  it('원문은 4000자로 잘라 넣는다 (프롬프트 폭주 차단)', () => {
    const prompt = buildKeywordInferencePrompt('가'.repeat(10_000));
    expect(prompt.length).toBeLessThan(4_600);
  });
});
