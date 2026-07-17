/**
 * configManager.ts saveConfig regression tests
 *
 * Purpose: Catch regressions BEFORE applying the async/mutex/idle-migration fix.
 * Each test corresponds to one of the 5 identified regression risks.
 *
 * Notes:
 * - electron is aliased to src/__tests__/mocks/electron.ts in vitest.config.ts
 * - configManager module state (cachedConfig / configPath / _activeUserId) is shared
 *   across all tests in this file because we import it once. Each test uses unique
 *   key values to isolate assertions from leakage.
 * - diskStore is cleared in beforeEach.
 * - On Windows, path.join('/mock/userData', ...) produces \mock\userData\... paths.
 *   SETTINGS_PATH is computed with path.join to match what configManager writes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as nodePath from 'path';

// ---------------------------------------------------------------------------
// Shared in-memory disk store
// ---------------------------------------------------------------------------
const diskStore: Record<string, string> = {};

function clearDisk(): void {
  Object.keys(diskStore).forEach(k => delete diskStore[k]);
}

function writeDisk(p: string, obj: object): void {
  diskStore[p] = JSON.stringify(obj, null, 2);
}

function readDisk(p: string): Record<string, any> {
  if (diskStore[p] === undefined) {
    // Dump keys for debugging
    const keys = Object.keys(diskStore);
    throw new Error(`not on disk: ${p}\nAvailable: ${keys.join(', ')}`);
  }
  return JSON.parse(diskStore[p]);
}

// ---------------------------------------------------------------------------
// Static mocks — hoisted by vitest.
// electron alias is handled in vitest.config.ts.
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(async (p: string) => {
      if (diskStore[p] === undefined) {
        const err: any = new Error(`ENOENT: ${p}`);
        err.code = 'ENOENT';
        throw err;
      }
      return diskStore[p];
    }),
    writeFile: vi.fn(async (p: string, data: string) => {
      diskStore[p] = data;
    }),
    access: vi.fn(async (p: string) => {
      if (diskStore[p] === undefined) {
        const err: any = new Error(`ENOENT: ${p}`);
        err.code = 'ENOENT';
        throw err;
      }
    }),
    copyFile: vi.fn(async (src: string, dest: string) => {
      if (diskStore[src] !== undefined) diskStore[dest] = diskStore[src];
    }),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (p: string) => diskStore[p] !== undefined,
    readFileSync: (p: string) => {
      if (diskStore[p] === undefined) throw new Error(`ENOENT: ${p}`);
      return diskStore[p];
    },
  },
  existsSync: (p: string) => diskStore[p] !== undefined,
  readFileSync: (p: string) => {
    if (diskStore[p] === undefined) throw new Error(`ENOENT: ${p}`);
    return diskStore[p];
  },
}));

vi.mock('../main/userDataMigration.js', () => ({
  syncMasterIntoAccountSettings: vi.fn(),
  mirrorToSafe: vi.fn(),
  getMirrorDir: vi.fn(() => '/mock/mirror'),
}));

// ---------------------------------------------------------------------------
// Single import — after mocks are registered
// ---------------------------------------------------------------------------
import { saveConfig, loadConfig } from '../configManager';
import * as fsMod from 'fs/promises';
import * as migMod from '../main/userDataMigration.js';

// Build paths with path.join so they match what configManager constructs internally.
// On Windows: path.join('/mock/userData', 'settings.json') → '\mock\userData\settings.json'
const USER_DATA = '/mock/userData';
const SETTINGS_PATH = nodePath.join(USER_DATA, 'settings.json');

// ---------------------------------------------------------------------------
// Test Suite 1 — Concurrent saveConfig (mutex)
// ---------------------------------------------------------------------------
describe('Risk-1: Concurrent saveConfig calls', () => {
  beforeEach(() => {
    clearDisk();
    vi.clearAllMocks();
    // Restore vi.fn() implementations to their original diskStore-based behavior.
    // We use clearAllMocks (resets call counts) rather than restoreAllMocks so that
    // the vi.mock factory functions stay in place.
  });

  it('T1-a: 5 concurrent saveConfig calls all resolve without rejection', async () => {
    /**
     * Pre-fix: no mutex — concurrent writes race on cachedConfig + fs.writeFile.
     * Post-fix: mutex serialises all 5 writes — zero rejections guaranteed.
     *
     * EXPECTED TO FAIL pre-fix if concurrent writes produce rejections.
     */
    writeDisk(SETTINGS_PATH, {});

    const updates = [
      { costSaverMode: true },
      { geoOptimization: true },
      { aiTabFriendlyMode: false },
      { geminiPlanType: 'paid' as const },
      { useNaverFactCheck: true },
    ];

    const results = await Promise.allSettled(updates.map(u => saveConfig(u)));

    const rejected = results.filter(r => r.status === 'rejected');
    expect(rejected).toHaveLength(0);

    const disk = readDisk(SETTINGS_PATH);
    expect(typeof disk).toBe('object');
  });

  it('T1-b: Sequential saves accumulate all distinct fields on disk', async () => {
    /**
     * Baseline: PRESERVE_KEYS mechanism must retain earlier fields across sequential calls.
     */
    writeDisk(SETTINGS_PATH, {});

    await saveConfig({ geminiApiKey: 'AIzaSeqKey1234567890abcdefghij' });
    await saveConfig({ openaiApiKey: 'sk-seq-openai-key-xxxx' });
    await saveConfig({ claudeApiKey: 'sk-ant-seq-claude-key' });
    await saveConfig({ costSaverMode: true });
    await saveConfig({ geminiPlanType: 'paid' });

    const disk = readDisk(SETTINGS_PATH);

    expect(disk.geminiApiKey).toBe('AIzaSeqKey1234567890abcdefghij');
    expect(disk.openaiApiKey).toBe('sk-seq-openai-key-xxxx');
    expect(disk.claudeApiKey).toBe('sk-ant-seq-claude-key');
    expect(disk.costSaverMode).toBe(true);
    expect(disk.geminiPlanType).toBe('paid');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2 — EBUSY simulation on readFile
// ---------------------------------------------------------------------------
describe('Risk-1 / Risk-2: EBUSY on fs.readFile', () => {
  beforeEach(() => {
    clearDisk();
    vi.clearAllMocks();
  });

  it('T2: saveConfig completes within 2 s even when readFile throws EBUSY once', async () => {
    /**
     * Pre-fix: readFileSync in PRESERVE_KEYS block swallows EBUSY without retry.
     * Post-fix: async readFile on first call throws EBUSY — save still proceeds.
     * Both must complete in finite time.
     */
    writeDisk(SETTINGS_PATH, { geminiApiKey: 'AIzaEbusyGuardKey12345678901234' });

    let callCount = 0;
    // Wrap the mock without spyOn to avoid recursive dispatch
    const origImpl = (fsMod.default.readFile as any).getMockImplementation?.() ??
      (async (p: string) => {
        if (diskStore[p] === undefined) {
          const err: any = new Error(`ENOENT: ${p}`); err.code = 'ENOENT'; throw err;
        }
        return diskStore[p];
      });

    (fsMod.default.readFile as any).mockImplementation(async (p: string, ...args: any[]) => {
      callCount++;
      if (callCount === 1 && p === SETTINGS_PATH) {
        const err: any = new Error('EBUSY: resource busy or locked');
        err.code = 'EBUSY';
        throw err;
      }
      // Fall back to diskStore directly (avoid infinite recursion)
      if (diskStore[p] === undefined) {
        const err: any = new Error(`ENOENT: ${p}`); err.code = 'ENOENT'; throw err;
      }
      return diskStore[p];
    });

    const result = await Promise.race([
      saveConfig({ costSaverMode: true }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('saveConfig timed out — possible main-thread block')),
          2000,
        ),
      ),
    ]);

    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3 — PRESERVE_KEYS survival under partial updates
// ---------------------------------------------------------------------------
describe('Risk-3: PRESERVE_KEYS not lost on partial saveConfig', () => {
  beforeEach(() => {
    clearDisk();
    vi.clearAllMocks();
  });

  it('T3-a: saveConfig({geminiPlanType}) preserves geminiApiKey already on disk', async () => {
    /**
     * Pre-fix risk: PRESERVE_KEYS read may fail — existing key is overwritten with empty.
     * Post-fix: retry ensures key is recovered.
     *
     * The module caches config, so writing the key first and then a partial update
     * exercises whether cachedConfig merges correctly with disk on partial save.
     */
    writeDisk(SETTINGS_PATH, { geminiApiKey: 'AIzaPreserveT3a1234567890abcde' });

    // First load the config so cachedConfig has the key
    await loadConfig();

    // Then partial update — geminiApiKey must survive
    await saveConfig({ geminiPlanType: 'paid' });

    const disk = readDisk(SETTINGS_PATH);
    expect(disk.geminiApiKey).toBe('AIzaPreserveT3a1234567890abcde');
    expect(disk.geminiPlanType).toBe('paid');
  });

  it('T3-b: saveConfig({costSaverMode:true}) does not wipe claudeApiKey from disk', async () => {
    writeDisk(SETTINGS_PATH, {
      claudeApiKey: 'sk-ant-preserve-T3b-test-key-1234',
    });

    await loadConfig();
    await saveConfig({ costSaverMode: true });

    const disk = readDisk(SETTINGS_PATH);
    expect(disk.claudeApiKey).toBe('sk-ant-preserve-T3b-test-key-1234');
    expect(disk.costSaverMode).toBe(true);
  });

  it('T3-c: boolean false field (aiTabFriendlyMode:false) survives the empty-string cleanup', async () => {
    /**
     * The module strips empty strings but must NOT strip boolean false.
     */
    writeDisk(SETTINGS_PATH, {});

    await saveConfig({ aiTabFriendlyMode: false, geoOptimization: true });

    const disk = readDisk(SETTINGS_PATH);
    expect(Object.prototype.hasOwnProperty.call(disk, 'aiTabFriendlyMode')).toBe(true);
    expect(disk.geoOptimization).toBe(true);
  });

  it('T3-d: partial saves preserve the explicit MCP / Agent / API route selection', async () => {
    writeDisk(SETTINGS_PATH, {
      generationConnectionSettings: {
        version: 1,
        fallbackPolicy: 'manual-only',
        text: {
          routeId: 'mcp-codex-text',
          mode: 'mcp',
          connectorId: 'codex-mcp',
          capability: 'text.generate',
          toolOrModelId: 'generate_text',
          billingKind: 'subscription',
        },
        image: {
          routeId: 'agent-dropshot-image',
          mode: 'agent',
          connectorId: 'dropshot-browser',
          capability: 'image.generate.text',
          toolOrModelId: 'dropshot',
          billingKind: 'subscription',
        },
      },
    });

    await loadConfig();
    await saveConfig({ costSaverMode: true });

    const disk = readDisk(SETTINGS_PATH);
    expect(disk.generationConnectionSettings).toMatchObject({
      fallbackPolicy: 'manual-only',
      text: { mode: 'mcp', connectorId: 'codex-mcp' },
      image: { mode: 'agent', connectorId: 'dropshot-browser' },
    });
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4 — Account switch race
// ---------------------------------------------------------------------------
describe('Risk-2 / Risk-4: Account switch (__userId) race condition', () => {
  beforeEach(() => {
    clearDisk();
    vi.clearAllMocks();
  });

  it('T4: saveConfig({__userId}) activates per-account mode; loadConfig reads account file', async () => {
    /**
     * Pre-fix risk: configPath=null window inside saveConfig allows a concurrent loadConfig
     * to load default settings.json.
     * Post-fix: mutex closes the window.
     */
    const accountPath = nodePath.join(USER_DATA, 'settings_acctT4.json');
    writeDisk(SETTINGS_PATH, { geminiApiKey: 'AIzaMasterT4Key123456789012345' });
    writeDisk(accountPath, {
      geminiApiKey: 'AIzaAccountT4Key1234567890123456',
      openaiApiKey: 'sk-account-t4-only-openai',
    });

    await saveConfig({ __userId: 'acctT4', costSaverMode: false } as any);
    const loaded = await loadConfig();

    // openaiApiKey exists ONLY in the account file
    expect(loaded.openaiApiKey).toBe('sk-account-t4-only-openai');
  });

  it('T4-b: Concurrent loadConfig during account switch returns non-empty config', async () => {
    const accountPath = nodePath.join(USER_DATA, 'settings_acctT4b.json');
    writeDisk(SETTINGS_PATH, { geminiApiKey: 'AIzaMasterT4bKey1234567890123456' });
    writeDisk(accountPath, {
      geminiApiKey: 'AIzaAccountT4bKey123456789012345',
      costSaverMode: true,
    });

    const [, loadedConcurrent] = await Promise.all([
      saveConfig({ __userId: 'acctT4b', geoOptimization: true } as any),
      loadConfig(),
    ]);

    // Must not be an empty {}
    expect(Object.keys(loadedConcurrent).length).toBeGreaterThan(0);
    // After account switch settles, loadConfig must return the account file's data
    const loadedFinal = await loadConfig();
    expect(loadedFinal.geminiApiKey).toBe('AIzaAccountT4bKey123456789012345');
    // Master-only key must not leak into account config
    expect(loadedFinal.geminiApiKey).not.toBe('AIzaMasterT4bKey1234567890123456');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 5 — setImmediate mirror backup failure
// ---------------------------------------------------------------------------
describe('Risk-5: Mirror backup failure must not affect primary write', () => {
  beforeEach(() => {
    clearDisk();
    vi.clearAllMocks();
  });

  it('T5-a: saveConfig resolves successfully even when mirrorToSafe throws', async () => {
    (migMod as any).mirrorToSafe.mockImplementation(() => {
      throw new Error('mirror disk full');
    });

    writeDisk(SETTINGS_PATH, {});

    await expect(
      saveConfig({ geminiApiKey: 'AIzaMirrorT5a1234567890abcdefg' }),
    ).resolves.toBeDefined();

    const disk = readDisk(SETTINGS_PATH);
    expect(disk.geminiApiKey).toBe('AIzaMirrorT5a1234567890abcdefg');
  });

  it('T5-b: Primary settings.json is written BEFORE the setImmediate mirror fires', async () => {
    /**
     * Ordering: writeFile for settings.json completes (saveConfig resolves)
     * BEFORE the setImmediate background mirror runs.
     */
    writeDisk(SETTINGS_PATH, {});

    let primaryWritten = false;

    // Wrap writeFile mock to track when primary file is written
    (fsMod.default.writeFile as any).mockImplementation(async (p: string, data: string) => {
      // Write to diskStore directly (no recursive call needed)
      diskStore[p] = data;
      if (p === SETTINGS_PATH) primaryWritten = true;
    });

    let mirrorCalledAfterPrimary = false;
    (migMod as any).mirrorToSafe.mockImplementation(() => {
      mirrorCalledAfterPrimary = primaryWritten;
    });

    await saveConfig({ openaiApiKey: 'sk-order-t5b-test-xxxx' });
    // Flush setImmediate queue
    await new Promise(resolve => setImmediate(resolve));

    expect(primaryWritten).toBe(true);
    expect(mirrorCalledAfterPrimary).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 6 — Migration not complete when loadConfig is called
// ---------------------------------------------------------------------------
describe('Risk-6: loadConfig robustness when migration throws', () => {
  beforeEach(() => {
    clearDisk();
    vi.clearAllMocks();
  });

  it('T6: loadConfig returns a defined object even when syncMasterIntoAccountSettings throws', async () => {
    (migMod as any).syncMasterIntoAccountSettings.mockImplementation(() => {
      throw new Error('migration not ready');
    });

    writeDisk(SETTINGS_PATH, { geminiApiKey: 'AIzaMigrationT6Key123456789012' });

    const config = await loadConfig();

    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 7 — Corrupted JSON recovery
// ---------------------------------------------------------------------------
describe('Risk-9: Corrupted JSON in settings.json', () => {
  beforeEach(() => {
    clearDisk();
    vi.clearAllMocks();
  });

  it('T9: saveConfig after corrupted disk JSON does not throw and writes valid JSON', async () => {
    /**
     * Pre-fix: PRESERVE_KEYS readFileSync block catches JSON.parse error silently;
     * saveConfig continues with cachedConfig and overwrites the file.
     * Post-fix: async path must provide the same guarantee.
     *
     * Because configManager state leaks across tests (_activeUserId from T4 suite),
     * we use a distinct account ID to get a fresh path.
     */
    // Use a fresh account path to avoid state from T4 suite
    const corruptAccountPath = nodePath.join(USER_DATA, 'settings_acctT9.json');
    writeDisk(corruptAccountPath, {});

    // Activate this account so saveConfig uses this path
    await saveConfig({ __userId: 'acctT9' } as any);

    // Re-populate with a valid JSON so cachedConfig merges the geminiApiKey from disk
    writeDisk(corruptAccountPath, { geminiApiKey: 'AIzaT9Test12345678901234567890a' });
    await loadConfig();

    // Now corrupt the disk
    diskStore[corruptAccountPath] = '{ invalid json {{{{';

    // saveConfig reads corrupted file in PRESERVE_KEYS block → parse error → swallowed
    // Then writes cachedConfig (which has costSaverMode:true merged in)
    const result = await saveConfig({ costSaverMode: true });

    // Must not have thrown
    expect(result).toBeDefined();

    // Disk must now contain valid JSON
    const raw = diskStore[corruptAccountPath];
    expect(raw).toBeDefined();
    expect(() => JSON.parse(raw)).not.toThrow();

    const disk = JSON.parse(raw);
    expect(disk.costSaverMode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 8 — Main thread non-blocking
// ---------------------------------------------------------------------------
describe('Risk-8: saveConfig must not block the main thread', () => {
  beforeEach(() => {
    clearDisk();
    vi.clearAllMocks();
  });

  it('T8: saveConfig returns a Promise (async) and resolves with the saved config', async () => {
    /**
     * Pre-fix: readFileSync (sync I/O) inside the PRESERVE_KEYS block runs inline.
     * Post-fix: replaced with await fs.readFile — no sync blocking.
     *
     * With mocked instant fs we cannot measure wall-clock time, so this test
     * verifies the observable CONTRACT:
     * - saveConfig must return a Promise
     * - it must resolve with the merged config object
     * - the resolved value must contain the update field
     *
     * Uses a fresh account path to avoid active-user state from T4/T9 suites.
     */
    const t8AccountPath = nodePath.join(USER_DATA, 'settings_acctT8.json');
    writeDisk(t8AccountPath, {});
    await saveConfig({ __userId: 'acctT8' } as any);

    const promise = saveConfig({ geoOptimization: true });
    expect(promise).toBeInstanceOf(Promise);

    const result = await promise;
    expect(result).toBeDefined();
    expect(result.geoOptimization).toBe(true);

    const raw = diskStore[t8AccountPath];
    expect(raw).toBeDefined();
    const disk = JSON.parse(raw);
    expect(disk.geoOptimization).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 9 — EBUSY backoff / retry (post-fix contract)
// ---------------------------------------------------------------------------
describe('Risk-10: EBUSY retry / backoff on async readFile', () => {
  beforeEach(() => {
    clearDisk();
    vi.clearAllMocks();
  });

  it('T10-a: readFile EBUSY on first attempt — PRESERVE_KEYS value still lands on disk after retry', async () => {
    /**
     * Pre-fix: no retry — EBUSY swallowed; geminiApiKey lost from written file.
     * Post-fix: retry with backoff recovers the disk value.
     *
     * EXPECTED TO FAIL pre-fix: result.geminiApiKey is undefined.
     */
    vi.useFakeTimers();

    writeDisk(SETTINGS_PATH, { geminiApiKey: 'AIzaEbusyT10aKey1234567890abcde' });

    let readCount = 0;
    (fsMod.default.readFile as any).mockImplementation(async (p: string) => {
      readCount++;
      if (p === SETTINGS_PATH && readCount === 1) {
        const err: any = new Error('EBUSY: resource busy');
        err.code = 'EBUSY';
        throw err;
      }
      if (diskStore[p] === undefined) {
        const err: any = new Error(`ENOENT: ${p}`); err.code = 'ENOENT'; throw err;
      }
      return diskStore[p];
    });

    const savePromise = saveConfig({ costSaverMode: true });
    await vi.runAllTimersAsync();
    const result = await savePromise;

    // Pre-fix: no retry → geminiApiKey lost → this FAILS
    expect(result.geminiApiKey).toBe('AIzaEbusyT10aKey1234567890abcde');

    vi.useRealTimers();
  });

  it('T10-b: 3 consecutive EBUSY errors — claudeApiKey must not be silently lost from disk', async () => {
    /**
     * Pre-fix: all EBUSY errors swallowed; claudeApiKey silently disappears.
     * Post-fix: max retries reached → explicit error OR cached value preserved.
     *
     * We assert no silent data loss (empty result without an error).
     */
    vi.useFakeTimers();

    writeDisk(SETTINGS_PATH, { claudeApiKey: 'sk-ant-T10b-loss-test-key' });

    (fsMod.default.readFile as any).mockImplementation(async () => {
      const err: any = new Error('EBUSY: always busy');
      err.code = 'EBUSY';
      throw err;
    });

    const savePromise = saveConfig({ costSaverMode: false })
      .then(r => ({ ok: true as const, value: r }))
      .catch(e => ({ ok: false as const, error: e }));

    await vi.runAllTimersAsync();
    const outcome = await savePromise;

    if (outcome.ok) {
      if (outcome.value.claudeApiKey === undefined) {
        throw new Error(
          'REGRESSION: saveConfig silently lost claudeApiKey after 3x EBUSY — ' +
          'expected retry-based recovery or explicit error, got silent data loss',
        );
      }
    }
    // Explicit rejection is also acceptable

    vi.useRealTimers();
  });
});
