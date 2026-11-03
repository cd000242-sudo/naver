import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('fs/promises', () => ({ default: {
  readFile: vi.fn(async (key: string) => { if (!store.has(key)) throw Error('ENOENT'); return store.get(key); }),
  writeFile: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
  mkdir: vi.fn(async () => undefined), access: vi.fn(async () => undefined),
  unlink: vi.fn(async (key: string) => { store.delete(key); }),
} }));
vi.mock('../configManager.js', () => ({ loadConfig: vi.fn(async () => ({})), saveConfig: vi.fn(async () => undefined) }));
const licensePath = path.join('/mock/userData', 'license', 'license.json');
const url = 'https://fixture.invalid/license';
const response = (userId = 'owner', patch = {}) => ({ ok: true, valid: true, licenseType: 'CUSTOM',
  userId, sessionToken: `private-session-${userId}`, expiresAt: '2030-01-01T00:00:00Z',
  entitlements: { version: 1, dailyPublishing: true, issuedTermDays: 365, lifetime: false, validUntil: '2030-01-01T00:00:00Z' }, ...patch });
const reply = (body: unknown) => ({ ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(body) });
type Kind = 'credentials' | 'register' | 'code';
const invoke = (mod: typeof import('../licenseManager.js'), kind: Kind, user = 'owner') => kind === 'credentials'
  ? mod.verifyLicenseWithCredentials(user, 'private-password', 'device', url)
  : kind === 'register' ? mod.registerLicense(`private-code-${user}`, user, 'private-password', 'fixture@example.invalid', 'device', url)
    : mod.verifyLicense(`private-code-${user}`, 'device', url, 'fixture@example.invalid');
beforeEach(() => { store.clear(); vi.resetModules(); });
afterEach(async () => { (await import('../licenseManager.js')).stopSessionValidation(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe.each<Kind>(['credentials', 'register', 'code'])('%s request-start authentication generation', kind => {
  it('cannot log in or grant entitlement after an explicit logout while awaiting the server', async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const mod = await import('../licenseManager.js'); const pending = invoke(mod, kind);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await mod.clearLicense(); finish(reply(response()));
    expect((await pending).valid).toBe(false);
    expect(await mod.loadLicense()).toBeNull(); expect(store.has(licensePath)).toBe(false);
    expect((await mod.checkDailyPublishingEntitlement()).allowed).toBe(false);
  });
  it('keeps the latest login when the earlier server response arrives last', async () => {
    const finishes: ((value: unknown) => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finishes.push(resolve); })));
    const mod = await import('../licenseManager.js');
    const old = invoke(mod, kind, 'old-owner'); const latest = invoke(mod, kind, 'latest-owner');
    await vi.waitFor(() => expect(finishes).toHaveLength(2));
    finishes[1](reply(response('latest-owner'))); expect((await latest).valid).toBe(true);
    finishes[0](reply(response('old-owner'))); expect((await old).valid).toBe(false);
    expect((await mod.loadLicense())?.userId).toBe('latest-owner');
  });
  it('does not log license/password/token echoes in server validation errors', async () => {
    const logs: unknown[][] = [];
    for (const method of ['log', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation((...args) => { logs.push(args); });
    vi.stubGlobal('fetch', vi.fn(async () => reply(response('owner', { valid: false, ok: false,
      error: 'Rejected', userPassword: 'private-password', licenseCode: 'private-code-owner' }))));
    const mod = await import('../licenseManager.js'); expect((await invoke(mod, kind)).valid).toBe(false);
    expect(JSON.stringify(logs)).not.toContain('private-code');
    expect(JSON.stringify(logs)).not.toContain('private-password');
    expect(JSON.stringify(logs)).not.toContain('private-session');
  });
});

it('does not recreate a license when logout occurs during an already-started disk write', async () => {
  const fs = (await import('fs/promises')).default;
  let finishWrite!: () => void;
  vi.mocked(fs.writeFile).mockImplementationOnce(async (key: any, value: any) => {
    await new Promise<void>(resolve => { finishWrite = resolve; }); store.set(String(key), String(value));
  });
  vi.stubGlobal('fetch', vi.fn(async () => reply(response())));
  const mod = await import('../licenseManager.js'); const login = invoke(mod, 'credentials');
  await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'));
  const logout = mod.clearLicense(); finishWrite();
  await logout; expect((await login).valid).toBe(false);
  expect(await mod.loadLicense()).toBeNull(); expect(store.has(licensePath)).toBe(false);
});

describe('license reads retain their starting state generation', () => {
  const oldLicense = () => ({ deviceId: 'device', isValid: true, verifiedAt: new Date().toISOString(),
    licenseType: 'premium', licenseCode: 'private-old-code', userId: 'old-owner', entitlements: response().entitlements });
  it('discards a deferred JSON snapshot after logout and never restores the ENOENT cache fallback', async () => {
    store.set(licensePath, JSON.stringify(oldLicense()));
    const mod = await import('../licenseManager.js'); await mod.loadLicense();
    const fs = (await import('fs/promises')).default; let finishRead!: (raw: string) => void;
    vi.mocked(fs.readFile).mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve as any; }));
    const pending = mod.loadLicense(); await vi.waitFor(() => expect(finishRead).toBeTypeOf('function'));
    await mod.clearLicense(); finishRead(JSON.stringify(oldLicense()));
    expect(await pending).toBeNull(); expect(mod.getCachedLicense()).toBeNull();
    expect(await mod.loadLicense()).toBeNull();
    const fetch = vi.fn(async () => reply(response())); vi.stubGlobal('fetch', fetch);
    expect((await mod.checkDailyPublishingEntitlement({ forceFresh: true })).allowed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('discards an old read after a newer login instead of replacing the new cache identity', async () => {
    store.set(licensePath, JSON.stringify(oldLicense()));
    const mod = await import('../licenseManager.js'); const fs = (await import('fs/promises')).default;
    let finishRead!: (raw: string) => void;
    vi.mocked(fs.readFile).mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve as any; }));
    const pending = mod.loadLicense(); await vi.waitFor(() => expect(finishRead).toBeTypeOf('function'));
    vi.stubGlobal('fetch', vi.fn(async () => reply(response('latest-owner'))));
    expect((await invoke(mod, 'credentials', 'latest-owner')).valid).toBe(true);
    finishRead(JSON.stringify(oldLicense()));
    expect(await pending).toBeNull(); expect(mod.getCachedLicense()?.userId).toBe('latest-owner');
  });
  it('discards a snapshot started during a write when that write commits before the read returns', async () => {
    store.set(licensePath, JSON.stringify(oldLicense()));
    const mod = await import('../licenseManager.js'); const fs = (await import('fs/promises')).default;
    let finishWrite!: () => void; let finishRead!: (raw: string) => void;
    vi.mocked(fs.writeFile).mockImplementationOnce(async (key: any, value: any) => {
      await new Promise<void>(resolve => { finishWrite = resolve; }); store.set(String(key), String(value));
    });
    const writing = mod.saveLicense({ ...oldLicense(), userId: 'latest-owner' } as any);
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'));
    vi.mocked(fs.readFile).mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve as any; }));
    const pending = mod.loadLicense(); await vi.waitFor(() => expect(finishRead).toBeTypeOf('function'));
    finishWrite(); await writing; finishRead(JSON.stringify(oldLicense()));
    expect(await pending).toBeNull(); expect(mod.getCachedLicense()?.userId).toBe('latest-owner');
  });
});
