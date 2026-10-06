import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../spa/src/' + path, import.meta.url), 'utf8');
test('writing plan cannot promise ranking from exact-title absence', () => {
  const source = read('components/leword/PreemptionPlan.tsx');
  assert.doesNotMatch(source, /제목만 맞추면|그래서 내 글이 올라간다|그 빈자리를 받습니다/);
});
test('platforms share the recommendation gate, not another platform product fallback', () => {
  for (const path of ['AffiliateTab.tsx', 'CoupangBoard.tsx']) assert.match(read('components/leword/' + path), /assessAffiliateRecommendation/);
  assert.match(read('components/leword/AffiliateTab.tsx'), /lane === 'coupang' &&/);
});
test('unverified generated titles cannot be displayed as measured recommendations', () => {
  assert.doesNotMatch(read('components/leword/AffiliateTab.tsx'), /item\.aiTitle\?\.text/);
  assert.doesNotMatch(read('components/leword/CoupangBoard.tsx'), /forgeShoppingTitle/);
});

test('Coupang discovery keeps a separate default and does not masquerade as search-qualified writing', () => {
  const source = read('components/leword/CoupangBoard.tsx');
  assert.match(source, /useState<'discovery' \| 'search'>\('discovery'\)/);
  assert.match(source, /useState<'all' \| 'candidate'>\('all'\)/);
  assert.match(source, /!discoveryMode && <AffiliateTitles/);
  assert.match(source, /discoveryMode && <CoupangDiscoveryBrief/);
  assert.match(source, /<img src=\{row.image \|\|/);
  assert.equal((source.match(/await fetchAffiliateBoard\(\)/g) || []).length, 1);
  assert.match(source, /discovery\.sourceLabel/);
  assert.doesNotMatch(source, /goldboxRank\}위|bestRank.*\}위/);
});

test('제휴 카드 버튼 열은 첫 줄 4번째 칸에 남는다 — 풀폭 브리프가 그 앞에 오면 26px 순위 칸으로 밀린다(2026-10-06)', () => {
  const source = read('components/leword/AffiliateTab.tsx');
  const actions = source.indexOf('<div className="lw-product-actions">');
  const brief = source.indexOf('className="lw-card-brief lw-product-brief"');
  assert.ok(actions > 0 && brief > 0, '버튼 열과 브리프가 모두 있어야 한다');
  assert.ok(brief > actions, '브리프는 버튼 열 뒤에 둔다');
});
