/**
 * headlessNaverPathGuard.test.ts — Phase B (P3 Fix 3.4) 사전 회귀 가드
 *
 * SPEC-NAVER-PROTECTION-2026 P3 Fix 3.4 — headless:true 5곳 제거 (점진적).
 *
 * 이번 사이클 (v2.10.364): editorHelpers.ts:1574 1곳 (naver.me 리다이렉트 추적).
 * 다음 사이클: smartCrawler:746, productSpecCrawler:364/477/535, imageLibrary:274.
 *
 * 이미지 생성기 (comparisonTableGenerator, imageFxGenerator) headless:true는
 * 네이버 무관이라 유지 — 회귀 가드에 명시.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) => fs.readFileSync(path.join(PROJECT_ROOT, p), 'utf-8');

// ═══════════════════════════════════════════════════════════════════
// 이번 사이클 fix 대상 — editorHelpers.ts:1574
// ═══════════════════════════════════════════════════════════════════
describe('P3 Fix 3.4 (v2.10.364): editorHelpers.ts naver.me 리다이렉트', () => {
  it('naver.me 단축 URL 추적 Playwright 인스턴스에 headless: false 적용 보호', () => {
    const src = readSrc('src/automation/editorHelpers.ts');
    // chromium.launch 호출이 line 1574 부근에 있음
    // headless: true가 그 영역에서 사라져야 함 (변경 후 검증)
    const naverMeBlockMatch = src.match(/naver\.me 단축 URL[\s\S]{0,800}chromium\.launch\([\s\S]{0,100}\)/);
    expect(naverMeBlockMatch).not.toBeNull();
    const block = naverMeBlockMatch![0];
    // headless: true 부재 (변경 후 invariant)
    expect(block).not.toMatch(/headless:\s*true/);
    // headless: false 또는 launch options 누락(default true 아님) — 둘 중 하나
    expect(block).toMatch(/headless:\s*false|chromium\.launch\(\s*\)/);
  });

  it('네이버 봇 감지 회피 주석 보호 (의도 명확)', () => {
    const src = readSrc('src/automation/editorHelpers.ts');
    expect(src).toMatch(/네이버 봇 감지에 의해 실패/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 이번 사이클 추가 fix — smartCrawler.ts:746 (v2.10.365 P3 Fix 3.4 — 2/5)
// ═══════════════════════════════════════════════════════════════════
describe('P3 Fix 3.4 (v2.10.365): smartCrawler.ts puppeteer headed/new', () => {
  it('smartCrawler.ts puppeteer.launch에 headless: \'new\' 적용 보호', () => {
    const src = readSrc('src/crawler/smartCrawler.ts');
    // puppeteer.launch는 line 748 1곳뿐. headless: 'new' 직접 검색.
    expect(src).toMatch(/puppeteer\.launch/);
    // 'new' 또는 'shell' 또는 false 중 하나 (headless:true 아님)
    expect(src).toMatch(/headless:\s*'new'/);
  });

  it('smartCrawler.ts에 puppeteer.launch headless:true 없음 (Playwright 쿠팡 false는 별개)', () => {
    const src = readSrc('src/crawler/smartCrawler.ts');
    // puppeteer.launch 부근 (앞 100자) 컨텍스트에서 headless:true 없어야
    const puppeteerBlock = src.match(/puppeteer\.launch[\s\S]{0,200}/);
    expect(puppeteerBlock).not.toBeNull();
    expect(puppeteerBlock![0]).not.toMatch(/headless:\s*true/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 다음 사이클 대상 — 3곳 (이번 변경 X, 부주의 변경 방지 보호)
// ═══════════════════════════════════════════════════════════════════
describe('P3 Fix 3.4 (다음 사이클): 3곳 headless:true 그대로 유지', () => {
  // 다음 사이클에서 변경 예정. 이번 변경에 휩쓸리지 않는지 확인.
  it('productSpecCrawler.ts에 headless:true 3곳 이상 그대로', () => {
    const src = readSrc('src/crawler/productSpecCrawler.ts');
    const matches = src.match(/headless:\s*true/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('imageLibrary.ts:274 headless:true 그대로', () => {
    const src = readSrc('src/imageLibrary.ts');
    expect(src).toMatch(/headless:\s*true/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 네이버 무관 — 이미지 생성기는 그대로 유지 (회귀 방지)
// ═══════════════════════════════════════════════════════════════════
describe('이미지 생성기 headless 유지 (네이버 무관)', () => {
  it('imageFxGenerator.ts headless:true 정책 유지 (Google ImageFX, 네이버 무관)', () => {
    const src = readSrc('src/image/imageFxGenerator.ts');
    // imageFxGenerator는 별도 정책 (이미 v2.10.290에서 일부 false로 전환)
    // 이 테스트는 갑작스러운 일괄 변경 방지용 보호
    expect(src).toMatch(/headless:/); // 정의 자체는 존재
  });

  it('comparisonTableGenerator.ts:341 headless 정책 유지 (이미지 생성용)', () => {
    const src = readSrc('src/image/comparisonTableGenerator.ts');
    expect(src).toMatch(/headless:/);
  });
});
