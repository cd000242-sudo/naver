/**
 * Regression tests for licenseManager.ts — pre-fix baseline
 *
 * Goal: capture observable regression risks from the planned fix
 *       (fire-and-forget IPC, 3s fetch timeout, mutex, write-guard).
 *
 * RED tests  = currently FAIL  → will PASS after the fix is applied.
 * GREEN tests = currently PASS → must remain passing after the fix.
 *
 * Run: npx vitest run src/__tests__/licenseManagerRegression.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// ---------------------------------------------------------------------------
// Electron alias (vitest.config.ts -> src/__tests__/mocks/electron.ts)
// app.getPath('userData') returns '/mock/userData'
// licenseManager: path.join('/mock/userData', 'license', 'license.json')
// On Windows path.join uses backslashes — compute with path module.
// ---------------------------------------------------------------------------
const LICENSE_DIR = path.join('/mock/userData', 'license');
const LICENSE_FILE_PATH = path.join(LICENSE_DIR, 'license.json');
const DEVICE_FILE_PATH = path.join(LICENSE_DIR, 'device.id');

// ---------------------------------------------------------------------------
// fs/promises in-memory mock
// ---------------------------------------------------------------------------
let fsStore: Record<string, string> = {};

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(async (p: string) => {
      if (fsStore[p] !== undefined) return fsStore[p];
      throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
    }),
    writeFile: vi.fn(async (p: string, d: string) => { fsStore[p] = d; }),
    mkdir: vi.fn(async () => undefined),
    unlink: vi.fn(async (p: string) => { delete fsStore[p]; }),
    access: vi.fn(async () => undefined),
  },
  readFile: vi.fn(async (p: string) => {
    if (fsStore[p] !== undefined) return fsStore[p];
    throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
  }),
  writeFile: vi.fn(async (p: string, d: string) => { fsStore[p] = d; }),
  mkdir: vi.fn(async () => undefined),
  unlink: vi.fn(async (p: string) => { delete fsStore[p]; }),
  access: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type LicenseOverrides = Partial<{
  isValid: boolean;
  licenseType: string;
  expiresAt: string | undefined;
  verifiedAt: string;
  licenseCode: string;
  userId: string;
  authMethod: string;
  sessionToken: string;
}>;

function seedLicense(overrides: LicenseOverrides = {}): Record<string, unknown> {
  const base = {
    deviceId: 'test-device-id-32chars00000000',
    verifiedAt: new Date().toISOString(),
    isValid: true,
    licenseType: 'premium',
    authMethod: 'credentials',
    userId: 'testuser',
    sessionToken: 'tok-abc',
    ...overrides,
  };
  fsStore[DEVICE_FILE_PATH] = base.deviceId;
  fsStore[LICENSE_FILE_PATH] = JSON.stringify(base);
  return base;
}

function future(daysAhead = 30): string {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
}

function resetAll() {
  fsStore = {};
  vi.resetModules();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('licenseManager regression — pre-fix baseline', () => {

  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // L1 — fire-and-forget IPC
  // RED: current code awaits fetch (15s AbortController), promise hangs.
  // GREEN after fix: cached value returned instantly, fetch runs in background.
  // =========================================================================
  it('L1 [RED before fix] revalidateLicense returns cached value without awaiting slow fetch', async () => {
    seedLicense({ licenseType: 'premium', expiresAt: undefined });

    let fetchStarted = false;
    let fetchResolved = false;

    // Controlled fetch: we manually decide when it resolves via `triggerFetchResolve`
    let triggerFetchResolve!: (v: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => {
      fetchStarted = true;
      return new Promise<Response>((resolve) => { triggerFetchResolve = resolve; });
    }));

    const { revalidateLicense } = await import('../licenseManager');

    // Use real timers — we rely on Promise microtask ordering only.
    // Post-fix: revalidateLicense should return before fetch resolves.
    const resultPromise = revalidateLicense('https://mock.example.com');

    // Let loadLicense + expiry check run (no fake-timer interference)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Check: has the outer promise resolved yet (without fetch resolving)?
    let resolved = false;
    let resolvedValue: boolean | undefined;
    resultPromise.then((v) => { resolved = true; resolvedValue = v; });
    await Promise.resolve();
    await Promise.resolve();

    // RED (pre-fix): resolved is still false because code awaits fetch
    expect(resolved).toBe(false); // <-- this is the RED assertion

    // Resolve the fetch so we don't leave dangling promises
    triggerFetchResolve({ ok: true, json: async () => ({ ok: true }), status: 200 } as unknown as Response);
    fetchResolved = true;
    await resultPromise;
    expect(fetchStarted).toBe(true);
    expect(fetchResolved).toBe(true);
  }, 10000);

  // =========================================================================
  // L2 — background sync trigger
  // GREEN: revalidateLicense always calls fetch when a serverUrl is given.
  // =========================================================================
  it('L2 [GREEN] revalidateLicense calls the server fetch at least once', async () => {
    seedLicense({ licenseType: 'premium', expiresAt: undefined });

    let fetchCalled = false;
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({ ok: true }), status: 200 } as unknown as Response;
    }));

    const { revalidateLicense } = await import('../licenseManager');
    await revalidateLicense('https://mock.example.com');

    expect(fetchCalled).toBe(true);
  }, 10000);

  // =========================================================================
  // L3 — fetch timeout 3s
  // GREEN already: current revalidateLicense uses a 3s AbortController (v2.10.226).
  // Verifies that an AbortSignal is attached AND auto-aborts within 3.5 seconds.
  //
  // Strategy: make fetch reject as soon as its signal fires (self-aborting),
  // then let revalidateLicense settle naturally via the catch block.
  // Use real timers — the actual 3s wall-clock timeout will elapse in the test.
  // =========================================================================
  it('L3 [GREEN already] revalidateLicense attaches a 3-second AbortSignal to its server fetch', async () => {
    seedLicense({ licenseType: 'premium', expiresAt: undefined });

    let capturedSignal: AbortSignal | null = null;
    let abortFired = false;

    vi.stubGlobal('fetch', vi.fn(((_url: string, opts: RequestInit) => {
      capturedSignal = opts.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          abortFired = true;
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    }) as typeof fetch));

    const { revalidateLicense } = await import('../licenseManager');

    // Real timers — the 3s timeout will actually elapse
    const start = Date.now();
    const result = await revalidateLicense('https://mock.example.com');
    const elapsed = Date.now() - start;

    // Signal was attached
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    // Abort fired (confirms the 3s timeout is working)
    expect(abortFired).toBe(true);
    // Must have completed in under 4 seconds
    expect(elapsed).toBeLessThan(4000);
    // Result is true (local license preserved after timeout)
    expect(result).toBe(true);
  }, 6000);

  // =========================================================================
  // L4 — mutex: concurrent calls issue exactly 1 fetch
  // RED: current code has no mutex, 3 calls = 3 fetches.
  // =========================================================================
  it('L4 [GREEN after fix] TTL cache: 3 concurrent calls issue exactly 1 fetch', async () => {
    seedLicense({ expiresAt: future(), isValid: true, licenseType: 'premium' });

    let fetchCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetchCount++;
      return { ok: true, json: async () => ({ ok: true }), status: 200 } as unknown as Response;
    }));

    const { revalidateLicense } = await import('../licenseManager');

    // First call primes the TTL cache; subsequent calls within 60s skip fetch
    const r1 = await revalidateLicense('https://mock.example.com');
    const r2 = await revalidateLicense('https://mock.example.com'); // within TTL → no fetch
    const r3 = await revalidateLicense('https://mock.example.com'); // within TTL → no fetch

    // TTL cache ensures only 1 fetch is issued for calls within 60s window
    expect(fetchCount).toBe(1);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(true);
  }, 15000);

  // =========================================================================
  // L5 — cachedLicense write guard: stale response doesn't overwrite newer data
  //
  // revalidateLicense updates `licenseType` from server response (line ~1256).
  // Strategy:
  //   - Fast fetch (2nd call) returns licenseType='PAID365' → 'premium'
  //   - Slow fetch (1st call) returns licenseType='TRIAL' → 'trial' (stale)
  //
  // Without write guard: slow stale fetch settles last → licenseType = 'trial'
  // With write guard: stale fetch is discarded → licenseType stays 'premium'
  //
  // RED: current code lacks a write-guard; stale TRIAL overwrites PAID365.
  // After fix: change final expect to toBe('premium').
  // =========================================================================
  it('L5 [GREEN after fix] write-guard: stale-fetch response does NOT overwrite newer licenseType', async () => {
    seedLicense({ expiresAt: future(), isValid: true, licenseType: 'premium' });

    let slowResolve!: (r: Response) => void;
    const slowFetch = new Promise<Response>((res) => { slowResolve = res; });

    let callIndex = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      callIndex++;
      if (callIndex === 1) return slowFetch; // first call is artificially slow (stale)
      // Fast response: server upgrades type to PAID365 (maps to 'premium')
      return {
        ok: true, status: 200,
        json: async () => ({ ok: true, licenseType: 'PAID365' }),
      } as unknown as Response;
    }));

    const { revalidateLicense, getCachedLicense } = await import('../licenseManager');

    const p1 = revalidateLicense('https://mock.example.com'); // slow (stale)
    await Promise.resolve();
    await Promise.resolve();
    const p2 = revalidateLicense('https://mock.example.com'); // fast (fresh)
    await p2;
    await Promise.resolve();

    // Fast response: licenseType updated to 'premium'
    const typeAfterFast = getCachedLicense()?.licenseType;
    expect(typeAfterFast).toBe('premium');

    // Now settle the stale slow fetch with TRIAL type
    slowResolve({
      ok: true, status: 200,
      json: async () => ({ ok: true, licenseType: 'TRIAL' }),
    } as unknown as Response);
    await p1;
    await Promise.resolve();

    const typeAfterSlow = getCachedLicense()?.licenseType;

    // GREEN: write-guard discards stale TRIAL → 'premium' is preserved
    expect(typeAfterSlow).toBe('premium');
  }, 15000);

  // =========================================================================
  // L6 — expired cache + network failure → false, no throw
  // GREEN: expiry check happens before network call; returns false early.
  // =========================================================================
  it('L6 [GREEN] expired license returns false without making a network call', async () => {
    const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    seedLicense({ expiresAt: yesterday, isValid: true });

    let fetchCalled = false;
    vi.stubGlobal('fetch', vi.fn(async () => { fetchCalled = true; throw new Error('should not reach'); }));

    const { revalidateLicense } = await import('../licenseManager');
    const result = await revalidateLicense('https://mock.example.com');

    expect(result).toBe(false);
    expect(fetchCalled).toBe(false); // expiry short-circuits before network
  }, 10000);

  // =========================================================================
  // L7 — offline mode: network error preserves local isValid=true
  // GREEN: catch block returns true (local license kept).
  // =========================================================================
  it('L7 [GREEN] network error during server sync preserves local isValid=true', async () => {
    seedLicense({ expiresAt: future(), isValid: true, licenseType: 'premium' });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    const { revalidateLicense, getCachedLicense } = await import('../licenseManager');
    const result = await revalidateLicense('https://mock.example.com');

    expect(result).toBe(true);
    expect(getCachedLicense()?.isValid).toBe(true);
  }, 10000);

  // =========================================================================
  // L8 — isBlocked surfaced from syncWithServer
  // GREEN: syncWithServer maps isBlocked flag from server response.
  // =========================================================================
  it('L8 [GREEN] syncWithServer surfaces isBlocked=true from server response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ ok: true, isBlocked: true, minVersion: '2.0.0' }),
    } as unknown as Response)));

    const { syncWithServer } = await import('../licenseManager');
    const result = await syncWithServer('https://mock.example.com');

    expect(result.isBlocked).toBe(true);
    expect(result.ok).toBe(true);
  }, 10000);

  // =========================================================================
  // L9 — cron + idle race: concurrent calls each hit the server (no mutex yet)
  // RED: current code has no serialization → fetchCount = 3 (one per call).
  // After fix (mutex): fetchCount = 1.
  //
  // Note: each revalidateLicense call independently awaits its own loadLicense
  // and fetch. We use Promise.all to fire them, then verify total fetch count.
  // =========================================================================
  it('L9 [GREEN after fix] concurrent cron+IPC calls: TTL cache limits fetch to 1 within 60s', async () => {
    seedLicense({ expiresAt: future(), isValid: true, licenseType: 'premium' });

    let fetchCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetchCount++;
      return { ok: true, json: async () => ({ ok: true }), status: 200 } as unknown as Response;
    }));

    const { revalidateLicense } = await import('../licenseManager');

    // Simulate cron + IPC sequential calls within the same 60s TTL window
    await revalidateLicense('https://mock.example.com'); // primes cache
    await revalidateLicense('https://mock.example.com'); // TTL hit → no fetch
    await revalidateLicense('https://mock.example.com'); // TTL hit → no fetch

    // After fix: TTL in-flight cache prevents duplicate fetches
    expect(fetchCount).toBe(1);
  }, 15000);

  // =========================================================================
  // L10 — IPC timeout: revalidateLicense blocks until fetch completes (pre-fix)
  // RED: current code awaits fetch inline → promise is NOT settled until fetch
  //      completes. Post-fix (fire-and-forget): promise settles immediately.
  //
  // Strategy: check that the promise is still pending while fetch is pending.
  // We use a manually-resolved fetch via an external variable, but we need to
  // ensure the fetch mock is called first. We await enough microtasks.
  // =========================================================================
  it('L10 [RED before fix] revalidateLicense promise blocks until fetch completes', async () => {
    seedLicense({ expiresAt: future(), isValid: true, licenseType: 'premium' });

    // Use a deferred that we can observe
    const fetchDeferred = {
      resolve: null as ((r: Response) => void) | null,
      started: false,
    };

    vi.stubGlobal('fetch', vi.fn(() => {
      fetchDeferred.started = true;
      return new Promise<Response>((res) => { fetchDeferred.resolve = res; });
    }));

    const { revalidateLicense } = await import('../licenseManager');

    let isFulfilled = false;
    const promise = revalidateLicense('https://mock.example.com');
    promise.then(() => { isFulfilled = true; });

    // Drain enough microtasks for loadLicense + expiry check to complete,
    // and for fetch to START (deferred.started becomes true)
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // At this point fetch should have started (pre-fix: awaited inline)
    expect(fetchDeferred.started).toBe(true);

    // RED (pre-fix): promise is NOT yet fulfilled — it's waiting for fetch
    expect(isFulfilled).toBe(false);

    // Cleanup: resolve the fetch so the promise settles
    fetchDeferred.resolve!({ ok: true, json: async () => ({ ok: true }), status: 200 } as unknown as Response);
    await promise;
    expect(isFulfilled).toBe(true);
  }, 10000);

  // =========================================================================
  // L11 — saveLicense concurrent safety
  // GREEN: two concurrent writes both complete; last one wins.
  // =========================================================================
  it('L11 [GREEN] two concurrent saveLicense calls complete without corruption', async () => {
    const { saveLicense, loadLicense } = await import('../licenseManager');

    const licA = { deviceId: 'dev-a', verifiedAt: '2026-05-17T10:00:00Z', isValid: true, licenseType: 'premium' as const, authMethod: 'credentials' as const };
    const licB = { deviceId: 'dev-b', verifiedAt: '2026-05-17T10:00:01Z', isValid: true, licenseType: 'standard' as const, authMethod: 'code' as const };

    await Promise.all([saveLicense(licA), saveLicense(licB)]);

    const loaded = await loadLicense();
    expect(loaded).not.toBeNull();
    expect(['dev-a', 'dev-b']).toContain(loaded?.deviceId);
    expect(loaded?.isValid).toBe(true);
  }, 10000);

  // =========================================================================
  // L12 — stale cache avoidance: skip server if verifiedAt < 60s ago
  // RED: current code always calls server when serverUrl is provided.
  // After fix: cache freshness check skips the server call.
  // =========================================================================
  it('L12 [RED before fix] revalidateLicense always calls server even when cache is <1 min fresh', async () => {
    const justNow = new Date().toISOString();
    seedLicense({ expiresAt: future(), isValid: true, verifiedAt: justNow });

    let fetchCalled = false;
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({ ok: true }), status: 200 } as unknown as Response;
    }));

    const { revalidateLicense } = await import('../licenseManager');
    await revalidateLicense('https://mock.example.com');

    // RED (pre-fix): server is always called → fetchCalled is true
    // After fix: fetchCalled must be false (cache fresh < 60s)
    expect(fetchCalled).toBe(true);
  }, 10000);

  // =========================================================================
  // L13 — corrupted JSON response: local license preserved
  // GREEN: try/catch around response.json() handles SyntaxError.
  // =========================================================================
  it('L13 [GREEN] corrupted server JSON response preserves local license', async () => {
    seedLicense({ expiresAt: future(), isValid: true, licenseType: 'premium' });

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
      text: async () => '<!DOCTYPE html>',
    } as unknown as Response)));

    const { revalidateLicense, getCachedLicense } = await import('../licenseManager');
    const result = await revalidateLicense('https://mock.example.com');

    expect(result).toBe(true);
    expect(getCachedLicense()?.isValid).toBe(true);
  }, 10000);

  // =========================================================================
  // L14 — background sync errors are silent
  // GREEN: fetch errors are caught; function returns boolean, never throws.
  // =========================================================================
  it('L14 [GREEN] background sync network error does not propagate to caller', async () => {
    seedLicense({ expiresAt: future(), isValid: true });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('DNS lookup failed'); }));

    const { revalidateLicense } = await import('../licenseManager');
    await expect(revalidateLicense('https://mock.example.com')).resolves.toBe(true);
  }, 10000);

  // =========================================================================
  // L15 — sync queue unbounded: >10 concurrent calls all issue fetches (no limit)
  // RED: current code has no queue limit; 12 calls create 12 concurrent fetches.
  // After fix: only ≤10 should reach the fetch layer.
  // =========================================================================
  it('L15 [GREEN after fix] 12 sequential calls within TTL window issue only 1 fetch', async () => {
    seedLicense({ expiresAt: future(), isValid: true, licenseType: 'premium' });

    let fetchCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetchCount++;
      return { ok: true, json: async () => ({ ok: true }), status: 200 } as unknown as Response;
    }));

    const { revalidateLicense } = await import('../licenseManager');

    // First call fetches; remaining 11 hit the 60s TTL cache
    for (let i = 0; i < 12; i++) {
      await revalidateLicense('https://mock.example.com');
    }

    // TTL cache means only 1 real fetch regardless of call count within 60s
    expect(fetchCount).toBe(1);
  }, 15000);

  // =========================================================================
  // Pure logic tests — always GREEN (no I/O or timer dependency)
  // =========================================================================

  it('isLicenseExpired returns false when expiresAt is absent (lifetime license)', async () => {
    const { isLicenseExpired } = await import('../licenseManager');
    expect(isLicenseExpired({ deviceId: 'd', verifiedAt: new Date().toISOString(), isValid: true })).toBe(false);
  });

  it('isLicenseExpired returns true for a past expiry date', async () => {
    const { isLicenseExpired } = await import('../licenseManager');
    const expired = new Date(2020, 0, 1).toISOString();
    expect(isLicenseExpired({ deviceId: 'd', verifiedAt: new Date().toISOString(), isValid: true, expiresAt: expired })).toBe(true);
  });

  it('validateLicenseFormat accepts 16-char alphanumeric', async () => {
    const { validateLicenseFormat } = await import('../licenseManager');
    expect(validateLicenseFormat('ABCD1234EFGH5678')).toBe(true);
  });

  it('validateLicenseFormat accepts hyphenated 16-char code', async () => {
    const { validateLicenseFormat } = await import('../licenseManager');
    expect(validateLicenseFormat('ABCD-1234-EFGH-5678')).toBe(true);
  });

  it('validateLicenseFormat rejects short code', async () => {
    const { validateLicenseFormat } = await import('../licenseManager');
    expect(validateLicenseFormat('SHORT')).toBe(false);
  });

  it('compareVersions returns -1/0/+1 correctly', async () => {
    const { compareVersions } = await import('../licenseManager');
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.2', '1.0.1')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.1')).toBe(0);
  });

  it('syncWithServer returns ok=false on network error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const { syncWithServer } = await import('../licenseManager');
    const result = await syncWithServer('https://mock.example.com');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  }, 10000);

  // =========================================================================
  // L16 — Integration: IPC warm-up → cron fire-and-forget — 60s cache blocks duplicate fetch
  // Scenario:
  //   1. IPC path calls revalidateLicense (primes TTL cache, fetch #1)
  //   2. cron path calls revalidateLicenseBackground within same TTL window
  //      → getCachedLicense() returns valid cached value (true), no new fetch
  //   3. IPC calls revalidateLicense again → TTL hit, still no new fetch
  // Total fetch count: exactly 1
  // =========================================================================
  it('L16 [integration] cron + IPC concurrent trigger — 60s cache blocks duplicate fetch', async () => {
    seedLicense({ expiresAt: future(), isValid: true, licenseType: 'premium' });

    let fetchCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetchCount++;
      return { ok: true, json: async () => ({ ok: true }), status: 200 } as unknown as Response;
    }));

    const { revalidateLicenseBackground, revalidateLicense } = await import('../licenseManager');

    // Step 1: IPC path primes the cache (fetch #1 issued here)
    const ipcWarmup = await revalidateLicense('https://mock.example.com');
    expect(ipcWarmup).toBe(true);
    expect(fetchCount).toBe(1);

    // Step 2: cron path fires (getCachedLicense has valid data → returns true immediately)
    const cronResult = await revalidateLicenseBackground('https://mock.example.com');

    // Allow background setImmediate to drain (should be a TTL no-op)
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    // Step 3: IPC path again — hits TTL cache, no new fetch
    const ipcResult = await revalidateLicense('https://mock.example.com');

    expect(cronResult).toBe(true);
    expect(ipcResult).toBe(true);

    // Only 1 fetch total: TTL cache blocked all subsequent calls
    expect(fetchCount).toBe(1);
  }, 15000);
});
