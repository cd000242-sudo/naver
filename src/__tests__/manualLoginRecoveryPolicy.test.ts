import { describe, expect, it } from 'vitest';
import {
  isManualLoginBlogLandingSuccessful,
  resolveManualLoginCheckpoint,
} from '../automation/manualLoginRecoveryPolicy';

describe('manualLoginRecoveryPolicy', () => {
  it('prioritizes device confirmation and two-factor pages before URL navigation decisions', () => {
    expect(resolveManualLoginCheckpoint({
      currentUrl: 'https://blog.naver.com/someone',
      deviceConfirmDetected: true,
      twoFactorDetected: false,
    }).action).toBe('handle-device-confirm');

    expect(resolveManualLoginCheckpoint({
      currentUrl: 'https://blog.naver.com/someone',
      deviceConfirmDetected: false,
      twoFactorDetected: true,
    }).action).toBe('wait-two-factor');
  });

  it('moves from a non-editor blog page to the write editor after manual login', () => {
    expect(resolveManualLoginCheckpoint({
      currentUrl: 'https://blog.naver.com/someone',
      deviceConfirmDetected: false,
      twoFactorDetected: false,
    })).toEqual({
      action: 'navigate-write-editor',
      reason: 'blog-domain-without-editor',
    });
  });

  it('treats write-editor URLs as successful manual login completion', () => {
    expect(resolveManualLoginCheckpoint({
      currentUrl: 'https://blog.naver.com/GoBlogWrite.naver',
      deviceConfirmDetected: false,
      twoFactorDetected: false,
    })).toEqual({
      action: 'success',
      reason: 'already-on-writer',
    });

    expect(resolveManualLoginCheckpoint({
      currentUrl: 'https://blog.naver.com/someone?Redirect=Write',
      deviceConfirmDetected: false,
      twoFactorDetected: false,
    }).action).toBe('success');
  });

  it('navigates to the writer from a logged-in non-blog Naver page', () => {
    expect(resolveManualLoginCheckpoint({
      currentUrl: 'https://www.naver.com/',
      deviceConfirmDetected: false,
      twoFactorDetected: false,
    })).toEqual({
      action: 'navigate-from-naver-domain',
      reason: 'logged-in-naver-domain',
    });
  });

  it('keeps waiting on login and unrelated pages', () => {
    expect(resolveManualLoginCheckpoint({
      currentUrl: 'https://nid.naver.com/nidlogin.login',
      deviceConfirmDetected: false,
      twoFactorDetected: false,
    }).action).toBe('wait');

    expect(resolveManualLoginCheckpoint({
      currentUrl: 'https://example.com/',
      deviceConfirmDetected: false,
      twoFactorDetected: false,
    }).action).toBe('wait');
  });

  it('recognizes successful blog landing after navigating away from a logged-in Naver page', () => {
    expect(isManualLoginBlogLandingSuccessful('https://blog.naver.com/GoBlogWrite.naver')).toBe(true);
    expect(isManualLoginBlogLandingSuccessful('https://blog.naver.com/someone?Redirect=Write')).toBe(true);
    expect(isManualLoginBlogLandingSuccessful('https://m.blog.naver.com/someone')).toBe(true);

    expect(isManualLoginBlogLandingSuccessful('https://nid.naver.com/nidlogin.login')).toBe(false);
    expect(isManualLoginBlogLandingSuccessful('https://www.naver.com')).toBe(false);
    expect(isManualLoginBlogLandingSuccessful('about:blank')).toBe(false);
  });
});
