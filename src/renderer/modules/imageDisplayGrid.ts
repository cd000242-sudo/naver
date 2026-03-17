// ========================================
// imageDisplayGrid.ts — 이미지 표시/그리드/재생성 모듈
// renderer.ts에서 추출 (2026-02-25)
// ========================================

// 글로벌 참조 (인라인 시 renderer.ts 전역 스코프에서 사용 가능)
declare const appendLog: any;
declare const toastManager: any;
declare const ImageManager: any;
declare const escapeHtml: any;
declare const generateImagesWithCostSafety: any;
declare const showImagesProgress: any;
declare const syncGlobalImagesFromImageManager: any;
declare const currentStructuredContent: any;
declare const currentPostId: any;
declare const pushImageHistorySnapshot: any;
declare const getCurrentImageHeadings: any;
declare const getSafeHeadingTitle: any;
declare const getHeadingSelectedImageKey: any;
declare const setHeadingSelectedImageKey: any;
declare const updateReserveImagesThumbnails: any;
declare const autoAnalyzeHeadings: any;
declare const generateEnglishPromptForHeadingSync: any;
declare const toFileUrlMaybe: any;
declare const generatedImages: any[];
declare const showHeadingImagesModal: any;
declare const showImageModal: any;
declare const normalizeHeadingKeyForVideoCache: any;
declare const getHeadingVideoPreviewFromCache: any;
declare const updateUnifiedImagePreview: any;
declare const showSavedImagesForReplace: any;
declare const showHeadingSelectionModalV2: any;
declare const regenerateWithNewAI: any;

