// End-to-end check of the free chatbot editor in admin/index.html (Playwright, fully faked network).
// Usage: node scripts/admin-chatbot-editor-e2e.mjs [--out <screenshot dir>]
// GAS is a stateful fake: site-content-save keeps the body, the next site-content returns it. No request leaves the machine.
import fs from 'node:fs';
import path from 'node:path';
import { launchAdmin, openAdmin, overflowReport, GAS_PREFIX, FAKE_TOKEN } from './lib/admin-harness.mjs';
import { decryptLink, encryptLink } from '../spa/src/lib/protectedLink.mjs';

const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const check = (name, ok, detail = '') => {
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
};
// Key order inside objects is not meaningful, so compare canonical (sorted-key) JSON.
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const same = (a, b) => canon(a) === canon(b);
const NEW_LINK = 'https://example.invalid/e2e-private-link-91x';
const NEW_PASSWORD = 'e2e-secret-password-77';
const wait = (page, ms = 300) => page.waitForTimeout(ms);

const own = await encryptLink('https://example.invalid/old-private', 'old-password-1234', { iterations: 100_000 });
const rows = {
  guideCards: [['초보', 'Naver', '쉬운 시작', '/products'], ['대량', 'Orbit', '많이 발행', '/orbit']],
  suiteFlow: [['1', 'LEWORD', '키워드 찾기'], ['2', 'Naver', '발행']],
  comparison: [['가격', '1', '2', '3']],
};
const fixture = {
  chatbots: {
    gemini: { title: '제미나이 저장 제목', url: 'https://example.invalid/gemini' },
    naverFree: { title: '네이버 저장 제목', url: 'https://example.invalid/naver', badge: '추천' },
    homefeedLocked: { title: '잠금 저장 제목', payload: own },
    claude: { skills: [{ title: '스킬 하나', desc: '설명', url: 'https://example.invalid/s1', futureFlag: 1 }, { title: '스킬 둘' }] },
    bots: [{ category: '글쓰기', title: '봇 하나', bestFor: ['초보', '바쁜 분'], url: 'https://example.invalid/b1', accent: '#44d7b6' }, { title: '봇 둘' }],
  },
  productsPage: rows,
  pricing: { plans: { 'free-naver': { features: ['기능 가', '기능 나'] } } },
  products: { naver: { metrics: [['100건', '하루 발행']], bullets: ['불릿 가', '불릿 나'], fit: ['추천 가'] } },
};

let saved = fixture;
const posts = [];
const { browser, context, page, log } = await launchAdmin({ viewport: { width: 1440, height: 1000 } });
await context.route(new RegExp('^' + GAS_PREFIX.replace(/[/.]/g, '\\$&')), async (route) => {
  const req = route.request();
  let action = new URL(req.url()).searchParams.get('action') || '';
  let body = {};
  if (req.method() === 'POST') { try { body = JSON.parse(req.postData() || '{}'); action = body.action || action; } catch { /* ignore */ } }
  const reply = (obj) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
  if (action === 'site-content') return reply({ ok: true, success: true, content: saved });
  if (action === 'site-content-save') { posts.push(body); saved = body.content; return reply({ ok: true, success: true }); }
  return route.fallback();
});
await openAdmin(page);
await wait(page, 1500);
await page.locator('.nav-item[data-tab="editor"]').click();
await wait(page, 900);
const card = page.locator('#chatbot-editor-card');
const shot = (name, locator = card) => (OUT ? locator.screenshot({ path: path.join(OUT, name + '.png') }) : null);
const toast = () => page.locator('#save-toast').innerText();
const save = async () => { await page.locator('[data-site-content-save]:visible').first().click(); await wait(page, 700); };
const patchNow = () => page.evaluate(() => JSON.parse(JSON.stringify(collectEditorPatch())));

