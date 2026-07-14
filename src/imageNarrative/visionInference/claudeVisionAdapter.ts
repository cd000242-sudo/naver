/**
 * Claude Vision adapter for the image-narrative inference pipeline.
 *
 * Uses @anthropic-ai/sdk (already installed).
 * Model: claude-sonnet-5 (VISION_MODELS.CLAUDE_SONNET from modelRegistry).
 *
 * Anthropic has no response_format=json_schema, so JSON is enforced via the
 * shared JSON_SCHEMA_INSTRUCTION prompt and parsed with safeParseJson, mirroring
 * the Gemini adapter (strict validation + one reformat retry).
 *
 * On JSON parse / validation failure the adapter throws so the router can handle
 * fallback (feedback_no_fallback: never silent).
 */

import { VISION_MODELS } from '../../runtime/modelRegistry.js';
import { safeParseJson } from '../../jsonParser.js';
import { getSystemPrompt, getUserInstruction } from './inferencePrompts.js';
import type {
  InferenceContext,
  InferenceOptions,
  ImageInferenceResult,
} from '../types.js';

const CLAUDE_VISION_TIMEOUT_MS = 30_000;
// 1,024 → 2,048: 한국어 구조화 JSON 잘림(MAX_TOKENS) 방지 — Gemini/OpenAI 어댑터와 동일 사유
const CLAUDE_VISION_MAX_OUTPUT_TOKENS = 2_048;
const CLAUDE_VISION_FORMAT_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validates and coerces the raw parsed object into ImageInferenceResult.
 * Throws if any required field is missing or has the wrong type.
 * Mirrors the strict validation used by the Gemini adapter.
 */
function validateResult(raw: unknown): ImageInferenceResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Claude response is not a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  const VALID_MODES = new Set([
    'travel', 'food', 'lodging', 'daily', 'review', 'cafe', 'auto',
  ]);

  const scene_type = String(obj['scene_type'] ?? 'auto');
  if (!VALID_MODES.has(scene_type)) {
    throw new Error(`Invalid scene_type from Claude: ${scene_type}`);
  }
  if (typeof obj['location_hint'] !== 'string') {
    throw new Error('location_hint is missing or not a string');
  }
  if (!Array.isArray(obj['food_items'])) {
    throw new Error('food_items is missing or not an array');
  }
  if (!Array.isArray(obj['mood_keywords'])) {
    throw new Error('mood_keywords is missing or not an array');
  }
  if (
    typeof obj['description_ko'] !== 'string' ||
    obj['description_ko'].trim().length === 0
  ) {
    throw new Error('description_ko is missing or empty');
  }
  if (typeof obj['confidence'] !== 'number') {
    throw new Error('confidence is not a number');
  }

  return {
    scene_type: scene_type as ImageInferenceResult['scene_type'],
    location_hint: obj['location_hint'],
    food_items: (obj['food_items'] as unknown[]).map(String),
    mood_keywords: (obj['mood_keywords'] as unknown[]).map(String),
    description_ko: obj['description_ko'].trim(),
    confidence: Math.max(0, Math.min(1, obj['confidence'])),
  };
}

/** Maps the imageNarrative mime type onto Anthropic's accepted media types. */
function toAnthropicMediaType(
  mimeType: string,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('png')) return 'image/png';
  if (normalized.includes('gif')) return 'image/gif';
  if (normalized.includes('webp')) return 'image/webp';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------------
// Public adapter function
// ---------------------------------------------------------------------------

/**
 * Runs Claude (Sonnet) Vision inference on a single image context.
 *
 * @throws {Error} On API failure, JSON parse failure, or validation error.
 *   The caller (visionRouter) is responsible for catching and triggering fallback.
 */
export async function runClaudeVision(
  context: InferenceContext,
  options: InferenceOptions,
  apiKey: string,
): Promise<ImageInferenceResult> {
  const mode = options.mode ?? 'auto';
  const systemPrompt = getSystemPrompt(mode);
  const userInstruction = getUserInstruction(mode, options.context);

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const imageBlock = {
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: toAnthropicMediaType(context.mimeType),
      data: context.imageBase64,
    },
  };

  let lastFormatError: Error | null = null;

  for (let attempt = 1; attempt <= CLAUDE_VISION_FORMAT_ATTEMPTS; attempt += 1) {
    // 30s timeout merged with the caller's abort signal.
    const internal = new AbortController();
    const timer = setTimeout(
      () => internal.abort(new Error('Claude Vision timeout (30s)')),
      CLAUDE_VISION_TIMEOUT_MS,
    );
    const onAbort = () => internal.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', onAbort, { once: true });

    let text = '';
    try {
      const message = await client.messages.create(
        {
          model: VISION_MODELS.CLAUDE_SONNET,
          max_tokens: CLAUDE_VISION_MAX_OUTPUT_TOKENS,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [imageBlock, { type: 'text', text: userInstruction }],
            },
          ],
        },
        { signal: internal.signal },
      );
      const block = message.content[0];
      if (!block || block.type !== 'text') {
        throw new Error('Claude returned no text block');
      }
      text = block.text;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }

    try {
      if (!text || text.trim() === '') {
        throw new Error('Claude returned empty response text');
      }
      const parsed = safeParseJson<unknown>(text);
      return validateResult(parsed);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      lastFormatError = new Error(
        `Claude response is not valid JSON: ${text.slice(0, 200)}. ` +
        `Parse error: ${detail}`,
      );
      if (attempt < CLAUDE_VISION_FORMAT_ATTEMPTS) {
        console.warn(
          `[ClaudeVision] Structured response parse failed; retrying ` +
          `(${attempt}/${CLAUDE_VISION_FORMAT_ATTEMPTS - 1}). ${lastFormatError.message}`,
        );
      }
    }
  }

  throw lastFormatError ?? new Error('Claude response could not be parsed');
}
