import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

// Card payments of the store, server side (owner report 2026-11-24: paying for 올인원 by card answered
// "올바르지 않은 상품입니다"). The store sends ids such as 'all-yearly' with the VAT-included amount; the server
// must read that id, check the amount against today's price, and never fall back to an old product of the same name.
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

const PLATFORM_IDS = ['NAVER', 'LEWORD', 'LEADERNAM', 'LDB_IMG'];

function server(siteContent: unknown = {}, siteReads = { count: 0 }) {
  const log = { licenses: [] as Array<Record<string, unknown>>, orders: [] as unknown[][], mails: [] as unknown[][], confirms: [] as unknown[] };
  let codeNo = 0;
  let row: Record<string, unknown> = {};
  const columns = ['code', 'platform', 'type', 'used', 'customDays'];
  const licenseSheet = {
    getLastRow: () => log.licenses.length + 1,
    getRange: (_row: number, col: number) => ({ setValue: (value: unknown) => { row[columns[col - 1]] = value; } }),
  };
  const stubs = {
    Number, String, Object, Array, Math, JSON, RegExp,
    Logger: { log: () => undefined },
    readSiteContent_: () => { siteReads.count += 1; return siteContent; },
    normalizePlatform: (value: string) => String(value || '').trim().toUpperCase(),
    getPlatform: (id: string) => (PLATFORM_IDS.includes(id) ? { id } : null),
    jsonpResponse: (_callback: string, data: unknown) => data,
    getOrderSheet: () => ({ getDataRange: () => ({ getValues: () => [['orderId', 'paymentKey'], ...log.orders] }), appendRow: (r: unknown[]) => { log.orders.push(r); } }),
    getTossSecretKey: () => 'test_sk_fixture',
    Utilities: { base64Encode: (v: string) => v },
    UrlFetchApp: { fetch: (_url: string, req: { payload: string }) => { log.confirms.push(JSON.parse(req.payload)); return { getResponseCode: () => 200, getContentText: () => '{}' }; } },
    getAvailableCode: () => ({ ok: false }),
    generateLicenseCode: () => `LP-TEST-${++codeNo}`,
    getSheet: () => licenseSheet,
    ensureHeaders: () => columns,
    findColumnIndex: (headers: string[], name: string) => headers.indexOf(name) + 1,
    SpreadsheetApp: { flush: () => { if (row.code) { log.licenses.push(row); row = {}; } } },
    sendLicenseEmail: (...args: unknown[]) => { log.mails.push(args); },
    MailApp: { sendEmail: () => undefined },
    ADMIN_EMAIL: 'admin@example.test',
  };
  const context = vm.createContext(stubs);
  const code = [
    ...['STORE_PRODUCT_SEEDS_', 'STORE_TERMS_', 'SUBSCRIPTION_PRODUCTS'].map(varSource),
    ...['storeCatalog_', 'storeCardAmount_', 'storeOrderShape_', 'resolveStoreOrder_', 'subscriptionProductFor_', 'subscriptionShape_', 'subscriptionAlreadyHeld_', 'handleConfirmPaymentJSONP'].map(functionSource),
  ].join('\n');
  vm.runInContext(code, context);
  return { fn: context as unknown as Record<string, (...args: unknown[]) => any>, log };
}

