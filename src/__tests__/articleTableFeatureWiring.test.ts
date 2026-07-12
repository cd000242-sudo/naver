import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

describe('article table feature wiring', () => {
  const renderer = read('src/renderer/renderer.ts');
  const contentGeneration = read('src/renderer/modules/contentGeneration.ts');
  const fullAuto = read('src/renderer/modules/fullAutoFlow.ts');
  const multiAccount = read('src/renderer/modules/multiAccountManager.ts');
  const copyStatic = read('scripts/copy-static.mjs');
  const richPaste = read('src/automation/richTextPaste.ts');
  const editorHelpers = read('src/automation/editorHelpers.ts');
  const prePublishAssertion = read('src/automation/prePublishAssertion.ts');

  it('initializes the shared composer in the renderer bundle', () => {
    expect(renderer).toContain("from './modules/articleTableComposer.js'");
    expect(renderer).toContain('initArticleTableComposer();');
    expect(copyStatic).toContain("'articleTableUtils.js'");
    expect(copyStatic).toContain("'articleTableClipboard.js'");
    expect(copyStatic).toContain("'articleTableComposer.js'");
  });

  it('applies a queued manual table at every content-generation boundary', () => {
    expect(contentGeneration).toContain('applyPendingArticleTablesToGeneratedContent');
    expect(fullAuto).toContain('applyPendingArticleTablesToGeneratedContent');
    expect(multiAccount).toContain('applyPendingArticleTablesToGeneratedContent');
  });

  it('blocks plain-text fallback when a real SmartEditor table was expected', () => {
    expect(richPaste).toContain('expectedTableCount > 0');
    expect(richPaste).toContain('plain-text fallback is blocked');
  });

  it('carries the expected table count into the final pre-publish hard gate', () => {
    expect(editorHelpers).toContain('expectedTableMin: countExpectedArticleTables(');
    expect(prePublishAssertion).toContain("'table-count'");
    expect(prePublishAssertion).toMatch(/BLOCKING_CHECKS[\s\S]*?'table-count'/);
  });
});
