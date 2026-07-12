import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

describe('renderer restore integrity wiring', () => {
  const renderer = readSource('renderer/renderer.ts');
  const autosave = readSource('renderer/utils/errorAndAutosave.ts');
  const types = readSource('renderer/types/index.ts');
  const copyStatic = readFileSync(new URL('../../scripts/copy-static.mjs', import.meta.url), 'utf8');

  it('normalizes every editable hashtag boundary', () => {
    expect(renderer).toContain("from './utils/hashtagUtils.js'");
    expect(renderer).toContain('sc.hashtags = normalizeHashtags(semiAutoHashtags.value)');
    expect(renderer).toContain('sc.hashtags = normalizeHashtags(hashtagsInput?.value)');
    expect(renderer).toContain('normalizeHashtags(restoredContent.hashtags).join');
    expect(copyStatic).toContain("'hashtagUtils.js'");
  });

  it('restores backup and autosave content without creating or overwriting a post', () => {
    const backupBlock = renderer.slice(
      renderer.indexOf('function restoreFromBackup'),
      renderer.indexOf('async function askAutosaveRecoveryChoice'),
    );
    const autosaveBlock = renderer.slice(
      renderer.indexOf('async function restoreAutosavedContent'),
      renderer.indexOf('// 통합 진행률 표시 함수'),
    );

    expect(backupBlock).toContain('fillSemiAutoFields(restoredContent, { persist: false })');
    expect(autosaveBlock).toContain('fillSemiAutoFields(restoredContent, { persist: false })');
    expect(backupBlock).toContain('backup.postId');
    expect(autosaveBlock).toContain('saved.postId');
  });

  it('persists canonical post identity in autosave and backup payloads', () => {
    expect(types).toMatch(/interface AutosaveData[\s\S]{0,220}postId\?: string/);
    expect(autosave).toContain('postId: getAutosavePostId(structuredContent)');
  });
});
