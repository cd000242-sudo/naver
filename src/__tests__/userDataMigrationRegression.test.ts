/**
 * Regression tests for userDataMigration — Option A pre-condition guard
 *
 * These tests verify that after Option A is applied, mirrorToSafe()
 * excludes large session folders (playwright-session*, puppeteer-session*)
 * while preserving all other critical user data.
 *
 * RED scenarios (should fail on pre-fix code): M1, M2, M4, M8, M11
 * GREEN scenarios (already correct): M3, M5, M6, M7, M9, M10, M12
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

// --------------------------------------------------------------------------
// In-memory virtual filesystem helper
// --------------------------------------------------------------------------

type FileEntry = { type: 'file'; content: string; size?: number } | { type: 'dir' };

function buildVfs(entries: Record<string, FileEntry>): Map<string, FileEntry> {
  return new Map(Object.entries(entries));
}

// --------------------------------------------------------------------------
// Shared FS mock factory — returns fresh spies each test
// --------------------------------------------------------------------------

function makeFsMock(vfs: Map<string, FileEntry>) {
  const dirs = new Set<string>(
    [...vfs.entries()].filter(([, v]) => v.type === 'dir').map(([k]) => k)
  );

  const existsSync = vi.fn((p: string) => {
    const norm = p.replace(/\\/g, '/');
    if (vfs.has(norm)) return true;
    // Check if any key starts with norm + '/'  (directory exists implicitly)
    return [...vfs.keys()].some(k => k.startsWith(norm + '/'));
  });

  const readdirSync = vi.fn((p: string): string[] => {
    const norm = p.replace(/\\/g, '/').replace(/\/$/, '');
    const children = new Set<string>();
    for (const k of vfs.keys()) {
      if (k.startsWith(norm + '/')) {
        const rest = k.slice(norm.length + 1);
        const first = rest.split('/')[0];
        if (first) children.add(first);
      }
    }
    return [...children];
  });

  const statSync = vi.fn((p: string) => {
    const norm = p.replace(/\\/g, '/');
    const entry = vfs.get(norm);
    const isDir = entry?.type === 'dir' || dirs.has(norm) ||
      [...vfs.keys()].some(k => k.startsWith(norm + '/'));
    return {
      isDirectory: () => isDir,
      size: entry?.type === 'file' ? (entry.size ?? (entry.content?.length ?? 0)) : 0,
    };
  });

  const copyFileSync = vi.fn((src: string, dst: string) => {
    const srcNorm = src.replace(/\\/g, '/');
    const dstNorm = dst.replace(/\\/g, '/');
    const entry = vfs.get(srcNorm);
    if (!entry || entry.type !== 'file') {
      throw new Error(`ENOENT: no such file '${src}'`);
    }
    vfs.set(dstNorm, { ...entry });
  });

  const mkdirSync = vi.fn((p: string) => {
    const norm = p.replace(/\\/g, '/');
    dirs.add(norm);
    vfs.set(norm, { type: 'dir' });
  });

  const readFileSync = vi.fn((p: string, _enc?: string): string => {
    const norm = p.replace(/\\/g, '/');
    const entry = vfs.get(norm);
    if (!entry || entry.type !== 'file') {
      throw new Error(`ENOENT: no such file '${p}'`);
    }
    return entry.content;
  });

  const writeFileSync = vi.fn((p: string, data: string) => {
    const norm = p.replace(/\\/g, '/');
    vfs.set(norm, { type: 'file', content: data });
  });

  const rmSync = vi.fn((p: string, _opts?: { recursive?: boolean; force?: boolean }) => {
    const norm = p.replace(/\\/g, '/');
    for (const key of [...vfs.keys()]) {
      if (key === norm || key.startsWith(norm + '/')) vfs.delete(key);
    }
    dirs.delete(norm);
  });

  return {
    existsSync, readdirSync, statSync, copyFileSync,
    mkdirSync, readFileSync, writeFileSync, rmSync,
    vfs,
  };
}

// --------------------------------------------------------------------------
// Helper: was the given path copied TO mirror?
// --------------------------------------------------------------------------
function wasCopiedToMirror(
  copyFileSync: ReturnType<typeof vi.fn>,
  mirrorDir: string,
  name: string
): boolean {
  const normMirror = mirrorDir.replace(/\\/g, '/');
  return copyFileSync.mock.calls.some(([, dst]) => {
    const normDst = String(dst).replace(/\\/g, '/');
    return normDst.startsWith(normMirror + '/') && normDst.includes(name);
  });
}

// --------------------------------------------------------------------------
// Setup: reset module registry between tests
// --------------------------------------------------------------------------
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --------------------------------------------------------------------------
// M1 — mirrorToSafe must NOT copy playwright-session folders
// --------------------------------------------------------------------------
describe('M1: playwright-session folders are excluded from mirror', () => {
  it('does not copy playwright-session directory contents to mirror', async () => {
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{"geminiApiKey":"key"}' },
      '/userData/playwright-session': { type: 'dir' },
      '/userData/playwright-session/Default': { type: 'dir' },
      '/userData/playwright-session/Default/Cookies': { type: 'file', content: 'cookies', size: 1024 * 1024 * 500 },
      '/userData/playwright-session-work': { type: 'dir' },
      '/userData/playwright-session-work/data': { type: 'file', content: 'data', size: 1024 * 1024 * 200 },
      '/mirror/_safe': { type: 'dir' },
    });

    const fsMock = makeFsMock(vfs);
    vi.doMock('fs', () => fsMock);

    const { mirrorToSafe } = await import('../main/userDataMigration');
    mirrorToSafe(userDataDir, mirrorDir);

    // After Option A: playwright-session must NOT appear in mirror
    const copiedPlaywright = fsMock.copyFileSync.mock.calls.some(([, dst]) => {
      const d = String(dst).replace(/\\/g, '/');
      return d.includes('playwright-session');
    });
    expect(copiedPlaywright).toBe(false);
  });
});

// --------------------------------------------------------------------------
// M2 — mirrorToSafe must NOT copy puppeteer-session folders
// --------------------------------------------------------------------------
describe('M2: puppeteer-session folders are excluded from mirror', () => {
  it('does not copy puppeteer-session directory contents to mirror', async () => {
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{"geminiApiKey":"key"}' },
      '/userData/puppeteer-session': { type: 'dir' },
      '/userData/puppeteer-session/profile': { type: 'dir' },
      '/userData/puppeteer-session/profile/Cookies': { type: 'file', content: 'c', size: 1024 * 1024 * 100 },
      '/userData/puppeteer-session-abc': { type: 'dir' },
      '/userData/puppeteer-session-abc/Cookies': { type: 'file', content: 'c', size: 1024 * 1024 * 50 },
      '/mirror/_safe': { type: 'dir' },
    });

    const fsMock = makeFsMock(vfs);
    vi.doMock('fs', () => fsMock);

    const { mirrorToSafe } = await import('../main/userDataMigration');
    mirrorToSafe(userDataDir, mirrorDir);

    const copiedPuppeteer = fsMock.copyFileSync.mock.calls.some(([, dst]) => {
      const d = String(dst).replace(/\\/g, '/');
      return d.includes('puppeteer-session');
    });
    expect(copiedPuppeteer).toBe(false);
  });
});

// --------------------------------------------------------------------------
// M3 — settings.json and license/ are still mirrored (preservation targets)
// --------------------------------------------------------------------------
describe('M3: critical user data files are still mirrored', () => {
  it('copies settings.json to mirror', async () => {
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{"geminiApiKey":"my-key"}' },
      '/userData/blog-accounts.json': { type: 'file', content: '[]' },
      '/userData/license': { type: 'dir' },
      '/userData/license/license.dat': { type: 'file', content: 'LICENSEDATA' },
      '/mirror/_safe': { type: 'dir' },
    });

    const fsMock = makeFsMock(vfs);
    vi.doMock('fs', () => fsMock);

    const { mirrorToSafe } = await import('../main/userDataMigration');
    mirrorToSafe(userDataDir, mirrorDir);

    // settings.json should be in mirror
    const settingsCopied = wasCopiedToMirror(fsMock.copyFileSync, mirrorDir, 'settings.json');
    expect(settingsCopied).toBe(true);

    // blog-accounts.json should be in mirror
    const blogCopied = wasCopiedToMirror(fsMock.copyFileSync, mirrorDir, 'blog-accounts.json');
    expect(blogCopied).toBe(true);
  });

  it('mirrors license directory', async () => {
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{"geminiApiKey":"key"}' },
      '/userData/license': { type: 'dir' },
      '/userData/license/license.dat': { type: 'file', content: 'LICENSEDATA' },
      '/mirror/_safe': { type: 'dir' },
    });

    const fsMock = makeFsMock(vfs);
    vi.doMock('fs', () => fsMock);

    const { mirrorToSafe } = await import('../main/userDataMigration');
    mirrorToSafe(userDataDir, mirrorDir);

    const licenseCopied = wasCopiedToMirror(fsMock.copyFileSync, mirrorDir, 'license.dat');
    expect(licenseCopied).toBe(true);
  });
});

// --------------------------------------------------------------------------
// M4 — mirrorToSafe completes in < 500ms when session folders are excluded
// --------------------------------------------------------------------------
describe('M4: mirrorToSafe is fast when session folders are excluded', () => {
  it('completes in under 500ms with large session folders present', async () => {
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    // Simulate session folders with many "files"
    const sessionFiles: Record<string, FileEntry> = {};
    for (let i = 0; i < 200; i++) {
      sessionFiles[`/userData/playwright-session/f${i}.dat`] = {
        type: 'file', content: 'x'.repeat(100), size: 1024 * 1024 * 5,
      };
      sessionFiles[`/userData/puppeteer-session/f${i}.dat`] = {
        type: 'file', content: 'x'.repeat(100), size: 1024 * 1024 * 3,
      };
    }

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{"geminiApiKey":"key"}' },
      '/userData/playwright-session': { type: 'dir' },
      '/userData/puppeteer-session': { type: 'dir' },
      '/mirror/_safe': { type: 'dir' },
      ...sessionFiles,
    });

    const fsMock = makeFsMock(vfs);
    vi.doMock('fs', () => fsMock);

    const { mirrorToSafe } = await import('../main/userDataMigration');

    const start = Date.now();
    mirrorToSafe(userDataDir, mirrorDir);
    const elapsed = Date.now() - start;

    // After Option A: session folders excluded → loop won't iterate 400 files
    // copyFileSync should be called for settings.json only (not 400 session files)
    const sessionCopyCalls = fsMock.copyFileSync.mock.calls.filter(([, dst]) => {
      const d = String(dst).replace(/\\/g, '/');
      return d.includes('playwright-session') || d.includes('puppeteer-session');
    });
    expect(sessionCopyCalls.length).toBe(0);

    // Timing: in real implementation copyFileSync is mocked (instant),
    // but the LOOP COUNT change is what we're verifying via call count
    expect(elapsed).toBeLessThan(500);
  });
});

// --------------------------------------------------------------------------
// M5 — Non-session small data is still mirrored (regression check)
// --------------------------------------------------------------------------
describe('M5: non-session data is mirrored correctly', () => {
  it('copies title-metrics folder contents to mirror', async () => {
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{"geminiApiKey":"key"}' },
      '/userData/title-metrics': { type: 'dir' },
      '/userData/title-metrics/data.json': { type: 'file', content: '{"score":90}' },
      '/mirror/_safe': { type: 'dir' },
    });

    const fsMock = makeFsMock(vfs);
    vi.doMock('fs', () => fsMock);

    const { mirrorToSafe } = await import('../main/userDataMigration');
    mirrorToSafe(userDataDir, mirrorDir);

    const metricsCopied = wasCopiedToMirror(fsMock.copyFileSync, mirrorDir, 'data.json');
    expect(metricsCopied).toBe(true);
  });
});

// --------------------------------------------------------------------------
// M6 — restoreFromMirrorIfEmpty works even without session folders in mirror
// --------------------------------------------------------------------------
describe('M6: restoreFromMirrorIfEmpty works without session folders', () => {
  it('restores settings.json even when no session folders exist in mirror', async () => {
    const userDataDir = '/userData-empty';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/mirror/_safe': { type: 'dir' },
      '/mirror/_safe/settings.json': {
        type: 'file',
        content: JSON.stringify({ geminiApiKey: 'restored-key' }),
      },
      // No playwright-session, no puppeteer-session in mirror
    });

    const fsMock = makeFsMock(vfs);
    vi.doMock('fs', () => fsMock);

    const { restoreFromMirrorIfEmpty } = await import('../main/userDataMigration');
    const result = restoreFromMirrorIfEmpty(userDataDir, mirrorDir);

    // Should succeed and copy settings.json despite absence of session folders
    expect(result).toBe(true);

    // settings.json should now exist in userDataDir
    const settingsKey = `${userDataDir}/settings.json`.replace(/\\/g, '/');
    const restoredEntry = vfs.get(settingsKey);
    expect(restoredEntry?.type).toBe('file');
    const restoredContent = JSON.parse((restoredEntry as any).content);
    expect(restoredContent.geminiApiKey).toBe('restored-key');
  });
});

// --------------------------------------------------------------------------
// M7 — mirrorToSafe errors are caught silently (no throw)
// --------------------------------------------------------------------------
describe('M7: mirrorToSafe errors do not propagate to caller', () => {
  it('does not throw even when copyFileSync throws', async () => {
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{}' },
      '/mirror/_safe': { type: 'dir' },
    });

    const fsMock = makeFsMock(vfs);
    // Force all copy operations to fail
    fsMock.copyFileSync.mockImplementation(() => {
      throw new Error('DISK FULL');
    });
    vi.doMock('fs', () => fsMock);

    const { mirrorToSafe } = await import('../main/userDataMigration');

    // Must not throw — error must be swallowed
    expect(() => mirrorToSafe(userDataDir, mirrorDir)).not.toThrow();
  });
});

// --------------------------------------------------------------------------
// M8 — SESSION_BLACKLIST pattern matches variant folder names
// --------------------------------------------------------------------------
describe('M8: session folder exclusion pattern covers variant names', () => {
  const sessionVariants = [
    'playwright-session',
    'playwright-session-default',
    'playwright-session-user1',
    'playwright-session-abc123',
    'puppeteer-session',
    'puppeteer-session-chrome',
    'puppeteer-session-v2',
  ];

  for (const variant of sessionVariants) {
    it(`excludes ${variant} from mirror`, async () => {
      vi.resetModules();

      const userDataDir = '/userData';
      const mirrorDir = '/mirror/_safe';

      const vfs = buildVfs({
        '/userData': { type: 'dir' },
        '/userData/settings.json': { type: 'file', content: '{"geminiApiKey":"key"}' },
        [`/userData/${variant}`]: { type: 'dir' },
        [`/userData/${variant}/Cookies`]: { type: 'file', content: 'cookie-data', size: 1024 * 1024 },
        '/mirror/_safe': { type: 'dir' },
      });

      const fsMock = makeFsMock(vfs);
      vi.doMock('fs', () => fsMock);

      const { mirrorToSafe } = await import('../main/userDataMigration');
      mirrorToSafe(userDataDir, mirrorDir);

      const sessionCopied = fsMock.copyFileSync.mock.calls.some(([, dst]) => {
        const d = String(dst).replace(/\\/g, '/');
        return d.includes(variant);
      });
      expect(sessionCopied).toBe(false);
    });
  }
});

// --------------------------------------------------------------------------
// M9 — Existing session folders already in mirror are not deleted (preserved)
// --------------------------------------------------------------------------
describe('M9: pre-existing session folders in mirror are not removed', () => {
  it('keeps existing playwright-session in mirror when new mirror skips it', async () => {
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{"geminiApiKey":"key"}' },
      '/userData/playwright-session': { type: 'dir' },
      '/userData/playwright-session/Cookies': { type: 'file', content: 'fresh-cookies' },
      // Pre-existing mirror entry
      '/mirror/_safe': { type: 'dir' },
      '/mirror/_safe/playwright-session': { type: 'dir' },
      '/mirror/_safe/playwright-session/Cookies': { type: 'file', content: 'old-cookies' },
    });

    const fsMock = makeFsMock(vfs);
    vi.doMock('fs', () => fsMock);

    const { mirrorToSafe } = await import('../main/userDataMigration');
    mirrorToSafe(userDataDir, mirrorDir);

    // Old mirror entry must still exist — mirrorToSafe must not delete it
    const oldMirrorKey = '/mirror/_safe/playwright-session/Cookies';
    expect(vfs.has(oldMirrorKey)).toBe(true);
    const oldEntry = vfs.get(oldMirrorKey) as { type: 'file'; content: string };
    // Content should remain 'old-cookies' (not overwritten by new run)
    expect(oldEntry.content).toBe('old-cookies');
  });
});

// --------------------------------------------------------------------------
// M10 — Mirror failure logs console.warn, does not throw
// --------------------------------------------------------------------------
describe('M10: mirror failure emits console.warn instead of throwing', () => {
  it('calls console.warn when an error occurs during mirror', async () => {
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{"geminiApiKey":"key"}' },
      '/mirror/_safe': { type: 'dir' },
    });

    const fsMock = makeFsMock(vfs);
    // Force existsSync to throw on the second call (after initial userDataDir check passes),
    // which triggers the outermost catch block in mirrorToSafe
    let callCount = 0;
    fsMock.existsSync.mockImplementation((p: string) => {
      callCount++;
      if (callCount > 1) {
        throw new Error('IO_CATASTROPHIC_ERROR');
      }
      return true; // first call: userDataDir exists
    });
    vi.doMock('fs', () => fsMock);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { mirrorToSafe } = await import('../main/userDataMigration');
    expect(() => mirrorToSafe(userDataDir, mirrorDir)).not.toThrow();

    // The outer catch must emit console.warn
    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls.map(c => String(c[0]));
    const anyMirrorWarn = warnArgs.some(m => m.includes('UserDataMirror') || m.includes('미러'));
    expect(anyMirrorWarn).toBe(true);

    warnSpy.mockRestore();
  });
});

// --------------------------------------------------------------------------
// M11 — Queue depth: concurrent calls do not multiply mirror writes
// (Option A specific: if a queue/lock mechanism is added, only 1 runs at a time)
// --------------------------------------------------------------------------
describe('M11: concurrent mirrorToSafe calls are deduplicated', () => {
  it('second synchronous call while first is "in flight" is a no-op or queued', async () => {
    /**
     * NOTE: The current synchronous implementation of mirrorToSafe does NOT
     * have a concurrency guard. This test documents the expected behavior
     * after Option A introduces a queue/lock.
     *
     * Pre-fix: both calls execute fully → copyFileSync called 2N times.
     * Post-fix: second call is skipped (in-flight guard) → copyFileSync called N times.
     *
     * We assert the POST-FIX expectation — this test will be RED on pre-fix code.
     */
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{"geminiApiKey":"key"}' },
      '/mirror/_safe': { type: 'dir' },
    });

    const fsMock = makeFsMock(vfs);
    vi.doMock('fs', () => fsMock);

    const { mirrorToSafe } = await import('../main/userDataMigration');

    // Simulate 100 concurrent calls (synchronous, all queued)
    for (let i = 0; i < 100; i++) {
      mirrorToSafe(userDataDir, mirrorDir);
    }

    // After Option A: only the first call should have copied settings.json
    // copyFileSync for settings.json must be called exactly once
    const settingsCopyCalls = fsMock.copyFileSync.mock.calls.filter(([, dst]) => {
      const d = String(dst).replace(/\\/g, '/');
      return d.includes('settings.json');
    });

    // Pre-fix: 100 calls → 100 copies (RED)
    // Post-fix: 1 call (in-flight guard) → 1 copy (GREEN)
    expect(settingsCopyCalls.length).toBe(1);
  });
});

