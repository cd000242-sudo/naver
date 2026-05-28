/**
 * One-shot migrator that upgrades plaintext API keys/credentials in the
 * existing settings.json to safeStorage-encrypted payloads.
 *
 * SPEC-MIGRATION-2026 M1 P2.
 *
 * Contract:
 * - Idempotent: re-running on an already-migrated config is a no-op.
 * - Atomic per-field: a single field's encrypt failure does not corrupt the
 *   rest of the config — the field is left as plaintext and the failure is
 *   reported in MigrationReport.failures so the UI can prompt the user.
 * - Migration flag: once every sensitive field is encrypted, config gains
 *   `configEncrypted: true` so subsequent app boots skip the migrator.
 *
 * Failure model (feedback_no_fallback):
 * - If safeStorage itself is unavailable (e.g., Linux without keyring), the
 *   migrator returns a report with skipped=true and reason. The caller MUST
 *   surface this to the user — never silently leave keys plaintext.
 */

import {
  decryptString,
  encryptString,
  isEncrypted,
  isEncryptionAvailable,
} from './safeStorageWrapper.js';

// ---------------------------------------------------------------------------
// Fields that hold secrets — must be encrypted at rest
// ---------------------------------------------------------------------------

/**
 * Canonical list of sensitive top-level fields in AppConfig. Update this
 * alongside configManager when new providers are added.
 *
 * NOTE: `geminiApiKeys` (string[] rotation) is handled separately because each
 * array element needs per-element encryption.
 */
const SENSITIVE_FIELDS: readonly string[] = [
  'geminiApiKey',
  'openaiApiKey',
  'openaiImageApiKey',
  'claudeApiKey',
  'perplexityApiKey',
  'leonardoaiApiKey',
  'deepinfraApiKey',
  'naverClientId',
  'naverClientSecret',
  'naverDatalabClientId',
  'naverDatalabClientSecret',
  'naverAdApiKey',
  'naverAdSecretKey',
  'naverAdCustomerId',
  'savedNaverId',
  'savedNaverPassword',
  'savedLicenseUserId',
  'savedLicensePassword',
];

const ARRAY_FIELDS: readonly string[] = ['geminiApiKeys'];

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

