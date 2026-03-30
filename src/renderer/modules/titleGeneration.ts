// ═══════════════════════════════════════════════════════════════════
// [2026-02-26] titleGeneration.ts - 제목 생성/풀오토 미리보기 관련
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
declare function updateUnifiedPreview(content: any): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function displayGeneratedImages(images: any[]): void;
declare function collectFormData(): any;
declare function generateContentFromKeywords(...args: any[]): Promise<void>;
declare function generateImagesWithCostSafety(options: any): Promise<any>;
declare function isCostRiskImageProvider(provider: string): boolean;
declare function isFullAutoStopRequested(...args: any[]): boolean;
declare function getProgressModal(): any;
declare function showUnifiedProgress(progress: number, title: string, detail?: string): void;
declare function hideUnifiedProgress(): void;
declare function hydrateImageManagerFromImages(images: any, headings?: any): void;
declare function saveGeneratedPost(...args: any[]): any;
declare function activatePaywall(...args: any[]): void;
declare function isPaywallPayload(payload: any): boolean;
declare const EnhancedApiClient: any;
declare function handleFullAutoPublish(): Promise<void>;
declare function updateRiskIndicators(...args: any[]): void;
declare type StructuredContent = any;
declare function normalizeReadableBodyText(text: string): string;
declare function displayStructuredContentPreview(content: any): void;
declare function generateImagesForContent(...args: any[]): Promise<any>;
declare function executeBlogPublishing(...args: any[]): Promise<void>;
declare function initImageManagementTab(): void;
declare function getHeadingVideoPreviewFromCache(...args: any[]): any;
declare function normalizeHeadingKeyForVideoCache(key: string): string;
declare let headingVideoPreviewCache: Map<string, any>;
declare let headingVideoPreviewInFlight: Map<string, Promise<any>>;
declare function prefetchHeadingVideoPreview(heading: string): void;

