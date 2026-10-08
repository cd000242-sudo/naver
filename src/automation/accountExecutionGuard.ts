import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { renameWithRetry } from './safeStateRename.js';

export const ACCOUNT_PAUSE_CODES = ['LOGIN_REQUIRED', 'LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN'] as const;
export type AccountPauseCode = typeof ACCOUNT_PAUSE_CODES[number];
export interface AccountExecutionStatus { paused: boolean; code?: AccountPauseCode; version: number; pausedAt?: string; storageError?: boolean; busy: boolean }
type StoredState = Omit<AccountExecutionStatus, 'busy' | 'storageError'> & { schema: 1 };
export class AccountExecutionGuardError extends Error {
  readonly retryable = false;
  readonly userActionRequired: boolean;
  constructor(readonly code: AccountPauseCode | 'ACCOUNT_BUSY', message?: string) {
    super(`[${code}] ${message || (code === 'ACCOUNT_BUSY' ? '이 계정의 작업이 이미 실행 중입니다.' : '계정 작업이 중단되었습니다. 계정 관리에서 상태 확인 후 직접 재개해 주세요.')}`);
    this.name = 'AccountExecutionGuardError';
    this.userActionRequired = code !== 'ACCOUNT_BUSY';
  }
}

/** Main-process singleton: persist only hashed identity and non-secret stop metadata. */
export class AccountExecutionGuard {
  private readonly storageDir: string;
  private readonly busy = new Set<string>();
  private readonly failed = new Map<string, AccountExecutionStatus>();
  constructor(options: { storageDir?: string } = {}) {
    this.storageDir = options.storageDir || join(homedir(), '.naver-blog-automation', 'safety-state');
  }
  private key(accountId: string): string {
    if (typeof accountId !== 'string' || !accountId.trim()) throw new AccountExecutionGuardError('ACCOUNT_MISMATCH', '계정 식별자가 없어 작업을 시작할 수 없습니다.');
    return createHash('sha256').update(accountId.trim().toLowerCase()).digest('hex');
  }
  getStatus(accountId: string): AccountExecutionStatus {
    const key = this.key(accountId);
    const failed = this.failed.get(key);
    if (failed) return { ...failed, busy: this.busy.has(key) };
    try {
      const state = JSON.parse(readFileSync(join(this.storageDir, key + '.json'), 'utf8')) as StoredState;
      if (state.schema !== 1 || typeof state.paused !== 'boolean' || !Number.isSafeInteger(state.version) || state.version < 0 || (state.paused && !ACCOUNT_PAUSE_CODES.includes(state.code!))) throw Error('Invalid state');
      return { paused: state.paused, version: state.version, ...(state.paused ? { code: state.code, pausedAt: state.pausedAt } : {}), busy: this.busy.has(key) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { paused: false, version: 0, busy: this.busy.has(key) };
      const stopped = { paused: true, code: 'NETWORK_WAIT' as const, version: 0, storageError: true, busy: this.busy.has(key) };
      this.failed.set(key, stopped);
      return { ...stopped };
    }
  }
  assertAllowed(accountId: string): void {
    const state = this.getStatus(accountId);
    if (state.paused) throw new AccountExecutionGuardError(state.code!);
  }
  private persist(accountId: string, state: StoredState): void {
    const key = this.key(accountId);
    const temporary = join(this.storageDir, key + '.' + randomBytes(8).toString('hex') + '.tmp');
    let descriptor: number | undefined;
    try {
      mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
      descriptor = openSync(temporary, 'wx', 0o600);
      writeFileSync(descriptor, JSON.stringify(state), 'utf8'); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
      renameWithRetry(temporary, join(this.storageDir, key + '.json'));
      this.failed.delete(key);
    } catch {
      this.failed.set(key, { paused: true, code: state.code || 'NETWORK_WAIT', version: state.version, storageError: true, busy: this.busy.has(key) });
      throw new AccountExecutionGuardError(state.code || 'NETWORK_WAIT', '중단 상태를 저장하지 못했습니다. 저장소를 확인하기 전까지 작업을 중단합니다.');
    } finally {
      if (descriptor !== undefined) { try { closeSync(descriptor); } catch { /* Remain stopped. */ } }
      try { unlinkSync(temporary); } catch { /* Renamed or never created. */ }
    }
  }
  pause(accountId: string, code: AccountPauseCode): AccountExecutionStatus {
    if (!ACCOUNT_PAUSE_CODES.includes(code)) throw new AccountExecutionGuardError('ACCOUNT_MISMATCH', '지원하지 않는 중단 코드입니다.');
    const previous = this.getStatus(accountId);
    this.persist(accountId, { schema: 1, paused: true, code, version: previous.version + 1, pausedAt: new Date().toISOString() });
    return this.getStatus(accountId);
  }
  /** Call only from an explicit user-resume action; never from automatic retries. */
  async resume(accountId: string, verify: () => Promise<boolean>): Promise<boolean> {
    if (this.getStatus(accountId).code === 'PUBLISH_OUTCOME_UNKNOWN') return false;
    return this.resumeVerified(accountId, verify);
  }
  /** Reserved for the UI action after the user has confirmed the previous publication outcome. */
  async resumeAfterOutcomeConfirmation(accountId: string, verify: () => Promise<boolean>): Promise<boolean> {
    return this.resumeVerified(accountId, verify);
  }
  private async resumeVerified(accountId: string, verify: () => Promise<boolean>): Promise<boolean> {
    const key = this.key(accountId);
    if (this.busy.has(key)) return false;
    const before = this.getStatus(accountId);
    this.busy.add(key);
    try {
      let verified = false;
      try { verified = await verify() === true; } catch { return false; }
      if (!verified || this.getStatus(accountId).version !== before.version) return false;
      this.persist(accountId, { schema: 1, paused: false, version: before.version + 1 });
      return true;
    } finally { this.busy.delete(key); }
  }
  /** Explicit user action may open a paused account, without clearing the stop. */
  async runUserActionExclusive<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
    const key = this.key(accountId);
    if (this.busy.has(key)) throw new AccountExecutionGuardError('ACCOUNT_BUSY');
    this.busy.add(key);
    try { return await operation(); } finally { this.busy.delete(key); }
  }
  async runExclusive<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
    const key = this.key(accountId);
    this.assertAllowed(accountId);
    if (this.busy.has(key)) throw new AccountExecutionGuardError('ACCOUNT_BUSY');
    this.busy.add(key);
    try { return await operation(); } finally { this.busy.delete(key); }
  }
}
let singleton: AccountExecutionGuard | undefined;
export function getAccountExecutionGuard(): AccountExecutionGuard { return singleton ||= new AccountExecutionGuard(); }
