/**
 * ✅ [v1.4.77] 소스 코드 불변식 검증 — 이번 수정사항이 회귀되지 않도록 고정
 *
 * 검증 목표:
 * - contentGenerator.ts의 출력 토큰 상한 축소 유지
 * - OpenAI 모델 매핑이 UI 라벨과 1:1 일치
 * - 이미지 기본 엔진이 schnell(저가)로 유지
 * - Gemini 캐싱 조건이 "무료/유료 구분 없음"으로 유지
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildGeminiGenerationConfig } from '../contentGeminiSamplingPolicy.js';
import { GEMINI_TEXT_MODELS } from '../runtime/modelRegistry.js';

const ROOT = path.resolve(__dirname, '..');
function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

describe('v1.4.77 — 비용 최적화 소스 불변식', () => {
  describe('출력 토큰 상한 축소 유지', () => {
    const content = read('contentGenerator.ts');

    it('Gemini tier token budgets stay bounded while reserving thinking output', () => {
      expect(content).toMatch(
        /generationConfig:\s*buildGeminiGenerationConfig\(\{\s*activeTemperature,\s*modelName,\s*isPro,\s*schema:\s*options\.schema,\s*useModelDefaultSampling:\s*options\.useModelDefaultSampling,\s*\}\)/,
      );

      // Provider capacity is higher, but these are deliberate product cost caps.
      // Current Gemini 3 models keep their default thinking; only the legacy 2.5
      // branch may inject thinkingBudget: 0.
      const currentTierConfigs = [
        buildGeminiGenerationConfig({
          activeTemperature: 0.5,
          modelName: GEMINI_TEXT_MODELS.FLASH_LITE,
          isPro: false,
          useModelDefaultSampling: true,
        }),
        buildGeminiGenerationConfig({
          activeTemperature: 0.5,
          modelName: GEMINI_TEXT_MODELS.FLASH,
          isPro: false,
        }),
        buildGeminiGenerationConfig({
          activeTemperature: 0.5,
          modelName: GEMINI_TEXT_MODELS.PRO,
          isPro: true,
        }),
      ];

      expect(currentTierConfigs.map((config) => config.maxOutputTokens)).toEqual([
        8192,
        12288,
        16384,
      ]);
      expect(currentTierConfigs.every((config) => (
        typeof config.maxOutputTokens === 'number'
        && config.maxOutputTokens <= 16384
      ))).toBe(true);
      expect(currentTierConfigs.every((config) => !('thinkingConfig' in config))).toBe(true);
    });

    it('OpenAI max_completion_tokens는 8192 이하', () => {
      expect(content).toMatch(/getOpenAiMaxCompletionTokens/);
      expect(content).toMatch(/max_completion_tokens:\s*maxCompletionTokens/);
      expect(content).not.toMatch(/max_completion_tokens:\s*8192,/);
    });

    it('Claude adaptive models reserve 16384 tokens and other models stay at 8192', () => {
      expect(content).toMatch(/max_tokens:\s*usesAdaptiveThinking\s*\?\s*16384\s*:\s*8192/);
    });

    it('60000 같은 과대 상한이 본문 생성 경로에 남아있지 않음', () => {
      // 주석 외부에서 maxOutputTokens: 60000이 있는지 검사
      const lines = content.split('\n');
      const violations = lines.filter((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) return false;
        if (trimmed.startsWith('*')) return false;
        return /maxOutputTokens:\s*60000/.test(line);
      });
      expect(violations).toHaveLength(0);
    });
  });

  describe('OpenAI 모델 매핑 — UI 라벨 = 실제 호출 1:1', () => {
    const content = read('contentGenerator.ts');
    const registry = read('runtime/modelRegistry.ts');
    const textModelConstants = read('runtime/textModelConstants.ts');

    it("'openai-gpt41' maps to GPT-5.6 Terra", () => {
      expect(textModelConstants).toMatch(/TERRA:\s*'gpt-5\.6-terra'/);
      expect(registry).toMatch(/OPENAI_TEXT_MODELS,\s*\n\}\s*from '\.\/textModelConstants\.js';/);
      expect(content).toMatch(/resolveTextModelProfileForVendor\(\s*uiSelectedModel/);
    });

    it("'openai-gpt4o-mini' maps to GPT-5.6 Luna", () => {
      expect(registry).toMatch(/'openai-gpt4o-mini'[\s\S]{0,300}OPENAI_TEXT_MODELS\.LUNA/);
    });

    it("'openai-gpt4o' maps to GPT-5.6 Sol", () => {
      expect(registry).toMatch(/'openai-gpt4o'[\s\S]{0,300}OPENAI_TEXT_MODELS\.SOL/);
      expect(content).toMatch(/reasoning_effort/);
    });

    it('OpenAI 폴백 배열은 단일 모델만 허용 (크로스 모델 폴백 금지)', () => {
      // 각 분기의 openAIModels 배열 원소가 1개여야 함
      const matches = content.match(/openAIModels\s*=\s*\[([^\]]+)\]/g) || [];
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        const inner = m.match(/\[([^\]]+)\]/)![1];
        const elements = inner.split(',').filter((s) => s.trim().length > 0);
        expect(elements.length).toBe(1);
      }
    });
  });

  describe('quality repair provider consistency', () => {
    const content = read('contentGenerator.ts');

    it('runs self-critique through the user-selected provider instead of hardcoded Gemini', () => {
      expect(content).toMatch(/callSelectedProviderForQualityRepair/);
      expect(content).toMatch(/selfCritiqueAndRewrite\([\s\S]{0,500}?callSelectedProviderForQualityRepair/);
      expect(content).not.toMatch(/selfCritiqueAndRewrite\([\s\S]{0,500}?\(prompt:\s*string\)\s*=>\s*callGemini/);
    });
  });

  it('uses the shared Claude sampling policy for explicit model overrides', () => {
    const content = read('contentGenerator.ts');
    expect(content).toMatch(/supportsClaudeTemperature\(modelName\)/);
  });

  it('uses strict provider resolution and the current OpenAI search model', () => {
    const content = read('contentGenerator.ts');
    expect(content).toMatch(/resolveTextModelProfileForVendor\(/);
    expect(content).toContain('openAIModels = [OPENAI_TEXT_MODELS.TERRA]');
    expect(content).toContain('buildOpenAiSearchResponseParams');
    expect(content).toContain('callOpenAIResponsesRest');
    expect(content).not.toContain('gpt-5-search-api');
    expect(content).not.toContain("openAIModels = ['gpt-4o-search-preview']");
  });

  describe('이미지 기본 엔진 — schnell(저가) 고정', () => {
    const content = read('image/deepinfraGenerator.ts');

    it('DEFAULT_DEEPINFRA_MODEL은 FLUX-1-schnell', () => {
      expect(content).toMatch(/DEFAULT_DEEPINFRA_MODEL\s*=\s*['"]black-forest-labs\/FLUX-1-schnell['"]/);
    });

    it('DEFAULT_DEEPINFRA_MODEL은 FLUX-2-dev가 아님 (회귀 방지)', () => {
      expect(content).not.toMatch(/DEFAULT_DEEPINFRA_MODEL\s*=\s*['"]black-forest-labs\/FLUX-2-dev['"]/);
    });
  });

  describe('Gemini 캐싱 — 무료/유료 구분 없음 + 자동 학습', () => {
    const content = read('contentGenerator.ts');
    const cacheStreamFallback = read('contentGeminiCacheStreamFallback.ts');

    it('cacheEnabled 조건이 "paid 플랜 한정"으로 하드코딩되지 않음', () => {
      // 4/18 장애 원인이었던 false && 패턴이 남아있지 않음
      expect(content).not.toMatch(/const\s+cacheEnabled\s*=\s*false\s*&&/);
      // 이전 버전: geminiPlanType === 'paid' 단독 조건이 아님
      expect(content).not.toMatch(/cacheEnabled\s*=\s*!cacheDisabledEnv\s*\n?\s*&&\s*\(config as any\)\?\.geminiPlanType === 'paid'\s*\n?\s*&&/);
    });

    it('isCacheSupportedForKey 기반 세션 학습 구조 사용', () => {
      expect(content).toMatch(/isGeminiCacheSupportedForKey\s*\(\s*trimmedKey\s*\)/);
    });

    it('markCacheUnsupported 실패 기록 로직 존재', () => {
      expect(content).toMatch(/markGeminiCacheUnsupported\s*\(\s*trimmedKey/);
      expect(read('contentGeminiCacheSupportRegistry.ts')).toMatch(/function\s+markGeminiCacheUnsupported/);
    });

    it('캐시 호출 실패 시 일반 모델 재시도 보호막 존재', () => {
      expect(content).toMatch(/invokeGeminiStreamWithCacheFallback/);
      expect(cacheStreamFallback).toMatch(/generateContentStream\(requestConfig\)/);
      expect(cacheStreamFallback).toMatch(/markUnsupported\(apiKey,\s*`stream:/);
      expect(cacheStreamFallback).toMatch(/deletePromptCache\(getGeminiPromptCacheKey\(systemText,\s*modelName\)\)/);
      expect(cacheStreamFallback).toMatch(/systemInstruction:\s*\{\s*role:\s*'system'/);
    });

    it('GEMINI_CACHE_DISABLED ENV 비상 탈출구 유지', () => {
      expect(content).toMatch(/GEMINI_CACHE_DISABLED/);
    });

    it('Gemini cache is opt-in to avoid a hidden extra API request before content generation', () => {
      expect(content).toMatch(/GEMINI_CACHE_ENABLED/);
      expect(content).toMatch(/resolveGeminiPromptCacheEligibility/);
      const eligibility = read('contentGeminiCacheEligibility.ts');
      expect(eligibility).toMatch(/cacheDisabledEnv\s*===\s*'1'/);
      expect(eligibility).toMatch(/cacheEnabledEnv\s*!==\s*'1'/);
      expect(eligibility).toMatch(/env-opt-in-missing/);
    });
  });

  describe('Gemini 플랜 선택 — 자동 모드 고정', () => {
    const costConsent = read('renderer/modules/costAndAutoGen.ts');

    it('나노바나나 비용 동의 흐름에서 무료/유료 수동 선택 버튼을 다시 띄우지 않음', () => {
      expect(costConsent).not.toMatch(/저는 <b>유료 플랜<\/b> 사용자입니다/);
      expect(costConsent).not.toMatch(/저는 <b>무료 사용자<\/b>입니다/);
    });
  });

  describe('OpenAI 재시도 — 429 누진 backoff가 끝까지 발동', () => {
    const content = read('contentGenerator.ts');
    const failurePolicy = read('contentGenerationFailurePolicy.ts');
    const diagnostics = read('contentErrorDiagnostics.ts');

    // ✅ [2026-06-06] 사용자 요청 — RPM이 풀릴 때까지 같은 모델로 천천히 대기.
    //   고정 5회 retry 후 실패하지 않고 patient wait budget 안에서 reset/retry-after를 존중한다.
    it('OpenAI callOpenAI는 rate-limit patient wait budget을 사용', () => {
      expect(content).toMatch(/const\s+openAiRateLimitPatienceMs\s*=\s*getOpenAiRateLimitPatienceMs\(\);/);
      expect(content).toMatch(/getOpenAiRateLimitWaitMs\(error,\s*fallbackBackoffMs\)/);
    });

    it('호출 간 최소 간격(getOpenAiMinIntervalMs)에 모델명을 전달', () => {
      expect(content).toMatch(/openaiRpmThrottler\.throttle\(\s*getOpenAiMinIntervalMs\(modelName,\s*maxCompletionTokens\),\s*signal\s*\)/);
    });

    it('keeps structural retries bounded while agent drafts default to one paid call', () => {
      expect(content).toMatch(/const\s+isSingleSubmissionConnector\s*=\s*isAgentProvider/);
      expect(content).toMatch(/const\s+baseMaxAttempts\s*=\s*isSingleSubmissionConnector[\s\S]{0,180}?Math\.max\(openAiContentMaxAttempts,\s*costPolicy\.maxAttempts\)/);
      expect(content).toMatch(/const\s+sameEngineReliabilityMinAttempts\s*=\s*isV3Prompt\s*\|\|\s*isSingleSubmissionConnector\s*\?\s*0\s*:\s*readNonNegativeIntegerEnv\('CONTENT_SAME_ENGINE_MIN_ATTEMPTS',\s*0\)/);
      expect(content).toMatch(/const\s+promptRepairMinAttempts\s*=\s*0/);
      expect(content).toMatch(/const\s+qualityTargetMinAttempts\s*=\s*0/);
      expect(content).toMatch(/const\s+configuredMaxAttempts\s*=\s*Math\.max\(\s*baseMaxAttempts,\s*sameEngineReliabilityMinAttempts,\s*promptRepairMinAttempts,\s*qualityTargetMinAttempts,?\s*\)/);
      expect(content).toMatch(/const\s+MAX_ATTEMPTS\s*=\s*isV3Prompt\s*\|\|\s*!allowAutomaticProviderRetry\s*\?\s*CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY\.maxTopLevelRetries\s*:\s*configuredMaxAttempts/);
      expect(failurePolicy).toMatch(/SAME_ENGINE_RECOVERY/);
    });

    it('does not automatically retry provider responses that may already be billed', () => {
      expect(content).toMatch(/const\s+allowPaidEmptyResponseRetry\s*=\s*allowsPaidEmptyResponseRetry\(process\.env\)/);
      expect(content.match(/isBillableEmptyResponse\s*&&\s*!allowPaidEmptyResponseRetry/g)).toHaveLength(2);
      expect(content).toMatch(/error\s+instanceof\s+GeminiEmptyResponseError[\s\S]{0,260}!allowPaidEmptyResponseRetry/);
    });

    it('OpenAI cost-ambiguous failures are classified without paid automatic retries', () => {
      expect(diagnostics).toMatch(/function\s+isOpenAiConnectionIssue/);
      expect(diagnostics).toMatch(/connection error/);
      expect(content).toMatch(/maxTransientRetriesPerModel\s*=\s*0/);
      expect(content).toMatch(/buildOpenAiGenerationFailureMessage/);
      expect(content).not.toMatch(/회 재시도했지만 응답을 받지 못했습니다/);
    });

    it('provider wait messages never round sub-minute waits down to 0 minutes', () => {
      expect(diagnostics).toMatch(/function\s+formatWaitDurationKo/);
      expect(diagnostics).toMatch(/1분 미만/);
      expect(content).not.toMatch(/RPM\/TPM.*Math\.round\([^)]*\/ 60_000\).*분 동안 풀리지/);
    });
  });

  describe('UI 기본값 — Claude Haiku가 디폴트 선택', () => {
    const html = fs.readFileSync(path.resolve(ROOT, '../public/index.html'), 'utf-8');

    it('claude-haiku 라디오 버튼에 checked 속성', () => {
      expect(html).toMatch(/value="claude-haiku"\s*\n\s*checked/);
    });

    it('gemini-2.5-flash 라디오 버튼은 더 이상 checked 아님', () => {
      // 회귀 방지: 이전 디폴트가 다시 붙지 않도록
      expect(html).not.toMatch(/value="gemini-2\.5-flash"\s*\n\s*checked/);
    });
  });
});

describe('Live content engine diagnostics and secret safety', () => {
  const content = read('contentGenerator.ts');
  const configManager = read('configManager.ts');
  const promptLoader = read('promptLoader.ts');
  const engineScript = fs.readFileSync(path.resolve(ROOT, '../scripts/test-content-engines.mjs'), 'utf-8');
  const engineAppScript = fs.readFileSync(path.resolve(ROOT, '../scripts/test-content-engine-smoke.cjs'), 'utf-8');

  it('text engines reject masked API key placeholders before provider calls', () => {
    expect(content).toMatch(/Gemini API 키가 실제 키가 아니라 마스킹된 표시값/);
    expect(content).toMatch(/OpenAI API 키가 실제 키가 아니라 마스킹된 표시값/);
    expect(content).toMatch(/Claude API 키가 실제 키가 아니라 마스킹된 표시값/);
    expect(content).toMatch(/Perplexity API 키가 실제 키가 아니라 마스킹된 표시값/);
    expect(configManager).toMatch(/function\s+applySecretEnv/);
    expect(configManager).toMatch(/looks masked; keeping existing environment value instead/);
  });

  it('content engine live smoke test runs providers sequentially with the current three-tier mappings', () => {
    expect(engineScript).not.toMatch(/Promise\.all\(runners/);
    expect(engineScript).toMatch(/for \(const \[index, \[provider, fn\]\] of enabledRunners\.entries\(\)\)/);
    expect(engineScript).toMatch(/openai:[\s\S]{0,180}?value:\s*'gpt-5\.6-luna'[\s\S]{0,180}?balanced:\s*'gpt-5\.6-terra'[\s\S]{0,180}?premium:\s*'gpt-5\.6-sol'/);
    expect(engineScript).toMatch(/claude:[\s\S]{0,220}?value:\s*'claude-haiku-4-5-20251001'[\s\S]{0,220}?balanced:\s*'claude-sonnet-5'[\s\S]{0,220}?premium:\s*'claude-fable-5'/);
    expect(engineScript).toMatch(/selected === 'openai-gpt4o-mini'[\s\S]{0,100}?CURRENT_MODELS\.openai\.value/);
    expect(engineScript).toMatch(/function\s+isMaskedSecretValue/);
  });

  it('explicit OpenAI and Claude model overrides are provider-validated before single-model execution', () => {
    expect(content).toMatch(/selectedOpenAiProfile\s*=\s*resolveTextModelProfileForVendor\([\s\S]{0,180}?customModel/);
    expect(content).toMatch(/selectedClaudeProfile\s*=\s*resolveTextModelProfileForVendor\([\s\S]{0,180}?customModel/);
    expect(content).toMatch(/const\s+modelsToTry\s*=\s*openAIModels/);
    expect(content).toMatch(/const\s+modelsToTry\s*=\s*claudeModels/);
    expect(engineScript).toMatch(/process\.env\.OPENAI_STRUCTURED_MODEL\s*\|\|\s*process\.env\.OPENAI_MODEL\s*\|\|\s*mapped/);
    expect(engineScript).toMatch(/process\.env\.CLAUDE_STRUCTURED_MODEL\s*\|\|\s*process\.env\.CLAUDE_MODEL\s*\|\|\s*mapped/);
  });

  it('app-based content engine smoke test uses Electron config decryption path', () => {
    expect(engineAppScript).toMatch(/require\('electron'\)/);
    expect(engineAppScript).toMatch(/loadConfig/);
    expect(engineAppScript).toMatch(/applyConfigToEnv/);
    expect(engineAppScript).toMatch(/generateStructuredContent/);
    expect(engineAppScript).toMatch(/for \(const \[index, provider\] of providers\.entries\(\)\)/);
  });

  it('prompt loader falls back to workspace prompts when Electron appPath points at scripts', () => {
    expect(promptLoader).toMatch(/process\.cwd\(\), 'src', 'prompts'/);
    expect(promptLoader).toMatch(/fs\.existsSync\(candidate\)/);
  });
});
