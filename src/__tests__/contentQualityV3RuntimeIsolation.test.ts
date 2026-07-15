import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'electron';
import fsSync from 'fs';

const loadConfigMock = vi.hoisted(() => vi.fn());
const applyConfigToEnvMock = vi.hoisted(() => vi.fn());
const acquireLimiterMock = vi.hoisted(() => vi.fn());
const releaseLimiterMock = vi.hoisted(() => vi.fn());
const invokeGeminiMock = vi.hoisted(() => vi.fn());
const getSearchVolumeMock = vi.hoisted(() => vi.fn());
const getDocumentCountMock = vi.hoisted(() => vi.fn());
const detectProductCategoryMock = vi.hoisted(() => vi.fn());
const resolvePromptCacheEligibilityMock = vi.hoisted(() => vi.fn());
const geminiCacheCreateMock = vi.hoisted(() => vi.fn());
const getCachedGeminiResultMock = vi.hoisted(() => vi.fn());
const setCachedGeminiResultMock = vi.hoisted(() => vi.fn());
const verifyRuntimeFingerprintMock = vi.hoisted(() => vi.fn());
const geminiResponses = vi.hoisted(() => [] as string[]);
const geminiRequests = vi.hoisted(() => [] as Array<Record<string, any>>);
const geminiModelNames = vi.hoisted(() => [] as string[]);
const probeUnifiedSerpMock = vi.hoisted(() => vi.fn());
const appendHistoryMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const materializedV3Inputs = vi.hoisted(() => [] as Readonly<StructuredContent>[]);
let appGetPathSpy: ReturnType<typeof vi.spyOn>;
let existsSyncSpy: ReturnType<typeof vi.spyOn>;
let readFileSyncSpy: ReturnType<typeof vi.spyOn>;

vi.mock('../configManager.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../configManager.js')>()),
  loadConfig: loadConfigMock,
  applyConfigToEnv: applyConfigToEnvMock,
  getConfigSync: vi.fn(() => ({})),
}));

vi.mock('../runtime/adaptiveLimiter.js', () => ({
  globalLimiter: { acquire: acquireLimiterMock },
}));

vi.mock('../agents/trendAnalyzer.js', () => ({
  trendAnalyzer: {
    getSearchVolume: getSearchVolumeMock,
    getDocumentCount: getDocumentCountMock,
  },
}));

vi.mock('../contentProductCategory.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../contentProductCategory.js')>()),
  detectProductCategory: detectProductCategoryMock,
}));

vi.mock('../contentGeminiCacheEligibility.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../contentGeminiCacheEligibility.js')>()),
  resolveGeminiPromptCacheEligibility: resolvePromptCacheEligibilityMock,
}));

vi.mock('../contentGeminiResultCache.js', () => ({
  getCachedGeminiResult: getCachedGeminiResultMock,
  setCachedGeminiResult: setCachedGeminiResultMock,
}));

vi.mock('../contentQualityV3/candidateRuntimeFingerprint.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../contentQualityV3/candidateRuntimeFingerprint.js')>()),
  verifyContentQualityV3CandidateRuntimeFingerprint: verifyRuntimeFingerprintMock,
}));

vi.mock('../contentGeminiBudgetSafety.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../contentGeminiBudgetSafety.js')>()),
  enforceGeminiBudgetSafety: vi.fn(async () => undefined),
}));

vi.mock('../contentAbortTimeoutPolicy.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../contentAbortTimeoutPolicy.js')>()),
  sleepWithAbort: vi.fn(async () => undefined),
}));

vi.mock('../contentGeminiCacheStreamFallback.js', () => ({
  invokeGeminiStreamWithCacheFallback: invokeGeminiMock,
}));

vi.mock('../apiUsageTracker.js', () => ({
  trackApiUsage: vi.fn(),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(input: { model: string }): Record<string, never> {
      geminiModelNames.push(input.model);
      return {};
    }
  },
}));

vi.mock('@google/generative-ai/server', () => ({
  GoogleAICacheManager: class {
    create(input: unknown): Promise<Record<string, never>> {
      return geminiCacheCreateMock(input);
    }
  },
}));

vi.mock('../analytics/unifiedSerpProbe.js', () => ({
  probeUnifiedSerp: probeUnifiedSerpMock,
}));

vi.mock('../analytics/serpHistory.js', () => ({
  appendHistory: appendHistoryMock,
  buildAdaptiveLearningDirective: vi.fn(() => ''),
}));

vi.mock('fs/promises', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    writeFile: writeFileMock,
    default: { ...actual, writeFile: writeFileMock },
  };
});

