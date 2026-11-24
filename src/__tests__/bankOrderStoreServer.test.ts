import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

// Bank-transfer orders, server side (2026-11-24). Approval used to look the product up by AMOUNT in an old table and
// issued "올인원 1년" for anything it did not know: Naver 1개월 29,000원, 올인원 3개월 150,000원 and 올인원 영구제
// 2,000,000원 all came out as a one-year ALL licence. Now the order carries its product id and approval issues that.
const source = readFileSync(resolve(__dirname, '../../../admin-panel/google-apps-script-code.gs'), 'utf8');
const functionSource = (name: string) => {
  const found = source.match(new RegExp(`\\nfunction ${name}\\([^]*?\\n\\}`))?.[0];
  if (!found) throw new Error(`missing function ${name}`);
  return found;
};
const varSource = (name: string) => {
  const found = source.match(new RegExp(`\\nvar ${name} = [^]*?;\\r?\\n`))?.[0];
  if (!found) throw new Error(`missing var ${name}`);
  return found;
};

type Row = unknown[];

function server(siteContent: unknown = {}, rows: Row[] = []) {
  const log = { licenses: [] as Array<Record<string, unknown>>, mails: [] as unknown[][] };
  const sheetRows: Row[] = [['orderId', 'name', 'email', 'product', 'amount', 'status', 'licenseCode', 'createdAt', 'approvedAt'], ...rows];
  let codeNo = 0;
  let row: Record<string, unknown> = {};
  const columns = ['code', 'platform', 'type', 'used', 'customDays'];
  const cell = (r: number, c: number) => ({
    setValue: (value: unknown) => { while (sheetRows.length < r) sheetRows.push([]); sheetRows[r - 1][c - 1] = value; },
    getValue: () => (sheetRows[r - 1] || [])[c - 1] ?? '',
  });
  const stubs = {
    Number, String, Object, Array, Math, JSON, RegExp, Date,
    Logger: { log: () => undefined },
    readSiteContent_: () => siteContent,
    normalizePlatform: (value: string) => String(value || '').trim().toUpperCase(),
    getPlatform: (id: string) => (['NAVER', 'LEWORD', 'LEADERNAM', 'LDB_IMG'].includes(id) ? { id } : null),
    ContentService: { createTextOutput: (text: string) => ({ setMimeType: () => JSON.parse(text) }), MimeType: { JSON: 'json' } },
    normalizeAdminToken_: (token: string) => token,
    getAdminToken: () => 'admin-fixture',
    getBankOrderSheet: () => ({ getDataRange: () => ({ getValues: () => sheetRows.map((r) => [...r]) }), getRange: cell, appendRow: (r: Row) => { sheetRows.push(r); } }),
    generateCode: () => `BK-TEST-${++codeNo}`,
    getSheet: () => ({ getLastRow: () => log.licenses.length + 1, getRange: (_r: number, c: number) => ({ setValue: (value: unknown) => { row[columns[c - 1]] = value; } }) }),
    ensureHeaders: () => columns,
    findColumnIndex: (headers: string[], name: string) => headers.indexOf(name) + 1,
    SpreadsheetApp: { flush: () => { if (row.code) { log.licenses.push(row); row = {}; } } },
    sendLicenseEmail: (...args: unknown[]) => { log.mails.push(args); },
    MailApp: { sendEmail: () => undefined },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://example.test/exec' }) },
    ADMIN_EMAIL: 'admin@example.test',
  };
  const context = vm.createContext(stubs);
  vm.runInContext([
    ...['STORE_PRODUCT_SEEDS_', 'STORE_TERMS_'].map(varSource),
    ...['storeCatalog_', 'storeCardAmount_', 'storeOrderShape_', 'resolveStoreOrder_', 'bankProductIdFromLabel_', 'bankOrderShape_', 'bankOrderCheck_',
      'handleBankOrder', 'handleBankApprove'].map(functionSource),
  ].join('\n'), context);
  return { fn: context as unknown as Record<string, (...args: unknown[]) => any>, log, sheetRows };
}

