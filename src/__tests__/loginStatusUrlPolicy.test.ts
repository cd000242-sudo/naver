import { describe, expect, it } from 'vitest';
import { classifyLoginStatusUrl } from '../automation/loginStatusUrlPolicy.js';

describe('loginStatusUrlPolicy', () => {
  it('treats blog and writer URLs without login markers as valid session surfaces', () => {
    for (const url of [
      'https://blog.naver.com/leader_248',
      'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      'https://blog.naver.com/someone?Redirect=Write',
      'https://m.blog.naver.com/leader_248',
    ]) {
      expect(classifyLoginStatusUrl(url)).toMatchObject({
        isBlogSessionSurface: true,
        shouldProbeNaverDom: true,
      });
    }
  });

  it('keeps login-like URLs out of valid session and DOM-probe paths', () => {
    for (const url of [
      'https://nid.naver.com/nidlogin.login',
      'https://nid.naver.com/login/ext',
      'https://blog.naver.com/login',
    ]) {
      expect(classifyLoginStatusUrl(url)).toMatchObject({
        isBlogSessionSurface: false,
        shouldProbeNaverDom: false,
      });
    }
  });

  it('allows non-login Naver surfaces to use the lightweight DOM probe', () => {
    expect(classifyLoginStatusUrl('https://www.naver.com')).toMatchObject({
      isBlogSessionSurface: false,
      shouldProbeNaverDom: true,
    });

    expect(classifyLoginStatusUrl('https://search.naver.com/search.naver?query=test')).toMatchObject({
      isBlogSessionSurface: false,
      shouldProbeNaverDom: true,
    });
  });

  it('rejects blank and external surfaces for lightweight login status checks', () => {
    for (const url of ['about:blank', 'chrome-error://chromewebdata/', 'https://example.com']) {
      expect(classifyLoginStatusUrl(url)).toMatchObject({
        isBlogSessionSurface: false,
        shouldProbeNaverDom: false,
      });
    }
  });
});
