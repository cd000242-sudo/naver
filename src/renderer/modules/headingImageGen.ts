// @ts-nocheck
// ============================================
// 소제목 이미지 생성 모듈 (Heading Image Generation)
// modules/headingImageGen.ts
// ============================================

export function initHeadingImageGeneration(): void {
  const analyzeBtn = document.getElementById('analyze-headings-btn') as HTMLButtonElement;
  const headingAnalysisContent = document.getElementById('heading-analysis-content') as HTMLTextAreaElement;
  const headingsSelectionContainer = document.getElementById('headings-selection-container') as HTMLDivElement;
  const headingsCheckboxList = document.getElementById('headings-checkbox-list') as HTMLDivElement;
  const generateImagesBtn = document.getElementById('generate-heading-images-btn') as HTMLButtonElement;
  const imageGeneratorProvider = document.getElementById('image-generator-provider') as HTMLSelectElement;
  const generatedImagesPreview = document.getElementById('generated-images-preview') as HTMLDivElement;
  const generatedImagesGrid = document.getElementById('generated-images-grid') as HTMLDivElement;

  let analyzedHeadings: Array<{ title: string; imagePrompt: string; referenceImagePath?: string; referenceImageUrl?: string }> = [];

  // 소제목 분석 버튼
  if (analyzeBtn && headingAnalysisContent) {
    analyzeBtn.addEventListener('click', async () => {
      const content = headingAnalysisContent.value.trim();
      if (!content) {
        alert('콘텐츠를 입력해주세요.');
        return;
      }

      analyzeBtn.disabled = true;
      analyzeBtn.textContent = '분석 중...';
      appendLog('🔍 소제목 분석 중...');

      try {
        // 구조화 콘텐츠 생성으로 소제목 추출
        const apiClient = EnhancedApiClient.getInstance();
        const apiResponse = await apiClient.call(
          'generateStructuredContent',
          [{
            assembly: {
              baseText: content,
              generator: UnifiedDOMCache.getGenerator(), // ✅ [2026-02-22 FIX] perplexity 지원
            }
          }],
          {
            retryCount: 3,
            retryDelay: 2000,
            timeout: 600000
          }
        );
        const result = apiResponse.data || { success: false, message: apiResponse.error };

        if (result.success && result.content?.headings && result.content.headings.length > 0) {
          analyzedHeadings = result.content.headings.map((h: any) => ({
            title: String(h.title || h),
            imagePrompt: String(h.imagePrompt || h.title || h),
            content: h.content || '', // ✅ [2026-03-03] 본문 맥락 보존 (옵션 B)
          }));

          // 체크박스 목록 생성 (최대 10개) (✅ HTML 이스케이프 적용)
          const displayHeadings = analyzedHeadings.slice(0, 10);
          headingsCheckboxList.innerHTML = displayHeadings.map((heading: any, index: number) => {
            const safeTitle = escapeHtml(heading.title || '');
            const safeImagePrompt = escapeHtml(heading.imagePrompt || '');
            return `
              <label style="display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.5rem; border-radius: 0.25rem; cursor: pointer; transition: background var(--transition-fast);">
                <input type="checkbox" class="heading-checkbox" data-heading-index="${index}" checked style="margin-top: 0.25rem;">
                <div style="flex: 1;">
                  <div style="font-weight: 600; margin-bottom: 0.25rem;">${safeTitle}</div>
                  <div style="font-size: 0.875rem; color: var(--text-muted);">프롬프트: ${safeImagePrompt}</div>
                </div>
              </label>
            `;
          }).join('');

          // 체크박스 호버 효과
          headingsCheckboxList.querySelectorAll('label').forEach(label => {
            label.addEventListener('mouseenter', () => {
              label.style.background = 'var(--bg-hover)';
            });
            label.addEventListener('mouseleave', () => {
              label.style.background = 'transparent';
            });
          });

          headingsSelectionContainer.style.display = 'block';
          appendLog(`✅ ${displayHeadings.length}개의 소제목이 분석되었습니다.`);
        } else {
          appendLog(`❌ 소제목 분석 실패: ${result.message || '알 수 없는 오류'}`);
          alert(`❌ 소제목 분석 실패: ${result.message || '알 수 없는 오류'}`);
        }
      } catch (error) {
        appendLog(`❌ 분석 오류: ${(error as Error).message}`);
        alert(`❌ 오류: ${(error as Error).message}`);
      } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '소제목 분석하기';
      }
    });
  }

  // 이미지 생성 버튼
  if (generateImagesBtn && imageGeneratorProvider) {
    generateImagesBtn.addEventListener('click', async () => {
      const selectedCheckboxes = headingsCheckboxList.querySelectorAll('.heading-checkbox:checked');
      if (selectedCheckboxes.length === 0) {
        alert('생성할 소제목을 최소 1개 이상 선택해주세요.');
        return;
      }

      if (selectedCheckboxes.length > 10) {
        alert('최대 10개까지만 선택할 수 있습니다.');
        return;
      }

      generateImagesBtn.disabled = true;
      generateImagesBtn.textContent = '이미지 생성 중...';

      try {
        const selectedIndices = Array.from(selectedCheckboxes).map(checkbox =>
          parseInt((checkbox as HTMLInputElement).getAttribute('data-heading-index') || '0')
        );

        const selectedHeadings = selectedIndices.map(index => analyzedHeadings[index]);

        // ✅ 이미 이미지가 있는 소제목 필터링
        const existingImageHeadings = new Set(generatedImages.map(img => img.heading));
        const headingsToGenerate = selectedHeadings.filter(h => !existingImageHeadings.has(h.title));

        if (headingsToGenerate.length === 0) {
          alert(`선택한 모든 소제목(${selectedHeadings.length}개)에 이미 이미지가 있습니다!\n\n💡 이미지를 변경하려면 미리보기에서 ❌ 제거 버튼을 먼저 눌러주세요.`);
          appendLog(`⚠️ 선택한 소제목에 이미 이미지가 모두 있습니다.`);
          generateImagesBtn.disabled = false;
          generateImagesBtn.textContent = '선택한 소제목 이미지 생성하기';
          return;
        }

        // 건너뛴 소제목 로그
        const skippedHeadings = selectedHeadings.filter(h => existingImageHeadings.has(h.title));
        if (skippedHeadings.length > 0) {
          appendLog(`⏭️ 이미 이미지가 있는 소제목 ${skippedHeadings.length}개는 건너뜁니다:`);
          skippedHeadings.forEach(h => {
            appendLog(`   - "${h.title}"`);
          });
        }

        appendLog(`🎨 ${headingsToGenerate.length}개 소제목의 이미지 생성 시작... (전체 ${selectedHeadings.length}개 중)`);

        const selectedBtn = (document.querySelector('.image-source-btn.selected') || document.querySelector('.unified-img-source-btn.selected')) as HTMLButtonElement;
        const provider = (selectedBtn?.dataset.source || 'nano-banana-pro') as 'nano-banana-pro' | 'prodia' | 'stability' | 'deepinfra' | 'falai' | 'pollinations';

        // ✅ [2026-03-03 FIX v2] 옵션 A+B 강화: imagePrompt 영문/한국어/없음 모두 처리
        const itemsWithPrompts = await Promise.all(headingsToGenerate.map(async (h: any) => {
          const existingImagePrompt = h.imagePrompt?.trim();
          const titleTrimmed = h.title?.trim();
          const isPromptDifferentFromTitle = existingImagePrompt && existingImagePrompt !== titleTrimmed;

          let aiPrompt: string;

          if (isPromptDifferentFromTitle && /[a-zA-Z]/.test(existingImagePrompt) && !/[가-힣]/.test(existingImagePrompt)) {
            // Case 1: 영문 imagePrompt가 이미 존재 → 그대로 사용 (API 호출 절약)
            aiPrompt = existingImagePrompt;
            console.log(`[HeadingImageGen] ✅ 영문 imagePrompt 재사용: "${h.title}" → "${aiPrompt.substring(0, 60)}..."`);
          } else if (isPromptDifferentFromTitle && /[가-힣]/.test(existingImagePrompt)) {
            // Case 2: 한국어 imagePrompt 존재 → imagePrompt를 context로 전달하여 번역+활용
            const contextForTranslation = `${existingImagePrompt}. ${(h.content || '').substring(0, 200)}`;
            aiPrompt = await generateEnglishPromptForHeading(h.title || '', undefined, undefined, contextForTranslation);
            console.log(`[HeadingImageGen] 🔄 한국어 imagePrompt 번역: "${existingImagePrompt.substring(0, 30)}" → "${aiPrompt.substring(0, 60)}..."`);
          } else {
            // Case 3: imagePrompt 없음/소제목과 동일 → 본문 맥락으로 추론 (옵션 B)
            aiPrompt = await generateEnglishPromptForHeading(h.title || '', undefined, undefined, h.content);
          }
          return {
            heading: h.title,
            prompt: aiPrompt,
            englishPrompt: aiPrompt, // ✅ DeepInfra용
            referenceImagePath: h.referenceImagePath, // ✅ 참조 이미지 경로 전달
            referenceImageUrl: h.referenceImageUrl,   // ✅ 참조 이미지 URL 전달
          };
        }));

        const result = await generateImagesWithCostSafety({
          provider,
          items: itemsWithPrompts,
          postTitle: currentStructuredContent?.selectedTitle,
          postId: currentPostId || undefined,
          isFullAuto: true
        });

        if (result.success && result.images && result.images.length > 0) {
          // 생성된 이미지 목록에 추가
          result.images.forEach((img: any) => {
            generatedImages.push({
              heading: img.heading,
              filePath: img.filePath,
              previewDataUrl: img.previewDataUrl,
              provider: img.provider,
            });
          });

          // 이미지 그리드 표시 (✅ HTML 이스케이프 적용)
          generatedImagesGrid.innerHTML = result.images.filter((img: any) => img).map((img: any) => {
            const safeHeading = escapeHtml(img.heading || '');
            const safeFilePath = escapeHtml(img.filePath || '');
            const imageUrl = img.previewDataUrl || img.filePath || (img as any).url || '';
            return `
              <div class="image-item" data-image-id="${safeFilePath}">
                <img src="${imageUrl}" alt="${safeHeading}" loading="lazy" style="width: 100%; height: 200px; object-fit: cover; border-radius: var(--radius-md);">
                <div style="padding: 0.5rem; font-size: 0.875rem; font-weight: 600;">${safeHeading}</div>
              </div>
            `;
          }).join('');

          generatedImagesPreview.style.display = 'block';

          // ✅ 전체 이미지 수 표시
          const totalImages = generatedImages.length;
          const totalHeadings = analyzedHeadings.length;
          const remainingHeadings = totalHeadings - totalImages;

          appendLog(`✅ ${result.images.length}개의 이미지가 새로 생성되었습니다.`);
          appendLog(`📊 전체 진행 상황: ${totalImages}/${totalHeadings}개 완료 (남은 소제목: ${remainingHeadings}개)`);

          if (remainingHeadings > 0) {
            alert(`✅ ${result.images.length}개의 이미지가 생성되었습니다!\n\n📊 전체 진행 상황:\n- 완료: ${totalImages}/${totalHeadings}개\n- 남은 소제목: ${remainingHeadings}개\n\n💡 나머지 소제목을 선택하고 다시 생성 버튼을 누르면 됩니다!`);
          } else {
            alert(`🎉 모든 소제목(${totalImages}/${totalHeadings}개)의 이미지 생성 완료!\n\n이제 반자동 발행을 진행하세요!`);
          }
        } else {
          appendLog(`❌ 이미지 생성 실패: ${result.message || '알 수 없는 오류'}`);
          alert(`❌ 이미지 생성 실패: ${result.message || '알 수 없는 오류'}`);
        }
      } catch (error) {
        appendLog(`❌ 이미지 생성 오류: ${(error as Error).message}`);
        alert(`❌ 오류: ${(error as Error).message}`);
      } finally {
        generateImagesBtn.disabled = false;
        generateImagesBtn.textContent = '선택한 소제목 이미지 생성하기';
      }
    });
  }

  // ✅ 프롬프트 새로고침 버튼 이벤트
  const refreshPromptsBtn = document.getElementById('refresh-prompts-btn') as HTMLButtonElement;
  const setFirstHeadingThumbnailBtn = document.getElementById('set-first-heading-thumbnail-btn') as HTMLButtonElement;

  if (refreshPromptsBtn) {
    refreshPromptsBtn.addEventListener('click', async () => {
      const headings = getCurrentImageHeadings();
      if (headings.length === 0) {
        alert('새로고침할 소제목이 없습니다.');
        return;
      }

      if (!confirm(`영어 프롬프트를 새로 생성하시겠습니까?\n\n현재 ${headings.length}개의 프롬프트가 다시 생성됩니다.`)) {
        return;
      }

      try {
        refreshPromptsBtn.disabled = true;
        refreshPromptsBtn.innerHTML = '<span>🔄</span><span>생성 중...</span>';

        appendLog(`🔄 ${headings.length}개 소제목의 영어 프롬프트를 새로 생성합니다...`, 'images-log-output');

        // ✅ [2026-03-03 FIX] AI 기반 프롬프트 재생성 — 본문 맥락 전달로 품질 향상
        const refreshedHeadings = await Promise.all(headings.map(async (h: any) => {
          const title = String(h.title || h.text || (typeof h === 'string' ? h : '')).trim();
          const aiPrompt = await generateEnglishPromptForHeading(title || 'Abstract Subject', undefined, undefined, h.content);
          return {
            title: title || '소제목',
            prompt: aiPrompt
          };
        }));

        displayImageHeadingsWithPrompts(refreshedHeadings);

        appendLog(`✅ ${refreshedHeadings.length}개 프롬프트가 새로고침되었습니다!`, 'images-log-output');
        toastManager.success(`✅ ${refreshedHeadings.length}개 프롬프트 새로고침 완료!`);
      } catch (error) {
        appendLog(`❌ 프롬프트 새로고침 실패: ${(error as Error).message}`, 'images-log-output');
        alert(`❌ 오류: ${(error as Error).message}`);
      } finally {
        refreshPromptsBtn.disabled = false;
        refreshPromptsBtn.innerHTML = '<span>🔄</span><span>새로고침</span>';
      }
    });
  }

  if (setFirstHeadingThumbnailBtn && !setFirstHeadingThumbnailBtn.hasAttribute('data-listener-added')) {
    setFirstHeadingThumbnailBtn.setAttribute('data-listener-added', 'true');
    setFirstHeadingThumbnailBtn.addEventListener('click', async () => {
      try {
        // ✅ 1번 소제목은 DOM 의존하지 않고 structuredContent/ImageManager에서 우선 찾기
        const structured = (window as any).currentStructuredContent as any;
        const firstHeading = structured?.headings?.[0] ?? ImageManager.headings?.[0] ?? null;
        let firstHeadingTitle = '';
        if (typeof firstHeading === 'string') firstHeadingTitle = firstHeading;
        else if (firstHeading && typeof firstHeading === 'object') firstHeadingTitle = firstHeading.title || '';

        if (!firstHeadingTitle) {
          const firstPromptItem = document.querySelector('#prompts-container .prompt-item[data-index="1"]') as HTMLElement | null;
          // ✅ [2026-03-16 FIX] data-heading-title 우선 사용 (배지 오염 방지)
          const dataTitle = firstPromptItem?.getAttribute('data-heading-title')?.trim();
          const pureTitle = (firstPromptItem?.querySelector('.heading-title-pure') as HTMLElement | null)?.textContent?.trim();
          firstHeadingTitle = dataTitle || pureTitle || (firstPromptItem?.querySelector('.heading-title-text')?.textContent || '').trim();
        }

        if (!firstHeadingTitle) {
          toastManager.warning('1번 소제목을 찾을 수 없습니다. 먼저 소제목 분석을 해주세요.');
          return;
        }

        const ensureFileUrl = (p: string): string => {
          if (!p) return '';
          const s = String(p).trim();
          if (!s) return '';
          if (/^https?:\/\//i.test(s) || /^data:/i.test(s) || /^file:\/\//i.test(s)) return s;
          const normalized = s.replace(/^\/+/, '').replace(/\\/g, '/');
          return `file:///${normalized}`;
        };

        // 1) ✅ 생성/배치 데이터 기반 우선순위 매칭: isThumbnail 또는 headingIndex===0
        const allImages = ImageManager.getAllImages();
        let firstImage: any | null =
          allImages.find((img: any) => img?.isThumbnail === true) ||
          allImages.find((img: any) => img?.headingIndex === 0) ||
          null;

        // 2) ImageManager 매핑(타이틀)로 찾기
        if (!firstImage) {
          firstImage = ImageManager.getImage(firstHeadingTitle);
        }

        // 3) 전체 이미지에서 heading 텍스트로 매칭
        if (!firstImage) {
          firstImage = allImages.find((img: any) => (img.heading || '').trim() === firstHeadingTitle.trim()) || null;
        }

        // 4) 최후 폴백: 첫 이미지
        if (!firstImage && allImages.length > 0) {
          firstImage = allImages[0];
        }

        const imageUrl = ensureFileUrl(firstImage?.previewDataUrl || firstImage?.url || firstImage?.filePath || '');
        if (!imageUrl) {
          toastManager.warning('1번 소제목 이미지가 없습니다. 먼저 이미지 생성/수집 후 다시 시도하세요.');
          return;
        }

        const imageToolsTab = document.querySelector('[data-tab="image-tools"]') as HTMLElement | null;
        imageToolsTab?.click();

        const thumbnailSubtabBtn = document.querySelector('.image-tools-subtab[data-subtab="thumbnail"]') as HTMLElement | null;
        thumbnailSubtabBtn?.click();

        setTimeout(async () => {
          try {
            if (!thumbnailGenerator) {
              thumbnailGenerator = new ThumbnailGenerator();
            }

            // ✅ [2026-01-21] 쇼핑커넥트 모드: 글 제목을 메인 텍스트로 사용 (소제목이 아닌 블로그 제목)
            const blogTitle =
              (document.getElementById('unified-generated-title') as HTMLInputElement)?.value?.trim() ||
              (document.getElementById('unified-title') as HTMLInputElement)?.value?.trim() ||
              ((window as any).currentStructuredContent as any)?.selectedTitle?.trim() ||
              firstHeadingTitle; // 폴백: 1번 소제목

            thumbnailGenerator.setMainText(blogTitle);
            await thumbnailGenerator.setBackgroundFromUrl(imageUrl);
            toastManager.success('✅ 썸네일 생성기에 글 제목과 이미지가 적용되었습니다!');
          } catch (e) {
            console.error('[Thumbnail] 썸네일 생성기 자동 설정 실패:', e);
            toastManager.error('❌ 썸네일 자동 설정에 실패했습니다.');
          }
        }, 200);
      } catch (error) {
        console.error('[Thumbnail] 1번 소제목 썸네일 지정 실패:', error);
        toastManager.error('❌ 썸네일 자동 설정에 실패했습니다.');
      }
    });
  }

  // ✅ 수집/생성된 이미지를 기반으로 나노 바나나 프로 예비 이미지 생성
  async function generateReserveDetailImagesFromBaseImages(baseImages: any[], blogTitle: string): Promise<any[]> {
    const MAX_RESERVES = 6;
    if (!Array.isArray(baseImages) || baseImages.length === 0) {
      return [];
    }

    const baseCount = baseImages.length;
    const reserveCount = Math.min(MAX_RESERVES, Math.max(1, baseCount));

    appendLog(`🧩 예비 이미지 ${reserveCount}개를 나노 바나나 프로로 생성합니다...`, 'images-log-output');
    showImagesProgress(85, '예비 이미지 생성 중...', `나노 바나나 프로로 예비 이미지 ${reserveCount}개 생성 중`);

    const items = [] as any[];
    for (let i = 0; i < reserveCount; i++) {
      const base = baseImages[i % baseCount] || {};
      const headingTitle = String(base.heading || `소제목 ${i + 1}`).trim();
      const promptTextSource = String(base.prompt || headingTitle || blogTitle || '').trim();
      const prompt = promptTextSource || headingTitle || blogTitle || `상세 이미지 ${i + 1}`;
      const rawPath = String(base.filePath || base.url || '').trim();

      items.push({
        heading: `예비 이미지 ${i + 1}`,
        prompt,
        // ✅ [2026-02-24 FIX] 예비이미지도 체크박스 상태 존중 (nano-banana-pro 전용이므로 엔진 체크 불필요)
        allowText: !!(document.getElementById('thumbnail-text-option') as HTMLInputElement)?.checked,
        referenceImagePath: rawPath || undefined,
        referenceImageUrl: rawPath || undefined,
      });
    }

    try {
      const result = await generateImagesWithCostSafety({
        provider: 'nano-banana-pro',
        items,
        postTitle: blogTitle,
        isFullAuto: false,
      });

      if (!result?.success || !Array.isArray(result.images) || result.images.length === 0) {
        throw new Error(String(result?.message || '예비 상세 이미지 생성 실패'));
      }

      const reserves = result.images.map((img: any, idx: number) => {
        const raw = String(img.filePath || img.url || img.previewDataUrl || '').trim();
        const url = raw || '';
        const preview = img.previewDataUrl || url;
        return {
          heading: `예비 이미지 ${idx + 1}`,
          filePath: raw,
          url,
          previewDataUrl: preview,
          prompt: items[idx]?.prompt || '',
          headingIndex: -1, // 예비 이미지는 소제목 인덱스와 무관
          provider: 'nano-banana-pro',
        };
      });

      appendLog(`✅ 예비 이미지 ${reserves.length}개 생성 완료`, 'images-log-output');
      return reserves;
    } catch (error) {
      appendLog(`⚠️ 예비 이미지 생성 실패: ${(error as Error).message}`, 'images-log-output');
      return [];
    }
  }

  // ✅ [2026-02-02] 이미지 소스 한글 이름 매핑
  const imageSourceNames: Record<string, string> = {
    'nano-banana-pro': '나노 바나나 프로 (Gemini)',
    'deepinfra': 'DeepInfra (FLUX-2-dev)',
    'deepinfra-flux': 'DeepInfra (FLUX-2-dev)',
    'stability': 'Stability AI',
    'prodia': 'Prodia',
    'falai': 'Fal.ai',
    'fal-ai': 'Fal.ai',
    'pollinations': 'Pollinations',
    'naver': '네이버 이미지 검색',
    'naver-search': '네이버 이미지 검색',
  };

  // ✅ [2026-02-02] 실시간 이미지 미리보기 패널 (Live Preview)
  const liveImagePreview = {
    panel: null as HTMLElement | null,
    mainPreview: null as HTMLImageElement | null,
    grid: null as HTMLElement | null,
    logArea: null as HTMLElement | null,
    progressText: null as HTMLElement | null,
    items: [] as Array<{ status: 'pending' | 'generating' | 'completed' | 'failed'; url?: string; heading: string }>,
    sourceLabel: '',

    // 패널 생성 및 표시
    show(headings: any[], sourceLabel: string) {
      this.sourceLabel = sourceLabel;
      this.items = headings.map((h: any) => ({
        status: 'pending' as const,
        heading: String(h.title || '').trim(),
        url: undefined,
      }));

      // 기존 패널 제거
      this.hide();

      const panel = document.createElement('div');
      panel.id = 'live-image-preview-panel';
      panel.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85); z-index: 99999;
        display: flex; flex-direction: column; padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      `;

      panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 id="live-preview-title" style="color: white; margin: 0; font-size: 1.3rem;">
            🎨 이미지 생성 중... (0/${this.items.length})
          </h2>
          <button id="live-preview-close" style="background: #ef4444; color: white; border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-weight: bold;">
            ✕ 닫기
          </button>
        </div>
        <div style="color: #a1a1aa; margin-bottom: 16px; font-size: 0.9rem;">
          ${sourceLabel}로 생성 중
        </div>
        
        <!-- ✅ [2026-02-02] 좌우 배치: 왼쪽 큰 이미지, 오른쪽 그리드+로그 -->
        <div style="flex: 1; display: flex; gap: 20px; overflow: hidden; min-height: 0;">
          
          <!-- 왼쪽: 메인 미리보기 영역 -->
          <div style="flex: 0 0 350px; display: flex; flex-direction: column;">
            <div id="live-main-preview-container" style="width: 350px; height: 350px; background: #27272a; border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 2px solid #3f3f46;">
              <div style="color: #71717a; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 8px;">🖼️</div>
                <div>이미지 생성 대기 중...</div>
              </div>
            </div>
            <div style="margin-top: 12px; padding: 10px; background: #27272a; border-radius: 8px; text-align: center;">
              <button id="btn-open-images-folder" style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 8px; padding: 10px 20px; cursor: pointer; font-weight: bold; width: 100%; transition: all 0.2s;">
                📂 생성된 이미지 폴더 열기
              </button>
            </div>
          </div>
          
          <!-- 오른쪽: 그리드 + 로그 영역 -->
          <div style="flex: 1; display: flex; flex-direction: column; gap: 12px; min-height: 0;">
            
            <!-- 그리드 미리보기 영역 -->
            <div style="flex: 0 0 auto;">
              <div style="color: #a1a1aa; font-size: 0.85rem; margin-bottom: 8px;">📸 이미지 미리보기 (클릭하여 크게 보기)</div>
              <div id="live-image-grid" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; max-height: 120px; overflow-y: auto; padding: 8px; background: #18181b; border-radius: 8px;">
                ${this.items.map((item, i) => `
                  <div class="live-grid-item" data-index="${i}" style="aspect-ratio: 1; background: #27272a; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 2px solid #3f3f46; position: relative; overflow: hidden;">
                    <span style="color: #71717a; font-size: 1.2rem;">⏳</span>
                  </div>
                `).join('')}
              </div>
            </div>
            
            <!-- ✅ 텍스트 포함 체크박스 -->
            <div style="flex: 0 0 auto; padding: 10px; background: #27272a; border-radius: 8px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: white;">
                <input type="checkbox" id="live-text-overlay-checkbox" style="width: 18px; height: 18px; cursor: pointer;">
                <span>🔤 <strong>썸네일 텍스트 포함</strong></span>
              </label>
            </div>
            
            <!-- 로그 영역 (더 넓게) -->
            <div style="flex: 1; min-height: 150px; overflow: hidden; display: flex; flex-direction: column;">
              <div style="color: #a1a1aa; font-size: 0.85rem; margin-bottom: 8px;">📋 진행 로그</div>
              <div id="live-preview-log" style="flex: 1; background: #18181b; border-radius: 8px; padding: 12px; overflow-y: auto; font-family: monospace; font-size: 0.85rem; color: #d4d4d8; line-height: 1.5;">
                <div>⏳ 이미지 생성을 시작합니다...</div>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(panel);
      this.panel = panel;
      this.grid = panel.querySelector('#live-image-grid');
      this.logArea = panel.querySelector('#live-preview-log');
      this.progressText = panel.querySelector('#live-preview-title');

      // 닫기 버튼 이벤트
      panel.querySelector('#live-preview-close')?.addEventListener('click', () => this.hide());

      // ✅ [2026-02-28] 이미지 폴더 열기 버튼
      panel.querySelector('#btn-open-images-folder')?.addEventListener('click', async () => {
        try {
          if (window.api && typeof window.api.openImagesFolder === 'function') {
            await window.api.openImagesFolder();
          }
        } catch (e) {
          console.warn('[LivePreview] 이미지 폴더 열기 실패:', e);
        }
      });

      // 그리드 아이템 클릭 이벤트
      this.grid?.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest('.live-grid-item') as HTMLElement;
        if (item) {
          const index = parseInt(item.dataset.index || '0', 10);
          const data = this.items[index];
          if (data?.url) {
            this.setMainPreview(data.url, data.heading);
          }
        }
      });

      // ESC 키로 닫기
      const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          this.hide();
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    },

    // 패널 숨기기
    hide() {
      const existing = document.getElementById('live-image-preview-panel');
      if (existing) {
        existing.remove();
      }
      this.panel = null;
      this.grid = null;
      this.logArea = null;
      this.mainPreview = null;
      this.progressText = null;
    },

    // 메인 미리보기 이미지 설정
    setMainPreview(url: string, heading: string) {
      const container = document.getElementById('live-main-preview-container');
      if (container) {
        container.innerHTML = `
          <img src="${url}" alt="${heading}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px;">
        `;
      }
    },

    // 그리드 아이템 업데이트
    updateItem(index: number, status: 'pending' | 'generating' | 'completed' | 'failed', url?: string) {
      if (index >= this.items.length) return;

      this.items[index].status = status;
      if (url) this.items[index].url = url;

      const gridItem = this.grid?.querySelector(`[data-index="${index}"]`) as HTMLElement;
      if (!gridItem) return;

      if (status === 'generating') {
        gridItem.style.border = '2px solid #3b82f6';
        gridItem.innerHTML = `<span style="color: #3b82f6; font-size: 1.2rem;" class="spin-animation">⚡</span>`;
      } else if (status === 'completed' && url) {
        gridItem.style.border = '2px solid #22c55e';
        gridItem.innerHTML = `
          <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">
          <span style="position: absolute; bottom: 2px; right: 2px; background: #22c55e; color: white; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 0.6rem;">✓</span>
        `;
        // 첫 번째 완료된 이미지를 자동으로 메인 미리보기에 표시
        const completedCount = this.items.filter(i => i.status === 'completed').length;
        if (completedCount === 1) {
          this.setMainPreview(url, this.items[index].heading);
        }
      } else if (status === 'failed') {
        gridItem.style.border = '2px solid #ef4444';
        gridItem.innerHTML = `<span style="color: #ef4444; font-size: 1.2rem;">✕</span>`;
      }

      // 진행률 업데이트
      const completed = this.items.filter(i => i.status === 'completed' || i.status === 'failed').length;
      if (this.progressText) {
        this.progressText.textContent = `🎨 이미지 생성 중... (${completed}/${this.items.length})`;
      }
    },

    // 로그 추가
    addLog(message: string) {
      if (this.logArea) {
        const logEntry = document.createElement('div');
        logEntry.textContent = message;
        logEntry.style.marginBottom = '4px';
        this.logArea.appendChild(logEntry);
        this.logArea.scrollTop = this.logArea.scrollHeight;
      }
    },

    // 완료 상태로 전환
    complete(successCount: number, failCount: number) {
      if (this.progressText) {
        this.progressText.innerHTML = `✅ 이미지 생성 완료! (성공: ${successCount}개${failCount > 0 ? `, 실패: ${failCount}개` : ''})`;
      }
      this.addLog(`🎉 총 ${successCount}개 이미지 생성 완료!`);

      // ✅ [2026-03-16] 5초 후 모달(패널) 자동 닫기
      setTimeout(() => {
        if (this.panel) {
          this.panel.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
          this.panel.style.opacity = '0';
          this.panel.style.transform = 'translateY(20px)';
          setTimeout(() => {
            if (this.panel) {
              this.panel.style.display = 'none';
              this.panel.style.opacity = '1';
              this.panel.style.transform = '';
            }
          }, 500);
        }
      }, 5000);
    }
  };

  // CSS 애니메이션 추가 (스피너)
  if (!document.getElementById('live-preview-styles')) {
    const style = document.createElement('style');
    style.id = 'live-preview-styles';
    style.textContent = `
      @keyframes spin-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.8); }
      }
      .spin-animation {
        animation: spin-pulse 0.8s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }

  // ✅ [2026-02-24 FIX] 이벤트 위임: generate-images-btn이 나중에 동적 생성되므로 직접 바인딩 불가
  // document.body에 이벤트 위임하여 버튼 생성 시점과 무관하게 작동
  if (!(document.body as any).__generateImagesBtnDelegated) {
    (document.body as any).__generateImagesBtnDelegated = true;
    document.body.addEventListener('click', async (e) => {
      const target = (e.target as HTMLElement).closest('#generate-images-btn') as HTMLButtonElement | null;
      if (!target) return;
      const generateImagesBtnMain = target;
      const headings = getCurrentImageHeadings();
      if (headings.length === 0) {
        alert('먼저 소제목을 분석해주세요.');
        return;
      }


      const selectedSource = document.querySelector('.image-source-btn.selected') as HTMLButtonElement;
      // ✅ [2026-02-02 FIX] 드롭다운 값 우선 사용
      const dropdownSource = (document.getElementById('image-source-select') as HTMLSelectElement)?.value;
      const imageSource = dropdownSource || selectedSource?.dataset.source || 'nano-banana-pro';
      console.log(`[ImageGeneration] 이미지 소스: ${imageSource} (드롭다운: ${dropdownSource || '없음'}, 버튼: ${selectedSource?.dataset.source || '없음'})`);

      try {
        generateImagesBtnMain.disabled = true;
        generateImagesBtnMain.innerHTML = '<span style="font-size: 1.25rem;">🎨</span><span>생성 중...</span>';

        // ✅ [2026-03-17] ImageFX 사전 Google 로그인 확인 — ImageFX 명시적 선택 시에만
        if (imageSource === 'imagefx') {
          appendLog('🔍 Google 로그인 확인 중... (ImageFX 사용 준비)', 'images-log-output');
          try {
            const loginResult = await (window as any).api.checkImageFxGoogleLogin();
            if (!loginResult.loggedIn) {
              appendLog(`❌ ${loginResult.message}`, 'images-log-output');
              alert(`❌ ImageFX 사용을 위해 Google 로그인이 필요합니다.\n\n${loginResult.message}`);
              generateImagesBtnMain.disabled = false;
              generateImagesBtnMain.innerHTML = '<span style="font-size: 1.25rem;">🎨</span><span>프롬프트대로 이미지 생성하기</span>';
              return;
            }
            appendLog(`✅ Google 로그인 확인 완료: ${loginResult.userName || 'Google 사용자'}`, 'images-log-output');
          } catch (loginErr: any) {
            console.error('[ImageGen] Google 로그인 확인 실패:', loginErr);
            appendLog(`⚠️ Google 로그인 확인 실패: ${loginErr.message} — 생성을 계속 시도합니다.`, 'images-log-output');
          }
        }

        // 진행률 표시 시작
        const sourceLabel = imageSourceNames[imageSource] || imageSource;

        // ✅ [2026-02-23 FIX] 마무리만 제외 - 썸네일 + 소제목 모두 AI 이미지 생성
        // 썸네일(🖼️ 썸네일 📌 썸네일): 배치에서 함께 생성, 마무리: 이미지 불필요
        const filteredHeadings = headings.filter((h: any) => {
          const title = String(h.title || '').trim();
          return !title.includes('📝 마무리') &&
            !title.includes('마무리') &&
            !h.isConclusion;
        });

        if (filteredHeadings.length === 0) {
          appendLog('⚠️ AI 이미지를 생성할 소제목이 없습니다. (썸네일/마무리 제외됨)', 'images-log-output');
          generateImagesBtnMain.disabled = false;
          generateImagesBtnMain.innerHTML = '<span style="font-size: 1.25rem;">🎨</span><span>AI 이미지 생성</span>';
          return;
        }

        // ✅ [2026-02-27 FIX] AI 비동기 프롬프트 업그레이드 — Sync 폴백 프롬프트를 AI 번역으로 교체
        // Gemini → OpenAI → Claude → Perplexity 순 AI 폴백 체인으로 소제목에 맞는 정확한 프롬프트 생성
        appendLog('🤖 AI 프롬프트 번역 중... (소제목 → 영어 이미지 프롬프트)', 'images-log-output');
        const imageStyle = localStorage.getItem('imageStyle') || 'realistic';
        try {
          const upgradeResults = await Promise.all(
            filteredHeadings.map(async (h: any) => {
              // 사용자 수동 오버라이드가 있으면 스킵
              const override = getManualEnglishPromptOverrideForHeading(h.title);
              if (override) {
                h.prompt = override;
                return;
              }
              try {
                const aiPrompt = await generateEnglishPromptForHeading(h.title || '', undefined, imageStyle, h.content);
                if (aiPrompt && aiPrompt.trim()) {
                  h.prompt = aiPrompt;
                  console.log(`[PromptUpgrade] ✅ AI 프롬프트 생성: "${String(h.title || '').substring(0, 25)}" → "${aiPrompt.substring(0, 60)}..."`);
                }
              } catch (e) {
                console.warn(`[PromptUpgrade] AI 프롬프트 실패, 기존 유지: "${h.title}"`, e);
              }
            })
          );
          appendLog(`✅ AI 프롬프트 번역 완료! ${filteredHeadings.length}개 소제목`, 'images-log-output');
          // ✅ [2026-03-09 FIX] aiProgressModal 중복 모달 제거 — liveImagePreview가 동일 역할 수행
        } catch (upgradeError) {
          console.warn('[PromptUpgrade] 일부 실패, 기존 프롬프트로 진행:', upgradeError);
          appendLog('⚠️ 일부 AI 프롬프트 실패 → 기존 사전 번역으로 대체', 'images-log-output');
        }

        // ✅ [2026-03-09 FIX] aiProgressModal.show() 제거 — liveImagePreview가 이미지 미리보기+로그 통합 제공
        liveImagePreview.show(filteredHeadings, sourceLabel);
        liveImagePreview.addLog(`🎨 ${sourceLabel}로 이미지 생성 시작...`);
        liveImagePreview.addLog('⚡ 병렬 처리로 속도 2-3배 향상!');

        showImagesProgress(0, '이미지 생성 준비 중...', '소제목 분석 완료, 이미지 병렬 생성 시작');
        appendLog(`🎨 선택된 이미지 소스: ${sourceLabel}`, 'images-log-output');
        appendLog('🎨 이미지를 병렬로 생성하는 중입니다... ⚡', 'images-log-output');
        appendLog('⚡ 병렬 처리로 속도 2-3배 향상!', 'images-log-output');

        appendLog(`📋 ${headings.length}개 섹션 중 ${filteredHeadings.length}개 이미지 생성 (마무리 제외)`, 'images-log-output');
        liveImagePreview.addLog(`📋 ${filteredHeadings.length}개 대상 (마무리 제외)`);

        // ✅ 병렬 처리: 각 소제목별로 이미지 동시 생성
        const totalHeadings = filteredHeadings.length;
        let completedCount = 0;

        // ✅ 블로그 제목 가져오기 (썸네일용)
        const blogTitle = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value?.trim() ||
          (document.getElementById('unified-title') as HTMLInputElement)?.value?.trim() ||
          (document.getElementById('image-title') as HTMLInputElement)?.value?.trim() || '';

        // ✅ 썸네일 텍스트 포함 여부 체크박스 확인
        const thumbnailTextCheckbox = document.getElementById('thumbnail-text-option') as HTMLInputElement;
        const includeThumbnailText = thumbnailTextCheckbox?.checked ?? false; // 기본값: 텍스트 없음

        // ✅ [2026-02-24 FIX] 수동 썸네일 체크 — 이미 설정된 썸네일이 있으면 전용 썸네일 건너뛰기
        const manualThumbnailImage = ImageManager.getImage('🖼️ 썸네일') || ImageManager.getImage('썸네일');
        const hasManualThumbnailInTab = manualThumbnailImage && (
          (manualThumbnailImage as any).isManualThumbnail === true ||
          (manualThumbnailImage as any).source === 'manual' ||
          (manualThumbnailImage as any).source === 'thumbnail-generator'
        );
        if (hasManualThumbnailInTab) {
          appendLog(`🎨 수동 설정 썸네일 감지됨 → 전용 썸네일 생성 건너뛰기`, 'images-log-output');
        }

        // ✅ [2026-02-28 FIX] 전용 썸네일 생성 — filteredHeadings에 썸네일 항목이 이미 있으면 스킵
        // '🖼️ 썸네일 📌 썸네일' 같은 항목이 소제목 분석에서 이미 나왔으면 배치에서 함께 생성됨
        const hasThumbnailHeading = filteredHeadings.some((h: any) => {
          const t = String(h.title || '').trim();
          return t.includes('🖼️ 썸네일') || t.includes('📌 썸네일');
        });
        if (!hasManualThumbnailInTab && !hasThumbnailHeading) {
          try {
            const thumbnailTitle = blogTitle || resolveFirstHeadingTitleForThumbnail() || '블로그 썸네일';
            const isNanoBanana = imageSource === 'nano-banana-pro' || imageSource === 'pollinations';
            // ✅ [2026-03-05 FIX] 모든 엔진에서 텍스트 포함 허용
            // - 나노바나나프로/2: AI가 직접 한글 텍스트를 이미지에 렌더링
            // - 그 외 엔진: Sharp 후처리 텍스트 오버레이
            const thumbnailAllowText = includeThumbnailText;

            // ✅ [2026-03-11 FIX] 블로그 제목 기반 AI 추론 프롬프트 생성 (fullAutoFlow/multiAccountManager와 동일 방식)
            // 기존: filteredHeadings[0].prompt 단순 복사 → 소제목과 동일한 이미지 생성됨
            // 수정: generateEnglishPromptForHeading(blogTitle) → 블로그 제목에 맞는 고유 썸네일 생성
            let thumbnailPrompt = '';
            try {
              const globalImgSettings = typeof getGlobalImageSettings === 'function' ? getGlobalImageSettings() : {};
              const thumbStyle = globalImgSettings.imageStyle || '';
              thumbnailPrompt = await generateEnglishPromptForHeading(thumbnailTitle, '', thumbStyle);
              appendLog(`🎨 AI 썸네일 프롬프트: "${thumbnailPrompt.substring(0, 60)}..."`, 'images-log-output');
            } catch {
              // AI 전부 실패 시 폴백: 첫 소제목 프롬프트 또는 기본 프롬프트
              if (filteredHeadings.length > 0 && filteredHeadings[0].prompt) {
                thumbnailPrompt = filteredHeadings[0].prompt;
              } else {
                thumbnailPrompt = `eye-catching blog thumbnail, visual metaphor for: ${thumbnailTitle}, cinematic lighting, compelling composition, hero image style`;
              }
              appendLog(`⚠️ AI 썸네일 프롬프트 실패 → 폴백 프롬프트 사용`, 'images-log-output');
            }

            appendLog(`🖼️ 전용 썸네일 생성 중... (제목: "${thumbnailTitle.substring(0, 30)}...") ${thumbnailAllowText ? '(나노바나나프로 한글 텍스트 포함)' : '(텍스트 없음)'}`, 'images-log-output');
            liveImagePreview.addLog(`🖼️ 전용 썸네일 생성 시작...`);

            const thumbnailResult = await generateImagesWithCostSafety({
              provider: imageSource,
              items: [{
                heading: thumbnailTitle,
                prompt: thumbnailPrompt,
                englishPrompt: thumbnailPrompt, // ✅ sanitizeImagePrompt 바이패스
                isThumbnail: true,
                allowText: thumbnailAllowText,
              }],
              postTitle: blogTitle,
              isFullAuto: true,
              thumbnailTextInclude: includeThumbnailText, // ✅ [2026-03-16 FIX] 텍스트 오버레이 옵션 명시적 전달
            });

            if (thumbnailResult?.success && thumbnailResult.images && thumbnailResult.images.length > 0) {
              const thumbImg = thumbnailResult.images[0];
              const thumbUrl = thumbImg.previewDataUrl || thumbImg.filePath || thumbImg.url;
              if (thumbUrl) {
                ImageManager.setImage('🖼️ 썸네일', {
                  url: thumbUrl,
                  filePath: thumbUrl,
                  previewDataUrl: thumbUrl,
                  prompt: thumbnailPrompt,
                  heading: '🖼️ 썸네일',
                  isThumbnail: true,
                  provider: imageSource,
                  timestamp: Date.now(),
                });
                appendLog(`✅ 전용 썸네일 생성 완료!`, 'images-log-output');
                liveImagePreview.addLog(`✅ 전용 썸네일 생성 완료`);
                try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }

                // ✅ [2026-02-27 NEW] 썸네일 프리뷰(ThumbnailGenerator SVG)에도 자동 적용
                try {
                  if (!thumbnailGenerator) {
                    thumbnailGenerator = new ThumbnailGenerator();
                  }
                  thumbnailGenerator.setMainText(blogTitle || thumbnailTitle);
                  await thumbnailGenerator.setBackgroundFromUrl(thumbUrl);
                  appendLog(`🖼️ 썸네일 프리뷰 자동 업데이트 완료!`, 'images-log-output');
                } catch (previewErr) {
                  console.warn('[Thumbnail] 프리뷰 자동 업데이트 실패 (무시):', previewErr);
                }
              }
            } else {
              appendLog(`⚠️ 전용 썸네일 생성 실패 → 썸네일 없이 진행`, 'images-log-output');
              liveImagePreview.addLog(`⚠️ 썸네일 생성 실패, 소제목 이미지만 생성`);
            }
          } catch (thumbError) {
            appendLog(`⚠️ 전용 썸네일 생성 오류: ${(thumbError as Error).message} → 스킵`, 'images-log-output');
          }
        }

        // ✅ [2026-01-18] nano-banana-pro/pollinations: 배치 요청으로 내부 병렬 처리 활성화 (속도 2-3배 향상)
        if (imageSource === 'nano-banana-pro' || imageSource === 'pollinations') {
          appendLog(`⚡ ${imageSource === 'nano-banana-pro' ? '나노 바나나 프로' : 'Pollinations'} 배치 병렬 처리 시작!`, 'images-log-output');
          liveImagePreview.addLog(`⚡ 배치 병렬 처리로 빠른 생성!`);

          // ✅ [2026-02-28 FIX] 썸네일 항목도 배치에 포함 (전용 생성 스킵됨 → 배치에서 함께 생성)
          const batchHeadings = filteredHeadings;

          // 모든 소제목을 한 번에 배치로 요청 (썸네일은 이미 별도 생성됨)
          const batchItems = batchHeadings.map((heading: any, i: number) => {
            const ref = resolveReferenceImageForHeading(String(heading.title || '').trim());
            return {
              heading: heading.title,
              prompt: heading.prompt,
              englishPrompt: heading.prompt,  // ✅ [2026-02-27 FIX] PromptBuilder가 sanitizeImagePrompt 바이패스하도록 englishPrompt 설정
              isThumbnail: false,   // ✅ 전용 썸네일 별도 생성됨 → 소제목은 항상 false
              allowText: false,     // ✅ 소제목 이미지에는 텍스트 없음
              ...ref,
            };
          });

          try {
            const imageResult = await generateImagesWithCostSafety({
              provider: imageSource,
              items: batchItems,
              postTitle: blogTitle,
              isFullAuto: true,
            });

            if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
              // 결과를 소제목에 매핑
              let successCount = 0;
              let failCount = 0;
              for (let i = 0; i < imageResult.images.length; i++) {
                const img = imageResult.images[i];
                const heading = filteredHeadings[i];
                if (img && heading) {
                  const imageUrl = img.previewDataUrl || img.filePath;
                  if (imageUrl) {
                    ImageManager.setImage(heading.title, { url: imageUrl, filePath: imageUrl, previewDataUrl: imageUrl, prompt: heading.prompt, heading: heading.title });

                    // ✅ [2026-02-28 FIX] 배치 내 썸네일 항목이면 '🖼️ 썸네일' 키로도 등록
                    const headingTitleStr = String(heading.title || '').trim();
                    if (headingTitleStr.includes('🖼️ 썸네일') || headingTitleStr.includes('📌 썸네일')) {
                      ImageManager.setImage('🖼️ 썸네일', {
                        url: imageUrl, filePath: imageUrl, previewDataUrl: imageUrl,
                        prompt: heading.prompt, heading: '🖼️ 썸네일',
                        isThumbnail: true, provider: imageSource, timestamp: Date.now(),
                      });
                      appendLog(`🖼️ 배치 썸네일 → '🖼️ 썸네일' 키로 자동 등록`, 'images-log-output');
                      try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }
                      // ThumbnailGenerator SVG 프리뷰에도 자동 적용
                      try {
                        if (!thumbnailGenerator) { thumbnailGenerator = new ThumbnailGenerator(); }
                        thumbnailGenerator.setMainText(blogTitle || headingTitleStr);
                        thumbnailGenerator.setBackgroundFromUrl(imageUrl);
                      } catch { /* ignore */ }
                    }

                    successCount++;
                    const progress = Math.floor(((i + 1) / totalHeadings) * 100);
                    showImagesProgress(progress, `이미지 생성 중... (${i + 1}/${totalHeadings})`, `"${heading.title}" 완료`);

                    // ✅ [2026-02-02] 실시간 미리보기 업데이트
                    liveImagePreview.updateItem(i, 'completed', imageUrl);
                    liveImagePreview.addLog(`✅ [${i + 1}/${totalHeadings}] ${String(heading.title || '').substring(0, 25)}... 완료`);
                  } else {
                    failCount++;
                    liveImagePreview.updateItem(i, 'failed');
                    liveImagePreview.addLog(`⚠️ [${i + 1}/${totalHeadings}] ${String(heading.title || '').substring(0, 25)}... 이미지 없음`);
                  }
                } else {
                  failCount++;
                  liveImagePreview.updateItem(i, 'failed');
                }
              }

              if (successCount > 0) {
                showImagesProgress(100, '이미지 생성 완료', `성공 ${successCount}개${failCount > 0 ? `, 실패 ${failCount}개` : ''}`);
                appendLog(`🎉 총 ${successCount}개 이미지 생성 완료!${failCount > 0 ? ` (${failCount}개 실패)` : ''}`, 'images-log-output');
                liveImagePreview.complete(successCount, failCount);

                // ✅ [2026-03-16 FIX] 배치 경로에서도 setHeadings 호출 (인덱스 기반 폴백 매칭 활성화)
                ImageManager.setHeadings(filteredHeadings);

                const generatedImages = imageResult.images.filter((img: any) => img && (img.previewDataUrl || img.filePath));

                // ✅ [2026-03-16 FIX] 배치 경로에서도 displayGeneratedImages 호출 (이미지 그리드 표시)
                try { displayGeneratedImages(generatedImages); } catch { /* ignore */ }

                updatePromptItemsWithImages(generatedImages);

                // ✅ [2026-02-27 NEW] 0번 이미지 → 썸네일 자동 동기화 (전용 썸네일 실패 시 폴백)
                try {
                  const thumbImage = ImageManager.getImage('🖼️ 썸네일');
                  if (!thumbImage || !(thumbImage as any).previewDataUrl) {
                    // 전용 썸네일이 없으면 0번 이미지를 썸네일로 자동 설정
                    const firstImg = generatedImages[0];
                    if (firstImg) {
                      const firstUrl = firstImg.previewDataUrl || firstImg.filePath;
                      if (firstUrl) {
                        ImageManager.setImage('🖼️ 썸네일', {
                          url: firstUrl,
                          filePath: firstUrl,
                          previewDataUrl: firstUrl,
                          prompt: firstImg.prompt || '',
                          heading: '🖼️ 썸네일',
                          isThumbnail: true,
                          provider: imageSource,
                          timestamp: Date.now(),
                        });
                        appendLog(`🖼️ 0번 이미지를 썸네일로 자동 설정했습니다.`, 'images-log-output');

                        // ThumbnailGenerator SVG 프리뷰에도 자동 적용
                        if (!thumbnailGenerator) {
                          thumbnailGenerator = new ThumbnailGenerator();
                        }
                        thumbnailGenerator.setMainText(blogTitle || '');
                        await thumbnailGenerator.setBackgroundFromUrl(firstUrl);
                        try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }
                      }
                    }
                  }
                } catch (thumbSyncErr) {
                  console.warn('[Thumbnail] 0번 이미지 썸네일 동기화 실패:', thumbSyncErr);
                }
              } else {
                throw new Error('모든 이미지 생성 실패');
              }
            } else {
              throw new Error(imageResult.message || '배치 이미지 생성 실패');
            }
          } catch (batchError) {
            appendLog(`❌ 배치 이미지 생성 실패: ${(batchError as Error).message}`, 'images-log-output');
            liveImagePreview.addLog(`❌ 실패: ${(batchError as Error).message}`);

          }

          generateImagesBtnMain.disabled = false;
          generateImagesBtnMain.innerHTML = '<span style="font-size: 1.25rem;">🎨</span><span>AI 이미지 생성</span>';
          appendLog('💾 이미지가 저장되었습니다. 반자동 발행 시 자동으로 삽입됩니다.', 'images-log-output');
          return; // 배치 처리 완료, 아래 순차 처리 스킵
        }

        // ✅ 비용/과금 위험 provider는 동시 요청을 막기 위해 순차 처리 (nano-banana-pro 제외)
        try {
          const providerForLock =
            imageSource === 'prodia'
              ? 'prodia'
              : imageSource === 'stability'
                ? 'stability'
                : imageSource === 'deepinfra' || imageSource === 'deepinfra-flux'
                  ? 'deepinfra'
                  : imageSource === 'falai'
                    ? 'falai'
                    : imageSource === 'leonardoai'
                      ? 'leonardoai'
                      : imageSource === 'openai-image'
                        ? 'openai-image'
                        : '';
          const sequential = providerForLock ? isCostRiskImageProvider(providerForLock) : false;
          if (sequential) {
            showImagesProgress(0, '이미지 생성 준비 중...', '소제목 분석 완료, 순차 생성 시작');
            appendLog(`⏳ ${getCostRiskProviderLabel(providerForLock)} 보호를 위해 순차 처리로 생성합니다.`, 'images-log-output');
            liveImagePreview.addLog(`⏳ ${getCostRiskProviderLabel(providerForLock)} 보호를 위해 순차 처리로 생성합니다.`);
          }
        } catch (e) {
          console.warn('[headingImageGen] catch ignored:', e);
        }

        const providerForLock =
          imageSource === 'pollinations' || imageSource === 'nano-banana-pro'
            ? 'nano-banana-pro'
            : imageSource === 'prodia'
              ? 'prodia'
              : imageSource === 'stability'
                ? 'stability'
                : imageSource === 'deepinfra' || imageSource === 'deepinfra-flux'
                  ? 'deepinfra'
                  : imageSource === 'falai'
                    ? 'falai'
                    : imageSource === 'leonardoai'
                      ? 'leonardoai'
                      : imageSource === 'openai-image'
                        ? 'openai-image'
                        : '';
        const shouldRunSequentially = providerForLock ? isCostRiskImageProvider(providerForLock) : false;

        const generateOne = async (heading: any, i: number): Promise<any | null> => {
          try {
            // ✅ [2026-02-24 UPDATED] 전용 썸네일은 이미 별도 생성됨 → 모든 소제목은 순수 이미지
            const isThumbnailSection = false; // 전용 썸네일 별도 생성됨
            const allowText = false;           // 소제목에는 텍스트 없음
            const headingForImage = heading.title;
            const promptForImage = heading.prompt;

            appendLog(`📸 [${i + 1}/${totalHeadings}] 이미지 생성 중: ${promptForImage.substring(0, 60)}... (텍스트 없음)`, 'images-log-output');

            // ✅ [2026-02-23] 종합 이미지 생성 정보 로그 (엔진 + 모델 + 스타일 + 다양성)
            {
              const _srcLabel = imageSourceNames[imageSource] || imageSource;
              const _style = localStorage.getItem('imageStyle') || 'realistic';
              const _styleNames: Record<string, string> = { 'realistic': '📸 리얼리스틱', 'vintage': '🎞️ 빈티지', 'stickman': '🖌️ 스틱맨', 'roundy': '🫧 라운디', '2d': '✏️ 2D 웹툰' };
              const _ratio = localStorage.getItem('imageRatio') || localStorage.getItem('subheadingImageRatio') || '1:1';
              let _modelLabel = '';
              if (imageSource === 'leonardoai') {
                const _m = (document.getElementById('leonardoai-model-select') as HTMLSelectElement)?.value || 'seedream-4.5';
                const _mNames: Record<string, string> = { 'seedream-4.5': 'Seedream 4.5', 'phoenix-1.0': 'Phoenix 1.0', 'signature': 'Signature', 'nano': 'Nano' };
                _modelLabel = ` | 📦 모델: ${_mNames[_m] || _m}`;
              } else if (imageSource === 'stability') {
                const _m = (document.getElementById('stability-model-select') as HTMLSelectElement)?.value || 'ultra';
                _modelLabel = ` | 📦 모델: ${_m}`;
              } else if (imageSource === 'openai-image') {
                _modelLabel = ' | 📦 모델: DALL-E 3';
              }
              appendLog(`  🖥️ 엔진: ${_srcLabel}${_modelLabel} | 🎨 스타일: ${_styleNames[_style] || _style} | 📐 ${_ratio}`, 'images-log-output');
              liveImagePreview.addLog(`🖥️ ${_srcLabel}${_modelLabel} | 🎨 ${_styleNames[_style] || _style} | 📐 ${_ratio}`);

              const _A = ['🐦 버드아이', '⬇️ 로우앵글', '🌄 와이드', '👤 미디엄', '🔍 클로즈업', '🔀 더치앵글', '¾ 쿼터뷰'];
              const _L = ['☀️ 골든아워', '🌙 블루투와일라잇', '🎭 키아로스쿠로', '☁️ 디퓨즈', '💜 네온', '💡 하이키', '✨ 백라이트', '🕯️ 캔들릿', '🔆 한낮', '🌫️ 포그', '🪟 윈도우라이트'];
              const _F = ['📷 보케', '🔭 딥포커스', '🎯 셀렉티브', '🏠 틸트시프트', '🎬 랙포커스'];
              const _C = ['🌈 비비드', '🍂 어스톤', '⚫ 모노+포인트', '🧁 파스텔', '⬛ B&W스플래시', '🟠 앰버', '💎 제이드'];
              const _R = ['📐 삼분법', '⊞ 센터대칭', '↗ 리딩라인', '🖼️ 프레임인프레임', '⬜ 네거티브스페이스'];
              appendLog(`  🎲 다양성[${i}]: ${_A[i % 7]} | ${_L[i % 11]} | ${_F[i % 5]} | ${_C[i % 7]} | ${_R[i % 5]}`, 'images-log-output');
            }

            let imageUrl: string;

            if (imageSource === 'pollinations' || imageSource === 'nano-banana-pro') {
              // ✅ 선택된 소스(Pollinations 또는 Nano Banana Pro) 사용
              const ref = resolveReferenceImageForHeading(String(heading.title || '').trim());
              const imageResult = await generateImagesWithCostSafety({
                provider: imageSource, // ✅ 고정된 'nano-banana-pro' 대신 imageSource 사용
                items: [{
                  heading: headingForImage, // ✅ [2026-02-24] 썸네일=H1제목
                  prompt: promptForImage,
                  englishPrompt: promptForImage,  // ✅ [2026-02-27 FIX] sanitizeImagePrompt 바이패스
                  isThumbnail: isThumbnailSection,
                  allowText: allowText,
                  ...ref,
                }],
                postTitle: blogTitle,
                isFullAuto: true // ✅ 풀오토 모드로 처리
              });
              if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
                imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
              } else {
                throw new Error(imageResult.message || '나노 바나나 프로 이미지 생성 실패');
              }
            } else if (imageSource === 'prodia') {
              const ref = resolveReferenceImageForHeading(String(heading.title || '').trim());
              const imageResult = await generateImagesWithCostSafety({
                provider: 'prodia',
                items: [{
                  heading: headingForImage, // ✅ [2026-02-24] 썸네일=H1제목
                  prompt: promptForImage,
                  englishPrompt: promptForImage,  // ✅ [2026-02-27 FIX] sanitizeImagePrompt 바이패스
                  isThumbnail: isThumbnailSection,
                  allowText: allowText,
                  ...ref,
                }],
                postTitle: blogTitle,
                isFullAuto: true,
              });
              if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
                imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
              } else {
                throw new Error(imageResult.message || 'Prodia 이미지 생성 실패');
              }
            } else if (imageSource === 'stability') {
              // ✅ Stability: 전용 파라미터(모델 등)와 함께 호출
              const stabilityModel = (document.getElementById('stability-model-select') as HTMLSelectElement)?.value || 'ultra';
              const ref = resolveReferenceImageForHeading(String(heading.title || '').trim());
              const imageResult = await generateImagesWithCostSafety({
                provider: 'stability',
                items: [{
                  heading: headingForImage, // ✅ [2026-02-24] 썸네일=H1제목
                  prompt: promptForImage,
                  englishPrompt: promptForImage,  // ✅ [2026-02-27 FIX] sanitizeImagePrompt 바이패스
                  isThumbnail: isThumbnailSection,
                  allowText: allowText,
                  ...ref,
                }],
                postTitle: blogTitle,
                isFullAuto: true,
                model: stabilityModel
              });
              if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
                imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
              } else {
                throw new Error(imageResult.message || 'Stability AI 이미지 생성 실패');
              }
            } else if (imageSource === 'falai') {
              // ✅ Fal.ai: 전용 파라미터와 함께 호출
              const ref = resolveReferenceImageForHeading(String(heading.title || '').trim());
              const imageResult = await generateImagesWithCostSafety({
                provider: 'falai',
                items: [{
                  heading: headingForImage, // ✅ [2026-02-24] 썸네일=H1제목
                  prompt: promptForImage,
                  englishPrompt: promptForImage,  // ✅ [2026-02-27 FIX] sanitizeImagePrompt 바이패스
                  isThumbnail: isThumbnailSection,
                  allowText: allowText,
                  ...ref,
                }],
                postTitle: blogTitle,
                isFullAuto: true,
              });
              if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
                imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
              } else {
                throw new Error(imageResult.message || 'Fal.ai 이미지 생성 실패');
              }
            } else if (imageSource === 'deepinfra' || imageSource === 'deepinfra-flux') {
              // ✅ [2026-02-02] DeepInfra FLUX-2: 가성비 좋은 이미지 생성
              const ref = resolveReferenceImageForHeading(String(heading.title || '').trim());
              const imageResult = await generateImagesWithCostSafety({
                provider: 'deepinfra',
                items: [{
                  heading: headingForImage, // ✅ [2026-02-24] 썸네일=H1제목
                  prompt: promptForImage,
                  englishPrompt: promptForImage,  // ✅ [2026-02-27 FIX] sanitizeImagePrompt 바이패스
                  isThumbnail: isThumbnailSection,
                  allowText: allowText,
                  ...ref,
                }],
                postTitle: blogTitle,
                isFullAuto: true,
              });
              if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
                imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
              } else {
                throw new Error(imageResult.message || 'DeepInfra 이미지 생성 실패');
              }
            } else if (imageSource === 'leonardoai') {
              // ✅ [2026-02-23] Leonardo AI: 전용 핸들러 (기존 else 폴백 방지)
              const ref = resolveReferenceImageForHeading(String(heading.title || '').trim());
              const imageResult = await generateImagesWithCostSafety({
                provider: 'leonardoai',
                items: [{
                  heading: headingForImage, // ✅ [2026-02-24] 썸네일=H1제목
                  prompt: promptForImage,
                  englishPrompt: promptForImage,  // ✅ [2026-02-27 FIX] sanitizeImagePrompt 바이패스
                  isThumbnail: isThumbnailSection,
                  allowText: allowText,
                  ...ref,
                }],
                postTitle: blogTitle,
                isFullAuto: true,
              });
              if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
                imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
              } else {
                throw new Error(imageResult.message || 'Leonardo AI 이미지 생성 실패');
              }
            } else if (imageSource === 'openai-image') {
              // ✅ [2026-02-23] DALL-E (OpenAI): 전용 핸들러 (기존 else 폴백 방지)
              const ref = resolveReferenceImageForHeading(String(heading.title || '').trim());
              const imageResult = await generateImagesWithCostSafety({
                provider: 'openai-image',
                items: [{
                  heading: headingForImage, // ✅ [2026-02-24] 썸네일=H1제목
                  prompt: promptForImage,
                  englishPrompt: promptForImage,  // ✅ [2026-02-27 FIX] sanitizeImagePrompt 바이패스
                  isThumbnail: isThumbnailSection,
                  allowText: allowText,
                  ...ref,
                }],
                postTitle: blogTitle,
                isFullAuto: true,
              });
              if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
                imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
              } else {
                throw new Error(imageResult.message || 'DALL-E 이미지 생성 실패');
              }
            } else if (imageSource === 'imagefx') {
              // ✅ [2026-03-16] ImageFX 전용 분기 (Google 무료, Gemini API 키 불필요)
              console.log(`[ImageGen] ✨ ImageFX (Google 무료) 이미지 생성 시작`);
              const ref = resolveReferenceImageForHeading(String(heading.title || '').trim());
              const imageResult = await generateImagesWithCostSafety({
                provider: 'imagefx',
                items: [{
                  heading: headingForImage,
                  prompt: promptForImage,
                  englishPrompt: promptForImage,
                  isThumbnail: isThumbnailSection,
                  allowText: allowText,
                  ...ref,
                }],
                postTitle: blogTitle,
                isFullAuto: true,
              });
              if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
                imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
              } else {
                throw new Error(imageResult.message || 'ImageFX 이미지 생성 실패. Google 로그인 상태를 확인해주세요.');
              }
            } else if (imageSource === 'naver-search' || imageSource === 'naver') {
              // ✅ 네이버 이미지 검색: 사용자가 명시적으로 선택한 경우에만 사용
              imageUrl = await searchNaverImage(promptForImage);
            } else {
              // ✅ [2026-03-17 FIX] 기본값: 알 수 없는 이미지 소스는 nano-banana-pro(Gemini) 사용
              console.warn(`[ImageGen] 알 수 없는 이미지 소스 "${imageSource}", 나노 바나나 프로(Gemini)로 대체`);
              appendLog(`  ⚠️ 알 수 없는 엔진 "${imageSource}" → 나노 바나나 프로(Gemini)로 대체`, 'images-log-output');
              const ref = resolveReferenceImageForHeading(String(heading.title || '').trim());
              const imageResult = await generateImagesWithCostSafety({
                provider: 'nano-banana-pro',
                items: [{
                  heading: headingForImage,
                  prompt: promptForImage,
                  englishPrompt: promptForImage,
                  isThumbnail: isThumbnailSection,
                  allowText: allowText,
                  ...ref,
                }],
                postTitle: blogTitle,
                isFullAuto: true,
              });
              if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
                imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
              } else {
                throw new Error(imageResult.message || '기본 AI 이미지 생성 실패');
              }
            }

            // 진행률 업데이트 (완료된 개수 기준)
            completedCount++;
            const headingProgressMax = 100;
            const currentProgress = Math.floor((completedCount / totalHeadings) * headingProgressMax);
            showImagesProgress(currentProgress, `이미지 생성 중... (${completedCount}/${totalHeadings})`, `"${heading.title}" 이미지 생성 완료`);
            appendLog(`✅ [${completedCount}/${totalHeadings}] 이미지 생성 완료`, 'images-log-output');

            // ✅ [2026-02-02] 실시간 미리보기 업데이트
            liveImagePreview.updateItem(i, 'completed', imageUrl);
            liveImagePreview.addLog(`✅ [${completedCount}/${totalHeadings}] ${String(heading.title || '').trim()} 완료`);

            return {
              url: imageUrl,
              prompt: promptForImage,
              heading: headingForImage,
              index: i
            };
          } catch (error) {
            completedCount++;
            const currentProgress = Math.floor((completedCount / totalHeadings) * 100);
            appendLog(`❌ [${completedCount}/${totalHeadings}] 이미지 생성 실패: ${(error as Error).message}`, 'images-log-output');
            showImagesProgress(currentProgress, `이미지 생성 중... (${completedCount}/${totalHeadings})`, `"${heading.title}" 이미지 생성 실패`);
            // ✅ [2026-02-02] 실시간 미리보기 업데이트
            liveImagePreview.updateItem(i, 'failed');
            liveImagePreview.addLog(`❌ [${completedCount}/${totalHeadings}] ${String(heading.title || '').trim()} 실패: ${(error as Error).message}`);
            return null;
          }
        };

        const results: Array<any | null> = [];
        if (shouldRunSequentially) {
          for (let i = 0; i < filteredHeadings.length; i++) {
            results.push(await generateOne(filteredHeadings[i], i));
          }
        } else {
          const imagePromises = filteredHeadings.map(async (heading: any, i: number) => generateOne(heading, i));
          results.push(...(await Promise.all(imagePromises)));
        }

        // ✅ IMPORTANT: 결과 null(실패) 때문에 인덱스가 당겨지면 소제목 매칭이 깨짐.
        // 따라서 headings 기준으로 인덱스를 고정한 채, 성공한 항목만 이미지로 채운다.
        const normalizedImages = filteredHeadings
          .map((heading: any, idx: number) => {
            const img = results[idx];
            if (!img) return null;
            const headingTitle = String(img?.heading || heading?.title || `소제목 ${idx + 1}`).trim();
            const rawUrl = String(img?.url || '').trim();
            if (!rawUrl) return null;
            return {
              heading: headingTitle,
              filePath: rawUrl,
              url: rawUrl,
              previewDataUrl: rawUrl,
              prompt: String(img?.prompt || heading?.prompt || '').trim(),
              headingIndex: idx,
              isThumbnail: false, // ✅ 전용 썸네일 별도 생성됨 → 소제목은 항상 false
            };
          })
          .filter((v: any) => v !== null);

        const generatedImages = normalizedImages;

        // ✅ 소제목 정보도 동기화 (썸네일/발행에서 인덱스 매칭 안정화)
        ImageManager.setHeadings(filteredHeadings);

        // ✅ 썸네일 지정/발행에서 확실히 찾도록 ImageManager에도 등록 (소제목 이미지만)
        normalizedImages.forEach((img: any) => {
          if (img?.heading) {
            ImageManager.setImage(img.heading, {
              ...img,
              timestamp: Date.now(),
            });
            // ✅ [2026-02-28 FIX] 순차 처리에서도 썸네일 항목이면 '🖼️ 썸네일' 키로 등록
            const hTitle = String(img.heading || '').trim();
            if (hTitle.includes('🖼️ 썸네일') || hTitle.includes('📌 썸네일')) {
              ImageManager.setImage('🖼️ 썸네일', {
                ...img,
                heading: '🖼️ 썸네일',
                isThumbnail: true,
                provider: imageSource,
                timestamp: Date.now(),
              });
              appendLog(`🖼️ 순차 썸네일 → '🖼️ 썸네일' 키로 자동 등록`, 'images-log-output');
              // ThumbnailGenerator SVG 프리뷰에도 자동 적용
              try {
                if (!thumbnailGenerator) { thumbnailGenerator = new ThumbnailGenerator(); }
                thumbnailGenerator.setMainText(blogTitle || hTitle);
                thumbnailGenerator.setBackgroundFromUrl(img.url || img.filePath);
              } catch { /* ignore */ }
            }
          }
        });
        // ✅ [2026-02-12 P1 FIX #5] 직접 할당 → syncGlobalImagesFromImageManager
        try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }

        // ✅ 영어 프롬프트 이미지 미리보기 업데이트
        updatePromptItemsWithImages(normalizedImages);

        const successCount = generatedImages.length;
        const failCount = totalHeadings - successCount;
        const totalCount = (normalizedImages || []).length;
        showImagesProgress(100, '이미지 생성 완료', totalCount > 0 ? `소제목 이미지 ${totalCount}개 준비 완료` : '이미지 생성 완료');

        // ✅ [2026-02-02] 실시간 미리보기 완료
        liveImagePreview.complete(successCount, failCount);

        appendLog(`🎉 총 ${generatedImages.length}개의 소제목 이미지가 생성되었습니다!`, 'images-log-output');

        appendLog(`💾 이미지가 저장되었습니다. 반자동 발행 시 자동으로 삽입됩니다.`, 'images-log-output');

      } catch (error) {
        appendLog(`❌ 이미지 생성 실패: ${(error as Error).message}`, 'images-log-output');
        alert(`❌ 이미지 생성 실패: ${(error as Error).message}`);
        liveImagePreview.addLog(`❌ 이미지 생성 실패: ${(error as Error).message}`);

      } finally {
        if (generateImagesBtnMain) {
          generateImagesBtnMain.disabled = false;
          generateImagesBtnMain.innerHTML = '<span style="font-size: 1.25rem;">🎨</span><span>프롬프트대로 이미지 생성하기</span>';
        }
      }
    });
  }
  // ✅ 비어있는 소제목만 이미지 생성 버튼
  const generateRemainingImagesBtn = document.getElementById('generate-remaining-images-btn') as HTMLButtonElement;
  if (generateRemainingImagesBtn) {
    generateRemainingImagesBtn.addEventListener('click', async () => {
      const headings = getCurrentImageHeadings();
      if (headings.length === 0) {
        alert('먼저 소제목을 분석해주세요.');
        return;
      }

      // ✅ 버그 수정: ImageManager 기반으로 비어있는 소제목 감지 (DOM 대신)
      const emptyHeadings = headings.filter((h: any) => {
        const headingTitle = String(h?.title || h?.heading || '').trim();
        if (!headingTitle) return false;

        try {
          const resolvedKey = ImageManager.resolveHeadingKey(headingTitle);
          const primary = ImageManager.getImage(resolvedKey);
          const key = String(getStableImageKey(primary) || '').trim();
          if (!primary || !key) return true;

          const list = ImageManager.getImages(resolvedKey) || [];
          if (!Array.isArray(list) || list.length === 0) return true;

          return false;
        } catch {
          return true;
        }
      });

      if (emptyHeadings.length === 0) {
        alert('✅ 모든 소제목에 이미지가 배치되어 있습니다!');
        return;
      }

      const selectedSource = document.querySelector('.image-source-btn.selected') as HTMLButtonElement;
      // ✅ [2026-02-02 FIX] 드롭다운 값 우선 사용
      const dropdownSource = (document.getElementById('image-source-select') as HTMLSelectElement)?.value;
      const imageSource = dropdownSource || selectedSource?.dataset.source || 'nano-banana-pro';
      console.log(`[ImageGeneration] 남은 이미지 소스: ${imageSource}`);

      try {
        generateRemainingImagesBtn.disabled = true;
        generateRemainingImagesBtn.innerHTML = '<span>🔄</span><span>생성 중...</span>';

        aiProgressModal.show('비어있는 소제목 이미지 생성 중...', {
          autoAnimate: false,
          icon: '✨',
          initialLog: '⏳ 비어있는 소제목에 이미지 생성을 시작합니다...',
        });
        showImagesProgress(0, '비어있는 소제목 이미지 생성 시작...', `${emptyHeadings.length}개 소제목 대상`);

        appendLog(`🎨 비어있는 ${emptyHeadings.length}개 소제목에 이미지 생성 시작...`, 'images-log-output');
        aiProgressModal.addLog(`🎨 비어있는 ${emptyHeadings.length}개 소제목에 이미지 생성 시작...`);

        for (let i = 0; i < emptyHeadings.length; i++) {
          const heading = emptyHeadings[i];
          const originalIndex = headings.findIndex((h: any) => h.title === heading.title);

          appendLog(`📸 [${i + 1}/${emptyHeadings.length}] "${heading.title}" 이미지 생성 중...`, 'images-log-output');
          // ✅ [2026-02-23] 종합 이미지 생성 정보 로그 (엔진 + 모델 + 스타일 + 다양성)
          {
            const _srcLabel = imageSourceNames[imageSource] || imageSource;
            const _style = localStorage.getItem('imageStyle') || 'realistic';
            const _styleNames: Record<string, string> = { 'realistic': '📸 리얼리스틱', 'vintage': '🎞️ 빈티지', 'stickman': '🖌️ 스틱맨', 'roundy': '🫧 라운디', '2d': '✏️ 2D 웹툰' };
            const _ratio = localStorage.getItem('imageRatio') || localStorage.getItem('subheadingImageRatio') || '1:1';
            let _modelLabel = '';
            if (imageSource === 'leonardoai') {
              const _m = (document.getElementById('leonardoai-model-select') as HTMLSelectElement)?.value || 'seedream-4.5';
              const _mNames: Record<string, string> = { 'seedream-4.5': 'Seedream 4.5', 'phoenix-1.0': 'Phoenix 1.0', 'signature': 'Signature', 'nano': 'Nano' };
              _modelLabel = ` | 📦 모델: ${_mNames[_m] || _m}`;
            } else if (imageSource === 'stability') {
              const _m = (document.getElementById('stability-model-select') as HTMLSelectElement)?.value || 'ultra';
              _modelLabel = ` | 📦 모델: ${_m}`;
            } else if (imageSource === 'openai-image') {
              _modelLabel = ' | 📦 모델: DALL-E 3';
            }
            appendLog(`  🖥️ 엔진: ${_srcLabel}${_modelLabel} | 🎨 스타일: ${_styleNames[_style] || _style} | 📐 ${_ratio}`, 'images-log-output');

            const _A = ['🐦 버드아이', '⬇️ 로우앵글', '🌄 와이드', '👤 미디엄', '🔍 클로즈업', '🔀 더치앵글', '¾ 쿼터뷰'];
            const _L = ['☀️ 골든아워', '🌙 블루투와일라잇', '🎭 키아로스쿠로', '☁️ 디퓨즈', '💜 네온', '💡 하이키', '✨ 백라이트', '🕯️ 캔들릿', '🔆 한낮', '🌫️ 포그', '🪟 윈도우라이트'];
            const _F = ['📷 보케', '🔭 딥포커스', '🎯 셀렉티브', '🏠 틸트시프트', '🎬 랙포커스'];
            const _C = ['🌈 비비드', '🍂 어스톤', '⚫ 모노+포인트', '🧁 파스텔', '⬛ B&W스플래시', '🟠 앰버', '💎 제이드'];
            const _R = ['📐 삼분법', '⊞ 센터대칭', '↗ 리딩라인', '🖼️ 프레임인프레임', '⬜ 네거티브스페이스'];
            appendLog(`  🎲 다양성[${i}]: ${_A[i % 7]} | ${_L[i % 11]} | ${_F[i % 5]} | ${_C[i % 7]} | ${_R[i % 5]}`, 'images-log-output');
          }
          const p = Math.floor((i / Math.max(1, emptyHeadings.length)) * 100);
          showImagesProgress(p, `이미지 생성 중... (${i + 1}/${emptyHeadings.length})`, String(heading.title || ''));
          aiProgressModal.update(p, `이미지 생성 중... (${i + 1}/${emptyHeadings.length})`);
          aiProgressModal.addLog(`📸 [${i + 1}/${emptyHeadings.length}] ${String(heading.title || '').trim()} 생성 중...`);

          await regenerateSingleImageForHeading(originalIndex, heading.title, heading.prompt);
        }

        // ✅ 영어 프롬프트 이미지 미리보기 업데이트
        const allImages = (window as any).imageManagementGeneratedImages || [];
        updatePromptItemsWithImages(allImages);

        appendLog(`✅ ${emptyHeadings.length}개 이미지 생성 완료!`, 'images-log-output');

        showImagesProgress(100, '✅ 이미지 생성 완료!', `${emptyHeadings.length}개 완료`);
        aiProgressModal.complete(true, {
          successTitle: '이미지 생성 완료!',
          successIcon: '✅',
          successLog: `✅ ${emptyHeadings.length}개 이미지 생성 완료!`,
        });

      } catch (error) {
        appendLog(`❌ 이미지 생성 실패: ${(error as Error).message}`, 'images-log-output');
        aiProgressModal.complete(false, {
          failureTitle: '이미지 생성 실패',
          failureIcon: '❌',
          failureLog: `❌ 이미지 생성 실패: ${(error as Error).message}`,
        });
      } finally {
        generateRemainingImagesBtn.disabled = false;
        generateRemainingImagesBtn.innerHTML = '<span style="font-size: 1.25rem;">✨</span><span>비어있는 소제목만 이미지 생성</span>';
      }
    });
  }

  // ✅ 비어있는 소제목만 이미지 수집 버튼
  const collectRemainingImagesBtn = document.getElementById('collect-remaining-images-btn') as HTMLButtonElement;
  if (collectRemainingImagesBtn) {
    collectRemainingImagesBtn.addEventListener('click', async () => {
      const headings = getCurrentImageHeadings();
      if (headings.length === 0) {
        if ((window as any).toastManager) (window as any).toastManager.warning('먼저 소제목을 분석해주세요.');
        return;
      }

      // ✅ 버그 수정: ImageManager 기반으로 비어있는 소제목 감지 (DOM 대신)
      const emptyHeadings = headings.filter((h: any) => {
        const headingTitle = String(h?.title || h?.heading || '').trim();
        if (!headingTitle) return false;

        try {
          const resolvedKey = ImageManager.resolveHeadingKey(headingTitle);
          const primary = ImageManager.getImage(resolvedKey);
          const key = String(getStableImageKey(primary) || '').trim();
          if (!primary || !key) return true;

          const list = ImageManager.getImages(resolvedKey) || [];
          if (!Array.isArray(list) || list.length === 0) return true;

          return false;
        } catch {
          return true;
        }
      });

      if (emptyHeadings.length === 0) {
        if ((window as any).toastManager) (window as any).toastManager.success('✅ 모든 소제목에 이미지가 배치되어 있습니다!');
        return;
      }

      // 검색어 가져오기
      let searchKeyword = (document.getElementById('image-title') as HTMLInputElement)?.value?.trim() || '';
      if (!searchKeyword) {
        searchKeyword = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value?.trim() ||
          (document.getElementById('unified-title') as HTMLInputElement)?.value?.trim() || '';
      }

      if (!searchKeyword) {
        if ((window as any).toastManager) (window as any).toastManager.warning('⚠️ 이미지 수집을 위한 제목/키워드를 입력해주세요.');
        return;
      }

      try {
        collectRemainingImagesBtn.disabled = true;
        collectRemainingImagesBtn.innerHTML = '<span>🔄</span><span>수집 중...</span>';

        aiProgressModal.show('비어있는 소제목 이미지 수집 중...', {
          autoAnimate: false,
          icon: '🔍',
          initialLog: '⏳ 네이버 이미지 수집을 시작합니다...',
        });
        showImagesProgress(0, '이미지 수집 시작...', `${emptyHeadings.length}개 소제목 대상`);

        appendLog(`🔍 비어있는 ${emptyHeadings.length}개 소제목에 이미지 수집 시작...`, 'images-log-output');
        aiProgressModal.addLog(`🔍 비어있는 ${emptyHeadings.length}개 소제목에 이미지 수집 시작...`);

        // 네이버 이미지 검색
        showImagesProgress(10, '네이버 이미지 검색 중...', searchKeyword.substring(0, 40));
        aiProgressModal.update(10, '네이버 이미지 검색 중...');
        const result = await window.api.searchNaverImages(searchKeyword);

        if (result.success && result.images && result.images.length > 0) {
          // 비어있는 소제목에 이미지 배치
          const imagesToUse = result.images.slice(0, emptyHeadings.length);

          for (let i = 0; i < Math.min(imagesToUse.length, emptyHeadings.length); i++) {
            const heading = emptyHeadings[i];
            const image = imagesToUse[i];
            const originalIndex = headings.findIndex((h: any) => h.title === heading.title);

            const p = Math.floor(((i + 1) / Math.max(1, Math.min(imagesToUse.length, emptyHeadings.length))) * 90);
            showImagesProgress(p, `이미지 배치 중... (${i + 1}/${Math.min(imagesToUse.length, emptyHeadings.length)})`, String(heading.title || ''));
            aiProgressModal.update(p, `이미지 배치 중... (${i + 1}/${Math.min(imagesToUse.length, emptyHeadings.length)})`);
            aiProgressModal.addLog(`✅ [${i + 1}/${Math.min(imagesToUse.length, emptyHeadings.length)}] ${String(heading.title || '').trim()} 배치`);

            // ✅ 안전한 HTML 이스케이프
            const safeTitle = escapeHtml(heading.title || '');
            const safePrompt = escapeHtml(heading.prompt || '');
            const imageUrl = image.thumbnail || image.url || '';

            // 이미지 미리보기 업데이트
            const promptItem = document.querySelector(`.prompt-item[data-index="${originalIndex + 1}"]`);
            if (promptItem) {
              const imageContainer = promptItem.querySelector('.generated-image');
              if (imageContainer) {
                imageContainer.innerHTML = `
                  <img src="${imageUrl}" 
                       style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;"
                       onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 fill=%22%23999%22%3E로드 실패%3C/text%3E%3C/svg%3E'">
                  <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 0.5rem; background: linear-gradient(transparent, rgba(0,0,0,0.8)); display: flex; gap: 0.5rem; justify-content: center;">
                    <button type="button" class="select-local-image-btn" data-heading-index="${originalIndex}" style="padding: 0.25rem 0.5rem; background: #8b5cf6; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">📁</button>
                    <button type="button" class="regenerate-single-image-btn" data-heading-index="${originalIndex}" style="padding: 0.25rem 0.5rem; background: #3b82f6; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">🔄</button>
                    <button type="button" class="remove-heading-image-btn" data-heading-index="${originalIndex}" style="padding: 0.25rem 0.5rem; background: #ef4444; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">🗑️</button>
                  </div>
                `;
                (imageContainer as HTMLElement).style.position = 'relative';

                ensurePromptCardRemoveButtons();
                ensurePromptCardRemoveHandler();
              }
            }

            // ImageManager에 등록
            ImageManager.setImage(heading.title, {
              heading: heading.title,
              filePath: image.url || image.thumbnail,
              previewDataUrl: image.thumbnail || image.url,
              provider: 'naver',
              url: image.url
            });
          }

          // ✅ [2026-02-12 FIX] 수집 후 ImageManager→전역변수 동기화 (누락 수정)
          syncGlobalImagesFromImageManager();
          try { ImageManager.syncAllPreviews(); } catch { /* ignore */ }

          // ✅ 영어 프롬프트 이미지 미리보기 업데이트
          const allImages = (window as any).imageManagementGeneratedImages || [];
          updatePromptItemsWithImages(allImages);

          appendLog(`✅ ${Math.min(imagesToUse.length, emptyHeadings.length)}개 이미지 수집 완료!`, 'images-log-output');

          showImagesProgress(100, '✅ 이미지 수집 완료!', `${Math.min(imagesToUse.length, emptyHeadings.length)}개 배치 완료`);
          aiProgressModal.complete(true, {
            successTitle: '이미지 수집 완료!',
            successIcon: '✅',
            successLog: `✅ ${Math.min(imagesToUse.length, emptyHeadings.length)}개 이미지 수집 완료!`,
          });
        } else {
          throw new Error(result.message || '이미지를 찾을 수 없습니다.');
        }

      } catch (error) {
        appendLog(`❌ 이미지 수집 실패: ${(error as Error).message}`, 'images-log-output');
        aiProgressModal.complete(false, {
          failureTitle: '이미지 수집 실패',
          failureIcon: '❌',
          failureLog: `❌ 이미지 수집 실패: ${(error as Error).message}`,
        });
      } finally {
        collectRemainingImagesBtn.disabled = false;
        collectRemainingImagesBtn.innerHTML = '<span style="font-size: 1.25rem;">🔍</span><span>비어있는 소제목만 이미지 수집</span>';
      }
    });
  }

  // ✅ 쇼핑몰 이미지 수집 버튼 이벤트
  const shoppingCollectBtn = document.getElementById('shopping-collect-save-btn') as HTMLButtonElement;
  const shoppingUrlInput = document.getElementById('shopping-url-input') as HTMLInputElement;
  const shoppingCollectResult = document.getElementById('shopping-collect-result') as HTMLDivElement;
  const shoppingCollectContent = document.getElementById('shopping-collect-content') as HTMLDivElement;

  if (shoppingCollectBtn && shoppingUrlInput) {
    shoppingCollectBtn.addEventListener('click', async () => {
      const shoppingUrl = shoppingUrlInput.value.trim();

      if (!shoppingUrl) {
        alert('쇼핑몰 URL을 입력해주세요.');
        return;
      }

      try {
        shoppingCollectBtn.disabled = true;
        shoppingCollectBtn.innerHTML = '<span>🔄</span><span>수집 중...</span>';

        appendLog(`🛒 쇼핑몰 이미지 수집 시작: ${shoppingUrl}`, 'images-log-output');

        // IPC를 통해 쇼핑몰 이미지 수집 요청
        const result = await window.api.collectImagesFromShopping(shoppingUrl);

        if (result.success && result.images && result.images.length > 0) {
          // ✅ 전체 수집된 이미지 개수 알림
          const totalCollected = result.images.length;
          appendLog(`🎉 쇼핑몰에서 총 ${totalCollected}개의 이미지를 수집했습니다!`, 'images-log-output');
          toastManager.info(`🛒 총 ${totalCollected}개 쇼핑몰 이미지 수집 완료!`);

          // ✅ 소제목 정보 가져오기
          const currentHeadings = getCurrentImageHeadings();

          // ✅ 소제목 개수 확인 - 소제목이 있으면 소제목 개수만큼, 없으면 5개 기본
          const targetCount = currentHeadings.length > 0 ? currentHeadings.length : 5;
          appendLog(`📊 소제목 ${currentHeadings.length}개 감지 → ${targetCount}개 이미지 소제목에 배치`, 'images-log-output');

          // ✅ 수집된 이미지를 소제목에 맞게 배치 (소제목 개수만큼만!)
          const collectedImages = result.images.slice(0, targetCount).map((img: any, idx: number) => ({
            heading: currentHeadings[idx]?.title || `소제목 ${idx + 1}`,
            filePath: img.url || img.filePath,
            url: img.url || img.filePath,
            previewDataUrl: img.url || img.filePath,
            prompt: img.alt || '쇼핑몰 제품 이미지',
            provider: 'shopping',
            headingIndex: idx
          }));

          appendLog(`🖼️ 쇼핑몰 이미지 ${collectedImages.length}개가 소제목에 매칭됨`, 'images-log-output');

          // ✅ 나머지 이미지 (소제목에 배치되지 않은 이미지)
          const remainingImages = result.images.slice(targetCount);
          const remainingCount = remainingImages.length;

          if (remainingCount > 0) {
            appendLog(`📦 나머지 ${remainingCount}개 이미지를 추가 보관합니다...`, 'images-log-output');
          }

          // ✅ 전체 이미지 (배치된 이미지 + 나머지 이미지) 로컬에 저장
          // ✅ result.images는 문자열 배열 또는 객체 배열일 수 있음
          const allImagesToSave = result.images.map((img: any, idx: number) => ({
            url: typeof img === 'string' ? img : (img.url || img.filePath || img.link || img.thumbnail || ''),
            heading: idx < targetCount
              ? (currentHeadings[idx]?.title || `소제목 ${idx + 1}`)
              : `예비 이미지 ${idx - targetCount + 1}`
          }));

          appendLog(`💾 전체 ${allImagesToSave.length}개 이미지를 로컬 폴더에 저장 중...`, 'images-log-output');

          // ✅ [2026-01-21] 폴더명을 글 제목 또는 제품명으로 생성 (특수문자 제거)
          const blogTitle = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value?.trim() ||
            (document.getElementById('unified-title') as HTMLInputElement)?.value?.trim() ||
            (result as any).productName || (result as any).name || '';
          const sanitizedFolderName = blogTitle
            .replace(/[<>:"/\\|?*]/g, '')  // 경로 불가 문자 제거
            .replace(/\s+/g, ' ')           // 연속 공백 제거
            .trim()
            .substring(0, 50).replace(/[.\s]+$/g, '') || '쇼핑몰_' + new Date().getTime();  // ✅ 50자 제한 + trailing dot/space 제거

          const saveResult = await window.api.downloadAndSaveMultipleImages(
            allImagesToSave,
            sanitizedFolderName
          );

          // 저장된 경로로 이미지 업데이트
          if (saveResult.success && saveResult.savedImages) {
            collectedImages.forEach((img, idx) => {
              const savedImg = saveResult.savedImages[idx];
              if (savedImg?.filePath) {
                // ✅ 로컬 경로로 모든 URL 필드 업데이트 (외부 URL은 로드 실패함)
                const localPath = savedImg.filePath;
                img.filePath = localPath;
                img.url = localPath;
                img.previewDataUrl = localPath;
                (img as any).savedToLocal = savedImg.savedToLocal ?? true;
              }
            });

            const savedCount = saveResult.savedImages.filter((i: any) => i && i.filePath).length;
            appendLog(`💾 ${savedCount}개 이미지 로컬 저장 완료!`, 'images-log-output');

            if (saveResult.folderPath) {
              appendLog(`📁 저장 위치: ${saveResult.folderPath}`, 'images-log-output');
            }

            // ✅ 나머지 이미지 정보 표시
            if (remainingCount > 0) {
              appendLog(`✨ 소제목에 ${collectedImages.length}개 배치 + 예비 ${remainingCount}개 저장됨`, 'images-log-output');
              appendLog(`💡 팁: 예비 이미지를 사용하려면 소제목 옆 📁 버튼을 눌러 변경하세요!`, 'images-log-output');
            }
          }

          // ✅ 전역 변수에 설정 (기존 이미지 대체)
          generatedImages = collectedImages;
          (window as any).imageManagementGeneratedImages = collectedImages;

          // ✅✅ [신규] currentStructuredContent.images에도 저장 (쇼핑커넥트 참조 이미지용)
          if (currentStructuredContent) {
            (currentStructuredContent as any).images = collectedImages;
            (window as any).currentStructuredContent = currentStructuredContent;
            console.log(`[Renderer] ✅ currentStructuredContent.images에 ${collectedImages.length}개 수집 이미지 저장됨`);
          }

          // ✅ ImageManager에 이미지 등록 (발행 시 매칭을 위해 필수!)
          collectedImages.forEach((img: any) => {
            if (img.heading) {
              ImageManager.setImage(img.heading, {
                ...img,
                timestamp: Date.now()
              });
              console.log(`[ImageManager] 쇼핑몰 이미지 등록: "${img.heading}" → ${img.filePath?.substring(0, 50)}...`);
            }
          });
          appendLog(`🔗 ImageManager에 ${collectedImages.length}개 이미지 등록 완료 (발행 시 소제목과 자동 매칭)`, 'images-log-output');

          // ✅ 그리드에 이미지 표시
          displayGeneratedImages(collectedImages);

          // ✅ 소제목 미리보기에도 이미지 배치
          updatePromptItemsWithImages(collectedImages);

          // ✅ 예비 이미지 빠른 교체 썸네일 업데이트
          updateReserveImagesThumbnails();

          // 결과 표시
          if (shoppingCollectResult && shoppingCollectContent) {
            shoppingCollectResult.style.display = 'block';
            shoppingCollectContent.innerHTML = `✅ ${collectedImages.length}개의 이미지가 로컬에 저장되고 소제목에 배치되었습니다!`;
          }

          appendLog(`✅ ${collectedImages.length}개의 쇼핑몰 이미지 수집 및 저장 완료!`, 'images-log-output');
          toastManager.success(`✅ ${collectedImages.length}개의 이미지가 로컬에 저장되고 소제목에 배치되었습니다!`);
        } else {
          throw new Error(result.message || '이미지를 찾을 수 없습니다.');
        }
      } catch (error) {
        const errorMessage = (error as Error).message;
        appendLog(`❌ 쇼핑몰 이미지 수집 실패: ${errorMessage}`, 'images-log-output');

        if (shoppingCollectResult && shoppingCollectContent) {
          shoppingCollectResult.style.display = 'block';
          shoppingCollectContent.innerHTML = `❌ 수집 실패: ${errorMessage}`;
        }
        if ((window as any).toastManager) (window as any).toastManager.error(`❌ 쇼핑몰 이미지 수집 실패: ${errorMessage}`);
      } finally {
        shoppingCollectBtn.disabled = false;
        shoppingCollectBtn.innerHTML = '<span>🛒</span><span>쇼핑몰 이미지 수집 및 저장</span>';
      }
    });
  }

  // ✅ AI 자동 수집 및 저장하기 버튼 (네이버 이미지 검색 API 활용)
  const aiAutoCollectBtn = document.getElementById('ai-auto-collect-save-btn') as HTMLButtonElement;

  if (aiAutoCollectBtn) {
    aiAutoCollectBtn.addEventListener('click', async () => {
      // 제목 또는 키워드 가져오기
      const imageTitleInputLocal = document.getElementById('image-title') as HTMLInputElement;
      let searchKeyword = imageTitleInputLocal?.value?.trim() || '';

      // 제목이 없으면 통합탭에서 가져오기
      if (!searchKeyword) {
        searchKeyword = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value?.trim() ||
          (document.getElementById('unified-title') as HTMLInputElement)?.value?.trim() || '';
      }

      if (!searchKeyword) {
        if ((window as any).toastManager) (window as any).toastManager.warning('⚠️ 제목이나 키워드를 입력해주세요.');
        return;
      }

      // ✅ 실시간 정보로 수집하기 체크박스 확인
      const realtimeCrawlCheckbox = document.getElementById('image-realtime-crawl') as HTMLInputElement;
      const useRealtimeCrawl = realtimeCrawlCheckbox?.checked ?? true;

      // ✅ 이 버튼은 무조건 네이버 API로만 이미지 수집 (AI 이미지 생성은 별도 버튼에서 처리)

      try {
        aiAutoCollectBtn.disabled = true;
        aiAutoCollectBtn.innerHTML = '<span>🔄</span><span>네이버 이미지 수집 중...</span>';

        let result: any;

        // ✅ AI 자동 수집 버튼은 무조건 네이버 API로만 이미지 수집 (AI 이미지 생성은 별도 기능)
        appendLog(`🔍 네이버 API로 이미지 50개 수집 시작: "${searchKeyword}"`, 'images-log-output');

        // ✅ [100점 개선] AI 자동 수집 - 소제목별 개별 검색 + URL 이미지 우선 + Gemini 문맥 분석
        appendLog(`🚀 [100점 모드] AI 스마트 이미지 수집 시작: "${searchKeyword}"`, 'images-log-output');

        // ✅ 소제목 정보 가져오기
        const currentHeadings = getCurrentImageHeadings();
        const targetCount = currentHeadings.length > 0 ? currentHeadings.length : 5;
        appendLog(`📊 소제목 ${currentHeadings.length}개 감지`, 'images-log-output');

        // ✅ 핵심 주제 추출 (폴백용)
        let coreSubject = searchKeyword.split(' ')[0];
        try {
          const coreResult = await (window.api as any).extractCoreSubject(searchKeyword);
          if (coreResult.success && coreResult.subject) {
            coreSubject = coreResult.subject;
            appendLog(`🎯 핵심 주제 추출: "${coreSubject}"`, 'images-log-output');
          }
        } catch (err) {
          console.warn('[AI 수집] 핵심 주제 추출 실패, 폴백 사용');
        }

        // ✅ URL 입력 확인 (통합탭 또는 이미지탭)
        const sourceUrlInput = document.getElementById('unified-source-url') as HTMLInputElement ||
          document.getElementById('image-source-url') as HTMLInputElement;
        const sourceUrl = sourceUrlInput?.value?.trim() || '';

        let urlImages: string[] = [];

        // ✅ 1단계: URL 이미지 크롤링 (있는 경우) → 1번 소제목(썸네일)에 배치
        if (sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'))) {
          appendLog(`🔗 URL에서 이미지 크롤링 중: ${sourceUrl.substring(0, 50)}...`, 'images-log-output');
          try {
            const crawlResult = await (window.api as any).crawlImagesFromUrl(sourceUrl);
            if (crawlResult.success && crawlResult.images && crawlResult.images.length > 0) {
              urlImages = crawlResult.images;
              appendLog(`✅ URL에서 ${urlImages.length}개 이미지 발견!`, 'images-log-output');
            }
          } catch (err) {
            appendLog(`⚠️ URL 크롤링 실패: ${(err as Error).message}`, 'images-log-output');
          }
        }

        // ✅ [100점 최종] 2단계: 배치 검색어 최적화 (Gemini 1회 호출)
        const headingTitles = currentHeadings.map((h: any) => h.title || `소제목 ${currentHeadings.indexOf(h) + 1}`);
        let optimizedQueries: Array<{ heading: string; optimizedQuery: string; broaderQuery: string }> = [];

        try {
          appendLog(`🧠 Gemini 배치 검색어 최적화 중... (API 호출 1회)`, 'images-log-output');
          const batchResult = await (window.api as any).batchOptimizeSearchQueries(searchKeyword, headingTitles);
          if (batchResult.success && batchResult.results) {
            optimizedQueries = batchResult.results;
            appendLog(`✅ ${optimizedQueries.length}개 소제목 검색어 최적화 완료!`, 'images-log-output');
          }
        } catch (err) {
          console.warn('[AI 수집] 배치 최적화 실패, 기본 키워드 사용');
        }

        // 폴백: 최적화 실패 시 기본 쿼리 생성
        if (optimizedQueries.length === 0) {
          optimizedQueries = headingTitles.map((h: string) => ({
            heading: h,
            optimizedQuery: h,
            broaderQuery: coreSubject
          }));
        }

        // ✅ [100점 최종] 3단계: 병렬 이미지 검색 (Promise.all)
        appendLog(`⚡ 병렬 이미지 검색 시작 (${targetCount}개 동시)...`, 'images-log-output');

        const searchPromises = optimizedQueries.slice(0, targetCount).map(async (q, i) => {
          const heading = q.heading;

          // ✅ [2026-01-29 FIX] 모든 소제목에 크롤링 이미지 순환 배분 (img2img 참조용)
          // 크롤링 이미지가 소제목보다 적으면 순환하여 재사용
          const referenceImageUrl = urlImages.length > 0
            ? urlImages[i % urlImages.length]
            : undefined;

          if (referenceImageUrl) {
            appendLog(`🖼️ [${i + 1}] "${heading}" → 참조 이미지 배분 (img2img)`, 'images-log-output');
            return {
              heading,
              filePath: referenceImageUrl,
              url: referenceImageUrl,
              previewDataUrl: referenceImageUrl,
              prompt: `img2img (URL ${i % urlImages.length + 1}/${urlImages.length})`,
              provider: 'url-img2img',
              headingIndex: i,
              referenceImageUrl, // ✅ img2img 참조 이미지 URL
              success: true
            };
          }

          // 네이버 검색 (3단계 폴백)
          let searchResult = await window.api.searchNaverImages(q.optimizedQuery);

          if (!searchResult.success || !searchResult.images || searchResult.images.length === 0) {
            searchResult = await window.api.searchNaverImages(q.broaderQuery);
          }

          if (!searchResult.success || !searchResult.images || searchResult.images.length === 0) {
            searchResult = await window.api.searchNaverImages(coreSubject);
          }

          if (searchResult.success && searchResult.images && searchResult.images.length > 0) {
            // ✅ [100점] 품질 필터: 해상도 400x300 이상만 선택
            const qualityImages = searchResult.images.filter((img: any) => {
              const w = parseInt(img.sizewidth || img.width || '0', 10);
              const h = parseInt(img.sizeheight || img.height || '0', 10);
              return (w >= 400 && h >= 300) || (w === 0 && h === 0);
            });

            const targetImages = qualityImages.length > 0 ? qualityImages : searchResult.images;
            const selectedImage = targetImages[i % targetImages.length] || targetImages[0];

            // ✅ [100점 개선] 예비 이미지 5개 추가 수집 (폴더 저장용)
            const backupImages: any[] = [];
            for (let j = 1; j <= 5 && j < targetImages.length; j++) {
              const backupImg = targetImages[(i + j) % targetImages.length];
              if (backupImg && (backupImg.url || backupImg.link) !== (selectedImage.url || selectedImage.link)) {
                backupImages.push({
                  url: backupImg.url || backupImg.link,
                  heading: `${heading} (예비${j})`
                });
              }
            }

            return {
              heading,
              filePath: selectedImage.url || selectedImage.link,
              url: selectedImage.url || selectedImage.link,
              previewDataUrl: selectedImage.thumbnail || selectedImage.url,
              prompt: q.optimizedQuery,
              provider: 'naver',
              headingIndex: i,
              success: true,
              backupImages // ✅ 예비 이미지 배열
            };
          }

          // URL 이미지 폴백
          if (urlImages.length > i) {
            return {
              heading,
              filePath: urlImages[i],
              url: urlImages[i],
              previewDataUrl: urlImages[i],
              prompt: 'URL 이미지',
              provider: 'url',
              headingIndex: i,
              success: true
            };
          }

          return { heading, headingIndex: i, success: false };
        });

        const searchResults = await Promise.all(searchPromises);
        const collectedImages: any[] = searchResults.filter((r: any) => r.success);

        // 로그 출력
        searchResults.forEach((r: any, i: number) => {
          if (r.success) {
            appendLog(`   ✅ [${i + 1}] "${r.heading}" → ${r.provider} 이미지`, 'images-log-output');
          } else {
            appendLog(`   ⚠️ [${i + 1}] "${r.heading}" → 이미지 없음`, 'images-log-output');
          }
        });

        if (collectedImages.length > 0) {
          appendLog(`🎉 총 ${collectedImages.length}개 이미지 수집 완료!`, 'images-log-output');
          toastManager.info(`🖼️ ${collectedImages.length}개 스마트 이미지 수집 완료!`);

          // ✅ 이미지를 로컬 폴더에 저장 (메인 이미지)
          const allImagesToSave = collectedImages.map((img: any) => ({
            url: img.url,
            heading: img.heading
          }));

          // ✅ [100점 개선] 예비 이미지도 폴더에 저장 (UI에는 표시 안 함)
          let backupCount = 0;
          collectedImages.forEach((img: any) => {
            if (img.backupImages && Array.isArray(img.backupImages)) {
              img.backupImages.forEach((backup: any) => {
                allImagesToSave.push(backup);
                backupCount++;
              });
            }
          });

          if (backupCount > 0) {
            appendLog(`📂 예비 이미지 ${backupCount}개도 함께 저장 (폴더 전용)`, 'images-log-output');
          }

          appendLog(`💾 ${allImagesToSave.length}개 이미지를 로컬 폴더에 저장 중...`, 'images-log-output');
          const saveResult = await window.api.downloadAndSaveMultipleImages(
            allImagesToSave,
            searchKeyword
          );

          // 저장된 경로로 이미지 업데이트 (heading 기반 매칭)
          if (saveResult.success && saveResult.savedImages) {
            // ✅ heading 기반으로 매칭 (다운로드 실패 시 인덱스 어긋남 방지)
            const savedMap = new Map(
              saveResult.savedImages
                .filter((s: any) => s && s.heading && s.filePath)
                .map((s: any) => [s.heading, s.filePath])
            );

            collectedImages.forEach((img: any) => {
              const savedPath = savedMap.get(img.heading);
              if (savedPath) {
                img.filePath = savedPath;
                img.url = savedPath;
                img.previewDataUrl = savedPath;
                (img as any).savedToLocal = true;
              }
              // ✅ 저장 실패 시 원본 URL 유지 (이미 설정된 url 사용)
            });

            const savedCount = saveResult.savedImages.filter((i: any) => i && i.filePath).length;
            appendLog(`💾 ${savedCount}개 이미지 로컬 저장 완료!`, 'images-log-output');
            if (saveResult.folderPath) {
              appendLog(`📁 저장 위치: ${saveResult.folderPath}`, 'images-log-output');
            }

            // ✅ 일부 이미지 저장 실패 알림
            const failedCount = collectedImages.length - savedCount;
            if (failedCount > 0) {
              appendLog(`⚠️ ${failedCount}개 이미지는 원본 URL로 표시됩니다 (다운로드 실패)`, 'images-log-output');
            }
          }

          // ✅ 전역 변수에 설정
          generatedImages = collectedImages as any[];
          (window as any).imageManagementGeneratedImages = collectedImages;

          // ✅ ImageManager에 등록
          collectedImages.forEach((img: any) => {
            if (img.heading) {
              ImageManager.setImage(img.heading, {
                ...img,
                timestamp: Date.now()
              });
            }
          });
          appendLog(`🔗 ImageManager에 ${collectedImages.length}개 이미지 등록 완료`, 'images-log-output');

          // ✅ UI 업데이트
          displayGeneratedImages(collectedImages);
          updatePromptItemsWithImages(collectedImages);
          updateReserveImagesThumbnails();

          appendLog(`✅ [100점 모드] 스마트 이미지 수집 완료!`, 'images-log-output');
          if ((window as any).toastManager) (window as any).toastManager.success(`✅ ${collectedImages.length}개의 이미지가 소제목별로 배치되었습니다!`);
        } else {
          throw new Error(result.message || '이미지를 찾을 수 없습니다.');
        }
      } catch (error) {
        const errorMessage = (error as Error).message;
        appendLog(`❌ 네이버 이미지 수집 실패: ${errorMessage}`, 'images-log-output');
        if ((window as any).toastManager) (window as any).toastManager.error(`❌ 이미지 수집 실패: ${errorMessage}`);
      } finally {
        aiAutoCollectBtn.disabled = false;
        aiAutoCollectBtn.innerHTML = '<span>🤖</span><span>AI 자동 수집 및 저장하기</span>';
      }
    });
  }
}

// ✅ 수집된 이미지 표시 함수
export function displayCollectedImages(images: any[]): void {
  const previewContainer = document.getElementById('images-preview-grid') ||
    document.getElementById('generated-images-preview') ||
    document.querySelector('.generated-images-grid');

  if (!previewContainer) {
    console.log('[Images] 미리보기 컨테이너를 찾을 수 없습니다.');
    return;
  }

  // 기존 이미지 유지하면서 추가
  images.filter(img => img).forEach((img, idx) => {
    if (!img) return;
    const imageDiv = document.createElement('div');
    imageDiv.className = 'collected-image-item';
    imageDiv.style.cssText = `
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      aspect-ratio: 1;
      background: var(--bg-tertiary);
      cursor: pointer;
    `;

    imageDiv.innerHTML = `
      <img src="${toFileUrlMaybe(img.previewDataUrl || img.url || img.filePath || '')}" alt="${img.heading || ''}" 
           style="width: 100%; height: 100%; object-fit: cover;"
           onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 fill=%22%23999%22%3E이미지%3C/text%3E%3C/svg%3E'">
      <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 0.5rem; background: linear-gradient(transparent, rgba(0,0,0,0.8)); color: white; font-size: 0.75rem;">
        ${img.heading}
      </div>
      <button class="select-image-btn" data-image-index="${idx}" style="position: absolute; top: 0.25rem; right: 0.25rem; width: 24px; height: 24px; border-radius: 50%; background: var(--primary); color: white; border: none; cursor: pointer; font-size: 0.75rem;">✓</button>
    `;

    previewContainer.appendChild(imageDiv);
  });

  appendLog(`📸 ${images.length}개 이미지가 미리보기에 추가되었습니다.`, 'images-log-output');
}

// 소제목에서 영어 프롬프트 생성
export function extractHeadingsFromContent(content: string): any[] {
  const headings = content.split('\n').filter(line => line.trim().startsWith('## ')).map(line => line.trim().substring(3));

  // ✅ [2026-02-27 FIX] extractHeadingsFromContent는 동기 함수이므로 Sync 유지 (UI 초기 표시용)
  // 실제 이미지 생성 시에는 AI 기반 generateEnglishPromptForHeading이 호출됨
  return headings.map(heading => ({
    title: heading,
    prompt: getManualEnglishPromptOverrideForHeading(heading) || generateEnglishPromptForHeadingSync(heading)
  }));
}

// 영어 프롬프트 생성 (동적 번역 적용) - ✅ 구체적인 이미지 프롬프트 생성
export function generateEnglishPromptForHeadingSync(heading: string): string {
  // ✅ 1단계: 프롬프트 정리
  let cleanPrompt = heading
    .replace(/【[^】]*】/g, '') // 【...】 괄호와 그 안의 내용 제거
    .replace(/\[[^\]]*\]/g, '') // [...] 괄호와 그 안의 내용 제거
    .replace(/^\s*\d+[\.\s\)]*/, '') // 시작 부분의 숫자와 점(1. 2.) 제거
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // 이모지 제거
    .replace(/[?,!]/g, '') // 물음표, 느낌표 제거
    .replace(/\s+/g, ' ')
    .trim();

  // 만약 정제 후 비어있다면 원본 사용 (최후의 보루)
  if (!cleanPrompt) cleanPrompt = heading.trim();

  // ✅ 소제목 패턴 감지 및 구체적 프롬프트 생성
  const patterns: Array<{ pattern: RegExp; prompt: (match: RegExpMatchArray) => string }> = [
    // 개인정보/보안 관련
    { pattern: /개인정보.*유출|유출.*개인정보|정보.*유출/, prompt: () => 'digital data leak security breach, hacker computer screen, cybersecurity concept, dramatic lighting, 4k' },
    { pattern: /해킹|사이버.*공격/, prompt: () => 'hacker in dark room, computer screens with code, cybersecurity attack, dramatic blue light, 4k' },
    { pattern: /보안|보호|방지/, prompt: () => 'digital security shield, protection concept, lock and data, professional tech, 4k' },

    // 정부/정책 관련
    { pattern: /정부.*대책|정부.*노력|정부.*대응/, prompt: () => 'government policy documents, official building exterior, national emblem, professional setting, 4k' },
    { pattern: /정책|법안|규제/, prompt: () => 'legal documents, policy papers, government seal, professional office, 4k' },

    // 피해/영향 관련
    { pattern: /피해.*예방|2차.*피해|추가.*피해/, prompt: () => 'protection shield concept, safety measure, warning prevention, professional infographic style, 4k' },
    { pattern: /피해|손실|손해/, prompt: () => 'damage alert concept, caution warning sign, broken objects, dramatic lighting, 4k' },

    // 뉴스/속보 관련
    { pattern: /속보|긴급|충격|발표/, prompt: () => 'breaking news concept, news studio, urgent announcement, professional media, 4k' },
    { pattern: /뉴스|소식|보도/, prompt: () => 'news broadcast studio, professional journalism, media coverage, 4k' },

    // 쇼핑몰/이커머스 관련
    { pattern: /쿠팡|배달|이커머스|온라인.*쇼핑/, prompt: () => 'e-commerce delivery concept, online shopping, packages and smartphone, modern, 4k' },
    { pattern: /스마트스토어|네이버.*쇼핑|쇼핑몰/, prompt: () => 'online marketplace concept, shopping cart and products, e-commerce, modern design, 4k' },

    // 건강/의료 관련
    { pattern: /건강.*팁|건강.*관리|건강.*비결/, prompt: () => 'healthy lifestyle concept, fitness and nutrition, fresh vegetables, bright positive mood, 4k' },
    { pattern: /병원|진료|치료/, prompt: () => 'modern hospital interior, healthcare concept, medical equipment, clean professional, 4k' },
    { pattern: /운동|피트니스|헬스/, prompt: () => 'fitness workout concept, gym equipment, dumbbells and yoga mat, energetic atmosphere, 4k' },

    // 음식/요리 관련
    { pattern: /레시피|요리.*방법|만들기/, prompt: () => 'cooking preparation, kitchen scene, fresh ingredients, appetizing food photography, 4k' },
    { pattern: /맛집|식당|음식점/, prompt: () => 'restaurant interior, delicious food served, dining experience, warm lighting, 4k' },
    { pattern: /아침.*식사|저녁.*식사|점심/, prompt: () => 'delicious meal setting, food photography, fresh ingredients, appetizing, 4k' },

    // 연예/스포츠 관련 (인물 중심)
    { pattern: /배우|연예인|가수|아이돌|스타|활동/, prompt: (match: any) => `famous Korean celebrity ${match[0]}, professional K-star photography, detailed facial features, realistic likeness, 8k` },
    { pattern: /결혼|열애|열애설|발표/, prompt: () => 'Korean celebrity news, romantic and elegant atmosphere, happy celebrity couple concept, professional photography, 16:9' },
    { pattern: /근황|모습|일상/, prompt: () => 'Korean celebrity lifestyle, natural candid photography, high-end editorial style, real-life resemblance, 4k' },

    // 여행/관광 관련
    { pattern: /여행.*팁|여행.*추천|여행지/, prompt: () => 'travel destination scenery, tourism concept, beautiful landscape, vacation mood, 4k' },
    { pattern: /호텔|숙소|리조트/, prompt: () => 'luxury hotel interior, travel accommodation, comfortable room, elegant, 4k' },

    // 기술/IT 관련
    { pattern: /AI|인공지능|머신러닝/, prompt: () => 'artificial intelligence concept, futuristic technology, neural network visualization, modern tech, 4k' },
    { pattern: /스마트폰|모바일|앱/, prompt: () => 'smartphone technology concept, mobile app interface, modern device, clean design, 4k' },

    // 금융/경제 관련
    { pattern: /지원금|보조금|수당|급여|연금|장려금/, prompt: () => 'government subsidy financial support concept, official documents and calculator on desk, financial aid paperwork, professional office, 4k' },
    { pattern: /신청.*방법|신청서|접수|서류|자격.*조건/, prompt: () => 'application form and official documents, paperwork filing process, pen and forms on desk, clean office setting, 4k' },
    { pattern: /혜택|복지|지원.*제도|사회.*보장/, prompt: () => 'welfare benefits concept, social support system, government aid documents, professional infographic style, 4k' },
    { pattern: /대출|이자|금리|상환/, prompt: () => 'bank loan concept, financial documents and calculator, interest rate chart, professional banking, 4k' },
    { pattern: /보험|의료보험|건강보험|실비/, prompt: () => 'insurance policy documents, health coverage concept, protection shield with documents, professional, 4k' },
    { pattern: /투자|주식|재테크/, prompt: () => 'investment concept, stock market chart, financial growth, professional business, 4k' },
    { pattern: /경제|금융|은행/, prompt: () => 'business finance concept, money and charts, professional economy, 4k' },

    // 교육/학습 관련
    { pattern: /공부.*방법|학습.*팁|교육/, prompt: () => 'education learning concept, books and study materials, desk with notes, bright atmosphere, 4k' },

    // 뷰티/패션 관련
    { pattern: /뷰티|화장|메이크업/, prompt: () => 'beauty cosmetics concept, makeup products, elegant skincare, professional photography, 4k' },
    { pattern: /패션|스타일|코디/, prompt: () => 'fashion style concept, trendy outfit, modern clothing, professional fashion photography, 4k' },

    // 부동산/인테리어 관련
    { pattern: /부동산|아파트|집/, prompt: () => 'modern apartment interior, real estate concept, beautiful home, bright living space, 4k' },
    { pattern: /인테리어|가구|꾸미기/, prompt: () => 'interior design concept, stylish home decor, modern furniture, aesthetic room, 4k' },

    // 자동차/교통 관련
    { pattern: /자동차|차량|드라이브/, prompt: () => 'modern car concept, automobile technology, sleek vehicle design, professional auto photography, 4k' },

    // 일반 질문 패턴
    { pattern: /어떻게|방법|팁/, prompt: () => 'helpful tips concept, how-to guide, step by step instruction, informative, 4k' },
    { pattern: /왜|이유|원인/, prompt: () => 'question and answer concept, research analysis, magnifying glass with documents, analytical, 4k' },
    { pattern: /무엇|뭐|어떤/, prompt: () => 'information discovery concept, learning and research, knowledge exploration, 4k' },
  ];

  // 패턴 매칭
  for (const { pattern, prompt } of patterns) {
    const match = cleanPrompt.match(pattern);
    if (match) {
      console.log(`[EnglishPrompt] 패턴 매칭: "${cleanPrompt}" → 구체적 프롬프트 생성`);
      const base = prompt(match);
      const reviewAnchor = getReviewProductAnchor();
      if (reviewAnchor) {
        return `${base}, product review, hands-on real-world usage of ${reviewAnchor}, realistic tabletop scene, Korean hands/person (if a person appears), Korean lifestyle context, natural lighting, close-up detail, 4k`;
      }
      // 연예 카테고리인 경우 한국인 특성 추가
      const finalPrompt = base.includes('celebrity') || base.includes('K-star')
        ? `${base}, authentic Korean ethnicity, specific facial resemblance, realistic skin texture`
        : base;
      return finalPrompt;
    }
  }

  // ✅ 2단계: 한영 번역 사전 (imageGenerator.ts와 동일)
  const koreanToEnglish: Record<string, string> = {
    // 기본/일반
    '아침 식사': 'breakfast', '아침식사': 'breakfast', '아침': 'morning', '식사': 'meal',
    '건강': 'healthy', '건강한': 'healthy', '완성': 'complete', '팁': 'tips',
    '방법': 'method', '중요': 'important', '시작': 'start', '나만의': 'personal',
    '맞춤': 'customized', '추천': 'recommended',

    // 연령대
    '40대': 'middle aged', '30대': 'young adult', '50대': 'mature',
    '20대': 'young', '60대': 'senior',

    // 음식
    '메뉴': 'menu', '레시피': 'recipe', '요리': 'cooking', '음식': 'food',
    '영양': 'nutrition', '영양 가득한': 'nutritious', '가득한': 'full of',
    '단백질': 'protein', '채소': 'vegetables', '과일': 'fruits',
    '달걀': 'egg', '계란': 'egg', '우유': 'milk', '빵': 'bread',
    '샐러드': 'salad', '국수': 'noodles', '밥': 'rice', '고기': 'meat',
    '생선': 'fish', '치킨': 'chicken', '피자': 'pizza', '햄버거': 'hamburger',
    '커피': 'coffee', '차(음료)': 'tea', '주스': 'juice',
    '디저트': 'dessert', '케이크': 'cake',

    // 시간/속도
    '초간단': 'quick easy', '간단하면서도': 'simple', '5분': 'five minutes',
    '10분': 'ten minutes', '간단': 'simple', '빠른': 'fast', '느린': 'slow',
    '즉시': 'immediate', '지금': 'now', '오늘': 'today', '내일': 'tomorrow',
    '어제': 'yesterday', '주간': 'weekly', '월간': 'monthly', '연간': 'yearly',

    // 영화/엔터테인먼트
    '영화': 'movie film', '시상식': 'award ceremony', '레드카펫': 'red carpet',
    '영화제': 'film festival', '시상': 'award', '수상': 'award winning',
    '배우': 'actor actress', '연기자': 'actor', '감독': 'director',
    '제작': 'production', '촬영': 'filming shooting', '촬영 중': 'filming',
    '불참': 'absence', '참석': 'attendance', '포착': 'captured',
    '공개': 'public', '발표': 'announcement', '소식': 'news', '뉴스': 'news',
    '연예': 'entertainment', '연예계': 'entertainment industry',
    '스타': 'star celebrity', '아이돌': 'idol', '가수': 'singer',
    '그룹': 'group', '콘서트': 'concert', '공연': 'performance',
    '무대': 'stage', '드라마': 'drama', '시리즈': 'series',
    '프리미어': 'premiere', '개봉': 'release', '흥행': 'box office',
    '관객': 'audience', '평점': 'rating', '트레일러': 'trailer', '포스터': 'poster',

    // 스포츠
    '스포츠': 'sports', '축구': 'soccer football', '야구': 'baseball',
    '농구': 'basketball', '배구': 'volleyball', '테니스': 'tennis',
    '골프': 'golf', '수영': 'swimming', '달리기': 'running',
    '경기': 'game match', '경쟁': 'competition', '선수': 'player athlete',
    '팀': 'team', '우승': 'championship', '승리': 'victory win',
    '패배': 'defeat loss', '득점': 'score', '골': 'goal',
    '경기장': 'stadium', '올림픽': 'olympics', '월드컵': 'world cup',

    // 기술/IT
    '기술': 'technology', 'IT': 'IT', '컴퓨터': 'computer',
    '스마트폰': 'smartphone', '폰': 'phone', '태블릿': 'tablet',
    '노트북': 'laptop', '게임': 'game', '앱': 'app application',
    '소프트웨어': 'software', '하드웨어': 'hardware',
    '인공지능': 'artificial intelligence AI', 'AI': 'AI', '로봇': 'robot',
    '인터넷': 'internet', '웹': 'web', '사이트': 'site website',
    '프로그램': 'program', '개발': 'development', '코딩': 'coding',
    '프로그래밍': 'programming', '데이터': 'data', '정보': 'information',
    '보안': 'security', '해킹': 'hacking', '바이러스': 'virus',

    // 패션/뷰티
    '패션': 'fashion', '옷': 'clothes clothing', '의류': 'clothing',
    '스타일': 'style', '코디': 'coordination', '옷차림': 'outfit',
    '드레스': 'dress', '정장': 'suit', '신발': 'shoes', '가방': 'bag',
    '악세서리': 'accessories', '화장품': 'cosmetics', '뷰티': 'beauty',
    '메이크업': 'makeup', '스킨케어': 'skincare', '헤어': 'hair',
    '네일': 'nail', '향수': 'perfume', '브랜드': 'brand', '디자인': 'design',

    // 여행/관광
    '여행': 'travel tourism', '관광': 'tourism', '휴가': 'vacation holiday',
    '휴양': 'resort', '호텔': 'hotel', '리조트': 'resort', '해변': 'beach',
    '바다': 'sea ocean', '산': 'mountain', '숲': 'forest', '공원': 'park',
    '명소': 'attraction', '관광지': 'tourist spot', '랜드마크': 'landmark',
    '박물관': 'museum', '미술관': 'art gallery', '전시': 'exhibition',
    '축제': 'festival',

    // 건강/의료
    '의료': 'medical', '병원': 'hospital', '의사': 'doctor', '간병': 'nursing',
    '치료': 'treatment', '수술': 'surgery', '약': 'medicine',
    '건강검진': 'health checkup', '운동': 'exercise workout', '요가': 'yoga',
    '필라테스': 'pilates', '헬스': 'gym fitness', '다이어트': 'diet',
    '체중': 'weight', '비만': 'obesity', '스트레스': 'stress',
    '수면': 'sleep', '면역': 'immunity',

    // 교육/학습
    '교육': 'education', '학교': 'school', '대학': 'university college',
    '학생': 'student', '선생님': 'teacher', '공부': 'study', '학습': 'learning',
    '시험': 'exam test', '과제': 'assignment', '수업': 'class lesson',
    '강의': 'lecture', '책': 'book', '학원': 'academy', '과외': 'tutoring',
    '입시': 'entrance exam', '취업': 'employment', '면접': 'interview',

    // 부동산/인테리어
    '부동산': 'real estate', '집': 'house home', '아파트': 'apartment',
    '빌라': 'villa', '오피스텔': 'officetel', '인테리어': 'interior',
    '리모델링': 'remodeling', '가구': 'furniture', '침대': 'bed',
    '소파': 'sofa', '책상': 'desk', '의자': 'chair', '조명': 'lighting',
    '장식': 'decoration', '벽지': 'wallpaper', '바닥': 'floor',

    // 자동차/교통
    '자동차': 'car automobile', '차': 'car', '운전': 'driving', '도로': 'road',
    '고속도로': 'highway', '교통': 'traffic', '대중교통': 'public transportation',
    '지하철': 'subway metro', '버스': 'bus', '택시': 'taxi', '기차': 'train',
    '비행기': 'airplane', '공항': 'airport', '항구': 'port',

    // 쇼핑/구매
    '쇼핑': 'shopping', '구매': 'purchase buy', '판매': 'sale',
    '할인': 'discount', '마켓': 'market', '상점': 'store shop',
    '온라인': 'online', '오프라인': 'offline', '배송': 'delivery',
    '결제': 'payment', '카드': 'card', '현금': 'cash',

    // 날씨/계절
    '날씨': 'weather', '맑음': 'sunny', '비': 'rain', '눈': 'snow',
    '바람': 'wind', '구름': 'cloud', '봄': 'spring', '여름': 'summer',
    '가을': 'autumn fall', '겨울': 'winter', '계절': 'season',
    '온도': 'temperature', '더위': 'heat', '추위': 'cold',

    // 감정/상태
    '기쁨': 'joy happiness', '슬픔': 'sadness', '화': 'anger',
    '놀람': 'surprise', '두려움': 'fear', '사랑': 'love',
    '행복': 'happiness', '만족': 'satisfaction', '실망': 'disappointment',
    '걱정': 'worry', '안심': 'relief', '피곤': 'tired',
    '활기': 'energy', '편안': 'comfort',

    // 동물/자연
    '동물': 'animal', '강아지': 'puppy dog', '고양이': 'cat', '새': 'bird',
    '물고기': 'fish', '나무': 'tree', '꽃': 'flower', '풀': 'grass',
    '하늘': 'sky', '별': 'star', '달': 'moon', '자연': 'nature',
    '환경': 'environment',

    // 가족/인간관계
    '가족': 'family', '부모': 'parents', '아버지': 'father dad',
    '어머니': 'mother mom', '형제': 'siblings', '자매': 'sisters',
    '친구': 'friend', '동료': 'colleague', '이웃': 'neighbor',
    '사람': 'person people', '아이': 'child kid', '아기': 'baby',
    '청소년': 'teenager', '성인': 'adult', '노인': 'elderly',

    // 직업/일
    '직업': 'job occupation', '일': 'work job', '회사': 'company',
    '사무실': 'office', '회의': 'meeting', '프로젝트': 'project',
    '업무': 'work task', '업계': 'industry', '비즈니스': 'business',
    '경영': 'management', '마케팅': 'marketing', '영업': 'sales',
    '고객': 'customer client', '서비스': 'service',

    // 취미/여가
    '취미': 'hobby', '여가': 'leisure', '영화감상': 'movie watching',
    '음악': 'music', '노래': 'song singing', '춤': 'dance',
    '그림': 'drawing painting', '사진': 'photo photography',
    '글쓰기': 'writing', '원예': 'gardening', '수집': 'collecting',
    '만들기': 'making crafting',

    // 종교/철학
    '종교': 'religion', '신앙': 'faith', '기도': 'prayer', '예배': 'worship',
    '절': 'temple', '교회': 'church', '사원': 'temple', '철학': 'philosophy',
    '명상': 'meditation', '영성': 'spirituality',

    // 정치/사회
    '정치': 'politics', '정부': 'government', '국회': 'parliament',
    '선거': 'election', '정당': 'political party', '사회': 'society',
    '경제': 'economy', '금융': 'finance', '은행': 'bank', '주식': 'stock',
    '투자': 'investment', '세금': 'tax',

    // 금융/보조금/복지
    '지원금': 'government subsidy financial support', '보조금': 'subsidy grant',
    '수당': 'allowance benefit', '급여': 'salary wage', '연금': 'pension',
    '장려금': 'incentive subsidy', '대출': 'loan', '이자': 'interest rate',
    '금리': 'interest rate', '상환': 'repayment', '보험': 'insurance',
    '의료보험': 'health insurance', '건강보험': 'health insurance',
    '복지': 'welfare', '혜택': 'benefit', '자격': 'eligibility qualification',
    '신청': 'application apply', '접수': 'filing submission',
    '서류': 'documents paperwork', '증명서': 'certificate',
    '소득': 'income', '저소득': 'low income', '기초생활': 'basic livelihood',
    '예산': 'budget', '재정': 'fiscal finance',
    '납부': 'payment remittance', '환급': 'refund tax return',
    '공제': 'deduction', '면제': 'exemption', '감면': 'tax reduction',
    '정부지원': 'government support', '국가지원': 'national support',

    // 이유/원인
    '이유': 'reason cause', '원인': 'cause', '결과': 'result',
    '영향': 'influence effect', '문제': 'problem issue', '해결': 'solution',
    '대책': 'measure', '방안': 'plan', '목적': 'purpose', '의도': 'intention',

    // 긴급/상황
    '급한': 'urgent', '긴급': 'emergency', '필수': 'essential',
    '필요': 'need', '당장': 'immediately', '바로': 'right away',
    '빨리': 'quickly', '서둘러': 'hurry',

    // 한국 고유명사
    '송혜교': 'actress', '청룡영화상': 'film awards', '청룡': 'film awards',

    // ✅ 추가: 자주 사용되는 단어들
    '개인정보': 'personal data privacy', '유출': 'data leak breach', '심각한': 'serious critical',
    '상황': 'situation', '어떤': 'what kind', '노력': 'effort', '하고': 'doing',
    '있나': 'is there', '얼마나': 'how much', '막기': 'prevent block', '위해': 'for in order to',
    '쿠팡': 'e-commerce delivery', '네이버': 'portal search', '카카오': 'messenger platform',
    '삼성': 'samsung electronics', 'LG': 'LG electronics', '현대': 'hyundai',
    '애플': 'apple technology', '구글': 'google tech', '마이크로소프트': 'microsoft',
    '테슬라': 'tesla electric car', '아마존': 'amazon marketplace',
    '비트코인': 'bitcoin cryptocurrency', '암호화폐': 'cryptocurrency',
    '주의': 'caution warning', '조심': 'careful caution', '경고': 'warning alert',
    '해결책': 'solution', '대응': 'response countermeasure', '조치': 'action measure',
    '확인': 'check confirm', '점검': 'inspection check', '검토': 'review examine',
    '분석': 'analysis', '조사': 'investigation research', '연구': 'research study',
    '발견': 'discovery finding', '출시': 'launch release',
    '업데이트': 'update', '변경': 'change modification', '개선': 'improvement',
    '성공': 'success', '실패': 'failure', '성장': 'growth',
    '하락': 'decline drop', '상승': 'rise increase', '증가': 'increase',
    '감소': 'decrease', '변화': 'change', '트렌드': 'trend',
    '인기': 'popular trending', '화제': 'hot topic', '논란': 'controversy',
    '비판': 'criticism', '칭찬': 'praise', '평가': 'evaluation review',
  };

  // ✅ 3단계: 번역 적용 (긴 단어부터)
  let englishQuery = cleanPrompt;
  const sortedEntries = Object.entries(koreanToEnglish).sort((a, b) => b[0].length - a[0].length);
  sortedEntries.forEach(([ko, en]) => {
    englishQuery = englishQuery.replace(new RegExp(ko, 'g'), en);
  });

  // ✅ 4단계: 불필요한 문법 단어만 제거 (핵심 한국어 단어는 보존)
  englishQuery = englishQuery
    .replace(/\b(왜|어떻게|무엇을|이렇게|해보세요)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // ✅ 4.5단계: 스마트 형태소 분해 — 미번역 한국어 복합어 자동 번역
  // "전기차" → "electric vehicle", "피부병" → "skin disease"
  const morphemeProcessed = englishQuery.split(/\s+/).map(word => {
    // 한국어 문자가 포함된 단어만 형태소 분해 시도
    if (/[가-힣]/.test(word) && word.length >= 2) {
      const decomposed = decomposeKoreanCompound(word, koreanToEnglish);
      if (decomposed) {
        console.log(`[SmartDict] 형태소 분해 성공: "${word}" → "${decomposed}"`);
        return decomposed;
      }
      // 분해 실패 시 한국어 원본 보존 (Gemini가 이해 가능)
      return word;
    }
    return word;
  }).join(' ');

  englishQuery = morphemeProcessed;

  // ✅ 5단계: 영어 키워드 추출 + 미번역 한국어 보존
  const words = englishQuery.split(/\s+/).filter(word => {
    if (word.length < 2) return false;
    return true; // 영어든 한국어든 보존
  });

  const mixedQuery = words.join(' ');

  // ✅ 6단계: 완전히 빈 경우에만 원본 heading 직접 사용
  if (!mixedQuery || mixedQuery.trim().length < 3) {
    // [2026-02-24 FIX] 이전: "concept scene, topic visual" 같은 무의미한 제네릭 폴백
    // 수정: 한국어 원본을 그대로 전달 (Gemini 네이티브 한국어 이해 활용)
    englishQuery = cleanPrompt;
  } else {
    englishQuery = mixedQuery;
  }

  // ✅ 7단계: 구체적인 이미지 프롬프트 생성 (소제목 내용 반영)
  const finalWords = englishQuery.split(/\s+/).filter(w => w.length > 2);

  // 소제목에서 핵심 키워드 추출 (한글 포함)
  const koreanKeywords = heading
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, 5);

  // 키워드를 영어로 변환하여 추가
  const additionalKeywords: string[] = [];
  for (const word of koreanKeywords) {
    for (const [ko, en] of sortedEntries) {
      if (word.includes(ko) && !englishQuery.includes(en)) {
        additionalKeywords.push(en.split(' ')[0]); // 첫 번째 영어 단어만
        break;
      }
    }
  }

  // 기본 키워드와 추가 키워드 합치기
  let combinedQuery = englishQuery;
  if (additionalKeywords.length > 0) {
    combinedQuery = `${englishQuery} ${additionalKeywords.slice(0, 3).join(' ')}`;
  }

  // 품질 키워드 추가 - 실사 이미지 스타일 강조
  const qualityKeywords = 'professional photography, natural lighting, high detail, cinematic composition, 4k resolution';

  // ✅ 8단계: 구체적인 프롬프트 생성
  const reviewAnchor = getReviewProductAnchor();
  const reviewCue = reviewAnchor
    ? `, product review, hands-on usage of ${reviewAnchor}, realistic tabletop scene, close-up detail, product focused`
    : '';
  const finalPrompt = `${combinedQuery}, ${qualityKeywords}${reviewCue}`;

  console.log(`[EnglishPrompt] 최종: "${heading}" → "${finalPrompt}"`);

  return finalPrompt || cleanPrompt;
}

