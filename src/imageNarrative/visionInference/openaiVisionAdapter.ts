/**
 * OpenAI Vision adapter for the image-narrative inference pipeline.
 *
 * Uses the openai SDK (already installed).
 * Model: gpt-5.6-terra (VISION_MODELS.OPENAI_41 from modelRegistry).
 *
 * response_format: json_schema (strict) enforces the output schema.
 * Integrates with openaiRpmThrottler to avoid RPM limit hits.
 *
 * On JSON parse failure the adapter throws so the router can handle it.
 */

import OpenAI from 'openai';
import { VISION_MODELS } from '../../runtime/modelRegistry.js';
import { openaiRpmThrottler } from '../../utils/openaiRpmThrottler.js';
import { getSystemPrompt, getUserInstruction } from './inferencePrompts.js';
import type {
  InferenceContext,
  InferenceOptions,
  ImageInferenceResult,
} from '../types.js';

// ---------------------------------------------------------------------------
// JSON schema for response_format strict mode
// ---------------------------------------------------------------------------

const OPENAI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    scene_type: {
      type: 'string',
      enum: ['travel', 'food', 'lodging', 'daily', 'review', 'cafe', 'auto'],
    },
    location_hint: { type: 'string' },
    food_items: {
      type: 'array',
      items: { type: 'string' },
    },
    mood_keywords: {
      type: 'array',
      items: { type: 'string' },
    },
    description_ko: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: [
    'scene_type',
    'location_hint',
    'food_items',
    'mood_keywords',
    'description_ko',
    'confidence',
  ],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validates the parsed object and coerces it into ImageInferenceResult.
 * Throws if required fields are missing.
 */
function validateResult(raw: unknown): ImageInferenceResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('OpenAI response is not a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  const VALID_MODES = new Set([
    'travel', 'food', 'lodging', 'daily', 'review', 'cafe', 'auto',
  ]);

  const scene_type = String(obj['scene_type'] ?? 'auto');
  if (!VALID_MODES.has(scene_type)) {
    throw new Error(`Invalid scene_type from OpenAI: ${scene_type}`);
  }

  const confidence = Number(obj['confidence'] ?? 0);
  if (isNaN(confidence)) {
    throw new Error('confidence is not a number');
  }

  const food_items = Array.isArray(obj['food_items'])
    ? (obj['food_items'] as unknown[]).map(String)
    : [];

  const mood_keywords = Array.isArray(obj['mood_keywords'])
    ? (obj['mood_keywords'] as unknown[]).map(String)
    : [];

  return {
    scene_type: scene_type as ImageInferenceResult['scene_type'],
    location_hint: String(obj['location_hint'] ?? ''),
    food_items,
    mood_keywords,
    description_ko: String(obj['description_ko'] ?? ''),
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

// ---------------------------------------------------------------------------
// Public adapter function
// ---------------------------------------------------------------------------

/**
 * Runs OpenAI GPT-4.1 Vision inference on a single image context.
 *
 * RPM throttling is applied before each call via openaiRpmThrottler.
 *
 * @throws {Error} On API failure, 429 (after recording), JSON parse failure,
 *   or validation error. The caller (visionRouter) handles fallback.
 */
export async function runOpenAIVision(
  context: InferenceContext,
  options: InferenceOptions,
  apiKey: string,
): Promise<ImageInferenceResult> {
  const mode = options.mode ?? 'auto';
  const systemPrompt = getSystemPrompt(mode);
  const userInstruction = getUserInstruction(mode, options.context);

  // Preemptive throttle — waits if near RPM ceiling
  await openaiRpmThrottler.throttle();

  const client = new OpenAI({ apiKey });

  // Build abort controller — 30 s timeout merged with caller's signal
  const internal = new AbortController();
  const timer = setTimeout(
    () => internal.abort(new Error('OpenAI Vision timeout (30s)')),
    30_000,
  );
  options.signal?.addEventListener('abort', () => internal.abort(options.signal?.reason));

  try {
    const imageUrl = `data:${context.mimeType};base64,${context.imageBase64}`;

    const response = await client.chat.completions.create(
      {
        model: VISION_MODELS.OPENAI_41,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl, detail: 'low' },
              },
              { type: 'text', text: userInstruction },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'image_inference_result',
            strict: true,
            schema: OPENAI_RESPONSE_SCHEMA,
          },
        },
        temperature: 0.2,
        // 512 → 2,048: 한국어 구조화 JSON이 512 토큰을 넘겨 잘리던 문제 대응(Gemini와 동일 사유)
        max_tokens: 2_048,
      },
      { signal: internal.signal },
    );

    // Record successful call for throttler accounting
    openaiRpmThrottler.recordCall();

    const content = response.choices[0]?.message?.content;
    if (!content || content.trim() === '') {
      throw new Error('OpenAI returned empty response content');
    }

    const parsed: unknown = JSON.parse(content);
    return validateResult(parsed);
  } catch (error) {
    // Propagate 429 to throttler before re-throwing.
    // Check status property directly to avoid instanceof issues with mocked SDK.
    const is429 =
      (error instanceof OpenAI.APIError && error.status === 429) ||
      (typeof error === 'object' &&
        error !== null &&
        (error as Record<string, unknown>)['status'] === 429);
    if (is429) {
      openaiRpmThrottler.record429();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
