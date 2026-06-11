import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

function readRoot(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}

/**
 * 2026-06-11 user request: remove ImageFX from selectable image engines,
 * keep Flow. Backend modules stay (legacy data, recovery paths) — only the
 * selection surface is removed, and stale saved selections migrate to Flow.
 */
describe('ImageFX removal from selection UI', () => {
  it('removes the imagefx option from the main image-source dropdown and defaults to flow', () => {
    const html = readRoot('public/index.html');
    expect(html).not.toMatch(/<option value="imagefx"/);
    expect(html).toMatch(/<option value="flow"[^>]*selected/);
  });

  it('removes imagefx options and the source card from HeadingImageSettings', () => {
    const code = read('renderer/components/HeadingImageSettings.ts');
    expect(code).not.toMatch(/<option value="imagefx"/);
    expect(code).not.toMatch(/data-value="imagefx"/);
  });

  it('migrates stale imagefx selections to flow at startup (visible, one-time)', () => {
    const code = read('renderer/modules/imageManagementTab.ts');
    expect(code).toMatch(/imagefx → flow/);
    expect(code).toMatch(/fullAutoImageSource[\s\S]{0,200}globalImageSource/);
  });

  it('no renderer default falls back to imagefx', () => {
    const code = read('renderer/modules/imageManagementTab.ts');
    expect(code).not.toMatch(/\|\| 'imagefx'/);
  });
});
