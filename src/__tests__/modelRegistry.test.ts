// v2.7.50 — modelRegistry 회귀 가드
//
// 목적: 가짜/sunset 모델 ID가 src 코드에 다시 도입되는 것을 차단.
// 본 가드는 정적 grep 기반이라 실 API 호출 없이 빠르게 회귀 차단.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  CLAUDE_MODELS,
  GEMINI_TEXT_MODELS,
  OPENAI_TEXT_MODELS,
  GEMINI_IMAGE_MODELS,
  OPENAI_IMAGE_MODELS,
  FAKE_MODEL_IDS_BANNED,
  VERIFIED_IMAGE_MODELS,
  isBannedModelId,
  isVerifiedImageModel,
  normalizeGeminiTextModelId,
  resolveTextModelProfile,
  resolveTextModelProfileForVendor,
  supportsClaudeTemperature,
} from '../runtime/modelRegistry.js';

const ROOT = path.resolve(__dirname, '..');

function readSrcFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('modelRegistry SSOT 회귀 가드', () => {
  it('uses the current official value, balanced, and premium API models', () => {
    expect(GEMINI_TEXT_MODELS.FLASH_LITE).toBe('gemini-3.1-flash-lite');
    expect(GEMINI_TEXT_MODELS.FLASH).toBe('gemini-3.5-flash');
    expect(GEMINI_TEXT_MODELS.PRO).toBe('gemini-3.1-pro-preview');

    expect(OPENAI_TEXT_MODELS.LUNA).toBe('gpt-5.6-luna');
    expect(OPENAI_TEXT_MODELS.TERRA).toBe('gpt-5.6-terra');
    expect(OPENAI_TEXT_MODELS.SOL).toBe('gpt-5.6-sol');

    expect(CLAUDE_MODELS.FABLE).toBe('claude-fable-5');
    expect(CLAUDE_MODELS.OPUS).toBe('claude-fable-5');
    expect(CLAUDE_MODELS.SONNET).toBe('claude-sonnet-5');
    expect(CLAUDE_MODELS.HAIKU).toBe('claude-haiku-4-5-20251001');
  });

  it('maps every visible API selector to one current model and quality tier', () => {
    expect(resolveTextModelProfile('gemini-3.1-flash-lite')).toMatchObject({
      vendor: 'gemini', tier: 'value', model: 'gemini-3.1-flash-lite',
    });
    expect(resolveTextModelProfile('gemini-3.5-flash')).toMatchObject({
      vendor: 'gemini', tier: 'balanced', model: 'gemini-3.5-flash',
    });
    expect(resolveTextModelProfile('gemini-3.1-pro-preview')).toMatchObject({
      vendor: 'gemini', tier: 'balanced', model: 'gemini-3.5-flash',
    });
    expect(resolveTextModelProfile('openai-gpt4o-mini')).toMatchObject({
      vendor: 'openai', tier: 'value', model: 'gpt-5.6-luna', reasoningEffort: 'medium',
    });
    expect(resolveTextModelProfile('openai-gpt41')).toMatchObject({
      vendor: 'openai', tier: 'balanced', model: 'gpt-5.6-terra', reasoningEffort: 'high',
    });
    expect(resolveTextModelProfile('openai-gpt4o')).toMatchObject({
      vendor: 'openai', tier: 'premium', model: 'gpt-5.6-sol', reasoningEffort: 'high',
    });
    expect(resolveTextModelProfile('claude-haiku')).toMatchObject({
      vendor: 'claude', tier: 'value', model: 'claude-haiku-4-5-20251001',
    });
    expect(resolveTextModelProfile('claude-sonnet')).toMatchObject({
      vendor: 'claude', tier: 'balanced', model: 'claude-sonnet-5',
    });
    expect(resolveTextModelProfile('claude-opus')).toMatchObject({
      vendor: 'claude', tier: 'premium', model: 'claude-fable-5',
    });
  });

  it('migrates legacy Gemini selections to the supported prepaid matrix', () => {
    expect(normalizeGeminiTextModelId('gemini-2.5-flash-lite')).toBe('gemini-3.1-flash-lite');
    expect(normalizeGeminiTextModelId('gemini-2.5-flash')).toBe('gemini-3.5-flash');
    expect(normalizeGeminiTextModelId('gemini-2.5-pro')).toBe('gemini-3.5-flash');
    expect(normalizeGeminiTextModelId('gemini-3.1-pro-preview')).toBe('gemini-3.5-flash');
    expect(normalizeGeminiTextModelId('gemini-future-explicit-model')).toBe('gemini-future-explicit-model');
  });

  it('rejects unknown UI selectors and provider mismatches instead of silently substituting a model', () => {
    expect(() => resolveTextModelProfile('unknown-ui-selector')).toThrow('UNSUPPORTED_TEXT_MODEL_SELECTOR');
    expect(() => resolveTextModelProfile('openai-unknown-selector')).toThrow('UNSUPPORTED_TEXT_MODEL_SELECTOR');
    expect(resolveTextModelProfile('gemini-future-explicit-model')).toMatchObject({
      vendor: 'gemini', model: 'gemini-future-explicit-model',
    });
    expect(() => resolveTextModelProfileForVendor(
      'gemini-3.5-flash',
      'openai',
      'openai-gpt41',
    )).toThrow('TEXT_MODEL_PROVIDER_MISMATCH');
    expect(resolveTextModelProfileForVendor('', 'claude', 'claude-sonnet')).toMatchObject({
      vendor: 'claude', model: 'claude-sonnet-5',
    });
  });

  it('honors an explicit same-vendor sub-work override before validating the global selection', () => {
    expect(resolveTextModelProfileForVendor(
      GEMINI_TEXT_MODELS.FLASH,
      'openai',
      'openai-gpt41',
      OPENAI_TEXT_MODELS.LUNA,
    )).toMatchObject({
      vendor: 'openai', tier: 'value', model: OPENAI_TEXT_MODELS.LUNA,
    });
    expect(resolveTextModelProfileForVendor(
      OPENAI_TEXT_MODELS.TERRA,
      'claude',
      'claude-sonnet',
      CLAUDE_MODELS.HAIKU,
    )).toMatchObject({
      vendor: 'claude', tier: 'value', model: CLAUDE_MODELS.HAIKU,
    });
  });

  it('uses the current GPT-5.6 model for Responses web search', () => {
    expect(resolveTextModelProfile('openai-gpt4o-search')).toMatchObject({
      vendor: 'openai', model: OPENAI_TEXT_MODELS.TERRA,
    });
  });

  it('preserves explicit provider model IDs while UI selectors use the current matrix', () => {
    expect(resolveTextModelProfile('gpt-4.1')).toMatchObject({ vendor: 'openai', model: 'gpt-4.1' });
    expect(resolveTextModelProfile('gpt-4o')).toMatchObject({ vendor: 'openai', model: 'gpt-4o' });
    expect(resolveTextModelProfile('claude-sonnet-4-6')).toMatchObject({ vendor: 'claude', model: 'claude-sonnet-4-6' });
    expect(resolveTextModelProfile('claude-opus-4-8')).toMatchObject({ vendor: 'claude', model: 'claude-opus-4-8' });
  });

  it('classifies raw current IDs and Claude sampling capability correctly', () => {
    expect(resolveTextModelProfile('gpt-5.6-luna')).toMatchObject({ tier: 'value' });
    expect(resolveTextModelProfile('gpt-5.6-terra')).toMatchObject({ tier: 'balanced' });
    expect(resolveTextModelProfile('gpt-5.6-sol')).toMatchObject({ tier: 'premium' });
    expect(supportsClaudeTemperature('claude-fable-5')).toBe(false);
    expect(supportsClaudeTemperature('claude-sonnet-5')).toBe(false);
    expect(supportsClaudeTemperature('claude-opus-4-7')).toBe(false);
    expect(supportsClaudeTemperature('claude-opus-4-8')).toBe(false);
    expect(supportsClaudeTemperature('claude-opus-4-6')).toBe(true);
    expect(supportsClaudeTemperature('claude-haiku-4-5-20251001')).toBe(true);
  });

  it('GEMINI_IMAGE_MODELS — 현재 나노바나나 4종 + 레거시 키 호환', () => {
    expect(GEMINI_IMAGE_MODELS.STANDARD).toBe('gemini-2.5-flash-image');
    expect(GEMINI_IMAGE_MODELS.NANO_BANANA_LITE).toBe('gemini-3.1-flash-lite-image');
    expect(GEMINI_IMAGE_MODELS.NANO_BANANA_2).toBe('gemini-3.1-flash-image');
    expect(GEMINI_IMAGE_MODELS.NANO_BANANA_PRO).toBe('gemini-3-pro-image');
    expect('FREE_EXP' in GEMINI_IMAGE_MODELS).toBe(false);
  });

  it('OPENAI_IMAGE_MODELS — gpt-image-1.5(저비용 기본) + gpt-image-2(고품질)', () => {
    expect(OPENAI_IMAGE_MODELS.GPT_IMAGE_1_5).toBe('gpt-image-1.5');
    expect(OPENAI_IMAGE_MODELS.GPT_IMAGE_2).toBe('gpt-image-2');
  });

  it('FAKE_MODEL_IDS_BANNED 카탈로그 — 미존재/sunset ID와 종료된 이미지 preview ID', () => {
    // Gemini 3 이미지 preview ID는 2026-06-25 종료되어 다시 호출되면 안 된다.
    expect(FAKE_MODEL_IDS_BANNED).toContain('gemini-3-pro-image-preview');
    expect(FAKE_MODEL_IDS_BANNED).toContain('gemini-3.1-flash-image-preview');
    expect(FAKE_MODEL_IDS_BANNED).toContain('gemini-2.5-flash-image-preview');
    expect(FAKE_MODEL_IDS_BANNED).toContain('gemini-2.0-flash-preview-image-generation');
    expect(FAKE_MODEL_IDS_BANNED).toContain('gemini-2.0-flash-exp-image-generation');
    expect(FAKE_MODEL_IDS_BANNED).toContain('imagen-4.0-generate-preview-06-06');
    expect(FAKE_MODEL_IDS_BANNED).not.toContain('gemini-3-pro-image');
    expect(FAKE_MODEL_IDS_BANNED).not.toContain('gemini-3.1-flash-image');
    expect(FAKE_MODEL_IDS_BANNED).not.toContain('gemini-3.1-flash-lite-image');
    expect(FAKE_MODEL_IDS_BANNED).toContain('gpt-4o');
    expect(FAKE_MODEL_IDS_BANNED).toContain('gpt-4o-mini');
  });

  it('isBannedModelId — 가짜 ID 검증', () => {
    expect(isBannedModelId('gemini-3.1-flash-image')).toBe(false);
    expect(isBannedModelId('gpt-4o-mini')).toBe(true);
    expect(isBannedModelId('gemini-3-pro-image-preview')).toBe(true);
    expect(isBannedModelId('gemini-2.0-flash-preview-image-generation')).toBe(true);
    expect(isBannedModelId('gemini-3-pro-image')).toBe(false);
    expect(isBannedModelId('gemini-3.1-flash-lite-image')).toBe(false);
    expect(isBannedModelId('claude-fable-5')).toBe(false);
    expect(isBannedModelId('gemini-2.5-flash-image')).toBe(false);
  });

  it('VERIFIED_IMAGE_MODELS — 나노바나나 3종 + OpenAI 2종 실모델 화이트리스트', () => {
    expect(VERIFIED_IMAGE_MODELS).toContain('gemini-2.5-flash-image');
    expect(VERIFIED_IMAGE_MODELS).toContain('gemini-3.1-flash-lite-image');
    expect(VERIFIED_IMAGE_MODELS).toContain('gemini-3.1-flash-image');
    expect(VERIFIED_IMAGE_MODELS).toContain('gemini-3-pro-image');
    expect(VERIFIED_IMAGE_MODELS).not.toContain('gemini-2.0-flash-preview-image-generation');
    expect(VERIFIED_IMAGE_MODELS).not.toContain('gemini-2.0-flash-exp-image-generation');
    expect(VERIFIED_IMAGE_MODELS).toContain('gpt-image-1.5');
    expect(VERIFIED_IMAGE_MODELS).toContain('gpt-image-2');
  });

  it('isVerifiedImageModel — 검증된 모델만 true', () => {
    expect(isVerifiedImageModel('gemini-3-pro-image')).toBe(true);
    expect(isVerifiedImageModel('gemini-3-pro-image-preview')).toBe(false);
    expect(isVerifiedImageModel('gpt-image-1.5')).toBe(true);
    expect(isVerifiedImageModel('gpt-image-2')).toBe(true);
    expect(isVerifiedImageModel('gemini-3.1-flash-image')).toBe(true);
    expect(isVerifiedImageModel('gpt-4o')).toBe(false);
  });
});

