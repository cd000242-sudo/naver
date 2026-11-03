import { randomBytes, createHash } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { renameWithRetry } from '../../automation/safeStateRename.js';
import type { DailyPublishingState } from '../../scheduler/dailyPublishingTypes.js';

async function read(file: string): Promise<unknown> {
  try { const content = await readFile(file, 'utf8'); if (Buffer.byteLength(content) > 4_000_000) throw Error('DAILY_STATE_TOO_LARGE'); return JSON.parse(content); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw Error('DAILY_STATE_UNREADABLE'); }
}
async function write(file: string, value: unknown): Promise<void> {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > 4_000_000) throw Error('DAILY_STATE_TOO_LARGE');
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(encoded, 'utf8'); await handle.sync(); await handle.close(); handle = undefined;
    renameWithRetry(temporary, file);
  } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
}
export function createDailyPublishingStore(file: string) {
  return { load: async () => await read(file) as DailyPublishingState | null, save: (state: DailyPublishingState) => write(file, state) };
}
/** Keep source selection and title decisions locally without exposing account credentials. */
export async function writeDailyEditorialAudit(directory: string, jobId: string, value: Record<string, unknown>): Promise<void> {
  if (typeof jobId !== 'string' || !jobId.trim() || jobId.length > 250) throw Error('DAILY_AUDIT_JOB_INVALID');
  const key = createHash('sha256').update(jobId).digest('hex');
  await write(path.join(directory, `${key}.json`), { ...value, jobId, recordedAt: new Date().toISOString() });
}
/** A read-only prefilter saves model calls; the later serialized reservation owns the race. */
export async function isDailySourceUsed(file: string, accountId: string, fingerprints: readonly string[]): Promise<boolean> {
  if (!/^[\w-]{1,120}$/.test(accountId) || !fingerprints.length || fingerprints.some(fp => !/^[a-f\d]{64}$/.test(fp))) throw Error('DAILY_SOURCE_INVALID');
  const stored = await read(file) as { version: number; claims: Record<string, unknown> } | null;
  if (!stored) return false;
  if (stored.version !== 1 || !stored.claims || typeof stored.claims !== 'object' || Array.isArray(stored.claims)) throw Error('DAILY_SOURCE_UNREADABLE');
  return fingerprints.some(fp => Object.prototype.hasOwnProperty.call(stored.claims, `${accountId}:${fp}`));
}
/** Read-only: every fingerprint this account already claimed. Preview and candidate ranking use it; it never writes. */
export async function listDailyClaimedFingerprints(file: string, accountId: string): Promise<Set<string>> {
  if (!/^[\w-]{1,120}$/.test(accountId)) throw Error('DAILY_SOURCE_INVALID');
  const stored = await read(file) as { version: number; claims: Record<string, unknown> } | null;
  if (!stored) return new Set();
  if (stored.version !== 1 || !stored.claims || typeof stored.claims !== 'object' || Array.isArray(stored.claims)) throw Error('DAILY_SOURCE_UNREADABLE');
  const prefix = `${accountId}:`;
  return new Set(Object.keys(stored.claims).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length)));
}
/** A reserved source is never silently recycled after a crash or an uncertain publication. */
export function createDailySourceClaims(file: string) {
  let tail: Promise<unknown> = Promise.resolve();
  return (accountId: string, fingerprint: string, jobId: string): Promise<boolean> => {
    const result = tail.then(async () => {
      if (!/^[\w-]{1,120}$/.test(accountId) || !/^[a-f\d]{64}$/.test(fingerprint) || !jobId || jobId.length > 250) throw Error('DAILY_SOURCE_INVALID');
      const stored = await read(file) as { version: number; claims: Record<string, { jobId: string; at: string }> } | null;
      if (stored && (stored.version !== 1 || !stored.claims || typeof stored.claims !== 'object' || Array.isArray(stored.claims))) throw Error('DAILY_SOURCE_UNREADABLE');
      const claims = stored?.claims || {};
      const key = `${accountId}:${fingerprint}`;
      if (claims[key]) return false;
      // Exhaustion requires deliberate cleanup, not automatic source reuse.
      if (Object.keys(claims).length >= 20_000) throw Error('DAILY_SOURCE_STORAGE_FULL');
      await write(file, { version: 1, claims: { ...claims, [key]: { jobId, at: new Date().toISOString() } } });
      return true;
    });
    tail = result.catch(() => {}); return result;
  };
}