// ✅ 썸네일용 프롬프트 생성 (1번 소제목 - 제목 텍스트 포함)
function generateThumbnailPromptWithTitle(heading: string, blogTitle: string, basePromptOverride?: string): string {
  // ✅ [2026-02-27] 썸네일은 동기 컨텍스트에서 호출되므로 Sync 유지
  // generateThumbnailPromptWithTitle 호출 시 이미 override가 전달되는 경우가 대부분
  const basePrompt = String(basePromptOverride || '').trim() || generateEnglishPromptForHeadingSync(heading);

  // 썸네일용 프롬프트: 제목 텍스트를 포함한 4K 실사 배경
  const thumbnailPrompt = `${basePrompt.replace(/, 4k resolution/g, '')}, 
    with prominent Korean text overlay "${blogTitle}" in bold modern font, 
    eye-catching thumbnail design for blog, 
    text should be clearly readable and centered, 
    vibrant colors, high contrast, 
    professional blog thumbnail style, 
    ultra realistic 4k photograph background, 
    cinematic lighting, 
    perfect for Naver blog homepage exposure`;

  console.log(`[ThumbnailPrompt] 썸네일용 프롬프트 생성: "${heading}" → "${thumbnailPrompt.substring(0, 100)}..."`);

  return thumbnailPrompt;
}

