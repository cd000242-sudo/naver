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

  // [2026-11-04] 고객 제보 "AI 활용 체크를 켜도 안 된다": 400ms 한 번 조회 · 확인 없음 · 무조건 "완료" 였다.
  //   이미지 칸 먼저 · 프레임 다음 조회는 aiImageMark.findVisibleAiMarkButton 이 맡는다(aiImageMarkActivation1104.test).
  //   사장님: "경고로 알려도 사용자가 뭘 하겠니, 성공이 되게 해야지" → 이미지마다 최대 3번 다시 시도.
  it('이미지마다 다시 고르고 · 기다려 찾고 · 꺼져 있을 때만 누르고 · 켜짐 확인을 최대 3번, 요약은 결과대로', () => {
    const loop = step4Block();
    expect(loop).toContain('const aiMarkResult = await markAiImageWithRetries({');
    expect(loop).toContain('component: imageComponents[i],');
    expect(loop).toMatch(/selectImage: async \(\) => \{[\s\S]*?scrollIntoView[\s\S]*?page\.mouse\.click\(iframeOff\.x \+ compCoords\.x/);
    // Live 2026-11-04: the toggle sits below the image, off screen → scroll the toggle itself, click where topmost,
    //   otherwise a direct click (coordinates computed after scrolling only the image missed it).
    expect(loop).toMatch(/clickButton: async \(control\) => \{[\s\S]*?btn\.scrollIntoView\(\{ block: 'center'[\s\S]*?document\.elementFromPoint\(x, y\)[\s\S]*?if \(point\.topmost\) \{[\s\S]*?page\.mouse\.click\(iframeOff\.x \+ point\.x, iframeOff\.y \+ point\.y\);[\s\S]*?\} else \{[\s\S]*?\.click\(\)\)/);
    expect(loop).toContain('aiMarkResults.push(aiMarkResult);');
    expect(loop).toContain('this.log(`   ${summarizeAiMarkResults(aiMarkResults)}`);');
    // The old blind spots stay gone.
    expect(loop).not.toMatch(/await this\.delay\(400\);\s*\n\s*\/\/ Prefer component-scoped button/);
    expect(loop).not.toMatch(/개 이미지에 AI 활용 마크 활성화 완료/);
    expect(loop).not.toMatch(/aiMarkCount\+\+/);
  });

  it('판정은 data-img-ai 1차 + provider 허용목록(isAiGeneratedImage) 2차다', () => {
    const loop = step4Block();
    expect(loop).toMatch(/getAttribute\(['"]data-img-ai['"]\)/);
    // [2026-09-29] The allowlist fallback now runs inside resolveAiMarkTarget (aiMarkCardOverride.test.ts).
    expect(loop).toMatch(/resolveAiMarkTarget\(\{/);
    expect(loop).toMatch(/attrAi:\s*attrs\.ai/);
    expect(loop).toMatch(/attrProvider:\s*attrs\.provider/);
  });

  it('비AI 판정은 continue로 스킵한다 (opt-in)', () => {
    const loop = step4Block();
    const skipIdx = loop.indexOf('if (!isAiTarget)');
    expect(skipIdx).toBeGreaterThan(-1);
    expect(loop.indexOf('continue', skipIdx)).toBeGreaterThan(skipIdx);
  });

  /*
   * [2026-09-22 사장님] 이미지 관리 탭 "AI 활용 체크하기" — 체크하면 판정과 무관하게 전부 마크.
   * 체크박스(index.html) → config.aiMarkAllImages(imageManagementTab) → 발행 루프 세 층이 같은 키를 써야 한다.
   */
  it('"AI 활용 체크하기" 옵트인은 config.aiMarkAllImages 로 발행 루프까지 배선된다', () => {
    const loop = step4Block();
    expect(loop).toMatch(/aiMarkAllImages === true/);
    // [2026-09-29] Decision moved into resolveAiMarkTarget so the per-heading card toggle
    // can outrank the global checkbox (see aiMarkCardOverride.test.ts for the precedence).
    expect(loop).toMatch(/const isAiTarget = resolveAiMarkTarget\(\{\s*\n\s*aiMarkAllImages,/);
    expect(readSrc('configManager.ts')).toMatch(/aiMarkAllImages\?: boolean/);
    expect(readSrc('renderer/modules/imageManagementTab.ts')).toMatch(/getElementById\('image-ai-mark-all'\)/);
    const imageTab = readSrc('renderer/modules/imageManagementTab.ts');
    const initialize = imageTab.slice(imageTab.indexOf('async function initImageManagementTab'));
    expect(initialize.indexOf('bindImageAiDisclosureSetting(')).toBeGreaterThan(-1);
    expect(initialize.indexOf('bindImageAiDisclosureSetting(')).toBeLessThan(initialize.indexOf('await '));
    expect(readSrc('renderer/modules/imageAiDisclosureSetting.ts')).toContain('api.saveConfig({ aiMarkAllImages: requested })');
    const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
    expect(html).toMatch(/id="image-ai-mark-all"/);
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
