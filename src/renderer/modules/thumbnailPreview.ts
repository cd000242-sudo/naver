// ═══════════════════════════════════════════════════════════════════
// [2026-02-26] thumbnailPreview.ts - 썸네일 미리보기/생성 관련 함수
// ═══════════════════════════════════════════════════════════════════

declare let currentStructuredContent: any;
declare let generatedImages: any[];
declare const ImageManager: any;
declare const toastManager: any;
declare const UnifiedDOMCache: any;
declare function appendLog(msg: string, ...args: any[]): void;
declare function escapeHtml(str: string): string;
declare function toFileUrlMaybe(path: string): string;
declare function showImageModal(imageUrl: string, title?: string): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function getHeadingSelectedImageKey(...args: any[]): any;
declare function getStableImageKey(imageObj: any, heading?: string): string;
declare function collectFormData(): any;
declare let thumbnailBackgroundDataUrl: string | null;
declare let thumbnailBackgroundImage: string | null;
declare function generateImagesWithCostSafety(options: any): Promise<any>;
declare function ensurePromptCardRemoveButtons(): void;
declare function ensurePromptCardRemoveHandler(): void;
declare function updateUnifiedImagePreview(...args: any[]): void;

export function resolveFirstHeadingTitleForThumbnail(): string {
  // ✅ 글 제목을 우선 사용 (사용자 요청에 따라 수정)
  try {
    // 1. 생성된 제목 필드에서 가져오기
    const generatedTitleEl = document.getElementById('unified-generated-title') as HTMLInputElement | null;
    const generatedTitle = String(generatedTitleEl?.value || '').trim();
    if (generatedTitle) return generatedTitle;
  } catch (e) {
    console.warn('[thumbnailPreview] catch ignored:', e);
  }

  try {
    // 2. 통합 제목 필드에서 가져오기
    const unifiedTitleEl = document.getElementById('unified-title') as HTMLInputElement | null;
    const unifiedTitle = String(unifiedTitleEl?.value || '').trim();
    if (unifiedTitle) return unifiedTitle;
  } catch (e) {
    console.warn('[thumbnailPreview] catch ignored:', e);
  }

  try {
    // 3. currentStructuredContent에서 제목 가져오기
    const sc: any = (window as any).currentStructuredContent;
    const selectedTitle = String(sc?.selectedTitle || '').trim();
    if (selectedTitle) return selectedTitle;
  } catch (e) {
    console.warn('[thumbnailPreview] catch ignored:', e);
  }

  // ✅ 제목이 없으면 1번 소제목 폴백
  try {
    const sc: any = (window as any).currentStructuredContent;
    const fromStructured = String(sc?.headings?.[0]?.title || '').trim();
    if (fromStructured) return fromStructured;
  } catch (e) {
    console.warn('[thumbnailPreview] catch ignored:', e);
  }

  try {
    const domTitle = (document.querySelector(
      '#prompts-container .prompt-item[data-index="1"] .heading-title-text'
    ) as HTMLElement | null)?.textContent;
    const fromDom = String(domTitle || '').trim();
    if (fromDom) return fromDom;
  } catch (e) {
    console.warn('[thumbnailPreview] catch ignored:', e);
  }

  try {
    const h0: any = (ImageManager as any)?.headings?.[0];
    const fromManager = typeof h0 === 'string' ? String(h0).trim() : String(h0?.title || '').trim();
    if (fromManager) return fromManager;
  } catch (e) {
    console.warn('[thumbnailPreview] catch ignored:', e);
  }

  return '제목';
}


