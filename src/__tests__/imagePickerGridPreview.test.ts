// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachImagePickerPreview } from '../renderer/modules/imagePickerPreview.js';
import { escapeHtml } from '../renderer/utils/htmlUtils.js';

function loadFunction(file: string, name: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const statement = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  const javascript = ts.transpileModule(statement.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${javascript}; return ${name};`)(...Object.values(dependencies));
}
const folder = 'src/renderer/modules/headingImageGen.ts';
const renderer = 'src/renderer/renderer.ts';
const preview = () => document.querySelector<HTMLButtonElement>('.image-picker-preview-button')!;
const closePreview = () => document.querySelector<HTMLButtonElement>('[data-preview-action="close"]')?.click();
const selectPreview = () => document.querySelector<HTMLButtonElement>('[data-preview-action="select"]')!.click();
let added: ReturnType<typeof vi.fn>;
let deps: Record<string, any>;
beforeEach(() => {
  added = vi.fn();
  deps = {
    attachImagePickerPreview, escapeHtml,
    toFileUrlMaybe: (value: string) => value.startsWith('file:') ? value : `file:///${value}`,
    addImagesToHeadingGrid: added,
    appendLog: vi.fn(), toastManager: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    requestAnimationFrame: (callback: FrameRequestCallback) => callback(0),
  };
});
afterEach(() => { closePreview(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('large preview in actual image picker grids', () => {
  it('preserves replacement on grid click while preview opens without replacing', async () => {
    const imageMap = new Map();
    const original = { filePath: 'old.png' };
    imageMap.set('제목', [original]);
    Object.assign(deps, {
      getRequiredImageBasePath: async () => 'C:/images',
      ImageManager: {
        imageMap, unsetHeadings: new Set(), resolveHeadingKey: (title: string) => title,
        syncGeneratedImagesArray: vi.fn(), syncAllPreviews: vi.fn(), getAllImages: () => [...imageMap.values()].flat(),
      },
      syncGlobalImagesFromImageManager: vi.fn(), displayGeneratedImages: vi.fn(), updatePromptItemsWithImages: vi.fn(),
    });
    (window as any).api = { getUserHomeDir: vi.fn(), checkFileExists: async () => true, readDir: async () => ['one.png', 'two.png'] };
    await loadFunction(renderer, 'showLocalImagePickerForReplace', deps)('글 폴더', { title: '제목', isThumbnail: false });
    expect(document.querySelectorAll('.image-picker-preview-button')).toHaveLength(2);
    preview().click();
    expect(imageMap.get('제목')).toEqual([original]);
    closePreview();
    expect(imageMap.get('제목')).toEqual([original]);
    preview().click();
    selectPreview();
    expect(imageMap.get('제목')[0].filePath).toBe('C:/images/글 폴더/one.png');
    expect(document.querySelector('.replace-image-pick')).toBeNull();
  });
  it('does not toggle existing folder selections when opening or closing a preview', () => {
    loadFunction(folder, 'showImageSelectionForHeading', deps)(0, '본문', [
      { filePath: 'C:/one.png', previewDataUrl: 'file:///C:/one.png' },
      { filePath: 'C:/two.png', previewDataUrl: 'file:///C:/two.png' },
    ], '폴더');
    document.querySelector<HTMLElement>('.img-item')!.click();
    expect(document.querySelector('#selected-count')?.textContent).toBe('1개 선택됨');
    preview().click();
    expect(document.querySelector<HTMLButtonElement>('[data-preview-action="select"]')!.disabled).toBe(true);
    closePreview();
    expect(document.querySelector('#selected-count')?.textContent).toBe('1개 선택됨');
    expect(added).not.toHaveBeenCalled();
    const buttons = document.querySelectorAll<HTMLButtonElement>('.image-picker-preview-button');
    buttons[1].click();
    selectPreview();
    expect(document.querySelector('#selected-count')?.textContent).toBe('2개 선택됨');
    expect(added).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('#confirm-img-modal')!.click();
    expect(added).toHaveBeenCalledExactlyOnceWith(0, '본문', ['C:/one.png', 'C:/two.png']);
  });
  it('adds preview actions to later batches and commits only the explicitly selected images', () => {
    const paths = Array.from({ length: 40 }, (_, i) => `C:/images/${i}.png`);
    loadFunction(folder, 'showMultipleImageSelectionModal', deps)(2, '<본문>', paths);
    const buttons = document.querySelectorAll<HTMLButtonElement>('.image-picker-preview-button');
    expect(buttons).toHaveLength(40);
    buttons[39].click();
    expect(added).not.toHaveBeenCalled();
    expect(document.querySelector('#selected-count')?.textContent).toBe('0개 선택됨');
    selectPreview();
    expect(document.querySelector('#selected-count')?.textContent).toBe('1개 선택됨');
    expect(added).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('#confirm-multi-img')!.click();
    expect(added).toHaveBeenCalledExactlyOnceWith(2, '<본문>', [paths[39]]);
  });
});
