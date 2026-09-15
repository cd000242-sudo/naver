/**
 * 사이트 AI 는 LEWORD 앱 브리지 전용 — 회귀 테스트(사장님 결정 2026-09-16 "브리지 전용으로 정리").
 *
 * 지키는 것:
 *   1. 사이트 코드에 클로드 구독 토큰을 받거나(앱 claude-credentials) 발급받거나(공개 OAuth PKCE)
 *      워커로 보내는(claude-oauth-exchange · claude-token-check · claude-usage) 흔적이 다시 생기지 않는다.
 *      옛 칸 이름은 저장소 정리 코드(lib/legacyClaudeState.mjs)의 칸 목록 한 줄에만 있다.
 *   2. 사용량 칸은 앱이 센 사용량(agent-usage)을, 유튜브 주제 판정은 gap-topics 브리지를 부른다.
 *   3. 사이트는 워커의 AI 액션을 부르지 않는다 — 글 진단 체크리스트는 aiVia 'app' 으로만 받는다.
 *   4. 정리 코드가 실제로 저장소와 동기화 묶음에서 옛 토큰 칸을 뺀다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasLegacyClaudeFields, purgeLegacyClaudeStorage, stripLegacyClaudeFields } from '../src/lib/legacyClaudeState.mjs';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (path) => readFileSync(join(SRC, path), 'utf8');

/** spa/src 아래 코드 파일 전부 — 경로는 src 기준, 구분자는 / 로 맞춘다. */
function sourceFiles(dir = SRC) {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return sourceFiles(full);
        return /\.(ts|tsx|mts|mjs|js|jsx)$/.test(name) ? [relative(SRC, full).split(sep).join('/')] : [];
    });
}

const LEGACY_FIELD_NAMES = ['claudeToken', 'claudeRefresh', 'claudeExpiresAt'];
const FORBIDDEN_EVERYWHERE = ['claude-credentials', 'oauth/authorize', 'code_challenge', 'claude-oauth-exchange', 'claude-token-check', 'claude-usage'];
const CLEANUP_FILE = 'lib/legacyClaudeState.mjs';

test('사이트 코드에 클로드 토큰 수신·발급·워커 전송 흔적이 없다', () => {
    const offenders = [];
    for (const path of sourceFiles()) {
        const text = read(path);
        for (const needle of FORBIDDEN_EVERYWHERE) {
            if (text.includes(needle)) offenders.push(`${path}: ${needle}`);
        }
    }
    assert.deepEqual(offenders, []);
});

test('옛 클로드 토큰 칸 이름은 정리 코드의 칸 목록 한 줄에만 있다', () => {
    const holders = sourceFiles().filter((path) => LEGACY_FIELD_NAMES.some((name) => read(path).includes(name)));
    assert.deepEqual(holders, [CLEANUP_FILE]);
    const lines = read(CLEANUP_FILE).split(/\r?\n/).filter((line) => LEGACY_FIELD_NAMES.some((name) => line.includes(name)));
    assert.equal(lines.length, 1, lines.join('\n'));
    for (const name of LEGACY_FIELD_NAMES) assert.ok(lines[0].includes(`'${name}'`), name);
});

