import { describe, expect, it } from 'vitest';
import {
  inspectNaverImagePolicy,
  isNaverRecommendedAsciiFileName,
  isSupportedNaverImageExtension,
  NAVER_BATCH_IMAGE_MAX_BYTES,
  NAVER_SINGLE_IMAGE_MAX_BYTES,
  resolveNaverSupportedImageExtension,
} from '../automation/naverImagePolicy';

describe('Naver image upload policy', () => {
  it('matches the official supported extensions including BMP and WEBP', () => {
    expect(isSupportedNaverImageExtension('photo.JPG')).toBe(true);
    expect(isSupportedNaverImageExtension('banner.gif')).toBe(true);
    expect(isSupportedNaverImageExtension('diagram.png')).toBe(true);
    expect(isSupportedNaverImageExtension('scan.bmp')).toBe(true);
    expect(isSupportedNaverImageExtension('hero.webp')).toBe(true);
    expect(isSupportedNaverImageExtension('doc.svg')).toBe(false);
  });

  it('resolves unsupported extensions to the selected fallback', () => {
    expect(resolveNaverSupportedImageExtension('image.svg', 'jpg')).toBe('jpg');
    expect(resolveNaverSupportedImageExtension('image.bmp', 'jpg')).toBe('bmp');
  });

  it('warns for non-ascii file names because Naver recommends English/number names', () => {
    expect(isNaverRecommendedAsciiFileName('naver-image-01.jpg')).toBe(true);
    expect(isNaverRecommendedAsciiFileName('대표사진.jpg')).toBe(false);
  });

  it('reports single file, batch, extension, and filename policy issues', () => {
    const issues = inspectNaverImagePolicy([
      { fileName: '대표사진.svg', sizeBytes: NAVER_SINGLE_IMAGE_MAX_BYTES + 1 },
      { fileName: 'good-1.jpg', sizeBytes: NAVER_SINGLE_IMAGE_MAX_BYTES - 1 },
      { fileName: 'good-2.webp', sizeBytes: NAVER_BATCH_IMAGE_MAX_BYTES - (NAVER_SINGLE_IMAGE_MAX_BYTES * 2) + 2 },
    ]);

    expect(issues.map((issue) => issue.code)).toEqual([
      'UNSUPPORTED_EXTENSION',
      'SINGLE_FILE_TOO_LARGE',
      'NON_ASCII_FILENAME',
      'BATCH_TOO_LARGE',
    ]);
  });
});
