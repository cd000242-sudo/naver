/**
 * SPEC-CONVERSION-001 L3-3.2 — keywordImagePromptBuilder 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import { buildKeywordImagePrompt } from '../image/keywordImagePromptBuilder';
import type { ExtractedKeyword } from '../content/keywordExtractor';

const concrete = (term: string, score = 10): ExtractedKeyword => ({
  term, score, count: score, inTitle: false, visualHint: 'concrete',
});
const abstract = (term: string, score = 10): ExtractedKeyword => ({
  term, score, count: score, inTitle: false, visualHint: 'abstract',
});
const unknown = (term: string, score = 10): ExtractedKeyword => ({
  term, score, count: score, inTitle: false, visualHint: 'unknown',
});

describe('buildKeywordImagePrompt — 정상', () => {
  it('영어 변환 + composition 추가', () => {
    const r = buildKeywordImagePrompt({
      keywords: [concrete('카페'), concrete('인테리어')],
    });
    expect(r.prompt).toContain('cafe');
    expect(r.prompt).toContain('interior');
    expect(r.prompt).toContain('clean composition');
    expect(r.lang).toBe('en');
  });

  it('한국어 모드', () => {
    const r = buildKeywordImagePrompt({
      keywords: [concrete('카페'), concrete('인테리어')],
      lang: 'ko',
    });
    expect(r.prompt).toContain('카페');
    expect(r.prompt).toContain('인테리어');
    expect(r.prompt).toContain('자연광');
  });

  it('headingHint prefix', () => {
    const r = buildKeywordImagePrompt({
      keywords: [concrete('카페')],
      headingHint: '강남 카페',
    });
    expect(r.prompt.startsWith('강남 카페,')).toBe(true);
  });

  it('preferConcrete=true (기본): abstract 키워드 skipped 목록에 들어감', () => {
    const r = buildKeywordImagePrompt({
      keywords: [concrete('카페'), abstract('만족감'), concrete('메뉴')],
    });
    expect(r.usedKeywords).toContain('카페');
    expect(r.usedKeywords).toContain('메뉴');
    expect(r.usedKeywords).not.toContain('만족감');
    expect(r.skippedAbstract).toContain('만족감');
  });

  it('maxKeywords 제한', () => {
    const r = buildKeywordImagePrompt({
      keywords: [concrete('a'), concrete('b'), concrete('c'), concrete('d'), concrete('e')],
      maxKeywords: 2,
    });
    expect(r.usedKeywords).toHaveLength(2);
  });

  it('영어 사전 미매핑 한글은 그대로 유지', () => {
    const r = buildKeywordImagePrompt({
      keywords: [concrete('생소한단어')],
    });
    expect(r.prompt).toContain('생소한단어');
  });

  it('unknown 힌트도 used에 포함 (concrete 다음 우선순위)', () => {
    const r = buildKeywordImagePrompt({
      keywords: [unknown('애매')],
    });
    expect(r.usedKeywords).toContain('애매');
  });
});

describe('buildKeywordImagePrompt — fallback', () => {
  it('빈 키워드는 빈 프롬프트 + reason', () => {
    const r = buildKeywordImagePrompt({ keywords: [] });
    expect(r.prompt).toBe('');
    expect(r.fallbackReason).toMatch(/KEYWORDS_EMPTY/);
  });

  it('preferConcrete=true이고 abstract만 있으면 NO_VISUAL_KEYWORDS', () => {
    const r = buildKeywordImagePrompt({
      keywords: [abstract('만족감'), abstract('느낌')],
    });
    expect(r.prompt).toBe('');
    expect(r.fallbackReason).toMatch(/NO_VISUAL_KEYWORDS/);
  });

  it('preferConcrete=false면 abstract도 사용', () => {
    const r = buildKeywordImagePrompt({
      keywords: [abstract('만족감')],
      preferConcrete: false,
    });
    expect(r.prompt).toContain('만족감');
  });
});
