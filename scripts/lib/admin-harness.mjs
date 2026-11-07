// Playwright harness for admin/index.html.
// Serves the local admin folder from a virtual origin and answers every Google Apps Script
// call with fixtures, so no real network request is ever made.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildFixtures } from './admin-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
// Same origin as production so CSP 'self' behaves exactly like the live page (still fully intercepted).
export const ORIGIN = 'https://leaderspro.kr';
export const GAS_PREFIX = 'https://script.google.com/macros/s/';
export const CHROME = process.env.ADMIN_E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const FAKE_TOKEN = 'FAKE-E2E-TOKEN';
const { chromium } = createRequire(import.meta.url)('playwright');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.gz': 'application/gzip', '.wasm': 'application/wasm' };

function resolveLocal(pathname, adminDir) {
  const clean = decodeURIComponent(pathname).replace(/\/+$/, '') || '/';
  if (clean === '/admin') return path.join(adminDir, 'index.html');
  if (clean.startsWith('/admin/')) return path.join(adminDir, clean.slice('/admin/'.length));
  if (clean === '/logo.png') return path.join(ROOT, 'payment-page', 'logo.png');
  if (clean.startsWith('/data/')) return path.join(ROOT, 'spa', 'public', clean.slice(1));
  return null;
}

export async function launchAdmin({ adminDir = path.join(ROOT, 'admin'), viewport, colorScheme = 'light', failActions = [], now = new Date() } = {}) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1 });
  const fixtures = buildFixtures(now);
  const log = { gasCalls: [], external: [], errors: [], notFound: [] };
  const failing = new Set(failActions);
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === ORIGIN) {
      const file = resolveLocal(url.pathname, adminDir);
      if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
        return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
      }
      log.notFound.push(url.pathname);
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    }
    if (req.url().startsWith(GAS_PREFIX)) {
      let action = url.searchParams.get('action') || '';
      let body = {};
      if (req.method() === 'POST') {
        try { body = JSON.parse(req.postData() || '{}'); action = body.action || action; } catch { /* keep query action */ }
      }
      log.gasCalls.push({ method: req.method(), action, period: body.period || '' });
      if (failing.has(action)) return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>quota exceeded</html>' });
      return json(route, fixtures.respond(action, body));
    }
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    }
    log.external.push(req.method() + ' ' + req.url());
    return json(route, { ok: false, error: 'blocked by e2e harness' });
  });

  await context.addInitScript(({ key, token }) => {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify({ token, expiresAt: Date.now() + 3600e3 }));
  }, { key: 'leaderspro.admin.session.v1', token: FAKE_TOKEN });

  const page = await context.newPage();
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 404/.test(m.text())) log.errors.push('console: ' + m.text()); });
  return { browser, context, page, log, fixtures };
}

export async function overflowReport(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const offenders = [];
    document.querySelectorAll('body *').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width || b.right <= de.clientWidth + 1 || getComputedStyle(el).position === 'fixed') return;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'hidden' || ox === 'scroll' || ox === 'clip') return;
      }
      if (offenders.length < 5) offenders.push((el.id ? '#' + el.id : el.className || el.tagName) + ' right=' + Math.round(b.right));
    });
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflow: de.scrollWidth > de.clientWidth + 1, offenders };
  });
}

export const openAdmin = (page) => page.goto(ORIGIN + '/admin/', { waitUntil: 'load' });
