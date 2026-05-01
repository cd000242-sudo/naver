// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 풀오토/세미오토 발행 실행 흐름 모듈
// renderer.ts에서 추출된 발행 자동화 실행 관련 함수들
// ═══════════════════════════════════════════════════════════════════

// ✅ renderer.ts의 전역 변수/함수 참조 (인라인 빌드에서 동일 스코프)
declare let currentStructuredContent: any;
declare let generatedImages: any[];
declare let currentPostId: string;
declare let isContinuousMode: boolean;
declare const ImageManager: any;
declare const toastManager: any;
declare const UnifiedDOMCache: any;
declare const ProgressModal: any;
declare const GENERATED_POSTS_KEY: string;
declare const EnhancedApiClient: any;
declare function appendLog(msg: string, ...args: any[]): void;
declare function escapeHtml(str: string): string;
declare function collectFormData(): any;
declare function collectUnifiedFormDataForPublish(): any;
declare function getRequiredImageBasePath(): Promise<string>;

declare function displayGeneratedImages(images: any[]): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function syncHeadingVideoInPromptItems(): void;
declare function syncHeadingVideoSlotsInUnifiedPreview(): void;
declare function refreshGeneratedPostsList(): void;
declare function toFileUrlMaybe(path: string): string;
declare function generateAIContentFromData(data: any): Promise<any>;
declare function executeUnifiedAutomation(formData: any): Promise<any>;
declare function showFolderSelectionModal(options?: any): Promise<void>;
declare function loadImagesFromFolder(postId: string): Promise<any[]>;
declare function hydrateImageManagerFromImages(images: any, headings?: any): void;
declare function saveGeneratedPostsToStorage(posts: any[]): void;
declare function generateHeadingVideoForPrompt(headingIndex: number, headingTitle: string): Promise<void>;
declare function getHeadingsForVeo(): any[];
declare function showImageModal(imageUrl: string, title?: string): void;
declare function getCurrentVideoProvider(): any;
declare function normalizeHeadingKeyForVideoCache(key: string): string;
declare function autoGenerateCTA(...args: any[]): any;
declare function updateRiskIndicators(content?: any): void;
declare function getCurrentNaverId(): string;
declare function loadGeneratedPosts(): any[];
declare function saveGeneratedPosts(posts: any[]): void;
declare function saveGeneratedPost(content: any, isUpdate?: boolean, opts?: any): string;
declare function activatePaywall(...args: any[]): void;
declare function updateFullAutoPreview(content: any): void;
declare function updateFullAutoFinalImagePreview(images: any[]): void;
declare function extractSearchKeywords(...args: any[]): string[];
declare function getGlobalImageSettings(): any;
declare function isCostRiskImageProvider(provider: string): boolean;
declare function generateImagesWithCostSafety(options: any): Promise<any>;
declare function isFullAutoStopRequested(...args: any[]): boolean;
declare function generateEnglishPromptForHeading(heading?: string, title?: string, ...args: any[]): Promise<string>;
declare function resolveReferenceImageForHeadingAsync(...args: any[]): Promise<string>;
declare function showUnifiedProgress(progress: number, title: string, detail?: string): void;
declare function hideUnifiedProgress(): void;
declare function generateAutoCTA(title: string, keywords?: string): any;
declare function filterImagesForPublish(content: any, images: any[]): any[];
declare function normalizeReadableBodyText(text: string): string;
declare function RendererAutomationPayload(...args: any[]): any;
declare function updatePostAfterPublish(postId: string, publishedUrl: string, publishMode?: 'draft' | 'publish' | 'schedule'): void;
declare function updatePostImages(postId: string, images: any[]): void;
declare function stopAutosave(): void;
declare function stopAutoBackup(): void;
declare function clearAutosavedContent(): void;
declare function resetAllFields(): void;
declare function applyPresetThumbnailIfExists(...args: any[]): any;
declare function resolveFirstHeadingTitleForThumbnail(): string;
declare function yieldToUI(): Promise<void>;
declare function loadAllGeneratedPosts(): any[];
declare function ensureCategoryMigration(): void;
declare function normalizeCategory(cat: string): string;
declare function getHeadingSelectedImageKey(heading: string, ...args: any[]): any;
declare function getStableImageKey(imageObj: any, heading?: string): string;
declare function setCurrentVideoProvider(provider: any): void;
declare function refreshMp4FilesList(): void;
declare function openExistingImageFolder(): Promise<void>;
declare function showLoadImagesFromFoldersModal(): Promise<void>;
declare function undoLastImageChange(): void;
declare function getAiVideoFolderPath(): string;
declare function openVeoHeadingSelectModal(): void;
declare function ensureUnifiedPreviewVideoDelegation(): void;
declare function getHeadingVideoPreviewFromCache(heading: string): any;
declare function prefetchHeadingVideoPreview(heading: string, ...args: any[]): void;
declare function withErrorHandling(fn: Function, fallback?: any): any;
declare function resetPublishing(): void;
declare function resetImageGeneration(): void;
declare function resetContentGeneration(): void;
declare function isPaywallPayload(payload: any): boolean;
declare function resetThumbnailGeneratorOnPublish(): void;
declare function collectUnifiedCtas(): any[];
declare function readUnifiedCtasFromUi(): any[];
declare function getScheduleDateFromInput(inputId: string): string | undefined;
declare function resolveAffiliateLink(link1?: string, link2?: string): string | undefined;
declare function isShoppingConnectModeActive(): boolean;
declare function getProgressModal(): any;
declare function resolveFirstHeadingTitleForThumbnail(): string;
declare function generateImagesForAutomation(imageSource: string, headings: any[], title: string, options?: any): Promise<any[]>;
declare function getUnifiedUrls(): string[];
declare function generateContentFromUrl(url: string, title?: string, tone?: string, suppressModal?: boolean): Promise<void>;
type ProgressModal = any;
type RendererAutomationPayload = any;
type VideoProvider = any;
type HeadingVideoPreviewCacheEntry = any;
declare const headingVideoPreviewCache: Map<string, any>;
declare const headingVideoPreviewInFlight: Map<string, any>;
declare function parseLocalFolderImages(folderPath: string, headings: any[]): Promise<any[]>;

// ✅ [2026-03-05] 이전글 엮기 공통 함수 — 모든 발행 모드에서 동일하게 사용
/**
 * 이전글 자동 엮기 — 같은 계정+카테고리의 이전 발행글을 찾아 formData에 설정
 *
 * ⚠️ CTA 관련 3개 필드 역할 구분:
 *   - formData.ctaUrl:         이 함수의 자동검색 스킵 판단용 (비어있으면 검색 실행)
 *   - formData.ctaLink:        executeBlogPublishing에서 CTA 버튼 렌더링에 사용
 *   - formData.previousPostUrl: 네이버 에디터의 "이전글 엮기" UI 기능에 사용 (IPC payload로 전달)
 *
 * ctaType='previous-post'일 때 3개 필드 모두 같은 이전글 URL을 가져야 완전한 동작:
 *   1) ctaUrl → autoLinkPreviousPost 자동검색 스킵
 *   2) ctaLink → 본문 CTA 버튼에 이전글 링크 표시
 *   3) previousPostUrl → 네이버 에디터에서 이전글 카드 삽입
 */
