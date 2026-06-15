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
  const defaultModel = 'gemini-2.5-flash';

  let primaryModel = config?.primaryGeminiTextModel || config?.geminiModel || defaultModel;
  if (!primaryModel.startsWith('gemini-')) {
    primaryModel = defaultModel;
  }

  const isPro = primaryModel.includes('-pro');
  const uniqueModels = [primaryModel];
  return { primaryModel, uniqueModels, isPro };
}
