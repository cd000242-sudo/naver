// 사이트 동시 로그인 막기(2026-10-07 사장님 "같은 계정으로 돌아가면서 쓰는 걸 방지해야 돼").
// 정책: 먼저 쓰는 쪽이 이김(서버가 다른 브라우저 10분 안 활동이면 ALREADY_LOGGED_IN) · 사이트 1곳 + 앱 1곳 따로.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auth = readFileSync(new URL('../src/lib/lewordAuth.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/pages/LewordPage.tsx', import.meta.url), 'utf8');

test('로그인에 브라우저 ID 를 싣고, 서버가 준 웹 세션 토큰을 저장한다(비밀번호는 여전히 저장 안 함)', () => {
  assert.ok(auth.includes("action: 'verify-web-login', userId, userPassword, deviceId: getDeviceId()"));
  assert.ok(auth.includes('webSessionToken'));
  assert.ok(auth.includes("const DEVICE_KEY = 'leaderspro.leword.device.v1'"));
  assert.ok(!/userPassword\s*:\s*userPassword[\s\S]{0,40}saveSession/.test(auth));
});

test('세션 저장소 판을 올려 예전(토큰 없는) 로그인은 한 번 다시 로그인하게 한다', () => {
  assert.ok(auth.includes("const SESSION_KEY = 'leaderspro.leword.session.v2'"));
  assert.ok(auth.includes("localStorage.removeItem('leaderspro.leword.session.v1')"));
});

test('몇 분마다 서버에 확인 — 다른 곳이 이어받았으면(SESSION_REPLACED) 이 화면을 로그아웃, 연결 실패는 로그아웃하지 않는다', () => {
  assert.ok(auth.includes("action: 'web-session-ping'"));
  assert.ok(auth.includes("'SESSION_REPLACED'"));
  assert.match(auth, /return 'offline'/);
  assert.ok(page.includes('pingWebSession'));
  assert.ok(page.includes('visibilitychange'));
  assert.match(page, /WEB_SESSION_PING_MS\s*=\s*3\s*\*\s*60\s*\*\s*1000/);
  assert.ok(page.includes('다른 곳에서 이 계정으로 로그인'), '튕긴 이유를 알려 준다');
});

test('로그아웃 버튼은 서버의 웹 세션도 비운다 — 다른 곳에서 바로 들어올 수 있게', () => {
  assert.ok(auth.includes("action: 'web-logout'"));
  assert.ok(page.includes('logoutWeb('));
});

test('가입 · 재인증 뒤에도 웹 세션을 받는다(토큰 없는 세션이 남지 않게)', () => {
  assert.match(auth, /registerWithLicense[\s\S]*return login\(userId, userPassword\)/);
});

test('확인은 늘 가장 최근에 저장된 토큰으로 — 키 동기화가 같은 브라우저에서 다시 로그인해도 스스로 튕기지 않는다', () => {
  assert.match(auth, /export async function pingWebSession[\s\S]{0,400}const latest = loadSession\(\)/);
});
