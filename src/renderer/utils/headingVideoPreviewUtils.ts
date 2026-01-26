// ✅ [2026-01-25 모듈화] Heading Video Preview 유틸리티
// 소제목 영상 미리보기 캐시 및 DOM 동기화 관련 함수들

import { normalizeHeadingKeyForVideoCache, toFileUrlMaybe } from './headingKeyUtils.js';
import { escapeHtml } from './htmlUtils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// 타입 및 캐시 정의
// ═══════════════════════════════════════════════════════════════════════════════

export type HeadingVideoPreviewCacheEntry = { url: string; updatedAt?: number } | null;

export const headingVideoPreviewCache = new Map<string, HeadingVideoPreviewCacheEntry>();
export const headingVideoPreviewInFlight = new Map<string, Promise<HeadingVideoPreviewCacheEntry>>();

// ═══════════════════════════════════════════════════════════════════════════════
// 캐시 조회 함수
// ═══════════════════════════════════════════════════════════════════════════════

export function getHeadingVideoPreviewFromCache(headingTitle: string): HeadingVideoPreviewCacheEntry {
    const normalized = normalizeHeadingKeyForVideoCache(headingTitle);
    if (!normalized) return null;
    return headingVideoPreviewCache.get(normalized) || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 리뷰 소제목 시드 추출
// ═══════════════════════════════════════════════════════════════════════════════

export function getReviewHeadingSeed(title: string, keywordsRaw: string, structuredContent: any): string {
    const keywords = String(keywordsRaw || '').trim();
    if (keywords) {
        const first = keywords.split(',').map((s) => s.trim()).filter(Boolean)[0];
        if (first) return first;
    }

    const t = String(structuredContent?.selectedTitle || structuredContent?.title || title || '').trim();
    if (!t) return '';
    const primary = t.split(/\s*(?:\||｜|:|\-|—|\(|\[|\{)\s*/)[0]?.trim() || t;
    return primary.length > 30 ? primary.slice(0, 30).trim() : primary;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 프롬프트 카드 영상 동기화
// ═══════════════════════════════════════════════════════════════════════════════

function syncHeadingVideoInPromptItemsInternal(): void {
    try {
        const promptsContainer = document.getElementById('prompts-container') as HTMLDivElement | null;
        if (!promptsContainer) return;

        const promptItems = promptsContainer.querySelectorAll('.prompt-item');
        promptItems.forEach((item) => {
            const headingTitleText = item.querySelector('.heading-title-text') as HTMLDivElement | null;
            if (!headingTitleText) return;
            const rawTitle = String(headingTitleText.textContent || '').trim();
            if (!rawTitle) return;

            const normalized = normalizeHeadingKeyForVideoCache(rawTitle);
            if (!normalized) return;
            const cachedVideo = getHeadingVideoPreviewFromCache(normalized);
            const url = cachedVideo?.url ? String(cachedVideo.url) : '';

            const mediaContainer = (item.querySelector('.generated-image') || item.querySelector('.generated-images-container')) as HTMLDivElement | null;
            if (!mediaContainer) return;

            // ✅ 영상이 있어도 프롬프트 카드에서는 GIF(이미지)로 동기화가 우선.
            // 따라서 영상 overlay는 항상 제거하고, 이미지(ImageManager.getImage)가 보여지게 둔다.
            mediaContainer.querySelectorAll('.heading-video-preview-wrapper').forEach((el) => el.remove());
            mediaContainer.querySelectorAll('.heading-video-preview-player').forEach((el) => {
                const wrap = (el as HTMLElement).closest('.heading-video-preview-wrapper') as HTMLElement | null;
                if (wrap) wrap.remove();
                else el.remove();
            });
            return;
        });
    } catch {
        // 미리보기 동기화 중 오류는 무시 (핵심 기능에 영향 주지 않도록)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 통합 미리보기 이벤트 위임
// ═══════════════════════════════════════════════════════════════════════════════

let unifiedPreviewVideoDelegationAdded = false;

function ensureUnifiedPreviewVideoDelegationInternal(showVideoModal: (url: string, title: string) => void): void {
    if (unifiedPreviewVideoDelegationAdded) return;
    unifiedPreviewVideoDelegationAdded = true;
    const integratedPreview = document.getElementById('unified-integrated-preview');
    if (!integratedPreview) return;
    integratedPreview.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        const videoEl = target?.closest?.('.unified-heading-video') as HTMLElement | null;
        if (!videoEl) return;
        const url = String(videoEl.getAttribute('data-video-url') || '').trim();
        const title = String(videoEl.getAttribute('data-video-title') || '').trim();
        if (!url) return;
        showVideoModal(url, title);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 통합 미리보기 영상 슬롯 동기화
// ═══════════════════════════════════════════════════════════════════════════════

export interface ImageManagerLike {
    getImage(heading: string): any;
    imageMap: Map<string, any[]>;
}

function syncHeadingVideoSlotsInUnifiedPreviewInternal(ImageManager: ImageManagerLike): void {
    const integratedPreview = document.getElementById('unified-integrated-preview');
    if (!integratedPreview) return;
    const slots = integratedPreview.querySelectorAll('[data-heading-video-slot]');
    slots.forEach((slot) => {
        if (!(slot as HTMLElement).isConnected) return;
        const keyRaw = String((slot as HTMLElement).getAttribute('data-heading-video-slot') || '').trim();
        if (!keyRaw) return;
        let headingTitle = '';
        try {
            headingTitle = decodeURIComponent(keyRaw);
        } catch {
            headingTitle = keyRaw;
        }
        const cachedVideo = getHeadingVideoPreviewFromCache(headingTitle);
        const cachedVideoUrl = cachedVideo?.url ? String(cachedVideo.url) : '';
        if (!cachedVideoUrl) {
            const slotEl = slot as HTMLElement;
            const hasExistingVideo =
                slotEl.classList.contains('unified-heading-video') ||
                !!slotEl.querySelector('.unified-heading-video-player') ||
                !!slotEl.querySelector('.unified-heading-video');
            if (!hasExistingVideo) return;

            slotEl.querySelectorAll('.unified-heading-video-player').forEach((el) => {
                try {
                    (el as HTMLVideoElement).pause();
                } catch {
                }
            });

            if (slotEl.classList.contains('unified-heading-video')) {
                slotEl.classList.remove('unified-heading-video');
            }
            slotEl.removeAttribute('data-video-url');
            slotEl.removeAttribute('data-video-title');

            const safeTitle = escapeHtml(String(headingTitle || '').trim());
            let imageUrl = '';
            let imgEntry: any = null;
            try {
                imgEntry = ImageManager.getImage(headingTitle);
            } catch {
                imgEntry = null;
            }

            if (!imgEntry) {
                const targetNorm = normalizeHeadingKeyForVideoCache(headingTitle);
                const keys = Array.from(ImageManager.imageMap.keys()) as string[];
                const matchedKey = keys.find((k) => normalizeHeadingKeyForVideoCache(k) === targetNorm);
                if (matchedKey) {
                    try {
                        imgEntry = ImageManager.getImage(matchedKey);
                    } catch {
                        imgEntry = null;
                    }
                }
            }

            const raw = imgEntry?.url || imgEntry?.filePath || imgEntry?.previewDataUrl || '';
            const maybe = String(raw || '').trim();
            if (maybe) imageUrl = toFileUrlMaybe(maybe);

            let headingIndex = -1;
            const sc: any = (window as any).currentStructuredContent;
            const hds: any[] = Array.isArray(sc?.headings)
                ? sc.headings
                : (Array.isArray((ImageManager as any).headings) ? (ImageManager as any).headings : []);
            const targetNorm = normalizeHeadingKeyForVideoCache(headingTitle);
            for (let i = 0; i < hds.length; i++) {
                const t = typeof hds[i] === 'string' ? hds[i] : (hds[i]?.title || hds[i]);
                if (normalizeHeadingKeyForVideoCache(String(t || '')) === targetNorm) {
                    headingIndex = i;
                    break;
                }
            }

            if (imageUrl) {
                const safeImageUrl = escapeHtml(String(imageUrl));
                slotEl.innerHTML = `<img src="${safeImageUrl}" alt="${safeTitle}" class="ken-burns-media" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">`;
            } else {
                const label = headingIndex >= 0 ? String(headingIndex + 1) : '';
                slotEl.innerHTML = `<div style="width: 100%; height: 100%; border-radius: 6px; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; color: white; font-size: 1rem; font-weight: 600;">${escapeHtml(label)}</div>`;
            }
            return;
        }
        const safeTitle = escapeHtml(String(headingTitle || '').trim());
        const safeVideoUrl = escapeHtml(cachedVideoUrl);
        const existingVideo = (slot as HTMLElement).querySelector('.unified-heading-video-player') as HTMLVideoElement | null;
        if (existingVideo) {
            if (existingVideo.getAttribute('src') !== cachedVideoUrl) {
                existingVideo.setAttribute('src', cachedVideoUrl);
                try {
                    existingVideo.load();
                    existingVideo.play().catch(() => {
                        // ignore
                    });
                } catch {
                    // ignore
                }
            }
            return;
        }
        (slot as HTMLElement).innerHTML = `
      <div class="unified-heading-video" data-video-url="${safeVideoUrl}" data-video-title="${safeTitle}" data-heading-video-slot="${escapeHtml(keyRaw)}" style="width: 100%; height: 100%;">
        <video class="unified-heading-video-player" src="${safeVideoUrl}" muted autoplay loop playsinline preload="metadata" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px; background: #000;"></video>
      </div>
    `;
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-01-26 FIX] window 객체에 노출 (무한재귀 방지)
// _impl 접미사로 renderer.ts wrapper 함수와 이름 충돌 방지
// ═══════════════════════════════════════════════════════════════════════════════

(window as any).getHeadingVideoPreviewFromCache = getHeadingVideoPreviewFromCache;
(window as any).getReviewHeadingSeed = getReviewHeadingSeed;
(window as any).syncHeadingVideoInPromptItems_impl = syncHeadingVideoInPromptItemsInternal;
(window as any).ensureUnifiedPreviewVideoDelegation_impl = ensureUnifiedPreviewVideoDelegationInternal;
(window as any).syncHeadingVideoSlots_impl = syncHeadingVideoSlotsInUnifiedPreviewInternal;
(window as any).headingVideoPreviewCache = headingVideoPreviewCache;
(window as any).headingVideoPreviewInFlight = headingVideoPreviewInFlight;

console.log('[HeadingVideoPreviewUtils] 📦 모듈 로드됨!');

