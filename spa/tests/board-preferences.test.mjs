import test, { after } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/boardPreferenceSync.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const compiledRoot = fileURLToPath(new URL('../../tmp/', import.meta.url));
fs.mkdirSync(compiledRoot, { recursive: true });
const compiledDir = fs.mkdtempSync(path.join(compiledRoot, 'board-preference-coverage-'));
after(() => { if (process.env.LEWORD_KEEP_COVERAGE !== '1') fs.rmSync(compiledDir, { recursive: true, force: true }); });
const compiledModel = path.join(compiledDir, 'boardPreferenceSync.mjs');
fs.writeFileSync(compiledModel, js);
const syncUrl = pathToFileURL(compiledModel).href;
const { createBoardPreferenceSync } = await import(syncUrl);
const ok = (provider) => ({ status: 'ok', result: { provider } });
function fixture(initial = 'codex', remote = 'claude') {
 let desired = initial;
 const calls = [], states = [];
 let appProvider = remote;
 const transport = { get: async () => { calls.push(['GET']); return ok(appProvider); }, set: async (provider) => { calls.push(['POST', { provider }]); appProvider = provider; return ok(provider); } };
 const sync = createBoardPreferenceSync({ readProvider: () => desired, transport, publish: (state) => states.push(state) });
 return { sync, calls, states, transport, setDesired: (value) => { desired = value; } };
}
test('saved Codex preference syncs with only provider and skips repeat successful writes', async () => {
 const f = fixture(); await f.sync(); await f.sync();
 assert.deepEqual(f.calls, [['GET'], ['POST', { provider: 'codex' }], ['GET']]);
 assert.deepEqual(f.states.at(-1), { status: 'synced', provider: 'codex' });
});
test('unset and invalid browser selections never overwrite app defaults', async () => {
 for (const value of ['', undefined, 'constructor', 'unknown']) { const f = fixture(value); if (value === undefined) f.setDesired(undefined); await f.sync(); assert.deepEqual(f.calls, []); assert.equal(f.states.at(-1).status, 'idle'); }
});
test('matching app selection acknowledges without mutation', async () => {
 const f = fixture('gemini', 'gemini'); await f.sync(); assert.deepEqual(f.calls, [['GET']]); assert.equal(f.states.at(-1).status, 'synced');
});
test('offline, outdated, and rejected preferences remain pending until retry succeeds', async () => {
 for (const status of ['offline', 'outdated', 'error']) {
  const f = fixture(); f.transport.get = async () => ({ status }); await f.sync(); assert.equal(f.states.at(-1).status, status);
  f.transport.get = async () => ok('claude'); await f.sync(); assert.equal(f.states.at(-1).status, 'synced');
 }
});
test('POST rejection and mismatched acknowledgements never claim applied', async () => {
 for (const result of [{ status: 'error', message: 'denied' }, ok('claude')]) {
  const f = fixture(); f.transport.set = async () => result; await f.sync(); assert.equal(f.states.at(-1).status, 'error');
 }
});
test('changing selection during GET prevents stale preference writes', async () => {
 const f = fixture(); let resolve; f.transport.get = () => new Promise((done) => { resolve = done; });
 const pending = f.sync(); f.setDesired('gemini'); f.sync(); f.transport.get = async () => ok('claude'); resolve(ok('claude')); await pending;
 assert.deepEqual(f.calls, [['POST', { provider: 'gemini' }]]); assert.equal(f.states.at(-1).provider, 'gemini');
});
test('changing selection during POST serializes the final preference', async () => {
 const f = fixture(); let resolve; f.transport.set = (provider) => { f.calls.push(['POST', { provider }]); return new Promise((done) => { resolve = done; }); };
 const pending = f.sync(); await new Promise((done) => setImmediate(done)); f.setDesired('grok'); f.sync(); f.transport.set = async (provider) => { f.calls.push(['POST', { provider }]); return ok(provider); }; resolve(ok('codex')); await pending;
 assert.deepEqual(f.calls.filter(([verb]) => verb === 'POST').map(([, body]) => body.provider), ['codex', 'grok']); assert.equal(f.states.at(-1).provider, 'grok');
});
test('thrown transport errors are visible and can be retried', async () => {
 const f = fixture(); f.transport.get = async () => { throw Error('private detail'); }; await f.sync(); assert.deepEqual(f.states.at(-1), { status: 'error', provider: 'codex' });
 f.transport.get = async () => ok('codex'); await f.sync(); assert.equal(f.states.at(-1).status, 'synced');
});
test('returning to an earlier applied choice during another write restores it remotely', async () => {
 const f = fixture('codex', 'claude'); await f.sync(); let resolve;
 f.transport.set = (provider) => { f.calls.push(['POST', { provider }]); return new Promise((done) => { resolve = done; }); };
 f.setDesired('gemini'); const pending = f.sync(); await new Promise((done) => setImmediate(done));
 f.setDesired('codex'); f.sync(); f.transport.get = async () => ok('gemini'); f.transport.set = async (provider) => { f.calls.push(['POST', { provider }]); return ok(provider); }; resolve(ok('gemini')); await pending;
 assert.deepEqual(f.calls.filter(([verb]) => verb === 'POST').map(([, body]) => body.provider), ['codex', 'gemini', 'codex']);
});
test('site startup and reconnect sync only provider; duplicate startup and unrelated saves do not rewrite', async () => {
 const wrapperSource = fs.readFileSync(new URL('../src/lib/boardPreferences.ts', import.meta.url), 'utf8');
 let wrapperJs = ts.transpileModule(wrapperSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
 wrapperJs = wrapperJs.replace("import { bridgeCall } from './bridge';", 'const bridgeCall = (...args) => globalThis.preferenceFixture.call(...args);')
  .replace("import { loadUserKeys } from './userKeys';", 'const loadUserKeys = () => globalThis.preferenceFixture.keys;')
  .replace("from './boardPreferenceSync'", `from '${syncUrl}'`);
 const oldWindow = globalThis.window;
 globalThis.window = new EventTarget();
 const calls = [];
 globalThis.preferenceFixture = { keys: { aiProvider: 'codex', openaiKey: 'must-not-send', searchAdSecret: 'must-not-send' }, call: async (...args) => { calls.push(args); return { status: 'offline' }; } };
 try {
  const compiledWrapper = path.join(compiledDir, 'boardPreferences.mjs');
  fs.writeFileSync(compiledWrapper, wrapperJs);
  const api = await import(pathToFileURL(compiledWrapper).href);
  const states = []; const unsubscribe = api.subscribeBoardPreference((state) => states.push(state.status));
  api.startBoardPreferenceSync(); api.startBoardPreferenceSync(); await api.syncBoardPreference();
  assert.equal(api.boardPreferenceState().status, 'offline');
  let appProvider = 'claude';
  globalThis.preferenceFixture.call = async (...args) => { calls.push(args); if (args[1]) appProvider = JSON.parse(args[1].body).provider; return ok(appProvider); };
  window.dispatchEvent(new Event('leword:bridge-connected')); await api.syncBoardPreference();
  const writes = calls.filter(([, options]) => options);
  assert.equal(writes.length, 1); assert.equal(writes[0][0], '/v1/bridge/boards/preferences');
  assert.equal(writes[0][1].method, 'POST'); assert.deepEqual(JSON.parse(writes[0][1].body), { provider: 'codex' });
  window.dispatchEvent(new Event('leword:keys-saved')); window.dispatchEvent(new Event('focus')); await api.syncBoardPreference();
  assert.equal(calls.filter(([, options]) => options).length, 1);
  assert.equal(api.boardPreferenceState().status, 'synced'); assert.ok(states.includes('offline')); assert.ok(states.includes('synced'));
  for (const status of ['idle', 'syncing', 'synced', 'offline', 'outdated', 'error']) assert.ok(api.boardPreferenceNote({ status, provider: status === 'idle' ? null : 'codex' }).length);
  unsubscribe();
 } finally { globalThis.window = oldWindow; delete globalThis.preferenceFixture; }
});
test('reconnecting revalidates a previously applied choice after app-side changes', async () => {
 const f = fixture(); await f.sync();
 f.calls.length = 0; f.transport.get = async () => { f.calls.push(['GET']); return ok('gemini'); };
 await f.sync();
 assert.deepEqual(f.calls, [['GET'], ['POST', { provider: 'codex' }]]);
});
test('a corrupted or unavailable preference reader reports failure without rejecting background sync', async () => {
 const states = []; let broken = true;
 const sync = createBoardPreferenceSync({ readProvider: () => { if (broken) throw Error('storage unavailable'); return 'codex'; }, transport: { get: async () => ok('codex'), set: async (provider) => ok(provider) }, publish: (state) => states.push(state) });
 await assert.doesNotReject(sync()); assert.deepEqual(states.at(-1), { status: 'error', provider: null });
 broken = false; await sync(); assert.deepEqual(states.at(-1), { status: 'synced', provider: 'codex' });
});
