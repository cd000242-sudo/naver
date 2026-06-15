import { describe, expect, it } from 'vitest';
import {
  isChromeErrorUrl,
  isNaverBlogDomainUrl,
  isNaverLoginUrl,
  isNaverWriteEditorUrl,
  needsWriteEditorNavigationAfterManualLogin,
} from '../automation/editorUrlState';

describe('editorUrlState', () => {
  it('recognizes all current Naver write editor URL variants', () => {
    expect(isNaverWriteEditorUrl('https://blog.naver.com/GoBlogWrite.naver')).toBe(true);
    expect(isNaverWriteEditorUrl('https://blog.naver.com/PostWriteForm.naver?blogId=test')).toBe(true);
    expect(isNaverWriteEditorUrl('https://blog.naver.com/blogPostWrite.naver')).toBe(true);
    expect(isNaverWriteEditorUrl('https://blog.naver.com/NaverWriteEditor.naver')).toBe(true);
    expect(isNaverWriteEditorUrl('https://blog.naver.com/test?Redirect=Write')).toBe(true);
    expect(isNaverWriteEditorUrl('https://blog.naver.com/test?foo=1&redirect=write')).toBe(true);

    expect(isNaverWriteEditorUrl('https://blog.naver.com/test')).toBe(false);
    expect(isNaverWriteEditorUrl('https://nid.naver.com/nidlogin.login')).toBe(false);
  });

  it('separates login, blog-domain, and browser error states', () => {
    expect(isNaverLoginUrl('https://nid.naver.com/nidlogin.login')).toBe(true);
    expect(isNaverLoginUrl('https://nid.naver.com/login/ext')).toBe(true);
    expect(isNaverLoginUrl('https://blog.naver.com/test')).toBe(false);

    expect(isNaverBlogDomainUrl('https://blog.naver.com/test')).toBe(true);
    expect(isNaverBlogDomainUrl('https://m.blog.naver.com/test')).toBe(true);
    expect(isNaverBlogDomainUrl('https://www.naver.com')).toBe(false);

    expect(isChromeErrorUrl('chrome-error://chromewebdata/')).toBe(true);
    expect(isChromeErrorUrl('about:blank')).toBe(true);
    expect(isChromeErrorUrl('https://blog.naver.com/GoBlogWrite.naver')).toBe(false);
  });

  it('only asks for write-editor navigation after manual login on a non-editor blog page', () => {
    expect(needsWriteEditorNavigationAfterManualLogin('https://blog.naver.com/someone')).toBe(true);

    expect(needsWriteEditorNavigationAfterManualLogin('https://blog.naver.com/GoBlogWrite.naver')).toBe(false);
    expect(needsWriteEditorNavigationAfterManualLogin('https://blog.naver.com/someone?Redirect=Write')).toBe(false);
    expect(needsWriteEditorNavigationAfterManualLogin('https://nid.naver.com/nidlogin.login')).toBe(false);
    expect(needsWriteEditorNavigationAfterManualLogin('https://www.naver.com')).toBe(false);
  });
});
