// 앱 ↔ 사이트 API 키 한 몸(2026-10-07 사장님 "앱에서 등록됐다면 로그인했을 때 읽고 내 api 키에 자동 연동되어야 정상").
// 충돌은 마지막에 저장한 쪽이 이긴다(사장님 결정). 사이트에서 앱이 꺼져 있을 때 저장했으면(pending) 다음 연결 때 앱으로 넘긴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planKeySync, APP_KEY_FIELDS } from '../src/lib/appKeySyncPlan.mjs';

test('앱에만 있는 칸은 사이트로, 사이트에만 있는 칸은 앱으로 — 앱에 없는 사이트 전용 칸(쿠팡 등)은 건드리지 않는다', () => {
  const plan = planKeySync({
    siteKeys: { searchAdLicense: 'S-LIC', coupangAccessKey: 'CP' }, siteSavedAt: '2026-10-01T00:00:00Z', sitePending: false,
    appKeys: { openApiId: 'A-ID', youtubeKey: 'A-YT' }, appSavedAt: '2026-10-02T00:00:00Z',
  });
  assert.equal(plan.nextSite.openApiId, 'A-ID');
  assert.equal(plan.nextSite.youtubeKey, 'A-YT');
  assert.equal(plan.nextSite.coupangAccessKey, 'CP');
  assert.deepEqual(plan.toApp, { searchAdLicense: 'S-LIC' });
  assert.equal(plan.siteChanged, true);
  assert.equal(plan.appChanged, true);
});

test('같은 칸이 다르면 마지막에 저장한 쪽 — 앱이 나중이면 앱 값, 사이트가 나중이면 사이트 값을 앱으로', () => {
  const appNewer = planKeySync({ siteKeys: { openApiId: 'OLD' }, siteSavedAt: '2026-10-01T00:00:00Z', sitePending: false, appKeys: { openApiId: 'NEW' }, appSavedAt: '2026-10-05T00:00:00Z' });
  assert.equal(appNewer.nextSite.openApiId, 'NEW');
  assert.deepEqual(appNewer.toApp, {});
  const siteNewer = planKeySync({ siteKeys: { openApiId: 'NEW' }, siteSavedAt: '2026-10-06T00:00:00Z', sitePending: false, appKeys: { openApiId: 'OLD' }, appSavedAt: '2026-10-05T00:00:00Z' });
  assert.equal(siteNewer.nextSite.openApiId, 'NEW');
  assert.deepEqual(siteNewer.toApp, { openApiId: 'NEW' });
});

test('앱이 꺼져 있을 때 사이트에서 저장했으면(pending) 시각과 상관없이 사이트 값이 앱으로 간다', () => {
  const plan = planKeySync({ siteKeys: { openApiId: 'MINE' }, siteSavedAt: '', sitePending: true, appKeys: { openApiId: 'APP' }, appSavedAt: '2099-01-01T00:00:00Z' });
  assert.deepEqual(plan.toApp, { openApiId: 'MINE' });
  assert.equal(plan.siteChanged, false);
});

test('앱 저장 시각을 모르면(옛 앱) 앱 값을 기준으로 — 같으면 아무것도 안 한다', () => {
  const unknown = planKeySync({ siteKeys: { openApiId: 'S' }, siteSavedAt: '2026-10-01T00:00:00Z', sitePending: false, appKeys: { openApiId: 'A' }, appSavedAt: '' });
  assert.equal(unknown.nextSite.openApiId, 'A');
  const same = planKeySync({ siteKeys: { openApiId: 'X' }, siteSavedAt: '', sitePending: false, appKeys: { openApiId: 'X' }, appSavedAt: '' });
  assert.equal(same.siteChanged, false);
  assert.equal(same.appChanged, false);
});

test('칸 표는 앱 브리지(api-key-sync.API_KEY_FIELD_MAP)와 같은 8칸', () => {
  assert.deepEqual([...APP_KEY_FIELDS].sort(), ['apihubKey', 'apihubKeyId', 'openApiId', 'openApiSecret', 'searchAdCustomer', 'searchAdLicense', 'searchAdSecret', 'youtubeKey']);
});

test('배선 — 로그인 · 화면 열 때 · 사이트에서 저장할 때 자동으로 맞추고, 맞춤으로 생긴 저장은 다시 맞추지 않는다', () => {
  const page = readFileSync(new URL('../src/pages/LewordPage.tsx', import.meta.url), 'utf8');
  const userKeys = readFileSync(new URL('../src/lib/userKeys.ts', import.meta.url), 'utf8');
  const runner = readFileSync(new URL('../src/lib/appKeySync.ts', import.meta.url), 'utf8');
  assert.ok(page.includes('syncKeysWithApp'));
  assert.ok(page.includes("'leword:keys-saved'"));
  assert.ok(userKeys.includes('pendingToApp'));
  assert.ok(userKeys.includes("source: 'app'") || userKeys.includes("source === 'app'"));
  assert.ok(runner.includes('bridgeSaveApiKeys'));
  assert.ok(runner.includes("source: 'app'"));
});
