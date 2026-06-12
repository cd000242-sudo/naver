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

  it('4개 진입점(연속/다중×2/풀오토 래퍼)이 headingImageMode를 명시 전달한다', () => {
    const mam = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    const cp = read('src', 'renderer', 'modules', 'continuousPublishing.ts');
    const ph = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    const passPattern = /headingImageMode: localStorage\.getItem\('headingImageMode'\) \|\| 'all'/g;
    expect((mam.match(passPattern) || []).length).toBeGreaterThanOrEqual(2);
    expect((cp.match(passPattern) || []).length).toBeGreaterThanOrEqual(1);
    expect((ph.match(passPattern) || []).length).toBeGreaterThanOrEqual(1);
  });
});
