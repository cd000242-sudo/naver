// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 발행 핸들러 모듈
// renderer.ts에서 추출된 풀오토/세미오토/다중계정 발행 핸들러 함수들
// ═══════════════════════════════════════════════════════════════════

// ✅ renderer.ts의 전역 변수/함수 참조 (인라인 빌드에서 동일 스코프)
declare let currentStructuredContent: any;
declare let generatedImages: any[];
declare let currentPostId: string;
declare const ImageManager: any;
declare const toastManager: any;
declare const UnifiedDOMCache: any;
declare function appendLog(msg: string, ...args: any[]): void;
declare function escapeHtml(str: string): string;
declare function collectFormData(): any;
declare function collectUnifiedFormDataForPublish(): any;
declare function executeUnifiedAutomation(formData: any): Promise<void>;
declare function saveGeneratedPosts(posts: any[]): void;
declare function saveGeneratedPost(content: any, isUpdate?: boolean, opts?: any): string;
declare function loadGeneratedPosts(): any[];
declare function refreshGeneratedPostsList(): void;
declare function showFolderSelectionModal(options?: any): Promise<void>;
declare function syncGlobalImagesFromImageManager(): void;
declare function hydrateImageManagerFromImages(images: any, headings?: any): void;
declare function autoGenerateCTA(content?: any): void;
declare function updateRiskIndicators(content?: any): void;
declare function displayGeneratedImages(images: any[]): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare function executeBatchPublish(formData: any, batchTargets: any[]): Promise<void>;
declare function generateAIContentFromData(data: any): Promise<any>;
declare function executeFullAutoFlow(formData: any): Promise<void>;
declare function executeSemiAutoFlow(formData: any): Promise<void>;
declare function updateUnifiedPreview(content: any): void;
declare function isShoppingConnectModeActive(): boolean;
declare function readUnifiedCtasFromUi(): any[];
declare function getScheduleDateFromInput(inputId: string): string | undefined;
declare function generateAutoCTA(title: string, keywords?: string): any;
declare function resolveAffiliateLink(link1?: string, link2?: string): string | undefined;
declare function generateImagesForAutomation(imageSource: string, headings: any[], title: string, options?: any): Promise<any[]>;
declare function isFullAutoStopRequested(modal: any): boolean;
declare function getProgressModal(): any;
declare function applyPresetThumbnailIfExists(...args: any[]): any;
declare function fillSemiAutoFields(content: any): void;
declare function getUnifiedUrls(): string[];
declare function generateContentFromUrl(url: string, title?: string, tone?: string, suppressModal?: boolean): Promise<void>;
declare function generateContentFromKeywords(title?: string, keywords?: string, tone?: string, suppressModal?: boolean): Promise<void>;
declare function setKeywordTitleOptionsFromItem(keyword: string, asTitle: boolean, prefix: boolean): void;

