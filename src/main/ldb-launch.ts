/** Fixed desktop connection route: never accepts tokens, paths, or publish commands. */
export const LDB_CONNECT_SCHEME = 'better-life-naver';
export function isLdbConnectUrl(value: unknown): boolean {
  return value === 'better-life-naver://ldb/connect';
}
export interface LdbUpdateStatus {
  state: 'unknown' | 'checking' | 'current' | 'available' | 'downloading' | 'restart-required' | 'unavailable' | 'error';
  checkedAt?: string;
  latestVersion?: string;
}
export function createUpdateStatus() {
  let value: LdbUpdateStatus = { state: 'unknown' };
  return {
    get: (): LdbUpdateStatus => ({ ...value }),
    record(channel: string, data?: { reason?: string; version?: string; message?: string }): void {
      const states: Record<string, LdbUpdateStatus['state']> = {
        'update-checking': 'checking', 'update-available': 'available',
        'update-download-progress': 'downloading', 'update-downloaded': 'restart-required',
        'update-error': 'error', 'update-not-available': data?.reason ? 'unavailable' : 'current',
      };
      const state = states[channel];
      if (!state) return;
      value = { ...value, state, checkedAt: new Date().toISOString(), ...(data?.version ? { latestVersion: data.version } : {}) };
    },
  };
}

/** Preserve every lifecycle request, including calls during Promise completion. */
export function createSerializedRefresh(work: () => Promise<void>): () => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return () => {
    const result = tail.then(work);
    tail = result.catch(() => { /* A failed start must not block later retries. */ });
    return result;
  };
}