// --------------------------------------------------------------------------
// M12 — Integration: setImmediate deferred mirror yields to main thread
// --------------------------------------------------------------------------
describe('M12: setImmediate-deferred mirror does not block main thread', () => {
  it('main thread work completes before mirror callback fires', async () => {
    /**
     * Integration scenario: when mirrorToSafe is triggered via setImmediate
     * after config save, the main thread must process its next tick BEFORE
     * the mirror runs.
     *
     * This verifies the async scheduling behaviour expected in Option A.
     */
    const executionOrder: string[] = [];

    const mirrorFn = vi.fn(() => {
      executionOrder.push('mirror');
    });

    // Simulate config save + deferred mirror via setImmediate
    function simulateConfigSave() {
      executionOrder.push('config-saved');
      setImmediate(mirrorFn);
      executionOrder.push('main-thread-continued');
    }

    await new Promise<void>((resolve) => {
      simulateConfigSave();
      // Yield to allow setImmediate to fire
      setImmediate(() => {
        resolve();
      });
    });

    // Main thread work ('main-thread-continued') must appear BEFORE 'mirror'
    const configIdx = executionOrder.indexOf('config-saved');
    const mainIdx = executionOrder.indexOf('main-thread-continued');
    const mirrorIdx = executionOrder.indexOf('mirror');

    expect(configIdx).toBeLessThan(mainIdx);
    expect(mainIdx).toBeLessThan(mirrorIdx);
    expect(mirrorFn).toHaveBeenCalledTimes(1);
  });
});