// 생성된 이미지 표시
export function displayGeneratedImages(images: any[]): void {
  const promptsContainer = document.getElementById('prompts-container') as HTMLDivElement;
  const generatedImagesGrid = document.getElementById('generated-images-grid') as HTMLDivElement;

  if (!generatedImagesGrid) return;

  const passedImages = Array.isArray(images) ? images : [];
  const imagesFromManager = ImageManager.getAllImages();
  const sourceImages = passedImages.length > 0
    ? passedImages
    : ((imagesFromManager && imagesFromManager.length > 0) ? imagesFromManager : []);

  // ✅ null/undefined 이미지 필터링
  const validImages = (sourceImages || []).filter((img: any) => img !== null && img !== undefined);

  // ✅ 디버그: 이미지 배열 내용 출력
  console.log('[DEBUG] displayGeneratedImages 호출됨, validImages:', validImages.length);
  if (validImages && validImages.length > 0) {
    validImages.forEach((img: any, idx: any) => {
      console.log(`[DEBUG] validImages[${idx}]:`, {
        heading: img?.heading,
        prompt: img?.prompt,
        url: (img?.url || '').substring(0, 50),
      });
    });
  }

  // ✅ 이미지가 없으면 안내 메시지 표시
  if (!validImages || validImages.length === 0) {
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

  // ✅ 이미지 미리보기 그리드에 표시 (개선된 버전)
  if (generatedImagesGrid && validImages.length > 0) {
    // 그리드 스타일 강제 적용
    generatedImagesGrid.style.display = 'grid';
    generatedImagesGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(180px, 1fr))';
    generatedImagesGrid.style.gap = '1rem';

    // ✅ 안전한 HTML 이스케이프 함수
    const escapeHtml = (str: string): string => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    generatedImagesGrid.innerHTML = validImages.map((image: any, index: number) => {
      const headingRaw = image.heading || `소제목 ${index + 1}`;
      const heading = escapeHtml(headingRaw);
      // ✅ prompt가 없으면 heading을 기본값으로 사용 (폴더에서 불러온 이미지, 백업 등)
      const prompt = escapeHtml(image.prompt || image.heading || `이미지 ${index + 1}`);
      const imageRaw = image.url || image.filePath || image.previewDataUrl || '';
      const imageUrl = toFileUrlMaybe(String(imageRaw || '').trim());
      // ✅ 이 소제목에 영상이 세팅되어 있는지 확인 (캐시 기반)
      const getFromCache3 = (window as any).getHeadingVideoPreviewFromCache || getHeadingVideoPreviewFromCache;
      const videoEntry = getFromCache3(String(headingRaw || ''));
      const hasVideo = !!(videoEntry && videoEntry.url);
      const videoBadgeHtml = hasVideo
        ? `<div style="margin-top: 2px; display: flex; align-items: center; gap: 6px;"><span style="font-size: 0.65rem; color: #22c55e; font-weight: 600; white-space: nowrap;">🎞 영상 세팅됨</span><button type="button" class="remove-heading-video-btn" data-heading-index="${index}" data-heading-title="${heading}" style="padding: 2px 6px; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.65rem; font-weight: 700;" title="영상 해제">해제</button></div>`
        : '';

      // ✅ GIF(영상에서 변환된 이미지)는 썸네일 우상단에 항상 보이는 X 버튼 추가
      const isGifFromVideo = String(image?.provider || '') === 'gif-from-video';
      const gifDeleteButtonHtml = isGifFromVideo
        ? `<button 
              type="button" 
              class="remove-image-btn gif-remove-btn" 
              data-image-index="${index}"
              style="position: absolute; top: 6px; right: 6px; z-index: 12; width: 24px; height: 24px; border-radius: 999px; border: none; background: rgba(239,68,68,0.95); color: #fff; font-size: 0.8rem; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.35);">
              ✕
           </button>`
        : '';
      return `
        <div class="generated-image-item" data-image-index="${index}" style="position: relative; background: var(--bg-secondary); border-radius: 12px; overflow: hidden; border: 2px solid var(--border-light); cursor: pointer; transition: all 0.3s ease; max-width: 220px; box-shadow: none;">
          <div style="position: relative; width: 100%; aspect-ratio: 1/1; overflow: hidden;">
            ${gifDeleteButtonHtml}
            <img src="${imageUrl}" alt="${heading}" 
                 style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%232d2d2d%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%23666%22 font-size=%228%22%3E이미지 로드 실패%3C/text%3E%3C/svg%3E';">
            <!-- 호버 오버레이 (6개 버튼) -->
            <div class="image-item-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, rgba(0,0,0,0.85), rgba(0,0,0,0.75)); display: none; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 8px; box-sizing: border-box;">
              <button type="button" class="view-image-btn" data-image-url="${imageUrl}" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">🔍 크게 보기</button>
              <button type="button" class="assign-to-heading-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">📍 소제목에 배치</button>
              <button type="button" class="regenerate-single-image-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">🔄 재생성</button>
              <button type="button" class="regenerate-ai-image-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">🤖 AI 이미지 생성</button>
              <button type="button" class="replace-with-saved-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">📁 저장된 이미지</button>
              <button type="button" class="remove-image-btn" data-image-index="${index}" style="width: 100%; padding: 5px 8px; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.7rem; font-weight: 600;">❌ 제거</button>
            </div>
            <!-- 선택 체크마크 -->
            <div class="image-selected-badge" style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; background: var(--primary); border-radius: 50%; display: none; align-items: center; justify-content: center; color: white; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">✓</div>
          </div>
          <div style="padding: 8px;">
            <div style="font-weight: 600; color: var(--text-strong); font-size: 0.75rem; margin-bottom: 2px; word-break: break-word; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${heading}">${heading}</div>
            <div style="font-size: 0.65rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${prompt}">${prompt}</div>
            ${videoBadgeHtml}
          </div>
        </div>
      `;
    }).join('');

    // 호버 시 오버레이 표시 + 이미지 확대 효과
    generatedImagesGrid.querySelectorAll('.generated-image-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        const overlay = item.querySelector('.image-item-overlay') as HTMLElement;
        const img = item.querySelector('img') as HTMLImageElement;
        if (overlay) overlay.style.display = 'flex';
        if (img) img.style.transform = 'scale(1.05)';
        (item as HTMLElement).style.borderColor = 'var(--primary)';
        (item as HTMLElement).style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.4)';
        (item as HTMLElement).style.transform = 'translateY(-4px)';
      });
      item.addEventListener('mouseleave', () => {
        const overlay = item.querySelector('.image-item-overlay') as HTMLElement;
        const img = item.querySelector('img') as HTMLImageElement;
        if (overlay) overlay.style.display = 'none';
        if (img) img.style.transform = 'scale(1)';
        (item as HTMLElement).style.borderColor = 'var(--border-light)';
        (item as HTMLElement).style.boxShadow = 'none';
        (item as HTMLElement).style.transform = 'translateY(0)';
      });
    });

    // ✅ 소제목에 배치하기 버튼
    generatedImagesGrid.querySelectorAll('.assign-to-heading-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = validImages[index];
        if (image) {
          await showHeadingSelectionModalV2(image, index);
        }
      });
    });

    // ✅ AI 이미지 새로 생성 버튼
    generatedImagesGrid.querySelectorAll('.regenerate-ai-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = validImages[index];
        const heading = image?.heading || `소제목 ${index + 1}`;
        await regenerateWithNewAI(index, heading);
      });
    });

    // ✅ 저장된 이미지로 교체 버튼
    generatedImagesGrid.querySelectorAll('.replace-with-saved-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = validImages[index];

        let targetHeadingIndex = Number(image?.headingIndex ?? -1);
        if (!Number.isFinite(targetHeadingIndex) || targetHeadingIndex < 0) {
          const headingTitle = String(image?.heading || '').trim();
          if (headingTitle) {
            try {
              const norm = normalizeHeadingKeyForVideoCache(headingTitle);
              const hs = (ImageManager as any)?.headings;
              const list = Array.isArray(hs) ? hs : [];
              const found = list.findIndex((it: any) => {
                const t = typeof it === 'string' ? String(it || '').trim() : String(it?.title || it || '').trim();
                if (!t) return false;
                if (t === headingTitle) return true;
                try {
                  return normalizeHeadingKeyForVideoCache(t) === norm;
                } catch {
                  return false;
                }
              });
              if (found >= 0) targetHeadingIndex = found;
            } catch (e) {
              console.warn('[imageDisplayGrid] catch ignored:', e);
            }
          }
        }

        if (!Number.isFinite(targetHeadingIndex) || targetHeadingIndex < 0) {
          toastManager.warning('교체할 소제목을 찾을 수 없습니다. 먼저 소제목 분석/생성을 다시 실행해주세요.');
          return;
        }

        await showSavedImagesForReplace(targetHeadingIndex);
      });
    });

    // ✅ 제거 버튼 (그리드 미리보기용)
    generatedImagesGrid.querySelectorAll('.remove-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const el = (e.currentTarget as HTMLElement | null) || (btn as HTMLElement);
        const idxAttr = el?.getAttribute('data-image-index');
        const index = parseInt(String(idxAttr || '0'), 10);

        if (Number.isNaN(index) || index < 0 || index >= validImages.length) return;

        if (confirm('이 이미지를 제거하시겠습니까?\n\n💡 하이브리드 모드: 일부 이미지만 남기고 나머지는 AI가 자동 생성합니다!')) {
          const image = validImages[index];

          try {
            pushImageHistorySnapshot('displayGeneratedImages.remove-image-btn');
          } catch (e) {
            console.warn('[imageDisplayGrid] catch ignored:', e);
          }

          // ✅ 1) ImageManager에서 해당 소제목의 해당 이미지 1개만 제거
          if (image?.heading) {
            try {
              const headingTitle = String(image.heading || '').trim();
              const titleKey =
                headingTitle ||
                (window as any)._headingTitles?.[image.headingIndex ?? index] ||
                ((ImageManager.headings as any)?.[image.headingIndex ?? index]?.title || '');

              if (titleKey) {
                const imagesForHeading = ImageManager.getImages(titleKey);
                let targetIdx = -1;

                // URL 기반으로 정확히 일치하는 이미지 찾기 (gif 포함)
                const rawRemoved = image?.url || image?.filePath || image?.previewDataUrl || '';
                const normalizedRemoved = toFileUrlMaybe(String(rawRemoved || '').trim());

                targetIdx = imagesForHeading.findIndex((img: any) => {
                  const raw = img?.url || img?.filePath || img?.previewDataUrl || '';
                  const norm = toFileUrlMaybe(String(raw || '').trim());
                  return norm === normalizedRemoved;
                });

                // 폴백: image.imageIndex 또는 0번
                if (targetIdx < 0 && typeof image.imageIndex === 'number') {
                  targetIdx = image.imageIndex;
                }
                if (targetIdx < 0) {
                  targetIdx = 0;
                }

                if (targetIdx >= 0 && targetIdx < imagesForHeading.length) {
                  ImageManager.removeImageAtIndex(titleKey, targetIdx);
                }
              }
            } catch (err) {
              console.error('[ImageManager] 생성된 이미지 그리드 제거 동기화 실패:', err);
            }
          } else {
            // heading이 없는 순수 예비 이미지일 경우: 전역 배열에서만 제거
            generatedImages.splice(index, 1);
          }

          // ✅ 2) 전역 배열 및 UI 동기화 (예비 이미지 포함)
          const allImages = ImageManager.getAllImages();
          (window as any).imageManagementGeneratedImages = allImages;
          syncGlobalImagesFromImageManager();

          toastManager.success(`✅ 이미지가 제거되었습니다! (남은 이미지: ${generatedImages.length}개)`);
          appendLog(`❌ [${index + 1}] 이미지 제거 완료`);

          if (generatedImages.length === 0) {
            appendLog(`⚠️ 모든 이미지가 제거되었습니다. 발행 시 새로 생성됩니다.`);
          } else {
            appendLog(`💡 하이브리드 모드 활성화: ${generatedImages.length}개는 사용, 나머지는 AI 생성`);
          }
        }
      });
    });

    // 크게보기 버튼
    generatedImagesGrid.querySelectorAll('.view-image-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const imageUrl = (e.target as HTMLElement).getAttribute('data-image-url');
        if (!imageUrl) return;
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0', 10);
        const image = validImages[index];
        const headingTitle = String(image?.heading || '').trim();
        if (headingTitle) {
          showHeadingImagesModal(encodeURIComponent(headingTitle), encodeURIComponent(String(imageUrl || '').trim()));
          return;
        }
        showImageModal(imageUrl);
      });
    });

    // 재생성 버튼 (그리드 미리보기용)
    generatedImagesGrid.querySelectorAll('.regenerate-single-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).getAttribute('data-image-index') || '0');
        const image = validImages[index];
        const prompt = image?.prompt || image?.heading || `이미지 ${index + 1}`;
        const heading = image?.heading || `소제목 ${index + 1}`;
        const promptItem = promptsContainer?.querySelector(`.prompt-item[data-index="${index + 1}"]`) as HTMLDivElement;

        // 그리드 미리보기에서 재생성
        await regenerateImageFromGrid(index, prompt, heading, promptItem);
      });
    });

    // ✅ 이미지 아이템 더블클릭 시 크게 보기
    generatedImagesGrid.querySelectorAll('.generated-image-item').forEach((item, index) => {
      item.addEventListener('dblclick', () => {
        const image = validImages[index];
        const imageRaw = image?.url || image?.filePath || image?.previewDataUrl || '';
        const imageUrl = toFileUrlMaybe(String(imageRaw || '').trim());
        if (imageUrl) {
          const headingTitle = String(image?.heading || '').trim();
          if (headingTitle) {
            showHeadingImagesModal(encodeURIComponent(headingTitle), encodeURIComponent(String(imageUrl || '').trim()));
            return;
          }
          showImageModal(imageUrl);
        }
      });
    });
  }

  // 각 이미지별로 해당 프롬프트 아이템에도 표시 (기존 기능 유지)
  validImages.forEach((image: any, index: number) => {
    const promptItem = promptsContainer.querySelector(`.prompt-item[data-index="${index + 1}"]`) as HTMLDivElement;
    if (promptItem) {
      const generatedImageDiv = promptItem.querySelector('.generated-image') as HTMLDivElement;
      if (generatedImageDiv) {
        // 이미지와 재생성 버튼을 포함한 컨테이너 (data-prompt/data-heading 제거, index만 사용)
        const safeAlt = escapeHtml(image.prompt || image.heading || '');
        const imageRaw = image.url || image.filePath || image.previewDataUrl || '';
        const imageUrl = toFileUrlMaybe(String(imageRaw || '').trim());

        generatedImageDiv.innerHTML = `
          <div style="position: relative; width: 100%; height: 100%;">
            <img src="${imageUrl}" alt="${safeAlt}" 
                 style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; cursor: pointer;"
                 onclick="showHeadingImagesModal('${encodeURIComponent(String(image.heading || '').trim() || `소제목 ${index + 1}`)}','${encodeURIComponent(String(imageUrl || '').trim())}')"
                 title="클릭하면 크게 보기">
            <div style="position: absolute; top: 8px; right: 8px; display: flex; gap: 0.5rem; z-index: 10;">
              <button class="select-folder-image-btn" 
                      data-image-index="${index}"
                      style="background: rgba(139, 92, 246, 0.9); color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; font-size: 0.875rem; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: all 0.2s;"
                      onmouseover="this.style.background='rgba(139, 92, 246, 1)'; this.style.transform='scale(1.05)'"
                      onmouseout="this.style.background='rgba(139, 92, 246, 0.9)'; this.style.transform='scale(1)'"
                      title="폴더에서 이미지 선택">
                📁
              </button>
              <button class="regenerate-image-btn" 
                      data-image-index="${index}"
                      style="background: rgba(59, 130, 246, 0.9); color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; font-size: 0.875rem; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: all 0.2s;"
                      onmouseover="this.style.background='rgba(59, 130, 246, 1)'; this.style.transform='scale(1.05)'"
                      onmouseout="this.style.background='rgba(59, 130, 246, 0.9)'; this.style.transform='scale(1)'"
                      title="이 이미지 다시 생성하기">
                🔄
              </button>
              <button class="remove-image-from-preview-btn" 
                      data-image-index="${index}"
                      style="background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; font-size: 0.875rem; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: all 0.2s;"
                      onmouseover="this.style.background='rgba(239, 68, 68, 1)'; this.style.transform='scale(1.05)'"
                      onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)'"
                      title="이 이미지 제거하기">
                ❌
              </button>
            </div>
          </div>
        `;
        generatedImageDiv.style.border = '2px solid var(--primary)';
        generatedImageDiv.style.background = 'transparent';
        generatedImageDiv.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';

        // ✅ 이벤트 리스너는 이벤트 위임으로 처리됨 (displayGeneratedImages 함수 하단 참조)
      }
    }
  });

  // 생성된 이미지 섹션 표시
  const generatedImagesSection = document.getElementById('generated-images-section') as HTMLDivElement;
  if (generatedImagesSection) {
    generatedImagesSection.style.display = 'block';
  }

  // ✅ 이벤트 위임: promptsContainer에 클릭 이벤트 등록 (중복 방지를 위해 기존 리스너 제거)
  const existingHandler = (promptsContainer as any)._imageButtonsHandler;
  if (existingHandler) {
    promptsContainer.removeEventListener('click', existingHandler);
  }

  const imageButtonsHandler = async (e: Event) => {
    const target = e.target as HTMLElement;

    // 제거 버튼 클릭 (영어 프롬프트 미리보기 내 이미지)
    if (target.classList.contains('remove-image-from-preview-btn') || target.closest('.remove-image-from-preview-btn')) {
      e.stopPropagation();
      const btn = target.classList.contains('remove-image-from-preview-btn') ? target : target.closest('.remove-image-from-preview-btn') as HTMLElement;
      if (!btn) return;

      const index = parseInt(btn.getAttribute('data-image-index') || '0');

      console.log('[디버그] 제거 버튼 클릭됨, index:', index);

      if (confirm('이 이미지를 제거하시겠습니까?\n\n💡 하이브리드 모드: 일부 이미지만 남기고 나머지는 AI가 자동 생성합니다!')) {
        const promptItem = promptsContainer.querySelector(`.prompt-item[data-index="${index + 1}"]`) as HTMLDivElement;
        // ✅ [2026-03-16 FIX] getSafeHeadingTitle로 배지 오염 방지
        const headingTitle = (getSafeHeadingTitle(promptItem) || `소제목 ${index + 1}`).trim();

        try {
          pushImageHistorySnapshot('remove-image-from-preview-btn');
        } catch (e) {
          console.warn('[imageDisplayGrid] catch ignored:', e);
        }

        // 해당 소제목의 이미지들 중에서, 현재 프리뷰에 표시된 이미지 1개만 제거
        try {
          const titleKey = headingTitle;
          const imagesForHeading = ImageManager.getImages(titleKey);

          let targetIdx = -1;

          const currentImgEl = (promptItem?.querySelector('.images-grid img') || promptItem?.querySelector('.generated-image img')) as HTMLImageElement | null;
          if (currentImgEl && currentImgEl.src) {
            const normalizedRemoved = toFileUrlMaybe(String(currentImgEl.src || '').trim());
            targetIdx = imagesForHeading.findIndex((img: any) => {
              const raw = img?.url || img?.filePath || img?.previewDataUrl || '';
              const norm = toFileUrlMaybe(String(raw || '').trim());
              return norm === normalizedRemoved;
            });
          }

          if (targetIdx < 0) {
            targetIdx = 0;
          }

          if (targetIdx >= 0 && targetIdx < imagesForHeading.length) {
            ImageManager.removeImageAtIndex(titleKey, targetIdx);
          }
        } catch (err) {
          console.error('[ImageManager] remove-image-from-preview-btn 동기화 실패:', err);
        }

        const allImages = ImageManager.getAllImages();
        (window as any).imageManagementGeneratedImages = allImages;
        syncGlobalImagesFromImageManager();

        toastManager.success(`✅ 이미지가 제거되었습니다! (남은 이미지: ${generatedImages.length}개)`);
        appendLog(`❌ "${headingTitle}" 이미지 제거 완료`);

        if (generatedImages.length === 0) {
          appendLog(`⚠️ 모든 이미지가 제거되었습니다. 발행 시 새로 생성됩니다.`);
        } else {
          appendLog(`💡 하이브리드 모드 활성화: ${generatedImages.length}개는 사용, 나머지는 AI 생성`);
        }
      }
    }

    // 재생성 버튼 클릭
    if (target.classList.contains('regenerate-image-btn') || target.closest('.regenerate-image-btn')) {
      e.stopPropagation();
      const btn = target.classList.contains('regenerate-image-btn') ? target : target.closest('.regenerate-image-btn') as HTMLElement;
      if (!btn) return;

      const index = parseInt(btn.getAttribute('data-image-index') || '0');
      const promptItem = promptsContainer.querySelector(`.prompt-item[data-index="${index + 1}"]`) as HTMLDivElement;
      // ✅ [2026-03-16 FIX] getSafeHeadingTitle로 배지 오염 방지
      const headingTitle = (getSafeHeadingTitle(promptItem) || `소제목 ${index + 1}`).trim();
      const image = ImageManager.getImage(headingTitle) as any;
      const prompt = image?.prompt || headingTitle || `이미지 ${index + 1}`;
      const heading = headingTitle;

      console.log('[디버그] 재생성 버튼 클릭됨, index:', index, 'heading:', heading, 'prompt:', prompt);

      if (promptItem) {
        await regenerateSingleImageWithPromptItem(index, prompt, heading, promptItem);

        const updatedImage = (generatedImages as any[])[index];
        if (updatedImage && headingTitle) {
          ImageManager.setImage(headingTitle, { ...updatedImage, heading: headingTitle });
          const allImages = ImageManager.getAllImages();
          (window as any).imageManagementGeneratedImages = allImages;
          syncGlobalImagesFromImageManager();
        }
      }
    }
  };

  // 핸들러 참조 저장 (중복 방지)
  (promptsContainer as any)._imageButtonsHandler = imageButtonsHandler;
  promptsContainer.addEventListener('click', imageButtonsHandler);
}