vi.mock('../contentQualityV3/finalizer.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../contentQualityV3/finalizer.js')>();
  return {
    ...actual,
    materializeContentQualityV3ForLegacyConsumers: vi.fn((content: Readonly<StructuredContent>) => {
      materializedV3Inputs.push(content);
      return actual.materializeContentQualityV3ForLegacyConsumers(content);
    }),
  };
});

import {
  type ContentSource,
  type StructuredContent,
} from '../contentGenerator';
import { generateContentQualityV3CandidateForEvaluation } from '../contentQualityV3/evaluationOnlyCandidateDriver';

const ORIGINAL_CONTENT_MAX_ATTEMPTS = process.env.CONTENT_MAX_ATTEMPTS;
const ORIGINAL_GEMINI_MIN_INTERVAL_MS = process.env.GEMINI_MIN_INTERVAL_MS;
const ORIGINAL_GEMINI_NETWORK_MAX_RETRIES = process.env.GEMINI_NETWORK_MAX_RETRIES;
const ORIGINAL_GEMINI_CACHE_ENABLED = process.env.GEMINI_CACHE_ENABLED;

function makeDraft(selectedTitle: string): StructuredContent {
  const bodyPlain = '공식 발표에 따르면 <title> 표기는 원문 그대로이며 A & B를 비교합니다.';
  return {
    status: 'success',
    generationTime: '1s',
    selectedTitle,
    titleAlternatives: ['모델 대안 제목'],
    titleCandidates: [{ text: '모델 후보 제목', score: 88, reasoning: 'source-backed' }],
    bodyHtml: '',
    bodyPlain,
    headings: [1, 2, 3].map(index => ({
      title: `소제목 ${index}`,
      content: '',
      summary: `근거 요약 ${index}`,
      keywords: ['근거'],
      imagePrompt: '',
    })),
    hashtags: ['#근거'],
    images: [],
    metadata: {
      category: 'general',
      targetAge: 'all',
      urgency: 'evergreen',
      estimatedReadTime: '1분',
      wordCount: bodyPlain.length,
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      keywordStrategy: '자연스러운 주제어',
      publishTimeRecommend: '',
    },
    quality: {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      originalityScore: 90,
      readabilityScore: 90,
      warnings: ['소제목 4개'],
    },
  };
}

function makeSource(): ContentSource {
  return {
    sourceType: 'custom_text',
    rawText: '입력에서 확인된 사실만 사용하는 exact V3 동적 격리 테스트 원문입니다.',
    contentMode: 'seo',
    manualTitleOverride: '사용자 제목',
    metadata: { keywords: ['attested-primary-keyword', 'attested-secondary-keyword'] },
  };
}

function v3Options(minChars = 2_500): any {
  return {
    provider: 'gemini',
    minChars,
  };
}

