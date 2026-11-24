import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 2026-11-24: bank approval issued "올인원 1년" for anything whose amount was not in an old table (Naver 1개월, 올인원 영구제 …).
// The order now carries its product id, so the server can check the amount and issue what was really ordered.
const page = fs.readFileSync(new URL('../src/pages/BankOrderPage.tsx', import.meta.url), 'utf8');

test('a cart order is identified the same way the card payment identifies it: ids joined by + and the term', () => {
    assert.match(page, /id: `\$\{picked\.map\(\(product\) => product\.id\)\.join\('\+'\)\}-\$\{term\}`/);
});

test('the bank order sends the product id: the cart id, or the id of the 올인원 option picked on this page', () => {
    assert.match(page, /productId: cartOrder \? cartOrder\.id : selected\.id/);
    assert.match(page, /action: 'bank-order'[^}]*productId/);
});

test('a cart shows one licence per product, each with its own copy button', () => {
    assert.ok(page.includes(String.raw`split(/\s*,\s*/)`), 'codes are split on the comma');
    assert.match(page, /copyLicense\(one\)/);
    assert.doesNotMatch(page, /copyLicense\(code\)/);
});
