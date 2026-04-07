import { describe, it, expect } from 'vitest';
import { detectFormat } from '../image/imageFormatPipeline';

describe('detectFormat', () => {
  it('JPEG magic bytes를 감지한다', () => {
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(detectFormat(jpegBuffer)).toBe('jpeg');
  });

  it('PNG magic bytes를 감지한다', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    expect(detectFormat(pngBuffer)).toBe('png');
  });

  it('GIF magic bytes를 감지한다', () => {
    const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectFormat(gifBuffer)).toBe('gif');
  });

  it('WebP magic bytes를 감지한다', () => {
    // RIFF....WEBP
    const webpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    expect(detectFormat(webpBuffer)).toBe('webp');
  });

  it('알 수 없는 포맷은 unknown을 반환한다', () => {
    const randomBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B]);
    expect(detectFormat(randomBuffer)).toBe('unknown');
  });

  it('너무 짧은 버퍼는 unknown을 반환한다', () => {
    const shortBuffer = Buffer.from([0xFF, 0xD8]);
    expect(detectFormat(shortBuffer)).toBe('unknown');
  });
});
