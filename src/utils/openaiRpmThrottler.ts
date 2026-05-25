/**
 * openaiRpmThrottler.ts — OpenAI API 분당 호출 한도 자체 throttler
 *
 * 사용자 보고: "GPT-4.1 RPM 초과 에러가 자꾸 뜬다 (60초 backoff + retry 후에도 실패)"
 *
 * 정책:
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
 */

class OpenAIRpmThrottler {
  private callTimestamps: number[] = [];
  private currentMaxRpm: number;
  private readonly ceilingRpm: number;
  private readonly floorRpm: number;
  private readonly safetyMargin: number;
  private consecutiveSuccesses = 0;
  private last429At = 0;

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

  async throttle(): Promise<void> {
    const safeLimit = this.currentMaxRpm - this.safetyMargin;
    const recent = this.getRecentCallCount();
    if (recent >= safeLimit) {
      const oldest = this.callTimestamps[0];
      const waitMs = Math.max(0, oldest + 60_000 - Date.now()) + 1500;
      console.log(`[OpenAI RPM] ⏳ 분당 ${recent}/${this.currentMaxRpm}회 도달 → ${Math.round(waitMs / 1000)}초 대기`);
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
  return 100; // gpt-4.1 Tier 1 보수적 값 (실 한도 500, burst 회피)
};

// 전역 단일 인스턴스 (모델 구분 없이 통합 — 한 OpenAI 키는 한 RPM 한도 공유)
export const openaiRpmThrottler = new OpenAIRpmThrottler(getCeilingRpm(), 20, 3);

/**
 * 누진 backoff 시간 계산 (429 retry 전용)
 *
 * @param retryAttempt 0부터 시작 (0=첫 backoff, 1=두 번째, ...)
 * @returns 대기 ms (60s → 90s → 120s 누진, 최대 180s)
 */
export function getQuotaBackoffMs(retryAttempt: number): number {
  const seq = [60_000, 90_000, 120_000, 180_000];
  return seq[Math.min(retryAttempt, seq.length - 1)];
}