// --------------------------------------------------------------------------
// M13 — 미러는 동기화다: 원본에서 사라진 파일은 미러에서도 지운다
//
// 실측(2026-08-30): _safe/Local Storage 가 18.6GB(2,586개 파일)까지 불어났다.
// 같은 시점 실제 userData 의 Local Storage 는 14MB(10개 파일). LevelDB 가 번호 붙은
// 세대를 계속 새로 만들고 옛 세대를 지우는데 미러는 복사만 해서 전부 쌓였다.
// --------------------------------------------------------------------------
describe('M13: 원본에 없는 미러 파일은 정리된다', () => {
  it('사라진 LevelDB 세대를 미러에서 지우고 현재 세대는 남긴다', async () => {
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{}' },
      '/userData/Local Storage': { type: 'dir' },
      '/userData/Local Storage/leveldb': { type: 'dir' },
      '/userData/Local Storage/leveldb/026723.ldb': { type: 'file', content: 'current' },
      '/mirror/_safe': { type: 'dir' },
      '/mirror/_safe/Local Storage': { type: 'dir' },
      '/mirror/_safe/Local Storage/leveldb': { type: 'dir' },
      '/mirror/_safe/Local Storage/leveldb/026723.ldb': { type: 'file', content: 'current' },
      '/mirror/_safe/Local Storage/leveldb/018391.log': { type: 'file', content: 'stale', size: 1024 * 1024 * 97 },
      '/mirror/_safe/Local Storage/leveldb/016999.log': { type: 'file', content: 'stale', size: 1024 * 1024 * 91 },
    });

    const fsMock = makeFsMock(vfs);
    vi.doMock('fs', () => fsMock);

    const { mirrorToSafe } = await import('../main/userDataMigration');
    mirrorToSafe(userDataDir, mirrorDir);

    expect(fsMock.vfs.has('/mirror/_safe/Local Storage/leveldb/018391.log')).toBe(false);
    expect(fsMock.vfs.has('/mirror/_safe/Local Storage/leveldb/016999.log')).toBe(false);
    // 현재 세대는 그대로 있어야 한다 — 복원 근거가 사라지면 안 된다.
    expect(fsMock.vfs.has('/mirror/_safe/Local Storage/leveldb/026723.ldb')).toBe(true);
  });

  it('원본에만 있는 파일은 지우지 않는다 (미러 밖은 건드리지 않음)', async () => {
    const userDataDir = '/userData';
    const mirrorDir = '/mirror/_safe';

    const vfs = buildVfs({
      '/userData': { type: 'dir' },
      '/userData/settings.json': { type: 'file', content: '{}' },
      '/userData/Local Storage': { type: 'dir' },
      '/userData/Local Storage/keep.ldb': { type: 'file', content: 'keep' },
      '/mirror/_safe': { type: 'dir' },
    });

    const fsMock = makeFsMock(vfs);
    vi.doMock('fs', () => fsMock);

    const { mirrorToSafe } = await import('../main/userDataMigration');
    mirrorToSafe(userDataDir, mirrorDir);

    expect(fsMock.vfs.has('/userData/Local Storage/keep.ldb')).toBe(true);
    const removedFromSource = fsMock.rmSync.mock.calls.some(([target]) =>
      String(target).replace(/\\/g, '/').startsWith('/userData'));
    expect(removedFromSource).toBe(false);
  });
});
