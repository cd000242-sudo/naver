export function isChromeErrorUrl(value: string): boolean {
  return value.startsWith('chrome-error://')
    || value.includes('chromewebdata')
    || value === 'about:blank';
}

export function isNaverLoginUrl(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes('nidlogin')
    || lower.includes('login.naver')
    || (lower.includes('/login') && !lower.includes('blog.naver.com'));
}

export function isNaverBlogDomainUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'blog.naver.com' || hostname === 'm.blog.naver.com';
  } catch {
    return /^https?:\/\/m?\.?blog\.naver\.com\//i.test(value);
  }
}

export function isNaverWriteEditorUrl(value: string): boolean {
  return /(GoBlogWrite|blogPostWrite|PostWriteForm|SmartEditor|NaverWriteEditor)/i.test(value)
    || /[?&]Redirect=Write\b/i.test(value);
}

export function needsWriteEditorNavigationAfterManualLogin(value: string): boolean {
  return isNaverBlogDomainUrl(value)
    && !isNaverLoginUrl(value)
    && !isNaverWriteEditorUrl(value);
}