function autoLinkPreviousPost(formData: any, modal?: any): void {
  appendLog(`🔗 이전글 자동 엮기: 같은 계정+카테고리의 이전 발행글 찾기 시작...`);

  // ✅ 기존 글 카테고리 마이그레이션 (영어 → 한글 통일)
  ensureCategoryMigration();

  // ✅ 현재 계정의 글에서만 이전글 매칭
  const allPosts = loadAllGeneratedPosts();
  const currentNaverId = getCurrentNaverId();

  // ✅ 현재 카테고리 정규화
  const rawCategory = formData.category || formData.categoryName || '';
  const currentCategory = normalizeCategory(rawCategory);

  appendLog(`   📂 현재 카테고리: "${currentCategory || '없음'}" (원본: "${rawCategory}")`);
  appendLog(`   👤 현재 계정: "${currentNaverId || '미지정'}"`);

  // ✅ 같은 계정의 발행된 글 필터
  const publishedPosts = allPosts.filter((p: any) =>
    p.publishedUrl && p.publishedUrl.trim() &&
    (!currentNaverId || !p.naverId || p.naverId === currentNaverId)
  );
  appendLog(`   📊 전체 발행글: ${publishedPosts.length}개`);

  // ✅ CTA 이전글 엮기 (ctaType === 'previous-post' 일 때)
  const canAutoLink = formData.ctaType === 'previous-post';
  // ✅ [2026-03-20 FIX] isContinuousMode 강제검색 제거
  // 기존: 연속발행 시 항상 자동검색하여 사용자 선택/체이닝 URL 무시
  // 수정: ctaUrl이 있으면(사용자 선택 또는 이전 발행에서 체이닝) 자동검색 스킵
  const needsLinkLookup = !formData.ctaUrl || formData.ctaUrl.trim() === '';

  if (canAutoLink && needsLinkLookup) {
    // 같은 카테고리의 최신 발행글 찾기
    const prevPosts = publishedPosts
      .filter((p: any) => {
        if (!currentCategory) return false;
        const postCat = normalizeCategory(p.category || '');
        return postCat === currentCategory;
      })
      .sort((a: any, b: any) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

    appendLog(`   🔍 동일 카테고리 글: ${prevPosts.length}개`);

    const prevPost = prevPosts[0];
    if (prevPost) {
      // ✅ [2026-03-20 FIX] 3개 필드 동기화 — ctaUrl + ctaLink + previousPostUrl 모두 설정
      // ⚠️ URL 유효성 검증: http(s)로 시작하는 유효한 URL만 세팅 (빈 문자열/undefined 방지)
      const validUrl = prevPost.publishedUrl && prevPost.publishedUrl.startsWith('http') ? prevPost.publishedUrl : '';
      formData.ctaUrl = validUrl;                      // autoLinkPreviousPost 자동검색 스킵용
      if (validUrl) formData.ctaLink = validUrl;       // CTA 버튼 렌더링용 (유효한 URL만)
      formData.previousPostTitle = prevPost.title || '이전 글 보기';
      if (!formData.ctaText || formData.ctaText.startsWith('📖')) {
        formData.ctaText = `📖 추천 글: ${prevPost.title}`;
      }
      appendLog(`✅ CTA 이전글 매칭 성공: "${prevPost.title}" (카테고리: ${prevPost.category || '없음'})`);
      appendLog(`   👉 URL: ${formData.ctaUrl}`);
      modal?.addLog?.(`🔗 이전글 자동 매칭: ${prevPost.title}`);
    } else {
      if (!currentCategory) {
        appendLog('⚠️ 현재 카테고리가 설정되지 않았습니다.');
      } else {
        appendLog(`⚠️ "${currentCategory}" 카테고리의 이전 발행글을 찾지 못했습니다.`);
      }
      if (!formData.ctaUrl) formData.ctaType = 'none';
    }
  }

  // ✅ previousPostUrl 자동 연결 (CTA와 별도 — 쇼핑커넥트 또는 일반 이전글 링크)
  const needsPreviousPostLookup = !formData.previousPostUrl || formData.previousPostUrl.trim() === '';
  const isShoppingConnectMode = formData.affiliateLink && formData.affiliateLink.trim();
  const skipBecauseCtaIsPrevPost = formData.ctaType === 'previous-post' && !isShoppingConnectMode;

  // ✅ [2026-03-21 FIX] ctaLink에 이미 이전글 URL이 설정되어 있으면 previousPostUrl 중복 설정 방지
  // generateAutoCTA()가 ctaLink에 이전글 URL을 이미 넣었으면, previousPostUrl에 같은 URL을 또 넣으면
  // CTA 버튼 + 네이버 에디터 이전글 카드 양쪽에 동일 글이 표시되는 중복 문제 발생
  const ctaLinkAlreadyHasPreviousPost = formData.ctaLink && formData.ctaLink.trim() &&
    formData.ctaLink.startsWith('http') && formData.ctaLink.includes('blog.naver.com');
  const skipBecauseCtaLinkAlreadySet = ctaLinkAlreadyHasPreviousPost && !isShoppingConnectMode;

  if (needsPreviousPostLookup && formData.ctaType !== 'none' && !skipBecauseCtaIsPrevPost && !skipBecauseCtaLinkAlreadySet) {
    let prevPosts: any[] = [];

    // 쇼핑커넥트모드: 쇼핑커넥트 글 우선
    if (isShoppingConnectMode) {
      prevPosts = publishedPosts
        .filter((p: any) => {
          if (!currentCategory) return false;
          const postCat = normalizeCategory(p.category || '');
          const categoryMatch = postCat === currentCategory;
          const isPostShoppingConnect = !!(p.affiliateLink || p.contentMode === 'shopping-connect');
          return categoryMatch && isPostShoppingConnect;
        })
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      appendLog(`   🔍 동일 카테고리 쇼핑커넥트 글: ${prevPosts.length}개`);
    }

    // 폴백: 같은 카테고리 전체 글
    if (prevPosts.length === 0 && currentCategory) {
      prevPosts = publishedPosts
        .filter((p: any) => normalizeCategory(p.category || '') === currentCategory)
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      appendLog(`   🔍 동일 카테고리 전체 글: ${prevPosts.length}개`);
    }

    const prevPost = prevPosts[0];
    if (prevPost) {
      formData.previousPostTitle = prevPost.title;
      formData.previousPostUrl = prevPost.publishedUrl;
      appendLog(`✅ 이전글 자동 매칭 성공: "${prevPost.title}" (카테고리: ${prevPost.category || '없음'})`);
      appendLog(`   👉 이전글 URL: ${formData.previousPostUrl}`);
      modal?.addLog?.(`🔗 이전글 자동 매칭: ${prevPost.title}`);
    } else {
      if (!currentCategory) {
        appendLog('⚠️ 현재 카테고리가 설정되지 않았습니다.');
      } else {
        appendLog(`⚠️ "${currentCategory}" 카테고리의 이전 발행글을 찾지 못했습니다.`);
      }
    }
  }
}

// ✅ [2026-03-11] 통합 로그 헬퍼 — appendLog + modal.addLog 동시 출력
// ✅ [2026-03-11 FIX] export 추가 — 다중계정 등 외부 모듈에서도 사용 가능
export function emitLog(message: string, modal?: any, type: 'info' | 'warn' | 'error' = 'info'): void {
  appendLog(message);
  if (modal?.addLog) {
    modal.addLog(message);
  }
}

// ✅ [2026-03-11] 치명적 API 에러 판별 (429/500/503 → 즉시 중단)
// ✅ [2026-03-11 FIX] export 추가 — 다중계정 등 외부 모듈에서도 사용 가능
export function isFatalApiError(error: any): boolean {
  const msg = String(error?.message || error || '').toLowerCase();
  return /\b(429|500|503)\b/.test(msg) ||
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('internal server error') ||
    msg.includes('service unavailable');
}

// ✅ [2026-03-11] 재시도 가능한 이미지 에러 판별 (타임아웃, 네트워크 에러 → 재시도)
export function isRetryableImageError(error: any): boolean {
  if (isFatalApiError(error)) return false; // 429/500/503은 재시도하지 않음
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('타임아웃') ||
    msg.includes('시간 초과') || msg.includes('timed out') ||
    msg.includes('network') || msg.includes('fetch') ||
    msg.includes('econnrefused') || msg.includes('econnreset') ||
    msg.includes('결과가 비어있음') || msg.includes('결과 없음') ||
    msg.includes('이미지 없이 발행');
}

// ✅ [2026-03-11] 기술적 에러 → 사용자 친화적 한글 메시지 변환
export function friendlyErrorMessage(error: any): string {
  const msg = String(error?.message || error || '').toLowerCase();
  if (/429|too many requests|rate limit/i.test(msg)) {
    return '⚠️ AI 이미지 생성 할당량이 부족합니다. 잠시 후 다시 시도하거나, 설정에서 할당량을 확인해주세요.';
  }
  if (/500|internal server error/i.test(msg)) {
    return '⚠️ AI 서버가 과부하 상태입니다. 잠시 후 다시 시도해주세요.';
  }
  if (/503|service unavailable/i.test(msg)) {
    return '⚠️ AI 서비스가 현재 점검 중입니다. 잠시 후 다시 시도해주세요.';
  }
  if (/timeout|시간 초과|timed out/i.test(msg)) {
    return '⚠️ 요청 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.';
  }
  if (/network|fetch|econnrefused/i.test(msg)) {
    return '⚠️ 네트워크 연결에 실패했습니다. 인터넷 연결을 확인해주세요.';
  }
  if (/quota|할당/i.test(msg)) {
    return '⚠️ API 할당량이 초과되었습니다. 설정에서 할당량을 확인해주세요.';
  }
  // 그 외: 원본 메시지 그대로 (이미 한글이거나 알 수 없는 에러)
  return `⚠️ 오류가 발생했습니다: ${(error as Error)?.message || String(error)}`;
}

export async function executeFullAutoFlow(formData: any): Promise<any> {
  // ✅ [2026-03-11 FIX] 연속발행 모드가 아닐 때만 플래그 리셋 (경쟁 조건 방지)
  if (!(window as any).isContinuousMode) {
    (window as any).stopFullAutoPublish = false;
  }

  // ✅ 진행상황 모달 가져오기
  const modal = (window as any).currentProgressModal as ProgressModal | null;

  // ✅ 중지 체크 헬퍼 함수
  const checkShouldStop = () => {
    if (isFullAutoStopRequested(modal)) {
      appendLog('⏹️ 사용자가 작업을 취소했습니다.');
      throw new Error('사용자가 작업을 취소했습니다.');
    }
  };

  try {
    // ✅ 중지 체크
    checkShouldStop();

    // ✅ [2026-03-29 FIX v2 + v2.6.1 HOTFIX] 이전 세션 이미지 잔존 방지 + v1.6.5 가드 우회 수정
    // 원인 1: ImageManager에 이전 글 이미지가 남아있으면 그대로 재사용되는 버그
    // 원인 2: (v2.6.1) handleFullAutoPublish가 생성한 이미지를 이 초기화가 지워버려
    //         v1.6.5 가드(formData.imageManagementImages 체크)가 우회되어 L586 경로에서
    //         이미지 재생성 발생 → "다시 이미지 생성" 중복 버그 재발
    // 수정: formData.imageManagementImages가 있으면 초기화 스킵 (이미 생성된 이미지 유지)
    const hasPreGeneratedImages = Array.isArray((formData as any).imageManagementImages)
      && (formData as any).imageManagementImages.length > 0;
    if (hasPreGeneratedImages) {
      console.log(`[FullAuto] ♻️ formData.imageManagementImages ${(formData as any).imageManagementImages.length}장 감지 → ImageManager 초기화 스킵 (중복 생성 방지)`);
      // [v2.6.3] 배치 재주입 — syncAllPreviews 1회만 호출되어 "이미지 하나씩 다시 뜨는" 버그 차단
      try {
        ImageManager.clearAll();
        const batchEntries = (formData as any).imageManagementImages.map((img: any) => ({
          headingTitle: img.heading || 'thumbnail',
          image: img,
        }));
        if (typeof (ImageManager as any).addImagesBatch === 'function') {
          (ImageManager as any).addImagesBatch(batchEntries);
        } else {
          // v2.6.3 이전 호환 fallback
          batchEntries.forEach((e: any) => ImageManager.addImage(e.headingTitle, e.image));
        }
        generatedImages = [...(formData as any).imageManagementImages];
        (window as any).generatedImages = generatedImages;
        console.log(`[FullAuto] ♻️ ImageManager 배치 재주입 완료 (${generatedImages.length}장, sync 1회)`);
      } catch (reuseErr) {
        console.error('[FullAuto] 이미지 재주입 실패:', reuseErr);
      }
    } else {
      try {
        ImageManager.clearAll();
        generatedImages = [];
        (window as any).generatedImages = [];
        console.log('[FullAuto] ✅ ImageManager/generatedImages 초기화 완료 (이전 이미지 잔존 방지)');
      } catch (clearErr) {
        console.error('[FullAuto] ImageManager 초기화 실패:', clearErr);
      }
    }

    // ✅ [2026-04-04 FIX] 이전 글 제목이 UI 필드에 남아서 발행 시 재사용되는 버그 수정
    // executeBlogPublishing이 unified-generated-title을 최우선으로 읽는데,
    // 풀오토 흐름에서는 이 필드를 갱신하지 않아 이전 제목이 그대로 발행됨
    // + formData.title도 초기화 — API 힌트 및 preferredTitle 3순위로 누출 방지
    try {
      const prevTitleInput = document.getElementById('unified-generated-title') as HTMLInputElement;
      if (prevTitleInput) prevTitleInput.value = '';
      const prevTitleInput2 = document.getElementById('unified-title') as HTMLInputElement;
      if (prevTitleInput2) prevTitleInput2.value = '';
    } catch { /* ignore */ }
    formData.title = '';

    // ✅ 이미 생성된 콘텐츠가 있으면 재사용 (중복 생성 방지!)
    let structuredContent = formData.structuredContent;

    if (structuredContent && structuredContent.headings && structuredContent.headings.length > 0) {
      appendLog('📝 기존 생성된 콘텐츠를 사용합니다.');
      console.log('[FullAuto] 기존 콘텐츠 재사용 - 소제목 개수:', structuredContent.headings.length);

      // ✅ [2026-02-01 FIX] 기존 콘텐츠 사용 시에도 selectedTitle 확인 및 패치
      // selectedTitle이 비어있거나 원본 제목과 동일하면 UI에서 현재 제목을 가져와 패치
      const titleInput = document.getElementById('unified-generated-title') as HTMLInputElement;
      const currentUITitle = titleInput?.value?.trim() || '';
      const existingSelectedTitle = structuredContent.selectedTitle?.trim() || '';

      // ✅ [2026-02-01 FIX] 쇼핑커넥트 모드에서 상품명 그대로 제목인 경우 AI로 새 제목 생성
      const contentMode = formData.contentMode || formData.styleOptions?.contentMode || 'seo';
      // ✅ [2026-03-10 FIX] title이 URL이면 productName으로 사용하지 않음
      const _rawTitle = String(structuredContent.title || '').trim();
      const _titleIsUrl = /^https?:\/\//i.test(_rawTitle);
      const productName = String(structuredContent.productInfo?.name || (_titleIsUrl ? '' : _rawTitle) || '').trim();

      if (contentMode === 'affiliate' && productName && existingSelectedTitle) {
        // ✅ [2026-02-02 통일] 제목이 상품명과 거의 동일한지 체크 → 경고 로그만 출력
        // contentGenerator.ts에서 Gemini가 affiliate.prompt로 이미 제목을 생성하므로
        // 여기서 titleABTester로 덮어쓰지 않음 (브랜드스토어/스마트스토어 동일 방식)
        const normalizedTitle = existingSelectedTitle.replace(/[^\w가-힣]/g, '').toLowerCase();
        const normalizedProduct = productName.replace(/[^\w가-힣]/g, '').toLowerCase();

        const isTitleSameAsProduct = normalizedTitle === normalizedProduct ||
          normalizedTitle.includes(normalizedProduct) ||
          normalizedProduct.includes(normalizedTitle);

        if (isTitleSameAsProduct) {
          // ⚠️ 상품명 그대로인 경우 경고만 출력 (contentGenerator에서 패치했어야 함)
          console.warn(`[FullAuto] ⚠️ 쇼핑커넥트: 제목이 상품명과 유사함 - contentGenerator 패치 확인 필요`);
          console.warn(`[FullAuto]    - 현재 제목: "${existingSelectedTitle.substring(0, 50)}..."`);
          console.warn(`[FullAuto]    - 상품명: "${productName.substring(0, 50)}..."`);
        }
      }

      // UI 제목이 있고, 기존 selectedTitle과 다르면 UI 제목 사용
      if (currentUITitle && currentUITitle !== existingSelectedTitle) {
        structuredContent.selectedTitle = currentUITitle;
        console.log(`[FullAuto] ✅ 제목 패치: UI 제목 사용 → "${currentUITitle.substring(0, 40)}..."`);
        appendLog(`📝 제목 패치 적용: ${currentUITitle.substring(0, 30)}...`);
      } else if (!existingSelectedTitle && structuredContent.title) {
        // selectedTitle이 없고 title만 있으면 title 사용
        // ✅ [2026-03-10 FIX] title이 URL이면 selectedTitle에 복사하지 않음
        const _titleVal = String(structuredContent.title || '').trim();
        if (!/^https?:\/\//i.test(_titleVal)) {
          structuredContent.selectedTitle = structuredContent.title;
          console.log(`[FullAuto] ⚠️ selectedTitle 없음 → title 사용: "${structuredContent.title?.substring(0, 40)}..."`);
        } else {
          console.warn(`[FullAuto] ⚠️ title이 URL이므로 selectedTitle에 복사하지 않음: "${_titleVal.substring(0, 60)}"`);
        }
      }
    } else {
      // 새로 생성
      appendLog('📝 콘텐츠 생성 중...');
      await yieldToUI();
      structuredContent = await generateFullAutoContent(formData);

      // ✅ [2026-03-11] 콘텐츠 생성 후 취소 체크
      checkShouldStop();
    }

    if (!structuredContent) {
      throw new Error('콘텐츠 생성에 실패했습니다.');
    }

    await yieldToUI(); // UI 업데이트 허용
    await displayContentInAllTabs(structuredContent);

    // ✅ [2026-04-04 FIX] 풀오토에서도 제목 필드 + formData 갱신 — 이전 글 제목 발행 방지
    // displayContentInAllTabs는 미리보기만 업데이트하고 제목 input은 건드리지 않음
    // formData.title도 갱신해야 executeBlogPublishing 3순위 폴백에서 이전 제목 누출 방지
    const newTitle = structuredContent.selectedTitle || structuredContent.title || '';
    if (newTitle && !/^https?:\/\//i.test(newTitle.trim())) {
      const titleInput = document.getElementById('unified-generated-title') as HTMLInputElement;
      if (titleInput) titleInput.value = newTitle;
      formData.title = newTitle;
    }

    await yieldToUI();

    // ✅ 콘텐츠 저장 및 postId 생성
    currentStructuredContent = structuredContent;
    (window as any).currentStructuredContent = structuredContent;
    const postId = saveGeneratedPost(structuredContent, false, { category: formData.category || formData.categoryName });
    if (postId) {
      currentPostId = postId;
    }

    await yieldToUI(); // UI 업데이트 허용

    // ✅ 이미지 가져오기 (우선순위: ImageManager > 새로 생성)
    let finalImages: any[] = [];

    // 1. ImageManager에서 이미지 가져오기
    const imageManagerImages = ImageManager.getAllImages();
    if (imageManagerImages && imageManagerImages.length > 0) {
      finalImages = imageManagerImages;
      appendLog(`🖼️ ImageManager에서 ${finalImages.length}개의 이미지를 가져왔습니다.`);
    }

    await yieldToUI();

    // 2. 전역 generatedImages에서 가져오기
    if (finalImages.length === 0 && generatedImages && generatedImages.length > 0) {
      finalImages = generatedImages;
      appendLog(`🖼️ 전역 generatedImages에서 ${finalImages.length}개의 이미지를 가져왔습니다.`);
    }

    // ✅ [v2.6.1 HOTFIX] formData.imageManagementImages 최후 방어선 — handleFullAutoPublish 중복 생성 차단
    if (finalImages.length === 0 && Array.isArray((formData as any).imageManagementImages) && (formData as any).imageManagementImages.length > 0) {
      finalImages = [...(formData as any).imageManagementImages];
      appendLog(`♻️ formData에서 이미 생성된 이미지 ${finalImages.length}개 재사용 (중복 방지)`);
      console.log('[FullAuto] ♻️ formData.imageManagementImages 경로로 복구');
    }

    await yieldToUI();

    // 3. 이미지가 없고 skipImages가 false면 선택된 이미지 소스로 이미지 생성
    // ✅ [2026-02-01 FIX] 쇼핑커넥트 "수집 이미지" 모드면 AI 생성하지 않음
    const scSubImageSource = localStorage.getItem('scSubImageSource') || 'collected';
    const isCollectedMode = formData.contentMode === 'affiliate' && scSubImageSource === 'collected';

    // ✅ [2026-02-01 FIX] 수집 이미지 모드일 때 structuredContent에서 이미지 가져오기
    if (isCollectedMode && finalImages.length === 0) {
      const collectedFromContent = structuredContent.collectedImages || structuredContent.images || formData.collectedImages || [];
      if (collectedFromContent.length > 0) {
        // ✅ [2026-02-01 FIX] 중복 이미지 필터링
        const seenUrls = new Set<string>();
        const uniqueImages: any[] = [];

        for (const img of collectedFromContent) {
          const imgUrl = img.url || img.filePath || (typeof img === 'string' ? img : '');
          if (!imgUrl) continue;

          // URL에서 쿼리 파라미터 제거하여 기본 URL로 비교
          const baseUrl = imgUrl.split('?')[0].split('#')[0];

          // 이미 본 URL이면 스킵
          if (seenUrls.has(baseUrl)) {
            console.log(`[FullAuto] 🔄 중복 이미지 스킵: ${baseUrl.substring(0, 50)}...`);
            continue;
          }

          seenUrls.add(baseUrl);
          uniqueImages.push(img);
        }

        console.log(`[FullAuto] 🧹 중복 필터링: ${collectedFromContent.length}개 → ${uniqueImages.length}개`);

        // ✅ [2026-02-01 FIX] 썸네일(0번)과 소제목 이미지를 분리하여 중복 방지
        // 첫 번째 이미지는 썸네일(도입부)용, 나머지는 소제목용
        // ⚠️ [2026-02-01 핵심 수정] 이미지가 부족하면 소제목에는 이미지를 할당하지 않음
        const headingsCount = structuredContent.headings?.length || 0;
        const requiredImageCount = headingsCount + 1; // 썸네일 + 소제목들

        console.log(`[FullAuto] 📊 필요 이미지: ${requiredImageCount}개 (썸네일 1 + 소제목 ${headingsCount}개), 수집: ${uniqueImages.length}개`);

        if (uniqueImages.length < 2) {
          // ⚠️ 이미지가 1개 이하면 썸네일만 사용, 소제목은 이미지 없이 진행
          console.log(`[FullAuto] ⚠️ 이미지 부족! 썸네일만 사용, 소제목 이미지 생략`);
          finalImages = uniqueImages.length > 0 ? [{
            heading: '썸네일',
            filePath: uniqueImages[0].url || uniqueImages[0].filePath || uniqueImages[0],
            url: uniqueImages[0].url || uniqueImages[0].filePath || uniqueImages[0],
            provider: 'collected',
            source: 'smartstore',
            isThumbnail: true
          }] : [];
        } else {
          // ✅ [2026-02-01 핵심 수정] 썸네일과 소제목 이미지 명확히 분리
          // 썸네일: uniqueImages[0]
          // 1번 소제목: uniqueImages[1] (썸네일과 절대 중복 불가)
          // 2번 소제목: uniqueImages[2] ...

          const thumbnailImage = uniqueImages[0];
          const thumbnailUrl = thumbnailImage.url || thumbnailImage.filePath || thumbnailImage;

          // 썸네일 먼저 추가
          finalImages = [{
            heading: '썸네일',
            filePath: thumbnailUrl,
            url: thumbnailUrl,
            provider: 'collected',
            source: 'smartstore',
            isThumbnail: true
          }];

          // 소제목들에 이미지 할당 (썸네일 제외하고 idx=1부터)
          const headingsCount = structuredContent.headings?.length || 0;
          for (let i = 0; i < headingsCount && (i + 1) < uniqueImages.length; i++) {
            const headingImg = uniqueImages[i + 1]; // 1번 소제목은 uniqueImages[1], 2번은 [2]...
            const headingTitle = structuredContent.headings[i]?.title || `소제목 ${i + 1}`;
            const imgUrl = headingImg.url || headingImg.filePath || headingImg;

            // ⚠️ 썸네일과 동일한 이미지면 스킵
            if (imgUrl.split('?')[0] === thumbnailUrl.split('?')[0]) {
              console.log(`[FullAuto] ⚠️ ${headingTitle}: 썸네일과 동일한 이미지 스킵!`);
              continue;
            }

            finalImages.push({
              heading: headingTitle,
              filePath: imgUrl,
              url: imgUrl,
              provider: 'collected',
              source: 'smartstore',
              isThumbnail: false
            });
          }

          console.log(`[FullAuto] ✅ 이미지 할당 완료: 썸네일 1개 + 소제목 ${finalImages.length - 1}개`);
        }

        appendLog(`✅ 수집된 제품 이미지 ${finalImages.length}개를 사용합니다. (중복 ${collectedFromContent.length - uniqueImages.length}개 제거)`);
        console.log(`[FullAuto] ✅ 수집 이미지 모드: finalImages ${finalImages.length}개 사용`);

        // ✅ [2026-02-01 FIX] 수집 이미지를 ImageManager에 등록하여 UI 그리드와 동기화
        finalImages.forEach((img: any) => {
          if (img.heading && img.heading !== '썸네일') {
            ImageManager.addImage(img.heading, {
              filePath: img.filePath || img.url,
              provider: 'collected',
              url: img.url || img.filePath
            });
          }
        });
        ImageManager.syncGeneratedImagesArray();
        console.log(`[FullAuto] ImageManager에 수집 이미지 ${finalImages.length}개 등록 완료`);
      }
    }

    if (isCollectedMode && finalImages.length === 0) {
      modal?.addLog('⚠️ 수집 이미지 모드가 선택되었으나 이미지가 없습니다. 텍스트로 진행합니다.');
      appendLog('⚠️ 수집 이미지 없음 - AI 생성 폴백 없이 텍스트로 발행');
    } else if (finalImages.length === 0 && !formData.skipImages && formData.imageSource && formData.imageSource !== 'skip') {
      const _sourceNames: Record<string, string> = {
        'pollinations': 'Pollinations (FLUX, 무료)',
        'nano-banana-pro': '나노 바나나 프로 (Gemini Native)',
        'prodia': 'Prodia',
        'stability': 'Stability AI',
        'deepinfra': 'DeepInfra FLUX-2',
        'deepinfra-flux': 'DeepInfra FLUX-2',
        'falai': 'Fal.ai FLUX',
        'naver-search': '네이버 이미지 검색',
        'naver': '네이버 이미지 검색',
      };
      const _friendlySource = _sourceNames[formData.imageSource] || formData.imageSource;
      appendLog(`🖼️ 이미지 생성 시작 (엔진: ${_friendlySource})...`);
      modal?.addLog(`🖼️ ${_friendlySource}로 이미지 생성 중...`);
      modal?.setProgress(35, '이미지 생성 중...');

      // ✅ [2026-02-02 FIX] 이미지 생성 시작 시 플레이스홀더 그리드 표시
      const headingsForPreview = structuredContent.headings || [];
      if (headingsForPreview.length > 0) {
        const placeholderImages = headingsForPreview.map((h: any, idx: number) => ({
          heading: String(h.title || h.text || `이미지 ${idx + 1}`).trim(),
          url: '', // 플레이스홀더 (빈 URL)
          isPlaceholder: true
        }));
        modal?.showImages(placeholderImages, `🎨 이미지 생성 중... (${_friendlySource})`);
      }

      // ✅ [2026-03-11 FIX] 이미지 생성 공격적 재시도 + 프로바이더 폴백 체인
      // 타임아웃/네트워크 에러 시 반드시 성공하도록 최대 6회 재시도 + 엔진 자동 전환
      const IMAGE_GEN_MAX_RETRIES = 6;
      let imageGenSuccess = false;

      // ✅ [v1.4.80] 프로바이더 폴백 체인 — 무료 엔진 우선 + 유료 최소화
      //   원래 엔진 3회 → 무료/저가 엔진 우선 → 마지막에만 유료 고비용
      //   Flow/ImageFX 선택 시 같은 Google 세션 내에서 폴백 (AdsPower 재사용)
      const originalProvider = formData.imageSource;
      // 원본이 Flow/ImageFX(무료)면 상호 폴백, 유료 엔진은 마지막 수단
      const isOriginFree = originalProvider === 'flow' || originalProvider === 'imagefx';
      const FALLBACK_CHAIN = isOriginFree ? [
        originalProvider,    // 1회차
        originalProvider,    // 2회차
        originalProvider,    // 3회차
        originalProvider === 'flow' ? 'imagefx' : 'flow',  // 4회차: 다른 무료 엔진
        'deepinfra',         // 5회차: DeepInfra FLUX schnell ($0.003/장)
        'deepinfra',         // 6회차: 동일 (저가 유지)
      ] : [
        originalProvider,    // 1회차
        originalProvider,    // 2회차
        originalProvider,    // 3회차
        'imagefx',           // 4회차: ImageFX (무료)
        'deepinfra',         // 5회차: DeepInfra FLUX schnell (저가)
        'openai-image',      // 6회차: DALL-E (최후 유료)
      ];
      const getProviderForAttempt = (attempt: number): string => {
        return FALLBACK_CHAIN[attempt - 1] || FALLBACK_CHAIN[FALLBACK_CHAIN.length - 1];
      };

      // ✅ 재시도 대기 시간 (초): 빠르고 공격적으로
      const RETRY_DELAYS = [0, 10, 10, 10, 15, 15]; // 1회차=0, 2회차=10초, ...

      for (let imageAttempt = 1; imageAttempt <= IMAGE_GEN_MAX_RETRIES && !imageGenSuccess; imageAttempt++) {
        // ✅ [2026-03-11 FIX] 이미지 재시도 루프 시작 시 중지 체크 — 중지 버튼 즉시 반영
        checkShouldStop();

        const currentProvider = getProviderForAttempt(imageAttempt);
        try {
          if (imageAttempt > 1) {
            const retryWaitSec = RETRY_DELAYS[imageAttempt] || 15;
            const providerChanged = currentProvider !== originalProvider;
            const providerMsg = providerChanged ? ` (엔진 변경: ${currentProvider})` : '';
            appendLog(`🔄 이미지 생성 재시도 (${imageAttempt}/${IMAGE_GEN_MAX_RETRIES})${providerMsg}, ${retryWaitSec}초 대기 중...`);
            modal?.addLog(`🔄 재시도 ${imageAttempt}/${IMAGE_GEN_MAX_RETRIES}${providerMsg}`);
            modal?.setProgress(33, `이미지 재시도 대기 중... (${retryWaitSec}초)`);
            // ✅ [2026-03-11 FIX] 중단 가능한 대기 — 500ms 단위 폴링으로 중지 버튼 즉시 반영
            const _waitEnd = Date.now() + retryWaitSec * 1000;
            while (Date.now() < _waitEnd) {
              checkShouldStop();
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }

          const headings = structuredContent.headings || [];
          // ✅ [2026-03-10 FIX] URL이 제목으로 사용되는 것을 방지
          const _rawFullAutoTitle = structuredContent.selectedTitle || structuredContent.title || '';
          const fullAutoTitle = /^https?:\/\//i.test(String(_rawFullAutoTitle)) ? '' : _rawFullAutoTitle;

          // ✅ 참조 이미지 추출 (이전에 수집된 이미지가 있다면 사용)
          let referenceImagePath = '';
          const collectedImgs = (window as any).imageManagementGeneratedImages || (window as any).generatedImages || [];
          if (collectedImgs.length > 0) {
            referenceImagePath = collectedImgs[0].filePath || collectedImgs[0].url;
          }

          // ✅ [2026-02-27 FIX] 전용 썸네일 별도 생성 — AI 추론 프롬프트로 콘텐츠 반영
          // ✅ [2026-03-12 FIX] headingImageMode=none이면 전용 썸네일도 생성하지 않음
          const _headingImageModeForThumb = localStorage.getItem('headingImageMode') || 'all';
          let dedicatedThumbnailImage: any = null;
          if (_headingImageModeForThumb === 'none') {
            console.log('[FullAuto] 🚫 headingImageMode=none: 전용 썸네일 생성도 건너뜁니다.');
            appendLog('🚫 이미지 없이 모드: 썸네일 포함 모든 이미지 생성 건너뛰기');
          } else try {
            // ✅ [2026-03-11 FIX] 모든 엔진에서 텍스트 포함 허용 (nano-banana: AI 직접 렌더링, 기타: Sharp 후처리)
            const thumbnailAllowText = !!formData.includeThumbnailText;
            const globalImgSettings = getGlobalImageSettings();
            const thumbImageStyle = formData.imageStyle || globalImgSettings.imageStyle || '';

            // ✅ [2026-02-27 FIX] 블로그 제목을 AI가 추론하여 콘텐츠에 맞는 영어 프롬프트 생성
            let thumbnailPrompt: string;
            try {
              const aiTranslated = await generateEnglishPromptForHeading(
                fullAutoTitle, formData.keywords, thumbImageStyle
              );
              thumbnailPrompt = aiTranslated;
              appendLog(`🎨 AI 썸네일 프롬프트: "${aiTranslated.substring(0, 60)}..."`);
            } catch {
              // AI 전부 실패 시 폴백
              thumbnailPrompt = `eye-catching blog thumbnail, visual metaphor for: ${fullAutoTitle}, cinematic lighting, compelling composition, hero image style`;
              appendLog(`⚠️ AI 썸네일 프롬프트 생성 실패 → 기본 프롬프트 사용`);
            }

            appendLog(`🖼️ [풀오토] 전용 썸네일 별도 생성 중... (엔진: ${currentProvider})`);
            modal?.addLog(`🖼️ 전용 썸네일 생성 시작... (${currentProvider})`);

            const thumbResult = await generateImagesWithCostSafety({
              provider: currentProvider,
              items: [{
                heading: fullAutoTitle || '블로그 썸네일',
                prompt: thumbnailPrompt,
                englishPrompt: thumbnailPrompt, // ✅ sanitizeImagePrompt 바이패스
                isThumbnail: true,
                allowText: thumbnailAllowText,
              }],
              postTitle: fullAutoTitle,
              isFullAuto: true,
              category: formData.category || formData.categoryName || '',
              referenceImagePath,
              imageRatio: globalImgSettings.thumbnailRatio || globalImgSettings.imageRatio || '1:1', // ✅ [2026-03-07 FIX] 썸네일 전용 비율
              thumbnailTextInclude: thumbnailAllowText, // ✅ [2026-03-16] 명시적 전달
            });

            if (thumbResult?.success && thumbResult.images && thumbResult.images.length > 0) {
              dedicatedThumbnailImage = {
                ...thumbResult.images[0],
                heading: fullAutoTitle || '🖼️ 썸네일',
                isThumbnail: true,
              };
              appendLog(`✅ [풀오토] 전용 썸네일 생성 완료!`);
              modal?.addLog(`✅ 전용 썸네일 생성 완료`);
            } else {
              appendLog(`⚠️ [풀오토] 전용 썸네일 생성 실패 → 썸네일 없이 진행`);
            }
          } catch (thumbErr) {
            // ✅ 썸네일 실패는 소제목 재시도에 영향 안 줌 (독립 처리)
            appendLog(`⚠️ [풀오토] 전용 썸네일 생성 오류: ${(thumbErr as Error).message}`);
          }

          // ✅ [2026-02-24 UPDATED] 소제목 이미지: 모든 항목 isThumbnail: false, allowText: false
          const imageResult = await generateImagesWithCostSafety({
            provider: currentProvider,
            title: fullAutoTitle,
            items: (() => {
              const allItems = headings.map((h: any, idx: number) => {
                const title = String(h.title || h.text || (typeof h === 'string' ? h : '')).trim();
                const prompt = String(h.imagePrompt || h.prompt || title || 'Abstract Image').trim();
                // ✅ [2026-03-10 FIX] headingImageMode 필터링은 main.ts IPC 핸들러에서 1회만 수행
                // 렌더러에서 사전 필터링하면 이중 필터링으로 짝수/홀수 모드에서 이미지 누락 발생
                return {
                  heading: title || '이미지',
                  prompt: prompt,
                  englishPrompt: prompt,   // ✅ [2026-02-27 FIX] sanitizeImagePrompt 바이패스
                  isThumbnail: false,   // ✅ 전용 썸네일 별도 생성됨 → 소제목은 항상 false
                  allowText: false      // ✅ 소제목 이미지에는 텍스트 없음
                };
              }).filter(Boolean);

              // thumbnailOnly 옵션이 활성화되면 소제목 이미지 생성 건너뛰기
              // ✅ [2026-03-12 FIX] formData + localStorage 양쪽 모두 체크
              // 연속발행(continuousPublishing)에서 formData.thumbnailOnly가 누락될 수 있으므로 localStorage도 확인
              const isThumbnailOnly = formData.thumbnailOnly || localStorage.getItem('thumbnailOnly') === 'true';
              if (isThumbnailOnly) {
                console.log('[FullAuto] 📷 썸네일만 생성 모드: 소제목 이미지 없이 전용 썸네일만 사용');
                return []; // ✅ 전용 썸네일만 사용, 소제목 이미지 없음
              }
              return allItems;
            })(),
            category: formData.category || formData.categoryName || '',
            referenceImagePath, // ✅ 참조 이미지 전달
            imageRatio: (getGlobalImageSettings().subheadingRatio || getGlobalImageSettings().imageRatio || '1:1'), // ✅ [2026-03-07 FIX] 소제목 전용 비율
            thumbnailTextInclude: !!formData.includeThumbnailText, // ✅ [2026-03-16] 명시적 전달
          });

          if (imageResult?.success && imageResult.images && imageResult.images.length > 0) {
            // ✅ [2026-02-24] 전용 썸네일을 맨 앞에 추가
            finalImages = [
              ...(dedicatedThumbnailImage ? [dedicatedThumbnailImage] : []),
              ...imageResult.images.map((img: any) => ({ ...img, isThumbnail: false })),
            ];
            // ImageManager에 저장
            imageResult.images.forEach((img: any, idx: number) => {
              const heading = headings[idx]?.title || headings[idx] || `이미지 ${idx + 1}`;
              ImageManager.addImage(heading, {
                filePath: img.filePath,
                provider: img.provider || currentProvider,
                url: img.url || img.filePath
              });
            });
            appendLog(`✅ ${finalImages.length}개의 이미지 생성 완료! (썸네일 ${dedicatedThumbnailImage ? '포함' : '미포함'}, 엔진: ${currentProvider})`);
            modal?.addLog(`✅ 이미지 ${finalImages.length}개 생성 완료`);
            imageGenSuccess = true; // ✅ 성공 → 재시도 루프 종료
          } else if (dedicatedThumbnailImage) {
            // 소제목 이미지 생성 실패해도 전용 썸네일은 사용
            finalImages = [dedicatedThumbnailImage];
            appendLog(`⚠️ 소제목 이미지 생성 실패, 전용 썸네일만 사용합니다.`);
            modal?.addLog('⚠️ 소제목 이미지 실패, 썸네일만 사용');
            imageGenSuccess = true; // ✅ 부분 성공도 OK
          } else {
            // 이미지 결과가 빈 경우 → 재시도 가능
            throw new Error('이미지 생성 결과가 비어있음');
          }
        } catch (imgError) {
          console.error(`[FullAuto] 이미지 생성 오류 (시도 ${imageAttempt}/${IMAGE_GEN_MAX_RETRIES}, 엔진: ${currentProvider}):`, imgError);

          // ✅ 치명적 API 에러(429/500/503)면 → 같은 엔진 재시도는 무의미, 폴백 엔진으로 전환
          if (isFatalApiError(imgError)) {
            // 마지막 시도면 중단
            if (imageAttempt >= IMAGE_GEN_MAX_RETRIES) {
              emitLog(friendlyErrorMessage(imgError), modal, 'error');
              throw imgError;
            }
            // 아직 시도 남았으면 폴백 엔진으로 재시도 (continue → 다음 루프에서 getProviderForAttempt)
            appendLog(`⚠️ ${currentProvider} API 에러 (${(imgError as Error).message}), 다른 엔진으로 재시도...`);
            modal?.addLog(`⚠️ API 에러 → 엔진 교체 재시도`);
            continue;
          }

          // ✅ 재시도 가능한 에러이고 남은 시도가 있으면 재시도
          if (imageAttempt < IMAGE_GEN_MAX_RETRIES) {
            const nextProvider = getProviderForAttempt(imageAttempt + 1);
            const switchMsg = nextProvider !== currentProvider ? ` → 엔진 변경: ${nextProvider}` : '';
            appendLog(`⚠️ 이미지 생성 실패 (${imageAttempt}/${IMAGE_GEN_MAX_RETRIES}): ${(imgError as Error).message}`);
            appendLog(`🔄 자동 재시도합니다...${switchMsg}`);
            modal?.addLog(`⚠️ 실패 ${imageAttempt}/${IMAGE_GEN_MAX_RETRIES}, 재시도 중...`);
            continue; // 다음 시도로
          }

          // 모든 재시도 소진 → 이미지 없이 발행 진행
          appendLog(`❌ ${IMAGE_GEN_MAX_RETRIES}회 모두 실패. 텍스트 위주로 발행합니다.`);
          emitLog(`${friendlyErrorMessage(imgError)} ${IMAGE_GEN_MAX_RETRIES}회 재시도 후에도 실패하여 텍스트 위주로 발행합니다.`, modal, 'warn');
        }
      }
    } else if (finalImages.length === 0 && formData.skipImages) {
      appendLog('ℹ️ 이미지 건너뛰기 옵션이 선택되어 이미지 없이 발행합니다.');
      modal?.addLog('ℹ️ 이미지 건너뛰기');
    }


    await yieldToUI();

    // ✅ [2026-03-11] 이미지 처리 후 취소 체크
    checkShouldStop();

    // ✅ [2026-02-24 FIX] filterImagesForPublish는 executeBlogPublishing 내부에서 1회만 호출
    // 풀오토에서도 사전 호출 제거하여 이중 필터링 + 썸네일 이중 prepend 방지
    // finalImages = filterImagesForPublish(structuredContent, finalImages);

    // ✅ 이미지 목록 로깅
    if (finalImages.length > 0) {
      appendLog(`✅ 총 ${finalImages.length}개의 이미지를 발행에 사용합니다.`);
      finalImages.forEach((img: any, idx: number) => {
        const provider = img.provider || 'unknown';
        const heading = img.heading || '제목 없음';
        appendLog(`   [${idx + 1}] ${heading} (${provider})`);
      });

      // ✅ [2026-02-01] 모달에 이미지 그리드 표시
      const imageSource = UnifiedDOMCache.getImageSource();
      const imageTitle = imageSource === 'collected' ? '📷 수집된 이미지' : '🎨 생성된 이미지';
      modal?.showImages(finalImages, imageTitle);
    }

    await yieldToUI();

    // 풀오토 발행에서도 이미지 미리보기 표시
    if (structuredContent.headings && structuredContent.headings.length > 0) {
      appendLog('✅ 이미지 준비 완료! 바로 발행을 진행합니다.');
      updateUnifiedImagePreview(structuredContent.headings, finalImages);
    }

    await yieldToUI();

    // ✅ [100점 수정] 후킹 이미지 영상 변환 (쇼핑커넥트 모드 전용)
    // useAffiliateVideo 옵션이 활성화되면 2번째 이미지(본문 첫 이미지)를 영상으로 변환
    if ((formData as any).useAffiliateVideo && finalImages.length >= 2) {
      const hookingImage = finalImages[1]; // 2번째 이미지 (인덱스 1) - 본문 첫 이미지
      const hookingHeading = structuredContent.headings?.[1]?.title || structuredContent.headings?.[1]?.text || '후킹 영상';
      const hookingImagePath = hookingImage?.filePath || '';
      const normalizedHeading = normalizeHeadingKeyForVideoCache(String(hookingHeading).trim());

      // ✅ [100점 개선] 기존 영상 중복 체크
      const existingVideo = typeof (window.api as any)?.getAppliedVideo === 'function'
        ? await (window.api as any).getAppliedVideo(normalizedHeading)
        : null;

      if (existingVideo?.filePath) {
        appendLog(`ℹ️ 이미 영상이 배치되어 있습니다: "${hookingHeading}". 기존 영상을 사용합니다.`);
        modal?.addLog('ℹ️ 기존 영상 재사용');
      } else if (hookingImagePath) {
        appendLog(`🎬 [쇼핑커넥트] 후킹 이미지 영상 변환 시작: "${hookingHeading}"`);
        appendLog('   📐 비율: 1:1 (정사각형, 피드 꽉찬 표시)');
        modal?.addLog('🎬 후킹 영상 생성 중...');
        modal?.setProgress(52, '후킹 영상 생성 중...');

        try {
          // Veo 또는 KenBurns 영상 생성
          let videoResult: any = null;
          const startTime = Date.now();
          const VEO_TIMEOUT_MS = 120000; // 2분 (Veo 워닝용)

          // 먼저 Veo 시도
          if (typeof (window.api as any)?.generateVeoVideo === 'function') {
            // ✅ [100점 개선] 더 효과적인 영상 프롬프트 (피드 주목도 극대화)
            const veoPrompt = `Cinematic product reveal video. The ${hookingHeading} dramatically fills the entire square frame. Slow zoom in with professional studio lighting. Luxurious and premium feel. High contrast, vivid colors. Center-focused composition for maximum visual impact on social media feed.`;

            appendLog('   ⏳ Veo 영상 생성 요청 중... (최대 2~3분 소요)');

            videoResult = await (window.api as any).generateVeoVideo({
              prompt: veoPrompt,
              model: 'veo-3.1-generate-preview',
              durationSeconds: 6,
              aspectRatio: '1:1', // ✅ [100점 개선] 1:1 정사각형 비율로 피드에서 꽉차게 표시
              negativePrompt: 'audio, speech, voice, voiceover, narration, music, singing, lyrics, dialogue, text, watermark, logo',
              imagePath: hookingImagePath,
              heading: String(hookingHeading).trim(),
            });

            // ✅ [100점 개선] 타임아웃 경고
            const elapsedMs = Date.now() - startTime;
            if (elapsedMs > VEO_TIMEOUT_MS && !videoResult?.success) {
              appendLog('   ⏰ Veo 생성이 오래 걸리고 있습니다. KenBurns로 빠르게 전환합니다.');
            }
          }

          // Veo 실패 시 KenBurns 폴백
          if (!videoResult?.success) {
            appendLog(`⚠️ Veo 영상 생성 실패, KenBurns로 폴백: ${videoResult?.message || 'unknown'}`);
            modal?.addLog('🔄 KenBurns 폴백 생성 중...');

            if (typeof (window.api as any)?.createKenBurnsVideo === 'function') {
              videoResult = await (window.api as any).createKenBurnsVideo({
                imagePath: hookingImagePath,
                heading: String(hookingHeading).trim(),
                durationSeconds: 6,
                aspectRatio: '1:1', // ✅ [100점 개선] 1:1 정사각형 비율
              });
            }
          }

          if (videoResult?.success && videoResult?.filePath) {
            appendLog(`✅ 후킹 영상 생성 완료: ${videoResult.filePath}`);
            appendLog('   📐 1:1 정사각형 비율로 피드에서 꽉차게 표시됩니다.');
            modal?.addLog('✅ 후킹 영상 생성 완료');

            // 소제목에 영상 적용
            if (typeof (window.api as any)?.applyHeadingVideo === 'function') {
              await (window.api as any).applyHeadingVideo(String(hookingHeading).trim(), {
                provider: videoResult.filePath?.includes('veo') ? 'veo' : 'kenburns',
                filePath: videoResult.filePath,
                previewDataUrl: '',
                updatedAt: Date.now(),
              });
            }
          } else {
            appendLog(`⚠️ 후킹 영상 생성 실패: ${videoResult?.message || '알 수 없는 오류'}. 영상 없이 진행합니다.`);
            modal?.addLog('⚠️ 후킹 영상 생성 실패, 계속 진행');
          }
        } catch (videoError) {
          console.error('[FullAuto] 후킹 영상 생성 오류:', videoError);
          appendLog(`⚠️ 후킹 영상 생성 중 오류: ${(videoError as Error).message}. 영상 없이 진행합니다.`);
          modal?.addLog('⚠️ 후킹 영상 오류, 계속 진행');
        }

        await yieldToUI();
      } else {
        appendLog('⚠️ 후킹 이미지 경로가 없어 영상 변환을 건너뜁니다.');
      }
    }

    // ✅ 진행상황 모달 업데이트 - 이미지 생성 완료, 로그인 시작
    modal?.setStep(2, 'completed', '완료');
    modal?.setProgress(55, '네이버 로그인 준비 중...');
    modal?.addLog(`✅ 이미지 ${finalImages.length}개 준비 완료`);
    modal?.setStep(3, 'active', '로그인 중...');

    // ✅ 발행 전 중지 체크
    checkShouldStop();

    // ✅ [2026-03-05] 이전글 엮기 공통 함수 호출 (풀오토 + 반자동 동일 로직)
    autoLinkPreviousPost(formData, modal);


    // 즉시 발행 진행
    const automationResult = await executeBlogPublishing(structuredContent, finalImages, formData);

    // ✅ 발행 완료 시 글 정보 업데이트 (이미지, URL, 발행상태)
    if (currentPostId && automationResult?.success) {
      const publishedUrl = automationResult.url || automationResult.postUrl || automationResult.blogUrl;
      if (publishedUrl) {
        updatePostAfterPublish(currentPostId, publishedUrl, formData.publishMode);
      }
      // ✅ 이미지 정보도 글목록에 저장
      updatePostImages(currentPostId, finalImages);
    }

    // ✅ 진행상황 모달 업데이트 - 발행 완료
    modal?.setStep(3, 'completed', '완료');
    modal?.setStep(4, 'completed', '완료');
    modal?.setProgress(100, '발행 완료!');
    modal?.addLog('✅ 블로그 발행 완료!');

    // ✅ Unified Progress Bar도 100%로 강제 업데이트 (95%에서 멈춤 방지)
    showUnifiedProgress(100, '발행 완료!', '모든 작업이 완료되었습니다.');

    // ✅ 발행 완료 시 자동 저장/백업 중지 및 임시 데이터 삭제
    try {
      stopAutosave();
      stopAutoBackup();
      clearAutosavedContent();
      appendLog('💾 임시 저장 데이터 삭제 완료');
    } catch (e) {
      console.error('[FullAutoFlow] 임시 데이터 정리 중 오류:', e);
    }

    // ✅ [2026-03-29 FIX] 발행 성공 시에만 필드 초기화 (3초 후)
    // executeBlogPublishing이 throw 없이 { success: false } 반환하는 경우에도 콘텐츠 보존
    if (automationResult?.success) {
      setTimeout(() => {
        try {
          resetAllFields();
          // ✅ Unified Progress Bar 숨기기 추가
          hideUnifiedProgress();
        } catch (e) {
          console.error('[FullAutoFlow] 필드 초기화 중 오류:', e);
        }
      }, 3000);
    } else {
      console.log('[FullAutoFlow] ⚠️ 발행 결과가 성공이 아니므로 콘텐츠/이미지 보존 (재시도 가능)');
      // 실패 시에는 resetPublishing만 호출 (콘텐츠 보존)
      try { resetPublishing(); } catch (e) { /* ignore */ }
    }

    return automationResult;
  } catch (error) {
    console.error('[FullAutoFlow] 오류:', error);

    // ✅ [2026-03-22 FIX] 실패 시 발행 상태 리셋 (재시도 가능하도록)
    try { resetPublishing(); } catch (e) { console.warn('[FullAutoFlow] resetPublishing 오류:', e); }
    try { hideUnifiedProgress(); } catch (e) { /* ignore */ }

    throw error;
  }
}

// 반자동 모드 실행 플로우
export async function executeSemiAutoFlow(formData: any): Promise<any> {
  // ✅ [2026-03-11 FIX] 반자동 발행에서도 취소 체크 추가
  // 연속발행 모드가 아닐 때만 플래그 리셋 (풀오토와 동일 패턴)
  if (!(window as any).isContinuousMode) {
    (window as any).stopFullAutoPublish = false;
  }

  // ✅ 중지 체크 헬퍼 (반자동 전용)
  const checkSemiAutoStop = () => {
    if ((window as any).stopFullAutoPublish === true) {
      appendLog('⏹️ 사용자가 작업을 취소했습니다.');
      throw new Error('사용자가 작업을 취소했습니다.');
    }
  };

  try {
  // 반자동 로직 구현
  appendLog('🔧 반자동 모드: 수동 콘텐츠 기반 자동화 시작');
  showUnifiedProgress(5, '수동 콘텐츠 처리 시작', '입력된 콘텐츠를 분석하고 있습니다.');

  // ✅ [2026-01-21 FIX] 반자동 발행 시 프리셋 썸네일 복원
  // 썸네일 생성기에서 저장한 image-tab 프리셋이 있으면 복원
  const imageTabPreset = applyPresetThumbnailIfExists('image-tab');
  if (imageTabPreset.applied) {
    appendLog('🎨 미리 세팅된 썸네일이 복원됩니다!');

    // ImageManager에 1번 소제목 이미지로 복원
    const firstHeadingTitle = resolveFirstHeadingTitleForThumbnail();
    if (firstHeadingTitle && imageTabPreset.forHeading) {
      imageTabPreset.forHeading.heading = firstHeadingTitle;
      ImageManager.setImage(firstHeadingTitle, imageTabPreset.forHeading);

      // generatedImages 업데이트
      if (!formData.imageManagementImages || formData.imageManagementImages.length === 0) {
        formData.imageManagementImages = [imageTabPreset.forHeading];
      } else {
        formData.imageManagementImages[0] = imageTabPreset.forHeading;
      }

      // thumbnailPath도 설정 (쇼핑커넥트 대비)
      if (imageTabPreset.forThumbnail) {
        (window as any).thumbnailPath = imageTabPreset.forThumbnail;
        formData.thumbnailPath = imageTabPreset.forThumbnail;
      }
    }
  }

  // 구조화된 콘텐츠 사용 (formData에서 전달된 structuredContent 사용)
  // 반자동 모드는 이미 생성된 콘텐츠를 사용하므로 소제목 정보도 포함되어야 함
  const structuredContent = formData.structuredContent || {
    selectedTitle: formData.title,
    bodyPlain: formData.content,
    content: formData.content,
    hashtags: formData.hashtags,
    headings: formData.structuredContent?.headings || [] // 소제목 정보 보존
  };

  // 소제목 정보가 있으면 로그 출력
  if (structuredContent.headings && structuredContent.headings.length > 0) {
    appendLog(`📑 소제목 ${structuredContent.headings.length}개가 포함되어 있습니다.`);
  }

  // 미리보기 업데이트
  updateUnifiedPreview(structuredContent);
  showUnifiedProgress(30, '콘텐츠 준비 완료', '수동 입력 콘텐츠가 준비되었습니다.');
  appendLog('✅ 콘텐츠 준비 완료');

  // ✅ 이미지 관리 탭에서 생성한 이미지가 있으면 사용, 없으면 생성
  let generatedImagesForPublish: any[] = [];

  // ✅ 디버깅: formData.imageManagementImages 확인
  console.log('[SemiAuto] formData.imageManagementImages:', formData.imageManagementImages);
  console.log('[SemiAuto] imageManagementImages.length:', formData.imageManagementImages?.length);
  console.log('[SemiAuto] skipImages:', formData.skipImages);

  // ✅ 이미지 관리 탭에서 생성한 이미지가 있으면 사용 (빈 배열도 '사용자 의도'로 간주), 없으면 생성
  // ✅ [수정] imageManagementImages가 배열이면 (빈 배열 포함) 사용자가 이미지 관리 탭을 사용한 것으로 간주
  //    - 자동 생성 하지 않고 그대로 사용 (빈 슬롯은 이미지 없이 발행)
  const hasImageManagementData = Array.isArray(formData.imageManagementImages);

  if (hasImageManagementData && formData.imageManagementImages.length > 0) {
    // 이미지 관리 탭에서 생성한 이미지 사용
    showUnifiedProgress(50, '이미지 준비 완료', `이미지 관리 탭에서 생성한 ${formData.imageManagementImages.length}개의 이미지를 사용합니다.`);
    appendLog(`✅ 이미지 관리 탭에서 생성한 ${formData.imageManagementImages.length}개의 이미지를 사용합니다.`);

    // ✅ [2026-02-24 FIX] filterImagesForPublish는 executeBlogPublishing 내부에서 1회만 호출
    // 여기서 사전 호출하면 이중 필터링으로 썸네일 중복/인덱스 시프트 발생
    generatedImagesForPublish = [...formData.imageManagementImages];

    showUnifiedProgress(60, '이미지 준비 완료', '이미지가 준비되었습니다.');
    appendLog('✅ 이미지 준비 완료!');
  } else if (hasImageManagementData && formData.imageManagementImages.length === 0) {
    // ✅ [New] 이미지 관리 탭에서 의도적으로 이미지를 비워둔 경우 → 자동 생성 없이 발행
    showUnifiedProgress(50, '이미지 없이 발행', '이미지 관리 탭에 이미지가 없어 이미지 없이 발행합니다.');
    appendLog('⏭️ 이미지 관리 탭에 이미지가 없습니다. 이미지 없이 발행합니다.');
    generatedImagesForPublish = [];
  } else if (!formData.skipImages) {
    // 이미지 관리 탭을 사용하지 않은 경우에만 새로 이미지 생성
    showUnifiedProgress(40, '이미지 생성 시작...', '제목에 맞는 이미지를 생성하고 있습니다.');
    appendLog('🎨 이미지가 없습니다. 새로 생성 중...');
    appendLog(`   [디버그] imageManagementImages가 없어서 새로 생성: ${JSON.stringify(formData.imageManagementImages)}`);

    // ✅ [2026-02-01 FIX] 콘텐츠 생성 시 수집된 이미지를 formData에 전달하여 중복 크롤링 방지
    if (structuredContent.collectedImages && structuredContent.collectedImages.length > 0) {
      formData.collectedImages = structuredContent.collectedImages;
      console.log(`[FullAuto] ✅ structuredContent.collectedImages → formData.collectedImages 전달: ${structuredContent.collectedImages.length}개`);
    }

    generatedImagesForPublish = await generateImagesForContent(structuredContent, formData);

    // ✅ 생성된 이미지를 ImageManager에 등록 (발행 시 매칭을 위해 필수!)
    if (generatedImagesForPublish.length > 0) {
      generatedImagesForPublish.forEach((img: any) => {
        if (img.heading) {
          ImageManager.setImage(img.heading, img);
        }
      });
      appendLog(`🔗 ImageManager에 ${generatedImagesForPublish.length}개 이미지 등록 완료`);

      // ✅ [2026-02-26 FIX] 이미지 관리탭 미리보기에도 표시
      try {
        displayGeneratedImages(generatedImagesForPublish);
        updatePromptItemsWithImages(generatedImagesForPublish);
      } catch (uiErr) {
        console.warn('[SemiAuto] 이미지 관리탭 UI 업데이트 실패:', uiErr);
      }
    }

    showUnifiedProgress(60, '이미지 생성 완료', '이미지가 성공적으로 생성되었습니다.');
    appendLog('✅ 이미지 생성 완료');
  } else {
    appendLog('⏭️ 이미지 생성 건너뛰기 (skipImages = true)');
  }

  // ✅ [2026-03-11 FIX] 이미지 처리 후 취소 체크
  checkSemiAutoStop();

  // ✅ [2026-03-05] 반자동 발행에서도 이전글 엮기 작동 (모든 모드 통일)
  autoLinkPreviousPost(formData);

  // ✅ [2026-03-11 FIX] 발행 전 취소 체크
  checkSemiAutoStop();

  // 블로그 발행
  showUnifiedProgress(80, '블로그 발행 준비 중...', '네이버 블로그에 발행할 준비를 하고 있습니다.');
  appendLog('📤 블로그 발행 시작...');
  appendLog(`📊 발행 정보: 제목="${structuredContent.selectedTitle}", 이미지=${generatedImagesForPublish.length}개`);
  showUnifiedProgress(90, '블로그 발행 중...', '네이버 블로그에 콘텐츠를 발행하고 있습니다.');
  const automationResult = await executeBlogPublishing(structuredContent, generatedImagesForPublish, formData);

  // ✅ 발행 완료 시 글 정보 업데이트 (이미지, URL, 발행상태)
  if (currentPostId && automationResult?.success) {
    const publishedUrl = automationResult.url || automationResult.postUrl || automationResult.blogUrl;
    if (publishedUrl) {
      updatePostAfterPublish(currentPostId, publishedUrl, formData.publishMode);
    }
    // ✅ 이미지 정보도 글목록에 저장
    updatePostImages(currentPostId, generatedImagesForPublish);
  }

  showUnifiedProgress(100, '발행 완료!', '🎉 반자동 발행이 성공적으로 완료되었습니다!');
  appendLog('✅ 반자동 모드 자동화 완료');

  // ✅ 발행 완료 시 자동 저장/백업 중지 및 임시 데이터 삭제
  stopAutosave();
  stopAutoBackup();
  clearAutosavedContent();
  appendLog('💾 임시 저장 데이터 삭제 완료');

  // ✅ [2026-03-29 FIX] 발행 성공 시에만 필드 초기화 (3초 후)
  if (automationResult?.success) {
    setTimeout(() => {
      resetAllFields();
      // 썸네일 생성기도 함께 초기화
      resetThumbnailGeneratorOnPublish();
    }, 3000);

    // 3초 후 진행률 숨김
    setTimeout(() => {
      const progressContainer = document.getElementById('unified-progress-container');
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
    }, 3000);
  } else {
    console.log('[SemiAutoFlow] ⚠️ 발행 결과가 성공이 아니므로 콘텐츠/이미지 보존 (재시도 가능)');
    try { resetPublishing(); } catch (e) { /* ignore */ }
  }

  return automationResult;
  } catch (error) {
    console.error('[SemiAutoFlow] 오류:', error);

    // ✅ [2026-03-22 FIX] 반자동 발행 실패 시 발행 상태 리셋 (재시도 가능하도록)
    try { resetPublishing(); } catch (e) { console.warn('[SemiAutoFlow] resetPublishing 오류:', e); }
    try { hideUnifiedProgress(); } catch (e) { /* ignore */ }

    throw error;
  }
}

// 통합 미리보기 업데이트
export function updateUnifiedPreview(structuredContent: any): void {
  const previewSection = document.getElementById('unified-preview-section');
  if (!previewSection) return;

  // 미리보기 표시 애니메이션
  previewSection.style.display = 'block';

  // 부드러운 애니메이션 효과
  setTimeout(() => {
    previewSection.style.opacity = '1';
    previewSection.style.transform = 'translateY(0)';
  }, 100);

  // 성공 효과음 같은 시각적 피드백
  previewSection.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.3)';

  // 테두리 색상 변화 애니메이션
  let borderAnimationCount = 0;
  const borderAnimation = setInterval(() => {
    borderAnimationCount++;
    if (borderAnimationCount % 2 === 0) {
      previewSection.style.borderColor = 'var(--accent)';
    } else {
      previewSection.style.borderColor = 'var(--primary)';
    }

    if (borderAnimationCount >= 6) { // 3번 깜빡임
      clearInterval(borderAnimation);
      previewSection.style.borderColor = 'var(--primary)';
      previewSection.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
    }
  }, 200);

  // 미리보기로 자동 스크롤
  setTimeout(() => {
    previewSection.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }, 300);
  // ✅ 생성된 이미지 미리보기 섹션 표시
  const generatedImagesSection = document.getElementById('generated-images-section');
  if (generatedImagesSection) {
    generatedImagesSection.style.display = 'block';
  }

  // ✅ MP4 목록 섹션도 표시 + 초기 로드
  const mp4FilesSection = document.getElementById('mp4-files-section');
  if (mp4FilesSection) {
    mp4FilesSection.style.display = 'block';
  }
  refreshMp4FilesList();

  // ✅ 영상 provider 선택값 복원/저장
  const videoProviderSelect = document.getElementById('video-provider-select') as HTMLSelectElement | null;
  if (videoProviderSelect) {
    try {
      const raw = String(window.localStorage?.getItem('videoProvider') || '').trim().toLowerCase();
      const stored: VideoProvider = raw === 'kenburns' ? 'kenburns' : 'veo';
      setCurrentVideoProvider(stored);
    } catch {
      setCurrentVideoProvider('veo');
    }

    if (!videoProviderSelect.hasAttribute('data-listener-added')) {
      videoProviderSelect.setAttribute('data-listener-added', 'true');
      videoProviderSelect.addEventListener('change', () => {
        try {
          setCurrentVideoProvider(getCurrentVideoProvider());
        } catch (e) {
          console.warn('[fullAutoFlow] catch ignored:', e);
        }
      });
    }
  }

  // ✅ 이미지 폴더 열기 버튼 이벤트
  const openImagesFolderBtn = document.getElementById('open-images-folder-btn');
  if (openImagesFolderBtn && !openImagesFolderBtn.hasAttribute('data-listener-added')) {
    openImagesFolderBtn.setAttribute('data-listener-added', 'true');
    openImagesFolderBtn.addEventListener('click', async () => {
      try {
        if (!window.api.openPath) {
          appendLog('⚠️ 파일 시스템 API를 사용할 수 없습니다.');
          alert('파일 시스템 API를 사용할 수 없습니다.');
          return;
        }

        const imageFolderPath = await getRequiredImageBasePath();

        // window.api.openPath가 있으면 사용
        if (window.api.openPath) {
          await window.api.openPath(imageFolderPath);
          appendLog(`📂 이미지 폴더를 열었습니다: ${imageFolderPath}`);
        } else {
          // 폴백: 경로를 클립보드에 복사
          await navigator.clipboard.writeText(imageFolderPath);
          alert(`이미지 폴더 경로가 클립보드에 복사되었습니다:\n\n${imageFolderPath}\n\n탐색기에서 이 경로를 붙여넣어 주세요.`);
        }
      } catch (error) {
        console.error('폴더 열기 실패:', error);
        alert((error as Error).message || '폴더를 열 수 없습니다. 경로를 확인해주세요.');
      }
    });
  }

  // ✅ 기존 폴더에 저장하기 버튼(최근 폴더 열기)
  const openExistingImagesFolderBtn = document.getElementById('open-existing-images-folder-btn');
  if (openExistingImagesFolderBtn && !openExistingImagesFolderBtn.hasAttribute('data-listener-added')) {
    openExistingImagesFolderBtn.setAttribute('data-listener-added', 'true');
    openExistingImagesFolderBtn.addEventListener('click', async () => {
      try {
        await openExistingImageFolder();
      } catch (e) {
        console.error('기존 폴더 열기 실패:', e);
        toastManager.error((e as Error).message || '기존 폴더를 열 수 없습니다.');
      }
    });
  }

  // ✅ 폴더에서 이미지 불러오기 버튼 이벤트 (한 번만 등록)
  const loadImagesFromFoldersBtn = document.getElementById('load-images-from-folders-btn');
  if (loadImagesFromFoldersBtn && !loadImagesFromFoldersBtn.hasAttribute('data-listener-added')) {
    loadImagesFromFoldersBtn.setAttribute('data-listener-added', 'true');
    loadImagesFromFoldersBtn.addEventListener('click', async () => {
      await showLoadImagesFromFoldersModal();
    });
  }

  const undoImageChangeBtn = document.getElementById('undo-image-change-btn');
  if (undoImageChangeBtn && !undoImageChangeBtn.hasAttribute('data-listener-added')) {
    undoImageChangeBtn.setAttribute('data-listener-added', 'true');
    undoImageChangeBtn.addEventListener('click', () => {
      undoLastImageChange();
    });
  }

  // ✅ MP4 폴더 열기 버튼 (상단/하단 둘 다)
  const openMp4Btns = [
    document.getElementById('open-mp4-folder-btn'),
    document.getElementById('open-mp4-folder-btn-2'),
  ].filter(Boolean) as HTMLElement[];

  openMp4Btns.forEach((btn) => {
    if (btn.hasAttribute('data-listener-added')) return;
    btn.setAttribute('data-listener-added', 'true');
    btn.addEventListener('click', async () => {
      try {
        const dir = await getAiVideoFolderPath();
        await window.api.openPath(dir);
      } catch (e) {
        console.error('[AI-VIDEO] 폴더 열기 실패:', e);
        toastManager.error((e as Error).message || 'AI 영상 폴더를 열 수 없습니다.');
      }
    });
  });

  // ✅ MP4 목록 새로고침
  const refreshMp4ListBtn = document.getElementById('refresh-mp4-list-btn');
  if (refreshMp4ListBtn && !refreshMp4ListBtn.hasAttribute('data-listener-added')) {
    refreshMp4ListBtn.setAttribute('data-listener-added', 'true');
    refreshMp4ListBtn.addEventListener('click', async () => {
      await refreshMp4FilesList();
    });
  }

  // ✅ MP4 영상 불러오기(내 PC mp4를 AI 영상 폴더로 복사)
  const importMp4Btn = document.getElementById('import-mp4-btn');
  if (importMp4Btn && !importMp4Btn.hasAttribute('data-listener-added')) {
    importMp4Btn.setAttribute('data-listener-added', 'true');
    importMp4Btn.addEventListener('click', async () => {
      try {
        if (typeof (window.api as any)?.showOpenDialog !== 'function') {
          toastManager.error('파일 선택 기능을 사용할 수 없습니다.');
          return;
        }

        const pick = await (window.api as any).showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'MP4 Videos', extensions: ['mp4'] }],
        });

        if (!pick || pick.canceled || !Array.isArray(pick.filePaths) || pick.filePaths.length === 0) return;
        const sourcePath = String(pick.filePaths[0] || '').trim();
        if (!sourcePath) return;

        const dirPath = await getAiVideoFolderPath();

        // IPC가 아직 없으면 폴더만 열어주고 사용자가 복사하도록 안내
        if (typeof (window.api as any)?.importMp4 !== 'function') {
          await window.api.openPath(dirPath);
          appendLog('⚠️ 영상 불러오기 기능(복사)이 아직 준비되지 않았습니다. 열린 폴더에 mp4를 직접 복사한 뒤, AI 영상 목록에서 새로고침을 눌러주세요.');
          toastManager.warning('아직 자동 불러오기가 준비되지 않았습니다. 폴더에 직접 복사 후 새로고침 해주세요.');
          return;
        }

        appendLog(`📥 영상 불러오기 시작: ${sourcePath.split(/[\\/]/).pop() || 'video.mp4'}`);
        const res = await (window.api as any).importMp4({ sourcePath, dirPath });
        if (!res?.success) {
          toastManager.error(res?.message || '영상 불러오기 실패');
          appendLog(`❌ 영상 불러오기 실패: ${res?.message || 'unknown'}`);
          return;
        }

        toastManager.success('✅ 영상이 AI 영상 목록에 추가되었습니다.');
        appendLog(`✅ 영상 불러오기 완료: ${String(res?.fileName || '')}`);
        await refreshMp4FilesList();
      } catch (e) {
        console.error('[AI-VIDEO] import mp4 실패:', e);
        toastManager.error(`영상 불러오기 오류: ${(e as Error).message}`);
        appendLog(`❌ 영상 불러오기 오류: ${(e as Error).message}`);
      }
    });
  }

  // ✅ AI 영상 만들기 (Gemini Veo)
  const createVeoVideoBtn = document.getElementById('create-veo-video-btn');
  if (createVeoVideoBtn && !createVeoVideoBtn.hasAttribute('data-listener-added')) {
    createVeoVideoBtn.setAttribute('data-listener-added', 'true');
    createVeoVideoBtn.addEventListener('click', async () => {
      try {
        const ok = window.confirm(
          '⚠️ 안내\n\n현재 "AI 영상 만들기"는 텍스트 프롬프트 기반(Veo) 생성입니다.\n\n실존 인물/유명인/특정 인물의 얼굴(닮은꼴 포함)은 정책(안전 필터)로 차단될 수 있습니다.\n프롬프트에 이름/비교/누구처럼 등의 표현을 넣지 마세요.\n\n계속 진행할까요?'
        );
        if (!ok) return;
        await openVeoHeadingSelectModal();
      } catch (e) {
        console.error('[VEO] generateVeoVideo 실패:', e);
        const msg = (e as Error).message || String(e);
        toastManager.error(`AI 영상 생성 오류: ${msg}`);
        appendLog(`❌ AI 영상 생성 중 오류: ${msg}`);
      }
    });
  }

}

