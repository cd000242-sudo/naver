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
 */
export async function getRequiredImageBasePath(): Promise<string> {
    if (!window.api?.getConfig) {
        throw new Error('설정 API를 사용할 수 없습니다.');
    }
    const config = await window.api.getConfig();
    const raw = String((config as any)?.customImageSavePath || '').trim();
    if (!raw) {
        throw new Error('환경설정에서 이미지 저장 폴더를 먼저 선택해주세요.');
    }
    return raw.replace(/\\/g, '/').replace(/\/+$/g, '');
}

// 전역 노출 (하위 호환성)
(window as any).getHeadingTitleByIndex = getHeadingTitleByIndex;
(window as any).getStableImageKey = getStableImageKey;
(window as any).getRequiredImageBasePath = getRequiredImageBasePath;

console.log('[ImageHelpers] 📦 모듈 로드됨!');
