/**
 * One readiness decision for the Naver write editor.
 *
 * A post enters the editor once: open GoBlogWrite, then wait here until the editor is really usable. The old flow
 * instead re-navigated or reloaded whenever a step could not find something (up to 12 editor loads per post),
 * which is what a person never does. This check only reads the already-loaded page — it makes no request.
 */
import type { Frame, Page } from 'puppeteer';
import { EDITOR_SELECTORS, getAllSelectors } from './selectors/index.js';
import { isNaverLoginUrl, isNaverWriteEditorUrl } from './editorUrlState.js';

export type EditorReadinessReason = 'ready' | 'login' | 'loading' | 'no-editor-frame' | 'no-title' | 'cancelled';

export interface EditorReadiness {
  readonly ready: boolean;
  readonly reason: EditorReadinessReason;
}

const TITLE_SELECTORS = [...getAllSelectors(EDITOR_SELECTORS.documentTitle), ...getAllSelectors(EDITOR_SELECTORS.titleText)];
const LOADING_TEXT = /글을 불러오고 있습니다|불러오는 중/;

/** The frame that holds the editor: the iframe whose own URL is the write editor, else the page itself. */
export function findEditorFrame(page: Page): Frame | null {
  const top = page.mainFrame();
  const child = page.frames().find((frame) => frame !== top && isNaverWriteEditorUrl(frame.url()));
  if (child) return child;
  return isNaverWriteEditorUrl(page.url()) ? top : null;
}

const FRAME_READ_TIMEOUT_MS = 5000;

/** One frame read, bounded: a frame that is being detached must not hold the whole wait (or a cancel) hostage. */
function withReadTimeout<T>(work: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), FRAME_READ_TIMEOUT_MS); });
  return Promise.race([work.catch(() => null), timeout]).finally(() => clearTimeout(timer));
}

async function inspectEditorFrame(frame: Frame): Promise<{ container: boolean; title: boolean; loading: boolean } | null> {
  return withReadTimeout(frame.evaluate((titleSelectors: string[], loadingSource: string) => {
    const has = (selector: string) => { try { return !!document.querySelector(selector); } catch { return false; } };
    return {
      container: has('.se-main-container'),
      title: titleSelectors.some(has),
      loading: new RegExp(loadingSource).test((document.body?.innerText || '').slice(0, 4000)),
    };
  }, [...TITLE_SELECTORS], LOADING_TEXT.source));
}

/** If Naver renames the editor URL, the frame that holds the editor DOM is still the editor. */
async function findEditorFrameByDom(page: Page): Promise<Frame | null> {
  for (const frame of page.frames()) {
    const hasEditor = await withReadTimeout(frame.evaluate(() => !!document.querySelector('.se-main-container')));
    if (hasEditor) return frame;
  }
  return null;
}

/** A single read of the current page: is the editor usable right now, and if not, why. */
export async function readEditorReadiness(page: Page): Promise<EditorReadiness> {
  if (isNaverLoginUrl(page.url())) return { ready: false, reason: 'login' };
  const frame = findEditorFrame(page) ?? await findEditorFrameByDom(page);
  if (!frame) return { ready: false, reason: 'no-editor-frame' };
  const state = await inspectEditorFrame(frame);
  if (!state) return { ready: false, reason: 'no-editor-frame' };
  if (state.loading && !state.container) return { ready: false, reason: 'loading' };
  if (!state.container) return { ready: false, reason: 'no-editor-frame' };
  if (!state.title) return { ready: false, reason: 'no-title' };
  return { ready: true, reason: 'ready' };
}

/**
 * Polls the loaded page until the editor is usable or the deadline passes. Login pages end the wait at once
 * (the account guard handles them). No navigation, no reload.
 */
export async function waitForEditorReady(
  page: Page,
  options: { timeoutMs: number; pollMs?: number; isCancelled?: () => boolean },
): Promise<EditorReadiness> {
  const deadline = Date.now() + options.timeoutMs;
  const pollMs = options.pollMs ?? 500;
  let last: EditorReadiness = { ready: false, reason: 'no-editor-frame' };
  while (Date.now() <= deadline) {
    if (options.isCancelled?.()) return { ready: false, reason: 'cancelled' };
    last = await readEditorReadiness(page);
    if (last.ready || last.reason === 'login') return last;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return last;
}