export function initTitleGeneration(): void {
  const generateTitleBtn = document.getElementById('generate-title-btn') as HTMLButtonElement;
  const titleInput = document.getElementById('post-title') as HTMLInputElement;
  const contentTextarea = document.getElementById('post-content') as HTMLTextAreaElement;
  const urlFields = document.querySelectorAll('.url-field-input') as NodeListOf<HTMLInputElement>;

  // 수동 제목으로 글생성하기 버튼
  const generateFromManualTitleBtn = document.getElementById('generate-from-manual-title-btn') as HTMLButtonElement;
  if (generateFromManualTitleBtn) {
    generateFromManualTitleBtn.addEventListener('click', async () => {
      if (!generateFromManualTitleBtn) return;

      generateFromManualTitleBtn.disabled = true;
      generateFromManualTitleBtn.textContent = '글 생성 중...';

      // ✅ 새 글 생성 전 이전 콘텐츠 자동 초기화 (제목 버그 방지)
      if (currentStructuredContent) {
        console.log('[ManualTitle] 이전 콘텐츠를 초기화합니다...');
        currentStructuredContent = null;
        (window as any).currentStructuredContent = null;
        generatedImages = [];
        (window as any).imageManagementGeneratedImages = null;
      }

      appendLog('🤖 수동 제목으로 글 생성을 시작합니다...');

      try {
        // 입력된 정보 수집
        const title = titleInput?.value.trim() || '';
        const urls = Array.from(urlFields)
          .map(field => field.value.trim())
          .filter(url => url.length > 0)
          .join('\n');

        if (!title) {
          alert('글 생성을 위해 제목을 입력해주세요.');
          generateFromManualTitleBtn.disabled = false;
          generateFromManualTitleBtn.textContent = '수동 제목으로 글생성하기';
          return;
        }

        if (!urls) {
          alert('글 생성을 위해 URL을 입력해주세요.');
          generateFromManualTitleBtn.disabled = false;
          generateFromManualTitleBtn.textContent = '수동 제목으로 글생성하기';
          return;
        }

        // 구조화 콘텐츠 생성 (수동 제목 기반)
        const targetAgeSelect = document.getElementById('target-age') as HTMLSelectElement;
        const targetAge = (targetAgeSelect?.value as '20s' | '30s' | '40s' | '50s' | 'all') || 'all';

        const apiClient = EnhancedApiClient.getInstance();
        const apiResponse = await apiClient.call(
          'generateStructuredContent',
          [{
            assembly: {
              rssUrl: urls,
              baseText: title, // 수동 제목을 baseText로 사용
              targetAge: targetAge,
              generator: UnifiedDOMCache.getGenerator(),
              minChars: 2500,
            }
          }],
          {
            retryCount: 2,
            retryDelay: 3000,
            timeout: 900000      // ✅ 15분 (Main 모델 폴백 체인 최대 12분 + 여유)
          }
        );

        const result = apiResponse.data || { success: false, message: apiResponse.error };

        if (isPaywallPayload(result)) {
          activatePaywall(result);
          return;
        }

        if (result.success && result.content) {
          const structuredContent = result.content as StructuredContent & { content?: string };

          // 필드 채우기 (타이밍 보장)
          setTimeout(async () => {
            // 제목 필드는 이미 입력되어 있으므로 유지
            // 본문 필드에 입력
            if (contentTextarea && structuredContent.bodyPlain) {
              const normalized = normalizeReadableBodyText(structuredContent.bodyPlain);
              structuredContent.bodyPlain = normalized;
              structuredContent.content = normalized;
              contentTextarea.value = normalized;
            }

            // 해시태그 필드에 입력
            const tagsInput = document.getElementById('post-tags') as HTMLInputElement;
            if (tagsInput && structuredContent.hashtags) {
              tagsInput.value = structuredContent.hashtags.join(' ');
            }

            // 소제목 정보 저장 (이미지 생성에 사용)
            (window as any).currentStructuredContent = structuredContent;

            // 소제목 표시 (반자동 발행 탭)
            displayStructuredContentPreview(structuredContent);

            // 풀오토 탭에도 소제목 표시
            updateFullAutoHeadingsPreview(structuredContent);

            // 모든 탭의 제목 필드에 설정 (이미 입력된 제목을 다른 탭에도 복사)
            setTitleInAllTabs(title);

            // 성공 알림 및 로그
            appendLog('✅ 수동 제목으로 글 생성이 완료되었습니다!');
            appendLog(`📝 제목: "${title}" (수동 입력)`);
            appendLog(`📄 본문: ${structuredContent.bodyPlain.length}자`);
            appendLog(`🏷️ 해시태그: ${structuredContent.hashtags?.join(', ') || '없음'}`);
            appendLog(`📑 소제목: ${structuredContent.headings?.length || 0}개`);

            // 필드가 채워진 후 알림 표시
            alert('✅ 수동 제목으로 글 생성이 완료되었습니다!\n\n본문과 해시태그가 자동으로 입력되었습니다.');

            // 이미지 자동 생성 및 발행 (옵션)
            const autoPublishCheckbox = document.getElementById('auto-publish-after-generate') as HTMLInputElement;
            if (autoPublishCheckbox?.checked) {
              setTimeout(() => {
                autoGenerateImagesAndPublish(structuredContent);
              }, 1000);
            }
          }, 500); // 필드 채우기 대기 시간 추가

        } else {
          appendLog(`❌ 글 생성 실패: ${result.message || '알 수 없는 오류'}`);
          alert(`❌ 글 생성 실패: ${result.message || '알 수 없는 오류'}`);
        }
      } catch (error) {
        appendLog(`❌ 글 생성 오류: ${(error as Error).message}`);
        alert(`❌ 오류: ${(error as Error).message}`);
      } finally {
        generateFromManualTitleBtn.disabled = false;
        generateFromManualTitleBtn.textContent = '수동 제목으로 글생성하기';
      }
    });
  }

  // AI 자동 글 생성하기 버튼
  if (generateTitleBtn) {
    generateTitleBtn.addEventListener('click', async () => {
      if (!generateTitleBtn) return;

      generateTitleBtn.disabled = true;
      generateTitleBtn.textContent = '글 생성 중...';

      // ✅ 새 글 생성 전 이전 콘텐츠 자동 초기화 (제목 버그 방지)
      if (currentStructuredContent) {
        console.log('[AIGenerate] 이전 콘텐츠를 초기화합니다...');
        currentStructuredContent = null;
        (window as any).currentStructuredContent = null;
        generatedImages = [];
        (window as any).imageManagementGeneratedImages = null;
      }

      appendLog('🤖 AI 글 생성을 시작합니다...');

      try {
        // 입력된 정보 수집
        const urls = Array.from(urlFields)
          .map(field => field.value.trim())
          .filter(url => url.length > 0)
          .join('\n');

        if (!urls) {
          alert('글 생성을 위해 URL을 입력해주세요.');
          generateTitleBtn.disabled = false;
          generateTitleBtn.textContent = 'AI 자동 글 생성하기';
          return;
        }

        // 구조화 콘텐츠 생성 (전체 콘텐츠)
        const targetAgeSelect = document.getElementById('target-age') as HTMLSelectElement;
        const targetAge = (targetAgeSelect?.value as '20s' | '30s' | '40s' | '50s' | 'all') || 'all';

        const apiClient = EnhancedApiClient.getInstance();
        const apiResponse = await apiClient.call(
          'generateStructuredContent',
          [{
            assembly: {
              rssUrl: urls,
              targetAge: targetAge,
              generator: UnifiedDOMCache.getGenerator(), // ✅ [2026-02-22 FIX] perplexity 지원
              minChars: 2500,
            }
          }],
          {
            retryCount: 2,
            retryDelay: 3000,
            timeout: 900000      // ✅ 15분 (Main 모델 폴백 체인 최대 12분 + 여유)
          }
        );

        const result = apiResponse.data || { success: false, message: apiResponse.error };

        if (isPaywallPayload(result)) {
          activatePaywall(result);
          return;
        }

        if (result.success && result.content) {
          const structuredContent = result.content as StructuredContent & { content?: string };

          // 제목 필드에 입력
          if (titleInput && structuredContent.selectedTitle) {
            titleInput.value = structuredContent.selectedTitle;
          }

          // 본문 필드에 입력
          if (contentTextarea && structuredContent.bodyPlain) {
            const normalized = normalizeReadableBodyText(structuredContent.bodyPlain);
            structuredContent.bodyPlain = normalized;
            structuredContent.content = normalized;
            contentTextarea.value = normalized;
          }

          // 해시태그 필드에 입력
          const tagsInput = document.getElementById('post-tags') as HTMLInputElement;
          if (tagsInput && structuredContent.hashtags) {
            tagsInput.value = structuredContent.hashtags.join(' ');
          }

          // 소제목 정보 저장 (이미지 생성에 사용)
          (window as any).currentStructuredContent = structuredContent;

          // 소제목 표시 (반자동 발행 탭)
          displayStructuredContentPreview(structuredContent);

          // 풀오토 탭에도 소제목 표시
          updateFullAutoHeadingsPreview(structuredContent);

          // 성공 알림 및 로그
          appendLog('✅ AI 글 생성이 완료되었습니다!');
          appendLog(`📝 제목: "${structuredContent.selectedTitle}"`);
          appendLog(`📄 본문: ${structuredContent.bodyPlain.length}자`);
          appendLog(`🏷️ 해시태그: ${structuredContent.hashtags?.join(', ') || '없음'}`);
          appendLog(`📑 소제목: ${structuredContent.headings?.length || 0}개`);

          alert('✅ AI 글 생성이 완료되었습니다!\n\n제목, 본문, 해시태그가 자동으로 입력되었습니다.');

          // 이미지 자동 생성 및 발행 (옵션)
          const autoPublishCheckbox = document.getElementById('auto-publish-after-generate') as HTMLInputElement;
          if (autoPublishCheckbox?.checked) {
            setTimeout(() => {
              autoGenerateImagesAndPublish(structuredContent);
            }, 1000);
          }

        } else {
          appendLog(`❌ 글 생성 실패: ${result.message || '알 수 없는 오류'}`);
          alert(`❌ 글 생성 실패: ${result.message || '알 수 없는 오류'}`);
        }
      } catch (error) {
        appendLog(`❌ 글 생성 오류: ${(error as Error).message}`);
        alert(`❌ 오류: ${(error as Error).message}`);
      } finally {
        generateTitleBtn.disabled = false;
        generateTitleBtn.textContent = 'AI 자동 글 생성하기';
      }
    });
  }
}