// ✅ [2026-02-23 FIX] 엔진별 썸네일 텍스트 분기
// 나노바나나프로: 한글 텍스트 지원 → 제목 포함 프롬프트
// 그 외 엔진: NEVER TEXT → SVG 오버레이로 별도 처리
export function generateImagePromptByIndex(heading: string, index: number, blogTitle?: string): string {
  const overridePrompt = getManualEnglishPromptOverrideForHeading(heading);

  // 현재 선택된 이미지 엔진 확인
  const dropdownSource = (document.getElementById('image-source-select') as HTMLSelectElement)?.value;
  const isNanoBanana = dropdownSource === 'nano-banana-pro';

  if (index === 0 && blogTitle && isNanoBanana) {
    // 나노바나나프로 + 썸네일: 한글 제목 포함 프롬프트
    console.log(`[ImagePrompt] 1번 썸네일 (나노바나나프로 한글 텍스트): "${heading}"`);
    return generateThumbnailPromptWithTitle(heading, blogTitle, overridePrompt);
  } else {
    // 그 외: NEVER TEXT
    // ✅ [2026-02-27] 동기 컨텍스트 (getPromptForImageGeneration) → Sync 유지
    // 실제 이미지 생성 시에는 AI 기반 경로가 사용됨
    const basePrompt = overridePrompt || generateEnglishPromptForHeadingSync(heading);
    const noTextPrompt = `${basePrompt}, NEVER include any text, letters, words, numbers, watermarks, or typography in the image, pure visual content only, clean image without any written elements`;
    console.log(`[ImagePrompt] ${index + 1}번 ${index === 0 ? '썸네일' : '소제목'} (NEVER TEXT): "${heading}" → "${noTextPrompt.substring(0, 80)}..."`);
    return noTextPrompt;
  }
}

