/**
 * Electron safeStorage wrapper for at-rest encryption of API keys and credentials.
 *
 * SPEC-MIGRATION-2026 M1 P2.
 *
 * Storage model:
 * - Plaintext value → safeStorage.encryptString → Buffer → base64 string
 *   (base64 is JSON-safe and round-trips through configManager's plain JSON writer)
 * - Each encrypted value is prefixed with ENCRYPTED_PREFIX so configManager can
 *   distinguish "this field already migrated" from "this field is still plaintext".
 *
 * Failure model (feedback_no_fallback):
 * - If safeStorage is unavailable (Linux without keyring, headless CI),
 *   encrypt/decrypt throw with explicit reason. No silent passthrough.
 * - Callers (encryptionMigrator, configManager) MUST surface the error to UI.
 */

import { port as safeStorage } from './safeStoragePort.js';

// ---------------------------------------------------------------------------
// Prefix marker — distinguishes encrypted base64 payloads from plaintext.
// ---------------------------------------------------------------------------

const ENCRYPTED_PREFIX = 'enc:v1:';

// ---------------------------------------------------------------------------
// Availability probe
// ---------------------------------------------------------------------------

/**
 * Returns true when the OS keychain backend is available. On Windows and macOS
 * this is always true. On Linux it requires libsecret/gnome-keyring/kwallet.
 */
export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Core encrypt / decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypts a plaintext string for at-rest storage. The output is a base64
 * payload with ENCRYPTED_PREFIX so it survives JSON round-trips and can be
 * detected later via isEncrypted().
 *
 * @throws {Error} If safeStorage is unavailable on the current platform.
 */
export function encryptString(plaintext: string): string {
  if (!isEncryptionAvailable()) {
    throw new Error(
      'SAFE_STORAGE_UNAVAILABLE: OS 키체인을 사용할 수 없어 암호화에 실패했습니다. ' +
        '(Linux: libsecret/gnome-keyring 설치 필요. Windows/macOS는 자동 지원.)',
    );
  }
  if (plaintext.length === 0) return '';
  const encryptedBuffer = safeStorage.encryptString(plaintext);
  return ENCRYPTED_PREFIX + encryptedBuffer.toString('base64');
}

/**
 * Decrypts a payload previously produced by encryptString. If the input does
 * not carry ENCRYPTED_PREFIX it is treated as plaintext and returned as-is —
 * this is the canonical way to handle pre-migration fields.
 *
 * @throws {Error} If safeStorage is unavailable or the payload is corrupt.
 */
export function decryptString(stored: string): string {
  if (stored.length === 0) return '';
  if (!stored.startsWith(ENCRYPTED_PREFIX)) {
    // Pre-migration plaintext — caller decides whether to upgrade
    return stored;
  }
  if (!isEncryptionAvailable()) {
    throw new Error(
      'SAFE_STORAGE_UNAVAILABLE: 암호화된 값을 복호화할 수 없습니다. ' +
        'OS 키체인이 활성화되어 있는지 확인해주세요.',
    );
  }
  const encryptedBuffer = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64');
  try {
    return safeStorage.decryptString(encryptedBuffer);
  } catch (err) {
    throw new Error(
      'SAFE_STORAGE_DECRYPT_FAILED: 다른 PC에서 저장된 키이거나 OS 자격이 초기화되었을 가능성. ' +
        '환경설정에서 해당 API 키를 다시 입력해주세요. ' +
        `(원인: ${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Tells whether a stored value has already been encrypted by this wrapper.
 * Used by encryptionMigrator to skip already-migrated fields.
 */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(ENCRYPTED_PREFIX);
}
