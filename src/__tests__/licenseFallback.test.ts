import { describe, it, expect, vi, beforeEach } from 'vitest';

// Electron과 fs 모킹
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-license' },
}));

vi.mock('fs/promises', () => {
  let store: Record<string, string> = {};
  return {
    default: {
      readFile: vi.fn(async (p: string) => { if (store[p]) return store[p]; throw new Error('ENOENT'); }),
      writeFile: vi.fn(async (p: string, d: string) => { store[p] = d; }),
      mkdir: vi.fn(async () => undefined),
    },
    readFile: vi.fn(async (p: string) => { if (store[p]) return store[p]; throw new Error('ENOENT'); }),
    writeFile: vi.fn(async (p: string, d: string) => { store[p] = d; }),
    mkdir: vi.fn(async () => undefined),
    __resetStore: () => { store = {}; },
  };
});

describe('licenseFallback', () => {
  beforeEach(async () => {
    const fs = await import('fs/promises') as any;
    fs.__resetStore?.();
    vi.resetModules();
  });

  it('checkOfflineGrace는 캐시 없으면 not allowed를 반환한다', async () => {
    const { checkOfflineGrace } = await import('../licenseFallback');
    const result = await checkOfflineGrace();
    expect(result.allowed).toBe(false);
    expect(result.lastVerifiedAt).toBeNull();
  });

  it('saveVerificationSuccess 후 checkOfflineGrace가 allowed를 반환한다', async () => {
    const { saveVerificationSuccess, checkOfflineGrace } = await import('../licenseFallback');

    await saveVerificationSuccess({
      valid: true,
      tier: 'pro',
      expiresAt: '2027-01-01T00:00:00Z',
      serverUsed: 'test',
      verifiedAt: new Date().toISOString(),
    });

    const result = await checkOfflineGrace();
    expect(result.allowed).toBe(true);
    expect(result.cachedTier).toBe('pro');
    expect(result.remainingMs).toBeGreaterThan(0);
  });

  it('healthCheck이 존재한다', async () => {
    const mod = await import('../licenseFallback');
    expect(typeof mod.healthCheck).toBe('function');
  });

  it('getServerStatus가 존재한다', async () => {
    const mod = await import('../licenseFallback');
    expect(typeof mod.getServerStatus).toBe('function');
  });

  it('verifyWithFallback이 존재한다', async () => {
    const mod = await import('../licenseFallback');
    expect(typeof mod.verifyWithFallback).toBe('function');
  });
});
