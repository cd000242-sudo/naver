/**
 * ✅ [2026-01-25 모듈화] Image Helpers
 * - renderer.ts에서 분리됨
 * - 이미지 관련 유틸리티 헬퍼 함수
 */

import { toFileUrlMaybe } from './headingKeyUtils.js';

// ImageManager 참조 (글로벌에서 가져옴)
const getImageManager = () => (window as any).ImageManager;

/**
 * ✅ [2026-03-16 FIX] prompt-item 요소에서 순수 소제목 제목을 안전하게 추출
 * .heading-title-text의 textContent에는 배지 텍스트(📌 썸네일)가 포함되므로
 * data-heading-title 속성 → .heading-title-pure span → _headingTitles 순으로 우선 사용
 */
export function getSafeHeadingTitle(promptItem: Element | null | undefined): string {
    if (!promptItem) return '';
    try {
        // 1순위: data-heading-title 속성 (정확한 순수 제목)
        const dataTitle = String((promptItem as HTMLElement).getAttribute('data-heading-title') || '').trim();
        if (dataTitle) return dataTitle;
        // 2순위: .heading-title-pure span (배지 제외)
        const pureEl = promptItem.querySelector('.heading-title-pure') as HTMLElement | null;
        if (pureEl?.textContent?.trim()) return pureEl.textContent.trim();
        // 3순위: _headingTitles 전역 배열
        const indexStr = String((promptItem as HTMLElement).getAttribute('data-index') || '').trim();
        const idx = indexStr ? Math.max(0, Number(indexStr) - 1) : -1;
        if (idx >= 0) {
            const globalTitle = String((window as any)._headingTitles?.[idx] || '').trim();
            if (globalTitle) return globalTitle;
        }
        // 4순위 (최후 폴백): textContent 전체 — 배지 포함 가능
        const fullEl = promptItem.querySelector('.heading-title-text') as HTMLElement | null;
        return String(fullEl?.textContent || '').trim();
    } catch {
        return '';
    }
}

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
    } catch (e) {
        console.warn('[imageHelpers] catch ignored:', e);
    }

    // ✅ [2026-03-16 FIX] _headingTitles 검사를 DOM 조회보다 먼저 수행
    try {
        const list = (window as any)._headingTitles;
        if (Array.isArray(list) && list[index]) {
            const t = String(list[index] || '').trim();
            if (t) return t;
        }
    } catch (e) {
        console.warn('[imageHelpers] catch ignored:', e);
    }

    // ✅ [2026-03-16 FIX] data-heading-title → .heading-title-pure 우선 (배지 오염 방지)
    try {
        const promptItem = document.querySelector(`.prompt-item[data-index="${index + 1}"]`) as HTMLElement | null;
        if (promptItem) {
            const safe = getSafeHeadingTitle(promptItem);
            if (safe) return safe;
        }
    } catch (e) {
        console.warn('[imageHelpers] catch ignored:', e);
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
(window as any).getSafeHeadingTitle = getSafeHeadingTitle;
(window as any).getHeadingTitleByIndex = getHeadingTitleByIndex;
(window as any).getStableImageKey = getStableImageKey;
(window as any).getRequiredImageBasePath = getRequiredImageBasePath;

console.log('[ImageHelpers] 📦 모듈 로드됨!');
