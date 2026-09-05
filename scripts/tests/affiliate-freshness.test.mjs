import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignFreshness } from '../../spa/src/lib/affiliateFreshness.mjs';
test('다른 플랫폼의 최신 수집일로 브랜드커넥트의 오래된 데이터를 가리지 않는다', () => {
  const now = Date.parse('2026-09-06T00:00:00Z');
  const status = campaignFreshness({ collectedAt: '2026-09-06T00:00:00Z', sites: {
    brandconnect: { collectedAt: '2026-08-21T00:00:00Z' },
  } }, 'brandconnect', now);
  assert.equal(status.stale, true);
  assert.equal(status.collectedAt, '2026-08-21T00:00:00Z');
});
test('이전 스키마, 로그인 실패, 최초 수집 전을 구분한다', () => {
  const at = '2026-09-06T00:00:00Z';
  assert.equal(campaignFreshness({ collectedAt: at, sites: { toss: {} } }, 'toss', Date.parse(at)).stale, false);
  assert.equal(campaignFreshness({ collectedAt: at, sites: { toss: { status: 'login-required' } } }, 'toss', Date.parse(at)).needsLogin, true);
  assert.equal(campaignFreshness({ collectedAt: at, sites: { toss: { collectedAt: null } } }, 'toss', Date.parse(at)).collectedAt, null);
  assert.equal(campaignFreshness(null, 'brandconnect').stale, true);
});
