import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Opening the image settings modal must NEVER spawn a login Chrome window
 * unless the user actually selected an engine that needs it (user report
 * 2026-06-10: ImageFX/Flow login window appeared with other engines selected).
 */
describe('image engine login gating', () => {
  it('runs the Google login auto-check only for imagefx/flow engines', () => {
    const code = read('renderer/components/HeadingImageSettings.ts');
    expect(code).toMatch(
      /if \(currentSource === 'imagefx' \|\| currentSource === 'flow'\) \(async \(\) => \{/
    );
  });

  it('auto-checks Dropshot only after that engine is selected and never auto-starts login', () => {
    const sharedUi = read('renderer/modules/dropshotLoginUi.ts');
    const headingSettings = read('renderer/components/HeadingImageSettings.ts');

    expect(sharedUi).toContain("sel.value === 'dropshot'");
    expect(sharedUi).toContain('refreshDropshotLoginStatus(opts)');
    expect(headingSettings).toContain("selectedSourceValue === 'dropshot'");
    expect(headingSettings).toContain('refreshDropshotLoginStatus');
    const refreshBlock = sharedUi.slice(
      sharedUi.indexOf('export async function refreshDropshotLoginStatus'),
      sharedUi.indexOf('export function bindDropshotLogin'),
    );
    expect(refreshBlock).toContain('checkDropshotLogin');
    expect(refreshBlock).not.toContain('dropshotLogin');
  });

  it('disables Dropshot login buttons while an IPC request is in flight', () => {
    const sharedUi = read('renderer/modules/dropshotLoginUi.ts');
    const headingSettings = read('renderer/components/HeadingImageSettings.ts');

    expect(sharedUi).toContain('loginBtn.disabled = true;');
    expect(sharedUi).toContain('loginBtn.disabled = dsLastStatus?.loggedIn === true;');
    expect(sharedUi).toContain('checkBtn.disabled = true;');
    expect(sharedUi).toContain('checkBtn.disabled = false;');
    expect(headingSettings).toContain('bindDropshotLogin');
  });

  it('resets the stale thumbnailOnly flag exactly once at checkbox init', () => {
    const code = read('renderer/renderer.ts');
    expect(code).toContain("thumbnailOnlyResetV2");
    const block = code.slice(
      code.indexOf("if (!localStorage.getItem('thumbnailOnlyResetV2'))"),
      code.indexOf('초기값 복원')
    );
    expect(block).toContain("localStorage.setItem('thumbnailOnly', 'false')");
  });
});
