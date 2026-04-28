// v2.7.27 — Adaptive Concurrency Limiter
// 사양 토글 없이 모든 환경에서 응답성을 유지하는 글로벌 동시성 제어기.
// EventLoopWatchdog의 lag 신호를 받아 동시 작업 수(max)를 실시간 자동 조절한다.
//
// 사용법:
//   const release = await globalLimiter.acquire('publish');
//   try { /* heavy work */ } finally { release(); }

interface QueuedWaiter {
  resolve: () => void;
  tag: string;
  enqueuedAt: number;
  timeoutHandle?: NodeJS.Timeout;
}

const HARD_MIN = 1;
const HARD_MAX = 8;
const INITIAL_MAX = 4;
// ✅ [v2.7.28 핫픽스] 무한 대기 방지: acquire 타임아웃 60초.
//   lag 회복 안 되거나 워커 멈춤으로 슬롯이 영영 안 풀리는 worst-case에서도
//   대기 작업이 60초 후 강제로 진입하도록 안전망.
const ACQUIRE_TIMEOUT_MS = 60_000;

class AdaptiveLimiter {
  private active = 0;
  private max = INITIAL_MAX;
  private queue: QueuedWaiter[] = [];
  private lastChangeAt = Date.now();
  private healthySinceMs = Date.now();

  getStats(): { active: number; max: number; queued: number } {
    return { active: this.active, max: this.max, queued: this.queue.length };
  }

  async acquire(tag: string = 'task'): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      const waiter: QueuedWaiter = {
        resolve: () => {
          if (waiter.timeoutHandle) clearTimeout(waiter.timeoutHandle);
          this.active++;
          resolve(() => this.release());
        },
        tag,
        enqueuedAt: Date.now(),
      };
      // ✅ [v2.7.28] 60초 타임아웃 — 슬롯이 영영 안 풀리는 경우에도 강제 진입
      waiter.timeoutHandle = setTimeout(() => {
        const idx = this.queue.indexOf(waiter);
        if (idx >= 0) {
          this.queue.splice(idx, 1);
          // eslint-disable-next-line no-console
          console.warn(`[AdaptiveLimiter] ⏰ acquire timeout (${ACQUIRE_TIMEOUT_MS}ms) tag=${tag} — 강제 진입 (큐 정체 안전망)`);
          this.active++;
          resolve(() => this.release());
        }
      }, ACQUIRE_TIMEOUT_MS);
      this.queue.push(waiter);
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next.resolve();
  }

  // Watchdog 콜백 — lag 감지 시 호출
  onLagDetected(lagMs: number): void {
    const now = Date.now();
    this.healthySinceMs = now;

    if (lagMs >= 5000) {
      const newMax = Math.max(HARD_MIN, Math.floor(this.max / 2));
      if (newMax !== this.max) {
        // eslint-disable-next-line no-console
        console.warn(`[AdaptiveLimiter] 🚨 freeze(${lagMs}ms) → max ${this.max} → ${newMax}`);
        this.max = newMax;
        this.lastChangeAt = now;
      }
    } else if (lagMs >= 1000) {
      const newMax = Math.max(HARD_MIN, this.max - 1);
      if (newMax !== this.max) {
        // eslint-disable-next-line no-console
        console.warn(`[AdaptiveLimiter] ⚠️ severe lag(${lagMs}ms) → max ${this.max} → ${newMax}`);
        this.max = newMax;
        this.lastChangeAt = now;
      }
    }
  }

  // Watchdog 콜백 — 정상 lag 측정 시 호출 (5초 연속 정상이면 max ↑)
  onHealthySample(lagMs: number): void {
    if (lagMs >= 200) {
      this.healthySinceMs = Date.now();
      return;
    }
    const healthyDurationMs = Date.now() - this.healthySinceMs;
    if (healthyDurationMs >= 5000 && this.max < HARD_MAX) {
      const newMax = Math.min(HARD_MAX, this.max + 1);
      // eslint-disable-next-line no-console
      console.log(`[AdaptiveLimiter] ✅ healthy 5s → max ${this.max} → ${newMax}`);
      this.max = newMax;
      this.healthySinceMs = Date.now();
      this.lastChangeAt = Date.now();
    }
  }

  // 초기 max 강제 설정 (저사양 자동 감지에서 호출)
  setInitialMax(max: number): void {
    this.max = Math.max(HARD_MIN, Math.min(HARD_MAX, max));
  }
}

export const globalLimiter = new AdaptiveLimiter();
