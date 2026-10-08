import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = ts.createSourceFile('editorHelpers.ts', readFileSync(resolve('src/automation/editorHelpers.ts'), 'utf8'), ts.ScriptTarget.Latest, true);

// Execute the real catch branch with controlled dependencies. Loading the whole
// structured writer would also invoke typing, image generation and publishing.
function recovery(name: string) {
  let clause: ts.CatchClause | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isCatchClause(node) && node.variableDeclaration?.name.getText(source) === name) clause = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!clause) throw new Error(`Missing recovery branch ${name}`);
  const dependencies = {
    self: { log: vi.fn(), insertImagesAtCurrentCursor: vi.fn(async () => undefined) },
    introImages: [{ filePath: '/fixture/one.png' }, { filePath: '/fixture/two.png' }],
    page: {}, frame: {}, resolved: { affiliateLink: undefined }, recordSilentFailure: vi.fn(),
  };
  const compiled = ts.transpileModule(`async function recover(${name}: unknown) ${clause.block.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const execute = new Function(...Object.keys(dependencies), `${compiled}; return recover;`)(...Object.values(dependencies));
  return { ...dependencies, execute };
}

describe('image insertion failure recovery boundaries', () => {
  it('does not upload the whole intro again when remaining images failed after the thumbnail was inserted', async () => {
    const h = recovery('overlayError');
    const error = new Error('IMAGE_INSERTION_FAILED:1/2개 이미지 삽입 실패');
    await expect(h.execute(error)).rejects.toBe(error);
    expect(h.self.insertImagesAtCurrentCursor).not.toHaveBeenCalled();
  });

  it('preserves original-image fallback when overlay generation itself fails', async () => {
    const h = recovery('overlayError');
    await h.execute(new Error('Overlay renderer unavailable'));
    expect(h.self.insertImagesAtCurrentCursor).toHaveBeenCalledExactlyOnceWith(h.introImages, h.page, h.frame, undefined);
  });

  it('propagates a failed thumbnail upload even when the post has no introduction', async () => {
    const h = recovery('safetyNetError');
    const error = new Error('IMAGE_INSERTION_FAILED:1/1개 이미지 삽입 실패');
    await expect(h.execute(error)).rejects.toBe(error);
    expect(h.recordSilentFailure).not.toHaveBeenCalled();
  });

  it('keeps non-upload spacing errors after the thumbnail as warnings', async () => {
    const h = recovery('safetyNetError');
    await expect(h.execute(new Error('Post-thumbnail keyboard spacing failed'))).resolves.toBeUndefined();
    expect(h.recordSilentFailure).toHaveBeenCalledWith('editor:safety-net-thumbnail');
  });
});
