import { describe, it, expect } from 'vitest';
import { stripAllFormatting, removeOrdinalHeadingLabelsFromBody } from '../contentGenerator';

describe('stripAllFormatting', () => {
  it('removes **bold** markdown', () => {
    expect(stripAllFormatting('이것은 **중요한** 텍스트입니다')).toBe('이것은 중요한 텍스트입니다');
  });

  it('removes nested **bold** patterns', () => {
    expect(stripAllFormatting('**outer **inner** text**')).toBe('outer inner text');
  });

  it('removes __underline__ markdown', () => {
    expect(stripAllFormatting('__밑줄__ 텍스트')).toBe('밑줄 텍스트');
  });

  it('removes *italic* markdown', () => {
    expect(stripAllFormatting('*이탤릭* 텍스트')).toBe('이탤릭 텍스트');
  });

  it('removes <u>underline</u> HTML tags', () => {
    expect(stripAllFormatting('<u>밑줄</u> 텍스트')).toBe('밑줄 텍스트');
  });

  it('removes <b>, <i>, <strong>, <em> HTML tags', () => {
    expect(stripAllFormatting('<b>볼드</b> <i>이탤릭</i> <strong>강조</strong> <em>엠</em>')).toBe('볼드 이탤릭 강조 엠');
  });

  it('removes <mark>, <span>, <font> tags', () => {
    expect(stripAllFormatting('<mark>하이라이트</mark> <span style="color:red">빨간</span>')).toBe('하이라이트 빨간');
  });

  it('removes AI citation numbers [1], [2, 3]', () => {
    expect(stripAllFormatting('연구 결과에 따르면 [1] 이 방법이 효과적이다 [2, 3]')).toBe('연구 결과에 따르면 이 방법이 효과적이다');
  });

  it('handles empty string', () => {
    expect(stripAllFormatting('')).toBe('');
  });

  it('handles null/undefined gracefully', () => {
    expect(stripAllFormatting(null as any)).toBe(null);
    expect(stripAllFormatting(undefined as any)).toBe(undefined);
  });

  it('preserves plain text without formatting', () => {
    const plain = '아무 포맷팅도 없는 일반 텍스트입니다';
    expect(stripAllFormatting(plain)).toBe(plain);
  });

  it('removes mixed formatting', () => {
    const input = '**볼드** <u>밑줄</u> *이탤릭* <b>HTML볼드</b>';
    const result = stripAllFormatting(input);
    expect(result).not.toContain('**');
    expect(result).not.toContain('<u>');
    expect(result).not.toContain('<b>');
    expect(result).toContain('볼드');
    expect(result).toContain('밑줄');
  });
});

describe('removeOrdinalHeadingLabelsFromBody', () => {
  it('removes "첫 번째 소제목:" label', () => {
    const result = removeOrdinalHeadingLabelsFromBody('첫 번째 소제목: 실제 내용');
    expect(result).toContain('실제 내용');
    expect(result).not.toContain('첫 번째 소제목');
  });

  it('removes "두 번째 소제목:" label', () => {
    const result = removeOrdinalHeadingLabelsFromBody('두 번째 소제목: 다음 내용');
    expect(result).toContain('다음 내용');
    expect(result).not.toContain('두 번째 소제목');
  });

  it('removes "제1번째 소제목:" pattern', () => {
    const result = removeOrdinalHeadingLabelsFromBody('제1번째 소제목: 첫 내용');
    expect(result).toContain('첫 내용');
    expect(result).not.toContain('제1번째');
  });

  it('removes standalone "소제목:" prefix', () => {
    const result = removeOrdinalHeadingLabelsFromBody('소제목: 어떤 내용');
    expect(result).toContain('어떤 내용');
  });

  it('removes [공지] prefix', () => {
    const result = removeOrdinalHeadingLabelsFromBody('[공지] 중요한 내용');
    expect(result).toContain('중요한 내용');
    expect(result).not.toContain('[공지]');
  });

  it('removes **bold** markdown from body', () => {
    const result = removeOrdinalHeadingLabelsFromBody('이것은 **중요한** 텍스트');
    expect(result).not.toContain('**');
    expect(result).toContain('중요한');
  });

  it('removes <u>underline</u> tags from body', () => {
    const result = removeOrdinalHeadingLabelsFromBody('<u>밑줄 텍스트</u>');
    expect(result).not.toContain('<u>');
    expect(result).toContain('밑줄 텍스트');
  });

  it('removes placeholder patterns: OOO, {키워드}', () => {
    const result = removeOrdinalHeadingLabelsFromBody('OOO에 대한 {키워드} 관련 내용');
    expect(result).not.toContain('OOO');
    expect(result).not.toContain('{키워드}');
    expect(result).toContain('관련 내용');
  });

  it('removes AI citation numbers', () => {
    const result = removeOrdinalHeadingLabelsFromBody('연구 결과 [1] 그리고 [2, 3] 참조');
    expect(result).not.toMatch(/\[\d+/);
  });

  it('handles empty string', () => {
    expect(removeOrdinalHeadingLabelsFromBody('')).toBe('');
  });

  it('handles null/undefined gracefully', () => {
    expect(removeOrdinalHeadingLabelsFromBody(null as any)).toBe('');
  });

  it('preserves normal body text without labels', () => {
    const normalText = '오늘 날씨가 좋아서 산책을 했습니다. 꽃이 많이 피었어요.';
    const result = removeOrdinalHeadingLabelsFromBody(normalText);
    expect(result).toContain('오늘 날씨가 좋아서');
    expect(result).toContain('꽃이 많이 피었어요');
  });
});
