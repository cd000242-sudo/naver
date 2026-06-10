import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Auto-related-link insertion must be opt-in (default OFF). The previous-post
 * tail block already adds one related link as a clean oglink card; leaving the
 * auto-related plain-text insertion ON produced a second link to the same post
 * ("추천글"과 "다음글" 같은 링크 — user report 2026-06-11). Users who explicitly
 * enabled the toggle keep it (=== true).
 */
describe('auto related-link is opt-in', () => {
  it('main process gates insertion on an explicit true (not undefined)', () => {
    const code = read('main.ts');
    expect(code).toContain('autoInsertInternalLinks === true');
    expect(code).not.toContain('autoInsertInternalLinks !== false');
  });

  it('settings toggle reflects opt-in default (=== true)', () => {
    const code = read('renderer/modules/priceInfoModal.ts');
    expect(code).toContain('(config as any).autoInsertInternalLinks === true');
    expect(code).not.toContain('(config as any).autoInsertInternalLinks !== false');
  });
});
