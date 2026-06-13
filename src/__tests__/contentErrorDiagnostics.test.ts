import { describe, expect, it } from 'vitest';
import {
  classifyOpenAiDiagnosticError,
  formatWaitBudgetKo,
  formatWaitDurationKo,
  isOpenAiConnectionIssue,
  readHeaderValue,
} from '../contentErrorDiagnostics.js';

describe('contentErrorDiagnostics', () => {
  it('formats wait durations for user-facing quota messages', () => {
    expect(formatWaitDurationKo(0)).toBe('1분 미만');
    expect(formatWaitDurationKo(59_999)).toBe('1분 미만');
    expect(formatWaitDurationKo(60_001)).toBe('2분');
    expect(formatWaitBudgetKo(0)).toBe('1분');
    expect(formatWaitBudgetKo(120_001)).toBe('3분');
  });

  it('classifies OpenAI authentication, rate limit, billing, and network failures', () => {
    expect(classifyOpenAiDiagnosticError({ status: 401, message: 'Incorrect API key provided' })).toBe('AUTH_INVALID_KEY');
    expect(classifyOpenAiDiagnosticError({ status: 429, code: 'rate_limit_exceeded', message: 'Too many requests' })).toBe('RATE_LIMIT');
    expect(classifyOpenAiDiagnosticError({ code: 'insufficient_quota', message: 'billing hard limit' })).toBe('BILLING_OR_CREDIT');
    expect(classifyOpenAiDiagnosticError({ code: 'ENOTFOUND', message: 'fetch failed due DNS lookup' })).toBe('DNS_LOOKUP_FAILED');
  });

  it('detects connection issues without treating user abort as a retryable connection error', () => {
    expect(isOpenAiConnectionIssue({ name: 'APIConnectionError', code: 'ECONNRESET' })).toBe(true);
    expect(isOpenAiConnectionIssue(new Error('Connection error.'))).toBe(true);
    expect(isOpenAiConnectionIssue(new Error('사용자가 콘텐츠 생성을 취소했습니다.'))).toBe(false);
  });

  it('reads headers from fetch Headers-like objects and plain objects', () => {
    expect(readHeaderValue({ 'x-request-id': 'req_plain' }, 'X-Request-ID')).toBe('req_plain');
    expect(readHeaderValue(new Map([['openai-request-id', 'req_map']]), 'openai-request-id')).toBe('req_map');
    expect(readHeaderValue({ get: (name: string) => name === 'x-request-id' ? 'req_get' : '' }, 'x-request-id')).toBe('req_get');
  });
});
