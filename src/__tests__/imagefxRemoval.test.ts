import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

function readRoot(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}

describe('image engine selection surface', () => {
  it('keeps ImageFX and the retired engines hidden while keeping Flow in the main dropdown', () => {
    const html = readRoot('public/index.html');

    expect(html).not.toMatch(/<option value="imagefx"/);
    expect(html).toMatch(/<option value="flow"/);
    expect(html).not.toMatch(/<option value="(prodia|deepinfra|leonardoai)"/);
    // [2026-11-07] 기본 선택값 = Codex 구독 이미지(codex-image) (이전: 덕트테이프)
    expect(html).toMatch(/<option value="codex-image"[^>]*selected/);
    expect(html).not.toMatch(/<option value="dropshot"[^>]*selected/);
  });

  it('keeps ImageFX and the retired engines hidden while keeping Flow in heading image settings', () => {
    const code = read('renderer/components/HeadingImageSettings.ts');

    expect(code).not.toMatch(/<option value="imagefx"/);
    expect(code).not.toMatch(/data-value="imagefx"/);
    expect(code).toMatch(/<option value="flow"/);
    expect(code).toMatch(/data-value="flow"/);
    expect(code).not.toMatch(/<option value="(prodia|deepinfra|leonardoai)"/);
    expect(code).not.toMatch(/data-value="(prodia|deepinfra|leonardoai)"/);
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
