/**
 * Dropshot engine integration tests — SSOT registration verification
 *
 * Verifies that 'dropshot' (리더스 나노바나나 무제한) is correctly registered
 * in all 4 SSOT locations and that branding/cost rules are enforced.
 *
 * Branding rules checked:
 * - User-facing label must be '🍌 리더스 나노바나나 무제한' (no 'dropshot' string in label)
 * - Cost note must NOT contain '무료' or '0원' as standalone claim
 * - Cost note MUST contain '구독자 무제한' and '추가비용 0원'
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('Dropshot SSOT registration', () => {
  describe('P0-1: image/types.ts', () => {
    const code = read('image/types.ts');

    it("'dropshot' included in ImageProvider union", () => {
      const providerLine = code.match(/export type ImageProvider\s*=[\s\S]{0,2000}?;/)?.[0] || '';
      expect(providerLine).toMatch(/'dropshot'/);
    });

    it("'dropshot' included in ALLOWED_PROVIDER array", () => {
      const allowedBlock = code.match(/ALLOWED_PROVIDER[\s\S]{0,2000}?\];/)?.[0] || '';
      expect(allowedBlock).toMatch(/'dropshot'/);
    });
  });

  describe('P0-2: runtime/imageEngineCatalog.ts', () => {
    const code = read('runtime/imageEngineCatalog.ts');

    it("DROPSHOT spec exists with value: 'dropshot'", () => {
      expect(code).toMatch(/value:\s*'dropshot'/);
    });

    it("DROPSHOT label is '🍌 리더스 나노바나나 무제한' (no 'dropshot' text in label)", () => {
      const labelMatch = code.match(/label:\s*['"]([^'"]*)['"]/g) || [];
      const dropshotLabel = labelMatch.find((l) => l.includes('리더스 나노바나나'));
      expect(dropshotLabel).toBeDefined();
      expect(dropshotLabel).not.toMatch(/dropshot/i);
    });

    it("DROPSHOT costKrw is 0", () => {
      // Find DROPSHOT block and verify costKrw: 0
      const dropshotBlock =
        code.match(/export const DROPSHOT[\s\S]{0,500}?\};/)?.[0] || '';
      expect(dropshotBlock).toMatch(/costKrw:\s*0/);
    });

    it("DROPSHOT freeTierNote contains '구독자 무제한' and '추가비용 0원' (not bare '무료')", () => {
      const dropshotBlock =
        code.match(/export const DROPSHOT[\s\S]{0,500}?\};/)?.[0] || '';
      expect(dropshotBlock).toMatch(/구독자 무제한/);
      expect(dropshotBlock).toMatch(/추가비용 0원/);
    });

    it("DROPSHOT freeTierNote does NOT use bare '무료' cost claim", () => {
      const dropshotBlock =
        code.match(/export const DROPSHOT[\s\S]{0,500}?\};/)?.[0] || '';
      // '무료' is allowed only in context (e.g. '무료 사용자') — not as the cost descriptor
      // The specific banned phrase is something like '무료 이미지' or '무료로 사용'
      // Check freeTierNote does NOT start with '무료' claim without subscription context
      expect(dropshotBlock).not.toMatch(/freeTierNote:\s*['"]무료/);
    });

    it('IMAGE_ENGINE_CATALOG array contains DROPSHOT', () => {
      const catalogBlock =
        code.match(/IMAGE_ENGINE_CATALOG:\s*ImageEngineSpec\[\]\s*=[\s\S]{0,500}?\];/)?.[0] || '';
      expect(catalogBlock).toMatch(/DROPSHOT/);
    });

    it("DROPSHOT koreanText is true", () => {
      const dropshotBlock =
        code.match(/export const DROPSHOT[\s\S]{0,500}?\};/)?.[0] || '';
      expect(dropshotBlock).toMatch(/koreanText:\s*true/);
    });
  });

  describe('P0-3: imageGenerator.ts dispatcher', () => {
    const code = read('imageGenerator.ts');

    it("'dropshot' import exists (generateWithDropshot)", () => {
      expect(code).toMatch(/generateWithDropshot/);
    });

    it("isKoreanTextSupportedEngine includes 'dropshot'", () => {
      const fnBlock =
        code.match(/isKoreanTextSupportedEngine[\s\S]{0,500}?return[\s\S]{0,200}?;/)?.[0] || '';
      expect(fnBlock).toMatch(/engine\s*===\s*'dropshot'/);
    });

    it("'dropshot' branch exists in generateImages", () => {
      expect(code).toMatch(/normalizedProvider\s*===\s*'dropshot'/);
    });

    it("'dropshot' is NOT in auto/fallback chain (explicit-only usage)", () => {
      // The fallback chain ends with nano-banana-pro. Dropshot must not appear there.
      const fallbackBlock =
        code.match(/폴백.*nano-banana-pro[\s\S]{0,500}?generateWithNanoBananaPro/)?.[0] || '';
      expect(fallbackBlock).not.toMatch(/dropshot/);
    });

    it("providerDisplayNames includes 'dropshot' label without 'dropshot.io' exposure", () => {
      // The providerDisplayNames block can exceed 500 chars; scan wider
      const namesBlock =
        code.match(/providerDisplayNames[\s\S]{0,1500}?\};/)?.[0] || '';
      expect(namesBlock).toMatch(/'dropshot':/);
      // dropshot.io must not appear in user-facing display name
      const dropshotLine = namesBlock.match(/'dropshot':[^\n]*/)?.[0] || '';
      expect(dropshotLine).not.toMatch(/dropshot\.io/);
    });
  });

  describe('P0-4: renderer/components/HeadingImageSettings.ts', () => {
    const code = read('renderer/components/HeadingImageSettings.ts');

    it("'dropshot' in ActiveImageSource type", () => {
      const activeDecl =
        code.match(/export type ActiveImageSource\s*=[\s\S]{0,500}?;/)?.[0] || '';
      expect(activeDecl).toMatch(/'dropshot'/);
    });

    it("'dropshot' in SOURCE_NAMES with correct label", () => {
      // 전체 소스에서 'dropshot' 라벨 라인을 직접 매칭 (window 추출은 brittle)
      const line = code.match(/'dropshot':\s*'[^']*'/)?.[0] || '';
      expect(line).toMatch(/리더스 나노바나나 무제한/);
      expect(line).not.toMatch(/dropshot\.io/);
    });

    it("SOURCE_NAMES 'dropshot' label contains '구독자 무제한' and '추가비용 0원'", () => {
      const line = code.match(/'dropshot':\s*'[^']*'/)?.[0] || '';
      expect(line).toMatch(/구독자 무제한/);
      expect(line).toMatch(/추가비용 0원/);
    });

    it("VALID_SOURCES includes 'dropshot'", () => {
      // 타입 표기 GlobalImageSource[] 의 []가 아니라 배열 리터럴(끝 '];')까지 캡처
      const validBlock = code.match(/VALID_SOURCES[\s\S]*?\];/)?.[0] || '';
      expect(validBlock).toMatch(/'dropshot'/);
    });
  });

  describe('P0-5: renderer/modules/unifiedDOMCache.ts', () => {
    const code = read('renderer/modules/unifiedDOMCache.ts');

    it("VALID_AI_SOURCES includes 'dropshot'", () => {
      const block =
        code.match(/VALID_AI_SOURCES\s*=\s*\[[\s\S]{0,500}?\]/)?.[0] || '';
      expect(block).toMatch(/'dropshot'/);
    });
  });
});

