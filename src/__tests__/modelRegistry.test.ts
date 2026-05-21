// v2.7.50 — modelRegistry 회귀 가드
//
// 목적: 가짜/sunset 모델 ID가 src 코드에 다시 도입되는 것을 차단.
// 본 가드는 정적 grep 기반이라 실 API 호출 없이 빠르게 회귀 차단.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  CLAUDE_MODELS,
  GEMINI_IMAGE_MODELS,
  FAKE_MODEL_IDS_BANNED,
  VERIFIED_IMAGE_MODELS,
  isBannedModelId,
  isVerifiedImageModel,
} from '../runtime/modelRegistry.js';

const ROOT = path.resolve(__dirname, '..');

function readSrcFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('modelRegistry SSOT 회귀 가드', () => {
  it('CLAUDE_MODELS 검증된 ID 3종', () => {
    expect(CLAUDE_MODELS.OPUS).toBe('claude-opus-4-7');
    expect(CLAUDE_MODELS.SONNET).toBe('claude-sonnet-4-6');
    expect(CLAUDE_MODELS.HAIKU).toBe('claude-haiku-4-5-20251001');
  });

  it('GEMINI_IMAGE_MODELS — 나노바나나 3종 + 무료 실험', () => {
    expect(GEMINI_IMAGE_MODELS.STANDARD).toBe('gemini-2.5-flash-image');
    expect(GEMINI_IMAGE_MODELS.NANO_BANANA_2).toBe('gemini-3.1-flash-image-preview');
    expect(GEMINI_IMAGE_MODELS.NANO_BANANA_PRO).toBe('gemini-3-pro-image-preview');
    expect(GEMINI_IMAGE_MODELS.FREE_EXP).toBe('gemini-2.0-flash-preview-image-generation');
  });

  it('FAKE_MODEL_IDS_BANNED 카탈로그 — 미존재/sunset ID (gemini-3 이미지 프리뷰는 제외)', () => {
    // ✅ [v2.10.335] gemini-3-pro-image-preview / gemini-3.1-flash-image-preview는
    //   2026-05 재검증으로 실재 모델 확인 → 밴 목록에서 제외, VERIFIED_IMAGE_MODELS로 이동.
    expect(FAKE_MODEL_IDS_BANNED).not.toContain('gemini-3-pro-image-preview');
    expect(FAKE_MODEL_IDS_BANNED).not.toContain('gemini-3.1-flash-image-preview');
    // preview suffix 없는 형태는 여전히 미존재
    expect(FAKE_MODEL_IDS_BANNED).toContain('gemini-3.1-flash-image');
    expect(FAKE_MODEL_IDS_BANNED).toContain('gpt-4o');
    expect(FAKE_MODEL_IDS_BANNED).toContain('gpt-4o-mini');
  });

  it('isBannedModelId — 가짜 ID 검증', () => {
    expect(isBannedModelId('gemini-3.1-flash-image')).toBe(true);
    expect(isBannedModelId('gpt-4o-mini')).toBe(true);
    expect(isBannedModelId('gemini-3-pro-image-preview')).toBe(false); // 실재 모델
    expect(isBannedModelId('claude-opus-4-7')).toBe(false);
    expect(isBannedModelId('gemini-2.5-flash-image')).toBe(false);
  });

  it('VERIFIED_IMAGE_MODELS — 나노바나나 3종 + 덕테이프 실모델 화이트리스트', () => {
    expect(VERIFIED_IMAGE_MODELS).toContain('gemini-2.5-flash-image');
    expect(VERIFIED_IMAGE_MODELS).toContain('gemini-3.1-flash-image-preview');
    expect(VERIFIED_IMAGE_MODELS).toContain('gemini-3-pro-image-preview');
    expect(VERIFIED_IMAGE_MODELS).toContain('gpt-image-2');
  });

  it('isVerifiedImageModel — 검증된 모델만 true', () => {
    expect(isVerifiedImageModel('gemini-3-pro-image-preview')).toBe(true);
    expect(isVerifiedImageModel('gpt-image-2')).toBe(true);
    expect(isVerifiedImageModel('gemini-3.1-flash-image')).toBe(false); // preview suffix 없음
    expect(isVerifiedImageModel('gpt-4o')).toBe(false);
  });
});

describe('가짜 모델 ID 코드 잔존 차단 (정적 grep)', () => {
  // src 디렉토리에서 가짜 ID 호출이 잔존하지 않는지 검증
  // 단 nanoBananaProGenerator.ts의 주석/문자열에는 일부 잔존 (의도적: 비용표/주석 설명)
  // 실제 model 호출 패턴 (`model: '...'` 또는 `getGenerativeModel({ model: '...' })`)에서만 검증

  const filesToCheck = [
    'imageGenerator.ts',
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
      expect(code).not.toMatch(/model:\s*['"]gpt-4o['"]/);
      expect(code).not.toMatch(/model:\s*['"]gpt-4o-mini['"]/);
    });
  }
});
