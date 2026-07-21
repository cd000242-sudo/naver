/**
 * openaiRpmThrottler.test.ts
 *
 * ✅ [2026-06-02] Locks the user-requested throttling behavior:
 *   - Fixed minimum interval (default 10s) serializes concurrent calls (burst guard).
 *   - throttle(0) does not add spacing (vision path unchanged).
 *   - Progressive 429 backoff sequence: 30s → 60s → 90s → 120s.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OpenAIRpmThrottler,
  getQuotaBackoffMs,
  QUOTA_BACKOFF_SEQUENCE_MS,
  getOpenAiMinIntervalMs,
  getOpenAiMaxCompletionTokens,
  getOpenAiRateLimitPatienceMs,
  getOpenAiRateLimitWaitMs,
  isOpenAiHardQuotaError,
  isOpenAiRateLimitError,
  parseOpenAiRateLimitDelayMs,
} from '../utils/openaiRpmThrottler.js';

describe('getQuotaBackoffMs — 누진 backoff 시퀀스', () => {
  it('30s → 60s → 90s → 120s 순서로 증가한다', () => {
    expect(getQuotaBackoffMs(0)).toBe(30_000);
    expect(getQuotaBackoffMs(1)).toBe(60_000);
    expect(getQuotaBackoffMs(2)).toBe(90_000);
    expect(getQuotaBackoffMs(3)).toBe(120_000);
  });

  it('시퀀스 범위를 넘으면 마지막 값(120s)으로 clamp 된다', () => {
    expect(getQuotaBackoffMs(4)).toBe(120_000);
    expect(getQuotaBackoffMs(99)).toBe(120_000);
  });

  it('시퀀스 길이는 4 (호출부 maxRetries 동기화 기준)', () => {
    expect(QUOTA_BACKOFF_SEQUENCE_MS).toEqual([30_000, 60_000, 90_000, 120_000]);
  });
});

describe('getOpenAiMinIntervalMs — 호출 간 최소 간격', () => {
  const original = process.env.OPENAI_MIN_INTERVAL_MS;
  afterEach(() => {
    if (original === undefined) delete process.env.OPENAI_MIN_INTERVAL_MS;
    else process.env.OPENAI_MIN_INTERVAL_MS = original;
  });

  it('기본값은 10초', () => {
    delete process.env.OPENAI_MIN_INTERVAL_MS;
    expect(getOpenAiMinIntervalMs()).toBe(10_000);
  });

  it('mini 모델은 12초 간격을 사용', () => {
    delete process.env.OPENAI_MIN_INTERVAL_MS;
    expect(getOpenAiMinIntervalMs('gpt-4.1-mini')).toBe(6_000);
  });

  it('환경 변수로 override 가능', () => {
    process.env.OPENAI_MIN_INTERVAL_MS = '5000';
    expect(getOpenAiMinIntervalMs()).toBe(5_000);
  });

  it('0(간격 없음)도 허용', () => {
    process.env.OPENAI_MIN_INTERVAL_MS = '0';
    expect(getOpenAiMinIntervalMs()).toBe(0);
  });
});

describe('OpenAI low-tier token budget helpers', () => {
  afterEach(() => {
    delete process.env.OPENAI_MIN_INTERVAL_MS;
  });

  it('sizes max completion tokens to the requested job instead of always reserving 8192', () => {
    expect(getOpenAiMaxCompletionTokens(450)).toBeLessThanOrEqual(1200);
    expect(getOpenAiMaxCompletionTokens(650)).toBeLessThanOrEqual(1400);
    expect(getOpenAiMaxCompletionTokens(2500)).toBeLessThan(8192);
    expect(getOpenAiMaxCompletionTokens(6000)).toBe(8192);
  });

  // [v2.11.136] 추론 모델은 reasoning_tokens가 이 예산을 함께 먹는다. 라이브
  // 실측: gpt-5.6-terra가 4080 예산을 reasoning으로 전부 소진 → 출력 0자 실패.
  it('adds reasoning headroom for reasoning models so output is not starved', () => {
    const base = getOpenAiMaxCompletionTokens(2400);
    const reasoning = getOpenAiMaxCompletionTokens(2400, { reasoningModel: true });
    expect(base).toBe(4080); // 비추론 경로는 기존 그대로(회귀 없음)
    expect(reasoning).toBeGreaterThan(base + 8000); // 출력 위에 넉넉한 추론 여유
    expect(reasoning).toBeLessThanOrEqual(32000); // 상한
  });

  it('reasoning headroom sits above the output budget and stays bounded', () => {
    // 출력 예산은 8192 상한 → 추론 총합 최대 8192+12000=20192 (32000 안전상한 이하)
    const big = getOpenAiMaxCompletionTokens(20000, { reasoningModel: true });
    expect(big).toBe(20192);
    expect(big).toBeLessThanOrEqual(32000);
    const small = getOpenAiMaxCompletionTokens(450, { reasoningModel: true });
    expect(small).toBeGreaterThan(getOpenAiMaxCompletionTokens(450));
  });

  it('uses a more conservative interval for large standard GPT-4.1 calls', () => {
    expect(getOpenAiMinIntervalMs('gpt-4.1', 4500)).toBeGreaterThanOrEqual(15_000);
    expect(getOpenAiMinIntervalMs('gpt-4.1-mini', 4500)).toBeLessThan(
      getOpenAiMinIntervalMs('gpt-4.1', 4500),
    );
  });
});

describe('OpenAI rate-limit patient wait helpers', () => {
  const originalPatience = process.env.OPENAI_RATE_LIMIT_PATIENCE_MS;
  afterEach(() => {
    if (originalPatience === undefined) delete process.env.OPENAI_RATE_LIMIT_PATIENCE_MS;
    else process.env.OPENAI_RATE_LIMIT_PATIENCE_MS = originalPatience;
  });

  it('parses OpenAI reset delay formats', () => {
    expect(parseOpenAiRateLimitDelayMs('6m0s')).toBe(360_000);
    expect(parseOpenAiRateLimitDelayMs('1.5s')).toBe(1_500);
    expect(parseOpenAiRateLimitDelayMs('250ms')).toBe(250);
    expect(parseOpenAiRateLimitDelayMs('2')).toBe(2_000);
  });

  it('uses retry-after and reset headers above fallback backoff', () => {
    const error = {
      status: 429,
      headers: {
        'retry-after': '45',
        'x-ratelimit-reset-requests': '20s',
        'x-ratelimit-reset-tokens': '1m30s',
      },
    };
    expect(getOpenAiRateLimitWaitMs(error, 30_000)).toBe(90_000);
  });

  it('defaults to a 5 minute patience window and allows env override', () => {
    delete process.env.OPENAI_RATE_LIMIT_PATIENCE_MS;
    expect(getOpenAiRateLimitPatienceMs()).toBe(300_000);

    process.env.OPENAI_RATE_LIMIT_PATIENCE_MS = '240000';
    expect(getOpenAiRateLimitPatienceMs()).toBe(240_000);
  });

  it('separates transient 429 rate limits from hard billing quota errors', () => {
    expect(isOpenAiRateLimitError({ status: 429, code: 'rate_limit_exceeded' })).toBe(true);
    expect(isOpenAiHardQuotaError({ status: 429, code: 'rate_limit_exceeded' })).toBe(false);
    expect(isOpenAiHardQuotaError({ status: 429, code: 'insufficient_quota' })).toBe(true);
    expect(isOpenAiHardQuotaError({ status: 429 }, 'please check your plan and billing details')).toBe(false);
  });
});

describe('OpenAIRpmThrottler.throttle — 최소 간격 직렬 예약', () => {
  let throttler: OpenAIRpmThrottler;

  beforeEach(() => {
    vi.useFakeTimers();
    throttler = new OpenAIRpmThrottler(60, 20, 3);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('첫 호출은 즉시 통과한다', async () => {
    let resolved = false;
    throttler.throttle(10_000).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
  });

  it('동시 호출 2개: 두 번째는 10초 뒤에 풀린다 (burst 직렬화)', async () => {
    let firstDone = false;
    let secondDone = false;

    // 동시에 두 호출 — 예약은 동기적으로 순차 슬롯을 잡는다
    throttler.throttle(10_000).then(() => {
      firstDone = true;
    });
    throttler.throttle(10_000).then(() => {
      secondDone = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(firstDone).toBe(true);
    expect(secondDone).toBe(false); // 아직 대기 중

    await vi.advanceTimersByTimeAsync(9_999);
    expect(secondDone).toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    expect(secondDone).toBe(true);
  });

  it('동시 호출 3개: 0s / 10s / 20s 슬롯으로 분산된다', async () => {
    const done = [false, false, false];
    throttler.throttle(10_000).then(() => (done[0] = true));
    throttler.throttle(10_000).then(() => (done[1] = true));
    throttler.throttle(10_000).then(() => (done[2] = true));

    await vi.advanceTimersByTimeAsync(0);
    expect(done).toEqual([true, false, false]);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(done).toEqual([true, true, false]);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(done).toEqual([true, true, true]);
  });

  it('throttle(0)은 간격을 강제하지 않는다 (비전 경로 동작 유지)', async () => {
    const done = [false, false];
    throttler.throttle(0).then(() => (done[0] = true));
    throttler.throttle(0).then(() => (done[1] = true));

    await vi.advanceTimersByTimeAsync(0);
    expect(done).toEqual([true, true]); // 둘 다 즉시 통과
  });

  it('abort signal cancels a reserved wait immediately', async () => {
    const controller = new AbortController();
    await throttler.throttle(10_000);

    const pending = throttler.throttle(10_000, controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow(/취소/);
  });
});
