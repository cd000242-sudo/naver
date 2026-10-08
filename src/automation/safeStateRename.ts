import { renameSync } from 'node:fs';

export interface RenameRetryDeps {
  rename?: (from: string, to: string) => void;
  sleep?: (ms: number) => void;
}

/** Antivirus and search-indexer scans hold a freshly written file for a moment on Windows. */
const TRANSIENT_RENAME_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);
/** 5 attempts, 4 waits: at most 650 ms in total. */
const RETRY_DELAYS_MS: readonly number[] = [50, 100, 200, 300];

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Atomic state-file replace that tolerates a brief sharing violation. Synchronous on purpose: the journal and the
 * account guard are sync APIs that gate an irreversible click. After the last attempt (or on any other error)
 * the original error is rethrown so callers stay fail-closed.
 */
export function renameWithRetry(from: string, to: string, deps: RenameRetryDeps = {}): void {
  const rename = deps.rename ?? renameSync;
  const sleep = deps.sleep ?? sleepSync;
  for (let attempt = 0; ; attempt++) {
    try {
      rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= RETRY_DELAYS_MS.length || !code || !TRANSIENT_RENAME_CODES.has(code)) throw error;
      sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}
