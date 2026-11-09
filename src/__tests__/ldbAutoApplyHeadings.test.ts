// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEditedHeadingsToPreview, initHeadingControlPanel } from '../renderer/modules/headingControlPanel';
import { autoApplyLdbDraftHeadings } from '../renderer/modules/ldbHandoffPresentation';

// 2026-11-10: after "자동화앱에 가져가기" the user always had to press "✅ 적용" by hand.
// The receiver now presses the same handler itself, but only for a draft that has a body,
// and a failed auto-apply must never turn a stored, displayed draft into a failed handoff.

const body = [
  '이 글은 신청 방법과 이용 기준을 차례로 안내하는 도입부 문단입니다.',
  '',
  '신청 방법',
  '신청에 필요한 서류와 방문 절차를 안내합니다.',
  '',
  '이용 기준',
  '이용 가능한 날짜와 조건을 확인합니다.',
].join('\n');

function receiveLdbDraft(text: string) {
  document.body.innerHTML = `<input id="unified-generated-title" value="생활 안내"><textarea id="unified-generated-content"></textarea>
    <div id="heading-control-panel"><div id="heading-list"></div><span id="heading-lock-badge"></span><button id="heading-apply-to-preview"></button></div>`;
  (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value = text;
  (window as any).currentStructuredContent = {
    _source: 'ldb-bridge', _postId: 'ldb_1', _preferBodyPlain: true, selectedTitle: '생활 안내', bodyPlain: text, content: text,
    thumbnailPrompt: 'thumbnail english prompt',
    headings: [
      { title: '신청 방법', content: '신청에 필요한 서류와 방문 절차를 안내합니다.', prompt: 'application guide, documents on a desk' },
      { title: '이용 기준', content: '이용 가능한 날짜와 조건을 확인합니다.', prompt: 'calendar and eligibility checklist' },
    ],
  };
}

describe('LDB draft auto-apply', () => {
  let analyze: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    analyze = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('autoAnalyzeHeadings', analyze);
    vi.stubGlobal('updateUnifiedPreview', vi.fn());
    vi.stubGlobal('updateUnifiedImagePreview', vi.fn());
    vi.stubGlobal('syncIntegratedPreviewFromInputs', vi.fn());
    (window as any).toastManager = { success: vi.fn(), warning: vi.fn() };
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('presses the existing 적용 handler for a received draft and keeps the extension image prompts', () => {
    receiveLdbDraft(body);
    initHeadingControlPanel();
    const log = vi.fn();
    expect(autoApplyLdbDraftHeadings(() => applyEditedHeadingsToPreview({ silent: true }), log)).toBe(true);
    const state = (window as any).currentStructuredContent;
    expect(state.headingsLockedByUser).toBe(true);
    expect(state.headings.map((heading: any) => heading.title)).toEqual(['신청 방법', '이용 기준']);
    // The 적용 handler rebuilds headings from the body; the prompts the extension sent must survive it.
    expect(state.headings.map((heading: any) => heading.prompt))
      .toEqual(['application guide, documents on a desk', 'calendar and eligibility checklist']);
    expect(state.thumbnailPrompt).toBe('thumbnail english prompt');
    expect(analyze).toHaveBeenCalledWith(state, { localOnly: true });
    // Automatic apply stays quiet — no toast and no scrolling preview refresh.
    expect((window as any).toastManager.success).not.toHaveBeenCalled();
    expect((globalThis as any).updateUnifiedPreview).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('자동'));
  });

  it('does not apply an empty draft and leaves the existing guidance to the apply handler', () => {
    receiveLdbDraft('   ');
    const before = JSON.stringify((window as any).currentStructuredContent);
    const log = vi.fn();
    expect(autoApplyLdbDraftHeadings(() => applyEditedHeadingsToPreview({ silent: true }), log)).toBe(false);
    expect(JSON.stringify((window as any).currentStructuredContent)).toBe(before);
    expect(analyze).not.toHaveBeenCalled();
    expect((window as any).toastManager.warning).toHaveBeenCalledWith('적용할 본문이 없습니다.');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('✅ 적용'));
  });

  it('never rejects the handoff when the apply handler throws', () => {
    const log = vi.fn();
    expect(autoApplyLdbDraftHeadings(() => { throw new Error('boom'); }, log)).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('✅ 적용'));
  });
});

describe('LDB receiver wiring (renderer bundle scope)', () => {
  const renderer = readFileSync('src/renderer/renderer.ts', 'utf8');
  const display = renderer.slice(renderer.indexOf('display: async (post) =>'), renderer.indexOf('// [2026-10-21] 확장이 autoSave'));

  it('calls the imported apply handler directly, never through window', () => {
    expect(display).toMatch(/autoApplyLdbDraftHeadings\(\s*\(\)\s*=>\s*applyEditedHeadingsToPreview\(\{\s*silent:\s*true\s*\}\)/);
    expect(renderer).toMatch(/import\s*\{[^}]*\bapplyEditedHeadingsToPreview\b[^}]*\}\s*from\s*'\.\/modules\/headingControlPanel\.js'/);
    expect(display).not.toMatch(/\(window as any\)\.applyEditedHeadingsToPreview/);
  });

  it('applies before the image preview is drawn and before the screen is revealed', () => {
    const apply = display.indexOf('autoApplyLdbDraftHeadings(');
    expect(apply).toBeGreaterThan(display.indexOf('await autoAnalyzeHeadings('));
    expect(apply).toBeLessThan(display.indexOf('updateUnifiedImagePreview('));
    expect(apply).toBeLessThan(display.indexOf('revealLdbDraft(post, document)'));
  });
});
