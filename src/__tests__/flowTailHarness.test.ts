import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('scripts/harness/flow-tail-harness.cjs', 'utf8');
const success = { ok: true, beforeChars: 38, afterChars: 240, beforeTables: 0, afterTables: 0 };
const noCaret = { ok: false, method: 'none', safeToFallback: true, beforeChars: 38, afterChars: 38, beforeTables: 0, afterTables: 0, reason: 'editor tail caret unavailable before rich paste' };
const evidence = { anthem: true, dividers: 1, hook: true, linkCards: 1, hashtagFirst: true, hashtagLast: true, tailAfterBody: true };

async function runScenario(options: { pasteResults?: any[]; evidence?: any; noFrame?: boolean; ready?: boolean; fallbackVerified?: boolean; args?: string[] } = {}) {
  const pasteResults = [...(options.pasteResults || [])];
  const paste = vi.fn(async (..._args: any[]) => pasteResults.shift() || success);
  const focus = vi.fn(async () => undefined);
  const ready = vi.fn(async () => options.ready !== false || type.mock.calls.length > 1);
  const close = vi.fn(async () => undefined);
  const sleep = vi.fn(async (_ms: number) => undefined);
  const type = vi.fn(async (_page: unknown, _text: string) => undefined);
  let evidenceReads = 0;
  const frame = { $: async () => ({ boundingBox: async () => ({ x: 0, y: 0, width: 10, height: 10 }) }), evaluate: async (_fn: unknown, expected?: unknown) => typeof expected === 'string' ? options.fallbackVerified === true : ({}) };
  const page = {
    cookies: async () => [{ name: 'NID_AUT' }], goto: async () => undefined,
    keyboard: { press: async () => undefined, up: async () => undefined },
    mouse: { click: async () => undefined },
    $: async () => null, screenshot: async () => undefined,
  };
  const processMock: { argv: string[]; cwd: () => string; exitCode?: number } = { argv: ['node', 'harness', 'fullauto', '--no-preview', ...(options.args || [])], cwd: () => '/workspace' };
  const modules: Record<string, any> = {
    puppeteer: { launch: async () => ({ pages: async () => [page], close }) },
    'node:fs': { mkdirSync: () => undefined, existsSync: () => false },
    'node:path': await import('node:path'),
    '../../dist/automation/richTextPaste.js': {
      buildMobileRichHtml: (text: string) => ({ html: `<p>${text}</p>`, plainText: text, tableCount: 0 }),
      pasteRichHtmlAtCursor: paste, ensureTailTypingReady: ready, focusLastEditableLine: focus,
    },
    '../../dist/automation/typingUtils.js': { safeKeyboardType: type },
    './harness-lib.cjs': {
      log: vi.fn(), sleep, waitForLogin: async () => true,
      findEditorFrame: async () => options.noFrame ? null : frame,
      closeDraftPopup: async () => undefined, closeEditorPopups: async () => undefined,
      countTailEvidence: async () => ++evidenceReads === 1 || options.evidence === undefined ? evidence : options.evidence,
      resolveCookieFile: () => null,
    },
  };
  await vm.runInNewContext(source, { require: (name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
    return modules[name];
  }, process: processMock, console, Date });
  return { paste, focus, ready, close, sleep, type, process: processMock };
}

describe('live tail harness recovery and release verdict', () => {
  it('recovers a zero-growth initial caret failure before inserting the conclusion', async () => {
    const result = await runScenario({ pasteResults: [noCaret, success, success] });
    expect(result.paste).toHaveBeenCalledTimes(3);
    expect(result.paste.mock.calls[0]).toEqual(result.paste.mock.calls[1]);
    expect(result.focus).toHaveBeenCalled();
    expect(result.process.exitCode || 0).toBe(0);
  });

  it.each([
    { ...noCaret, safeToFallback: false },
    { ...noCaret, afterChars: 90 },
    { ...noCaret, afterTables: 1 },
  ])('does not repeat an unsafe or partially inserted section', async (failed) => {
    const result = await runScenario({ pasteResults: [failed] });
    expect(result.paste).toHaveBeenCalledTimes(1);
    expect(result.process.exitCode).toBe(1);
    expect(result.type.mock.calls.length).toBe(1); // Only the title, no tail after a failed body.
  });

  it('stops after one recovery retry fails', async () => {
    const result = await runScenario({ pasteResults: [noCaret, noCaret] });
    expect(result.paste).toHaveBeenCalledTimes(2);
    expect(result.process.exitCode).toBe(1);
  });

  it('uses the app keyboard fallback for a safe empty-body caret failure and verifies the inserted text', async () => {
    const result = await runScenario({ pasteResults: [noCaret, success], ready: false, fallbackVerified: true });
    expect(result.type.mock.calls.length).toBeGreaterThan(1);
    expect(result.process.exitCode || 0).toBe(0);
  });

  it('fails when safe keyboard fallback cannot be verified in the editor', async () => {
    const result = await runScenario({ pasteResults: [noCaret], ready: false, fallbackVerified: false });
    expect(result.type.mock.calls.length).toBe(2);
    expect(result.process.exitCode).toBe(1);
  });

  it('returns failure when the body marker is absent even if every tail marker passes', async () => {
    const result = await runScenario({ evidence: { ...evidence, anthem: false } });
    expect(result.process.exitCode).toBe(1);
  });

  it.each([null, { ...evidence, tailAfterBody: false }])('fails closed for unreadable or misplaced tail evidence', async (ev) => {
    const result = await runScenario({ evidence: ev });
    expect(result.process.exitCode).toBe(1);
  });

  it('fails when no editor frame is found', async () => {
    const result = await runScenario({ noFrame: true });
    expect(result.paste).not.toHaveBeenCalled();
    expect(result.process.exitCode).toBe(1);
    expect(result.close).toHaveBeenCalledTimes(1);
  });

  it('skips only human preview waits in automated mode', async () => {
    const result = await runScenario();
    expect(result.sleep.mock.calls.some(([ms]) => ms >= 60_000)).toBe(false);
    expect(result.close).toHaveBeenCalledTimes(1);
    expect(result.process.exitCode || 0).toBe(0);
  });
});
