import type { Frame, Page } from 'puppeteer';

export function isTrustedNaverEditorFrameUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && ['blog.naver.com', 'm.blog.naver.com', 'nid.naver.com', 'login.naver.com'].includes(url.hostname);
  } catch { return false; }
}

/**
 * Editor body evidence. The live SmartEditor (read 2026-10-08) wraps title + body in `article.se-components-wrap`
 * and has no `.se-main-container` — that class is the published-post viewer's. Requiring it alone made a visible
 * editor time out as NETWORK_WAIT from v2.11.326 on.
 */
export const EDITOR_BODY_SELECTOR = '.se-main-container, .se-components-wrap';

// A string keeps the browser predicate independent of TypeScript/bundler helpers.
// Evaluate it within each Puppeteer frame, never through iframe.contentDocument.
export const INITIAL_EDITOR_READINESS_SCRIPT = `(() => {
  const hasEditor = !!document.querySelector('${EDITOR_BODY_SELECTOR}')
    && !!document.querySelector('.se-documentTitle, .se-section-documentTitle, [data-name="documentTitle"], .se-text-paragraph[contenteditable], .se-component-content[contenteditable]');
  const blocked = !!document.querySelector('input[name="captcha"], input#captcha')
    || (!!document.querySelector('input[type="password"]') && !!document.querySelector('input[name="id"], input#id'))
    || (!hasEditor && /보호조치가 적용|보호조치 해제|이용이 제한|자동입력 방지|보안문자를 입력|본인 확인이 필요/.test((document.body?.textContent || '').slice(0, 12000)));
  if (blocked) return 'blocked';
  return hasEditor ? 'ready' : 'pending';
})()`;

export class InitialEditorReadinessError extends Error {
  constructor(frameCount: number, checkedFrames: number, evaluationFailures: number) {
    super(`editor-readiness timeout: frames=${frameCount}, checked=${checkedFrames}, evaluationFailures=${evaluationFailures}`);
    this.name = 'InitialEditorReadinessError';
  }
}

interface ReadinessOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  ensureNotCancelled?: () => void;
}

async function probeFrames(page: Pick<Page, 'frames'>) {
  const frames = page.frames();
  const trusted = frames.map(frame => ({ frame, url: frame.url() })).filter(entry => isTrustedNaverEditorFrameUrl(entry.url));
  const results = await Promise.all(trusted.map(async ({ frame, url }) => {
    try {
      const hostname = new URL(url).hostname;
      const state = ['nid.naver.com', 'login.naver.com'].includes(hostname)
        ? 'blocked' : await frame.evaluate(INITIAL_EDITOR_READINESS_SCRIPT);
      return { frame, state: isTrustedNaverEditorFrameUrl(frame.url()) ? state : 'pending' };
    } catch { return { frame, state: 'evaluation-failed' }; }
  }));
  const currentFrames = page.frames();
  const complete = results.every(result => result.state !== 'evaluation-failed')
    && trusted.every(entry => currentFrames.includes(entry.frame) && entry.frame.url() === entry.url)
    && currentFrames.filter(frame => isTrustedNaverEditorFrameUrl(frame.url())).length === trusted.length;
  const blocked = results.some(result => result.state === 'blocked');
  return { frameCount: frames.length, checkedFrames: trusted.length,
    evaluationFailures: results.filter(result => result.state === 'evaluation-failed').length,
    ready: blocked || (complete && results.some(result => result.state === 'ready')), blocked, complete,
    editorFrame: blocked ? null : results.find(result => result.state === 'ready')?.frame ?? null };

}

/** Readiness only: the caller must still verify session identity and protection status. */
export async function waitForInitialEditorReadiness(
  page: Pick<Page, 'frames' | 'url' | 'isClosed'>,
  options: ReadinessOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 20000;
  const deadline = Date.now() + timeoutMs;
  let diagnostics = { frameCount: 0, checkedFrames: 0, evaluationFailures: 0 };
  do {
    options.ensureNotCancelled?.();
    if (page.isClosed()) throw new Error('Editor page closed');
    const url = new URL(page.url());
    if (isTrustedNaverEditorFrameUrl(url.href) && ['nid.naver.com', 'login.naver.com'].includes(url.hostname)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      probeFrames(page),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now())); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    options.ensureNotCancelled?.();
    if (result) {
      diagnostics = result;
      if (result.ready) return;
    }
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(options.pollIntervalMs ?? 250, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw new InitialEditorReadinessError(diagnostics.frameCount, diagnostics.checkedFrames, diagnostics.evaluationFailures);
}

export class EditorFrameProtectionError extends Error {
  constructor() { super('Protection or login evidence prevents editor frame selection'); this.name = 'EditorFrameProtectionError'; }
}

/** Return the actual input document; a mainFrame element can merely wrap it. */
export async function findReadyEditorFrame(page: Pick<Page, 'frames' | 'url' | 'isClosed'>, timeoutMs = 5000): Promise<Frame | null> {
  const pageUrl = page.url();
  if (page.isClosed() || !isTrustedNaverEditorFrameUrl(pageUrl)) throw new EditorFrameSelectionError();
  if (!['blog.naver.com', 'm.blog.naver.com'].includes(new URL(pageUrl).hostname)) throw new EditorFrameProtectionError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    probeFrames(page),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new InitialEditorReadinessError(page.frames().length, 0, 0)), timeoutMs); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
  if (page.isClosed() || page.url() !== pageUrl || !result.complete) throw new EditorFrameSelectionError();
  if (result.blocked) throw new EditorFrameProtectionError();
  return result.editorFrame;
}

export class EditorFrameSelectionError extends Error {
  constructor() { super('Editor frame evidence changed or could not be inspected'); this.name = 'EditorFrameSelectionError'; }
}
