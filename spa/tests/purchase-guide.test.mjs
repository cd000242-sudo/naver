// 구매 뒤 안내(2026-10-07 사장님 "구매하면 다운로드 바로가기랑 비밀번호 알려 주는지 — 어떤 제품이든" · "LEWORD 사용법 노션 볼 수 있게").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { purchaseGuide, DOWNLOAD_PASSWORD, LEWORD_GUIDE_URL } from '../src/lib/purchaseGuide.mjs';

test('단일 제품 — 그 제품 다운로드 바로가기 · 제품 이름 코드 · LEWORD 만 노션', () => {
  const lw = purchaseGuide('LEWORD 1년');
  assert.equal(lw.downloadHref, '/download?product=leword');
  assert.equal(lw.codeLabel, 'LEWORD 라이선스 코드');
  assert.equal(lw.showGuide, true);
  const orbit = purchaseGuide('Leadernam Orbit 1개월');
  assert.equal(orbit.downloadHref, '/download?product=orbit');
  assert.equal(orbit.showGuide, false);
  assert.equal(purchaseGuide('Better Life Naver 영구제').downloadHref, '/download?product=naver');
});

test('올인원 · 여러 제품 — 다운로드 전체 · 올인원 코드 이름 · 노션 보임(LEWORD 포함)', () => {
  const all = purchaseGuide('Leaders Pro All in one 1년');
  assert.equal(all.downloadHref, '/download');
  assert.equal(all.codeLabel, 'All in one 라이선스 코드');
  assert.equal(all.showGuide, true);
  const combo = purchaseGuide('Better Life Naver · LEWORD 1개월');
  assert.equal(combo.downloadHref, '/download');
  assert.equal(combo.showGuide, true);
});

test('모르는 표기도 다운로드 · 비밀번호는 늘 안내한다', () => {
  const x = purchaseGuide('');
  assert.equal(x.downloadHref, '/download');
  assert.equal(DOWNLOAD_PASSWORD, '1645');
  assert.ok(LEWORD_GUIDE_URL.startsWith('https://app.notion.com/p/LEWORD-'));
});

test('배선 — 무통장 완료 · 주문 조회 · 다운로드 페이지 · LEWORD 화면', () => {
  const bank = readFileSync(new URL('../src/pages/BankOrderPage.tsx', import.meta.url), 'utf8');
  const lookup = readFileSync(new URL('../src/pages/LookupPage.tsx', import.meta.url), 'utf8');
  const download = readFileSync(new URL('../src/pages/DownloadPage.tsx', import.meta.url), 'utf8');
  const leword = readFileSync(new URL('../src/pages/LewordPage.tsx', import.meta.url), 'utf8');
  assert.ok(bank.includes('<PurchaseNextSteps'), '무통장 완료');
  assert.ok(!bank.includes('>All in one 라이선스 코드<'), '제품과 상관없이 "All in one" 으로 박지 않는다');
  assert.ok(lookup.includes('<PurchaseNextSteps'), '주문 조회');
  assert.ok(download.includes("searchParams.get('product')") && download.includes('DOWNLOAD_PASSWORD'), '다운로드 페이지가 제품을 짚는다');
  assert.ok(leword.includes('LEWORD_GUIDE_URL'), 'LEWORD 화면 사용법');
});
