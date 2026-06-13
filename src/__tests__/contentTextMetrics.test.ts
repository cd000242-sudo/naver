import { describe, expect, it } from 'vitest';
import { characterCount, stripHtmlTagsForCharacterCount } from '../contentTextMetrics.js';

describe('contentTextMetrics', () => {
  it('strips html tags and common entities', () => {
    expect(stripHtmlTagsForCharacterCount('<p>안녕&nbsp;&lt;테스트&gt;</p>')).toBe('안녕 <테스트>');
  });

  it('counts visible non-whitespace characters', () => {
    expect(characterCount('<p>안 녕</p>\n테스트')).toBe(5);
  });

  it('returns zero for empty text', () => {
    expect(characterCount(undefined)).toBe(0);
    expect(characterCount('')).toBe(0);
  });
});
