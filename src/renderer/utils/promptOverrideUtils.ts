/**
 * ✅ [2026-01-25 모듈화] 프롬프트 오버라이드 유틸리티
 * 
 * 소제목별 수동 영어 프롬프트 오버라이드 관리
 */

import { normalizeHeadingKeyForVideoCache } from './headingKeyUtils.js';

// ============================================
// 프롬프트 오버라이드 저장소
// ============================================

const STORAGE_KEY = 'manualEnglishPromptOverrides';

/**
 * 프롬프트 오버라이드 저장소를 가져옵니다.
 * window 객체에 캐시되어 있으며, localStorage에서 복원됩니다.
 */
export function getManualEnglishPromptOverridesStore(): Record<string, string> {
    const w = window as any;
    if (!w.__manualEnglishPromptOverrides) {
        let restored: Record<string, string> = {};
        try {
            const raw = String(window.localStorage?.getItem(STORAGE_KEY) || '').trim();
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    restored = parsed as Record<string, string>;
                }
            }
        } catch {
            restored = {};
        }
        w.__manualEnglishPromptOverrides = restored;
    }
    return w.__manualEnglishPromptOverrides;
}

/**
 * 특정 소제목에 대한 수동 영어 프롬프트 오버라이드를 가져옵니다.
 * 
 * @param headingTitle - 소제목
 * @returns 수동 설정된 영어 프롬프트 (없으면 빈 문자열)
 */
export function getManualEnglishPromptOverrideForHeading(headingTitle: string): string {
    const raw = String(headingTitle || '').trim();
    if (!raw) return '';
    try {
        const key = normalizeHeadingKeyForVideoCache(raw);
        const store = getManualEnglishPromptOverridesStore();
        const v = String(store[key] || store[raw] || '').trim();
        return v;
    } catch {
        const store = getManualEnglishPromptOverridesStore();
        return String(store[raw] || '').trim();
    }
}

/**
 * 특정 소제목에 대한 수동 영어 프롬프트 오버라이드를 설정합니다.
 * 
 * @param headingTitle - 소제목
 * @param prompt - 설정할 영어 프롬프트 (빈 문자열이면 삭제)
 */
export function setManualEnglishPromptOverrideForHeading(headingTitle: string, prompt: string): void {
    const title = String(headingTitle || '').trim();
    const p = String(prompt || '').trim();
    if (!title) return;
    const store = getManualEnglishPromptOverridesStore();
    try {
        const key = normalizeHeadingKeyForVideoCache(title);
        if (!p) {
            delete store[key];
            delete store[title];
            try {
                window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store || {}));
            } catch {
                // ignore
            }
            return;
        }
        store[key] = p;
        store[title] = p;
    } catch {
        if (!p) {
            delete store[title];
            try {
                window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store || {}));
            } catch {
                // ignore
            }
            return;
        }
        store[title] = p;
    }

    try {
        window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store || {}));
    } catch {
        // ignore
    }
}

/**
 * 특정 소제목에 대한 수동 영어 프롬프트 오버라이드를 삭제합니다.
 * 
 * @param headingTitle - 소제목
 */
export function clearManualEnglishPromptOverrideForHeading(headingTitle: string): void {
    setManualEnglishPromptOverrideForHeading(headingTitle, '');
}
