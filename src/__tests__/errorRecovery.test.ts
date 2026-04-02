import { describe, it, expect, vi } from 'vitest';
import { isRetryableError, isFatalError, calculateBackoff } from '../errorRecovery';

describe('isRetryableError', () => {
  const retryableCases = [
    'Navigation timeout of 30000 ms exceeded',
    'Timed out waiting for element',
    'net::ERR_CONNECTION_REFUSED',
    'target closed',
    'Protocol error: Session closed',
    'Execution context was destroyed',
    'frame detached',
    'Node is detached from document',
  ];

  retryableCases.forEach((msg) => {
    it(`returns true for: "${msg.slice(0, 40)}..."`, () => {
      expect(isRetryableError(new Error(msg))).toBe(true);
    });
  });

  const nonRetryableCases = [
    'Invalid API key',
    'browser is closed',
    '로그인 실패',
    'Unknown error occurred',
  ];

  nonRetryableCases.forEach((msg) => {
    it(`returns false for: "${msg}"`, () => {
      expect(isRetryableError(new Error(msg))).toBe(false);
    });
  });
});

describe('isFatalError', () => {
  const fatalCases = [
    'browser is closed',
    '로그인 실패: 네이버 계정 정보를 확인해주세요',
    '계정 정보가 올바르지 않습니다',
    '잘못된 비밀번호입니다',
    '캡차 인증이 필요합니다',
    'Captcha detected on login page',
  ];

  fatalCases.forEach((msg) => {
    it(`returns true for: "${msg.slice(0, 40)}..."`, () => {
      expect(isFatalError(new Error(msg))).toBe(true);
    });
  });

  const nonFatalCases = [
    'Navigation timeout of 30000 ms exceeded',
    'net::ERR_CONNECTION_REFUSED',
    'Element not found',
  ];

  nonFatalCases.forEach((msg) => {
    it(`returns false for: "${msg}"`, () => {
      expect(isFatalError(new Error(msg))).toBe(false);
    });
  });
});

describe('calculateBackoff', () => {
  it('returns value within expected range for attempt 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = calculateBackoff(1, 1000, 30000);
    // baseMs * 2^(1-1) + 0.5 * 1000 = 1000 + 500 = 1500
    expect(result).toBe(1500);
    vi.restoreAllMocks();
  });

  it('doubles base delay for each attempt', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(calculateBackoff(1, 1000, 30000)).toBe(1000); // 1000 * 2^0
    expect(calculateBackoff(2, 1000, 30000)).toBe(2000); // 1000 * 2^1
    expect(calculateBackoff(3, 1000, 30000)).toBe(4000); // 1000 * 2^2
    expect(calculateBackoff(4, 1000, 30000)).toBe(8000); // 1000 * 2^3
    vi.restoreAllMocks();
  });

  it('caps at maxMs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = calculateBackoff(10, 1000, 30000);
    expect(result).toBe(30000);
    vi.restoreAllMocks();
  });

  it('uses default values when not provided', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = calculateBackoff(1);
    expect(result).toBe(1000); // default baseMs=1000
    vi.restoreAllMocks();
  });
});
