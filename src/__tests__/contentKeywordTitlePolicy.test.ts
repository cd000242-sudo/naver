import { describe, expect, it } from 'vitest';
import { resolveKeywordAsTitleValue } from '../contentKeywordTitlePolicy';

describe('resolveKeywordAsTitleValue', () => {
  it('uses keywordForTitle verbatim when keyword-as-title is enabled', () => {
    expect(resolveKeywordAsTitleValue({
      useKeywordAsTitle: true,
      keywordForTitle: '조나단 악플 논란',
      title: 'AI가 만든 다른 제목',
      metadata: { keywords: ['조나단'] },
    })).toBe('조나단 악플 논란');
  });

  it('falls back to the user-entered title for single publish flows when keywordForTitle is empty', () => {
    expect(resolveKeywordAsTitleValue({
      useKeywordAsTitle: true,
      keywordForTitle: '',
      title: '조나단 악플',
      metadata: { keywords: ['조나단'] },
    })).toBe('조나단 악플');
  });

  it('returns an empty lock value when the option is off', () => {
    expect(resolveKeywordAsTitleValue({
      useKeywordAsTitle: false,
      keywordForTitle: '조나단 악플',
      title: '조나단 악플',
      metadata: { keywords: ['조나단'] },
    })).toBe('');
  });
});