export async function handleFullAutoPublish(): Promise<void> {
  // ✅ 완전 자동 모드 설정
  (window as any).currentAutomationMode = 'full-auto';

  // ✅ 현재 계정 모드 확인 (1개 계정 / 다중계정)
  const accountMode = (window as any).getAccountMode?.() || 'single';

  if (accountMode === 'multi') {
    // 다중계정 모드: 순차 발행
    await handleMultiAccountPublish();
    return;
  }

  // 1개 계정 모드: 기존 로직
  const urls = getUnifiedUrls();
  const title = (document.getElementById('unified-title') as HTMLInputElement)?.value?.trim();
  const keywords = (document.getElementById('unified-keywords') as HTMLInputElement)?.value?.trim();

  // 입력 검증
  if (urls.length === 0 && !title && !keywords) {
    alert('풀오토 발행을 위해서는 URL, 제목, 키워드 중 최소 하나 이상을 입력해주세요.');
    return;
  }

  // ✅ 진행상황 모달 표시
  const modal = getProgressModal();
  modal.show('🚀 풀오토 발행 진행 중', 'AI가 콘텐츠를 생성하고 있습니다...');
  modal.setStep(1, 'active', 'AI 콘텐츠 생성 중...');
  modal.setProgress(5, '콘텐츠 생성 준비 중...');
  modal.addLog('🚀 풀오토 발행 시작');

  appendLog('🚀 풀오토 발행 시작: 콘텐츠 생성 → 이미지 생성 → 자동 발행');

  try {
    if (isFullAutoStopRequested(modal)) {
      appendLog('⏹️ 사용자가 풀오토 발행을 중지했습니다.');
      return;
    }

    // 콘텐츠 생성
    modal.setProgress(10, '콘텐츠 생성 중...');
    const toneStyle = UnifiedDOMCache.getToneStyle();

    // ✅ [2026-03-05 FIX] 콘텐츠 생성 실패 시 모달에 에러 즉시 표시 + 2분 타임아웃 워처
    const contentTimeout = setTimeout(() => {
      modal.showError('⚠️ 콘텐츠 생성 지연', '콘텐츠 생성이 2분 이상 걸리고 있습니다. 네트워크 또는 AI 엔진 응답 지연일 수 있습니다.');
      appendLog('⚠️ 콘텐츠 생성 2분 초과 — AI 엔진 또는 네트워크 응답 지연');
    }, 120_000);

    try {
      if (urls.length > 0) {
        appendLog(`🔄 ${urls.length}개 URL 기반 콘텐츠 생성 (첫 번째 URL 사용)`);
        modal.addLog(`📎 URL: ${urls[0].substring(0, 50)}...`);
        await generateContentFromUrl(urls[0], undefined, toneStyle, true);
      } else {
        appendLog('✏️ 키워드/제목 기반 콘텐츠 생성');
        modal.addLog(`📝 키워드: ${keywords || title}`);
        // ✅ [2026-02-13] 풀오토: 키워드 제목 옵션 적용
        const faKeywordAsTitle = (document.getElementById('fullauto-keyword-as-title') as HTMLInputElement)?.checked || false;
        const faKeywordTitlePrefix = (document.getElementById('fullauto-keyword-title-prefix') as HTMLInputElement)?.checked || false;
        setKeywordTitleOptionsFromItem(keywords || title, faKeywordAsTitle, faKeywordTitlePrefix);
        await generateContentFromKeywords(title, keywords, toneStyle, true); // suppressModal: true
      }
    } catch (contentError) {
      clearTimeout(contentTimeout);
      const errMsg = (contentError as Error).message || '알 수 없는 오류';
      appendLog(`❌ 콘텐츠 생성 실패: ${errMsg}`);
      modal.showError('❌ 콘텐츠 생성 실패', `AI 콘텐츠 생성 중 오류가 발생했습니다.\n\n원인: ${errMsg}`);
      return; // ✅ throw 대신 return으로 에러 모달 유지
    }
    clearTimeout(contentTimeout);

    // 취소 확인
    if (isFullAutoStopRequested(modal)) {
      appendLog('❌ 사용자가 발행을 취소했습니다.');
      return;
    }

    // 생성된 콘텐츠 가져오기
    const structuredContent = (window as any).currentStructuredContent;
    if (!structuredContent) {
      throw new Error('콘텐츠 생성에 실패했습니다.');
    }

    // 풀오토 발행에서도 콘텐츠 미리보기 표시 (대기 시간 제거 - 속도 향상)
    updateUnifiedPreview(structuredContent);

    // ✅ 소제목 개수 확인 로깅
    const headingCount = structuredContent.headings?.length || 0;
    appendLog(`✅ 콘텐츠 생성 완료! ${headingCount}개 소제목으로 이미지 생성 진행...`);

    // ✅ [신규] 글 목록에 자동 저장 (어떤 모드로 발행해도 저장되도록)
    try {
      const savedPostId = saveGeneratedPost(structuredContent, false, { category: UnifiedDOMCache.getRealCategory() });
      if (savedPostId) {
        modal.addLog(`💾 글이 자동 저장되었습니다 (ID: ${savedPostId})`);
        appendLog(`💾 글이 자동 저장되었습니다`);
      }
    } catch (saveErr) {
      console.error('글 저장 실패:', saveErr);
    }

    // ✅ 진행상황 모달 업데이트 - 콘텐츠 생성 완료
    modal.setStep(1, 'completed', '완료');
    modal.setProgress(30, '이미지 생성 준비 중...');
    modal.addLog(`✅ 콘텐츠 생성 완료 (${headingCount}개 소제목)`);

    // ✅ [2026-02-08] 쇼핑커넥트 모드: 항상 100점 SEO 제목 생성
    // 핵심: 제품명 + 네이버 자동완성 키워드 최소 3개 조합 = 상위노출 보장
    if (isShoppingConnectModeActive() && structuredContent) {
      // ✅ [2026-03-10 FIX] URL이 제목에 혼입되는 버그 방지
      // structuredContent.title은 원본 소스 제목(크롤링/RSS)으로, URL이 들어있을 수 있음
      const isUrl = (str: string) => /^https?:\/\//i.test(str.trim());
      const rawTitle = String(structuredContent.title || '').trim();
      const rawSelectedTitle = String(structuredContent.selectedTitle || '').trim();
      const productName = (!rawTitle || isUrl(rawTitle))
        ? (isUrl(rawSelectedTitle) ? '' : rawSelectedTitle)
        : rawTitle;
      if (productName && productName.length >= 3) {
        try {
          modal.addLog(`📝 SEO 100점 제목 생성 중... (자동완성 키워드 3개 이상 조합)`);
          appendLog(`📝 SEO 제목 생성: 제품명="${productName}"`);
          const seoResult = await (window as any).api.generateSeoTitle(productName);
          if (seoResult?.success && seoResult.title && seoResult.title !== productName) {
            const originalTitle = structuredContent.selectedTitle || '';
            structuredContent.selectedTitle = seoResult.title;
            // ✅ [핵심] UI 필드도 동시 업데이트 — 발행 시 UI 필드를 최우선으로 읽으므로 여기서도 갱신 필수!
            try {
              const titleInput1 = document.getElementById('unified-generated-title') as HTMLInputElement;
              if (titleInput1) titleInput1.value = seoResult.title;
              const titleInput2 = document.getElementById('unified-title') as HTMLInputElement;
              if (titleInput2) titleInput2.value = seoResult.title;
            } catch { }
            modal.addLog(`✅ SEO 제목 완료: "${seoResult.title.substring(0, 35)}"`);
            appendLog(`✅ SEO 제목: "${originalTitle}" → "${seoResult.title}"`);
          } else {
            modal.addLog(`⚠️ SEO 제목 생성 실패, 원본 제목 사용`);
          }
        } catch (seoErr) {
          console.warn('[FullAuto] SEO 제목 생성 실패, 원본 사용:', seoErr);
          modal.addLog(`⚠️ SEO 제목 생성 실패, 원본 제목 사용`);
        }
      }
    }

    // ✅ [2026-02-02 FIX] 콘텐츠 생성 완료 직후 이미지 미리보기 영역에 플레이스홀더 표시
    if (headingCount > 0 && structuredContent.headings) {
      const placeholderImages = structuredContent.headings.map((h: any, idx: number) => ({
        heading: String(h.title || h.text || `이미지 ${idx + 1}`).trim().substring(0, 15),
        url: '', // 플레이스홀더 (빈 URL)
        isPlaceholder: true
      }));
      modal?.showImages(placeholderImages, `🎨 이미지 준비 중... (${headingCount}개)`);
    }

    // 취소 확인
    if (modal.cancelled) {
      appendLog('❌ 사용자가 발행을 취소했습니다.');
      return;
    }

    // 발행 데이터 구성
    const imageSource = UnifiedDOMCache.getImageSource();
    // 🔍 [DIAGNOSTIC] imageSource 결정 직후 값 확인 — 이 로그를 보면 어디서 nano-banana-pro가 주입되는지 알 수 있음
    console.log(`[FullAutoPublish] 🔍🔍🔍 getImageSource() 결과 = "${imageSource}"`);
    console.log(`[FullAutoPublish] 🔍🔍🔍 localStorage.fullAutoImageSource = "${localStorage.getItem('fullAutoImageSource')}"`);
    console.log(`[FullAutoPublish] 🔍🔍🔍 localStorage.globalImageSource = "${localStorage.getItem('globalImageSource')}"`);
    // 선택된 이미지 소스 버튼 확인
    const selectedBtnDiag = document.querySelector('.unified-img-source-btn.selected') as HTMLElement;
    console.log(`[FullAutoPublish] 🔍🔍🔍 선택된 버튼 data-source = "${selectedBtnDiag?.dataset?.source || '(없음)'}"`);

    // ✅ [2026-01-28 FIX] 이미지 모달의 'textOnlyPublish' 설정 우선 적용
    const skipImagesFromStorage = localStorage.getItem('textOnlyPublish') === 'true';
    const skipImagesFromDom = (document.getElementById('unified-skip-images') as HTMLInputElement)?.checked || false;
    const skipImages = skipImagesFromStorage || skipImagesFromDom;
    console.log(`[FullAutoPublish] 이미지 건너뛰기 설정 - Storage: ${skipImagesFromStorage}, DOM: ${skipImagesFromDom}, 최종: ${skipImages}`);
    // ✅ [2026-01-28] 사용자에게도 알림 - 이미지 건너뛰기 상태 명시
    if (skipImages) {
      appendLog(`⚠️ 이미지 없이 발행합니다 (텍스트만 발행 설정 활성화됨)`);
      modal.addLog(`⚠️ 이미지 생성 건너뛰기 (textOnlyPublish=true)`);
    }

    const ctasUi = readUnifiedCtasFromUi();
    const skipCtaCheckbox = document.getElementById('unified-skip-cta') as HTMLInputElement;
    const skipCta = skipCtaCheckbox?.checked || false; // ✅ CTA 없이 발행 체크박스
    // ✅ UI에서 발행 방식 읽기 (즉시/임시/예약) - 기존 하드코딩 버그 수정
    const publishModeInput = document.getElementById('unified-publish-mode') as HTMLInputElement;
    const publishMode = publishModeInput?.value || 'publish'; // ✅ [2026-03-10 FIX] 기본값을 즉시발행으로 변경
    console.log('[PublishingHandlers] 🔍 발행 모드 읽기 (handleFullAutoPublish):', publishMode);
    console.log(`[FullAutoPublish] 발행 방식: ${publishMode === 'draft' ? '임시저장' : publishMode === 'schedule' ? '예약발행' : '즉시발행'}`);

    // ✅ [2026-02-07 FIX] getScheduleDateFromInput 사용하여 datetime-local 값을 YYYY-MM-DD HH:mm 형식으로 변환
    // 기존: .value 직접 읽기 → 2026-02-07T22:50 형식(T 포함) → 검증 실패
    const scheduleDate = publishMode === 'schedule' ? getScheduleDateFromInput('unified-schedule-date') : undefined;
    const scheduleType = publishMode === 'schedule' ? ((document.getElementById('unified-schedule-type') as HTMLSelectElement)?.value as 'app-schedule' | 'naver-server' || 'naver-server') : undefined;

    // ✅ CTA 자동 생성 (skipCta가 false인 경우만)
    let finalCtaText = '';
    let finalCtaLink = '';

    if (!skipCta) {
      const generatedTitle = structuredContent.selectedTitle || title || '';
      const autoCTA = generateAutoCTA(generatedTitle, keywords);

      // 수동 입력된 CTA가 있으면 우선 사용
      const manualCtaText = ctasUi[0]?.text || (document.getElementById('unified-cta-text') as HTMLInputElement)?.value?.trim();
      const manualCtaLink = ctasUi[0]?.link || (document.getElementById('unified-cta-link') as HTMLInputElement)?.value?.trim();

      finalCtaText = manualCtaText || autoCTA.ctaText;
      finalCtaLink = manualCtaLink || autoCTA.ctaLink;

      if (finalCtaLink) {
        appendLog(`✅ CTA 자동 포함: "${finalCtaText}" → ${finalCtaLink.substring(0, 50)}...`);
      } else {
        appendLog(`⚠️ 연결할 이전 글이 없습니다. CTA 링크 없이 발행됩니다.`);
      }
    } else {
      appendLog(`🚫 CTA 없이 발행 옵션이 선택되었습니다.`);
    }

    // ✅ CTA 위치 고정
    const ctaPosition = ((document.getElementById('unified-cta-position') as HTMLSelectElement | null)?.value as 'top' | 'middle' | 'bottom') || 'bottom';

    // ✅ [2026-03-10 CLEANUP] full-auto-thumbnail-text 유령 참조 제거 → localStorage 단일 소스
    const includeThumbnailText = localStorage.getItem('thumbnailTextInclude') === 'true' ||
      (document.getElementById('thumbnail-text-include') as HTMLInputElement)?.checked || false;
    console.log(`[FullAutoPublish] 썸네일 텍스트 포함: ${includeThumbnailText}`);

    const formData = {
      mode: 'full-auto',
      generator: UnifiedDOMCache.getGenerator(), // ✅ [2026-02-22 FIX] perplexity 지원
      targetAge: 'all',
      toneStyle: (document.getElementById('unified-tone-style') as HTMLInputElement)?.value || 'friendly',
      imageSource,
      skipImages,
      publishMode,
      scheduleDate,
      scheduleType,
      structuredContent,
      urls: urls, // URL 배열 추가
      title: title,
      keywords: keywords,
      // ✅ CTA 설정
      ctaText: finalCtaText,
      ctaLink: finalCtaLink,
      ctas: skipCta ? [] : (ctasUi.length > 0 ? ctasUi : (finalCtaText ? [{ text: finalCtaText, link: finalCtaLink || undefined }] : [])),
      ctaPosition: ctaPosition, // ✅ CTA 위치 추가
      skipCta: skipCta, // ✅ 체크박스 값 반영
      categoryName: UnifiedDOMCache.getRealCategoryName(), // ✅ [2026-02-11 FIX] 카테고리 이름(text) 전달
      useAiImage: (document.getElementById('unified-use-ai-image') as HTMLInputElement)?.checked ?? true,
      includeThumbnailText, // ✅ 옵션 추가
      createProductThumbnail: (document.getElementById('unified-create-product-thumbnail') as HTMLInputElement)?.checked ?? false,
      // ✅ [2026-02-19] 제휴링크 자동 감지 (URL 필드에서 자동 감지)
      affiliateLink: resolveAffiliateLink(
        (document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement)?.value?.trim() || (document.getElementById('batch-link-input') as HTMLInputElement)?.value?.trim() || undefined,
        (document.querySelector('.unified-url-input') as HTMLInputElement)?.value?.trim()
      ),
      customBannerPath: (window as any).customBannerPath || undefined, // ✅ [2026-01-18] 커스텀 배너 경로 전달
      // ✅ [2026-02-19] 쇼핑커넥트 모드 자동 감지: affiliateLink가 있거나 URL이 제휴 URL이면 affiliate 모드
      contentMode: (
        resolveAffiliateLink(
          (document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement)?.value?.trim() || (document.getElementById('batch-link-input') as HTMLInputElement)?.value?.trim() || undefined,
          (document.querySelector('.unified-url-input') as HTMLInputElement)?.value?.trim()
        ) ||
        isShoppingConnectModeActive()
      ) ? 'affiliate' : 'seo',
    };

    // ✅ [2026-02-16 DEBUG] categoryName 전달 상태 진단 (터미널에 출력)
    console.log(`[FullAutoPublish] 📂 categoryName 체크: "${formData.categoryName || '(없음)'}"`);
    if (formData.categoryName) {
      appendLog(`📂 발행 카테고리: "${formData.categoryName}"`);
    } else {
      console.warn('[FullAutoPublish] ⚠️ categoryName이 비어있습니다! 카테고리 분석을 먼저 실행했는지 확인하세요.');
      appendLog('⚠️ 카테고리 미선택 — 기본 카테고리로 발행됩니다.');
    }

    // ✅ 진행상황 모달 업데이트 - 이미지 생성 시작
    modal.setStep(2, 'active', skipImages ? '건너뛰기' : '이미지 생성 중...');
    modal.setProgress(40, skipImages ? '이미지 생성 건너뛰기...' : '이미지 생성 중...');

    // ✅ [2026-01-21] 쇼핑커넥트 모드일 때 제휴 링크에서 제품 이미지 자동 수집
    // ✅ [2026-02-01 FIX] sourceAssembler에서 이미 수집했으면 다시 크롤링하지 않음
    const alreadyCollected = (structuredContent?.collectedImages && structuredContent.collectedImages.length > 0) ||
      (structuredContent?.images && structuredContent.images.length > 0);

    // ✅ [DEBUG] 이미지 수집 조건 로깅
    console.log(`[FullAutoPublish] 🔍 이미지 수집 조건 체크:`, {
      contentMode: formData.contentMode,
      affiliateLink: formData.affiliateLink?.substring(0, 50),
      skipImages,
      alreadyCollected,
      collectedImagesLen: structuredContent?.collectedImages?.length || 0,
      imagesLen: structuredContent?.images?.length || 0
    });

    // ✅ [2026-02-02 NEW] 쇼핑커넥트 모드일 때 상품명과 이미지 정보 로그 표시
    if (formData.contentMode === 'affiliate') {
      const productTitle = structuredContent?.productInfo?.name ||
        structuredContent?.productInfo?.productName ||
        structuredContent?.productName ||
        structuredContent?.selectedTitle?.substring(0, 30) || '상품명 없음';
      const collectedImgCount = (structuredContent?.collectedImages?.length || 0) + (structuredContent?.images?.length || 0);

      modal.addLog(`🛒 쇼핑커넥트 모드`);
      modal.addLog(`📦 상품: ${productTitle}`);
      appendLog(`🛒 쇼핑커넥트 모드 - 상품: ${productTitle}`);

      if (alreadyCollected) {
        modal.addLog(`🖼️ 수집된 이미지: ${collectedImgCount}장`);
        appendLog(`✅ 수집된 이미지: ${collectedImgCount}장 (기존 수집 사용)`);

        // ✅ 모달에 이미지 그리드 표시
        const collectedImages = structuredContent?.collectedImages || structuredContent?.images || [];
        if (collectedImages.length > 0) {
          const imageData = collectedImages.slice(0, 10).map((url: string, idx: number) => ({
            url,
            heading: idx === 0 ? '대표 이미지' : `이미지 ${idx}`
          }));
          modal?.showImages(imageData, `🛒 수집된 상품 이미지 (${collectedImages.length}장)`);
        }
      }
    }

    if (formData.contentMode === 'affiliate' && formData.affiliateLink && !skipImages && !alreadyCollected) {
      modal.addLog('🔄 제품 이미지 수집 시작...');
      appendLog(`🖼️ 제휴 링크에서 제품 이미지 수집 중: ${formData.affiliateLink.substring(0, 50)}...`);

      try {
        const collectResult = await (window as any).api.collectImagesFromShopping(formData.affiliateLink);

        if (collectResult?.success && collectResult.images && collectResult.images.length > 0) {
          modal.addLog(`✅ 제품 이미지 ${collectResult.images.length}개 수집 완료!`);
          appendLog(`✅ 제품 이미지 ${collectResult.images.length}개 수집 완료`);

          // 수집된 이미지를 전역 변수에 저장 (generateImagesForAutomation에서 사용)
          const collectedImages = collectResult.images.map((imgUrl: string, idx: number) => ({
            url: imgUrl,
            filePath: imgUrl,
            heading: `제품 이미지 ${idx + 1}`,
            provider: 'collected'
          }));

          // 기존 이미지와 병합
          const existing = (window as any).imageManagementGeneratedImages || [];
          (window as any).imageManagementGeneratedImages = [...collectedImages, ...existing];
          console.log('[FullAutoPublish] 제품 이미지 수집 완료:', collectedImages.length);

          // ✅ [2026-02-27 FIX] 수집된 이미지를 이미지 관리탭에 즈시 표시
          try {
            displayGeneratedImages([...collectedImages, ...existing]);
            updatePromptItemsWithImages([...collectedImages, ...existing]);
          } catch (displayErr) {
            console.warn('[FullAutoPublish] 이미지 표시 실패 (무시):', (displayErr as Error).message);
          }

          // ✅ [2026-01-21 FIX] currentStructuredContent.images에도 저장 (generateImagesWithCostSafety에서 참조)
          if (structuredContent) {
            structuredContent.images = [...collectedImages, ...(structuredContent.images || [])];
            // ✅ [2026-02-01 FIX] collectedImages에도 저장하여 generateAIImagesForHeadings에서 중복 크롤링 방지
            structuredContent.collectedImages = [...collectedImages, ...(structuredContent.collectedImages || [])];
            currentStructuredContent = structuredContent;
            (window as any).currentStructuredContent = structuredContent;
            console.log('[FullAutoPublish] structuredContent.images/collectedImages에 수집 이미지 동기화:', structuredContent.images.length);
          }

          // 제품 정보가 있으면 콘텐츠 보완에 활용
          if (collectResult.productInfo) {
            modal.addLog(`📦 제품명: ${collectResult.productInfo.name || '알 수 없음'}`);
            // ✅ [2026-02-23 FIX] 제품 정보(가격 포함)를 structuredContent에 저장 → 스펙 표 생성 시 활용
            if (structuredContent) {
              (structuredContent as any).productInfo = collectResult.productInfo;
            }
            (window as any).crawledProductInfo = collectResult.productInfo;
            console.log('[FullAutoPublish] 제품 정보 저장:', JSON.stringify({
              name: collectResult.productInfo.name,
              price: collectResult.productInfo.price || collectResult.productInfo.lprice,
            }));
          }
        } else {
          modal.addLog('⚠️ 제품 이미지 수집 실패 - AI 이미지로 대체합니다');
          appendLog('⚠️ 제품 이미지 수집 실패 - AI 이미지 생성으로 진행');
        }
      } catch (collectError) {
        console.error('[FullAutoPublish] 제품 이미지 수집 오류:', collectError);
        modal.addLog(`⚠️ 이미지 수집 오류: ${(collectError as Error).message?.substring(0, 50)}`);
        appendLog('⚠️ 제품 이미지 수집 중 오류 발생 - AI 이미지로 대체');
      }
    }

    // ✅ [2026-01-31 FIX] 쇼핑커넥트 모드: 소스 URL(콘텐츠 URL)에서도 이미지 추가 수집
    // ✅ [2026-02-01 FIX] 이미 수집된 이미지가 있으면 건너뛰기 (중복 크롤링 방지)
    const hasExistingImages = alreadyCollected ||
      ((window as any).imageManagementGeneratedImages?.length > 0) ||
      (structuredContent?.images?.length > 0);

    if (formData.contentMode === 'affiliate' && formData.urls && formData.urls.length > 0 && !skipImages && !hasExistingImages) {
      const sourceUrl = formData.urls[0];
      if (sourceUrl && sourceUrl !== formData.affiliateLink) {
        modal.addLog(`📰 콘텐츠 URL에서 추가 이미지 수집 중: ${sourceUrl.substring(0, 40)}...`);
        try {
          // URL 유형에 따라 다른 수집기 사용
          const isShoppingUrl = /smartstore\.naver\.com|brand\.naver\.com|coupa\.ng|coupang\.com|11st\.co\.kr|gmarket\.co\.kr/i.test(sourceUrl);

          let sourceImages: string[] = [];
          if (isShoppingUrl) {
            const result = await (window as any).api.collectImagesFromShopping(sourceUrl);
            sourceImages = result?.images || [];
          } else {
            // 일반 URL (블로그, 뉴스 등)에서 이미지 크롤링
            const result = await (window as any).api.crawlImagesFromUrl(sourceUrl);
            sourceImages = result?.images || [];
          }

          if (sourceImages.length > 0) {
            modal.addLog(`✅ 소스 URL에서 추가 ${sourceImages.length}개 이미지 수집!`);

            // 기존 수집 이미지와 병합 (중복 제거)
            const existing = (window as any).imageManagementGeneratedImages || [];
            const existingUrls = new Set(existing.map((img: any) => img.url || img.filePath));

            const newImages = sourceImages
              .filter((imgUrl: string) => !existingUrls.has(imgUrl))
              .map((imgUrl: string, idx: number) => ({
                url: imgUrl,
                filePath: imgUrl,
                heading: `소스 이미지 ${idx + 1}`,
                provider: 'collected'
              }));

            (window as any).imageManagementGeneratedImages = [...existing, ...newImages];
            console.log(`[FullAutoPublish] 소스 URL 이미지 ${newImages.length}개 추가 (총 ${(window as any).imageManagementGeneratedImages.length}개)`);

            // structuredContent에도 동기화
            if (structuredContent) {
              structuredContent.images = [...(structuredContent.images || []), ...newImages];
              // ✅ [2026-02-01 FIX] collectedImages에도 동기화
              structuredContent.collectedImages = [...(structuredContent.collectedImages || []), ...newImages];
              (window as any).currentStructuredContent = structuredContent;
            }

            // ✅ [2026-02-27 FIX] 추가 수집 이미지도 이미지 관리탭에 표시
            try {
              displayGeneratedImages((window as any).imageManagementGeneratedImages);
              updatePromptItemsWithImages((window as any).imageManagementGeneratedImages);
            } catch (displayErr) {
              console.warn('[FullAutoPublish] 이미지 표시 실패 (무시):', (displayErr as Error).message);
            }
          } else {
            modal.addLog('ℹ️ 소스 URL에서 추가 이미지 없음');
          }
        } catch (sourceErr) {
          console.warn('[FullAutoPublish] 소스 URL 이미지 수집 실패:', sourceErr);
          modal.addLog(`⚠️ 소스 URL 이미지 수집 실패: ${(sourceErr as Error).message?.substring(0, 30)}`);
        }
      }
    }
    // ✅ 이미지 생성 및 소분류 매칭
    if (!skipImages) {
      modal.addLog('🎨 이미지 처리 시작...');
      try {
        // ✅ [2026-02-02 FIX] collectedImgs 소스 우선순위 수정
        // 1순위: structuredContent.collectedImages (쇼핑 크롤링 이미지)
        // 2순위: window.imageManagementGeneratedImages
        // 3순위: window.generatedImages
        const structCollected = structuredContent?.collectedImages || [];
        const windowImgs = (window as any).imageManagementGeneratedImages || (window as any).generatedImages || [];
        const collectedImgs = structCollected.length > 0 ? structCollected : windowImgs;
        console.log(`[FullAutoPublish] 🖼️ 이미지 소스: structCollected=${structCollected.length}, windowImgs=${windowImgs.length}, 최종=${collectedImgs.length}`);
        let referenceImagePath = '';

        // 1. 수집된 이미지와 소제목 매칭 (지능형 매칭)
        // ✅ [2026-02-07 FIX] AI 이미지 생성 모드에서는 수집 이미지 매칭 스킵!
        // → AI 이미지 생성을 선택한 경우 수집 이미지 매칭은 불필요하고 혼란만 줌
        const scSubImageSourcePre = localStorage.getItem('scSubImageSource') || 'ai';
        const shouldMatchCollected = !formData.useAiImage ||
          (formData.contentMode === 'affiliate' && scSubImageSourcePre === 'collected');

        if (shouldMatchCollected && collectedImgs.length > 0 && (structuredContent.headings || []).length > 0) {
          modal.addLog('🤖 수집 이미지를 소제목에 매칭 중...');
          try {
            const matchResult = await (window as any).api.matchImages({
              headings: structuredContent.headings || [],
              collectedImages: collectedImgs,
              // ✅ [2026-01-28] 수집 이미지 직접 사용 설정 전달 (localStorage에서 읽음)
              scSubImageSource: localStorage.getItem('scSubImageSource') || 'ai'
            });
            if (matchResult.success && matchResult.assignments) {
              matchResult.assignments.forEach((assignment: any) => {
                const headIdx = assignment.headingIndex;
                const targetHeading = (structuredContent.headings || [])[headIdx];
                if (targetHeading) {
                  // ✅ [2026-01-28] 메인 프로세스 반환 구조에 맞게 수정
                  // main.ts에서 imageUrl, imagePath 직접 반환함
                  targetHeading.referenceImagePath = assignment.imageUrl || assignment.imagePath;
                  modal.addLog(`   🔗 "${targetHeading.title.substring(0, 15)}..." → 이미지 배치 완료 (${assignment.source || 'collected'})`);
                }
              });
              modal.addLog(`✅ 총 ${matchResult.assignments.length}개 소제목에 이미지 배치 완료`);
            }
          } catch (e) {
            console.error('이미지 매칭 실패:', e);
          }

          // 전역 폴백용 첫 번째 이미지
          const first = collectedImgs[0];
          referenceImagePath = first.filePath || first.url;
        } else if (formData.useAiImage && collectedImgs.length > 0) {
          console.log(`[FullAutoPublish] 🎨 AI 이미지 생성 모드 → 수집 이미지 매칭 스킵 (${collectedImgs.length}개 수집 이미지 무시)`);
        }

        let generatedImgs: any[] = [];

        // ✅ [2026-01-31 FIX] 쇼핑커넥트 모드에서 "수집 이미지 사용" 설정 확인
        const scSubImageSource = localStorage.getItem('scSubImageSource') || 'ai';
        const isShoppingConnectCollected = formData.contentMode === 'affiliate' && scSubImageSource === 'collected';

        if (isShoppingConnectCollected) {
          console.log('[FullAutoPublish] 🛒 쇼핑커넥트 수집 이미지 모드 → AI 생성 스킵');
        }

        if (formData.useAiImage && !isShoppingConnectCollected) {
          // ✅ A. AI 이미지 생성 모드
          // ✅ [2026-02-02 FIX] 쇼핑커넥트 모드에서도 썸네일/1번 소제목 중복 방지!
          // 썸네일은 collectedImgs[0] 사용, AI 생성은 나머지 소제목에만 적용
          if (formData.contentMode === 'affiliate' && collectedImgs.length > 0) {
            // ✅ 쇼핑커넥트 AI 모드: 썸네일은 수집 이미지, 나머지는 AI 생성
            modal.addLog('🛒 쇼핑커넥트 AI 모드: 썸네일=수집이미지, 소제목=AI');

            // 1. 썸네일 처리 (collectedImgs[0])
            const thumbnailImg = collectedImgs[0];
            // ✅ [2026-02-02 FIX] 문자열 URL이든 객체든 모두 처리
            const thumbnailPath = typeof thumbnailImg === 'string'
              ? thumbnailImg
              : (thumbnailImg?.filePath || thumbnailImg?.url || '');
            console.log('[쇼핑커넥트 AI 모드] 썸네일 경로:', thumbnailPath?.substring(0, 50));

            if (thumbnailPath) {
              if (formData.includeThumbnailText) {
                modal.addLog('🎨 수집 이미지에 텍스트 오버레이 중...');
                try {
                  // ✅ [2026-02-04 FIX] 수집 이미지 URL에 직접 텍스트 오버레이
                  // generateImagesForAutomation은 AI 이미지 생성 함수이므로 부적합
                  // 대신 thumbnailService.createProductThumbnail을 직접 호출
                  const overlayResult = await window.api.createProductThumbnail(
                    thumbnailPath,  // 수집 이미지 URL
                    structuredContent.selectedTitle || title,  // 오버레이할 텍스트
                    {
                      position: 'bottom',
                      fontSize: 28,
                      textColor: '#ffffff',
                      opacity: 0.8
                    }
                  );

                  if (overlayResult && overlayResult.success && overlayResult.outputPath) {
                    generatedImgs.push({
                      heading: structuredContent.selectedTitle || title,
                      filePath: overlayResult.outputPath,
                      provider: 'collected-overlay',
                      savedToLocal: overlayResult.outputPath,
                      previewDataUrl: overlayResult.previewDataUrl,
                      isThumbnail: true
                    });
                    modal.addLog(`✅ 썸네일 텍스트 오버레이 완료`);
                  } else {
                    // 오버레이 실패 시 원본 이미지 사용
                    modal.addLog(`⚠️ 텍스트 오버레이 실패 → 원본 이미지 사용`);
                    generatedImgs.push({
                      heading: structuredContent.selectedTitle || title,
                      filePath: thumbnailPath,
                      provider: 'collected',
                      savedToLocal: thumbnailPath,
                      isThumbnail: true
                    });
                  }
                } catch (err) {
                  console.error('[FullAutoPublish] 썸네일 오버레이 오류:', err);
                  modal.addLog(`⚠️ 오버레이 오류 → 원본 이미지 사용`);
                  generatedImgs.push({
                    heading: structuredContent.selectedTitle || title,
                    filePath: thumbnailPath,
                    provider: 'collected',
                    savedToLocal: thumbnailPath,
                    isThumbnail: true
                  });
                }
              } else {
                generatedImgs.push({
                  heading: structuredContent.selectedTitle || title,
                  filePath: thumbnailPath,
                  provider: 'collected',
                  savedToLocal: thumbnailPath,
                  isThumbnail: true
                });
                modal.addLog(`📷 썸네일 이미지 배치 완료 (수집 이미지)`);
              }
            }

            // 2. 나머지 소제목은 AI 이미지 생성 (1번 소제목부터)
            const headingsForAI = structuredContent.headings || [];
            if (headingsForAI.length > 0) {
              modal.addLog(`🎨 ${headingsForAI.length}개 소제목 AI 이미지 생성 시작...`);
              const aiImgs = await generateImagesForAutomation(
                imageSource,
                headingsForAI,
                structuredContent.selectedTitle || title,
                {
                  stopCheck: () => isFullAutoStopRequested(modal),
                  onProgress: (msg: any) => modal.addLog(msg),
                  allowThumbnailText: false, // 소제목에는 텍스트 합성 안 함
                  // ✅ [2026-02-02 FIX] 문자열 URL도 처리
                  referenceImagePath: typeof collectedImgs[1] === 'string'
                    ? collectedImgs[1]
                    : (collectedImgs[1]?.filePath || collectedImgs[1]?.url || referenceImagePath),
                  collectedImages: collectedImgs.slice(1) // 썸네일 제외한 이미지
                }
              );
              generatedImgs.push(...aiImgs);
            }
          } else {
            // ✅ 일반 SEO 모드: 기존 로직 그대로
            // ✅ [2026-02-24 FIX] 서론이 있으면 썸네일 섹션을 맨 앞에 별도 추가
            const seoHeadings = structuredContent.introduction
              ? [{ title: structuredContent.selectedTitle || '🖼️ 썸네일', content: structuredContent.introduction, isThumbnail: true, isIntro: true }, ...(structuredContent.headings || [])]
              : (structuredContent.headings || []);
            generatedImgs = await generateImagesForAutomation(
              imageSource,
              seoHeadings,
              structuredContent.selectedTitle || title,
              {
                stopCheck: () => isFullAutoStopRequested(modal),
                onProgress: (msg: any) => modal.addLog(msg),
                allowThumbnailText: formData.includeThumbnailText,
                referenceImagePath,
                collectedImages: collectedImgs
              }
            );
          }
        } else if (isShoppingConnectCollected || collectedImgs.length > 0) {
          // ✅ B. 수집 이미지 그대로 사용 모드 (통일된 로직)
          modal.addLog('📷 AI 생성 대신 수집된 이미지를 그대로 사용합니다.');

          // ✅ [2026-02-02 FIX] 썸네일 전용 이미지 별도 예약! 1번 소제목은 다른 이미지 사용
          // collectedImgs[0] = 썸네일 전용
          // collectedImgs[1+] = 소제목용 이미지
          // includeThumbnailText가 켜져 있으면 썸네일 이미지에만 텍스트 합성
          const usedImagePaths = new Set<string>();
          const headingsArray = structuredContent.headings || [];

          // ✅ 썸네일 이미지 처리 (collectedImgs[0])
          const thumbnailImg = collectedImgs[0];
          // ✅ [2026-02-02 FIX] 문자열 URL이든 객체든 모두 처리
          const thumbnailPath = typeof thumbnailImg === 'string'
            ? thumbnailImg
            : (thumbnailImg?.filePath || thumbnailImg?.url || '');
          if (thumbnailPath) {
            usedImagePaths.add(thumbnailPath);

            // ✅ [2026-03-16 FIX] 수집 이미지 모드(B 경로)에서도 텍스트 오버레이 적용!
            // 기존: "향후 처리"로 방치 → 텍스트 오버레이 누락 버그
            // 수정: A 경로(line 587-635)와 동일하게 createProductThumbnail IPC 호출
            if (formData.includeThumbnailText) {
              modal.addLog('🎨 [B경로] 수집 이미지에 텍스트 오버레이 중...');
              try {
                const overlayResult = await window.api.createProductThumbnail(
                  thumbnailPath,
                  structuredContent.selectedTitle || title,
                  {
                    position: 'bottom',
                    fontSize: 28,
                    textColor: '#ffffff',
                    opacity: 0.8
                  }
                );

                if (overlayResult && overlayResult.success && overlayResult.outputPath) {
                  generatedImgs.push({
                    heading: structuredContent.selectedTitle || title,
                    filePath: overlayResult.outputPath,
                    provider: 'collected-overlay',
                    savedToLocal: overlayResult.outputPath,
                    previewDataUrl: overlayResult.previewDataUrl,
                    isThumbnail: true
                  });
                  modal.addLog(`✅ [B경로] 썸네일 텍스트 오버레이 완료`);
                } else {
                  // 오버레이 실패 시 원본 이미지 사용
                  modal.addLog(`⚠️ [B경로] 텍스트 오버레이 실패 → 원본 이미지 사용`);
                  generatedImgs.push({
                    heading: structuredContent.selectedTitle || title,
                    filePath: thumbnailPath,
                    provider: 'collected',
                    savedToLocal: thumbnailPath,
                    isThumbnail: true
                  });
                }
              } catch (err) {
                console.error('[FullAutoPublish] [B경로] 썸네일 오버레이 오류:', err);
                modal.addLog(`⚠️ [B경로] 오버레이 오류 → 원본 이미지 사용`);
                generatedImgs.push({
                  heading: structuredContent.selectedTitle || title,
                  filePath: thumbnailPath,
                  provider: 'collected',
                  savedToLocal: thumbnailPath,
                  isThumbnail: true
                });
              }
            } else {
              generatedImgs.push({
                heading: structuredContent.selectedTitle || title,
                filePath: thumbnailPath,
                provider: 'collected',
                savedToLocal: thumbnailPath,
                isThumbnail: true
              });
              modal.addLog(`✅ [쇼핑제휴] 썸네일 이미지 설정: ${thumbnailPath.substring(0, 60)}...`);
            }
          }

          // ✅ 소제목용 이미지는 collectedImgs[1]부터 시작 (썸네일과 중복 방지!)
          const headingImages = collectedImgs.slice(1);
          let headingImgIdx = 0;

          for (let idx = 0; idx < headingsArray.length; idx++) {
            const h = headingsArray[idx];
            // 1. 소제목에 미리 매핑된 이미지 경로가 있으면 사용
            let path = h.referenceImagePath || '';

            // 2. 매핑된 경로가 없으면 headingImages (collectedImgs[1+])에서 순차 할당
            // ✅ [2026-02-23 FIX] 중복 이미지 발견 시 headingImgIdx를 증가시켜 다음 이미지 시도
            // 이전: 중복 발견 시 headingImgIdx가 그대로여서 무한 정체 → 1번 소제목 공란 버그
            while (!path && headingImgIdx < headingImages.length) {
              const candidate = headingImages[headingImgIdx];
              // ✅ [2026-02-02 FIX] 문자열 URL도 처리
              const candidatePath = typeof candidate === 'string'
                ? candidate
                : (candidate?.filePath || candidate?.url || '');
              headingImgIdx++; // ✅ 항상 증가 (중복이든 아니든 다음 이미지로 이동)
              if (candidatePath && !usedImagePaths.has(candidatePath)) {
                path = candidatePath;
                break;
              } else if (candidatePath) {
                console.log(`[쇼핑제휴] ⏭️ 중복 이미지 스킵하고 다음 시도: ${candidatePath.substring(0, 40)}...`);
              }
            }

            // 3. 이미 사용된 이미지는 스킵
            if (path && usedImagePaths.has(path)) {
              modal.addLog(`⏭️ "${h.title?.substring(0, 15)}..." 중복 이미지 스킵`);
              continue;
            }

            if (path) {
              usedImagePaths.add(path);

              // ✅ [2026-02-02 FIX] 소제목 이미지는 모두 동일하게 처리 (썸네일은 위에서 별도 처리됨)
              generatedImgs.push({
                heading: h.title || h.heading || '',
                filePath: path,
                provider: 'manual',
                savedToLocal: path,
                isThumbnail: false // 소제목 이미지는 썸네일이 아님
              });
              modal.addLog(`📷 ${idx + 1}번 소제목 이미지 배치: "${h.title?.substring(0, 15)}..."`);
            } else {
              // 이미지가 부족하면 해당 소제목은 이미지 없이 처리
              modal.addLog(`⚠️ "${h.title?.substring(0, 15)}..." 이미지 부족 - 건너뛰기`);
            }
          }
        }

        if (isFullAutoStopRequested(modal)) {
          appendLog('⏹️ 사용자가 풀오토 발행을 중지했습니다.');
          return;
        }

        // 전역 변수 설정 (executeUnifiedAutomation에서 사용)
        (window as any).generatedImages = generatedImgs;

        // ✅ [2026-02-12 P1 FIX #23] ImageManager 동기화 → syncGlobal 호출
        if (typeof ImageManager !== 'undefined') {
          ImageManager.clear();
          if (generatedImgs && generatedImgs.length > 0) {
            generatedImgs.forEach((img: any) => {
              const h = img.heading || structuredContent.selectedTitle;
              if (h) ImageManager.addImage(h, img);
            });
          }
          try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }
        }

        if (generatedImgs.length > 0) {
          modal.addLog(`✅ 이미지 처리 완료 (${generatedImgs.length}장)`);

          // ✅ [신규] 생성된 이미지를 structuredContent에 저장하고 글 목록 업데이트
          structuredContent.images = generatedImgs;
          saveGeneratedPost(structuredContent, true); // isUpdate=true로 업데이트
          modal.addLog(`💾 이미지 포함하여 글 목록에 저장 완료`);
        } else {
          // ✅ [2026-03-09 FIX] 이미지 생성이 전부 실패하면 발행 중단
          // 기존: 로그만 남기고 발행 진행 → '파일 전송 오류' 발생
          modal.addLog('❌ 이미지 생성에 실패했습니다. 발행을 중단합니다.');
          appendLog('❌ 이미지 생성 실패: 성공적으로 생성된 이미지가 없습니다.');
          throw new Error('이미지 생성에 실패했습니다. 모든 이미지가 생성되지 않아 발행을 중단합니다.\n\n해결 방법:\n1. 이미지 생성 엔진 설정을 확인해주세요\n2. API 키가 올바른지 확인해주세요\n3. 네트워크 연결을 확인해주세요\n4. "이미지 없이 발행" 옵션을 사용할 수도 있습니다');
        }

      } catch (imgErr) {
        console.error('이미지 처리 실패:', imgErr);
        modal.addLog(`❌ 이미지 처리 오류: ${(imgErr as Error).message}`);
        // ✅ [2026-03-09 FIX] 이미지 처리 실패 시 발행 중단 (기존: catch에서 에러 삼키고 발행 계속 진행)
        appendLog(`❌ 이미지 처리 실패로 발행을 중단합니다: ${(imgErr as Error).message}`);
        throw imgErr;
      }
    } else {
      modal.addLog('⏭️ 이미지 삽입 건너뛰기 (설정)');
    }

    // ✅ [2026-03-11] 발행 직전 ADB IP 변경 (단일 풀오토)
    try {
      const adbEnabled = localStorage.getItem('adbIpChangeEnabled') === 'true';
      if (adbEnabled) {
        modal.addLog('📱 ADB 비행기모드 IP 변경 중...');
        modal.setProgress(90, '📱 IP 변경 중...');
        appendLog('📱 ADB IP 변경 시작 (단일 풀오토 발행 전)...');
        const adbResult = await (window as any).api.adbChangeIp(5);
        if (adbResult.success) {
          modal.addLog(`✅ IP 변경 성공: ${adbResult.oldIp} → ${adbResult.newIp}`);
          appendLog(`✅ IP 변경 완료: ${adbResult.oldIp} → ${adbResult.newIp}`);
        } else {
          modal.addLog(`⚠️ IP 변경 실패: ${adbResult.message}`);
          appendLog(`⚠️ IP 변경 실패: ${adbResult.message}`);
        }
      }
    } catch (adbErr) {
      console.error('[FullAutoPublish] ADB IP 변경 오류:', adbErr);
      modal.addLog(`⚠️ IP 변경 오류: ${(adbErr as Error).message}`);
      appendLog(`⚠️ ADB IP 변경 오류: ${(adbErr as Error).message}`);
      // IP 변경 실패해도 발행은 계속 진행
    }

    // 자동화 실행 (이미지 생성 + 로그인 + 발행 포함)
    // executeUnifiedAutomation 내부에서 진행상황 업데이트를 위해 modal 전달
    (window as any).currentProgressModal = modal;
    await executeUnifiedAutomation(formData);

    if (isFullAutoStopRequested(modal)) {
      appendLog('⏹️ 사용자가 풀오토 발행을 중지했습니다.');
      modal.showError('⏹️ 발행 중지', '사용자가 발행을 중지했습니다.');
      return;
    }

    // ✅ 발행 성공
    modal.showSuccess('🎉 발행 완료!', '블로그 글이 성공적으로 발행되었습니다.');

  } catch (error) {
    appendLog(`❌ 풀오토 발행 실패: ${(error as Error).message}`);
    // ✅ 진행상황 모달 에러 표시
    modal.showError('❌ 발행 실패', (error as Error).message);
    throw error;
  }
}

