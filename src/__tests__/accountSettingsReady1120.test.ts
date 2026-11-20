/**
 * [2026-11-20] Startup readers of account-scoped keys (the autosave recovery prompt) wait for the license lookup.
 * Reproduced end to end in e2e/autosave-recovery-slow-license.spec.ts; this file locks the signal itself and the
 * call sites, so the wait cannot silently disappear or hang startup.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('account settings ready signal', () => {
  // The module registers a debug handle on window at import time; a bare object is enough here.
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.stubGlobal('window', {}); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('stays pending until marked, then resolves true', async () => {
    const mod = await import('../renderer/modules/accountSettingsManager.js');
    let result: boolean | null = null;
    void mod.whenAccountSettingsReady().then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(5000);
    expect(result).toBeNull();
    mod.markAccountSettingsReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBe(true);
  });

  it('resolves false after the timeout when the lookup has not answered', async () => {
    const mod = await import('../renderer/modules/accountSettingsManager.js');
    let result: boolean | null = null;
    void mod.whenAccountSettingsReady(3000).then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(2999);
    expect(result).toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    expect(result).toBe(false);
  });

  it('a limit of 0 keeps waiting past the default timeout and resolves true when marked', async () => {
    const mod = await import('../renderer/modules/accountSettingsManager.js');
    let result: boolean | null = null;
    void mod.whenAccountSettingsReady(0).then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(result).toBeNull();
    mod.markAccountSettingsReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBe(true);
  });

  it('marking twice is harmless and later waiters resolve true at once', async () => {
    const mod = await import('../renderer/modules/accountSettingsManager.js');
    mod.markAccountSettingsReady();
    expect(() => mod.markAccountSettingsReady()).not.toThrow();
    let result: boolean | null = null;
    void mod.whenAccountSettingsReady().then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('account settings ready signal: call sites', () => {
  it('the recovery check waits before it reads the autosave key, and looks again after a timed-out wait', () => {
    const body = read('renderer/renderer.ts').split('async function restoreAutosavedContent()')[1].split('const restoredContent')[0];
    const wait = body.indexOf('await whenAccountSettingsReady()');
    expect(wait).toBeGreaterThan(-1);
    expect(wait).toBeLessThan(body.indexOf('loadAutosavedContent()'));
    const retry = body.indexOf('await whenAccountSettingsReady(0)');
    expect(retry).toBeGreaterThan(wait);
    expect(body.indexOf('loadAutosavedContent()', retry)).toBeGreaterThan(retry);
  });

  it('login marks ready after the scope is active and before the config and server steps', () => {
    const body = read('renderer/modules/accountSettingsManager.ts').split('export async function onAccountLogin')[1].split('export async function onAccountLogout')[0];
    const mark = body.indexOf('markAccountSettingsReady();');
    expect(mark).toBeGreaterThan(body.indexOf('setCurrentUserId(userId);'));
    expect(mark).toBeGreaterThan(body.indexOf('activateLocalStorageProxy();'));
    expect(mark).toBeLessThan(body.indexOf('saveConfig'));
    expect(body.indexOf('markAccountSettingsReady();', mark + 1)).toBe(-1);
  });

  it('the startup license check always ends the wait', () => {
    const body = read('renderer/modules/licenseUI.ts').split('export async function initLicenseModal')[1].split('// 인증 버튼')[0];
    expect(body).toMatch(/finally \{[^}]*markAccountSettingsReady\(\);/);
  });
});
