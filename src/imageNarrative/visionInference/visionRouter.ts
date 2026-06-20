/**
 * Vision inference router for the image-narrative pipeline.
 *
 * Responsibilities:
 * 1. Select the correct adapter based on InferenceOptions.provider.
 * 2. Execute the selected provider; only use another vendor after explicit opt-in.
 * 3. Enforce the feedback_no_fallback rule:
 *    - Fallback is NEVER silent. console.warn is emitted.
 *    - If options.onFallback is provided it is called so the UI can show a modal.
 * 4. Wrap the result in InferenceResponse with latency metadata.
 *
 * Only Gemini and OpenAI are implemented in Phase 1.
 * Claude / DeepInfra adapters are stubs that throw "not implemented" —
 * the router falls back to OpenAI for those providers.
 */

import { runGeminiVision } from './geminiVisionAdapter.js';
import { runOpenAIVision } from './openaiVisionAdapter.js';
import { runClaudeVision } from './claudeVisionAdapter.js';
import { VISION_MODELS } from '../../runtime/modelRegistry.js';
import {
  getCachedInference,
  setCachedInference,
} from '../cost/imageHashCache.js';
import { checkBudget, recordVisionCall } from '../cost/budgetGuard.js';
import { trackImageNarrativeUsage } from '../../apiUsageTracker.js';
import type {
  InferenceContext,
  InferenceOptions,
  InferenceResponse,
  VisionProvider,
} from '../types.js';

// ---------------------------------------------------------------------------
// Default model per provider — used for usage-tracking categorization.
// The actual model name lives inside each adapter; this map is only a label
// for the cost dashboard. When adapter changes ship the real model name,
// switch this to read from InferenceResponse directly.
// ---------------------------------------------------------------------------

const PROVIDER_DEFAULT_MODEL: Record<VisionProvider, string> = {
  gemini: VISION_MODELS.GEMINI_FLASH,
  openai: VISION_MODELS.OPENAI_41,
  claude: VISION_MODELS.CLAUDE_SONNET,
  deepinfra: 'llama-3.2-vision',
};

// ---------------------------------------------------------------------------
// Provider API key resolution
// ---------------------------------------------------------------------------

