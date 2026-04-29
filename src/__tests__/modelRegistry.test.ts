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
  isBannedModelId,
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

  it('GEMINI_IMAGE_MODELS — 정식 GA만', () => {
    expect(GEMINI_IMAGE_MODELS.STANDARD).toBe('gemini-2.5-flash-image');
    expect(GEMINI_IMAGE_MODELS.FREE_EXP).toBe('gemini-2.0-flash-preview-image-generation');
  });

  it('FAKE_MODEL_IDS_BANNED 카탈로그 — 미존재/sunset ID', () => {
    expect(FAKE_MODEL_IDS_BANNED).toContain('gemini-3-pro-image-preview');
    expect(FAKE_MODEL_IDS_BANNED).toContain('gemini-3.1-flash-image-preview');
    expect(FAKE_MODEL_IDS_BANNED).toContain('gpt-4o');
    expect(FAKE_MODEL_IDS_BANNED).toContain('gpt-4o-mini');
  });

  it('isBannedModelId — 가짜 ID 검증', () => {
    expect(isBannedModelId('gemini-3-pro-image-preview')).toBe(true);
    expect(isBannedModelId('gpt-4o-mini')).toBe(true);
    expect(isBannedModelId('claude-opus-4-7')).toBe(false);
    expect(isBannedModelId('gemini-2.5-flash-image')).toBe(false);
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
