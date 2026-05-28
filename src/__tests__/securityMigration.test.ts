/**
 * SPEC-MIGRATION-2026 M1 P2 — safeStorageWrapper + encryptionMigrator tests.
 *
 * electron.safeStorage is mocked because vitest runs outside an Electron host
 * and the OS keychain is unavailable in CI.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock electron — vi.hoisted exposes a mutable state object that the mock
// factory closure references. Tests flip state.available between scenarios.
// ---------------------------------------------------------------------------

// Mock the local thin port that wraps electron.safeStorage. Mocking the local
// module is reliable across environments — vi.mock against `electron` itself
// often fails because vitest cannot resolve the native module in test runs.
const state = vi.hoisted(() => ({ available: true }));

vi.mock('../security/safeStoragePort', () => ({
  port: {
    isEncryptionAvailable: () => state.available,
    encryptString: (s: string) => Buffer.from(`ENC[${s}]`, 'utf-8'),
    decryptString: (b: Buffer) => {
      const s = b.toString('utf-8');
      const m = s.match(/^ENC\[(.*)\]$/);
      if (!m) throw new Error('mock: cannot decrypt malformed buffer');
      return m[1];
    },
  },
}));

import {
  encryptString,
  decryptString,
  isEncrypted,
  isEncryptionAvailable,
} from '../security/safeStorageWrapper';
import {
  migrateConfigToEncrypted,
  getSensitiveFields,
} from '../security/encryptionMigrator';

function setAvailable(v: boolean): void {
  state.available = v;
}

// ---------------------------------------------------------------------------
// safeStorageWrapper
// ---------------------------------------------------------------------------

describe('safeStorageWrapper', () => {
  beforeEach(() => {
    setAvailable(true);
  });

  it('reports availability from electron probe', () => {
    expect(isEncryptionAvailable()).toBe(true);
    setAvailable(false);
    expect(isEncryptionAvailable()).toBe(false);
  });

  it('round-trips a plaintext value via encrypt → decrypt', () => {
    const plaintext = 'sk-test-1234567890';
    const stored = encryptString(plaintext);
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(isEncrypted(stored)).toBe(true);
    expect(decryptString(stored)).toBe(plaintext);
  });

  it('returns empty string unchanged', () => {
    expect(encryptString('')).toBe('');
    expect(decryptString('')).toBe('');
  });

  it('treats unprefixed input as plaintext on decryptString', () => {
    expect(decryptString('AIza-legacy-plaintext')).toBe('AIza-legacy-plaintext');
  });

  it('throws when encryption is unavailable', () => {
    setAvailable(false);
    expect(() => encryptString('anything')).toThrow(/SAFE_STORAGE_UNAVAILABLE/);
  });

  it('throws when decrypting prefixed value without backend', () => {
    const stored = encryptString('value');
    setAvailable(false);
    expect(() => decryptString(stored)).toThrow(/SAFE_STORAGE_UNAVAILABLE/);
  });
});

// ---------------------------------------------------------------------------
// encryptionMigrator
// ---------------------------------------------------------------------------

describe('encryptionMigrator', () => {
  beforeEach(() => {
    setAvailable(true);
  });

  it('skips when configEncrypted flag is true', () => {
    const { config, report } = migrateConfigToEncrypted({
      configEncrypted: true,
      openaiApiKey: 'sk-still-plaintext',
    });
    expect(report.skipped).toBe(true);
    expect(report.skipReason).toBe('CONFIG_ALREADY_ENCRYPTED');
    expect(config['openaiApiKey']).toBe('sk-still-plaintext');
  });

  it('skips with reason when safeStorage is unavailable', () => {
    setAvailable(false);
    const { config, report } = migrateConfigToEncrypted({
      openaiApiKey: 'sk-leave-as-is',
    });
    expect(report.skipped).toBe(true);
    expect(report.skipReason).toContain('SAFE_STORAGE_UNAVAILABLE');
    expect(config['openaiApiKey']).toBe('sk-leave-as-is');
  });

  it('encrypts every sensitive plaintext field exactly once', () => {
    const input = {
      openaiApiKey: 'sk-openai',
      claudeApiKey: 'sk-ant-claude',
      savedNaverPassword: 'plaintext-pw',
      unrelatedField: 'should-stay-plain',
    };
    const { config, report } = migrateConfigToEncrypted(input);
    expect(report.skipped).toBe(false);
    expect(report.migrated).toContain('openaiApiKey');
    expect(report.migrated).toContain('claudeApiKey');
    expect(report.migrated).toContain('savedNaverPassword');
    expect(report.failures).toEqual([]);
    expect((config['openaiApiKey'] as string).startsWith('enc:v1:')).toBe(true);
    expect((config['claudeApiKey'] as string).startsWith('enc:v1:')).toBe(true);
    expect(config['unrelatedField']).toBe('should-stay-plain');
    expect(config['configEncrypted']).toBe(true);
    expect(decryptString(config['openaiApiKey'] as string)).toBe('sk-openai');
  });

  it('detects already-encrypted fields and does not double-encrypt', () => {
    const alreadyEnc = encryptString('sk-pre-encrypted');
    const input = {
      openaiApiKey: alreadyEnc,
      claudeApiKey: 'sk-claude-new',
    };
    const { config, report } = migrateConfigToEncrypted(input);
    expect(report.alreadyEncrypted).toContain('openaiApiKey');
    expect(report.migrated).toContain('claudeApiKey');
    expect(config['openaiApiKey']).toBe(alreadyEnc);
  });

  it('migrates string[] rotation arrays (geminiApiKeys)', () => {
    const input = {
      geminiApiKeys: ['AIza-1', 'AIza-2', ''],
    };
    const { config, report } = migrateConfigToEncrypted(input);
    const out = config['geminiApiKeys'] as string[];
    expect(out[0].startsWith('enc:v1:')).toBe(true);
    expect(out[1].startsWith('enc:v1:')).toBe(true);
    expect(out[2]).toBe('');
    expect(report.migrated).toContain('geminiApiKeys');
  });

  it('exposes the canonical sensitive-field list (≥18 entries)', () => {
    const fields = getSensitiveFields();
    expect(fields.length).toBeGreaterThanOrEqual(18);
    expect(fields).toContain('savedNaverPassword');
    expect(fields).toContain('openaiApiKey');
  });
});
