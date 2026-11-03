import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { c } from 'tar';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { installAgyBinary, agyManifestPlatform } from '../agentCli/agyInstaller.js';

let root: string; const bytes = Buffer.from('MZ-test-binary');
const digest = createHash('sha512').update(bytes).digest('hex');
const url = 'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.4.3-123/windows-x64/cli_windows_x64.exe';
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'agy-install-test-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
function fakeFetch(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (input: string, options?: RequestInit) => input.includes('/manifests/')
    ? new Response(JSON.stringify({ version: '1.4.3', url, sha512: digest, ...overrides }))
    : new Response(bytes));
}
describe('official agy installer without remote shell scripts', () => {
  it.each([['win32', 'x64', 'windows_amd64'], ['win32', 'arm64', 'windows_arm64'], ['darwin', 'arm64', 'darwin_arm64'], ['linux', 'x64', 'linux_amd64'], ['linux', 'arm64', 'linux_arm64']])('maps %s %s explicitly', (platform, arch, expected) => {
    expect(agyManifestPlatform(platform, arch)).toBe(expected);
  });
  it('validates official manifest + SHA512 before atomically exposing the binary', async () => {
    const fetchImpl = fakeFetch(); const messages: string[] = [];
    const result = await installAgyBinary({ root, platform: 'win32', arch: 'x64', fetchImpl, onProgress: m => messages.push(m) });
    expect(result.version).toBe('1.4.3'); expect(await readFile(result.executable)).toEqual(bytes);
    expect(fetchImpl.mock.calls[0][0]).toMatch(/^https:\/\/antigravity-cli-auto-updater-974169037036\.us-central1\.run\.app\/manifests\/windows_amd64\.json$/);
    expect(fetchImpl.mock.calls.every(([, options]) => options?.redirect === 'error')).toBe(true);
    expect(messages.length).toBeGreaterThan(1);
  });
  it.each([{ url: 'https://evil.example/agy.exe' }, { sha512: '0'.repeat(128) }, { version: '../escape' }, { url: 'https://storage.googleapis.com/another-bucket/cli.exe' }])('rejects untrusted or corrupt releases without publishing executable: %j', async bad => {
    await expect(installAgyBinary({ root, platform: 'win32', arch: 'x64', fetchImpl: fakeFetch(bad) })).rejects.toThrow();
    await expect(readFile(path.join(root, 'agy.exe'))).rejects.toThrow();
  });
  it('fails on unsupported targets and network errors, then a fresh retry can succeed', async () => {
    expect(() => agyManifestPlatform('freebsd', 'x64')).toThrow(/지원/);
    await expect(installAgyBinary({ root, platform: 'win32', arch: 'x64', fetchImpl: vi.fn().mockRejectedValue(Error('offline')) })).rejects.toThrow();
    await expect(installAgyBinary({ root, platform: 'win32', arch: 'x64', fetchImpl: fakeFetch() })).resolves.toHaveProperty('version', '1.4.3');
  });
  it('extracts only the expected POSIX binary, makes it executable and reuses a verified receipt', async () => {
    const binary = path.join(root, 'antigravity'); await writeFile(binary, 'native-binary');
    const archive = path.join(root, 'fixture.tgz'); await c({ cwd: root, file: archive, gzip: true }, ['antigravity']);
    const payload = await readFile(archive); await rm(binary);
    const fetchImpl = vi.fn(async (input: string) => input.includes('/manifests/')
      ? new Response(JSON.stringify({ version: '1.4.3', url: 'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.4.3-123/darwin-arm/cli_mac_arm64.tar.gz', sha512: createHash('sha512').update(payload).digest('hex') }))
      : new Response(payload));
    const result = await installAgyBinary({ root, platform: 'darwin', arch: 'arm64', fetchImpl });
    expect(await readFile(result.executable, 'utf8')).toBe('native-binary');
    if (process.platform !== 'win32') expect((await lstat(result.executable)).mode & 0o700).toBe(0o700);
    await installAgyBinary({ root, platform: 'darwin', arch: 'arm64', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await writeFile(result.executable, 'modified-after-install');
    const receiptPath = path.join(root, '.agy-install.json'); const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    receipt.binarySha512 = createHash('sha512').update('modified-after-install').digest('hex'); await writeFile(receiptPath, JSON.stringify(receipt));
    await installAgyBinary({ root, platform: 'darwin', arch: 'arm64', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(4); expect(await readFile(result.executable, 'utf8')).toBe('native-binary');
  });
  it('preserves an existing binary on a failed update and ignores failing progress observers', async () => {
    const executable = path.join(root, 'agy.exe'); await writeFile(executable, 'existing-good');
    await expect(installAgyBinary({ root, platform: 'win32', arch: 'x64', fetchImpl: fakeFetch({ sha512: 'a'.repeat(128) }), onProgress: () => { throw Error('UI closed'); } })).rejects.toThrow(/무결성/);
    expect(await readFile(executable, 'utf8')).toBe('existing-good');
  });
  it('does not trust a forged receipt accompanying a modified Windows executable', async () => {
    const fetchImpl = fakeFetch(); const result = await installAgyBinary({ root, platform: 'win32', arch: 'x64', fetchImpl });
    await writeFile(result.executable, 'modified-payload');
    const receiptPath = path.join(root, '.agy-install.json'); const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    receipt.binarySha512 = createHash('sha512').update('modified-payload').digest('hex'); await writeFile(receiptPath, JSON.stringify(receipt));
    await installAgyBinary({ root, platform: 'win32', arch: 'x64', fetchImpl });
    expect(await readFile(result.executable)).toEqual(bytes);
  });
  it('closes the download signal after failed and oversized responses', async () => {
    let signal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_url: string, options?: RequestInit) => { signal = options?.signal; return new Response('{}', { status: 503 }); });
    await expect(installAgyBinary({ root, platform: 'win32', arch: 'x64', fetchImpl })).rejects.toThrow();
    expect(signal?.aborted).toBe(true);
  });
  it('rejects huge, failed, malformed and redirected manifests before touching executables', async () => {
    for (const response of [new Response('{}', { status: 503 }), new Response('{}', { headers: { 'content-length': '64001' } }), new Response('not-json'), new Response('x'.repeat(64001))]) {
      await expect(installAgyBinary({ root, platform: 'win32', arch: 'x64', fetchImpl: vi.fn().mockResolvedValue(response) })).rejects.toThrow();
    }
    await expect(installAgyBinary({ root, platform: 'win32', arch: 'arm64', fetchImpl: fakeFetch() })).rejects.toThrow(/공식/);
  });
  it.each([
    ['win32', 'arm64', 'windows-arm/cli_windows_arm64.exe'],
    ['darwin', 'x64', 'darwin-x64/cli_mac_x64.tar.gz'],
    ['linux', 'arm64', 'linux-arm/cli_linux_arm64.tar.gz'],
  ])('matches official release manifest path for %s %s', async (platform, arch, suffix) => {
    await expect(installAgyBinary({ root, platform, arch, fetchImpl: fakeFetch({
      url: `https://storage.googleapis.com/antigravity-public/antigravity-cli/1.4.3-123/${suffix}`, sha512: '0'.repeat(128),
    }) })).rejects.toThrow(/무결성/);
  });
});
