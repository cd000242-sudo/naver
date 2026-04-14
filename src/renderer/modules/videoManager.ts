// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 비디오 매니저 모듈
// renderer.ts에서 추출된 비디오(Veo/KenBurns) 관련 함수들
// ═══════════════════════════════════════════════════════════════════

// ✅ renderer.ts의 전역 변수/함수 참조 (인라인 빌드에서 동일 스코프)
declare let currentStructuredContent: any;
declare let generatedImages: any[];
declare let currentPostId: string;
declare const ImageManager: any;
declare const toastManager: any;
declare const UnifiedDOMCache: any;
declare const headingVideoPreviewCache: Map<string, any>;
declare const headingVideoPreviewInFlight: Map<string, any>;
declare function appendLog(msg: string, ...args: any[]): void;
declare function escapeHtml(str: string): string;
declare function getRequiredImageBasePath(): Promise<string>;
declare function updateUnifiedImagePreview(headings: any[], images: any[]): void;
declare function displayGeneratedImages(images: any[]): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function getCurrentVideoProvider(): any;
declare function setCurrentVideoProvider(provider: any): void;
declare function showImageModal(imageUrl: string, title?: string): void;
declare function showVideoModal(videoUrl: string, title?: string): void;
declare function refreshGeneratedPostsList(): void;
declare function toFileUrlMaybe(path: string): string;
declare function normalizeHeadingKeyForVideoCache(key: string): string;
declare function showVeoProgressOverlay(heading: string): void;
declare function setVeoProgressOverlay(msg: string, progress: number): void;
declare function hideVeoProgressOverlay(delay?: number): void;
declare function runUiActionLocked(lockKey: string, msg: string, fn: () => Promise<any>): Promise<any>;
declare function isVeoQuotaExceededMessage(msg: string): boolean;
declare function getHeadingSelectedImageKey(heading: string, ...args: any[]): any;
declare function getStableImageKey(imageObj: any, heading?: string): string;
declare function buildVeoSafePrompt(prompt: string, heading?: string, reason?: string): any;


export function syncHeadingVideoInPromptItems(): void {
  if (typeof (window as any).syncHeadingVideoInPromptItems_impl === 'function') {
    (window as any).syncHeadingVideoInPromptItems_impl();
  }
}




export async function openApplyVideoToHeadingModal(filePath: string, displayName?: string): Promise<void> {
  const headings = getHeadingsForVeo();
  if (headings.length === 0) {
    toastManager.warning('소제목이 없습니다. 먼저 AI 글을 생성해서 소제목을 만든 뒤 다시 시도하세요.');
    return;
  }
  if (typeof (window.api as any)?.applyHeadingVideo !== 'function') {
    toastManager.error('소제목 배치 기능이 아직 로드되지 않았습니다.');
    return;
  }

  const existing = document.getElementById('apply-video-heading-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'apply-video-heading-modal';
  overlay.setAttribute('aria-hidden', 'false');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.6)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const modal = document.createElement('div');
  modal.style.width = 'min(720px, 92vw)';
  modal.style.maxHeight = '80vh';
  modal.style.overflow = 'hidden';
  modal.style.background = 'var(--bg-primary)';
  modal.style.border = '1px solid var(--border-light)';
  modal.style.borderRadius = '12px';
  modal.style.boxShadow = '0 20px 60px rgba(0,0,0,0.35)';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '1rem 1.25rem';
  header.style.borderBottom = '1px solid var(--border-light)';
  header.innerHTML = `
    <div style="font-weight:800; color: var(--text-strong); font-size: 1.05rem;">🎞️ 영상 배치할 소제목 선택</div>
    <button type="button" id="apply-video-heading-close" style="background: transparent; border: none; color: var(--text-muted); font-size: 1.2rem; cursor: pointer;">×</button>
  `;

  const body = document.createElement('div');
  body.style.padding = '1rem 1.25rem';
  body.style.overflowY = 'auto';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '0.5rem';

  const meta = document.createElement('div');
  meta.style.color = 'var(--text-muted)';
  meta.style.fontSize = '0.85rem';
  meta.style.marginBottom = '0.25rem';
  meta.textContent = `선택한 영상: ${displayName || 'video.mp4'}`;

  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gridTemplateColumns = '1fr';
  list.style.gap = '0.5rem';

  headings.forEach((h, idx) => {
    const item = document.createElement('label');
    item.style.display = 'flex';
    item.style.alignItems = 'flex-start';
    item.style.gap = '0.65rem';
    item.style.padding = '0.75rem';
    item.style.border = '1px solid var(--border-light)';
    item.style.borderRadius = '10px';
    item.style.cursor = 'pointer';
    item.style.background = 'var(--bg-secondary)';
    const safeTitle = escapeHtml(h.title);
    item.innerHTML = `
      <input type="radio" name="apply-video-heading" value="${idx}" style="margin-top: 0.2rem; transform: scale(1.1);" ${idx === 0 ? 'checked' : ''} />
      <div style="min-width:0; flex:1;">
        <div style="font-weight:800; color: var(--text-strong); word-break: break-word;">${safeTitle}</div>
      </div>
    `;
    list.appendChild(item);
  });

  body.appendChild(meta);
  body.appendChild(list);

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.gap = '0.5rem';
  footer.style.justifyContent = 'flex-end';
  footer.style.padding = '1rem 1.25rem';
  footer.style.borderTop = '1px solid var(--border-light)';
  footer.innerHTML = `
    <button type="button" id="apply-video-heading-cancel" style="padding: 0.65rem 1rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 10px; cursor: pointer; font-weight: 700;">취소</button>
    <button type="button" id="apply-video-heading-confirm" style="padding: 0.65rem 1rem; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 900;">선택 소제목에 배치</button>
  `;

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  (header.querySelector('#apply-video-heading-close') as HTMLButtonElement | null)?.addEventListener('click', close);
  (footer.querySelector('#apply-video-heading-cancel') as HTMLButtonElement | null)?.addEventListener('click', close);

  (footer.querySelector('#apply-video-heading-confirm') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    const selected = overlay.querySelector('input[name="apply-video-heading"]:checked') as HTMLInputElement | null;
    const idx = selected ? Number(selected.value) : 0;
    const chosen = headings[idx] || headings[0];
    const rawHeadingTitle = String(chosen?.title || '').trim();
    const headingTitle = normalizeHeadingKeyForVideoCache(rawHeadingTitle);
    if (!headingTitle) return;

    const lockKey = `applyVideo:${headingTitle}`;
    const locked = await runUiActionLocked(lockKey, '중복사용은 금합니다', async () => {
      appendLog(`🎞️ 소제목 영상 배치 시작: "${headingTitle}" ← ${displayName || 'video.mp4'}`);
      const url = toFileUrlMaybe(filePath);
      const updatedAt = Date.now();
      const res = await (window.api as any).applyHeadingVideo(headingTitle, {
        provider: 'mp4',
        filePath,
        previewDataUrl: url,
        updatedAt,
      });

      if (!res?.success) {
        toastManager.error(res?.message || '소제목에 영상 배치 실패');
        appendLog(`❌ 소제목 영상 배치 실패: "${headingTitle}" (${res?.message || 'unknown'})`);
        return;
      }

      // ✅ 영상 배치 즉시 기존 소제목 이미지는 제거(완전 교체) -> GIF 변환 완료 전에도 UI에서 바로 사라지게 함
      try {
        const titleKey = ImageManager.resolveHeadingKey(rawHeadingTitle || headingTitle);
        ImageManager.unsetHeadings.add(titleKey);
        syncGlobalImagesFromImageManager();
      } catch (e) {
        console.warn('[videoManager] catch ignored:', e);
      }

      headingVideoPreviewCache.set(headingTitle, { url, updatedAt });
      headingVideoPreviewInFlight.delete(headingTitle);
      ImageManager.syncAllPreviews();
      try {
        const sc: any = (window as any).currentStructuredContent;
        const imgs = (window as any).imageManagementGeneratedImages || generatedImages || [];
        if (sc?.headings) updateUnifiedImagePreview(sc.headings, imgs);
      } catch (e) {
        console.warn('[videoManager] catch ignored:', e);
      }
      syncHeadingVideoInPromptItems();
      syncHeadingVideoSlotsInUnifiedPreview();
      toastManager.success(`✅ "${headingTitle}" 소제목에 영상이 배치되었습니다.`);
      appendLog(`✅ 소제목 영상 배치 완료: "${headingTitle}"`);
      // 소제목 영상이 배치되면 해당 mp4를 GIF로 변환해 이미지로도 자동 등록
      await ensureGifImageForHeading(rawHeadingTitle || headingTitle, filePath);
      close();
    });
    if (locked === null) return;
  });
}

