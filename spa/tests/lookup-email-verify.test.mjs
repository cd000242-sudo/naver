// 2026-10-20 보안 점검 — 이메일만 넣으면 남의 주문 · 라이선스 코드가 보이고, 그 코드로 구독 해지까지 됐다.
// 주문조회는 그 메일함으로 간 인증번호를 거쳐야 하고, 코드 메일은 주문번호(또는 코드+주문 이메일)로만 보낸다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('주문조회 이메일 탭은 인증번호를 받고 확인한 뒤 조회 토큰으로만 조회한다', () => {
  const page = read('../src/pages/LookupPage.tsx');
  assert.match(page, /callGAS\('lookup-email-request-code'/);
  assert.match(page, /callGAS\('lookup-email-verify'/);
  assert.match(page, /callGAS\('lookup-by-email', \{ email: e, lookupToken: verified\.lookupToken \}\)/);
  assert.match(page, /callGAS\('lookup-subscriptions-by-email', \{ email: e, lookupToken: verified\.lookupToken \}\)/);
  assert.doesNotMatch(page, /callGAS\('lookup-by-email', \{ email: e \}\)/);
});

test('결제 완료 화면의 코드 메일 요청은 주문번호를 함께 보낸다', () => {
  const success = read('../../payment-page/success.html');
  const calls = success.match(/action=send-code-email` \+\s*`&orderId=/g) || [];
  assert.equal(calls.length, 2);
});

test('옛 주문조회 페이지는 인증 단계를 아는 새 화면으로 넘긴다', () => {
  assert.match(read('../../payment-page/lookup.html'), /location\.replace\('\/lookup\/'/);
});

test('공개 관리자 화면에 관리자 아이디 · 비밀번호 해시를 두지 않는다', () => {
  assert.doesNotMatch(read('../../admin/index.html'), /ADMIN_(ID|PW)_HASH/);
});
