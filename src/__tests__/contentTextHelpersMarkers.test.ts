import { describe, expect, it } from 'vitest';
import { removeOrdinalHeadingLabelsFromBody, stripInternalMarkers } from '../contentTextHelpers';

describe('contentTextHelpers marker cleanup', () => {
  it('removes internal prompt markers without touching normal body text', () => {
    expect(stripInternalMarkers('본문 [Article Content] 끝')).toBe('본문 끝');
    expect(stripInternalMarkers('가격은 만원이다 [자료3]. 추천한다 [자료].')).toBe('가격은 만원이다. 추천한다.');
    expect(stripInternalMarkers('일반 문장입니다.')).toBe('일반 문장입니다.');
  });

  it('removes AI-generated heading labels and formatting markers', () => {
    const cleaned = removeOrdinalHeadingLabelsFromBody('첫 번째 소제목: 이것은 **중요한** 내용입니다.');

    expect(cleaned).toBe('이것은 중요한 내용입니다.');
    expect(removeOrdinalHeadingLabelsFromBody('[공지] 실제 내용')).toBe('실제 내용');
    expect(removeOrdinalHeadingLabelsFromBody('<u>밑줄 텍스트</u>')).toBe('밑줄 텍스트');
  });
});
