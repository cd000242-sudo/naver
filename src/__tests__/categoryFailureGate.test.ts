import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * SPEC-STABILITY-2026 R8-1 (A-1/A-2): a user-requested category that fails to
 * apply must STOP the publish with a reason — never silently publish under
 * the default category. (The function only runs when categoryName was
 * explicitly provided, so every silent-proceed path violated user intent.)
 * Escape hatch: options.allowCategoryFallback restores the old behavior.
 */
describe('category failure gate (R8-1)', () => {
  const code = read('automation/publishHelpers.ts');
  const fn = code.slice(
    code.indexOf('export async function selectCategoryInPublishModal'),
    code.indexOf('export', code.indexOf('export async function selectCategoryInPublishModal') + 10)
  );

  it('no silent default-category fallback remains in the category selector', () => {
    expect(fn).not.toMatch(/기본 카테고리로 진행/);
    expect(fn).not.toMatch(/기본 카테고리로 발행합니다/);
  });

  it('every terminal failure throws a structured CATEGORY_ error', () => {
    const throws = fn.match(/failCategory\(/g) || [];
    expect(throws.length).toBeGreaterThanOrEqual(5);
    expect(fn).toMatch(/CATEGORY_MODAL_TIMEOUT/);
    expect(fn).toMatch(/CATEGORY_SELECT_TIMEOUT/);
    expect(fn).toMatch(/CATEGORY_UI_NOT_FOUND/);
    expect(fn).toMatch(/CATEGORY_NOT_FOUND/);
    expect(fn).toMatch(/CATEGORY_SELECT_FAILED/);
  });

  it('keeps an explicit opt-out (allowCategoryFallback) instead of a hidden one', () => {
    expect(fn).toMatch(/allowCategoryFallback/);
  });
});
