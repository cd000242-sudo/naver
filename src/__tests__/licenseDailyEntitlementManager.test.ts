import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import path from 'node:path';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('fs/promises', () => ({ default: {
  readFile: vi.fn(async (key: string) => { if (!store.has(key)) throw Error('ENOENT'); return store.get(key); }),
  writeFile: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
  mkdir: vi.fn(async () => undefined), access: vi.fn(async () => undefined),
  unlink: vi.fn(async (key: string) => { store.delete(key); }),
} }));
const licensePath = path.join('/mock/userData', 'license', 'license.json');
const future = () => new Date(Date.now() + 10 * 86400_000).toISOString();
const entitlement = () => ({ version: 1, dailyPublishing: true, issuedTermDays: 365, lifetime: false, validUntil: future() });
const response = (extra: Record<string, unknown> = {}) => ({ ok: true, valid: true, licenseType: 'CUSTOM', expiresAt: future(),
  entitlements: entitlement(), ...extra });
const reply = (value: unknown) => ({ ok: true, json: async () => value });
const seed = (extra: Record<string, unknown> = {}) => {
  const value = { deviceId: 'fixture-device', verifiedAt: new Date().toISOString(), isValid: true,
    licenseType: 'premium', authMethod: 'credentials', userId: 'fixture-user', sessionToken: 'fixture-session', ...extra };
  store.set(licensePath, JSON.stringify(value)); return value;
};
beforeEach(() => { store.clear(); vi.resetModules(); process.env.LICENSE_SERVER_URL = 'https://fixture.invalid/license'; });
afterEach(async () => { const mod = await import('../licenseManager.js'); mod.stopSessionValidation(); vi.unstubAllGlobals(); });

describe('verified entitlement transport and forced main recheck', () => {
  it('denies persisted local true until the server confirms and deduplicates concurrent rechecks', async () => {
    seed({ entitlements: entitlement() });
    const fetch = vi.fn(async () => reply(response())); vi.stubGlobal('fetch', fetch);
    const mod = await import('../licenseManager.js');
    const [one, two] = await Promise.all([mod.checkDailyPublishingEntitlement({ forceFresh: true }), mod.checkDailyPublishingEntitlement({ forceFresh: true })]);
    expect(one.allowed).toBe(true); expect(two.allowed).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetch.mock.calls[0][1]?.body as string);
    expect(request.action).toBe('validate-session');
    await mod.checkDailyPublishingEntitlement(); expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockImplementation(async () => reply(response({ entitlements: undefined })));
    expect((await mod.checkDailyPublishingEntitlement({ forceFresh: true })).allowed).toBe(false);
  });
  it('persists explicit denial when a successful revalidation omits entitlement', async () => {
    seed({ licenseCode: 'fixture-code', entitlements: entitlement() });
    vi.stubGlobal('fetch', vi.fn(async () => reply(response({ entitlements: undefined }))));
    const mod = await import('../licenseManager.js');
    expect(await mod.revalidateLicense('https://fixture.invalid/license')).toBe(true);
    expect((await mod.loadLicense())?.entitlements?.dailyPublishing).toBe(false);
  });
  it('updates entitlement on successful session verification and revokes malformed server fields', async () => {
    seed(); const fetch = vi.fn(async () => reply(response())); vi.stubGlobal('fetch', fetch);
    const mod = await import('../licenseManager.js');
    expect((await mod.validateSession('https://fixture.invalid/license')).valid).toBe(true);
    expect((await mod.loadLicense())?.entitlements?.dailyPublishing).toBe(true);
    fetch.mockImplementation(async () => reply(response({ entitlements: { version: 1, dailyPublishing: 'true' } })));
    await mod.validateSession('https://fixture.invalid/license');
    expect((await mod.loadLicense())?.entitlements?.dailyPublishing).toBe(false);
  });
  it('keeps login on network failure but cannot use stale persisted authorization', async () => {
    seed({ entitlements: entitlement() }); vi.stubGlobal('fetch', vi.fn(async () => { throw Error('offline'); }));
    const mod = await import('../licenseManager.js');
    expect((await mod.checkDailyPublishingEntitlement({ forceFresh: true })).allowed).toBe(false);
    expect((await mod.loadLicense())?.isValid).toBe(true);
  });
  it('rejects in-flight grants after account changes', async () => {
    seed(); let finish!: (v: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const mod = await import('../licenseManager.js');
    const checking = mod.checkDailyPublishingEntitlement({ forceFresh: true });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await mod.saveLicense({ ...seed(), userId: 'other-user' } as any);
    finish(reply(response())); expect((await checking).allowed).toBe(false);
  });
  it('uses a read-only code endpoint instead of reactivating an already registered license', async () => {
    seed({ authMethod: 'code', sessionToken: undefined, licenseCode: 'fixture-code' });
    const fetch = vi.fn(async (_url: string, _options: any) => reply(response())); vi.stubGlobal('fetch', fetch);
    const mod = await import('../licenseManager.js');
    expect((await mod.checkDailyPublishingEntitlement({ forceFresh: true })).allowed).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body).action).toBe('daily-entitlement');
  });
  it('does not let old session responses restore a newer forced denial', async () => {
    seed({ entitlements: entitlement() }); let finish!: (value: unknown) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue(reply(response({ entitlements: undefined })));
    vi.stubGlobal('fetch', fetch); const mod = await import('../licenseManager.js');
    const old = mod.validateSession('https://fixture.invalid/license');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect((await mod.checkDailyPublishingEntitlement({ forceFresh: true })).allowed).toBe(false);
    finish(reply(response())); await old;
    expect((await mod.checkDailyPublishingEntitlement()).allowed).toBe(false);
  });
  it('transports only verified credential response entitlement while preserving login on old servers', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(response({ sessionToken: 'fixture-session' })) });
    vi.stubGlobal('fetch', fetch); const mod = await import('../licenseManager.js');
    expect((await mod.verifyLicenseWithCredentials('fixture-user', 'fixture-password', 'fixture-device', 'https://fixture.invalid/license')).license?.entitlements?.dailyPublishing).toBe(true);
    fetch.mockResolvedValue({ ok: true, text: async () => JSON.stringify(response({ sessionToken: 'new-session', entitlements: undefined })) });
    const oldServerLogin = await mod.verifyLicenseWithCredentials('fixture-user', 'fixture-password', 'fixture-device', 'https://fixture.invalid/license');
    expect(oldServerLogin.valid).toBe(true); expect(oldServerLogin.license?.entitlements?.dailyPublishing).toBe(false);
  });
  it('does not restore a grant when a newer denial arrives during an older disk write', async () => {
    seed({ entitlements: entitlement() });
    const fs = (await import('fs/promises')).default;
    let finishWrite!: () => void;
    vi.mocked(fs.writeFile).mockImplementationOnce(async (key: any, value: any) => {
      await new Promise<void>(resolve => { finishWrite = resolve; }); store.set(String(key), String(value));
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(response()))
      .mockResolvedValue(reply(response({ entitlements: undefined }))));
    const mod = await import('../licenseManager.js'); const old = mod.validateSession('https://fixture.invalid/license');
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'));
    expect((await mod.checkDailyPublishingEntitlement({ forceFresh: true })).allowed).toBe(false);
    finishWrite(); await old;
    expect((await mod.checkDailyPublishingEntitlement()).allowed).toBe(false);
  });
});
