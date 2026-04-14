// ═══════════════════════════════════════════════════════════════════
// [2026-02-26] formAndAutomation.ts - 폼 데이터 수집 + 자동화 실행/취소
// ═══════════════════════════════════════════════════════════════════

declare let currentStructuredContent: any;
declare let generatedImages: any[];
declare let currentPostId: string | null;
declare const ImageManager: any;
declare const toastManager: any;
declare const UnifiedDOMCache: any;
declare function appendLog(msg: string, ...args: any[]): void;
declare function escapeHtml(str: string): string;
declare function collectUnifiedFormDataForPublish(): any;
declare function executeUnifiedAutomation(formData: any): Promise<void>;
declare function saveGeneratedPost(...args: any[]): any;
declare function loadGeneratedPosts(): any[];
declare function refreshGeneratedPostsList(): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function hydrateImageManagerFromImages(images: any, headings?: any): void;
declare function showUnifiedProgress(progress: number, title: string, detail?: string): void;
declare function hideUnifiedProgress(): void;
declare function getProgressModal(): any;
declare function isFullAutoStopRequested(...args: any[]): boolean;
declare function filterImagesForPublish(...args: any[]): any[];
declare function readUnifiedCtasFromUi(): any[];
declare function resolveAffiliateLink(...args: any[]): string | undefined;
declare function isShoppingConnectModeActive(): boolean;
declare function getScheduleDateFromInput(inputId: string): string | undefined;
declare function updateUnifiedPreview(content: any): void;
declare function updateRiskIndicators(...args: any[]): void;
declare function activatePaywall(...args: any[]): void;
declare function isPaywallPayload(payload: any): boolean;
declare type RendererAutomationPayload = any;
declare function normalizeReadableBodyText(text: string): string;
declare function getUrlsAsString(): string;
declare let unifiedPublishModeInput: HTMLSelectElement;
declare let scheduleDateInput: HTMLInputElement;
declare let automationRunning: boolean;
declare let licenseModal: any;
declare function cancelAutomation(): void;