export function updateUnifiedImagePreview(headings: any[], generatedImages?: any[]): void {
  const integratedPreview = document.getElementById('unified-integrated-preview');
  if (!integratedPreview) return;

  ensureUnifiedPreviewVideoDelegation();

  // ✅ structuredContent에서 본문 정보 가져오기
  const structuredContent = (window as any).currentStructuredContent;
  const bodyPlain = structuredContent?.bodyPlain || '';

  const integratedHtml = headings.map((heading: any, index: number) => {
    const generatedImage = generatedImages?.[index];
    const imageStatus = generatedImage ? '✅ 생성됨' : '⏳ 준비중';
    const statusColor = generatedImage ? 'var(--success)' : 'var(--accent)';

    // ✅ heading이 문자열인 경우와 객체인 경우 모두 처리
    const headingTitle = typeof heading === 'string' ? heading : (heading.title || heading);

    // ✅ [2026-01-07 버그 수정] bodyPlain에서 소제목 추출 로직 비활성화
    // 이 로직이 소제목을 본문 일부와 잘못 매칭하여 소제목을 망가뜨리는 버그 발생
    // AI가 생성한 원래 소제목(heading.title)을 그대로 사용하는 것이 더 안전함
    // 아래 주석 처리된 코드는 추후 개선된 로직 도입 시 참고용

    const normalizedHeadingTitle = normalizeHeadingKeyForVideoCache(String(headingTitle || '').trim());
    let headingContent = typeof heading === 'string' ? '' : (heading.content || '');

    // ✅ 안전한 HTML 이스케이프 적용
    const safeTitle = escapeHtml(headingTitle);

    // ✅ content가 없으면 본문에서 해당 소제목 이후 내용 추출
    if (!headingContent && bodyPlain) {
      const headingIndex = bodyPlain.indexOf(headingTitle);
      if (headingIndex !== -1) {
        // 소제목 다음 텍스트 추출
        const startIndex = headingIndex + headingTitle.length;
        let endIndex = bodyPlain.length;

        // 다음 소제목 찾기
        for (let i = index + 1; i < headings.length; i++) {
          const nextTitle = typeof headings[i] === 'string' ? headings[i] : (headings[i].title || headings[i]);
          const nextIndex = bodyPlain.indexOf(nextTitle, startIndex);
          if (nextIndex !== -1) {
            endIndex = nextIndex;
            break;
          }
        }

        headingContent = bodyPlain.substring(startIndex, endIndex).trim();
      }
    }

    // ✅ 본문도 이스케이프 처리
    const safeContent = escapeHtml(headingContent.substring(0, 400)) + (headingContent.length > 400 ? '...' : '');

    let imageDisplay = '';
    const headingKey = encodeURIComponent(String(normalizedHeadingTitle || '').trim());
    const getFromCache2 = (window as any).getHeadingVideoPreviewFromCache || getHeadingVideoPreviewFromCache;
    const cachedVideo = getFromCache2(normalizedHeadingTitle);
    const cachedVideoUrl = cachedVideo?.url ? String(cachedVideo.url) : '';

    if (cachedVideoUrl) {
      const safeVideoUrl = escapeHtml(cachedVideoUrl);
      imageDisplay = `
        <div class="unified-heading-video" data-video-url="${safeVideoUrl}" data-video-title="${safeTitle}" data-heading-video-slot="${headingKey}" style="width: 100%; height: 100%;">
          <video class="unified-heading-video-player" src="${safeVideoUrl}" muted autoplay loop playsinline preload="metadata" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px; background: #000;"></video>
        </div>
      `;
    }

    if (generatedImage) {
      const imageRaw = generatedImage.url || generatedImage.filePath || generatedImage.previewDataUrl || '';
      const imageUrl = toFileUrlMaybe(String(imageRaw || '').trim());
      // 실제 생성된 이미지가 있으면 표시
      if (!imageDisplay) {
        const headingEnc = encodeURIComponent(String(headingTitle || '').trim());
        const imageEnc = encodeURIComponent(String(imageUrl || '').trim());
        imageDisplay = `
          <div data-heading-video-slot="${headingKey}" style="width: 100%; height: 100%;">
            <img src="${escapeHtml(imageUrl)}" alt="${safeTitle}" class="ken-burns-media" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px; cursor: pointer;" onclick="showHeadingImagesModal('${headingEnc}','${imageEnc}')">
          </div>
        `;
      }
    } else {
      // 이미지가 없으면 플레이스홀더 표시
      if (!imageDisplay) {
        imageDisplay = `
          <div data-heading-video-slot="${headingKey}" style="width: 100%; height: 100%; border-radius: 6px; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; color: white; font-size: 1rem; font-weight: 600;">${index + 1}</div>
        `;
      }
    }

    return `<div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px; border: 1px solid var(--border-light);">
      <!-- 이미지 영역 -->
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(59, 130, 246, 0.1); border-radius: 6px;">
        <div style="width: 60px; height: 40px; border-radius: 6px; overflow: hidden; border: 2px solid var(--border-color);">
          ${imageDisplay}
        </div>
        <div style="flex: 1;">
          <div style="font-size: 0.9rem; color: var(--text-strong); font-weight: 500;">🖼️ ${generatedImage ? '이미지 생성됨' : '이미지 생성 예정'}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">소제목에 맞는 이미지가 ${generatedImage ? '완성되었습니다' : '생성됩니다'}</div>
        </div>
        <div style="font-size: 0.8rem; color: ${statusColor}; font-weight: 600;">${imageStatus}</div>
      </div>

      <!-- 소제목 + 본문 영역 -->
      <div style="padding: 0.75rem; background: var(--bg-primary); border-radius: 6px; border-left: 3px solid var(--success);">
        <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.75rem; font-size: 1rem; word-break: keep-all; line-height: 1.4; overflow-wrap: break-word;">📝 ${safeTitle}</div>
        <div style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.7; white-space: pre-line;">${safeContent}</div>
      </div>
    </div>`;
  }).join('');

  integratedPreview.innerHTML = integratedHtml || '<div style="color: var(--text-muted); font-style: italic;">소제목이 없습니다.</div>';

  const headingTitles = headings
    .map((h: any) => (typeof h === 'string' ? h : (h?.title || h)))
    .map((t: any) => String(t || '').trim())
    .filter((t: string) => t.length > 0);

  headingTitles.forEach((t: string) => {
    prefetchHeadingVideoPreview(t);
    if (headingVideoPreviewInFlight.has(t)) {
      headingVideoPreviewInFlight.get(t)!.then((entry: HeadingVideoPreviewCacheEntry) => {
        if (!entry || !entry.url) return;
        const normalizedT = normalizeHeadingKeyForVideoCache(t);
        const key = encodeURIComponent(normalizedT);
        const slot = integratedPreview.querySelector(`[data-heading-video-slot="${key}"]`) as HTMLElement | null;
        if (!slot) return;
        const safeVideoUrl = escapeHtml(String(entry.url));
        const safeTitle = escapeHtml(t);
        slot.innerHTML = `
          <div class="unified-heading-video" data-video-url="${safeVideoUrl}" data-video-title="${safeTitle}" data-heading-video-slot="${key}" style="width: 100%; height: 100%;">
            <video class="unified-heading-video-player" src="${safeVideoUrl}" muted autoplay loop playsinline preload="metadata" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px; background: #000;"></video>
          </div>
        `;
        const v = slot.querySelector('.unified-heading-video-player') as HTMLVideoElement | null;
        if (v) {
          try {
            v.play().catch((e) => {
              console.warn('[fullAutoFlow] promise catch ignored:', e);
            });
          } catch (e) {
            console.warn('[fullAutoFlow] catch ignored:', e);
          }
        }
      }).catch((e: any) => {
        console.warn('[fullAutoFlow] headingVideoPreviewInFlight promise catch ignored:', e);
      });
    }
  });

  integratedPreview.querySelectorAll('.unified-heading-video-player').forEach((el) => {
    try {
      (el as HTMLVideoElement).play().catch((e) => {
        console.warn('[fullAutoFlow] promise catch ignored:', e);
      });
    } catch (e) {
      console.warn('[fullAutoFlow] catch ignored:', e);
    }
  });
}


