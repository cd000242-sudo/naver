import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  ErrorCategory,
  getErrorProperties,
  isRetryableCode,
  isFatalCode,
  getUserMessage,
  getCategory,
} from '../errors/errorCodes';
import { AutomationError, classifyErrorMessage } from '../errors/AutomationError';

describe('ErrorCode enum', () => {
  it('모든 에러 코드가 "카테고리.사유" 형식이다', () => {
    const codes = Object.values(ErrorCode);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]+\.[A-Z_]+$/);
    }
  });

  it('고유한 값을 가진다 (중복 없음)', () => {
    const codes = Object.values(ErrorCode);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});

describe('getErrorProperties', () => {
  it('모든 에러 코드에 대해 속성을 반환한다', () => {
    const codes = Object.values(ErrorCode);
    for (const code of codes) {
      const props = getErrorProperties(code);
      expect(props).toBeDefined();
      expect(typeof props.retryable).toBe('boolean');
      expect(typeof props.fatal).toBe('boolean');
      expect(typeof props.userMessage).toBe('string');
      expect(Object.values(ErrorCategory)).toContain(props.category);
    }
  });

  it('NETWORK_TIMEOUT은 재시도 가능하다', () => {
    expect(isRetryableCode(ErrorCode.NETWORK_TIMEOUT)).toBe(true);
    expect(isFatalCode(ErrorCode.NETWORK_TIMEOUT)).toBe(false);
  });

  it('BROWSER_CLOSED는 치명적이다', () => {
    expect(isFatalCode(ErrorCode.BROWSER_CLOSED)).toBe(true);
    expect(isRetryableCode(ErrorCode.BROWSER_CLOSED)).toBe(false);
  });

  it('AUTH_CAPTCHA_REQUIRED는 치명적이고 재시도 불가다', () => {
    expect(isFatalCode(ErrorCode.AUTH_CAPTCHA_REQUIRED)).toBe(true);
    expect(isRetryableCode(ErrorCode.AUTH_CAPTCHA_REQUIRED)).toBe(false);
  });

  it('PUBLISH_DAILY_LIMIT는 재시도 불가지만 치명적이지 않다', () => {
    expect(isRetryableCode(ErrorCode.PUBLISH_DAILY_LIMIT)).toBe(false);
    expect(isFatalCode(ErrorCode.PUBLISH_DAILY_LIMIT)).toBe(false);
  });
});

describe('getUserMessage', () => {
  it('한국어 사용자 메시지를 반환한다', () => {
    expect(getUserMessage(ErrorCode.AUTH_LOGIN_FAILED)).toBe('로그인 실패');
    expect(getUserMessage(ErrorCode.NETWORK_TIMEOUT)).toBe('네트워크 응답 시간 초과');
  });
});

describe('getCategory', () => {
  it('올바른 카테고리를 반환한다', () => {
    expect(getCategory(ErrorCode.NETWORK_TIMEOUT)).toBe(ErrorCategory.NETWORK);
    expect(getCategory(ErrorCode.AUTH_LOGIN_FAILED)).toBe(ErrorCategory.AUTH);
    expect(getCategory(ErrorCode.PUBLISH_DAILY_LIMIT)).toBe(ErrorCategory.PUBLISH);
  });
});

describe('AutomationError', () => {
  it('ErrorCode 기반으로 생성된다', () => {
    const err = new AutomationError(ErrorCode.NETWORK_TIMEOUT);
    expect(err.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    expect(err.retryable).toBe(true);
    expect(err.fatal).toBe(false);
    expect(err.name).toBe('AutomationError');
    expect(err instanceof Error).toBe(true);
  });

  it('커스텀 메시지를 지원한다', () => {
    const err = new AutomationError(ErrorCode.EDITOR_SELECTOR_FAILED, '발행 버튼 못 찾음');
    expect(err.message).toBe('발행 버튼 못 찾음');
    expect(err.userMessage).toBe('에디터 요소 찾기 실패');
  });

  it('context를 포함한다', () => {
    const err = new AutomationError(
      ErrorCode.IMAGE_TOO_LARGE,
      undefined,
      { fileSize: 15_000_000, maxSize: 10_000_000 },
    );
    expect(err.context).toEqual({ fileSize: 15_000_000, maxSize: 10_000_000 });
  });

  it('toJSON이 올바른 구조를 반환한다', () => {
    const err = new AutomationError(ErrorCode.AUTH_CAPTCHA_REQUIRED);
    const json = err.toJSON();

    expect(json.code).toBe(ErrorCode.AUTH_CAPTCHA_REQUIRED);
    expect(json.category).toBe(ErrorCategory.AUTH);
    expect(json.retryable).toBe(false);
    expect(json.fatal).toBe(true);
    expect(typeof json.timestamp).toBe('string');
  });

  it('timestamp이 ISO 형식이다', () => {
    const err = new AutomationError(ErrorCode.SYSTEM_UNKNOWN);
    expect(err.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('AutomationError.fromError', () => {
  it('일반 Error를 AutomationError로 변환한다', () => {
    const original = new Error('Navigation timeout of 30000 ms exceeded');
    const converted = AutomationError.fromError(original);

    expect(converted).toBeInstanceOf(AutomationError);
    expect(converted.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    expect(converted.retryable).toBe(true);
  });

  it('이미 AutomationError면 그대로 반환한다', () => {
    const original = new AutomationError(ErrorCode.AUTH_LOGIN_FAILED);
    const converted = AutomationError.fromError(original);
    expect(converted).toBe(original);
  });

  it('분류 불가한 에러는 fallbackCode를 사용한다', () => {
    const original = new Error('Something weird happened');
    const converted = AutomationError.fromError(original, ErrorCode.EDITOR_NOT_LOADED);
    expect(converted.code).toBe(ErrorCode.EDITOR_NOT_LOADED);
  });

  it('분류 불가 + fallback 미지정 시 SYSTEM_UNKNOWN', () => {
    const original = new Error('???');
    const converted = AutomationError.fromError(original);
    expect(converted.code).toBe(ErrorCode.SYSTEM_UNKNOWN);
  });
});

describe('classifyErrorMessage', () => {
  const cases: Array<[string, ErrorCode]> = [
    ['timeout exceeded', ErrorCode.NETWORK_TIMEOUT],
    ['Timed out waiting', ErrorCode.NETWORK_TIMEOUT],
    ['net::ERR_CONNECTION_REFUSED', ErrorCode.NETWORK_CONNECTION_RESET],
    ['browser is closed', ErrorCode.BROWSER_CLOSED],
    ['target closed', ErrorCode.BROWSER_TARGET_CLOSED],
    ['frame detached', ErrorCode.BROWSER_FRAME_DETACHED],
    ['Execution context was destroyed', ErrorCode.BROWSER_CONTEXT_DESTROYED],
    ['Protocol error', ErrorCode.BROWSER_PROTOCOL_ERROR],
    ['로그인 실패', ErrorCode.AUTH_LOGIN_FAILED],
    ['잘못된 비밀번호', ErrorCode.AUTH_WRONG_PASSWORD],
    ['captcha required', ErrorCode.AUTH_CAPTCHA_REQUIRED],
    ['캡차 감지', ErrorCode.AUTH_CAPTCHA_REQUIRED],
  ];

  cases.forEach(([message, expectedCode]) => {
    it(`"${message}" → ${expectedCode}`, () => {
      expect(classifyErrorMessage(message)).toBe(expectedCode);
    });
  });

  it('매칭 안 되면 null', () => {
    expect(classifyErrorMessage('unrelated error')).toBeNull();
  });
});
