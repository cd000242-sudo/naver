import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import {
  classifyGeminiQuotaError,
  resolveQuotaWaitMs,
  shouldStopRetryingQuota,
} from '../image/geminiQuotaClassifier';
import { isMappableImageTransportError } from '../image/imageErrorMessages';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-08 사용자 실측 콘솔]
 *   Error: Request failed with status code 429   (재생성)
 *   Error: 이미지 생성 타임아웃 (180초)              (다음 생성)
 *
 * 두 줄은 같은 뿌리였다. main 은 429 를 5회 재시도하며 매번 15~25초를 쉬는데,
 * 렌더러의 추정 타임아웃이 nano-banana-pro 1장 기준 90s + 90s = 정확히 180초라
 * 재시도가 성공할 시간이 구조적으로 없었다. 게다가 429 원문이 그대로 화면에 나가
 * 사용자는 할당량 문제인 줄 알 수 없었고, 일일 할당량이 소진된 단일 키 사용자도
 * 오늘 안에 풀리지 않을 한도를 3분 동안 기다렸다.
 */

describe('Gemini 429 분류 — 분당 초과 vs 일일 소진', () => {
  const perDayBody = JSON.stringify({
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel' }] },
      ],
    },
  });
  const perMinuteBody = JSON.stringify({
    error: {
      code: 429,
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel' }] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '21s' },
      ],
    },
  });

  it('일일 할당량 소진을 per-day 로 가른다', () => {
    expect(classifyGeminiQuotaError(perDayBody).scope).toBe('per-day');
  });

  it('분당 속도 초과를 per-minute 로 가르고 retryDelay 를 읽는다', () => {
    const result = classifyGeminiQuotaError(perMinuteBody);
    expect(result.scope).toBe('per-minute');
    expect(result.retryDelayMs).toBe(21_000);
  });

  it('근거가 없으면 unknown 으로 두고 기존 동작을 지킨다', () => {
    expect(classifyGeminiQuotaError('Request failed with status code 429').scope).toBe('unknown');
  });

  it('retry-after 헤더도 대기 시간 근거로 읽는다', () => {
    expect(classifyGeminiQuotaError('429', '12').retryDelayMs).toBe(12_000);
  });

  it('본문에 둘 다 있으면 기다리면 풀리는 쪽(분당)으로 판단한다', () => {
    const both = 'quotaId: RequestsPerDay ... quotaId: RequestsPerMinute';
    expect(classifyGeminiQuotaError(both).scope).toBe('per-minute');
  });
});

describe('429 재시도 중단 조건', () => {
  it('일일 소진 + 여분 키 없음 → 재시도하지 않는다', () => {
    expect(shouldStopRetryingQuota({ scope: 'per-day' }, 1)).toBe(true);
    expect(shouldStopRetryingQuota({ scope: 'per-day' }, 0)).toBe(true);
  });

  it('일일 소진이어도 넘어갈 키가 남았으면 재시도한다', () => {
    expect(shouldStopRetryingQuota({ scope: 'per-day' }, 2)).toBe(false);
  });

  it('분당 초과·판별 불가는 기다리면 풀리므로 재시도한다', () => {
    expect(shouldStopRetryingQuota({ scope: 'per-minute' }, 1)).toBe(false);
    expect(shouldStopRetryingQuota({ scope: 'unknown' }, 1)).toBe(false);
  });
});

describe('재시도 대기 시간', () => {
  it('서버가 알려준 값을 우선 쓴다', () => {
    expect(resolveQuotaWaitMs({ scope: 'per-minute', retryDelayMs: 9_000 }, 20_000)).toBe(9_000);
  });

  it('근거가 없으면 기존 대기 값을 그대로 쓴다', () => {
    expect(resolveQuotaWaitMs({ scope: 'unknown' }, 18_500)).toBe(18_500);
  });

  it('서버 값이 비상식적이면 3~30초로 묶는다', () => {
    expect(resolveQuotaWaitMs({ scope: 'per-day', retryDelayMs: 1 }, 20_000)).toBe(3_000);
    expect(resolveQuotaWaitMs({ scope: 'per-day', retryDelayMs: 600_000 }, 20_000)).toBe(30_000);
  });
});

