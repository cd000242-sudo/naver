// 지식인 검색 목록 행은 `<li data-nlog-imp-params=…>` 로 시작한다(2026-10-06 실측).
// `<li>` 로만 자르면 숨은 Q&A 후보가 0건이 되고, 그것을 재료로 쓰는 급상승도 함께 비었다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('숨은 Q&A 수집은 속성이 붙은 <li> 도 행으로 자른다', () => {
  const source = readFileSync(new URL('../kin-golden.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('split(/<li>/)'), false);
  assert.equal(source.includes('split(/<li[\\s>]/)'), true);
  const html = `<ul class="basic1"><li data-nlog-imp-params='{"content_id":"1"}'><a href="x">a</a></li><li data-nlog-imp-params='{"content_id":"2"}'><a href="y">b</a></li></ul>`;
  assert.equal(html.split('<ul class="basic1"')[1].split(/<li[\s>]/).slice(1).length, 2);
});