export function initThumbnailGenerator(): void {
  const thumbnailPreview = document.getElementById('thumbnail-preview') as HTMLElement | null;
  const thumbnailText = document.getElementById('thumbnail-text') as HTMLInputElement;
  const thumbnailFontSize = document.getElementById('thumbnail-font-size') as HTMLInputElement;
  const thumbnailTextColor = document.getElementById('thumbnail-text-color') as HTMLInputElement;
  const thumbnailBgColor = document.getElementById('thumbnail-bg-color') as HTMLInputElement;
  const thumbnailBorderColor = document.getElementById('thumbnail-border-color') as HTMLInputElement;
  const thumbnailBorderWidth = document.getElementById('thumbnail-border-width') as HTMLInputElement;

  const autoGeneratePromptBtn = document.getElementById('auto-generate-prompt-btn') as HTMLButtonElement;
  const generateAiBackgroundBtn = document.getElementById('generate-ai-background-btn') as HTMLButtonElement;
  const loadExternalImageBtn = document.getElementById('load-external-image-btn') as HTMLButtonElement;
  const removeBackgroundImageBtn = document.getElementById('remove-background-image-btn') as HTMLButtonElement;
  const saveThumbnailBtn = document.getElementById('save-thumbnail-btn') as HTMLButtonElement;
  const useThumbnailBtn = document.getElementById('use-thumbnail-btn') as HTMLButtonElement;
  const aiPromptKeywords = document.getElementById('ai-prompt-keywords') as HTMLInputElement;
  const aiImagePrompt = document.getElementById('ai-image-prompt') as HTMLTextAreaElement;
  const aiPromptResultGroup = document.getElementById('ai-prompt-result-group') as HTMLDivElement;
  const aiImageProvider = document.getElementById('ai-image-provider') as HTMLSelectElement;

  // 프롬프트 자동 생성
  if (autoGeneratePromptBtn && aiPromptKeywords) {
    autoGeneratePromptBtn.addEventListener('click', async () => {
      const keywords = aiPromptKeywords.value.trim();
      if (!keywords) {
        alert('키워드를 입력해주세요.');
        return;
      }

      autoGeneratePromptBtn.disabled = true;
      autoGeneratePromptBtn.textContent = '생성 중...';

      try {
        const prompt = `Create a detailed English image generation prompt for a blog thumbnail image. The image should be visually appealing, professional, and suitable for a blog post about: ${keywords}. Include specific details about composition, lighting, colors, and style. Make it photorealistic and high quality.`;
        const result = await window.api.generateContent(prompt);
        if (result.success && result.content) {
          aiImagePrompt.value = result.content;
          if (aiPromptResultGroup) aiPromptResultGroup.style.display = 'block';
        } else {
          alert('프롬프트 생성에 실패했습니다.');
        }
      } catch (error) {
        alert(`오류: ${(error as Error).message}`);
      } finally {
        autoGeneratePromptBtn.disabled = false;
        autoGeneratePromptBtn.textContent = 'AI 프롬프트 자동 생성';
      }
    });
  }

  // ✅ 썸네일 미리보기 업데이트 (배경 이미지 지원)
  function updateThumbnailPreview(): void {
    if (!thumbnailPreview) return;

    const text = thumbnailText?.value || '';
    const fontSize = parseInt(thumbnailFontSize?.value || '32');
    const textColor = thumbnailTextColor?.value || '#ffffff';
    const bgColor = thumbnailBgColor?.value || '#1a1a2e';
    const borderColor = thumbnailBorderColor?.value || '#4a90d9';
    const borderWidth = parseInt(thumbnailBorderWidth?.value || '3');

    // 텍스트 줄바꿈 처리
    const lines = text.split('\n').filter(line => line.trim());
    const lineHeight = fontSize * 1.3;
    const startY = 200 - ((lines.length - 1) * lineHeight) / 2;

    let textElements = '';
    lines.forEach((line, index) => {
      const y = startY + (index * lineHeight);
      // 텍스트 그림자 효과
      textElements += `
        <text x="302" y="${y + 2}" text-anchor="middle" font-size="${fontSize}" fill="rgba(0,0,0,0.5)" font-weight="bold" font-family="'Noto Sans KR', sans-serif">${escapeHtml(line)}</text>
        <text x="300" y="${y}" text-anchor="middle" font-size="${fontSize}" fill="${textColor}" font-weight="bold" font-family="'Noto Sans KR', sans-serif">${escapeHtml(line)}</text>
      `;
    });

    // 배경 이미지가 있으면 사용, 없으면 단색 배경
    let backgroundElement = '';
    if (thumbnailBackgroundDataUrl) {
      backgroundElement = `
        <defs>
          <pattern id="bg-pattern" patternUnits="userSpaceOnUse" width="600" height="400">
            <image href="${thumbnailBackgroundDataUrl}" x="0" y="0" width="600" height="400" preserveAspectRatio="xMidYMid slice"/>
          </pattern>
        </defs>
        <rect width="600" height="400" fill="url(#bg-pattern)"/>
        <rect width="600" height="400" fill="rgba(0,0,0,0.3)"/>
      `;
    } else {
      backgroundElement = `<rect width="600" height="400" fill="${bgColor}"/>`;
    }

    (thumbnailPreview as HTMLElement).innerHTML = `
      ${backgroundElement}
      <rect x="${borderWidth / 2}" y="${borderWidth / 2}" width="${600 - borderWidth}" height="${400 - borderWidth}" fill="none" stroke="${borderColor}" stroke-width="${borderWidth}" rx="8"/>
      ${textElements}
    `;
  }

  // 모든 입력 필드에 이벤트 리스너 추가
  [thumbnailText, thumbnailFontSize, thumbnailTextColor, thumbnailBgColor, thumbnailBorderColor, thumbnailBorderWidth].forEach(el => {
    if (el) {
      el.addEventListener('input', updateThumbnailPreview);
    }
  });

  // 초기 미리보기
  updateThumbnailPreview();

  // ✅ AI 이미지 생성 버튼 - 실제 구현
  if (generateAiBackgroundBtn && aiImagePrompt && aiImageProvider) {
    generateAiBackgroundBtn.addEventListener('click', async () => {
      const prompt = aiImagePrompt.value.trim();
      if (!prompt) {
        alert('프롬프트를 입력하거나 자동 생성해주세요.');
        return;
      }

      generateAiBackgroundBtn.disabled = true;
      generateAiBackgroundBtn.textContent = '🎨 AI 이미지 생성 중...';

      try {
        const provider = aiImageProvider.value || 'gemini';

        // ✅ 실제 AI 이미지 생성 호출
        const result = await generateImagesWithCostSafety({
          provider: provider,
          items: [{ heading: '썸네일 배경', prompt: prompt, isThumbnail: false }]
        });

        if (result.success && result.images && result.images.length > 0) {
          const image = result.images[0];
          thumbnailBackgroundDataUrl = image.previewDataUrl || null;
          thumbnailBackgroundImage = image.filePath || null;

          updateThumbnailPreview();

          if (removeBackgroundImageBtn) removeBackgroundImageBtn.style.display = 'inline-block';
          alert('✅ AI 배경 이미지가 생성되었습니다!');
        } else {
          alert(`❌ 이미지 생성 실패: ${result.message || '알 수 없는 오류'}`);
        }
      } catch (error) {
        alert(`❌ 오류: ${(error as Error).message}`);
      } finally {
        generateAiBackgroundBtn.disabled = false;
        generateAiBackgroundBtn.textContent = '🎨 AI 배경 이미지 생성';
      }
    });
  }

  // ✅ 외부 이미지 가져오기 버튼 - 실제 구현
  if (loadExternalImageBtn) {
    if (loadExternalImageBtn.getAttribute('data-listener-added') !== 'true') {
      loadExternalImageBtn.setAttribute('data-listener-added', 'true');
      loadExternalImageBtn.addEventListener('click', async () => {
        try {
          const result = await window.api.selectLocalImageFile();
          if (result.success && result.filePath) {
            // 파일을 Data URL로 변환 (getLibraryImageData 사용)
            const dataUrl = await window.api.getLibraryImageData(result.filePath);
            if (dataUrl) {
              thumbnailBackgroundDataUrl = dataUrl;
              thumbnailBackgroundImage = result.filePath;

              updateThumbnailPreview();

              if (removeBackgroundImageBtn) removeBackgroundImageBtn.style.display = 'inline-block';
              alert('✅ 배경 이미지가 설정되었습니다!');
            } else {
              alert('❌ 이미지 로드 실패: 파일을 읽을 수 없습니다.');
            }
          }
        } catch (error) {
          alert(`❌ 오류: ${(error as Error).message}`);
        }
      });
    }
  }

  // 배경 이미지 제거 버튼
  if (removeBackgroundImageBtn) {
    removeBackgroundImageBtn.addEventListener('click', () => {
      if (confirm('배경 이미지를 제거하시겠습니까?')) {
        thumbnailBackgroundDataUrl = null;
        thumbnailBackgroundImage = null;
        removeBackgroundImageBtn.style.display = 'none';
        updateThumbnailPreview();
        alert('✅ 배경 이미지가 제거되었습니다.');
      }
    });
  }

  // ✅ 저장 버튼 - Canvas를 사용하여 PNG로 저장
  if (saveThumbnailBtn) {
    saveThumbnailBtn.addEventListener('click', async () => {
      if (!thumbnailPreview) return;

      saveThumbnailBtn.disabled = true;
      saveThumbnailBtn.textContent = '저장 중...';

      try {
        // SVG를 Canvas로 변환하여 PNG 생성
        const svgData = new XMLSerializer().serializeToString(thumbnailPreview);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 600;
          canvas.height = 400;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            ctx.drawImage(img, 0, 0);

            // Canvas를 PNG Data URL로 변환
            const pngDataUrl = canvas.toDataURL('image/png');

            // Data URL을 Uint8Array로 변환
            const base64Data = pngDataUrl.split(',')[1];
            const binaryString = atob(base64Data);
            const uint8Array = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              uint8Array[i] = binaryString.charCodeAt(i);
            }

            // PNG로 저장
            const result = await window.api.saveThumbnailToLocal(
              { type: 'image/png', data: Array.from(uint8Array) },
              'png'
            );

            if (result.success && result.filePath) {
              alert(`✅ 썸네일이 저장되었습니다:\n${result.filePath}`);
            } else {
              alert(`❌ 저장 실패: ${result.message || '알 수 없는 오류'}`);
            }
          }

          URL.revokeObjectURL(svgUrl);
          saveThumbnailBtn.disabled = false;
          saveThumbnailBtn.textContent = '💾 로컬에 저장';
        };

        img.onerror = () => {
          URL.revokeObjectURL(svgUrl);
          alert('❌ 이미지 변환에 실패했습니다.');
          saveThumbnailBtn.disabled = false;
          saveThumbnailBtn.textContent = '💾 로컬에 저장';
        };

        img.src = svgUrl;
      } catch (error) {
        alert(`❌ 오류: ${(error as Error).message}`);
        saveThumbnailBtn.disabled = false;
        saveThumbnailBtn.textContent = '💾 로컬에 저장';
      }
    });
  }

  // ✅ 사용 버튼 - 1번 이미지(썸네일)로 적용
  if (useThumbnailBtn) {
    useThumbnailBtn.addEventListener('click', async () => {
      if (!thumbnailPreview) {
        alert('먼저 썸네일을 생성해주세요.');
        return;
      }

      useThumbnailBtn.disabled = true;
      useThumbnailBtn.textContent = '적용 중...';

      try {
        // SVG를 Canvas로 변환하여 PNG Data URL 생성
        const svgData = new XMLSerializer().serializeToString(thumbnailPreview);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 600;
          canvas.height = 400;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const pngDataUrl = canvas.toDataURL('image/png');

            // ✅ 발행/그리드/프롬프트 전부에 반영되도록 로컬 파일로 저장
            const base64Data = pngDataUrl.split(',')[1];
            const binaryString = atob(base64Data);
            const uint8Array = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              uint8Array[i] = binaryString.charCodeAt(i);
            }

            let savedFilePath = '';
            try {
              const saveRes = await window.api.saveThumbnailToLocal(
                { type: 'image/png', data: Array.from(uint8Array) },
                'png'
              );
              if (saveRes?.success && saveRes.filePath) {
                savedFilePath = String(saveRes.filePath || '').trim();
              }
            } catch (e) {
              console.warn('[thumbnailPreview] catch ignored:', e);
            }

            // ✅ 1번 이미지(썸네일) 미리보기에 적용
            const firstPromptItem = document.querySelector('.prompt-item[data-index="1"]');
            if (firstPromptItem) {
              const imageContainer = firstPromptItem.querySelector('.generated-image') as HTMLDivElement;
              if (imageContainer) {
                imageContainer.innerHTML = `
                  <img src="${pngDataUrl}" alt="썸네일" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">
                  <div style="position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.7); color: #4ade80; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">
                    ✅ 썸네일 적용됨
                  </div>
                `;
                imageContainer.style.position = 'relative';

                ensurePromptCardRemoveButtons();
                ensurePromptCardRemoveHandler();
              }

              // 전역 이미지 배열에도 저장
              const structuredContent = (window as any).currentStructuredContent as any;
              if (structuredContent?.headings && Array.isArray(structuredContent.headings)) {
                try {
                  ImageManager.setHeadings(structuredContent.headings);
                } catch (e) {
                  console.warn('[thumbnailPreview] catch ignored:', e);
                }
              }

              const firstHeadingTitle = resolveFirstHeadingTitleForThumbnail();

              ImageManager.setImage(firstHeadingTitle, {
                ...(ImageManager.getImage(firstHeadingTitle) || {}),
                heading: firstHeadingTitle,
                previewDataUrl: pngDataUrl,
                url: pngDataUrl,
                filePath: savedFilePath || pngDataUrl,
                provider: 'thumbnail-generator',
                headingIndex: 0
              });

              // ✅ [2026-02-12 P1 FIX #4] 수동 partial sync → syncGlobalImagesFromImageManager 통합
              syncGlobalImagesFromImageManager();
              const sc2: any = (window as any).currentStructuredContent;
              if (sc2?.headings) {
                updateUnifiedImagePreview(sc2.headings, generatedImages);
              }

              alert('✅ 썸네일이 1번 이미지로 적용되었습니다!\n\n발행 시 이 이미지가 대표 이미지(썸네일)로 사용됩니다.');
            } else {
              // 프롬프트 아이템이 없으면 이미지 그리드에 적용 시도
              const imageGrid = document.getElementById('generated-images-grid');
              if (imageGrid) {
                const firstImageCard = imageGrid.querySelector('.image-card');
                if (firstImageCard) {
                  const imgEl = firstImageCard.querySelector('img');
                  if (imgEl) {
                    imgEl.src = pngDataUrl;
                    alert('✅ 썸네일이 1번 이미지로 적용되었습니다!');
                  }
                }
              } else {
                alert('⚠️ 먼저 글을 생성하여 소제목과 이미지를 만들어주세요.\n\n그 후 썸네일 생성기에서 만든 이미지를 1번 이미지로 적용할 수 있습니다.');
              }
            }
          }

          URL.revokeObjectURL(svgUrl);
          useThumbnailBtn.disabled = false;
          useThumbnailBtn.textContent = '✅ 1번 이미지로 사용';
        };

        img.onerror = () => {
          URL.revokeObjectURL(svgUrl);
          alert('❌ 이미지 변환에 실패했습니다.');
          useThumbnailBtn.disabled = false;
          useThumbnailBtn.textContent = '✅ 1번 이미지로 사용';
        };

        img.src = svgUrl;
      } catch (error) {
        alert(`❌ 오류: ${(error as Error).message}`);
        useThumbnailBtn.disabled = false;
        useThumbnailBtn.textContent = '✅ 1번 이미지로 사용';
      }
    });
  }
}

export function updateThumbnailPreview(): void {
  // Delegate to initThumbnailGenerator's internal tracking via re-init
  // This is exposed for external callers - the actual implementation runs inside initThumbnailGenerator
  initThumbnailGenerator();
}

// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 향상된 fetch → ./modules/enhancedFetch.ts로 이동
// - enhancedFetch
// - 상단 import 참조
// ═══════════════════════════════════════════════════════════════════


// ============================================
// 빠른 실행 툴바 초기화
// ============================================

// 탭 전환 함수
