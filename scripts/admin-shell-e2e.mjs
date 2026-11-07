// End-to-end check of the admin shell (admin/index.html) with Playwright and a fully faked network.
// Usage: node scripts/admin-shell-e2e.mjs [--out <screenshot dir>]
// No request ever leaves the machine: local files come from a virtual origin, every GAS call is answered by fixtures.
import fs from 'node:fs';
import path from 'node:path';
import { launchAdmin, openAdmin, overflowReport, FAKE_TOKEN } from './lib/admin-harness.mjs';

const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const NAV = [
  ['dashboard', '대시보드'], ['notices', '홈 운영'], ['editor', '사이트 편집'], ['reviews', '후기 승인'],
  ['income', '수익 인증 승인'], ['tips', '활용 팁 승인'], ['analytics', '매출·방문 분석'], ['orders', '주문 내역'],
  ['bank', '계좌이체 승인'], ['licenses', '라이선스 발급·회수'], ['trial', '체험 사용자'], ['leads', '이메일 모음'],
  ['leword-settings', 'LEWORD 관리자 설정'],
];
const failures = [];
const check = (name, ok, detail = '') => {
  if (!ok) failures.push(`${name} ${detail}`.trim());
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
};
const shot = (page, name) => (OUT ? page.screenshot({ path: path.join(OUT, name + '.png') }) : null);
const text = (page, sel) => page.locator(sel).first().innerText();
const settle = (page, ms = 700) => page.waitForTimeout(ms);

async function waitDashboard(page) {
  await page.waitForFunction(() => document.querySelectorAll('#dash-kpis .kpi:not(.is-failed) b').length > 0
    && !/…/.test(document.getElementById('dash-kpis').innerText), null, { timeout: 15000 });
}

async function desktopRun(colorScheme) {
  const tag = colorScheme === 'dark' ? 'desktop_dark' : 'desktop';
  const { browser, page, log } = await launchAdmin({ viewport: { width: 1440, height: 900 }, colorScheme });
  await openAdmin(page);
  await waitDashboard(page);
  await settle(page, 400);
  check(`[${tag}] theme follows the system`, (await page.getAttribute('html', 'data-theme')) === colorScheme);

  if (colorScheme === 'light') {
    const kpi = await page.locator('#dash-kpis .kpi').allInnerTexts();
    check('KPI visitors / trials / orders / revenue', /312명/.test(kpi[0]) && /2명/.test(kpi[1]) && /2건/.test(kpi[2]) && /₩379,000/.test(kpi[3]), JSON.stringify(kpi));
    const tiles = Object.fromEntries(await page.$$eval('.todo-tile', (els) => els.map((e) => [e.dataset.go, e.querySelector('em').textContent])));
    check('todo tiles', tiles.bank === '2건' && tiles.reviews === '2건' && tiles.income === '3건' && tiles.tips === '1건' && tiles.licenses === '1건', JSON.stringify(tiles));
    check('7 day bars', (await page.locator('#dash-bars .bar-col').count()) === 7);
    check('recent orders list', (await page.locator('#dash-recent li').count()) === 5);
    check('order text is escaped', (await page.locator('#dash-recent img').count()) === 0 && /<img src=x/.test(await text(page, '#dash-recent')));
    const badges = Object.fromEntries(await page.$$eval('[data-badge]:not([hidden])', (els) => els.map((e) => [e.dataset.badge, e.textContent])));
    check('menu badges', badges.bank === '2' && badges.reviews === '2' && badges.income === '3' && badges.tips === '1', JSON.stringify(badges));
    check('sidebar license count', /^\d+\/\d+$/.test((await text(page, '#sidebar-license-count')).trim()));
    check('no horizontal scroll (dashboard)', !(await overflowReport(page)).overflow);
    await page.locator('[data-go="bank"]').first().click();
    check('tile opens its screen', await page.locator('#tab-bank.active').count() === 1);
    await page.locator('.nav-item[data-tab="dashboard"]').click();
    await waitDashboard(page);
  }
  await shot(page, `${tag}_dashboard`);

  for (const [tab, label] of NAV) {
    await page.locator(`.nav-item[data-tab="${tab}"]`).click();
    await settle(page, 600);
    const active = await page.locator(`#tab-${tab}.active`).count();
    const crumb = await text(page, '#crumb');
    const ov = await overflowReport(page);
    const current = await page.locator(`.nav-item[data-tab="${tab}"][aria-current="page"]`).count();
    check(`[${tag}] menu "${label}" opens its screen`, active === 1 && crumb === label && current === 1 && !ov.overflow, `active=${active} crumb=${crumb} ${JSON.stringify(ov.offenders)}`);
    if (tab !== 'dashboard') await shot(page, `${tag}_${tab}`);
    if (colorScheme === 'light') await screenSpecifics(page, tab);
  }
  check(`[${tag}] no console errors`, log.errors.length === 0, JSON.stringify(log.errors.slice(0, 3)));
  check(`[${tag}] only fake endpoints were hit`, log.external.every((u) => u.includes('127.0.0.1:47615')), JSON.stringify(log.external.slice(0, 3)));
  if (colorScheme === 'light') await themeAndSecrets(page);
  await browser.close();
  return log;
}