export function collectFormData(skipImages: boolean = false): RendererAutomationPayload | null {
  const naverIdInput = document.getElementById('naver-id') as HTMLInputElement;
  const naverPasswordInput = document.getElementById('naver-password') as HTMLInputElement;
  const titleInput = document.getElementById('post-title') as HTMLInputElement;
  const contentTextarea = document.getElementById('post-content') as HTMLTextAreaElement;
  const generatorSelect = document.getElementById('generator') as HTMLSelectElement;
  const targetAgeSelect = document.getElementById('target-age') as HTMLSelectElement;

  if (!naverIdInput || !naverPasswordInput) {
    alert('네이버 아이디와 비밀번호를 입력해주세요.');
    return null;
  }

  const naverId = naverIdInput.value.trim();
  const naverPassword = naverPasswordInput.value.trim();

  if (!naverId || !naverPassword) {
    alert('네이버 아이디와 비밀번호를 입력해주세요.');
    return null;
  }

  const payload: RendererAutomationPayload = {
    naverId,
    naverPassword,
    generator: (generatorSelect?.value as 'gemini' | 'openai' | 'claude' | 'perplexity') || UnifiedDOMCache.getGenerator(), // ✅ [2026-02-22 FIX]
    skipImages,
    targetAge: (targetAgeSelect?.value as '20s' | '30s' | '40s' | '50s' | 'all') || 'all',
    // ✅ Stability AI 모델 및 GIF 변환 옵션 추가
    stabilityModel: (document.getElementById('stability-model-select') as HTMLSelectElement)?.value || 'ultra',
    convertToGif: (document.getElementById('convert-to-gif-checkbox') as HTMLInputElement)?.checked || false,
    videoProvider: (document.getElementById('video-provider-select') as HTMLSelectElement)?.value || 'veo',
    keepBrowserOpen: true, // ✅ 항상 브라우저 세션 유지
    useIntelligentImagePlacement: false, // ✅ 기본값 false (공통 발행 모드에서는 비활성화)
    // ✅ [2026-01-28 FIX] localStorage 설정 우선 적용
    includeThumbnailText: localStorage.getItem('thumbnailTextInclude') === 'true' || (document.getElementById('thumbnail-text-option') as HTMLInputElement)?.checked || false,
    useAiImage: (document.getElementById('unified-use-ai-image') as HTMLInputElement)?.checked ?? true,
    createProductThumbnail: (document.getElementById('unified-create-product-thumbnail') as HTMLInputElement)?.checked ?? false,
    // ✅ [2026-02-19] 쇼핑커넥트 배너 + 제휴링크 자동 감지 (URL 필드에서 자동 감지)
    affiliateLink: resolveAffiliateLink(
      (document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement)?.value?.trim() || (document.getElementById('batch-link-input') as HTMLInputElement)?.value?.trim() || undefined,
      (document.querySelector('.unified-url-input') as HTMLInputElement)?.value?.trim()
    ),
    customBannerPath: (window as any).customBannerPath || undefined,
    contentMode: resolveAffiliateLink(
      (document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement)?.value?.trim() || (document.getElementById('batch-link-input') as HTMLInputElement)?.value?.trim() || undefined,
      (document.querySelector('.unified-url-input') as HTMLInputElement)?.value?.trim()
    ) ? 'affiliate' : 'seo',
    // ✅ [2026-01-18] AI 생성 옵션 체크박스
    useAiTableImage: (document.getElementById('ai-table-image-checkbox') as HTMLInputElement)?.checked || false,
    useAiBanner: (document.getElementById('ai-banner-checkbox') as HTMLInputElement)?.checked || false,
    // ✅ [2026-01-22] 배너 자동 랜덤 생성 옵션 (풀오토 발행용)
    autoBannerGenerate: (document.getElementById('shopping-connect-auto-banner') as HTMLInputElement)?.checked || false,
    // ✅ [2026-01-22 버그 수정] 발행 모드 및 예약 시간 수집 (연속발행 예약 모드 버그 수정)
    // 더 넓은 범위의 UI 요소 검색
    publishMode: (() => {
      // 1. 명시적 라디오 버튼 검색
      const scheduleModeRadio = document.querySelector('input[name="publish-mode"][value="schedule"]:checked') as HTMLInputElement;
      const draftModeRadio = document.querySelector('input[name="publish-mode"][value="draft"]:checked') as HTMLInputElement;

      if (scheduleModeRadio) return 'schedule' as const;
      if (draftModeRadio) return 'draft' as const;

      // 2. 셀렉트 박스 / hidden input 검색 (다양한 ID 패턴)
      const selectPatterns = [
        'unified-publish-mode',
        'unified-publish-mode-select',
        'continuous-modal-publish-mode',
        'publish-mode-select',
        'schedule-mode-select'
      ];
      for (const id of selectPatterns) {
        const select = document.getElementById(id) as HTMLSelectElement;
        if (select?.value === 'schedule') return 'schedule' as const;
        if (select?.value === 'draft') return 'draft' as const;
      }

      // 3. data-publish-mode 속성 검색 (현재 활성 아이템)
      const activeQueueItem = document.querySelector('.queue-item.active, [data-queue-item].active, .current-publishing-item');
      if (activeQueueItem?.getAttribute('data-publish-mode') === 'schedule') {
        return 'schedule' as const;
      }

      // 4. 글로벌 상태 변수 확인
      const globalMode = (window as any).currentPublishMode;
      if (globalMode === 'schedule') return 'schedule' as const;
      if (globalMode === 'draft') return 'draft' as const;

      // 기본값: publish (즉시 발행)
      return 'publish' as const;
    })(),
    scheduleDate: (() => {
      // 1. 다양한 ID 패턴으로 datetime-local 입력 검색
      const datetimePatterns = [
        'unified-schedule-date',
        'unified-schedule-datetime',
        'continuous-modal-schedule-datetime',
        'schedule-datetime',
        'reservation-datetime'
      ];
      for (const id of datetimePatterns) {
        const input = document.getElementById(id) as HTMLInputElement;
        if (input?.value) {
          return input.value.replace('T', ' ');
        }
      }

      // 2. 분리된 date/time 입력 검색
      const datePatterns = ['unified-schedule-date', 'continuous-modal-schedule-date', 'schedule-date'];
      const timePatterns = ['unified-schedule-time', 'continuous-modal-schedule-time', 'schedule-time'];

      for (let i = 0; i < datePatterns.length; i++) {
        const dateInput = document.getElementById(datePatterns[i]) as HTMLInputElement;
        const timeInput = document.getElementById(timePatterns[i]) as HTMLInputElement;
        if (dateInput?.value && timeInput?.value) {
          return `${dateInput.value} ${timeInput.value}`;
        }
      }

      // 3. data-schedule-date 속성 검색 (활성 큐 아이템)
      const activeQueueItem = document.querySelector('.queue-item.active, [data-queue-item].active, .current-publishing-item');
      const itemScheduleDate = activeQueueItem?.getAttribute('data-schedule-date');
      if (itemScheduleDate) {
        return itemScheduleDate.replace('T', ' ');
      }

      // 4. 글로벌 상태 변수 확인
      const globalScheduleDate = (window as any).currentScheduleDate;
      if (globalScheduleDate) return globalScheduleDate;

      // 5. input[type="datetime-local"] 전체 검색 (모달 내)
      const modalDatetimeInput = document.querySelector('.modal input[type="datetime-local"], .dialog input[type="datetime-local"]') as HTMLInputElement;
      if (modalDatetimeInput?.value) {
        return modalDatetimeInput.value.replace('T', ' ');
      }

      return undefined;
    })(),
    scheduleType: (() => {
      // ✅ [2026-03-14 FIX] UI에서 선택된 scheduleType 반영 (하드코딩 제거)
      const scheduleTypePatterns = [
        'unified-schedule-type',
        'schedule-type-select',
        'continuous-modal-schedule-type'
      ];
      for (const id of scheduleTypePatterns) {
        const el = document.getElementById(id) as HTMLSelectElement;
        if (el?.value === 'app-schedule') return 'app-schedule' as const;
      }
      return 'naver-server' as const; // 기본값
    })(),
  };

  // ✅ CTA (다중 CTA 우선)
  try {
    const ctas = readUnifiedCtasFromUi();
    if (ctas.length > 0) {
      payload.ctas = ctas;
      payload.ctaText = payload.ctaText || ctas[0]?.text;
      payload.ctaLink = payload.ctaLink || ctas[0]?.link;
    }
  } catch (e) {
    console.warn('[formAndAutomation] catch ignored:', e);
  }

  // 제목
  if (titleInput?.value.trim()) {
    payload.title = titleInput.value.trim();
  }

  // 본문
  if (contentTextarea?.value.trim()) {
    const normalized = normalizeReadableBodyText(contentTextarea.value.trim());
    payload.content = normalized;
    payload.lines = normalized.split('\n');
  }

  // 해시태그
  const hashtagsInput = document.getElementById('hashtags-input') as HTMLInputElement;
  if (hashtagsInput?.value?.trim()) {
    payload.hashtags = (hashtagsInput.value || '').split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }

  // ✅ [2026-04-06] 공정위 문구 — 수동 발행에서도 적용
  const ftcCheckbox = document.getElementById('unified-ftc-disclosure') as HTMLInputElement;
  const ftcTextarea = document.getElementById('unified-ftc-text') as HTMLTextAreaElement;
  const ftcEnabled = ftcCheckbox?.checked || false;
  const ftcText = ftcTextarea?.value?.trim() || '';

  // 구조화된 콘텐츠
  if (currentStructuredContent) {
    if (ftcEnabled && ftcText) {
      currentStructuredContent.ftcDisclosure = ftcText;
    }
    payload.structuredContent = currentStructuredContent;
    // ✅ [2026-02-01 FIX] selectedTitle (패치된 제목)이 우선, 없으면 titleInput 사용
    payload.title = currentStructuredContent.selectedTitle || payload.title;
    // 해시태그가 입력 필드에 있으면 우선 사용, 없으면 구조화 콘텐츠에서 가져오기
    if (!payload.hashtags || payload.hashtags.length === 0) {
      payload.hashtags = currentStructuredContent.hashtags;
    }
    // ✅ [2026-02-01 FIX] collectedImages가 있으면 payload에 추가 (발행 시 이미지 전달)
    if (currentStructuredContent.collectedImages && currentStructuredContent.collectedImages.length > 0) {
      (payload as any).collectedImages = currentStructuredContent.collectedImages;
      console.log(`[collectFormData] ✅ collectedImages ${currentStructuredContent.collectedImages.length}개 payload에 추가`);
    } else if (currentStructuredContent.images && currentStructuredContent.images.length > 0) {
      // images 배열도 체크
      (payload as any).collectedImages = currentStructuredContent.images;
      console.log(`[collectFormData] ✅ structuredContent.images ${currentStructuredContent.images.length}개 payload에 추가`);
    }
  }

  // 생성된 이미지
  if (!skipImages) {
    const imagesForPayload = (() => {
      try {
        const fromWindow = (window as any).imageManagementGeneratedImages;
        if (Array.isArray(fromWindow) && fromWindow.length > 0) return fromWindow;
      } catch (e) {
        console.warn('[formAndAutomation] catch ignored:', e);
      }
      try {
        const fromManager = ImageManager.getAllImages();
        if (Array.isArray(fromManager) && fromManager.length > 0) return fromManager;
      } catch (e) {
        console.warn('[formAndAutomation] catch ignored:', e);
      }
      return Array.isArray(generatedImages) ? generatedImages : [];
    })();

    const imagesForPublish = (() => {
      try {
        if (payload.structuredContent) {
          return filterImagesForPublish(payload.structuredContent, imagesForPayload);
        }
      } catch (e) {
        console.warn('[formAndAutomation] catch ignored:', e);
      }
      return imagesForPayload;
    })();

    if (imagesForPublish.length > 0) {
      payload.generatedImages = imagesForPublish
        .map((img: any) => ({
          heading: img.heading,
          filePath: img.filePath || img.url || img.previewDataUrl,
          provider: img.provider,
          isThumbnail: img.isThumbnail || false, // ✅ [2026-03-02 FIX] 대표이미지 플래그 보존
          originalIndex: img.originalIndex, // ✅ [2026-04-04 FIX] 소제목-이미지 매칭용 인덱스 보존
          headingIndex: img.headingIndex, // ✅ [2026-04-04 FIX] 소제목 인덱스 보존
          isIntro: img.isIntro || false,
        }))
        .filter((img: any) => Boolean(img?.heading) && Boolean(img?.filePath));

      // ✅ [2026-03-02 FIX] 대표사진 = isThumbnail 플래그 우선, 없으면 1번 이미지
      const thumbnailImage = payload.generatedImages?.find((img: any) => img.isThumbnail === true)
        || payload.generatedImages?.[0] as any;
      if (thumbnailImage?.filePath) {
        payload.thumbnailPath = thumbnailImage.filePath;
        console.log(`[Thumbnail] 대표사진 설정: ${thumbnailImage.isThumbnail ? 'isThumbnail 플래그' : '1번 이미지'} 사용`);
      }
    }
  }

  // URL 수집
  const urls = getUrlsAsString();
  if (urls) {
    payload.rssUrl = urls;
  }

  // 발행 모드
  if (unifiedPublishModeInput) {
    payload.publishMode = (unifiedPublishModeInput.value || 'publish') as 'draft' | 'publish' | 'schedule';

    if (payload.publishMode === 'schedule' && scheduleDateInput?.value) {
      payload.scheduleDate = scheduleDateInput.value;
    }

    // ✅ 카테고리명 수집 고도화 (수동 입력이 우선, 비어있으면 선택된 카테고리명 사용)
    const categoryInput = document.getElementById('unified-category-name') as HTMLInputElement;
    const articleTypeSelect = document.getElementById('unified-article-type') as HTMLSelectElement;

    let categoryName = categoryInput?.value.trim() || '';

    // 수동 입력이 없고 카테고리가 선택되어 있다면 해당 텍스트 사용
    if (!categoryName && articleTypeSelect && articleTypeSelect.selectedIndex > 0) {
      categoryName = articleTypeSelect.options[articleTypeSelect.selectedIndex].text;
      // "건강/의학" -> "건강" 처럼 슬래시 앞부분만 취할지 고민했으나, 
      // 사용자가 네이버 카테고리를 UI와 동일하게 맞췄을 가능성이 크므로 전체 텍스트 사용
    }

    if (categoryName) {
      payload.categoryName = categoryName;
    }
  }

  // ✅ [2026-02-09 FIX] ctaType 수집 — 이전글 자동 검색 조건에 필수
  // executeFullAutoFlow L23918: canAutoLink = formData.ctaType === 'previous-post'
  const linkPreviousPostCheckbox = document.getElementById('unified-link-previous-post') as HTMLInputElement;
  if (linkPreviousPostCheckbox?.checked) {
    (payload as any).ctaType = 'previous-post';
  } else if ((payload as any).ctas?.length > 0) {
    (payload as any).ctaType = 'custom';
  } else {
    (payload as any).ctaType = 'none';
    // ✅ [2026-02-09 FIX] ctaType이 none이고 CTA가 없으면 skipCta도 설정 (연속발행 L6628과 일관성)
    payload.skipCta = true;
  }

  // ✅ [2026-02-09 FIX] category 수집 — 이전글 매칭에서 카테고리 비교에 필수
  // 콘텐츠 카테고리 또는 블로그 폴더 카테고리 사용
  const contentCategory = (currentStructuredContent as any)?.category || '';
  const uiCategory = UnifiedDOMCache.getRealCategory() || '';
  if (contentCategory || uiCategory) {
    (payload as any).category = contentCategory || uiCategory;
  }

  // ✅ 사용자 정의 프롬프트 수집
  const customPromptInput = document.getElementById('unified-custom-prompt') as HTMLTextAreaElement;
  if (customPromptInput?.value.trim()) {
    (payload as any).customPrompt = customPromptInput.value.trim();
  }

  // ✅ [Add] 제휴마케팅 링크 및 비디오 옵션 수집
  // 먼저 shopping-connect-affiliate-link 확인, 없으면 batch-link-input (이미지 관리 탭) 사용
  const affiliateLinkInput = document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement;
  const batchLinkInput = document.getElementById('batch-link-input') as HTMLInputElement;
  const affiliateLinkValue = affiliateLinkInput?.value?.trim() || batchLinkInput?.value?.trim();
  if (affiliateLinkValue) {
    payload.affiliateLink = affiliateLinkValue;
    console.log('[collectPayload] affiliateLink 설정됨:', affiliateLinkValue);
  }

  const affiliateVideoCheckbox = document.getElementById('shopping-connect-video-option') as HTMLInputElement;
  if (affiliateVideoCheckbox) {
    payload.useAffiliateVideo = affiliateVideoCheckbox.checked;
  }

  // ✅ [Add] 콘텐츠 모드 수집 (seo, homefeed, affiliate 등)
  const contentModeInput = document.getElementById('unified-content-mode') as HTMLInputElement;
  if (contentModeInput?.value) {
    (payload as any).contentMode = contentModeInput.value;
  }

  return payload;
}

