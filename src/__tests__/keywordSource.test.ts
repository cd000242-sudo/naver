/**
 * [2026-11-08] Step 1 of the exposure-measurement plan — keyword provenance.
 *
 * 122 of 153 posts since 9/16 were tracked with "search keyword = title" because the generator fills the
 * keyword slot with the title when the keyword field is empty, and the recorder trusted that value.
 * Contract: only a keyword that came from the keyword field, a LEWORD pick or a scheduled job is a
 * ranking keyword. Everything else is recorded as source "none" / kind "index-only" — never as a keyword.
 */
import { describe, it, expect } from 'vitest';
import {
  NO_TRACKING_KEYWORD,
  finalizeTrackingKeyword,
  parseTrackingKeywordFact,
} from '../analytics/trackingKeyword';

const TITLE = '제네시스 생산 중단, 11월 3일 재가동됐고 G80 하이브리드는 변수';

describe('parseTrackingKeywordFact — validates what travels in the payload', () => {
  it('accepts the three real origins', () => {
    for (const source of ['user-input', 'leword', 'schedule-job'] as const) {
      expect(parseTrackingKeywordFact({ value: ' 전기요금 폭탄 ', source })).toEqual({ value: '전기요금 폭탄', source });
    }
  });

  it('rejects anything that is not a known origin or has no value', () => {
    expect(parseTrackingKeywordFact(null)).toBeNull();
    expect(parseTrackingKeywordFact('전기요금')).toBeNull();
    expect(parseTrackingKeywordFact({ value: '전기요금', source: 'title' })).toBeNull();
    expect(parseTrackingKeywordFact({ value: '   ', source: 'user-input' })).toBeNull();
    expect(parseTrackingKeywordFact({ value: '전기요금', source: 'none' })).toBeNull();
    expect(parseTrackingKeywordFact({ value: 42, source: 'user-input' })).toBeNull();
  });

  it('rejects an absurdly long value instead of storing a paragraph', () => {
    expect(parseTrackingKeywordFact({ value: '가'.repeat(101), source: 'user-input' })).toBeNull();
  });
});

describe('finalizeTrackingKeyword — source + kind, never the title', () => {
  it('a short field keyword is an exposure keyword and keeps its origin', () => {
    expect(finalizeTrackingKeyword({ value: '제네시스 생산 중단', source: 'user-input' }, TITLE))
      .toEqual({ value: '제네시스 생산 중단', source: 'user-input', kind: 'exposure' });
    expect(finalizeTrackingKeyword({ value: '가상자산 과세 유예', source: 'leword' }, TITLE).source).toBe('leword');
    expect(finalizeTrackingKeyword({ value: '가상자산 과세 유예', source: 'schedule-job' }, TITLE).source).toBe('schedule-job');
  });

  it('no fact at all is "none" / index-only with no keyword value', () => {
    expect(finalizeTrackingKeyword(undefined, TITLE)).toEqual(NO_TRACKING_KEYWORD);
    expect(NO_TRACKING_KEYWORD).toEqual({ value: null, source: 'none', kind: 'index-only' });
  });

  it('a keyword that equals the title is the title passed off as a keyword — recorded as none', () => {
    expect(finalizeTrackingKeyword({ value: TITLE, source: 'user-input' }, TITLE)).toEqual(NO_TRACKING_KEYWORD);
    expect(finalizeTrackingKeyword({ value: ` ${TITLE.replace(/ /g, '  ')} `, source: 'user-input' }, TITLE))
      .toEqual(NO_TRACKING_KEYWORD);
  });

  it('a sentence-like keyword the user really typed stays visible but is index-only (not a ranking row)', () => {
    const sentence = '전기요금이 갑자기 올랐을 때 먼저 확인할 세 가지';
    expect(finalizeTrackingKeyword({ value: sentence, source: 'user-input' }, TITLE))
      .toEqual({ value: sentence, source: 'user-input', kind: 'index-only' });
  });

  it('an invalid fact degrades to none instead of throwing', () => {
    expect(finalizeTrackingKeyword({ value: '전기요금', source: 'bogus' }, TITLE)).toEqual(NO_TRACKING_KEYWORD);
    expect(finalizeTrackingKeyword(12 as unknown, TITLE)).toEqual(NO_TRACKING_KEYWORD);
  });

  it('works without a title (title unknown cannot make a keyword fake)', () => {
    expect(finalizeTrackingKeyword({ value: '전기요금 폭탄', source: 'user-input' }, '')).toMatchObject({ kind: 'exposure' });
  });
});