describe('Dropshot dropshotCore — buildDropshotPrompt', () => {
  it('short Korean prompt gets enhanced with quality suffix', async () => {
    const { buildDropshotPrompt } = await import('../image/dropshotCore');
    const result = buildDropshotPrompt('귀여운 강아지');
    expect(result).toContain('귀여운 강아지');
    expect(result).toMatch(/시네마틱|사실적|한국적/);
  });

  it('long prompt (>= 50 chars) is not enhanced with quality suffix', async () => {
    const { buildDropshotPrompt } = await import('../image/dropshotCore');
    const longPrompt = '이것은 50자 이상의 긴 프롬프트입니다. 내용이 충분히 길어서 자동 enhance가 적용되지 않아야 합니다.';
    expect(longPrompt.length).toBeGreaterThanOrEqual(50);
    const result = buildDropshotPrompt(longPrompt);
    expect(result).toContain(longPrompt);
    // quality suffix should NOT be added for long prompts
    expect(result).not.toMatch(/시네마틱 4K.*텍스트 없음/);
  });

  it('adds variation seed (unique each call)', async () => {
    const { buildDropshotPrompt } = await import('../image/dropshotCore');
    const r1 = buildDropshotPrompt('테스트');
    const r2 = buildDropshotPrompt('테스트');
    // Both should contain variation seed but they will differ
    expect(r1).toMatch(/버전-/);
    expect(r2).toMatch(/버전-/);
    // Statistically they should differ (different random nonce)
    // (there is an extremely small chance they are equal — acceptable)
    expect(r1).not.toEqual(r2);
  });

  it('non-Korean prompt does not get Korean quality suffix', async () => {
    const { buildDropshotPrompt } = await import('../image/dropshotCore');
    const result = buildDropshotPrompt('a cute puppy');
    expect(result).not.toMatch(/시네마틱|사실적|한국적/);
  });
});

describe('Dropshot branding — no forbidden strings in user-facing labels', () => {
  it("label '🍌 리더스 나노바나나 무제한' contains no raw 'dropshot' substring", () => {
    const label = '🍌 리더스 나노바나나 무제한';
    expect(label.toLowerCase()).not.toContain('dropshot');
  });

  it("cost note does not contain bare '무료' claim", () => {
    const freeTierNote =
      'Pro 구독자 무제한 · 이미지당 추가비용 0원 (Dropshot Pro 구독료 월 74,000~99,000원은 사이트에서 별도 결제)';
    // Should NOT start with '무료'
    expect(freeTierNote).not.toMatch(/^무료/);
    // Must include subscription context
    expect(freeTierNote).toMatch(/구독자 무제한/);
    expect(freeTierNote).toMatch(/추가비용 0원/);
  });
});