// ✅ 미리보기에서 선택한 이미지 사용하기 (소제목 선택)
async function useSelectedImageFromPreview(image: any, index: number): Promise<void> {
  try {
    // 소제목 목록 가져오기
    const structuredContent = currentStructuredContent || (window as any).currentStructuredContent;
    let headings: any[] = [];

    if (structuredContent && structuredContent.headings) {
      headings = structuredContent.headings;
    } else {
      // 프롬프트 컨테이너에서 소제목 가져오기
      const promptsContainer = document.getElementById('prompts-container') as HTMLDivElement;
      if (promptsContainer) {
        const promptItems = promptsContainer.querySelectorAll('.prompt-item');
        promptItems.forEach((item, idx) => {
          // ✅ [2026-03-16 FIX] getSafeHeadingTitle로 배지 오염 방지
          const headingTitle = getSafeHeadingTitle(item) || '';
          if (headingTitle) {
            headings.push({
              title: headingTitle,
              index: idx
            });
          }
        });
      }
    }

    if (headings.length === 0) {
      alert('소제목이 없습니다. 먼저 소제목을 분석해주세요.');
      return;
    }

    // 소제목 선택 모달 표시
    showHeadingSelectionModal(image, index, headings);
  } catch (error) {
    console.error('이미지 선택 실패:', error);
    alert(`이미지 선택에 실패했습니다: ${(error as Error).message}`);
  }
}

