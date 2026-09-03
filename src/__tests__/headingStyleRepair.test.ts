import { describe, expect, it } from 'vitest';

import {
  buildHeadingRepairPrompt,
  collectSentenceStyleHeadingIndexes,
  isHeadingRepairEligibleMode,
  parseHeadingRepairResponse,
  repairSentenceStyleHeadings,
} from '../content/headingStyleRepair';

/** [2026-09-03 라이브 224399815476] "출발 전엔 개화와 혼잡을 따로 봐야 해요" 같은 문장형 소제목 — 경고만 하고 발행됐다 */
describe('문장형 소제목 보정', () => {
  const headings = [
    { title: '9월 꽃구경 국내여행지의 순서', content: 'a' },
    { title: '출발 전엔 개화와 혼잡을 따로 봐야 해요', content: 'b' },
    { title: '거창에서는 노을까지 기다려도 돼요', content: 'c' },
  ];

  it('문장형 소제목만 고른다 · 쇼핑 모드는 제외', () => {
    expect(collectSentenceStyleHeadingIndexes(headings)).toEqual([1, 2]);
    expect(isHeadingRepairEligibleMode('seo')).toBe(true);
    expect(isHeadingRepairEligibleMode('custom')).toBe(true);
    expect(isHeadingRepairEligibleMode('affiliate')).toBe(false);
    expect(isHeadingRepairEligibleMode('homefeed')).toBe(false); // 홈판 계약은 서술형 이정표("이 조건에서 갈립니다")
  });

  it('프롬프트는 번호 목록 + JSON 배열 요구, 응답은 개수·형식 검증', () => {
    const prompt = buildHeadingRepairPrompt(['출발 전엔 개화와 혼잡을 따로 봐야 해요'], '9월 꽃구경 국내여행지');
    expect(prompt).toContain('1. 출발 전엔 개화와 혼잡을 따로 봐야 해요');
    expect(prompt).toContain('JSON 배열');
    expect(parseHeadingRepairResponse('["출발 전 개화·혼잡 확인 포인트", "거창 노을 시간대와 동선"]', 2)).toEqual(['출발 전 개화·혼잡 확인 포인트', '거창 노을 시간대와 동선']);
    expect(parseHeadingRepairResponse('["여전히 봐야 해요", "거창 노을"]', 2)).toBeNull();
    expect(parseHeadingRepairResponse('["하나만"]', 2)).toBeNull();
    expect(parseHeadingRepairResponse('말이 많은 응답', 2)).toBeNull();
  });

  it('보정 성공이면 해당 소제목만 바뀌고, 실패면 원본 그대로', async () => {
    const ok = await repairSentenceStyleHeadings({ headings }, { mode: 'custom', keyword: '9월 꽃구경 국내여행지' }, {
      complete: async () => '["출발 전 개화·혼잡 확인 포인트", "거창 노을까지 보는 동선"]',
    });
    expect(ok.headings.map((h) => h.title)).toEqual(['9월 꽃구경 국내여행지의 순서', '출발 전 개화·혼잡 확인 포인트', '거창 노을까지 보는 동선']);
    const failed = await repairSentenceStyleHeadings({ headings }, { mode: 'custom' }, { complete: async () => { throw new Error('OpenAI 500'); } });
    expect(failed).toEqual({ headings });
    const shop = await repairSentenceStyleHeadings({ headings }, { mode: 'affiliate' }, { complete: async () => '["x","y"]' });
    expect(shop).toEqual({ headings });
  });
});
