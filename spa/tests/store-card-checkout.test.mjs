import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cardCheckoutMode, oneTimePaymentRequest } from '../src/lib/cardCheckout.mjs';

// Owner report 2026-11-24: paying for 올인원 by card answered "올바르지 않은 상품입니다", and instalments were asked for.
// A year, a lifetime or a cart is ONE payment (the Toss window offers instalments); only a single monthly product
// registers the card and renews.
test('only a single monthly product registers the card for renewal', () => {
    assert.equal(cardCheckoutMode('all-monthly'), 'subscription');
    assert.equal(cardCheckoutMode('leword-monthly'), 'subscription');
    assert.equal(cardCheckoutMode('naver-monthly'), 'subscription');
});

test('a year, a lifetime and any cart are paid once', () => {
    assert.equal(cardCheckoutMode('all-yearly'), 'once');
    assert.equal(cardCheckoutMode('all-lifetime'), 'once');
    assert.equal(cardCheckoutMode('naver+orbit-yearly'), 'once');
    assert.equal(cardCheckoutMode('naver+orbit-monthly'), 'once');
});

test('an id that is not a store id keeps the old card registration', () => {
    assert.equal(cardCheckoutMode('all-in-one-monthly'), 'subscription');
    assert.equal(cardCheckoutMode(''), 'subscription');
});

test('the one-time request is a plain card payment: no fixed instalment plan, so the buyer chooses in the Toss window', () => {
    const request = oneTimePaymentRequest({ origin: 'https://leaderspro.kr', productId: 'all-yearly', amount: 550000, orderId: 'LP-1-ABC', orderName: 'All in one 1년', email: 'buyer@example.test' });
    assert.equal(request.method, 'CARD');
    assert.deepEqual(request.amount, { currency: 'KRW', value: 550000 });
    assert.equal(request.orderId, 'LP-1-ABC');
    assert.equal(request.customerEmail, 'buyer@example.test');
    assert.equal(request.card.cardInstallmentPlan, undefined);
    assert.equal(request.card.flowMode, 'DEFAULT');
    const success = new URL(request.successUrl);
    assert.equal(success.pathname, '/success.html');
    assert.equal(success.searchParams.get('productId'), 'all-yearly');
    assert.equal(success.searchParams.get('email'), 'buyer@example.test');
    // Toss appends paymentKey, orderId and amount itself; sending our own copies would shadow them on the success page.
    for (const key of ['amount', 'orderId', 'paymentKey', 'customerKey', 'authKey']) assert.equal(success.searchParams.has(key), false, key);
    assert.equal(request.failUrl, 'https://leaderspro.kr/fail.html');
});

test('a long cart name is cut to the 100 characters Toss allows', () => {
    const request = oneTimePaymentRequest({ origin: 'https://leaderspro.kr', productId: 'naver+orbit-yearly', amount: 770000, orderId: 'LP-2-ABC', orderName: '가'.repeat(150), email: 'a@b.test' });
    assert.equal(request.orderName.length, 100);
});

test('the price page pays once through requestPayment and keeps card registration for subscriptions', () => {
    const page = fs.readFileSync(new URL('../src/pages/PricingPage.tsx', import.meta.url), 'utf8');
    assert.match(page, /cardCheckoutMode\(selected\.id\) === 'once'/);
    assert.match(page, /payment\.requestPayment\(oneTimePaymentRequest\(/);
    assert.match(page, /payment\.requestBillingAuth\(/);
});

test('the store says instalments are possible only where the payment is made once, and never promises renewal for a cart', () => {
    const store = fs.readFileSync(new URL('../src/components/store/ProductStore.tsx', import.meta.url), 'utf8');
    assert.match(store, /할부 가능/);
    assert.match(store, /cardRenews \? ' · 30일마다 자동결제'/);
    assert.match(store, /자동결제 없음/);
});

test('the success page hands the product id to confirm-payment', () => {
    const html = fs.readFileSync(new URL('../../payment-page/success.html', import.meta.url), 'utf8');
    assert.match(html, /action=confirm-payment[\s\S]{0,400}&product=\$\{encodeURIComponent\(params\.productId/);
});
