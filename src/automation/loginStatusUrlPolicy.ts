export interface LoginStatusUrlDecision {
  isBlogSessionSurface: boolean;
  shouldProbeNaverDom: boolean;
}

function hasLoginMarker(value: string): boolean {
  const lowerValue = value.toLowerCase();
  return lowerValue.includes('nidlogin') || lowerValue.includes('login');
}

export function classifyLoginStatusUrl(value: string): LoginStatusUrlDecision {
  const lowerValue = String(value || '').toLowerCase();
  const isNaverSurface = lowerValue.includes('naver.com');
  const isLoginSurface = hasLoginMarker(lowerValue);

  return {
    isBlogSessionSurface: lowerValue.includes('blog.naver.com') && !isLoginSurface,
    shouldProbeNaverDom: isNaverSurface && !isLoginSurface,
  };
}
