// src/main/workers/base64Pool.ts
// [SPEC-FREEZE-GUARD-001-P2 R1 / v2.10.260] Base64 워커 풀 관리자
//
// 책임:
//   - worker_threads 풀 생성/재사용 (크기 = max(2, min(4, cpus-1)))
//   - 작업 큐, 워커 idle/busy 추적
//   - 5초 타임아웃 + AbortSignal 지원
//   - 워커 초기화/exec 실패는 silent 금지: 1회 경고 후 헬퍼 측에서 동기 폴백
//
// 본 파일은 호출 0건 단계(R1)에서 작성한다. 실제 호출은 base64Async.ts 헬퍼를 통해서만.

import { Worker } from 'worker_threads';
import * as os from 'os';
import * as path from 'path';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_POOL_SIZE = Math.max(2, Math.min(4, os.cpus().length - 1));

interface PendingJob {
  id: string;
  resolve: (buf: Buffer) => void;
  reject: (err: Error) => void;
  timeoutHandle: NodeJS.Timeout;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
  currentJobId: string | null;
}

interface QueueEntry {
  id: string;
  b64: string;
}

export interface Base64PoolOptions {
  workerPath?: string;
  poolSize?: number;
  timeoutMs?: number;
}

export class Base64Pool {
  private workers: WorkerSlot[] = [];
  private pending = new Map<string, PendingJob>();
  private queue: QueueEntry[] = [];
  private initFailed = false;
  private nextId = 0;
  private readonly workerPath: string;
  private readonly poolSize: number;
  private readonly timeoutMs: number;

  constructor(opts: Base64PoolOptions = {}) {
    this.workerPath = opts.workerPath ?? path.join(__dirname, 'base64Worker.js');
    this.poolSize = opts.poolSize ?? DEFAULT_POOL_SIZE;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  isAvailable(): boolean {
    if (this.initFailed) return false;
    if (this.workers.length > 0) return true;
    return this.init();
  }

  private init(): boolean {
    if (this.initFailed) return false;
    if (this.workers.length > 0) return true;
    try {
      for (let i = 0; i < this.poolSize; i++) {
        const worker = new Worker(this.workerPath);
        const slot: WorkerSlot = { worker, busy: false, currentJobId: null };
        worker.on('message', (resp) => this.handleResponse(slot, resp));
        worker.on('error', (err: Error) => this.handleWorkerError(slot, err));
        worker.on('exit', (code: number) => this.handleWorkerExit(slot, code));
        this.workers.push(slot);
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // silent 금지: 1회 명시 경고. 헬퍼는 이후 동기 폴백 경로로 진입.
      console.warn(`[base64Pool] worker init failed, falling back to sync: ${msg}`);
      this.initFailed = true;
      for (const slot of this.workers) {
        try { slot.worker.terminate(); } catch { /* ignore */ }
      }
      this.workers = [];
      return false;
    }
  }

  async decode(b64: string, opts?: { signal?: AbortSignal }): Promise<Buffer> {
    if (!this.init()) {
      throw new Error('[base64Pool] init failed');
    }
    const signal = opts?.signal;
    if (signal?.aborted) {
      throw new Error('aborted');
    }
    const id = `j${++this.nextId}`;
    return new Promise<Buffer>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.cancelJob(id, new Error(`[base64Pool] worker timeout ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      const job: PendingJob = { id, resolve, reject, timeoutHandle, signal };
      if (signal) {
        const onAbort = () => this.cancelJob(id, new Error('aborted'));
        job.onAbort = onAbort;
        signal.addEventListener('abort', onAbort, { once: true });
      }
      this.pending.set(id, job);
      this.dispatch(id, b64);
    });
  }

  private dispatch(id: string, b64: string): void {
    const idle = this.workers.find(s => !s.busy);
    if (!idle) {
      this.queue.push({ id, b64 });
      return;
    }
    idle.busy = true;
    idle.currentJobId = id;
    idle.worker.postMessage({ id, b64 });
  }

  private handleResponse(slot: WorkerSlot, resp: unknown): void {
    const r = resp as { id?: unknown; ok?: unknown; buffer?: unknown; error?: unknown };
    const id = typeof r?.id === 'string' ? r.id : null;
    slot.busy = false;
    slot.currentJobId = null;
    if (!id) {
      this.processQueue();
      return;
    }
    const job = this.pending.get(id);
    if (!job) {
      // 이미 취소/타임아웃된 job
      this.processQueue();
      return;
    }
    this.cleanupJob(job);
    if (r.ok === true && r.buffer instanceof ArrayBuffer) {
      job.resolve(Buffer.from(r.buffer));
    } else {
      const err = typeof r.error === 'string' ? r.error : 'worker decode failed';
      job.reject(new Error(err));
    }
    this.processQueue();
  }

  private handleWorkerError(slot: WorkerSlot, err: Error): void {
    console.warn(`[base64Pool] worker error: ${err.message}`);
    const jobId = slot.currentJobId;
    slot.busy = false;
    slot.currentJobId = null;
    if (jobId) {
      const job = this.pending.get(jobId);
      if (job) {
        this.cleanupJob(job);
        job.reject(err);
      }
    }
    this.processQueue();
  }

  private handleWorkerExit(slot: WorkerSlot, code: number): void {
    if (code === 0) return;
    console.warn(`[base64Pool] worker exited with code ${code}`);
    this.workers = this.workers.filter(s => s !== slot);
    if (this.workers.length === 0) {
      this.initFailed = true;
      for (const [, job] of this.pending) {
        this.cleanupJob(job);
        job.reject(new Error('[base64Pool] all workers exited'));
      }
      this.pending.clear();
      this.queue.length = 0;
    }
  }

  private cancelJob(id: string, reason: Error): void {
    const job = this.pending.get(id);
    if (!job) return;
    this.cleanupJob(job);
    job.reject(reason);
    this.queue = this.queue.filter(q => q.id !== id);
  }

  private cleanupJob(job: PendingJob): void {
    clearTimeout(job.timeoutHandle);
    if (job.signal && job.onAbort) {
      job.signal.removeEventListener('abort', job.onAbort);
    }
    this.pending.delete(job.id);
  }

  private processQueue(): void {
    while (this.queue.length > 0) {
      const idle = this.workers.find(s => !s.busy);
      if (!idle) return;
      const next = this.queue.shift()!;
      if (!this.pending.has(next.id)) continue;
      idle.busy = true;
      idle.currentJobId = next.id;
      idle.worker.postMessage({ id: next.id, b64: next.b64 });
    }
  }

  async terminate(): Promise<void> {
    for (const slot of this.workers) {
      try { await slot.worker.terminate(); } catch { /* ignore */ }
    }
    this.workers = [];
    for (const [, job] of this.pending) {
      this.cleanupJob(job);
      job.reject(new Error('terminated'));
    }
    this.pending.clear();
    this.queue.length = 0;
  }

  getStats(): { poolSize: number; workers: number; busy: number; pending: number; queued: number; initFailed: boolean } {
    return {
      poolSize: this.poolSize,
      workers: this.workers.length,
      busy: this.workers.filter(s => s.busy).length,
      pending: this.pending.size,
      queued: this.queue.length,
      initFailed: this.initFailed,
    };
  }
}

export const globalBase64Pool = new Base64Pool();
