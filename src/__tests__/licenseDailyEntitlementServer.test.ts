import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const source = readFileSync(resolve(__dirname, '../../../admin-panel/google-apps-script-code.gs'), 'utf8');
const functionSource = (name: string) => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || '';
function fixture(patch: Record<string, unknown> = {}) {
  const headers = ['code', 'type', 'customDays', 'expiresAt', 'blocked', 'used', 'platform'];
  const values = { code: 'fixture-code', type: 'CUSTOM', customDays: 365, expiresAt: '2035-01-01T00:00:00Z',
    blocked: false, used: true, platform: 'NAVER', ...patch };
  let writes = 0;
  const row = headers.map(name => values[name as keyof typeof values]);
  const sheet = { getLastColumn: () => headers.length,
    getRange: (rowIndex: number) => ({ getValues: () => [rowIndex === 1 ? headers : row], setValue: () => { writes++; throw Error('must be read-only'); } }) };
  const context = vm.createContext({ Date, Number, String, Boolean, Object, Array,
    getSheet: () => sheet, ensureHeaders: () => headers,
    findColumnIndex: (_headers: string[], name: string) => headers.indexOf(name) + 1,
    findRowByCode: (_sheet: unknown, code: string) => code === 'fixture-code' ? 2 : null,
    extractPlatformFromAppId: (appId: string) => appId === 'com.betterlife.naver' ? 'NAVER' : 'OTHER',
    normalizePlatform: (value: string) => value,
    licenseAllowsPlatform: (stored: string, platform: string) => stored === 'ALL' || stored === platform,
    getPlatformRuntimeSettings: () => ({ serviceEnabled: true }),
    serviceMaintenanceResponse: () => ({ valid: false, code: 'SERVICE_DISABLED' }),
    isUserBlockedByDeviceId: (id: string) => id === 'blocked-device',
    authFail: (code: string) => ({ valid: false, code }),
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (value: string) => ({ setMimeType: () => JSON.parse(value) }) },
  });
  for (const name of ['dailyPublishingEntitlements_', 'dailyPublishingEntitlementsForRow_', 'handleDailyPublishingEntitlement']) {
    vm.runInContext(functionSource(name), context);
  }
  return { call: (input: Record<string, unknown> = {}) => vm.runInContext('handleDailyPublishingEntitlement(input)',
    Object.assign(context, { input: { code: 'fixture-code', deviceId: 'fixture-device', appId: 'com.betterlife.naver', ...input } })),
    writes: () => writes };
}

describe('read-only authenticated code-license feature endpoint', () => {
  it('supports already-used non-ALL code licenses without activation or renewal writes', () => {
    const api = fixture(); const value = api.call();
    expect(value.valid).toBe(true); expect(value.entitlements.dailyPublishing).toBe(true); expect(api.writes()).toBe(0);
  });
  it.each([
    { code: '' }, { code: 'wrong-code' }, { deviceId: '' }, { appId: '' }, { appId: 'other-app' }, { deviceId: 'blocked-device' },
  ])('rejects invalid identity/platform/device %j', input => {
    expect(fixture().call(input).valid).toBe(false);
  });
  it.each([{ blocked: true }, { used: false }, { platform: 'LEWORD' }])('rejects unusable authoritative row %j', row => {
    expect(fixture(row).call().valid).toBe(false);
  });
  it('ignores caller supplied entitlement and duration, and rejects malformed stored terms', () => {
    const input = { entitlements: { version: 1, dailyPublishing: true }, type: 'LIFE', customDays: 730 };
    expect(fixture({ customDays: 30 }).call(input).entitlements.dailyPublishing).toBe(false);
    expect(fixture({ type: 'UNKNOWN', customDays: 730 }).call(input).entitlements.dailyPublishing).toBe(false);
    expect(fixture({ expiresAt: null }).call(input).entitlements.dailyPublishing).toBe(false);
  });
  it('keeps explicit denial for expired licenses and allows server-issued lifetime', () => {
    expect(fixture({ expiresAt: '2020-01-01T00:00:00Z' }).call().entitlements.dailyPublishing).toBe(false);
    expect(fixture({ type: 'LIFE', customDays: -1, expiresAt: null }).call().entitlements.dailyPublishing).toBe(true);
  });
});
