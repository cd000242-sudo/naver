// ============================================
// imageSyncService.ts — renderer.ts에서 추출한 이미지 동기화 서비스
// Phase 5B-4: getGlobalImageSettings, hydrateImageManagerFromImages,
//             syncGlobalImagesFromImageManager, filterImagesForPublish
// ============================================

import type { StructuredContent } from '../../contentGenerator.js';

// 전역 스코프 의존성
declare let generatedImages: any[];
declare let currentStructuredContent: StructuredContent | null;
declare function appendLog(message: string, logOutputId?: string): void;
declare function getHeadingImageMode(): any;
declare function getFullAutoImageSource(): string;
declare const ImageManager: any;
declare const toastManager: any;
declare function toFileUrlMaybe(p: string): string;
declare function normalizeHeadingKeyForVideoCache(title: string): string;
declare function getStableImageKey(heading: any): string;

// ═══════════════════════════════════════════════════════════════════════════════
// localStorage에 저장된 사용자 이미지 설정을 반환합니다.
// ✅ [2026-01-29] getter 함수 사용으로 일관성 개선
// ═══════════════════════════════════════════════════════════════════════════════
function getGlobalImageSettings() {
  // HeadingImageSettings.ts의 getter 함수 사용 (window에 노출됨)
  const w = window as any;
  // ✅ [2026-02-04 FIX] fullAutoImageSource를 우선 사용 (풀오토 모달에서 설정한 값)
  // globalImageSource는 이미지 관리 탭용, fullAutoImageSource는 풀오토 발행용
  return {
    imageSource: w.getFullAutoImageSource?.() || localStorage.getItem('fullAutoImageSource') || w.getGlobalImageSource?.() || localStorage.getItem('globalImageSource') || 'nano-banana-pro',
    imageStyle: w.getImageStyle?.() || localStorage.getItem('imageStyle') || 'realistic',
    imageRatio: w.getImageRatio?.() || localStorage.getItem('imageRatio') || '1:1',
    thumbnailRatio: w.getThumbnailRatio?.() || localStorage.getItem('thumbnailImageRatio') || '1:1',
    subheadingRatio: w.getSubheadingRatio?.() || localStorage.getItem('subheadingImageRatio') || '1:1',
    headingImageMode: w.getHeadingImageMode?.() || localStorage.getItem('headingImageMode') || 'all',
    thumbnailTextInclude: localStorage.getItem('thumbnailTextInclude') === 'true',
    textOnlyPublish: localStorage.getItem('textOnlyPublish') === 'true',
    lifestyleImageGenerate: localStorage.getItem('lifestyleImageGenerate') === 'true'
  };
}

