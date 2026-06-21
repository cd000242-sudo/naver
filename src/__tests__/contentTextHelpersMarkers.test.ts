import { describe, expect, it } from 'vitest';
import { removeOrdinalHeadingLabelsFromBody, stripInternalMarkers } from '../contentTextHelpers';

describe('contentTextHelpers marker cleanup', () => {
  it('removes internal prompt markers without touching normal body text', () => {
    expect(stripInternalMarkers('본문 [Article Content] 끝')).toBe('본문 끝');
    expect(stripInternalMarkers('가격은 만원이다 [자료3]. 추천한다 [자료].')).toBe('가격은 만원이다. 추천한다.');
    expect(stripInternalMarkers('일반 문장입니다.')).toBe('일반 문장입니다.');
  });

  it('strips agent-injected full-date "기준" framing but keeps year-only and source dates', () => {
    // codex 등이 환경 날짜로 박는 "YYYY-MM-DD 기준" / "YYYY년 M월 D일 기준" 제거
    expect(stripInternalMarkers('2026-06-21 기준 핵심은 사용처입니다.')).toBe('핵심은 사용처입니다.');
    expect(stripInternalMarkers('2026년 6월 21일 기준, 대상은 19세입니다.')).toBe('대상은 19세입니다.');
    // 연도만 있는 "2026년 기준"은 보존(자료 근거 연도 표기)
    expect(stripInternalMarkers('2026년 기준으로 19~20세 대상입니다.')).toBe('2026년 기준으로 19~20세 대상입니다.');
    // 자료의 실제 날짜(기준 아님)는 보존
    expect(stripInternalMarkers('환급은 5월 25일 마감입니다.')).toBe('환급은 5월 25일 마감입니다.');
  });

  it('removes AI-generated heading labels and formatting markers', () => {
    const cleaned = removeOrdinalHeadingLabelsFromBody('첫 번째 소제목: 이것은 **중요한** 내용입니다.');

    expect(cleaned).toBe('이것은 중요한 내용입니다.');
    expect(removeOrdinalHeadingLabelsFromBody('[공지] 실제 내용')).toBe('실제 내용');
    expect(removeOrdinalHeadingLabelsFromBody('<u>밑줄 텍스트</u>')).toBe('밑줄 텍스트');
  });
});