const order = (orderId: string, product: string, amount: number, productId?: string): Row =>
  [orderId, '홍길동', 'buyer@example.test', product, amount, 'pending', '', '2026-11-24T00:00:00.000Z', '', ...(productId === undefined ? [] : [productId])];
const approve = (orderId: string) => ({ adminToken: 'admin-fixture', orderId });

describe('bank orders: what the transfer amount must be', () => {
  it('accepts the store price before VAT (LEWORD monthly is the shown price) and the 올인원 options of the bank page', () => {
    const { fn } = server();
    expect(fn.bankOrderCheck_('naver-monthly', 29000)).toMatchObject({ ok: true });
    expect(fn.bankOrderCheck_('leword-monthly', 19900)).toMatchObject({ ok: true });
    expect(fn.bankOrderCheck_('naver+leword-yearly', 499000)).toMatchObject({ ok: true });
    expect(fn.bankOrderCheck_('all-in-one-monthly', 50000)).toMatchObject({ ok: true });
    expect(fn.bankOrderCheck_('all-in-one-quarterly', 150000)).toMatchObject({ ok: true });
    expect(fn.bankOrderCheck_('all-in-one-yearly', 500000)).toMatchObject({ ok: true });
    expect(fn.bankOrderCheck_('all-in-one-lifetime', 2000000)).toMatchObject({ ok: true });
  });

  it('refuses an amount that is not today’s price and an id it cannot read; an order with no id (old page) is taken as before', () => {
    const { fn } = server();
    expect(fn.bankOrderCheck_('all-yearly', 400000)).toMatchObject({ ok: false });
    expect(fn.bankOrderCheck_('all-in-one-quarterly', 120000)).toMatchObject({ ok: false });
    expect(fn.bankOrderCheck_('ghost-yearly', 1000)).toMatchObject({ ok: false });
    expect(fn.bankOrderCheck_('whatever', 1000)).toMatchObject({ ok: false });
    expect(fn.bankOrderCheck_('', 123456)).toMatchObject({ ok: true });
  });
});