beforeEach(() => {
  process.env.CONTENT_MAX_ATTEMPTS = '3';
  process.env.GEMINI_NETWORK_MAX_RETRIES = '7';
  process.env.GEMINI_MIN_INTERVAL_MS = '0';
  process.env.GEMINI_CACHE_ENABLED = '1';
  geminiResponses.length = 0;
  geminiRequests.length = 0;
  geminiModelNames.length = 0;
  materializedV3Inputs.length = 0;
  loadConfigMock.mockReset().mockResolvedValue({
    geminiApiKey: 'test-key',
    primaryGeminiTextModel: 'gemini-3.5-flash',
    geminiPlanType: 'free',
    aiTabFriendlyMode: true,
    enableSearchGrounding: false,
    autoSerpBenchmark: true,
    naverSearchClientId: 'serp-client',
    naverSearchClientSecret: 'serp-secret',
  });
  applyConfigToEnvMock.mockReset();
  getSearchVolumeMock.mockReset().mockResolvedValue(919_191);
  getDocumentCountMock.mockReset().mockResolvedValue(818_181);
  detectProductCategoryMock.mockReset().mockReturnValue({
    category: 'electronics',
    categoryKorean: 'PREPROMPT_DYNAMIC_CATEGORY_SENTINEL',
    confidence: 'high',
    matchedKeywords: ['sentinel'],
  });
  resolvePromptCacheEligibilityMock.mockReset().mockReturnValue({
    enabled: true,
    minCacheChars: 0,
    reason: 'eligible',
  });
  geminiCacheCreateMock.mockReset().mockResolvedValue({});
  getCachedGeminiResultMock.mockReset().mockReturnValue(undefined);
  setCachedGeminiResultMock.mockReset();
  verifyRuntimeFingerprintMock.mockReset().mockResolvedValue(undefined);
  releaseLimiterMock.mockReset();
  acquireLimiterMock.mockReset().mockResolvedValue(releaseLimiterMock);
  probeUnifiedSerpMock.mockReset();
  appendHistoryMock.mockReset();
  writeFileMock.mockReset().mockResolvedValue(undefined);
  appGetPathSpy = vi.spyOn(app, 'getPath');
  existsSyncSpy = vi.spyOn(fsSync, 'existsSync');
  readFileSyncSpy = vi.spyOn(fsSync, 'readFileSync');
  invokeGeminiMock.mockReset().mockImplementation(async (input: Record<string, any>) => {
    geminiRequests.push(input.requestConfig);
    const response = geminiResponses.shift();
    if (!response) throw new Error('missing mocked Gemini response');
    return {
      stream: (async function* stream() {
        yield { text: () => response };
      }()),
      response: Promise.resolve({ usageMetadata: {} }),
    };
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  if (ORIGINAL_CONTENT_MAX_ATTEMPTS === undefined) delete process.env.CONTENT_MAX_ATTEMPTS;
  else process.env.CONTENT_MAX_ATTEMPTS = ORIGINAL_CONTENT_MAX_ATTEMPTS;
  if (ORIGINAL_GEMINI_MIN_INTERVAL_MS === undefined) delete process.env.GEMINI_MIN_INTERVAL_MS;
  else process.env.GEMINI_MIN_INTERVAL_MS = ORIGINAL_GEMINI_MIN_INTERVAL_MS;
  if (ORIGINAL_GEMINI_NETWORK_MAX_RETRIES === undefined) delete process.env.GEMINI_NETWORK_MAX_RETRIES;
  else process.env.GEMINI_NETWORK_MAX_RETRIES = ORIGINAL_GEMINI_NETWORK_MAX_RETRIES;
  if (ORIGINAL_GEMINI_CACHE_ENABLED === undefined) delete process.env.GEMINI_CACHE_ENABLED;
  else process.env.GEMINI_CACHE_ENABLED = ORIGINAL_GEMINI_CACHE_ENABLED;
  vi.restoreAllMocks();
});

describe('Content Quality V3 runtime isolation', () => {
  it('uses one cache-free provider call without live metrics or config-derived prompt changes', async () => {
    geminiResponses.push(JSON.stringify(makeDraft('사용자 제목')));
    const source = Object.freeze(makeSource());
    const sourceBefore = structuredClone(source);

    const result = await generateContentQualityV3CandidateForEvaluation(source, v3Options(500));

    expect(result.bodyPlain).toContain('공식 발표에 따르면 <title>');
    expect(result.bodyHtml).toContain('공식 발표에 따르면 &lt;title&gt;');
    expect(result.bodyHtml).toContain('A &amp; B');
    expect(result.titleAlternatives).toEqual(['모델 대안 제목']);
    expect(result.quality.warnings).toEqual(['소제목 4개']);
    expect(materializedV3Inputs).toHaveLength(1);
    const pureFinalizedContent = materializedV3Inputs[0] as StructuredContent;
    expect(Object.isFrozen(pureFinalizedContent)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.headings)).toBe(true);
    expect(Object.isFrozen(result.headings[0])).toBe(true);
    expect(Object.isFrozen(result.quality)).toBe(true);
    expect(result).not.toBe(pureFinalizedContent);
    expect(result.headings).not.toBe(pureFinalizedContent.headings);
    expect(result.quality).not.toBe(pureFinalizedContent.quality);
    expect(source).toEqual(sourceBefore);
    expect(loadConfigMock).toHaveBeenCalledTimes(1);
    expect(applyConfigToEnvMock).not.toHaveBeenCalled();
    expect(getSearchVolumeMock).not.toHaveBeenCalled();
    expect(getDocumentCountMock).not.toHaveBeenCalled();
    expect(detectProductCategoryMock).not.toHaveBeenCalled();
    expect(resolvePromptCacheEligibilityMock).not.toHaveBeenCalled();
    expect(geminiCacheCreateMock).not.toHaveBeenCalled();
    expect(getCachedGeminiResultMock).not.toHaveBeenCalled();
    expect(setCachedGeminiResultMock).not.toHaveBeenCalled();
    expect(probeUnifiedSerpMock).not.toHaveBeenCalled();
    expect(appendHistoryMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(appGetPathSpy).not.toHaveBeenCalled();
    expect(existsSyncSpy).not.toHaveBeenCalled();
    expect(readFileSyncSpy).not.toHaveBeenCalled();
    expect(geminiModelNames).toEqual(['gemini-3.1-flash-lite']);
    expect(geminiRequests).toHaveLength(1);
    expect(JSON.stringify(geminiRequests[0])).not.toContain('919191');
    expect(JSON.stringify(geminiRequests[0])).not.toContain('818181');
    expect(JSON.stringify(geminiRequests[0])).not.toContain('PREPROMPT_DYNAMIC_CATEGORY_SENTINEL');
    expect(geminiRequests[0]).not.toHaveProperty('tools');
    expect(geminiRequests[0].generationConfig).not.toHaveProperty('temperature');
    expect(geminiRequests[0].generationConfig).not.toHaveProperty('topP');
    expect(geminiRequests[0].generationConfig).not.toHaveProperty('topK');

    const finalizedTitle = pureFinalizedContent.selectedTitle;
    const finalizedHeadingTitle = pureFinalizedContent.headings[0].title;
    expect(() => {
      result.selectedTitle = 'evaluation mutation attempt';
    }).toThrow(TypeError);
    expect(() => {
      result.headings[0].title = 'evaluation heading mutation attempt';
    }).toThrow(TypeError);
    expect(pureFinalizedContent.selectedTitle).toBe(finalizedTitle);
    expect(pureFinalizedContent.headings[0].title).toBe(finalizedHeadingTitle);
  });

  it('fails closed after one V3 call when the title contract is invalid', async () => {
    geminiResponses.push(
      JSON.stringify(makeDraft('모델 제목 1')),
      JSON.stringify(makeDraft('모델 제목 2')),
    );
    const source = Object.freeze(makeSource());
    const sourceBefore = structuredClone(source);

    await expect(generateContentQualityV3CandidateForEvaluation(source, v3Options())).rejects.toMatchObject({
      issueCode: 'candidate_execution_failed',
    });

    expect(geminiModelNames).toEqual(['gemini-3.1-flash-lite']);
    expect(geminiRequests).toHaveLength(1);
    expect(JSON.stringify(geminiRequests)).not.toContain('CONTENT_QUALITY_V3_RETRY');
    expect(loadConfigMock).toHaveBeenCalledTimes(1);
    expect(getSearchVolumeMock).not.toHaveBeenCalled();
    expect(getDocumentCountMock).not.toHaveBeenCalled();
    expect(probeUnifiedSerpMock).not.toHaveBeenCalled();
    expect(appendHistoryMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(appGetPathSpy).not.toHaveBeenCalled();
    expect(existsSyncSpy).not.toHaveBeenCalled();
    expect(readFileSyncSpy).not.toHaveBeenCalled();
    expect(source).toEqual(sourceBefore);
  });

  it('fails affiliate hard guards after one call without dynamic category pre-guidance', async () => {
    const unsafeDraft = JSON.stringify(makeDraft('제품 사용 후기'));
    geminiResponses.push(unsafeDraft, unsafeDraft, unsafeDraft, unsafeDraft);
    const source = Object.freeze({
      ...makeSource(),
      contentMode: 'affiliate' as const,
      manualTitleOverride: '제품 사용 후기',
      productSpec: '무게 680g',
    });
    const sourceBefore = structuredClone(source);

    await expect(generateContentQualityV3CandidateForEvaluation(
      source,
      v3Options(),
    )).rejects.toMatchObject({
      issueCode: 'candidate_execution_failed',
    });

    expect(geminiModelNames).toEqual(['gemini-3.1-flash-lite']);
    expect(geminiRequests).toHaveLength(1);
    expect(detectProductCategoryMock).not.toHaveBeenCalled();
    expect(JSON.stringify(geminiRequests)).not.toContain('PREPROMPT_DYNAMIC_CATEGORY_SENTINEL');
    expect(JSON.stringify(geminiRequests)).not.toContain('CONTENT_QUALITY_V3_RETRY');
    expect(JSON.stringify(geminiRequests)).not.toContain('[SAME_ENGINE_RECOVERY]');
    expect(materializedV3Inputs).toHaveLength(0);
    expect(source).toEqual(sourceBefore);
  });

  it('does not rotate keys or retry a V3 provider failure', async () => {
    loadConfigMock.mockResolvedValue({
      geminiApiKey: 'primary-test-key',
      geminiApiKeys: ['backup-test-key'],
      primaryGeminiTextModel: 'gemini-3.5-flash',
      geminiPlanType: 'free',
      geminiUseFreeQuotaBeforePaid: true,
    });
    invokeGeminiMock.mockReset().mockImplementation(async (input: Record<string, any>) => {
      geminiRequests.push(input.requestConfig);
      throw new Error('503 provider unavailable');
    });

    await expect(generateContentQualityV3CandidateForEvaluation(
      Object.freeze(makeSource()),
      v3Options(),
    )).rejects.toMatchObject({ issueCode: 'candidate_execution_failed' });

    expect(geminiModelNames).toEqual(['gemini-3.1-flash-lite']);
    expect(geminiRequests).toHaveLength(1);
    expect(resolvePromptCacheEligibilityMock).not.toHaveBeenCalled();
    expect(geminiCacheCreateMock).not.toHaveBeenCalled();
  });
});