export interface MigrationReport {
  /** True when no work was required (already migrated or no secrets present). */
  readonly skipped: boolean;
  /** Reason when skipped=true. */
  readonly skipReason?: string;
  /** Field names that were successfully encrypted in this run. */
  readonly migrated: readonly string[];
  /** Field names that already carried the enc:v1: prefix before this run. */
  readonly alreadyEncrypted: readonly string[];
  /** Field names whose encryption attempt threw; left as plaintext. */
  readonly failures: ReadonlyArray<{ field: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypts every sensitive field in `config` (in-place on a clone). Returns
 * both the upgraded config and a MigrationReport summarizing what happened.
 *
 * The function never mutates the input. Callers should write the returned
 * config back to disk only when failures.length === 0 and at least one of
 * migrated/alreadyEncrypted is non-empty (to set configEncrypted flag).
 */
export function migrateConfigToEncrypted(
  inputConfig: Record<string, unknown>,
): { config: Record<string, unknown>; report: MigrationReport } {
  if (inputConfig['configEncrypted'] === true) {
    return {
      config: inputConfig,
      report: {
        skipped: true,
        skipReason: 'CONFIG_ALREADY_ENCRYPTED',
        migrated: [],
        alreadyEncrypted: [],
        failures: [],
      },
    };
  }

  if (!isEncryptionAvailable()) {
    return {
      config: inputConfig,
      report: {
        skipped: true,
        skipReason:
          'SAFE_STORAGE_UNAVAILABLE: OS 키체인이 활성화되지 않아 마이그레이션을 건너뛰었습니다. ' +
          '환경설정에서 수동 재입력하거나 OS 키체인을 활성화해주세요.',
        migrated: [],
        alreadyEncrypted: [],
        failures: [],
      },
    };
  }

  const next = { ...inputConfig };
  const migrated: string[] = [];
  const alreadyEncrypted: string[] = [];
  const failures: Array<{ field: string; reason: string }> = [];

  for (const field of SENSITIVE_FIELDS) {
    const value = next[field];
    if (typeof value !== 'string' || value.length === 0) continue;
    if (isEncrypted(value)) {
      alreadyEncrypted.push(field);
      continue;
    }
    try {
      next[field] = encryptString(value);
      migrated.push(field);
    } catch (err) {
      failures.push({
        field,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const field of ARRAY_FIELDS) {
    const arr = next[field];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const upgraded: string[] = [];
    let anyMigrated = false;
    let anyFail = false;
    for (let i = 0; i < arr.length; i += 1) {
      const item = arr[i];
      if (typeof item !== 'string' || item.length === 0) {
        upgraded.push(item);
        continue;
      }
      if (isEncrypted(item)) {
        upgraded.push(item);
        continue;
      }
      try {
        upgraded.push(encryptString(item));
        anyMigrated = true;
      } catch (err) {
        upgraded.push(item);
        anyFail = true;
        failures.push({
          field: `${field}[${i}]`,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    next[field] = upgraded;
    if (anyMigrated && !anyFail) {
      migrated.push(field);
    } else if (anyMigrated) {
      // partial — count under both migrated and failures already populated
      migrated.push(`${field} (partial)`);
    }
  }

  if (failures.length === 0 && (migrated.length > 0 || alreadyEncrypted.length === SENSITIVE_FIELDS.length)) {
    next['configEncrypted'] = true;
  }

  return {
    config: next,
    report: {
      skipped: false,
      migrated,
      alreadyEncrypted,
      failures,
    },
  };
}

/**
 * Pure helper exposed for tests and debugging — returns the canonical list
 * of fields the migrator treats as sensitive.
 */
export function getSensitiveFields(): readonly string[] {
  return SENSITIVE_FIELDS;
}

export interface DecryptReport {
  /** Field names that were successfully decrypted in this run. */
  readonly decrypted: readonly string[];
  /** Field names whose decryption attempt threw; left as the encrypted payload. */
  readonly failures: ReadonlyArray<{ field: string; reason: string }>;
}

/**
 * Decrypts every previously-encrypted sensitive field in `input` (out-of-place).
 * Plaintext values pass through unchanged. Decrypt failures leave the encrypted
 * payload in place so the caller can prompt re-entry (feedback_no_fallback).
 *
 * Mirror of `migrateConfigToEncrypted` — used by configManager's loadConfig to
 * present a fully-plaintext view to the rest of the app while keeping at-rest
 * data encrypted.
 */
export function decryptConfigOnLoad(
  input: Record<string, unknown>,
): { config: Record<string, unknown>; report: DecryptReport } {
  const next = { ...input };
  const decrypted: string[] = [];
  const failures: Array<{ field: string; reason: string }> = [];

  for (const field of SENSITIVE_FIELDS) {
    const value = next[field];
    if (typeof value !== 'string' || value.length === 0) continue;
    if (!isEncrypted(value)) continue;
    try {
      next[field] = decryptString(value);
      decrypted.push(field);
    } catch (err) {
      failures.push({
        field,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const field of ARRAY_FIELDS) {
    const arr = next[field];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    let anyDecrypted = false;
    const upgraded = arr.map((item, i) => {
      if (typeof item !== 'string' || item.length === 0) return item;
      if (!isEncrypted(item)) return item;
      try {
        const plain = decryptString(item);
        anyDecrypted = true;
        return plain;
      } catch (err) {
        failures.push({
          field: `${field}[${i}]`,
          reason: err instanceof Error ? err.message : String(err),
        });
        return item;
      }
    });
    next[field] = upgraded;
    if (anyDecrypted) decrypted.push(field);
  }

  return { config: next, report: { decrypted, failures } };
}
