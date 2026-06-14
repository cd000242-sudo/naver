import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

function readRoot(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}

describe('image engine selection surface', () => {
  it('keeps ImageFX hidden while restoring Flow and Prodia in the main dropdown', () => {
    const html = readRoot('public/index.html');

    expect(html).not.toMatch(/<option value="imagefx"/);
    expect(html).toMatch(/<option value="flow"/);
    expect(html).toMatch(/<option value="prodia"/);
    expect(html).toMatch(/<option value="dropshot"[^>]*selected/);
  });

  it('keeps ImageFX hidden while restoring Flow and Prodia in heading image settings', () => {
    const code = read('renderer/components/HeadingImageSettings.ts');

    expect(code).not.toMatch(/<option value="imagefx"/);
    expect(code).not.toMatch(/data-value="imagefx"/);
    expect(code).toMatch(/<option value="flow"/);
    expect(code).toMatch(/data-value="flow"/);
    expect(code).toMatch(/<option value="prodia"/);
    expect(code).toMatch(/data-value="prodia"/);
  });

  it('migrates only stale ImageFX selections to Dropshot at startup', () => {
    const code = read('renderer/modules/imageManagementTab.ts');

    expect(code).toMatch(/saved === 'imagefx'/);
    expect(code).not.toMatch(/saved === 'imagefx' \|\| saved === 'flow'/);
    expect(code).toMatch(/dropshot/);
    expect(code).toMatch(/fullAutoImageSource[\s\S]{0,200}globalImageSource/);
  });

  it('does not use ImageFX as a renderer default fallback', () => {
    const code = read('renderer/modules/imageManagementTab.ts');

    expect(code).not.toMatch(/\|\| 'imagefx'/);
  });

  it('does not show the removed ImageFX failure guide card', () => {
    const src = read('renderer/components/HeadingImageSettings.ts');

    expect(src).not.toContain('5가지 경우');
    expect(src).not.toContain('ImageFX 실패 케이스 안내 카드');
  });
});