// 이미지 소스 선택 기능
export function initFullAutoImageSourceSelection(): void {
  const imageSourceBtns = document.querySelectorAll('.full-auto-img-source-btn');

  imageSourceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const source = (btn as HTMLElement).dataset.source;

      if ((btn as HTMLElement).hasAttribute('disabled')) {
        alert('이 기능은 현재 사용할 수 없습니다.');
        return;
      }

      // 모든 버튼에서 선택 해제
      imageSourceBtns.forEach(b => b.classList.remove('selected'));
      imageSourceBtns.forEach(b => (b as HTMLElement).style.borderColor = 'transparent');

      // 현재 버튼 선택
      btn.classList.add('selected');
      (btn as HTMLElement).style.borderColor = 'var(--primary)';

      // 이미지 라이브러리 카테고리 컨테이너 표시/숨김
      const categoryContainer = document.getElementById('full-auto-library-category-container');
      if (categoryContainer) {
        categoryContainer.style.display = source === 'library' ? 'block' : 'none';
      }

      console.log(`[FullAuto] 이미지 소스 선택됨: ${source}`);

      // ✅ [2026-02-11 FIX] 풀오토 전용 이미지 소스 localStorage에 저장
      // 이전에는 CSS만 변경하고 localStorage에 저장하지 않아 연속발행 시 nano-banana-pro로 fallback됨
      if (source) {
        localStorage.setItem('fullAutoImageSource', source);
        console.log(`[FullAuto] 풀오토 전용 이미지 소스 localStorage 저장: ${source}`);
      }
    });
  });
}

