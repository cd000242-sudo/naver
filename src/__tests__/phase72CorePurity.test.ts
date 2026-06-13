import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * SPEC-STABILITY-2026 Phase 7.2 (R13) — 공유 코어 순수화 1차.
 * 원칙: 2곳 이상에서 호출되는 공유 함수는 동작 입력(모드/플래그)을
 * localStorage에서 직접 읽지 않는다 — 각 플로우 진입점이 1회 해석해
 * 명시적으로 전달한다. "하나 고치면 다른 곳이 터지는" 구조의 근본 처방.
 */
const read = (...seg: string[]): string => fs.readFileSync(path.join(process.cwd(), ...seg), 'utf-8');

describe('Phase 7.2 코어 순수화 — generateImagesForAutomation headingImageMode', () => {
  it('코어는 options.headingImageMode를 우선하고, 폴백 직독은 경고를 남긴다', () => {
    const src = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    expect(src).toContain('options.headingImageMode');
    expect(src).toContain('headingImageMode 미전달 — localStorage 폴백');
  });

  it('6개 진입점(연속×2/다중×3/풀오토 래퍼)이 headingImageMode를 명시 전달한다', () => {
    const mam = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    const cp = read('src', 'renderer', 'modules', 'continuousPublishing.ts');
    const ph = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    // [Phase 7.1-b/c] 연속/다중계정은 per-item 스냅샷 경유로 전환
    const cfgPassPattern = /headingImageMode: itemPipelineCfg\.image\.headingImageMode/g;
    expect((mam.match(cfgPassPattern) || []).length).toBeGreaterThanOrEqual(3);
    expect((cp.match(cfgPassPattern) || []).length).toBeGreaterThanOrEqual(2);
    // [Phase 7.1-a] 풀오토 래퍼는 단일 해석처(resolvePipelineConfig) 경유로 전환
    expect(ph).toContain("headingImageMode: resolvePipelineConfig('full-auto').image.headingImageMode");
  });
});

describe('Phase 7.2 코어 순수화 — invalid-provider fallbackProvider (R13 2차)', () => {
  it('코어는 options.fallbackProvider를 우선하고, 폴백 직독은 경고를 남긴다', () => {
    const src = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    expect(src).toContain('options.fallbackProvider');
    expect(src).toContain('fallbackProvider 미전달 — localStorage 폴백');
    // The chain itself lives in ONE function — the inline duplicate inside
    // the core's invalid-provider branch must stay removed.
    expect(src).toContain('function resolveImageProviderFallback()');
    // [7.1-f] The chain reads through the pipeline accessor — no direct read.
    expect((src.match(/localStorage\.getItem\('fullAutoImageSource'\)/g) || []).length).toBe(0);
  });

  it('6개 진입점이 fallbackProvider를 명시 전달한다', () => {
    const mam = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    const cp = read('src', 'renderer', 'modules', 'continuousPublishing.ts');
    const ph = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    const passPattern = /fallbackProvider: resolveImageProviderFallback\(\)/g;
    expect((mam.match(passPattern) || []).length).toBeGreaterThanOrEqual(3);
    expect((cp.match(passPattern) || []).length).toBeGreaterThanOrEqual(2);
    expect((ph.match(passPattern) || []).length).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 7.2 코어 순수화 — richTextPaste 테마 (R13 3차)', () => {
  it('buildMobileRichHtml은 eager 랜덤 없이, 테마 미전달 시에만 lazy 폴백 + 경고를 남긴다', () => {
    const src = read('src', 'automation', 'richTextPaste.ts');
    expect(src).not.toMatch(/const articleThemes = pickRichArticleThemes\(\)/);
    expect(src).toContain('테마 미전달 — per-call 랜덤 폴백');
  });

  it('프로덕션 호출자(editorHelpers/naverBlogAutomation)는 테마 3종을 명시 전달한다', () => {
    const eh = read('src', 'automation', 'editorHelpers.ts');
    const nba = read('src', 'naverBlogAutomation.ts');
    for (const pass of [
      'tableTheme: richThemes.tableTheme',
      'highlightTheme: richThemes.highlightTheme',
      'headingTheme: richThemes.headingTheme',
    ]) {
      expect(eh).toContain(pass);
      expect(nba).toContain(pass);
    }
  });
});
