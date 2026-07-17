import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  makeDropshotImage: vi.fn(),
  writeImageFile: vi.fn(),
}));

vi.mock('../image/dropshotCapture.js', () => ({
  makeDropshotImage: mocks.makeDropshotImage,
}));

vi.mock('../image/dropshotCore.js', () => ({
  buildDropshotPrompt: (prompt: string) => prompt,
}));

vi.mock('../image/imageUtils.js', () => ({
  writeImageFile: mocks.writeImageFile,
}));

vi.mock('../image/imageHashUtils.js', () => ({
  applyDiversityHint: (prompt: string) => prompt,
  commitHashes: vi.fn(),
  probeDuplicate: vi.fn(),
}));

vi.mock('../image/referenceImagePolicy.js', () => ({
  extractReferenceImageUrl: () => '',
}));

import {
  generateWithDropshot,
  isDropshotTerminalSessionFailure,
} from '../image/dropshotGenerator.js';

describe('Dropshot batch session circuit breaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops the batch after the first terminal login failure instead of reopening per image', async () => {
    mocks.makeDropshotImage.mockResolvedValue({
      ok: false,
      dataUrl: '',
      error: '로그인 창이 닫혔지만 유효한 로그인 토큰이 확인되지 않았습니다.',
    });

    await expect(generateWithDropshot([
      { heading: '첫 이미지', prompt: '첫 프롬프트' },
      { heading: '둘째 이미지', prompt: '둘째 프롬프트' },
      { heading: '셋째 이미지', prompt: '셋째 프롬프트' },
    ])).rejects.toThrow(/IMAGE_BATCH_INCOMPLETE:0\/3:로그인 창/);

    expect(mocks.makeDropshotImage).toHaveBeenCalledTimes(1);
  });

  it('uses explicit session contexts without false-positive profile/image wording', () => {
    for (const terminal of [
      'DROPSHOT_CLEANUP_INCOMPLETE: context close timed out',
      'DROPSHOT_SESSION_HIDE_FAILED: window could not be hidden',
      'Authentication required',
      'Not authenticated',
      'Browser context has been closed',
      'Target page, context or browser has been closed',
      'Dropshot 사이트 연결 시간이 초과되었습니다.',
    ]) {
      expect(isDropshotTerminalSessionFailure(terminal), terminal).toBe(true);
    }

    for (const ordinaryImageFailure of [
      'Failed to load user profile image',
      'Generation failed for professional profile portrait',
      'temporary session image error',
    ]) {
      expect(isDropshotTerminalSessionFailure(ordinaryImageFailure), ordinaryImageFailure).toBe(false);
    }
  });
});
