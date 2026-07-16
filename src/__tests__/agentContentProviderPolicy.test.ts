import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadConfigMock = vi.hoisted(() => vi.fn());
const aggregateInferencesMock = vi.hoisted(() => vi.fn());
const buildNarrativeContentMock = vi.hoisted(() => vi.fn());
const releaseLimiterMock = vi.hoisted(() => vi.fn());
const acquireLimiterMock = vi.hoisted(() => vi.fn().mockResolvedValue(releaseLimiterMock));
const generateWithAgentMock = vi.hoisted(() => vi.fn());

vi.mock('../configManager.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../configManager.js')>()),
  loadConfig: loadConfigMock,
}));
vi.mock('../imageNarrative/inferenceAggregator/aggregator', () => ({
  aggregateInferences: aggregateInferencesMock,
}));
vi.mock('../imageNarrative/narrativeBuilder/builder', () => ({
  buildNarrativeContent: buildNarrativeContentMock,
}));
vi.mock('../runtime/adaptiveLimiter', () => ({
  globalLimiter: { acquire: acquireLimiterMock },
}));
vi.mock('../agentCli/index.js', () => ({
  generateWithAgent: generateWithAgentMock,
}));

import { generateStructuredContent, type ContentSource } from '../contentGenerator';
import { createAgentProductPolicyContext } from '../agentCli/productPolicy';

const NARRATIVE_SENTINEL = new Error('NARRATIVE_PROVIDER_REACHED');
const REGULAR_SENTINEL = new Error('REGULAR_PROVIDER_REACHED');

function regularSource(generator: ContentSource['generator']): ContentSource {
  return {
    sourceType: 'custom_text',
    rawText: '정책 경계를 검증하기 위한 충분한 일반 콘텐츠 원문입니다.',
    contentMode: 'seo',
    generator,
  };
}

function imageNarrativeSource(provider: 'gemini' | 'openai' | 'claude' = 'gemini'): ContentSource {
  return {
    sourceType: 'custom_text',
    rawText: '이미지 내러티브 정책 검증 원문',
    contentMode: 'image-narrative',
    imageNarrative: {
      images: [{ buffer: Buffer.from('image'), mimeType: 'image/png' }],
      provider,
    },
  };
}

beforeEach(() => {
  loadConfigMock.mockReset();
  aggregateInferencesMock.mockReset();
  buildNarrativeContentMock.mockReset();
  releaseLimiterMock.mockReset();
  acquireLimiterMock.mockReset().mockResolvedValue(releaseLimiterMock);
  generateWithAgentMock.mockReset().mockRejectedValue(REGULAR_SENTINEL);
  aggregateInferencesMock.mockResolvedValue({ sections: [] });
  buildNarrativeContentMock.mockRejectedValue(NARRATIVE_SENTINEL);
});

describe('resolved content provider product-policy boundary', () => {
  it('allows a normal agent-claude provider to reach the local CLI', async () => {
    await expect(generateStructuredContent(regularSource('agent-claude')))
      .rejects.toThrow('REGULAR_PROVIDER_REACHED');

    expect(acquireLimiterMock).toHaveBeenCalled();
    expect(generateWithAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'claude' }),
      undefined,
    );
  });

  it('allows image-narrative when saved configuration promotes Gemini to agent-claude', async () => {
    loadConfigMock.mockResolvedValue({ primaryGeminiTextModel: 'agent-claude' });

    await expect(generateStructuredContent(
      imageNarrativeSource('gemini'),
      { provider: 'gemini' } as any,
    )).rejects.toBe(NARRATIVE_SENTINEL);

    expect(aggregateInferencesMock).toHaveBeenCalled();
    expect(buildNarrativeContentMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: 'agent-claude' }),
    );
  });

  it('keeps explicit local-development Claude subscription routing available', async () => {
    loadConfigMock.mockResolvedValue({ primaryGeminiTextModel: 'agent-claude' });
    const context = createAgentProductPolicyContext({ allowClaudeSubscription: true });

    await expect(generateStructuredContent(
      imageNarrativeSource('gemini'),
      { provider: 'gemini', agentProductPolicyContext: context } as any,
    )).rejects.toBe(NARRATIVE_SENTINEL);

    expect(buildNarrativeContentMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: 'agent-claude' }),
    );
  });

  it.each([
    ['claude', 'claude-sonnet', 'claude'],
    ['gemini', 'agent-codex', 'agent-codex'],
  ] as const)('preserves the %s route when saved text engine is %s', async (
    narrativeProvider,
    configuredTextEngine,
    expectedTextProvider,
  ) => {
    loadConfigMock.mockResolvedValue({ primaryGeminiTextModel: configuredTextEngine });

    await expect(generateStructuredContent(
      imageNarrativeSource(narrativeProvider),
      { provider: narrativeProvider } as any,
    )).rejects.toBe(NARRATIVE_SENTINEL);

    expect(buildNarrativeContentMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: expectedTextProvider }),
    );
  });
});