test('사용량 칸은 앱이 센 사용량(agent-usage 브리지)을 부르고 워커를 부르지 않는다', () => {
    assert.match(read('lib/bridge.ts'), /'\/v1\/bridge\/agent-usage'/);
    const keysTab = read('components/leword/KeysTab.tsx');
    assert.match(keysTab, /bridgeAgentUsage\(\)/);
    assert.match(keysTab, /이 PC 의 LEWORD 앱이 센 호출 수/);
    assert.doesNotMatch(keysTab, /lib\/keywordApi'/);
});

test('유튜브 주제 판정은 gap-topics 브리지를 부르고 워커를 부르지 않는다', () => {
    assert.match(read('lib/bridge.ts'), /'\/v1\/bridge\/gap-topics'/);
    const youtube = read('components/leword/YoutubeTab.tsx');
    assert.match(youtube, /bridgeGapTopics\(/);
    assert.doesNotMatch(youtube, /fetchGapTopics|fetchKeywordPostIdeas/);
});

test('사이트는 워커의 AI 액션을 부르지 않고, 글 진단 체크리스트는 aiVia app 으로만 받는다', () => {
    const api = read('lib/keywordApi.ts');
    for (const action of ['kin-answer', 'kin-post-ideas', 'keyword-post-ideas', 'gap-topics', 'mindmap-ai', 'radar-analyze', 'radar-evaluate']) {
        assert.doesNotMatch(api, new RegExp(`'${action}'`), action);
    }
    assert.match(api, /'post-audit-analyze', \{\s*aiVia: 'app',/);
    // 워커로 가는 키 묶음은 요청을 만드는 곳에서 한 번 더 옛 토큰 칸을 뺀다.
    assert.match(api, /keys: stripLegacyClaudeFields\(loadUserKeys\(\)\)/);
});

test('AI 화면은 워커 대신 앱 브리지를 부른다', () => {
    const expectations = {
        'components/leword/KinGoldenTab.tsx': [/bridgeKinAnswer\(/, /bridgePostIdeas\(\{\s*kind: 'kin'/],
        'components/leword/RadarTab.tsx': [/bridgeKinAnswer\(/, /bridgeRadarAnalyze\(/, /bridgeRadarEvaluate\(/],
        'components/leword/AnalyzeTab.tsx': [/bridgePostIdeas\(/],
        'components/leword/RankTab.tsx': [/bridgePostAnalyze\(/, /fetchPostChecklist\(/],
        'components/leword/useMindmap.ts': [/bridgeMindmap\(keyword\)/],
    };
    for (const [path, patterns] of Object.entries(expectations)) {
        const text = read(path);
        for (const pattern of patterns) assert.match(text, pattern, `${path}: ${pattern}`);
    }
});

test('키 동기화는 옛 토큰 칸을 빼고 올리며, 받은 묶음에 있으면 버리고 다시 올린다', () => {
    const sync = read('lib/keySync.ts');
    assert.match(sync, /const clean = stripLegacyClaudeFields\(keys\)/);
    assert.match(sync, /const legacy = hasLegacyClaudeFields\(received\)/);
    assert.equal((sync.match(/if \(legacy\) await pushUserKeys\(loadUserKeys\(\)\)/g) || []).length, 2);
    assert.match(read('main.tsx'), /if \(purgeLegacyClaudeState\(\)\)/);
});

function fakeStorage(initial) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: (key) => { map.delete(key); },
    };
}

test('저장소 정리는 옛 토큰 칸과 정책 표식만 지우고 다른 값은 그대로 둔다', () => {
    const STORE = 'leaderspro.keyword.userKeys.v1';
    const storage = fakeStorage({
        [STORE]: JSON.stringify({ openApiId: 'id', apihubKey: 'hub', aiProvider: 'gemini', claudeToken: 'x', claudeRefresh: 'y', claudeExpiresAt: '1' }),
        'leaderspro.keyword.claudePolicyBlocked.v1': '2026-09-07T00:00:00.000Z',
        'lw-picks-topic': '여행',
    });
    assert.equal(purgeLegacyClaudeStorage(storage, STORE), true);
    assert.deepEqual(JSON.parse(storage.getItem(STORE)), { openApiId: 'id', apihubKey: 'hub', aiProvider: 'gemini' });
    assert.equal(storage.getItem('leaderspro.keyword.claudePolicyBlocked.v1'), null);
    assert.equal(storage.getItem('lw-picks-topic'), '여행');
    // 다시 열 때는 지울 것이 없다 — 동기화 암호문을 또 올리지 않는다.
    assert.equal(purgeLegacyClaudeStorage(storage, STORE), false);
    // 깨진 묶음·빈 저장소에서도 던지지 않는다.
    assert.equal(purgeLegacyClaudeStorage(fakeStorage({ [STORE]: '{깨짐' }), STORE), false);
    assert.equal(purgeLegacyClaudeStorage(null, STORE), false);
});

test('동기화·워커로 나가는 묶음에서 옛 토큰 칸을 빼고, 받은 묶음은 건드리지 않는다', () => {
    const received = { searchAdLicense: 'lic', claudeToken: 'x', claudeRefresh: 'y' };
    assert.equal(hasLegacyClaudeFields(received), true);
    const clean = stripLegacyClaudeFields(received);
    assert.deepEqual(clean, { searchAdLicense: 'lic' });
    assert.equal(hasLegacyClaudeFields(clean), false);
    assert.equal(received.claudeToken, 'x');
    assert.deepEqual(stripLegacyClaudeFields(null), {});
    assert.equal(hasLegacyClaudeFields(['claudeToken']), false);
});
