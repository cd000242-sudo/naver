/**
 * 네이버 로그인 관련 셀렉터
 */
import type { SelectorEntry, SelectorMap } from './types';

// 로그인 셀렉터 키 타입
export type LoginSelectorKey =
  | 'idInput'
  | 'pwInput'
  | 'keepLoginCheckbox'
  | 'loginButton'
  | 'logoutLink'
  | 'navLoginButton'
  | 'userName';

const entry = (primary: string, fallbacks: readonly string[], description: string): SelectorEntry => ({
  primary, fallbacks, description,
});

export const LOGIN_SELECTORS: SelectorMap<LoginSelectorKey> = {
  idInput: entry(
    '#id',
    ['input.input_id', 'input[name="id"]', 'input[aria-label*="아이디"]'],
    '아이디 입력 필드',
  ),
  pwInput: entry(
    '#pw',
    ['input.input_pw', 'input[name="pw"]', 'input[type="password"]'],
    '비밀번호 입력 필드',
  ),
  keepLoginCheckbox: entry(
    '#nvlong',
    ['#keep', 'input.input_keep', 'input[name="nvlong"]'],
    '로그인 유지 체크박스',
  ),
  loginButton: entry(
    '#log\\.login',
    ['button[type="submit"].btn_login', 'button.btn_login', 'button[type="submit"]'],
    '로그인 버튼',
  ),
  logoutLink: entry(
    'a[href*="logout"]',
    ['a[href*="nidlogin.logout"]', '.gnb_btn_logout'],
    '로그아웃 링크',
  ),
  navLoginButton: entry(
    '.gnb_btn_login',
    ['#gnb_login_button', 'a[href*="nidlogin.login"]'],
    '네비게이션 로그인 버튼',
  ),
  userName: entry(
    '.gnb_name',
    ['.gnb_my_name', '.user_name', '.MyView-module__nick'],
    '사용자명 표시 요소',
  ),
};
