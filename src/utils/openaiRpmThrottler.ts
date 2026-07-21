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
  async throttle(minIntervalMs = 0, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error('OpenAI API 호출이 취소되었습니다.');
    }
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
      await sleepWithAbort(waitMs, signal);
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

  record429(cooldownMs = 0): void {
    this.last429At = Date.now();
    this.consecutiveSuccesses = 0;
    const next = Math.max(this.floorRpm, Math.floor(this.currentMaxRpm / 2));
    console.warn(`[OpenAI RPM] 🔻 429 감지 → RPM 상한 ${this.currentMaxRpm} → ${next} 감소 (보호)`);
    this.currentMaxRpm = next;

    if (cooldownMs > 0) {
      this.nextScheduledAt = Math.max(this.nextScheduledAt, Date.now() + cooldownMs);
      console.warn(`[OpenAI RPM] cooldown reserved for ${Math.round(cooldownMs / 1000)}s after 429`);
    }
  }

  getStatus(): string {
    return `${this.getRecentCallCount()}/${this.currentMaxRpm} RPM (상한 ${this.ceilingRpm})`;
  }
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) {
    return Promise.reject(new Error('OpenAI API 호출이 취소되었습니다.'));
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  return new Promise<void>((resolve, reject) => {
    timer = setTimeout(resolve, ms);
    if (signal) {
      onAbort = () => {
        if (timer) clearTimeout(timer);
        reject(new Error('OpenAI API 호출이 취소되었습니다.'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }).finally(() => {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  });
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
 *   기본 20초(일반 OpenAI 텍스트), mini 12초. 환경 변수 OPENAI_MIN_INTERVAL_MS로 override 가능.
 */
/**
 * OpenAI max_completion_tokens 예산.
 *
 * [v2.11.136] 추론(reasoning) 모델 대응: gpt-5.x 계열은 이 예산 안에서
 * reasoning_tokens + 실제 출력 토큰을 함께 소비한다. 기존 값(출력 글자수 기준,
 * 2400자→4080)은 비추론 모델용이라, 추론 모델에서는 reasoning이 예산을 전부
 * 먹어 출력 0자(finish_reason=length, textLength=0)로 실패했다(라이브 실측).
 * 추론 모델에는 넉넉한 reasoning 헤드룸을 더해 준다.
 */
export function getOpenAiMaxCompletionTokens(
  minChars = 2000,
  opts: { reasoningModel?: boolean } = {},
): number {
  const safeMinChars = Number.isFinite(minChars) ? Math.max(0, Math.floor(minChars)) : 2000;

  const outputBudget =
    safeMinChars <= 800
      ? Math.min(1200, Math.max(700, Math.ceil(safeMinChars * 1.8)))
      : safeMinChars <= 1200
        ? 1800
        : Math.min(8192, Math.max(2048, Math.ceil(safeMinChars * 1.7)));

  if (!opts.reasoningModel) return outputBudget;

  // 출력 예산 위에 reasoning 헤드룸을 얹는다. medium effort 기준 수천 토큰을
  // 쓰므로 12k 여유 + 상한 32k. 이래야 reasoning이 출력을 굶기지 않는다.
  const REASONING_HEADROOM = 12000;
  return Math.min(32000, outputBudget + REASONING_HEADROOM);
}

export function getOpenAiMinIntervalMs(modelName = '', maxCompletionTokens = 0): number {
  try {
    const env = typeof process !== 'undefined' ? parseInt(process.env.OPENAI_MIN_INTERVAL_MS || '', 10) : NaN;
    if (!isNaN(env) && env >= 0) return env;
  } catch {
    /* ignore */
  }

  // Text generation makes several OpenAI calls per post. Keep a light default
  // spacing so low-tier accounts avoid bursts without making one post feel stuck.
  const isMini = modelName.toLowerCase().includes('mini');
  if (maxCompletionTokens > 0) {
    if (isMini) {
      if (maxCompletionTokens >= 6000) return 10_000;
      if (maxCompletionTokens >= 4000) return 8_000;
      if (maxCompletionTokens >= 1800) return 6_000;
      return 4_000;
    }
    if (maxCompletionTokens >= 6000) return 20_000;
    if (maxCompletionTokens >= 4000) return 15_000;
    if (maxCompletionTokens >= 1800) return 12_000;
    return 8_000;
  }

  if (isMini) return 6_000;
  return 10_000;
}

/**
 * 누진 backoff 시퀀스 (429 retry 전용).
 *
 * ✅ [2026-06-02] 사용자 요청 — 30s → 60s → 90s → 120s 누진.
 *   호출부(callOpenAI)의 maxRetriesPerModel을 이 시퀀스 길이에 맞춰야 끝까지 발동한다.
 */
export const QUOTA_BACKOFF_SEQUENCE_MS = [30_000, 60_000, 90_000, 120_000];

const DEFAULT_OPENAI_RATE_LIMIT_PATIENCE_MS = 5 * 60_000;

function readHeader(error: unknown, name: string): string | undefined {
  const headers =
    (error as any)?.headers ||
    (error as any)?.response?.headers ||
    (error as any)?.error?.headers;
  if (!headers) return undefined;

  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(name.toLowerCase()) || undefined;
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return String(value);
  }
  return undefined;
}

export function parseOpenAiRateLimitDelayMs(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  if (!value) return null;

  if (/^\d+(\.\d+)?$/.test(value)) {
    return Math.ceil(Number(value) * 1000);
  }

  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  let totalMs = 0;
  const unitPattern = /(\d+(?:\.\d+)?)(ms|s|m|h)/gi;
  let match: RegExpExecArray | null;
  while ((match = unitPattern.exec(value)) !== null) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'ms') totalMs += amount;
    if (unit === 's') totalMs += amount * 1000;
    if (unit === 'm') totalMs += amount * 60_000;
    if (unit === 'h') totalMs += amount * 3_600_000;
  }

  return totalMs > 0 ? Math.ceil(totalMs) : null;
}

export function getOpenAiRateLimitPatienceMs(): number {
  try {
    const env = typeof process !== 'undefined' ? parseInt(process.env.OPENAI_RATE_LIMIT_PATIENCE_MS || '', 10) : NaN;
    if (!Number.isNaN(env) && env >= 60_000) return env;
  } catch {
    /* ignore */
  }
  return DEFAULT_OPENAI_RATE_LIMIT_PATIENCE_MS;
}

export function getOpenAiRateLimitWaitMs(error: unknown, fallbackMs: number): number {
  const headerWaits = [
    readHeader(error, 'retry-after'),
    readHeader(error, 'x-ratelimit-reset-requests'),
    readHeader(error, 'x-ratelimit-reset-tokens'),
  ]
    .map(parseOpenAiRateLimitDelayMs)
    .filter((value): value is number => typeof value === 'number' && value > 0);

  const headerWaitMs = headerWaits.length > 0 ? Math.max(...headerWaits) : 0;
  const waitMs = Math.max(fallbackMs, headerWaitMs, 30_000);
  return Math.min(waitMs, getOpenAiRateLimitPatienceMs());
}

export function isOpenAiRateLimitError(error: unknown, message = ''): boolean {
  const status = (error as any)?.status || (error as any)?.response?.status;
  const normalized = `${message} ${(error as any)?.code || ''} ${(error as any)?.type || ''}`.toLowerCase();
  return status === 429 ||
    normalized.includes('429') ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('rate_limit_exceeded') ||
    normalized.includes('quota');
}

export function isOpenAiHardQuotaError(error: unknown, message = ''): boolean {
  const status = (error as any)?.status || (error as any)?.response?.status;
  const normalized = `${message} ${(error as any)?.code || ''} ${(error as any)?.type || ''}`.toLowerCase();
  if (status === 429 && normalized.includes('rate_limit_exceeded')) return false;
  return normalized.includes('insufficient_quota') ||
    normalized.includes('billing_hard_limit_reached') ||
    normalized.includes('credit balance') ||
    normalized.includes('monthly usage limit') ||
    (normalized.includes('payment') && normalized.includes('required'));
}

/**
 * 누진 backoff 시간 계산 (429 retry 전용)
 *
 * @param retryAttempt 0부터 시작 (0=첫 backoff, 1=두 번째, ...)
 * @returns 대기 ms (30s → 60s → 90s → 120s 누진)
 */
export function getQuotaBackoffMs(retryAttempt: number): number {
  return QUOTA_BACKOFF_SEQUENCE_MS[Math.min(retryAttempt, QUOTA_BACKOFF_SEQUENCE_MS.length - 1)];
}
