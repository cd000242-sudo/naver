// ============================================
// imageManagerCore.ts — renderer.ts에서 추출한 ImageManager
// Phase 5B-3: ImageManager 객체 + imageHistoryStack
// ============================================

import type { StructuredContent } from '../../contentGenerator.js';

// 전역 스코프 의존성 (copy-static.mjs가 전역으로 연결)
declare let generatedImages: any[];
declare let currentStructuredContent: StructuredContent | null;
declare let currentPostId: string | null;
declare function appendLog(message: string, logOutputId?: string): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function toFileUrlMaybe(p: string): string;
declare function normalizeHeadingKeyForVideoCache(title: string): string;
declare function getStableImageKey(heading: any): string;
declare function ensureKenBurnsStyles(): void;
declare function escapeHtml(str: string): string;
declare function setVeoProgressOverlay(...args: any[]): void;
declare function showVeoProgressOverlay(...args: any[]): void;
declare function hideVeoProgressOverlay(): void;
declare function generateVeoVideoWithRetry(...args: any[]): Promise<any>;
declare function applyHeadingVideoFromFile(...args: any[]): void;
declare function refreshMp4FilesList(): void;
declare function getSafeHeadingTitle(heading: any): string;
declare function showVideoModal(...args: any[]): void;
declare function showHeadingImagesModal(...args: any[]): void;
declare function showImageModal(...args: any[]): void;
declare function getHeadingVideoPreviewFromCache(...args: any[]): any;
declare function prefetchHeadingVideoPreview(...args: any[]): void;
declare const headingVideoPreviewCache: Map<string, any>;
declare const headingVideoPreviewInFlight: Map<string, Promise<any>>;
declare const toastManager: any;
declare type HeadingVideoPreviewCacheEntry = any;

// ImageHistorySnapshot 타입
interface ImageHistorySnapshot {
  reason: string;
  timestamp: number;
  images: any[];
  imageManagerState: { imageMap: Map<string, any[]>; headings: any[]; unsetHeadings: Set<string>; };
}

const imageHistoryStack: any[] = [];
let lastImageHistorySnapshotAt = 0;

function pushImageHistorySnapshot(reason: string): void {
  try {
    const now = Date.now();
    if (now - lastImageHistorySnapshotAt < 50) return; // ✅ [2026-02-12 P3 FIX #16] 150ms → 50ms
    lastImageHistorySnapshotAt = now;
    const snapshot: any[] = [];
    ImageManager.imageMap.forEach((images, heading) => {
      snapshot.push({
        heading,
        images: images.map((img) => ({ ...img })),
      });
    });
    imageHistoryStack.push(snapshot);
    if (imageHistoryStack.length > 50) {
      imageHistoryStack.shift();
    }
    console.log('[ImageHistory] snapshot pushed:', reason, 'entries:', snapshot.length);
  } catch (error) {
    console.error('[ImageHistory] snapshot push 실패:', error);
  }
}

// ============================================
// 🎯 통합 이미지 관리 시스템
// ============================================
/**
 * 3개의 미리보기(소제목 분석, 생성된 이미지, 저장된 이미지)를 완전히 연동
 * - 어디서든 이미지 추가/수정/삭제 시 모든 미리보기 자동 동기화
 * - 소제목별 이미지 매핑 관리
 * - 중복 방지 및 일관성 보장
 */