function resolveApiKey(provider: VisionProvider): string {
  const envMap: Record<VisionProvider, string> = {
    gemini: process.env['GEMINI_API_KEY'] ?? '',
    openai: process.env['OPENAI_API_KEY'] ?? '',
    claude: process.env['ANTHROPIC_API_KEY'] ?? '',
    deepinfra: process.env['DEEPINFRA_API_KEY'] ?? '',
  };
  const key = envMap[provider];
  if (!key) {
    throw new Error(
      `API key for provider "${provider}" is not set. ` +
      `Configure the corresponding environment variable.`,
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Fallback chain
// ---------------------------------------------------------------------------

/**
 * Defines the automatic fallback chain.
 * If the primary provider fails, the next provider in the chain is tried once.
 */
const FALLBACK_CHAIN: Partial<Record<VisionProvider, VisionProvider>> = {
  gemini: 'openai',
  openai: 'gemini',
  // openai has no automatic fallback — callers must handle the error
  // claude / deepinfra fall back to openai so the pipeline isn't stranded
  claude: 'openai',
  deepinfra: 'openai',
};

// ---------------------------------------------------------------------------
// Adapter dispatch
// ---------------------------------------------------------------------------

async function callAdapter(
  provider: VisionProvider,
  context: InferenceContext,
  options: InferenceOptions,
  apiKey: string,
): Promise<import('../types.js').ImageInferenceResult> {
  switch (provider) {
    case 'gemini':
      return runGeminiVision(context, options, apiKey);
    case 'openai':
      return runOpenAIVision(context, options, apiKey);
    case 'claude':
      return runClaudeVision(context, options, apiKey);
    case 'deepinfra':
      throw new Error('DeepInfra Vision adapter is not implemented in Phase 1');
    default: {
      // TypeScript exhaustive check — this branch should never be reached
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Infers image content for a single InferenceContext.
 *
 * Provider selection priority:
 *   1. options.provider (explicit user choice)
 *   2. 'gemini' (default)
 *
 * Fallback policy (feedback_no_fallback rule):
 *   - Cross-provider fallback is disabled by default.
 *   - If allowProviderFallback is true, the fallback provider is tried once.
 *   - The fallback is NEVER silent: console.warn is emitted and
 *     options.onFallback (if provided) is called so the UI can alert the user.
 *   - If the fallback also throws, the error propagates to the caller.
 *
 * @throws {Error} If both primary and fallback providers fail, or if no
 *   API key is configured for the selected provider.
 */
export async function inferImage(
  context: InferenceContext,
  options: InferenceOptions = {},
): Promise<InferenceResponse> {
  const primaryProvider: VisionProvider = options.provider ?? 'gemini';
  const mode = options.mode ?? 'auto';
  const startMs = Date.now();

  // --- Cost layer: cache lookup (Phase 6) ---
  // The same image+provider+mode returns the cached response without billing.
  // Cache hits are still recorded in usage tracking with cost=0 so the dashboard
  // shows accurate call counts without inflating spend.
  const cached = getCachedInference(context.imageBase64, primaryProvider, mode);
  if (cached) {
    trackImageNarrativeUsage(
      primaryProvider as 'gemini' | 'openai' | 'claude' | 'deepinfra',
      { model: PROVIDER_DEFAULT_MODEL[primaryProvider], images: 1 },
      true,
    );
    return { ...cached, latencyMs: Date.now() - startMs };
  }

  // --- Cost layer: budget guard (Phase 6) ---
  // Daily/monthly call limits block over-spend. The caller surfaces the
  // reason in a blocking modal — never a silent fallback (feedback_no_fallback).
  const budget = checkBudget();
  if (!budget.allowed) {
    throw new Error(`BUDGET_EXCEEDED: ${budget.reason}`);
  }

  // --- Primary attempt ---
  let primaryError: unknown;
  try {
    const apiKey = resolveApiKey(primaryProvider);
    const result = await callAdapter(primaryProvider, context, options, apiKey);
    recordVisionCall();
    const response: InferenceResponse = {
      imageId: context.imageId,
      result,
      provider: primaryProvider,
      latencyMs: Date.now() - startMs,
    };
    setCachedInference(context.imageBase64, primaryProvider, mode, response);
    trackImageNarrativeUsage(
      primaryProvider as 'gemini' | 'openai' | 'claude' | 'deepinfra',
      { model: PROVIDER_DEFAULT_MODEL[primaryProvider] ?? PROVIDER_DEFAULT_MODEL.gemini, images: 1 },
    );
    return response;
  } catch (err) {
    primaryError = err;
  }

  if (!options.allowProviderFallback) {
    const primaryMsg =
      primaryError instanceof Error ? primaryError.message : String(primaryError);
    throw new Error(
      `Vision inference failed for image "${context.imageId}". ` +
      `Selected provider (${primaryProvider}): ${primaryMsg}. ` +
      'Cross-provider fallback was not used.',
    );
  }

  // --- Fallback ---
  const fallbackProvider = FALLBACK_CHAIN[primaryProvider];
  if (!fallbackProvider) {
    // No fallback available — re-throw the primary error
    throw primaryError;
  }

  const primaryMsg =
    primaryError instanceof Error ? primaryError.message : String(primaryError);

  // feedback_no_fallback: always warn, never silent
  console.warn(
    `[VisionRouter] Primary provider "${primaryProvider}" failed: ${primaryMsg}. ` +
    `Falling back to "${fallbackProvider}".`,
  );

  if (options.onFallback) {
    options.onFallback(primaryProvider, fallbackProvider);
  }

  // Use a fresh options object without the explicit provider override
  // so the fallback adapter resolves its own API key
  const fallbackOptions: InferenceOptions = {
    ...options,
    provider: fallbackProvider,
  };

  try {
    const fallbackKey = resolveApiKey(fallbackProvider);
    const result = await callAdapter(
      fallbackProvider,
      context,
      fallbackOptions,
      fallbackKey,
    );
    recordVisionCall();
    const response: InferenceResponse = {
      imageId: context.imageId,
      result,
      provider: fallbackProvider,
      latencyMs: Date.now() - startMs,
    };
    setCachedInference(context.imageBase64, fallbackProvider, mode, response);
    trackImageNarrativeUsage(
      fallbackProvider as 'gemini' | 'openai' | 'claude' | 'deepinfra',
      { model: PROVIDER_DEFAULT_MODEL[fallbackProvider], images: 1 },
    );
    return response;
  } catch (fallbackErr) {
    const fallbackMsg =
      fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    throw new Error(
      `Vision inference failed for image "${context.imageId}". ` +
      `Primary (${primaryProvider}): ${primaryMsg}. ` +
      `Fallback (${fallbackProvider}): ${fallbackMsg}.`,
    );
  }
}
