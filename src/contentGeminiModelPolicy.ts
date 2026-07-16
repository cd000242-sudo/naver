import {
  GEMINI_TEXT_MODELS,
  normalizeGeminiTextModelId,
} from './runtime/modelRegistry.js';

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
  const defaultModel = GEMINI_TEXT_MODELS.FLASH_LITE;

  let primaryModel = config?.primaryGeminiTextModel || config?.geminiModel || defaultModel;
  if (!primaryModel.startsWith('gemini-')) {
    throw new Error(`TEXT_MODEL_PROVIDER_MISMATCH: expected=gemini, selected=${primaryModel}`);
  } else {
    primaryModel = normalizeGeminiTextModelId(primaryModel);
  }

  const isPro = primaryModel.includes('-pro');
  const uniqueModels = [primaryModel];
  return { primaryModel, uniqueModels, isPro };
}
