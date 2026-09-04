import { describe, expect, it } from 'vitest';

import {
  buildHeadingRepairPrompt,
  collectSentenceStyleHeadingIndexes,
  isFragmentHeadingTitle,
  isHeadingRepairEligibleMode,
  selectHeadingRepairTargets,
  sentenceStyleAllowance,
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
    // [2026-09-04 실측 24편] 홈판도 대상이다 — 계약이 허용한 서술형 이정표가 편당 4/5까지 늘어 전부 같은 꼴이 됐다.
    expect(isHeadingRepairEligibleMode('homefeed')).toBe(true);
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


/**
 * [2026-09-04 실측] SEO 44개 소제목 중 서술형 0개, 홈판은 4/7·4/6·4/5·3/5.
 * 홈판은 서술형을 절반까지 남기고 초과분만 고친다. 조각("의 출발점")은 전 모드에서 고친다.
 */
describe('모드별 서술형 허용치와 보정 대상', () => {
  const homefeed = [
    { title: '먼저, 지역 사업 기준부터 나눠 봐야 해요' },
    { title: '나이·무주택·소득을 같이 충족해야 합니다' },
    { title: '월세가 60만 원을 넘는 계약이라면' },
    { title: '이미 받는 주거비 지원이 있다면 먼저 멈춰야 해요' },
    { title: '신청 순서와 준비 서류' },
  ];

  it('홈판은 절반까지 허용, 검색 모드는 0', () => {
    expect(sentenceStyleAllowance('homefeed', 5)).toBe(2);
    expect(sentenceStyleAllowance('homefeed', 6)).toBe(3);
    expect(sentenceStyleAllowance('seo', 6)).toBe(0);
    expect(sentenceStyleAllowance('custom', 6)).toBe(0);
  });

  it('홈판은 초과분만, 앞쪽 이정표는 남긴다', () => {
    expect(collectSentenceStyleHeadingIndexes(homefeed)).toEqual([0, 1, 3]);
    expect(selectHeadingRepairTargets(homefeed, 'homefeed')).toEqual([3]);
    expect(selectHeadingRepairTargets(homefeed, 'seo')).toEqual([0, 1, 3]);
  });

  it('조각 소제목은 모드와 무관하게 대상, 정상 명사구는 아니다', () => {
    expect(isFragmentHeadingTitle('의 출발점')).toBe(true);
    expect(isFragmentHeadingTitle('과 보장 범위')).toBe(true);
    expect(isFragmentHeadingTitle('세 가지')).toBe(true);
    expect(isFragmentHeadingTitle('신청 순서와 준비 서류')).toBe(false);
    expect(isFragmentHeadingTitle('9월 꽃구경 국내여행지의 순서')).toBe(false);
    const withFragment = [{ title: '의 출발점' }, { title: '보증금 한도와 계약기간' }, { title: '잔금일 뒤 신청 순서' }];
    expect(selectHeadingRepairTargets(withFragment, 'homefeed')).toEqual([0]);
    expect(selectHeadingRepairTargets(withFragment, 'seo')).toEqual([0]);
  });

  it('홈판 프롬프트는 검색 목차형 라벨을 금지하고 키워드 강제 문구를 쓰지 않는다', () => {
    const feed = buildHeadingRepairPrompt(['이미 받는 지원이 있다면 먼저 멈춰야 해요'], '청년월세지원', 'homefeed');
    expect(feed).toContain('검색 목차형 라벨');
    expect(feed).not.toContain('메인 키워드');
    const search = buildHeadingRepairPrompt(['출발 전엔 개화와 혼잡을 따로 봐야 해요'], '9월 꽃구경', 'seo');
    expect(search).toContain('메인 키워드');
    expect(search).not.toContain('검색 목차형 라벨');
  });

  it('홈판 보정은 초과분 소제목만 바꾼다', async () => {
    const out = await repairSentenceStyleHeadings({ headings: homefeed }, { mode: 'homefeed', keyword: '청년월세지원' }, {
      complete: async () => '["이미 받는 주거비 지원이 있다면"]',
    });
    expect(out.headings.map((h) => h.title)).toEqual([
      '먼저, 지역 사업 기준부터 나눠 봐야 해요',
      '나이·무주택·소득을 같이 충족해야 합니다',
      '월세가 60만 원을 넘는 계약이라면',
      '이미 받는 주거비 지원이 있다면',
      '신청 순서와 준비 서류',
    ]);
  });
});
