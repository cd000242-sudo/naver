import { describe, expect, it } from 'vitest';
import {
  classifyBlogWriteNavigationUrl,
  isBlogWriteLoginRedirect,
  isOutsideBlogWriteSurface,
  resolveBlogWriteFrameSwitchSurface,
  resolveManualLoginRetryWriteNavigation,
  shouldSkipBlogWriteWarmup,
} from '../automation/editorNavigationUrlPolicy.js';

describe('editorNavigationUrlPolicy', () => {
  it('classifies browser error pages before any Naver URL handling', () => {
    expect(classifyBlogWriteNavigationUrl('chrome-error://chromewebdata/')).toMatchObject({
      kind: 'browser-error',
      isBrowserError: true,
      isEditorUrl: false,
      isBlogDomain: false,
      isLoginRedirect: false,
      isExternalRedirect: false,
    });

    expect(classifyBlogWriteNavigationUrl('about:blank')).toMatchObject({
      kind: 'browser-error',
      isBrowserError: true,
    });
  });

  it('classifies write editor URLs, including Redirect=Write chains, as editor URLs', () => {
    for (const url of [
      'https://blog.naver.com/GoBlogWrite.naver',
      'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      'https://blog.naver.com/blogPostWrite.naver',
      'https://blog.naver.com/someone?Redirect=Write',
    ]) {
      expect(classifyBlogWriteNavigationUrl(url)).toMatchObject({
        kind: 'editor',
        isEditorUrl: true,
        isBlogDomain: true,
        isLoginRedirect: false,
        isExternalRedirect: false,
      });
    }
  });

  it('separates login, blog-home, and external redirect states', () => {
    expect(classifyBlogWriteNavigationUrl('https://nid.naver.com/nidlogin.login')).toMatchObject({
      kind: 'login',
      isLoginRedirect: true,
      isEditorUrl: false,
      isBlogDomain: false,
    });

    expect(classifyBlogWriteNavigationUrl('https://blog.naver.com/leader_248')).toMatchObject({
      kind: 'blog-domain',
      isBlogDomain: true,
      isEditorUrl: false,
      isExternalRedirect: false,
    });

    expect(classifyBlogWriteNavigationUrl('https://www.naver.com')).toMatchObject({
      kind: 'external',
      isExternalRedirect: true,
      isBlogDomain: false,
      isEditorUrl: false,
    });
  });

  it('exposes the current retry guard for non-blog non-editor surfaces', () => {
    expect(isOutsideBlogWriteSurface('https://www.naver.com')).toBe(true);
    expect(isOutsideBlogWriteSurface('https://nid.naver.com/nidlogin.login')).toBe(true);
    expect(isOutsideBlogWriteSurface('about:blank')).toBe(true);

    expect(isOutsideBlogWriteSurface('https://blog.naver.com/leader_248')).toBe(false);
    expect(isOutsideBlogWriteSurface('https://blog.naver.com/GoBlogWrite.naver')).toBe(false);
  });

  it('keeps the warmup skip decision aligned with blog/write surfaces only', () => {
    expect(shouldSkipBlogWriteWarmup('https://blog.naver.com/leader_248')).toBe(true);
    expect(shouldSkipBlogWriteWarmup('https://blog.naver.com/PostWriteForm.naver?blogId=test')).toBe(true);
    expect(shouldSkipBlogWriteWarmup('https://blog.naver.com/someone?Redirect=Write')).toBe(true);

    expect(shouldSkipBlogWriteWarmup('https://www.naver.com')).toBe(false);
    expect(shouldSkipBlogWriteWarmup('https://nid.naver.com/nidlogin.login')).toBe(false);
    expect(shouldSkipBlogWriteWarmup('about:blank')).toBe(false);
  });

  it('detects login redirects used by editor frame switching', () => {
    expect(isBlogWriteLoginRedirect('https://nid.naver.com/nidlogin.login')).toBe(true);
    expect(isBlogWriteLoginRedirect('https://nid.naver.com/login/ext')).toBe(true);

    expect(isBlogWriteLoginRedirect('https://blog.naver.com/GoBlogWrite.naver')).toBe(false);
    expect(isBlogWriteLoginRedirect('https://blog.naver.com/leader_248')).toBe(false);
    expect(isBlogWriteLoginRedirect('https://www.naver.com')).toBe(false);
    expect(isBlogWriteLoginRedirect('about:blank')).toBe(false);
  });

  it('resolves the frame-switch retry path without exposing inline URL predicates', () => {
    expect(resolveBlogWriteFrameSwitchSurface('https://www.naver.com')).toMatchObject({
      shouldRetryNavigation: true,
      shouldWaitForBlogDomainEditorFrame: false,
      isEditorSurface: false,
    });

    expect(resolveBlogWriteFrameSwitchSurface('about:blank')).toMatchObject({
      shouldRetryNavigation: true,
      shouldWaitForBlogDomainEditorFrame: false,
    });

    expect(resolveBlogWriteFrameSwitchSurface('https://blog.naver.com/leader_248')).toMatchObject({
      shouldRetryNavigation: false,
      shouldWaitForBlogDomainEditorFrame: true,
      isEditorSurface: false,
    });

    expect(resolveBlogWriteFrameSwitchSurface('https://blog.naver.com/GoBlogWrite.naver')).toMatchObject({
      shouldRetryNavigation: false,
      shouldWaitForBlogDomainEditorFrame: false,
      isEditorSurface: true,
    });
  });

  it('resolves manual-login retry navigation result from URL plus frame evidence', () => {
    expect(resolveManualLoginRetryWriteNavigation('https://blog.naver.com/PostWriteForm.naver?blogId=test', false)).toMatchObject({
      status: 'ready',
      isReadyForEditor: true,
    });

    expect(resolveManualLoginRetryWriteNavigation('https://blog.naver.com/leader_248', true)).toMatchObject({
      status: 'ready',
      isReadyForEditor: true,
    });

    expect(resolveManualLoginRetryWriteNavigation('https://blog.naver.com/leader_248', false)).toMatchObject({
      status: 'blog-main-without-editor',
      isReadyForEditor: false,
    });

    expect(resolveManualLoginRetryWriteNavigation('https://nid.naver.com/nidlogin.login', false)).toMatchObject({
      status: 'access-failed',
      isReadyForEditor: false,
    });

    expect(resolveManualLoginRetryWriteNavigation('https://www.naver.com', false)).toMatchObject({
      status: 'access-failed',
      isReadyForEditor: false,
    });
  });
});
