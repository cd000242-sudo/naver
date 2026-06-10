import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * The legacy 'thumbnailOnly' checkbox key is scoped to single full-auto runs
 * (it travels via formData/options). Reading it from localStorage in shared
 * flows let a stale 'true' force thumbnail-only publishes in continuous and
 * multi-account modes the user never configured ("세팅 안 했는데 썸네일만").
 */
describe('thumbnailOnly legacy-key scope', () => {
  const sharedFlowFiles = [
    'renderer/modules/multiAccountManager.ts',
    'renderer/modules/continuousPublishing.ts',
    'renderer/modules/costAndAutoGen.ts',
    'renderer/modules/fullAutoFlow.ts',
  ];

  it('never reads the legacy thumbnailOnly key from localStorage in shared flows', () => {
    for (const rel of sharedFlowFiles) {
      const code = read(rel);
      expect(code, rel).not.toContain("localStorage.getItem('thumbnailOnly')");
    }
  });

  it('clears the legacy key whenever a non-thumbnail heading image mode is saved', () => {
    const code = read('renderer/components/HeadingImageSettings.ts');
    expect(code).toMatch(/safeLocalStorageSet\('thumbnailOnly',\s*'false'\)/);
  });
});
