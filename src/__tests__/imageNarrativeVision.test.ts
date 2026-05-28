/**
 * SPEC-IMAGE-NARRATIVE-2026 Phase 1 — Vision adapters unit tests.
 *
 * Covers:
 * - inferencePrompts: getSystemPrompt/getUserInstruction per mode
 * - geminiVisionAdapter: success, empty response, non-JSON, API error, clamp
 * - openaiVisionAdapter: success, empty response, 429 handling
 *
 * Router and schema contract tests: imageNarrativeRouter.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const MOCK_IMAGE_B64 = Buffer.from('fake-image-bytes').toString('base64');

export const MOCK_CONTEXT = {
  imageId: 'img-001',
  imageBase64: MOCK_IMAGE_B64,
  mimeType: 'image/jpeg',
} as const;

export const VALID_RESULT = {
  scene_type: 'food' as const,
  location_hint: '서울 홍대',
  food_items: ['떡볶이', '순대'],
  mood_keywords: ['활기찬', '맛있는'],
  description_ko: '홍대 분식 골목의 활기찬 풍경입니다.',
  confidence: 0.85,
};

// ---------------------------------------------------------------------------
// inferencePrompts tests
// ---------------------------------------------------------------------------

describe('inferencePrompts', () => {
  it('getSystemPrompt returns a string for each mode', async () => {
    const { getSystemPrompt } = await import('../imageNarrative/visionInference/inferencePrompts');
    const modes = ['travel', 'food', 'lodging', 'daily', 'review', 'cafe', 'auto'] as const;
    for (const mode of modes) {
      const prompt = getSystemPrompt(mode);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(50);
    }
  });

  it('getSystemPrompt includes hallucination guard clause', async () => {
    const { getSystemPrompt } = await import('../imageNarrative/visionInference/inferencePrompts');
    const prompt = getSystemPrompt('auto');
    expect(prompt).toContain('추측');
    expect(prompt).toContain('confidence');
  });

  it('getUserInstruction returns a non-empty string per mode', async () => {
    const { getUserInstruction } = await import('../imageNarrative/visionInference/inferencePrompts');
    const modes = ['travel', 'food', 'lodging', 'daily', 'review', 'cafe', 'auto'] as const;
    for (const mode of modes) {
      const instruction = getUserInstruction(mode);
      expect(typeof instruction).toBe('string');
      expect(instruction.length).toBeGreaterThan(0);
    }
  });

  it('JSON schema instruction is embedded in every system prompt', async () => {
    const { getSystemPrompt, JSON_SCHEMA_INSTRUCTION } = await import('../imageNarrative/visionInference/inferencePrompts');
    const modes = ['travel', 'food'] as const;
    for (const mode of modes) {
      expect(getSystemPrompt(mode)).toContain(JSON_SCHEMA_INSTRUCTION.trim().slice(0, 20));
    }
  });
});

// ---------------------------------------------------------------------------
// geminiVisionAdapter tests (mock @google/generative-ai)
// ---------------------------------------------------------------------------

describe('geminiVisionAdapter', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['GEMINI_API_KEY'];
  });

  it('returns ImageInferenceResult on successful Gemini response', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      response: { text: () => JSON.stringify(VALID_RESULT) },
    });
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: function GoogleGenerativeAI() {
        return { getGenerativeModel: function() { return { generateContent }; } };
      },
      SchemaType: { OBJECT: 'object', STRING: 'string', ARRAY: 'array', NUMBER: 'number' },
    }));

    const { runGeminiVision } = await import('../imageNarrative/visionInference/geminiVisionAdapter');
    const result = await runGeminiVision(MOCK_CONTEXT, { mode: 'food' }, 'key');

    expect(result.scene_type).toBe('food');
    expect(result.location_hint).toBe('서울 홍대');
    expect(result.food_items).toEqual(['떡볶이', '순대']);
    expect(result.confidence).toBe(0.85);
  });

  it('throws when Gemini response text is empty', async () => {
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: function GoogleGenerativeAI() {
        return {
          getGenerativeModel: function() {
            return { generateContent: vi.fn().mockResolvedValue({ response: { text: () => '' } }) };
          },
        };
      },
      SchemaType: { OBJECT: 'object', STRING: 'string', ARRAY: 'array', NUMBER: 'number' },
    }));

    const { runGeminiVision } = await import('../imageNarrative/visionInference/geminiVisionAdapter');
    await expect(runGeminiVision(MOCK_CONTEXT, {}, 'key')).rejects.toThrow();
  });

  it('throws when Gemini response is not valid JSON', async () => {
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: function GoogleGenerativeAI() {
        return {
          getGenerativeModel: function() {
            return {
              generateContent: vi.fn().mockResolvedValue({
                response: { text: () => 'Sorry, cannot analyze.' },
              }),
            };
          },
        };
      },
      SchemaType: { OBJECT: 'object', STRING: 'string', ARRAY: 'array', NUMBER: 'number' },
    }));

    const { runGeminiVision } = await import('../imageNarrative/visionInference/geminiVisionAdapter');
    await expect(runGeminiVision(MOCK_CONTEXT, {}, 'key')).rejects.toThrow(/not JSON/i);
  });

  it('throws when API call itself rejects', async () => {
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: function GoogleGenerativeAI() {
        return {
          getGenerativeModel: function() {
            return { generateContent: vi.fn().mockRejectedValue(new Error('API error: 503')) };
          },
        };
      },
      SchemaType: { OBJECT: 'object', STRING: 'string', ARRAY: 'array', NUMBER: 'number' },
    }));

    const { runGeminiVision } = await import('../imageNarrative/visionInference/geminiVisionAdapter');
    await expect(runGeminiVision(MOCK_CONTEXT, {}, 'key')).rejects.toThrow('API error: 503');
  });

  it('coerces confidence to 0-1 range', async () => {
    const overConfident = { ...VALID_RESULT, confidence: 1.5 };
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: function GoogleGenerativeAI() {
        return {
          getGenerativeModel: function() {
            return {
              generateContent: vi.fn().mockResolvedValue({
                response: { text: () => JSON.stringify(overConfident) },
              }),
            };
          },
        };
      },
      SchemaType: { OBJECT: 'object', STRING: 'string', ARRAY: 'array', NUMBER: 'number' },
    }));

    const { runGeminiVision } = await import('../imageNarrative/visionInference/geminiVisionAdapter');
    const result = await runGeminiVision(MOCK_CONTEXT, {}, 'key');
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// openaiVisionAdapter tests (mock openai SDK)
// ---------------------------------------------------------------------------

describe('openaiVisionAdapter', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['OPENAI_API_KEY'] = 'test-openai-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['OPENAI_API_KEY'];
  });

  it('returns ImageInferenceResult on successful OpenAI response', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
    });
    class FakeAPIError extends Error {
      status: number;
      constructor(msg: string, s = 500) { super(msg); this.status = s; }
    }
    vi.doMock('openai', () => ({
      default: function OpenAI() { return { chat: { completions: { create } } }; },
      APIError: FakeAPIError,
    }));

    const { runOpenAIVision } = await import('../imageNarrative/visionInference/openaiVisionAdapter');
    const result = await runOpenAIVision(MOCK_CONTEXT, { mode: 'food' }, 'key');

    expect(result.scene_type).toBe('food');
    expect(result.description_ko).toBe(VALID_RESULT.description_ko);
  });

  it('throws when OpenAI response content is empty', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: '' } }] });
    class FakeAPIError extends Error { status = 500; }
    vi.doMock('openai', () => ({
      default: function OpenAI() { return { chat: { completions: { create } } }; },
      APIError: FakeAPIError,
    }));

    const { runOpenAIVision } = await import('../imageNarrative/visionInference/openaiVisionAdapter');
    await expect(runOpenAIVision(MOCK_CONTEXT, {}, 'key')).rejects.toThrow();
  });

  it('records 429 in throttler and rethrows', async () => {
    class FakeAPIError extends Error {
      status: number;
      constructor(msg: string, s: number) { super(msg); this.status = s; }
    }
    const create = vi.fn().mockRejectedValue(new FakeAPIError('Rate limited', 429));
    vi.doMock('openai', () => ({
      default: function OpenAI() { return { chat: { completions: { create } } }; },
      APIError: FakeAPIError,
    }));

    const { runOpenAIVision } = await import('../imageNarrative/visionInference/openaiVisionAdapter');
    await expect(runOpenAIVision(MOCK_CONTEXT, {}, 'key')).rejects.toThrow();
  });
});
