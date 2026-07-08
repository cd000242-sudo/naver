/**
 * editorFrameForensics.ts — read-only frame diagnostics for the "editor-body-not-readable" incident.
 *
 * Live incident (2026-07-08, v2.11.92 diagnostic): all frame reads returned 0 (body/cards/dividers)
 * right after the previous-post tail card, on a freshly re-acquired #mainFrame, while the top page
 * URL stayed on ?Redirect=Write&. The publish then failed with EDITOR_NOT_READY. The existing logs
 * cannot distinguish the three hypotheses:
 *   (a) inner iframe NAVIGATED away (fresh PostWriteForm / previous post / about:blank),
 *   (b) editor DOM was wiped in place (SmartEditor re-render/crash),
 *   (c) reads are hitting the WRONG frame (duplicate/nested mainFrame).
 * This helper captures the inner frame URL, document state, SmartEditor markers, and the page's
 * iframe inventory — strictly read-only (frame/session logic must not be blind-patched).
 */
import type { Frame, Page } from 'puppeteer';

export interface EditorFrameForensics {
  frameUrl: string;
  frameDetached: boolean;
  readyState: string;
  docTitle: string;
  hasComponentsWrap: boolean;
  seComponentCount: number;
  bodyTextLength: number;
  bodyPreview: string;
  iframeInventory: Array<{ id: string; name: string; src: string }>;
  errorPageMarker: boolean;
}

export async function collectEditorFrameForensics(page: Page, frame: Frame | null): Promise<EditorFrameForensics> {
  const result: EditorFrameForensics = {
    frameUrl: '(none)',
    frameDetached: true,
    readyState: '?',
    docTitle: '?',
    hasComponentsWrap: false,
    seComponentCount: -1,
    bodyTextLength: -1,
    bodyPreview: '',
    iframeInventory: [],
    errorPageMarker: false,
  };

  try {
    result.iframeInventory = await page.$$eval('iframe', (els) =>
      els.map((el) => ({
        id: el.id || '',
        name: el.getAttribute('name') || '',
        src: (el.getAttribute('src') || '').slice(0, 120),
      })),
    );
  } catch { /* best-effort */ }

  if (!frame) return result;
  result.frameDetached = frame.detached;
  try {
    result.frameUrl = frame.url();
  } catch { /* best-effort */ }
  if (frame.detached) return result;

  try {
    const inner = await frame.evaluate(() => {
      const body = document.body;
      const text = (body?.innerText || '').replace(/\s+/g, ' ').trim();
      return {
        readyState: document.readyState,
        docTitle: document.title || '',
        hasComponentsWrap: !!document.querySelector('.se-components-wrap, article.se-components-wrap'),
        seComponentCount: document.querySelectorAll('.se-component').length,
        bodyTextLength: text.length,
        bodyPreview: text.slice(0, 120),
        errorPageMarker: /문제가 발생|오류가 발생|페이지를 찾을 수 없|잠시 후 다시/.test(text.slice(0, 400)),
      };
    });
    Object.assign(result, inner);
  } catch (e) {
    result.docTitle = `(evaluate 실패: ${(e as Error).message.slice(0, 80)})`;
  }

  return result;
}

export function formatEditorFrameForensics(f: EditorFrameForensics): string {
  const frames = f.iframeInventory.map((i) => `${i.id || i.name || '?'}(${i.src ? 'src' : 'nosrc'})`).join(',');
  return `[FrameForensics] url=${f.frameUrl} detached=${f.frameDetached} ready=${f.readyState} ` +
    `title="${f.docTitle.slice(0, 40)}" wrap=${f.hasComponentsWrap} comps=${f.seComponentCount} ` +
    `bodyLen=${f.bodyTextLength} err=${f.errorPageMarker} iframes=[${frames}] preview="${f.bodyPreview.slice(0, 80)}"`;
}