describe('store card payments: reading the product id', () => {
  it('accepts the bundle for every term at the VAT-included price (the owner report: 올인원 1년 · 영구제 were refused)', () => {
    const { fn } = server();
    expect(fn.resolveStoreOrder_('all-monthly', 55000)).toMatchObject({ ok: true, term: 'monthly', amount: 55000, platform: 'ALL' });
    const yearly = fn.resolveStoreOrder_('all-yearly', 550000);
    expect(yearly).toMatchObject({ ok: true, term: 'yearly', amount: 550000, customDays: 365, licenseType: 'CUSTOM', platform: 'ALL', name: 'Leaders Pro 올인원 1년' });
    expect(fn.resolveStoreOrder_('all-lifetime', 2200000)).toMatchObject({ ok: true, licenseType: 'LIFE', customDays: -1 });
  });

  it('gives each single product its own platform and price; LEWORD monthly is VAT included', () => {
    const { fn } = server();
    expect(fn.resolveStoreOrder_('naver-monthly', 31900)).toMatchObject({ ok: true, platform: 'NAVER', amount: 31900 });
    expect(fn.resolveStoreOrder_('orbit-yearly', 440000)).toMatchObject({ ok: true, platform: 'LEADERNAM' });
    expect(fn.resolveStoreOrder_('leword-monthly', 19900)).toMatchObject({ ok: true, platform: 'LEWORD', amount: 19900 });
    expect(fn.resolveStoreOrder_('leword-yearly', 218900)).toMatchObject({ ok: true, amount: 218900 });
  });

  it('reads a cart as one licence per product and adds the amounts', () => {
    const { fn } = server();
    const cart = fn.resolveStoreOrder_('naver+orbit-yearly', 770000);
    expect(cart).toMatchObject({ ok: true, amount: 770000, platform: '' });
    expect(cart.items.map((item: { platform: string }) => item.platform)).toEqual(['NAVER', 'LEADERNAM']);
  });

  it('refuses a wrong amount, a product not on sale, a term with no price and a repeated product; old ids are not store ids', () => {
    const { fn } = server();
    expect(fn.resolveStoreOrder_('all-yearly', 400000)).toMatchObject({ ok: false, expected: 550000 });
    expect(fn.resolveStoreOrder_('leword-lifetime', 1000)).toMatchObject({ ok: false });
    expect(fn.resolveStoreOrder_('ghost-yearly', 1000)).toMatchObject({ ok: false });
    expect(fn.resolveStoreOrder_('naver+naver-yearly', 660000)).toMatchObject({ ok: false });
    expect(fn.resolveStoreOrder_('all-in-one-yearly', 400000)).toBeNull();
    expect(fn.resolveStoreOrder_('naver-quarterly', 120000)).toBeNull();
    expect(fn.resolveStoreOrder_('', 55000)).toBeNull();
  });

  it('takes whole won only', () => {
    const { fn } = server();
    expect(fn.resolveStoreOrder_('naver-monthly', 31900.5)).toMatchObject({ ok: false });
    expect(fn.resolveStoreOrder_('naver-monthly', '31900')).toMatchObject({ ok: true });
  });

  it('uses the price and the on/off switch the admin saved', () => {
    const { fn } = server({ store: { products: { all: { prices: { monthly: 60000, yearly: 600000 } }, orbit: { status: 'off' } } } });
    expect(fn.resolveStoreOrder_('all-yearly', 660000)).toMatchObject({ ok: true });
    expect(fn.resolveStoreOrder_('all-yearly', 550000)).toMatchObject({ ok: false, expected: 660000 });
    expect(fn.resolveStoreOrder_('all-lifetime', 2200000)).toMatchObject({ ok: false });
    expect(fn.resolveStoreOrder_('orbit-monthly', 42900)).toMatchObject({ ok: false });
  });
});

