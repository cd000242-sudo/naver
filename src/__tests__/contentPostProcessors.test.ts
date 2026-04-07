import { describe, it, expect } from 'vitest';
import {
  removeEmojis,
  containsEmoji,
  normalizeLineBreaks,
  ensureParagraphBreaks,
  truncateHeading,
  cleanEscapeSequences,
  escapeRegex,
  dedupeRepeatedPhrasesInHeading,
} from '../contentPostProcessors';

describe('removeEmojis', () => {
  it('이모지를 제거한다', () => {
    expect(removeEmojis('안녕하세요 😀 반갑습니다 🎉')).toBe('안녕하세요 반갑습니다');
  });

  it('이모지 없으면 그대로 반환', () => {
    expect(removeEmojis('순수 텍스트')).toBe('순수 텍스트');
  });

  it('빈 문자열에 안전하다', () => {
    expect(removeEmojis('')).toBe('');
  });

  it('null/undefined에 안전하다', () => {
    expect(removeEmojis(null as any)).toBeFalsy();
    expect(removeEmojis(undefined as any)).toBeFalsy();
  });
});

describe('containsEmoji', () => {
  it('이모지가 있으면 true', () => {
    expect(containsEmoji('텍스트 🎯')).toBe(true);
  });

  it('이모지가 없으면 false', () => {
    expect(containsEmoji('순수 텍스트')).toBe(false);
  });
});

describe('normalizeLineBreaks', () => {
  it('3개 이상 연속 줄바꿈을 2개로 줄인다', () => {
    expect(normalizeLineBreaks('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('CRLF를 LF로 변환한다', () => {
    expect(normalizeLineBreaks('a\r\nb')).toBe('a\nb');
  });

  it('정상 줄바꿈은 유지한다', () => {
    expect(normalizeLineBreaks('a\n\nb')).toBe('a\n\nb');
  });
});

describe('ensureParagraphBreaks', () => {
  it('긴 문단을 분리한다', () => {
    const longParagraph = Array(10).fill('이것은 긴 문장입니다.').join(' ');
    const result = ensureParagraphBreaks(longParagraph, 100);
    expect(result).toContain('\n\n');
  });

  it('짧은 텍스트는 그대로 반환한다', () => {
    const short = '짧은 글입니다.';
    expect(ensureParagraphBreaks(short)).toBe(short);
  });

  it('빈 문자열에 안전하다', () => {
    expect(ensureParagraphBreaks('')).toBe('');
  });
});

describe('truncateHeading', () => {
  it('긴 소제목을 단어 단위로 자른다', () => {
    const heading = '이것은 매우 긴 소제목 입니다 정말로 길어요';
    const result = truncateHeading(heading, 20);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it('짧은 소제목은 그대로 반환한다', () => {
    expect(truncateHeading('짧은 제목', 30)).toBe('짧은 제목');
  });

  it('빈 문자열에 안전하다', () => {
    expect(truncateHeading('')).toBe('');
  });
});

describe('cleanEscapeSequences', () => {
  it('\\n을 줄바꿈으로 변환한다', () => {
    expect(cleanEscapeSequences('줄1\\n줄2')).toBe('줄1\n줄2');
  });

  it('\\t를 탭으로 변환한다', () => {
    expect(cleanEscapeSequences('탭\\t다음')).toBe('탭\t다음');
  });

  it('\\"를 "로 변환한다', () => {
    expect(cleanEscapeSequences('\\"인용\\"')).toBe('"인용"');
  });
});

describe('escapeRegex', () => {
  it('정규식 특수문자를 이스케이프한다', () => {
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c');
    expect(escapeRegex('(test)')).toBe('\\(test\\)');
    expect(escapeRegex('[0-9]')).toBe('\\[0-9\\]');
  });

  it('일반 문자는 변경하지 않는다', () => {
    expect(escapeRegex('hello')).toBe('hello');
  });
});

describe('dedupeRepeatedPhrasesInHeading', () => {
  it('연속 반복 구절을 제거한다', () => {
    const result = dedupeRepeatedPhrasesInHeading('맛있는맛있는 라면');
    expect(result).toBe('맛있는 라면');
  });

  it('반복 없는 소제목은 유지한다', () => {
    expect(dedupeRepeatedPhrasesInHeading('정상 소제목')).toBe('정상 소제목');
  });

  it('빈 문자열에 안전하다', () => {
    expect(dedupeRepeatedPhrasesInHeading('')).toBe('');
  });
});
