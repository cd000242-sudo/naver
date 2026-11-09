// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEditedHeadingsToPreview, initHeadingControlPanel } from '../renderer/modules/headingControlPanel';

// 2026-11-10 (image management tab vs heading analysis mismatch).
// autoAnalyzeHeadings draws the "🖼️ 썸네일" card only when content.introduction is non-empty.
// The typing path (_scheduleSemiAutoHeadingAnalysis) falls back to the post title for that, but the
// 적용 handler wrote document_.introduction as-is: a body that starts directly with a heading line
// has an empty introduction, so pressing 적용 (or any heading-panel edit) redrew the image tab
// without its thumbnail slot while the heading panel and preview still showed the whole article.

const startsWithHeading = [
  '## 신청 방법',
  '신청에 필요한 서류와 방문 절차를 안내합니다.',
  '',
  '## 이용 기준',
  '이용 가능한 날짜와 조건을 확인합니다.',
].join('\n');

describe('적용 keeps the thumbnail slot of the image management tab', () => {
  let analyze: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    analyze = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('autoAnalyzeHeadings', analyze);
    vi.stubGlobal('updateUnifiedPreview', vi.fn());
    vi.stubGlobal('updateUnifiedImagePreview', vi.fn());
    vi.stubGlobal('syncIntegratedPreviewFromInputs', vi.fn());
    (window as any).toastManager = { success: vi.fn(), warning: vi.fn() };
    document.body.innerHTML = `<input id="unified-generated-title" value="생활 안내"><textarea id="unified-generated-content"></textarea>
      <div id="heading-control-panel"><div id="heading-list"></div><span id="heading-lock-badge"></span><button id="heading-apply-to-preview"></button></div>`;
    initHeadingControlPanel();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  function apply(text: string, content: Record<string, unknown>) {
    (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value = text;
    (window as any).currentStructuredContent = { selectedTitle: '생활 안내', ...content };
    expect(applyEditedHeadingsToPreview({ silent: true })).toBe(true);
    return (window as any).currentStructuredContent;
  }

  it('falls back to the post title as the thumbnail section text when the body starts with a heading', () => {
    const state = apply(startsWithHeading, { bodyPlain: startsWithHeading, headings: [] });
    expect(state.headings.map((heading: any) => heading.title)).toEqual(['신청 방법', '이용 기준']);
    expect(state.introduction).toBe('생활 안내');
    // autoAnalyzeHeadings reads introduction from this very object to decide on the thumbnail card.
    expect(analyze.mock.calls.at(-1)?.[0].introduction).toBe('생활 안내');
  });

  it('keeps a real introduction paragraph untouched', () => {
    const text = `도입부 문단은 이 글이 무엇을 안내하는지 먼저 알려 줍니다.\n\n${startsWithHeading}`;
    const state = apply(text, { bodyPlain: text, headings: [] });
    expect(state.introduction).toBe('도입부 문단은 이 글이 무엇을 안내하는지 먼저 알려 줍니다.');
  });

  it('does not invent an introduction when every heading was released (plain body)', () => {
    const text = '소제목 없이 한 덩어리로 쓴 본문입니다.';
    const state = apply(text, { bodyPlain: text, headings: [], headingsLockedByUser: true });
    expect(state.headings).toEqual([]);
    expect(state.introduction).toBe(text);
  });
});
