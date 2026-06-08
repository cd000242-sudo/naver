import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('content generation timeout policy', () => {
  const src = read('renderer/modules/contentGeneration.ts');
  const fullAutoSrc = read('renderer/modules/fullAutoFlow.ts');
  const apiClientSrc = read('renderer/utils/apiClient.ts');
  const costAndAutoGenSrc = read('renderer/modules/costAndAutoGen.ts');
  const mainSrc = read('main.ts');
  const preloadSrc = read('preload.ts');
  const generatorSrc = read('contentGenerator.ts');
  const lowSpecSrc = read('diagnostics/lowSpecMode.ts');
  const costPolicySrc = read('geminiCostOptimizer.ts');

  it('caps renderer-side AI content generation wait time before users sit for 20+ minutes', () => {
    expect(src).toMatch(/CONTENT_GENERATION_TIMEOUT_MS\s*=\s*360000/);
    expect(src).toMatch(/timeout:\s*CONTENT_GENERATION_TIMEOUT_MS/g);
  });

  it('does not stack renderer retries over provider-level Gemini retries', () => {
    expect(src).toMatch(/CONTENT_GENERATION_RETRY_COUNT\s*=\s*0/);
    expect(src).toMatch(/retryCount:\s*CONTENT_GENERATION_RETRY_COUNT/g);
    expect(src).not.toMatch(/retryCount:\s*2/);
  });

  it('applies the same fail-fast content policy to full-auto publishing', () => {
    expect(fullAutoSrc).toMatch(/FULL_AUTO_CONTENT_GENERATION_TIMEOUT_MS\s*=\s*360000/);
    expect(fullAutoSrc).toMatch(/FULL_AUTO_CONTENT_GENERATION_RETRY_COUNT\s*=\s*0/);
    expect(fullAutoSrc).toMatch(/retryCount:\s*FULL_AUTO_CONTENT_GENERATION_RETRY_COUNT/);
    expect(fullAutoSrc).toMatch(/timeout:\s*FULL_AUTO_CONTENT_GENERATION_TIMEOUT_MS/);
    expect(fullAutoSrc).not.toMatch(/timeout:\s*900000/);
  });

  it('does not rerun the full main-process content pipeline after provider retries are exhausted', () => {
    expect(mainSrc).toMatch(/GENERATE_STRUCTURED_CONTENT_RETRIES\s*=\s*0/);
    expect(mainSrc).toMatch(/maxRetries:\s*GENERATE_STRUCTURED_CONTENT_RETRIES/);
  });

  it('bounds Gemini paid/cache side waits that can otherwise stall a completed generation', () => {
    expect(generatorSrc).toMatch(/GEMINI_CACHE_CREATE_TIMEOUT_MS\s*=\s*10_000/);
    expect(generatorSrc).toMatch(/GEMINI_USAGE_METADATA_TIMEOUT_MS\s*=\s*5_000/);
    expect(generatorSrc).toMatch(/waitForGeminiUsageMetadata/);
    expect(generatorSrc).toMatch(/withGeminiTimeout(?:<[^>]+>)?\(\s*cacheManager\.create/);
  });

  it('uses abort-aware provider waits instead of blind sleeps during content generation', () => {
    expect(generatorSrc).toMatch(/function\s+sleepWithAbort/);
    expect(generatorSrc).toMatch(/function\s+withProviderTimeout/);
    expect(generatorSrc).toMatch(/function\s+createProviderTimeoutSignal/);
    expect(generatorSrc).toMatch(/openaiRpmThrottler\.throttle\(\s*getOpenAiMinIntervalMs\(modelName,\s*maxCompletionTokens\),\s*signal\s*\)/);
    expect(generatorSrc).toMatch(/await\s+sleepWithAbort\(backoffMs,\s*signal\)/);
    expect(generatorSrc).toMatch(/await\s+sleepWithAbort\(delay,\s*signal\)/);
  });

  it('keeps outer network retries short and scoped to Gemini only', () => {
    expect(generatorSrc).toMatch(/GEMINI_NETWORK_MAX_RETRIES\s*\?\?\s*1/);
    expect(generatorSrc).toMatch(/isNetworkError\s*&&\s*provider\s*===\s*'gemini'/);
    expect(generatorSrc).toMatch(/getGeminiRateLimitWaitMs\(error,\s*fallbackWaitMs\)/);
  });

  it('reduces transient provider retry loops so stalled generations fail fast', () => {
    expect(generatorSrc).toMatch(/function\s+callOpenAIChatCompletionsRest/);
    expect(generatorSrc).toMatch(/\/chat\/completions/);
    expect(generatorSrc).toMatch(/callOpenAIChatCompletionsRest\(directOpenAiApiKey,\s*baseParams,\s*timeoutMs,\s*signal,\s*diagnosticsEnabled\)/);
    expect(generatorSrc).toMatch(/maxRetries:\s*0/);
    expect(generatorSrc).toMatch(/timeout:\s*timeoutMs/);
    expect(generatorSrc).toMatch(/signal:\s*requestAbort\.signal/);
    expect(generatorSrc).toMatch(/requestAbort\.normalizeError\(requestError\)/);
    expect(generatorSrc).toMatch(/maxTransientRetriesPerModel\s*=\s*0/);
    expect(generatorSrc).toMatch(/maxTransientRetriesPerModel\s*=\s*5/);
    expect(generatorSrc).toMatch(/maxTransientRetries\s*=\s*5/);
    expect(generatorSrc).not.toMatch(/maxRetriesPerModel\s*=\s*4/);
  });

  it('prints actionable OpenAI diagnostics on macOS before users report another black-box timeout', () => {
    expect(generatorSrc).toMatch(/function\s+emitOpenAiDiagnosticLog/);
    expect(generatorSrc).toMatch(/BrowserWindow\.getAllWindows\(\)/);
    expect(generatorSrc).toMatch(/\[OpenAIDiag\]/);
    expect(generatorSrc).toMatch(/function\s+runOpenAiDiagnosticPreflight/);
    expect(generatorSrc).toMatch(/PREFLIGHT_START/);
    expect(generatorSrc).toMatch(/PREFLIGHT_OK/);
    expect(generatorSrc).toMatch(/PREFLIGHT_FAIL/);
    expect(generatorSrc).toMatch(/CHAT_REQUEST_START/);
    expect(generatorSrc).toMatch(/CHAT_RESPONSE_OK/);
    expect(generatorSrc).toMatch(/CHAT_REQUEST_ERROR/);
    expect(generatorSrc).toMatch(/classifyOpenAiDiagnosticError/);
    expect(generatorSrc).toMatch(/process\.platform\s*===\s*'darwin'/);
  });

  it('aborts the main content generation request after a renderer timeout', () => {
    expect(apiClientSrc).toMatch(/abortStaleContentGeneration/);
    expect(apiClientSrc).toMatch(/apiMethod !== 'generateStructuredContent'/);
    expect(apiClientSrc).toMatch(/clearTimeout\(timeoutId\)/);
    expect(apiClientSrc).toMatch(/cancelAutomation/);
  });

  it('bounds image generation waits in full-auto instead of allowing stuck IPC calls', () => {
    expect(costAndAutoGenSrc).toMatch(/DEFAULT_IMAGE_GENERATION_TIMEOUT_MS\s*=\s*6 \* 60 \* 1000/);
    expect(costAndAutoGenSrc).toMatch(/function\s+resolveImageGenerationTimeoutMs/);
    expect(costAndAutoGenSrc).toMatch(/function\s+invokeGenerateImagesIpc/);
    expect(costAndAutoGenSrc).toMatch(/abortImageGenerationIfAvailable/);
    expect(costAndAutoGenSrc).toMatch(/clearTimeout\(timeoutId\)/);
    expect(costAndAutoGenSrc).toMatch(/clearTimeout\(imageApiTimeoutId\)/);
    expect(preloadSrc).toMatch(/abortImageGeneration:\s*\(\)/);
    expect(mainSrc).toMatch(/automation:abortImageGeneration/);

    expect(fullAutoSrc).toMatch(/FULL_AUTO_IMAGE_MAX_ATTEMPTS\s*=\s*3/);
    expect(fullAutoSrc).toMatch(/FULL_AUTO_IMAGE_TOTAL_BUDGET_MS\s*=\s*35 \* 60 \* 1000/);
    expect(fullAutoSrc).toMatch(/imageGenerationTimeoutMs:\s*getBoundedImageTimeoutMs\(getFullAutoThumbnailImageTimeoutMs\(currentProvider\)\)/);
    expect(fullAutoSrc).toMatch(/imageGenerationTimeoutMs:\s*getBoundedImageTimeoutMs\(getFullAutoBodyImageTimeoutMs\(currentProvider,\s*headings\.length\)\)/);
  });

  it('uses the first regeneration budget to repair custom prompt drift instead of passing weak output', () => {
    expect(generatorSrc).toMatch(/type\s+PromptAdherenceReport/);
    expect(generatorSrc).toMatch(/function\s+assessCustomPromptAdherence/);
    expect(generatorSrc).toMatch(/PROMPT_ADHERENCE_REPAIR/);
    expect(generatorSrc).toMatch(/const\s+promptRepairMinAttempts\s*=\s*source\.customPrompt\?\.trim\(\)\s*\?\s*2\s*:\s*0/);
    expect(generatorSrc).toMatch(/const\s+customPromptAdherence\s*=\s*assessCustomPromptAdherence\(parsed,\s*source\)/);
    expect(generatorSrc).toMatch(/!customPromptAdherence\.passed\s*&&\s*attempt\s*<\s*MAX_ATTEMPTS/);
    expect(generatorSrc).toMatch(/customPromptAdherence\.retryInstruction/);
  });

  it('keeps generation on the selected engine while giving recoverable failures one same-engine repair', () => {
    expect(generatorSrc).toMatch(/function\s+isTerminalContentGenerationError/);
    expect(generatorSrc).toMatch(/function\s+buildSameEngineRecoveryInstruction/);
    expect(generatorSrc).toMatch(/CONTENT_SAME_ENGINE_MIN_ATTEMPTS/);
    expect(generatorSrc).toMatch(/const\s+sameEngineReliabilityMinAttempts\s*=\s*readNonNegativeIntegerEnv\('CONTENT_SAME_ENGINE_MIN_ATTEMPTS',\s*1\)/);
    expect(generatorSrc).toMatch(/const\s+MAX_ATTEMPTS\s*=\s*Math\.max\(baseMaxAttempts,\s*sameEngineReliabilityMinAttempts,\s*promptRepairMinAttempts\)/);
    expect(generatorSrc).toMatch(/SAME_ENGINE_RECOVERY/);
    expect(generatorSrc).toMatch(/다른 AI 엔진으로 전환하지 않습니다/);
    expect(generatorSrc).toMatch(/const\s+terminalError\s*=\s*isTerminalContentGenerationError\(error\)/);
    expect(generatorSrc).toMatch(/terminalError\s*\|\|\s*attempt\s*===\s*MAX_ATTEMPTS/);
  });

  it('treats Gemini RPM as a transient same-model wait instead of a hard billing failure', () => {
    expect(generatorSrc).toMatch(/function\s+getGeminiRateLimitPatienceMs/);
    expect(generatorSrc).toMatch(/GEMINI_RATE_LIMIT_PATIENCE_MS/);
    expect(generatorSrc).toMatch(/function\s+throttleGeminiRequest/);
    expect(generatorSrc).toMatch(/GEMINI_MIN_INTERVAL_MS/);
    expect(generatorSrc).toMatch(/return\s+config\?\.geminiPlanType\s*===\s*'paid'\s*\?\s*8000\s*:\s*10_000/);
    expect(generatorSrc).toMatch(/function\s+getGeminiRateLimitWaitMs/);
    expect(generatorSrc).toMatch(/await\s+throttleGeminiRequest\(modelName,\s*config,\s*options\.signal\)/);
    expect(generatorSrc).toMatch(/geminiRateLimitWaitedMs\s*\+\s*waitMs\s*<=\s*geminiRateLimitPatienceMs/);
    expect(generatorSrc).toMatch(/같은 모델로 자동 재시도합니다/);
    expect(generatorSrc).not.toMatch(/\/429\|quota\|rate limit\|too many requests\|resource exhausted\|rpm\|tpm\|rpd\|할당량\|요청 한도\|분당 요청\|일일 무료/);
  });

  it('keeps Gemini context caching opt-in so one content request does not create a hidden pre-call', () => {
    expect(generatorSrc).toMatch(/GEMINI_CACHE_ENABLED/);
    expect(generatorSrc).toMatch(/const\s+cacheOptInEnv\s*=\s*process\.env\.GEMINI_CACHE_ENABLED\s*===\s*'1'/);
    expect(generatorSrc).toMatch(/const\s+cacheEnabled\s*=\s*cacheOptInEnv\s*\n\s*&&\s*!cacheDisabledEnv/);
    expect(generatorSrc).not.toMatch(/const\s+cacheEnabled\s*=\s*!cacheDisabledEnv\s*\n\s*&&\s*isCacheSupportedForKey/);
  });

  it('keeps Claude prompt caching opt-in to avoid hidden schema-fallback calls', () => {
    expect(generatorSrc).toMatch(/CLAUDE_PROMPT_CACHE_ENABLED/);
    expect(generatorSrc).toMatch(/const\s+cacheOptIn\s*=\s*process\.env\.CLAUDE_PROMPT_CACHE_ENABLED\s*===\s*'1'/);
    expect(generatorSrc).toMatch(/const\s+useSystemCache\s*=\s*cacheOptIn\s*&&\s*!cacheDisabled/);
  });

  it('uses official-header-aware patient waits for Claude and Perplexity rate limits', () => {
    expect(generatorSrc).toMatch(/function\s+getClaudeRateLimitWaitMs/);
    expect(generatorSrc).toMatch(/anthropic-ratelimit-requests-reset/);
    expect(generatorSrc).toMatch(/retry-after/);
    expect(generatorSrc).toMatch(/function\s+getPerplexityRateLimitWaitMs/);
    expect(generatorSrc).toMatch(/PERPLEXITY_RATE_LIMIT_PATIENCE_MS/);
    expect(generatorSrc).toMatch(/CLAUDE_RATE_LIMIT_PATIENCE_MS/);
    expect(generatorSrc).toMatch(/await\s+throttleProviderRequest\('Claude'/);
    expect(generatorSrc).toMatch(/await\s+throttleProviderRequest\('Perplexity'/);
  });

  it('keeps hidden post-generation LLM patch calls explicit opt-in', () => {
    expect(costPolicySrc).toMatch(/CONTENT_ALLOW_EXTRA_LLM_PATCHES/);
    expect(costPolicySrc).toMatch(/!costSaverOn\s*&&\s*env\.CONTENT_ALLOW_EXTRA_LLM_PATCHES\s*===\s*'1'/);
  });

  it('does not advertise an unsafe Gemini RPM ceiling for high-spec machines', () => {
    expect(lowSpecSrc).toMatch(/geminiRpmCeiling:\s*8/);
    expect(lowSpecSrc).toMatch(/geminiRpmCeiling:\s*6/);
    expect(lowSpecSrc).not.toMatch(/geminiRpmCeiling:\s*30/);
  });
});
