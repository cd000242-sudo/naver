// Menu login button <-> LEWORD login state (2026-11-07): the bar must follow login/logout that happen inside the LEWORD page,
// and the LEWORD page must follow logout done from the bar. Runs the real lewordAuth module against a fake browser.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

function loadAuth() {
    const sourceUrl = new URL('../src/lib/lewordAuth.ts', import.meta.url);
    const code = ts.transpileModule(fs.readFileSync(sourceUrl, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const output = { exports: {} };
    new Function('require', 'module', 'exports', code)((id) => {
        if (id.endsWith('siteOps')) return { GAS_URL: 'https://gas.invalid/exec' };
        throw new Error(`unexpected import ${id}`);
    }, output, output.exports);
    return output.exports;
}

/** Minimal browser: window as an EventTarget, an in-memory localStorage and a scripted GAS endpoint. */
function fakeBrowser(gasReplies) {
    const store = new Map();
    const calls = [];
    globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
    globalThis.window = Object.assign(new EventTarget(), { setTimeout: (...args) => setTimeout(...args), clearTimeout: (...args) => clearTimeout(...args) });
    globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        calls.push(body.action);
        return { text: async () => JSON.stringify(gasReplies[body.action] ?? { ok: false }) };
    };
    const events = [];
    window.addEventListener('leword:session-changed', () => events.push(localStorage.getItem('leaderspro.leword.session.v2')));
    return { events, calls, store };
}
const restore = () => { delete globalThis.localStorage; delete globalThis.window; delete globalThis.fetch; };

test('exports the event name the menu and the LEWORD page listen to', () => {
    assert.equal(loadAuth().SESSION_CHANGED_EVENT, 'leword:session-changed');
});

test('a successful login announces itself, with the session already stored', async () => {
    const browser = fakeBrowser({ 'verify-web-login': { ok: true, valid: true, expiresAt: null, licenseType: 'pro', webSessionToken: 'tok' } });
    try {
        const auth = loadAuth();
        const result = await auth.login('leader01', 'pw');
        assert.equal(result.ok, true);
        assert.equal(browser.events.length, 1);
        assert.equal(JSON.parse(browser.events[0]).userId, 'leader01', 'listeners read the new session, not the old one');
        assert.equal(auth.loadSession().userId, 'leader01');
    } finally { restore(); }
});

test('a failed login stays silent', async () => {
    const browser = fakeBrowser({ 'verify-web-login': { ok: false, message: '아이디 또는 비밀번호가 맞지 않습니다.' } });
    try {
        const result = await loadAuth().login('leader01', 'wrong');
        assert.equal(result.ok, false);
        assert.equal(browser.events.length, 0);
    } finally { restore(); }
});

test('logout clears the stored login, tells the server, and announces the empty state', async () => {
    const browser = fakeBrowser({ 'verify-web-login': { ok: true, valid: true, licenseType: 'pro', webSessionToken: 'tok' }, 'web-logout': { ok: true } });
    try {
        const auth = loadAuth();
        await auth.login('leader01', 'pw');
        browser.events.length = 0;
        await auth.logoutWeb(auth.loadSession());
        assert.deepEqual(browser.events, [null], 'one announcement, session already gone');
        assert.equal(auth.loadSession(), null);
        assert.ok(browser.calls.includes('web-logout'));
    } finally { restore(); }
});

test('clearSession announces too (kicked by another browser, expired)', () => {
    const browser = fakeBrowser({});
    try {
        loadAuth().clearSession();
        assert.equal(browser.events.length, 1);
    } finally { restore(); }
});

test('no window (build/SSR) does not break save or clear', () => {
    const auth = loadAuth();
    assert.doesNotThrow(() => auth.clearSession());
});

test('LEWORD page opens its login dialog for ?login=1 (from the menu) and follows session changes made elsewhere', () => {
    const page = read('../src/pages/LewordPage.tsx');
    assert.match(page, /searchParams\.get\('login'\)\s*[!=]==\s*'1'/);
    assert.match(page, /next\.delete\('login'\)/, 'flag is stripped so a reload does not reopen the dialog');
    assert.match(page, /SESSION_CHANGED_EVENT/);
    assert.match(page, /addEventListener\(SESSION_CHANGED_EVENT/);
    assert.match(page, /removeEventListener\(SESSION_CHANGED_EVENT/);
    assert.match(page, /leword:login/, 'existing in-page login event still works');
});

test('menu account code only reads the session through lewordAuth and never stores a password', () => {
    const hook = read('../src/lib/useLewordSession.ts');
    assert.match(hook, /loadSession/);
    assert.match(hook, /SESSION_CHANGED_EVENT/);
    assert.match(hook, /'storage'/, 'other tabs');
    const account = read('../src/components/NavAccount.tsx');
    assert.match(account, /logoutWeb/);
    assert.doesNotMatch(account, /password|userPassword/i);
});
