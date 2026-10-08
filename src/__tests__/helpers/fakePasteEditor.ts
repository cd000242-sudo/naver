/**
 * Fake SmartEditor rig for driving the REAL pasteRichHtmlAtCursor against a happy-dom document
 * on a virtual clock. Ctrl+V does not touch the document directly: each press consumes one entry
 * of the paste script, and that entry decides WHEN (virtual ms after the key press) and HOW
 * (whole / partial / never) the clipboard text lands — the way a slow PC's editor behaves.
 */
import { Window } from 'happy-dom';
import { vi } from 'vitest';

/** One chunk of an arriving paste: `delayMs` after the Ctrl+V press, `lines` are appended. */
export interface Chunk { delayMs: number; lines: string[] }
/** Chunks for one Ctrl+V press. An empty list = the keystroke was swallowed. */
export type PasteScript = Chunk[][];

export interface RigOptions {
  /** One entry per Ctrl+V press, in order. Presses beyond the script are swallowed. */
  script: PasteScript;
  /** When set, the synthetic paste event is "consumed" and these chunks land (relative to dispatch). */
  eventChunks?: Chunk[];
}

export const PLACEHOLDER = '본문에 #을 이용하여 태그를 사용해 보세요!';
const SENTINEL = '￬';

export const happyWindow = new Window();

/** Stub the browser globals the production evaluate callbacks read. Returns an undo function. */
export function installBrowserGlobals(): () => void {
  vi.stubGlobal('window', happyWindow);
  vi.stubGlobal('document', happyWindow.document);
  vi.stubGlobal('HTMLElement', happyWindow.HTMLElement);
  vi.stubGlobal('NodeFilter', happyWindow.NodeFilter);
  vi.stubGlobal('Node', happyWindow.Node);
  vi.stubGlobal('getComputedStyle', (el: unknown) => happyWindow.getComputedStyle(el as any));
  // happy-dom reports zero-size boxes; the production code skips zero-size candidates.
  const proto = happyWindow.HTMLElement.prototype as any;
  const original = proto.getBoundingClientRect;
  proto.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 24, width: 600, height: 24, toJSON: () => ({}),
  });
  return () => {
    proto.getBoundingClientRect = original;
    vi.unstubAllGlobals();
  };
}

export function mountEditor(initialBody: string): void {
  document.body.innerHTML = `
    <div class="se-body"><div class="se-content"><section class="se-canvas">
      <article class="se-components-wrap">
        <div class="se-component se-documentTitle"><div class="se-component-content"><div class="se-section">
          <div class="se-module se-module-text"><p class="se-text-paragraph"><span>글 제목입니다</span></p></div></div></div></div>
        <div class="se-component se-text" id="initial-body"><div class="se-component-content"><div class="se-section">
          <div class="se-module se-module-text"><p class="se-text-paragraph"><span>${initialBody}</span><span class="se-placeholder">${PLACEHOLDER}</span></p></div></div></div></div>
      </article></section></div></div>`;
}

export function bodyText(): string {
  return (document.querySelector('article.se-components-wrap')?.textContent || '').replace(/\s+/g, '');
}

export function occurrences(needle: string): number {
  const stripped = needle.replace(/\s+/g, '');
  return bodyText().split(stripped).length - 1;
}

export interface Rig {
  page: any;
  frame: any;
  /** Number of Ctrl+V presses (every paste attempt, native or plain). */
  pastePresses: () => number;
  undoPresses: () => number;
  eventDispatches: () => number;
}

