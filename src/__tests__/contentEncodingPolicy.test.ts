import { describe, expect, it } from 'vitest';
import { fixUtf8Encoding } from '../contentEncodingPolicy';

describe('contentEncodingPolicy', () => {
  it('returns empty text unchanged', () => {
    expect(fixUtf8Encoding('')).toBe('');
  });

  it('leaves already valid Korean text unchanged', () => {
    expect(fixUtf8Encoding('이미 정상적인 한글 문장입니다.')).toBe('이미 정상적인 한글 문장입니다.');
  });

  it('repairs Korean text that was misread as latin1', () => {
    const mojibake = Buffer.from('안녕하세요', 'utf8').toString('latin1');

    expect(fixUtf8Encoding(mojibake)).toBe('안녕하세요');
  });

  it('falls back to the original text when recovery is not useful', () => {
    expect(fixUtf8Encoding('plain ascii text')).toBe('plain ascii text');
  });
});
