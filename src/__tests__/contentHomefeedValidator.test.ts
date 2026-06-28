import { describe, expect, it } from 'vitest';
import { validateHomefeedContent } from '../contentHomefeedValidator.js';

const baseQuality = () => ({
  aiDetectionRisk: 'low' as const,
  legalRisk: 'safe' as const,
  seoScore: 70,
  originalityScore: 70,
  readabilityScore: 70,
  warnings: [] as string[],
});

describe('contentHomefeedValidator', () => {
  it('runs sanitizers even when source mode is not homefeed', () => {
    const content = {
      selectedTitle: '<h1>Title&nbsp;Test</h1>',
      introduction: 'According to the input source, this is the intro.',
      headings: [],
      quality: baseQuality(),
    };

    const result = validateHomefeedContent(content, { contentMode: 'seo' });

    expect(result).toEqual({ hasCritical: false, violations: [] });
    expect(content.selectedTitle).toBe('Title Test');
    expect(content.introduction).toBe('According to the input source, this is the intro.');
  });

  it('does not mutate generated headings when homefeed headings are too short', () => {
    const content = {
      selectedTitle: 'A vivid homefeed title with a real angle',
      introduction: 'Short intro.',
      conclusion: 'Final note.',
      bodyPlain: '생활팁 '.repeat(30),
      headings: [
        {
          title: 'Only existing heading',
          content: 'Existing body.',
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

    expect(content.headings.length).toBe(1);
    expect(content.headings[0].title).toBe('Only existing heading');
    expect(content.quality.warnings.length).toBeGreaterThan(0);
  });
});
