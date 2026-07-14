import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configState = vi.hoisted(() => ({
  mainModel: 'gemini-2.0-flash-exp',
  subModel: 'gemini-2.0-flash-exp',
}));
const axiosPostMock = vi.hoisted(() => vi.fn());

vi.mock('../configManager.js', () => ({
  loadConfig: vi.fn(async () => ({
    nanoBananaMainModel: configState.mainModel,
    nanoBananaSubModel: configState.subModel,
    geminiImageLastReset: new Date().toISOString().split('T')[0],
    geminiImageDailyCount: 0,
    geminiPlanType: 'auto',
  })),
  saveConfig: vi.fn(async () => undefined),
}));

vi.mock('axios', () => ({
  default: {
    post: (...args: unknown[]) => axiosPostMock(...args),
  },
}));

import { generateWithNanoBananaPro } from '../image/nanoBananaProGenerator.js';

describe('legacy image model generator guard', () => {
  beforeEach(() => {
    configState.mainModel = 'gemini-2.0-flash-exp';
    configState.subModel = 'gemini-2.0-flash-exp';
    axiosPostMock.mockReset();
    axiosPostMock.mockRejectedValue(
      new Error('GEMINI_IMAGE_BILLING_REQUIRED: unexpected axios request'),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects before any paid image request is sent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('GEMINI_IMAGE_BILLING_REQUIRED: unexpected network request'),
    );

    await expect(generateWithNanoBananaPro(
      [{ heading: 'legacy model guard' } as any],
      'test post',
      'test-post-id',
      false,
      'test-api-key',
      false,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    )).rejects.toThrow(/\[IMAGE_MODEL_SELECTION_REQUIRED\]/);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('preflights mixed legacy settings before a parallel batch can start', async () => {
    configState.mainModel = 'gemini-3-1-flash';
    configState.subModel = 'gemini-2.0-flash-exp';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('GEMINI_IMAGE_BILLING_REQUIRED: unexpected fetch request'),
    );

    await expect(generateWithNanoBananaPro(
      [
        { heading: 'legacy main image' } as any,
        { heading: 'current sub image' } as any,
      ],
      'mixed model test post',
      'mixed-model-test-post-id',
      false,
      'test-api-key',
      false,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      false,
    )).rejects.toThrow(/\[IMAGE_MODEL_SELECTION_REQUIRED\]/);

    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses an explicit current forceModelKey even when saved settings are legacy', async () => {
    configState.mainModel = 'gemini-2.0-flash-exp';
    configState.subModel = 'gemini-2.0-flash-exp';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('GEMINI_IMAGE_BILLING_REQUIRED: unexpected fetch request'),
    );

    await expect(generateWithNanoBananaPro(
      [{ heading: 'forced current model' } as any],
      'forced model test post',
      'forced-model-test-post-id',
      false,
      'test-api-key',
      false,
      [],
      undefined,
      undefined,
      undefined,
      'gemini-3-1-flash',
      true,
    )).rejects.toThrow(/GEMINI_IMAGE_BILLING_REQUIRED/);

    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(String(axiosPostMock.mock.calls[0][0]))
      .toContain('/models/gemini-3.1-flash-image:generateContent');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stops the batch queue after the first image reports a terminal billing error', async () => {
    configState.mainModel = 'gemini-3-1-flash';
    configState.subModel = 'gemini-3-1-flash';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('GEMINI_IMAGE_BILLING_REQUIRED: unexpected fetch request'),
    );

    await expect(generateWithNanoBananaPro(
      [
        { heading: 'billing probe image' } as any,
        { heading: 'must never start 2' } as any,
        { heading: 'must never start 3' } as any,
      ],
      'terminal queue test post',
      'terminal-queue-test-post-id',
      false,
      'test-api-key',
      false,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      false,
    )).rejects.toThrow(/GEMINI_IMAGE_BILLING_REQUIRED/);

    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
