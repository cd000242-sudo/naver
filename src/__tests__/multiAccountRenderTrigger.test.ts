import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guard for the 풀오토 다중계정(ma) sub-tab account-list render trigger (2026-06-23).
 *
 * Live diagnosis (owner machine): the "풀오토 다중계정 발행" panel showed "등록된 계정이
 * 없습니다" even though 6 accounts existed. Console check `await window.api.getAllBlogAccounts()`
 * returned {success:true, accounts:Array(6)} — so the backend was fine; the screen never
 * rendered. Root cause: v2.11.49 moved the multi-account modal into an inline publish sub-tab,
 * and showMode('ma') only toggles panel visibility — it no longer calls renderMultiAccountList(),
 * so the static empty-state HTML (ma-no-accounts) stayed and ma-accounts-container was never filled.
 *
 * Fix: showMode('ma') triggers window.renderMultiAccountList() when the ma sub-tab is shown.
 */
describe('multi-account ma sub-tab render trigger', () => {
  const renderer = read('renderer/renderer.ts');

  it("showMode('ma') triggers the account-list render", () => {
    const showModeIdx = renderer.indexOf('const showMode =');
    expect(showModeIdx).toBeGreaterThan(-1);
    const body = renderer.slice(showModeIdx, showModeIdx + 1400);
    // within showMode, the 'ma' branch must call renderMultiAccountList
    expect(body).toMatch(/mode === 'ma'[\s\S]*renderMultiAccountList/);
  });

  it('calls the window-exposed renderer defensively (optional chaining)', () => {
    expect(renderer).toContain('window as any).renderMultiAccountList?.()');
  });
});
