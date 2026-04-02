import { describe, it, expect } from 'vitest';
import { isFatalApiError, isRetryableImageError, friendlyErrorMessage } from '../renderer/modules/fullAutoFlow';

describe('isFatalApiError', () => {
  const fatalCases = [
    'HTTP Error 429: Too Many Requests',
    'Error 500: Internal Server Error',
    '503 Service Unavailable',
    'too many requests - rate limit exceeded',
    'Rate limit reached for model',
    'internal server error occurred',
    'service unavailable, try again later',
  ];

  fatalCases.forEach((msg) => {
    it(`detects fatal: "${msg.slice(0, 40)}..."`, () => {
      expect(isFatalApiError({ message: msg })).toBe(true);
    });
  });

  const nonFatalCases = [
    'Timeout waiting for element',
    'Network error: ECONNREFUSED',
    'Element not found',
    '이미지 생성 실패',
  ];

  nonFatalCases.forEach((msg) => {
    it(`not fatal: "${msg}"`, () => {
      expect(isFatalApiError({ message: msg })).toBe(false);
    });
  });

  it('handles string input (not Error object)', () => {
    expect(isFatalApiError('429 rate limit')).toBe(true);
  });

  it('handles null/undefined', () => {
    expect(isFatalApiError(null)).toBe(false);
    expect(isFatalApiError(undefined)).toBe(false);
  });
});

describe('isRetryableImageError', () => {
  const retryableCases = [
    'Request timeout after 30000ms',
    '타임아웃 발생',
    '시간 초과 에러',
    'timed out waiting for response',
    'network error during fetch',
    'fetch failed: ECONNREFUSED',
    'econnreset by server',
    '결과가 비어있음',
    '결과 없음',
    '이미지 없이 발행',
  ];

  retryableCases.forEach((msg) => {
    it(`retryable: "${msg}"`, () => {
      expect(isRetryableImageError({ message: msg })).toBe(true);
    });
  });

  it('returns false for fatal errors (429/500/503)', () => {
    expect(isRetryableImageError({ message: 'Error 429 rate limit' })).toBe(false);
    expect(isRetryableImageError({ message: '500 Internal Server Error' })).toBe(false);
  });

  it('returns false for unrecognized errors', () => {
    expect(isRetryableImageError({ message: 'Unknown error XYZ' })).toBe(false);
  });
});

describe('friendlyErrorMessage', () => {
  it('maps 429 to quota message', () => {
    const msg = friendlyErrorMessage({ message: '429 Too Many Requests' });
    expect(msg).toContain('할당량');
  });

  it('maps 500 to server overload message', () => {
    const msg = friendlyErrorMessage({ message: '500 Internal Server Error' });
    expect(msg).toContain('과부하');
  });

  it('maps 503 to maintenance message', () => {
    const msg = friendlyErrorMessage({ message: '503 Service Unavailable' });
    expect(msg).toContain('점검');
  });

  it('maps timeout to network check message', () => {
    const msg = friendlyErrorMessage({ message: 'Request timed out' });
    expect(msg).toContain('시간이 초과');
  });

  it('maps network error to connection message', () => {
    const msg = friendlyErrorMessage({ message: 'fetch failed ECONNREFUSED' });
    expect(msg).toContain('네트워크');
  });

  it('maps quota error', () => {
    const msg = friendlyErrorMessage({ message: 'API quota exceeded' });
    expect(msg).toContain('할당량');
  });

  it('returns original message for unknown errors', () => {
    const msg = friendlyErrorMessage({ message: '알 수 없는 에러' });
    expect(msg).toContain('알 수 없는 에러');
  });

  it('handles string input', () => {
    const msg = friendlyErrorMessage('timeout occurred');
    expect(msg).toContain('시간이 초과');
  });
});
