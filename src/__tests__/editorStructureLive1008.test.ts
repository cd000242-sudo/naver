/**
 * [2026-10-08] The live SmartEditor has no `.se-main-container` (that class belongs to the published-post
 * viewer). Since v2.11.326 every editor readiness/session check required it, so an editor that was plainly
 * on screen timed out as NETWORK_WAIT ("분명 글쓰기창 뜨는데?"). The selector lists below are the classes
 * read from the live PostWriteForm frame on 2026-10-08 (title + body share `article.se-components-wrap`).
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runInNewContext } from 'node:vm';
import { INITIAL_EDITOR_READINESS_SCRIPT } from '../automation/initialEditorReadiness.js';
import { SESSION_FRAME_EVIDENCE_SCRIPT } from '../automation/serverSessionFrameProbe.js';

const LIVE_EDITOR_2026_10_08 = ['.se-container', '.se-content', '.se-canvas', '.se-components-wrap', '.se-documentTitle', '.se-section-documentTitle', '.se-text-paragraph'];
const LIVE_SHELL_2026_10_08: string[] = []; // blog.naver.com/{id}?Redirect=Write top document: iframe only

const run = (script: string, selectors: string[]) => runInNewContext(script, {
  document: { querySelector: (query: string) => query.split(',').some(part => selectors.includes(part.trim())) ? {} : null, body: { textContent: '' } },
  location: { href: 'https://blog.naver.com/PostWriteForm.naver?blogId=leader_248' }, URL,
});

describe('editor evidence matches the live SmartEditor (2026-10-08)', () => {
  it('readiness accepts the live editor frame and still rejects the shell', () => {
    expect(run(INITIAL_EDITOR_READINESS_SCRIPT, LIVE_EDITOR_2026_10_08)).toBe('ready');
    expect(run(INITIAL_EDITOR_READINESS_SCRIPT, LIVE_SHELL_2026_10_08)).toBe('pending');
    // A body wrapper alone (title not rendered yet) is not ready.
    expect(run(INITIAL_EDITOR_READINESS_SCRIPT, ['.se-components-wrap'])).toBe('pending');
  });

  it('session frame evidence counts the live editor as an editor', () => {
    expect(run(SESSION_FRAME_EVIDENCE_SCRIPT, LIVE_EDITOR_2026_10_08)).toMatchObject({ hasEditor: true });
    expect(run(SESSION_FRAME_EVIDENCE_SCRIPT, LIVE_SHELL_2026_10_08)).toMatchObject({ hasEditor: false });
  });

  it('the fetch-based session probe uses the same editor body evidence', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'browserSessionManager.ts'), 'utf8');
    expect(source).not.toMatch(/doc\.querySelector\('\.se-main-container'\)/);
    expect(source).toMatch(/doc\.querySelector\(editorBodySelector\)/);
  });
});

describe('a user-pressed re-check knows the blog id before verifying', () => {
  it('sets the expected blog id in openSession, before verify runs', () => {
    const engine = fs.readFileSync(path.join(process.cwd(), 'src', 'naverBlogAutomation.ts'), 'utf8').replace(/\r\n/g, '\n');
    const start = engine.indexOf('  private userRunResumeDeps(): UserRunResumeDeps {');
    const body = engine.slice(start, engine.indexOf('\n  }\n', start));
    const open = body.indexOf('openSession: async () => {');
    const setId = body.indexOf('browserSessionManager.setExpectedBlogId(id, this.options.getExpectedBlogId(id))');
    expect(open).toBeGreaterThan(-1);
    expect(setId).toBeGreaterThan(open);
    expect(setId).toBeLessThan(body.indexOf('resume: (verify)'));
  });
});
