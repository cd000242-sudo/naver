import { describe, expect, it } from 'vitest';
import { validateHomefeedContent } from '../contentHomefeedValidator.js';

const baseQuality = () => ({
  aiDetectionRisk: 'low' as const,
  legalRisk: 'safe' as const,
  seoScore: 70,
  originalityScore: 70,
  readabilityScore: 70,
  warnings: [],
});

describe('contentHomefeedValidator', () => {
  it('runs sanitizers even when source mode is not homefeed', () => {
    const content = {
      selectedTitle: '<h1>제목&nbsp;테스트</h1>',
      introduction: '본 기사에 따르면 도입부입니다.',
      headings: [],
      quality: baseQuality(),
    };

    const result = validateHomefeedContent(content, { contentMode: 'seo' });

    expect(result).toEqual({ hasCritical: false, violations: [] });
    expect(content.selectedTitle).toBe('제목 테스트');
    expect(content.introduction).toBe('도입부입니다.');
  });

  it('adds topic-related fallback headings when homefeed headings are too short', () => {
    const content = {
      selectedTitle: '충격 반전 진짜 직접 확인한 생활 팁 모음',
      introduction: '도입부입니다.',
      conclusion: '마무리입니다.',
      bodyPlain: '생활팁 '.repeat(30),
      headings: [
        {
          title: '첫 번째 소제목',
          content: '첫 번째 본문입니다.',
          summary: '',
          keywords: [],
          imagePrompt: '',
        },
      ],
      quality: baseQuality(),
    };

    validateHomefeedContent(content, {
      contentMode: 'homefeed',
      metadata: { keywords: ['생활팁'] },
    });

    expect(content.headings.length).toBe(3);
    expect(content.headings[1].title).toContain('생활팁');
    expect(content.quality.warnings.some((warning) => warning.includes('소제목 1개'))).toBe(true);
  });
});
