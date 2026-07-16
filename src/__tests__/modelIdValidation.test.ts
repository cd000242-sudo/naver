/**
 * ✅ [v1.4.77] 전 엔진 실존 모델 ID 검증 (2026-04-21 기준)
 *
 * 배경: 6명 에이전트 교차 검증으로 발견된 모델 ID 불일치·sunset 임박 건들을
 * 회귀 방지 레일로 고정한다.
 *
 * 검증 기준 (공식 소스):
 * - OpenAI: platform.openai.com/docs/models + /deprecations
 * - Anthropic: platform.claude.com/docs/en/about-claude/models/overview
 * - Google: ai.google.dev/gemini-api/docs/models + /deprecations
 * - Perplexity: docs.perplexity.ai/docs/sonar/models
 * - DeepInfra: deepinfra.com/black-forest-labs
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

it('keeps the live content-engine smoke test on the same current model matrix', () => {
  const smoke = read('../scripts/test-content-engines.mjs');
  expect(smoke).toContain("value: 'gemini-3.1-flash-lite'");
  expect(smoke).toContain("balanced: 'gemini-3.5-flash'");
  expect(smoke).not.toContain("premium: 'gemini-3.1-pro-preview'");
  expect(smoke).toContain("value: 'gpt-5.6-luna'");
  expect(smoke).toContain("balanced: 'gpt-5.6-terra'");
  expect(smoke).toContain("premium: 'gpt-5.6-sol'");
  expect(smoke).toContain("balanced: 'claude-sonnet-5'");
  expect(smoke).toContain("premium: 'claude-fable-5'");
  expect(smoke).toContain('reasoning_effort');
  expect(smoke).toContain("tools: [{ type: 'web_search' }]");
  expect(smoke).toContain('client.responses.create');
  expect(smoke).not.toContain("'gpt-5-search-api'");
  expect(smoke).not.toContain("'gpt-4o-search-preview'");
  expect(read('../scripts/diagnose-openai-access.mjs')).not.toContain("'gpt-4o-search-preview'");
});

it('shows the current OpenAI search model name instead of the retired preview branding', () => {
  const publicHtml = read('../public/index.html');
  const settingsModal = read('renderer/utils/settingsModal.ts');
  const priceInfoModal = read('renderer/modules/priceInfoModal.ts');
  for (const code of [publicHtml, settingsModal, priceInfoModal]) {
    expect(code).not.toContain('GPT-4o Search');
    expect(code).toContain('GPT-5.6 웹 검색');
  }
});

it('keeps shipped JavaScript and manual diagnostics on current models', () => {
  const shippedSearchApi = read('naverSearchApi.js');
  expect(shippedSearchApi).toContain("model: 'gemini-3.1-flash-lite'");
  expect(shippedSearchApi).not.toContain("model: 'gemini-2.0-flash'");

  const imageDiagnostics = [
    read('tests/testGeminiImage.ts'),
    read('../scripts/test_gemini_error.ts'),
  ];
  for (const code of imageDiagnostics) {
    expect(code).toContain('gemini-3.1-flash-lite-image');
    expect(code).not.toMatch(/gemini-(?:1\.5|2\.0)-/);
  }

  const textDiagnostic = read('../scripts/verify-gemini-1.5.ts');
  expect(textDiagnostic).toContain('gemini-3.5-flash');
  expect(textDiagnostic).not.toMatch(/gemini-(?:1\.0|1\.5|2\.0)-/);
});

it('shows the current Claude value model when the connectivity response omits a model id', () => {
  const main = read('main.ts');
  expect(main).toContain('resp.data?.model || CLAUDE_MODELS.HAIKU');
  expect(main).not.toContain("resp.data?.model || 'claude-3-haiku'");
});

it('never logs API key prefixes in content provider diagnostics', () => {
  const content = read('contentGenerator.ts');
  expect(content).not.toMatch(/perplexityApiKey[^\n]*substring/);
  expect(content).not.toMatch(/PERPLEXITY_API_KEY[^\n]*substring/);
  expect(content).toMatch(/perplexityApiKey:\s*config\?\.perplexityApiKey\s*\?\s*'\(설정됨\)'/);
});

it('never prints raw API key prefixes or suffixes in runtime and diagnostic logs', () => {
  const secretAwareFiles = [
    read('configManager.js'),
    read('image/deepinfraGenerator.ts'),
    read('main/ipc/configHandlers.ts'),
    read('tests/test31flash.ts'),
    read('tests/testFullFlow.ts'),
    read('tests/testGeminiImage.ts'),
    read('../scripts/check-gemini-tier.mjs'),
    read('../scripts/test-openai-image.mjs'),
    read('../scripts/test_gemini_error.ts'),
    read('../scripts/verify-gemini-1.5.ts'),
  ];

  for (const code of secretAwareFiles) {
    expect(code).not.toMatch(/[A-Za-z]*[Aa]piKey\.(?:substring|slice)\s*\(/);
  }

  const contentGenerator = read('contentGenerator.ts');
  const apiHandlers = read('main/ipc/apiHandlers.ts');
  const adsPowerManager = read('main/utils/adsPowerManager.ts');
  const nanoBanana = read('image/nanoBananaProGenerator.ts');
  const continuousPublishing = read('renderer/modules/continuousPublishing.ts');

  expect(contentGenerator).not.toMatch(/(?:trimmedKey|nextKey)\.substring\s*\(/);
  expect(apiHandlers).not.toMatch(/key\.substring\s*\(/);
  expect(adsPowerManager).not.toMatch(/key\.substring\s*\(/);
  expect(nanoBanana).not.toMatch(/(?:key|nextKey)\.substring\s*\(/);
  expect(continuousPublishing).not.toMatch(/api-key[^\n]*substring\s*\(/);
});

it('routes explicit sub-work models without process-wide environment mutation', () => {
  const content = read('contentGenerator.ts');
  expect(content).not.toMatch(/process\.env\.(?:OPENAI|CLAUDE)_STRUCTURED_MODEL\s*=/);
  expect(content).toContain('modelOverride: OPENAI_TEXT_MODELS.LUNA');
  expect(content).toContain('modelOverride: GEMINI_TEXT_MODELS.FLASH');
  expect(content).toContain('modelOverride: CLAUDE_MODELS.HAIKU');
});

it('does not print Naver credential fragments or full account ids in reviewed runtime paths', () => {
  const main = read('main.ts');
  const automation = read('naverBlogAutomation.ts');
  expect(main).not.toMatch(/clientId\.substring|clientSecret\.substring/);
  expect(main).not.toMatch(/console\.log\([^\n]*\$\{accountNaverId\}/);
  expect(automation).not.toMatch(/this\.log\([^\n]*\$\{accountId\}/);
  expect(main).toContain('redactKnownAccountId');
});

describe('v1.4.77 — 실존 모델 ID 매트릭스 (2026-04)', () => {
  describe('OpenAI: sunset 임박 ID 호출 금지', () => {
    it("gpt-4o / gpt-4o-mini 직접 호출이 실제 코드에서 제거됨 (2026-03-31 sunset)", () => {
      const callers = [
        read('main/utils/mainPromptInference.ts'),
        read('image/shoppingImageAnalyzer.ts'),
      ];
      for (const code of callers) {
        // model: 'gpt-4o-mini' 직접 호출 금지
        expect(code).not.toMatch(/model:\s*['"]gpt-4o-mini['"]/);
        expect(code).not.toMatch(/model:\s*['"]gpt-4o['"]/);
      }
    });

    it("번역·이미지 분석은 gpt-4.1-mini로 교체됨 (literal 또는 modelRegistry SSOT)", () => {
      // ✅ [v2.7.52] modelRegistry import도 인정 (OPENAI_TEXT_MODELS.GPT_41_MINI)
      const promptInference = read('main/utils/mainPromptInference.ts');
      expect(promptInference).toMatch(/model:\s*OPENAI_TEXT_MODELS\.LUNA/);
      const shoppingAnalyzer = read('image/shoppingImageAnalyzer.ts');
      expect(shoppingAnalyzer).toMatch(/model:\s*OPENAI_TEXT_MODELS\.LUNA/);
    });

    it("DALL-E 3 직접 호출 없음 (2026-05-12 제거 예정)", () => {
      // src 디렉터리 내 그 어디에도 model: 'dall-e-3' 호출이 없어야 함
      const srcFiles = [
        'image/openaiImageGenerator.ts',
        'image/deepinfraGenerator.ts',
        'main.ts',
      ];
      for (const f of srcFiles) {
        try {
          const code = read(f);
          expect(code).not.toMatch(/model:\s*['"]dall-e-3['"]/);
        } catch { /* 파일 없으면 패스 */ }
      }
    });
  });

  describe('Claude: alias 정확성 (무접미사 사용 금지)', () => {
    const tracker = read('apiUsageTracker.ts');

    it("claude-opus-4-0 alias가 가격표에 존재 (Anthropic 공식 alias)", () => {
      expect(tracker).toMatch(/'claude-opus-4-0':/);
    });

    it("claude-sonnet-4-0 alias가 가격표에 존재", () => {
      expect(tracker).toMatch(/'claude-sonnet-4-0':/);
    });

    it("snapshot ID (claude-opus-4-20250514) 존재", () => {
      expect(tracker).toMatch(/'claude-opus-4-20250514':/);
      expect(tracker).toMatch(/'claude-sonnet-4-20250514':/);
    });

    it("Opus 4.5 snapshot (claude-opus-4-5-20251101) 존재", () => {
      expect(tracker).toMatch(/'claude-opus-4-5-20251101':/);
    });

    it("Haiku 4.5 snapshot (claude-haiku-4-5-20251001) 존재", () => {
      expect(tracker).toMatch(/'claude-haiku-4-5-20251001':/);
    });

    it("Opus 4.8 (2026-05-28 GA, 현행 최신) 존재", () => {
      expect(tracker).toMatch(/'claude-opus-4-8':/);
    });

    it("Sonnet 4.6 (2026-02-17 출시, 현행 최신) 존재", () => {
      expect(tracker).toMatch(/'claude-sonnet-4-6':/);
    });
  });

  describe('Gemini: 실존 모델 ID 매핑', () => {
    it("Nano Banana 매핑 — gemini-3 이미지 모델(프로/2)이 실제 ID로 복원됨 (v2.10.334+)", () => {
      // Google 공식 안정 ID를 사용하며 종료된 preview ID는 호출하지 않는다.
      const gen = read('image/nanoBananaProGenerator.ts');
      expect(gen).toMatch(/model:\s*['"]gemini-3-pro-image['"]/);
      expect(gen).toMatch(/model:\s*['"]gemini-3\.1-flash-image['"]/);
      // 구버전 나노바나나(gemini-2.5-flash-image)도 선택지로 유지
      expect(gen).toMatch(/model:\s*['"]gemini-2\.5-flash-image['"]/);
    });

    it('종료된 Gemini 이미지 모델 대신 Flash-Lite 안정 모델을 자동 폴백에 사용', () => {
      const gen = read('image/nanoBananaProGenerator.ts');
      const recovery = read('image/geminiAutoRecovery.ts');
      const handlers = read('main/ipc/imageHandlers.ts');
      const stylePolicy = read('image/stylePreviewEnginePolicy.ts');
      expect(gen).toMatch(/gemini-3\.1-flash-lite-image/);
      expect(recovery).toMatch(/gemini-3\.1-flash-lite-image/);
      expect(stylePolicy).toMatch(/GEMINI_IMAGE_MODELS\.NANO_BANANA_LITE/);
      for (const code of [gen, recovery, handlers]) {
        expect(code).not.toMatch(/gemini-2\.0-flash-(?:preview|exp)-image-generation/);
        expect(code).not.toMatch(/gemini-2\.5-flash-image-preview/);
        expect(code).not.toMatch(/imagen-4\.0-generate-preview-06-06/);
      }
    });

    it("텍스트 본문 생성은 gemini-2.5 계열만 (stable)", () => {
      const tracker = read('apiUsageTracker.ts');
      // Gemini 3 / 3.1 분기가 포함된 calculateCost 로직 확인
      expect(tracker).toMatch(/gemini-3|3\.1-pro|3\.1-flash/);
    });
  });

  describe('Perplexity: sonar-reasoning deprecated 처리', () => {
    const tracker = read('apiUsageTracker.ts');

    it("sonar-reasoning-pro (현행 대체 모델)이 가격표에 존재", () => {
      expect(tracker).toMatch(/'sonar-reasoning-pro':/);
    });

    it("구 sonar-reasoning 키가 제거됨 (2025-12-15 deprecated)", () => {
      // 주석이 아닌 실제 키로 존재하지 않음 — regex로 엄격하게
      expect(tracker).not.toMatch(/'sonar-reasoning':\s*\{/);
    });

    it("sonar / sonar-pro / sonar-deep-research는 여전히 존재 (API 유지)", () => {
      expect(tracker).toMatch(/'sonar':\s*\{/);
      expect(tracker).toMatch(/'sonar-pro':\s*\{/);
      expect(tracker).toMatch(/'sonar-deep-research':\s*\{/);
    });
  });

  describe('sunset 경고 주석 존재 (Ops 가시성)', () => {
    const tracker = read('apiUsageTracker.ts');

    it("gpt-4o sunset 경고 주석이 코드에 남아있음", () => {
      expect(tracker).toMatch(/SUNSET 2026-03-31|2026-03-31 API 제거/);
    });

    it("DALL-E 3 sunset 경고 주석이 코드에 남아있음", () => {
      expect(tracker).toMatch(/2026-05-12 API 제거|DALL-E 3.*2026-05/);
    });
  });
});