// 소제목 자동 분석 함수 (반자동 모드용)
export async function autoAnalyzeHeadings(structuredContent: any): Promise<void> {
  try {
    if (!structuredContent || !structuredContent.headings || structuredContent.headings.length === 0) {
      appendLog('⚠️ 소제목이 없어 분석을 건너뜁니다.');
      return;
    }

    // ✅ 서론, 소제목들, 마무리를 모두 포함한 통합 배열 생성
    const allSections: any[] = [];

    // ✅ [2026-02-23 FIX] 모든 모드에서 서론이 있으면 썸네일 섹션 추가
    // 서론 위 썸네일 이미지 생성을 모든 콘텐츠 모드에서 지원
    if (structuredContent.introduction) {
      allSections.push({
        title: '🖼️ 썸네일',
        content: structuredContent.introduction,
        isThumbnail: true,
        isIntro: true
      });
    }

    // 소제목들 추가
    structuredContent.headings.forEach((heading: any) => {
      allSections.push({
        title: heading.title || heading,
        content: heading.content || heading.summary || '',
        isHeading: true
      });
    });

    // 마무리 추가 (있는 경우)
    if (structuredContent.conclusion) {
      allSections.push({
        title: '📝 마무리',
        content: structuredContent.conclusion,
        isConclusion: true
      });
    }

    appendLog(`🔍 ${allSections.length}개 섹션 분석 시작... (서론: ${structuredContent.introduction ? '있음' : '없음'}, 마무리: ${structuredContent.conclusion ? '있음' : '없음'})`);

    // 소제목을 이미지 관리 탭 형식으로 변환
    // ✅ [2026-03-22] 동시성 제한 (2개씩) — Promise.all 전체 동시 발사 → Rate limit 방지
    const CONCURRENCY = 2;
    const headings: Array<{ title: string; content: string; prompt: string; isIntro?: boolean; isConclusion?: boolean }> = [];
    for (let i = 0; i < allSections.length; i += CONCURRENCY) {
      const batch = allSections.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (section: any) => {
        const title = section.title;
        const override = getManualEnglishPromptOverrideForHeading(title);
        const prompt = override || await generateEnglishPromptForHeading(title);
        return {
          title,
          content: section.content,
          prompt,
          isIntro: section.isIntro,
          isConclusion: section.isConclusion
        };
      }));
      headings.push(...batchResults);
    }

    // ✅ [2026-02-27 CRITICAL FIX] AI 프롬프트를 structuredContent.headings에 write-back
    // autoAnalyzeHeadings가 생성한 영어 프롬프트가 LOCAL headings 배열에만 저장되고
    // 원본 structuredContent.headings에는 반영되지 않아서, 이후 generateImagesForAutomation에서
    // h.prompt가 undefined → 한국어 제목이 프롬프트로 사용되는 치명적 버그 수정
    if (structuredContent.headings && Array.isArray(structuredContent.headings)) {
      // headings 배열에서 소제목(isHeading)에 해당하는 항목만 필터 (서론/마무리 제외)
      const headingPrompts = headings.filter((h: any) => !h.isIntro && !h.isConclusion);
      for (let i = 0; i < Math.min(structuredContent.headings.length, headingPrompts.length); i++) {
        if (headingPrompts[i]?.prompt) {
          structuredContent.headings[i].prompt = headingPrompts[i].prompt;
          console.log(`[autoAnalyzeHeadings] ✅ Write-back prompt[${i}]: "${String(structuredContent.headings[i].title || '').substring(0, 20)}" → "${String(headingPrompts[i].prompt).substring(0, 50)}..."`);
        }
      }
      appendLog(`📝 ${headingPrompts.length}개 소제목에 AI 영어 프롬프트 저장 완료`);
    }

    // 이미지 관리 탭에 소제목 표시
    displayImageHeadingsWithPrompts(headings);

    const imagesForUi = (() => {
      try {
        const all = ImageManager.getAllImages();
        if (Array.isArray(all) && all.length > 0) return all;
      } catch (e) {
        console.warn('[headingImageGen] catch ignored:', e);
      }
      return Array.isArray(generatedImages) ? generatedImages : [];
    })();

    // 통합 탭의 이미지 미리보기도 업데이트
    if (structuredContent.headings) {
      updateUnifiedImagePreview(structuredContent.headings, imagesForUi);
    }

    // ✅ 생성된 이미지 그리드에도 표시
    displayGeneratedImages(imagesForUi);

    appendLog(`✅ ${headings.length}개 소제목 분석 완료!`);
  } catch (error) {
    appendLog(`❌ 소제목 자동 분석 실패: ${(error as Error).message}`);
    throw error;
  }
}