// ✅ 소제목 선택 모달
function showHeadingSelectionModal(image: any, imageIndex: number, headings: any[]): void {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); z-index: 10000; display: flex;
    align-items: center; justify-content: center; padding: 2rem;
  `;

  modal.innerHTML = `
    <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3); position: relative;">
      <button type="button" class="close-heading-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s;" onmouseover="this.style.background='rgba(220, 38, 38, 1)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)';">✕</button>
      <h2 style="margin: 0 0 1rem 0; color: var(--text-strong); font-size: 1.5rem;">📝 소제목 선택</h2>
      <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem;">
        이 이미지를 사용할 소제목을 선택해주세요.
      </div>
      
      <!-- 이미지 미리보기 -->
      <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-light);">
        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">선택한 이미지</div>
        <div style="width: 100%; max-height: 420px; border-radius: 8px; overflow: hidden; background: var(--bg-tertiary); margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: center;">
          <img src="${toFileUrlMaybe(image.url || image.filePath || image.previewDataUrl || '')}" alt="이미지 미리보기" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted);\\'>이미지 로드 실패</div>';">
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">
          ${image.heading ? `원래 소제목: ${escapeHtml(image.heading)}` : `이미지 ${imageIndex + 1}`}
        </div>
      </div>
      
      <!-- 소제목 목록 -->
      <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 40vh; overflow-y: auto; margin-bottom: 1.5rem;">
        ${headings.map((heading, idx) => {
    const headingTitle = heading.title || heading.heading || `소제목 ${idx + 1}`;
    const headingIndex = heading.index !== undefined ? heading.index : idx;
    return `
            <label style="display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 2px solid var(--border-light); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--primary)'; this.style.background='rgba(59, 130, 246, 0.1)'" onmouseout="this.style.borderColor='var(--border-light)'; this.style.background='var(--bg-secondary)'">
              <input type="radio" name="heading-selection" value="${headingIndex}" class="heading-radio" style="width: 20px; height: 20px; cursor: pointer;" ${idx === imageIndex ? 'checked' : ''}>
              <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem;">${escapeHtml(headingTitle)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">소제목 ${idx + 1}</div>
              </div>
            </label>
          `;
  }).join('')}
      </div>
      
      <div style="display: flex; gap: 0.5rem;">
        <button type="button" class="confirm-heading-selection-btn" style="flex: 1; padding: 0.75rem; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">✅ 선택 완료</button>
        <button type="button" class="close-heading-modal-btn" style="flex: 1; padding: 0.75rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">취소</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 선택 완료
  modal.querySelector('.confirm-heading-selection-btn')?.addEventListener('click', () => {
    const selectedRadio = modal.querySelector('.heading-radio:checked') as HTMLInputElement;
    if (!selectedRadio) {
      alert('소제목을 선택해주세요.');
      return;
    }

    const selectedIndex = parseInt(selectedRadio.value);
    const selectedHeading = headings[selectedIndex];
    const headingTitle = selectedHeading?.title || selectedHeading?.heading || `소제목 ${selectedIndex + 1}`;

    modal.remove();
    applyImageToHeading(image, headingTitle, selectedIndex);
  });

  // 닫기
  modal.querySelectorAll('.close-heading-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => modal.remove());
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  // ESC 키로 닫기
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', handleEsc); }
  };
  document.addEventListener('keydown', handleEsc);
}

