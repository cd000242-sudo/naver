import { describe, expect, it } from 'vitest';
import { META_CRITIQUE_PHRASES } from '../content/forbiddenPhrases.js';
import {
  sanitizeContentFakeSources,
  sanitizeContentHtmlTags,
  sanitizeContentMetaCritique,
  stripFakeSourcePhrases,
  stripMetaCritiqueLines,
} from '../contentSanitizers.js';

describe('contentSanitizers', () => {
  it('strips fake source phrases without swallowing adjacent words', () => {
    const result = stripFakeSourcePhrases('본 기사에 따르면 빨래 건조 시간이 줄어듭니다.');

    expect(result).toBe('빨래 건조 시간이 줄어듭니다.');
  });

  it('sanitizes fake source phrases across structured content fields', () => {
    const content = {
      selectedTitle: '공식 발표에 따르면 제목',
      introduction: '자료에 따르면 도입부입니다.',
      conclusion: '관계자에 따르면 결론입니다.',
      headings: [
        {
          title: '영상에서는 소제목',
          body: '외신 보도에 따르면 본문입니다.',
        },
      ],
    };

    expect(sanitizeContentFakeSources(content)).toBeGreaterThan(0);
    expect(content.selectedTitle).toBe('제목');
    expect(content.introduction).toBe('도입부입니다.');
    expect(content.conclusion).toBe('결론입니다.');
    expect(content.headings[0].title).toBe('소제목');
    expect(content.headings[0].body).toBe('본문입니다.');
  });

  it('removes html tags and decodes common entities before publish', () => {
    const content = {
      selectedTitle: '<h1>제목&nbsp;테스트</h1>',
      bodyPlain: '<div style="color:red">본문 &amp; 정리</div>\n\n\n<p>다음</p>',
      headings: [
        {
          title: '<b>소제목</b>',
          body: '<ul><li>목록</li></ul>',
        },
      ],
    };

    expect(sanitizeContentHtmlTags(content)).toBe(4);
    expect(content.selectedTitle).toBe('제목 테스트');
    expect(content.bodyPlain).toBe('본문 & 정리\n\n다음');
    expect(content.headings[0].title).toBe('소제목');
    expect(content.headings[0].body).toBe('목록');
  });

  it('removes self-check meta critique leakage while keeping normal sentences', () => {
    const metaPhrase = META_CRITIQUE_PHRASES[0];
    const result = stripMetaCritiqueLines(`${metaPhrase} 문장은 제거됩니다. 정상 문장은 남습니다.`);

    expect(result).toBe('정상 문장은 남습니다.');
  });

  it('sanitizes self-check meta critique leakage across content fields', () => {
    const metaPhrase = META_CRITIQUE_PHRASES[0];
    const content = {
      selectedTitle: `제목 ${metaPhrase}`,
      introduction: `${metaPhrase} 제거. 도입부 유지.`,
      headings: [
        {
          title: '정상 소제목',
          body: `${metaPhrase} 제거. 본문 유지.`,
        },
      ],
    };

    expect(sanitizeContentMetaCritique(content)).toBeGreaterThan(0);
    expect(content.introduction).toBe('도입부 유지.');
    expect(content.headings[0].body).toBe('본문 유지.');
  });
});