// ============================================
// 풀오토 미리보기 기능
// ============================================

// 풀오토 콘텐츠 미리보기 업데이트
export function updateFullAutoPreview(structuredContent: any): void {
  const previewSection = document.getElementById('full-auto-preview-section');
  if (!previewSection) return;

  previewSection.style.display = 'block';

  const contentPreview = document.getElementById('full-auto-content-preview');
  if (contentPreview) {
    const contentText = structuredContent.bodyPlain || structuredContent.content || '';
    const sentences = contentText.split(/([.!?。！？])\s*/).filter((s: string) => s.trim());
    let formattedContent = '';
    let sentenceCount = 0;
    let currentParagraph = '';

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;

      currentParagraph += sentence;

      if (/[.!?。！？]/.test(sentence)) {
        sentenceCount++;
        if (sentenceCount % 5 === 0 || i === sentences.length - 1) {
          formattedContent += currentParagraph + '\n\n';
          currentParagraph = '';
        } else {
          currentParagraph += ' ';
        }
      }
    }

    const truncatedContent = formattedContent.length > 500 ? formattedContent.substring(0, 500) + '...' : formattedContent;
    contentPreview.innerHTML = truncatedContent ?
      `<div style="white-space: pre-line; line-height: 1.6;">${truncatedContent.replace(/\n/g, '<br>')}</div>` :
      '<div style="color: var(--text-muted); font-style: italic;">생성된 본문이 없습니다.</div>';
  }

  const integratedPreview = document.getElementById('full-auto-integrated-preview');
  if (integratedPreview) {
    const hs = Array.isArray(structuredContent?.headings) ? structuredContent.headings : [];
    const integratedHtml = hs.map((heading: any, index: number) =>
      `<div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px; border: 1px solid var(--border-light);">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(59, 130, 246, 0.1); border-radius: 6px;">
          <div style="width: 40px; height: 40px; border-radius: 6px; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; color: white; font-size: 1rem; font-weight: 600;">${index + 1}</div>
          <div style="flex: 1;">
            <div style="font-size: 0.9rem; color: var(--text-strong); font-weight: 500;">🖼️ 이미지 생성 예정</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">소제목에 맞는 이미지가 생성됩니다</div>
          </div>
          <div style="font-size: 0.8rem; color: var(--accent); font-weight: 600;">⏳ 준비중</div>
        </div>
        <div style="padding: 0.5rem; background: var(--bg-primary); border-radius: 6px; border-left: 3px solid var(--success);">
          <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.5rem;">📝 ${heading.title || '제목 없음'}</div>
          <div style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.4;">${(heading.content || '').substring(0, 150)}${(heading.content || '').length > 150 ? '...' : ''}</div>
        </div>
      </div>`
    ).join('');

    integratedPreview.innerHTML = integratedHtml || '<div style="color: var(--text-muted); font-style: italic;">생성할 이미지가 없습니다.</div>';
  }
}