// ✅ 선택한 소제목에 이미지 적용
async function applyImageToHeading(image: any, headingTitle: string, headingIndex: number): Promise<void> {
  try {
    const imageUrl = image.url || image.filePath || '';

    appendLog(`✅ "${headingTitle}" 소제목에 이미지가 적용되었습니다.`);

    const candidate = {
      heading: headingTitle,
      filePath: image.filePath || imageUrl,
      previewDataUrl: image.previewDataUrl || imageUrl,
      provider: image.provider || 'local',
      url: imageUrl,
      savedToLocal: Boolean(image.savedToLocal),
      headingIndex: headingIndex,
    } as any;

    try {
      ImageManager.setImage(headingTitle, candidate);
    } catch (e) {
      console.warn('[imageDisplayGrid] catch ignored:', e);
    }

    try {
      syncGlobalImagesFromImageManager();
    } catch (e) {
      console.warn('[imageDisplayGrid] catch ignored:', e);
    }

    try {
      const all = ImageManager.getAllImages();
      updateUnifiedImagePreview((window as any)?.currentStructuredContent?.headings || [], all);
    } catch (e) {
      console.warn('[imageDisplayGrid] catch ignored:', e);
    }

    alert(`✅ 이미지가 선택되었습니다!\n\n소제목: ${headingTitle}\n\n이제 발행 시 이 이미지가 사용됩니다.`);
  } catch (error) {
    console.error('이미지 적용 실패:', error);
    alert(`이미지 적용에 실패했습니다: ${(error as Error).message}`);
  }
}

