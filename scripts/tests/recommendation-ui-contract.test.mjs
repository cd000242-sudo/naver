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
