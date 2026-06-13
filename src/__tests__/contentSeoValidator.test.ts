import { describe, expect, it } from 'vitest';
import { validateSeoContent } from '../contentSeoValidator.js';

describe('contentSeoValidator', () => {
  it('does nothing outside seo mode', () => {
    const content: any = { selectedTitle: '짧은 제목', headings: [] };

    validateSeoContent(content, { contentMode: 'homefeed' });

    expect(content.quality).toBeUndefined();
  });

  it('adds actionable SEO warnings for weak generated content', () => {
    const content: any = {
      selectedTitle: '짧은 제목입니다',
      introduction: '도입부입니다.',
      bodyPlain: '물론 짧은 본문입니다.',
      headings: [
        { title: '첫 소제목', content: '같은 어미입니다. 같은 어미입니다. 같은 어미입니다.' },
      ],
      conclusion: '마무리입니다.',
    };

    validateSeoContent(content, {
      contentMode: 'seo',
      metadata: { keywords: ['제습기', '빨래'] },
    });

    expect(content.quality).toBeDefined();
    expect(content.quality.seoScore).toBeLessThan(100);
    expect(content.quality.warnings.join('\n')).toContain('제목 너무 짧음');
    expect(content.quality.warnings.join('\n')).toContain('AI티 표현');
  });
});