// ✅ 그리드 미리보기에서 이미지 재생성
async function regenerateImageFromGrid(imageIndex: number, prompt: string, heading: string, promptItem: HTMLDivElement | null): Promise<void> {
  const generatedImagesGrid = document.getElementById('generated-images-grid') as HTMLDivElement;

  // ✅ 이미지 소스 버튼에서 선택된 소스 가져오기 (드롭다운 fallback)
  const selectedImageSourceBtn = document.querySelector('.image-source-btn.selected') as HTMLButtonElement;
  const imageSource = String(
    selectedImageSourceBtn?.dataset?.source
    || (document.getElementById('image-source-select') as HTMLSelectElement)?.value
    || ''
  ).trim();
  if (!imageSource) {
    alert('이미지 생성 소스를 선택해주세요.');
    return;
  }

  try {
    appendLog(`🔄 "${heading}" 이미지 재생성 중... (다른 이미지 선택)`, 'images-log-output');

    // 재생성 시 다른 이미지를 선택하기 위해 재생성 플래그 전달
    let newImageUrl: string;

    if (imageSource === 'pollinations' || imageSource === 'nano-banana-pro') {
      newImageUrl = await generateNanoBananaProImage(prompt, true);
    } else if (imageSource === 'stability') {
      // ✅ Stability AI 직접 연동 (Imagen4 폴백 제거)
      const stabilityModel = (document.getElementById('stability-model-select') as HTMLSelectElement)?.value || 'ultra';
      const imageResult = await generateImagesWithCostSafety({
        provider: 'stability',
        items: [{ heading: heading, prompt }],
        regenerate: true,
        model: stabilityModel,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Stability AI 이미지 생성 실패');
      }
    } else if (imageSource === 'prodia') {
      // ✅ Prodia 이미지 생성 (Stability와 동일한 패턴)
      const imageResult = await generateImagesWithCostSafety({
        provider: 'prodia',
        items: [{ heading: heading, prompt }],
        regenerate: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Prodia 이미지 생성 실패');
      }
    } else if (imageSource === 'deepinfra') {
      // ✅ [2026-02-19 FIX] DeepInfra 분기 추가 (기존에 else로 빠져 네이버 검색 됨)
      const imageResult = await generateImagesWithCostSafety({
        provider: 'deepinfra',
        items: [{ heading: heading, prompt }],
        regenerate: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'DeepInfra 이미지 생성 실패');
      }
    } else if (imageSource === 'falai') {
      // ✅ [2026-02-19 FIX] Fal.ai 분기 추가 (기존에 else로 빠져 네이버 검색 됨)
      const imageResult = await generateImagesWithCostSafety({
        provider: 'falai',
        items: [{ heading: heading, prompt }],
        regenerate: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Fal.ai 이미지 생성 실패');
      }
    } else if (imageSource === 'leonardoai') {
      // ✅ [2026-02-23] Leonardo AI 재생성 지원 추가
      const imageResult = await generateImagesWithCostSafety({
        provider: 'leonardoai',
        items: [{ heading: heading, prompt }],
        regenerate: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Leonardo AI 이미지 생성 실패');
      }
    } else if (imageSource === 'openai-image') {
      // ✅ [2026-02-23] OpenAI DALL-E 재생성 지원 추가
      const imageResult = await generateImagesWithCostSafety({
        provider: 'openai-image',
        items: [{ heading: heading, prompt }],
        regenerate: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'DALL-E 이미지 생성 실패');
      }
    } else {
      // 네이버 이미지 검색 (재생성 플래그 전달)
      newImageUrl = await searchNaverImage(prompt, true); // true = 재생성 모드
    }

    // 그리드 미리보기 업데이트
    if (generatedImagesGrid) {
      const imageItem = generatedImagesGrid.querySelector(`.generated-image-item[data-image-index="${imageIndex}"]`) as HTMLDivElement;
      if (imageItem) {
        const img = imageItem.querySelector('img');
        if (img) {
          img.src = toFileUrlMaybe(newImageUrl);
          img.onerror = function () {
            this.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%23999%22%3E이미지 로드 실패%3C/text%3E%3C/svg%3E';
          };
        }
      }
    }

    // 프롬프트 아이템도 업데이트
    if (promptItem) {
      const generatedImageDiv = promptItem.querySelector('.generated-image') as HTMLDivElement;
      if (generatedImageDiv) {
        generatedImageDiv.innerHTML = `
          <div style="position: relative; width: 100%; height: 100%;">
            <img src="${newImageUrl}" alt="${escapeHtml(prompt || heading || '')}" 
                 style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; cursor: pointer;"
                 onclick="showHeadingImagesModal('${encodeURIComponent(String(heading || '').trim())}','${encodeURIComponent(String(newImageUrl || '').trim())}')"
                 title="클릭하면 크게 보기">
            <button class="regenerate-image-btn" 
                    data-image-index="${imageIndex}"
                    style="position: absolute; top: 8px; right: 8px; background: rgba(59, 130, 246, 0.9); color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; font-size: 0.875rem; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: all 0.2s; z-index: 10;"
                    onmouseover="this.style.background='rgba(59, 130, 246, 1)'; this.style.transform='scale(1.05)'"
                    onmouseout="this.style.background='rgba(59, 130, 246, 0.9)'; this.style.transform='scale(1)'"
                    title="이 이미지 다시 생성하기">
              🔄 재생성
            </button>
          </div>
        `;

        // 재생성 버튼 이벤트 리스너 다시 추가
        const newRegenerateBtn = generatedImageDiv.querySelector('.regenerate-image-btn') as HTMLButtonElement;
        if (newRegenerateBtn) {
          newRegenerateBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await regenerateSingleImageWithPromptItem(imageIndex, prompt, heading, promptItem);
          });
        }
      }
    }

    // ✅ [2026-02-12 P1 FIX #2] ImageManager 경유 + sync 추가
    ImageManager.setImage(heading, {
      heading: heading,
      filePath: newImageUrl,
      url: newImageUrl,
      previewDataUrl: newImageUrl,
      prompt: prompt,
      headingIndex: imageIndex
    });
    try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }

    appendLog(`✅ "${heading}" 이미지 재생성 완료! (새로운 이미지)`, 'images-log-output');
    toastManager.success(`"${heading}" 이미지가 재생성되었습니다.`);

  } catch (error) {
    appendLog(`❌ "${heading}" 이미지 재생성 실패: ${(error as Error).message}`, 'images-log-output');
    toastManager.error(`이미지 재생성 실패: ${(error as Error).message}`);
  }
}

// 단일 이미지 재생성 (promptItem 기반 - 기존 코드용)
async function regenerateSingleImageWithPromptItem(imageIndex: number, prompt: string, heading: string, promptItem: HTMLDivElement): Promise<void> {
  const regenerateBtn = promptItem.querySelector('.regenerate-image-btn') as HTMLButtonElement;
  const generatedImageDiv = promptItem.querySelector('.generated-image') as HTMLDivElement;
  if (!regenerateBtn || !generatedImageDiv) return;

  // 버튼 비활성화 및 로딩 상태
  regenerateBtn.disabled = true;
  regenerateBtn.textContent = '🔄 생성 중...';
  regenerateBtn.style.opacity = '0.7';
  regenerateBtn.style.cursor = 'not-allowed';

  // 이미지 영역에 로딩 표시
  const originalContent = generatedImageDiv.innerHTML;
  generatedImageDiv.innerHTML = `
    <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg-tertiary); border-radius: 8px;">
      <div style="text-align: center;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔄</div>
        <div style="font-size: 0.875rem; color: var(--text-muted);">이미지 재생성 중...</div>
      </div>
    </div>
  `;

  try {
    const selectedBtn = (document.querySelector('.image-source-btn.selected') || document.querySelector('.unified-img-source-btn.selected')) as HTMLButtonElement;
    const imageSource = (selectedBtn?.dataset?.source
      || (document.getElementById('image-source-select') as HTMLSelectElement)?.value
      || '') as string;
    appendLog(`🔄 "${heading}" 이미지 재생성 중 (${imageSource || '기본'})...`, 'images-log-output');

    let newImageUrl: string;

    if (imageSource === 'nano-banana-pro') {
      newImageUrl = await generateNanoBananaProImage(prompt);
    } else if (imageSource === 'pollinations') {
      newImageUrl = await generateNanoBananaProImage(prompt);
    } else if (imageSource === 'prodia') {
      // ✅ Prodia AI 재생성 지원 추가
      const imageResult = await generateImagesWithCostSafety({
        provider: 'prodia',
        items: [{ heading: heading, prompt: prompt }],
        regenerate: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Prodia AI 이미지 생성 실패');
      }
    } else if (imageSource === 'stability') {
      const stabilityModel = (document.getElementById('stability-model-select') as HTMLSelectElement)?.value || 'ultra';
      const imageResult = await generateImagesWithCostSafety({
        provider: 'stability',
        items: [{ heading: heading, prompt }],
        regenerate: true,
        model: stabilityModel,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Stability AI 이미지 생성 실패');
      }
    } else if (imageSource === 'deepinfra') {
      // ✅ [2026-02-19 FIX] DeepInfra 분기 추가 (기존에 else로 빠져 네이버 검색 됨)
      const imageResult = await generateImagesWithCostSafety({
        provider: 'deepinfra',
        items: [{ heading: heading, prompt }],
        regenerate: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'DeepInfra 이미지 생성 실패');
      }
    } else if (imageSource === 'falai') {
      // ✅ [2026-02-19 FIX] Fal.ai 분기 추가 (기존에 else로 빠져 네이버 검색 됨)
      const imageResult = await generateImagesWithCostSafety({
        provider: 'falai',
        items: [{ heading: heading, prompt }],
        regenerate: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Fal.ai 이미지 생성 실패');
      }
    } else if (imageSource === 'leonardoai') {
      // ✅ [2026-02-23] Leonardo AI 재생성 지원 추가
      const imageResult = await generateImagesWithCostSafety({
        provider: 'leonardoai',
        items: [{ heading: heading, prompt }],
        regenerate: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Leonardo AI 이미지 생성 실패');
      }
    } else if (imageSource === 'openai-image') {
      // ✅ [2026-02-23] OpenAI DALL-E 재생성 지원 추가
      const imageResult = await generateImagesWithCostSafety({
        provider: 'openai-image',
        items: [{ heading: heading, prompt }],
        regenerate: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        newImageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'DALL-E 이미지 생성 실패');
      }
    } else {
      newImageUrl = await searchNaverImage(prompt);
    }

    // 새 이미지로 업데이트
    const newImage = {
      url: newImageUrl,
      prompt: prompt,
      heading: heading,
      index: imageIndex
    };

    // 이미지 표시 업데이트
    generatedImageDiv.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%;">
        <img src="${newImageUrl}" alt="${escapeHtml(prompt || heading || '')}" 
             style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; cursor: pointer;"
             onclick="showHeadingImagesModal('${encodeURIComponent(String(heading || '').trim())}','${encodeURIComponent(String(newImageUrl || '').trim())}')"
             title="클릭하면 크게 보기">
        <button class="regenerate-image-btn" 
                data-image-index="${imageIndex}"
                style="position: absolute; top: 8px; right: 8px; background: rgba(59, 130, 246, 0.9); color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; font-size: 0.875rem; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: all 0.2s; z-index: 10;"
                onmouseover="this.style.background='rgba(59, 130, 246, 1)'; this.style.transform='scale(1.05)'"
                onmouseout="this.style.background='rgba(59, 130, 246, 0.9)'; this.style.transform='scale(1)'"
                title="이 이미지 다시 생성하기">
          🔄 재생성
        </button>
      </div>
    `;

    // 재생성 버튼 이벤트 리스너 다시 추가
    const newRegenerateBtn = generatedImageDiv.querySelector('.regenerate-image-btn') as HTMLButtonElement;
    if (newRegenerateBtn) {
      newRegenerateBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await regenerateSingleImageWithPromptItem(imageIndex, prompt, heading, promptItem);
      });
    }

    // 전역 이미지 배열 업데이트
    const currentHeadings = getCurrentImageHeadings();
    if ((window as any).imageManagementGeneratedImages) {
      (window as any).imageManagementGeneratedImages = (window as any).imageManagementGeneratedImages.map((img: any, idx: number) => {
        if (idx === imageIndex) {
          return {
            heading: heading,
            filePath: newImageUrl,
            url: newImageUrl,
            prompt: prompt,
            headingIndex: imageIndex
          };
        }
        return img;
      });
    }

    appendLog(`✅ "${heading}" 이미지 재생성 완료!`, 'images-log-output');
    toastManager.success(`"${heading}" 이미지가 재생성되었습니다.`);

  } catch (error) {
    appendLog(`❌ "${heading}" 이미지 재생성 실패: ${(error as Error).message}`, 'images-log-output');
    toastManager.error(`이미지 재생성 실패: ${(error as Error).message}`);

    // 원래 이미지로 복원
    generatedImageDiv.innerHTML = originalContent;

    // 재생성 버튼 이벤트 리스너 다시 추가
    const restoreRegenerateBtn = generatedImageDiv.querySelector('.regenerate-image-btn') as HTMLButtonElement;
    if (restoreRegenerateBtn) {
      restoreRegenerateBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await regenerateSingleImageWithPromptItem(imageIndex, prompt, heading, promptItem);
      });
    }
  } finally {
    // 버튼 상태 복원
    const finalRegenerateBtn = generatedImageDiv.querySelector('.regenerate-image-btn') as HTMLButtonElement;
    if (finalRegenerateBtn) {
      finalRegenerateBtn.disabled = false;
      finalRegenerateBtn.textContent = '🔄 재생성';
      finalRegenerateBtn.style.opacity = '1';
      finalRegenerateBtn.style.cursor = 'pointer';
    }
  }
}

// 네이버 이미지 검색
export async function searchNaverImage(prompt: string, isRegenerate: boolean = false): Promise<string> {
  const response = await window.api.generateImages({
    provider: 'naver',
    items: [{ heading: 'image', prompt: prompt }],
    regenerate: isRegenerate
  });
  if (!response.success || !response.images || response.images.length === 0) {
    throw new Error(response.message || '네이버 이미지 검색 실패');
  }
  return response.images[0].filePath;
}

export function resolveReferenceImageForHeading(headingTitle: string): { referenceImagePath?: string; referenceImageUrl?: string } {
  const title = String(headingTitle || '').trim();
  if (!title) return {};

  let img: any = null;
  try {
    img = ImageManager.getImage(title);
  } catch {
    img = null;
  }
  if (!img) return {};

  const rawFilePath = String(img.filePath || '').trim();
  const rawUrl = String(img.url || img.previewDataUrl || '').trim();

  const toLocal = (p: string): string => {
    const raw = String(p || '').trim();
    if (!raw) return '';
    if (/^file:\/\//i.test(raw)) {
      return raw.replace(/^file:\/\//i, '').replace(/^\/+/, '');
    }
    return raw;
  };

  const local = toLocal(rawFilePath) || toLocal(rawUrl);
  if (local && !/^https?:\/\//i.test(local)) {
    return { referenceImagePath: local };
  }
  if (rawUrl && /^https?:\/\//i.test(rawUrl)) {
    return { referenceImageUrl: rawUrl };
  }
  if (rawFilePath && /^https?:\/\//i.test(rawFilePath)) {
    return { referenceImageUrl: rawFilePath };
  }
  return {};
}

const autoReferenceCacheByUrl = new Map<string, { filePath: string; updatedAt: number }>();

export function getAutoReferenceSourceUrlCandidate(): string {
  const tryGet = (id: string): string => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return String(el?.value || '').trim();
  };

  const directShopping = tryGet('shopping-url-input');
  if (directShopping) return directShopping;

  const maUrl = tryGet('ma-setting-url');
  if (maUrl) return maUrl;

  const continuousUrl = tryGet('continuous-url-input');
  if (continuousUrl) return continuousUrl;

  try {
    const unifiedContainer = document.getElementById('unified-url-fields-container') as HTMLElement | null;
    if (unifiedContainer) {
      const inputs = unifiedContainer.querySelectorAll('input.unified-url-input') as NodeListOf<HTMLInputElement>;
      for (const input of Array.from(inputs)) {
        const v = String(input?.value || '').trim();
        if (v) return v;
      }
    }
  } catch {
  }

  try {
    const urlFieldsContainer = document.getElementById('url-fields-container') as HTMLElement | null;
    if (urlFieldsContainer) {
      const inputs = urlFieldsContainer.querySelectorAll('input.url-field-input') as NodeListOf<HTMLInputElement>;
      for (const input of Array.from(inputs)) {
        const v = String(input?.value || '').trim();
        if (v) return v;
      }
    }
  } catch {
  }

  try {
    const fullAuto = document.getElementById('full-auto-url-fields-container') as HTMLElement | null;
    if (fullAuto) {
      const inputs = fullAuto.querySelectorAll('input.url-field-input') as NodeListOf<HTMLInputElement>;
      for (const input of Array.from(inputs)) {
        const v = String(input?.value || '').trim();
        if (v) return v;
      }
    }
  } catch {
  }

  return '';
}

export async function resolveReferenceImageForHeadingAsync(headingTitle: string): Promise<{ referenceImagePath?: string; referenceImageUrl?: string }> {
  const direct = resolveReferenceImageForHeading(headingTitle);
  if (direct.referenceImagePath || direct.referenceImageUrl) return direct;

  const sourceUrl = getAutoReferenceSourceUrlCandidate();
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return {};

  // cache hit
  const cached = autoReferenceCacheByUrl.get(sourceUrl);
  if (cached?.filePath) {
    return { referenceImagePath: cached.filePath };
  }

  // 1) 쇼핑몰 URL에서 대표 이미지 1장 자동 수집
  if (typeof (window.api as any)?.collectImagesFromShopping !== 'function') return {};

  try {
    const result = await (window.api as any).collectImagesFromShopping(sourceUrl);
    const images = Array.isArray(result?.images) ? result.images : [];
    const first = images.length > 0 ? String(images[0] || '').trim() : '';
    if (!first) return {};

    // 2) 가능하면 로컬 저장해서 referenceImagePath로 사용 (가장 안정적)
    if (typeof (window.api as any)?.downloadAndSaveImage === 'function') {
      const postTitle = String((window as any).currentStructuredContent?.selectedTitle || currentStructuredContent?.selectedTitle || '').trim();
      const postId = currentPostId || undefined;
      const saveRes = await (window.api as any).downloadAndSaveImage(first, String(headingTitle || 'ref').trim() || 'ref', postTitle || undefined, postId);
      if (saveRes?.success) {
        const savedPath = String(saveRes?.filePath || saveRes?.savedToLocal || '').trim();
        if (savedPath) {
          autoReferenceCacheByUrl.set(sourceUrl, { filePath: savedPath, updatedAt: Date.now() });
          return { referenceImagePath: savedPath };
        }
      }
    }

    // 3) 저장 실패 시 원격 URL을 그대로 참조로 사용
    autoReferenceCacheByUrl.set(sourceUrl, { filePath: first, updatedAt: Date.now() });
    return { referenceImageUrl: first };
  } catch {
    return {};
  }
}

// ✅ [2026-02-11] Imagen4 함수 제거됨 → nano-banana-pro로 통합
// generateImagen4ImageLocal은 더 이상 사용하지 않음 (generateNanoBananaProImage 사용)

// ✅ 나노 바나나 프로 이미지 생성 (Gemini 3 기반, NEVER TEXT 적용)
export async function generateNanoBananaProImage(prompt: string, headingOrRegenerate?: string | boolean, isRegenerate: boolean = false): Promise<string> {
  // 오버로드 처리: heading이 string이면 heading으로, boolean이면 isRegenerate로 처리
  let heading = 'image';
  let regenerate = isRegenerate;

  if (typeof headingOrRegenerate === 'string') {
    heading = headingOrRegenerate;
  } else if (typeof headingOrRegenerate === 'boolean') {
    regenerate = headingOrRegenerate;
  }
  const ref = heading ? await resolveReferenceImageForHeadingAsync(heading) : {};
  const response = await generateImagesWithCostSafety({
    provider: 'nano-banana-pro',
    items: [{ heading: heading || 'image', prompt: prompt, ...ref }],
    regenerate
  });
  if (!response.success || !response.images || response.images.length === 0) {
    throw new Error(response.message || '나노 바나나 프로 이미지 생성 실패');
  }
  return response.images[0].previewDataUrl || response.images[0].filePath;
}

// ✅ [2026-02-11] generateImagen4Image 함수 제거됨 → nano-banana-pro로 통합
