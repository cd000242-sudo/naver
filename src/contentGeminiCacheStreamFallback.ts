import { getGeminiPromptCacheKey } from './contentGeminiCachePolicy.js';

export interface GeminiStreamModel {
  generateContentStream(requestConfig: unknown): Promise<unknown>;
}

export interface GeminiCacheStreamFallbackInput {
  modelName: string;
  apiKey: string;
  systemText: string;
  cachedContentName?: string;
  requestConfig: Record<string, unknown>;
  activeModel: GeminiStreamModel;
  getPlainModel: () => GeminiStreamModel;
  markUnsupported: (apiKey: string, reason: string) => void;
  deletePromptCache: (cacheKey: string) => void;
  warn?: (message: string) => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? '');
}

function buildPlainRequestConfig(
  requestConfig: Record<string, unknown>,
  systemText: string,
): Record<string, unknown> {
  if (!systemText || requestConfig.systemInstruction) return requestConfig;

  return {
    ...requestConfig,
    systemInstruction: { role: 'system', parts: [{ text: systemText }] },
  };
}

export async function invokeGeminiStreamWithCacheFallback<T = unknown>(
  input: GeminiCacheStreamFallbackInput,
): Promise<T> {
  const {
    modelName,
    apiKey,
    systemText,
    cachedContentName,
    requestConfig,
    activeModel,
    getPlainModel,
    markUnsupported,
    deletePromptCache,
    warn = console.warn,
  } = input;

  try {
    return await activeModel.generateContentStream(requestConfig) as T;
  } catch (error) {
    if (!cachedContentName) throw error;

    const message = getErrorMessage(error);
    warn(`[GeminiCache] cache stream failed; retrying without cached content: ${message.substring(0, 100)}`);
    markUnsupported(apiKey, `stream: ${message.substring(0, 60)}`);
    deletePromptCache(getGeminiPromptCacheKey(systemText, modelName));

    const plainModel = getPlainModel();
    const plainRequestConfig = buildPlainRequestConfig(requestConfig, systemText);
    return await plainModel.generateContentStream(plainRequestConfig) as T;
  }
}
