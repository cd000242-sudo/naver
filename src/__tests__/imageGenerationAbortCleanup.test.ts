import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cleanupMocks = vi.hoisted(() => ({
  abortNano: vi.fn(),
  abortDropshot: vi.fn(),
  cleanupImageFx: vi.fn(),
  closeDropshotContexts: vi.fn(),
  resetFlow: vi.fn(),
}));

vi.mock('../image/nanoBananaProGenerator.js', () => ({
  abortImageGeneration: cleanupMocks.abortNano,
  generateWithNanoBananaPro: vi.fn(),
  resetAllImageState: vi.fn(),
}));

vi.mock('../image/flowGenerator.js', () => ({
  generateWithFlow: vi.fn(),
  resetFlowState: cleanupMocks.resetFlow,
}));

vi.mock('../image/imageFxGenerator.js', () => ({
  cleanupImageFxBrowser: cleanupMocks.cleanupImageFx,
  generateWithImageFx: vi.fn(),
}));

vi.mock('../image/dropshotGenerator.js', () => ({
  generateWithDropshot: vi.fn(),
}));

vi.mock('../image/dropshotSession.js', () => ({
  abortDropshotGenerations: cleanupMocks.abortDropshot,
  closeAllDropshotContexts: cleanupMocks.closeDropshotContexts,
}));

import { abortImageGeneration } from '../imageGenerator.js';

describe('abortImageGeneration cleanup fan-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanupMocks.abortNano.mockImplementation(() => undefined);
    cleanupMocks.abortDropshot.mockImplementation(() => 1);
    cleanupMocks.resetFlow.mockResolvedValue(undefined);
    cleanupMocks.cleanupImageFx.mockResolvedValue(undefined);
    cleanupMocks.closeDropshotContexts.mockResolvedValue(undefined);
  });

  it('attempts Nano, Flow, ImageFX, and every Dropshot context despite partial failures', async () => {
    cleanupMocks.abortNano.mockImplementationOnce(() => {
      throw new Error('nano cleanup failed');
    });
    cleanupMocks.resetFlow.mockRejectedValueOnce(new Error('flow cleanup failed'));

    await expect(abortImageGeneration()).rejects.toThrow('cleanup task');

    expect(cleanupMocks.abortNano).toHaveBeenCalledTimes(1);
    expect(cleanupMocks.abortDropshot).toHaveBeenCalledTimes(1);
    expect(cleanupMocks.resetFlow).toHaveBeenCalledTimes(1);
    expect(cleanupMocks.cleanupImageFx).toHaveBeenCalledTimes(1);
    expect(cleanupMocks.closeDropshotContexts).toHaveBeenCalledTimes(1);
  });

  it('uses Promise.allSettled for best-effort cleanup', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'imageGenerator.ts'), 'utf8');
    expect(source).toContain('Promise.allSettled');
  });
});
