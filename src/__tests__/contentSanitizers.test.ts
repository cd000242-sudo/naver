import { describe, expect, it } from 'vitest';
import { META_CRITIQUE_PHRASES } from '../content/forbiddenPhrases.js';
import {
  sanitizeContentFakeSourcesCopy,
  sanitizeContentFakeSources,
  sanitizeContentHtmlTags,
  sanitizeContentMetaCritique,
  sanitizePublishableSourceText,
  stripFakeSourcePhrases,
  stripInlineSourceMarkers,
  stripMetaCritiqueLines,
} from '../contentSanitizers.js';

describe('contentSanitizers', () => {
  it('strips fake source phrases without swallowing adjacent words', () => {
    const result = stripFakeSourcePhrases('본 기사에 따르면 빨래 건조 시간이 줄어듭니다.');

    expect(result).toBe('빨래 건조 시간이 줄어듭니다.');
  });

  it('removes bracketed source labels while preserving the surrounding claim', () => {
    expect(stripInlineSourceMarkers(
      "보험료 기준은 소득에 따라 달라집니다. [출처: 국민건강보험공단'대법원 판례 자료] 신청 전에 확인하세요.",
    )).toBe('보험료 기준은 소득에 따라 달라집니다. 신청 전에 확인하세요.');
    expect(stripInlineSourceMarkers('기준이 바뀌었습니다.[출처 : 보건복지부]')).toBe('기준이 바뀌었습니다.');
    expect(stripInlineSourceMarkers('국민건강보험공단 자료에 따르면 기준이 달라집니다.'))
      .toBe('국민건강보험공단 자료에 따르면 기준이 달라집니다.');
  });

  it('removes inline source labels from every publishable text field', () => {
    const content = {
      selectedTitle: '제목 [출처: 기관]',
      introduction: '도입 [출처 : 공식 자료]',
      bodyPlain: '전체 본문 [출처: 통계청]',
      bodyHtml: 'HTML 본문 [출처: 공공데이터포털]',
      conclusion: '결론 [출처: 연구 자료]',
      headings: [{
        title: '소제목 [출처: 기관]',
        body: '본문 [출처: 기관]',
        content: '내용 [출처: 기관]',
      }],
    };

    expect(sanitizeContentFakeSources(content)).toBeGreaterThan(0);
    expect(JSON.stringify(content)).not.toContain('[출처');
    expect(content.bodyPlain).toBe('전체 본문');
    expect(content.bodyHtml).toBe('HTML 본문');
  });

  it('creates a sanitized publish copy without mutating stored generated content', () => {
    const original = {
      selectedTitle: '제목 [출처: 기관]',
      bodyPlain: '본문 [출처: 국민건강보험공단]',
      headings: [{ title: '소제목', body: '내용 [출처: 공식 자료]' }],
    };

    const sanitized = sanitizeContentFakeSourcesCopy(original);

    expect(sanitized).not.toBe(original);
    expect(sanitized.headings).not.toBe(original.headings);
    expect(sanitized.bodyPlain).toBe('본문');
    expect(sanitized.headings[0].body).toBe('내용');
    expect(original.bodyPlain).toContain('[출처:');
    expect(sanitizePublishableSourceText('문장 [출처: 기관]')).toBe('문장');
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
