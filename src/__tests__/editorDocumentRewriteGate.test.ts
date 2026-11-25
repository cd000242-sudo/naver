import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_DOCUMENT_REWRITE_ENV, isEditorDocumentRewriteEnabled } from '../automation/editorDocumentRewriteGate.js';
import { runPreviousPostCardsLayoutHook } from '../automation/previousPostTailHelpers.js';

// Live runs 2026-11-25 (owner x2, customer x3, app 2.11.403-405): rewriting the editor document after the screen-only
// address cleanup threw "Failed to execute 'removeChild' on 'Node'" inside the editor, the screen went blank and the
// posts went out with no tags. Until the rewrite is proven in a real editor it must not run for customers.
describe('editor document rewrite gate', () => {
  afterEach(() => { delete process.env[EDITOR_DOCUMENT_REWRITE_ENV]; });

  it('is off unless the switch is set to exactly "1"', () => {
    expect(isEditorDocumentRewriteEnabled({})).toBe(false);
    expect(isEditorDocumentRewriteEnabled({ [EDITOR_DOCUMENT_REWRITE_ENV]: '' })).toBe(false);
    expect(isEditorDocumentRewriteEnabled({ [EDITOR_DOCUMENT_REWRITE_ENV]: 'true' })).toBe(false);
    expect(isEditorDocumentRewriteEnabled({ [EDITOR_DOCUMENT_REWRITE_ENV]: '1' })).toBe(true);
  });

  it('does not run the previous-post card rewrite by default', async () => {
    const self = { alignPreviousPostCards: vi.fn(async () => undefined), getAttachedFrame: vi.fn(async () => null), log: vi.fn() };
    await runPreviousPostCardsLayoutHook(self, {} as never, ['https://blog.naver.com/someone/223000000001']);
    expect(self.alignPreviousPostCards).not.toHaveBeenCalled();
    expect(self.getAttachedFrame).not.toHaveBeenCalled();
  });

  it('runs the previous-post card rewrite only with the switch on', async () => {
    process.env[EDITOR_DOCUMENT_REWRITE_ENV] = '1';
    const self = { alignPreviousPostCards: vi.fn(async () => undefined), getAttachedFrame: vi.fn(async () => null), log: vi.fn() };
    await runPreviousPostCardsLayoutHook(self, {} as never, ['https://blog.naver.com/someone/223000000001']);
    expect(self.alignPreviousPostCards).toHaveBeenCalledTimes(1);
  });

  it('keeps the shopping-post rewrite behind the same switch', () => {
    const source = readFileSync(join(process.cwd(), 'src/automation/editorHelpers.ts'), 'utf8');
    const call = source.indexOf('await self.alignShoppingPostCenter()');
    expect(call).toBeGreaterThan(0);
    const guard = source.slice(source.lastIndexOf('if (', call), call);
    expect(guard).toMatch(/isEditorDocumentRewriteEnabled\(\)/);
    expect(guard).toMatch(/resolved\.affiliateLink/);
  });
});
