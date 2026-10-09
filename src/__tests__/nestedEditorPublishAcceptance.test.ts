import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { insertImagesAtCurrentCursor } from '../automation/imageHelpers.js';
import { isBlogWriteLoginRedirect, resolveBlogWriteFrameSwitchSurface } from '../automation/editorNavigationUrlPolicy.js';
import { isLoginChallengeUrl } from '../automation/loginPageNavigationPolicy.js';
import { EditorFrameProtectionError, findReadyEditorFrame, INITIAL_EDITOR_READINESS_SCRIPT } from '../automation/initialEditorReadiness.js';

// Execute the actual orchestration methods without importing the Electron app.
// Browser/file-upload and publish boundaries stay simulated: no account or post
// can be modified by this acceptance suite.
const source = ts.createSourceFile('automation.ts', readFileSync(resolve('src/naverBlogAutomation.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
function productionMethod(name: string, dependencies: Record<string, unknown>) {
  let selected: ts.MethodDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) selected = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!selected) throw new Error(`Missing production method: ${name}`);
  const compiled = ts.transpileModule(`class Harness { ${selected.getText(source)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}; return Harness.prototype.${name};`)(...Object.values(dependencies));
}

function harness(mode: 'success' | 'no-dom-image' | 'upload-error' | 'partial-upload-error' | 'partial-no-dom-image' = 'success') {
  const events: string[] = [];
  let insertedImages: unknown[] = [];
  const editor = {
    url: () => 'https://blog.naver.com/PostWriteForm.naver',
    evaluate: vi.fn(async (callback: unknown) => callback === INITIAL_EDITOR_READINESS_SCRIPT ? 'ready' : true),
    waitForFunction: vi.fn(async () => undefined),
    $$eval: vi.fn(async (_selector: string, callback: (images: unknown[]) => unknown) => callback(insertedImages)),
  };
  const wrapper = {
    url: () => 'https://blog.naver.com/fixture',
    evaluate: vi.fn(async () => 'pending'),
    $$eval: vi.fn(async () => { throw new Error('Image inspection used wrapper'); }),
  };
  const page = {
    url: () => 'https://blog.naver.com/fixture?Redirect=Write', isClosed: () => false,
    frames: () => [wrapper, editor], keyboard: { press: vi.fn(async () => undefined) },
    goto: vi.fn(async () => { throw new Error('Unexpected navigation'); }),
  };
  const resolved = { publishMode: 'publish', structuredContent: { title: 'Fixture', headings: [] } };
  const guard = { getStatus: () => ({ paused: false }), pause: vi.fn() };
  const dependencies = {
    isBlogWriteLoginRedirect, resolveBlogWriteFrameSwitchSurface, isLoginChallengeUrl,
    findReadyEditorFrame, EditorFrameProtectionError,
    getAccountExecutionGuard: () => guard,
    beginMainProcessEditorCommitCandidate: vi.fn(), bindMainProcessEditorCommitCandidate: vi.fn(),
    browserSessionManager: { ensureServerSession: vi.fn(async () => true), markPublishing: vi.fn() },
    throwPostContentAppliedPublishError: (error: Error) => { throw error; },
    throwPostTailIncompleteError: (error: Error) => { throw error; },
    createImmediatePublishOutcomeUnknownError: (error: Error) => error,
  };
  const state: any = {
    page, browser: { close: vi.fn() }, options: { naverId: 'fixture' }, DELAYS: { MEDIUM: 0 },
    log: vi.fn(), delay: vi.fn(async () => undefined), ensureNotCancelled: vi.fn(),
    ensurePage: () => page, ensureDialogHandler: vi.fn(), resolveRunOptions: () => resolved,
    navigateToBlogWrite: vi.fn(async () => { events.push('enter'); }),
    // 진입 계약만 본다 — 재시작 1회 감싸개는 editorEntryRestart.test.ts 에서 따로 본다.
    enterEditorWithOneRestart: async (entry: (deferPause: boolean) => Promise<void>) => entry(false),
    closeDraftPopup: vi.fn(), assertFreshDraftContext: vi.fn(), closePopups: vi.fn(),
    normalizeSpacingAfterLastImage: vi.fn(async (frame: unknown) => expect(frame).toBe(editor)),
    setImageSizeAndAttachLink: vi.fn(), invalidateEditorStateAfterAmbiguousPublish: vi.fn(),
    publishBlogPost: vi.fn(async () => { events.push('publish'); }),
    verifyImmediatePublishOutcome: vi.fn(async () => { events.push('verify-publish'); }),
  };
  state.pauseEntry = productionMethod('pauseEntry', dependencies);
  state.switchToMainFrame = productionMethod('switchToMainFrame', dependencies);
  state.getAttachedFrame = productionMethod('getAttachedFrame', dependencies);
  state.insertBase64ImageAtCursor = vi.fn(async (path: string) => {
    expect(await state.getAttachedFrame()).toBe(editor);
    events.push('upload');
    if (mode === 'upload-error' || (mode === 'partial-upload-error' && path.endsWith('fixture1'))) {
      throw new Error('Fixture upload rejected');
    }
    if (mode !== 'no-dom-image' && !(mode === 'partial-no-dom-image' && path.endsWith('fixture1'))) {
      insertedImages = [...insertedImages, {}];
    }
  });
  const images = [0, 1, 2].map(index => ({
    filePath: `data:image/png;base64,fixture${index}`, heading: `소제목 ${index + 1}`,
    link: 'https://example.org/image', provider: 'fixture',
  }));
  state.applyStructuredContent = vi.fn(async () => {
    events.push('content');
    expect(await state.getAttachedFrame()).toBe(editor);
    await insertImagesAtCurrentCursor(state, images);
    events.push('images-verified');
  });
  const run = productionMethod('runPostOnlyInternal', dependencies);
  return { state, page, wrapper, editor, events, images, execute: () => run.call(state, {}, true) };
}

describe('nested editor through image insertion to publish acceptance', () => {
  it('uses the selected nested frame for image verification, then publishes only after all image operations resolve', async () => {
    const h = harness();
    await h.execute();
    expect(h.state.mainFrame).toBe(h.editor);
    expect(h.editor.$$eval).toHaveBeenCalled();
    expect(h.wrapper.$$eval).not.toHaveBeenCalled();
    expect(h.page.goto).not.toHaveBeenCalled();
    expect(h.events).toEqual(['enter', 'content', 'upload', 'upload', 'upload', 'images-verified', 'publish', 'verify-publish']);
    expect(h.state.publishBlogPost).toHaveBeenCalledExactlyOnceWith('publish', undefined, undefined, {});
  });

  it.each(['no-dom-image', 'upload-error'] as const)('blocks publishing after all three upload retries fail: %s', async mode => {
    const h = harness(mode);
    await expect(h.execute()).rejects.toThrow('IMAGE_INSERTION_FAILED:3/3');
    expect(h.state.insertBase64ImageAtCursor).toHaveBeenCalledTimes(9);
    expect(h.state.publishBlogPost).not.toHaveBeenCalled();
    expect(h.state.verifyImmediatePublishOutcome).not.toHaveBeenCalled();
    expect(h.state.browser.close).not.toHaveBeenCalled();
    expect(h.events).not.toContain('images-verified');
  });

  it.each(['partial-upload-error', 'partial-no-dom-image'] as const)('blocks a partial failure without re-uploading successful images: %s', async mode => {
    const h = harness(mode);
    await expect(h.execute()).rejects.toThrow('IMAGE_INSERTION_FAILED:1/3');
    const uploadedPaths = h.state.insertBase64ImageAtCursor.mock.calls.map(([path]: [string]) => path);
    expect(uploadedPaths).toEqual([
      h.images[0].filePath,
      h.images[1].filePath, h.images[1].filePath, h.images[1].filePath,
      h.images[2].filePath,
    ]);
    expect(h.state.publishBlogPost).not.toHaveBeenCalled();
    expect(h.state.verifyImmediatePublishOutcome).not.toHaveBeenCalled();
    expect(h.state.browser.close).not.toHaveBeenCalled();
  });

  it('does not invent a missing image when the user selected no images', async () => {
    const h = harness();
    h.state.applyStructuredContent.mockImplementation(async () => {
      await insertImagesAtCurrentCursor(h.state, []);
    });
    await h.execute();
    expect(h.state.insertBase64ImageAtCursor).not.toHaveBeenCalled();
    expect(h.state.publishBlogPost).toHaveBeenCalledOnce();
  });

  it('blocks when one selected image has lost its path while other selected images upload', async () => {
    const h = harness();
    h.state.applyStructuredContent.mockImplementation(async () => {
      await insertImagesAtCurrentCursor(h.state, [h.images[0], { heading: '소제목 2' }, h.images[2]]);
    });
    await expect(h.execute()).rejects.toThrow('IMAGE_INSERTION_FAILED:1/3');
    expect(h.state.insertBase64ImageAtCursor).toHaveBeenCalledTimes(2);
    expect(h.state.publishBlogPost).not.toHaveBeenCalled();
  });

  it('blocks publishing when image payloads have no usable path', async () => {
    const h = harness();
    h.state.applyStructuredContent.mockImplementation(async () => {
      await insertImagesAtCurrentCursor(h.state, [{ heading: '소제목 1' }]);
    });
    await expect(h.execute()).rejects.toThrow('IMAGE_INSERTION_FAILED:1/1');
    expect(h.state.insertBase64ImageAtCursor).not.toHaveBeenCalled();
    expect(h.state.publishBlogPost).not.toHaveBeenCalled();
  });

  it('reacquires the same ready nested frame after a transient execution-context loss before image insertion', async () => {
    const h = harness();
    const originalContent = h.state.applyStructuredContent.getMockImplementation()!;
    h.state.applyStructuredContent.mockImplementation(async () => {
      h.editor.evaluate.mockRejectedValueOnce(new Error('Execution context destroyed'));
      await originalContent();
    });
    await h.execute();
    expect(h.state.mainFrame).toBe(h.editor);
    expect(h.wrapper.$$eval).not.toHaveBeenCalled();
    expect(h.state.insertBase64ImageAtCursor).toHaveBeenCalledTimes(3);
    expect(h.state.publishBlogPost).toHaveBeenCalledOnce();
  });

  it('does not report completion when publishing fails after image insertion and keeps the browser open', async () => {
    const h = harness();
    h.state.publishBlogPost.mockRejectedValue(new Error('Fixture publish failure'));
    await expect(h.execute()).rejects.toThrow('Fixture publish failure');
    expect(h.events).toContain('images-verified');
    expect(h.state.verifyImmediatePublishOutcome).not.toHaveBeenCalled();
    expect(h.state.invalidateEditorStateAfterAmbiguousPublish).toHaveBeenCalledOnce();
    expect(h.state.browser.close).not.toHaveBeenCalled();
    expect(h.state.log.mock.calls.flat().join(' ')).not.toContain('포스팅이 성공적으로 완료');
  });
});