describe('bank orders: what an approval issues', () => {
  it('reads the product id of the order', () => {
    const { fn } = server();
    expect(fn.bankOrderShape_('naver-monthly', '')).toMatchObject({ licenseType: 'CUSTOM', customDays: 30, items: [{ platform: 'NAVER' }] });
    expect(fn.bankOrderShape_('all-in-one-lifetime', '')).toMatchObject({ licenseType: 'LIFE', customDays: -1, items: [{ platform: 'ALL' }] });
    expect(fn.bankOrderShape_('all-in-one-quarterly', '')).toMatchObject({ licenseType: 'CUSTOM', customDays: 90, items: [{ platform: 'ALL' }] });
    expect(fn.bankOrderShape_('naver+orbit-yearly', '').items.map((item: { platform: string }) => item.platform)).toEqual(['NAVER', 'LEADERNAM']);
  });

  it('reads the product from the name for orders taken before the id was sent', () => {
    const { fn } = server();
    expect(fn.bankOrderShape_('', 'Better Life Naver · LEWORD 1년')).toMatchObject({ customDays: 365, items: [{ platform: 'NAVER' }, { platform: 'LEWORD' }] });
    expect(fn.bankOrderShape_('', 'Leaders Pro All in one 영구제')).toMatchObject({ licenseType: 'LIFE', items: [{ platform: 'ALL' }] });
    expect(fn.bankOrderShape_('', 'Leaders Pro All in one 3개월')).toMatchObject({ customDays: 90, items: [{ platform: 'ALL' }] });
    expect(fn.bankOrderShape_('', 'Leadernam Orbit 1개월')).toMatchObject({ customDays: 30, items: [{ platform: 'LEADERNAM' }] });
    expect(fn.bankOrderShape_('', '무슨 상품인지 모름')).toBeNull();
    expect(fn.bankOrderShape_('', 'Better Life Naver · 모르는 제품 1년')).toBeNull();
  });

  it('still approves an order whose product was taken off sale after the order was placed', () => {
    const { fn } = server({ store: { products: { orbit: { status: 'off' } } } });
    expect(fn.bankOrderShape_('orbit-yearly', '')).toMatchObject({ customDays: 365, items: [{ platform: 'LEADERNAM' }] });
  });

  it('Naver 1개월 29,000원 gets a 30-day NAVER licence, not 올인원 1년', () => {
    const { fn, log, sheetRows } = server({}, [order('BK-1', 'Better Life Naver 1개월', 29000, 'naver-monthly')]);
    const result = fn.handleBankApprove(approve('BK-1'));
    expect(result).toMatchObject({ ok: true, status: 'approved', code: 'BK-TEST-1' });
    expect(log.licenses).toEqual([{ code: 'BK-TEST-1', platform: 'NAVER', type: 'CUSTOM', used: false, customDays: 30 }]);
    expect(sheetRows[1][5]).toBe('approved');
    expect(sheetRows[1][6]).toBe('BK-TEST-1');
  });

  it('올인원 영구제 2,000,000원 gets a lifetime licence and 올인원 3개월 gets 90 days', () => {
    const { fn, log } = server({}, [order('BK-1', 'Leaders Pro All in one 영구제', 2000000, 'all-in-one-lifetime'), order('BK-2', 'Leaders Pro All in one 3개월', 150000, 'all-in-one-quarterly')]);
    fn.handleBankApprove(approve('BK-1'));
    fn.handleBankApprove(approve('BK-2'));
    expect(log.licenses[0]).toMatchObject({ platform: 'ALL', type: 'LIFE', customDays: -1 });
    expect(log.licenses[1]).toMatchObject({ platform: 'ALL', type: 'CUSTOM', customDays: 90 });
  });

  it('a cart gets one licence and one mail per product', () => {
    const { fn, log, sheetRows } = server({}, [order('BK-1', 'Better Life Naver · LEWORD 1년', 499000, 'naver+leword-yearly')]);
    const result = fn.handleBankApprove(approve('BK-1'));
    expect(result).toMatchObject({ ok: true, code: 'BK-TEST-1, BK-TEST-2' });
    expect(log.licenses.map((l) => [l.platform, l.customDays])).toEqual([['NAVER', 365], ['LEWORD', 365]]);
    expect(log.mails.map((m) => [m[1], m[2], m[3]])).toEqual([['BK-TEST-1', 'Better Life Naver 1년', 'NAVER'], ['BK-TEST-2', 'LEWORD 1년', 'LEWORD']]);
    expect(sheetRows[1][6]).toBe('BK-TEST-1, BK-TEST-2');
  });

  it('an order it cannot read is NOT approved as 올인원 1년: nothing is issued and the order stays pending', () => {
    const { fn, log, sheetRows } = server({}, [order('BK-1', '무슨 상품인지 모름', 77000)]);
    const result = fn.handleBankApprove(approve('BK-1'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('자동으로 발급하지 않았습니다');
    expect(log.licenses).toHaveLength(0);
    expect(sheetRows[1][5]).toBe('pending');
  });
});

describe('bank orders: taking the order', () => {
  it('keeps the product id with the order and refuses an amount that is not today’s price', () => {
    const { fn, sheetRows } = server();
    const ok = fn.handleBankOrder({ name: '홍길동', email: 'buyer@example.test', product: 'Better Life Naver 1개월', amount: 29000, productId: 'naver-monthly' });
    expect(ok.ok).toBe(true);
    expect(sheetRows[1][9]).toBe('naver-monthly');
    expect(sheetRows[0][9]).toBe('productId');
    const stale = fn.handleBankOrder({ name: '홍길동', email: 'buyer@example.test', product: 'All in one 1년', amount: 400000, productId: 'all-yearly' });
    expect(stale.ok).toBe(false);
    expect(sheetRows).toHaveLength(2);
  });
});
