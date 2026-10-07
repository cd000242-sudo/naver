import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AccountExecutionGuardError } from './accountExecutionGuard.js';
interface JournalState { schema: 1; pending?: string; confirmed: Record<string, { confirmed: true; url?: string }> }
export class PublicationCommitJournal {
  private readonly storageDir: string;
  private readonly failed = new Set<string>();
  constructor(options: { storageDir?: string } = {}) { this.storageDir = options.storageDir || join(homedir(), '.naver-blog-automation', 'safety-state', 'publication'); }
  private key(value: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new AccountExecutionGuardError('ACCOUNT_MISMATCH', '계정 또는 작업 식별자가 없습니다.');
    return createHash('sha256').update(value.trim()).digest('hex');
  }
  private accountKey(accountId: string): string { return this.key(accountId.toLowerCase()); }
  private stop(): never { throw new AccountExecutionGuardError('PUBLISH_OUTCOME_UNKNOWN', '이전 발행 결과가 확인되지 않았습니다. 글 목록에서 결과를 직접 확인해 주세요.'); }
  private read(accountId: string): JournalState {
    const key = this.accountKey(accountId);
    if (this.failed.has(key)) return this.stop();
    try {
      const state = JSON.parse(readFileSync(join(this.storageDir, key + '.json'), 'utf8')) as JournalState;
      if (state.schema !== 1 || !state.confirmed || typeof state.confirmed !== 'object' || Array.isArray(state.confirmed) || (state.pending !== undefined && !/^[a-f0-9]{64}$/.test(state.pending))) return this.stop();
      for (const [job, value] of Object.entries(state.confirmed)) if (!/^[a-f0-9]{64}$/.test(job) || value?.confirmed !== true) return this.stop();
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schema: 1, confirmed: {} };
      this.failed.add(key); return this.stop();
    }
  }
  private write(accountId: string, state: JournalState): void {
    const key = this.accountKey(accountId); const temporary = join(this.storageDir, key + '.' + randomBytes(8).toString('hex') + '.tmp');
    let descriptor: number | undefined;
    try {
      mkdirSync(this.storageDir, { recursive: true, mode: 0o700 }); descriptor = openSync(temporary, 'wx', 0o600);
      writeFileSync(descriptor, JSON.stringify(state)); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
      renameSync(temporary, join(this.storageDir, key + '.json'));
    } catch { this.failed.add(key); this.stop(); }
    finally { if (descriptor !== undefined) { try { closeSync(descriptor); } catch { /* Remain stopped. */ } } try { unlinkSync(temporary); } catch { /* Renamed or never created. */ } }
  }
  getPendingToken(accountId: string): string | undefined { return this.read(accountId).pending; }
  /** Token comes from the displayed pending attempt, so stale UI cannot clear a newer one. */
  confirmPendingOutcome(accountId: string, token: string, outcome: 'published' | 'not-published'): void {
    const state = this.read(accountId);
    if (!token || state.pending !== token || !['published', 'not-published'].includes(outcome)) return this.stop();
    this.write(accountId, { schema: 1, confirmed: outcome === 'published' ? { ...state.confirmed, [token]: { confirmed: true } } : { ...state.confirmed } });
  }
  hasUnconfirmed(accountId: string): boolean { try { return Boolean(this.read(accountId).pending); } catch { return true; } }
  getConfirmed(accountId: string, jobId: string): { confirmed: true; url?: string } | undefined {
    const value = this.read(accountId).confirmed[this.key(jobId)]; return value ? { ...value } : undefined;
  }
  markSubmitting(accountId: string, jobId: string): void {
    const state = this.read(accountId); const job = this.key(jobId);
    if (state.pending || state.confirmed[job]) return this.stop();
    this.write(accountId, { ...state, pending: job });
  }
  markConfirmed(accountId: string, jobId: string, url?: string): void {
    const state = this.read(accountId); const job = this.key(jobId);
    if (state.pending !== job) return this.stop();
    let safeUrl: string | undefined;
    if (url) { try { const parsed = new URL(url); if (parsed.protocol === 'https:' && ['blog.naver.com', 'm.blog.naver.com'].includes(parsed.hostname) && !parsed.username && !parsed.password) safeUrl = parsed.origin + parsed.pathname; } catch { /* Do not persist untrusted URL data. */ } }
    this.write(accountId, { schema: 1, confirmed: { ...state.confirmed, [job]: { confirmed: true, ...(safeUrl ? { url: safeUrl } : {}) } } });
  }
  /** Only an explicit user outcome review may mark an unknown attempt as not published. */
  confirmOutcome(accountId: string, jobId: string, outcome: 'published' | 'not-published', url?: string): void {
    if (outcome === 'published') return this.markConfirmed(accountId, jobId, url);
    const state = this.read(accountId);
    if (outcome !== 'not-published' || state.pending !== this.key(jobId)) return this.stop();
    this.write(accountId, { schema: 1, confirmed: { ...state.confirmed } });
  }
}
let singleton: PublicationCommitJournal | undefined;
export function getPublicationCommitJournal(): PublicationCommitJournal { return singleton ||= new PublicationCommitJournal(); }
