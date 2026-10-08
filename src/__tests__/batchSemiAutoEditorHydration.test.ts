// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Run the actual nested queue executor with its IO boundaries isolated. The
// renderer is a bundled closure, so loading the complete module would boot UI.
const source = readFileSync(resolve(__dirname, '../renderer/renderer.ts'), 'utf8');
const ast = ts.createSourceFile('renderer.ts', source, ts.ScriptTarget.Latest, true);
let executor = '';
const visit = (node: ts.Node) => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'executeBatchPublish') executor = node.getText(ast);
  ts.forEachChild(node, visit);
};
visit(ast);
const javascript = ts.transpileModule(executor, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

describe('queued semi-auto content hydration', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it.each(['', '이전에 편집하던 원고'])('loads the queued article before dispatch when the editor contains %s', async previous => {
    document.body.innerHTML = '<input id="unified-generated-title"><textarea id="unified-generated-content"></textarea><input id="unified-publish-mode">';
    const title = document.getElementById('unified-generated-title') as HTMLInputElement;
    const body = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
    title.value = previous;
    body.value = previous;
    const structuredContent = { selectedTitle: '대기열 제목', bodyPlain: '대기열 원고 본문' };
    const fill = vi.fn((content: typeof structuredContent) => { title.value = content.selectedTitle; body.value = content.bodyPlain; });
    const dispatch = vi.fn(async () => ({ success: title.value === structuredContent.selectedTitle && body.value === structuredContent.bodyPlain }));
    const scope: Record<string, unknown> = {
      window: { api: { getAllBlogAccounts: async () => ({ success: true, accounts: [] }), getAccountCredentials: async () => ({ success: true, credentials: {} }) } },
      document, confirm: () => true, console,
      publishQueue: [{ id: 'fixture', accountId: 'isolated', accountName: '테스트', structuredContent, generatedImages: [], formData: {}, publishMode: 'draft' }],
      generatedImages: [], appendLog: vi.fn(), toastManager: { warning: vi.fn(), success: vi.fn() },
      showStopButton: vi.fn(), hideStopButton: vi.fn(), updateQueueUI: vi.fn(),
      hydrateImageManagerFromImages: vi.fn(), syncGlobalImagesFromImageManager: vi.fn(),
      fillSemiAutoFields: fill, handleSemiAutoPublish: dispatch,
    };
    const run = new Function(...Object.keys(scope), `${javascript}; return executeBatchPublish();`);
    await run(...Object.values(scope));
    expect(fill).toHaveBeenCalledWith(structuredContent, { persist: false, scroll: false });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(await dispatch.mock.results[0].value).toEqual({ success: true });
    expect((document.getElementById('unified-publish-mode') as HTMLInputElement).value).toBe('draft');
  });
});
