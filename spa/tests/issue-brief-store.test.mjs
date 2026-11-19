// [2026-11-17 사장님] 실시간 검색어 브리프: "무료한도가 왜 걸리나요 충분할텐데" — 받은 브리프는 15분 동안 다시 묻지 않고, 한도 거절은 숨기지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRIEF_KEY, BRIEF_MAX, BRIEF_TTL_MS, QUOTA_FALLBACK, quotaNotice, readBriefs, rememberBrief } from '../src/lib/issueBriefStore.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const box = (data = {}) => ({ data, getItem(k) { return k in this.data ? this.data[k] : null; }, setItem(k, v) { this.data[k] = String(v); } });
const brief = (text) => ({ facts: [{ text, sourceIndex: 0 }], links: [], images: [], keywords: [] });

test('받은 브리프는 15분 동안 다시 쓴다 — 새로고침해도 같은 키워드로 한도를 또 쓰지 않는다', () => {
  const storage = box();
  assert.equal(rememberBrief(storage, 'AI 부정행위 차단', brief('사실 하나'), 1_000), true);
  assert.deepEqual(readBriefs(storage, 1_000 + BRIEF_TTL_MS - 1), { 'AI 부정행위 차단': brief('사실 하나') });
  assert.deepEqual(readBriefs(storage, 1_000 + BRIEF_TTL_MS), {}, '15분이 지나면 다시 받는다(최신이 관건)');
});

test('사실 문장이 없는 브리프·빈 키워드는 기억하지 않는다 · 가장 오래된 것부터 버린다 · 고장난 저장소는 빈 것으로 읽는다', () => {
  const storage = box();
  assert.equal(rememberBrief(storage, '빈 것', { facts: [], links: [], images: [], keywords: [] }, 1), false);
  assert.equal(rememberBrief(storage, '  ', brief('x'), 1), false);
  for (let i = 0; i < BRIEF_MAX + 5; i += 1) rememberBrief(storage, `키워드 ${i}`, brief(`사실 ${i}`), 100 + i);
  const kept = readBriefs(storage, 200);
  assert.equal(Object.keys(kept).length, BRIEF_MAX);
  assert.equal('키워드 0' in kept, false);
  assert.equal(`키워드 ${BRIEF_MAX + 4}` in kept, true);
  assert.deepEqual(readBriefs(box({ [BRIEF_KEY]: '{broken' }), 1), {});
  assert.deepEqual(readBriefs({ getItem() { throw new Error('blocked'); } }, 1), {});
  assert.equal(rememberBrief({ getItem: () => null, setItem() { throw new Error('full'); } }, '가', brief('x'), 1), false);
  assert.deepEqual(readBriefs(null, 1), {});
});

test('한도 거절은 서버가 준 문장 그대로 알린다 — 다른 실패·성공은 빈 글자', () => {
  const server = '라이선스 없이 쓸 수 있는 오늘 분량(50회)을 다 썼습니다. 라이선스를 등록하거나 내 API 키 탭에 네이버 키를 넣으면 계속 쓸 수 있습니다.';
  assert.equal(quotaNotice({ ok: false, error: 'quota', message: server }), server);
  assert.equal(quotaNotice({ ok: false, error: 'quota', message: '' }), QUOTA_FALLBACK);
  assert.equal(quotaNotice({ ok: false, error: 'network', message: '연결에 실패했습니다.' }), '');
  assert.equal(quotaNotice({ ok: true }), '');
  assert.equal(quotaNotice(null), '');
});

test('홈 화면 연결: 받은 브리프를 기억하고, 한도 거절 문장을 브리프 칸에 보여 준다', () => {
  const page = fs.readFileSync(path.join(here, '../src/pages/IndexPage.tsx'), 'utf8');
  assert.match(page, /readBriefs\(/, '처음 값은 기억해 둔 브리프');
  assert.match(page, /rememberBrief\(/, '받으면 기억');
  assert.match(page, /quotaNotice\(/, '거절이면 알림');
  assert.match(page, /source-insight-quota/, '브리프 칸에 한도 안내 자리');
});
