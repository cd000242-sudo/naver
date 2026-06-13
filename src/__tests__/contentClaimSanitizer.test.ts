import { describe, expect, it } from 'vitest';
import {
  sanitizeStructuredContentClaims,
  sanitizeUnverifiedOfficialGuideClaims,
} from '../contentClaimSanitizer';

describe('contentClaimSanitizer', () => {
  it('removes unverified official/latest guide authority phrases', () => {
    expect(sanitizeUnverifiedOfficialGuideClaims('2026년 공식 가이드에서는 실내 환기가 필요합니다.')).toBe('실내 환기가 필요합니다.');
    expect(sanitizeUnverifiedOfficialGuideClaims('최신 가이드 기준으로는 필터 청소가 중요합니다.')).toBe('필터 청소가 중요합니다.');
    expect(sanitizeUnverifiedOfficialGuideClaims('공식 매뉴얼에 따르면 주 1회 점검합니다.')).toBe('주 1회 점검합니다.');
    expect(sanitizeUnverifiedOfficialGuideClaims('공식 지침은 상황별 확인이 필요합니다.')).toBe('상황별 확인이 필요합니다.');
  });

  it('sanitizes claim phrases across structured content fields and headings immutably per heading', () => {
    const content: any = {
      bodyPlain: '공식 가이드에서는 본문입니다.',
      bodyHtml: '최신 가이드에서는 HTML입니다.',
      content: '공식 매뉴얼 기준으로는 콘텐츠입니다.',
      introduction: '2026년 공식 지침에서는 도입입니다.',
      conclusion: '마무리는 그대로입니다.',
      headings: [
        {
          title: '제목',
          content: '공식 가이드에 따르면 소제목 내용입니다.',
          body: '최신 가이드 기준으로는 본문입니다.',
          summary: '공식 매뉴얼은 요약입니다.',
        },
      ],
    };

    const originalHeading = content.headings[0];
    sanitizeStructuredContentClaims(content);

    expect(content.bodyPlain).toBe('본문입니다.');
    expect(content.bodyHtml).toBe('HTML입니다.');
    expect(content.content).toBe('콘텐츠입니다.');
    expect(content.introduction).toBe('도입입니다.');
    expect(content.conclusion).toBe('마무리는 그대로입니다.');
    expect(content.headings[0]).not.toBe(originalHeading);
    expect(content.headings[0]).toMatchObject({
      title: '제목',
      content: '소제목 내용입니다.',
      body: '본문입니다.',
      summary: '요약입니다.',
    });
  });
});