async function screenSpecifics(page, tab) {
  if (tab === 'leads') {
    check('leads: 3 rows and count', (await page.locator('#leads-table-body tbody tr').count()) === 3 && /3건/.test(await text(page, '#leads-count')));
    check('leads: markup in data stays text', (await page.evaluate(() => window.__xss)) === undefined && /<script>window\.__xss/.test(await text(page, '#leads-table-body')));
  }
  if (tab === 'licenses') {
    check('licenses: codes listed', (await page.locator('#codes-table-body tbody tr').count()) === 6);
    check('licenses: passwords stay masked', !/pw-fake/.test(await text(page, '#codes-table-body')));
    await page.locator('#tab-licenses button:has-text("새 코드 발급")').click();
    check('licenses: issue dialog opens', await page.locator('#issue-modal.active').count() === 1);
    await page.evaluate(() => closeIssueModal());
  }
  if (tab === 'orders') {
    check('orders: loads from existing list action', (await page.locator('#orders-table-body tbody tr').count()) >= 1);
    check('orders: passwords stay masked', !/pw-fake/.test(await text(page, '#orders-table-body')));
  }
  if (tab === 'bank') check('bank: table loads', (await text(page, '#bank-stat-pending')).trim() === '2');
  if (tab === 'trial') {
    await page.locator('#tab-trial .chip:has-text("이메일 모음")').click();
    await settle(page, 400);
    check('trial: email export shortcut', await page.locator('#trial-export-emails-box.focused').count() === 1);
  }
  if (tab === 'editor') {
    check('editor: seven chips', (await page.locator('.editor-subtab').count()) === 7);
    await page.locator('#editor-tab-pricing').click();
    check('editor: chip switches panel', await page.locator('#editor-sub-pricing.active').count() === 1);
  }
}

async function themeAndSecrets(page) {
  await page.locator('#theme-btn').click();
  const stored = await page.evaluate(() => localStorage.getItem('lp_admin_theme'));
  check('theme toggle flips and remembers', (await page.getAttribute('html', 'data-theme')) === 'dark' && stored === 'dark');
  const dump = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), document.body.innerText]));
  check('no token on screen or in localStorage', !dump.includes(FAKE_TOKEN));
}

async function failureIsolation() {
  const { browser, page } = await launchAdmin({ viewport: { width: 1440, height: 900 }, failActions: ['bank-list'] });
  await openAdmin(page);
  await page.waitForFunction(() => /불러오지 못했습니다/.test(document.getElementById('dash-todo')?.innerText || ''), null, { timeout: 20000 });
  const tiles = Object.fromEntries(await page.$$eval('.todo-tile', (els) => els.map((e) => [e.dataset.go, e.innerText])));
  check('failed source marks only its own tile', /불러오지 못했습니다/.test(tiles.bank) && /2건/.test(tiles.reviews) && /3건/.test(tiles.income));
  check('other cards still render', /312명/.test(await text(page, '#dash-kpis')));
  await shot(page, 'desktop_dashboard_partial_failure');
  await browser.close();
}

async function mobileRun() {
  const { browser, page, log } = await launchAdmin({ viewport: { width: 390, height: 844 } });
  await openAdmin(page);
  await waitDashboard(page);
  check('[mobile] hamburger visible, menu closed', (await page.locator('#menu-btn').isVisible()) && (await page.locator('body.nav-open').count()) === 0);
  await shot(page, 'mobile_dashboard');
  await page.locator('#menu-btn').click();
  await settle(page, 400);
  const heights = await page.$$eval('.nav-item', (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check('[mobile] menu opens, every item is 44px+ tall', (await page.locator('body.nav-open').count()) === 1 && heights.every((h) => h >= 44), heights.join(','));
  await shot(page, 'mobile_menu_open');
  for (const [tab, label] of NAV) {
    if ((await page.locator('body.nav-open').count()) === 0) await page.locator('#menu-btn').click();
    await page.locator(`.nav-item[data-tab="${tab}"]`).click();
    await settle(page, 600);
    const ov = await overflowReport(page);
    const closed = (await page.locator('body.nav-open').count()) === 0;
    check(`[mobile] "${label}" opens, menu closes, no horizontal scroll`, (await page.locator(`#tab-${tab}.active`).count()) === 1 && closed && !ov.overflow, `${ov.scrollWidth}>${ov.clientWidth} ${JSON.stringify(ov.offenders)}`);
    await shot(page, `mobile_${tab}`);
  }
  const small = await page.evaluate(() => [...document.querySelectorAll('#tab-leads .btn, .topbar .btn, .topbar .menu-btn')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).length);
  check('[mobile] buttons are 44px+', small === 0, String(small));
  check('[mobile] no console errors', log.errors.length === 0, JSON.stringify(log.errors.slice(0, 3)));
  await browser.close();
}

await desktopRun('light');
await desktopRun('dark');
await failureIsolation();
await mobileRun();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
process.exit(failures.length ? 1 : 0);