// 다중계정 순차 발행 처리
export async function handleMultiAccountPublish(): Promise<void> {
  const selectedAccountIds = (window as any).getInlineSelectedAccounts?.() || [];
  const intervalSeconds = (window as any).getInlineInterval?.() || 30;

  // ✅ [2026-03-11 FIX] 연속발행 모드가 아닐 때만 중지 플래그 리셋
  // 연속발행 중에는 중지 버튼이 무효화되지 않도록 보호
  if (!(window as any).isContinuousMode) {
    (window as any).stopFullAutoPublish = false;
  }

  if (selectedAccountIds.length === 0) {
    alert('발행할 계정을 선택해주세요. (다중계정 탭에서 계정 선택)');
    return;
  }
  // ✅ [2026-02-16 FIX] 다중계정 발행 전 API 키 체크 — 이미 로드된 이미지가 있으면 건너뛰기
  const firstSelectedBtn = (document.querySelector('.image-source-btn.selected') || document.querySelector('.unified-img-source-btn.selected')) as HTMLButtonElement;
  const commonImageSource = firstSelectedBtn?.dataset.source || 'nano-banana-pro';
  const maPreloadedImages = ImageManager.getAllImages();
  const maHasPreloadedImages = maPreloadedImages && maPreloadedImages.length > 0;

  if (!maHasPreloadedImages && (commonImageSource === 'openai-image' || commonImageSource === 'leonardoai')) {
    const config = await window.api.getConfig();
    if (commonImageSource === 'openai-image' && !(config as any)?.openaiImageApiKey) {
      alert('OpenAI Image API 키가 설정되지 않았습니다. 환경설정에서 API 키를 입력해주세요.');
      return;
    }
    if (commonImageSource === 'leonardoai' && !(config as any)?.leonardoaiApiKey) {
      alert('Leonardo AI API 키가 설정되지 않았습니다. 환경설정에서 API 키를 입력해주세요.');
      return;
    }

  }

  // 진행 상태 표시
  const modal = getProgressModal();
  modal.show('다중 계정 순차 발행 중...', `총 ${selectedAccountIds.length}개 계정 진행`);

  appendLog(`🚀 다중계정 순차 발행 시작: ${selectedAccountIds.length}개 계정`);

  // ✅ [2026-01-20] 다중계정 발행 프리셋 썸네일 적용
  const maPreset = applyPresetThumbnailIfExists('ma-semi-auto') || applyPresetThumbnailIfExists('ma-full-auto');
  if (maPreset && maPreset.applied) {
    // 전역 변수에 프리셋 썸네일 저장 (발행 시 사용)
    (window as any).maPresetThumbnail = maPreset.forHeading;
    (window as any).maPresetThumbnailPath = maPreset.forThumbnail;
    appendLog('🎨 미리 세팅된 썸네일이 다중계정 발행에 적용됩니다!');
  }

  // 메인 화면의 현재 세팅 수집
  const mainSettings = {
    title: (document.getElementById('unified-title') as HTMLInputElement)?.value || '',
    keywords: (document.getElementById('unified-keywords') as HTMLInputElement)?.value || '',
    url: (document.querySelector('.unified-url-input') as HTMLInputElement)?.value || '',
    generator: UnifiedDOMCache.getGenerator(),
    imageSource: UnifiedDOMCache.getImageSource() || 'nano-banana-pro',
    toneStyle: (document.getElementById('unified-tone-style') as HTMLInputElement)?.value || 'friendly',
    useAiImage: (document.getElementById('unified-use-ai-image') as HTMLInputElement)?.checked ?? true,
    createProductThumbnail: (document.getElementById('unified-create-product-thumbnail') as HTMLInputElement)?.checked ?? false,
    contentMode: (document.getElementById('unified-content-mode') as HTMLInputElement)?.value || 'seo',
    // ✅ [2026-02-19] 다중계정: 제휴링크 자동 감지
    affiliateLink: resolveAffiliateLink(
      (document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement)?.value?.trim() || (document.getElementById('batch-link-input') as HTMLInputElement)?.value?.trim() || undefined,
      (document.querySelector('.unified-url-input') as HTMLInputElement)?.value?.trim()
    ) || '',
    customBannerPath: (window as any).customBannerPath || undefined, // ✅ [2026-01-18] 커스텀 배너 경로 전달
    // ✅ UI에서 발행 방식 읽기 (즉시/임시/예약) - 동기화 수정
    publishMode: (document.getElementById('unified-publish-mode') as HTMLInputElement)?.value || 'publish',
    generatedTitle: (document.getElementById('unified-generated-title') as HTMLInputElement)?.value || '',
    generatedContent: (document.getElementById('unified-generated-content') as HTMLTextAreaElement)?.value || '',
    generatedHashtags: (document.getElementById('unified-generated-hashtags') as HTMLInputElement)?.value || '',
    category: UnifiedDOMCache.getRealCategory() || undefined, // ✅ 카테고리 추가
    // ✅ [2026-01-28] 이미지 설정 전역 적용 (연속발행/다중계정에도 적용)
    scSubImageSource: localStorage.getItem('scSubImageSource') || 'ai',  // 수집 이미지 직접 사용 여부
    thumbnailImageRatio: localStorage.getItem('thumbnailImageRatio') || '1:1',  // 썸네일 비율
    subheadingImageRatio: localStorage.getItem('subheadingImageRatio') || '1:1',  // 소제목 비율
    thumbnailTextInclude: localStorage.getItem('thumbnailTextInclude') === 'true',  // 썸네일 텍스트
    scAutoThumbnailSetting: localStorage.getItem('scAutoThumbnailSetting') === 'true',  // 자동 썸네일
  };

  // ✅ [2026-03-11 FIX] datetime-local 값에서 날짜+시간 모두 추출 (기존: 날짜만 추출하여 시간 손실)
  const rawScheduleDate = mainSettings.publishMode === 'schedule' ? (document.getElementById('unified-schedule-date') as HTMLInputElement)?.value : undefined;
  let scheduleDate: string | undefined;
  let scheduleTimeFromInput: string | undefined;
  if (rawScheduleDate) {
    if (rawScheduleDate.includes('T')) {
      const parts = rawScheduleDate.split('T');
      scheduleDate = parts[0]; // YYYY-MM-DD
      scheduleTimeFromInput = parts[1]?.substring(0, 5); // HH:mm
    } else if (rawScheduleDate.includes(' ')) {
      const parts = rawScheduleDate.split(' ');
      scheduleDate = parts[0];
      scheduleTimeFromInput = parts[1]?.substring(0, 5);
    } else {
      scheduleDate = rawScheduleDate; // 날짜만 있는 경우
    }
  }
  console.log(`[다중계정] datetime-local 파싱: scheduleDate=${scheduleDate}, scheduleTimeFromInput=${scheduleTimeFromInput}`);
  const scheduleType = mainSettings.publishMode === 'schedule' ? ((document.getElementById('unified-schedule-type') as HTMLSelectElement)?.value as 'app-schedule' | 'naver-server' || 'naver-server') : undefined;

  const ctasUi = readUnifiedCtasFromUi();
  const skipCta = (document.getElementById('unified-skip-cta') as HTMLInputElement)?.checked || false;
  const ctaPosition = ((document.getElementById('unified-cta-position') as HTMLSelectElement | null)?.value as 'top' | 'middle' | 'bottom') || 'bottom';
  const preferredTitle = String(mainSettings.generatedTitle || mainSettings.title || '').trim();

  // 콘텐츠 소스 확인
  if (!mainSettings.title && !mainSettings.keywords && !mainSettings.url && !mainSettings.generatedContent) {
    alert('메인 화면에서 키워드, URL 또는 생성된 콘텐츠를 먼저 설정해주세요.');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  const waitInterruptible = async (seconds: number) => {
    const ms = Math.max(0, Math.floor(seconds * 1000));
    const start = Date.now();
    while (Date.now() - start < ms) {
      if ((window as any).stopFullAutoPublish === true) return false;
      await new Promise((r) => setTimeout(r, 200));
    }
    return true;
  };

  for (let i = 0; i < selectedAccountIds.length; i++) {
    if ((window as any).stopFullAutoPublish === true) {
      appendLog('⏹️ 사용자가 다중계정 발행을 중지했습니다.');
      return;
    }
    const accountId = selectedAccountIds[i];

    try {
      // 계정 정보 가져오기
      const allAccounts = await window.api.getAllBlogAccounts();
      const account = allAccounts.accounts?.find((a: any) => a.id === accountId);

      if (!account) {
        appendLog(`❌ [${i + 1}/${selectedAccountIds.length}] 계정을 찾을 수 없습니다.`);
        failCount++;
        continue;
      }

      appendLog(`📝 [${i + 1}/${selectedAccountIds.length}] ${account.name} 계정 발행 시작...`);

      // 계정 자격 증명 가져오기
      const credResult = await window.api.getAccountCredentials(accountId);
      if (!credResult.success || !credResult.credentials) {
        appendLog(`❌ [${i + 1}/${selectedAccountIds.length}] ${account.name}: 자격 증명을 가져올 수 없습니다.`);
        failCount++;
        continue;
      }

      // 발행 옵션 구성
      // ✅ [2026-01-20] scheduleInterval, scheduleTime 추가 - 순차 예약 지원
      // 다중계정 전용 UI 또는 연속 발행 일괄 예약 설정 UI 참조
      const intervalEl = document.getElementById('unified-schedule-interval') ||
        document.getElementById('continuous-modal-schedule-interval');
      const intervalUnitEl = document.getElementById('unified-schedule-interval-unit') ||
        document.getElementById('continuous-modal-schedule-interval-unit');
      const timeEl = document.getElementById('unified-schedule-time') ||
        document.getElementById('continuous-modal-schedule-time');

      const intervalValue = parseInt((intervalEl as HTMLInputElement)?.value || '1');
      const intervalUnit = parseInt((intervalUnitEl as HTMLSelectElement)?.value || '360');  // 기본 6시간
      const scheduleIntervalValue = intervalValue * intervalUnit;
      // ✅ [2026-03-11 FIX] datetime-local에서 추출된 시간 → 별도 시간 DOM → 09:00 폴백 순으로 우선
      const scheduleTimeValue = scheduleTimeFromInput || (timeEl as HTMLInputElement)?.value || '09:00';

      // ✅ [2026-01-20] 랜덤 편차 On/Off 옵션 (체크박스 또는 기본값 true)
      const randomOffsetEl = document.getElementById('unified-schedule-random-offset') ||
        document.getElementById('continuous-modal-schedule-random-offset');
      const useRandomOffset = (randomOffsetEl as HTMLInputElement)?.checked ?? true;  // 기본값: 랜덤 사용

      console.log(`[다중계정] 순차 예약 간격: ${scheduleIntervalValue}분, 시작 시간: ${scheduleTimeValue}, 랜덤: ${useRandomOffset}`);

      // ✅ [2026-03-18 FIX] renderer에서 이미 생성된 이미지를 publishOptions에 포함
      // main.ts L5958 (직접 경로) + L5972 (preGeneratedContent 내부 경로) 양쪽 활성화
      const maImages = ImageManager.getAllImages();
      const normalizedImagesForMultiAccount = (Array.isArray(maImages) ? maImages : [])
        .map((img: any) => ({
          ...img,
          filePath: img?.filePath || img?.url || img?.previewDataUrl,
        }))
        .filter((img: any) => Boolean(img?.filePath));

      const publishOptions = {
        naverId: credResult.credentials.naverId,
        naverPassword: credResult.credentials.naverPassword,
        url: mainSettings.url,
        keywords: mainSettings.keywords,
        title: preferredTitle || undefined,
        generator: mainSettings.generator,
        imageSource: mainSettings.imageSource,
        toneStyle: mainSettings.toneStyle,
        publishMode: mainSettings.publishMode,
        scheduleDate,
        scheduleTime: scheduleTimeValue,  // ✅ 예약 시간
        scheduleInterval: scheduleIntervalValue,  // ✅ 순차 예약 간격 (분)
        scheduleRandomOffset: useRandomOffset,  // ✅ 랜덤 편차 On/Off
        scheduleType,
        category: mainSettings.category, // ✅ 카테고리 전달
        useAiImage: mainSettings.useAiImage,
        createProductThumbnail: mainSettings.createProductThumbnail,
        contentMode: mainSettings.contentMode,
        affiliateLink: mainSettings.affiliateLink,
        // ✅ CTA 설정 (main 프로세스 경로에서도 동일하게 전달)
        skipCta,
        ctaPosition,
        ctas: skipCta ? [] : ctasUi,
        ctaText: skipCta ? '' : (ctasUi[0]?.text || ''),
        ctaLink: skipCta ? '' : (ctasUi[0]?.link || ''),
        preGeneratedContent: mainSettings.generatedContent ? {
          title: preferredTitle,
          content: mainSettings.generatedContent,
          hashtags: mainSettings.generatedHashtags,
          // ✅ [2026-02-21 FIX] structuredContent 포함하여 main.ts에서 selectedTitle 참조 가능
          structuredContent: (window as any).currentStructuredContent || undefined,
          // ✅ [2026-03-18 FIX] generatedImages를 preGeneratedContent 내부에도 포함
          // main.ts L5972: generatedImages = preGenerated.generatedImages || generatedImages
          generatedImages: normalizedImagesForMultiAccount.length > 0 ? normalizedImagesForMultiAccount : undefined,
        } : null,
        // ✅ [2026-03-18 FIX] 최상위에도 generatedImages 포함 (main.ts L5958 직접 경로)
        generatedImages: normalizedImagesForMultiAccount.length > 0 ? normalizedImagesForMultiAccount : undefined,
        // ✅ [2026-01-20] 프리셋 썸네일 정보 전달
        presetThumbnail: (window as any).maPresetThumbnail || undefined,
        presetThumbnailPath: (window as any).maPresetThumbnailPath || undefined,
        // ✅ [2026-03-18 FIX] BlogExecutor에서 payload.thumbnailPath를 참조하므로 직접 매핑
        thumbnailPath: (window as any).maPresetThumbnailPath || undefined,
      };

      // 발행 실행
      const result = await window.api.multiAccountPublish([accountId], publishOptions);

      if ((window as any).stopFullAutoPublish === true) {
        appendLog('⏹️ 사용자가 다중계정 발행을 중지했습니다.');
        return;
      }

      if (result.success) {
        appendLog(`✅ [${i + 1}/${selectedAccountIds.length}] ${account.name}: 발행 성공!`);
        successCount++;
      } else {
        appendLog(`❌ [${i + 1}/${selectedAccountIds.length}] ${account.name}: ${result.message || '발행 실패'}`);
        failCount++;
      }

      // 다음 계정 발행 전 대기 (마지막 계정 제외)
      if (i < selectedAccountIds.length - 1) {
        appendLog(`⏳ ${intervalSeconds}초 대기 중...`);
        const ok = await waitInterruptible(intervalSeconds);
        if (!ok) {
          appendLog('⏹️ 사용자가 다중계정 발행을 중지했습니다.');
          return;
        }
      }

    } catch (error) {
      appendLog(`❌ [${i + 1}/${selectedAccountIds.length}] 오류: ${(error as Error).message}`);
      failCount++;
    }
  }

  appendLog(`🏁 다중계정 발행 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

  // ✅ 다중계정 발행 완료 UI 업데이트
  modal.setProgress(100, '발행 완료');
  modal.addLog(`✨ 모든 작업이 완료되었습니다! (성공: ${successCount}, 실패: ${failCount})`);

  toastManager.success(`✅ 다중 계정 발행 완료! (성공: ${successCount}, 실패: ${failCount})`);

  // 성공 시 3초 후 모달 자동 닫기
  if (failCount === 0) {
    setTimeout(() => {
      modal.hide();
    }, 3000);
  }
}

// 반자동 발행 처리
/**
 * ✅ [2026-02-27 FIX] 편집된 본문에서 각 heading의 content를 재파싱
 * resolveRunOptions에서 structuredContent.bodyPlain이 payload.content보다 우선하므로
 * headings[].content도 편집된 본문과 동기화 필수
 */
function reSyncHeadingsContent(headings: any[], editedBody: string): any[] {
  if (!headings || !headings.length || !editedBody) return headings || [];
  return headings.map((h: any, i: number) => {
    if (!h?.title) return h;
    const escaped = h.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = editedBody.match(new RegExp(escaped, 'i'));
    if (!match || match.index === undefined) return h;
    const startIdx = match.index + match[0].length;
    // 다음 소제목까지의 텍스트를 추출
    let endIdx = editedBody.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (!headings[j]?.title) continue;
      const nextEsc = headings[j].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nextMatch = editedBody.substring(startIdx).match(new RegExp(nextEsc, 'i'));
      if (nextMatch?.index !== undefined) { endIdx = startIdx + nextMatch.index; break; }
    }
    const newContent = editedBody.substring(startIdx, endIdx).trim();
    // ✅ [2026-02-28 FIX] stale content fallback 제거 — 10자 이하여도 재추출 결과만 사용
    return { ...h, content: newContent };
  });
}

export async function handleSemiAutoPublish(): Promise<void> {
  // ✅ 반자동 모드 설정
  (window as any).currentAutomationMode = 'semi-auto';

  // 먼저 콘텐츠가 생성되었는지 확인
  let structuredContent = (window as any).currentStructuredContent;

  // ✅ [FIX] 반자동 발행 시 사용자 수정 내용 보존
  // 필드에 이미 내용이 있으면 덮어쓰지 않음 (사용자가 수정했을 수 있음)
  const existingTitle = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value?.trim();
  const existingContent = (document.getElementById('unified-generated-content') as HTMLTextAreaElement)?.value?.trim();

  // 필드가 비어있을 때만 fillSemiAutoFields 호출 (사용자 수정 내용 보존)
  if (!existingTitle && !existingContent && structuredContent) {
    try {
      fillSemiAutoFields(structuredContent);
    } catch (e) {
      console.warn('[publishingHandlers] catch ignored:', e);
    }
  }

  // ✅ structuredContent가 없으면 필드에서 직접 생성
  if (!structuredContent) {
    const title = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value?.trim();
    const content = (document.getElementById('unified-generated-content') as HTMLTextAreaElement)?.value?.trim();
    const hashtagsStr = (document.getElementById('unified-generated-hashtags') as HTMLInputElement)?.value?.trim();

    if (!title || !content) {
      alert('먼저 상단에서 AI 글을 생성하거나, 제목과 본문을 직접 입력해주세요.');
      return;
    }

    // 직접 입력한 경우 structuredContent 생성
    structuredContent = {
      selectedTitle: title,
      bodyPlain: content,
      content: content,
      hashtags: hashtagsStr ? hashtagsStr.split(' ').filter(tag => tag.length > 0) : [],
      headings: [],
      toneStyle: (document.getElementById('unified-tone-style') as HTMLInputElement)?.value || 'friendly'
    };

    // 전역 변수에 저장
    (window as any).currentStructuredContent = structuredContent;
    currentStructuredContent = structuredContent;

    // ✅ localStorage에 저장 (postId 생성) - 카테고리도 함께 저장
    const postId = saveGeneratedPost(structuredContent, false, { category: UnifiedDOMCache.getRealCategory() });
    if (postId) {
      currentPostId = postId;
      appendLog(`💾 글이 자동으로 저장되었습니다 (ID: ${postId})`);
    }
  }

  // 수정된 콘텐츠 가져오기
  const title = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value?.trim();
  const content = (document.getElementById('unified-generated-content') as HTMLTextAreaElement)?.value?.trim();
  const hashtagsStr = (document.getElementById('unified-generated-hashtags') as HTMLInputElement)?.value?.trim();

  if (!title || !content) {
    alert('제목과 본문을 모두 입력해주세요.');
    return;
  }

  // ✅ [2026-02-27 FIX] 수정된 콘텐츠로 structuredContent 업데이트
  // Smoking Gun: resolveRunOptions에서 structured?.bodyPlain이 payload.content보다 우선
  // 따라서 여기서 bodyPlain을 반드시 최신 편집 내용으로 업데이트해야 함
  const updatedStructuredContent = {
    ...structuredContent,
    selectedTitle: title,
    bodyPlain: content,
    content: content,
    hashtags: hashtagsStr ? hashtagsStr.split(' ').filter(tag => tag.length > 0) : [],
    // ✅ [2026-02-27 FIX] 소제목 content를 편집된 본문에서 재파싱 (이미지-소제목 매칭 정확도)
    headings: reSyncHeadingsContent(structuredContent.headings || [], content)
  };

  // ✅ [2026-02-27 FIX] 전역 변수 즉시 업데이트 (핵심!)
  // 다중계정 발행 시 handleMultiAccountPublish가 (window).currentStructuredContent를 읽으므로
  // 여기서 업데이트하지 않으면 stale bodyPlain이 resolveRunOptions에서 우선 적용됨
  (window as any).currentStructuredContent = updatedStructuredContent;
  currentStructuredContent = updatedStructuredContent;

  // ✅ 업데이트된 콘텐츠 다시 저장
  saveGeneratedPost(updatedStructuredContent, true);

  if (updatedStructuredContent.headings && updatedStructuredContent.headings.length > 0) {
    appendLog(`📑 소제목 ${updatedStructuredContent.headings.length}개가 포함되어 있습니다.`);
  }

  appendLog('🔧 반자동 발행 시작: 수정된 콘텐츠로 발행');

  // ✅ 이미지 가져오기 (우선순위: ImageManager > 전역 변수 generatedImages > window.imageManagementGeneratedImages)
  let imageManagementImages: any[] = [];

  // ✅ 디버깅: 이미지 소스 상태 확인
  console.log('[SemiAuto] ImageManager.imageMap 크기:', ImageManager.imageMap.size);
  console.log('[SemiAuto] ImageManager.getAllImages():', ImageManager.getAllImages());
  console.log('[SemiAuto] 전역 generatedImages:', generatedImages?.length);
  console.log('[SemiAuto] window.imageManagementGeneratedImages:', (window as any).imageManagementGeneratedImages?.length);

  // 1. ImageManager에서 이미지 가져오기 (가장 우선)
  const imageManagerImages = ImageManager.getAllImages();
  if (imageManagerImages && imageManagerImages.length > 0) {
    imageManagementImages = [...imageManagerImages]; // 복사본 사용
    appendLog(`🖼️ ImageManager에서 ${imageManagementImages.length}개의 이미지를 가져왔습니다.`);
    imageManagementImages.forEach((img, i) => {
      console.log(`[SemiAuto] ImageManager 이미지 ${i}:`, img.heading, img.filePath?.substring(0, 50));
    });
  }

  // 2. 전역 변수 generatedImages에서 가져오기
  if (imageManagementImages.length === 0 && generatedImages && generatedImages.length > 0) {
    imageManagementImages = [...generatedImages]; // 복사본 사용
    appendLog(`🖼️ 전역 generatedImages에서 ${imageManagementImages.length}개의 이미지를 가져왔습니다.`);
  }

  // 3. window.imageManagementGeneratedImages에서 가져오기
  if (imageManagementImages.length === 0 && (window as any).imageManagementGeneratedImages && (window as any).imageManagementGeneratedImages.length > 0) {
    imageManagementImages = [...(window as any).imageManagementGeneratedImages]; // 복사본 사용
    appendLog(`🖼️ window.imageManagementGeneratedImages에서 ${imageManagementImages.length}개의 이미지를 가져왔습니다.`);
  }

  if (imageManagementImages.length > 0) {
    appendLog(`✅ 총 ${imageManagementImages.length}개의 이미지를 발행에 사용합니다.`);
    appendLog(`📋 이미지 목록:`);
    imageManagementImages.forEach((img: any, idx: number) => {
      const provider = img.provider || 'unknown';
      const heading = img.heading || '제목 없음';
      const filePath = img.filePath || img.url || 'N/A';
      appendLog(`   [${idx + 1}] ${heading} (${provider}) - ${filePath.substring(0, 60)}...`);
    });

    // ✅ [2026-02-12 P1 FIX #22] 발행 직전 sync → syncGlobalImagesFromImageManager 통합
    // ImageManager에도 동기화 (ImageManager가 비어있는 경우에만)
    // ✅ [2026-02-24 FIX] ImageManager가 비어있든 아니든 항상 최신 상태로 동기화
    // 사용자가 이미지를 수정했을 수 있으므로 항상 덮어쓰기
    {
      imageManagementImages.forEach((img: any) => {
        const heading = img.heading || img.title || '';
        if (heading) {
          ImageManager.setImage(heading, img);
        }
      });
      appendLog(`🔗 ImageManager에 ${imageManagementImages.length}개 이미지 동기화 완료`);
    }
    try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }
  } else {
    appendLog(`⚠️ 이미지가 없습니다. 새로 생성합니다.`);
  }

  // 발행 데이터 구성
  const imageSource = UnifiedDOMCache.getImageSource();
  const skipImages = (document.getElementById('unified-skip-images') as HTMLInputElement)?.checked || false;

  const ctasUi = readUnifiedCtasFromUi();
  const skipCtaCheckbox = document.getElementById('unified-skip-cta') as HTMLInputElement;
  const skipCta = skipCtaCheckbox?.checked || false; // ✅ CTA 없이 발행 체크박스
  const publishMode = (document.getElementById('unified-publish-mode') as HTMLInputElement)?.value || 'publish';
  console.log('[PublishingHandlers] 🔍 발행 모드 읽기 (semiAuto):', publishMode);
  const scheduleDate = publishMode === 'schedule' ? getScheduleDateFromInput('unified-schedule-date') : undefined;
  // ✅ [2026-03-17 FIX] scheduleTime 명시적 추출 (datetime-local에서 시간 부분)
  let scheduleTime: string | undefined;
  if (publishMode === 'schedule') {
    const rawVal = (document.getElementById('unified-schedule-date') as HTMLInputElement)?.value;
    if (rawVal?.includes('T')) {
      scheduleTime = rawVal.split('T')[1]?.substring(0, 5);
    }
  }
  const scheduleType = publishMode === 'schedule' ? ((document.getElementById('unified-schedule-type') as HTMLSelectElement)?.value as 'app-schedule' | 'naver-server' || 'naver-server') : undefined;

  // ✅ 디버깅: 이미지 관리 이미지 확인
  console.log('[handleSemiAutoPublish] generatedImages:', generatedImages);
  console.log('[handleSemiAutoPublish] imageManagementImages:', imageManagementImages);
  console.log('[handleSemiAutoPublish] imageManagementImages.length:', imageManagementImages.length);

  // ✅ CTA 자동 생성 (skipCta가 false인 경우만)
  let finalCtaText = '';
  let finalCtaLink = '';

  if (!skipCta) {
    const autoCTA = generateAutoCTA(title, '');

    // 수동 입력된 CTA가 있으면 우선 사용
    const manualCtaText = ctasUi[0]?.text || (document.getElementById('unified-cta-text') as HTMLInputElement)?.value?.trim();
    const manualCtaLink = ctasUi[0]?.link || (document.getElementById('unified-cta-link') as HTMLInputElement)?.value?.trim();

    finalCtaText = manualCtaText || autoCTA.ctaText;
    finalCtaLink = manualCtaLink || autoCTA.ctaLink;

    if (finalCtaLink) {
      appendLog(`✅ CTA 자동 포함: "${finalCtaText}" → ${finalCtaLink.substring(0, 50)}...`);
    } else {
      appendLog(`ℹ️ 연결할 이전 글이 없습니다. CTA 텍스트만 포함됩니다.`);
    }
  } else {
    appendLog(`🚫 CTA 없이 발행 옵션이 선택되었습니다.`);
  }

  // ✅ CTA 위치 고정
  const ctaPosition = ((document.getElementById('unified-cta-position') as HTMLSelectElement | null)?.value as 'top' | 'middle' | 'bottom') || 'bottom';

  // ✅ 이미지 객체 정규화: main 프로세스에서 filePath가 없으면 드랍될 수 있어서 여기서 보강
  const normalizedImagesForPublish = (Array.isArray(imageManagementImages) ? imageManagementImages : [])
    .map((img: any) => {
      const filePath = img?.filePath || img?.url || img?.previewDataUrl;
      return {
        ...img,
        filePath,
      };
    })
    .filter((img: any) => Boolean(img?.filePath));

  const formData: any = {
    mode: 'semi-auto',
    generator: UnifiedDOMCache.getGenerator(), // ✅ [2026-02-22 FIX] perplexity 지원
    targetAge: 'all',
    toneStyle: (document.getElementById('unified-tone-style') as HTMLInputElement)?.value || 'friendly',
    imageSource,
    skipImages,
    publishMode,
    scheduleDate,
    scheduleTime,
    scheduleType,
    structuredContent: updatedStructuredContent,
    // ✅ 이미지 전달 (호환)
    imageManagementImages: normalizedImagesForPublish,
    generatedImages: normalizedImagesForPublish,
    // ✅ CTA 설정
    ctaText: finalCtaText,
    ctaLink: finalCtaLink,
    ctas: skipCta ? [] : (ctasUi.length > 0 ? ctasUi : (finalCtaText ? [{ text: finalCtaText, link: finalCtaLink || undefined }] : [])),
    ctaPosition: ctaPosition, // ✅ CTA 위치 추가
    skipCta: skipCta, // ✅ 체크박스 값 반영
    categoryName: UnifiedDOMCache.getRealCategoryName(), // ✅ [2026-02-11 FIX] 카테고리 이름(text) 전달
    // ✅ [2026-02-19] 반자동: 제휴링크 자동 감지 (URL 필드에서 자동 감지)
    affiliateLink: resolveAffiliateLink(
      (document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement)?.value?.trim() || undefined,
      (document.querySelector('.unified-url-input') as HTMLInputElement)?.value?.trim()
    ) || '',
    contentMode: resolveAffiliateLink(
      (document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement)?.value?.trim() || undefined,
      (document.querySelector('.unified-url-input') as HTMLInputElement)?.value?.trim()
    ) ? 'affiliate' : ((document.getElementById('unified-content-mode') as HTMLInputElement)?.value || 'seo')
  };

  console.log('[handleSemiAutoPublish] formData.imageManagementImages:', formData.imageManagementImages);
  console.log('[handleSemiAutoPublish] formData.imageManagementImages.length:', formData.imageManagementImages?.length);

  // ✅ [2026-02-16 FIX] 이미 로드된 이미지가 있으면 API 키 체크 불필요 (저장된 이미지 사용)
  const currentImageSource = formData.imageSource;
  const hasPreloadedImages = normalizedImagesForPublish.length > 0;
  if (!hasPreloadedImages && currentImageSource !== 'saved' && currentImageSource !== 'collected') {
    if (currentImageSource === 'openai-image') {
      const config = await window.api.getConfig();
      if (!(config as any)?.openaiImageApiKey) {
        alert('OpenAI Image API 키가 설정되지 않았습니다. 환경설정에서 API 키를 입력해주세요.');
        return;
      }
    } else if (currentImageSource === 'leonardoai') {
      const config = await window.api.getConfig();
      if (!(config as any)?.leonardoaiApiKey) {
        alert('Leonardo AI API 키가 설정되지 않았습니다. 환경설정에서 API 키를 입력해주세요.');
        return;
      }
    }
  }

  // ✅ [2026-03-11] 발행 직전 ADB IP 변경 (반자동)
  try {
    const adbEnabled = localStorage.getItem('adbIpChangeEnabled') === 'true';
    if (adbEnabled) {
      appendLog('📱 ADB 비행기모드 IP 변경 중...');
      const adbResult = await (window as any).api.adbChangeIp(5);
      if (adbResult.success) {
        appendLog(`✅ IP 변경 완료: ${adbResult.oldIp} → ${adbResult.newIp}`);
      } else {
        appendLog(`⚠️ IP 변경 실패: ${adbResult.message}`);
      }
    }
  } catch (adbErr) {
    console.error('[SemiAutoPublish] ADB IP 변경 오류:', adbErr);
    appendLog(`⚠️ ADB IP 변경 오류: ${(adbErr as Error).message}`);
    // IP 변경 실패해도 발행은 계속 진행
  }

  // 자동화 실행
  await executeUnifiedAutomation(formData);
}
