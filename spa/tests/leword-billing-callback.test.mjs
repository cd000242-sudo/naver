import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../payment-page/success.html', import.meta.url), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function page({ productId = 'leword-monthly', result = { ok: true, code: 'TEST-ONLY', product: 'LEWORD 월 구독', nextPaymentDate: '2026-11-02' }, cache = new Map(), networkError = false } = {}) {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set(['hidden']);
      nodes.set(id, { id, textContent: '', style: {}, classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) }, remove() {} });
    }
    return nodes.get(id);
  }
  const calls = [];
  let emailCalls = 0;
  const context = vm.createContext({
    URLSearchParams, encodeURIComponent, console, setTimeout, clearTimeout,
    window: { location: { search: '?' + new URLSearchParams({ customerKey: 'test-customer', authKey: 'test-auth', productId, amount: '19900', email: 'mock@example.test' }) } },
    localStorage: { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value) },
    document: { title: '', getElementById: node, querySelector: node, createElement: () => ({ remove() {} }), addEventListener() {}, head: { appendChild(script) {
      calls.push(new URL(script.src));
      queueMicrotask(() => networkError ? script.onerror() : context.window[new URL(script.src).searchParams.get('callback')](result));
    } } },
  });
  vm.runInContext(source, context);
  context.autoSendEmail = () => { emailCalls++; };
  return { run: () => context.main(), calls, node, cache, emailCalls: () => emailCalls };
}

test('LEWORD monthly callback charges immediately via register-billing with canonical product', async () => {
  const p = page();
  await p.run();
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].searchParams.get('action'), 'register-billing');
  assert.equal(p.calls[0].searchParams.get('amount'), '19900');
  assert.equal(p.calls[0].searchParams.get('product'), 'leword-monthly');
  assert.equal(p.node('code-section').classList.contains('hidden'), false);
  assert.match(p.node('success-headline').textContent, /LEWORD/);
  assert.match(p.node('subscription-notice').textContent, /19,900/);
  assert.match(p.node('subscription-notice').textContent, /30일/);
  assert.match(p.node('subscription-notice').textContent, /2026-11-02/);
  assert.doesNotMatch(p.node('success-subtitle').textContent + p.node('license-usage').textContent + p.node('license-code-label').textContent, /올인원|Better Life|Orbit/);
  assert.equal(p.node('trial-notice').classList.contains('hidden'), true);
  assert.equal(p.emailCalls(), 0, 'server handles receipt; browser does not automatically resend');
});

test('successful reload uses distinct subscription cache without extra payment or email calls', async () => {
  const cache = new Map([['lp_trial_test-auth', JSON.stringify({ ok: true, code: 'OLD-TRIAL' })]]);
  const first = page({ cache });
  await first.run();
  assert.equal(first.calls.length, 1, 'trial cache must not bypass subscription charge');
  assert.ok(cache.has('lp_subscription_test-auth'));
  const second = page({ cache });
  await second.run();
  assert.equal(second.calls.length, 0);
  assert.equal(second.node('license-code').textContent, 'TEST-ONLY');
  assert.match(second.node('subscription-notice').textContent, /2026-11-02/);
  assert.equal(second.emailCalls(), 0);
});

test('other products preserve trial flow and trial cache', async () => {
  const p = page({ productId: 'allinone-monthly', result: { ok: true, code: 'TRIAL-ONLY', product: '올인원', trialEndDate: '2026-10-10' } });
  await p.run();
  assert.equal(p.calls[0].searchParams.get('action'), 'start-trial');
  assert.equal(p.node('trial-notice').classList.contains('hidden'), false);
  assert.equal(p.node('trial-charge-date').textContent, '2026-10-10');
  assert.ok(p.cache.has('lp_trial_test-auth'));
});

for (const failure of [{ result: { ok: false, error: '결제 거절' } }, { networkError: true }, { result: { ok: true } }]) {
  test(`failed subscription never renders or caches success: ${JSON.stringify(failure)}`, async () => {
    const p = page(failure);
    await p.run();
    assert.equal(p.node('code-section').classList.contains('hidden'), true);
    assert.equal(p.node('error-section').classList.contains('hidden'), false);
    assert.equal(p.cache.has('lp_subscription_test-auth'), false);
    assert.equal(p.emailCalls(), 0);
  });
}

test('failed cached response cannot be reused as subscription success', async () => {
  const cache = new Map([['lp_subscription_test-auth', JSON.stringify({ ok: false, code: 'NOT-SUCCESS' })]]);
  const p = page({ cache });
  await p.run();
  assert.equal(p.calls.length, 1);
  assert.equal(p.node('license-code').textContent, 'TEST-ONLY');
});

test('monthly notice does not invent a next charge date when server date is missing', async () => {
  const p = page({ result: { ok: true, code: 'TEST-ONLY', product: 'LEWORD 월 구독', nextPaymentDate: 'invalid' } });
  await p.run();
  assert.match(p.node('subscription-notice').textContent, /주문 조회에서 확인/);
  assert.doesNotMatch(p.node('subscription-notice').textContent, /Invalid Date/);
  assert.equal(p.node('email-sent-notice').classList.contains('hidden'), true);
});

test('server-confirmed receipt is displayed without requesting an extra email', async () => {
  const p = page({ result: { ok: true, code: 'TEST-ONLY', product: 'LEWORD 월 구독', nextPaymentDate: '2026-11-01T16:00:00Z', emailSent: true } });
  await p.run();
  assert.match(p.node('subscription-notice').textContent, /2026-11-02/);
  assert.equal(p.node('email-sent-notice').classList.contains('hidden'), false);
  assert.equal(p.node('email-backup-section').classList.contains('hidden'), true);
  assert.match(p.node('email-sent-address').textContent, /LEWORD/);
  assert.equal(p.calls.length, 1);
  assert.equal(p.emailCalls(), 0);
});
