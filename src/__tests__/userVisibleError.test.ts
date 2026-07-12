import { describe, expect, it } from 'vitest';

import {
  sanitizeRendererIpcResult,
  sanitizeUserVisibleError,
} from '../runtime/userVisibleError';
import { sanitizeDropshotErrorMessage } from '../image/dropshotBrowser';

describe('sanitizeUserVisibleError', () => {
  it('keeps the actionable network reason while removing automation internals', () => {
    const raw = [
      '\u001b[2mpage.goto: net::ERR_CONNECTION_TIMED_OUT at',
      'https://aistudio.dropshot.io/ko/workspace/board?panel=image&token=secret-token',
      'Call log:',
      '- navigating to the target, waiting until "domcontentloaded"',
    ].join(' ');

    const result = sanitizeUserVisibleError(raw);

    expect(result).toContain('ERR_CONNECTION_TIMED_OUT');
    expect(result).toContain('https://aistudio.dropshot.io/ko/workspace/board');
    expect(result).not.toContain('secret-token');
    expect(result).not.toContain('Call log');
    expect(result).not.toContain('\u001b');
    expect(result.length).toBeLessThanOrEqual(240);
  });

  it('redacts local paths and credential-shaped values', () => {
    const raw = [
      'failed at C:\\Users\\park\\AppData\\Local\\app\\main.js:12:4',
      'Bearer eyJhbGciOiJIUzI1NiJ9.secret.signature',
      'api_key=AIza01234567890123456789012345678901234',
      'password: super-secret',
    ].join(' | ');

    const result = sanitizeUserVisibleError(raw);

    expect(result).toContain('[internal path]');
    expect(result).not.toContain('C:\\Users');
    expect(result).not.toContain('eyJhbGci');
    expect(result).not.toContain('AIza');
    expect(result).not.toContain('super-secret');
  });

  it('uses a stable fallback for empty or non-string errors', () => {
    expect(sanitizeUserVisibleError('')).toBe('작업 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    expect(sanitizeUserVisibleError({ message: 'socket closed' })).toBe('socket closed');
  });

  it('redacts proxy userinfo, generic JWTs, Cognito tokens, and profile paths', () => {
    const raw = [
      'proxy=https://proxy-user:proxy-pass@proxy.example.com:8443/path?session=secret',
      'idToken=eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signature',
      'refreshToken: cognito-refresh-token-value',
      'browserType.launchPersistentContext: profile C:\\Users\\Park Name\\AppData\\Roaming\\dropshot-profile failed',
    ].join(' | ');

    const result = sanitizeUserVisibleError(raw);

    expect(result).not.toContain('proxy-user');
    expect(result).not.toContain('proxy-pass');
    expect(result).not.toContain('eyJhbGci');
    expect(result).not.toContain('cognito-refresh-token-value');
    expect(result).not.toContain('Park Name');
    expect(result).toContain('[internal path]');
  });

  it('sanitizes failure payloads without mutating successful IPC results', () => {
    const failed = {
      success: false,
      message: 'failed at C:\\Users\\park\\secret.txt token=abc123',
      error: { message: 'accessToken=top-secret' },
    };
    const successful = { success: true, message: 'C:\\Users\\park\\is intentional output' };

    const safeFailed = sanitizeRendererIpcResult(failed);
    const sameSuccessful = sanitizeRendererIpcResult(successful);

    expect(safeFailed).not.toBe(failed);
    expect(safeFailed.message).not.toContain('C:\\Users');
    expect(safeFailed.error.message).not.toContain('top-secret');
    expect(failed.message).toContain('C:\\Users');
    expect(sameSuccessful).toBe(successful);
  });

  it('also sanitizes error-only handler payloads that omit a success flag', () => {
    const result = sanitizeRendererIpcResult({
      response: 'fallback',
      error: { message: 'idToken=secret-token at C:\\Users\\park\\profile' },
    });

    expect(result.error.message).not.toContain('secret-token');
    expect(result.error.message).not.toContain('C:\\Users');
  });

  it('uses the same credential boundary for Dropshot logs', () => {
    const result = sanitizeDropshotErrorMessage(
      'page.goto https://user:pass@aistudio.dropshot.io/ko?token=secret idToken=jwt-secret',
      300,
    );

    expect(result).not.toContain('user:pass');
    expect(result).not.toContain('token=secret');
    expect(result).not.toContain('jwt-secret');
  });
});
