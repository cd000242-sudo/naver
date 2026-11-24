import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

// Correcting a licence that was issued for the wrong product (2026-11-24: bank approval issued 올인원 for
// single-product orders). The admin action update-code could change the expiry but not the product.
const source = readFileSync(resolve(__dirname, '../../../admin-panel/google-apps-script-code.gs'), 'utf8');
const body = source.match(/\nfunction handleUpdateCode\([^]*?\n\}/)?.[0];
if (!body) throw new Error('missing function handleUpdateCode');

function server() {
  const headers = ['code', 'platform', 'type', 'used', 'expiresAt', 'customDays', 'userId', 'userPassword', 'naverId', 'naverPassword'];
  const rows: unknown[][] = [headers, ['BK-AAAA', 'ALL', 'CUSTOM', true, new Date('2027-09-19T00:00:00Z'), 365, 'user1', 'hash', '', '']];
  const context = vm.createContext({
    Date, Number, String, Math, JSON, Object, Array, isNaN,
    Logger: { log: () => undefined },
    ContentService: { createTextOutput: (text: string) => ({ setMimeType: () => JSON.parse(text) }), MimeType: { JSON: 'json' } },
    getSheet: () => ({ getRange: (r: number, c: number) => ({ getValue: () => rows[r - 1][c - 1], setValue: (v: unknown) => { rows[r - 1][c - 1] = v; } }) }),
    ensureHeaders: () => headers,
    findColumnIndex: (h: string[], name: string) => h.indexOf(name) + 1,
    findRowByCode: (_sheet: unknown, code: string) => (code === 'BK-AAAA' ? 2 : 0),
    normalizePlatform: (value: string) => ({ naver: 'NAVER', orbit: 'LEADERNAM', leword: 'LEWORD', all: 'ALL' } as Record<string, string>)[String(value).toLowerCase()] || String(value).toUpperCase(),
    getPlatform: (id: string) => (['NAVER', 'LEWORD', 'LEADERNAM', 'LDB_IMG'].includes(id) ? { id } : null),
    isUnlimitedLicense: (type: string, days: unknown) => type === 'LIFE' || Number(days) === -1,
    hashPassword: (v: string) => `hash:${v}`,
  });
  vm.runInContext(body as string, context);
  return { update: (context as unknown as { handleUpdateCode: (d: unknown) => any }).handleUpdateCode, row: rows[1] };
}

describe('update-code: correcting the product of a licence', () => {
  it('changes the product and the expiry together and leaves the account untouched', () => {
    const { update, row } = server();
    const result = update({ code: 'BK-AAAA', platform: 'NAVER', expiresAt: '2026-10-19T00:00:00.000Z' });
    expect(result.ok).toBe(true);
    expect(row[1]).toBe('NAVER');
    expect((row[4] as Date).toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(row[6]).toBe('user1');
    expect(row[7]).toBe('hash');
  });

  it('changes the product alone', () => {
    const { update, row } = server();
    expect(update({ code: 'BK-AAAA', platform: 'leword' }).ok).toBe(true);
    expect(row[1]).toBe('LEWORD');
    expect((row[4] as Date).toISOString()).toBe('2027-09-19T00:00:00.000Z');
  });

  it('refuses a product it does not know and changes nothing', () => {
    const { update, row } = server();
    const result = update({ code: 'BK-AAAA', platform: 'NOPE', expiresAt: '2026-10-19T00:00:00.000Z' });
    expect(result.ok).toBe(false);
    expect(row[1]).toBe('ALL');
    expect((row[4] as Date).toISOString()).toBe('2027-09-19T00:00:00.000Z');
  });

  it('a call without a product leaves the product as it was', () => {
    const { update, row } = server();
    expect(update({ code: 'BK-AAAA', expiresAt: '2026-12-24T00:00:00.000Z' }).ok).toBe(true);
    expect(row[1]).toBe('ALL');
  });
});