describe('store card payments: card registration (monthly subscription)', () => {
  it('a store monthly product subscribes at today’s price and is stored apart from the old id of the same name', () => {
    const { fn } = server();
    expect(fn.subscriptionProductFor_('naver-monthly', 31900)).toMatchObject({ productId: 'store:naver-monthly@NAVER', product: { amount: 31900, platform: 'NAVER', days: 30 } });
    expect(fn.subscriptionProductFor_('leword-monthly', 19900)).toMatchObject({ productId: 'store:leword-monthly@LEWORD', product: { amount: 19900, platform: 'LEWORD' } });
    expect(fn.subscriptionProductFor_('all-monthly', 55000)).toMatchObject({ productId: 'store:all-monthly@ALL', product: { amount: 55000, platform: 'ALL' } });
  });

  it('never charges an old product for a store id: naver-monthly at 31,900 is not 올인원 55,000', () => {
    const { fn } = server({ store: { products: { naver: { prices: { monthly: 35000 } } } } });
    const stale = fn.subscriptionProductFor_('naver-monthly', 31900);
    expect(stale.product).toBeUndefined();
    expect(stale.error).toContain('지금 가격과 다릅니다');
  });

  it('sells nothing from the old price table any more: old ids and amount-only requests are refused (review 2026-11-24)', () => {
    const { fn } = server();
    // The old table let a hand-made request register 올인원 at last season's price, or a store id at the old meaning of its name.
    const cases: Array<[string, number]> = [['naver-monthly', 55000], ['all-in-one-monthly', 55000], ['all-in-one-yearly', 400000], ['naver-yearly', 400000], ['', 120000], ['', 55000]];
    for (const [id, amount] of cases) {
      const got = fn.subscriptionProductFor_(id, amount);
      expect(got.product, `${id} ${amount}`).toBeUndefined();
      expect(got.error, `${id} ${amount}`).toBeTruthy();
    }
  });

  it('sends yearly, lifetime and carts to the one-time payment instead of registering a card for renewal', () => {
    const { fn } = server();
    expect(fn.subscriptionProductFor_('all-yearly', 550000).error).toContain('일반 카드결제');
    expect(fn.subscriptionProductFor_('all-lifetime', 2200000).error).toContain('일반 카드결제');
    expect(fn.subscriptionProductFor_('naver+orbit-monthly', 74800).error).toContain('일반 카드결제');
  });

  it('renews a store subscription on its own platform', () => {
    const reads = { count: 0 };
    const { fn } = server({}, reads);
    // The platform is written into the row id, so the renewal job does not read the site settings for every row.
    expect(fn.subscriptionShape_('store:naver-monthly@NAVER')).toMatchObject({ days: 30, platform: 'NAVER', licenseType: 'CUSTOM' });
    expect(reads.count).toBe(0);
    // Rows written on 2026-11-24 before the platform was added to the id.
    expect(fn.subscriptionShape_('store:naver-monthly')).toMatchObject({ days: 30, platform: 'NAVER' });
    // Rows of subscriptions sold before the store keep renewing as they were sold.
    expect(fn.subscriptionShape_('all-in-one-monthly')).toMatchObject({ platform: 'ALL', days: 30 });
    expect(fn.subscriptionShape_('leword-monthly')).toMatchObject({ platform: 'LEWORD', days: 30 });
  });

  it('a store subscription whose product no longer exists is not renewed as 올인원', () => {
    const { fn } = server();
    expect(fn.subscriptionShape_('store:ghost-monthly')).toBeNull();
    const renewals = functionSource('processAutoRenewals');
    expect(renewals.indexOf('subscriptionShape_(productId)')).toBeGreaterThan(-1);
    expect(renewals.indexOf('subscriptionShape_(productId)')).toBeLessThan(renewals.indexOf('api.tosspayments.com/v1/billing/'));
    expect(renewals).toMatch(/if \(!product\) \{[^]*?continue;/);
  });

  it('the same e-mail may subscribe to another product, but not to one it already holds', () => {
    const { fn } = server();
    expect(fn.subscriptionAlreadyHeld_('store:naver-monthly@NAVER', 'NAVER')).toBe(true);
    expect(fn.subscriptionAlreadyHeld_('store:naver-monthly@NAVER', 'LEADERNAM')).toBe(false);
    expect(fn.subscriptionAlreadyHeld_('store:naver-monthly@NAVER', 'ALL')).toBe(false);
    // 올인원 already opens every product.
    expect(fn.subscriptionAlreadyHeld_('all-in-one-monthly', 'NAVER')).toBe(true);
    expect(fn.subscriptionAlreadyHeld_('store:all-monthly@ALL', 'ALL')).toBe(true);
    // A row that cannot be read blocks, as before.
    expect(fn.subscriptionAlreadyHeld_('store:ghost-monthly', 'NAVER')).toBe(true);
    expect(functionSource('handleStartTrialJSONP')).toContain('subscriptionAlreadyHeld_(');
  });

  it('both card-registration handlers and the renewal job use the resolver', () => {
    for (const name of ['handleRegisterBillingJSONP', 'handleStartTrialJSONP']) {
      const body = functionSource(name);
      expect(body).toContain('subscriptionProductFor_(productId, amount)');
      expect(body).not.toMatch(/SUBSCRIPTION_AMOUNT_MAP/);
    }
    expect(source).not.toMatch(/SUBSCRIPTION_AMOUNT_MAP|(?<!BANK_)PRODUCT_MAP\[amount\]/);
  });
});

describe('store card payments: one-time payment (instalments are chosen in the Toss window)', () => {
  const pay = (product: string, amount: number, extra: Record<string, unknown> = {}) => ({
    callback: 'cb', paymentKey: `pk_${product}_${amount}`, orderId: `LP_${amount}`, amount: String(amount), email: 'buyer@example.test', product, ...extra,
  });

  it('올인원 1년: confirms 550,000 and issues one ALL licence for 365 days', () => {
    const { fn, log } = server();
    const result = fn.handleConfirmPaymentJSONP(pay('all-yearly', 550000));
    expect(result).toMatchObject({ ok: true, code: 'LP-TEST-1', product: 'Leaders Pro 올인원 1년' });
    expect(log.confirms).toEqual([{ paymentKey: 'pk_all-yearly_550000', orderId: 'LP_550000', amount: 550000 }]);
    expect(log.licenses).toEqual([{ code: 'LP-TEST-1', platform: 'ALL', type: 'CUSTOM', used: false, customDays: 365 }]);
    expect(log.mails).toEqual([['buyer@example.test', 'LP-TEST-1', 'Leaders Pro 올인원 1년', 'ALL']]);
  });

  it('올인원 영구제: a lifetime licence', () => {
    const { fn, log } = server();
    expect(fn.handleConfirmPaymentJSONP(pay('all-lifetime', 2200000))).toMatchObject({ ok: true });
    expect(log.licenses[0]).toMatchObject({ platform: 'ALL', type: 'LIFE', customDays: -1 });
  });

  it('a cart gets one licence and one mail per product', () => {
    const { fn, log } = server();
    const result = fn.handleConfirmPaymentJSONP(pay('naver+orbit-yearly', 770000));
    expect(result).toMatchObject({ ok: true, code: 'LP-TEST-1, LP-TEST-2' });
    expect(log.licenses.map((l) => l.platform)).toEqual(['NAVER', 'LEADERNAM']);
    // The term is in the name: the licence mail adds its one-year notes by that word.
    expect(log.mails.map((m) => [m[1], m[2], m[3]])).toEqual([['LP-TEST-1', 'Better Life Naver 1년', 'NAVER'], ['LP-TEST-2', 'Leadernam Orbit 1년', 'LEADERNAM']]);
    expect(log.orders).toHaveLength(1);
  });

  it('a store id with the wrong amount is refused BEFORE the payment is confirmed (nothing is charged)', () => {
    const { fn, log } = server();
    const result = fn.handleConfirmPaymentJSONP(pay('all-yearly', 400000));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('지금 가격과 다릅니다');
    expect(log.confirms).toHaveLength(0);
    expect(log.licenses).toHaveLength(0);
  });

  it('a payment with no store id is refused before it is confirmed: last season’s amounts buy nothing (review 2026-11-24)', () => {
    const { fn, log } = server();
    const cases: Array<[string, number]> = [['', 400000], ['all-in-one-yearly', 400000], ['x', 1650000], ['', 50000]];
    for (const [id, amount] of cases) {
      const result = fn.handleConfirmPaymentJSONP(pay(id, amount));
      expect(result.ok, `${id} ${amount}`).toBe(false);
      expect(result.error).toContain('카드는 결제되지 않았습니다');
    }
    expect(log.confirms).toHaveLength(0);
    expect(log.licenses).toHaveLength(0);
  });

  it('the same payment asked twice returns the first result and issues nothing new', () => {
    const { fn, log } = server();
    const first = fn.handleConfirmPaymentJSONP(pay('all-yearly', 550000));
    const again = fn.handleConfirmPaymentJSONP(pay('all-yearly', 550000));
    expect(again).toMatchObject({ ok: true, code: first.code });
    expect(log.licenses).toHaveLength(1);
    expect(log.confirms).toHaveLength(1);
  });
});