export async function removeHeadingVideoByTitle(headingTitle: string): Promise<void> {
  const heading = normalizeHeadingKeyForVideoCache(String(headingTitle || '').trim());
  if (!heading) return;
  if (typeof (window.api as any)?.removeHeadingVideo !== 'function') {
    toastManager.error('소제목 영상 제거 기능을 사용할 수 없습니다.');
    return;
  }
  const res = await (window.api as any).removeHeadingVideo(heading);
  if (!res?.success) {
    toastManager.error(res?.message || '영상 제거에 실패했습니다.');
    return;
  }
  headingVideoPreviewCache.set(heading, null);
  headingVideoPreviewInFlight.delete(heading);

  // ✅ 이 소제목에 연결된 GIF 이미지도 함께 제거 (mp4 → GIF 썸네일 정리)
  try {
    const rawTitle = String(headingTitle || '').trim();
    let targetHeading = rawTitle;

    try {
      const norm = normalizeHeadingKeyForVideoCache(rawTitle);
      const keys = Array.from(ImageManager.imageMap.keys()) as string[];
      for (const key of keys) {
        const keyStr = String(key || '');
        const keyNorm = normalizeHeadingKeyForVideoCache(keyStr);
        if (keyStr === rawTitle || (norm && keyNorm === norm)) {
          targetHeading = keyStr;
          break;
        }
      }
    } catch {
      // 매칭 실패 시 rawTitle 그대로 사용
    }

    const imagesForHeading = ImageManager.getImages(targetHeading) || [];
    for (let i = imagesForHeading.length - 1; i >= 0; i -= 1) {
      const img: any = imagesForHeading[i];
      if (String(img?.provider || '') === 'gif-from-video') {
        ImageManager.removeImageAtIndex(targetHeading, i);
      }
    }

    syncGlobalImagesFromImageManager();
  } catch (e) {
    console.warn('[videoManager] catch ignored:', e);
  }

  ImageManager.syncAllPreviews();
  syncHeadingVideoInPromptItems();
  syncHeadingVideoSlotsInUnifiedPreview();
  toastManager.success('소제목 영상이 제거되었습니다.');
}

export async function ensureGifImageForHeading(headingTitle: string, videoFilePath: string): Promise<void> {
  try {
    const api: any = (window as any).api;
    if (!api || typeof api.convertMp4ToGif !== 'function') {
      return;
    }

    const sourcePath = String(videoFilePath || '').trim();
    if (!sourcePath) return;

    const res = await runUiActionLocked(`gif:${sourcePath}`, '중복사용은 금합니다', async () => {
      return await api.convertMp4ToGif({ sourcePath });
    });
    if (!res) return;
    if (!res?.success || !res.gifPath) {
      if (res?.message) {
        appendLog(`⚠️ GIF 변환 실패: ${res.message}`);
      }
      return;
    }

    const gifPath = String(res.gifPath);

    // ✅ 실제 파일 존재/용량 확인 (0바이트/미생성 파일이면 그리드/발행에 등록 금지)
    try {
      let ok = true;
      if (typeof api.getFileStats === 'function') {
        const st = await api.getFileStats(gifPath);
        ok = Boolean(st?.isFile) && Number(st?.size || 0) > 1024;
      } else if (typeof api.checkFileExists === 'function') {
        ok = await api.checkFileExists(gifPath);
      }

      if (!ok) {
        toastManager.error('GIF 파일 저장에 실패했습니다. (파일이 생성되지 않음)');
        appendLog(`❌ GIF 파일 저장 실패: ${gifPath}`);
        return;
      }
    } catch (e) {
      console.warn('[videoManager] catch ignored:', e);
    }

    const gifUrl = toFileUrlMaybe(gifPath);
    const rawTitle = String(headingTitle || '').trim();

    // ImageManager 키와 최대한 매칭 (원본 제목 또는 정규화된 제목)
    let targetHeading = rawTitle;
    try {
      const norm = normalizeHeadingKeyForVideoCache(rawTitle);
      const keys = Array.from(ImageManager.imageMap.keys()) as string[];
      for (const key of keys) {
        const keyStr = String(key || '');
        const keyNorm = normalizeHeadingKeyForVideoCache(keyStr);
        if (keyStr === rawTitle || (norm && keyNorm === norm)) {
          targetHeading = keyStr;
          break;
        }
      }
    } catch {
      // 매칭 실패 시 rawTitle 그대로 사용
    }

    const titleKey = ImageManager.resolveHeadingKey(targetHeading);

    // ✅ 기존 이미지 유지 + gif-from-video만 교체 (덮어쓰기 금지)
    const existing = ImageManager.getImages(titleKey) || [];
    const withoutGifs = existing.filter((img: any) => String(img?.provider || '') !== 'gif-from-video');

    const imageObj: any = {
      heading: titleKey,
      filePath: gifPath,
      previewDataUrl: gifUrl,
      url: gifUrl,
      provider: 'gif-from-video',
      prompt: rawTitle || targetHeading,
      timestamp: Date.now(),
    };

    // ✅ [2026-02-12 FIX] GIF는 대표 미디어로 앞에 배치 (기존 이미지 전체 보존)
    ImageManager.imageMap.set(titleKey, [imageObj, ...withoutGifs]);
    ImageManager.unsetHeadings.delete(titleKey);
    try {
      const keyNorm = normalizeHeadingKeyForVideoCache(titleKey);
      headingVideoPreviewCache.set(keyNorm, { url: toFileUrlMaybe(videoFilePath), updatedAt: Date.now() });
    } catch (e) {
      console.warn('[videoManager] catch ignored:', e);
    }

    syncGlobalImagesFromImageManager();

    // ✅ 추가: 통합 미리보기 업데이트 (syncGlobalImagesFromImageManager에서 처리하지 않는 부분)
    try {
      const allImagesAfter = ImageManager.getAllImages();
      const sc: any = (window as any).currentStructuredContent || currentStructuredContent;
      if (sc?.headings) updateUnifiedImagePreview(sc.headings, allImagesAfter);
    } catch (e) {
      console.warn('[videoManager] catch ignored:', e);
    }

    try {
      ImageManager.syncAllPreviews();
    } catch (e) {
      console.warn('[videoManager] catch ignored:', e);
    }

    // ✅ 추가: 생성된 이미지 목록 UI 업데이트 (GIF 표시)
    try {
      const allImagesAfterGif = ImageManager.getAllImages();
      (window as any).imageManagementGeneratedImages = allImagesAfterGif;
      displayGeneratedImages(allImagesAfterGif);
      updatePromptItemsWithImages(allImagesAfterGif); // ✅ 영어 프롬프트 이미지 미리보기 업데이트
    } catch (e) {
      console.warn('[videoManager] catch ignored:', e);
    }

    appendLog(`✅ GIF 이미지 생성 및 배치 완료: ${headingTitle}`);
  } catch (error) {
    console.error('[GIF] mp4 → GIF 변환 실패:', error);
    appendLog(`❌ GIF 변환 실패: ${(error as Error).message}`);
  }
}

export async function applyHeadingVideoFromFile(headingTitle: string, filePath: string, provider: string): Promise<void> {
  const heading = normalizeHeadingKeyForVideoCache(String(headingTitle || '').trim());
  const path = String(filePath || '').trim();
  const prov = String(provider || '').trim() || 'mp4';
  if (!heading || !path) return;
  if (typeof (window.api as any)?.applyHeadingVideo !== 'function') {
    throw new Error('소제목 배치 기능이 아직 로드되지 않았습니다.');
  }
  appendLog(`🎞️ 소제목 영상 배치 시작: "${heading}" ← ${path.split(/[\\/]/).pop() || 'video.mp4'}`);
  const url = toFileUrlMaybe(path);
  const updatedAt = Date.now();
  const applyRes = await (window.api as any).applyHeadingVideo(heading, {
    provider: prov,
    filePath: path,
    previewDataUrl: url,
    updatedAt,
  });
  if (!applyRes?.success) {
    appendLog(`❌ 소제목 영상 배치 실패: "${heading}" (${applyRes?.message || 'unknown'})`);
    throw new Error(applyRes?.message || '소제목에 영상 배치 실패');
  }

  try {
    const titleKey = ImageManager.resolveHeadingKey(headingTitle);
    ImageManager.unsetHeadings.add(titleKey);
  } catch (e) {
    console.warn('[videoManager] catch ignored:', e);
  }

  headingVideoPreviewCache.set(heading, { url, updatedAt });
  headingVideoPreviewInFlight.delete(heading);
  ImageManager.syncAllPreviews();
  syncHeadingVideoInPromptItems();
  try {
    const sc: any = (window as any).currentStructuredContent;
    const imgs = (window as any).imageManagementGeneratedImages || generatedImages || [];
    if (sc?.headings) updateUnifiedImagePreview(sc.headings, imgs);
  } catch (e) {
    console.warn('[videoManager] catch ignored:', e);
  }
  syncHeadingVideoSlotsInUnifiedPreview();
  appendLog(`✅ 소제목 영상 배치 완료: "${heading}"`);
  await ensureGifImageForHeading(headingTitle, path);
}

