import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolve } from 'node:path';
import { createDailyEntitlementGate, parseServerDailyEntitlement } from '../licenseDailyEntitlement.js';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const FUTURE = '2026-11-20T12:00:00.000Z';
const annual = (patch: Record<string, unknown> = {}) => ({ valid: true, ok: true, entitlements: {
  version: 1, dailyPublishing: true, issuedTermDays: 365, lifetime: false, validUntil: FUTURE, ...patch,
} });
const identity = { deviceId: 'device', userId: 'owner', sessionToken: 'fixture-token', isValid: true };

describe('server-origin daily publishing entitlement', () => {
  it('accepts annual/lifetime but never infers authority from premium or expiry', () => {
    expect(parseServerDailyEntitlement(annual(), NOW).dailyPublishing).toBe(true);
    expect(parseServerDailyEntitlement(annual({ issuedTermDays: 730 }), NOW).dailyPublishing).toBe(true);
    expect(parseServerDailyEntitlement(annual({ lifetime: true, issuedTermDays: null, validUntil: null }), NOW).dailyPublishing).toBe(true);
    for (const response of [{ valid: true, licenseType: 'premium', expiresAt: FUTURE }, {}, null,
      { valid: true, entitlements: { version: 1, dailyPublishing: true } },
      { ...annual(), valid: false }, { ...annual(), blocked: true }, { ...annual(), blocked: 'TRUE' }, { ...annual(), ok: false },
      { ...annual(), expiresAt: null }, { ...annual(), expiresAt: 'bad' }, { ...annual(), expiresAt: '2020-01-01T00:00:00Z' }]) {
      expect(parseServerDailyEntitlement(response, NOW).dailyPublishing).toBe(false);
    }
  });
  it.each([
    { issuedTermDays: 364 }, { issuedTermDays: '365' }, { issuedTermDays: NaN },
    { dailyPublishing: 'true' }, { version: 2 }, { lifetime: 'false' },
    { validUntil: null }, { validUntil: 'bad' }, { validUntil: '2026-10-19T00:00:00Z' },
    { lifetime: true, issuedTermDays: 365, validUntil: null },
  ])('denies malformed or expired entitlement %j', patch => {
    expect(parseServerDailyEntitlement(annual(patch), NOW).dailyPublishing).toBe(false);
  });
  it('checks a valid lifetime expiry if the server supplies one', () => {
    expect(parseServerDailyEntitlement(annual({ lifetime: true, issuedTermDays: null, validUntil: '2020-01-01T00:00:00Z' }), NOW).dailyPublishing).toBe(false);
  });
});

describe('main-only entitlement gate', () => {
  it('does not trust local persisted entitlement and refreshes from the server', async () => {
    const gate = createDailyEntitlementGate(() => ({ ...identity, entitlements: annual().entitlements }), () => NOW);
    expect((await gate.check(async () => ({ valid: true }))).allowed).toBe(false);
    expect((await gate.check(async () => annual(), true)).allowed).toBe(true);
  });
  it('caches only verified memory, supports forced pre-publish refresh and expires the lease', async () => {
    let now = NOW; let calls = 0;
    const gate = createDailyEntitlementGate(() => identity, () => now);
    const request = async () => { calls++; return annual(); };
    expect((await gate.check(request)).allowed).toBe(true);
    expect((await gate.check(request)).allowed).toBe(true);
    expect(calls).toBe(1);
    expect((await gate.check(request, true)).allowed).toBe(true);
    expect(calls).toBe(2);
    now += 60_001;
    expect((await gate.check(request)).allowed).toBe(true);
    expect(calls).toBe(3);
  });
  it('revokes on false/missing and never lets an older response restore a newer denial', async () => {
    const gate = createDailyEntitlementGate(() => identity, () => NOW);
    let done!: (v: unknown) => void;
    const old = gate.check(() => new Promise(resolve => { done = resolve; }), true);
    await Promise.resolve(); await Promise.resolve();
    gate.observe(identity, { valid: true });
    done(annual());
    expect((await old).allowed).toBe(false);
    expect((await gate.check(async () => annual())).allowed).toBe(false);
    gate.observe(identity, annual());
    gate.observe(identity, annual({ dailyPublishing: false }));
    expect((await gate.check(async () => annual())).allowed).toBe(false);
  });
  it('rejects network errors, invalid local state, account changes and explicit expiry', async () => {
    let current: any = identity;
    const gate = createDailyEntitlementGate(() => current, () => NOW);
    expect((await gate.check(async () => { throw Error('offline'); })).allowed).toBe(false);
    current = { ...identity, isValid: false };
    expect((await gate.check(async () => annual())).allowed).toBe(false);
    current = null;
    expect((await gate.check(async () => annual())).allowed).toBe(false);
    current = identity;
    expect((await gate.check(async () => { current = { ...identity, userId: 'other' }; return annual(); })).allowed).toBe(false);
    current = { ...identity, expiresAt: '2020-01-01T00:00:00Z' };
    expect((await gate.check(async () => annual())).allowed).toBe(false);
  });
  it('invalidation cancels an in-flight grant and malformed local expiry fails closed', async () => {
    let current: any = identity;
    const gate = createDailyEntitlementGate(() => current, () => NOW);
    expect((await gate.check(async () => { gate.invalidate(); return annual(); })).allowed).toBe(false);
    current = { ...identity, expiresAt: 'malformed' };
    expect((await gate.check(async () => annual())).allowed).toBe(false);
  });
});

describe('Apps Script issued-term authority', () => {
  const source = readFileSync(resolve(__dirname, '../../../admin-panel/google-apps-script-code.gs'), 'utf8');
  const match = source.match(/function dailyPublishingEntitlements_\([^]*?\n\}/);
  const context = vm.createContext({ Date, Number, String, Boolean, Object, Array });
  if (match) vm.runInContext(match[0], context);
  const run = (type: unknown, days: unknown, expiry: unknown = FUTURE, blocked: unknown = false) =>
    vm.runInContext('dailyPublishingEntitlements_(fixture.type, fixture.days, fixture.expiry, fixture.blocked, fixture.now)',
      Object.assign(context, { fixture: { type, days, expiry, blocked, now: NOW } }));
  it('provides the server authority helper', () => { expect(match).not.toBeNull(); });
  it.each([['PAID365', null], ['CUSTOM', 365], ['CUSTOM', '730'], ['LIFE', null], ['CUSTOM', -1]])(
    'allows qualifying issued term %s / %s', (type, days) => {
      expect(run(type, days, type === 'LIFE' || days === -1 ? null : FUTURE).dailyPublishing).toBe(true);
    });
  it.each([['TRIAL7', 365], ['FREE', 365], ['PAID30', 365], ['PAID90', 365], ['CUSTOM', 364],
    ['CUSTOM', null], ['CUSTOM', ''], ['CUSTOM', 'bad'], ['UNKNOWN', 730], ['PREMIUM', -1], ['PAID365', 30], ['PAID365', 'bad']])(
    'rejects nonqualifying issued term %s / %s', (type, days) => { expect(run(type, days).dailyPublishing).toBe(false); });
  it('denies expiry, missing annual expiry and blocked rows', () => {
    expect(run('PAID365', null, null).dailyPublishing).toBe(false);
    expect(run('CUSTOM', 365, 'bad').dailyPublishing).toBe(false);
    expect(run('CUSTOM', 365, '2020-01-01T00:00:00Z').dailyPublishing).toBe(false);
    expect(run('LIFE', null, null, true).dailyPublishing).toBe(false);
    expect(run('CUSTOM', 365, FUTURE, 'TRUE').dailyPublishing).toBe(false);
  });
});
