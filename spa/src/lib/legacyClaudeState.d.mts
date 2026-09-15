/** 묶음에 옛 클로드 구독 토큰 칸이 하나라도 있는가. */
export declare function hasLegacyClaudeFields(keys: unknown): boolean;

/** 옛 클로드 구독 토큰 칸을 뺀 새 묶음. 받은 묶음은 그대로 둔다. */
export declare function stripLegacyClaudeFields<T extends Record<string, unknown>>(keys: T | null | undefined): T;

/**
 * 브라우저 저장소에서 옛 클로드 구독 토큰과 그 표식을 지운다.
 * 키 묶음에서 토큰 칸을 실제로 지웠으면 참 — 계정 동기화 암호문도 다시 올려야 한다.
 */
export declare function purgeLegacyClaudeStorage(
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined,
    userKeysStoreKey: string,
): boolean;