export function createRig(options: RigOptions): Rig {
  let ctrlDown = false;
  let pasteIndex = 0;
  let undoPresses = 0;
  let eventDispatches = 0;
  const attached: HTMLElement[] = [];

  const appendLines = (component: HTMLElement, lines: string[]): void => {
    const module = component.querySelector('.se-module') as HTMLElement;
    for (const line of lines) {
      const p = document.createElement('p');
      p.className = 'se-text-paragraph';
      const span = document.createElement('span');
      span.textContent = line;
      p.appendChild(span);
      module.appendChild(p);
    }
  };

  const schedule = (chunks: Chunk[]): void => {
    if (chunks.length === 0) return;
    const component = document.createElement('div');
    component.className = 'se-component se-text';
    component.innerHTML = '<div class="se-component-content"><div class="se-section"><div class="se-module se-module-text"></div></div></div>';
    for (const chunk of chunks) {
      setTimeout(() => {
        if (!component.isConnected && !attached.includes(component)) {
          document.querySelectorAll('.se-placeholder').forEach((el) => el.remove());
          document.querySelector('article.se-components-wrap')!.appendChild(component);
          attached.push(component);
        }
        appendLines(component, chunk.lines);
      }, chunk.delayMs);
    }
  };

  const lastParagraph = (): HTMLElement | null => {
    const all = document.querySelectorAll('article.se-components-wrap .se-component:not(.se-documentTitle) .se-text-paragraph');
    return (all[all.length - 1] as HTMLElement | undefined) ?? null;
  };

  const keyboard = {
    down: async (key: string) => { if (key === 'Control') ctrlDown = true; },
    up: async (key: string) => { if (key === 'Control') ctrlDown = false; },
    press: async (key: string) => {
      if (ctrlDown && key === 'V') {
        schedule(options.script[pasteIndex] ?? []);
        pasteIndex += 1;
      } else if (ctrlDown && key === 'Z') {
        undoPresses += 1;
        const last = attached.pop();
        last?.remove();
      } else if (key === 'Backspace') {
        const paragraph = lastParagraph();
        const span = paragraph?.querySelector('span:last-child');
        if (span && (span.textContent || '').includes(SENTINEL)) {
          span.textContent = (span.textContent || '').split(SENTINEL).join('');
        }
      }
    },
    type: async (text: string) => {
      const span = lastParagraph()?.querySelector('span:last-child');
      if (span) span.textContent = `${span.textContent || ''}${text}`;
    },
  };

  const page = {
    keyboard,
    mouse: { click: async () => undefined },
    bringToFront: async () => undefined,
    evaluate: async () => ({ ok: true }),
    $: async () => null,
    browser: () => ({
      target: () => ({ createCDPSession: async () => ({ send: async () => undefined, detach: async () => undefined }) }),
    }),
    url: () => 'https://blog.naver.com/PostWriteForm.naver',
  };

  const frame = {
    url: () => 'https://blog.naver.com/PostWriteForm.naver',
    $$: async () => [],
    click: async () => undefined,
    evaluateHandle: async () => ({ asElement: () => null }),
    evaluate: async (fn: (...a: any[]) => unknown, arg?: any) => {
      if (arg && typeof arg === 'object' && 'richHtml' in arg && 'rootSelectors' in arg) {
        eventDispatches += 1;
        if (options.eventChunks) {
          schedule(options.eventChunks);
          return { ok: true };
        }
        return { ok: false, reason: 'paste event was not consumed by editor' };
      }
      return fn(arg);
    },
  };

  return {
    page,
    frame,
    pastePresses: () => pasteIndex,
    undoPresses: () => undoPresses,
    eventDispatches: () => eventDispatches,
  };
}

/** Advances the fake clock until `promise` settles (virtual time only — no real waiting). */
export async function drive<T>(promise: Promise<T>, stepMs = 50, maxMs = 120_000): Promise<{ value: T; elapsedMs: number }> {
  let settled = false;
  const tracked = promise.finally(() => { settled = true; });
  tracked.catch(() => undefined);
  let elapsedMs = 0;
  while (!settled && elapsedMs < maxMs) {
    await vi.advanceTimersByTimeAsync(stepMs);
    elapsedMs += stepMs;
  }
  return { value: await promise, elapsedMs };
}