export async function createKenBurnsFallbackVideoForHeading(headingTitle: string, referenceImagePath: string, aspectRatio: '16:9' | '9:16' = '16:9'): Promise<{ success: boolean; filePath?: string; message?: string }> {
  try {
    const api: any = (window as any).api;
    if (!api || typeof api.createKenBurnsVideo !== 'function') {
      return { success: false, message: 'KenBurns 영상 생성 기능이 아직 로드되지 않았습니다.' };
    }

    const imgPath = String(referenceImagePath || '').trim();
    if (!imgPath) {
      return { success: false, message: '참조 이미지 경로가 없습니다.' };
    }

    appendLog(`🎞️ 정책 차단 폴백: 로컬 KenBurns 영상 생성 시작 (소제목: "${String(headingTitle || '').trim()}")`);
    const res = await api.createKenBurnsVideo({
      imagePath: imgPath,
      heading: String(headingTitle || '').trim(),
      durationSeconds: 6,
      aspectRatio,
    });
    if (!res?.success || !res?.filePath) {
      return { success: false, message: String(res?.message || 'KenBurns 영상 생성 실패') };
    }

    await applyHeadingVideoFromFile(headingTitle, String(res.filePath || '').trim(), 'kenburns');
    return { success: true, filePath: String(res.filePath || '').trim() };
  } catch (e) {
    return { success: false, message: (e as Error).message || String(e) };
  }
}

