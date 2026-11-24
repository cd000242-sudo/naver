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

// ── the success page after a one-time payment ──
import vm from 'node:vm';

function successPage({ productId, result }) {
    const html = fs.readFileSync(new URL('../../payment-page/success.html', import.meta.url), 'utf8');
    const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const nodes = new Map();
    const node = (id) => {
        if (!nodes.has(id)) {
            const classes = new Set(['hidden']);
            nodes.set(id, { id, textContent: '', innerHTML: '', style: {}, href: '', classList: { add: (n) => classes.add(n), remove: (n) => classes.delete(n), contains: (n) => classes.has(n) }, remove() {} });
        }
        return nodes.get(id);
    };
    const calls = [];
    let emailCalls = 0;
    const context = vm.createContext({
        URLSearchParams, encodeURIComponent, console, setTimeout, clearTimeout,
        window: { location: { search: '?' + new URLSearchParams({ paymentKey: 'pk_test', orderId: 'LP-1-ABC', amount: '770000', productId, email: 'mock@example.test' }) } },
        localStorage: { getItem: () => null, setItem: () => undefined },
        document: { title: '', getElementById: node, querySelector: node, createElement: () => ({ remove() {} }), addEventListener() {}, head: { appendChild(script) {
            calls.push(new URL(script.src));
            queueMicrotask(() => context.window[new URL(script.src).searchParams.get('callback')](result));
        } } },
    });
    vm.runInContext(source, context);
    context.autoSendEmail = () => { emailCalls++; };
    return { run: () => context.main(), calls, node, emailCalls: () => emailCalls, copied: () => vm.runInContext('currentCode', context) };
}

test('a cart shows one licence per product on its own line, copies them apart, and does not mail the joined string', async () => {
    const p = successPage({ productId: 'naver+orbit-yearly', result: { ok: true, code: 'LP-AAAA-1111, LP-BBBB-2222', product: 'Leaders Pro Better Life Naver · Leadernam Orbit 1년' } });
    await p.run();
    assert.equal(p.calls[0].searchParams.get('action'), 'confirm-payment');
    assert.equal(p.calls[0].searchParams.get('product'), 'naver+orbit-yearly');
    assert.equal(p.node('license-code').textContent, 'Better Life Naver  LP-AAAA-1111\nLeadernam Orbit  LP-BBBB-2222');
    assert.equal(p.node('license-code').style.whiteSpace, 'pre-line');
    assert.equal(p.copied(), 'LP-AAAA-1111\nLP-BBBB-2222');
    assert.match(p.node('license-code-label').textContent, /제품마다/);
    assert.match(p.node('license-usage').textContent, /제품마다/);
    assert.doesNotMatch(p.node('license-usage').textContent, /올인원 코드/);
    assert.equal(p.emailCalls(), 0);
});

test('a single product still shows its one code as before', async () => {
    const p = successPage({ productId: 'all-yearly', result: { ok: true, code: 'LP-ONLY-0001', product: 'Leaders Pro 올인원 1년' } });
    await p.run();
    assert.equal(p.node('license-code').textContent, 'LP-ONLY-0001');
    assert.equal(p.copied(), 'LP-ONLY-0001');
    assert.equal(p.emailCalls(), 1);
});
