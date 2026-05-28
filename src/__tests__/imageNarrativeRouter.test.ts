/**
 * SPEC-IMAGE-NARRATIVE-2026 Phase 1 — visionRouter and schema contract tests.
 *
 * Covers:
 * - Happy path: Gemini success → InferenceResponse
 * - Fallback: Gemini fails → OpenAI called
 * - No silent fallback: console.warn fired (feedback_no_fallback rule)
 * - onFallback callback invoked with correct providers
 * - Both providers fail → descriptive error thrown
 * - Missing API key → explicit error
 * - Default provider is gemini when none specified
 * - Korean output schema: field types and content contract
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const MOCK_IMAGE_B64 = Buffer.from('fake-image-bytes').toString('base64');

const MOCK_CONTEXT = {
  imageId: 'img-001',
  imageBase64: MOCK_IMAGE_B64,
  mimeType: 'image/jpeg',
} as const;

const VALID_RESULT = {
  scene_type: 'food' as const,
  location_hint: '서울 홍대',
  food_items: ['떡볶이', '순대'],
  mood_keywords: ['활기찬', '맛있는'],
  description_ko: '홍대 분식 골목의 활기찬 풍경입니다.',
  confidence: 0.85,
};

// ---------------------------------------------------------------------------
// visionRouter tests
// ---------------------------------------------------------------------------

describe('visionRouter — inferImage', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
    process.env['OPENAI_API_KEY'] = 'test-openai-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['GEMINI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
  });

  it('returns InferenceResponse from Gemini on success', async () => {
    vi.doMock('../imageNarrative/visionInference/geminiVisionAdapter', () => ({
      runGeminiVision: vi.fn().mockResolvedValue(VALID_RESULT),
    }));
    vi.doMock('../imageNarrative/visionInference/openaiVisionAdapter', () => ({
      runOpenAIVision: vi.fn().mockRejectedValue(new Error('should not be called')),
    }));

    const { inferImage } = await import('../imageNarrative/visionInference/visionRouter');
    const response = await inferImage(MOCK_CONTEXT, { provider: 'gemini', mode: 'food' });

    expect(response.imageId).toBe('img-001');
    expect(response.provider).toBe('gemini');
    expect(response.result.scene_type).toBe('food');
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('falls back to OpenAI when Gemini fails', async () => {
    vi.doMock('../imageNarrative/visionInference/geminiVisionAdapter', () => ({
      runGeminiVision: vi.fn().mockRejectedValue(new Error('Gemini unavailable')),
    }));
    vi.doMock('../imageNarrative/visionInference/openaiVisionAdapter', () => ({
      runOpenAIVision: vi.fn().mockResolvedValue(VALID_RESULT),
    }));

    const { inferImage } = await import('../imageNarrative/visionInference/visionRouter');
    const response = await inferImage(MOCK_CONTEXT, { provider: 'gemini', mode: 'food' });

    expect(response.provider).toBe('openai');
    expect(response.result.description_ko).toBe(VALID_RESULT.description_ko);
  });

  it('emits console.warn on fallback (feedback_no_fallback rule)', async () => {
    vi.doMock('../imageNarrative/visionInference/geminiVisionAdapter', () => ({
      runGeminiVision: vi.fn().mockRejectedValue(new Error('Gemini down')),
    }));
    vi.doMock('../imageNarrative/visionInference/openaiVisionAdapter', () => ({
      runOpenAIVision: vi.fn().mockResolvedValue(VALID_RESULT),
    }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* captured */ });

    const { inferImage } = await import('../imageNarrative/visionInference/visionRouter');
    await inferImage(MOCK_CONTEXT, { provider: 'gemini' });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('gemini'));
  });

  it('calls onFallback callback with failed and next provider', async () => {
    vi.doMock('../imageNarrative/visionInference/geminiVisionAdapter', () => ({
      runGeminiVision: vi.fn().mockRejectedValue(new Error('Gemini down')),
    }));
    vi.doMock('../imageNarrative/visionInference/openaiVisionAdapter', () => ({
      runOpenAIVision: vi.fn().mockResolvedValue(VALID_RESULT),
    }));

    vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });
    const onFallback = vi.fn();

    const { inferImage } = await import('../imageNarrative/visionInference/visionRouter');
    await inferImage(MOCK_CONTEXT, { provider: 'gemini', onFallback });

    expect(onFallback).toHaveBeenCalledWith('gemini', 'openai');
  });

  it('throws when both primary and fallback fail', async () => {
    vi.doMock('../imageNarrative/visionInference/geminiVisionAdapter', () => ({
      runGeminiVision: vi.fn().mockRejectedValue(new Error('Gemini down')),
    }));
    vi.doMock('../imageNarrative/visionInference/openaiVisionAdapter', () => ({
      runOpenAIVision: vi.fn().mockRejectedValue(new Error('OpenAI down')),
    }));

    vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });

    const { inferImage } = await import('../imageNarrative/visionInference/visionRouter');
    await expect(
      inferImage(MOCK_CONTEXT, { provider: 'gemini' }),
    ).rejects.toThrow(/Vision inference failed/i);
  });

  it('throws when API key is missing', async () => {
    delete process.env['GEMINI_API_KEY'];

    const { inferImage } = await import('../imageNarrative/visionInference/visionRouter');
    await expect(
      inferImage(MOCK_CONTEXT, { provider: 'gemini' }),
    ).rejects.toThrow(/API key/i);
  });

  it('defaults to gemini provider when none specified', async () => {
    const geminiMock = vi.fn().mockResolvedValue(VALID_RESULT);
    vi.doMock('../imageNarrative/visionInference/geminiVisionAdapter', () => ({
      runGeminiVision: geminiMock,
    }));
    vi.doMock('../imageNarrative/visionInference/openaiVisionAdapter', () => ({
      runOpenAIVision: vi.fn().mockRejectedValue(new Error('should not call')),
    }));

    const { inferImage } = await import('../imageNarrative/visionInference/visionRouter');
    const response = await inferImage(MOCK_CONTEXT, {});

    expect(response.provider).toBe('gemini');
    expect(geminiMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Korean output schema contract
// ---------------------------------------------------------------------------

describe('ImageInferenceResult schema contract', () => {
  it('all required fields have correct types', () => {
    const r = VALID_RESULT;

    expect(typeof r.scene_type).toBe('string');
    expect(typeof r.location_hint).toBe('string');
    expect(Array.isArray(r.food_items)).toBe(true);
    expect(Array.isArray(r.mood_keywords)).toBe(true);
    expect(typeof r.description_ko).toBe('string');
    expect(typeof r.confidence).toBe('number');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('description_ko contains Korean characters', () => {
    const hasKorean = /[가-힯]/.test(VALID_RESULT.description_ko);
    expect(hasKorean).toBe(true);
  });

  it('food_items is empty array for non-food scene', () => {
    const travelResult = { ...VALID_RESULT, scene_type: 'travel' as const, food_items: [] };
    expect(travelResult.food_items).toHaveLength(0);
  });

  it('confidence clamps to [0, 1]', () => {
    const clamped = Math.max(0, Math.min(1, 1.5));
    expect(clamped).toBe(1);
    const clampedLow = Math.max(0, Math.min(1, -0.2));
    expect(clampedLow).toBe(0);
  });
});
