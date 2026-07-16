import { describe, expect, it } from 'vitest';
import {
  buildOpenAiGenerationFailureMessage,
  classifyOpenAiFailure,
  classifyOpenAiDiagnosticError,
  formatWaitBudgetKo,
  formatWaitDurationKo,
  isOpenAiConnectionIssue,
  readHeaderValue,
  sanitizeOpenAiUrlForLog,
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

  it('uses structured HTTP status and error code before misleading message fragments', () => {
    expect(classifyOpenAiFailure({ status: 400, message: 'network field is invalid' })).toMatchObject({
      kind: 'INVALID_REQUEST',
      status: 400,
      requestMayHaveReachedProvider: true,
    });
    expect(classifyOpenAiFailure({ status: 403, message: 'forbidden network policy' })).toMatchObject({
      kind: 'PROJECT_OR_PERMISSION_FORBIDDEN',
      status: 403,
    });
    expect(classifyOpenAiFailure({ status: 404, code: 'model_not_found', message: 'missing' })).toMatchObject({
      kind: 'MODEL_NOT_FOUND_OR_NO_ACCESS',
      code: 'model_not_found',
    });
    expect(classifyOpenAiFailure({ status: 500, message: 'internal network error' })).toMatchObject({
      kind: 'OPENAI_SERVER_ERROR',
      status: 500,
    });
    expect(classifyOpenAiFailure({ status: 503, message: 'upstream rate limit while unavailable' }).kind)
      .toBe('OPENAI_SERVER_ERROR');
    expect(classifyOpenAiFailure({ status: 503, message: 'model not found in upstream pool' }).kind)
      .toBe('OPENAI_SERVER_ERROR');
  });

  it('separates hard billing, rate limits, timeouts, and pre-response network failures', () => {
    expect(classifyOpenAiFailure({ status: 429, code: 'insufficient_quota', message: 'quota exhausted' }).kind)
      .toBe('BILLING_OR_CREDIT');
    expect(classifyOpenAiFailure({ status: 429, code: 'rate_limit_exceeded', message: 'too many requests' }).kind)
      .toBe('RATE_LIMIT');
    expect(classifyOpenAiFailure({ name: 'AbortError', message: 'OpenAI API 호출 시간 초과 (120초)' })).toMatchObject({
      kind: 'REQUEST_TIMEOUT',
      requestMayHaveReachedProvider: true,
    });
    expect(classifyOpenAiFailure({ code: 'ENOTFOUND', message: 'fetch failed' })).toMatchObject({
      kind: 'DNS_LOOKUP_FAILED',
      requestMayHaveReachedProvider: false,
    });
    expect(classifyOpenAiFailure({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' }, message: 'fetch failed' })).toMatchObject({
      kind: 'SOCKET_CONNECTION_FAILED',
      requestMayHaveReachedProvider: false,
    });
    expect(classifyOpenAiFailure({ code: 'ECONNREFUSED', message: 'fetch failed' }).requestMayHaveReachedProvider)
      .toBe(false);
    expect(classifyOpenAiFailure({ code: 'ECONNRESET', message: 'socket reset' }).requestMayHaveReachedProvider)
      .toBe(true);
    expect(classifyOpenAiFailure({ message: 'fetch failed' }).requestMayHaveReachedProvider)
      .toBe(true);
    expect(classifyOpenAiFailure({ name: 'AbortError', message: 'user aborted' }).requestMayHaveReachedProvider)
      .toBe(true);
  });

  it('reports the real one-request zero-recall policy and preserves a safe root cause', () => {
    const serverMessage = buildOpenAiGenerationFailureMessage(
      { status: 503, code: 'server_error', message: 'upstream unavailable' },
      'gpt-5.6-sol',
      { requestCount: 1, automaticRetryCount: 0 },
    );
    expect(serverMessage).toContain('요청 1회');
    expect(serverMessage).toContain('자동 재호출 0회');
    expect(serverMessage).toContain('HTTP 503');
    expect(serverMessage).toContain('OpenAI 서버');
    expect(serverMessage).toContain('upstream unavailable');
    expect(serverMessage).toMatch(/^\[OPENAI_REQUEST_FAILED:OPENAI_SERVER_ERROR\]/);
    expect(serverMessage).not.toContain('1회 재시도');
    expect(serverMessage).not.toContain('모델 문제가 아니라 PC/네트워크');

    const networkMessage = buildOpenAiGenerationFailureMessage(
      { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND api.openai.com' },
      'gpt-5.6-terra',
      { requestCount: 1, automaticRetryCount: 0 },
    );
    expect(networkMessage).toContain('HTTP 응답을 받기 전');
    expect(networkMessage).toContain('일반적으로 토큰 사용량이 기록되지 않지만');
  });

  it('redacts secrets from provider error text', () => {
    const message = buildOpenAiGenerationFailureMessage(
      new Error(
        'Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwxyz123456 ' +
        'OPENAI_API_KEY=hidden-secret-value authorization: Bearer abc.def.ghi ' +
        'https://user:password@example.com/v1?access_token=query-secret',
      ),
      'gpt-5.6-sol',
    );
    expect(message).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
    expect(message).not.toContain('hidden-secret-value');
    expect(message).not.toContain('abc.def.ghi');
    expect(message).not.toContain('user:password');
    expect(message).not.toContain('query-secret');
    expect(message).toContain('[REDACTED_API_KEY]');
  });

  it('removes credentials and query tokens from base URLs before diagnostics logging', () => {
    expect(sanitizeOpenAiUrlForLog('https://user:pass@proxy.example/v1?token=secret#frag'))
      .toBe('https://proxy.example/v1');
    expect(sanitizeOpenAiUrlForLog('not a url')).toBe('[invalid OpenAI base URL]');
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
