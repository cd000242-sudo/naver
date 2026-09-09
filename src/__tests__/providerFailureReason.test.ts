/**
 * [2026-09-10 사장님] "그냥 안 된다고 막히지 말고, 크레딧 없으면 크레딧 충전하라고 띄우라고.
 * 앱이 문제 있는 줄 알았잖아."
 *
 * 실측: 사진 11장이 전부 실패했는데 화면에 뜬 말은 "비전 엔진/키 상태를 확인해주세요" 였다.
 * 로그를 열어야만 진짜 원인이 보였다 — `Selected provider (openai): 429 You have no credits
 * remaining.` 원인을 아는데도 사용자에게 안 알려주면 앱 버그로 읽힌다.
 *
 * 이 파일은 "무엇이 잘못됐고 무엇을 하면 되는지"를 벤더 응답에서 뽑아내는 계약을 잠근다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  classifyProviderFailure,
  describeProviderFailure,
  summarizeProviderFailures,
} from '../errors/providerFailureReason';

describe('classifyProviderFailure — 벤더 응답에서 원인을 가른다', () => {
  it('OpenAI 크레딧 소진', () => {
    expect(classifyProviderFailure('429 You have no credits remaining.')).toBe('no-credits');
    expect(classifyProviderFailure('Error code: 429 - insufficient_quota')).toBe('no-credits');
  });

  it('Anthropic 잔액 부족', () => {
    expect(classifyProviderFailure('Your credit balance is too low to access the API')).toBe('no-credits');
  });

  it('Gemini 무료 한도 소진(billing 안내)', () => {
    expect(classifyProviderFailure('429 RESOURCE_EXHAUSTED: Quota exceeded, enable billing')).toBe('no-credits');
  });

  it('키 문제', () => {
    expect(classifyProviderFailure('401 Incorrect API key provided')).toBe('invalid-key');
    expect(classifyProviderFailure('API key not valid. Please pass a valid API key.')).toBe('invalid-key');
    expect(classifyProviderFailure('403 Unauthorized')).toBe('invalid-key');
  });

  it('일시적 호출 한도는 크레딧과 다르다 — 기다리면 된다', () => {
    expect(classifyProviderFailure('429 Rate limit reached for gpt-4.1')).toBe('rate-limit');
    expect(classifyProviderFailure('503 model is overloaded')).toBe('rate-limit');
  });

  it('네트워크', () => {
    expect(classifyProviderFailure('connect ETIMEDOUT 1.2.3.4:443')).toBe('network');
    expect(classifyProviderFailure('fetch failed')).toBe('network');
  });

  it('모르면 unknown — 아는 척하지 않는다', () => {
    expect(classifyProviderFailure('무언가 이상함')).toBe('unknown');
    expect(classifyProviderFailure('')).toBe('unknown');
  });
});

describe('describeProviderFailure — 무엇을 하면 되는지 말한다', () => {
  it('크레딧 소진이면 충전하라고 말하고 벤더 이름을 정확히 쓴다', () => {
    const msg = describeProviderFailure('no-credits', 'openai');
    expect(msg).toMatch(/OpenAI/);
    expect(msg).toMatch(/크레딧/);
    expect(msg).toMatch(/충전/);
    expect(msg).toMatch(/platform\.openai\.com/);
  });

  it('벤더마다 충전할 곳이 다르다', () => {
    expect(describeProviderFailure('no-credits', 'claude')).toMatch(/console\.anthropic\.com/);
    expect(describeProviderFailure('no-credits', 'gemini')).toMatch(/aistudio\.google\.com|console\.cloud\.google\.com/);
  });

  it('키 문제면 키를 다시 넣으라고 한다', () => {
    expect(describeProviderFailure('invalid-key', 'openai')).toMatch(/키/);
    expect(describeProviderFailure('invalid-key', 'openai')).not.toMatch(/충전/);
  });

  it('일시 한도면 기다리라고 한다 — 충전하라고 하지 않는다', () => {
    const msg = describeProviderFailure('rate-limit', 'gemini');
    expect(msg).toMatch(/잠시|기다/);
    expect(msg).not.toMatch(/충전/);
  });

  it('unknown 이면 단정하지 않는다', () => {
    expect(describeProviderFailure('unknown', 'openai')).not.toMatch(/크레딧이 없|키가 유효하지/);
  });
});

describe('summarizeProviderFailures — 여러 장이 같은 이유로 실패했을 때', () => {
  it('11장이 모두 크레딧이면 크레딧 안내 하나로 묶는다', () => {
    const reasons = Array.from({ length: 11 }, () => '429 You have no credits remaining.');
    const summary = summarizeProviderFailures(reasons, 'openai');
    expect(summary.kind).toBe('no-credits');
    expect(summary.message).toMatch(/충전/);
  });

  it('가장 많은 원인을 대표로 삼는다', () => {
    const summary = summarizeProviderFailures(
      ['401 Incorrect API key', '401 Incorrect API key', 'fetch failed'],
      'gemini',
    );
    expect(summary.kind).toBe('invalid-key');
  });

  it('원인이 하나도 안 잡히면 unknown 이고 원문을 남겨 진단을 막지 않는다', () => {
    const summary = summarizeProviderFailures(['이상한 실패'], 'openai');
    expect(summary.kind).toBe('unknown');
    expect(summary.message).toContain('이상한 실패');
  });

  it('실패 목록이 비면 unknown', () => {
    expect(summarizeProviderFailures([], 'openai').kind).toBe('unknown');
  });
});

describe('aggregator 배선 — 실패 사유를 버리지 않는다', () => {
  const src = () => readFileSync(
    new URL('../imageNarrative/inferenceAggregator/aggregator.ts', import.meta.url), 'utf8',
  );
  const live = (needle: string) => src()
    .split(String.fromCharCode(10))
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .filter((line) => line.includes(needle))
    .length;

  it('실패 메시지를 모아 둔다 (예전에는 console.warn 만 하고 버렸다)', () => {
    expect(live('failureReasons')).toBeGreaterThan(0);
  });

  it('최종 오류 문구를 summarizeProviderFailures 로 만든다', () => {
    expect(live('summarizeProviderFailures(')).toBeGreaterThan(0);
  });

  it('"비전 엔진/키 상태를 확인해주세요" 같은 뭉뚱그린 안내는 더 이상 쓰지 않는다', () => {
    expect(src()).not.toContain('비전 엔진/키 상태를 확인해주세요');
  });
});