const ImageManager = {
  // 소제목별 이미지 매핑 (heading title -> image array) - ✅ 여러 이미지 지원
  imageMap: new Map<string, any[]>(),
  unsetHeadings: new Set<string>(),

  // 모든 소제목 목록
  headings: [] as any[],

  /**
   * ✅ 모든 이미지 및 상태 초기화
   */
  clearAll(): void {
    console.log('[ImageManager] 모든 데이터 초기화');
    this.imageMap.clear();
    this.unsetHeadings.clear();
    this.headings = [];
    try {
      (window as any).generatedImages = [];
      (window as any).imageManagementGeneratedImages = [];
      (window as any).currentStructuredContent = null;
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    // ✅ [2026-02-12 P0 FIX] 누락된 동기화 추가
    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  resolveHeadingKey(headingTitle: string): string {
    const rawTitle = String(headingTitle || '').trim();
    if (!rawTitle) return rawTitle;
    if (this.imageMap.has(rawTitle)) return rawTitle;

    // ✅ [2026-03-14 CRITICAL FIX] 📌 썸네일 배지 텍스트 strip
    // displayImageHeadingsWithPrompts에서 .heading-title-text 안에 📌 썸네일 배지가 포함되어
    // DOM textContent로 추출 시 "🖼️ 썸네일 📌 썸네일"이 되지만, data-heading-title은 "🖼️ 썸네일"
    // 이 불일치로 ImageManager에서 이미지를 찾지 못하는 근본 버그 수정
    const stripBadge = (s: string) => s.replace(/\s*📌\s*썸네일\s*/g, '').trim();
    const strippedRaw = stripBadge(rawTitle);
    if (strippedRaw !== rawTitle && this.imageMap.has(strippedRaw)) return strippedRaw;

    try {
      const norm = normalizeHeadingKeyForVideoCache(rawTitle);
      const normStripped = normalizeHeadingKeyForVideoCache(strippedRaw);
      if (!norm) return rawTitle;
      const keys = Array.from(this.imageMap.keys()) as string[];
      for (const key of keys) {
        const keyStr = String(key || '').trim();
        if (!keyStr) continue;
        if (keyStr === rawTitle) return keyStr;
        if (normalizeHeadingKeyForVideoCache(keyStr) === norm) return keyStr;
        // ✅ 배지 strip 후 매칭 시도
        const keyStripped = stripBadge(keyStr);
        if (keyStripped === strippedRaw) return keyStr;
        if (normStripped && normalizeHeadingKeyForVideoCache(keyStripped) === normStripped) return keyStr;
      }
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }

    return rawTitle;
  },

  /**
   * 소제목 목록 설정
   */
  setHeadings(headings: any[]): void {
    console.log('[ImageManager] 소제목 설정:', headings.length, '개');
    this.headings = headings;

    try {
      const normalizedHeadings2 = new Set<string>();
      (Array.isArray(this.headings) ? this.headings : []).forEach((h: any) => {
        const title = typeof h === 'string' ? String(h).trim() : String(h?.title || h || '').trim();
        const n = normalizeHeadingKeyForVideoCache(title);
        if (n) normalizedHeadings2.add(n);
      });
      const unsetKeys = Array.from(this.unsetHeadings.keys()) as string[];
      for (const key of unsetKeys) {
        const n = normalizeHeadingKeyForVideoCache(String(key || '').trim());
        if (n && !normalizedHeadings2.has(n)) {
          this.unsetHeadings.delete(key);
        }
      }
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }

    // ✅ [2026-02-12 P2 FIX #12] 이미지 소실 방지: 삭제 대신 가장 가까운 소제목에 리매핑
    try {
      const normalizedHeadings = new Set<string>();
      const headingTitleList: string[] = [];
      (Array.isArray(this.headings) ? this.headings : []).forEach((h: any) => {
        const title = typeof h === 'string' ? String(h).trim() : String(h?.title || h || '').trim();
        const n = normalizeHeadingKeyForVideoCache(title);
        if (n) {
          normalizedHeadings.add(n);
          headingTitleList.push(title);
        }
      });
      const keys = Array.from(this.imageMap.keys()) as string[];
      for (const key of keys) {
        // ✅ [2026-02-27 FIX] 썸네일 키는 삭제/리매핑하지 않고 보존
        if (key === '🖼️ 썸네일' || key === '썸네일') continue;
        const n = normalizeHeadingKeyForVideoCache(String(key || '').trim());
        if (n && !normalizedHeadings.has(n)) {
          // 인덱스 기반 리매핑: 같은 위치의 새 소제목이 있으면 이전
          const images = this.imageMap.get(key);
          if (images && images.length > 0 && headingTitleList.length > 0) {
            const idx = images[0]?.headingIndex;
            if (typeof idx === 'number' && idx >= 0 && idx < headingTitleList.length) {
              const newKey = this.resolveHeadingKey(headingTitleList[idx]);
              if (!this.imageMap.has(newKey)) {
                this.imageMap.set(newKey, images);
                console.log(`[ImageManager] 이미지 리매핑: "${key}" → "${newKey}"`);
              }
            }
          }
          this.imageMap.delete(key);
        }
      }
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }

    this.syncAllPreviews();
    // ✅ [2026-02-12 P2 FIX #13] setHeadings 후 syncGlobal 호출
    try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }
  },

  /**
   * ✅ 이미지 추가 (소제목당 여러 이미지 지원)
   */
  addImage(headingTitle: string, image: any): void {
    try {
      pushImageHistorySnapshot('ImageManager.addImage');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    console.log('[ImageManager] 이미지 추가:', headingTitle);
    const titleKey = this.resolveHeadingKey(headingTitle);
    this.unsetHeadings.delete(titleKey);
    const images = this.imageMap.get(titleKey) || [];
    images.push({
      ...image,
      heading: titleKey,
      timestamp: Date.now()
    });
    this.imageMap.set(titleKey, images);

    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  setPrimaryImageByKey(headingTitle: string, imageKey: string): void {
    const key = String(imageKey || '').trim();
    if (!key) return;
    try {
      pushImageHistorySnapshot('ImageManager.setPrimaryImageByKey');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    const titleKey = this.resolveHeadingKey(headingTitle);
    const images = this.imageMap.get(titleKey) || [];
    const idx = images.findIndex((img: any) => getStableImageKey(img) === key);
    if (idx < 0) return;
    if (idx > 0) {
      const picked = images.splice(idx, 1)[0];
      images.unshift(picked);
    }
    this.imageMap.set(titleKey, images);
    this.unsetHeadings.delete(titleKey);
    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
    try {
      syncGlobalImagesFromImageManager();
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }

    try {
      updatePromptItemsWithImages(this.getAllImages());
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
  },

  /**
   * ✅ 이미지 설정 (기존 이미지 교체 - 첫 번째 이미지로 설정)
   */
  setImage(headingTitle: string, image: any): void {
    try {
      pushImageHistorySnapshot('ImageManager.setImage');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    console.log('[ImageManager] 이미지 설정:', headingTitle);
    const titleKey = this.resolveHeadingKey(headingTitle);
    this.unsetHeadings.delete(titleKey);
    const existingImages = this.imageMap.get(titleKey) || [];
    const newImage = {
      ...image,
      heading: titleKey,
      timestamp: Date.now()
    };

    // 첫 번째 이미지 교체, 나머지 유지
    if (existingImages.length > 0) {
      existingImages[0] = newImage;
      this.imageMap.set(titleKey, existingImages);
    } else {
      this.imageMap.set(titleKey, [newImage]);
    }

    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  /**
   * ✅ 소제목의 모든 이미지 제거
   */
  removeImage(headingTitle: string): void {
    try {
      pushImageHistorySnapshot('ImageManager.removeImage');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    console.log('[ImageManager] 이미지 전체 제거:', headingTitle);
    const titleKey = this.resolveHeadingKey(headingTitle);
    this.imageMap.delete(titleKey);
    this.unsetHeadings.add(titleKey);

    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  /**
   * ✅ 특정 인덱스의 이미지 제거
   */
  removeImageAtIndex(headingTitle: string, index: number): void {
    try {
      pushImageHistorySnapshot('ImageManager.removeImageAtIndex');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    console.log('[ImageManager] 이미지 제거:', headingTitle, '인덱스:', index);
    const titleKey = this.resolveHeadingKey(headingTitle);
    const images = this.imageMap.get(titleKey) || [];
    if (index >= 0 && index < images.length) {
      images.splice(index, 1);

      // ✅ 대표(0번) 삭제 후에도 다른 이미지가 남아있으면 다음 이미지를 대표로 사용
      if (images.length > 0) {
        if (index === 0) {
          const gifIdx = images.findIndex((img: any) => String(img?.provider || '') === 'gif-from-video');
          if (gifIdx >= 0) {
            const gif = images.splice(gifIdx, 1)[0];
            images.unshift(gif);
          }
        }
        this.unsetHeadings.delete(titleKey);
      } else {
        this.unsetHeadings.add(titleKey);
      }

      if (images.length === 0) {
        this.imageMap.delete(titleKey);
      } else {
        this.imageMap.set(titleKey, images);
      }
    }

    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  /**
   * ✅ 특정 소제목의 이미지 가져오기 (첫 번째 이미지, 호환성 유지)
   */
  getImage(headingTitle: string): any | null {
    const titleKey = this.resolveHeadingKey(headingTitle);
    const images = this.imageMap.get(titleKey);
    if (!images || images.length === 0) return null;

    if (this.unsetHeadings.has(titleKey)) {
      const gif = images.find((img: any) => String(img?.provider || '') === 'gif-from-video');
      return gif || null;
    }

    return images[0];
  },

  isHeadingUnset(headingTitle: string): boolean {
    const titleKey = this.resolveHeadingKey(headingTitle);
    return this.unsetHeadings.has(titleKey);
  },

  /**
   * ✅ 특정 소제목의 모든 이미지 가져오기 (배열)
   */
  getImages(headingTitle: string): any[] {
    const titleKey = this.resolveHeadingKey(headingTitle);
    return this.imageMap.get(titleKey) || [];
  },

  /**
   * ✅ 특정 소제목의 이미지 개수
   */
  getImageCount(headingTitle: string): number {
    const titleKey = this.resolveHeadingKey(headingTitle);
    return (this.imageMap.get(titleKey) || []).length;
  },

  /**
   * 모든 이미지 가져오기 (배열 - 모든 소제목의 모든 이미지)
   */
  getAllImages(): any[] {
    // ✅ [2026-02-12 P2 FIX #11] headings 순서 보장
    const allImages: any[] = [];
    const visited = new Set<string>();
    if (Array.isArray(this.headings) && this.headings.length > 0) {
      this.headings.forEach((h: any) => {
        const title = typeof h === 'string' ? String(h).trim() : String(h?.title || h || '').trim();
        const key = this.resolveHeadingKey(title);
        if (!key || visited.has(key)) return;
        visited.add(key);
        const images = this.imageMap.get(key);
        if (images) allImages.push(...images);
      });
    }
    // 남은 orphan 엔트리도 추가
    this.imageMap.forEach((images, key) => {
      if (!visited.has(key)) {
        allImages.push(...images);
      }
    });
    return allImages;
  },

  /**
   * 소제목에 이미지가 있는지 확인
   */
  hasImage(headingTitle: string): boolean {
    const titleKey = this.resolveHeadingKey(headingTitle);
    const images = this.imageMap.get(titleKey);
    return images !== undefined && images.length > 0;
  },

  /**
   * 전체 초기화
   */
  clear(): void {
    console.log('[ImageManager] 전체 초기화');
    this.imageMap.clear();
    this.unsetHeadings.clear();
    this.headings = [];
    // ✅ [2026-02-12 P0 FIX] 전역변수도 함께 초기화
    // ✅ [2026-03-29 FIX] currentStructuredContent도 초기화 (clearAll과 동일 수준)
    try {
      (window as any).generatedImages = [];
      (window as any).imageManagementGeneratedImages = [];
      (window as any).currentStructuredContent = null;
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
    this.syncGeneratedImagesArray();
    this.syncAllPreviews();
  },

  /**
   * generatedImages 배열 동기화 (모든 소제목의 첫 번째 이미지만)
   */
  syncGeneratedImagesArray(): void {
    generatedImages = [];

    // ✅ [2026-03-22 FIX] 소제목 순서대로 모든 이미지 포함 (대표+추가 이미지 모두 발행)
    // 기존: getImage()로 1장만 → 추가 이미지 발행 누락 버그
    if (Array.isArray(this.headings) && this.headings.length > 0) {
      this.headings.forEach((h: any, idx: number) => {
        const title = typeof h === 'string' ? String(h).trim() : String(h?.title || h || '').trim();
        if (!title) return;
        const imgs = this.getImages(title) || [];
        imgs.forEach((img: any) => {
          // ✅ [2026-02-12 P3 FIX #17] 원본 mutation 방지: 복사본 사용
          const imgCopy = { ...img };
          if (imgCopy.headingIndex === undefined || imgCopy.headingIndex === null) {
            imgCopy.headingIndex = idx;
          }
          generatedImages.push(imgCopy);
        });
      });
    } else {
      // fallback: 모든 이미지 포함
      this.imageMap.forEach((images) => {
        images.forEach((img: any) => {
          generatedImages.push({ ...img });
        });
      });
    }
    // ✅ [2026-02-27 FIX] 썸네일 이미지도 generatedImages에 포함 (UI 표시용)
    const thumbImg = this.getImage('🖼️ 썸네일');
    if (thumbImg && !generatedImages.some((g: any) => g.heading === '🖼️ 썸네일')) {
      generatedImages.unshift({ ...thumbImg });
    }
    console.log('[ImageManager] generatedImages 동기화:', generatedImages.length, '개');
  },

  /**
   * 모든 미리보기 동기화
   */
  syncAllPreviews(): void {
    console.log('[ImageManager] 모든 미리보기 동기화 시작...');

    // 1. 소제목 분석 미리보기 업데이트
    this.updateHeadingAnalysisPreview();

    // 2. 생성된 이미지 미리보기 업데이트
    this.updateGeneratedImagesPreview();

    // 3. 저장된 이미지 모달 업데이트 (열려있을 경우)
    this.updateLocalImageModal();

    // 4. ✅ 예비 이미지 빠른 교체 썸네일 업데이트
    if (typeof updateReserveImagesThumbnails === 'function') {
      updateReserveImagesThumbnails();
    }

    console.log('[ImageManager] 모든 미리보기 동기화 완료');
  },

  /**
   * 1. 소제목 분석 미리보기 업데이트 (✅ 예비 이미지 빠른 교체 기능 추가)
   */
  updateHeadingAnalysisPreview(): void {
    const promptsContainer = document.getElementById('prompts-container');
    if (!promptsContainer) return;

    // ✅ window 객체를 통해 호출 (모듈 번들링 문제 방지)
    if (typeof (window as any).ensureKenBurnsStyles === 'function') {
      (window as any).ensureKenBurnsStyles();
    } else if (typeof ensureKenBurnsStyles === 'function') {
      ensureKenBurnsStyles();
    }

    const reserveImages: any[] = [];

    const promptItems = promptsContainer.querySelectorAll('.prompt-item');
    promptItems.forEach((item, index) => {
      const headingTitleEl = item.querySelector('.heading-title-text');
      if (!headingTitleEl) return;

      const headingTitle = headingTitleEl.textContent?.trim() || '';
      // ✅ [DEBUG] data-heading-title 속성에서 순수 제목 추출 (배지 텍스트 오염 방지)
      const promptItemEl = item as HTMLElement;
      const dataTitle = String(promptItemEl.getAttribute('data-heading-title') || '').trim();
      const pureEl = item.querySelector('.heading-title-pure') as HTMLElement | null;
      const pureTitleText = pureEl ? String(pureEl.textContent || '').trim() : '';
      const effectiveTitle = dataTitle || pureTitleText || headingTitle;
      console.log(`[updateHeadingAnalysisPreview] 🔍 #${index} textContent="${headingTitle.substring(0, 40)}" dataTitle="${dataTitle.substring(0, 40)}" pureTitle="${pureTitleText.substring(0, 40)}" → effectiveTitle="${effectiveTitle.substring(0, 40)}"`);
      const image = this.getImage(effectiveTitle);
      const generatedImageDiv = item.querySelector('.generated-image') as HTMLElement;

      if (!generatedImageDiv) return;

      // ✅ 안전한 HTML 이스케이프 (data- 속성에 복잡한 문자열 넣지 않음)
      const safeTitle = escapeHtml(effectiveTitle);

      const getFromCache = (window as any).getHeadingVideoPreviewFromCache || getHeadingVideoPreviewFromCache;
      const cachedVideo = getFromCache(effectiveTitle);
      if (cachedVideo && cachedVideo.url) {
        const safeUrl = escapeHtml(String(cachedVideo.url));
        // ✅ [2026-02-12 FIX] 비디오+이미지 동시 표시: 이미지가 있으면 좌하단 뱃지로 보조 표시
        let imageBadgeHtml = '';
        if (image) {
          const imgRaw = image.url || image.filePath || image.previewDataUrl || '';
          const imgUrl = toFileUrlMaybe(String(imgRaw || '').trim());
          if (imgUrl) {
            imageBadgeHtml = `<div style="position: absolute; bottom: 4px; left: 4px; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 2px solid rgba(34,197,94,0.9); box-shadow: 0 2px 8px rgba(0,0,0,0.4); z-index: 10;" title="배치된 이미지: ${safeTitle}"><img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.style.display='none'"><div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(34,197,94,0.85); color: white; text-align: center; font-size: 10px; font-weight: 800; padding: 1px 0; letter-spacing: 1px;">GIF</div></div>`;
          }
        }
        generatedImageDiv.innerHTML = `
          <div style="position: relative; width: 100%; height: 100%;">
            <video class="heading-video-preview" src="${safeUrl}" muted autoplay loop playsinline preload="metadata" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; cursor: pointer; background: #000;"></video>
            <div style="position: absolute; top: 4px; right: 4px; display: flex; gap: 4px; z-index: 10;">
              <button class="remove-heading-video-btn" data-heading-index="${index}" data-heading-title="${safeTitle}" style="background: rgba(239, 68, 68, 0.95); color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.85rem; font-weight: 900;" title="삭제">✕</button>
            </div>
            ${imageBadgeHtml}
          </div>
        `;
        generatedImageDiv.style.border = '2px solid var(--success)';
        generatedImageDiv.style.background = 'var(--bg-secondary)';
        const vEl = generatedImageDiv.querySelector('.heading-video-preview') as HTMLVideoElement | null;
        if (vEl) {
          vEl.addEventListener('click', (e) => {
            e.stopPropagation();
            showVideoModal(cachedVideo.url, headingTitle);
          });
          try {
            vEl.play().catch((e) => {
              console.warn('[renderer] promise catch ignored:', e);
            });
          } catch (e) {
            console.warn('[renderer] catch ignored:', e);
          }
        }
        return;
      }

      prefetchHeadingVideoPreview(effectiveTitle);
      const headingVideoKey = normalizeHeadingKeyForVideoCache(effectiveTitle);
      if (!headingVideoKey) return;
      if (!headingVideoPreviewCache.has(headingVideoKey) && headingVideoPreviewInFlight.has(headingVideoKey)) {
        const currentHeadingSnapshot = headingTitle;
        const currentItem = item;
        const currentDiv = generatedImageDiv;
        headingVideoPreviewInFlight.get(headingVideoKey)!.then((entry: HeadingVideoPreviewCacheEntry) => {
          if (!entry || !entry.url) return;
          // ✅ [2026-03-16 FIX] getSafeHeadingTitle로 배지 오염 방지
          const stillHeading = getSafeHeadingTitle(currentItem) || '';
          if (stillHeading !== currentHeadingSnapshot) return;
          const safeUrl2 = escapeHtml(String(entry.url));
          // ✅ [2026-02-12 FIX] in-flight 비디오에서도 이미지 뱃지 표시 (일관성)
          let imageBadgeHtml2 = '';
          if (image) {
            const imgRaw2 = image.url || image.filePath || image.previewDataUrl || '';
            const imgUrl2 = toFileUrlMaybe(String(imgRaw2 || '').trim());
            if (imgUrl2) {
              imageBadgeHtml2 = `<div style="position: absolute; bottom: 4px; left: 4px; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 2px solid rgba(34,197,94,0.9); box-shadow: 0 2px 8px rgba(0,0,0,0.4); z-index: 10;" title="배치된 이미지: ${safeTitle}"><img src="${imgUrl2}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.style.display='none'"><div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(34,197,94,0.85); color: white; text-align: center; font-size: 10px; font-weight: 800; padding: 1px 0; letter-spacing: 1px;">GIF</div></div>`;
            }
          }
          currentDiv.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%;">
              <video class="heading-video-preview" src="${safeUrl2}" muted autoplay loop playsinline preload="metadata" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; cursor: pointer; background: #000;"></video>
              <div style="position: absolute; top: 4px; right: 4px; display: flex; gap: 4px; z-index: 10;">
                <button class="remove-heading-video-btn" data-heading-index="${index}" data-heading-title="${safeTitle}" style="background: rgba(239, 68, 68, 0.95); color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.85rem; font-weight: 900;" title="삭제">✕</button>
              </div>
              ${imageBadgeHtml2}
            </div>
          `;
          currentDiv.style.border = '2px solid var(--success)';
          currentDiv.style.background = 'var(--bg-secondary)';
          const vEl2 = currentDiv.querySelector('.heading-video-preview') as HTMLVideoElement | null;
          if (vEl2) {
            vEl2.addEventListener('click', (e) => {
              e.stopPropagation();
              showVideoModal(entry.url, currentHeadingSnapshot);
            });
            try {
              vEl2.play().catch((e) => {
                console.warn('[renderer] promise catch ignored:', e);
              });
            } catch (e) {
              console.warn('[renderer] catch ignored:', e);
            }
          }
        }).catch((e: any) => {
          console.warn('[renderer] headingVideoPreviewInFlight promise catch ignored:', e);
        });
      }

      if (image) {
        const imageRaw = image.url || image.filePath || image.previewDataUrl || '';
        const imageUrl = toFileUrlMaybe(String(imageRaw || '').trim());
        const prompt = image.prompt || effectiveTitle || '';
        console.log(`[updateHeadingAnalysisPreview] 🖼️ #${index} 이미지 발견! URL="${String(imageUrl || '').substring(0, 100)}" heading="${effectiveTitle.substring(0, 30)}"`);

        // ✅ 예비 이미지 썸네일 HTML 생성 (최대 5개 표시)
        const reserveThumbnails = reserveImages.slice(0, 5).map((img: any, rIdx: number) => {
          const thumbRaw = img.url || img.filePath || img.previewDataUrl || '';
          const thumbUrl = toFileUrlMaybe(String(thumbRaw || '').trim());
          return `
            <img class="quick-replace-thumb" 
                 src="${thumbUrl}" 
                 data-heading-index="${index}"
                 data-reserve-index="${rIdx}"
                 data-heading-title="${safeTitle}"
                 style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; opacity: 0.7;"
                 onmouseover="this.style.borderColor='#f59e0b'; this.style.opacity='1'; this.style.transform='scale(1.1)';"
                 onmouseout="this.style.borderColor='transparent'; this.style.opacity='0.7'; this.style.transform='scale(1)';"
                 title="클릭하면 이 이미지로 교체">
          `;
        }).join('');

        const hasReserve = reserveImages.length > 0;
        const reserveCountText = hasReserve ? `예비 ${reserveImages.length}개` : '';

        // 이미지 있음 - 표시 (✅ 예비 이미지 빠른 교체 UI 추가)
        generatedImageDiv.innerHTML = `
          <div style="position: relative; width: 100%; height: 100%;">
            <img src="${imageUrl}" 
                 alt="${safeTitle}" 
                 class="ken-burns-media"
                 style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; cursor: pointer;"
                 onclick="showHeadingImagesModal('${encodeURIComponent(String(effectiveTitle || '').trim())}','${encodeURIComponent(String(imageUrl || '').trim())}')"
                 title="클릭하면 크게 보기">
            
            <!-- ✅ 상단 버튼들 -->
            <div style="position: absolute; top: 4px; right: 4px; display: flex; gap: 4px; z-index: 10;">
              <button class="remove-image-from-preview-btn" 
                      data-heading-index="${index}"
                      data-heading-title="${safeTitle}"
                      data-image-index="${index}"
                      style="background: rgba(239, 68, 68, 0.95); color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.85rem; font-weight: 900;"
                      title="삭제">✕</button>
            </div>
            
            <!-- ✅ 하단: 예비 이미지 빠른 교체 (있으면 표시) -->
            ${hasReserve ? `
            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.8)); padding: 6px 4px 4px; border-radius: 0 0 8px 8px;">
              <div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
                <span style="color: #f59e0b; font-size: 0.65rem; font-weight: 600; white-space: nowrap;">⚡${reserveCountText}</span>
                <div style="display: flex; gap: 2px; overflow: hidden;">
                  ${reserveThumbnails}
                </div>
                ${reserveImages.length > 5 ? `<span style="color: rgba(255,255,255,0.7); font-size: 0.6rem;">+${reserveImages.length - 5}</span>` : ''}
              </div>
            </div>
            ` : ''}
          </div>
        `;
        generatedImageDiv.style.border = '2px solid var(--success)';
        generatedImageDiv.style.background = 'var(--bg-secondary)';
      } else {
        // 이미지 없음 - 플레이스홀더 (✅ 예비 이미지 있으면 바로 배치 가능)
        if (reserveImages.length > 0) {
          const firstReserve = reserveImages[0];
          const thumbRaw = firstReserve.url || firstReserve.filePath || firstReserve.previewDataUrl || '';
          const thumbUrl = toFileUrlMaybe(String(thumbRaw || '').trim());
          generatedImageDiv.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 4px;">
              <span style="color: var(--text-muted); font-size: 1.2rem;">🖼️</span>
              <span style="color: var(--text-muted); font-size: 0.65rem;">이미지 없음</span>
              <button class="quick-assign-reserve-btn"
                      data-heading-index="${index}"
                      data-heading-title="${safeTitle}"
                      style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.65rem; font-weight: 600;"
                      title="예비 이미지 바로 배치">
                ⚡ 예비에서 배치
              </button>
            </div>
          `;
        } else {
          generatedImageDiv.innerHTML = '<span style="color: var(--text-muted); font-size: 1.5rem;">🖼️</span>';
        }
        generatedImageDiv.style.border = '2px dashed var(--border-color)';
        generatedImageDiv.style.background = 'var(--bg-tertiary)';
      }
    });
  },

  /**
   * 2. 생성된 이미지 미리보기 업데이트 (displayGeneratedImages와 동일한 UI 사용)
   * ✅ [100점 수정] DOM 요소가 없으면 재시도하여 100% 그리드 표시 보장
   */
  updateGeneratedImagesPreview(retryCount: number = 0): void {
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 100;

    const generatedImagesGrid = document.getElementById('generated-images-grid');

    // ✅ DOM 요소가 없으면 재시도 (비동기 렌더링 대응)
    if (!generatedImagesGrid) {
      if (retryCount < MAX_RETRIES) {
        console.log(`[ImageManager] generated-images-grid 찾기 재시도 ${retryCount + 1}/${MAX_RETRIES}`);
        setTimeout(() => this.updateGeneratedImagesPreview(retryCount + 1), RETRY_DELAY_MS);
      } else {
        console.warn('[ImageManager] generated-images-grid 요소를 찾을 수 없습니다 (재시도 횟수 초과)');
      }
      return;
    }

    // ✅ window 객체를 통해 호출 (모듈 번들링 문제 방지)
    if (typeof (window as any).ensureKenBurnsStyles === 'function') {
      (window as any).ensureKenBurnsStyles();
    } else if (typeof ensureKenBurnsStyles === 'function') {
      ensureKenBurnsStyles();
    }

    const images = this.getAllImages();

    // ✅ 이미지가 없으면 안내 메시지 표시
    if (images.length === 0) {
      generatedImagesGrid.style.display = 'flex';
      generatedImagesGrid.style.alignItems = 'center';
      generatedImagesGrid.style.justifyContent = 'center';
      generatedImagesGrid.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🖼️</div>
          <div style="font-size: 1rem; margin-bottom: 0.5rem;">이미지가 없습니다</div>
          <div style="font-size: 0.85rem;">이미지 소스를 선택하고 "이미지 생성하기"를 클릭하거나<br>"폴더에서 불러오기"로 이미지를 추가하세요</div>
        </div>
      `;
      return;
    }

    // ✅ 안전한 HTML 이스케이프 함수
    const escapeHtml = (str: string): string => {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    // ✅ 그리드 스타일 강제 적용
    generatedImagesGrid.style.display = 'grid';
    generatedImagesGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    generatedImagesGrid.style.gap = '1rem';

    generatedImagesGrid.innerHTML = images.map((image, index) => {
      const headingRaw = String(image.heading || `소제목 ${index + 1}`);
      const heading = escapeHtml(headingRaw);
      const prompt = escapeHtml(image.prompt || image.heading || `이미지 ${index + 1}`);
      const imageKey = escapeHtml(String(getStableImageKey(image) || ''));
      const imageRaw = image.url || image.filePath || image.previewDataUrl || '';
      const imageUrl = toFileUrlMaybe(String(imageRaw || '').trim());
      return `
        <div class="generated-image-item" data-image-index="${index}" data-heading-title="${heading}" data-image-key="${imageKey}" style="position: relative; background: var(--bg-secondary); border-radius: 12px; overflow: hidden; border: 2px solid var(--border-light); cursor: pointer; transition: all 0.3s ease; max-width: 220px; box-shadow: none;">
          <div style="position: relative; width: 100%; aspect-ratio: 1/1; overflow: hidden;">
            <img src="${imageUrl}" alt="${heading}" 
                 class="ken-burns-media"
                 style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%232d2d2d%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%23666%22 font-size=%228%22%3E이미지 로드 실패%3C/text%3E%3C/svg%3E';">
            <!-- 호버 오버레이 (6개 버튼) -->
            <div class="image-item-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, rgba(0,0,0,0.85), rgba(0,0,0,0.75)); display: none; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 8px; box-sizing: border-box;">
              <button type="button" class="view-image-btn" data-image-url="${imageUrl}" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">🔍 크게 보기</button>
              <button type="button" class="assign-to-heading-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">📍 소제목에 배치</button>
              <button type="button" class="create-video-from-image-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 700;">🎬 영상 만들기</button>
              <button type="button" class="regenerate-single-image-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">🔄 재생성</button>
              <button type="button" class="regenerate-ai-image-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">🤖 AI 이미지 생성</button>
              <button type="button" class="replace-from-folder-btn" data-image-index="${index}" data-heading-title="${heading}" data-image-key="${imageKey}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">📁 폴더에서 교체</button>
              <button type="button" class="remove-generated-image-btn" data-image-index="${index}" data-heading-title="${heading}" data-image-key="${imageKey}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">❌ 삭제</button>
            </div>
          </div>
          <div style="padding: 0.75rem;">
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${heading}">
            ${heading}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${prompt}">
              ${prompt}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // ✅ 호버 이벤트 및 버튼 클릭 이벤트 연결
    this.attachImageItemEvents(generatedImagesGrid);
  },

  /**
   * ✅ 이미지 아이템 호버 이벤트 및 버튼 클릭 이벤트 연결
   */
  attachImageItemEvents(container: HTMLElement): void {
    const images = this.getAllImages();
    const imageItems = container.querySelectorAll('.generated-image-item');

    imageItems.forEach(item => {
      const overlay = item.querySelector('.image-item-overlay') as HTMLElement;
      const img = item.querySelector('img') as HTMLImageElement;
      if (!overlay) return;

      const indexStr = (item as HTMLElement).getAttribute('data-image-index') || '';
      const index = Number(indexStr);

      // 호버 이벤트 (오버레이 표시 + 이미지 확대)
      item.addEventListener('mouseenter', () => {
        overlay.style.display = 'flex';
        if (img) img.style.transform = 'scale(1.05)';
        (item as HTMLElement).style.borderColor = 'var(--primary)';
        (item as HTMLElement).style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.4)';
        (item as HTMLElement).style.transform = 'translateY(-4px)';
      });

      item.addEventListener('mouseleave', () => {
        overlay.style.display = 'none';
        if (img) img.style.transform = 'scale(1)';
        (item as HTMLElement).style.borderColor = 'var(--border-light)';
        (item as HTMLElement).style.boxShadow = 'none';
        (item as HTMLElement).style.transform = 'translateY(0)';
      });
    });

    // ✅ 크게 보기 버튼
    container.querySelectorAll('.view-image-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0', 10);
        const image = images[idx];
        const imageUrl = (e.target as HTMLElement).getAttribute('data-image-url') || '';
        const headingTitle = String(image?.heading || '').trim();
        if (headingTitle && imageUrl) {
          showHeadingImagesModal(encodeURIComponent(headingTitle), encodeURIComponent(String(imageUrl || '').trim()));
          return;
        }
        if (imageUrl) showImageModal(imageUrl);
      });
    });

    // ✅ 소제목에 배치하기 버튼
    container.querySelectorAll('.assign-to-heading-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = images[index];
        if (image) {
          await showHeadingSelectionModalV2(image, index);
        }
      });
    });

    // ✅ 선택 이미지로 AI 영상 만들기 (image-to-video)
    container.querySelectorAll('.create-video-from-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = images[index];
        if (!image) return;

        if (typeof (window.api as any)?.generateVeoVideo !== 'function') {
          toastManager.error('AI 영상 기능이 아직 로드되지 않았습니다. 앱을 종료 후 다시 실행하세요.');
          return;
        }

        const headingTitleRaw = String(image.heading || '').trim() || `소제목 ${index + 1}`;
        const heading = normalizeHeadingKeyForVideoCache(headingTitleRaw);

        const toLocalPath = (p: string): string => {
          const raw = String(p || '').trim();
          if (!raw) return '';
          if (/^file:\/\//i.test(raw)) {
            return raw.replace(/^file:\/\//i, '').replace(/^\/+/, '').replace(/\\/g, '/');
          }
          // 일반 경로는 그대로
          return raw.replace(/\\/g, '/');
        };

        let filePath = toLocalPath(String(image.filePath || ''));
        let exists = false;
        try {
          if (filePath && typeof (window.api as any)?.checkFileExists === 'function') {
            exists = await (window.api as any).checkFileExists(filePath);
          }
        } catch {
          exists = false;
        }

        if (!filePath || !exists) {
          // 1) file:// URL에서 경로 추출
          const urlCandidate = String(image.url || image.previewDataUrl || '').trim();
          const maybeLocal = toLocalPath(urlCandidate);
          let localFromUrlExists = false;
          try {
            if (maybeLocal && typeof (window.api as any)?.checkFileExists === 'function') {
              localFromUrlExists = await (window.api as any).checkFileExists(maybeLocal);
            }
          } catch {
            localFromUrlExists = false;
          }
          if (maybeLocal && localFromUrlExists) {
            filePath = maybeLocal;
          } else if (/^https?:\/\//i.test(urlCandidate) && typeof (window.api as any)?.downloadAndSaveImage === 'function') {
            // 2) 원격 URL이면 자동 저장 후 사용
            try {
              const postTitle = String((window as any).currentStructuredContent?.selectedTitle || currentStructuredContent?.selectedTitle || '').trim();
              const postId = currentPostId || undefined;
              const res = await (window.api as any).downloadAndSaveImage(urlCandidate, headingTitleRaw, postTitle || undefined, postId);
              if (!res?.success) {
                throw new Error(String(res?.message || '이미지 저장 실패'));
              }
              const savedPath = String(res?.filePath || res?.savedToLocal || '').trim();
              if (!savedPath) {
                throw new Error('저장된 이미지 경로를 찾을 수 없습니다.');
              }
              filePath = toLocalPath(savedPath);

              // ✅ 저장된 로컬 경로로 ImageManager도 갱신(다음부터는 로컬로 인식)
              try {
                ImageManager.setImage(headingTitleRaw, {
                  ...image,
                  heading: headingTitleRaw,
                  filePath,
                  url: toFileUrlMaybe(filePath),
                  previewDataUrl: toFileUrlMaybe(filePath),
                  provider: String(image.provider || 'local'),
                  savedToLocal: true,
                });
                syncGlobalImagesFromImageManager();
                ImageManager.syncAllPreviews();
              } catch (e) {
                console.warn('[renderer] catch ignored:', e);
              }
            } catch (err) {
              toastManager.error(`이미지 저장 실패: ${(err as Error).message}`);
              return;
            }
          } else {
            toastManager.warning('선택한 이미지가 로컬 파일이 아닙니다. 먼저 "이미지 저장하러 가기"로 저장 후 다시 시도하세요.');
            return;
          }
        }

        const imagePrompt = String(image.prompt || '').trim();
        const fallbackText = String(image.heading || heading || `소제목 ${index + 1}`).trim();
        const basePrompt = imagePrompt || fallbackText;
        const prompt = `${basePrompt} . Create a dynamic cinematic video version of this exact scene that closely matches the still image's subject, composition, background, lighting, and mood.`;
        if (!prompt.trim()) {
          toastManager.error('프롬프트가 비어있습니다.');
          return;
        }

        showVeoProgressOverlay(heading);
        setVeoProgressOverlay('이미지 기반 영상 생성 요청 전송 중...', 2);
        try {
          const result = await generateVeoVideoWithRetry(
            {
              prompt,
              negativePrompt: 'audio, speech, voice, voiceover, narration, music, singing, lyrics, dialogue, party, nightclub, dancing crowd, festival, concert',
              model: 'veo-3.1-generate-preview',
              durationSeconds: 6,
              aspectRatio: '16:9',
              heading,
              imagePath: filePath,
            },
            heading
          );

          if (!result?.success) {
            throw new Error(String(result?.message || 'AI 영상 생성에 실패했습니다.'));
          }

          const outPath = String(result.filePath || '').trim();
          if (!outPath) {
            throw new Error('생성된 영상 경로를 찾을 수 없습니다.');
          }

          await applyHeadingVideoFromFile(heading, outPath, 'veo');
          await refreshMp4FilesList();
          toastManager.success('✅ 이미지 기반 AI 영상 생성 완료!');
        } catch (err) {
          console.error('[AI-VIDEO] 이미지 기반 생성 실패:', err);
          toastManager.error(`이미지 기반 AI 영상 생성 실패: ${(err as Error).message}`);
        } finally {
          hideVeoProgressOverlay();
        }
      });
    });

    // ✅ 재생성 버튼
    container.querySelectorAll('.regenerate-single-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = images[index];
        const heading = image?.heading || `소제목 ${index + 1}`;
        appendLog(`🔄 ${heading} 이미지 재생성 중...`, 'images-log-output');
        toastManager.info(`🔄 이미지 재생성 중...`);
      });
    });

    // ✅ AI 이미지 새로 생성 버튼
    container.querySelectorAll('.regenerate-ai-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = images[index];
        const heading = image?.heading || `소제목 ${index + 1}`;
        await regenerateWithNewAI(index, heading);
      });
    });

    // ✅ 폴더에서 교체 버튼
    container.querySelectorAll('.replace-from-folder-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const el = (e.currentTarget as HTMLElement | null) || (btn as HTMLElement);
        const index = parseInt(String(el?.getAttribute('data-image-index') || '0'), 10);
        const image = images[index];

        // Prefer explicit headingIndex if present, otherwise resolve from heading title
        const headingIndex = Number.isFinite(Number(image?.headingIndex)) ? Number(image?.headingIndex) : -1;
        if (headingIndex >= 0) {
          await showSavedImagesForReplace(headingIndex);
          return;
        }
        const headingTitle = String(image?.heading || '').trim();
        if (headingTitle) {
          const idx = ImageManager.headings.findIndex((h: any) => {
            const t = typeof h === 'string' ? h : (h?.title || '');
            return String(t || '').trim() === headingTitle;
          });
          await showSavedImagesForReplace(idx >= 0 ? idx : 0);
          return;
        }
        await showSavedImagesForReplace(index);
      });
    });

    // ✅ 삭제 버튼
    container.querySelectorAll('.remove-generated-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const el = (e.currentTarget as HTMLElement | null) || (btn as HTMLElement);
        const index = parseInt(String(el?.getAttribute('data-image-index') || '0'), 10);
        const image = images[index];
        const headingTitle = String(image?.heading || '').trim();
        const key = String(getStableImageKey(image) || '').trim();

        if (confirm('이 이미지를 제거하시겠습니까?\n\n💡 하이브리드 모드: 일부 이미지만 남기고 나머지는 AI가 자동 생성합니다!')) {
          // ImageManager에서 해당 이미지 1개만 제거 (소제목 전체 삭제 방지)
          if (headingTitle && key) {
            try {
              const list = ImageManager.getImages(headingTitle) || [];
              const idx = list.findIndex((img: any) => getStableImageKey(img) === key);
              if (idx >= 0) {
                ImageManager.removeImageAtIndex(headingTitle, idx);
              } else {
                ImageManager.removeImageAtIndex(headingTitle, 0);
              }
            } catch {
              this.removeImage(headingTitle);
            }
          } else if (headingTitle) {
            this.removeImage(headingTitle);
          }

          toastManager.success(`✅ 이미지가 제거되었습니다!`);
          appendLog(`❌ [${index + 1}] 이미지 제거 완료`, 'images-log-output');

          // ✅ [2026-03-16 FIX] 삭제 후 양쪽 UI 모두 갱신
          try {
            syncGlobalImagesFromImageManager();
            const allImagesAfterRemove = ImageManager.getAllImages();
            displayGeneratedImages(allImagesAfterRemove);
            updatePromptItemsWithImages(allImagesAfterRemove);
          } catch (e) {
            console.warn('[renderer] 삭제 후 UI 갱신 실패:', e);
          }
        }
      });
    });
  },

  /**
   * 3. 저장된 이미지 모달 업데이트 (열려있을 경우)
   */
  updateLocalImageModal(): void {
    // 모달이 열려있을 때만 업데이트
    const modal = document.querySelector('[data-modal-type="local-image-selection"]');
    if (!modal) return;

    const headingButtons = modal.querySelectorAll('.heading-select-btn');
    headingButtons.forEach((btn) => {
      const headingIndex = parseInt((btn as HTMLElement).dataset.headingIndex || '0');
      const heading = this.headings[headingIndex];
      const headingTitle = typeof heading === 'string' ? heading : (heading?.title || '');

      const hasImage = this.hasImage(headingTitle);

      if (hasImage) {
        (btn as HTMLElement).style.background = 'linear-gradient(135deg, #10b981, #059669)';
        (btn as HTMLElement).style.color = 'white';
        (btn as HTMLElement).style.borderColor = '#10b981';
        (btn as HTMLElement).style.borderWidth = '2px';
        (btn as HTMLElement).style.fontWeight = '600';

        const btnText = (btn as HTMLElement).textContent || '';
        if (!btnText.startsWith('✅')) {
          (btn as HTMLElement).textContent = '✅ ' + btnText.replace(/^✅\s*/, '');
        }
      } else {
        (btn as HTMLElement).style.background = 'var(--bg-tertiary)';
        (btn as HTMLElement).style.color = 'var(--text-strong)';
        (btn as HTMLElement).style.borderColor = 'var(--border-light)';
        (btn as HTMLElement).style.borderWidth = '1px';
        (btn as HTMLElement).style.fontWeight = '500';

        const btnText = (btn as HTMLElement).textContent || '';
        (btn as HTMLElement).textContent = btnText.replace(/^✅\s*/, '');
      }
    });
  }
};

export { imageHistoryStack, pushImageHistorySnapshot, ImageManager };
export type { ImageHistorySnapshot };