// 풀오토 최종 이미지 미리보기 업데이트
export function updateFullAutoFinalImagePreview(generatedImages: any[]): void {
  const integratedPreview = document.getElementById('full-auto-integrated-preview');
  if (!integratedPreview) return;

  const integratedHtml = generatedImages.map((image: any, index: number) =>
    `<div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px; border: 1px solid var(--border-light);">
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(16, 185, 129, 0.1); border-radius: 6px;">
        <div style="width: 40px; height: 40px; border-radius: 6px; background: linear-gradient(135deg, #10b981, #059669); display: flex; align-items: center; justify-content: center; color: white; font-size: 1rem; font-weight: 600;">✓</div>
        <div style="flex: 1;">
          <div style="font-size: 0.9rem; color: var(--text-strong); font-weight: 500;">🖼️ 이미지 생성 완료</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">이미지가 성공적으로 생성되었습니다</div>
        </div>
        <div style="font-size: 0.8rem; color: var(--success); font-weight: 600;">✅ 완료</div>
      </div>
      <div style="padding: 0.5rem; background: var(--bg-primary); border-radius: 6px; border-left: 3px solid var(--success);">
        <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.5rem;">📝 ${image.headingTitle || `소제목 ${index + 1}`}</div>
        <div style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.4;">${(image.headingContent || '').substring(0, 150)}${(image.headingContent || '').length > 150 ? '...' : ''}</div>
      </div>
    </div>`
  ).join('');

  integratedPreview.innerHTML = integratedHtml || '<div style="color: var(--text-muted); font-style: italic;">생성된 이미지가 없습니다.</div>';
}

// 미리보기 활성화/비활성화 토글
export function toggleFullAutoPreview(): void {
  // ✅ [2026-03-10 CLEANUP] full-auto-enable-preview 유령 참조 제거 → 미리보기 섹션이 있으면 항상 표시
  const previewSection = document.getElementById('full-auto-preview-section');

  if (previewSection) {
    previewSection.style.display = 'block';
  }
}

// 풀오토 탭 소제목 미리보기 업데이트
export function updateFullAutoHeadingsPreview(structuredContent: any): void {
  const headingsPreview = document.getElementById('full-auto-headings-preview');
  if (!headingsPreview || !structuredContent.headings) return;

  const headingsHtml = structuredContent.headings.map((heading: any, index: number) =>
    `<div style="margin-bottom: 0.75rem; padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px; border-left: 3px solid var(--primary);">
      <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem;">${index + 1}. ${heading.title || '제목 없음'}</div>
      <div style="font-size: 0.85rem; color: var(--text-muted);">${(heading.content || '').substring(0, 100)}${(heading.content || '').length > 100 ? '...' : ''}</div>
    </div>`
  ).join('');

  headingsPreview.innerHTML = headingsHtml || '<div style="color: var(--text-muted); font-style: italic;">소제목이 없습니다.</div>';
}

