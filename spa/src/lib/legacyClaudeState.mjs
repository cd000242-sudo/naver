/**
 * 옛 클로드 구독 토큰 정리 — **사이트에서 그 칸 이름을 아는 유일한 곳.**
 *
 * 사장님 결정(2026-09-16 "브리지 전용으로 정리"): 사이트는 클로드 구독 토큰을 받지도 ·
 * 발급받지도 · 워커로 보내지도 않는다. AI 는 전부 이 PC 의 LEWORD 앱 브리지(127.0.0.1)로 돈다.
 *
 * 그런데 옛 사이트가 브라우저 저장소와 계정 동기화 암호문에 토큰을 넣어 두었다.
 * 새 사이트가 열리면 여기서 지우고, 워커·동기화로 나가는 묶음에서도 여기서 뺀다.
 * 칸 이름을 여러 파일에 흩어 두면 한 곳을 빠뜨린다 — 그래서 이 파일 하나만 이름을 안다
 * (spa/tests/bridge-only-ai.test.mjs 가 다른 파일에 이름이 다시 생기면 막는다).
 */

/** 옛 사이트가 내 API 키 묶음에 넣던 클로드 구독 토큰 칸. */
const LEGACY_CLAUDE_FIELDS = Object.freeze(['claudeToken', 'claudeRefresh', 'claudeExpiresAt']);

/** 토큰이 있어야만 뜻이 있던 상태 표식(앤트로픽 정책 차단 표식). 토큰과 함께 지운다. */
const LEGACY_CLAUDE_STORE_KEYS = Object.freeze(['leaderspro.keyword.claudePolicyBlocked.v1']);

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** 묶음에 옛 토큰 칸이 하나라도 있는가 — 값이 비어 있어도 칸이 있으면 참이다. */
export function hasLegacyClaudeFields(keys) {
    if (!isRecord(keys)) return false;
    return LEGACY_CLAUDE_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(keys, field));
}

/** 옛 토큰 칸을 뺀 **새 묶음**을 돌려준다. 받은 묶음은 건드리지 않는다. */
export function stripLegacyClaudeFields(keys) {
    if (!isRecord(keys)) return {};
    return Object.fromEntries(Object.entries(keys).filter(([field]) => !LEGACY_CLAUDE_FIELDS.includes(field)));
}

/**
 * 브라우저 저장소에서 옛 토큰과 그 표식을 지운다 — 새 사이트가 열릴 때 한 번 부른다.
 *
 * @param storage localStorage 모양(getItem·setItem·removeItem). 테스트는 가짜를 넣는다.
 * @param userKeysStoreKey 내 API 키 묶음이 사는 열쇠(userKeys.ts 가 넘긴다).
 * @returns 키 묶음에서 토큰 칸을 실제로 지웠는지 — 참이면 동기화 암호문도 다시 올려야 한다.
 */
export function purgeLegacyClaudeStorage(storage, userKeysStoreKey) {
    if (!storage) return false;
    let removed = false;
    try {
        const raw = storage.getItem(userKeysStoreKey);
        const parsed = raw ? JSON.parse(raw) : null;
        if (hasLegacyClaudeFields(parsed)) {
            storage.setItem(userKeysStoreKey, JSON.stringify(stripLegacyClaudeFields(parsed)));
            removed = true;
        }
    } catch {
        /* 깨진 묶음은 loadUserKeys 가 빈 값으로 읽는다 — 여기서 더 할 일이 없다 */
    }
    for (const key of LEGACY_CLAUDE_STORE_KEYS) {
        try { storage.removeItem(key); } catch { /* 지우지 못해도 이 표식을 읽는 곳이 없어 영향이 없다 */ }
    }
    return removed;
}
