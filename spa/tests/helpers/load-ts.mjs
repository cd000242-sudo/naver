// Test helper: load real .ts/.tsx/.mjs sources from src/ in node:test, plus a fake browser with a scripted server.
// Modules are cached per run so every module sees the same instance of its dependencies.
// The server address is mocked to an invalid host: a test can never reach the live GAS or the live site.
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const FAKE_GAS_URL = 'https://gas.invalid/exec';
const EXTENSIONS = ['', '.tsx', '.ts', '.mjs', '.js'];

export function createLoader(hooks) {
    const cache = new Map();
    const load = (path, base = import.meta.url) => {
        const sourceUrl = new URL(path, base);
        const key = sourceUrl.href;
        if (cache.has(key)) return cache.get(key).exports;
        const text = fs.readFileSync(sourceUrl, 'utf8');
        const code = ts.transpileModule(text, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
        }).outputText;
        const output = { exports: {} };
        cache.set(key, output);
        new Function('require', 'module', 'exports', code)((id) => {
            if (id === 'react' && hooks) return hooks;
            if (id.endsWith('.css')) return {};
            if (id.endsWith('/siteOps') || id === './siteOps') return { GAS_URL: FAKE_GAS_URL, recordPageView() {} };
            if (id.startsWith('.')) {
                for (const extension of EXTENSIONS) {
                    const resolved = new URL(`${id}${extension}`, sourceUrl);
                    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return load(resolved.href);
                }
                throw new Error(`cannot resolve ${id} from ${sourceUrl.pathname}`);
            }
            return require(id);
        }, output, output.exports);
        return output.exports;
    };
    return load;
}

/**
 * Fake browser. `replies` maps an action to a reply object, or to (body) => reply object, or to a thrown Error
 * via () => { throw ... }; `raw` maps an action to a literal response text (e.g. an HTML error page).
 */
export function fakeBrowser(replies = {}, raw = {}) {
    const store = new Map();
    const calls = [];
    const urls = [];
    globalThis.localStorage = {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
    };
    globalThis.sessionStorage = globalThis.localStorage;
    globalThis.window = Object.assign(new EventTarget(), {
        setTimeout: (...args) => setTimeout(...args),
        clearTimeout: (...args) => clearTimeout(...args),
    });
    globalThis.fetch = async (url, init) => {
        urls.push(String(url));
        const body = JSON.parse(init.body);
        calls.push(body);
        if (body.action in raw) return { text: async () => raw[body.action] };
        const reply = replies[body.action];
        const value = typeof reply === 'function' ? reply(body) : reply;
        return { text: async () => JSON.stringify(value ?? { ok: false, code: 'UNSCRIPTED', message: `no reply scripted for ${body.action}` }) };
    };
    const events = [];
    return {
        store, calls, urls, events,
        actions: () => calls.map((call) => call.action),
        listen: (name) => window.addEventListener(name, () => events.push(name)),
        /** Every stored value, joined — lets a test prove a secret is nowhere in the browser. */
        storedText: () => [...store.values()].join('\n'),
    };
}

export function restoreBrowser() {
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
    delete globalThis.window;
    delete globalThis.fetch;
}

export { React };
