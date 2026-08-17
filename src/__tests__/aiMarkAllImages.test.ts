/**
 * Regression tests for the AI-mark pipeline (2026-08-17 provenance rework).
 *
 * Contract:
 *   1. isAiGeneratedImage is an OPT-IN allowlist — unknown/collected images are
 *      never AI (실사진 오탐 = 최악의 실패이므로 불확실 → false).
 *   2. Insert paths always tag data-img-ai ('1'/'0'); the publish-time loop
 *      marks ONLY data-img-ai === '1' (legacy fallback: provider allowlist).
 *   3. Component-scoped AI button lookup is preserved (2026-05 fix).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isAiGeneratedImage, aiMarkAttrValue } from '../automation/imageProvenance.js';

const ROOT = path.resolve(__dirname, '..', '..');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', relPath), 'utf-8');
}

describe('imageProvenance — AI 판정 (opt-in 허용목록)', () => {
  it('AI 엔진 provider는 AI로 판정한다', () => {
    for (const provider of [
      'nano-banana-pro', 'prodia', 'stability', 'falai', 'deepinfra',
      'leonardoai', 'openai-image', 'imagefx', 'flow', 'url-img2img', 'dropshot',
    ]) {
      expect(isAiGeneratedImage({ provider })).toBe(true);
    }
  });

  it('수집/불명/실사진 계열은 절대 AI가 아니다', () => {
    for (const provider of [
      'naver', 'collected', 'shopping', 'local', 'local-folder', 'manual',
      'url-only', 'url', 'collected-overlay', 'thumbnail-generator', 'gif-from-video', '',
    ]) {
      expect(isAiGeneratedImage({ provider })).toBe(false);
    }
    expect(isAiGeneratedImage(undefined)).toBe(false);
    expect(isAiGeneratedImage({})).toBe(false);
    expect(isAiGeneratedImage({ source: 'issue-endgame', isCollected: true })).toBe(false);
    expect(isAiGeneratedImage({ source: 'official-doc', isCollected: true })).toBe(false);
  });

  it('isCollected=true는 provider가 AI스럽더라도 수집으로 확정한다', () => {
    expect(isAiGeneratedImage({ provider: 'flow', isCollected: true })).toBe(false);
  });

  it('aiGenerated=true 명시 플래그는 AI로 판정한다', () => {
    expect(isAiGeneratedImage({ aiGenerated: true })).toBe(true);
  });

  it('aiMarkAttrValue는 1/0 문자열을 낸다', () => {
    expect(aiMarkAttrValue({ provider: 'prodia' })).toBe('1');
    expect(aiMarkAttrValue({ provider: 'naver' })).toBe('0');
    expect(aiMarkAttrValue(undefined)).toBe('0');
  });
});

describe('AI mark 발행 루프 — source regression', () => {
  const automation = readSrc('naverBlogAutomation.ts');

  function step4Block(): string {
    const start = automation.indexOf('// Step 4: AI 활용 마크 일괄 활성화');
    expect(start).toBeGreaterThan(-1);
    const end = automation.indexOf('} catch (aiMarkError)', start);
    expect(end).toBeGreaterThan(start);
    return automation.slice(start, end);
  }

  it('component-scoped 버튼 조회를 유지한다', () => {
    expect(automation).toMatch(/imageComponents\[i\]\.\$\(['"]button\.se-set-ai-mark-button-toggle['"]\)/);
    const loop = step4Block();
    const componentIdx = loop.indexOf("imageComponents[i].$('button.se-set-ai-mark-button-toggle')");
    const frameFallbackIdx = loop.indexOf("frame.$('button.se-set-ai-mark-button-toggle')");
    expect(componentIdx).toBeGreaterThan(-1);
    if (frameFallbackIdx !== -1) expect(frameFallbackIdx).toBeGreaterThan(componentIdx);
  });

  it('판정은 data-img-ai 1차 + provider 허용목록(isAiGeneratedImage) 2차다', () => {
    const loop = step4Block();
    expect(loop).toMatch(/getAttribute\(['"]data-img-ai['"]\)/);
    expect(loop).toMatch(/isAiGeneratedImage\(/);
    expect(loop).toMatch(/attrs\.ai\s*===\s*'1'/);
  });

  it('비AI 판정은 continue로 스킵한다 (opt-in)', () => {
    const loop = step4Block();
    const skipIdx = loop.indexOf('if (!isAiTarget)');
    expect(skipIdx).toBeGreaterThan(-1);
    expect(loop.indexOf('continue', skipIdx)).toBeGreaterThan(skipIdx);
  });
});

describe('삽입 태깅 — source regression', () => {
  const helpers = readSrc('automation/imageHelpers.ts');

  it('insertImagesAtCurrentCursor는 data-img-ai를 항상 태깅한다', () => {
    const fnStart = helpers.indexOf('// ── insertImagesAtCurrentCursor ──');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = helpers.slice(fnStart);
    expect(fnBody).toMatch(/setAttribute\(['"]data-img-ai['"]/);
    expect(fnBody).toMatch(/aiMarkAttrValue\(/);
  });

  it('data-img-provider 태깅도 유지된다', () => {
    expect(helpers).toMatch(/setAttribute\(['"]data-img-provider['"]/);
  });

  it('base64 삽입 경로(insertBase64ImageAtCursor)도 data-img-ai를 태깅한다', () => {
    const fnStart = helpers.indexOf('// ── insertBase64ImageAtCursor ──');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = helpers.indexOf('// ── insert', fnStart + 10);
    const fnBody = helpers.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
    expect(fnBody).toMatch(/setAttribute\(['"]data-img-ai['"]/);
    expect(fnBody).toMatch(/provenanceMeta/);
  });
});
