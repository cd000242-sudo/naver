import test from 'node:test';
import assert from 'node:assert/strict';
import { affiliateTitle, affiliateWritingBrief, sourceUrl } from '../../spa/src/lib/recommendationView.mjs';

test('old unsupported AI titles are not promoted to verified titles', () => {
  const item = { name: '테스트 무선 빗고데기', keyword: '테스트 빗고데기', aiTitle: { text: '숱 많은 머리도 한 번에 펴진다' } };
  const title = affiliateTitle(item);
  assert.equal(title.verified, false);
  assert.doesNotMatch(title.text, /한 번에|펴진다|리뷰가|한 달/);
  assert.match(title.label, /초안/);
});

test('unverified category volume never becomes product demand in a writing brief', () => {
  const brief = affiliateWritingBrief({ name: '맛꾼 장조림', keyword: '맛꾼 장조림', needKeyword: '장조림', needVolume: 7930 }, { status: 'research', reasons: ['구매 의도 미확인'] });
  assert.equal(brief.query, '맛꾼 장조림');
  assert.equal(brief.ready, false);
  assert.match(brief.warning, /추천이 아닙니다/);
  assert.ok(brief.sections.every(x => !/체험|써보니|효과 보장/.test(x)));
});

test('evidence links must be public HTTPS links, never executable or local URLs', () => {
  for (const url of ['javascript:alert(1)', 'file:///secret', 'http://localhost/', 'https://127.0.0.1/x', 'https://10.0.0.1/x', 'https://user:secret@example.com/']) assert.equal(sourceUrl(url), null);
  assert.equal(sourceUrl('https://brand.naver.com/example/products/1'), 'https://brand.naver.com/example/products/1');
});

test('a verified flag alone cannot validate an AI title', () => {
  const title = affiliateTitle({ name: '테스트 제품', aiTitle: { status: 'verified', text: '검증되지 않은 주장', evidenceIds: ['missing'] } });
  assert.equal(title.verified, false);
  assert.doesNotMatch(title.text, /검증되지 않은 주장/);
});