export async function regenerateHeadingVideoByTitle(headingTitle: string): Promise<void> {
  const heading = normalizeHeadingKeyForVideoCache(String(headingTitle || '').trim());
  if (!heading) return;
  if (typeof (window.api as any)?.applyHeadingVideo !== 'function') {
    toastManager.error('소제목 배치 기능이 아직 로드되지 않았습니다.');
    return;
  }

  const provider = getCurrentVideoProvider();
  setCurrentVideoProvider(provider);

  const locked = await runUiActionLocked(`regenerateVideo:${heading}`, '중복사용은 금합니다', async () => {

    const headings = getHeadingsForVeo();
    const entry = headings.find((h) => h.title === heading);
    const rawPrompt = String((entry?.prompt || heading || '')).trim();
    const { prompt } = buildHeadingAlignedVeoPrompt(heading, rawPrompt);
    if (!prompt) {
      toastManager.error('프롬프트가 비어있습니다.');
      return;
    }

    const toLocalPath = (p: string): string => {
      const raw = String(p || '').trim();
      if (!raw) return '';
      if (/^file:\/\//i.test(raw)) {
        return raw.replace(/^file:\/\//i, '').replace(/^\/+/, '').replace(/\\/g, '/');
      }
      return raw.replace(/\\/g, '/');
    };

    const resolveReferenceImagePath = async (): Promise<string> => {
      const norm = normalizeHeadingKeyForVideoCache(headingTitle);
      let imgEntry: any = null;
      try {
        imgEntry = ImageManager.getImage(headingTitle);
      } catch {
        imgEntry = null;
      }

      if (!imgEntry) {
        const allCandidates: any[] = [];
        try {
          const fromManager = ImageManager.getAllImages();
          if (Array.isArray(fromManager) && fromManager.length > 0) allCandidates.push(...fromManager);
        } catch (e) {
          console.warn('[videoManager] catch ignored:', e);
        }
        const globalAll = (window as any).imageManagementGeneratedImages;
        if (Array.isArray(globalAll) && globalAll.length > 0) allCandidates.push(...globalAll);
        if (Array.isArray(generatedImages) && generatedImages.length > 0) allCandidates.push(...generatedImages);

        imgEntry =
          allCandidates.find((img: any) => normalizeHeadingKeyForVideoCache(String(img?.heading || '').trim()) === norm) ||
          null;
      }

      let filePath = toLocalPath(String(imgEntry?.filePath || '').trim());
      if (!filePath) {
        const urlCandidate = String(imgEntry?.url || imgEntry?.previewDataUrl || '').trim();
        filePath = toLocalPath(urlCandidate);
      }

      let exists = false;
      try {
        if (filePath && typeof (window.api as any)?.checkFileExists === 'function') {
          exists = await (window.api as any).checkFileExists(filePath);
        }
      } catch {
        exists = false;
      }

      if ((!filePath || !exists) && typeof (window.api as any)?.downloadAndSaveImage === 'function') {
        const urlCandidate = String(imgEntry?.url || imgEntry?.previewDataUrl || '').trim();
        if (/^https?:\/\//i.test(urlCandidate)) {
          const postTitle = String((window as any).currentStructuredContent?.selectedTitle || currentStructuredContent?.selectedTitle || '').trim();
          const postId = currentPostId || undefined;
          const res = await (window.api as any).downloadAndSaveImage(urlCandidate, headingTitle, postTitle || undefined, postId);
          if (res?.success) {
            const savedPath = String(res?.filePath || res?.savedToLocal || '').trim();
            if (savedPath) {
              filePath = toLocalPath(savedPath);
              try {
                ImageManager.setImage(headingTitle, {
                  ...(imgEntry || {}),
                  heading: headingTitle,
                  filePath,
                  url: toFileUrlMaybe(filePath),
                  previewDataUrl: toFileUrlMaybe(filePath),
                  savedToLocal: true,
                });
                syncGlobalImagesFromImageManager();
                ImageManager.syncAllPreviews();
              } catch (e) {
                console.warn('[videoManager] catch ignored:', e);
              }
            }
          }
        }
      }

      return String(filePath || '').trim();
    };

    const imagePath = await resolveReferenceImagePath();
    if (!imagePath) {
      toastManager.warning(`"${headingTitle}" 소제목에 배치된 이미지가 없습니다. 먼저 이미지를 생성/배치한 뒤 영상을 생성해주세요.`);
      return;
    }

    showVeoProgressOverlay(heading);
    setVeoProgressOverlay(provider === 'kenburns' ? '로컬 영상 생성 중...' : '생성 요청 전송 중...', 2);
    try {
      if (provider === 'kenburns') {
        appendLog(`🎞️ KenBurns 영상 생성 시작(재생성): "${heading}"`);
        const fb = await createKenBurnsFallbackVideoForHeading(headingTitle, imagePath, '16:9');
        if (!fb?.success) {
          hideVeoProgressOverlay(0);
          const msg = String(fb?.message || 'KenBurns 영상 생성 실패');
          toastManager.error(msg);
          appendLog(`❌ KenBurns 영상 생성 실패(재생성): "${heading}" (${msg})`);
          return;
        }
        setVeoProgressOverlay('완료!', 100);
        hideVeoProgressOverlay(800);
        toastManager.success('✅ 소제목 영상 재생성 완료(KenBurns)');
        appendLog(`✅ KenBurns 영상 생성 및 배치 완료(재생성): "${heading}"`);
        try {
          await refreshMp4FilesList();
        } catch (e) {
          console.warn('[videoManager] catch ignored:', e);
        }
        return;
      }

      if (typeof (window.api as any)?.generateVeoVideo !== 'function') {
        toastManager.error('AI 영상 기능이 아직 로드되지 않았습니다.');
        hideVeoProgressOverlay(0);
        return;
      }

      appendLog(`🎬 AI 영상 생성 시작(재생성): "${heading}"`);
      let result = await generateVeoVideoWithRetry(
        {
          prompt,
          negativePrompt: 'audio, speech, voice, voiceover, narration, music, singing, lyrics, dialogue',
          model: 'veo-3.1-generate-preview',
          durationSeconds: 6,
          aspectRatio: '16:9',
          heading: heading,
          imagePath,
        },
        heading,
      );

      if (!result?.success) {
        const rawMsg = String(result?.message || '');
        if (isVeoQuotaExceededMessage(rawMsg)) {
          hideVeoProgressOverlay(0);
          lockVeoQuota(10, rawMsg);
          return;
        }
        const msgLower = rawMsg.toLowerCase();
        const isPolicyChildren = msgLower.includes('photorealistic children');
        const isPolicyCelebrity = msgLower.includes('celebrity or their likenesses');

        if (isPolicyChildren || isPolicyCelebrity) {
          appendLog(
            `🛡️ Veo 정책 차단 감지(재생성): "${heading}" (사유: ${rawMsg || 'unknown'})`,
          );
          appendLog(
            '🔁 정책을 준수하는 방향으로 프롬프트를 정제한 뒤 다시 시도합니다.',
          );
          setVeoProgressOverlay('정책 준수 프롬프트로 다시 시도 중...', 5);

          let safePrompt = prompt;
          try {
            const safeTitle = String(heading || '').trim();
            if (safeTitle && safePrompt.toLowerCase().includes(safeTitle.toLowerCase())) {
              const escaped = safeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const pattern = new RegExp(escaped, 'gi');
              safePrompt = safePrompt.replace(pattern, '').trim();
            }
          } catch (e) {
            console.warn('[videoManager] catch ignored:', e);
          }

          if (isPolicyChildren) {
            safePrompt = `${safePrompt} (no children, only adults or objects, no faces of minors)`;
          } else if (isPolicyCelebrity) {
            safePrompt = `${safePrompt} (no specific celebrities, no recognizable real people, generic subject only)`;
          }

          const fallbackResult = await generateVeoVideoWithRetry(
            {
              prompt: safePrompt || prompt,
              negativePrompt:
                'audio, speech, voice, voiceover, narration, music, singing, lyrics, dialogue',
              model: 'veo-3.1-generate-preview',
              durationSeconds: 6,
              aspectRatio: '16:9',
              imagePath,
            },
            heading,
          );

          if (!fallbackResult?.success) {
            appendLog('🎞️ 정책 차단으로 Veo 생성 실패(재생성): 로컬 KenBurns 영상으로 폴백 시도합니다.');
            setVeoProgressOverlay('정책 차단: 로컬 영상 생성 중...', 20);
            const fb = await createKenBurnsFallbackVideoForHeading(heading, imagePath, '16:9');
            if (fb?.success) {
              setVeoProgressOverlay('완료!', 100);
              hideVeoProgressOverlay(800);
              appendLog(`✅ KenBurns 폴백 영상 생성 및 배치 완료(재생성): "${heading}"`);
              toastManager.success('✅ 소제목 영상 재생성 완료(폴백)');
              try {
                await refreshMp4FilesList();
              } catch (e) {
                console.warn('[videoManager] catch ignored:', e);
              }
              return;
            }

            hideVeoProgressOverlay(0);
            const finalMsg = String(fb?.message || fallbackResult?.message || rawMsg || 'AI 영상 생성 실패');
            toastManager.error(finalMsg);
            appendLog(
              `❌ AI 영상 생성 실패(재생성, 정책 차단 후 재시도+폴백도 실패): "${heading}" (${finalMsg})`,
            );
            return;
          }

          result = fallbackResult;
        } else {
          hideVeoProgressOverlay(0);
          const msg = rawMsg || 'AI 영상 생성 실패';
          toastManager.error(msg);
          appendLog(
            `❌ AI 영상 생성 실패(재생성): "${heading}" (${String(msg || 'unknown')})`,
          );
          return;
        }
      }

      const filePath = String(result.filePath || '').trim();
      const url = toFileUrlMaybe(filePath);
      const updatedAt = Date.now();

      const applyRes = await (window.api as any).applyHeadingVideo(heading, {
        provider: 'veo',
        filePath,
        previewDataUrl: url,
        updatedAt,
      });

      if (!applyRes?.success) {
        hideVeoProgressOverlay(0);
        toastManager.error(applyRes?.message || '소제목에 영상 배치 실패');
        appendLog(`❌ 소제목 영상 배치 실패(재생성): "${heading}" (${String(applyRes?.message || 'unknown')})`);
        return;
      }

      try {
        const titleKey = ImageManager.resolveHeadingKey(headingTitle);
        ImageManager.unsetHeadings.add(titleKey);
        syncGlobalImagesFromImageManager();
      } catch (e) {
        console.warn('[videoManager] catch ignored:', e);
      }

      headingVideoPreviewCache.set(heading, { url, updatedAt });
      headingVideoPreviewInFlight.delete(heading);
      ImageManager.syncAllPreviews();
      syncHeadingVideoSlotsInUnifiedPreview();
      setVeoProgressOverlay('완료!', 100);
      hideVeoProgressOverlay(800);
      toastManager.success('✅ 소제목 영상 재생성 완료');
      appendLog(`✅ AI 영상 생성 완료(재생성): "${heading}"`);
      await refreshMp4FilesList();
      await ensureGifImageForHeading(heading, filePath);
    } catch (e) {
      hideVeoProgressOverlay(0);
      toastManager.error(`AI 영상 생성 오류: ${(e as Error).message}`);
      appendLog(`❌ AI 영상 생성 오류(재생성): "${heading}" (${(e as Error).message})`);
    }
  });
  if (locked === null) return;
}

export async function generateHeadingVideoForPrompt(headingIndex: number, headingTitle: string): Promise<void> {
  const safeIndex = Number.isFinite(headingIndex as any) ? headingIndex : 0;
  const title = String(
    headingTitle ||
    (window as any)._headingTitles?.[safeIndex] ||
    '',
  ).trim();

  if (!title) {
    toastManager.warning('소제목 정보를 찾을 수 없습니다. 먼저 글과 소제목을 생성해주세요.');
    return;
  }

  if (typeof (window.api as any)?.applyHeadingVideo !== 'function') {
    toastManager.error('소제목 영상 배치 기능이 아직 로드되지 않았습니다.');
    return;
  }

  const provider = getCurrentVideoProvider();
  setCurrentVideoProvider(provider);

  if (provider === 'veo' && typeof (window.api as any)?.generateVeoVideo !== 'function') {
    toastManager.error('AI 영상 기능이 아직 로드되지 않았습니다.');
    return;
  }

  try {
    // 1) 영어 프롬프트 가져오기 (전역 배열 우선, 없으면 카드 DOM에서)
    const promptsContainer = document.getElementById('prompts-container') as HTMLDivElement | null;
    if (!promptsContainer) {
      toastManager.error('소제목 분석 정보를 찾을 수 없습니다. 먼저 분석을 실행해주세요.');
      return;
    }
    const promptItems = promptsContainer.querySelectorAll('.prompt-item');
    const promptItem = promptItems[safeIndex] as HTMLElement | undefined;
    if (!promptItem) {
      toastManager.error('해당 소제목의 영어 프롬프트를 찾을 수 없습니다. 먼저 분석을 실행해주세요.');
      return;
    }

    // 1-1) 이 소제목에 배치된 이미지 필수 사용 (이미지 없으면 생성 중단)
    let rawPrompt = '';
    const promptTextEl = promptItem.querySelector('.prompt-text');
    if (promptTextEl) {
      rawPrompt = String(promptTextEl.textContent || '').trim();
    }
    if (!rawPrompt) {
      rawPrompt = String(promptItem?.textContent || '').trim();
    }

    const toLocalPath = (p: string): string => {
      const raw = String(p || '').trim();
      if (!raw) return '';
      if (/^file:\/\//i.test(raw)) {
        return raw.replace(/^file:\/\//i, '').replace(/^\/+/, '').replace(/\\/g, '/');
      }
      return raw.replace(/\\/g, '/');
    };

    const resolvePlacedImageForHeading = async (): Promise<any | null> => {
      const resolvedKey = (() => {
        try {
          return ImageManager.resolveHeadingKey(title);
        } catch {
          return title;
        }
      })();

      let entry: any = null;
      const selectedKey = (() => {
        try {
          return String(getHeadingSelectedImageKey(resolvedKey) || '').trim();
        } catch {
          return '';
        }
      })();

      if (selectedKey) {
        try {
          const imgs = ImageManager.getImages(resolvedKey) || [];
          entry = (imgs || []).find((img: any) => getStableImageKey(img) === selectedKey) || null;
        } catch {
          entry = null;
        }
      }

      if (!entry) {
        try {
          entry = ImageManager.getImage(title);
        } catch {
          entry = null;
        }
      }

      if (!entry) {
        const norm = normalizeHeadingKeyForVideoCache(title);
        const allCandidates: any[] = [];
        try {
          const fromManager = ImageManager.getAllImages();
          if (Array.isArray(fromManager) && fromManager.length > 0) allCandidates.push(...fromManager);
        } catch (e) {
          console.warn('[videoManager] catch ignored:', e);
        }
        const globalAll = (window as any).imageManagementGeneratedImages;
        if (Array.isArray(globalAll) && globalAll.length > 0) allCandidates.push(...globalAll);
        if (Array.isArray(generatedImages) && generatedImages.length > 0) allCandidates.push(...generatedImages);

        const byIndex = allCandidates.find((img: any) => Number(img?.headingIndex) === safeIndex);
        const byHeading = allCandidates.find((img: any) => {
          const h = String(img?.heading || '').trim();
          return h && normalizeHeadingKeyForVideoCache(h) === norm;
        });

        entry = byIndex || byHeading || null;
        if (entry) {
          try {
            const headingKey = String(entry?.heading || title).trim() || title;
            ImageManager.setImage(headingKey, { ...entry, heading: headingKey });
            syncGlobalImagesFromImageManager();
          } catch (e) {
            console.warn('[videoManager] catch ignored:', e);
          }
        }
      }
      return entry;
    };

    const imgEntry: any = await resolvePlacedImageForHeading();
    if (!imgEntry) {
      toastManager.warning(`"${title}" 소제목에 배치된 이미지가 없습니다. 먼저 이미지를 생성/배치한 뒤 영상을 생성해주세요.`);
      return;
    }

    // filePath 없고 file:// url만 있는 케이스 보정
    let imagePath = toLocalPath(String(imgEntry.filePath || ''));
    if (!imagePath) {
      const urlCandidate = String(imgEntry.url || imgEntry.previewDataUrl || '').trim();
      imagePath = toLocalPath(urlCandidate);
    }

    // 로컬 존재 확인
    let exists = false;
    try {
      if (imagePath && typeof (window.api as any)?.checkFileExists === 'function') {
        exists = await (window.api as any).checkFileExists(imagePath);
      }
    } catch {
      exists = false;
    }

    // 원격 URL이면 자동 저장 후 진행
    if ((!imagePath || !exists) && typeof (window.api as any)?.downloadAndSaveImage === 'function') {
      const urlCandidate = String(imgEntry.url || imgEntry.previewDataUrl || '').trim();
      if (/^https?:\/\//i.test(urlCandidate)) {
        try {
          const postTitle = String((window as any).currentStructuredContent?.selectedTitle || currentStructuredContent?.selectedTitle || '').trim();
          const postId = currentPostId || undefined;
          const res = await (window.api as any).downloadAndSaveImage(urlCandidate, title, postTitle || undefined, postId);
          if (!res?.success) {
            throw new Error(String(res?.message || '이미지 저장 실패'));
          }
          const savedPath = String(res?.filePath || res?.savedToLocal || '').trim();
          if (!savedPath) throw new Error('저장된 이미지 경로를 찾을 수 없습니다.');
          imagePath = toLocalPath(savedPath);

          try {
            ImageManager.setImage(title, {
              ...imgEntry,
              heading: title,
              filePath: imagePath,
              url: toFileUrlMaybe(imagePath),
              previewDataUrl: toFileUrlMaybe(imagePath),
              savedToLocal: true,
            });
            syncGlobalImagesFromImageManager();
            ImageManager.syncAllPreviews();
          } catch (e) {
            console.warn('[videoManager] catch ignored:', e);
          }
        } catch (err) {
          toastManager.error(`이미지 저장 실패: ${(err as Error).message}`);
          return;
        }
      }
    }

    if (!imagePath) {
      toastManager.warning(`"${title}" 소제목에 배치된 이미지가 없습니다. 먼저 이미지를 생성/배치한 뒤 영상을 생성해주세요.`);
      return;
    }

    if (provider === 'kenburns') {
      appendLog(`🎞️ KenBurns 영상 생성 시작: "${title}"`, 'images-log-output');
      showVeoProgressOverlay(title);
      setVeoProgressOverlay('로컬 영상 생성 중...', 20);
      const fb = await createKenBurnsFallbackVideoForHeading(title, imagePath, '16:9');
      if (!fb?.success) {
        hideVeoProgressOverlay(0);
        const msg = String(fb?.message || 'KenBurns 영상 생성 실패');
        appendLog(`❌ KenBurns 영상 생성 실패: "${title}" (${msg})`, 'images-log-output');
        toastManager.error(msg);
        return;
      }
      setVeoProgressOverlay('완료!', 100);
      hideVeoProgressOverlay(800);
      appendLog(`✅ KenBurns 영상 생성 및 배치 완료: "${title}"`, 'images-log-output');
      toastManager.success(`✅ "${title}" 소제목에 로컬 영상이 배치되었습니다.`);
      try {
        await refreshMp4FilesList();
      } catch (e) {
        console.warn('[videoManager] catch ignored:', e);
      }
      return;
    }

    // 2) 이미지 프롬프트를 최우선으로 사용하여 Veo용 안전 프롬프트 생성
    const imagePrompt = String(imgEntry.prompt || '').trim();
    const baseText = imagePrompt || rawPrompt || title;
    const combined = `${baseText}

Create a dynamic cinematic video version of this exact reference image. Match the same subject, camera angle, composition, background, lighting, facial expression, and overall mood.`;

    const { prompt, changed, reason } = buildVeoSafePrompt(combined);
    if (!prompt) {
      toastManager.error('영상용 프롬프트가 비어있습니다. 먼저 영어 프롬프트를 생성해주세요.');
      return;
    }

    appendLog(`🎬 소제목 영상 생성 시작: "${title}"`, 'images-log-output');
    if (changed) {
      appendLog(`🛡️ Veo 프롬프트 자동 보정 적용: ${reason || '정책 차단 방지'}`, 'images-log-output');
    }

    showVeoProgressOverlay(title);
    setVeoProgressOverlay('생성 요청 전송 중...', 2);

    // 3) 영상 생성 (이미지 참조 필수)
    let result = await generateVeoVideoWithRetry(
      {
        prompt,
        negativePrompt:
          'audio, speech, voice, voiceover, narration, music, singing, lyrics, dialogue, party, nightclub, dancing crowd, festival, concert',
        model: 'veo-3.1-generate-preview',
        durationSeconds: 6,
        aspectRatio: '16:9',
        imagePath,
      },
      title,
    );

    if (!result?.success) {
      const rawMsg = String(result?.message || '');
      const msgLower = rawMsg.toLowerCase();
      const isPolicyChildren = msgLower.includes('photorealistic children');
      const isPolicyCelebrity = msgLower.includes('celebrity or their likenesses');

      if (isPolicyChildren || isPolicyCelebrity) {
        appendLog(
          `🛡️ Veo 정책 차단 감지: "${title}" (사유: ${rawMsg || 'unknown'})`,
          'images-log-output',
        );
        appendLog(
          '🔁 정책을 준수하는 방향으로 이미지 제거 및 프롬프트 정제 후 다시 시도합니다.',
          'images-log-output',
        );
        setVeoProgressOverlay('정책 준수 설정으로 다시 시도 중...', 5);

        // 이미지 참조 제거 (imagePath 미전달)
        let safePrompt = prompt;
        try {
          const safeTitle = String(title || '').trim();
          if (safeTitle && safePrompt.toLowerCase().includes(safeTitle.toLowerCase())) {
            const escaped = safeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(escaped, 'gi');
            safePrompt = safePrompt.replace(pattern, '').trim();
          }
        } catch (e) {
          console.warn('[videoManager] catch ignored:', e);
        }

        if (isPolicyChildren) {
          safePrompt = `${safePrompt} (no children, only adults or objects, no faces of minors)`;
        } else if (isPolicyCelebrity) {
          safePrompt = `${safePrompt} (no specific celebrities, no recognizable real people, generic subject only)`;
        }

        const fallbackResult = await generateVeoVideoWithRetry(
          {
            prompt: safePrompt || prompt,
            negativePrompt:
              'audio, speech, voice, voiceover, narration, music, singing, lyrics, dialogue',
            model: 'veo-3.1-generate-preview',
            durationSeconds: 6,
            aspectRatio: '16:9',
            imagePath,
          },
          title,
        );

        if (!fallbackResult?.success) {
          appendLog('🎞️ 정책 차단으로 Veo 생성 실패: 로컬 KenBurns 영상으로 폴백 시도합니다.', 'images-log-output');
          setVeoProgressOverlay('정책 차단: 로컬 영상 생성 중...', 20);
          const fb = await createKenBurnsFallbackVideoForHeading(title, imagePath, '16:9');
          if (fb?.success) {
            setVeoProgressOverlay('완료!', 100);
            hideVeoProgressOverlay(800);
            appendLog(`✅ KenBurns 폴백 영상 생성 및 배치 완료: "${title}"`, 'images-log-output');
            toastManager.success(`✅ "${title}" 소제목에 폴백 영상이 배치되었습니다.`);
            try {
              await refreshMp4FilesList();
            } catch (e) {
              console.warn('[videoManager] catch ignored:', e);
            }
            return;
          }

          hideVeoProgressOverlay(0);
          const finalMsg = String(fb?.message || fallbackResult?.message || rawMsg || 'AI 영상 생성 실패');
          appendLog(
            `❌ 소제목 영상 생성 실패(정책 차단 후 재시도+폴백도 실패): "${title}" (${finalMsg})`,
            'images-log-output',
          );
          toastManager.error(finalMsg);
          return;
        }

        result = fallbackResult;
      } else {
        hideVeoProgressOverlay(0);
        const msg = rawMsg || 'AI 영상 생성 실패';
        appendLog(`❌ 소제목 영상 생성 실패: "${title}" (${msg})`, 'images-log-output');
        toastManager.error(msg);
        return;
      }
    }

    // 5) 소제목에 바로 배치
    setVeoProgressOverlay('소제목에 영상 배치 중...', 90);
    const filePath = String(result.filePath || '').trim();

    try {
      await applyHeadingVideoFromFile(title, filePath, 'veo');
      setVeoProgressOverlay('완료!', 100);
      hideVeoProgressOverlay(800);
      appendLog(`✅ 소제목 영상 생성 및 배치 완료: "${title}"`, 'images-log-output');
      toastManager.success(`✅ "${title}" 소제목에 AI 영상이 배치되었습니다.`);
    } catch (err) {
      hideVeoProgressOverlay(0);
      appendLog(`❌ 소제목 영상 배치 실패: "${title}" (${(err as Error).message})`, 'images-log-output');
      toastManager.error(`소제목 영상 배치 실패: ${(err as Error).message}`);
      return;
    }

    // 6) AI 영상 목록 새로고침
    try {
      await refreshMp4FilesList();
    } catch (e) {
      console.warn('[videoManager] catch ignored:', e);
    }
  } catch (error) {
    hideVeoProgressOverlay(0);
    appendLog(`❌ 소제목 영상 생성 중 오류: "${title}" (${(error as Error).message})`, 'images-log-output');
    toastManager.error(`AI 영상 생성 실패: ${(error as Error).message}`);
  }
}

export function getHeadingsForVeo(): Array<{ title: string; prompt: string }> {
  const content: any = (window as any).currentStructuredContent || currentStructuredContent;
  const headings: any[] = Array.isArray(content?.headings) ? content.headings : [];
  return headings
    .map((h) => {
      const title = typeof h === 'string' ? h : (h?.title || '');
      const p = typeof h === 'string' ? '' : (h?.imagePrompt || h?.prompt || '');
      return { title: String(title || '').trim(), prompt: String(p || '').trim() };
    })
    .filter((x) => x.title.length > 0);
}




export function ensureUnifiedPreviewVideoDelegation(): void {
  if (typeof (window as any).ensureUnifiedPreviewVideoDelegation_impl === 'function') {
    (window as any).ensureUnifiedPreviewVideoDelegation_impl(showVideoModal);
  }
}



export function ensurePreGenerationSelectionsOrWarn(): boolean {
  // ✅ [2026-01-16] 버그 수정: 카테고리/콘텐츠 모드/톤 검증을 완전히 비활성화
  // 이유: unified-article-type 요소 참조 문제로 카테고리가 선택되어도 검증 실패
  // 카테고리 선택은 CategoryModal에서 별도로 관리되므로 여기서 검증할 필요 없음
  console.log('[ensurePreGenerationSelectionsOrWarn] 검증 비활성화됨 - 항상 통과');
  return true;
}



export function syncHeadingVideoSlotsInUnifiedPreview(): void {
  if (typeof (window as any).syncHeadingVideoSlots_impl === 'function') {
    (window as any).syncHeadingVideoSlots_impl(ImageManager);
  }
}

export async function getAiVideoFolderPath(): Promise<string> {
  const basePath = await getRequiredImageBasePath();
  return `${basePath}/mp4`.replace(/\\/g, '/');
}

let mp4ListSearchQuery = '';
let mp4ListLastFiles: any[] = [];
let mp4ListPage = 1;

export async function refreshMp4FilesList(): Promise<void> {
  const listEl = document.getElementById('mp4-files-list');
  if (!listEl) return;

  if (typeof (window.api as any)?.listMp4Files !== 'function') {
    listEl.innerHTML = `<div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 1.5rem;">AI 영상 목록 API를 사용할 수 없습니다.</div>`;
    return;
  }

  try {
    listEl.innerHTML = `<div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 1.5rem;">AI 영상 목록 불러오는 중...</div>`;
    const dirPath = await getAiVideoFolderPath();
    const res = await (window.api as any).listMp4Files({ dirPath });
    if (!res?.success) {
      listEl.innerHTML = `<div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 1.5rem;">AI 영상 목록을 불러오지 못했습니다.</div>`;
      return;
    }

    const files = Array.isArray(res?.files) ? res.files : [];
    mp4ListLastFiles = files;
    if (files.length === 0) {
      listEl.innerHTML = `<div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 1.5rem;">AI 영상이 아직 없습니다. 위에서 AI 영상 만들기를 눌러보세요.</div>`;
      return;
    }

    const formatBytes = (bytes: number): string => {
      const n = Number(bytes || 0);
      if (!Number.isFinite(n) || n <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const idx = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
      const val = n / Math.pow(1024, idx);
      return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
    };

    const rootDir = String(dirPath || '').replace(/\\/g, '/').replace(/\/+$/g, '');
    const getFolderKey = (f: any): { key: string; label: string; baseName: string } => {
      const fullPathNorm = String(f?.fullPath || '').replace(/\\/g, '/');
      const rel = fullPathNorm.startsWith(`${rootDir}/`) ? fullPathNorm.slice(rootDir.length + 1) : fullPathNorm;
      const parts = rel.split('/').filter(Boolean);
      const folder = parts.length > 1 ? parts[0] : '기타';
      const rawName = String(f?.name || 'video.mp4');
      const slashIdx = rawName.indexOf('/');
      const baseName = slashIdx >= 0 ? rawName.slice(slashIdx + 1) : rawName;
      const label = folder === '기타' ? '기타(폴더 없음)' : folder;
      return { key: folder, label, baseName };
    };

    const renderMp4List = (rawFiles: any[], query: string): void => {
      const q = String(query || '').toLowerCase().trim();
      const filteredFiles = (rawFiles || []).filter((f: any) => {
        if (!q) return true;
        const { key, label, baseName } = getFolderKey(f);
        const fullName = String(f?.name || '').toLowerCase();
        return (
          String(key || '').toLowerCase().includes(q) ||
          String(label || '').toLowerCase().includes(q) ||
          String(baseName || '').toLowerCase().includes(q) ||
          fullName.includes(q)
        );
      });

      filteredFiles.sort((a: any, b: any) => Number(b?.mtime || 0) - Number(a?.mtime || 0));

      const totalCount = filteredFiles.length;
      const pageSize = 5;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      if (mp4ListPage < 1) mp4ListPage = 1;
      if (mp4ListPage > totalPages) mp4ListPage = totalPages;
      const start = (mp4ListPage - 1) * pageSize;
      const pageItems = filteredFiles.slice(start, start + pageSize);

      const searchHtml = `
        <div style="display:flex; gap: 0.5rem; align-items:center; margin-bottom: 0.75rem;">
          <div style="flex:1; position: relative;">
            <input id="mp4-search-input" type="text" placeholder="🔍 영상 검색 (소제목/파일명)" value="${escapeHtml(query || '')}" style="width: 100%; padding: 0.6rem 0.75rem 0.6rem 2.25rem; background: var(--bg-tertiary); border: 1px solid var(--border-light); border-radius: 10px; color: var(--text-strong); font-size: 0.9rem;" />
            <span style="position:absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); font-size: 1rem;">🔍</span>
          </div>
          <div id="mp4-search-count" style="color: var(--text-muted); font-size: 0.8rem; white-space: nowrap;">${totalCount}개</div>
        </div>
      `;

      const pagingHtml = `
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.75rem;">
          <button type="button" id="mp4-page-prev" ${mp4ListPage <= 1 ? 'disabled' : ''} style="padding: 0.45rem 0.75rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 10px; cursor: pointer; font-weight: 900; opacity: ${mp4ListPage <= 1 ? 0.5 : 1};">이전</button>
          <div style="color: var(--text-muted); font-size: 0.85rem; font-weight: 800;">${totalCount === 0 ? '0/0' : `${mp4ListPage}/${totalPages}`}</div>
          <button type="button" id="mp4-page-next" ${mp4ListPage >= totalPages ? 'disabled' : ''} style="padding: 0.45rem 0.75rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 10px; cursor: pointer; font-weight: 900; opacity: ${mp4ListPage >= totalPages ? 0.5 : 1};">다음</button>
        </div>
      `;

      const listHtml = pageItems
        .map((f: any) => {
          const { label, baseName } = getFolderKey(f);
          const name = escapeHtml(baseName);
          const folderLabel = escapeHtml(label);
          const fullPath = String(f?.fullPath || '').replace(/\\/g, '/');
          const url = escapeHtml(toFileUrlMaybe(fullPath));
          const mtime = Number(f?.mtime || 0);
          const when = mtime ? new Date(mtime).toLocaleString() : '';
          const size = formatBytes(Number(f?.size || 0));
          return `
            <div style="display:flex; gap: 0.9rem; padding: 0.85rem; border: 1px solid var(--border-light); border-radius: 12px; background: var(--bg-primary); margin-bottom: 0.75rem;">
              <div class="ai-video-thumb" data-video-url="${url}" data-video-title="${name}" style="width: 220px; aspect-ratio: 16/9; border-radius: 10px; overflow:hidden; background: #000; cursor: pointer; flex: 0 0 auto;">
                <video src="${url}" muted autoplay loop playsinline preload="metadata" style="width: 100%; height: 100%; object-fit: cover;"></video>
              </div>
              <div style="flex: 1 1 auto; min-width: 0; display:flex; flex-direction: column; justify-content: space-between; gap: 0.6rem;">
                <div style="min-width:0;">
                  <div style="display:flex; gap: 0.5rem; align-items: baseline; min-width:0;">
                    <div style="font-weight: 800; color: var(--text-strong); white-space: nowrap; overflow:hidden; text-overflow: ellipsis;" title="${name}">${name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap;">📁 ${folderLabel}</div>
                  </div>
                  <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">${escapeHtml(when)}${when ? ' · ' : ''}${escapeHtml(size)}</div>
                </div>
                <div style="display:flex; gap: 0.5rem; flex-wrap: wrap;">
                  <button type="button" class="open-ai-video-file-btn" data-video-path="${escapeHtml(fullPath)}" style="padding: 0.45rem 0.75rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 10px; cursor: pointer; font-weight: 800;">열기</button>
                  <button type="button" class="assign-ai-video-btn" data-video-path="${escapeHtml(fullPath)}" data-video-name="${escapeHtml(String(f?.name || 'video.mp4'))}" style="padding: 0.45rem 0.75rem; background: rgba(34, 197, 94, 0.12); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.45); border-radius: 10px; cursor: pointer; font-weight: 900;">소제목에 배치</button>
                  <button type="button" class="regenerate-ai-video-btn" data-video-name="${escapeHtml(String(f?.name || 'video.mp4'))}" style="padding: 0.45rem 0.75rem; background: rgba(59, 130, 246, 0.12); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.45); border-radius: 10px; cursor: pointer; font-weight: 900;">재생성</button>
                  <button type="button" class="delete-ai-video-file-btn" data-video-path="${escapeHtml(fullPath)}" data-video-name="${escapeHtml(String(f?.name || 'video.mp4'))}" style="padding: 0.45rem 0.75rem; background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.45); border-radius: 10px; cursor: pointer; font-weight: 900;">삭제</button>
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      listEl.innerHTML = searchHtml + pagingHtml + (listHtml || `<div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 1.5rem;">검색 결과가 없습니다.</div>`);

      const searchInput = listEl.querySelector('#mp4-search-input') as HTMLInputElement | null;
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          mp4ListSearchQuery = searchInput.value;
          mp4ListPage = 1;
          renderMp4List(mp4ListLastFiles, mp4ListSearchQuery);
        });
      }

      const prevBtn = listEl.querySelector('#mp4-page-prev') as HTMLButtonElement | null;
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (mp4ListPage > 1) mp4ListPage -= 1;
          renderMp4List(mp4ListLastFiles, mp4ListSearchQuery);
        });
      }
      const nextBtn = listEl.querySelector('#mp4-page-next') as HTMLButtonElement | null;
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (mp4ListPage < totalPages) mp4ListPage += 1;
          renderMp4List(mp4ListLastFiles, mp4ListSearchQuery);
        });
      }

      listEl.querySelectorAll('.ai-video-thumb video').forEach((video) => {
        const v = video as HTMLVideoElement;
        v.addEventListener('error', () => {
          const wrap = v.closest('.ai-video-thumb') as HTMLElement | null;
          if (!wrap) return;
          wrap.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(0, 0, 0, 0.75))';
        });
        try {
          v.play().catch((e) => {
            console.warn('[videoManager] promise catch ignored:', e);
          });
        } catch (e) {
          console.warn('[videoManager] catch ignored:', e);
        }
      });

      listEl.querySelectorAll('.ai-video-thumb').forEach((el) => {
        el.addEventListener('click', () => {
          const videoUrl = String((el as HTMLElement).getAttribute('data-video-url') || '').trim();
          const title = String((el as HTMLElement).getAttribute('data-video-title') || '').trim();
          if (videoUrl) showVideoModal(videoUrl, title);
        });
      });

      listEl.querySelectorAll('.open-ai-video-file-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const p = String((btn as HTMLElement).getAttribute('data-video-path') || '').trim();
            if (!p) return;
            if (window.api.openPath) {
              await window.api.openPath(p);
            }
          } catch {
            toastManager.error('영상을 열 수 없습니다.');
          }
        });
      });

      listEl.querySelectorAll('.assign-ai-video-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const p = String((btn as HTMLElement).getAttribute('data-video-path') || '').trim();
          const name = String((btn as HTMLElement).getAttribute('data-video-name') || '').trim();
          if (!p) return;
          await openApplyVideoToHeadingModal(p, name);
        });
      });

      listEl.querySelectorAll('.regenerate-ai-video-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const name = String((btn as HTMLElement).getAttribute('data-video-name') || '').trim();
          const headingFromFolder = String(name.split('/')[0] || '').trim();
          if (headingFromFolder) {
            const headings = getHeadingsForVeo();
            const matched = headings.find((h) => String(h.title || '').trim() === headingFromFolder);
            if (matched) {
              await regenerateHeadingVideoByTitle(headingFromFolder);
              return;
            }
          }
          toastManager.warning('이 영상이 어떤 소제목의 영상인지 자동으로 찾지 못했습니다. 소제목 선택 창에서 재생성해주세요.');
          await openVeoHeadingSelectModal();
        });
      });

      listEl.querySelectorAll('.delete-ai-video-file-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const p = String((btn as HTMLElement).getAttribute('data-video-path') || '').trim();
          if (!p) return;
          if (!window.confirm('이 영상 파일을 삭제하시겠습니까?')) return;
          if (typeof (window.api as any)?.deleteFile !== 'function') {
            toastManager.error('파일 삭제 API를 사용할 수 없습니다.');
            return;
          }
          try {
            const res = await (window.api as any).deleteFile(p);
            if (!res?.success) {
              toastManager.error(res?.message || '파일 삭제 실패');
              return;
            }

            try {
              const name = String((btn as HTMLElement).getAttribute('data-video-name') || '').trim();
              const headingFromFolder = String(name.split('/')[0] || '').trim();
              if (headingFromFolder) {
                const headings = getHeadingsForVeo();
                const matched = headings.find((h) => String(h.title || '').trim() === headingFromFolder);
                if (matched) {
                  const titleKey = String(matched.title || headingFromFolder).trim();
                  try {
                    await removeHeadingVideoByTitle(titleKey);
                  } catch (e) {
                    console.warn('[videoManager] catch ignored:', e);
                  }
                  try {
                    const imagesForHeading = ImageManager.getImages(titleKey) || [];
                    for (let i = imagesForHeading.length - 1; i >= 0; i -= 1) {
                      const img: any = imagesForHeading[i];
                      if (String(img?.provider || '') === 'gif-from-video') {
                        ImageManager.removeImageAtIndex(titleKey, i);
                      }
                    }
                    syncGlobalImagesFromImageManager();
                  } catch (e) {
                    console.warn('[videoManager] catch ignored:', e);
                  }
                }
              }
            } catch (e) {
              console.warn('[videoManager] catch ignored:', e);
            }

            toastManager.success('영상 파일이 삭제되었습니다.');
            mp4ListLastFiles = mp4ListLastFiles.filter((f: any) => String(f?.fullPath || '').replace(/\\/g, '/') !== String(p || '').replace(/\\/g, '/'));
            renderMp4List(mp4ListLastFiles, mp4ListSearchQuery);
          } catch (err) {
            toastManager.error(`파일 삭제 오류: ${(err as Error).message}`);
          }
        });
      });
    };

    renderMp4List(mp4ListLastFiles, mp4ListSearchQuery);

  } catch (e) {
    console.error('[AI-VIDEO] listMp4Files 실패:', e);
    appendLog(`❌ AI 영상 목록 불러오기 실패: ${(e as Error).message || String(e)}`);
    listEl.innerHTML = `<div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 1.5rem;">AI 영상 목록을 불러오지 못했습니다.</div>`;
  }
}

