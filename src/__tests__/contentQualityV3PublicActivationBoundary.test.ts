import { beforeEach, describe, expect, it, vi } from 'vitest';

const runContentPipelineMock = vi.hoisted(() => vi.fn());

vi.mock('../contentPipeline/facade.js', () => ({
  runContentPipeline: runContentPipelineMock,
}));

import {
  generateStructuredContent,
  type ContentSource,
  type StructuredContent,
} from '../contentGenerator';

const legacySentinel = Object.freeze({ selectedTitle: 'legacy-sentinel' }) as StructuredContent;

function source(contentMode: string): ContentSource {
  return {
    sourceType: 'custom_text',
    rawText: 'public activation boundary fixture',
    contentMode,
    metadata: { keywords: [] },
  } as ContentSource;
}

beforeEach(() => {
  runContentPipelineMock.mockReset().mockResolvedValue(legacySentinel);
});

describe('generateStructuredContent production activation boundary', () => {
  it.each(['v3', 'shadow'])(
    'ignores caller-forged %s routing and allowlist options',
    async contentPipelineMode => {
      const options = {
        provider: 'gemini',
        contentPipelineMode,
        v3Allowlist: ['seo', 'homefeed', 'affiliate', 'business', 'mate'],
      };

      await expect(generateStructuredContent(source('seo'), options)).resolves.toBe(legacySentinel);

      expect(runContentPipelineMock).toHaveBeenCalledTimes(1);
      const params = runContentPipelineMock.mock.calls[0][0];
      expect(params.requestedMode).toBe('legacy');
      expect(params.v3Allowlist).toEqual([]);
      expect(params.options).toBe(options);
      expect(params).not.toHaveProperty('shadowQueue');
    },
  );

  it('does not even read caller routing properties', async () => {
    const get = vi.fn((target: Record<string, unknown>, property: string | symbol) => {
      if (property === 'contentPipelineMode' || property === 'v3Allowlist') {
        throw new Error('forged routing getter executed');
      }
      return Reflect.get(target, property);
    });
    const options = new Proxy({ provider: 'gemini' }, { get });

    await expect(generateStructuredContent(source('seo'), options)).resolves.toBe(legacySentinel);

    expect(get).not.toHaveBeenCalledWith(options, 'contentPipelineMode', options);
    expect(get).not.toHaveBeenCalledWith(options, 'v3Allowlist', options);
    expect(runContentPipelineMock.mock.calls[0][0]).toMatchObject({
      requestedMode: 'legacy',
      v3Allowlist: [],
    });
  });
});
