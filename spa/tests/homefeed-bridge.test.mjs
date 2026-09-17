import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

let imports = 0;
async function client(call, fetcher) {
    globalThis.__homefeedBridgeCall = call;
    globalThis.fetch = fetcher;
    const source = readFileSync(new URL('../src/lib/homefeedBridge.ts', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
        .replace(/import\s*\{[^}]+\}\s*from ['"]\.\/bridge['"];?/, "const BRIDGE_BASE = 'http://localhost'; const bridgeCall = (...args) => globalThis.__homefeedBridgeCall(...args);");
    return import(`data:text/javascript;base64,${Buffer.from(code + `\n//${imports++}`).toString('base64')}`);
}

const originalFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = originalFetch; delete globalThis.__homefeedBridgeCall; });

const payload = () => ({
    schemaVersion: 1, stories: [{ id: 's1' }], sources: [],
    publicDetails: { s1: { story: { id: 's1', evidence: [{ title: '기사', url: 'https://example.com' }] }, editorial: { public: true, state: 'unprepared', brief: null }, timeline: [], assets: {}, readOnly: true } },
});

test('공개 목록에서 들어온 상세는 앱 없이 같은 공개본의 근거를 읽는다', async () => {
    const calls = [];
    const api = await client(async (...args) => { calls.push(args); return { status: 'offline' }; }, async () => ({ ok: true, json: async () => payload() }));
    const list = await api.hfStories();
    assert.equal(list.result.fromPublicFile, true);
    calls.length = 0;
    const detail = await api.hfStory('s1', true);
    assert.equal(detail.status, 'ok');
    assert.equal(detail.result.story.evidence[0].title, '기사');
    assert.equal(detail.result.readOnly, true);
    assert.deepEqual(detail.result.assets.drafts, []);
    assert.equal(calls.length, 0);
});

test('공개 상세가 없는 구버전 파일은 빈 편집 화면 대신 이유를 돌려준다', async () => {
    const api = await client(async () => ({ status: 'offline' }), async () => ({ ok: true, json: async () => ({ stories: [{ id: 's1' }] }) }));
    const detail = await api.hfStory('s1', true);
    assert.equal(detail.status, 'error');
    assert.match(detail.message, /공개.*상세/);
});

test('작성안·선택·원고 호출은 근거 및 선택 버전을 본문에 전달한다', async () => {
    const calls = [];
    const api = await client(async (route, options) => { calls.push({ route, body: JSON.parse(options.body) }); return { status: 'ok', result: {} }; }, () => { throw new Error('unexpected fetch'); });
    await api.hfBrief('s1', 'codex', true, 'e1');
    const input = { id: 's1', briefRevision: 'b1', evidenceRevision: 'e1', expectedRevision: 2, angleId: 'a1', title: '제목', card: { line1: '첫 줄', line2: '' }, imageId: 'src1' };
    await api.hfSelectEditorial(input);
    await api.hfDraft('s1', 'codex', 'b1', 3);
    assert.equal(calls[0].body.evidenceRevision, 'e1');
    assert.match(calls[1].route, /select-editorial$/);
    assert.deepEqual(calls[1].body, input);
    assert.deepEqual(calls[2].body, { id: 's1', provider: 'codex', briefRevision: 'b1', selectionRevision: 3 });
});

test('공개 공유는 별도 명시적 호출이고 선택·원고를 업로드하지 않는다', async () => {
    const calls = [];
    const api = await client(async (route, options) => { calls.push({ route, body: JSON.parse(options.body) }); return { status: 'ok', result: {} }; }, () => { throw new Error('unexpected fetch'); });
    await api.hfShareEditorial('s1', 'b1', true);
    await api.hfShareEditorial('s1', 'b1', false);
    assert.match(calls[0].route, /share-editorial$/);
    assert.deepEqual(calls.map((call) => call.body), [{ id: 's1', briefRevision: 'b1', share: true }, { id: 's1', briefRevision: 'b1', share: false }]);
});