// 풀오토 실행 로직
export function initFullAutoExecution(): void {
  const startBtn = document.getElementById('full-auto-start-btn') as HTMLButtonElement;

  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      try {
        // 폼 데이터 수집
        const formData = collectFullAutoFormData();

        if (!validateFullAutoFormData(formData)) {
          return;
        }

        // 자동화 실행
        await executeFullAutoAutomation(formData);

      } catch (error) {
        console.error('[FullAuto] 실행 오류:', error);
        alert(`풀오토 실행 중 오류가 발생했습니다: ${(error as Error).message}`);
      }
    });
  }
}

// 폼 데이터 수집
// ✅ [2026-03-10 CLEANUP] full-auto-* 유령 참조 → unified-* / localStorage로 전면 교체
export function collectFullAutoFormData(): any {
  const urls = Array.from(document.querySelectorAll('#unified-url-fields-container .url-field-input, #full-auto-url-fields-container .url-field-input'))
    .map(input => (input as HTMLInputElement).value.trim())
    .filter(url => url.length > 0);

  const keywords = (document.getElementById('unified-keywords') as HTMLInputElement)?.value.trim() || '';
  const title = (document.getElementById('unified-generated-title') as HTMLInputElement)?.value.trim() || '';
  const generator = UnifiedDOMCache.getGenerator();
  const targetAge = 'all'; // UI에서 제거됨 — 기본값 사용
  const imageSource = UnifiedDOMCache.getImageSource();
  const skipImages = localStorage.getItem('textOnlyPublish') === 'true';
  const publishMode = (document.getElementById('unified-publish-mode') as HTMLSelectElement)?.value
    || 'publish';
  // ✅ [2026-03-17 FIX] datetime-local에서 날짜+시간 올바르게 분리 (T 포함 방지)
  let scheduleDate: string | undefined;
  let scheduleTime: string | undefined;
  if (publishMode === 'schedule') {
    const rawScheduleVal = (document.getElementById('unified-schedule-date') as HTMLInputElement)?.value;
    if (rawScheduleVal) {
      if (rawScheduleVal.includes('T')) {
        const parts = rawScheduleVal.split('T');
        scheduleDate = parts[0]; // YYYY-MM-DD
        scheduleTime = parts[1]?.substring(0, 5); // HH:mm
      } else if (rawScheduleVal.includes(' ')) {
        const parts = rawScheduleVal.split(' ');
        scheduleDate = parts[0];
        scheduleTime = parts[1]?.substring(0, 5);
      } else {
        scheduleDate = rawScheduleVal; // 날짜만 있는 경우
      }
    }
  }
  const autoPublish = (document.getElementById('auto-publish-after-generate') as HTMLInputElement)?.checked || false;

  // ✅ 썸네일 텍스트 옵션 — localStorage 단일 소스
  const includeThumbnailText = localStorage.getItem('thumbnailTextInclude') === 'true' ||
    (document.getElementById('thumbnail-text-include') as HTMLInputElement)?.checked || false;

  // 고급 옵션들 — 해당 UI 제거됨, 기본값 사용
  const enablePreview = true;
  const autoOptimize = true;
  const enableBackup = true;
  const contentTemplate = 'auto';
  const toneStyle = (document.getElementById('unified-tone-style') as HTMLSelectElement)?.value || 'professional';

  // ✅ [2026-02-13] 키워드 제목 옵션 (풀오토)
  const keywordAsTitle = (document.getElementById('fullauto-keyword-as-title') as HTMLInputElement)?.checked || false;
  const keywordTitlePrefix = (document.getElementById('fullauto-keyword-title-prefix') as HTMLInputElement)?.checked || false;

  return {
    urls,
    keywords,
    title,
    generator,
    targetAge,
    imageSource,
    skipImages,
    publishMode,
    scheduleDate,
    scheduleTime,
    includeThumbnailText,
    enablePreview,
    autoOptimize,
    enableBackup,
    contentTemplate,
    toneStyle,
    keywordAsTitle,
    keywordTitlePrefix
  };
}

// 폼 데이터 검증 (URL 우선)
export function validateFullAutoFormData(data: any): boolean {
  // URL, 키워드, 제목 모두 선택사항이지만 최소 하나의 입력은 필요
  if (data.urls.length === 0 && !data.keywords && !data.title) {
    alert('URL, 키워드, 제목 중 최소 하나 이상을 입력해주세요.');
    return false;
  }

  // ✅ 제목 필드에 키워드처럼 보이는 값이 입력된 경우 안내 메시지
  if (data.title && !data.keywords) {
    // 제목이 짧고 쉼표가 포함되어 있으면 키워드로 판단
    const looksLikeKeywords = data.title.includes(',') ||
      (data.title.length < 20 && !data.title.includes(' '));

    if (looksLikeKeywords) {
      const userChoice = confirm(
        `💡 안내: 제목 필드 사용법\n\n` +
        `현재 입력: "${data.title}"\n\n` +
        `• 제목 필드: 블로그 글 제목을 입력하세요\n` +
        `  예) "${new Date().getFullYear()}년 다이어트 성공 비법 총정리"\n\n` +
        `• 키워드 필드: 검색 키워드를 입력하세요\n` +
        `  예) "다이어트, 건강, 운동"\n\n` +
        `⚠️ 실시간 정보 기반 체크박스를 반드시 켜주세요!\n` +
        `   → AI 할루시네이션(거짓 정보) 방지에 필수입니다.\n\n` +
        `그래도 현재 입력으로 진행하시겠습니까?`
      );

      if (!userChoice) {
        return false;
      }
    }
  }

  // ✅ [2026-03-10 CLEANUP] full-auto-realtime-crawl → unified-realtime-crawl
  const realtimeCheckbox = document.getElementById('unified-realtime-crawl') as HTMLInputElement;
  if (realtimeCheckbox && !realtimeCheckbox.checked) {
    const enableRealtime = confirm(
      `⚠️ 실시간 정보 수집이 꺼져 있습니다!\n\n` +
      `실시간 정보 수집을 켜면:\n` +
      `• 최신 뉴스, 블로그, 카페 정보 반영\n` +
      `• AI 할루시네이션(거짓 정보) 방지\n` +
      `• 더 정확하고 신뢰할 수 있는 글 생성\n\n` +
      `실시간 정보 수집을 켜시겠습니까?`
    );

    if (enableRealtime) {
      realtimeCheckbox.checked = true;
    }
  }

  return true;
}

