import { describe, expect, it } from 'vitest';
import {
  characterCount,
  stripHtmlTagsForCharacterCount,
  visibleCharacterCount,
} from '../contentTextMetrics.js';

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

  it('counts normalized visible whitespace for reader-facing length gates', () => {
    expect(visibleCharacterCount('<p>123 456</p>\n\n<p>789</p>')).toBe(11);
    expect(visibleCharacterCount('   ')).toBe(0);
    expect(visibleCharacterCount(undefined)).toBe(0);
  });
});
