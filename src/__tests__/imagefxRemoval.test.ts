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
// 2026-06-11 round 2: Flow removed as well — live success rate was 1/4
// attempts; an unstable engine in a distributed app is worse than none.
// dropshot (리더스 나노바나나 무제한) inherits the default.
describe('unstable engine removal from selection UI (imagefx + flow)', () => {
  it('removes imagefx and flow from the main image-source dropdown; dropshot is the default', () => {
    const html = readRoot('public/index.html');
    expect(html).not.toMatch(/<option value="imagefx"/);
    expect(html).not.toMatch(/<option value="flow"/);
    expect(html).toMatch(/<option value="dropshot"[^>]*selected/);
  });

  it('removes imagefx/flow options and source cards from HeadingImageSettings', () => {
    const code = read('renderer/components/HeadingImageSettings.ts');
    expect(code).not.toMatch(/<option value="imagefx"/);
    expect(code).not.toMatch(/data-value="imagefx"/);
    expect(code).not.toMatch(/<option value="flow"/);
    expect(code).not.toMatch(/data-value="flow"/);
  });

  it('migrates stale imagefx/flow selections to dropshot at startup (visible, one-time)', () => {
    const code = read('renderer/modules/imageManagementTab.ts');
    expect(code).toMatch(/saved === 'imagefx' \|\| saved === 'flow'/);
    expect(code).toMatch(/→ dropshot/);
    expect(code).toMatch(/fullAutoImageSource[\s\S]{0,200}globalImageSource/);
  });

  it('no renderer default falls back to a removed engine', () => {
    const code = read('renderer/modules/imageManagementTab.ts');
    expect(code).not.toMatch(/\|\| 'imagefx'/);
    expect(code).not.toMatch(/\|\| 'flow'/);
  });
});
