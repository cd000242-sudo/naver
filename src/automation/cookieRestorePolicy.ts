/**
 * [2026-10-09] 저장 쿠키 파일은 서버가 로그인을 확인한 순간에만 쓰이고, 크롬은 그 뒤에도 프로필 쿠키를 계속 갱신한다.
 * 살아 있는 NID_AUT 가 이미 있는 프로필을 더 오래된 파일로 덮어쓰면 스스로 로그아웃시킬 수 있다.
 * 세션 쿠키 계정은 크롬을 끄면 NID_AUT 가 사라지므로 그때는 파일을 넣는다.
 */
export interface CookieLike { name: string; value?: string; expires?: number }

export function shouldKeepProfileCookies(profileCookies: readonly CookieLike[], nowSeconds: number = Date.now() / 1000): boolean {
  return profileCookies.some((cookie) => cookie.name === 'NID_AUT' && Boolean(cookie.value)
    && (cookie.expires === undefined || cookie.expires === -1 || cookie.expires > nowSeconds));
}
