import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
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

  it('explains a fabricated-fact policy block without presenting it as an image failure', () => {
    const msg = friendlyErrorMessage({
      message: 'CONTENT_POLICY_BLOCKED:BLOCK_FABRICATED_FACT\n문제 문장: 45,800원에 판매되고 있습니다',
    });

    expect(msg).toContain('자료에서 확인되지 않은');
    expect(msg).toContain('45,800원');
    expect(msg).not.toContain('이미지 생성');
  });

  it('explains a genuine title-body mismatch without calling it a fabricated fact', () => {
    const msg = friendlyErrorMessage({
      message: 'CONTENT_POLICY_BLOCKED:BLOCK_KEYWORD_BODY_MISMATCH',
    });

    expect(msg).toContain('제목과 본문 주제');
    expect(msg).toContain('반자동 편집');
    expect(msg).not.toContain('가격·효과·수치');
  });
});

describe('detached Naver login frame publish retry guard', () => {
  const source = readFileSync(new URL('../renderer/modules/fullAutoFlow.ts', import.meta.url), 'utf8');

  it('detects detached Naver login frame errors before treating publish as failed', () => {
    expect(source).toContain('function isDetachedLoginFrameError');
    expect(source).toContain('execution context is not available in detached frame');
    expect(source).toContain('nidlogin.login');
    expect(source).toContain('retryRunAutomationAfterDetachedLoginFrame(apiClient, payload, errorMsg)');
  });

  it('closes stale browser automation once without marking the publish as user-cancelled', () => {
    expect(source).toContain('MAX_DETACHED_LOGIN_FRAME_RETRIES = 1');
    expect(source).toContain('closeBrowserForPublishRetry(payload)');
    expect(source).not.toContain('cancelAutomation failed before detached-frame retry');
    expect(source).toContain('timeout: PUBLISH_AUTOMATION_TIMEOUT_MS');
  });
});

describe('recoverable publish session retry guard', () => {
  const source = readFileSync(new URL('../renderer/modules/fullAutoFlow.ts', import.meta.url), 'utf8');

  it('retries once when Naver browser session is closed during semi/full auto publish', () => {
    expect(source).toContain('function isRecoverablePublishAutomationError');
    expect(source).toContain('브라우저 세션이 종료');
    expect(source).toContain('제목 입력 필드를 찾을 수 없습니다');
    expect(source).toContain('_publishSessionRecoveryRetryCount');
    expect(source).toContain('retryRunAutomationAfterRecoverablePublishFailure(apiClient, payload, errorMsg)');
  });

  it('keeps the same browser for editor-not-ready recovery and only closes hard-dead sessions', () => {
    expect(source).toContain('function shouldCloseBrowserBeforePublishRetry');
    expect(source).toContain('const closeBeforeRetry = shouldCloseBrowserBeforePublishRetry(errorMsg)');
    expect(source).toContain('if (closeBeforeRetry)');
    expect(source).toContain('에디터가 아직 준비되지 않아 같은 브라우저에서 다시 시도합니다');
    expect(source).toContain('const retryPayload = {');
    expect(source).toContain('...payload');
    expect(source).toContain('timeout: PUBLISH_AUTOMATION_TIMEOUT_MS');
  });

  it('blocks every runAutomation retry after editor content was already applied', () => {
    expect(source).toContain('function isPostContentAppliedPublishError');
    expect(source).toContain('POST_CONTENT_APPLIED');
    expect(source).toContain('POST_TAIL_INCOMPLETE');
    expect(source).toContain('blockPostContentAppliedPublishRetry(errorMsg)');
    expect(source).toContain('본문 작성 완료 후 발행 단계에서 브라우저 세션이 종료되었습니다');
    expect(source).toContain("showUnifiedProgress(95, '본문 작성 완료 — 발행 상태 확인 필요'");

    const markerGuard = source.indexOf('blockPostContentAppliedPublishRetry(errorMsg)');
    const detachedRetry = source.indexOf('retryRunAutomationAfterDetachedLoginFrame(apiClient, payload, errorMsg)');
    const recoverableRetry = source.indexOf('retryRunAutomationAfterRecoverablePublishFailure(apiClient, payload, errorMsg)');
    const networkRetry = source.indexOf("payload._networkRetryCount = retryAttempts + 1");

    expect(markerGuard).toBeGreaterThan(-1);
    expect(detachedRetry).toBeGreaterThan(markerGuard);
    expect(recoverableRetry).toBeGreaterThan(markerGuard);
    expect(networkRetry).toBeGreaterThan(markerGuard);
  });
});

describe('post-content-applied publish failure marker', () => {
  const source = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');

  it('marks publish-stage failures after content insertion so renderer cannot rewrite the post', () => {
    expect(source).toContain('POST_CONTENT_APPLIED');
    expect(source).toContain('let editorContentApplied = false');
    expect(source).toContain('(this as any).__editorContentApplied = false');
    expect(source).toContain('editorContentApplied || (this as any).__editorContentApplied === true');
    expect(source).toContain('editorContentApplied = true');
    expect(source).toContain('throwPostContentAppliedPublishError');
    expect(source).toContain('postContentAppliedPublishFailure = true');
    expect(source).toContain('keepBrowserOpen: resolvedOptions.keepBrowserOpen || postContentAppliedPublishFailure');
    expect(source).toContain('!keepBrowserOpen && !postContentAppliedPublishFailure');

    const firstApplied = source.indexOf('editorContentApplied = true');
    const firstPublish = source.indexOf('await this.publishBlogPost(resolvedOptions.publishMode, resolvedOptions.scheduleDate, resolvedOptions.scheduleMethod)');

    expect(firstApplied).toBeGreaterThan(-1);
    expect(firstPublish).toBeGreaterThan(firstApplied);
  });
});

describe('full-auto image failure policy', () => {
  const source = readFileSync(new URL('../renderer/modules/fullAutoFlow.ts', import.meta.url), 'utf8');

  it('retries image generation on the selected engine only', () => {
    expect(source).toContain('const originalProvider = isShoppingAiMode');
    expect(source).toContain('? (formData.scAIImageEngine || formData.imageSource)');
    expect(source).toContain(': formData.imageSource');
    expect(source).toMatch(/return originalProvider/);
    expect(source).not.toMatch(/const FALLBACK_CHAIN/);
  });

  it('does not publish text-only output after image generation failure', () => {
    expect(source).toMatch(/이미지 없이 발행하지 않고 중단/);
    expect(source).toMatch(/throw new Error\('이미지 생성 결과가 비어있습니다\.'\)/);
    expect(source).toContain('semi-auto:text-only-empty-image-management');
    expect(source).not.toMatch(/텍스트 위주로 발행합니다/);
  });
});
