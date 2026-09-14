// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as extractor from '../renderer/utils/semiAutoHeadingExtractor';
import { initHeadingControlPanel, applyEditedHeadingsToPreview, renderHeadingList } from '../renderer/modules/headingControlPanel';

// Execute the actual renderer listeners with their external services injected.
// Importing renderer.ts itself starts Electron/application-wide initialization.
const renderer = readFileSync('src/renderer/renderer.ts', 'utf8');
const start = renderer.indexOf('  // ✅ [Fix] 반자동 편집 필드 변경');
const end = renderer.indexOf('  // ✅ 카테고리 선택 모달 초기화', start);
const listenerCode = ts.transpileModule(renderer.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const body = '## 신청 방법\n신청에 필요한 서류와 방문 절차를 안내합니다.\n\n## 이용 기준\n이용 가능한 날짜와 조건을 확인합니다.';

describe('manual editor heading synchronization', () => {
  let textarea: HTMLTextAreaElement;
  let analyze: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input id="unified-generated-title" value="생활 안내"><textarea id="unified-generated-content"></textarea><input id="unified-generated-hashtags">';
    textarea = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
    (window as any).currentStructuredContent = null;
    (window as any).__semiAutoPasteRevision = 0;
    (window as any).__imageManagerHeadings = [];
    (window as any).api = {};
    analyze = vi.fn().mockResolvedValue(undefined);
    const dependencies = {
      ...extractor,
      autoAnalyzeHeadings: analyze,
      syncIntegratedPreviewFromInputs: vi.fn(),
      normalizeHashtags: (value: string) => value,
    };
    new Function(...Object.keys(dependencies), listenerCode)(...Object.values(dependencies));
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function setupHeadingPanel() {
    document.body.insertAdjacentHTML('beforeend', '<div id="heading-control-panel"><div id="heading-list"></div><span id="heading-lock-badge"></span><button id="heading-apply-to-preview"></button></div>');
    vi.stubGlobal('updateUnifiedPreview', vi.fn());
    vi.stubGlobal('updateUnifiedImagePreview', vi.fn());
    vi.stubGlobal('syncIntegratedPreviewFromInputs', vi.fn());
    (window as any).toastManager = { success: vi.fn(), warning: vi.fn() };
    initHeadingControlPanel();
  }

  const fourSections = ['첫 번째 제목', '두 번째 제목', '세 번째 제목', '네 번째 제목']
    .map(title => `## ${title}\n\n자세한 본문 내용을 설명합니다.`).join('\n\n');

  it('keeps a released heading as prose through input, apply, analysis and publish', async () => {
    setupHeadingPanel();
    await input(fourSections);
    const unmark = document.querySelectorAll<HTMLButtonElement>('[data-heading-unmark]');
    expect(unmark.length).toBe(4);
    unmark[3].click();
    expect(document.querySelectorAll('[data-heading-unmark]').length).toBe(3);
    expect(applyEditedHeadingsToPreview()).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    const state = (window as any).currentStructuredContent;
    expect(state.headings.map((h: any) => h.title)).toEqual(['첫 번째 제목', '두 번째 제목', '세 번째 제목']);
    expect(state.headings[2].content).toContain('네 번째 제목');
    expect((window as any).toastManager.success).toHaveBeenLastCalledWith('✅ 소제목 3개를 적용했습니다.');
    expect((globalThis as any).updateUnifiedPreview).toHaveBeenCalledWith(state);
    const published = extractor.resolveSemiAutoPublishStructure(textarea.value, state.headings, { bodyMarkupIsAuthoritative: true, imageHeadingTitles: ['네 번째 제목'] });
    expect(published.headings).toHaveLength(3);
  });

  it('allows releasing every heading without restoring old heading/image anchors', async () => {
    setupHeadingPanel();
    await input(fourSections);
    while (document.querySelector('[data-heading-unmark]')) {
      (document.querySelector('[data-heading-unmark]') as HTMLButtonElement).click();
    }
    expect(applyEditedHeadingsToPreview()).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect((window as any).currentStructuredContent.headings).toEqual([]);
    const result = extractor.resolveSemiAutoPublishStructure(textarea.value, [{ title: '첫 번째 제목', content: '옛 본문' }], { bodyMarkupIsAuthoritative: true, imageHeadingTitles: ['네 번째 제목'] });
    expect(result).toMatchObject({ headings: [], introduction: textarea.value, strategy: 'plain-body' });
  });

  it('clears the panel and lock badge when the editor is reset', async () => {
    setupHeadingPanel();
    await input(fourSections);
    (document.querySelector('[data-heading-unmark]') as HTMLButtonElement).click();
    expect(document.getElementById('heading-lock-badge')!.style.display).toBe('inline');
    (window as any).currentStructuredContent = null;
    textarea.value = '';
    renderHeadingList();
    expect(document.querySelectorAll('[data-heading-unmark]')).toHaveLength(0);
    expect(document.getElementById('heading-lock-badge')!.style.display).toBe('none');
  });

  async function input(value: string) {
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
  }

  it('analyzes a manually entered article without a paste event', async () => {
    await input(body);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].headings.map((h: any) => h.title)).toEqual(['신청 방법', '이용 기준']);
  });

  it('refreshes section text and analyzes even when loaded heading titles are unchanged', async () => {
    (window as any).currentStructuredContent = {
      headings: [{ title: '신청 방법', content: '이전 내용', prompt: 'saved prompt', imageKey: 'keep-image' }, { title: '이용 기준', content: '이전 내용' }],
    };
    await input(body);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect((window as any).currentStructuredContent.headings[0]).toMatchObject({ content: '신청에 필요한 서류와 방문 절차를 안내합니다.', imageKey: 'keep-image', prompt: 'saved prompt' });
  });

  it('clears stale image cards after the entire article is deleted', async () => {
    await input(body);
    analyze.mockClear();
    await input('');
    expect((window as any).currentStructuredContent.headings).toEqual([]);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].headings).toEqual([]);
  });

  it('synchronizes added, renamed and removed headings', async () => {
    await input(body);
    await input(body.replace('신청 방법', '신청 절차') + '\n\n## 준비 서류\n필수 서류를 준비합니다.');
    expect((window as any).currentStructuredContent.headings.map((h: any) => h.title)).toEqual(['신청 절차', '이용 기준', '준비 서류']);
    await input('## 준비 서류\n필수 서류를 준비합니다.');
    expect(analyze.mock.calls.at(-1)?.[0].headings.map((h: any) => h.title)).toEqual(['준비 서류']);
  });

  it('analyzes recovered sentence-style headings with their current text', async () => {
    const title = '신청 일정은 공식 안내에서 확인할 수 있습니다.';
    (window as any).currentStructuredContent = { _manualPasted: true, headings: [{ title, content: '이전 내용' }] };
    await input(`${title}\n새로운 신청 날짜를 확인합니다.`);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].headings[0].content).toBe('새로운 신청 날짜를 확인합니다.');
  });

  it('preserves generated section/image slots when editing body text that has no heading lines', async () => {
    const headings = [
      { title: '신청 방법', content: '원래 신청 순서와 서류 안내입니다.', imageKey: 'first-image' },
      { title: '이용 기준', content: '이용 가능한 날짜와 조건입니다.', imageKey: 'second-image' },
    ];
    (window as any).currentStructuredContent = { _preferBodyPlain: true, headings };
    await input('수정한 신청 순서와 서류 안내입니다.\n\n이용 가능한 날짜와 조건입니다.');
    expect((window as any).currentStructuredContent.headings).toEqual(headings);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('analyzes pasted marker content after title and body distribution', async () => {
    textarea.dispatchEvent(new Event('paste'));
    textarea.value = `[제목]\n생활 지원 안내\n[본문]\n${body}\n[해시태그]\n#생활 #지원 #안내`;
    textarea.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(500);
    expect(textarea.value).toBe(body);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].selectedTitle).toBe('생활 지원 안내');
  });
});
