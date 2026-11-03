import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { app } from 'electron';
import { ensureBootstrappedNpm, resetNpmBootstrapCache, PINNED_NPM_VERSION } from '../agentCli/npmBootstrap.js';
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'agent-npm-bootstrap-test-'));
  vi.spyOn(app, 'getPath').mockReturnValue(root); resetNpmBootstrapCache();
});
afterEach(async () => { resetNpmBootstrapCache(); vi.restoreAllMocks(); vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }); });
describe('verified npm bootstrap transport', () => {
  it('reuses a complete pinned runtime without a download', async () => {
    const npm = path.join(root, 'agent-runtime', 'npm'); await mkdir(path.join(npm, 'bin'), { recursive: true });
    await writeFile(path.join(npm, 'package.json'), JSON.stringify({ version: PINNED_NPM_VERSION }));
    await writeFile(path.join(npm, 'bin', 'npm-cli.js'), '// fixture only; never executed');
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl);
    expect(await ensureBootstrappedNpm()).toBe(path.join(npm, 'bin', 'npm-cli.js')); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects corrupt bytes and never unpacks them; a retry is not cached as failed', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response('unverified payload'));
    vi.stubGlobal('fetch', fetchImpl);
    await expect(ensureBootstrappedNpm()).rejects.toThrow(/무결성/);
    await expect(ensureBootstrappedNpm()).rejects.toThrow(/무결성/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toMatch(/^https:\/\/registry\.npmjs\.org\/npm\/-\/npm-[\d.]+\.tgz$/);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'error', credentials: 'omit' });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    await expect(readFile(path.join(root, 'agent-runtime', 'npm', 'package.json'))).rejects.toThrow();
  });
  it('shares an in-flight download and rejects failed or oversized replies', async () => {
    let finish: (value: Response) => void = () => {};
    const fetchImpl = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetchImpl);
    const first = ensureBootstrappedNpm(), second = ensureBootstrappedNpm(); expect(fetchImpl).toHaveBeenCalledOnce();
    finish(new Response('{}', { status: 503 }));
    await expect(first).rejects.toThrow(/503/); await expect(second).rejects.toThrow(/503/);
    fetchImpl.mockResolvedValue(new Response('x', { headers: { 'content-length': '10485761' } }));
    await expect(ensureBootstrappedNpm()).rejects.toThrow(/크기/);
    fetchImpl.mockResolvedValue(new Response(new Uint8Array(10485761)));
    await expect(ensureBootstrappedNpm()).rejects.toThrow(/크기/);
  });
});
