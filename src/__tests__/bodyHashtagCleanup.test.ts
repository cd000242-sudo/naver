import { describe, expect, it } from 'vitest';
import {
  stripBodyHashtagBlocks,
  stripBodyHashtagsFromStructuredContent,
} from '../automation/bodyHashtagCleanup';

describe('body hashtag cleanup', () => {
  it('removes standalone hashtag lines from article body text only', () => {
    const input = [
      '첫 문단입니다.',
      '',
      '#박신혜 #둘째임신 #산책 #건강관리',
      '',
      '마지막 문단입니다.',
      '해시태그: #임산부운동 #안전한임신',
    ].join('\n');

    expect(stripBodyHashtagBlocks(input)).toBe(['첫 문단입니다.', '', '마지막 문단입니다.'].join('\n'));
  });

  it('keeps publish hashtags while stripping body/introduction/heading hashtag blocks immutably', () => {
    const structured: any = {
      bodyPlain: '본문입니다.\n#본문태그 #중복태그',
      introduction: '#인트로태그\n인트로입니다.',
      headings: [
        { title: '소제목', content: '소제목 본문\n#소제목태그 #태그' },
      ],
      conclusion: '마무리입니다.\n#마무리태그',
      hashtags: ['#본문태그', '#정상태그'],
    };

    const cleaned = stripBodyHashtagsFromStructuredContent(structured) as any;

    expect(cleaned).not.toBe(structured);
    expect(cleaned.bodyPlain).toBe('본문입니다.');
    expect(cleaned.introduction).toBe('인트로입니다.');
    expect(cleaned.headings[0].content).toBe('소제목 본문');
    expect(cleaned.conclusion).toBe('마무리입니다.');
    expect(cleaned.hashtags).toEqual(['#본문태그', '#정상태그']);
    expect(structured.bodyPlain).toContain('#본문태그');
  });
});