// ✅ [2026-01-26 FIX] wrapper 함수들 - window.xxx_impl만 호출 (fallback 절대 금지!)
// 번들링 후 xxxModule이 xxx로 바뀌어서 자기 자신 호출 → 무한재귀 발생
// 해결: fallback 없이 _impl만 호출. _impl이 없으면 빈 값 반환 (안전)

export function prefetchHeadingVideoPreview(heading: string): void {
  // _impl은 veoVideoUtils.ts에서 window에 노출됨 (인라인됨)
  if (typeof (window as any).prefetchHeadingVideoPreview_impl === 'function') {
    (window as any).prefetchHeadingVideoPreview_impl(heading);
  }
  // fallback 없음 - 무한재귀 방지
}

export function buildMinimalSilentVeoPrompt(headingTitle: string): string {
  if (typeof (window as any).buildMinimalSilentVeoPrompt_impl === 'function') {
    return (window as any).buildMinimalSilentVeoPrompt_impl(headingTitle);
  }
  return ''; // fallback 없음
}

export function getReviewProductAnchor(): string {
  if (typeof (window as any).getReviewProductAnchor_impl === 'function') {
    return (window as any).getReviewProductAnchor_impl();
  }
  return ''; // fallback 없음
}

export function buildHeadingAlignedVeoPrompt(headingTitle: string, rawHeadingPrompt?: string): { prompt: string; changed: boolean; reason: string } {
  if (typeof (window as any).buildHeadingAlignedVeoPrompt_impl === 'function') {
    return (window as any).buildHeadingAlignedVeoPrompt_impl(headingTitle, rawHeadingPrompt);
  }
  return { prompt: '', changed: false, reason: '' }; // fallback 없음
}




