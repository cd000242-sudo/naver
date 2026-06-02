/**
 * openaiRpmThrottler.ts — OpenAI API 분당 호출 한도 자체 throttler
 *
 * 사용자 보고: "GPT-4.1 RPM 초과 에러가 자꾸 뜬다 (60초 backoff + retry 후에도 실패)"
 *
 * 정책:
 * - Minimum-interval reservation: 호출 사이 최소 간격을 직렬 예약으로 강제.
 *   동시 호출(Promise.all)이 들어와도 각자 순차 슬롯을 예약받아 burst가 분산됨.
 *   (성공 후에만 timestamp를 남기던 구조라 동시 burst를 못 막던 허점 해결)
 * - Preemptive throttling: 분당 호출 수가 한도 도달 직전이면 호출자 측에서 대기
 * - 429 감지 시 적응형 감소 (current * 0.5, 최소 floor)
 * - 연속 성공 시 점진 회복 (+5 per 20 successes, 최대 ceiling)
 *
 * 디자인 참고: src/image/nanoBananaProGenerator.ts:328 GeminiRpmThrottler (동일 패턴)
 *
 * 모델별 기본 ceiling (OpenAI tier 1 기준 — 보수적):
 * - gpt-4.1, gpt-4o: 100 RPM (실제 한도는 500 RPM이나 burst 회피)
 * - gpt-4.1-mini: 200 RPM
 * - 환경 변수 OPENAI_RPM_CEILING으로 override 가능
 *
 * 호출 간 최소 간격(min-interval)은 호출자가 throttle(ms)로 지정한다.
 * - 텍스트 생성(callOpenAI): OPENAI_MIN_INTERVAL_MS(기본 10초) — 글 1편당 다수 호출 burst 차단
 * - 비전 분석(openaiVisionAdapter): 0 (간격 없음) — 기존 동작 유지, RPM 상한 보호만 공유
 */

export class OpenAIRpmThrottler {
  private callTimestamps: number[] = [];
  private currentMaxRpm: number;
  private readonly ceilingRpm: number;
  private readonly floorRpm: number;
  private readonly safetyMargin: number;
  private consecutiveSuccesses = 0;
  private last429At = 0;
  // Scheduled time of the next allowable call (reservation cursor).
  // Atomically advanced per caller so concurrent callers get sequential slots.
  private nextScheduledAt = 0;

  constructor(ceilingRpm = 100, floorRpm = 20, safetyMargin = 3) {
    this.ceilingRpm = ceilingRpm;
    this.floorRpm = floorRpm;
    this.currentMaxRpm = Math.floor((ceilingRpm + floorRpm) / 2); // 중간값 시작
    this.safetyMargin = safetyMargin;
  }

  private getRecentCallCount(): number {
    const oneMinuteAgo = Date.now() - 60_000;
    this.callTimestamps = this.callTimestamps.filter((t) => t > oneMinuteAgo);
    return this.callTimestamps.length;
  }