describe('에러 메시지 한국어 매핑 대상 판별', () => {
  it('전송 계층 에러는 매핑한다', () => {
    expect(isMappableImageTransportError({ message: 'Request failed with status code 429' })).toBe(true);
    expect(isMappableImageTransportError({ response: { status: 503 } })).toBe(true);
    expect(isMappableImageTransportError({ message: 'RESOURCE_EXHAUSTED' })).toBe(true);
    expect(isMappableImageTransportError({ message: 'quota exceeded' })).toBe(true);
    expect(isMappableImageTransportError({ message: 'connect ETIMEDOUT' })).toBe(true);
  });

  it('사람이 쓴 한국어 안내는 건드리지 않는다 (숫자가 섞여 있어도)', () => {
    const humanWritten = '쇼핑 AI 생성에 사용할 대표 상품 이미지를 확인하지 못했습니다.';
    expect(isMappableImageTransportError({ message: humanWritten })).toBe(false);
    expect(isMappableImageTransportError({ message: '이미지 500장 생성 중 중단되었습니다.' })).toBe(false);
  });
});

describe('타임아웃 예산 충돌 방지 (렌더러 ↔ main 교차 불변식)', () => {
  const renderer = read('renderer/modules/costAndAutoGen.ts');
  const generator = read('image/nanoBananaProGenerator.ts');

  /** 소스에서 숫자 상수를 읽는다 (밑줄 구분자 허용). */
  function readNumber(source: string, name: string): number {
    const match = source.match(new RegExp(`const ${name} = ([0-9_]+)`));
    expect(match, `${name} 상수를 찾지 못했습니다`).toBeTruthy();
    return Number(match![1].replace(/_/g, ''));
  }

  it('렌더러 타임아웃 하한이 main 의 429 재시도 예산보다 크다', () => {
    const budgetMs = readNumber(renderer, 'QUOTA_RETRY_BUDGET_MS');
    const marginMs = Number(
      renderer.match(/QUOTA_RETRY_BUDGET_MS \+ ([0-9_]+)/)![1].replace(/_/g, ''),
    );
    const floorMs = budgetMs + marginMs;
    const maxRetries = readNumber(generator, 'maxRetries');

    // 429 1회당 최악 대기 = 15,000 + random(10,000) = 25,000ms
    const worstCaseRetryWaitMs = maxRetries * 25_000;

    // 예산 자체가 최악의 대기를 담아야 한다.
    expect(budgetMs).toBeGreaterThanOrEqual(worstCaseRetryWaitMs);
    // 여유가 0이면 예산과 타임아웃이 다시 같아진다 — 실사고가 정확히 그 상태였다.
    expect(marginMs).toBeGreaterThan(0);
    expect(floorMs).toBeGreaterThan(budgetMs);
    // 사고 당시 실측값(180초)보다 반드시 커야 한다.
    expect(floorMs).toBeGreaterThan(180_000);
  });

  it('429 재시도 루프를 타는 엔진에 하한이 적용된다', () => {
    expect(renderer).toMatch(/QUOTA_RETRY_IMAGE_PROVIDERS = new Set\(\[[\s\S]*?'nano-banana-pro'/);
    expect(renderer).toMatch(/QUOTA_RETRY_IMAGE_PROVIDERS\.has\(provider\)\s*\?\s*Math\.max\(estimated, QUOTA_RETRY_TIMEOUT_FLOOR_MS\)/);
  });

  it('429 원문을 그대로 렌더러에 흘리지 않는다', () => {
    const main = read('main.ts');
    expect(main).toMatch(/isMappableImageTransportError\(error, raw\)/);
    expect(main).toMatch(/getImageErrorMessage\(error\)/);
  });
});
