import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

describe('publish image sequence wiring', () => {
  it('normalizes every renderer publishing boundary', () => {
    const imageSync = read('renderer/modules/imageSyncService.ts');
    const handlers = read('renderer/modules/publishingHandlers.ts');
    const multiAccount = read('renderer/modules/multiAccountManager.ts');

    expect(imageSync).toMatch(/normalizePublishImageSequence\(\s*structuredContent/);
    expect(handlers.match(/normalizePublishImageSequence\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(multiAccount).toContain('normalizePublishImageSequence(structuredContent, generatedImages)');
  });

  it('normalizes again at the main-process boundary as defense in depth', () => {
    const executor = read('main/services/BlogExecutor.ts');

    expect(executor).toContain('resolvePublishImageSourceLocation(img)');
    expect(executor).toMatch(
      /normalizePublishImageSequence\(\s*payload\.structuredContent,\s*sourceImages,\s*\{ thumbnailPath: payload\.thumbnailPath \}/,
    );
  });

  it('keeps the body offset stable when a dedicated thumbnail exists but upload fails', () => {
    const editor = read('automation/editorHelpers.ts');

    expect(editor).toContain('hasDedicatedThumbnailSlot');
    expect(editor).toMatch(/hasDedicatedThumbnailSlot\s*\|\|\s*thumbnailInsertedInIntro/);
  });
});