  /**
   * @param minIntervalMs 직전 호출과의 최소 간격(ms). 0이면 간격 강제 없음(RPM 상한 보호만 적용).
   */
  async throttle(minIntervalMs = 0): Promise<void> {
    const now = Date.now();

    // (1) Minimum-interval reservation — serialize spacing for concurrent callers.
    //     Reserve the next slot synchronously so a Promise.all burst is spread out
    //     instead of all firing at once.
    const scheduledAt = Math.max(now, this.nextScheduledAt);
    this.nextScheduledAt = scheduledAt + Math.max(0, minIntervalMs);
    let waitMs = scheduledAt - now;

    // (2) RPM ceiling guard — extra wait if the trailing-60s window is near full.
    const safeLimit = this.currentMaxRpm - this.safetyMargin;
    const recent = this.getRecentCallCount();
    if (recent >= safeLimit && this.callTimestamps.length > 0) {
      const oldest = this.callTimestamps[0];
      const rpmWaitMs = Math.max(0, oldest + 60_000 - now) + 1500;
      waitMs = Math.max(waitMs, rpmWaitMs);
    }

    if (waitMs > 0) {
      console.log(
        `[OpenAI RPM] ⏳ ${recent}/${this.currentMaxRpm} RPM · ${Math.round(waitMs / 1000)}초 대기` +
          (minIntervalMs > 0 ? ` (간격 ${Math.round(minIntervalMs / 1000)}s 직렬화)` : ''),
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  recordCall(): void {
    this.callTimestamps.push(Date.now());
    this.consecutiveSuccesses++;
    // 20회 연속 성공 시 +5 회복
    if (this.consecutiveSuccesses >= 20 && this.currentMaxRpm < this.ceilingRpm) {
      const next = Math.min(this.ceilingRpm, this.currentMaxRpm + 5);
      if (next > this.currentMaxRpm) {
        console.log(`[OpenAI RPM] 🚀 적응형 가속: ${this.currentMaxRpm} → ${next}`);
        this.currentMaxRpm = next;
      }
      this.consecutiveSuccesses = 0;
    }
  }

  record429(): void {
    this.last429At = Date.now();
    this.consecutiveSuccesses = 0;
    const next = Math.max(this.floorRpm, Math.floor(this.currentMaxRpm / 2));
    console.warn(`[OpenAI RPM] 🔻 429 감지 → RPM 상한 ${this.currentMaxRpm} → ${next} 감소 (보호)`);
    this.currentMaxRpm = next;
  }

  getStatus(): string {
    return `${this.getRecentCallCount()}/${this.currentMaxRpm} RPM (상한 ${this.ceilingRpm})`;
  }
}

const getCeilingRpm = (): number => {
  try {
    const env = typeof process !== 'undefined' ? parseInt(process.env.OPENAI_RPM_CEILING || '', 10) : NaN;
    if (!isNaN(env) && env > 0) return env;
  } catch {
    /* ignore */
  }
  // ✅ [2026-05-25 v2.10.357] 사용자 요청 — 100 → 60 (더 보수적, 안정성 우선)
  //   글 1편당 12~30회 호출 × 동시 요청 burst 고려 시 60이 안전 margin
  return 60;
};

// 전역 단일 인스턴스 (모델 구분 없이 통합 — 한 OpenAI 키는 한 RPM 한도 공유)
export const openaiRpmThrottler = new OpenAIRpmThrottler(getCeilingRpm(), 20, 3);

/**
 * 텍스트 생성(callOpenAI)의 호출 간 최소 간격 (ms).
 *
 * ✅ [2026-06-02] 사용자 요청 — 글 1편당 12~30회 호출 burst가 RPM 한도를 치는 것 차단.
 *   기본 10초. 환경 변수 OPENAI_MIN_INTERVAL_MS로 override 가능.
 */
export function getOpenAiMinIntervalMs(): number {
  try {
    const env = typeof process !== 'undefined' ? parseInt(process.env.OPENAI_MIN_INTERVAL_MS || '', 10) : NaN;
    if (!isNaN(env) && env >= 0) return env;
  } catch {
    /* ignore */
  }
  return 10_000; // 고정 10초 (사용자 선택)
}

/**
 * 누진 backoff 시퀀스 (429 retry 전용).
 *
 * ✅ [2026-06-02] 사용자 요청 — 30s → 60s → 90s → 120s 누진.
 *   호출부(callOpenAI)의 maxRetriesPerModel을 이 시퀀스 길이에 맞춰야 끝까지 발동한다.
 */
export const QUOTA_BACKOFF_SEQUENCE_MS = [30_000, 60_000, 90_000, 120_000];

/**
 * 누진 backoff 시간 계산 (429 retry 전용)
 *
 * @param retryAttempt 0부터 시작 (0=첫 backoff, 1=두 번째, ...)
 * @returns 대기 ms (30s → 60s → 90s → 120s 누진)
 */
export function getQuotaBackoffMs(retryAttempt: number): number {
  return QUOTA_BACKOFF_SEQUENCE_MS[Math.min(retryAttempt, QUOTA_BACKOFF_SEQUENCE_MS.length - 1)];
}
