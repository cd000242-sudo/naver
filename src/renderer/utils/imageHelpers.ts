/**
 * ✅ [2026-01-25 모듈화] Image Helpers
 * - renderer.ts에서 분리됨
 * - 이미지 관련 유틸리티 헬퍼 함수
 */

import { toFileUrlMaybe } from './headingKeyUtils.js';

// ImageManager 참조 (글로벌에서 가져옴)
const getImageManager = () => (window as any).ImageManager;

/**
 * 인덱스로 소제목 제목 가져오기
 */
export function getHeadingTitleByIndex(index: number): string {
    try {
        const ImageManager = getImageManager();
        const headings = ImageManager?.headings;
        const h = Array.isArray(headings) ? headings[index] : undefined;
        if (h) {
            if (typeof h === 'string') return String(h).trim();
            const title = String(h?.title || '').trim();
            if (title) return title;
        }
    } catch {
        // ignore
    }

    try {
        const el = document.querySelector(`.prompt-item[data-index="${index + 1}"] .heading-title-text`) as HTMLElement | null;
        const t = String(el?.textContent || '').trim();
        if (t) return t;
    } catch {
        // ignore
    }

    try {
        const list = (window as any)._headingTitles;
        if (Array.isArray(list) && list[index]) {
            const t = String(list[index] || '').trim();
            if (t) return t;
        }
    } catch {
        // ignore
    }

    return '';
}

/**
 * 이미지의 안정적인 키 생성
 */
export function getStableImageKey(img: any): string {
    const raw = img?.url || img?.filePath || img?.previewDataUrl || '';
    return toFileUrlMaybe(String(raw || '').trim());
}

/**
 * 이미지 저장 기본 경로 가져오기
 * ✅ [2026-01-30 FIX] customImageSavePath 미설정 시 빈 문자열 반환 (오류 없음)
 */
export async function getRequiredImageBasePath(): Promise<string> {
    if (!window.api?.getConfig) {
        console.warn('[ImageHelpers] ⚠️ 설정 API 없음, 빈 경로 반환');
        return '';
    }
    const config = await window.api.getConfig();
    const raw = String((config as any)?.customImageSavePath || '').trim();

    // ✅ [2026-01-30 FIX] 경로가 없어도 오류 없이 빈 문자열 반환
    // 메인 프로세스에서 기본 경로 처리
    if (!raw) {
        console.log('[ImageHelpers] ⚠️ customImageSavePath 미설정, 빈 경로 반환');
        return '';
    }
    return raw.replace(/\\/g, '/').replace(/\/+$/g, '');
}

// 전역 노출 (하위 호환성)
(window as any).getHeadingTitleByIndex = getHeadingTitleByIndex;
(window as any).getStableImageKey = getStableImageKey;
(window as any).getRequiredImageBasePath = getRequiredImageBasePath;

console.log('[ImageHelpers] 📦 모듈 로드됨!');