// 풀오토 자동화 실행 (정확한 순서로 수정)
export async function executeFullAutoAutomation(formData: any): Promise<void> {
  const startBtn = document.getElementById('full-auto-start-btn') as HTMLButtonElement;

  // 진행률 표시 초기화 (모달 대신 로그 위에 표시)
  const progressContainer = document.createElement('div');
  progressContainer.id = 'full-auto-progress-container';
  progressContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 300px;
    background: var(--bg-primary);
    border: 2px solid var(--primary);
    border-radius: var(--radius-lg);
    padding: 1rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: var(--font-family);
  `;

  const progressBar = document.createElement('div');
  progressBar.style.cssText = `
    width: 100%;
    height: 8px;
    background: var(--bg-secondary);
    border-radius: 4px;
    overflow: hidden;
    margin: 0.5rem 0;
  `;

  const progressFill = document.createElement('div');
  progressFill.style.cssText = `
    height: 100%;
    background: linear-gradient(90deg, var(--primary), var(--success));
    width: 0%;
    transition: width 0.3s ease;
    border-radius: 4px;
  `;

  const progressText = document.createElement('div');
  progressText.style.cssText = `
    font-size: 0.9rem;
    color: var(--text-strong);
    text-align: center;
    font-weight: 600;
  `;

  progressBar.appendChild(progressFill);
  progressContainer.appendChild(progressText);
  progressContainer.appendChild(progressBar);
  document.body.appendChild(progressContainer);

  // 진행률 업데이트 함수
  const updateProgress = (percent: number, text: string) => {
    progressFill.style.width = `${percent}%`;
    progressText.textContent = text;
    console.log(`[FullAuto Progress] ${percent}%: ${text}`);
  };

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.innerHTML = '<span style="font-size: 1.75rem;">⏳</span><span>실행 중...</span>';
  }

  const result = await withErrorHandling(async () => {
    // 통합 진행률 표시 시작
    updateProgress(5, '콘텐츠 생성 준비 중...');
    showUnifiedProgress(5, '콘텐츠 생성 준비 중...', 'AI가 글을 생성할 준비를 하고 있습니다.');
    appendLog('🚀 풀오토 자동화를 시작합니다!');

    // 1단계: 콘텐츠 생성 (structured content)
    // ✅ [v1.6.5 CRITICAL] handleFullAutoPublish에서 이미 생성한 콘텐츠 재사용 (중복 생성 방지)
    let structuredContent: any;
    if (formData._contentAlreadyGenerated && formData.structuredContent && (formData.structuredContent.headings?.length > 0 || formData.structuredContent.bodyPlain)) {
      appendLog('♻️ 이미 생성된 콘텐츠 재사용 (중복 생성 방지)');
      console.log('[FullAuto] ♻️ formData.structuredContent 재사용 — generateFullAutoContent 스킵');
      structuredContent = formData.structuredContent;
    } else {
      structuredContent = await generateFullAutoContent(formData);
    }
    if (!structuredContent) {
      throw new Error('콘텐츠 생성에 실패했습니다.');
    }
    updateProgress(25, '콘텐츠 생성 완료');
    showUnifiedProgress(25, '콘텐츠 생성 완료', 'AI 글 생성이 완료되었습니다.');

    // ✅ 콘텐츠 저장 및 postId 생성
    currentStructuredContent = structuredContent;
    (window as any).currentStructuredContent = structuredContent;
    const postId = saveGeneratedPost(structuredContent);
    if (postId) {
      currentPostId = postId; // 전역 변수에 저장 (이미지 생성 시 사용)
    }

    // 2단계: 소제목 분석 및 모든 탭 필드에 표시
    await displayContentInAllTabs(structuredContent);
    updateProgress(40, '소제목 분석 완료');
    showUnifiedProgress(40, '소제목 분석 완료', '생성된 콘텐츠의 소제목을 분석하고 있습니다.');

    // 3단계: 이미지 생성 (소제목 기반)
    updateProgress(45, '이미지 생성 시작...');

    // ✅ [2026-02-01 FIX] 글생성 시 수집한 이미지를 formData에 전달하여 중복 크롤링 방지
    if (structuredContent.collectedImages && structuredContent.collectedImages.length > 0) {
      formData.collectedImages = structuredContent.collectedImages;
      console.log(`[FullAuto] ✅ 크롤링 시 수집한 이미지 ${structuredContent.collectedImages.length}장을 이미지 생성에 전달`);
    }

    // ✅ [v1.6.5 CRITICAL] handleFullAutoPublish에서 이미 생성된 이미지 재사용 (중복 생성 방지)
    //   기존 버그: publishingHandlers L514-903이 이미지 생성 → executeFullAutoFlow에서 또 생성 → 2회 중복
    //   수정: formData.imageManagementImages에 있으면 재사용, 없으면 신규 생성
    let generatedImages: any[] = [];
    if (Array.isArray(formData.imageManagementImages) && formData.imageManagementImages.length > 0) {
      appendLog(`♻️ 이미 생성된 이미지 ${formData.imageManagementImages.length}장 재사용 (중복 생성 방지)`);
      console.log(`[FullAuto] ♻️ formData.imageManagementImages 재사용 — generateImagesForContent 스킵`);
      generatedImages = [...formData.imageManagementImages];
    } else {
      generatedImages = await generateImagesForContent(structuredContent, formData);
    }
    updateProgress(70, '이미지 생성 완료');
    showUnifiedProgress(70, '이미지 생성 완료', '소제목에 맞는 이미지가 모두 생성되었습니다.');

    // 4단계: 블로그 발행
    updateProgress(90, '블로그 발행 중...');
    showUnifiedProgress(90, '블로그 발행 중...', '네이버 블로그에 콘텐츠를 발행하고 있습니다.');
    const automationResult = await executeBlogPublishing(structuredContent, generatedImages, formData);

    // ✅ 발행 완료 시 글 정보 업데이트
    if (currentPostId && automationResult?.success) {
      const publishedUrl = automationResult.url || automationResult.postUrl || automationResult.blogUrl;
      if (publishedUrl) {
        updatePostAfterPublish(currentPostId, publishedUrl, formData.publishMode);
      }
    }

    updateProgress(100, '발행 완료! 🎉');
    showUnifiedProgress(100, '발행 완료!', '🎉 모든 작업이 성공적으로 완료되었습니다!');
    appendLog('🎉 풀오토 자동화가 성공적으로 완료되었습니다!');

    // ✅ 발행 완료 시 자동 저장/백업 중지 및 임시 데이터 삭제
    stopAutosave();
    stopAutoBackup();
    clearAutosavedContent();
    appendLog('💾 임시 저장 데이터 삭제 완료');

    // ✅ 모든 필드 초기화 (3초 후)
    setTimeout(() => {
      resetAllFields();
    }, 3000);

    return automationResult;
  }, 'FullAutoExecution');

  // 진행률 표시 제거
  setTimeout(() => {
    if (progressContainer.parentNode) {
      progressContainer.parentNode.removeChild(progressContainer);
    }
  }, 2000);

  if (!result) {
    if (progressContainer.parentNode) {
      progressContainer.parentNode.removeChild(progressContainer);
    }
    // ✅ [2026-03-22 FIX] 실패 시 통합 진행률 모달 숨김 + 발행 상태 리셋 (재시도 가능하도록)
    try { hideUnifiedProgress(); } catch (e) { /* ignore */ }
    try { resetPublishing(); } catch (e) { console.warn('[FullAuto] resetPublishing 오류:', e); }
    toastManager.error('❌ 풀오토 실행에 실패했습니다.');
  } else {
    // ✅ 발행 성공 시 추가 초기화 (3초 후)
    setTimeout(() => {
      console.log('[FullAuto] 발행 완료 후 필드 초기화 시작');
      resetAllFields();
      hideUnifiedProgress();
      toastManager.success('🆕 다음 글 작성을 위해 필드가 초기화되었습니다.');
      // ✅ 생성된 글 목록도 새로고침
      refreshGeneratedPostsList();
    }, 3000);
  }

  if (startBtn) {
    startBtn.disabled = false;
    startBtn.innerHTML = '<span style="font-size: 1.75rem;">🚀</span><span>풀 오토 발행 시작</span>';
  }
}

// 1단계: 콘텐츠 생성
export async function generateFullAutoContent(formData: any) {
  // ✅ 기존 콘텐츠 초기화 (타임아웃 방지)
  if (currentStructuredContent) {
    appendLog('🔄 기존 콘텐츠를 초기화하고 새로운 콘텐츠를 생성합니다...');
    currentStructuredContent = null;
    (window as any).currentStructuredContent = null;
    generatedImages = [];
    (window as any).imageManagementGeneratedImages = null;

    // ✅ [Fix] 이전 세션의 리뷰 모드 강제 해제 (소제목 leakage 방지)
    (window as any).selectedContentType = 'info';
    const typeEl = document.getElementById('unified-article-type') as HTMLSelectElement;
    if (typeEl && typeEl.value !== 'review') {
      (window as any).selectedContentType = 'info';
    } else if (typeEl && typeEl.value === 'review') {
      (window as any).selectedContentType = 'review';
    }
  }

  // ✅ [Alert] 커스텀 프롬프트 사용 시 알림
  const customPromptEl = document.getElementById('unified-custom-prompt') as HTMLTextAreaElement;
  if (customPromptEl && customPromptEl.value.trim()) {
    appendLog('⚠️ [주의] 커스텀 프롬프트가 설정되어 있습니다. 생성 결과에 영향을 줄 수 있습니다.');
  }

  // Determine if URL mode is active (assuming formData.urls is used for URL mode)
  const isUrlMode = formData.urls && formData.urls.length > 0;
  appendLog(`🤖 AI 콘텐츠 생성을 시작합니다... (방식: ${isUrlMode ? 'URL 뉴스' : '키워드'})`);

  // URL 배열 안전하게 처리
  const urls = formData.urls || [];
  const keywords = formData.keywords || '';

  // ✅ [2026-04-08 FIX v2] draftText를 항상 설정하여 "본문 정보 없음" 에러 완전 방지
  const keywordList = keywords ? keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0) : [];
  const titleStr = formData.title ? String(formData.title || '').trim() : '';

  // draftText: 키워드/제목 중 하나라도 있으면 설정 (sourceAssembler의 최종 안전망)
  let draftText: string | undefined;
  if (keywordList.length > 0) {
    draftText = keywordList.join(', ');  // 키워드를 draftText로도 전달
  } else if (titleStr) {
    draftText = titleStr;  // 키워드 없으면 제목으로 폴백
  }

  // ✅ [v1.4.28] window._businessInfo (글로벌 모달 저장값) 우선
  const businessInfo = formData.contentMode === 'business' ? (() => {
    const globalInfo = (window as any)._businessInfo;
    if (globalInfo && globalInfo.name) {
      // 사전 검증 (글로벌 모달 저장 시 이미 했지만 한 번 더)
      const m: string[] = [];
      if (!globalInfo.name) m.push('업체명');
      if (!globalInfo.phone && !globalInfo.kakao) m.push('전화 또는 카톡');
      if (globalInfo.serviceArea === 'regional' && !globalInfo.region) m.push('서비스 지역');
      if (m.length > 0) {
        alert('🏢 업체 정보 누락:\n\n• ' + m.join('\n• ') + '\n\n다시 입력해주세요.');
        (window as any).openBusinessGlobalModal?.();
        throw new Error('업체 정보 누락');
      }
      return globalInfo;
    }
    const get = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement)?.value?.trim() || undefined;
    const tryGet = (suffix: string) =>
      get('unified-business-info-' + suffix) ||
      get('continuous-modal-business-info-' + suffix) ||
      get('ma-business-info-' + suffix) ||
      get('business-info-' + suffix);
    const nationwide =
      (document.getElementById('unified-business-service-nationwide') as HTMLInputElement)?.checked ||
      (document.getElementById('continuous-modal-business-service-nationwide') as HTMLInputElement)?.checked ||
      (document.getElementById('ma-business-service-nationwide') as HTMLInputElement)?.checked ||
      (document.getElementById('business-service-nationwide') as HTMLInputElement)?.checked;
    const serviceArea: 'nationwide' | 'regional' = nationwide ? 'nationwide' : 'regional';
    const info = {
      name: tryGet('name'),
      phone: tryGet('phone'),
      kakao: tryGet('kakao'),
      address: tryGet('address'),
      hours: tryGet('hours'),
      region: serviceArea === 'nationwide' ? undefined : tryGet('region'),
      serviceArea,
      extra: tryGet('extra'),
    };
    // ✅ [v1.4.24] 사전 검증: 필수 필드 (업체명 + 전화번호 또는 카카오톡)
    const missing: string[] = [];
    if (!info.name) missing.push('업체명');
    if (!info.phone && !info.kakao) missing.push('전화번호 또는 카카오톡 (둘 중 하나 필수)');
    if (info.serviceArea === 'regional' && !info.region) missing.push('서비스 지역 (지역구 모드)');
    if (missing.length > 0) {
      const msg = `🏢 업체 홍보 모드 필수 정보가 누락되었습니다:\n\n• ${missing.join('\n• ')}\n\n⚠️ 빈 값으로 발행하면 AI가 가짜 정보를 만들 수 있습니다.`;
      alert(msg);
      throw new Error(`업체 정보 누락: ${missing.join(', ')}`);
    }
    return info;
  })() : undefined;

  const payload = {
    assembly: {
      generator: formData.generator,
      keywords: keywordList,
      rssUrl: urls.length > 0 ? urls[0] : undefined,
      title: titleStr || undefined,
      draftText,
      targetAge: formData.targetAge,
      minChars: formData.minChars || 2500,
      customPrompt: (document.getElementById('unified-custom-prompt') as HTMLTextAreaElement)?.value?.trim() || undefined,
      categoryHint: formData.category || formData.categoryName || formData.categoryHint,
      contentMode: formData.contentMode || 'seo',
      articleType: formData.articleType,
      toneStyle: formData.toneStyle || formData.tone,
      businessInfo,  // ✅ [v1.4.20] 업체 홍보 모드 전용
    }
  };

  appendLog('📝 콘텐츠 조립 정보를 준비했습니다.');

  const apiClient = EnhancedApiClient.getInstance();
  const apiResponse = await apiClient.call(
    'generateStructuredContent',
    [payload],
    {
      retryCount: 2,       // ✅ 2회 재시도 (Main의 모델 폴백 체인이 이미 3모델 순회)
      retryDelay: 3000,
      timeout: 900000      // ✅ 15분 (Main 최대 12분 + 여유 3분)
    }
  );

  const result = apiResponse.data || { success: false, message: apiResponse.error };
  if (isPaywallPayload(result)) {
    activatePaywall(result);
    return;
  }
  if (!result.success) {
    appendLog('❌ 콘텐츠 생성에 실패했습니다.');
    throw new Error(result.message || '콘텐츠 생성 실패');
  }

  appendLog('✅ AI 콘텐츠 생성이 완료되었습니다!');

  // ✅ [v2.7.77/79] 풀오토 URL 이미지 수집 — 우선순위
  //   1) 풀오토 URL 입력 직하 #unified-url-collect-images 체크박스 (v2.7.79 신규, 가장 명시적)
  //   2) 콘텐츠 입력 영역 #content-url-collect (v2.7.74)
  //   3) formData/structuredContent.sourceUrl
  try {
    const unifiedCollectChecked = !!(document.getElementById('unified-url-collect-images') as HTMLInputElement | null)?.checked;
    const unifiedFillGap = !!(document.getElementById('unified-url-fillgap-ai') as HTMLInputElement | null)?.checked;
    const contentUrl = (document.getElementById('content-url-collect') as HTMLInputElement | null)?.value?.trim() || '';
    const contentFillGap = !!(document.getElementById('content-url-fillgap-ai') as HTMLInputElement | null)?.checked;

    // 풀오토 URL 입력 첫 번째 값 (체크박스가 ON이면 우선)
    let unifiedFirstUrl = '';
    if (unifiedCollectChecked) {
      const firstUrlInput = document.querySelector('.unified-url-input') as HTMLInputElement | null;
      unifiedFirstUrl = (firstUrlInput?.value || '').trim();
    }

    let sourceUrl = '';
    let fillGap = false;
    if (unifiedCollectChecked && unifiedFirstUrl) {
      sourceUrl = unifiedFirstUrl;
      fillGap = unifiedFillGap;
      appendLog(`🔗 [풀오토] 위 URL로 이미지 수집 옵션 ON — ${sourceUrl.slice(0, 60)}...`);
    } else if (contentUrl) {
      sourceUrl = contentUrl;
      fillGap = contentFillGap;
    } else {
      sourceUrl = (formData as any)?.sourceUrl || (result.content as any)?.sourceUrl || '';
    }

    if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
      const { runAutoImageSearch } = await import('../utils/semiAutoImageSearch.js');
      const ImageManager = (window as any).ImageManager;
      const syncFn = (window as any).syncGlobalImagesFromImageManager || (() => {});
      const mainKw = (formData as any)?.keywords || (result.content as any)?.selectedTitle || '';
      await runAutoImageSearch(
        result.content,
        mainKw,
        appendLog,
        ImageManager,
        syncFn,
        { sourceUrl, fillGapWithAI: fillGap }
      );
      appendLog(`🔗 [풀오토] URL 이미지 자동 수집 완료 (fillgap=${fillGap ? 'ON' : 'OFF'})`);
    }
  } catch (e: any) {
    appendLog(`⚠️ [풀오토] URL 이미지 수집 실패: ${e?.message?.slice(0, 80)}`);
  }

  // ✅ [Shopping Connect] 수집된 이미지가 있으면 전역 이미지 배열에 추가 (참조 이미지로 사용)
  if (result.content.collectedImages && result.content.collectedImages.length > 0) {
    console.log(`[FullAuto] 수집된 이미지 ${result.content.collectedImages.length}장을 참조 이미지로 등록합니다.`);

    // 중복 방지하며 추가
    const win = window as any;
    const existingUrls = new Set([...generatedImages, ...(win.imageManagementGeneratedImages || [])]);
    const newImages = result.content.collectedImages.filter((url: string) => !existingUrls.has(url));

    if (newImages.length > 0) {
      generatedImages.push(...newImages);
      if (!win.imageManagementGeneratedImages) win.imageManagementGeneratedImages = [];
      win.imageManagementGeneratedImages.push(...newImages);
      appendLog(`📸 쇼핑몰/사이트에서 ${newImages.length}장의 제품 이미지를 확보했습니다.`);
    }
  }

  console.log('[FullAuto] 구조화 콘텐츠 생성 완료:', result.content);
  return result.content;
}

// 2단계: 통합 탭 콘텐츠 표시 및 미리보기
export async function displayContentInAllTabs(structuredContent: any) {
  appendLog('📋 생성된 콘텐츠를 통합 탭에 표시합니다.');

  // 통합 탭 미리보기 업데이트
  updateUnifiedPreview(structuredContent);

  // 소제목이 있으면 이미지 미리보기도 업데이트
  if (structuredContent.headings && structuredContent.headings.length > 0) {
    updateUnifiedImagePreview(structuredContent.headings);
  }

  // 통합 탭은 탭 전환이 필요 없음 - 바로 다음 단계로 진행
  appendLog('✅ 콘텐츠 표시가 완료되었습니다.');
  console.log('[Unified] 통합 탭 콘텐츠 표시 완료');
}

// 3단계: 소제목 기반 이미지 생성
export async function generateImagesForContent(structuredContent: any, formData: any) {
  // ✅ [2026-02-04 FIX] structuredContent가 undefined인 경우 안전 처리
  if (!structuredContent) {
    appendLog('⚠️ 구조화된 콘텐츠가 없어 이미지 생성을 건너뜁니다.');
    console.warn('[FullAuto] structuredContent is undefined, skipping image generation');
    return [];
  }

  if (formData.skipImages) {
    appendLog('🚫 이미지 생성을 건너뜁니다.');
    console.log('[FullAuto] 이미지 생성 건너뜀');
    return [];
  }

  const headings = structuredContent.headings || [];
  if (headings.length === 0) {
    appendLog('⚠️ 소제목이 없어 이미지 생성을 건너뜁니다.');
    console.log('[FullAuto] 소제목이 없어 이미지 생성 건너뜀');
    return [];
  }

  appendLog(`🎨 ${headings.length}개 소제목의 이미지를 생성합니다.`);
  // ✅ [2026-03-23 REFACTOR] 로컬 폴더 이미지: 공통 함수로 통합
  if (formData.imageSource === 'local-folder') {
    // ✅ [2026-03-23 FIX] 동적 import → window 전역 호출 (require is not defined 에러 수정)
    const loadLocalFolderWithFallback = (window as any).loadLocalFolderWithFallback;
    if (!loadLocalFolderWithFallback) throw new Error('loadLocalFolderWithFallback 함수가 아직 로드되지 않았습니다');
    const lfResult = await loadLocalFolderWithFallback({
      headings,
      postTitle: currentStructuredContent?.selectedTitle || formData.postTitle || '',
      onLog: (msg: string) => appendLog(msg),
      aiFallbackFn: async (provider: string, missingHeadings: any[], title: string, opts: any) => {
        // AI 폴백: formData.imageSource를 안전한 provider로 교체 후 기존 AI 파이프라인 사용
        formData.imageSource = provider;
        return await generateAIImagesForHeadings(missingHeadings, formData);
      },
    });
    if (lfResult.images.length > 0) {
      try { displayGeneratedImages(lfResult.images); } catch {}
      try { updatePromptItemsWithImages(lfResult.images); } catch {}
      (window as any).generatedImages = lfResult.images;
      (window as any).imageManagementGeneratedImages = lfResult.images;
    }
    return lfResult.images;
  }

  const sourceDisplayNames: Record<string, string> = {
    'local-folder': '📂 내 폴더 (로컬 이미지)',
    'pollinations': 'Pollinations (FLUX, 무료)',
    'nano-banana-pro': '나노 바나나 프로 (Gemini API 키, 과금 가능)',
    'stability': 'Stability AI',
    'prodia': 'Prodia AI',
    'deepinfra': 'FLUX-2 (DeepInfra)',
    'falai': 'Fal.ai FLUX',
  };
  appendLog(`📸 이미지 소스: ${sourceDisplayNames[formData.imageSource] || formData.imageSource}`);

  // ✅ [2026-03-10 CLEANUP] full-auto-enable-preview 유령 참조 제거 → 미리보기 섹션이 있으면 항상 활성화
  const previewSection = document.getElementById('full-auto-preview-section');
  if (previewSection) {
    updateFullAutoPreview(structuredContent);
  }

  let generatedImages: any[] = [];

  // DALL-E 또는 Pexels로만 이미지 생성
  generatedImages = await generateAIImagesForHeadings(headings, formData);

  console.log(`[FullAuto] ${generatedImages.length}개 이미지 생성 완료`);
  appendLog(`✅ ${generatedImages.length}개의 이미지가 생성되었습니다!`);

  // ✅ [2026-02-26 FIX] 이미지 관리탭 미리보기에 표시 — 모든 발행 모드 공통
  // 풀오토에서 생성된 이미지도 반자동에서 수정할 수 있도록 UI에 반영
  if (generatedImages.length > 0) {
    try {
      displayGeneratedImages(generatedImages);
      updatePromptItemsWithImages(generatedImages);
      // 전역 generatedImages도 업데이트 (다른 모듈에서 참조용)
      (window as any).generatedImages = generatedImages;
      (window as any).imageManagementGeneratedImages = generatedImages;
      console.log(`[FullAuto] ✅ 이미지 관리탭 UI 업데이트 완료: ${generatedImages.length}개`);
    } catch (uiErr) {
      console.warn('[FullAuto] 이미지 관리탭 UI 업데이트 실패 (발행에는 영향 없음):', uiErr);
    }
  }

  // ✅ [2026-03-10 CLEANUP] full-auto-enable-preview 유령 참조 제거 → 미리보기 섹션이 있으면 항상 업데이트
  const integratedPreviewEl = document.getElementById('full-auto-integrated-preview');
  if (integratedPreviewEl) {
    updateFullAutoFinalImagePreview(generatedImages);
  }

  // ✅ [2026-03-23 REFACTOR] local-folder 병합 로직 제거됨 (loadLocalFolderWithFallback에서 처리)

  return generatedImages;
}

// 라이브러리 이미지 생성 (소제목 기반)
export async function generateLibraryImagesForHeadings(headings: any[], formData: any) {
  const images: any[] = [];

  for (const heading of headings) {
    try {
      // 소제목에서 검색 의도가 명확한 키워드 추출
      const extractedKeywords = extractSearchKeywords(heading.title, heading.content);
      appendLog(`🔍 소제목 "${heading.title}"의 검색 키워드: ${extractedKeywords.join(', ')}`);

      const libraryImages = await window.api.getLibraryImages('', extractedKeywords);

      if (libraryImages.length > 0) {
        // 가장 관련성 높은 이미지 선택
        const selectedImage = libraryImages[0];
        images.push({
          heading: heading.title,
          filePath: selectedImage.url,
          provider: 'library',
          alt: selectedImage.sourceTitle || heading.title,
          previewDataUrl: selectedImage.previewDataUrl || selectedImage.url
        });
      }
    } catch (error) {
      console.warn(`[FullAuto] 라이브러리 이미지 검색 실패 (${heading.title}):`, error);
    }
  }

  return images;
}

// AI 이미지 생성 (소제목 기반 영어 프롬프트) - ✅ 병렬 처리로 속도 2-3배 향상
export async function generateAIImagesForHeadings(headings: any[], formData: any) {
  // ✅ [2026-02-04 FIX] headings가 undefined이거나 배열이 아닌 경우 안전 처리
  if (!headings || !Array.isArray(headings)) {
    console.warn('[AI Images] headings is undefined or not an array, returning empty');
    appendLog('⚠️ 소제목 정보가 없어 이미지 생성을 건너뜁니다.');
    return [];
  }

  // ✅ [2026-04-18 FIX] skipImages 방어 가드 — 어느 호출 경로에서도 유료 API 차단
  //    이전: 이 함수 자체에는 skipImages 체크가 없었고, 호출자(generateImagesWithCostSafety 등)가
  //    책임짐. 하지만 로컬폴더 AI 폴백(L2213)이나 다른 우회 경로에서 skipImages=true여도
  //    nano-banana-pro가 호출될 가능성 존재. 여기서 방어적으로 한 번 더 차단.
  //    사용자 제보: "이미지 없음"으로 발행 시에도 나노바나나2 실행 → 글 1개당 650원 과금 발생
  const _skipImagesFlag = formData?.skipImages === true
    || localStorage.getItem('textOnlyPublish') === 'true';
  if (_skipImagesFlag) {
    console.log('[AI Images] 🚫 skipImages/textOnlyPublish=true → 유료 이미지 API 호출 차단');
    appendLog('🚫 이미지 없이 발행: generateAIImagesForHeadings 호출 차단 (유료 API 비용 방지)');
    return [];
  }

  // ✅ [v1.4.45] thumbnailOnly / headingImageMode=none 체크
  // 사용자가 "썸네일만" 체크했는데 본문 이미지가 생성되는 문제 해결
  const _thumbnailOnly = formData.thumbnailOnly === true || localStorage.getItem('thumbnailOnly') === 'true';
  const _headingImageMode = localStorage.getItem('headingImageMode') || 'all';

  if (_headingImageMode === 'none') {
    console.log('[AI Images] 🚫 headingImageMode=none → 이미지 생성 전체 스킵');
    appendLog('🚫 이미지 없이 모드: 소제목 이미지 생성 건너뜁니다.');
    return [];
  }

  if (_thumbnailOnly) {
    console.log(`[AI Images] 📷 thumbnailOnly=true → 소제목 ${headings.length}개 스킵, 전용 썸네일만 생성`);
    appendLog(`📷 썸네일만 생성 모드: 소제목 이미지 ${headings.length}개 생성을 건너뜁니다.`);
    // headings를 빈 배열로 교체 → 전용 썸네일만 생성 (아래 로직에서 dedicatedShopThumbnail만 생성)
    headings = [];
  }

  // ✅ [2026-01-27] 완전자동 이미지 설정에서 기본값 가져오기
  const globalSettings = getGlobalImageSettings();

  // 이미지 소스 확인 및 로깅 - formData 우선, 없으면 글로벌 설정 사용
  let imageSource = formData.imageSource || globalSettings.imageSource;
  const imageStyle = formData.imageStyle || globalSettings.imageStyle;
  const imageRatio = formData.imageRatio || globalSettings.imageRatio;

  console.log(`[AI Images] 이미지 생성 시작 - 소스: ${imageSource}, 스타일: ${imageStyle}, 비율: ${imageRatio}, 소제목 개수: ${headings.length}`);


  const sourceNames: Record<string, string> = {
    'local-folder': '📂 내 폴더 (로컬)',
    'pollinations': 'Pollinations (FLUX, 무료)',
    'nano-banana-pro': '나노 바나나 프로 (Gemini Native)',
    'prodia': 'Prodia (과금 가능)',
    'stability': 'Stability AI',
    'deepinfra': 'DeepInfra FLUX-2 (과금 가능)',
    'deepinfra-flux': 'DeepInfra FLUX-2 (과금 가능)',
    'falai': 'Fal.ai FLUX (과금 가능)',
    'naver-search': '네이버 이미지 검색',
    'naver': '네이버 이미지 검색',
    'imagefx': 'ImageFX (Google 무료)',
    'flow': 'Flow (Nano Banana Pro, AI Pro 무료)', // ✅ [v1.4.80]
    'openai-image': 'OpenAI DALL-E',
    'leonardoai': 'Leonardo AI',
  };
  appendLog(`🎨 ${sourceNames[imageSource] || imageSource}로 ${headings.length}개 이미지 생성 시작...`);
  // ✅ 비용/과금 위험 provider는 동시 요청을 막기 위해 순차 처리
  try {
    const providerForLock = String(imageSource || '').trim() === 'pollinations' ? 'nano-banana-pro' : String(imageSource || '').trim();
    const shouldRunSequentially = isCostRiskImageProvider(providerForLock);
    appendLog(shouldRunSequentially ? '⏳ 과금/쿼터 보호를 위해 순차 처리로 생성합니다.' : '⚡ 병렬 처리로 속도 2-3배 향상!');
  } catch {
    appendLog('⚡ 병렬 처리로 속도 2-3배 향상!');
  }

  // 진행률 추적
  let completedCount = 0;
  const progressStart = 45;
  const progressEnd = 70;

  // ✅ [2026-01-22 NEW] 수동 썸네일 체크 - 이미지 관리 탭에서 수동으로 설정한 썸네일이 있는지 확인
  const existingImages = (window as any).imageManagementGeneratedImages || [];
  const hasManualThumbnail = existingImages.length > 0 && (
    existingImages[0]?.isManualThumbnail === true ||
    existingImages[0]?.source === 'manual' ||
    existingImages[0]?.source === 'thumbnail-generator'
  );

  if (hasManualThumbnail) {
    appendLog(`🎨 수동 설정 썸네일 감지됨 → 썸네일(0번) 건너뛰고 1번 소제목부터 이미지 생성`);
    console.log(`[AI Images] ✅ 수동 썸네일 감지: 첫 번째 이미지 건너뛰기`);
  }

  // ✅ 병렬 처리: 모든 이미지를 동시에 생성
  // ✅ 썸네일 텍스트 포함 여부 (formData에서 가져오거나 체크박스에서 확인)
  const thumbnailTextCheckbox = document.getElementById('thumbnail-text-option') as HTMLInputElement;
  // ✅ [2026-03-10 CLEANUP] full-auto-thumbnail-text, semi-auto-thumbnail-text 제거 → localStorage 단일 소스
  const thumbnailFromStorage = localStorage.getItem('thumbnailTextInclude') === 'true';

  // ✅ [FIX] 쇼핑 커넥트 관련 데이터 추출 - contentMode 기반으로만 판단
  // affiliateLink만 있으면 쇼핑커넥트로 판단하지 않음 (일반 모드에서도 링크가 남아있을 수 있음)
  const isShoppingConnect = formData.isShoppingConnect === true || formData.contentMode === 'affiliate';

  // ✅ [v2.7.64] 사용자 선택 존중 — 자동 전환 폐지, 명시적 confirm으로 대체
  //   사용자 보고: "달리 선택했는데 왜 나노바나나로 생성되는거지?"
  //   기존(v2.7.28~63): 쇼핑커넥트 + DALL-E/ImageFX/Leonardo 등 → nano-banana-pro 자동 강제
  //   문제: 사용자가 명시적으로 DALL-E 3 선택했는데 알림 없이 nano-banana로 교체됨
  //   수정: 자동 전환 폐지. 사용자가 img2img 미지원 엔진 선택하면 그대로 실행 + 토스트 경고.
  const SC_FAKE_AI_ENGINES = [
    'imagefx', 'dall-e-3', 'leonardoai', 'deepinfra', 'deepinfra-flux',
    'stability', 'falai', 'prodia', 'pollinations', 'flow',
  ];
  if (isShoppingConnect && SC_FAKE_AI_ENGINES.includes(imageSource)) {
    console.log(`[AI Images] 🛒 쇼핑커넥트 + ${imageSource}: img2img 미지원 — 사용자 선택 그대로 실행 (제품 정확도 미보장)`);
    appendLog(`⚠️ "${imageSource}"는 img2img 미지원 — 제품 외형이 다르게 생성될 수 있습니다. 정확한 재현을 원하시면 [🍌 나노바나나] 또는 [🦆 덕트테이프]를 선택하세요.`);
    // imageSource 변경 없음 — 사용자 선택 존중
  }

  // ✅ [FIX] 쇼핑커넥트 모드에서는 썸네일 텍스트 자동 포함
  // ✅ [2026-03-10 CLEANUP] 유령 체크박스 참조 제거 → localStorage + formData 사용
  const includeThumbnailText = isShoppingConnect ? true : (
    formData.includeThumbnailText ??
    thumbnailFromStorage ??
    thumbnailTextCheckbox?.checked ?? false
  );

  if (isShoppingConnect) {
    console.log(`[AI Images] ✅ 쇼핑커넥트 모드: 썸네일 텍스트 포함 자동 활성화`);
  }

  // ✅ 쇼핑커넥트 모드에서만 수집 이미지를 참조로 사용 (일반 모드에서는 사용 안 함)
  let collectedImages = isShoppingConnect
    ? (formData.collectedImages || currentStructuredContent?.collectedImages || currentStructuredContent?.images || [])
    : [];

  // ✅ [2026-02-01 FIX] 글 생성 시 수집한 이미지가 있으면 재크롤링 건너뛰기
  // 재크롤링은 시간 낭비이므로 완전히 제거
  if (isShoppingConnect && collectedImages.length === 0) {
    console.log(`[AI Images] ⚠️ 수집된 이미지 없음 - AI 생성으로 진행`);
    appendLog(`⚠️ 수집된 이미지가 없습니다. AI 이미지 생성으로 진행합니다.`);
    // 재크롤링 하지 않음! 이미지가 없으면 AI 생성으로 진행
  } else if (isShoppingConnect && collectedImages.length > 0) {
    console.log(`[AI Images] ✅ 글 생성 시 수집된 이미지 ${collectedImages.length}개 재사용 (재크롤링 안함)`);
  }

  if (isShoppingConnect && collectedImages.length > 0) {
    appendLog(`🛒 쇼핑 커넥트 모드: ${collectedImages.length}개 수집 이미지를 참조로 사용합니다.`);

    // ✅ [2026-02-01] Gemini 3 기반 AI 이미지-소제목 의미적 매칭
    if (collectedImages.length >= headings.length) {
      try {
        appendLog(`🎯 AI 이미지 매칭 중... (소제목에 맞는 이미지 자동 배치)`);
        const headingTitles = headings.map((h: any) => h.title || h);
        const imageUrls = collectedImages.map((img: any) =>
          typeof img === 'string' ? img : (img.url || img.filePath || '')
        );

        const matchResult = await window.api.matchImagesToHeadings(imageUrls, headingTitles);

        if (matchResult.success && matchResult.matches) {
          // 매칭 결과에 따라 이미지 재정렬
          const reorderedImages = matchResult.matches.map((imgIndex: number, headingIndex: number) => {
            const originalImg = collectedImages[imgIndex] || collectedImages[headingIndex % collectedImages.length];
            return {
              ...(typeof originalImg === 'object' ? originalImg : { url: originalImg }),
              heading: headingTitles[headingIndex],
              headingIndex: headingIndex,
              matchedByAI: true
            };
          });

          collectedImages = reorderedImages;
          appendLog(`✅ AI 매칭 완료: 소제목에 맞게 이미지가 재배치되었습니다!`);
          console.log(`[AI Images] ✅ AI 매칭 결과:`, matchResult.matches);
        }
      } catch (matchError) {
        console.warn(`[AI Images] ⚠️ AI 매칭 실패, 순차 배치 유지:`, matchError);
        // 폴백: 기존 순차 배치 유지
      }
    }
  }

  const providerForLock = String(imageSource || '').trim() === 'pollinations' ? 'nano-banana-pro' : String(imageSource || '').trim();
  const shouldRunSequentially = isCostRiskImageProvider(providerForLock);

  // ✅ [2026-02-24 FIX] 쇼핑커넥트: 수집 이미지를 썸네일로 사용 / 비쇼핑커넥트: AI 전용 썸네일
  let dedicatedShopThumbnail: any = null;

  if (isShoppingConnect && collectedImages.length > 0) {
    // ✅ 쇼핑커넥트 모드: 첫 번째 수집 이미지를 썸네일로 사용 (텍스트 오버레이는 naverBlogAutomation.ts에서 처리)
    const firstCollected = collectedImages[0];
    const thumbUrl = typeof firstCollected === 'string' ? firstCollected : (firstCollected?.url || firstCollected?.filePath || firstCollected?.thumbnailUrl || '');
    if (thumbUrl) {
      dedicatedShopThumbnail = {
        url: thumbUrl,
        filePath: thumbUrl,
        heading: (currentStructuredContent?.selectedTitle || formData.postTitle || formData.title || '🖼️ 썸네일'),
        isThumbnail: true,
        isCollectedImage: true,
        source: 'collected',
        provider: 'collected',
      };
      appendLog(`🛒 쇼핑커넥트: 수집 이미지를 썸네일로 사용 (텍스트 오버레이는 발행 시 적용)`);
    }
  } else if (!isShoppingConnect) {
    // ✅ [2026-02-27 FIX] 비쇼핑커넥트 모드: 블로그 제목 기반 AI 추론으로 전용 썸네일 생성
    try {
      let shopTitle = currentStructuredContent?.selectedTitle || formData.postTitle || formData.title || '';
      // ✅ [2026-03-10 FIX] URL이 썸네일 AI 프롬프트에 투입되는 것을 방지
      if (/^https?:\/\//i.test(shopTitle.trim())) {
        console.warn(`[FullAuto] ⚠️ shopTitle이 URL이므로 빈 문자열로 대체: "${shopTitle.substring(0, 60)}"`);
        shopTitle = '';
      }
      const isNanoBanana = imageSource === 'nano-banana-pro' || imageSource === 'pollinations';
      const thumbnailAllowText = includeThumbnailText;
      appendLog(`🖼️ 전용 AI 썸네일 생성 중... (블로그 제목 기반 AI 추론)`);

      // ✅ [2026-02-27 FIX] 블로그 제목을 AI가 추론하여 영어 이미지 프롬프트 생성
      // Gemini(2.5-flash) → OpenAI → Claude → Perplexity 폴백 체인
      let thumbnailPrompt: string;
      try {
        const aiTranslated = await generateEnglishPromptForHeading(
          shopTitle, formData.keywords, imageStyle
        );
        thumbnailPrompt = aiTranslated;
        appendLog(`🎨 AI 썸네일 프롬프트: "${aiTranslated.substring(0, 50)}..."`);
      } catch {
        // AI 전부 실패 시 폴백
        thumbnailPrompt = `eye-catching blog thumbnail, visual metaphor for: ${shopTitle}, cinematic lighting, compelling composition, hero image style`;
        appendLog(`⚠️ AI 프롬프트 생성 실패 → 기본 프롬프트 사용`);
      }

      const thumbResult = await generateImagesWithCostSafety({
        provider: imageSource,
        items: [{
          heading: shopTitle || '블로그 썸네일',
          prompt: thumbnailPrompt,
          englishPrompt: thumbnailPrompt, // ✅ sanitizeImagePrompt 바이패스
          isThumbnail: true,
          allowText: thumbnailAllowText,
        }],
        postTitle: shopTitle,
        isFullAuto: formData.mode === 'full-auto',
        imageRatio: globalSettings.thumbnailRatio || globalSettings.imageRatio || '1:1', // ✅ [2026-03-07 FIX] 썸네일 전용 비율
        thumbnailTextInclude: includeThumbnailText, // ✅ [2026-03-16] 명시적 전달
      });

      if (thumbResult?.success && thumbResult.images && thumbResult.images.length > 0) {
        dedicatedShopThumbnail = {
          ...thumbResult.images[0],
          heading: shopTitle || '🖼️ 썸네일',
          isThumbnail: true,
        };
        appendLog(`✅ 전용 AI 썸네일 생성 완료!`);
      } else {
        appendLog(`⚠️ 전용 썸네일 생성 실패 → 썸네일 없이 진행`);
      }
    } catch (thumbErr) {
      appendLog(`⚠️ 전용 썸네일 생성 오류: ${(thumbErr as Error).message}`);
    }
  }

  const generateOne = async (heading: any, i: number): Promise<any[]> => {
    try {
      // ✅ [2026-03-10 FIX] headingImageMode 필터링은 main.ts IPC 핸들러에서 1회만 수행
      // 렌더러에서 사전 필터링하면 이중 필터링으로 짝수/홀수 모드에서 이미지 누락 발생

      // ✅ 각 이미지 생성 전 중지 체크
      if (isFullAutoStopRequested()) {
        appendLog(`⏹️ 이미지 생성 중지됨 (${i + 1}/${headings.length})`);
        return [];
      }

      // ✅ [2026-03-11] 개별 이미지 생성 시작 로그
      const headingTitle = heading.title || heading || `이미지 ${i + 1}`;
      appendLog(`🎨 [${i + 1}/${headings.length}] "${String(headingTitle).substring(0, 20)}" 이미지 생성 시작...`);

      // ✅ [2026-02-24 UPDATED] 전용 썸네일 별도 생성됨 → 모든 소제목은 순수 이미지
      const isThumbnail = false;
      const shouldIncludeText = false;

      // ✅ [2026-01-23] useAiImage 플래그 읽기 (체크박스 값)
      const useAiImageChecked = (document.getElementById('unified-use-ai-image') as HTMLInputElement)?.checked ?? true;

      // 소제목을 기반으로 영어 프롬프트 생성 (✅ 스타일별 최적화된 프롬프트)
      const englishPrompt = await generateEnglishPromptForHeading(heading, formData.keywords, imageStyle);
      console.log(`[AI Images] ${i + 1}/${headings.length} - 스타일: ${imageStyle}, 프롬프트: ${englishPrompt}`);

      console.log(`[AI Images] ${i + 1}번 소제목 - heading: "${heading.title}", isThumbnail: ${isThumbnail}, allowText: ${shouldIncludeText}, useAiImage: ${useAiImageChecked} (쇼핑커넥트: ${isShoppingConnect})`);

      // ✅ [FIX] 참조 이미지 결정 (쇼핑 커넥트면 수집된 이미지 사용)
      let ref: any = {};

      if (isShoppingConnect && collectedImages.length > 0) {
        // 수집된 이미지를 순환하며 할당 (AI 생성 시 참조용)
        const refImg = collectedImages[i % collectedImages.length];
        const refUrl = typeof refImg === 'string' ? refImg : (refImg?.url || refImg?.filePath || refImg?.thumbnailUrl);
        if (refUrl) {
          ref = { referenceImagePath: refUrl };
          console.log(`[AI Images] 🛒 쇼핑 커넥트 참조 이미지 적용: ${refUrl}`);
        }
      } else {
        // 기존 로직: 소제목별 참조 이미지
        ref = await resolveReferenceImageForHeadingAsync(String(heading.title || heading || '').trim());
      }


      // ✅ [2026-01-23 NEW] 쇼핑커넥트: AI생성 미사용 시 수집 이미지 직접 사용
      if (isShoppingConnect && collectedImages.length > 0 && !useAiImageChecked) {
        const collectedImg = collectedImages[i % collectedImages.length];
        const imgUrl = typeof collectedImg === 'string' ? collectedImg : (collectedImg?.url || collectedImg?.filePath || collectedImg?.thumbnailUrl || '');

        if (imgUrl) {
          console.log(`[AI Images] 🛒 쇼핑커넥트: ${i + 1}번 → 수집 이미지 직접 사용: ${imgUrl.substring(0, 60)}...`);
          appendLog(`✅ [${i + 1}/${headings.length}] "${String(headingTitle).substring(0, 20)}" 수집 이미지 적용 완료!`);

          completedCount++;
          const currentProgress = progressStart + ((progressEnd - progressStart) * (completedCount / headings.length));
          showUnifiedProgress(
            Math.round(currentProgress),
            `이미지 적용 중... (${completedCount}/${headings.length})`,
            `\"${heading.title}\" 수집 이미지 적용 완료`
          );

          return [{
            heading: heading.title,
            headingIndex: i,
            url: imgUrl,
            filePath: imgUrl,
            isCollectedImage: true,
            isThumbnail: false, // ✅ 전용 썸네일 별도 생성됨
            source: 'collected'
          }];
        }
      }

      // ✅ 일반 모드 또는 쇼핑커넥트+AI생성 활성화 시: AI 이미지 생성
      const imageResult = await generateImagesWithCostSafety({
        provider: imageSource, // 이미지 생성 소스
        items: [{
          heading: heading.title, // ✅ [2026-02-24 UPDATED] 소제목 원래대로
          prompt: englishPrompt,
          englishPrompt: englishPrompt, // ✅ [2026-02-27 FIX] sanitizeImagePrompt 바이패스
          isThumbnail: false,     // ✅ 전용 썸네일 별도 생성됨 → 소제목은 항상 false
          allowText: false,       // ✅ 소제목 이미지에는 텍스트 없음
          imageStyle: imageStyle, // ✅ [2026-02-08 FIX] 스타일 명시적 전달 (테스트=실제 발행 동일 보장)
          imageRatio: globalSettings.subheadingRatio || imageRatio, // ✅ [2026-03-07 FIX] 소제목 전용 비율 우선 적용
          ...ref, // ✅ 참조 이미지 적용
        }],
        postTitle: currentStructuredContent?.selectedTitle,
        postId: currentPostId || undefined, // ✅ 글 ID 전달
        isFullAuto: formData.mode === 'full-auto', // ✅ 풀오토 모드: 100% 성공률 보장
        // ✅ [FIX] 쇼핑 커넥트 정보 전달 (중요!)
        isShoppingConnect: isShoppingConnect,
        collectedImages: collectedImages,
        thumbnailTextInclude: includeThumbnailText, // ✅ [2026-03-16] 명시적 전달
      });

      // 진행률 업데이트 (완료된 개수 기준)
      completedCount++;
      const currentProgress = progressStart + ((progressEnd - progressStart) * (completedCount / headings.length));
      showUnifiedProgress(
        Math.round(currentProgress),
        `이미지 생성 중... (${completedCount}/${headings.length})`,
        `\"${heading.title}\" 이미지 생성 완료`
      );

      console.log(`[AI Images] ${i + 1}/${headings.length} - 결과:`, imageResult.success ? '성공' : '실패');

      if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
        appendLog(`✅ [${i + 1}/${headings.length}] "${String(headingTitle).substring(0, 20)}" 이미지 생성 완료!`);
        return imageResult.images.map((img: any) => ({ ...img, isThumbnail: false }));
      } else {
        appendLog(`⚠️ [${i + 1}/${headings.length}] "${String(headingTitle).substring(0, 20)}" 이미지 생성 실패 — 텍스트로 진행`);
        return [];
      }
    } catch (error) {
      completedCount++;
      console.warn(`[AI Images] ${i + 1}/${headings.length} 이미지 생성 오류 (${heading.title}):`, error);
      // ✅ [2026-03-11] 사용자 친화적 에러 메시지
      appendLog(`❌ [${i + 1}/${headings.length}] ${friendlyErrorMessage(error)}`);
      return [];
    }
  };

  const results: any[][] = [];
  if (shouldRunSequentially) {
    for (let i = 0; i < headings.length; i++) {
      results.push(await generateOne(headings[i], i));
    }
  } else {
    const imagePromises = headings.map(async (heading, i) => generateOne(heading, i));
    results.push(...(await Promise.all(imagePromises)));
  }
  const images = results.flat(); // 2차원 배열을 1차원으로 평탄화

  // ✅ [2026-02-24] 전용 썸네일을 맨 앞에 추가
  const finalImagesWithThumbnail = [
    ...(dedicatedShopThumbnail ? [dedicatedShopThumbnail] : []),
    ...images,
  ];

  console.log(`[AI Images] 이미지 생성 완료 - 총 ${finalImagesWithThumbnail.length}개 생성됨 (썸네일 ${dedicatedShopThumbnail ? '포함' : '미포함'})`);
  return finalImagesWithThumbnail;
}

// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 프롬프트 번역 로직 → ./modules/promptTranslation.ts로 이동
// - generateEnglishPromptForHeading, decomposeKoreanCompound, koreanMorphemes 등
// ═══════════════════════════════════════════════════════════════════


// 4단계: 블로그 발행 실행
export async function executeBlogPublishing(structuredContent: any, generatedImages: any[], formData: any) {
  // ✅ [2026-03-11 FIX] 발행 함수 진입 시 취소 체크
  if ((window as any).stopFullAutoPublish === true) {
    appendLog('⏹️ 발행 시작 전 취소 감지 → 건너뜁니다.');
    throw new Error('사용자가 작업을 취소했습니다.');
  }

  // ✅ 진행상황 모달 가져오기
  const modal = (window as any).currentProgressModal as ProgressModal | null;

  appendLog('📤 블로그 발행을 준비합니다.');
  showUnifiedProgress(85, '블로그 발행 준비 중...', '네이버 계정 정보를 확인하고 있습니다.');
  modal?.setProgress(60, '네이버 계정 확인 중...');

  // ✅ 입력 필드에서 네이버 계정 정보 가져오기 (우선순위)
  const naverIdInput = document.getElementById('naver-id') as HTMLInputElement;
  const naverPasswordInput = document.getElementById('naver-password') as HTMLInputElement;

  let naverId: string | undefined;
  let naverPassword: string | undefined;

  // 입력 필드에 값이 있으면 우선 사용
  if (naverIdInput && naverIdInput.value.trim()) {
    naverId = naverIdInput.value.trim();
  }
  if (naverPasswordInput && naverPasswordInput.value.trim()) {
    naverPassword = naverPasswordInput.value.trim();
  }

  // 입력 필드에 값이 없으면 저장된 값 사용
  if (!naverId || !naverPassword) {
    const config = await window.api.getConfig();
    if (config.savedNaverId && !naverId) {
      naverId = config.savedNaverId;
    }
    if (config.savedNaverPassword && !naverPassword) {
      naverPassword = config.savedNaverPassword;
    }
  }

  // 최종 확인
  if (!naverId || !naverPassword) {
    appendLog('❌ 네이버 계정 정보가 설정되지 않았습니다.');
    appendLog('💡 네이버 아이디와 비밀번호를 입력 필드에 입력하거나, "기억하기"를 체크하여 저장해주세요.');
    throw new Error('네이버 아이디와 비밀번호가 설정되지 않았습니다.');
  }

  appendLog('🔐 네이버 계정 정보를 확인했습니다.');
  showUnifiedProgress(87, '페이로드 구성 중...', '발행할 콘텐츠를 준비하고 있습니다.');

  // ✅ CTA 정보 가져오기 (formData에서 또는 자동 생성)
  let ctaText = formData.ctaText;
  let ctaLink = formData.ctaLink;

  // formData에 CTA가 없으면 자동 생성
  if (!ctaText || !ctaLink) {
    const autoCTA = generateAutoCTA(structuredContent.selectedTitle || '', '');
    ctaText = ctaText || autoCTA.ctaText;
    ctaLink = ctaLink || autoCTA.ctaLink;
  }

  if (ctaLink) {
    appendLog(`📢 CTA 버튼 포함: "${ctaText}"`);
  }

  // ✅ 다중 CTA 우선: formData.ctas → (ctaText/ctaLink) 폴백
  const resolvedCtas = (() => {
    const list = (Array.isArray(formData?.ctas) ? formData.ctas : [])
      .map((c: any) => ({
        text: String(c?.text || '').trim(),
        link: String(c?.link || '').trim() || undefined,
      }))
      .filter((c: any) => Boolean(c?.text));
    if (list.length > 0) return list;
    const t = String(ctaText || '').trim();
    const l = String(ctaLink || '').trim();
    return t ? [{ text: t, link: l || undefined }] : [];
  })();

  // ✅ [2026-02-24 FIX] 발행 직전 stale 이미지 상태 클리어
  // 이전 세션의 window.generatedImages가 현재 발행에 오염되는 것을 방지
  (window as any).generatedImages = null;

  const imagesForPayloadSource = (() => {
    // ✅ [2026-02-24 FIX] 파라미터로 전달받은 이미지를 최우선 사용
    // 호출자(executeSemiAutoFlow/executeFullAutoFlow)에서 이미 준비한 이미지
    if (Array.isArray(generatedImages) && generatedImages.length > 0) {
      console.log('[executeBlogPublishing] ✅ 파라미터 generatedImages 사용:', generatedImages.length);
      return generatedImages;
    }

    // ✅ [2026-01-21] 파라미터가 비어있을 때만 독립 소스에서 폴백
    try {
      const fromGlobal = (window as any).imageManagementGeneratedImages;
      if (Array.isArray(fromGlobal) && fromGlobal.length > 0) {
        console.log('[executeBlogPublishing] ✅ imageManagementGeneratedImages에서 이미지 폴백:', fromGlobal.length);
        return fromGlobal;
      }
    } catch (e) {
      console.warn('[fullAutoFlow] catch ignored:', e);
    }
    try {
      const fromManager = ImageManager.getAllImages();
      if (Array.isArray(fromManager) && fromManager.length > 0) {
        console.log('[executeBlogPublishing] ✅ ImageManager에서 이미지 폴백:', fromManager.length);
        return fromManager;
      }
    } catch (e) {
      console.warn('[fullAutoFlow] catch ignored:', e);
    }
    console.log('[executeBlogPublishing] ⚠️ 이미지 소스 없음');
    return [];
  })();

  const normalizedImagesForPayload = filterImagesForPublish(structuredContent, imagesForPayloadSource)
    .map((img: any) => {
      const filePath = img?.filePath || img?.url || img?.previewDataUrl;
      return {
        ...img,
        filePath,
      };
    })
    .filter((img: any) => Boolean(img?.filePath));

  // ✅ 대표사진(썸네일) 경로 가져오기 (1번 이미지 사용)
  let thumbnailPath = (window as any).thumbnailPath || formData.thumbnailPath;
  if (!thumbnailPath && normalizedImagesForPayload && normalizedImagesForPayload.length > 0) {
    // ✅ [2026-02-24 FIX] isThumbnail 플래그로 썸네일 찾기, 없으면 1번 이미지 사용
    const thumbnailImage = normalizedImagesForPayload.find((img: any) => img.isThumbnail === true);
    const fallbackImage = normalizedImagesForPayload[0];
    const selectedImage = thumbnailImage || fallbackImage;
    thumbnailPath = selectedImage?.filePath || selectedImage?.url || selectedImage?.previewDataUrl;
  }

  if (thumbnailPath) {
    appendLog(`📷 대표사진 설정됨: ${thumbnailPath.substring(0, 50)}...`);
  }

  // ✅ 제목은 UI/사용자 입력을 최우선으로 사용 (풀오토에서 AI 제목으로 바뀌는 문제 방지)
  const preferredTitle = (() => {
    try {
      const generatedTitleUi = (document.getElementById('unified-generated-title') as HTMLInputElement | null)?.value?.trim();
      if (generatedTitleUi) return generatedTitleUi;
    } catch (e) {
      console.warn('[fullAutoFlow] catch ignored:', e);
    }
    try {
      const unifiedTitleUi = (document.getElementById('unified-title') as HTMLInputElement | null)?.value?.trim();
      if (unifiedTitleUi) return unifiedTitleUi;
    } catch (e) {
      console.warn('[fullAutoFlow] catch ignored:', e);
    }
    const fromFormData = String(formData?.title || '').trim();
    if (fromFormData) return fromFormData;
    return String(structuredContent?.selectedTitle || '').trim();
  })();

  if (preferredTitle) {
    structuredContent.selectedTitle = preferredTitle;
  }

  // ✅ 본문도 UI/사용자 입력을 최우선으로 사용 (반자동 편집에서 수정한 내용 반영)
  const preferredContent = (() => {
    try {
      const generatedContentUi = (document.getElementById('unified-generated-content') as HTMLTextAreaElement | null)?.value?.trim();
      if (generatedContentUi && generatedContentUi.length > 0) return generatedContentUi;
    } catch (e) {
      console.warn('[fullAutoFlow] catch ignored:', e);
    }
    try {
      const postContentUi = (document.getElementById('post-content') as HTMLTextAreaElement | null)?.value?.trim();
      if (postContentUi && postContentUi.length > 0) return postContentUi;
    } catch (e) {
      console.warn('[fullAutoFlow] catch ignored:', e);
    }
    return structuredContent.content || structuredContent.bodyPlain || '';
  })();

  // ✅ 해시태그도 UI/사용자 입력을 최우선으로 사용
  const preferredHashtags = (() => {
    try {
      const hashtagsUi = (document.getElementById('unified-generated-hashtags') as HTMLInputElement | null)?.value?.trim();
      if (hashtagsUi) {
        // 해시태그 문자열을 배열로 변환 (쉼표, 공백, # 기준으로 분리)
        return hashtagsUi.split(/[,\s#]+/).map(h => h.trim()).filter(h => h.length > 0);
      }
    } catch (e) {
      console.warn('[fullAutoFlow] catch ignored:', e);
    }
    try {
      const postTagsUi = (document.getElementById('post-tags') as HTMLInputElement | null)?.value?.trim();
      if (postTagsUi) {
        return postTagsUi.split(/[,\s#]+/).map(h => h.trim()).filter(h => h.length > 0);
      }
    } catch (e) {
      console.warn('[fullAutoFlow] catch ignored:', e);
    }
    return structuredContent.hashtags || [];
  })();

  // ✅ UI에서 가져온 값으로 structuredContent 업데이트
  if (preferredContent) {
    structuredContent.content = preferredContent;
    structuredContent.bodyPlain = preferredContent;
    // ✅ [2026-02-28 FIX] UI에서 content가 존재하면 _bodyManuallyEdited를 true로 보장
    // 사용자가 textarea를 수정하지 않더라도, AI 생성 직후 그대로 발행하는 경우에도
    // preferredContent가 존재하므로 편집 플래그를 활성화
    if (!structuredContent._bodyManuallyEdited) {
      structuredContent._bodyManuallyEdited = true;
      console.log('[executeBlogPublishing] ✅ _bodyManuallyEdited 강제 설정 (preferredContent 존재)');
    }
  }
  if (preferredHashtags && preferredHashtags.length > 0) {
    structuredContent.hashtags = preferredHashtags;
  }

  // ✅ 본문에서 ** 문구 제거 (마크다운 볼드 처리)
  // ✅ content가 없으면 bodyPlain 사용 (키워드 글생성 시 bodyPlain만 있는 경우)
  const rawContent = structuredContent.content || structuredContent.bodyPlain || '';
  const cleanedContent = normalizeReadableBodyText(rawContent);
  structuredContent.bodyPlain = cleanedContent;
  structuredContent.content = cleanedContent;

  // ✅ [2026-02-27 FIX] bodyPlain이 변경되었으면 headings[].content도 재파싱
  // 사용자가 미리보기에서 수정한 내용이 headings에 반영되지 않는 버그 수정
  if (structuredContent.headings && Array.isArray(structuredContent.headings) && cleanedContent) {
    for (let i = 0; i < structuredContent.headings.length; i++) {
      const heading = structuredContent.headings[i];
      if (!heading?.title) continue;

      const escapedTitle = heading.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const titlePattern = new RegExp(`${escapedTitle}\\s*:?\\s*`, 'i');
      const titleMatch = cleanedContent.match(titlePattern);

      if (titleMatch && titleMatch.index !== undefined) {
        const startIdx = titleMatch.index + titleMatch[0].length;
        let endIdx = cleanedContent.length;

        // 다음 소제목까지의 내용 추출
        if (i < structuredContent.headings.length - 1) {
          const nextTitle = structuredContent.headings[i + 1]?.title;
          if (nextTitle) {
            const nextEscaped = nextTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const nextPattern = new RegExp(`${nextEscaped}\\s*:?\\s*`, 'i');
            const nextMatch = cleanedContent.substring(startIdx).match(nextPattern);
            if (nextMatch && nextMatch.index !== undefined) {
              endIdx = startIdx + nextMatch.index;
            }
          }
        }

        const newContent = cleanedContent.substring(startIdx, endIdx).trim();
        if (newContent.length > 10) {
          heading.content = newContent;
        }
      }
    }
    console.log('[executeBlogPublishing] ✅ headings[].content 재파싱 완료');
  }

  // ✅ 디버깅: 본문 내용 확인
  console.log('[executeBlogPublishing] rawContent 길이:', rawContent.length);
  console.log('[executeBlogPublishing] cleanedContent 길이:', cleanedContent.length);
  if (!cleanedContent || cleanedContent.length < 10) {
    appendLog(`⚠️ 본문 내용이 비어있거나 너무 짧습니다. (${cleanedContent.length}자)`);
    console.warn('[executeBlogPublishing] 본문 내용 부족:', {
      content: structuredContent.content?.substring(0, 100),
      bodyPlain: structuredContent.bodyPlain?.substring(0, 100)
    });
  }

  // ✅ [2026-02-28 DEBUG] IPC 전송 직전 headings/bodyPlain/_bodyManuallyEdited 상태 확인
  console.log('[executeBlogPublishing] 📊 IPC 전송 직전 상태:', {
    _bodyManuallyEdited: structuredContent._bodyManuallyEdited,
    bodyPlainLength: structuredContent.bodyPlain?.length || 0,
    headingsCount: structuredContent.headings?.length || 0,
    headingsContentLengths: (structuredContent.headings || []).map((h: any) => ({
      title: h.title?.substring(0, 20),
      contentLen: h.content?.length || 0,
    })),
    // ✅ [2026-03-19 FIX] 예약 발행 디버그
    publishMode: formData.publishMode,
    scheduleDate: formData.scheduleDate,
    scheduleTime: formData.scheduleTime,
  });

  // ✅ [v2.7.55 핫픽스] FTC SSOT 인라인화
  //   v2.7.50의 await import('../utils/ftcResolver.js')가 renderer 인라인 빌드에서
  //   require()로 다운컴파일 → "require is not defined" 회귀 발생.
  //   해결: 동적 import 제거하고 동일 SSOT 로직을 인라인. ftcResolver.ts는 main 측에서만 사용.
  const ftcCheckboxEl = document.getElementById('unified-ftc-disclosure') as HTMLInputElement;
  const ftcTextareaEl = document.getElementById('unified-ftc-text') as HTMLTextAreaElement;
  const isAffiliateModeFtc = formData.contentMode === 'affiliate';
  const storedFtcEnabled = localStorage.getItem('ftcDisclosureEnabled');
  const DEFAULT_FTC_TEXT = '※ 이 포스팅은 제휴 마케팅의 일환으로, 구매 시 소정의 수수료를 제공받을 수 있습니다.';
  let ftcEnabled: boolean;
  let ftcSource: string;
  if (ftcCheckboxEl) {
    ftcEnabled = ftcCheckboxEl.checked;
    ftcSource = 'checkbox';
  } else if (storedFtcEnabled !== null) {
    ftcEnabled = storedFtcEnabled === 'true';
    ftcSource = 'localStorage';
  } else {
    ftcEnabled = isAffiliateModeFtc;
    ftcSource = isAffiliateModeFtc ? 'mode-default-affiliate' : 'mode-default-other';
  }
  const ftcText = ftcEnabled
    ? (ftcTextareaEl?.value?.trim()
        || (localStorage.getItem('ftcDisclosureText') || '').trim()
        || (isAffiliateModeFtc ? DEFAULT_FTC_TEXT : ''))
    : '';
  const finalContent = cleanedContent;
  if (ftcEnabled && ftcText) {
    structuredContent.ftcDisclosure = ftcText;
    appendLog(`⚖️ 공정위 문구 설정됨 (${ftcSource}): "${ftcText.substring(0, 30)}..."`);
  } else {
    appendLog(`⏭️ 공정위 문구 비활성 (모드='${formData.contentMode || 'normal'}', 결정근거=${ftcSource})`);
  }

  // 자동화 페이로드 구성
  const payload: RendererAutomationPayload = {
    naverId: naverId,
    naverPassword: naverPassword,
    title: preferredTitle || structuredContent.selectedTitle,
    content: finalContent,
    lines: finalContent.split('\n'),
    hashtags: structuredContent.hashtags,
    structuredContent: structuredContent,
    generatedImages: normalizedImagesForPayload,
    imageMode: formData.skipImages ? 'skip' : 'full-auto',
    skipImages: formData.skipImages || false, // ✅ [v1.4.66] 백엔드에 skipImages 명시적 전달 (누락으로 ImageFX 팝업 버그)
    // ✅ [v2.7.35] 공정위 토글 명시 전달 — main 측 editorHelpers 이중 가드 + 디버깅 추적성
    includeFtcDisclosure: ftcEnabled,
    autoGenerate: true,
    publishMode: formData.publishMode as 'draft' | 'publish' | 'schedule',
    scheduleDate: formData.publishMode === 'schedule' ? formData.scheduleDate : undefined,
    scheduleTime: formData.publishMode === 'schedule' ? formData.scheduleTime : undefined, // ✅ [2026-03-19 FIX] 예약 시간 명시적 전달
    scheduleType: formData.publishMode === 'schedule' ? (formData.scheduleType as 'app-schedule' | 'naver-server' || 'naver-server') : undefined,
    toneStyle: formData.toneStyle as 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe' | 'storyteller' | 'expert_review' | 'calm_info' | undefined,
    postId: currentPostId || undefined, // ✅ 현재 글 ID 전달
    thumbnailPath: thumbnailPath, // ✅ 대표사진 경로 추가
    categoryName: formData.categoryName || formData.category, // ✅ 발행 카테고리명 추가 (category도 호환성 지원)
    // ✅ [2026-02-16 DEBUG] IPC 전송 직전 categoryName 확인
    ...((() => { console.log(`[executeBlogPublishing] 📂 IPC categoryName: "${formData.categoryName || formData.category || '(없음)'}"`); return {}; })()),
    // ✅ CTA 설정
    ctaText: formData.skipCta ? undefined : ctaText,
    ctaLink: formData.skipCta ? undefined : ctaLink,
    ctas: formData.skipCta ? [] : resolvedCtas,
    ctaPosition: formData.ctaPosition || 'bottom', // ✅ CTA 위치
    skipCta: formData.skipCta || false, // ✅ CTA 없이 발행
    contentMode: formData.contentMode || 'seo', // ✅ 콘텐츠 모드 추가
    affiliateLink: formData.affiliateLink, // ✅ 제휴 링크 추가
    // ✅ [2026-01-22 버그 수정] 이전글 정보 추가 (기존에 누락되어 있었음!)
    previousPostTitle: formData.previousPostTitle || undefined,
    previousPostUrl: formData.previousPostUrl || undefined,
    customBannerPath: formData.customBannerPath || (window as any).customBannerPath || undefined, // ✅ [2026-01-18] 커스텀 배너 경로
    autoBannerGenerate: formData.autoBannerGenerate || false, // ✅ [2026-01-21] 배너 자동 랜덤 생성 옵션
    includeThumbnailText: formData.includeThumbnailText ?? false, // ✅ [2026-02-24 FIX] 썸네일 텍스트 오버레이 옵션 전달
  };

  // ✅ 예약 발행인 경우 postId 확인 및 자동 저장
  if (formData.publishMode === 'schedule') {
    if (!currentPostId) {
      // postId가 없으면 자동으로 생성 및 저장
      appendLog('⚠️ 글 ID가 없습니다. 자동으로 저장합니다...');
      const postId = saveGeneratedPost(structuredContent);
      if (postId) {
        currentPostId = postId;
        payload.postId = postId;
        appendLog(`💾 글이 자동으로 저장되었습니다 (ID: ${postId})`);
      } else {
        appendLog('❌ 글 저장에 실패했습니다. 예약 발행이 정상적으로 작동하지 않을 수 있습니다.');
      }
    }

    // localStorage 확인 (올바른 키 사용)
    const generatedPosts = JSON.parse(localStorage.getItem(GENERATED_POSTS_KEY) || '[]');
    const postExists = generatedPosts.some((p: any) => p.id === currentPostId);

    if (postExists) {
      appendLog(`📝 예약 발행 글 ID: ${currentPostId} (localStorage 확인 완료)`);
      console.log('[Publish] 예약 발행 postId:', currentPostId, 'localStorage 존재:', true);
    } else {
      appendLog(`⚠️ localStorage에 글이 없습니다. 다시 저장합니다...`);
      console.warn('[Publish] localStorage에 postId가 없음:', currentPostId);
      // 강제로 다시 저장
      const newPostId = saveGeneratedPost(structuredContent);
      if (newPostId) {
        currentPostId = newPostId;
        payload.postId = newPostId;
        appendLog(`💾 글이 다시 저장되었습니다 (ID: ${newPostId})`);
      }
    }
  }

  appendLog('🚀 블로그 자동화를 시작합니다...');

  // ✅ 자동화 실행 전 ImageMap 동기화 (Renderer -> Main)
  if (typeof (window as any).ImageManager !== 'undefined' && (window as any).ImageManager.imageMap) {
    console.log('[Renderer] 블로그 발행 시작 전 ImageManager 동기화 시도...');
    try {
      await window.api.syncImageManager((window as any).ImageManager.imageMap);
    } catch (e) {
      console.error('[Renderer] ImageManager 동기화 실패:', e);
    }
  }

  modal?.addLog('🔐 네이버 로그인 시도 중...');

  // 진행률을 90%로 설정하고 발행 시작 표시
  showUnifiedProgress(90, '블로그 발행 시작...', '네이버 블로그에 접속하고 있습니다.');

  // 블로그 자동화 실행 (향상된 재시도 로직 적용)
  const apiClient = EnhancedApiClient.getInstance();

  // ✅ 진행상황 모달 업데이트 - 발행 단계 시작
  modal?.setStep(4, 'active', '발행 중...');
  modal?.setProgress(75, '블로그 발행 중...');

  // ✅ [2026-04-04 FIX] 진행률 단계적 업데이트 — setTimeout 순서를 IPC 호출 후 덮어쓰지 않도록 수정
  // 이전: setTimeout(92%, 1초)가 즉시 설정한 95%를 되돌려 발행 중 92%에 멈춰 보이는 버그
  showUnifiedProgress(92, '블로그 로그인 중...', '네이버 계정으로 로그인하고 있습니다.');
  modal?.setProgress(70, '네이버 로그인 중...');

  // ✅ [2026-04-04 FIX] 95% 표시를 IPC 호출 직전에 동기적으로 설정
  showUnifiedProgress(95, '콘텐츠 발행 중...', '네이버 블로그에 콘텐츠를 업로드하고 있습니다.');

  // ✅ [FIX-2] 블로그 발행 API 호출
  // retryCount=0: 재시도 없음 — 이중 실행 방지
  // ✅ [v1.4.13] timeout 5분 → 25분 — 이미지 6장+ 발행은 6~10분 정상, 5분 타임아웃은 짧음
  // 실측: BlogExecutor 발행 사이클 +377초(6분 17초) → 5분 timeout fires → 모달 95%에 멈춤
  // 25분이면 진짜 hang (브라우저 크래시)일 때만 fire하고 정상 발행은 모두 통과
  const apiResponse = await apiClient.call(
    'runAutomation',
    [payload],
    {
      retryCount: 0,
      retryDelay: 5000,
      timeout: 1500000    // ✅ [v1.4.13] 25분 안전 타임아웃 (이전: 5분 — 6~10분 정상 발행 시 timeout)
    }
  );

  // ✅ [2026-04-01 FIX] timeout=300000(5분)으로 변경됨
  // 5분 내 미응답 시 타임아웃 에러로 전환되어 사용자에게 실패 표시
  if (!apiResponse.success) {
    const errorMsg = apiResponse.error || '블로그 발행 실패';

    // ✅ [2026-03-23 FIX] 네트워크 오류(ERR_CONNECTION_RESET 등)인 경우 자동 재시도
    const isNetworkError = errorMsg.includes('ERR_CONNECTION_RESET') ||
      errorMsg.includes('ERR_CONNECTION_REFUSED') ||
      errorMsg.includes('ERR_CONNECTION_TIMED_OUT') ||
      errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
      errorMsg.includes('net::');

    if (isNetworkError) {
      const retryAttempts = (payload as any)._networkRetryCount || 0;
      const MAX_NETWORK_RETRIES = 2;

      if (retryAttempts < MAX_NETWORK_RETRIES) {
        const waitSec = (retryAttempts + 1) * 10; // 10초, 20초
        appendLog(`⚠️ 네트워크 오류 감지: ${errorMsg.substring(0, 60)}`);
        appendLog(`🔄 ${waitSec}초 후 발행을 다시 시도합니다... (${retryAttempts + 1}/${MAX_NETWORK_RETRIES})`);
        showUnifiedProgress(88, `네트워크 오류 → ${waitSec}초 후 재시도...`, `재시도 ${retryAttempts + 1}/${MAX_NETWORK_RETRIES}`);

        await new Promise(resolve => setTimeout(resolve, waitSec * 1000));

        (payload as any)._networkRetryCount = retryAttempts + 1;

        appendLog(`🚀 발행 재시도 시작... (${retryAttempts + 1}/${MAX_NETWORK_RETRIES})`);
        const retryResponse = await apiClient.call(
          'runAutomation',
          [payload],
          { retryCount: 0, retryDelay: 5000, timeout: 300000 }
        );

        if (retryResponse.success && retryResponse.data?.success) {
          appendLog(`✅ 재시도 성공! 블로그 발행이 완료되었습니다.`);
          return retryResponse.data;
        }

        // 재시도도 실패
        const retryErrorMsg = retryResponse.error || retryResponse.data?.message || '재시도 실패';
        appendLog(`❌ 재시도도 실패했습니다: ${retryErrorMsg}`);
        throw new Error(retryErrorMsg);
      }
    }

    appendLog(`❌ 블로그 발행에 실패했습니다: ${errorMsg}`);
    throw new Error(errorMsg);
  } else if (!apiResponse.data?.success) {
    const errorMsg = apiResponse.data?.message || apiResponse.error || '블로그 발행 실패';

    // ✅ [2026-04-01 FIX] "이미 실행 중" → 에러로 전파 (이전: success: true → 발행 안 됐는데 성공 오인)
    if (errorMsg.includes('이미 자동화가 실행 중')) {
      appendLog('⚠️ 이전 자동화가 아직 실행 중입니다. 발행이 실행되지 않았습니다.');
      appendLog('💡 잠시 후 다시 시도하거나, 브라우저 닫기 후 재시도해주세요.');
      throw new Error('이전 자동화가 아직 실행 중입니다. 완료 후 다시 시도해주세요.');
    }

    // ✅ [2026-03-23 FIX] apiResponse.data 단에서도 네트워크 오류 재시도
    const isNetworkError2 = errorMsg.includes('ERR_CONNECTION_RESET') ||
      errorMsg.includes('ERR_CONNECTION_REFUSED') ||
      errorMsg.includes('ERR_CONNECTION_TIMED_OUT') ||
      errorMsg.includes('net::');

    if (isNetworkError2) {
      const retryAttempts = (payload as any)._networkRetryCount || 0;
      if (retryAttempts < 2) {
        const waitSec = (retryAttempts + 1) * 10;
        appendLog(`⚠️ 네트워크 오류: ${errorMsg.substring(0, 60)}`);
        appendLog(`🔄 ${waitSec}초 후 발행을 다시 시도합니다... (${retryAttempts + 1}/2)`);

        await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
        (payload as any)._networkRetryCount = retryAttempts + 1;

        const retryResponse2 = await apiClient.call(
          'runAutomation',
          [payload],
          { retryCount: 0, retryDelay: 5000, timeout: 300000 }
        );

        if (retryResponse2.success && retryResponse2.data?.success) {
          appendLog(`✅ 재시도 성공!`);
          return retryResponse2.data;
        }
      }
    }

    // ✅ [v1.4.13] 에러 시 진행률 모달 정리 — 95%에 갇히는 것 방지
    try { hideUnifiedProgress(); } catch { /* ignore */ }
    // ✅ [v1.4.13] 에러 시 진행률 모달 정리 — 95%에 갇히는 것 방지
    try { hideUnifiedProgress(); } catch { /* ignore */ }
    appendLog(`❌ 블로그 발행에 실패했습니다: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const automationResult = apiResponse.data;

  // 진행률을 98%로 업데이트
  showUnifiedProgress(98, '발행 완료 확인...', '블로그 발행이 완료되었는지 확인하고 있습니다.');

  // 최종 완료 표시
  setTimeout(() => {
    showUnifiedProgress(100, '발행 완료!', '🎉 블로그 발행이 성공적으로 완료되었습니다!');
    appendLog('✅ 블로그 발행이 성공적으로 완료되었습니다!');
    console.log('[FullAuto] 블로그 발행 완료');
  }, 500);

  return automationResult;
}

// 진행률 업데이트