// 소제목에서 검색 의도가 명확한 키워드 추출
export function extractSearchKeywords(title: string, content?: string): string[] {
  const keywords: string[] = [];

  const titleWords = title.split(' ').filter(word => word.length > 1);
  const personNamePattern = /^[가-힣]{2,4}$|^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/;

  const personNames = titleWords.filter(word => personNamePattern.test(word));
  if (personNames.length > 0) {
    keywords.push(...personNames);
    appendLog(`👤 인물 감지됨: ${personNames.join(', ')}`);
  }

  const titleKeywords = titleWords.filter(word => {
    if (personNames.includes(word)) return false;
    if (/^[가-힣]{2,10}$/.test(word)) return true;
    if (/^[A-Za-z]{3,}$/.test(word)) return true;
    return false;
  });

  keywords.push(...titleKeywords);

  if (content) {
    const contentWords = content.split(' ').filter(word => word.length > 1);
    const contentKeywords = contentWords.filter(word =>
      /^[가-힣]{2,6}$/.test(word) || /^[A-Za-z]{4,}$/.test(word)
    ).slice(0, 3);
    keywords.push(...contentKeywords);
  }

  const uniqueKeywords = Array.from(new Set(keywords)).slice(0, 5);
  return uniqueKeywords.length > 0 ? uniqueKeywords : [title];
}

// 모든 탭의 제목 필드에 제목 설정
export function setTitleInAllTabs(title: string): void {
  if (!title) return;

  const semiAutoTitleInput = document.getElementById('post-title') as HTMLInputElement;
  if (semiAutoTitleInput) {
    semiAutoTitleInput.value = title;
  }

  const imageTabTitleInput = document.querySelector('#tab-images input[type="text"][placeholder*="제목"]') as HTMLInputElement;
  if (imageTabTitleInput) {
    imageTabTitleInput.value = title;
  }

  const libraryTabTitleInput = document.querySelector('#tab-library input[type="text"][placeholder*="제목"]') as HTMLInputElement;
  if (libraryTabTitleInput) {
    libraryTabTitleInput.value = title;
  }

  const allTitleInputs = document.querySelectorAll('input[type="text"][id*="title"], input[type="text"][placeholder*="제목"]') as NodeListOf<HTMLInputElement>;
  allTitleInputs.forEach(input => {
    if (input.id !== 'post-title') {
      input.value = title;
    }
  });

  appendLog(`📝 모든 탭의 제목 필드에 "${title}" 설정됨`);
}

// 이미지 자동 생성 및 발행
export async function autoGenerateImagesAndPublish(structuredContent: any): Promise<void> {
  try {
    appendLog('🎨 이미지 자동 생성을 시작합니다...');

    // ✅ [2026-02-01 FIX] collectedImages 전달하여 중복 크롤링 방지
    const generatedImages = await generateImagesForContent(structuredContent, {
      imageSource: 'nano-banana-pro',
      skipImages: false,
      collectedImages: structuredContent?.collectedImages || structuredContent?.images || []
    });

    appendLog('📤 자동 발행을 시작합니다...');

    await executeBlogPublishing(structuredContent, generatedImages, {
      publishMode: 'publish'
    });

    appendLog('🎉 자동 발행이 완료되었습니다!');
    alert('🎉 이미지 생성 및 발행이 자동으로 완료되었습니다!');

    // ✅ [2026-01-29] 발행 완료 후 상태 초기화
    if (typeof (window as any).resetAfterPublish === 'function') {
      (window as any).resetAfterPublish();
    }

  } catch (error) {
    appendLog(`❌ 자동 발행 실패: ${(error as Error).message}`);
    alert(`❌ 자동 발행 실패: ${(error as Error).message}`);

    // ✅ [2026-03-22 FIX] 실패 시 발행 상태 리셋 (재시도 가능하도록)
    if (typeof (window as any).resetPublishing === 'function') {
      (window as any).resetPublishing();
    }
  }
}

// ✅ [2026-03-16 FIX] 사이드 이펙트 호출 제거 — renderer.ts에서 imageManagementTab.ts의 올바른 버전을 호출\n// initImageManagementTab();




// 빠른 액션 함수들
