import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guards for focus-emulation caret robustness (2026-06-23).
 *
 * Live diagnosis (suma0404): after a 소제목(quotation) the caret jumped to the title
 * area, and EVERY caret-recovery strategy (click/CDP/programmatic) reported
 * "키보드 미반응/위치오류" for minutes — the body never typed (+0) and the page
 * eventually closed (detached frame). Root cause: SmartEditor sets its model caret
 * only on real clicks, and when the app (Electron) window holds OS focus the Chrome
 * page reports document.hasFocus()=false, so SmartEditor ignores the click.
 *
 * Fix: CDP Emulation.setFocusEmulationEnabled makes the page always report focused,
 * so the click-based caret works regardless of OS window state — in any environment.
 */
describe('focus emulation caret robustness', () => {
  const automation = read('naverBlogAutomation.ts');
  const editor = read('automation/editorHelpers.ts');

  it('enables CDP focus emulation so the page is always treated as focused', () => {
    expect(automation).toContain("client.send('Emulation.setFocusEmulationEnabled', { enabled: true })");
    expect(automation).toMatch(/async enableFocusEmulation\s*\(/);
  });

  it('keeps the CDP session alive (does not detach) so emulation persists', () => {
    // the new client is stored; only the PREVIOUS one is detached
    expect(automation).toContain('this as any)._focusEmulationClient = client');
  });

  it('activates focus emulation inside applyStructuredContent (before any section body)', () => {
    expect(editor).toContain('await self.enableFocusEmulation?.()');
    const applyIdx = editor.indexOf('export async function applyStructuredContent');
    const emuIdx = editor.indexOf('enableFocusEmulation?.()');
    expect(applyIdx).toBeGreaterThan(-1);
    expect(emuIdx).toBeGreaterThan(applyIdx);
  });
});
