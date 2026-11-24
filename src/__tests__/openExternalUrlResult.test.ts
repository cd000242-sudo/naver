import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// The handler lives at the top level of main.ts (which cannot be imported), so the real handler
// source is cut out, stripped of types and run against a fake ipcMain and a fake shell.
const source = readFileSync(resolve(__dirname, '..', 'main.ts'), 'utf8');
const start = source.indexOf("try { ipcMain.handle('openExternalUrl'");
const end = source.indexOf('/* 이미 등록됨 */ }', start);

type Handler = (event: unknown, url: unknown) => Promise<unknown>;

function loadHandler(openExternal: (url: string) => Promise<void>): Handler {
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const js = ts.transpileModule(source.slice(start, end + '/* 이미 등록됨 */ }'.length), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  const handlers = new Map<string, Handler>();
  const ipcMain = { handle: (channel: string, fn: Handler) => { handlers.set(channel, fn); } };
  const fakeRequire = (name: string) => (name === 'electron' ? { shell: { openExternal } } : {});
  new Function('ipcMain', 'require', 'console', js)(ipcMain, fakeRequire, { warn: () => undefined, log: () => undefined, error: () => undefined });
  return handlers.get('openExternalUrl')!;
}

describe('openExternalUrl answers the renderer', () => {
  it('answers { success: true } after opening an allowed address', async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    const handler = loadHandler(open);
    await expect(handler({}, 'https://claude.ai/settings/usage')).resolves.toEqual({ success: true });
    expect(open).toHaveBeenCalledWith('https://claude.ai/settings/usage');
    await expect(handler({}, 'mailto:a@example.com')).resolves.toEqual({ success: true });
  });

  it('answers { success: false, message } and opens nothing for blocked or malformed input', async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    const handler = loadHandler(open);
    for (const url of ['file:///C:/secret.txt', 'javascript:alert(1)', 'not a url', '', undefined, 42]) {
      const result = await handler({}, url) as { success: boolean; message?: string };
      expect(result.success, String(url)).toBe(false);
      expect(typeof result.message, String(url)).toBe('string');
    }
    expect(open).not.toHaveBeenCalled();
  });

  it('answers { success: false, message } without leaking the raw error when the browser cannot open', async () => {
    const handler = loadHandler(vi.fn().mockRejectedValue(new Error('EPERM C:\\Users\\secret\\token')));
    const result = await handler({}, 'https://claude.ai/settings/usage') as { success: boolean; message?: string };
    expect(result.success).toBe(false);
    expect(result.message).toBeTruthy();
    expect(result.message).not.toContain('secret');
  });
});
