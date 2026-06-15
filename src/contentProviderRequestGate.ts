export type ProviderRequestGateSleep = (ms: number, signal?: AbortSignal) => Promise<void>;
export type ProviderRequestGateLog = (message: string) => void;

export interface ProviderRequestGateOptions {
  now?: () => number;
  sleep?: ProviderRequestGateSleep;
  log?: ProviderRequestGateLog;
}

export type ProviderRequestGateMessage = string | ((waitMs: number) => string);

const defaultSleep: ProviderRequestGateSleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new Error('Request aborted.'));
    return;
  }

  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(new Error('Request aborted.'));
  }, { once: true });
});

export class ProviderRequestGate {
  private readonly gates = new Map<string, { nextAllowedAt: number }>();
  private readonly now: () => number;
  private readonly sleep: ProviderRequestGateSleep;
  private readonly log: ProviderRequestGateLog;

  constructor(options: ProviderRequestGateOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.log = options.log ?? console.log;
  }

  async throttle(
    key: string,
    minIntervalMs: number,
    signal?: AbortSignal,
    message?: ProviderRequestGateMessage,
  ): Promise<number> {
    if (minIntervalMs <= 0) return 0;

    const now = this.now();
    const scheduledAt = Math.max(now, this.gates.get(key)?.nextAllowedAt || 0);
    this.gates.set(key, { nextAllowedAt: scheduledAt + minIntervalMs });

    const waitMs = scheduledAt - now;
    if (waitMs > 0) {
      if (message) {
        this.log(typeof message === 'function' ? message(waitMs) : message);
      }
      await this.sleep(waitMs, signal);
    }

    return waitMs;
  }

  recordBackoff(key: string, waitMs: number): void {
    if (!Number.isFinite(waitMs) || waitMs <= 0) return;

    const previous = this.gates.get(key);
    this.gates.set(key, {
      nextAllowedAt: Math.max(previous?.nextAllowedAt || 0, this.now() + waitMs),
    });
  }

  getNextAllowedAt(key: string): number | undefined {
    return this.gates.get(key)?.nextAllowedAt;
  }

  clear(): void {
    this.gates.clear();
  }
}
