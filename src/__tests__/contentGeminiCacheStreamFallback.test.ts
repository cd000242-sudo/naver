import { describe, expect, it, vi } from 'vitest';
import { invokeGeminiStreamWithCacheFallback } from '../contentGeminiCacheStreamFallback';

describe('contentGeminiCacheStreamFallback', () => {
  it('rethrows stream errors when no cached content was used', async () => {
    const err = new Error('network down');
    const cachedModel = {
      generateContentStream: vi.fn().mockRejectedValue(err),
    };
    const getPlainModel = vi.fn();
    const markUnsupported = vi.fn();
    const deletePromptCache = vi.fn();

    await expect(invokeGeminiStreamWithCacheFallback({
      modelName: 'gemini-2.5-flash',
      apiKey: 'api-key',
      systemText: 'system',
      requestConfig: { contents: [] },
      activeModel: cachedModel,
      getPlainModel,
      markUnsupported,
      deletePromptCache,
    })).rejects.toThrow('network down');

    expect(getPlainModel).not.toHaveBeenCalled();
    expect(markUnsupported).not.toHaveBeenCalled();
    expect(deletePromptCache).not.toHaveBeenCalled();
  });

  it('falls back to a plain Gemini model when cached stream invocation fails', async () => {
    const fallbackResult = { stream: [] };
    const cachedModel = {
      generateContentStream: vi.fn().mockRejectedValue(new Error('cached content not available anymore')),
    };
    const plainModel = {
      generateContentStream: vi.fn().mockResolvedValue(fallbackResult),
    };
    const getPlainModel = vi.fn(() => plainModel);
    const markUnsupported = vi.fn();
    const deletePromptCache = vi.fn();
    const warn = vi.fn();
    const requestConfig = {
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      generationConfig: { temperature: 0.7 },
    };

    const result = await invokeGeminiStreamWithCacheFallback({
      modelName: 'gemini-2.5-flash',
      apiKey: 'api-key',
      systemText: 'system prompt',
      cachedContentName: 'cachedContents/abc',
      requestConfig,
      activeModel: cachedModel,
      getPlainModel,
      markUnsupported,
      deletePromptCache,
      warn,
    });

    expect(result).toBe(fallbackResult);
    expect(cachedModel.generateContentStream).toHaveBeenCalledWith(requestConfig);
    expect(getPlainModel).toHaveBeenCalledTimes(1);
    expect(plainModel.generateContentStream).toHaveBeenCalledTimes(1);
    expect(plainModel.generateContentStream).toHaveBeenCalledWith({
      ...requestConfig,
      systemInstruction: { role: 'system', parts: [{ text: 'system prompt' }] },
    });
    expect(requestConfig).not.toHaveProperty('systemInstruction');
    expect(markUnsupported).toHaveBeenCalledWith('api-key', 'stream: cached content not available anymore');
    expect(deletePromptCache).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{32}$/));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cached content not available anymore'));
  });

  it('keeps an existing systemInstruction when retrying without cached content', async () => {
    const fallbackResult = { stream: [] };
    const cachedModel = {
      generateContentStream: vi.fn().mockRejectedValue(new Error('400 cached content invalid')),
    };
    const plainModel = {
      generateContentStream: vi.fn().mockResolvedValue(fallbackResult),
    };
    const requestConfig = {
      contents: [],
      systemInstruction: { role: 'system', parts: [{ text: 'already injected' }] },
    };

    await invokeGeminiStreamWithCacheFallback({
      modelName: 'gemini-2.5-flash',
      apiKey: 'api-key',
      systemText: 'new system prompt',
      cachedContentName: 'cachedContents/abc',
      requestConfig,
      activeModel: cachedModel,
      getPlainModel: () => plainModel,
      markUnsupported: vi.fn(),
      deletePromptCache: vi.fn(),
    });

    expect(plainModel.generateContentStream).toHaveBeenCalledWith(requestConfig);
  });
});