// ✅ 풀오토 발행 중 플래그 (다른 모달 표시 방지)
const isFullAutoPublishing = false;

// ✅ AI 글생성 진행률 모달 관리
const aiProgressModal = {
  modal: null as HTMLElement | null,
  progressBar: null as HTMLElement | null,
  progressPercent: null as HTMLElement | null,
  progressStep: null as HTMLElement | null,
  progressLog: null as HTMLElement | null,
  progressTitle: null as HTMLElement | null,
  progressIcon: null as HTMLElement | null,
  intervalId: null as NodeJS.Timeout | null,
  // ✅ [2026-03-09] FAB (플로팅 복원 버튼) 관련 속성
  fab: null as HTMLElement | null,
  currentPercent: 0,
  isWorking: false,

  ensureModalExists() {
    if (document.getElementById('ai-progress-modal')) return;

    const modalHtml = `
      <div id="ai-progress-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); z-index: 9999999; justify-content: center; align-items: center; flex-direction: column; backdrop-filter: blur(5px);">
        <div style="background: linear-gradient(145deg, #1e1e24, #2a2a35); padding: 2.5rem; border-radius: 20px; width: 90%; max-width: 500px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1); text-align: center; position: relative;">
          
          <div style="position: absolute; top: 15px; right: 15px; display: flex; gap: 8px; align-items: center;">
            <button id="ai-progress-minimize" style="background: transparent; border: none; color: rgba(255,255,255,0.5); font-size: 1.2rem; cursor: pointer; transition: color 0.2s; padding: 0 4px;" title="최소화">⬇</button>
            <button id="ai-progress-close-x" style="background: transparent; border: none; color: rgba(255,255,255,0.5); font-size: 1.5rem; cursor: pointer; transition: color 0.2s;">✕</button>
          </div>
          
          <div style="font-size: 3rem; margin-bottom: 1rem; animation: float 3s ease-in-out infinite;" id="ai-progress-icon">🤖</div>
          
          <h3 id="ai-progress-title" style="color: #fff; font-size: 1.5rem; margin: 0 0 1rem 0; font-weight: 700;">AI 글 생성 중...</h3>
          
          <div style="width: 100%; height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden; margin-bottom: 1.5rem; position: relative;">
            <div id="ai-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 4px; transition: width 0.3s ease; box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);"></div>
          </div>
          
          <div style="display: flex; justify-content: space-between; color: #a1a1aa; font-size: 0.85rem; margin-bottom: 1.5rem;">
            <span id="ai-progress-step">준비 중...</span>
            <span id="ai-progress-percent">0%</span>
          </div>
          
          <div id="ai-progress-log" style="background: rgba(0, 0, 0, 0.45); border-radius: 12px; padding: 1rem; height: 250px; overflow-y: auto; text-align: left; font-family: 'Courier New', 'Consolas', monospace; font-size: 0.78rem; color: #d4d4d8; margin-bottom: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.08); scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent;">
            <div style="color: #6b7280;">⏳ 터미널 로그 대기 중...</div>
          </div>
          
          <button id="ai-progress-cancel" style="background: rgba(255, 255, 255, 0.1); border: none; color: #fff; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-size: 0.9rem; font-weight: 500;">
            🚫 취소하기
          </button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // ✅ [2026-03-09] FAB 애니메이션 CSS 주입
    if (!document.getElementById('ai-progress-fab-styles')) {
      const style = document.createElement('style');
      style.id = 'ai-progress-fab-styles';
      style.textContent = `
        @keyframes aiFabBounceIn {
          0% { opacity: 0; transform: scale(0.3) translateY(20px); }
          60% { opacity: 1; transform: scale(1.1) translateY(-4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes aiFabPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(139,92,246,0.4), 0 0 0 0 rgba(139,92,246,0.3); }
          50% { box-shadow: 0 4px 20px rgba(139,92,246,0.4), 0 0 0 6px rgba(139,92,246,0.1); }
        }
        #ai-progress-fab {
          animation: aiFabBounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                     aiFabPulse 2s ease-in-out 0.5s infinite;
        }
      `;
      document.head.appendChild(style);
    }
  },

  init() {
    this.ensureModalExists();
    this.modal = document.getElementById('ai-progress-modal');
    this.progressBar = document.getElementById('ai-progress-bar');
    this.progressPercent = document.getElementById('ai-progress-percent');
    this.progressStep = document.getElementById('ai-progress-step');
    this.progressLog = document.getElementById('ai-progress-log');
    this.progressTitle = document.getElementById('ai-progress-title');
    this.progressIcon = document.getElementById('ai-progress-icon');

    // 취소 버튼
    const cancelBtn = document.getElementById('ai-progress-cancel');
    cancelBtn?.addEventListener('click', () => {
      // 진행 중일 때만 확인 창 띄우기
      if (document.getElementById('ai-progress-close-x')?.style.display === 'none') {
        if (confirm('작업을 취소하시겠습니까?')) {
          this.hide();
          cancelAutomation();
        }
      } else {
        this.hide();
      }
    });

    // 닫기 버튼 (X)
    const closeXBtn = document.getElementById('ai-progress-close-x');
    closeXBtn?.addEventListener('click', () => {
      if (automationRunning) {
        if (confirm('작업을 취소하시겠습니까?')) {
          this.hide();
          cancelAutomation();
        }
      } else {
        this.hide();
      }
    });

    // Hover effect for close button
    closeXBtn?.addEventListener('mouseenter', () => { closeXBtn.style.color = '#fff'; });
    closeXBtn?.addEventListener('mouseleave', () => { closeXBtn.style.color = 'rgba(255,255,255,0.5)'; });

    // ✅ [2026-03-09] 최소화 버튼
    const minimizeBtn = document.getElementById('ai-progress-minimize');
    if (minimizeBtn && !minimizeBtn.hasAttribute('data-listener-added')) {
      minimizeBtn.setAttribute('data-listener-added', 'true');
      minimizeBtn.addEventListener('click', () => {
        if (this.modal) this.modal.style.display = 'none';
        this.showFab();
        console.log('[aiProgressModal] ⬇ 최소화 → FAB 표시');
      });
      minimizeBtn.addEventListener('mouseenter', () => { minimizeBtn.style.color = '#fff'; });
      minimizeBtn.addEventListener('mouseleave', () => { minimizeBtn.style.color = 'rgba(255,255,255,0.5)'; });
    }
  },

  // ✅ [2026-03-09] FAB DOM 생성 (1회)
  createFab() {
    if (document.getElementById('ai-progress-fab')) {
      this.fab = document.getElementById('ai-progress-fab');
      return;
    }

    const fab = document.createElement('div');
    fab.id = 'ai-progress-fab';
    fab.title = '글생성 진행 상황 보기';
    fab.style.cssText = `
      display: none;
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 99999;
      width: auto;
      min-width: 56px;
      height: 48px;
      border-radius: 24px;
      background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4), 0 0 0 0 rgba(139, 92, 246, 0.3);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 14px;
      font-weight: 700;
      padding: 0 16px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      user-select: none;
      font-family: 'Pretendard', -apple-system, sans-serif;
    `;

    fab.innerHTML = `
      <span id="ai-progress-fab-icon" style="font-size: 16px;">🤖</span>
      <span id="ai-progress-fab-text" style="font-size: 13px; font-weight: 600;">0%</span>
    `;

    // 호버 효과
    fab.addEventListener('mouseenter', () => {
      fab.style.transform = 'scale(1.08)';
      fab.style.boxShadow = '0 6px 28px rgba(139, 92, 246, 0.5), 0 0 0 4px rgba(139, 92, 246, 0.15)';
    });
    fab.addEventListener('mouseleave', () => {
      fab.style.transform = 'scale(1)';
      fab.style.boxShadow = '0 4px 20px rgba(139, 92, 246, 0.4), 0 0 0 0 rgba(139, 92, 246, 0.3)';
    });

    // 클릭 → 모달 복원
    fab.addEventListener('click', () => {
      if (this.modal) {
        this.modal.style.display = 'flex';
      }
      this.hideFab();
      console.log('[aiProgressModal] ✅ FAB 클릭 → 모달 복원');
    });

    document.body.appendChild(fab);
    this.fab = fab;
  },

  // ✅ FAB 표시
  showFab() {
    if (!this.fab) this.createFab();
    if (this.fab) {
      this.fab.style.display = 'flex';
      this.updateFab(this.currentPercent);
      console.log(`[aiProgressModal] 📌 FAB 표시 (${Math.round(this.currentPercent)}%)`);
    }
  },

  // ✅ FAB 숨김
  hideFab() {
    if (this.fab) {
      this.fab.style.display = 'none';
    }
  },

  // ✅ FAB 진행률 업데이트
  updateFab(percent: number, stepText?: string) {
    if (!this.fab || this.fab.style.display === 'none') return;

    const fabText = document.getElementById('ai-progress-fab-text');
    const fabIcon = document.getElementById('ai-progress-fab-icon');
    if (fabText) {
      fabText.textContent = stepText ? `${Math.round(percent)}% · ${stepText}` : `${Math.round(percent)}%`;
    }
    if (fabIcon) {
      if (percent >= 80) fabIcon.textContent = '✨';
      else if (percent >= 50) fabIcon.textContent = '⚡';
      else fabIcon.textContent = '🤖';
    }
  },

  show(
    title: string = 'AI 글 생성 중...',
    opts?: {
      autoAnimate?: boolean;
      icon?: string;
      initialLog?: string;
      steps?: { percent: number; step: string }[];
      mode?: string;
    }
  ) {
    // 항상 최신 DOM 요소를 가져오도록 초기화 강제 실행
    this.init();
    this.isWorking = true; // ✅ 작업 시작 플래그
    if (this.modal) {
      this.modal.style.display = 'flex';
      this.hideFab(); // ✅ 모달 표시 시 FAB 숨김
      if (this.progressTitle) this.progressTitle.textContent = title;
      if (this.progressIcon && opts?.icon) this.progressIcon.textContent = String(opts.icon);
      if (this.progressLog) {
        const initial = String(opts?.initialLog || '⏳ AI 글 생성을 시작합니다...');
        this.progressLog.innerHTML = `<div>${escapeHtml(initial)}</div>`;
      }
      this.update(0, '준비 중...');

      // 초기화: 닫기 버튼 보이기 (항상 보임)
      const closeXBtn = document.getElementById('ai-progress-close-x');
      const cancelBtn = document.getElementById('ai-progress-cancel');
      const minimizeBtn = document.getElementById('ai-progress-minimize');
      if (closeXBtn) closeXBtn.style.display = 'block';
      if (minimizeBtn) minimizeBtn.style.display = 'inline-block';
      if (cancelBtn) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.textContent = '🚫 취소하기';
      }

      const autoAnimate = opts?.autoAnimate !== false;
      if (autoAnimate) {
        // ✅ 모드 전달 (textOnly 또는 fullFlow)
        const mode = opts?.mode || (opts?.steps ? 'custom' : 'fullFlow');
        this.startAnimation(opts?.steps, mode as any);
      }
    }
  },

  hide() {
    if (this.modal) this.modal.style.display = 'none';
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // ✅ [2026-03-09] 작업 진행 중이면 FAB 표시
    if (this.isWorking && this.currentPercent < 100) {
      this.showFab();
    }
  },

  update(percent: number, step: string) {
    this.currentPercent = percent; // ✅ FAB용 진행률 저장
    if (this.progressBar) this.progressBar.style.width = `${percent}%`;
    if (this.progressPercent) this.progressPercent.textContent = `${percent}%`;
    if (this.progressStep) this.progressStep.textContent = step;
    // ✅ FAB 진행률 실시간 동기화
    this.updateFab(percent, step);
  },

  addLog(message: string) {
    if (this.progressLog) {
      // ✅ [2026-03-07] 터미널 스타일 로그: 타임스탬프 + 컬러 코딩 + 엔트리 제한
      const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // 컬러 코딩
      let color = '#d4d4d8';
      if (message.includes('✅') || message.includes('완료')) color = '#10b981';
      else if (message.includes('❌') || message.includes('실패') || message.includes('오류')) color = '#ef4444';
      else if (message.includes('⚠️') || message.includes('건너뛰기')) color = '#f59e0b';
      else if (message.includes('🤖') || message.includes('AI') || message.includes('Gemini')) color = '#8b5cf6';
      else if (message.includes('🚀') || message.includes('시작')) color = '#3b82f6';
      else if (message.includes('🖼️') || message.includes('이미지')) color = '#60a5fa';

      const logItem = document.createElement('div');
      logItem.style.cssText = `margin-top: 3px; line-height: 1.5; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 2px;`;
      // HTML 이스케이프 (XSS 방지)
      const safe = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      logItem.innerHTML = `<span style="color: rgba(255,255,255,0.3); font-size: 0.7rem; margin-right: 6px;">[${timestamp}]</span><span style="color: ${color}">${safe}</span>`;

      this.progressLog.appendChild(logItem);

      // 엔트리 제한 (200개 초과 시 오래된 것 제거)
      while (this.progressLog.childElementCount > 200) {
        this.progressLog.removeChild(this.progressLog.firstElementChild as Element);
      }

      this.progressLog.scrollTop = this.progressLog.scrollHeight;
    }
  },

  startAnimation(customSteps?: { percent: number; step: string }[], mode: 'textOnly' | 'fullFlow' | 'custom' = 'fullFlow') {
    let steps = customSteps;

    if (!steps) {
      if (mode === 'textOnly') {
        steps = [
          { percent: 15, step: '📝 키워드 분석 중...' },
          { percent: 30, step: '🔍 경쟁 블로그 분석 중...' },
          { percent: 60, step: '✍️ AI 글 작성 중...' },
          { percent: 85, step: '📄 콘텐츠 구조화 중...' },
        ];
      } else {
        steps = [
          { percent: 10, step: '📝 키워드 분석 중...' },
          { percent: 20, step: '🔍 경쟁 블로그 분석 중...' },
          { percent: 35, step: '✍️ AI 글 작성 중...' },
          { percent: 50, step: '📄 콘텐츠 구조화 중...' },
          { percent: 65, step: '🖼️ 이미지 생성 중...' },
          { percent: 80, step: '🔗 내부링크 삽입 중...' },
          { percent: 90, step: '📤 블로그 발행 준비...' },
        ];
      }
    }

    let stepIndex = 0;
    this.intervalId = setInterval(() => {
      if (stepIndex < steps!.length) {
        const step = steps![stepIndex];
        this.update(step.percent, step.step);
        stepIndex++;
      }
    }, 3000);
  },

  complete(
    success: boolean,
    opts?: {
      successTitle?: string;
      failureTitle?: string;
      successIcon?: string;
      failureIcon?: string;
      successLog?: string;
      failureLog?: string;
    }
  ) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isWorking = false; // ✅ 작업 완료 플래그
    this.hideFab(); // ✅ 완료/실패 시 FAB 숨김

    if (success) {
      this.update(100, '✅ 완료!');
      this.addLog(String(opts?.successLog || '🎉 AI 글 생성 및 발행 완료!'));
      if (this.progressIcon) this.progressIcon.textContent = String(opts?.successIcon || '✅');
      if (this.progressTitle) this.progressTitle.textContent = String(opts?.successTitle || '글 생성 완료!');
    } else {
      this.update(0, '❌ 실패');
      this.addLog(String(opts?.failureLog || '❌ 글 생성 실패'));
      if (this.progressIcon) this.progressIcon.textContent = String(opts?.failureIcon || '❌');
      if (this.progressTitle) this.progressTitle.textContent = String(opts?.failureTitle || '글 생성 실패');
    }

    // 완료/실패 시: 닫기 버튼 보이기, 취소 버튼 숨기기 (또는 닫기로 변경)
    const closeXBtn = document.getElementById('ai-progress-close-x');
    const cancelBtn = document.getElementById('ai-progress-cancel');
    const minimizeBtn = document.getElementById('ai-progress-minimize');

    if (closeXBtn) closeXBtn.style.display = 'block';
    if (minimizeBtn) minimizeBtn.style.display = 'none'; // ✅ 완료 시 최소화 버튼 숨김

    if (cancelBtn) {
      // 취소 버튼을 '닫기'로 변경하여 하단에서도 닫을 수 있게 함
      cancelBtn.textContent = '확인';
      // 이벤트 핸들러는 이미 조건부로 처리됨 or 재할당 필요없음 (hide 호출)
      // 하지만 명시적으로 동작을 변경하고 싶다면 cloneNode 하거나 상태변수 사용
      // 여기서는 init에서 close-x display 체크로 처리했음.
    }

    // 자동 닫기 제거 (사용자가 결과를 보고 직접 닫게 함)
    // setTimeout(() => this.hide(), 3000);
  }
};

// ✅ [2026-03-07] window 객체 등록 — renderer.ts IPC 브릿지에서 접근 필수
(window as any).aiProgressModal = aiProgressModal;

// 자동화 실행