describe('가짜 모델 ID 코드 잔존 차단 (정적 grep)', () => {
  // src 디렉토리에서 가짜 ID 호출이 잔존하지 않는지 검증
  // 단 nanoBananaProGenerator.ts의 주석/문자열에는 일부 잔존 (의도적: 비용표/주석 설명)
  // 실제 model 호출 패턴 (`model: '...'` 또는 `getGenerativeModel({ model: '...' })`)에서만 검증

  const filesToCheck = [
    'imageGenerator.ts',
    'image/geminiAutoRecovery.ts',
    'image/nanoBananaProGenerator.ts',
    'main/ipc/imageHandlers.ts',
    'main/utils/mainPromptInference.ts',
    'image/shoppingImageAnalyzer.ts',
    'image/openaiImageGenerator.ts',
  ];

  for (const file of filesToCheck) {
    it(`${file}에 sunset 모델 직접 호출 없음`, () => {
      let code = '';
      try {
        code = readSrcFile(file);
      } catch {
        return; // 파일 없으면 skip
      }
      // 사용자 환경에서 작동 안 하는 모델 직접 호출 검증
      expect(code).not.toMatch(/model:\s*['"]gemini-3-pro-image-preview['"]/);
      expect(code).not.toMatch(/model:\s*['"]gemini-3\.1-flash-image-preview['"]/);
      expect(code).not.toMatch(/models\/gemini-2\.0-flash-(?:preview|exp)-image-generation:generateContent/);
      expect(code).not.toMatch(/model:\s*['"]gemini-2\.0-flash-(?:preview|exp)-image-generation['"]/);
      expect(code).not.toMatch(/model:\s*['"]gemini-2\.5-flash-image-preview['"]/);
      expect(code).not.toMatch(/model:\s*['"]imagen-4\.0-generate-preview-06-06['"]/);
      expect(code).not.toMatch(/model:\s*['"]gpt-4o['"]/);
      expect(code).not.toMatch(/model:\s*['"]gpt-4o-mini['"]/);
    });
  }
});
