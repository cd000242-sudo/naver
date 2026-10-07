/**
 * One post = one editor entry (plus at most one re-entry when the editor never became usable). The old flow could
 * load GoBlogWrite up to ~12 times per post: switchToMainFrame and inputTitle re-navigated on every miss, and the
 * renderer reran the whole publish after editor/network errors.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { findEditorFrame, readEditorReadiness, waitForEditorReady } from '../automation/editorReadiness';

type FakeState = { container: boolean; title: boolean; loading: boolean };

const empty: FakeState = { container: false, title: false, loading: false };

// evaluate(fn) with no extra args is the DOM-fallback probe ("has .se-main-container?"); with args it is the full read.
function fakeFrame(url: string, state: FakeState | (() => FakeState) = empty) {
  const read = () => (typeof state === 'function' ? state() : state);
  return { url: () => url, evaluate: async (_fn: unknown, ...args: unknown[]) => (args.length === 0 ? read().container : read()) };
}

function fakePage(pageUrl: string, frames: Array<{ url: string; state?: FakeState | (() => FakeState) }>) {
  const top = fakeFrame(pageUrl);
  const children = frames.map((spec) => fakeFrame(spec.url, spec.state));
  return { url: () => pageUrl, mainFrame: () => top, frames: () => [top, ...children] } as any;
}

const editorUrl = 'https://blog.naver.com/PostWriteForm.naver?blogId=abc';
const ready: FakeState = { container: true, title: true, loading: false };

describe('editor readiness', () => {
  it('picks the frame whose own URL is the write editor, not any #mainFrame', () => {
    const page = fakePage('https://blog.naver.com/abc?Redirect=Write', [{ url: 'https://blog.naver.com/PostList.naver' }, { url: editorUrl }]);
    expect(findEditorFrame(page)?.url()).toBe(editorUrl);
    expect(findEditorFrame(fakePage('https://blog.naver.com/abc', [{ url: 'https://blog.naver.com/PostList.naver' }]))).toBeNull();
  });

  it.each([
    [{ container: true, title: true, loading: false }, true, 'ready'],
    [{ container: false, title: false, loading: true }, false, 'loading'],
    [{ container: true, title: false, loading: false }, false, 'no-title'],
    [{ container: false, title: true, loading: false }, false, 'no-editor-frame'],
  ])('reads %o as ready=%s (%s)', async (state, isReady, reason) => {
    expect(await readEditorReadiness(fakePage('https://blog.naver.com/abc?Redirect=Write', [{ url: editorUrl, state }]))).toEqual({ ready: isReady, reason });
  });

  it('a login page ends the wait at once', async () => {
    const page = fakePage('https://nid.naver.com/nidlogin.login?url=https://blog.naver.com/GoBlogWrite.naver', []);
    const started = Date.now();
    expect(await waitForEditorReady(page, { timeoutMs: 5000, pollMs: 50 })).toEqual({ ready: false, reason: 'login' });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('waits until the editor finishes loading, without navigating', async () => {
    let reads = 0;
    const page = fakePage('https://blog.naver.com/abc?Redirect=Write', [{ url: editorUrl, state: () => (++reads >= 3 ? ready : { container: false, title: false, loading: true }) }]);
    expect(await waitForEditorReady(page, { timeoutMs: 2000, pollMs: 10 })).toEqual({ ready: true, reason: 'ready' });
    expect(reads).toBe(3);
  });

  it('still finds the editor by its DOM when Naver renames the editor URL', async () => {
    const page = fakePage('https://blog.naver.com/abc', [{ url: 'https://blog.naver.com/abc/postwrite-v2', state: ready }]);
    expect(findEditorFrame(page)).toBeNull();
    expect(await readEditorReadiness(page)).toEqual({ ready: true, reason: 'ready' });
  });

  it('a frame that never answers does not hold the read past its bound', async () => {
    const page = fakePage('https://blog.naver.com/abc?Redirect=Write', []);
    const hanging = { url: () => editorUrl, evaluate: () => new Promise(() => undefined) };
    page.frames = () => [page.mainFrame(), hanging];
    const started = Date.now();
    expect(await readEditorReadiness(page)).toEqual({ ready: false, reason: 'no-editor-frame' });
    expect(Date.now() - started).toBeLessThan(5600);
  }, 8000);

  it('gives up at the deadline with the last reason', async () => {
    const page = fakePage('https://blog.naver.com/abc?Redirect=Write', [{ url: editorUrl, state: { container: true, title: false, loading: false } }]);
    expect(await waitForEditorReady(page, { timeoutMs: 60, pollMs: 10 })).toEqual({ ready: false, reason: 'no-title' });
  });
});

describe('engine and renderer enter the editor at most twice per post', () => {
  const engine = fs.readFileSync(path.join(process.cwd(), 'src', 'naverBlogAutomation.ts'), 'utf8').replace(/\r\n/g, '\n');
  const renderer = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'modules', 'fullAutoFlow.ts'), 'utf8').replace(/\r\n/g, '\n');
  const body = (name: string) => {
    const start = engine.indexOf(`  async ${name}(`);
    const next = engine.indexOf('\n  async ', start + 10);
    const nextPrivate = engine.indexOf('\n  private ', start + 10);
    return engine.slice(start, Math.min(...[next, nextPrivate].filter((i) => i > 0)));
  };

  it('navigateToBlogWrite: one fresh entry + one bounded re-entry, each checked for readiness', () => {
    const nav = body('navigateToBlogWrite');
    expect(nav).toContain('for (let entry = 1; entry <= 2; entry++) {');
    expect(nav).toContain('waitForEditorReady(page, { timeoutMs: 45000, isCancelled })');
    expect(nav.match(/page\.goto\(/g)).toHaveLength(1);
    // A dropped connection on the first entry gets the same single re-entry (it is not an instant account pause).
    expect(nav).toMatch(/catch \(navigationError\) \{[\s\S]{0,300}?if \(entry === 1\) \{[\s\S]{0,200}?continue;/);
    expect(nav).not.toContain('page.reload(');
  });

  it('switchToMainFrame and inputTitle never navigate (they run mid-post, on every frame miss)', () => {
    for (const name of ['switchToMainFrame', 'inputTitle']) {
      const fn = body(name);
      expect(fn.length).toBeGreaterThan(200);
      expect(fn).not.toMatch(/page\.goto\(|page\.reload\(/);
    }
  });

  it('GoBlogWrite is opened only by navigateToBlogWrite', () => {
    const opens = [...engine.matchAll(/await page\.goto\(this\.options\.blogWriteUrl \?\? 'https:\/\/blog\.naver\.com\/GoBlogWrite\.naver'/g)].length
      + [...engine.matchAll(/page\.goto\(writeUrl,/g)].length;
    expect(opens).toBe(1);
  });

  it('publish: one attempt + one repair on the same page; scheduling repairs once at most, before the confirm click', () => {
    expect(engine).toContain("}, 2, '블로그 발행');");
    expect(engine).toContain('const MAX_SCHEDULE_RETRIES = 2;');
  });

  it('the renderer reruns the publish only after the browser itself died', () => {
    expect(renderer).not.toContain('retryRunAutomationAfterDetachedLoginFrame');
    expect(renderer).toMatch(/if \(!closeBeforeRetry\) \{\s*return null;/);
    expect(renderer).not.toContain('_networkRetryCount');
  });
});
