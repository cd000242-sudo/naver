import { describe, expect, it } from 'vitest';

import {
  CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY,
  CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY_BRAND,
  createContentQualityV3GeminiRequestEnvelope,
} from '../contentQualityV3/geminiRequestContract';
import {
  buildContentQualityV3Prompt,
  createContentQualityV3InitialPromptOptions,
} from '../contentQualityV3/prompt';
import { CONTENT_QUALITY_V3_GEMINI_MODEL } from '../contentQualityV3/providerPolicy';
import { CONTENT_QUALITY_V3_OUTPUT_SCHEMA } from '../contentQualityV3/schema';

describe('Content Quality V3 Gemini request contract', () => {
  it('builds the attested initial prompt options from source keywords only', () => {
    const source = Object.freeze({
      contentMode: 'seo',
      rawText: '고정된 평가 근거',
      metadata: Object.freeze({
        keywords: Object.freeze(['주 키워드', '보조 키워드', '1']),
      }),
    });

    const options = createContentQualityV3InitialPromptOptions({
      mode: 'seo',
      source,
      minChars: 2_500,
    });

    expect(options).toEqual({
      mode: 'seo',
      source,
      minChars: 2_500,
      primaryKeyword: '주 키워드',
      subKeywords: ['보조 키워드'],
      runtimeInstruction: '',
    });
    expect(options).not.toHaveProperty('metrics');
    expect(Object.isFrozen(options)).toBe(true);
    expect(Object.isFrozen(options.subKeywords)).toBe(true);
  });

  it('owns the complete model, grounding, schema, sampling, and safety envelope', () => {
    const source = Object.freeze({
      contentMode: 'seo',
      rawText: '오직 이 근거만 사용하는 재현 가능한 요청',
      metadata: Object.freeze({ keywords: Object.freeze(['재현 키워드']) }),
    });
    const prompt = buildContentQualityV3Prompt(createContentQualityV3InitialPromptOptions({
      mode: 'seo',
      source,
      minChars: 2_500,
    }));

    const envelope = createContentQualityV3GeminiRequestEnvelope(prompt);

    expect(envelope.model).toBe(CONTENT_QUALITY_V3_GEMINI_MODEL);
    expect(envelope.useGrounding).toBe(false);
    expect(envelope.systemText.length).toBeGreaterThan(0);
    expect(envelope.userText.length).toBeGreaterThan(0);
    expect(envelope.requestConfig).not.toHaveProperty('tools');
    expect(envelope.requestConfig.systemInstruction).toEqual({
      role: 'system',
      parts: [{ text: envelope.systemText }],
    });
    expect(envelope.requestConfig.contents).toEqual([
      { role: 'user', parts: [{ text: envelope.userText }] },
    ]);
    expect(envelope.requestConfig.generationConfig).toMatchObject({
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: CONTENT_QUALITY_V3_OUTPUT_SCHEMA,
    });
    expect(envelope.requestConfig.generationConfig).not.toHaveProperty('temperature');
    expect(envelope.requestConfig.generationConfig).not.toHaveProperty('topP');
    expect(envelope.requestConfig.generationConfig).not.toHaveProperty('topK');
    expect(envelope.requestConfig.safetySettings).toEqual([
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ]);
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.requestConfig)).toBe(true);
  });

  it('brands an immutable policy with exactly one provider call and no hidden retries', () => {
    expect(CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY).toEqual({
      brand: CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY_BRAND,
      maxTopLevelRetries: 0,
      maxNetworkRetries: 0,
      maxProviderCalls: 1,
      allowPromptCache: false,
      allowResultCache: false,
      allowKeyRotation: false,
      allowPromptAugmentation: false,
      allowRateLimitRetry: false,
      allowServerRetry: false,
      allowGenericRetry: false,
    });
    expect(Object.isFrozen(CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY)).toBe(true);
  });
});
