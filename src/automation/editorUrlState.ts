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
  // [2026-07-03 FIX] 로그인 페이지는 리다이렉트 파라미터에 에디터 URL을 품는다
  //   (nid.naver.com/nidlogin.login?mode=form&url=https://blog.naver.com/GoBlogWrite.naver).
  //   전체 문자열 substring 매칭이면 쿼리 속 'GoBlogWrite' 때문에 로그인 페이지를 에디터로 오인해
  //   navigateToBlogWrite가 성공 처리하고 로그인 복구 브랜치를 건너뛰어 프레임 전환 실패로 팅긴다.
  //   로그인 URL이면 에디터가 아니다 — 먼저 배제.
  if (isNaverLoginUrl(value)) return false;
  return /(GoBlogWrite|blogPostWrite|PostWriteForm|SmartEditor|NaverWriteEditor)/i.test(value)
    || /[?&]Redirect=Write\b/i.test(value);
}

export function needsWriteEditorNavigationAfterManualLogin(value: string): boolean {
  return isNaverBlogDomainUrl(value)
    && !isNaverLoginUrl(value)
    && !isNaverWriteEditorUrl(value);
}