function hydrateImageManagerFromImages(structuredContent: any, images: any[]): void {
  try {
    ImageManager.imageMap.clear();
    ImageManager.unsetHeadings.clear();
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  try {
    if (structuredContent?.headings) {
      ImageManager.setHeadings(structuredContent.headings);
    }
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  // ✅ 소제목 목록 추출 (heading 없는 이미지 매핑용)
  const headingTitles: string[] = [];
  if (structuredContent?.headings && Array.isArray(structuredContent.headings)) {
    structuredContent.headings.forEach((h: any) => {
      const title = typeof h === 'string' ? h : (h?.title || '');
      if (title.trim()) headingTitles.push(title.trim());
    });
  }

  const byHeading = new Map<string, any[]>();
  (Array.isArray(images) ? images : []).forEach((img: any, idx: number) => {
    let heading = String(img?.heading || '').trim();

    // ✅ [2026-03-09 FIX] 썸네일 이미지는 첫 번째 소제목에 매핑 (불러오기 시 썸네일 누락 방지)
    const isThumbnailImage = img?.isThumbnail === true ||
      heading === '썸네일' || heading === '🖼️ 썸네일' ||
      heading.toLowerCase() === 'thumbnail' || heading.toLowerCase() === 'thumbnail-bg';
    if (isThumbnailImage && headingTitles.length > 0) {
      heading = headingTitles[0];
      console.log(`[hydrateImageManager] 썸네일 이미지를 첫 번째 소제목에 매핑: "${heading}"`);
    }

    // ✅ heading이 없으면 인덱스 기반으로 소제목 매핑 (썸네일 등)
    if (!heading && idx < headingTitles.length) {
      heading = headingTitles[idx];
      console.log(`[hydrateImageManager] 이미지 ${idx}에 소제목 자동 매핑: "${heading}"`);
    }

    if (!heading) return;
    const list = byHeading.get(heading) || [];
    list.push({
      ...img,
      heading,
      timestamp: typeof img?.timestamp === 'number' ? img.timestamp : Date.now(),
    });
    byHeading.set(heading, list);
  });

  byHeading.forEach((list, heading) => {
    try {
      // ✅ [2026-02-12 P2 FIX #14] resolveHeadingKey 적용
      const normalizedKey = ImageManager.resolveHeadingKey(heading);
      ImageManager.imageMap.set(normalizedKey, list);
      ImageManager.unsetHeadings.delete(normalizedKey);
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
  });

  try {
    syncGlobalImagesFromImageManager();
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }
}

function syncGlobalImagesFromImageManager(): void {
  try {
    ImageManager.syncGeneratedImagesArray();
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  const managerAllImages = ImageManager.getAllImages();
  const existingAllImages = (window as any).imageManagementGeneratedImages;

  const getKey = (img: any): string => {
    const raw = img?.url || img?.filePath || img?.previewDataUrl || '';
    return toFileUrlMaybe(String(raw || '').trim());
  };

  // ✅ [2026-02-11 FIX] ImageManager(최신) 데이터가 항상 우선 (이미지 관리 탭 변경/GIF 교체 반영)
  let allImages = managerAllImages;
  try {
    if (Array.isArray(existingAllImages) && existingAllImages.length > 0) {
      const existingList = Array.isArray(existingAllImages) ? existingAllImages : [];
      const merged: any[] = [];
      const seen = new Set<string>();

      // ImageManager(최신) 데이터를 먼저 추가
      managerAllImages.forEach((img: any) => {
        const k = getKey(img);
        if (!k) return;
        merged.push(img);
        seen.add(k);
      });

      // existingList에서 ImageManager에 없는 항목만 보충
      existingList.forEach((img: any) => {
        const k = getKey(img);
        if (!k) return;
        if (seen.has(k)) return;
        merged.push(img);
        seen.add(k);
      });

      allImages = merged;
    }
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  // ✅ ImageManager에서 가져온 최신 이미지 데이터를 사용 (GIF 포함)
  (window as any).imageManagementGeneratedImages = allImages;
  (window as any).generatedImages = allImages;

  try {
    displayGeneratedImages(allImages as any);
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  try {
    // ✅ 작은 그리드 업데이트: allImages 전달 (기존 perHeadingImages는 오래된 데이터일 수 있음)
    updatePromptItemsWithImages(allImages as any);
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  try {
    ImageManager.updateHeadingAnalysisPreview();
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }
}

function filterImagesForPublish(structuredContent: any, images: any[]): any[] {
  const headings = Array.isArray(structuredContent?.headings) ? structuredContent.headings : [];
  const byNorm = new Map<string, { title: string; index: number }>();
  const byTitle = new Map<string, { title: string; index: number }>();

  headings.forEach((h: any, idx: number) => {
    const title = typeof h === 'string' ? String(h || '').trim() : String(h?.title || h || '').trim();
    if (!title) return;
    byTitle.set(title, { title, index: idx });
    try {
      const n = normalizeHeadingKeyForVideoCache(title);
      if (n) byNorm.set(n, { title, index: idx });
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }
  });

  // ✅ [2026-02-24 FIX] 썸네일 이미지를 분리하여 보존
  // structuredContent.headings에는 썸네일이 포함되어 있지 않으므로
  // 아래 heading 매칭 루프에서 누락됨 → 미리 추출하여 결과 맨 뒤에 배치
  const thumbnailImages = (images || []).filter((img: any) => {
    if (img?.isThumbnail === true) return true;
    const h = String(img?.heading || '').trim().toLowerCase();
    return h.includes('썸네일') || h.includes('thumbnail');
  });
  // ✅ [2026-02-24 FIX] 썸네일에 isThumbnail 플래그 명시적 설정
  thumbnailImages.forEach((img: any) => { img.isThumbnail = true; });
  if (thumbnailImages.length > 0) {
    console.log(`[filterImagesForPublish] ✅ 썸네일 이미지 ${thumbnailImages.length}개 보존 (뒤에 배치)`);
  }

  // ✅ [2026-02-24 FIX] 썸네일 이미지 filePath 집합 (중복 방지용)
  const thumbnailPathSet = new Set<string>();
  thumbnailImages.forEach((img: any) => {
    const p = img?.filePath || img?.url || img?.previewDataUrl;
    if (p) thumbnailPathSet.add(p);
  });

  const fallbackFromInput = new Map<string, any[]>();
  (images || []).forEach((img: any) => {
    // ✅ [2026-02-24 FIX] 썸네일 이미지는 heading 매칭에서 제외 (중복 방지)
    const imgPath = img?.filePath || img?.url || img?.previewDataUrl;
    if (imgPath && thumbnailPathSet.has(imgPath)) return;
    if (img?.isThumbnail === true) return;
    const h = String(img?.heading || '').trim().toLowerCase();
    if (h.includes('썸네일') || h.includes('thumbnail')) return;

    const rawHeading = String(img?.heading || '').trim();
    if (!rawHeading) return;

    let resolved: { title: string; index: number } | undefined = byTitle.get(rawHeading);
    if (!resolved) {
      try {
        const n = normalizeHeadingKeyForVideoCache(rawHeading);
        if (n) resolved = byNorm.get(n);
      } catch (e) {
        console.warn('[renderer] catch ignored:', e);
      }
    }
    if (!resolved) return;

    const list = fallbackFromInput.get(resolved.title) || [];
    list.push({
      ...img,
      heading: resolved.title,
      headingIndex: typeof img?.headingIndex === 'number' ? img.headingIndex : resolved.index,
    });
    fallbackFromInput.set(resolved.title, list);
  });

  const result: any[] = [];
  headings.forEach((h: any, idx: number) => {
    const title = typeof h === 'string' ? String(h || '').trim() : String(h?.title || h || '').trim();
    if (!title) return;

    let isUnset = false;
    try {
      isUnset = ImageManager.isHeadingUnset(title);
    } catch {
      isUnset = false;
    }
    if (isUnset) {
      // ✅ 영상(또는 영상→GIF) 모드: 소제목이 unset이어도 해당 소제목에 등록된 모든 이미지를 발행에 포함
      // (기존: gif-from-video만 포함 → 수정: 모든 이미지 포함)
      let headingImages: any[] = [];
      try {
        headingImages = ImageManager.getImages(title) || [];
      } catch {
        headingImages = [];
      }

      // ✅ 이미지가 하나라도 있으면 모두 포함 (GIF 우선 정렬)
      if (Array.isArray(headingImages) && headingImages.length > 0) {
        // GIF를 맨 앞으로 정렬
        const gifs = headingImages.filter((img: any) => String(img?.provider || '') === 'gif-from-video');
        const others = headingImages.filter((img: any) => String(img?.provider || '') !== 'gif-from-video');
        const sorted = [...gifs, ...others];

        sorted.forEach((img: any) => {
          result.push({
            ...img,
            heading: title,
            headingIndex: typeof img?.headingIndex === 'number' ? img.headingIndex : idx,
            originalIndex: idx + 1, // ✅ [2026-03-26 FIX] 썬네일(0) 다음부터 1-based — editorHelpers originalIndex 매칭용
          });
        });
      }

      return;
    }

    let headingImages: any[] = [];
    let primary: any = null;
    try {
      headingImages = ImageManager.getImages(title) || [];
      primary = ImageManager.getImage(title);
    } catch {
      headingImages = [];
      primary = null;
    }

    // ✅ [2026-03-03 FIX] ImageManager 반환 이미지에서 thumbnail 중복 제거
    // thumbnail이 소제목 heading에도 등록되어 있으면 result와 thumbnailImages 양쪽에 중복 포함되는 버그 방지
    const dedupedHeadingImages = (Array.isArray(headingImages) ? headingImages : []).filter((img: any) => {
      if (img?.isThumbnail === true) return false;
      const h = String(img?.heading || '').trim().toLowerCase();
      if (h.includes('썸네일') || h.includes('thumbnail')) return false;
      const imgPath = img?.filePath || img?.url || img?.previewDataUrl;
      if (imgPath && thumbnailPathSet.has(imgPath)) return false;
      return true;
    });

    const ordered = (() => {
      const list = dedupedHeadingImages;
      const primaryKey = getStableImageKey(primary);
      if (!primaryKey) return list;
      const p = list.find((img: any) => getStableImageKey(img) === primaryKey);
      if (!p) return list;
      const rest = list.filter((img: any) => getStableImageKey(img) !== primaryKey);
      return [p, ...rest];
    })();

    if (Array.isArray(ordered) && ordered.length > 0) {
      ordered.forEach((img: any) => {
        result.push({
          ...img,
          heading: title,
          headingIndex: typeof img?.headingIndex === 'number' ? img.headingIndex : idx,
          originalIndex: idx + 1, // ✅ [2026-03-26 FIX] 썬네일(0) 다음부터 1-based — editorHelpers originalIndex 매칭용
        });
      });
      return;
    }

    const fallback = fallbackFromInput.get(title);
    if (Array.isArray(fallback) && fallback.length > 0) {
      fallback.forEach((img: any) => {
        result.push({
          ...img,
          heading: title,
          headingIndex: typeof img?.headingIndex === 'number' ? img.headingIndex : idx,
          originalIndex: idx + 1, // ✅ [2026-03-26 FIX] 썬네일(0) 다음부터 1-based — editorHelpers originalIndex 매칭용
        });
      });
    }
  });

  // ✅ [2026-03-04 FIX v5] 썸네일을 맨 앞에 배치하여 네이버 에디터에 첫 번째로 삽입
  // 기존: 맨 뒤 배치 → 네이버가 마지막 이미지를 대표사진으로 선택하는 버그 발생
  // 수정: 맨 앞 배치 → 네이버가 첫 번째 이미지를 대표사진으로 정상 인식
  return [...thumbnailImages, ...result];
}

export { getGlobalImageSettings, hydrateImageManagerFromImages, syncGlobalImagesFromImageManager, filterImagesForPublish };
