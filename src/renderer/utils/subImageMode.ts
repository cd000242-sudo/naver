/**
 * Shopping-connect sub-image mode helper.
 *
 * 문제: 기존 localStorage 키 `scSubImageSource` 가
 *   (a) 모달 라디오 값 ('ai' | 'collected')
 *   (b) 이미지 엔진 드롭다운 값 ('nano-banana-pro' | 'openai-image' | ...)
 * 두 가지로 동시에 쓰이면서, 분기 조건은 `=== 'collected'` strict equality 만
 * 통과시켜 사용자가 "수집 이미지 사용" 라디오를 체크했음에도 다른 UI에서
 * AI 엔진명이 저장되면 AI 생성 분기로 빠지는 mismatch 가 발생했다.
 *
 * 해결: mode (ai|collected) 와 engine (엔진명) 을 분리하고, 모든 분기·전송
 * 지점이 이 헬퍼를 거치도록 한다.
 *
 * - `scSubImageMode` : 신규 키, 'ai' | 'collected' 만 저장
 * - `scSubImageSource`: 레거시 키, fallback 해석에만 사용. 신규 코드에서
 *   직접 setItem 하지 않는다. payload 호환을 위해 setter 가 같이 동기화한다.
 */

const AI_ENGINE_WHITELIST = new Set([
    'nano-banana-pro',
    'nano-banana-2',
    'openai-image',
    'dall-e-3',
    'imagefx',
    'leonardoai',
    'deepinfra',
    'deepinfra-flux',
    'stability',
    'falai',
    'prodia',
    'pollinations',
    'flow',
]);

export type SubImageMode = 'ai' | 'collected';

const MODE_KEY = 'scSubImageMode';
const LEGACY_KEY = 'scSubImageSource';

/**
 * Returns 'ai' | 'collected' regardless of which key (new or legacy) the
 * caller previously wrote. Engine names found in the legacy key are
 * normalised to 'ai'.
 */
export function getSubImageMode(): SubImageMode {
    try {
        const explicit = localStorage.getItem(MODE_KEY);
        if (explicit === 'ai' || explicit === 'collected') {
            return explicit;
        }

        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy === 'ai') return 'ai';
        if (legacy === 'collected') return 'collected';
        if (legacy && AI_ENGINE_WHITELIST.has(legacy)) return 'ai';
    } catch {
        // localStorage 접근 실패 시 기본값으로 fallback
    }
    return 'collected';
}

/**
 * Writes both the new mode key and the legacy key. The legacy key is kept
 * in sync because main process payloads still use `scSubImageSource` as a
 * field name and expect 'ai' | 'collected' there.
 */
export function setSubImageMode(mode: SubImageMode): void {
    try {
        localStorage.setItem(MODE_KEY, mode);
        localStorage.setItem(LEGACY_KEY, mode);
    } catch {
        // ignore — UI 상태 저장 실패는 발행을 막지 않는다
    }
}

/**
 * Helper for call sites that need a payload-ready 'ai' | 'collected' value
 * to forward to the main process via IPC.
 */
export function getSubImageModeForPayload(): SubImageMode {
    return getSubImageMode();
}

/**
 * Returns true when the given string is a known AI image engine name.
 * Used by the radio-restore logic so that a stored engine name maps to
 * the 'ai' radio button rather than failing the selector match.
 */
export function isAIEngineName(value: string | null | undefined): boolean {
    return !!value && AI_ENGINE_WHITELIST.has(value);
}

// 전역 노출 — 인라인 빌드 모듈(fullAutoFlow/publishingHandlers)에서 `(window as any).getSubImageMode()` 호출
if (typeof window !== 'undefined') {
    (window as any).getSubImageMode = getSubImageMode;
    (window as any).setSubImageMode = setSubImageMode;
}
