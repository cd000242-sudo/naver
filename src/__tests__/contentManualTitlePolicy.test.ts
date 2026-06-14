import { describe, expect, it } from 'vitest';

import {
  applyManualTitleOverride,
  applyManualTitleOverrideInPlace,
  normalizeManualTitleOverride,
} from '../contentManualTitlePolicy.js';

describe('contentManualTitlePolicy', () => {
  it('normalizes a user-entered title without preserving accidental newlines', () => {
    expect(normalizeManualTitleOverride('  쇼핑커넥트\n사용자 제목\t테스트  ')).toBe('쇼핑커넥트 사용자 제목 테스트');
  });

  it('returns the original content when no manual title exists', () => {
    const content = { title: 'AI 제목', selectedTitle: 'AI 제목' };

    expect(applyManualTitleOverride(content, '')).toBe(content);
    expect(applyManualTitleOverride(content, '   ')).toBe(content);
  });

  it('locks every title surface to the manual title immutably', () => {
    const content = {
      title: 'AI 제목',
      selectedTitle: 'AI 추천 제목',
      titleAlternatives: ['AI 제목 1', 'AI 제목 2'],
      titleCandidates: [{ text: 'AI 제목 1', score: 88 }],
      headings: [{ title: '본문 소제목' }],
    };

    const result = applyManualTitleOverride(content, '사용자가 직접 정한 제목');

    expect(result).not.toBe(content);
    expect(result).toMatchObject({
      title: '사용자가 직접 정한 제목',
      selectedTitle: '사용자가 직접 정한 제목',
      manualTitleLocked: true,
      manualTitleValue: '사용자가 직접 정한 제목',
      titleAlternatives: ['사용자가 직접 정한 제목'],
      titleCandidates: [{ text: '사용자가 직접 정한 제목', score: 100, reasoning: '사용자 지정 제목' }],
    });
    expect(content.title).toBe('AI 제목');
  });

  it('keeps legacy mutable renderer call sites on the same policy', () => {
    const content: any = { title: 'AI 제목' };

    const result = applyManualTitleOverrideInPlace(content, '렌더러 제목');

    expect(result).toBe(content);
    expect(content.selectedTitle).toBe('렌더러 제목');
    expect(content.manualTitleLocked).toBe(true);
    expect(content.titleCandidates[0].reasoning).toBe('사용자 지정 제목');
  });
});