// 1. nothing JSON-like is visible, typed or labelled anywhere in the site editor
const jsonish = await page.evaluate(() => [...document.querySelectorAll('#tab-editor textarea, #tab-editor input')]
  .filter((n) => /^\s*[[{]/.test(n.value) || /[[{]\s*"/.test(n.placeholder || ''))
  .map((n) => n.id || n.name));
check('no input/textarea in the site editor holds or suggests JSON', jsonish.length === 0, JSON.stringify(jsonish));
check('no "JSON" wording in the site editor', !/json/i.test(await page.locator('#tab-editor').innerText()));
check('old JSON textareas are gone, list hosts keep the legacy ids', (await page.locator('textarea#edit-cb-bots, textarea#edit-cb-claude-skills').count()) === 0
  && (await page.locator('div#edit-cb-bots, div#edit-cb-claude-skills').count()) === 2);

// 2. saved lists show as rows
await card.scrollIntoViewIfNeeded();
check('legacy lists render as row cards (2 + 2)', (await page.locator('#edit-cb-bots .structured-row-card').count()) === 2 && (await page.locator('#edit-cb-claude-skills .structured-row-card').count()) === 2);
await page.locator('#cb-legacy summary').click();
check('bot row shows saved fields (title, "이런 분께" one per line)', (await page.locator('#edit-cb-bots [data-cb-field="title"]').first().inputValue()) === '봇 하나'
  && (await page.locator('#edit-cb-bots [data-cb-field="bestFor"]').first().inputValue()) === '초보\n바쁜 분');
check('lock status says a changed link is applied', /바꾼 링크가 적용/.test(await page.locator('#cb-locked-status').innerText()));
await shot('01_desktop_card_loaded');

// 3. hidden-source editors round trip exactly (no edit -> identical patch, nothing to save)
const p0 = await patchNow();
check('guide/flow/comparison rows round-trip', same(p0.productsPage.guideCards, rows.guideCards) && same(p0.productsPage.suiteFlow, rows.suiteFlow) && same(p0.productsPage.comparison, rows.comparison));
check('plan features and product metrics/bullets/fit round-trip', same(p0.pricing.plans['free-naver'].features, ['기능 가', '기능 나'])
  && same(p0.products.naver.metrics, [['100건', '하루 발행']]) && same(p0.products.naver.bullets, ['불릿 가', '불릿 나']) && same(p0.products.naver.fit, ['추천 가']));
check('chatbots round-trip keeps unseen fields (futureFlag, bestFor array, accent)', same(p0.chatbots.claude.skills, fixture.chatbots.claude.skills) && same(p0.chatbots.bots, fixture.chatbots.bots) && same(p0.chatbots.homefeedLocked.payload, own));
await save();
check('saving without edits sends nothing', posts.length === 0 && /변경 사항이 없습니다/.test(await toast()));

// 4. edit lists with the row buttons, then save
await page.locator('#edit-cb-gemini-title').fill('제미나이 새 제목');
await page.locator('[data-cb-add="skills"]').click();
await page.locator('#edit-cb-claude-skills [data-cb-index="2"] [data-cb-field="title"]').fill('스킬 셋');
await page.locator('#edit-cb-bots [data-cb-index="1"] [data-cb-action="up"]').click();
await page.locator('#edit-cb-bots [data-cb-index="1"] [data-cb-action="delete"]').click();
check('up then delete leaves the moved row only', (await page.locator('#edit-cb-bots .structured-row-card').count()) === 1 && (await page.locator('#edit-cb-bots [data-cb-field="title"]').inputValue()) === '봇 둘');
await page.locator('#edit-cb-naver-badge').fill('NEW');
await save();
let sent = posts.at(-1);
check('save request carries token and the edited lists in site field names', sent?.adminToken === FAKE_TOKEN
  && same(sent.content.chatbots.claude.skills.map((s) => s.title), ['스킬 하나', '스킬 둘', '스킬 셋'])
  && same(sent.content.chatbots.bots, [{ title: '봇 둘' }]) && sent.content.chatbots.gemini.title === '제미나이 새 제목' && sent.content.chatbots.naverFree.badge === 'NEW');
check('unshown field futureFlag survives the edit', sent?.content.chatbots.claude.skills[0].futureFlag === 1);
check('"저장됨 — 사이트에 반영까지 몇 분" is shown after saving, hidden after the next edit', await page.locator('#cb-saved').isVisible());
await shot('02_desktop_after_save');
await page.locator('#edit-cb-gemini-desc').fill('새 설명');
check('saved note hides again on a new edit', !(await page.locator('#cb-saved').isVisible()));

// 5. validation stops the save and points at the field
posts.length = 0;
await page.locator('[data-cb-add="bots"]').click();
await page.locator('#edit-cb-bots [data-cb-index="1"] [data-cb-field="desc"]').fill('이름 없는 챗봇');
await page.locator('#edit-cb-bots [data-cb-index="1"] [data-cb-field="url"]').fill('javascript:alert(1)');
await page.locator('#edit-cb-naver-url').fill('http://example.invalid/not-https');
await save();
check('invalid input blocks the save', posts.length === 0 && /고쳐 주세요/.test(await toast()));
check('required-name error sits next to that field', /이름/.test(await page.locator('#edit-cb-bots [data-cb-index="1"] [data-cb-error="title"]').innerText()));
check('bad link errors sit next to their fields', /https:\/\//.test(await page.locator('#edit-cb-bots [data-cb-index="1"] [data-cb-error="url"]').innerText())
  && /https:\/\//.test(await page.locator('[data-cb-error-for="edit-cb-naver-url"]').innerText()) && (await page.locator('#edit-cb-naver-url[aria-invalid="true"]').count()) === 1);
await shot('03_desktop_validation_errors');
await page.locator('#edit-cb-bots [data-cb-index="1"] [data-cb-field="title"]').fill('이름 있는 챗봇');
check('typing in a field clears its own error', (await page.locator('#edit-cb-bots [data-cb-index="1"] [data-cb-error="title"]').innerText()) === '');
await page.locator('#edit-cb-bots [data-cb-index="1"] [data-cb-field="url"]').fill('https://example.invalid/fixed');
await page.locator('#edit-cb-naver-url').fill('https://example.invalid/naver-fixed');

// 6. protected tile: seal in the browser, ciphertext only
await page.locator('#cb-seal-toggle').click();
await page.locator('#cb-seal-link').fill(NEW_LINK);
await page.locator('#cb-seal-pw').fill('short');
check('password under 12 characters warns but does not block', /12/.test(await page.locator('#cb-seal-warn').innerText()));
await page.locator('#cb-seal-pw2').fill('different');
await page.locator('#cb-seal-apply').click();
check('mismatching repeat is refused next to its field', /같지 않습니다/.test(await page.locator('#cb-seal-pw2-error').innerText()));
await save();
check('unapplied link/password input blocks the save', posts.length === 0 && /아직 적용되지 않았습니다/.test(await page.locator('#cb-seal-pending').innerText()));
await shot('04_desktop_seal_form_open');
await page.locator('#cb-seal-pw').fill(NEW_PASSWORD);
await page.locator('#cb-seal-pw2').fill(NEW_PASSWORD);
check('typing in the sealing form never counts as an edit of other data', !/12자/.test(await page.locator('#cb-seal-warn').innerText()));
await page.locator('#cb-seal-apply').click();
await page.waitForFunction(() => /새 링크를 암호화했습니다/.test(document.getElementById('cb-locked-status').innerText), null, { timeout: 15000 });
check('plaintext inputs are cleared right after sealing', (await page.locator('#cb-seal-link').inputValue()) === '' && (await page.locator('#cb-seal-pw').inputValue()) === '' && (await page.locator('#cb-seal-pw2').inputValue()) === '');
await save();
sent = posts.at(-1);
const payload = sent?.content.chatbots.homefeedLocked.payload;
check('save request stores a ciphertext object that opens with the new password only', !!payload && payload.ct !== own.ct && (await decryptLink(payload, NEW_PASSWORD)) === NEW_LINK);
const dump = JSON.stringify([sent, await page.evaluate(() => [Object.entries(localStorage), Object.entries(sessionStorage)])]);
check('plaintext link and password appear nowhere in the request or browser storage', !dump.includes('e2e-private-link') && !dump.includes(NEW_PASSWORD));
check('saved lock title/desc fields use the site field names', sent?.content.chatbots.homefeedLocked.title === '잠금 저장 제목');
await shot('05_desktop_after_seal_save');

// 7. reload from the (fake) server: the screen shows exactly what was saved
const before = await patchNow();
await page.locator('[data-site-content-reload]:visible').first().click();
await wait(page, 1200);
const after = await patchNow();
check('reload round trip: collected chatbots identical to what was saved', same(after.chatbots, before.chatbots) && same(after.chatbots.claude.skills.map((s) => s.title), ['스킬 하나', '스킬 둘', '스킬 셋']));
check('reload shows tile values, rows and applied-link status', (await page.locator('#edit-cb-gemini-title').inputValue()) === '제미나이 새 제목'
  && (await page.locator('#edit-cb-bots .structured-row-card').count()) === 2 && /바꾼 링크가 적용/.test(await page.locator('#cb-locked-status').innerText()));

// 8. back to the built-in link
await page.locator('#cb-seal-reset').click();
await save();
check('"기본 링크로 되돌리기" removes the saved ciphertext', posts.at(-1)?.content.chatbots.homefeedLocked.payload === undefined && posts.length >= 2);

// 9. size, overflow, console, network
const small = await page.evaluate(() => [...document.querySelectorAll('#chatbot-editor-card button, #chatbot-editor-card summary, #chatbot-editor-card input:not([type=hidden]), #chatbot-editor-card textarea')]
  .filter((n) => n.offsetParent && n.getBoundingClientRect().height < 44).map((n) => n.id || n.tagName + ':' + (n.dataset.cbAction || n.dataset.cbField || n.textContent.slice(0, 8))));
check('every button, summary and input in the card is 44px+ tall', small.length === 0, JSON.stringify(small));
check('no horizontal scroll on desktop', !(await overflowReport(page)).overflow);
check('no console errors', log.errors.length === 0, JSON.stringify(log.errors.slice(0, 3)));
check('only fake endpoints were hit', log.external.every((u) => u.includes('127.0.0.1:47615')), JSON.stringify(log.external.slice(0, 3)));
await browser.close();

// 10. phone width
const mobile = await launchAdmin({ viewport: { width: 390, height: 844 } });
let mobileSaved = fixture;
await mobile.context.route(new RegExp('^' + GAS_PREFIX.replace(/[/.]/g, '\\$&')), (route) => {
  const action = new URL(route.request().url()).searchParams.get('action');
  if (action === 'site-content') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, success: true, content: mobileSaved }) });
  return route.fallback();
});
await openAdmin(mobile.page);
await wait(mobile.page, 1500);
await mobile.page.locator('#menu-btn').click();
await mobile.page.locator('.nav-item[data-tab="editor"]').click();
await wait(mobile.page, 900);
await mobile.page.locator('#cb-legacy summary').click();
await mobile.page.locator('#cb-seal-toggle').click();
check('[mobile] no horizontal scroll with list rows and seal form open', !(await overflowReport(mobile.page)).overflow, JSON.stringify((await overflowReport(mobile.page)).offenders));
if (OUT) await mobile.page.locator('#chatbot-editor-card').screenshot({ path: path.join(OUT, '06_mobile_card.png') });
check('[mobile] no console errors', mobile.log.errors.length === 0, JSON.stringify(mobile.log.errors.slice(0, 3)));
await mobile.browser.close();

console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
process.exit(failures.length ? 1 : 0);
