import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createContentQualityV3GeminiRequestEnvelope,
  createContentQualityV3GeminiSdkRequest,
} from '../contentQualityV3/geminiRequestContract.js';

describe('Content Quality V3 installed Gemini SDK compatibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps canonical evidence frozen but gives the mutating SDK a detached request', async () => {
    const envelope = createContentQualityV3GeminiRequestEnvelope(
      '[SYSTEM]\n정책\n\n[원본 텍스트]\n근거',
    );
    const sdkRequest = createContentQualityV3GeminiSdkRequest(envelope);
    let requestBody = '';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      requestBody = String(init?.body ?? '');
      throw new Error('expected-fetch-sentinel');
    });
    const model = new GoogleGenerativeAI('test-key').getGenerativeModel({
      model: envelope.model,
    });

    expect(Object.isFrozen(envelope.requestConfig)).toBe(true);
    expect(Object.isFrozen(sdkRequest)).toBe(false);
    expect(sdkRequest).toEqual(envelope.requestConfig);
    await expect(model.generateContentStream(sdkRequest as any)).rejects.toThrow(
      /expected-fetch-sentinel/u,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(requestBody)).toEqual(envelope.requestConfig);
    expect(Object.isFrozen(envelope.requestConfig)).toBe(true);
  });

  it('materializes the SDK request only at the provider call boundary', () => {
    const source = readFileSync(resolve(process.cwd(), 'src', 'contentGenerator.ts'), 'utf8');

    expect(source).toContain(
      'createContentQualityV3GeminiSdkRequest(strictRequestEnvelope)',
    );
    expect(source).not.toContain(
      'const requestConfig: any = strictRequestEnvelope?.requestConfig ??',
    );
  });
});