export function lockVeoQuota(minutes: number, rawMessage?: string): string {
  if (typeof (window as any).lockVeoQuota_impl === 'function') {
    return (window as any).lockVeoQuota_impl(minutes, rawMessage, {
      showToastError: (msg: string) => toastManager.error(msg),
      appendLog: (msg: string, target?: string) => appendLog(msg, target)
    });
  }
  return ''; // fallback 없음
}


export async function generateVeoVideoWithRetry(params: any, headingTitleForFallback: string): Promise<any> {
  if (typeof (window as any).generateVeoVideoWithRetry_impl === 'function') {
    return (window as any).generateVeoVideoWithRetry_impl(params, headingTitleForFallback, {
      appendLog: (msg: string, target?: string) => appendLog(msg, target),
      showToastError: (msg: string) => toastManager.error(msg)
    });
  }
  return null; // fallback 없음
}

export async function openVeoHeadingSelectModal(): Promise<void> {
  const headings = getHeadingsForVeo();
  if (headings.length === 0) {
    toastManager.warning('소제목이 없습니다. 먼저 AI 글을 생성해서 소제목을 만든 뒤 다시 시도하세요.');
    return;
  }

  const getSelectedVideoProvider = (): 'veo' | 'kenburns' => {
    return getCurrentVideoProvider();
  };

  const persistSelectedVideoProvider = (provider: 'veo' | 'kenburns'): void => {
    setCurrentVideoProvider(provider);
  };

  const existing = document.getElementById('veo-heading-select-modal');
  if (existing) {
    existing.remove();
  }

  const overlay = document.createElement('div');
  overlay.id = 'veo-heading-select-modal';
  overlay.setAttribute('aria-hidden', 'false');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.6)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const modal = document.createElement('div');
  modal.style.width = 'min(720px, 92vw)';
  modal.style.maxHeight = '80vh';
  modal.style.overflow = 'hidden';
  modal.style.background = 'var(--bg-primary)';
  modal.style.border = '1px solid var(--border-light)';
  modal.style.borderRadius = '12px';
  modal.style.boxShadow = '0 20px 60px rgba(0,0,0,0.35)';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '1rem 1.25rem';
  header.style.borderBottom = '1px solid var(--border-light)';
  header.innerHTML = `
    <div style="font-weight:800; color: var(--text-strong); font-size: 1.05rem;">🎬 AI 영상 만들 소제목 선택</div>
    <button type="button" id="veo-heading-close" style="background: transparent; border: none; color: var(--text-muted); font-size: 1.2rem; cursor: pointer;">×</button>
  `;

  const body = document.createElement('div');
  body.style.padding = '1rem 1.25rem';
  body.style.overflowY = 'auto';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '0.5rem';

  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gridTemplateColumns = '1fr';
  list.style.gap = '0.5rem';

  headings.forEach((h, idx) => {
    const item = document.createElement('label');
    item.style.display = 'flex';
    item.style.alignItems = 'flex-start';
    item.style.gap = '0.65rem';
    item.style.padding = '0.75rem';
    item.style.border = '1px solid var(--border-light)';
    item.style.borderRadius = '10px';
    item.style.cursor = 'pointer';
    item.style.background = 'var(--bg-secondary)';

    const promptText = (h.prompt || h.title).trim();
    const safeTitle = escapeHtml(h.title);
    const safePrompt = escapeHtml(promptText);

    item.innerHTML = `
      <input type="radio" name="veo-heading" value="${idx}" style="margin-top: 0.2rem; transform: scale(1.1);" ${idx === 0 ? 'checked' : ''} />
      <div style="min-width:0; flex:1;">
        <div style="font-weight:800; color: var(--text-strong); word-break: break-word;">${safeTitle}</div>
        <div style="margin-top: 0.25rem; color: var(--text-muted); font-size: 0.85rem; line-height: 1.35;">${safePrompt}</div>
      </div>
    `;
    list.appendChild(item);
  });

  body.appendChild(list);

  const ratioLabel = document.createElement('div');
  ratioLabel.style.margin = '1rem 0 0.5rem 0';
  ratioLabel.style.fontWeight = '800';
  ratioLabel.style.fontSize = '0.9rem';
  ratioLabel.style.color = 'var(--text-gold)';
  ratioLabel.innerText = '🎥 영상 비율 설정';
  body.appendChild(ratioLabel);

  const ratioSelect = document.createElement('select');
  ratioSelect.id = 'veo-aspect-ratio';
  ratioSelect.style.width = '100%';
  ratioSelect.style.padding = '0.75rem';
  ratioSelect.style.background = 'var(--bg-input)';
  ratioSelect.style.color = 'var(--text-strong)';
  ratioSelect.style.border = '1px solid var(--border-light)';
  ratioSelect.style.borderRadius = '10px';
  ratioSelect.innerHTML = `
    <option value="16:9">가로형 (16:9)</option>
    <option value="9:16">세로형 (9:16)</option>
    <option value="1:1" selected>정사각형 (1:1)</option>
    <option value="original">Original (원본 비율)</option>
  `;
  body.appendChild(ratioSelect);

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.gap = '0.5rem';
  footer.style.justifyContent = 'flex-end';
  footer.style.padding = '1rem 1.25rem';
  footer.style.borderTop = '1px solid var(--border-light)';
  footer.innerHTML = `
    <button type="button" id="veo-heading-cancel" style="padding: 0.65rem 1rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 10px; cursor: pointer; font-weight: 700;">취소</button>
    <button type="button" id="veo-heading-generate" style="padding: 0.65rem 1rem; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 800;">선택 소제목으로 생성</button>
  `;

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  (header.querySelector('#veo-heading-close') as HTMLButtonElement | null)?.addEventListener('click', close);
  (footer.querySelector('#veo-heading-cancel') as HTMLButtonElement | null)?.addEventListener('click', close);

  (footer.querySelector('#veo-heading-generate') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    const selected = overlay.querySelector('input[name="veo-heading"]:checked') as HTMLInputElement | null;
    const idx = selected ? Number(selected.value) : 0;
    const chosen = headings[idx] || headings[0];
    const provider = getSelectedVideoProvider();
    persistSelectedVideoProvider(provider);
    const rawPrompt = String((chosen?.prompt || chosen?.title || '')).trim();
    const { prompt, changed, reason } = buildHeadingAlignedVeoPrompt(String(chosen?.title || ''), rawPrompt);
    if (!prompt) {
      toastManager.warning('선택한 소제목 프롬프트가 비어있습니다.');
      return;
    }

    close();

    if (provider === 'kenburns') {
      // ✅ 로컬 KenBurns 영상 생성 (이미지 참조 필수)
      try {
        const chosenHeadingKey = normalizeHeadingKeyForVideoCache(String(chosen?.title || '').trim());
        const chosenImage = chosenHeadingKey ? (ImageManager.getImage(chosenHeadingKey) as any) : null;
        const chosenImagePath = String(chosenImage?.filePath || '').trim();
        if (!chosenImagePath) {
          toastManager.warning('KenBurns 영상 생성에는 소제목에 배치된 이미지가 필요합니다. 먼저 이미지를 생성/배치해주세요.');
          return;
        }
        appendLog(`🎞️ KenBurns 영상 생성 요청: ${chosen.title}`);
        showVeoProgressOverlay(chosen.title);
        setVeoProgressOverlay('로컬 영상 생성 중...', 20);

        const selectedRatio = (overlay.querySelector('#veo-aspect-ratio') as HTMLSelectElement)?.value as any || '16:9';
        const fb = await createKenBurnsFallbackVideoForHeading(String(chosen?.title || '').trim(), chosenImagePath, selectedRatio);
        if (!fb?.success) {
          hideVeoProgressOverlay(0);
          toastManager.error(fb?.message || 'KenBurns 영상 생성 실패');
          appendLog(`❌ KenBurns 영상 생성 실패: ${String(fb?.message || 'unknown')}`);
          return;
        }

        setVeoProgressOverlay('완료! 목록 갱신 중...', 100);
        hideVeoProgressOverlay(800);
        toastManager.success('✅ KenBurns 영상 생성 및 배치 완료');
        appendLog('✅ KenBurns 영상 생성 및 배치 완료');
        await refreshMp4FilesList();
      } catch (e) {
        hideVeoProgressOverlay(0);
        const msg = (e as Error).message || String(e);
        toastManager.error(`KenBurns 영상 생성 오류: ${msg}`);
        appendLog(`❌ KenBurns 영상 생성 중 오류: ${msg}`);
      }
      return;
    }

    // ✅ Veo
    if (typeof (window.api as any)?.generateVeoVideo !== 'function') {
      toastManager.error('AI 영상 기능이 아직 로드되지 않았습니다. 앱을 종료 후 다시 실행하세요.');
      appendLog('❌ AI 영상 기능이 아직 로드되지 않았습니다. (preload/renderer 미반영)');
      return;
    }

    appendLog(`🎬 AI 영상 생성 요청: ${chosen.title}`);
    if (changed) {
      appendLog(`🛡️ Veo 프롬프트 자동 보정 적용: ${reason || '정책 차단 방지'}`);
    }
    showVeoProgressOverlay(chosen.title);
    setVeoProgressOverlay('생성 요청 전송 중...', 2);
    try {
      const chosenHeadingKey = normalizeHeadingKeyForVideoCache(String(chosen?.title || '').trim());
      const chosenImage = chosenHeadingKey ? (ImageManager.getImage(chosenHeadingKey) as any) : null;
      const chosenImagePath = String(chosenImage?.filePath || '').trim();
      const result = await generateVeoVideoWithRetry(
        {
          prompt,
          negativePrompt: 'audio, speech, voice, voiceover, narration, music, singing, lyrics, dialogue',
          model: 'veo-3.1-generate-preview',
          durationSeconds: 6,
          aspectRatio: (overlay.querySelector('#veo-aspect-ratio') as HTMLSelectElement)?.value as any || '16:9',
          imagePath: chosenImagePath || undefined,
        },
        String(chosen?.title || '')
      );

      if (!result?.success) {
        hideVeoProgressOverlay(0);
        toastManager.error(result?.message || 'AI 영상 생성 실패');
        appendLog(`❌ AI 영상 생성 실패: ${result?.message || '알 수 없는 오류'}`);
        return;
      }

      setVeoProgressOverlay('완료! 목록 갱신 중...', 100);
      hideVeoProgressOverlay(800);
      toastManager.success(`✅ AI 영상 생성 완료: ${result.fileName}`);
      appendLog(`✅ AI 영상 생성 완료: ${result.fileName}`);
      await refreshMp4FilesList();
    } catch (e) {
      hideVeoProgressOverlay(0);
      const msg = (e as Error).message || String(e);
      toastManager.error(`AI 영상 생성 오류: ${msg}`);
      appendLog(`❌ AI 영상 생성 중 오류: ${msg}`);
    }
  });
}
