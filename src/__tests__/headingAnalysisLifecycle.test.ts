// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync('src/renderer/modules/headingImageGen.ts', 'utf8');
const code = ts.transpileModule(source.slice(
  source.indexOf('// 소제목 자동 분석 함수 (반자동 모드용)'),
  source.indexOf('export function updateReserveImagesThumbnails'),
).replace(/^export /gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

describe('image heading analysis lifecycle', () => {
  let analyze: (sc: any, options?: any) => Promise<void>;
  let ai: ReturnType<typeof vi.fn>;
  let restoreImages: ReturnType<typeof vi.fn>;
  const image = { heading: '신청 방법', filePath: '/existing-image.png' };
  const article = (title = '신청 방법') => ({ bodyPlain: `## ${title}\n안내 본문`, headings: [{ title, content: '안내 본문', imageKey: 'saved-image' }] });
  const titles = () => Array.from(document.querySelectorAll('.heading-title-pure'), (el) => el.textContent);

  beforeEach(() => {
    document.body.innerHTML = '<div><div id="prompts-container"></div><div id="prompts-placeholder"></div></div>';
    (window as any).currentStructuredContent = null;
    (window as any).__semiAutoPasteRevision = 0;
    ai = vi.fn().mockResolvedValue('AI prompt');
    restoreImages = vi.fn();
    const dependencies = {
      appendLog: vi.fn(),
      generateEnglishPromptForHeading: ai,
      generateEnglishPromptForHeadingSync: (title: string) => `local ${title}`,
      getManualEnglishPromptOverrideForHeading: () => '',
      ImageManager: { getAllImages: () => [image] },
      generatedImages: [],
      updateUnifiedImagePreview: vi.fn(),
      displayGeneratedImages: vi.fn(),
      updatePromptItemsWithImages: restoreImages,
      escapeHtml: (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    };
    analyze = new Function(...Object.keys(dependencies), `${code}\nreturn autoAnalyzeHeadings;`)(...Object.values(dependencies));
  });

  it('shows manually entered headings without requesting AI and preserves saved images', async () => {
    const sc = article();
    await analyze(sc, { localOnly: true });
    expect(ai).not.toHaveBeenCalled();
    expect(titles()).toEqual(['신청 방법']);
    expect(restoreImages).toHaveBeenCalledWith([image]);
    expect(sc.headings[0].imageKey).toBe('saved-image');
  });

  it('renders headings before a slow AI response completes', async () => {
    let complete!: (value: string) => void;
    ai.mockReturnValue(new Promise<string>((resolve) => { complete = resolve; }));
    const pending = analyze(article());
    expect(titles()).toEqual(['신청 방법']);
    complete('generated prompt');
    await pending;
    expect(document.querySelector('.prompt-text')?.textContent).toBe('generated prompt');
  });

  it('discards an older response when a newer article is analyzed', async () => {
    let complete!: (value: string) => void;
    ai.mockReturnValueOnce(new Promise<string>((resolve) => { complete = resolve; }));
    const old = article();
    const pending = analyze(old);
    await analyze(article('변경한 소제목'), { localOnly: true });
    complete('stale prompt');
    await pending;
    expect(titles()).toEqual(['변경한 소제목']);
    expect((old.headings[0] as any).prompt).not.toBe('stale prompt');
  });

  it('does not write back while the current article is being edited', async () => {
    let complete!: (value: string) => void;
    ai.mockReturnValueOnce(new Promise<string>((resolve) => { complete = resolve; }));
    const sc = article();
    (window as any).currentStructuredContent = sc;
    const pending = analyze(sc);
    sc.bodyPlain = '수정한 본문';
    complete('stale prompt');
    await pending;
    expect((sc.headings[0] as any).prompt).not.toBe('stale prompt');
  });

  it('clears cards and their backing titles after deleting all headings', async () => {
    await analyze(article(), { localOnly: true });
    await analyze({ headings: [] }, { localOnly: true });
    expect(titles()).toEqual([]);
    expect((window as any)._headingTitles).toEqual([]);
    expect((window as any)._headingPrompts).toEqual([]);
    expect(document.getElementById('prompts-placeholder')?.style.display).toBe('block');
  });
});