// 이미지 헤딩 표시
export function displayImageHeadingsWithPrompts(headings: any[]): void {
  const promptsContainer = document.getElementById('prompts-container') as HTMLDivElement;
  const promptsPlaceholder = document.getElementById('prompts-placeholder') as HTMLDivElement;

  // ✅ 썸네일 텍스트 포함 옵션: 4개 버튼 아래 전용 영역에 렌더
  const thumbnailOptionHost = document.getElementById('thumbnail-text-option-host') as HTMLDivElement | null;
  if (thumbnailOptionHost) {
    const existingChecked = (document.getElementById('thumbnail-text-option') as HTMLInputElement | null)?.checked ?? false;
    thumbnailOptionHost.style.display = 'block';
    thumbnailOptionHost.innerHTML = `
      <div id="thumbnail-text-option-container" style="
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05));
        border: 1px solid rgba(245, 158, 11, 0.3);
        border-radius: 12px;
        padding: 1rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
      ">
        <input type="checkbox" id="thumbnail-text-option" ${existingChecked ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer; accent-color: #f59e0b;">
        <label for="thumbnail-text-option" style="cursor: pointer; font-weight: 600; color: var(--text-strong); display: flex; flex-direction: column; gap: 0.25rem;">
          <span>🖼️ 썸네일 텍스트 포함</span>
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 400;">나노바나나프로: 이미지에 직접 텍스트 생성 / 그 외 엔진: SVG 오버레이</span>
          </label>
        </div>
      `;
  }

  if (!promptsContainer || !promptsPlaceholder) return;

  if (headings.length === 0) {
    promptsContainer.style.display = 'none';
    promptsPlaceholder.style.display = 'block';
    promptsPlaceholder.innerHTML = '<div style="color: var(--text-muted); font-style: italic;">소제목이 발견되지 않았습니다.</div>';
    return;
  }

  const normalizedHeadings = (Array.isArray(headings) ? headings : []).map((h: any, index: number) => {
    const titleRaw = typeof h === 'string' ? String(h || '').trim() : String(h?.title || h || '').trim();
    const title = titleRaw || `소제목 ${index + 1}`;
    const override = getManualEnglishPromptOverrideForHeading(title);
    const promptRaw = typeof h === 'string' ? '' : String(h?.prompt || '').trim();
    const prompt = override || promptRaw || generateEnglishPromptForHeadingSync(title);
    const isConclusion = h?.isConclusion || title.includes('📝 마무리') || title.includes('마무리');
    // ✅ [2026-02-24 FIX] isIntro/isThumbnail 플래그 보존 → 모달 썸네일 배지 표시용
    const isIntro = !!(h?.isIntro);
    const isThumbnail = !!(h?.isThumbnail);
    return { title, prompt, isConclusion, isIntro, isThumbnail };
  });

  // ✅ [2026-01-21] 마무리 섹션은 UI에서 숨김 (AI 이미지 생성 제외와 일관성)
  const displayHeadings = normalizedHeadings.filter(h => !h.isConclusion);

  // ✅ 기존 프롬프트 아이템 모두 제거
  promptsContainer.innerHTML = '';

  // ✅ 각 소제목에 대한 프롬프트 아이템 동적 생성
  // ✅ 프롬프트 데이터는 글로벌 배열에 저장하여 data- 속성 문제 방지
  (window as any)._headingPrompts = normalizedHeadings.map((h) => h.prompt || '');
  (window as any)._headingTitles = normalizedHeadings.map((h) => h.title || '');

  displayHeadings.forEach((heading, index) => {
    // ✅ 안전한 HTML 이스케이프 적용
    const safeTitle = escapeHtml(heading.title || `소제목 ${index + 1}`);
    const safePrompt = escapeHtml(heading.prompt || '');

    // ✅ [2026-02-24] 썸네일 여부 판별 → 배지 + accent 테두리
    const isThumbnailItem = !!(heading.isIntro || heading.isThumbnail);

    const promptItem = document.createElement('div');
    promptItem.className = 'prompt-item';
    promptItem.setAttribute('data-index', `${index + 1}`);
    promptItem.setAttribute('data-heading-title', heading.title || `소제목 ${index + 1}`);
    promptItem.style.cssText = `
      background: ${isThumbnailItem ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(217, 119, 6, 0.04))' : 'var(--bg-secondary)'};
      border: 1px solid ${isThumbnailItem ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-light)'};
      border-radius: 12px;
      padding: 1rem;
      transition: all 0.2s;
    `;

    // ✅ [2026-02-24] 썸네일 배지: 🖼️ 아이콘 + 라벨
    const numberBadge = isThumbnailItem
      ? `<div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 0.9rem;">🖼️</div>`
      : `<div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 0.9rem;">${index + 1}</div>`;
    const thumbnailLabel = isThumbnailItem
      ? `<span style="font-size: 0.7rem; padding: 2px 6px; background: rgba(245, 158, 11, 0.2); color: #d97706; border-radius: 4px; font-weight: 600;">📌 썸네일</span>`
      : '';

    promptItem.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
        ${numberBadge}
        <div style="flex: 1;">
          <div class="heading-title-text" style="font-weight: 600; color: var(--text-strong); font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem;"><span class="heading-title-pure">${safeTitle}</span> ${thumbnailLabel}</div>
        </div>
      </div>
      <div style="margin-bottom: 0.75rem;">
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">📝 영어 프롬프트:</div>
        <div class="prompt-text" style="font-size: 0.9rem; color: var(--text-strong); padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px; font-family: monospace; word-break: break-word;">${safePrompt}</div>
        <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top: 0.5rem;">
          <button type="button" class="edit-heading-prompt-btn" data-heading-index="${index}" style="padding: 0.35rem 0.65rem; background: rgba(59,130,246,0.16); color: var(--text-strong); border: 1px solid rgba(59,130,246,0.35); border-radius: 6px; font-size: 0.75rem; cursor: pointer;">✏️ 수정</button>
          <button type="button" class="reset-heading-prompt-btn" data-heading-index="${index}" style="padding: 0.35rem 0.65rem; background: rgba(239,68,68,0.12); color: var(--text-strong); border: 1px solid rgba(239,68,68,0.25); border-radius: 6px; font-size: 0.75rem; cursor: pointer;">↩️ 초기화</button>
        </div>
      </div>
      <div class="generated-images-container" data-heading-index="${index}" style="width: 100%; min-height: 200px; border: 2px dashed var(--border-color); border-radius: 8px; background: var(--bg-tertiary); overflow: hidden; padding: 0.75rem;">
        <div class="generated-image" style="width: 100%; aspect-ratio: 16 / 9; min-height: 220px; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 0.75rem; border: 2px dashed var(--border-color); background: var(--bg-tertiary); position: relative;">
          <span style="color: var(--text-muted); font-size: 1.5rem;">🖼️</span>
        </div>
        <div class="images-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.5rem; margin-bottom: 0.75rem;">
          <!-- 이미지들이 여기에 동적으로 추가됨 -->
        </div>
        <div class="no-image-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; gap: 0.5rem;">
          <span style="color: var(--text-muted); font-size: 2rem;">🖼️</span>
          <span style="color: var(--text-muted); font-size: 0.85rem;">이미지 없음</span>
        </div>
        <!-- ✅ 예비 이미지 빠른 교체 영역 (썸네일만 표시) -->
        <div class="reserve-images-strip" data-heading-index="${index}" style="display: none; margin-bottom: 0.5rem; padding: 0.5rem; background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.1)); border-radius: 8px; border: 1px solid rgba(245, 158, 11, 0.3);">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span style="color: #f59e0b; font-size: 0.75rem; font-weight: 600; white-space: nowrap;">⚡ 예비 이미지:</span>
            <div class="reserve-thumbs" style="display: flex; gap: 4px; flex-wrap: wrap;"></div>
          </div>
        </div>
        
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; margin-top: 0.5rem;">
          <button type="button" class="select-local-image-btn" data-heading-index="${index}" style="padding: 0.4rem 0.75rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; border-radius: 6px; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;" title="저장된 이미지에서 선택">
            🔄 변경
          </button>
          <button type="button" class="add-multiple-images-btn" data-heading-index="${index}" style="padding: 0.4rem 0.75rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 6px; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;" title="로컬 파일에서 이미지 추가">
            ➕ 추가
          </button>
          <button type="button" class="regenerate-single-image-btn" data-heading-index="${index}" style="padding: 0.4rem 0.75rem; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 6px; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;" title="이미지 생성">
            🔄 생성
          </button>
          <button type="button" class="generate-heading-video-btn" data-heading-index="${index}" style="padding: 0.4rem 0.75rem; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; border-radius: 6px; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;" title="AI 영상 생성">
            🎬 영상 생성
          </button>
          <button type="button" class="set-primary-image-btn" data-heading-index="${index}" style="padding: 0.4rem 0.75rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 6px; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;" title="선택된 이미지를 대표 이미지로 지정">
            ⭐ 대표 지정
          </button>
          <button type="button" class="clear-heading-images-btn" data-heading-index="${index}" style="padding: 0.4rem 0.75rem; background: var(--bg-tertiary); color: var(--text-muted); border: 1px solid var(--border-light); border-radius: 6px; font-size: 0.8rem; cursor: pointer;" title="모든 이미지 제거">
            🗑️ 전체삭제
          </button>
        </div>
      </div>
    `;

    promptsContainer.appendChild(promptItem);
  });

  promptsContainer.style.display = 'grid';
  promptsPlaceholder.style.display = 'none';

  // ✅ 새로고침 버튼 표시
  const refreshPromptsBtn = document.getElementById('refresh-prompts-btn');
  if (refreshPromptsBtn) {
    refreshPromptsBtn.style.display = 'flex';
  }

  // ✅ [2026-02-11 FIX] 쇼핑커넥트 모드에서만 "1번 → 썸네일 생성기" 버튼 표시
  const setFirstHeadingThumbnailBtn = document.getElementById('set-first-heading-thumbnail-btn');
  if (setFirstHeadingThumbnailBtn) {
    const thumbBtnContentMode = (document.getElementById('unified-content-mode') as HTMLSelectElement)?.value || '';
    setFirstHeadingThumbnailBtn.style.display = thumbBtnContentMode === 'shopping-connect' ? 'flex' : 'none';
  }

  // ✅ 예비 이미지 빠른 교체 썸네일 업데이트
  if (typeof updateReserveImagesThumbnails === 'function') {
    updateReserveImagesThumbnails();
  }

  // ✅ [2026-02-24 FIX] generate-images-btn 동적 생성 — 클릭 핸들러(L30796)가 이 ID를 참조하므로 반드시 DOM에 존재해야 함
  if (!document.getElementById('generate-images-btn')) {
    const generateBtnContainer = document.createElement('div');
    generateBtnContainer.style.cssText = 'display: flex; justify-content: center; margin-top: 1.5rem; margin-bottom: 1rem;';
    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.id = 'generate-images-btn';
    generateBtn.style.cssText = `
      padding: 1rem 2.5rem;
      background: linear-gradient(135deg, #6366f1, #4f46e5, #7c3aed);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
      transition: all 0.3s ease;
      min-width: 280px;
      justify-content: center;
    `;
    generateBtn.innerHTML = '<span style="font-size: 1.25rem;">🎨</span><span>프롬프트대로 이미지 생성하기</span>';
    generateBtn.onmouseenter = () => {
      generateBtn.style.transform = 'translateY(-2px)';
      generateBtn.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.5)';
    };
    generateBtn.onmouseleave = () => {
      generateBtn.style.transform = 'translateY(0)';
      generateBtn.style.boxShadow = '0 4px 15px rgba(99, 102, 241, 0.4)';
    };
    generateBtnContainer.appendChild(generateBtn);
    promptsContainer.parentElement?.insertBefore(generateBtnContainer, promptsContainer.nextSibling);
    console.log('[ImageManagement] ✅ generate-images-btn 동적 생성 완료');
  }

  appendLog(`✅ ${displayHeadings.length}개의 소제목 미리보기를 표시했습니다.`);
}

export function updateReserveImagesThumbnails(): void {
  document.querySelectorAll('.reserve-images-strip').forEach((strip) => {
    (strip as HTMLElement).style.display = 'none';
  });
}

export function getHeadingSelectedImageKeyStore(): Record<string, string> {
  const w = window as any;
  if (!w.__headingSelectedImageKeys) w.__headingSelectedImageKeys = {};
  return w.__headingSelectedImageKeys;
}

export function getHeadingSelectedImageKey(headingKey: string): string {
  const store = getHeadingSelectedImageKeyStore();
  return String(store[String(headingKey || '').trim()] || '').trim();
}

export function setHeadingSelectedImageKey(headingKey: string, imageKey: string): void {
  const store = getHeadingSelectedImageKeyStore();
  const hk = String(headingKey || '').trim();
  if (!hk) return;
  store[hk] = String(imageKey || '').trim();
}

// ============================================
// 🎯 통합 이미지 이벤트 핸들러 (전역 이벤트 위임)
// ============================================
export function initUnifiedImageEventHandlers(): void {
  // 이미 초기화되었으면 중복 방지
  if ((document.body as any).__unifiedImageHandlersInitialized) return;
  (document.body as any).__unifiedImageHandlersInitialized = true;

  console.log('[ImageManager] 통합 이미지 이벤트 핸들러 초기화');

  // ✅ 헬퍼 함수: headingIndex로 headingTitle 찾기
  const getHeadingTitleByIndex = (index: number): string => {
    const headings = ImageManager.headings;
    if (headings && headings[index]) {
      return typeof headings[index] === 'string' ? headings[index] : (headings[index].title || '');
    }
    return (window as any)._headingTitles?.[index] || `소제목 ${index + 1}`;
  };

  // ✅ 예비 이미지 우클릭 → 크게 보기
  document.body.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('quick-replace-thumb')) {
      e.preventDefault();
      const imgSrc = (target as HTMLImageElement).src;
      if (imgSrc) {
        showImageModal(imgSrc);
      }
    }
  });

  // 전역 클릭 이벤트 위임
  document.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    const setPrimaryBtn = (target.classList.contains('set-primary-image-btn') ? target : target.closest('.set-primary-image-btn')) as HTMLElement | null;
    if (setPrimaryBtn) {
      e.preventDefault();
      e.stopPropagation();
      const headingIndex = parseInt(String(setPrimaryBtn.dataset.headingIndex || '0'), 10);
      const headingTitle = String((window as any)._headingTitles?.[headingIndex] || '').trim() || getHeadingTitleByIndex(headingIndex);
      if (!headingTitle) return;
      const resolved = (() => {
        try {
          return ImageManager.resolveHeadingKey(headingTitle);
        } catch {
          return headingTitle;
        }
      })();
      const selectedKey = getHeadingSelectedImageKey(resolved);
      if (!selectedKey) {
        toastManager.warning('대표로 지정할 이미지가 선택되지 않았습니다. 먼저 썸네일을 선택하세요.');
        return;
      }
      try {
        ImageManager.setPrimaryImageByKey(headingTitle, selectedKey);
      } catch (err) {
        console.error('[ImageManager] setPrimaryImageByKey failed:', err);
      }
      return;
    }

    const bigPrevBtn = (target.classList.contains('big-preview-prev-btn') ? target : target.closest('.big-preview-prev-btn')) as HTMLElement | null;
    const bigNextBtn = (target.classList.contains('big-preview-next-btn') ? target : target.closest('.big-preview-next-btn')) as HTMLElement | null;
    const bigNavBtn = bigPrevBtn || bigNextBtn;
    if (bigNavBtn) {
      e.preventDefault();
      e.stopPropagation();
      const dir = bigPrevBtn ? -1 : 1;
      const headingIndex = parseInt(String(bigNavBtn.dataset.headingIndex || '0'), 10);
      const headingTitle = String(bigNavBtn.dataset.headingTitle || '').trim() || String((window as any)._headingTitles?.[headingIndex] || '').trim() || getHeadingTitleByIndex(headingIndex);
      if (!headingTitle) return;
      const resolved = (() => {
        try {
          return ImageManager.resolveHeadingKey(headingTitle);
        } catch {
          return headingTitle;
        }
      })();
      let list: any[] = [];
      try {
        list = ImageManager.getImages(resolved) || [];
      } catch {
        list = [];
      }
      if (!Array.isArray(list) || list.length === 0) return;
      const primaryKey = (() => {
        try {
          return getStableImageKey(ImageManager.getImage(resolved));
        } catch {
          return '';
        }
      })();
      const currentKey = getHeadingSelectedImageKey(resolved) || primaryKey || getStableImageKey(list[0]);
      let idx = list.findIndex((img: any) => getStableImageKey(img) === currentKey);
      if (idx < 0) idx = 0;
      const nextIdx = (idx + dir + list.length) % list.length;
      const nextKey = getStableImageKey(list[nextIdx]);
      if (nextKey) setHeadingSelectedImageKey(resolved, nextKey);
      try {
        updatePromptItemsWithImages(ImageManager.getAllImages());
      } catch {
      }
      return;
    }

    // ✅ 작은 그리드 썸네일 클릭 → 대표 이미지로 승격 + 큰 미리보기 동기화
    const gridItem = (target.classList.contains('grid-image-item') ? target : target.closest('.grid-image-item')) as HTMLElement | null;
    if (gridItem) {
      const isDelete = !!(target.classList.contains('remove-single-grid-image-btn') || target.closest('.remove-single-grid-image-btn'));
      if (!isDelete) {
        e.preventDefault();
        e.stopPropagation();
        const headingIndex = parseInt(String(gridItem.dataset.headingIndex || '0'), 10);
        const headingTitle = String(gridItem.dataset.headingTitle || '').trim() || getHeadingTitleByIndex(headingIndex);
        const key = String(gridItem.dataset.imageKey || '').trim() || getStableImageKey({ url: (gridItem.querySelector('img') as HTMLImageElement | null)?.src });
        if (headingTitle && key) {
          try {
            const resolved = (() => {
              try {
                return ImageManager.resolveHeadingKey(headingTitle);
              } catch {
                return headingTitle;
              }
            })();
            setHeadingSelectedImageKey(resolved, key);
            updatePromptItemsWithImages(ImageManager.getAllImages());
          } catch (err) {
            console.error('[ImageManager] thumbnail select failed:', err);
          }
        }
        return;
      }
    }

    // ✅ 0-1. 예비 이미지 빠른 교체 (썸네일 클릭) - 우클릭: 크게보기, 좌클릭: 교체
    if (target.classList.contains('quick-replace-thumb')) {
      e.preventDefault();
      e.stopPropagation();

      const headingIndex = parseInt(target.dataset.headingIndex || '0');
      const reserveIndex = parseInt(target.dataset.reserveIndex || '0');
      const headingTitle = target.dataset.headingTitle || getHeadingTitleByIndex(headingIndex);
      const imgSrc = (target as HTMLImageElement).src;

      console.log(`[QuickReplace] 클릭됨 - headingIndex: ${headingIndex}, reserveIndex: ${reserveIndex}, headingTitle: ${headingTitle}`);

      // 예비 이미지 가져오기
      const allImages = (window as any).imageManagementGeneratedImages || generatedImages || [];
      const headingsCount = ImageManager.headings?.length || 0;
      const reserveImages = allImages.slice(headingsCount);

      console.log(`[QuickReplace] 전체 이미지: ${allImages.length}, 소제목 수: ${headingsCount}, 예비 이미지: ${reserveImages.length}`);

      if (reserveImages[reserveIndex] && headingTitle) {
        const reserveImage = reserveImages[reserveIndex];

        // 현재 이미지와 예비 이미지 교체
        const currentImage = ImageManager.getImage(headingTitle);

        console.log(`[QuickReplace] 교체 시작 - 예비[${reserveIndex}] → "${headingTitle}"`);

        // 예비 이미지를 소제목에 배치
        ImageManager.setImage(headingTitle, {
          ...reserveImage,
          heading: headingTitle,
          headingIndex: headingIndex
        });

        // 현재 이미지를 예비로 이동 (교체된 위치에)
        if (currentImage) {
          const actualReserveIdx = headingsCount + reserveIndex;
          allImages[actualReserveIdx] = { ...currentImage, heading: `예비 이미지 ${reserveIndex + 1}`, headingIndex: -1 };
        }

        // 배치된 이미지 업데이트
        allImages[headingIndex] = { ...reserveImage, heading: headingTitle, headingIndex: headingIndex };

        (window as any).imageManagementGeneratedImages = allImages;
        syncGlobalImagesFromImageManager();
        updateReserveImagesThumbnails();

        toastManager.success(`⚡ ${headingIndex + 1}번 소제목 이미지 빠른 교체!`);
        appendLog(`⚡ [빠른 교체] ${headingIndex + 1}번 소제목 이미지 변경 완료`);
      } else {
        console.warn(`[QuickReplace] 교체 실패 - reserveImages[${reserveIndex}]: ${!!reserveImages[reserveIndex]}, headingTitle: ${headingTitle}`);
        // 예비 이미지가 없거나 headingTitle이 없으면 크게 보기
        if (imgSrc) {
          showImageModal(imgSrc);
        }
      }
      return;
    }

    // ✅ 0-2. 예비 이미지 바로 배치 버튼
    if (target.classList.contains('quick-assign-reserve-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const headingIndex = parseInt(target.dataset.headingIndex || '0');
      const headingTitle = target.dataset.headingTitle || getHeadingTitleByIndex(headingIndex);

      // 예비 이미지 가져오기
      const allImages = (window as any).imageManagementGeneratedImages || generatedImages || [];
      const headingsCount = ImageManager.headings?.length || 0;
      const reserveImages = allImages.slice(headingsCount);

      if (reserveImages.length > 0 && headingTitle) {
        const reserveImage = reserveImages[0]; // 첫 번째 예비 이미지

        // 예비 이미지를 소제목에 배치
        ImageManager.setImage(headingTitle, reserveImage);

        // UI 동기화
        ImageManager.syncAllPreviews();
        displayGeneratedImages(allImages);

        toastManager.success(`⚡ ${headingIndex + 1}번 소제목에 예비 이미지 배치!`);
        appendLog(`⚡ [빠른 배치] ${headingIndex + 1}번 소제목에 예비 이미지 배치 완료`);
      }
      return;
    }

    // 1. 소제목 분석 미리보기 - 이미지 제거 버튼

    // 2. 소제목 분석 미리보기 - 이미지 재생성 버튼
    if (target.classList.contains('regenerate-image-btn')) {
      e.preventDefault();
      e.stopPropagation();

      // ✅ headingTitle 또는 headingIndex로 제목 찾기
      const headingIndex = parseInt(target.dataset.headingIndex || target.dataset.imageIndex || '0');
      const headingTitle = target.dataset.headingTitle || getHeadingTitleByIndex(headingIndex);
      const prompt = target.dataset.prompt || headingTitle;

      if (headingTitle) {
        appendLog(`🔄 "${headingTitle}" 이미지 재생성 시작...`);
        regenerateSingleImage(headingTitle, prompt);
      }
      return;
    }

    if (target.classList.contains('remove-heading-video-btn') || target.closest('.remove-heading-video-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('remove-heading-video-btn') ? target : (target.closest('.remove-heading-video-btn') as HTMLElement);
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');
      const headingTitle = btn?.dataset.headingTitle || getHeadingTitleByIndex(headingIndex);

      if (headingTitle && confirm(`"${headingTitle}" 소제목의 영상을 제거하시겠습니까?`)) {
        (async () => {
          try {
            await removeHeadingVideoByTitle(headingTitle);
          } catch (err) {
            toastManager.error(`소제목 영상 제거 오류: ${(err as Error).message}`);
          }
        })();
      }
      return;
    }

    if (target.classList.contains('regenerate-heading-video-btn') || target.closest('.regenerate-heading-video-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('regenerate-heading-video-btn') ? target : (target.closest('.regenerate-heading-video-btn') as HTMLElement);
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');
      const headingTitle = btn?.dataset.headingTitle || getHeadingTitleByIndex(headingIndex);

      if (headingTitle) {
        (async () => {
          try {
            await regenerateHeadingVideoByTitle(headingTitle);
          } catch (err) {
            toastManager.error(`소제목 영상 재생성 오류: ${(err as Error).message}`);
          }
        })();
      }
      return;
    }

    if (target.classList.contains('edit-heading-prompt-btn') || target.closest('.edit-heading-prompt-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('edit-heading-prompt-btn')
        ? target
        : (target.closest('.edit-heading-prompt-btn') as HTMLElement);
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');
      (window as any).showHeadingPromptEditModal(headingIndex);
      return;
    }

    if (target.classList.contains('reset-heading-prompt-btn') || target.closest('.reset-heading-prompt-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('reset-heading-prompt-btn')
        ? target
        : (target.closest('.reset-heading-prompt-btn') as HTMLElement);
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');
      const headingTitle =
        (window as any)._headingTitles?.[headingIndex] ||
        // ✅ [2026-03-16 FIX] data-heading-title 우선 사용 (배지 오염 방지)
        (document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"]`) as HTMLElement | null)?.getAttribute('data-heading-title')?.trim() ||
        (document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"] .heading-title-pure`) as HTMLElement | null)?.textContent?.trim() ||
        `소제목 ${headingIndex + 1}`;

      clearManualEnglishPromptOverrideForHeading(String(headingTitle || '').trim());
      // ✅ [2026-02-27 FIX] AI 기반 프롬프트 초기화 (Gemini→OpenAI→Claude→Perplexity 폴백 체인)
      const promptEl = document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"] .prompt-text`) as HTMLElement | null;
      if (promptEl) {
        promptEl.textContent = '🔄 AI 프롬프트 생성 중...';
      }
      generateEnglishPromptForHeading(String(headingTitle || '').trim()).then((autoPrompt: string) => {
        try {
          const hp = (window as any)._headingPrompts || [];
          hp[headingIndex] = autoPrompt;
          (window as any)._headingPrompts = hp;
        } catch (e) {
          console.warn('[headingImageGen] catch ignored:', e);
        }
        if (promptEl) {
          promptEl.textContent = autoPrompt;
        }
        console.log(`[HeadingImageGen] ✅ AI 프롬프트 초기화 완료: "${headingTitle}" → "${autoPrompt.substring(0, 50)}..."`);
      });
      toastManager.success('영어 프롬프트를 자동 생성값으로 초기화했습니다.');
      return;
    }

    // ✅ 2-0. 이미지가 있는 소제목 - 폴더에서 이미지 선택 버튼
    if (target.classList.contains('select-folder-image-btn') || target.closest('.select-folder-image-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('select-folder-image-btn') ? target : target.closest('.select-folder-image-btn') as HTMLElement;
      const headingIndex = parseInt(btn?.dataset.headingIndex || btn?.dataset.imageIndex || '0');
      const headingTitle = btn?.dataset.headingTitle || btn?.dataset.heading || getHeadingTitleByIndex(headingIndex);

      // ✅ 저장된 이미지에서 선택하는 모달 표시
      if (headingTitle) {
        selectLocalImageForHeading(headingIndex, headingTitle);
      } else {
        showSavedImagesForReplace(headingIndex);
      }
      return;
    }

    // ✅ 2-1. 빈 소제목 - 저장된 이미지에서 선택 버튼 (📁 폴더)
    if (target.classList.contains('select-local-image-btn') || target.closest('.select-local-image-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('select-local-image-btn') ? target : target.closest('.select-local-image-btn') as HTMLElement;
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');

      // ✅ 저장된 이미지에서 선택하는 모달 표시 (이미지 변경하기)
      showSavedImagesForReplace(headingIndex);
      return;
    }

    // ✅ 2-2. 빈 소제목 - 단일 이미지 생성 버튼
    if (target.classList.contains('regenerate-single-image-btn') || target.closest('.regenerate-single-image-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('regenerate-single-image-btn') ? target : target.closest('.regenerate-single-image-btn') as HTMLElement;
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');
      // ✅ 글로벌 배열에서 제목과 프롬프트 가져오기
      const headingTitle = String(
        (window as any)._headingTitles?.[headingIndex] ||
        // ✅ [2026-03-16 FIX] data-heading-title 우선 사용 (배지 오염 방지)
        (document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"]`) as HTMLElement | null)?.getAttribute('data-heading-title')?.trim() ||
        (document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"] .heading-title-pure`) as HTMLElement | null)?.textContent?.trim() ||
        getHeadingTitleByIndex(headingIndex) ||
        ''
      ).trim();
      const headingPrompts = (window as any)._headingPrompts || [];
      let prompt = String(headingPrompts[headingIndex] || '').trim();
      if (!prompt) {
        prompt = String(
          (document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"] .prompt-text`) as HTMLElement | null)?.textContent || ''
        ).trim();
      }

      if (!prompt) {
        toastManager.warning('해당 소제목의 영어 프롬프트가 없습니다. 먼저 프롬프트를 생성해주세요.');
        return;
      }

      if (!headingTitle) {
        toastManager.warning('소제목 제목을 찾을 수 없습니다. 먼저 소제목 분석/생성을 다시 실행해주세요.');
        return;
      }

      regenerateSingleImage(headingTitle, prompt);
      return;
    }

    if (target.classList.contains('undo-skip-btn') || target.closest('.undo-skip-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('undo-skip-btn') ? target : (target.closest('.undo-skip-btn') as HTMLElement);
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');
      const headingTitle = (window as any)._headingTitles?.[headingIndex] || getHeadingTitleByIndex(headingIndex);
      undoSkipHeadingImage(headingIndex, String(headingTitle || '').trim());
      return;
    }

    // ✅ 2-3. 빈 소제목 - 이미지 건너뛰기 버튼
    if (target.classList.contains('skip-heading-image-btn') || target.closest('.skip-heading-image-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('skip-heading-image-btn') ? target : target.closest('.skip-heading-image-btn') as HTMLElement;
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');
      // ✅ 글로벌 배열에서 제목 가져오기
      const headingTitle = (window as any)._headingTitles?.[headingIndex] || '';

      skipHeadingImage(headingIndex, headingTitle);
      return;
    }

    // ✅ 2-4. 여러 이미지 추가 버튼
    if (target.classList.contains('add-multiple-images-btn') || target.closest('.add-multiple-images-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('add-multiple-images-btn') ? target : target.closest('.add-multiple-images-btn') as HTMLElement;
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');
      // ✅ 글로벌 배열에서 제목 가져오기
      const headingTitle = String(
        (window as any)._headingTitles?.[headingIndex] ||
        // ✅ [2026-03-16 FIX] data-heading-title 우선 사용 (배지 오염 방지)
        (document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"]`) as HTMLElement | null)?.getAttribute('data-heading-title')?.trim() ||
        (document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"] .heading-title-pure`) as HTMLElement | null)?.textContent?.trim() ||
        getHeadingTitleByIndex(headingIndex) ||
        ''
      ).trim();

      if (!headingTitle) {
        toastManager.warning('소제목 제목을 찾을 수 없습니다. 먼저 소제목 분석/생성을 다시 실행해주세요.');
        return;
      }

      addMultipleImagesToHeading(headingIndex, headingTitle);
      return;
    }

    // ✅ 2-5. 전체 이미지 삭제 버튼
    if (target.classList.contains('clear-heading-images-btn') || target.closest('.clear-heading-images-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('clear-heading-images-btn') ? target : target.closest('.clear-heading-images-btn') as HTMLElement;
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');
      // ✅ 글로벌 배열에서 제목 가져오기
      const headingTitle = (window as any)._headingTitles?.[headingIndex] || '';

      if (confirm(`"${headingTitle}" 소제목의 모든 이미지를 삭제하시겠습니까?`)) {
        clearHeadingImages(headingIndex, headingTitle);
      }
      return;
    }

    // ✅ 2-6. 개별 이미지 제거 버튼 (이미지 그리드 내)
    if (target.classList.contains('remove-single-grid-image-btn') || target.closest('.remove-single-grid-image-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('remove-single-grid-image-btn') ? target : target.closest('.remove-single-grid-image-btn') as HTMLElement;
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');
      const imageIndex = parseInt(btn?.dataset.imageIndex || '0');
      const gridItem = btn.closest('.grid-image-item') as HTMLElement | null;
      const headingTitle = String(gridItem?.dataset.headingTitle || btn?.dataset.headingTitle || '').trim();
      const imageKey = String(btn?.dataset.imageKey || gridItem?.dataset.imageKey || '').trim();

      removeSingleImageFromHeading(headingIndex, imageIndex, headingTitle, imageKey);
      return;
    }

    // 3. 생성된 이미지 미리보기 - 이미지 제거 버튼
    if (target.classList.contains('remove-generated-image-btn') || target.closest('.remove-generated-image-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('remove-generated-image-btn')
        ? target
        : (target.closest('.remove-generated-image-btn') as HTMLElement);
      const headingTitle = btn?.dataset.headingTitle;
      if (headingTitle) {
        if (confirm(`"${headingTitle}" 소제목의 이미지를 제거하시겠습니까?`)) {
          ImageManager.removeImage(headingTitle);
          try {
            (window as any).imageManagementGeneratedImages = ImageManager.getAllImages();
          } catch (e) {
            console.warn('[headingImageGen] catch ignored:', e);
          }
          try {
            syncGlobalImagesFromImageManager();
          } catch (e) {
            console.warn('[headingImageGen] catch ignored:', e);
          }
          toastManager.success(`✅ "${headingTitle}" 이미지 제거 완료!`);
        }
      }
      return;
    }

    // ✅ 2-7. 소제목별 AI 영상 생성 버튼
    if (target.classList.contains('generate-heading-video-btn') || target.closest('.generate-heading-video-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const btn = target.classList.contains('generate-heading-video-btn') ? target : (target.closest('.generate-heading-video-btn') as HTMLElement);
      const headingIndex = parseInt(btn?.dataset.headingIndex || '0');
      const headingTitle = (window as any)._headingTitles?.[headingIndex] || getHeadingTitleByIndex(headingIndex);
      generateHeadingVideoForPrompt(headingIndex, headingTitle);
      return;
    }
  });
}

// 단일 이미지 재생성
async function regenerateSingleImage(headingTitle: string, prompt: string): Promise<void> {
  try {
    const resolvedHeadingTitle = String(headingTitle || '').trim();
    if (!resolvedHeadingTitle) {
      toastManager.warning('소제목 제목을 찾을 수 없습니다. 먼저 소제목 분석/생성을 다시 실행해주세요.');
      return;
    }

    const resolvedHeadingKey = (() => {
      try {
        return ImageManager.resolveHeadingKey(resolvedHeadingTitle);
      } catch {
        return resolvedHeadingTitle;
      }
    })();

    const selectedKey = (() => {
      try {
        return String(getHeadingSelectedImageKey(resolvedHeadingKey) || '').trim();
      } catch {
        return '';
      }
    })();

    const headingIndex = (() => {
      try {
        const hs = (ImageManager as any)?.headings;
        const list = Array.isArray(hs) ? hs : [];
        const idx = list.findIndex((h: any) => {
          const t = typeof h === 'string' ? String(h || '').trim() : String(h?.title || h || '').trim();
          return t === resolvedHeadingTitle;
        });
        if (idx >= 0) return idx;
      } catch (e) {
        console.warn('[headingImageGen] catch ignored:', e);
      }
      try {
        const titles = (window as any)._headingTitles;
        if (Array.isArray(titles)) {
          const idx = titles.findIndex((t: any) => String(t || '').trim() === resolvedHeadingTitle);
          if (idx >= 0) return idx;
        }
      } catch (e) {
        console.warn('[headingImageGen] catch ignored:', e);
      }
      return -1;
    })();

    toastManager.info(`🔄 "${resolvedHeadingTitle}" 이미지 재생성 중...`);

    const selectedSourceBtn = document.querySelector('.image-source-btn.selected') as HTMLButtonElement | null;
    const selectedSource = String(selectedSourceBtn?.dataset.source || '').trim();
    const provider = (selectedSource && selectedSource !== 'saved') ? selectedSource : 'nano-banana-pro';

    if (selectedSource === 'saved') {
      toastManager.warning('저장된 이미지는 생성할 수 없습니다. 다른 이미지 소스를 선택해주세요.');
      return;
    }

    const safePrompt = String(prompt || '').trim() || resolvedHeadingTitle;
    if (!safePrompt) {
      toastManager.warning('이미지 프롬프트가 비어있습니다. 먼저 프롬프트를 생성해주세요.');
      return;
    }

    const result = await (window as any).api.generateImages({
      provider,
      items: [{ heading: resolvedHeadingTitle, prompt: safePrompt }],
      regenerate: true,
      postId: currentPostId || undefined,
    });

    if (result.success && result.images && result.images.length > 0) {
      const newImage = result.images[0];

      const newImageObj: any = {
        heading: resolvedHeadingTitle,
        filePath: newImage.filePath,
        previewDataUrl: newImage.previewDataUrl,
        provider: newImage.provider,
        url: newImage.url || newImage.filePath,
        prompt,
        ...(headingIndex >= 0 ? { headingIndex } : {}),
        timestamp: Date.now(),
      };

      // ✅ [2026-03-16 FIX] 재생성 시 해당 소제목의 기존 이미지를 모두 제거하고 새 이미지로 완전 교체
      // 이전: selectedKey/대표(0번)만 교체 → 나머지 예비/추가 이미지가 남아 공존하는 문제
      ImageManager.imageMap.set(resolvedHeadingKey, [{ ...newImageObj, heading: resolvedHeadingKey }]);
      ImageManager.unsetHeadings.delete(resolvedHeadingKey);
      try {
        ImageManager.syncGeneratedImagesArray();
      } catch (e) {
        console.warn('[headingImageGen] catch ignored:', e);
      }
      try {
        ImageManager.syncAllPreviews();
      } catch (e) {
        console.warn('[headingImageGen] catch ignored:', e);
      }
      const newKey = String(getStableImageKey(newImageObj) || '').trim();
      if (newKey) {
        try {
          setHeadingSelectedImageKey(resolvedHeadingKey, newKey);
        } catch (e) {
          console.warn('[headingImageGen] catch ignored:', e);
        }
      }

      // ✅ [2026-02-12 P3 FIX #15] 중복 할당 제거 — syncGlobal이 처리
      try {
        syncGlobalImagesFromImageManager();
      } catch (e) {
        console.warn('[headingImageGen] catch ignored:', e);
      }

      try {
        const allImagesAfter = ImageManager.getAllImages();
        displayGeneratedImages(allImagesAfter);
        updatePromptItemsWithImages(allImagesAfter);
      } catch (e) {
        console.warn('[headingImageGen] catch ignored:', e);
      }

      toastManager.success(`✅ "${resolvedHeadingTitle}" 이미지 재생성 완료!`);
    } else {
      throw new Error(result.message || '이미지 생성 실패');
    }
  } catch (error) {
    console.error('[ImageManager] 이미지 재생성 실패:', error);
    toastManager.error(`❌ 이미지 재생성 실패: ${(error as Error).message}`);
  }
}

// ✅ 빈 소제목에 로컬 이미지 선택 (폴더에서 불러오기 UI와 동일하게 변경)
async function selectLocalImageForHeading(headingIndex: number, headingTitle: string): Promise<void> {
  try {
    // ✅ 저장된 이미지 폴더 목록을 먼저 표시 (폴더에서 불러오기와 동일한 UI)
    let basePath = '';
    try {
      basePath = await getRequiredImageBasePath();
    } catch {
      basePath = '';
    }

    if (basePath) {
      const dirEntries = await window.api.readDirWithStats?.(basePath);
      const folders = dirEntries?.filter((entry: any) => entry.isDirectory) || [];

      if (folders.length > 0) {
        // 저장된 폴더가 있으면 폴더 선택 모달 표시
        showFolderSelectionForHeading(headingIndex, headingTitle, basePath, folders);
        return;
      }
    }

    // 저장된 폴더가 없으면 기존 파일 선택 다이얼로그 사용
    const result = await window.api.selectLocalImageFile();

    // ✅ 안전한 HTML 이스케이프
    const safeTitle = escapeHtml(headingTitle);

    if (result.success && result.filePath) {
      const imageUrl = result.previewDataUrl || result.filePath || '';
      // 이미지 미리보기 업데이트
      const promptItem = document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"]`);
      if (promptItem) {
        const imageContainer = promptItem.querySelector('.generated-image');
        if (imageContainer) {
          imageContainer.innerHTML = `
            <img src="${imageUrl}" 
                 style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 fill=%22%23999%22%3E로드 실패%3C/text%3E%3C/svg%3E'">
            <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 0.5rem; background: linear-gradient(transparent, rgba(0,0,0,0.8)); display: flex; gap: 0.5rem; justify-content: center;">
              <button type="button" class="select-local-image-btn" data-heading-index="${headingIndex}" style="padding: 0.25rem 0.5rem; background: #8b5cf6; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">📁</button>
              <button type="button" class="regenerate-single-image-btn" data-heading-index="${headingIndex}" style="padding: 0.25rem 0.5rem; background: #3b82f6; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">🔄</button>
              <button type="button" class="remove-heading-image-btn" data-heading-index="${headingIndex}" style="padding: 0.25rem 0.5rem; background: #ef4444; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">🗑️</button>
            </div>
          `;
          (imageContainer as HTMLElement).style.position = 'relative';

          ensurePromptCardRemoveButtons();
          ensurePromptCardRemoveHandler();
        }
      }

      // ImageManager에 등록
      ImageManager.setImage(headingTitle, {
        heading: headingTitle,
        filePath: result.filePath,
        previewDataUrl: result.previewDataUrl || result.filePath,
        provider: 'local',
        url: result.filePath
      });

      try {
        (window as any).imageManagementGeneratedImages = ImageManager.getAllImages();
      } catch (e) {
        console.warn('[headingImageGen] catch ignored:', e);
      }
      syncGlobalImagesFromImageManager();
      try {
        updatePromptItemsWithImages((window as any).imageManagementGeneratedImages || []);
      } catch (e) {
        console.warn('[headingImageGen] catch ignored:', e);
      }

      appendLog(`✅ "${headingTitle}" 소제목에 로컬 이미지 배치 완료`, 'images-log-output');
      toastManager.success(`✅ 로컬 이미지 배치 완료!`);
    }
  } catch (error) {
    console.error('[Image] 로컬 이미지 선택 실패:', error);
    toastManager.error(`❌ 이미지 선택 실패: ${(error as Error).message}`);
  }
}

// ✅ 소제목용 폴더 선택 모달 (메인 폴더 선택과 동일한 리스트형 UI)
async function showFolderSelectionForHeading(
  headingIndex: number,
  headingTitle: string,
  basePath: string,
  folders: any[],
  mode: 'single' | 'multi' = 'single',
): Promise<void> {
  // 기존 모달 제거
  const existingModal = document.getElementById('folder-selection-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'folder-selection-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); z-index: 10001;
    display: flex; align-items: center; justify-content: center;
  `;

  const safeHeadingTitle = escapeHtml(headingTitle);

  const sortedFolders = [...folders].sort((a: any, b: any) => {
    const at = Number(a?.mtime || 0);
    const bt = Number(b?.mtime || 0);
    return bt - at;
  });

  const renderFolderItem = (folder: any) => {
    const name = String(folder?.name || '').trim();
    const date = folder?.mtime ? new Date(folder.mtime) : null;
    const dateLabel = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
    const titleLabel = name.replace(/^\d{4}-\d{2}-\d{2}_?/, '').trim() || name;
    return `
      <button type="button" class="folder-item" data-folder-name="${escapeHtml(name)}" style="width: 100%; padding: 0.9rem 1rem; background: linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary)); border: 2px solid var(--border-light); border-radius: 12px; cursor: pointer; transition: all 0.2s; text-align: left; display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-size: 1.5rem; line-height: 1;">📂</span>
        <div style="min-width:0; flex: 1;">
          <div style="display:flex; align-items:center; gap: 0.5rem;">
            ${dateLabel ? `<span style="background: rgba(99, 102, 241, 0.2); color: var(--primary); padding: 2px 6px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; white-space: nowrap;">${dateLabel}</span>` : ''}
            <span style="color: var(--text-strong); font-weight: 800; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(titleLabel)}</span>
          </div>
          <div style="margin-top: 0.25rem; color: var(--text-muted); font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(name)}</div>
        </div>
        <span style="color: var(--text-muted); font-weight: 900;">→</span>
      </button>
    `;
  };

  modal.innerHTML = `
    <div style="background: var(--bg-primary); border-radius: 16px; padding: 2rem; max-width: 900px; width: 90%; max-height: 85vh; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5); position: relative; display: flex; flex-direction: column;">
      <button id="close-folder-modal" style="position: absolute; top: 1rem; right: 1rem; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s; z-index: 1;" onmouseover="this.style.background='rgba(220, 38, 38, 1)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)';">✕</button>
      <h2 style="margin: 0 0 1rem 0; color: var(--text-gold); font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 1.75rem;">📁</span>
        <span>"${safeHeadingTitle}" 소제목에 배치할 이미지 폴더 선택</span>
        <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 400; margin-left: auto;">⬇️ 최신순</span>
      </h2>

      <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; align-items: center;">
        <div style="flex: 1; position: relative;">
          <input type="text" id="heading-folder-search-input" placeholder="폴더명 검색 (예: 바디프랜드, 2025-12-05)" style="width: 100%; padding: 0.6rem 0.75rem 0.6rem 2.25rem; background: var(--bg-tertiary); border: 2px solid var(--border-light); border-radius: 8px; color: var(--text-strong); font-size: 0.9rem;"/>
          <span style="position: absolute; left: 0.6rem; top: 50%; transform: translateY(-50%); font-size: 1rem;">🔍</span>
        </div>
        <span id="heading-folder-count-label" style="color: var(--text-muted); font-size: 0.8rem; white-space: nowrap;">${sortedFolders.length}개</span>
      </div>

      <div id="heading-folder-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; padding: 0.25rem;">
        ${sortedFolders.map((f: any) => renderFolderItem(f)).join('')}
      </div>

      <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--border-light); display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
        <button id="select-file-directly" style="padding: 0.6rem 1.25rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">📄 파일에서 직접 선택</button>
        <button id="cancel-folder-modal" style="padding: 0.6rem 1.25rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">닫기</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 닫기 및 바깥 클릭
  modal.querySelector('#close-folder-modal')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#cancel-folder-modal')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // 검색
  const searchInput = modal.querySelector('#heading-folder-search-input') as HTMLInputElement | null;
  const listEl = modal.querySelector('#heading-folder-list') as HTMLDivElement | null;
  const countEl = modal.querySelector('#heading-folder-count-label') as HTMLSpanElement | null;

  const applySearch = () => {
    if (!searchInput || !listEl || !countEl) return;
    const q = searchInput.value.toLowerCase().trim();
    const filtered = q === ''
      ? sortedFolders
      : sortedFolders.filter((f: any) => String(f?.name || '').toLowerCase().includes(q));
    listEl.innerHTML = filtered.map((f: any) => renderFolderItem(f)).join('');
    countEl.textContent = `${filtered.length}개`;
    attachFolderClickEvents();
  };

  const attachFolderClickEvents = () => {
    listEl?.querySelectorAll('.folder-item').forEach((item) => {
      item.addEventListener('click', async () => {
        const folderName = (item as HTMLElement).dataset.folderName || '';
        if (!folderName) return;
        modal.remove();
        const folderPath = `${basePath}/${folderName}`;
        const folderImages = await loadImagesFromFolderForHeading(folderPath);
        if (folderImages.length > 0) {
          if (mode === 'multi') {
            showMultipleImageSelectionModal(
              headingIndex,
              headingTitle,
              folderImages.map((img) => String(img.filePath || '')),
            );
          } else {
            showImageSelectionForHeading(headingIndex, headingTitle, folderImages, folderName);
          }
        } else {
          toastManager.error('이 폴더에서 이미지를 찾을 수 없습니다.');
        }
      });
    });
  };

  searchInput?.addEventListener('input', applySearch);
  attachFolderClickEvents();

  // 파일에서 직접 선택
  modal.querySelector('#select-file-directly')?.addEventListener('click', async () => {
    modal.remove();
    if (mode === 'multi' && typeof (window.api as any)?.showOpenDialog === 'function') {
      const pick = await (window.api as any).showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
      });
      const paths = Array.isArray(pick?.filePaths) ? pick.filePaths : [];
      if (!pick?.canceled && paths.length > 0) {
        addImagesToHeadingGrid(headingIndex, headingTitle, paths);
        appendLog(`✅ "${headingTitle}" 소제목에 ${paths.length}개 이미지 추가됨`, 'images-log-output');
        toastManager.success(`✅ ${paths.length}개 이미지 추가 완료!`);
      }
      return;
    }

    const result = await window.api.selectLocalImageFile();
    if (result.success && result.filePath) {
      applyImageToHeadingFromFolder(headingIndex, headingTitle, result.filePath, result.previewDataUrl || result.filePath);
    }
  });

  // 기존 hover 효과는 CSS 대신 item 스타일 자체에 남긴 상태 (리스트형에서도 자연스럽게 보임)
}

// ✅ 소제목용 폴더 내 이미지 로드
async function loadImagesFromFolderForHeading(folderPath: string): Promise<any[]> {
  try {
    const files = await window.api.readDirWithStats?.(folderPath);
    if (!files) return [];

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const imageFiles = files.filter((file: any) =>
      !file.isDirectory &&
      imageExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    );

    return imageFiles.map((file: any) => ({
      filePath: `${folderPath}/${file.name}`,
      name: file.name,
      previewDataUrl: `file:///${folderPath.replace(/\\/g, '/')}/${file.name}`
    }));
  } catch (error) {
    console.error('폴더 이미지 로드 실패:', error);
    return [];
  }
}

// ✅ 소제목용 이미지 선택 모달 (폴더 내 이미지 표시)
function showImageSelectionForHeading(headingIndex: number, headingTitle: string, images: any[], folderName: string): void {
  const existingModal = document.getElementById('image-selection-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'image-selection-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); z-index: 10002;
    display: flex; align-items: center; justify-content: center;
  `;

  const safeHeadingTitle = escapeHtml(headingTitle);
  const safeFolderName = escapeHtml(folderName);

  const selectedImages: Set<string> = new Set();

  modal.innerHTML = `
    <div style="background: var(--bg-primary); border-radius: 16px; padding: 2rem; max-width: 900px; width: 90%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h2 style="margin: 0; color: var(--text-strong);">
          🖼️ "${safeHeadingTitle}" 소제목에 추가할 이미지 선택
        </h2>
        <button id="close-img-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>
      <p style="color: var(--text-muted); margin-bottom: 1rem;">📁 ${safeFolderName} (${images.length}개 이미지) - 여러 개 선택 가능</p>
      
      <div id="images-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; max-height: 50vh; overflow-y: auto; padding: 0.5rem;">
        ${images.map((img, i) => `
          <div class="img-item" data-img-path="${escapeHtml(img.filePath)}" style="
            position: relative;
            aspect-ratio: 1;
            border-radius: 8px;
            overflow: hidden;
            border: 3px solid transparent;
            cursor: pointer;
            transition: all 0.2s;
          ">
            <img src="${img.previewDataUrl}" style="width: 100%; height: 100%; object-fit: cover;" 
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3C/svg%3E'">
            <div class="check-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(59, 130, 246, 0.5); display: none; align-items: center; justify-content: center;">
              <span style="font-size: 2rem;">✅</span>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span id="selected-count" style="color: var(--text-muted);">0개 선택됨</span>
        <div style="display: flex; gap: 0.75rem;">
          <button id="cancel-img-modal" style="padding: 0.75rem 1.5rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer;">취소</button>
          <button id="confirm-img-modal" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">선택 완료</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 이벤트 핸들러
  modal.querySelector('#close-img-modal')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#cancel-img-modal')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // 이미지 선택 토글
  modal.querySelectorAll('.img-item').forEach(item => {
    item.addEventListener('click', () => {
      const imgPath = (item as HTMLElement).dataset.imgPath || '';
      const overlay = item.querySelector('.check-overlay') as HTMLElement;

      if (selectedImages.has(imgPath)) {
        selectedImages.delete(imgPath);
        (item as HTMLElement).style.borderColor = 'transparent';
        if (overlay) overlay.style.display = 'none';
      } else {
        selectedImages.add(imgPath);
        (item as HTMLElement).style.borderColor = '#3b82f6';
        if (overlay) overlay.style.display = 'flex';
      }

      const countEl = modal.querySelector('#selected-count');
      if (countEl) countEl.textContent = `${selectedImages.size}개 선택됨`;
    });
  });

  // 확인 버튼
  modal.querySelector('#confirm-img-modal')?.addEventListener('click', () => {
    if (selectedImages.size === 0) {
      alert('이미지를 선택해주세요.');
      return;
    }

    const imagesArray = Array.from(selectedImages);
    modal.remove();

    // 선택된 이미지들을 소제목에 추가
    addImagesToHeadingGrid(headingIndex, headingTitle, imagesArray);

    appendLog(`✅ "${headingTitle}" 소제목에 ${imagesArray.length}개 이미지 추가됨`, 'images-log-output');
    toastManager.success(`✅ ${imagesArray.length}개 이미지 추가 완료!`);
  });
}

// ✅ 이미지를 소제목에 적용 (단일 이미지용 - 폴더 선택 모달용)
function applyImageToHeadingFromFolder(headingIndex: number, headingTitle: string, filePath: string, previewUrl: string): void {
  const safeTitle = escapeHtml(headingTitle);

  const promptItem = document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"]`);
  if (promptItem) {
    const container = promptItem.querySelector('.generated-images-container');
    if (container) {
      let grid = container.querySelector('.images-grid') as HTMLElement;
      const placeholder = container.querySelector('.no-image-placeholder') as HTMLElement;
      const generatedImagePlaceholder = container.querySelector('.generated-image') as HTMLElement;

      if (!grid) {
        grid = document.createElement('div');
        grid.className = 'images-grid';
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.5rem; margin-bottom: 0.75rem;';
        container.insertBefore(grid, container.firstChild);
      }

      if (placeholder) placeholder.style.display = 'none';
      // ✅ [2026-03-10 FIX] .generated-image를 선택된 이미지의 큰 미리보기로 업데이트
      if (generatedImagePlaceholder) {
        const previewSrc = previewUrl || `file:///${filePath.replace(/\\/g, '/')}`;
        generatedImagePlaceholder.innerHTML = `
          <img src="${previewSrc}" 
               style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;"
               onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 fill=%22%23999%22%3E로드 실패%3C/text%3E%3C/svg%3E'">
        `;
        generatedImagePlaceholder.style.position = 'relative';
      }

      const existingImages = grid.querySelectorAll('.grid-image-item')?.length || 0;
      const imageKey = toFileUrlMaybe(`file:///${String(filePath || '').replace(/\\/g, '/')}`);
      const imgItem = document.createElement('div');
      imgItem.className = 'grid-image-item';
      if (imageKey) imgItem.setAttribute('data-image-key', String(imageKey));
      imgItem.setAttribute('data-heading-index', String(headingIndex));
      imgItem.setAttribute('data-heading-title', String(headingTitle || ''));
      imgItem.style.cssText = 'position: relative; aspect-ratio: 1; border-radius: 6px; overflow: hidden;';
      imgItem.innerHTML = `
        <img src="file:///${filePath.replace(/\\/g, '/')}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3C/svg%3E'">
        <button type="button" class="remove-single-grid-image-btn" data-heading-index="${headingIndex}" data-image-index="${existingImages}" data-heading-title="${safeTitle}" data-image-key="${escapeHtml(String(imageKey || ''))}" style="position: absolute; top: 4px; right: 4px; background: rgba(239,68,68,0.9); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 0.8rem;">✕</button>
      `;
      grid.appendChild(imgItem);
    }
  }

  // ImageManager에 추가
  ImageManager.addImage(headingTitle, {
    heading: headingTitle,
    filePath: filePath,
    url: `file:///${filePath.replace(/\\/g, '/')}`,
    previewDataUrl: previewUrl,
    provider: 'local',
    savedToLocal: true,
    headingIndex: headingIndex
  });

  // ✅ [2026-02-12 P1 FIX #3] 직접 할당 → syncGlobalImagesFromImageManager
  try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }

  appendLog(`✅ "${headingTitle}" 소제목에 이미지 추가됨`, 'images-log-output');
  toastManager.success(`✅ 이미지 추가 완료!`);
}

// ✅ 빈 소제목에 이미지 생성
async function regenerateSingleImageForHeading(headingIndex: number, headingTitle: string, prompt: string): Promise<void> {
  try {
    const resolvedHeadingTitle = String(headingTitle || '').trim() || getHeadingTitleByIndex(headingIndex) || `소제목 ${headingIndex + 1}`;
    toastManager.info(`🔄 "${resolvedHeadingTitle}" 이미지 생성 중...`);

    // ✅ [2026-02-02 FIX] 드롭다운 값 우선 사용
    const selectedSource = document.querySelector('.image-source-btn.selected') as HTMLButtonElement;
    const dropdownSource = (document.getElementById('image-source-select') as HTMLSelectElement)?.value;
    const imageSource = dropdownSource || selectedSource?.dataset.source || 'nano-banana-pro';
    console.log(`[ImageGeneration] 개별 이미지 소스: ${imageSource}`);

    // ✅ 블로그 제목 가져오기 (썸네일용)
    const blogTitle = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value?.trim() ||
      (document.getElementById('unified-title') as HTMLInputElement)?.value?.trim() ||
      (document.getElementById('image-title') as HTMLInputElement)?.value?.trim() || '';

    // ✅ 인덱스 기반 프롬프트 생성 (1번=썸네일, 2번부터=NEVER TEXT)
    const finalPrompt = generateImagePromptByIndex(resolvedHeadingTitle, headingIndex, blogTitle);

    appendLog(`🎨 "${resolvedHeadingTitle}" 이미지 생성 시작 (${imageSource}, ${headingIndex === 0 ? '썸네일' : 'NEVER TEXT'})...`, 'images-log-output');

    let imageUrl: string;

    // ✅ [2026-03-11 FIX] 모든 엔진에서 텍스트 포함 허용 (nano-banana: AI 직접 렌더링, 기타: Sharp 후처리)
    const thumbnailTextChecked = (document.getElementById('thumbnail-text-option') as HTMLInputElement)?.checked ?? false;
    const allowTextForRegen = headingIndex === 0 && thumbnailTextChecked;

    if (imageSource === 'pollinations' || imageSource === 'nano-banana-pro') {
      imageUrl = await generateNanoBananaProImage(finalPrompt);
    } else if (imageSource === 'prodia') {
      const imageResult = await generateImagesWithCostSafety({
        provider: 'prodia',
        items: [{ heading: resolvedHeadingTitle, prompt: finalPrompt }],
        postTitle: blogTitle,
        isFullAuto: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Prodia 이미지 생성 실패');
      }
    } else if (imageSource === 'stability') {
      const stabilityModel = (document.getElementById('stability-model-select') as HTMLSelectElement)?.value || 'ultra';
      const imageResult = await generateImagesWithCostSafety({
        provider: 'stability',
        items: [{ heading: resolvedHeadingTitle, prompt: finalPrompt }],
        postTitle: blogTitle,
        isFullAuto: true,
        model: stabilityModel
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Stability AI 이미지 생성 실패');
      }
    } else if (imageSource === 'falai') {
      // ✅ Fal.ai: 전용 파라미터와 함께 호출
      const imageResult = await generateImagesWithCostSafety({
        provider: 'falai',
        items: [{ heading: resolvedHeadingTitle, prompt: finalPrompt }],
        postTitle: blogTitle,
        isFullAuto: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Fal.ai 이미지 생성 실패');
      }
    } else if (imageSource === 'leonardoai') {
      // ✅ [2026-02-23] Leonardo AI: 개별 재생성 핸들러 추가
      const imageResult = await generateImagesWithCostSafety({
        provider: 'leonardoai',
        items: [{ heading: resolvedHeadingTitle, prompt: finalPrompt, isThumbnail: headingIndex === 0, allowText: allowTextForRegen }],
        postTitle: blogTitle,
        isFullAuto: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'Leonardo AI 이미지 생성 실패');
      }
    } else if (imageSource === 'openai-image') {
      // ✅ [2026-02-23] OpenAI DALL-E: 개별 재생성 핸들러 추가
      const imageResult = await generateImagesWithCostSafety({
        provider: 'openai-image',
        items: [{ heading: resolvedHeadingTitle, prompt: finalPrompt, isThumbnail: headingIndex === 0, allowText: allowTextForRegen }],
        postTitle: blogTitle,
        isFullAuto: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'DALL-E 이미지 생성 실패');
      }
    } else if (imageSource === 'imagefx') {
      // ✅ [2026-03-16] ImageFX 전용 분기 (Google 무료, Gemini API 키 불필요)
      console.log(`[ImageGen] ✨ ImageFX (Google 무료) 개별 재생성`);
      const imageResult = await generateImagesWithCostSafety({
        provider: 'imagefx',
        items: [{ heading: resolvedHeadingTitle, prompt: finalPrompt, isThumbnail: headingIndex === 0, allowText: allowTextForRegen }],
        postTitle: blogTitle,
        isFullAuto: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || 'ImageFX 이미지 생성 실패. Google 로그인 상태를 확인해주세요.');
      }
    } else if (imageSource === 'naver-search' || imageSource === 'naver') {
      // ✅ 네이버 이미지 검색: 사용자가 명시적으로 선택한 경우에만 사용
      imageUrl = await searchNaverImage(finalPrompt);
    } else {
      // ✅ [2026-03-17 FIX] 기본값: 알 수 없는 이미지 소스는 nano-banana-pro(Gemini) 사용
      console.warn(`[ImageGen] 알 수 없는 이미지 소스 "${imageSource}", 나노 바나나 프로(Gemini)로 대체`);
      const imageResult = await generateImagesWithCostSafety({
        provider: 'nano-banana-pro',
        items: [{ heading: resolvedHeadingTitle, prompt: finalPrompt, isThumbnail: headingIndex === 0, allowText: allowTextForRegen }],
        postTitle: blogTitle,
        isFullAuto: true,
      });
      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        imageUrl = imageResult.images[0].previewDataUrl || imageResult.images[0].filePath;
      } else {
        throw new Error(imageResult.message || '기본 AI 이미지 생성 실패');
      }
    }

    // ✅ 안전한 HTML 이스케이프
    const safeTitle = escapeHtml(resolvedHeadingTitle);
    const safePrompt = escapeHtml(prompt);

    // 이미지 미리보기 업데이트
    const promptItem = document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"]`);
    if (promptItem) {
      const imageContainer = promptItem.querySelector('.generated-image');
      if (imageContainer) {
        imageContainer.innerHTML = `
          <img src="${imageUrl}" 
               style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;"
               onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 fill=%22%23999%22%3E로드 실패%3C/text%3E%3C/svg%3E'">
          <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 0.5rem; background: linear-gradient(transparent, rgba(0,0,0,0.8)); display: flex; gap: 0.5rem; justify-content: center;">
            <button type="button" class="select-local-image-btn" data-heading-index="${headingIndex}" style="padding: 0.25rem 0.5rem; background: #8b5cf6; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">📁</button>
            <button type="button" class="regenerate-single-image-btn" data-heading-index="${headingIndex}" style="padding: 0.25rem 0.5rem; background: #3b82f6; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">🔄</button>
            <button type="button" class="remove-heading-image-btn" data-heading-index="${headingIndex}" style="padding: 0.25rem 0.5rem; background: #ef4444; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">🗑️</button>
          </div>
        `;
        (imageContainer as HTMLElement).style.position = 'relative';
      }
    }

    // ImageManager에 등록
    ImageManager.setImage(resolvedHeadingTitle, {
      heading: resolvedHeadingTitle,
      filePath: imageUrl,
      previewDataUrl: imageUrl,
      provider: imageSource,
      url: imageUrl,
      prompt
    });

    // ✅ [2026-02-12 FIX] ImageManager→전역변수 통합 동기화 (기존 직접 조작 제거 → 일관성 보장)
    syncGlobalImagesFromImageManager();
    try { ImageManager.syncAllPreviews(); } catch { /* ignore */ }

    appendLog(`✅ "${resolvedHeadingTitle}" 이미지 생성 완료!`, 'images-log-output');
    toastManager.success(`✅ 이미지 생성 완료!`);
  } catch (error) {
    console.error('[Image] 이미지 생성 실패:', error);
    appendLog(`❌ "${String(headingTitle || '').trim() || `소제목 ${headingIndex + 1}`}" 이미지 생성 실패: ${(error as Error).message}`, 'images-log-output');
    toastManager.error(`❌ 이미지 생성 실패: ${(error as Error).message}`);
  }
}

// ✅ 소제목 이미지 건너뛰기
function skipHeadingImage(headingIndex: number, headingTitle: string): void {
  // ✅ 안전한 HTML 이스케이프
  const safeTitle = escapeHtml(headingTitle);

  const promptItem = document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"]`);
  if (promptItem) {
    const imageContainer = promptItem.querySelector('.generated-images-container') || promptItem.querySelector('.generated-image');
    if (imageContainer) {
      const placeholder = imageContainer.querySelector('.no-image-placeholder');
      if (placeholder) {
        (placeholder as HTMLElement).innerHTML = `
          <span style="color: var(--text-muted); font-size: 2rem;">⏭️</span>
          <span style="color: var(--text-muted); font-size: 0.85rem;">이미지 없이 진행</span>
          <button type="button" class="undo-skip-btn" data-heading-index="${headingIndex}" style="padding: 0.4rem 0.75rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 6px; font-size: 0.8rem; cursor: pointer;">
            ↩️ 되돌리기
          </button>
        `;
      }
    }
  }

  appendLog(`⏭️ "${headingTitle}" 소제목은 이미지 없이 진행됩니다.`, 'images-log-output');
}

function undoSkipHeadingImage(headingIndex: number, headingTitle: string): void {
  const promptItem = document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"]`);
  if (promptItem) {
    const imageContainer = promptItem.querySelector('.generated-images-container') || promptItem.querySelector('.generated-image');
    if (imageContainer) {
      const placeholder = imageContainer.querySelector('.no-image-placeholder');
      if (placeholder) {
        (placeholder as HTMLElement).innerHTML = `
          <span style="color: var(--text-muted); font-size: 2rem;">🖼️</span>
          <span style="color: var(--text-muted); font-size: 0.85rem;">이미지 없음</span>
        `;
      }
    }
  }

  appendLog(`↩️ "${headingTitle}" 소제목의 이미지 건너뛰기를 되돌렸습니다.`, 'images-log-output');
}

// ✅ 소제목에 여러 이미지 추가
async function addMultipleImagesToHeading(headingIndex: number, headingTitle: string): Promise<void> {
  try {
    let basePath = '';
    try {
      basePath = await getRequiredImageBasePath();
    } catch {
      basePath = '';
    }

    if (basePath) {
      const dirEntries = await window.api.readDirWithStats?.(basePath);
      const folders = dirEntries?.filter((entry: any) => entry.isDirectory) || [];
      if (folders.length > 0) {
        await showFolderSelectionForHeading(headingIndex, headingTitle, basePath, folders, 'multi');
        return;
      }
    }

    // 폴더가 없으면 OS 파일 선택창(다중 선택)으로 폴백
    if (typeof (window.api as any)?.showOpenDialog === 'function') {
      const pick = await (window.api as any).showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
      });
      const paths = Array.isArray(pick?.filePaths) ? pick.filePaths : [];
      if (!pick?.canceled && paths.length > 0) {
        addImagesToHeadingGrid(headingIndex, headingTitle, paths);
        appendLog(`✅ "${headingTitle}" 소제목에 ${paths.length}개 이미지 추가됨`, 'images-log-output');
        toastManager.success(`✅ ${paths.length}개 이미지 추가 완료!`);
        return;
      }
    }

    // 최종 폴백: 기존 단일 파일 선택
    selectLocalImageForHeading(headingIndex, headingTitle);

  } catch (error) {
    console.error('[AddMultipleImages] 오류:', error);
    // 폴더 선택 실패 시 기존 로컬 이미지 선택 기능 사용
    selectLocalImageForHeading(headingIndex, headingTitle);
  }
}

// ✅ 여러 이미지 선택 모달
function showMultipleImageSelectionModal(headingIndex: number, headingTitle: string, images: string[]): void {
  // 기존 모달 제거
  const existingModal = document.getElementById('multiple-image-selection-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'multiple-image-selection-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); z-index: 10001;
    display: flex; align-items: center; justify-content: center;
  `;

  const selectedImages: Set<string> = new Set();

  modal.innerHTML = `
    <div style="background: var(--bg-primary); border-radius: 12px; padding: 1.5rem; width: 90%; max-width: 800px; max-height: 80vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="margin: 0; color: var(--text-strong);">🖼️ "${headingTitle}" 소제목에 추가할 이미지 선택</h3>
        <button id="close-multi-img-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
          </div>
      <p style="color: var(--text-muted); margin-bottom: 1rem;">여러 이미지를 선택하면 소제목에 모두 추가됩니다.</p>
      <div id="multi-images-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.75rem; margin-bottom: 1rem;"></div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span id="selected-count" style="color: var(--text-muted);">0개 선택됨</span>
        <div style="display: flex; gap: 0.75rem;">
          <button id="cancel-multi-img" style="padding: 0.75rem 1.5rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer;">취소</button>
          <button id="confirm-multi-img" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">선택 완료</button>
        </div>
        </div>
      </div>
    `;

  document.body.appendChild(modal);

  // 이벤트 핸들러
  modal.querySelector('#close-multi-img-modal')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#cancel-multi-img')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // 이미지 선택 토글
  const gridEl = modal.querySelector('#multi-images-grid') as HTMLElement | null;
  const renderBatchSize = 36;
  let renderIndex = 0;
  const safeFallback = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3C/svg%3E";

  const attachItemHandlers = (item: HTMLElement) => {
    item.addEventListener('click', () => {
      const imgPath = item.getAttribute('data-img-path') || '';
      const overlay = item.querySelector('.check-overlay') as HTMLElement;

      if (selectedImages.has(imgPath)) {
        selectedImages.delete(imgPath);
        item.style.borderColor = 'transparent';
        if (overlay) overlay.style.display = 'none';
      } else {
        selectedImages.add(imgPath);
        item.style.borderColor = '#3b82f6';
        if (overlay) overlay.style.display = 'flex';
      }

      const countEl = modal.querySelector('#selected-count');
      if (countEl) countEl.textContent = `${selectedImages.size}개 선택됨`;
    });
  };

  const renderNextBatch = () => {
    if (!gridEl) return;
    const frag = document.createDocumentFragment();
    const end = Math.min(images.length, renderIndex + renderBatchSize);
    for (let i = renderIndex; i < end; i++) {
      const img = images[i];
      const item = document.createElement('div');
      item.className = 'multi-img-item';
      item.setAttribute('data-img-path', img);
      item.style.cssText = 'position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 3px solid transparent; cursor: pointer; transition: all 0.2s;';
      const src = `file:///${img.replace(/\\/g, '/')}`;
      item.innerHTML = `
        <img src="${src}" loading="lazy" decoding="async" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='${safeFallback}'">
        <div class="check-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(59, 130, 246, 0.5); display: none; align-items: center; justify-content: center;">
          <span style="font-size: 2rem;">✅</span>
        </div>
      `;
      attachItemHandlers(item);
      frag.appendChild(item);
    }
    gridEl.appendChild(frag);
    renderIndex = end;
    if (renderIndex < images.length) {
      requestAnimationFrame(renderNextBatch);
    }
  };

  requestAnimationFrame(renderNextBatch);

  // 확인 버튼
  modal.querySelector('#confirm-multi-img')?.addEventListener('click', async () => {
    if (selectedImages.size === 0) {
      alert('이미지를 선택해주세요.');
      return;
    }

    // 선택된 이미지들을 소제목에 추가
    const imagesArray = Array.from(selectedImages);
    addImagesToHeadingGrid(headingIndex, headingTitle, imagesArray);

    modal.remove();
    appendLog(`✅ "${headingTitle}" 소제목에 ${imagesArray.length}개 이미지 추가됨`, 'images-log-output');
    toastManager.success(`✅ ${imagesArray.length}개 이미지 추가 완료!`);
  });
}

// ✅ 소제목 이미지 그리드에 이미지 추가
function addImagesToHeadingGrid(headingIndex: number, headingTitle: string, imagePaths: string[]): void {
  // ✅ 안전한 HTML 이스케이프
  const safeTitle = escapeHtml(headingTitle);

  console.log(`[addImagesToHeadingGrid] headingIndex: ${headingIndex}, headingTitle: "${headingTitle}", imagePaths: ${imagePaths.length}개`);

  const promptItem = document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"]`);
  if (!promptItem) {
    console.warn(`[addImagesToHeadingGrid] promptItem을 찾을 수 없음: data-index="${headingIndex + 1}"`);
    return;
  }

  const container = promptItem.querySelector('.generated-images-container');
  if (!container) {
    console.warn(`[addImagesToHeadingGrid] container를 찾을 수 없음`);
    return;
  }

  let grid = container.querySelector('.images-grid') as HTMLElement;
  const placeholder = container.querySelector('.no-image-placeholder') as HTMLElement;
  const generatedImagePlaceholder = container.querySelector('.generated-image') as HTMLElement;

  // ✅ images-grid가 없으면 생성
  if (!grid) {
    console.log(`[addImagesToHeadingGrid] images-grid가 없어서 생성`);
    grid = document.createElement('div');
    grid.className = 'images-grid';
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.5rem; margin-bottom: 0.75rem;';
    container.insertBefore(grid, container.firstChild);
  }

  if (placeholder) placeholder.style.display = 'none';
  // ✅ [2026-03-10 FIX] .generated-image를 첫 번째 이미지의 큰 미리보기로 업데이트
  if (generatedImagePlaceholder && imagePaths.length > 0) {
    const firstImgSrc = `file:///${imagePaths[0].replace(/\\/g, '/')}`;
    generatedImagePlaceholder.innerHTML = `
      <img src="${firstImgSrc}" 
           style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;"
           onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 fill=%22%23999%22%3E로드 실패%3C/text%3E%3C/svg%3E'">
    `;
    generatedImagePlaceholder.style.position = 'relative';
  }

  // 기존 이미지 수 확인
  const existingImages = grid?.querySelectorAll('.grid-image-item')?.length || 0;

  imagePaths.forEach((imgPath, i) => {
    const imgIndex = existingImages + i;
    const imageKey = toFileUrlMaybe(`file:///${String(imgPath || '').replace(/\\/g, '/')}`);
    const imgItem = document.createElement('div');
    imgItem.className = 'grid-image-item';
    if (imageKey) imgItem.setAttribute('data-image-key', imageKey);
    imgItem.setAttribute('data-heading-index', String(headingIndex));
    imgItem.setAttribute('data-heading-title', String(headingTitle || ''));
    imgItem.style.cssText = 'position: relative; aspect-ratio: 1; border-radius: 6px; overflow: hidden; cursor: pointer; border: 2px solid transparent; transition: all 0.15s;';
    imgItem.innerHTML = `
      <img src="file:///${imgPath.replace(/\\/g, '/')}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3C/svg%3E'">
      <button type="button" class="remove-single-grid-image-btn" data-heading-index="${headingIndex}" data-image-index="${imgIndex}" data-heading-title="${safeTitle}" data-image-key="${escapeHtml(imageKey)}" style="position: absolute; top: 4px; right: 4px; background: rgba(239,68,68,0.9); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 0.8rem;">✕</button>
    `;
    grid?.appendChild(imgItem);

    console.log(`[addImagesToHeadingGrid] 이미지 추가됨: ${imgPath.substring(imgPath.length - 30)}`);

    // ✅ ImageManager에 추가 (setImage 대신 addImage 사용 - 여러 이미지 지원)
    ImageManager.addImage(headingTitle, {
      heading: headingTitle,
      filePath: imgPath,
      url: `file:///${imgPath.replace(/\\/g, '/')}`,
      previewDataUrl: `file:///${imgPath.replace(/\\/g, '/')}`,
      provider: 'local',
      savedToLocal: true,
      headingIndex: headingIndex,
      imageIndex: imgIndex
    });
  });

  try {
    (window as any).imageManagementGeneratedImages = ImageManager.getAllImages();
  } catch (e) {
    console.warn('[headingImageGen] catch ignored:', e);
  }
  syncGlobalImagesFromImageManager();
  console.log(`[addImagesToHeadingGrid] 완료: 총 ${ImageManager.getAllImages().length}개 이미지`);
}

// ✅ 소제목의 모든 이미지 삭제
function clearHeadingImages(headingIndex: number, headingTitle: string): void {
  const promptItem = document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"]`);
  if (!promptItem) return;

  const container = promptItem.querySelector('.generated-images-container');
  if (!container) return;

  const grid = container.querySelector('.images-grid') as HTMLElement;
  const placeholder = container.querySelector('.no-image-placeholder') as HTMLElement;
  const generatedImagePlaceholder = container.querySelector('.generated-image') as HTMLElement;

  if (grid) grid.innerHTML = '';
  if (placeholder) {
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `
      <span style="color: var(--text-muted); font-size: 2rem;">🖼️</span>
      <span style="color: var(--text-muted); font-size: 0.85rem;">이미지 없음</span>
    `;
  }
  // ✅ [2026-03-09 FIX] 전체삭제 시 .generated-image 플레이스홀더 다시 표시
  if (generatedImagePlaceholder) generatedImagePlaceholder.style.display = 'flex';

  // ImageManager에서 제거
  ImageManager.removeImage(headingTitle);

  appendLog(`🗑️ "${headingTitle}" 소제목의 모든 이미지가 삭제되었습니다.`, 'images-log-output');
}

// ✅ 소제목의 개별 이미지 제거
function removeSingleImageFromHeading(headingIndex: number, imageIndex: number, headingTitle: string, imageKey?: string): void {
  const promptItem = document.querySelector(`.prompt-item[data-index="${headingIndex + 1}"]`);
  if (!promptItem) return;

  const container = promptItem.querySelector('.generated-images-container');
  if (!container) return;

  const grid = container.querySelector('.images-grid') as HTMLElement | null;
  const placeholder = container.querySelector('.no-image-placeholder') as HTMLElement | null;

  if (!grid) return;

  try {
    pushImageHistorySnapshot('removeSingleImageFromHeading');
  } catch (e) {
    console.warn('[headingImageGen] catch ignored:', e);
  }

  let removedSrc: string | null = null;
  const key = String(imageKey || '').trim();

  let targetItem: HTMLElement | null = null;
  if (key) {
    const items = Array.from(grid.querySelectorAll('.grid-image-item')) as HTMLElement[];
    targetItem = items.find((it) => String((it as any)?.dataset?.imageKey || '').trim() === key) || null;
  }

  if (!targetItem) {
    // 클릭된 버튼의 data-image-index로 실제 DOM 아이템 찾기
    const btnSelector = `.remove-single-grid-image-btn[data-image-index="${imageIndex}"]`;
    const btnEl = grid.querySelector(btnSelector) as HTMLElement | null;
    if (btnEl) {
      targetItem = btnEl.closest('.grid-image-item') as HTMLElement | null;
    }
  }

  // 폴백: 인덱스로 접근 (이전 데이터와의 호환성)
  if (!targetItem) {
    const imageItems = grid.querySelectorAll('.grid-image-item');
    if (imageItems && imageItems[imageIndex]) {
      targetItem = imageItems[imageIndex] as HTMLElement;
    }
  }

  if (targetItem) {
    const imgEl = targetItem.querySelector('img') as HTMLImageElement | null;
    if (imgEl && imgEl.src) {
      removedSrc = imgEl.src;
    }
    targetItem.remove();
  }

  // 남은 이미지가 없으면 placeholder 표시
  const remainingImages = grid.querySelectorAll('.grid-image-item')?.length || 0;
  if (remainingImages === 0 && placeholder) {
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `
      <span style="color: var(--text-muted); font-size: 2rem;">🖼️</span>
      <span style="color: var(--text-muted); font-size: 0.85rem;">이미지 없음</span>
    `;
    // ✅ [2026-03-09 FIX] 마지막 이미지 삭제 시 .generated-image 플레이스홀더도 복원
    const generatedImagePlaceholder = container.querySelector('.generated-image') as HTMLElement;
    if (generatedImagePlaceholder) generatedImagePlaceholder.style.display = 'flex';
  }

  // ImageManager에서도 동일한 이미지 제거 (예비 이미지 자동 승격 방지)
  try {
    const titleKey = (() => {
      const raw = String(headingTitle || '').trim();
      const fallback = String((window as any)._headingTitles?.[headingIndex] || '').trim() || getHeadingTitleByIndex(headingIndex);
      const candidate = raw || fallback;
      if (!candidate) return '';
      try {
        return ImageManager.resolveHeadingKey(candidate);
      } catch {
        return candidate;
      }
    })();

    if (titleKey) {
      const imagesForHeading = ImageManager.getImages(titleKey);
      let targetIdx = -1;

      if (key) {
        targetIdx = imagesForHeading.findIndex((img: any) => getStableImageKey(img) === key);
      }

      if (removedSrc) {
        const normalizedRemoved = toFileUrlMaybe(String(removedSrc || '').trim());
        if (targetIdx < 0) {
          targetIdx = imagesForHeading.findIndex((img: any) => {
            const raw = img?.url || img?.filePath || img?.previewDataUrl || '';
            const norm = toFileUrlMaybe(String(raw || '').trim());
            return norm === normalizedRemoved;
          });
        }
      }

      // 매칭 실패 시 전달받은 imageIndex를 폴백으로 사용
      if (targetIdx < 0) {
        targetIdx = imageIndex;
      }

      if (targetIdx >= 0 && targetIdx < imagesForHeading.length) {
        ImageManager.removeImageAtIndex(titleKey, targetIdx);
      }
    }

    // 전역 이미지 배열도 동기화 (예비 이미지 포함)
    try {
      const allImagesAfter = ImageManager.getAllImages();
      (window as any).imageManagementGeneratedImages = allImagesAfter;
    } catch (e) {
      console.warn('[headingImageGen] catch ignored:', e);
    }
  } catch (error) {
    console.error('[ImageManager] 개별 이미지 제거 동기화 실패:', error);
  }

  appendLog(`❌ "${headingTitle}" 소제목에서 이미지 1개 제거됨`, 'images-log-output');
  syncGlobalImagesFromImageManager();

  // ✅ [2026-03-16 FIX] 삭제 후 프롬프트 영역 UI 전체 갱신
  // 이전: DOM에서 grid-image-item만 제거 → .generated-image 대표 미리보기가 갱신되지 않아 전체가 사라진 것처럼 보임
  try {
    const allImagesAfterRemove = ImageManager.getAllImages();
    updatePromptItemsWithImages(allImagesAfterRemove);
  } catch (e) {
    console.warn('[headingImageGen] 삭제 후 UI 갱신 실패:', e);
  }
}

// 현재 이미지 헤딩 가져오기
export function getCurrentImageHeadings(): any[] {
  const headings: any[] = [];
  const promptItems = document.querySelectorAll('#prompts-container .prompt-item:not([style*="display: none"])');

  promptItems.forEach((item, index) => {
    const promptText = item.querySelector('.prompt-text') as HTMLDivElement;

    const promptValue = String(promptText?.textContent || '').trim();
    // ✅ [2026-03-16 FIX] data-heading-title 속성 우선 사용 (배지 텍스트 '📌 썸네일' 오염 방지)
    // 기존: .heading-title-text의 textContent → 배지 포함한 '🖼️ 썸네일 📌 썸네일' 추출됨
    // 수정: data-heading-title → 순수 제목만 추출 → ImageManager key 매칭 정상화
    const dataTitle = String((item as HTMLElement).getAttribute('data-heading-title') || '').trim();
    const pureSpan = item.querySelector('.heading-title-pure') as HTMLElement | null;
    const pureTitle = pureSpan ? String(pureSpan.textContent || '').trim() : '';
    const globalTitle = String((window as any)._headingTitles?.[index] || '').trim();
    const titleValue = dataTitle || pureTitle || globalTitle || `소제목 ${index + 1}`;
    if (promptValue) {
      headings.push({
        title: titleValue,
        prompt: promptValue,
        index
      });
    }
  });

  return headings;
}
