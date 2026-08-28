import {
  GEMINI_TEXT_MODELS,
} from './runtime/modelRegistry.js';
import { normalizeGeminiPrepaidTextModelId } from './runtime/geminiTextModelNormalization.js';

export interface GeminiModelChainConfig {
  primaryGeminiTextModel?: string;
  geminiModel?: string;
  geminiPlanType?: 'auto' | 'free' | 'paid';
}

export interface GeminiModelChain {
  primaryModel: string;
  uniqueModels: string[];
  isPro: boolean;
}

export function buildGeminiModelChain(config?: GeminiModelChainConfig): GeminiModelChain {
  // [2026-08-28] 기본 3.1 Flash-Lite → 3.6 Flash (gemini.ts DEFAULT_MODEL 과 동일 이유).
  const defaultModel = GEMINI_TEXT_MODELS.FLASH;

  let primaryModel = config?.primaryGeminiTextModel || config?.geminiModel || defaultModel;
  if (!primaryModel.startsWith('gemini-')) {
    throw new Error(`TEXT_MODEL_PROVIDER_MISMATCH: expected=gemini, selected=${primaryModel}`);
  } else {
    primaryModel = normalizeGeminiPrepaidTextModelId(primaryModel);
  }

  const isPro = primaryModel.includes('-pro');
  const uniqueModels = [primaryModel];
  return { primaryModel, uniqueModels, isPro };
}
