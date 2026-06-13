/**
 * Gemini Vision adapter for the image-narrative inference pipeline.
 *
 * Uses @google/generative-ai SDK (already installed).
 * Model: gemini-2.5-flash (VISION_MODELS.GEMINI_FLASH from modelRegistry).
 *
 * JSON output is enforced via responseSchema (structured output).
 * On JSON parse failure the adapter throws so the router can fall back.
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { VISION_MODELS } from '../../runtime/modelRegistry.js';
import { runGeminiVisionQuotaProtected } from '../../runtime/geminiVisionQuotaGuard.js';
import { getSystemPrompt, getUserInstruction } from './inferencePrompts.js';
import type {
  InferenceContext,
  InferenceOptions,
  ImageInferenceResult,
} from '../types.js';

// ---------------------------------------------------------------------------
// JSON response schema — mirrors ImageInferenceResult
// ---------------------------------------------------------------------------

const INFERENCE_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    scene_type: {
      type: SchemaType.STRING,
      enum: ['travel', 'food', 'lodging', 'daily', 'review', 'cafe', 'auto'],
    },
    location_hint: { type: SchemaType.STRING },
    food_items: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    mood_keywords: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    description_ko: { type: SchemaType.STRING },
    confidence: { type: SchemaType.NUMBER },
  },
  required: [
    'scene_type',
    'location_hint',
    'food_items',
    'mood_keywords',
    'description_ko',
    'confidence',
  ],
};

const GEMINI_VISION_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validates and coerces the raw parsed object into ImageInferenceResult.
 * Throws if any required field is missing or has wrong type.
 */
function validateResult(raw: unknown): ImageInferenceResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Gemini response is not a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  const VALID_MODES = new Set([
    'travel', 'food', 'lodging', 'daily', 'review', 'cafe', 'auto',
  ]);

  const scene_type = String(obj['scene_type'] ?? 'auto');
  if (!VALID_MODES.has(scene_type)) {
    throw new Error(`Invalid scene_type: ${scene_type}`);
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

async function withGeminiVisionTimeout<T>(
  requestFactory: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const internal = new AbortController();
  const timer = setTimeout(
    () => internal.abort(new Error('Gemini Vision timeout (30s)')),
    GEMINI_VISION_TIMEOUT_MS,
  );
  const onAbort = () => internal.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    return await Promise.race([
      requestFactory(),
      new Promise<never>((_, reject) => {
        internal.signal.addEventListener('abort', () => {
          reject(internal.signal.reason ?? new Error('Gemini Vision timeout (30s)'));
        }, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------------------
// Public adapter function
// ---------------------------------------------------------------------------

/**
 * Runs Gemini Vision inference on a single image context.
 *
 * @throws {Error} On API failure, JSON parse failure, or validation error.
 *   The caller (visionRouter) is responsible for catching and triggering fallback.
 */
export async function runGeminiVision(
  context: InferenceContext,
  options: InferenceOptions,
  apiKey: string,
): Promise<ImageInferenceResult> {
  const mode = options.mode ?? 'auto';
  const systemPrompt = getSystemPrompt(mode);
  const userInstruction = getUserInstruction(mode, options.context);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: VISION_MODELS.GEMINI_FLASH,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: INFERENCE_RESPONSE_SCHEMA as Parameters<
        typeof genAI.getGenerativeModel
      >[0]['generationConfig'] extends { responseSchema?: infer S } ? S : never,
      temperature: 0.2,
      maxOutputTokens: 512,
    },
  });

  const imagePart = {
    inlineData: {
      mimeType: context.mimeType,
      data: context.imageBase64,
    },
  };

  const result = await runGeminiVisionQuotaProtected(
    VISION_MODELS.GEMINI_FLASH,
    options.signal,
    () => withGeminiVisionTimeout(
      () => model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [imagePart, { text: userInstruction }],
          },
        ],
      }),
      options.signal,
    ),
  );

  const text = result.response.text();
  if (!text || text.trim() === '') {
    throw new Error('Gemini returned empty response text');
  }

  // The SDK with responseMimeType=application/json should return valid JSON.
  // Parse defensively in case the model decorates the output.
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Gemini response is not JSON: ${text.slice(0, 200)}`);
  }

  const parsed: unknown = JSON.parse(jsonMatch[0]);
  return validateResult(parsed);
}
