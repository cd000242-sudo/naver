// [2026-11-03] The site cron measures with the developer-center key first and the API HUB key second, and moves to the
// next key on 429 too: the owner's app uses HUB first, and both used to drain the same HUB daily quota.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NAVER_CLIENT_ID = 'legacy-id';
process.env.NAVER_CLIENT_SECRET = 'legacy-secret';
process.env.NAVER_APIHUB_KEY_ID = 'hub-id';
process.env.NAVER_APIHUB_KEY = 'hub-secret';

const calls = [];
let replies = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  const reply = replies.shift() ?? { status: 200, body: { total: 0 } };
  return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
};

const { fetchDocumentCount } = await import('../lib/naver-measure.mjs');

test('developer-center key first, API HUB second', async () => {
  calls.length = 0;
  replies = [{ status: 200, body: { total: 321 } }];
  assert.equal(await fetchDocumentCount('가을 단풍'), 321);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/openapi\.naver\.com\/v1\/search\/blog\.json\?/);
});

test('a 429 on the first key moves to the API HUB key', async () => {
  calls.length = 0;
  replies = [{ status: 429, body: {} }, { status: 200, body: { total: 77 } }];
  assert.equal(await fetchDocumentCount('가을 단풍'), 77);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /^https:\/\/naverapihub\.apigw\.ntruss\.com\/search\/v1\/blog\?/);
});

test('both keys at 429 give up after two calls with null (no fabricated number)', async () => {
  calls.length = 0;
  replies = [{ status: 429, body: {} }, { status: 429, body: {} }];
  assert.equal(await fetchDocumentCount('가을 단풍'), null);
  assert.equal(calls.length, 2);
});
