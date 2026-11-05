/**
 * [2026-11-05] 소제목 점검 — 저장된 생성 기록 77쌍(모델 소제목 vs 발행 소제목) + 키워드 75개 재현.
 *
 * SEO/메이트는 소제목 2개 앞에 키워드 핵심어를 붙이는데, 핵심어를 이렇게 뽑았다:
 *   "11월 6일까지 접수" 부산시 … → "6일까지"  (발행: "6일까지 동백전 앱 신청 경로")
 *   '게이 인기투표 1위' 손석구 …  → "게이"      (발행: 소제목 2개 앞에 "게이")
 *   2026 청년도약계좌 조건        → "2026"
 *   3140만원 신형 투싼 기본형     → "3140만원"
 *   (키워드 없음)                 → "키워드"
 * Quoted phrases are quotes/headlines and bracketed ones are notes — never the keyword's head noun.
 * A token that starts with a digit is a date, amount or count, not a topic.
 *
 * 홈판: "결승까지 가야 했던 조건" → "가야 했던 조건". The person-hook strip ("박지성까지 팬들이 꼽은")
 * also fired when "까지" meant "as far as" and the rest continued with a verb.
 */
import { describe, expect, it } from 'vitest';
import { applyHeadingKeywordPatch, resolveHeadingKeywordCore } from '../contentHeadingKeywordPatch';
import { stripLeadingSubjectHookFromHeadings } from '../contentTitlePrefixHelpers';

const core = (kw: string) => resolveHeadingKeywordCore(kw);

describe('heading keyword core skips quotes, brackets and numbers', () => {
  it('ignores a quoted date phrase in front of the topic', () => {
    expect(core('"11월 6일까지 접수" 부산시 소상공인 에너지바우처 신청 기간').core).toBe('부산시');
  });

  it('ignores quoted headline fragments', () => {
    expect(core('\'게이 인기투표 1위\' 손석구 "♥이서진 형님 좋아..내 과인 듯"').core).toBe('손석구');
  });

  it('skips tokens that start with a digit', () => {
    expect(core('2026 청년도약계좌 조건').core).toBe('청년도약계좌');
    expect(core('2026 셀토스 하이브리드 모의견적').core).toBe('셀토스');
    const amount = core('3140만원 신형 투싼 기본형');
    expect(amount.shouldPatch).toBe(true);
    expect(amount.core).not.toMatch(/^\d/u);
  });

  it('does not patch when nothing usable is left', () => {
    expect(core('(키워드 없음)').shouldPatch).toBe(false);
    expect(core('2026').shouldPatch).toBe(false);
    expect(core('"11월 6일"').shouldPatch).toBe(false);
  });

  it('still reads a keyword that is entirely quoted', () => {
    expect(core('"청년도약계좌"').core).toBe('청년도약계좌');
  });

  it('keeps ordinary keywords unchanged (control)', () => {
    expect(core('청약통장 금리').core).toBe('청약통장');
    expect(core('국민취업지원제도').core).toBe('국민취업지원제도');
    expect(core('아시안게임 축구 결승전').core).toBe('아시안게임');
  });

  it('never prefixes a date fragment onto mate/SEO headings', () => {
    const headings = ['에너지바우처 접수 기간', '동백전 앱 신청처', '전기요금·차량연료비 사용처'].map((title) => ({ title }));
    const result = applyHeadingKeywordPatch(headings, '"11월 6일까지 접수" 부산시 소상공인 에너지바우처 신청 기간', { maxPatches: 2 });
    expect(result.headings.map((h) => h.title).some((t) => String(t).startsWith('6일까지'))).toBe(false);
  });
});

describe('person-hook strip keeps "까지" that means "as far as"', () => {
  const run = (titles: string[], selectedTitle: string, personCentric: boolean) => {
    const content: any = { selectedTitle, headings: titles.map((title) => ({ title, content: '' })) };
    stripLeadingSubjectHookFromHeadings(content, personCentric);
    return content.headings.map((h: any) => h.title);
  };

  it('keeps "결승까지 가야 했던 조건" in a sports post whose title mentions 결승', () => {
    expect(run(['결승까지 가야 했던 조건'], '사회인 야구팀에 졌던 한국, 결승까지 간 과정', true))
      .toEqual(['결승까지 가야 했던 조건']);
  });

  it('keeps it when the rest starts with a verb modifier', () => {
    expect(run(['박지성까지 나선 이유는 무엇일까'], '박지성 K-축구 혁신위', true))
      .toEqual(['박지성까지 나선 이유는 무엇일까']);
  });

  it('still strips the dangling person hook before a noun phrase (control)', () => {
    expect(run(['박지성까지 팬들이 꼽은 한국 축구 고질병, 이번엔 정말 해결될 수 있을까요?'], '박지성 K-축구 혁신위', true))
      .toEqual(['팬들이 꼽은 한국 축구 고질병, 이번엔 정말 해결될 수 있을까요?']);
  });
});
