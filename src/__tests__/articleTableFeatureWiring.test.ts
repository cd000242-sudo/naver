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

  // [v2.11.140b] 정책 반전(사용자 지시: 어떤 상황이든 발행 완주): 표 플래튼은 더 이상
  // 발행 차단 사유가 아니다 — 텍스트 fallback으로 내용을 완주시키고 표 서식은 라이브
  // 큐레이션 대상으로 넘긴다. 문서 전체 표 개수는 PrePublish table-count 게이트가 관찰.
  it('table flatten does NOT block publishing — plain-text fallback completes the post', () => {
    expect(richPaste).toContain('expectedTableCount > 0');
    expect(richPaste).toContain('텍스트 fallback으로 완주');
    expect(richPaste).not.toContain('plain-text fallback is blocked');
  });

  it('carries the expected table count into the final pre-publish hard gate', () => {
    expect(editorHelpers).toContain('expectedTableMin: countExpectedArticleTables(');
    expect(prePublishAssertion).toContain("'table-count'");
    expect(prePublishAssertion).toMatch(/BLOCKING_CHECKS[\s\S]*?'table-count'/);
  });
});
