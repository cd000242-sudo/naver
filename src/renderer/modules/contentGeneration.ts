// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 콘텐츠 생성/편집 모듈
// renderer.ts에서 추출된 콘텐츠 생성/CTA/반자동 관련 함수들
// ═══════════════════════════════════════════════════════════════════

// ✅ renderer.ts의 전역 변수/함수 참조
declare let currentStructuredContent: any;
declare let generatedImages: any[];
declare let currentPostId: string | null;
declare const ImageManager: any;
declare const toastManager: any;
declare const UnifiedDOMCache: any;
declare function appendLog(msg: string, ...args: any[]): void;
declare function escapeHtml(str: string): string;
declare function updateUnifiedPreview(content: any): void;
declare function displayGeneratedImages(images: any[]): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function refreshGeneratedPostsList(): void;
declare function saveGeneratedPost(content: any, isUpdate?: boolean, opts?: any): string;
declare function loadGeneratedPosts(): any[];
declare function hydrateImageManagerFromImages(images: any, headings?: any): void;
declare function generateAIContentFromData(data: any): Promise<any>;
declare function showUnifiedProgress(progress: number, title: string, detail?: string): void;
declare function hideUnifiedProgress(): void;
declare function collectFormData(): any;
declare function updateRiskIndicators(...args: any[]): void;
declare function readUnifiedCtasFromUi(): any[];
declare function getScheduleDateFromInput(inputId: string): string | undefined;
declare function isShoppingConnectModeActive(): boolean;

// ✅ [v1.4.24] business 모드 — businessInfo 수집 + 사전 검증 (helper)
// ✅ [v1.4.28] window._businessInfo (글로벌 모달 저장값) 우선, 없으면 4-panel 폴백
function collectBusinessInfo(contentMode: string): any {
  if (contentMode !== 'business') return undefined;
  // 글로벌 모달 저장값 우선 (단일 진실)
  const globalInfo = (window as any)._businessInfo;
  if (globalInfo && globalInfo.name) {
    return globalInfo;
  }
  const get = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement)?.value?.trim() || undefined;
  // 4가지 ID prefix를 순서대로 시도 (먼저 값이 있는 것을 사용)
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
  const missing: string[] = [];
  if (!info.name) missing.push('업체명');
  if (!info.phone && !info.kakao) missing.push('전화번호 또는 카카오톡');
  if (info.serviceArea === 'regional' && !info.region) missing.push('서비스 지역');
  if (missing.length > 0) {
    alert(`🏢 업체 홍보 모드 필수 정보 누락:\n\n• ${missing.join('\n• ')}\n\n발행 전 입력해주세요.`);
    throw new Error(`업체 정보 누락: ${missing.join(', ')}`);
  }
  return info;
}
declare function setKeywordTitleOptionsFromItem(...args: any[]): void;
declare function getProgressModal(): any;
declare function isFullAutoStopRequested(...args: any[]): boolean;
declare function autoSearchAndPopulateImages(...args: any[]): void;

// ✅ [v2.7.97] resolveForceOptionsFromDOM 제거 — 반자동 가드 우회 회귀 차단
//   문제: structuredContent.sourceUrl / fallbackUrl(글생성 URL) / #unified-source-url 등
//         "글 생성용 URL"을 이미지 수집 옵트인으로 오인 → 반자동 체크박스 OFF 상태에서도
//         이미지 수집이 무단 실행됨.
//   해결: 명시적 외부 옵트인(_publishForceOptions, 연속/다계정에서 주입)만 가드 우회 허용.
//         반자동은 #semi-auto-collect-images-on-generate 체크박스가 단일 권한 게이트.
//         풀오토/다계정은 자체 파이프라인(fullAutoFlow / multiAccountManager)에서 직접 수집.
declare let aiProgressModal: any;
declare function normalizeReadableBodyText(text: string): string;
declare function startAutosave(): void;
declare function startAutoBackup(): void;
declare function syncIntegratedPreviewFromInputs(): void;
declare const EnhancedApiClient: any;
declare function generateAutoCTA(...args: any[]): any;
declare function isPaywallPayload(payload: any): boolean;
declare function activatePaywall(...args: any[]): void;
declare function getReviewHeadingSeed(...args: any[]): any;
declare function applyReviewHeadingPrefix(...args: any[]): void;
declare function applyKeywordPrefixToTitleContinuous(...args: any[]): any;

// ✅ [2026-03-14] 강화된 키워드 중복 제거 공통 함수
// 키워드와 AI 생성 제목 사이의 중복을 5단계로 제거:
// 1. 정규화 (따옴표/특수문자 제거) 버전으로 매칭
// 2. 전체 구문 regex 제거
// 3. 개별 단어 순서 앞부분 제거
// 4. 겹치는 접미사/접두사 감지 (키워드 뒤쪽 단어 = 제목 앞쪽 단어)
// 5. 잔여 구두점/공백 정리
function cleanKeywordFromTitle(keyword: string, title: string): string {
  let cleaned = title.trim();

  // 정규화 함수: 따옴표, 콤마, 특수문자를 제거하여 순수 텍스트만 남김
  const normalize = (s: string) => s.replace(/[''"""\u2018\u2019\u201C\u201D,，·\-–—:：;；!！?？()\[\]「」『』\s]+/g, ' ').trim().toLowerCase();

  const kwNorm = normalize(keyword);
  const titleNorm = normalize(cleaned);

  // 1단계: 정규화된 전체 키워드가 제목에 포함되어 있으면 제거
  if (titleNorm.includes(kwNorm)) {
    // 정규화된 키워드 단어들로 원문에서 연속 구간 찾아 제거
    const kwNormWords = kwNorm.split(/\s+/).filter(w => w.length > 0);
    const titleWords = cleaned.split(/\s+/);
    const titleNormWords = titleWords.map(w => normalize(w));

    // 연속 매칭 구간 찾기
    for (let start = 0; start <= titleNormWords.length - kwNormWords.length; start++) {
      let match = true;
      for (let j = 0; j < kwNormWords.length; j++) {
        if (!titleNormWords[start + j].includes(kwNormWords[j]) &&
          !kwNormWords[j].includes(titleNormWords[start + j])) {
          match = false;
          break;
        }
      }
      if (match) {
        // 매칭된 구간 제거
        titleWords.splice(start, kwNormWords.length);
        cleaned = titleWords.join(' ');
        break;
      }
    }
  } else {
    // 2단계: 원문 그대로 regex 제거 시도
    const kwEscaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(kwEscaped, 'gi'), '').trim();
  }

  // 3단계: 키워드 단어들이 제목 앞부분에 순서대로 나오면 제거
  const kwWords = keyword.split(/[\s,]+/).filter(w => w.length > 0);
  if (kwWords.length > 1) {
    let titleWords = cleaned.split(/\s+/).filter(w => w.length > 0);
    let removeCount = 0;
    const kwNormWords = kwWords.map(w => normalize(w));
    const tNormWords = titleWords.map(w => normalize(w));
    for (let i = 0; i < kwNormWords.length && i < tNormWords.length; i++) {
      if (tNormWords[i].includes(kwNormWords[i]) || kwNormWords[i].includes(tNormWords[i])) {
        removeCount++;
      } else {
        break;
      }
    }
    if (removeCount > 0) {
      titleWords = titleWords.slice(removeCount);
      cleaned = titleWords.join(' ');
    }
  }

  // 4단계: 겹치는 접미사/접두사 감지 및 제거
  // 키워드의 끝 N 단어가 제목의 처음 N 단어와 겹치면 제목에서 그 부분 제거
  // 예: keyword="이소나, 남편 강상준과 국악 공연서 만난 인연"
  //     title="남편 강상준과 국악 공연서 시작된 7년 인연"
  //     → "남편 강상준과 국악 공연서"가 겹침 → 제거
  if (kwWords.length > 1) {
    let titleWords = cleaned.split(/\s+/).filter(w => w.length > 0);
    if (titleWords.length > 0) {
      const kwNormWords = kwWords.map(w => normalize(w));
      const tNormWords = titleWords.map(w => normalize(w));

      // 키워드 뒤에서 1개씩 증가하며 제목 앞쪽과 매칭
      let bestOverlap = 0;
      for (let overlap = 1; overlap <= Math.min(kwNormWords.length, tNormWords.length); overlap++) {
        let allMatch = true;
        for (let j = 0; j < overlap; j++) {
          const kwIdx = kwNormWords.length - overlap + j;
          if (!tNormWords[j].includes(kwNormWords[kwIdx]) && !kwNormWords[kwIdx].includes(tNormWords[j])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          bestOverlap = overlap;
        }
      }
      if (bestOverlap >= 2) {
        // 2단어 이상 겹치면 제거 (1단어는 우연의 일치 가능성이 높으므로 제외)
        titleWords = titleWords.slice(bestOverlap);
        cleaned = titleWords.join(' ');
      }
    }
  }

  // 5단계: 잔여 구두점/공백 정리
  cleaned = cleaned
    .replace(/^[,\s·\-–—:：;；!！?？()\[\]「」『』]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
}

// ✅ [2026-03-07] URL 스크래핑 시 원본 블로거 메타데이터 제거
function sanitizeScrapedContent(content: any): void {
  if (!content) return;
  // 블로거 메타데이터/출처 패턴
  const metaPatterns = [
    /(?:작성자|글쓴이|by|출처|ⓒ|저작권|Copyright)\s*[:：]?\s*[^\n,]{2,30}/gi,
    /블로그\s*(?:홈|메인|바로가기)/gi,
    /(?:이웃추가|팬하기|구독하기|공감\s*\d*)/gi,
    /(?:댓글\s*\d+|공감\s*\d+|조회\s*\d+)/gi,
    /(?:네이버|Naver)\s*블로그/gi,
    /blog\.naver\.com\/[a-zA-Z0-9_]+/gi,
  ];
  const fieldsToClean = ['bodyPlain', 'bodyHtml', 'introduction', 'conclusion'];
  for (const field of fieldsToClean) {
    if (content[field] && typeof content[field] === 'string') {
      for (const p of metaPatterns) {
        content[field] = content[field].replace(p, '').trim();
      }
    }
  }
  // headings 내부 본문도 정리
  if (Array.isArray(content.headings)) {
    for (const h of content.headings) {
      if (h.content && typeof h.content === 'string') {
        for (const p of metaPatterns) {
          h.content = h.content.replace(p, '').trim();
        }
      }
    }
  }
}

export async function generateContentFromUrl(
  url: string,
  keywordsOverride?: string,
  toneOverride?: string,
  suppressModal?: boolean,
  contentModeOverride?: string,
  articleTypeOverride?: string
): Promise<void> {
  // ✅ 기존 콘텐츠 및 이미지 완전 초기화 (이전 글 데이터 충돌 방지)
  appendLog('🔄 기존 콘텐츠를 초기화하고 새로운 콘텐츠를 생성합니다...');
  currentStructuredContent = null;
  (window as any).currentStructuredContent = null;
  generatedImages = [];
  (window as any).generatedImages = []; // ✅ [2026-01-21] 연속 발행용 이미지 변수도 초기화
  (window as any).imageManagementGeneratedImages = [];
  ImageManager.clear(); // ✅ ImageManager 초기화 (이전 글의 이미지 매핑 제거)
  // ✅ 활성 모달 결정 (suppressModal이면 메인 진행 모달 사용, 아니면 개별 모달)
  const activeModal: any = suppressModal ? getProgressModal() : aiProgressModal;

  // ✅ AI 글생성 진행률 모달 표시 (suppressModal이 아닐 때만)
  if (!suppressModal) {
    const contentGenSteps = [
      { percent: 10, step: '📝 키워드 분석 중...' },
      { percent: 25, step: '🔍 경쟁 블로그 분석 중...' },
      { percent: 45, step: '✍️ AI 글 작성 중...' },
      { percent: 70, step: '📄 콘텐츠 구조화 중...' },
      { percent: 85, step: '🔗 내부링크 삽입 중...' },
      { percent: 95, step: '✨ 글 마무리 중...' },
    ];

    aiProgressModal.show('🔄 AI 글 생성 중...', {
      autoAnimate: true,
      icon: '📝',
      initialLog: `URL: ${url.substring(0, 60)}${url.length > 60 ? '...' : ''}`,
      steps: contentGenSteps
    });
  }

  // ✅ 로그는 항상 활성 모달에 기록 (풀오토 시에도 진행상황 보이도록)
  if (activeModal.addLog) activeModal.addLog('🔄 URL 크롤링 시작...');

  // ✅ 진행률 표시 시작
  showUnifiedProgress(0, '🔄 URL 크롤링 시작...', `URL: ${url.substring(0, 50)}...`);
  appendLog('🔄 URL에서 콘텐츠 크롤링 및 AI 글 생성 시작...');

  // ✅ UI에서 선택된 생성기 사용 (UnifiedDOMCache에서 가져옴)
  const generator = UnifiedDOMCache.getGenerator();
  console.log(`[Unified] 사용할 AI 엔진: ${generator}`);
  const targetAge = 'all'; // 고정

  // ✅ Override 우선 사용
  const toneStyle = toneOverride || (window as any)._toneOverride || UnifiedDOMCache.getToneStyle();
  const contentMode = contentModeOverride || (document.getElementById('unified-content-mode') as HTMLInputElement)?.value || 'seo';
  let articleType = articleTypeOverride || (document.getElementById('unified-article-type') as HTMLSelectElement)?.value || 'general';
  // ✅ 쇼핑커넥트 모드일 때 글형식 선택 UI에서 articleType 읽기
  if (isShoppingConnectModeActive()) {
    const scFormat = (document.getElementById('shopping-connect-review-format') as HTMLSelectElement)?.value;
    if (scFormat) articleType = scFormat;
  }

  const minChars = parseInt((document.getElementById('unified-min-chars') as HTMLInputElement)?.value) || 2000;

  const keywordInputEl = document.getElementById('unified-keywords') as HTMLInputElement;
  // ✅ [2026-03-15 FIX] keywordsOverride가 URL이면 무시 (제목/이미지에 URL 각인 방지)
  const rawKeywordsOverride = (keywordsOverride ?? '');
  const safeKeywordsOverride = /^https?:\/\//i.test(rawKeywordsOverride) ? '' : rawKeywordsOverride;
  const keywords = (safeKeywordsOverride || keywordInputEl?.value)?.trim() || '';
  if (keywordInputEl && safeKeywordsOverride) {
    keywordInputEl.value = safeKeywordsOverride;
  }
  const keywordList = keywords ? keywords.split(',').map(k => k.trim()).filter(k => k.length > 0) : [];

  // ✅ [2026-04-20 SPEC-HOMEFEED-100 W2] 사용자 후킹 1문장 (선택). 40자 이내.
  const hookInputEl = document.getElementById('unified-hook-sentence') as HTMLInputElement | null;
  const hookHint = (hookInputEl?.value || '').trim().slice(0, 40) || undefined;

  // ✅ 리뷰형/정보형 선택 확인
  const selectedContentType = (window as any).selectedContentType || 'info';
  const isReviewType = selectedContentType === 'review';

  // ✅ articleType을 categoryHint로 매핑 (2축 분리 구조 연동)
  const categoryHintMap: Record<string, string> = {
    'entertainment': '연예',
    'sports': '스포츠',
    'health': '건강',
    'it_review': 'IT',
    'finance': '경제',
    'shopping_review': '쇼핑',
    'shopping_expert_review': '쇼핑',
    'travel': '여행',
    'food': '음식',
    'parenting': '육아',
    'lifestyle': '라이프',
    'tips': '생활',
    'general': 'general'
  };
  const categoryHint = categoryHintMap[articleType] || '';

  // ✅ 리뷰형이면 로그 출력
  if (isReviewType) {
    appendLog('📦 리뷰형 글 생성 모드 - 구매전환 유도 글 작성');
  }

  const payload = {
    assembly: {
      generator: generator as 'gemini' | 'openai' | 'claude' | 'perplexity',
      rssUrl: url,
      keywords: keywordList,
      targetAge: targetAge as '20s' | '30s' | '40s' | '50s' | 'all',
      minChars,
      articleType,
      toneStyle,
      contentMode: contentMode as 'seo' | 'homefeed' | 'affiliate', // ✅ [FIX] 쇼핑커넥트(affiliate) 모드 타입 추가
      categoryHint, // ✅ 카테고리 힌트 전달 (2축 분리 프롬프트)
      isReviewType, // ✅ 리뷰형 여부 전달
      // ✅ [2026-02-09 v2] 연속발행 시 이전 제목 히스토리 전달 (중복 방지)
      previousTitles: ((window as any)._previousTitles as string[]) || undefined,
      businessInfo: collectBusinessInfo(contentMode), // ✅ [v1.4.24]
      hookHint, // ✅ [2026-04-20 SPEC-HOMEFEED-100 W2] 사용자 후킹 1문장 (선택)
    }
  };

  try {
    const apiClient = EnhancedApiClient.getInstance();

    // ✅ 진행률 업데이트 - 크롤링 중
    showUnifiedProgress(15, '📡 URL 크롤링 중...', 'URL에서 콘텐츠를 가져오고 있습니다');
    appendLog('📡 URL 크롤링 중...');

    // ✅ 진행률 업데이트 - AI 생성 중
    showUnifiedProgress(30, '🤖 AI 글 생성 중...', `${generator} 엔진으로 콘텐츠 생성 중`);
    appendLog(`🤖 ${generator} 엔진으로 AI 글 생성 중... (${minChars}자 목표)`);
    if (activeModal.addLog) activeModal.addLog(`🤖 ${generator} 엔진으로 콘텐츠 생성 중...`);

    const apiResponse = await apiClient.call(
      'generateStructuredContent',
      [payload],
      {
        retryCount: 2,
        retryDelay: 3000,
        timeout: 900000 // ✅ 15분 타임아웃 (Main 모델 폴백 체인 최대 12분 + 여유)
      }
    );

    if (apiResponse?.success && isPaywallPayload(apiResponse.data)) {
      activatePaywall(apiResponse.data);
      return;
    }

    if (!apiResponse.success || !apiResponse.data?.success) {
      const errorMsg = apiResponse.data?.message || apiResponse.error || '콘텐츠 생성 실패';
      console.error('[GenerateContent] ❌ 생성 실패:', errorMsg);
      throw new Error(errorMsg);
    }

    // ✅ 진행률 업데이트 - 응답 처리
    showUnifiedProgress(70, '📝 응답 처리 중...', `${generator} 엔진 응답을 분석하고 있습니다`);

    const result = apiResponse.data;
    const structuredContent = result.content;

    // ✅ [2026-03-07 FIX] 스크래핑된 콘텐츠에서 원본 블로거 메타데이터 제거
    sanitizeScrapedContent(structuredContent);

    try {
      const seed = getReviewHeadingSeed('', keywords, structuredContent);
      applyReviewHeadingPrefix(structuredContent, seed);
    } catch {
    }

    // ✅ [2026-03-15 FIX] coreKeyword가 URL이면 빈 문자열로 처리
    const _rawCoreKeyword = (keywords || '').split(',').map((k) => k.trim()).filter(Boolean)[0] || '';
    const coreKeyword = /^https?:\/\//i.test(_rawCoreKeyword) ? '' : _rawCoreKeyword;
    if (coreKeyword) {
      // ✅ [2026-02-08 FIX] 강화된 중복 방지: 키워드의 모든 토큰이 이미 제목에 포함되어 있으면 건너뜀
      const currentTitle = String(structuredContent.selectedTitle || structuredContent.title || '');
      // ✅ [2026-03-10 FIX] currentTitle이 URL이면 키워드 접두사 적용 건너뛰
      if (/^https?:\/\//i.test(currentTitle.trim())) {
        console.warn(`[GenerateContent] ⚠️ currentTitle이 URL이므로 키워드 접두사 건너뛰: "${currentTitle.substring(0, 60)}"`);
      } else {
        const keywordTokens = coreKeyword.split(/\s+/).filter((t: string) => t.length >= 2);
        const titleLower = currentTitle.toLowerCase();
        const allTokensPresent = keywordTokens.length > 0 && keywordTokens.every((t: string) => titleLower.includes(t.toLowerCase()));

        if (!allTokensPresent) {
          structuredContent.selectedTitle = applyKeywordPrefixToTitleContinuous(currentTitle, coreKeyword);
          console.log('[GenerateContent] 키워드 접두사 적용:', { coreKeyword, result: structuredContent.selectedTitle });
        } else {
          structuredContent.selectedTitle = currentTitle;
          console.log('[GenerateContent] 키워드 토큰 모두 포함됨, 건너뜀:', { coreKeyword, title: currentTitle });
        }
      } // ✅ [2026-03-10] URL 방어 블록 닫는 괄호
      // titleAlternatives와 titleCandidates는 중복 체크 없이 그대로 유지 (contentGenerator.ts에서 이미 처리됨)
    }

    // ✅ [2026-02-08] 쇼핑커넥트 모드: 글 생성 시에도 SEO 100점 제목 적용
    // (풀오토뿐 아니라 일반 글 생성 버튼에서도 자동완성 키워드 3개 이상 조합)
    if (isShoppingConnectModeActive() && structuredContent) {
      // ✅ [2026-03-10 FIX] title이 URL이면 productName으로 사용하지 않음
      const _rawTitleForSeo = String(structuredContent.title || structuredContent.selectedTitle || '').trim();
      const _titleIsSeoUrl = /^https?:\/\//i.test(_rawTitleForSeo);
      const productName = _titleIsSeoUrl ? '' : _rawTitleForSeo;
      if (productName && productName.length >= 3) {
        try {
          appendLog(`📝 SEO 100점 제목 생성 중... (자동완성 키워드 3개 이상)`);
          const seoResult = await (window as any).api.generateSeoTitle(productName);
          if (seoResult?.success && seoResult.title && seoResult.title !== productName) {
            const originalTitle = structuredContent.selectedTitle || '';
            structuredContent.selectedTitle = seoResult.title;
            // ✅ UI 필드도 동시 업데이트
            try {
              const titleInput1 = document.getElementById('unified-generated-title') as HTMLInputElement;
              if (titleInput1) titleInput1.value = seoResult.title;
              const titleInput2 = document.getElementById('unified-title') as HTMLInputElement;
              if (titleInput2) titleInput2.value = seoResult.title;
            } catch { }
            appendLog(`✅ SEO 제목: "${originalTitle}" → "${seoResult.title}"`);
          }
        } catch (seoErr) {
          console.warn('[GenerateContent] SEO 제목 생성 실패:', seoErr);
        }
      }
    }

    // ✅ 진행률 업데이트 - 필드 채움
    showUnifiedProgress(80, '✏️ 필드 자동 입력 중...', '제목, 본문, 해시태그 입력');

    // ✅ [2026-01-20 버그수정] 생성된 콘텐츠를 전역 상태에 저장 (필수!)
    // 이 저장이 누락되면 풀오토 발행에서 콘텐츠를 찾을 수 없어 실패함
    currentStructuredContent = structuredContent;
    (window as any).currentStructuredContent = structuredContent;
    console.log('[GenerateContent] currentStructuredContent 저장 완료:', structuredContent?.selectedTitle);

    // 미리보기 업데이트 (소제목 없이)
    updateUnifiedPreview(structuredContent);

    // 필드 자동 채움
    fillSemiAutoFields(structuredContent);

    // ✅ CTA 자동 생성
    showUnifiedProgress(85, '🔗 CTA 자동 생성 중...', '관련 링크 생성');
    autoGenerateCTA(structuredContent);

    // ✅ 진행률 업데이트 - 소제목 분석
    showUnifiedProgress(90, '🔍 소제목 분석 중...', '이미지 배치 준비');
    appendLog('🎨 글 생성 완료! 소제목 분석을 자동으로 시작합니다...');

    // 소제목이 있으면 자동으로 분석 실행
    if (structuredContent && structuredContent.headings && structuredContent.headings.length > 0) {
      try {
        appendLog('🔍 소제목 분석 자동 실행 중...');
        await autoAnalyzeHeadings(structuredContent);
        appendLog('✅ 소제목 분석 완료! 이미지 생성이 준비되었습니다.');
      } catch (error) {
        appendLog(`⚠️ 소제목 자동 분석 실패: ${(error as Error).message}`);
      }

      // ✅ [2026-02-12] 소제목별 이미지 자동 수집 (체크박스 ON일 때만, 네이버 → 구글 폴백)
      // ✅ [v2.7.77] 풀오토/연속/다계정에서 force 옵션 주입 (window._publishForceOptions)
      // ✅ [v2.7.97] DOM 폴백 제거 — 글생성 URL이 옵트인으로 오인되던 회귀 차단
      try {
        const _rawMainKw = keywords || structuredContent?.selectedTitle || '';
        const mainKw = /^https?:\/\//i.test(_rawMainKw) ? (structuredContent?.selectedTitle || '') : _rawMainKw;
        const forceOpts = (window as any)._publishForceOptions;
        await autoSearchAndPopulateImages(structuredContent, mainKw, suppressModal, forceOpts);
      } catch (imgErr) {
        console.warn('[GenerateContentUrl] 이미지 자동 수집 실패 (무시):', imgErr);
      }
    } else {
      appendLog('⚠️ 소제목이 없어 자동 분석을 건너뜁니다.');
    }

    // ✅ 완료!
    showUnifiedProgress(100, '✅ 글 생성 완료!', `${structuredContent.bodyPlain?.length || 0}자 생성됨`);
    appendLog('✅ URL 기반 콘텐츠 생성 완료');

    // ✅ AI 글생성 진행률 모달 완료 표시
    if (!suppressModal && aiProgressModal.update) {
      aiProgressModal.update(100, '✅ 글 생성 완료!');
    }
    if (activeModal.addLog) activeModal.addLog(`✅ 콘텐츠 생성 완료 (${structuredContent.bodyPlain?.length || 0}자)`);

    // 개별 모달인 경우에만 닫기 (풀오토 모달은 유지해야 함)
    if (!suppressModal && aiProgressModal.hide) {
      setTimeout(() => aiProgressModal.hide(), 1500); // 1.5초 후 모달 자동 닫기
    }

    // ✅ 위험 지표 업데이트 (AI탐지, 법적위험, SEO점수)
    updateRiskIndicators(structuredContent);

    toastManager.success('✅ AI 글 생성이 완료되었습니다!');

    // ✅ 발행 모드 상태 업데이트 (syncPublishMode에서 관리됨 — markContentGenerated가 처리)
  } catch (error) {
    // ✅ [v1.4.33] 에러 메시지가 잘리지 않고 표시되도록 + 풀 에러 직렬화로 콘솔 출력
    const errMsg = (error as Error).message || String(error);
    appendLog(`❌ URL 기반 콘텐츠 생성 실패: ${errMsg}`);
    // 에러 로그는 항상 기록
    if (activeModal.addLog) activeModal.addLog(`❌ 오류: ${errMsg}`);
    // ✅ [v1.4.33] 디버그용 풀 에러 직렬화 (사장님이 콘솔 캡처만 받아도 진단 가능)
    try {
      console.error('[GenerateContent] 풀 에러 직렬화:',
        JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2));
    } catch { /* 직렬화 실패는 무시 */ }

    // ✅ [2026-03-22 FIX] 에러 표시 후 3초 뒤 통합 진행률 모달 자동 숨김 (재시도 가능하도록)
    setTimeout(() => {
      try { hideUnifiedProgress(); } catch (e) { /* ignore */ }
    }, 3000);

    // 개별 모달인 경우에만 닫기
    if (!suppressModal && aiProgressModal.hide) {
      aiProgressModal.hide();
    }
    throw error;
  }
}

// 키워드,제목으로 AI 글 생성하기
export async function normalizeKeywordsForGeneration(title: string, rawKeywords: string): Promise<{ primaryKeyword: string; keywordList: string[]; changed: boolean; reason: string }> {
  const raw = String(rawKeywords || '').trim();
  const normalized = raw
    .replace(/[\n\r]+/g, ',')
    .replace(/[|｜;]+/g, ',')
    .replace(/[#]+/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/,\s+/g, ',');

  const candidates = normalized
    .split(',')
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  const dedupe = (arr: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of arr) {
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  };

  const heuristicPrimary = (): string => {
    const first = String(candidates[0] || raw || title || '').trim();
    if (!first) return '';
    const words = first.split(/\s+/).filter(Boolean);
    let v = words.length > 10 ? words.slice(0, 10).join(' ') : first;
    if (v.length > 50) v = v.slice(0, 50).trim();
    return v;
  };

  const needsAutoPick = (() => {
    if (!raw) return false;
    if (candidates.length >= 3) return true;
    if (raw.length >= 60) return true;
    if ((raw.match(/,/g) || []).length >= 1 && raw.split(',').some((p) => String(p).trim().length > 25)) return true;
    return false;
  })();

  if (!needsAutoPick || typeof (window.api as any)?.generateContent !== 'function') {
    const primary = heuristicPrimary();
    const list = dedupe([primary, ...candidates.slice(1, 6)].filter(Boolean));
    return { primaryKeyword: primary, keywordList: list, changed: false, reason: primary ? 'heuristic' : 'empty' };
  }

  try {
    const prompt = `You are a Korean SEO blog editor.

[Input]
Title (optional): ${String(title || '').trim()}
Raw keywords (may contain multiple unrelated topics): ${raw}

[Task]
1) Choose ONLY ONE main topic keyword phrase that best represents what the user likely wants.
2) Provide 3-6 supporting keywords that are tightly related to that ONE main topic.
3) Do NOT mix unrelated topics.

[Output]
Return ONLY valid JSON like:
{"primary":"...","keywords":["...","..."]}`;

    const res = await (window.api as any).generateContent(prompt);
    const text = String(res?.content || '').trim();
    if (!res?.success || !text) {
      throw new Error('keyword_normalize_failed');
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonText);
    const primaryRaw = String(parsed?.primary || '').trim();
    const listRaw = Array.isArray(parsed?.keywords) ? parsed.keywords.map((x: any) => String(x || '').trim()).filter(Boolean) : [];
    const primary = primaryRaw || heuristicPrimary();
    const list = dedupe([primary, ...listRaw].filter(Boolean)).slice(0, 6);
    return { primaryKeyword: primary, keywordList: list, changed: true, reason: 'ai_select' };
  } catch {
    const primary = heuristicPrimary();
    const list = dedupe([primary, ...candidates.slice(1, 6)].filter(Boolean));
    return { primaryKeyword: primary, keywordList: list, changed: true, reason: 'fallback' };
  }
}

export async function generateContentFromKeywords(
  title: string,
  keywords: string,
  toneOverride?: string,
  suppressModal?: boolean,
  contentModeOverride?: string,
  articleTypeOverride?: string
): Promise<void> {
  // ✅ 기존 콘텐츠 및 이미지 완전 초기화 (이전 글 데이터 충돌 방지)
  appendLog('🔄 기존 콘텐츠를 초기화하고 새로운 콘텐츠를 생성합니다...');
  currentStructuredContent = null;
  (window as any).currentStructuredContent = null;
  generatedImages = [];
  (window as any).generatedImages = []; // ✅ [2026-01-21] 연속 발행용 이미지 변수도 초기화
  (window as any).imageManagementGeneratedImages = [];
  ImageManager.clear(); // ✅ ImageManager 초기화 (이전 글의 이미지 매핑 제거)
  currentPostId = null; // ✅ 새 글이므로 postId 초기화

  // ✅ 활성 모달 결정 (suppressModal이면 메인 진행 모달 사용, 아니면 개별 모달)
  const activeModal: any = suppressModal ? getProgressModal() : aiProgressModal;

  // ✅ AI 글생성 진행률 모달 표시 (suppressModal이 아닐 때만)
  if (!suppressModal) {
    const contentGenSteps = [
      { percent: 10, step: '📝 키워드 분석 중...' },
      { percent: 25, step: '🔍 경쟁 블로그 분석 중...' },
      { percent: 45, step: '✍️ AI 글 작성 중...' },
      { percent: 70, step: '📄 콘텐츠 구조화 중...' },
      { percent: 85, step: '🔗 내부링크 삽입 중...' },
      { percent: 95, step: '✨ 글 마무리 중...' },
    ];

    aiProgressModal.show('✏️ AI 글 생성 중...', {
      autoAnimate: true,
      icon: '📝',
      initialLog: `키워드: ${keywords.substring(0, 30)}...`,
      steps: contentGenSteps
    });
    // 진행률 표시 시작 (단일 생성 모드일 때만)
    showUnifiedProgress(0, '✏️ 키워드 기반 글 생성 시작...', `제목: ${title?.substring(0, 30) || '자동 생성'}...`);
  }
  appendLog('✏️ 키워드 기반 AI 글 생성 시작...');

  const generator = UnifiedDOMCache.getGenerator();
  const targetAge = 'all'; // 고정

  // ✅ Override 우선 사용
  const toneStyle = toneOverride || (window as any)._toneOverride || UnifiedDOMCache.getToneStyle();
  const contentMode = contentModeOverride || (document.getElementById('unified-content-mode') as HTMLInputElement)?.value || 'seo';
  let articleType = articleTypeOverride || (document.getElementById('unified-article-type') as HTMLSelectElement)?.value || 'general';
  // ✅ 쇼핑커넥트 모드일 때 글형식 선택 UI에서 articleType 읽기
  if (isShoppingConnectModeActive()) {
    const scFormat = (document.getElementById('shopping-connect-review-format') as HTMLSelectElement)?.value;
    if (scFormat) articleType = scFormat;
  }

  const minChars = parseInt((document.getElementById('unified-min-chars') as HTMLInputElement)?.value) || 2000;

  // ✅ [2026-03-10 CLEANUP] full-auto-realtime-crawl, semi-auto-realtime-crawl → unified-realtime-crawl 단일 참조
  const realtimeCrawlCheckbox = document.getElementById('unified-realtime-crawl') as HTMLInputElement;
  const useRealtimeCrawl = realtimeCrawlCheckbox?.checked ?? true; // 기본값: 켜짐

  // ✅ 발행 날짜 가져오기 (예약 발행인 경우)
  const publishMode = (document.getElementById('unified-publish-mode') as HTMLInputElement)?.value || 'publish'; // ✅ [2026-03-10 FIX] 기본값을 즉시발행으로 변경
  const scheduleDateInput = document.getElementById('unified-schedule-date') as HTMLInputElement;
  const scheduleDate = publishMode === 'schedule' && scheduleDateInput?.value ? scheduleDateInput.value : undefined;

  let crawledText = ''; // 크롤링된 텍스트

  const normalizedKeywords = await normalizeKeywordsForGeneration(title, keywords);
  if (normalizedKeywords.primaryKeyword) {
    appendLog(`🔎 주제 고정 키워드: ${normalizedKeywords.primaryKeyword}${normalizedKeywords.changed ? ` (자동정제: ${normalizedKeywords.reason})` : ''}`);
  }

  // ✅ 실시간 정보 수집 (체크박스가 켜져 있을 때) - URL 기반과 동등한 품질 보장
  // ✅ 주제 일탈 방지를 위해 대표 키워드(1개)로만 검색
  const searchQuery = normalizedKeywords.primaryKeyword || title;

  // ✅ [2026-03-05 FIX] 크롤링 타임아웃 래퍼 — 무한 대기 방지
  const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`[${label}] ${ms / 1000}초 타임아웃 초과`)), ms))
    ]);
  };

  if (useRealtimeCrawl && searchQuery) {
    try {
      showUnifiedProgress(5, '🌐 실시간 정보 수집 중...', '네이버 뉴스, 블로그, 카페, 구글 뉴스에서 최신 정보 검색');
      appendLog('🌐 실시간 정보 수집 시작 - URL 기반과 동등한 품질 보장을 위해 다양한 소스 검색 중...');

      // ✅ 더 많은 소스에서 수집하여 URL 기반과 동등한 품질 보장
      // ✅ 항상 오늘 날짜 기준으로 크롤링 (최신 정보만 수집)
      const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
      const targetCrawlDate = scheduleDate || todayDate; // 예약 발행 날짜가 있으면 그걸 사용, 없으면 오늘
      const crawlOptions: any = { maxPerSource: 10, targetDate: targetCrawlDate };
      appendLog(`📅 ${scheduleDate ? '발행 날짜' : '오늘 날짜'} 기준 크롤링: ${targetCrawlDate} (최근 30일 이내 자료만 수집)`);
      const crawlResult = await withTimeout(window.api.collectContentFromPlatforms(searchQuery, crawlOptions), 30000, '실시간 크롤링');

      if (crawlResult.success && crawlResult.collectedText) {
        crawledText = crawlResult.collectedText;
        const charCount = crawledText.length;
        appendLog(`✅ 실시간 정보 수집 완료: ${crawlResult.sourceCount}개 소스에서 ${charCount.toLocaleString()}자 수집`);
        showUnifiedProgress(15, '✅ 실시간 정보 수집 완료', `${crawlResult.sourceCount}개 소스에서 ${charCount.toLocaleString()}자 수집됨`);

        // ✅ 수집량이 충분한지 확인 (URL 기반과 동등한 품질을 위해 최소 2000자 권장)
        if (charCount < 2000) {
          appendLog(`⚠️ 수집된 정보가 적습니다 (${charCount}자). 추가 검색을 시도합니다...`);
          // 제목으로도 추가 검색 시도
          if (title) {
            try {
              const additionalResult = await withTimeout(window.api.collectContentFromPlatforms(title, { maxPerSource: 5 }), 20000, '추가 크롤링');
              if (additionalResult.success && additionalResult.collectedText) {
                crawledText += '\n\n[추가 수집 정보]\n' + additionalResult.collectedText;
                appendLog(`✅ 추가 정보 수집: ${additionalResult.sourceCount}개 소스에서 ${additionalResult.collectedText.length}자 추가`);
              }
            } catch (e) {
              console.warn('[Crawl] 추가 수집 실패:', e);
            }
          }
        }
      } else {
        appendLog(`⚠️ 실시간 정보 수집 실패: ${crawlResult.message || '관련 글을 찾을 수 없음'}`);
        // ✅ 폴백: 제목으로 다시 시도
        if (title) {
          appendLog('🔄 제목으로 재시도 중...');
          try {
            const fallbackResult = await withTimeout(window.api.collectContentFromPlatforms(title, { maxPerSource: 8 }), 25000, '폴백 크롤링');
            if (fallbackResult.success && fallbackResult.collectedText) {
              crawledText = fallbackResult.collectedText;
              appendLog(`✅ 제목 기반 수집 성공: ${fallbackResult.sourceCount}개 소스에서 ${crawledText.length}자 수집`);
            } else {
              // ✅ 같은 키워드로 재시도 (관련 없는 결과 방지 - 다른 키워드 사용 금지!)
              appendLog('🔄 [재시도] 같은 키워드로 다시 검색합니다 (소스 수 증가)...');
              try {
                const retryResult = await withTimeout(window.api.collectContentFromPlatforms(searchQuery, { maxPerSource: 15 }), 25000, '재시도 크롤링');
                if (retryResult.success && retryResult.collectedText && retryResult.collectedText.length >= 300) {
                  crawledText = retryResult.collectedText;
                  appendLog(`✅ 재시도 성공: ${retryResult.sourceCount}개 소스에서 ${crawledText.length}자 수집`);
                } else {
                  appendLog('⚠️ 재시도도 실패 - 수집된 정보가 부족합니다.');
                  toastManager.warning('⚠️ 실시간 정보 수집 결과가 부족합니다. 정확도가 낮을 수 있습니다.', 5000);
                  // 부족해도 있는 정보로 계속 진행
                  if (retryResult.collectedText) {
                    crawledText = retryResult.collectedText;
                  }
                }
              } catch (retryError) {
                console.warn('[Crawl] 재시도 실패:', retryError);
                appendLog('⚠️ 재시도 중 오류 - 가능한 정보로 계속합니다.');
              }
            }
          } catch (fallbackError) {
            console.warn('[Crawl] 폴백 시도 실패:', fallbackError);
            appendLog('⚠️ 정보 수집 중 오류 발생 - 가능한 정보로 계속합니다.');
          }
        } else {
          // 제목도 없는 경우 - 경고만 표시하고 계속
          appendLog('⚠️ 검색 키워드 부족 - 가능한 정보로 글을 생성합니다.');
          toastManager.warning('⚠️ 실시간 정보가 부족할 수 있습니다.', 3000);
        }
      }
    } catch (crawlError) {
      console.warn('[Crawl] 실시간 정보 수집 오류:', crawlError);
      appendLog('⚠️ 정보 수집 중 오류 발생 - 가능한 정보로 계속합니다.');
      toastManager.warning('⚠️ 일부 정보 수집 실패, 가능한 정보로 계속합니다.', 3000);
    }
  }

  // ✅ 환각 방지 경고 (중단하지 않고 경고만)
  // ✅ [2026-02-04] 방어 코드 추가: crawledText가 undefined인 경우 처리
  const crawledTextLength = crawledText?.length || 0;
  if (useRealtimeCrawl && crawledTextLength < 300) {
    appendLog(`⚠️ [경고] 수집된 정보가 적음 (${crawledTextLength}자) - 정확도가 낮을 수 있습니다.`);
    toastManager.warning(`⚠️ 수집된 정보가 적습니다 (${crawledTextLength}자). 정확도가 낮을 수 있습니다.`, 5000);
  }

  // ✅ URL 기반과 동등한 품질을 위한 payload 구성
  // ✅ [2026-02-04] 방어 코드 추가: keywordList가 undefined인 경우 빈 배열로 처리
  const keywordList = normalizedKeywords?.keywordList || [];

  const referenceDate = (() => {
    const raw = scheduleDate || '';
    if (raw) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  })();

  // ✅ [2026-01-21 FIX] 연도를 동적으로 계산하여 AI가 올바른 연도 사용
  const currentYear = new Date().getFullYear(); // 2026
  const lastYear = currentYear - 1; // 2025
  const twoYearsAgo = currentYear - 2; // 2024

  const recencyDirective = `[최신성 규칙]
- 기준일: ${referenceDate} (현재 ${currentYear}년)
- 작성 내용은 기준일 기준 최신 정보(최근 동향/최근 발표/최근 이슈)를 우선 반영하세요.
- 연말정산/종합소득세 등 세금 관련 내용은 ${lastYear}년 귀속 기준으로 작성하세요. (${currentYear}년 초에 신고하는 것은 ${lastYear}년 소득에 대한 것입니다)
- ${twoYearsAgo}년/${twoYearsAgo - 1}년 등 과거 연도를 언급해야 한다면 반드시 맥락(최근 업데이트/비교/통계 출처 등)을 함께 제시하세요.
- '최근' 또는 '올해'라고 할 때는 ${currentYear}년을 의미합니다.
- 확실하지 않은 과거 수치/사실은 단정하지 말고 일반적인 설명으로 처리하세요.
`;

  // ✅ articleType을 categoryHint로 매핑 (2축 분리 구조 연동)
  const categoryHintMap: Record<string, string> = {
    'entertainment': '연예',
    'sports': '스포츠',
    'health': '건강',
    'it_review': 'IT',
    'finance': '경제',
    'shopping_review': '쇼핑',
    'shopping_expert_review': '쇼핑',
    'travel': '여행',
    'food': '음식',
    'parenting': '육아',
    'lifestyle': '라이프',
    'tips': '생활',
    'general': ''
  };
  const categoryHint = categoryHintMap[articleType] || '';

  // ✅ 리뷰형/정보형 선택 확인 (키워드 생성에서도 반영)
  const selectedContentType = (window as any).selectedContentType || 'info';
  const isReviewType = selectedContentType === 'review';
  if (isReviewType) {
    appendLog('📦 리뷰형 글 생성 모드 - 구매 전 제품 분석 가이드 작성');
  }

  const payload = {
    assembly: {
      generator: generator as 'gemini' | 'openai' | 'claude' | 'perplexity',
      keywords: keywordList,
      targetAge: targetAge as '20s' | '30s' | '40s' | '50s' | 'all',
      minChars,
      articleType,
      toneStyle,
      contentMode: contentMode as 'seo' | 'homefeed' | 'affiliate', // ✅ [FIX] 쇼핑커넥트(affiliate) 모드 타입 추가
      categoryHint, // ✅ 카테고리 힌트 전달 (2축 분리 프롬프트)
      isReviewType, // ✅ [FIX] 리뷰형 여부 전달 (키워드 생성에서도 반영)
      title: title || undefined,
      // ✅ 크롤링된 텍스트가 있으면 baseText로 전달 (할루시네이션 방지)
      // URL 기반처럼 실제 정보를 기반으로 생성하여 품질 향상
      baseText: crawledText || undefined,
      // ✅ 더 많은 컨텍스트 전달 (최대 10000자)
      draftText: crawledText
        ? `${recencyDirective}\n[주제 고정 규칙]\n- 이 글의 주제는 반드시 "${normalizedKeywords.primaryKeyword || (title || '').trim()}" 하나로만 유지하세요.\n- 키워드 입력에 다른 이슈/사건/인물/회사명이 섞여 있어도 절대 다른 주제로 넘어가지 마세요.\n- 실시간 수집 정보도 위 주제와 직접 관련된 내용만 사용하세요.\n\n[실시간 수집된 최신 정보 - 아래 내용을 반드시 참고하여 정확한 글 작성]\n\n${crawledText.substring(0, 10000)}`
        : `${recencyDirective}\n[주제 고정 규칙]\n- 이 글의 주제는 반드시 "${normalizedKeywords.primaryKeyword || (title || '').trim()}" 하나로만 유지하세요.\n- 키워드 입력에 다른 이슈/사건/인물/회사명이 섞여 있어도 절대 다른 주제로 넘어가지 마세요.\n`,
      // ✅ 실시간 정보가 있으면 더 정확한 글 생성 지시
      useRealTimeInfo: !!crawledText,
      sourceInfo: crawledText ? `"${searchQuery}"에 대한 실시간 수집 정보 기반` : undefined,
      customPrompt: (document.getElementById('unified-custom-prompt') as HTMLTextAreaElement)?.value?.trim() || undefined,
      // ✅ [2026-02-09 v2] 연속발행 시 이전 제목 히스토리 전달 (제목 다양성 확보)
      previousTitles: ((window as any)._previousTitles as string[]) || undefined,
      // ✅ [2026-02-24] 키워드를 제목으로 그대로 사용 옵션 전달 (메인 프로세스에서 제목 조작 건너뛰기)
      useKeywordAsTitle: (window as any)._keywordTitleOptions?.useKeywordAsTitle || false,
      keywordForTitle: (window as any)._keywordTitleOptions?.keyword || undefined,
      businessInfo: collectBusinessInfo(contentMode), // ✅ [v1.4.24]
    }
  };

  try {
    const apiClient = EnhancedApiClient.getInstance();

    // ✅ 진행률 업데이트 - AI 생성 준비
    showUnifiedProgress(20, '📝 키워드 분석 중...', keywords?.substring(0, 50) || '키워드 없음');
    appendLog(`📝 키워드 분석: ${keywords || '(없음)'}`);

    // ✅ 진행률 업데이트 - AI 생성 중
    const crawlStatus = crawledText ? ' (실시간 정보 기반)' : '';
    showUnifiedProgress(35, '🤖 AI 글 생성 중...', `${generator} 엔진으로 콘텐츠 생성 중${crawlStatus}`);
    appendLog(`🤖 ${generator} 엔진으로 AI 글 생성 중... (${minChars}자 목표)${crawlStatus}`);

    const apiResponse = await apiClient.call(
      'generateStructuredContent',
      [payload],
      {
        retryCount: 2,
        retryDelay: 3000,
        timeout: 900000 // ✅ 15분 타임아웃 (Main 모델 폴백 체인 최대 12분 + 여유)
      }
    );

    if (apiResponse?.success && isPaywallPayload(apiResponse.data)) {
      activatePaywall(apiResponse.data);
      return;
    }

    // ✅ 진행률 업데이트 - 응답 처리
    showUnifiedProgress(70, '📝 응답 처리 중...', '생성된 콘텐츠를 분석하고 있습니다');

    if (!apiResponse.success || !apiResponse.data?.success) {
      throw new Error(apiResponse.data?.message || apiResponse.error || '콘텐츠 생성 실패');
    }

    const result = apiResponse.data;
    const structuredContent = result.content;

    // ✅ [2026-02-13] 키워드 제목 옵션 후처리 (AI 생성된 제목을 사용자 설정에 맞게 조정)
    const keywordTitleOpts = (window as any)._keywordTitleOptions;
    if (keywordTitleOpts && structuredContent) {
      if (keywordTitleOpts.useKeywordAsTitle) {
        // 📌 키워드를 그대로 제목으로 사용
        const originalTitle = structuredContent.selectedTitle;
        structuredContent.selectedTitle = keywordTitleOpts.keyword;
        appendLog(`📌 제목 교체: "${originalTitle}" → "${structuredContent.selectedTitle}"`);
      } else if (keywordTitleOpts.useKeywordTitlePrefix) {
        // 🔝 키워드를 제목 맨 앞에 배치
        const keyword = String(keywordTitleOpts.keyword || '').trim();
        const currentTitle = String(structuredContent.selectedTitle || '').trim();

        if (keyword && currentTitle) {
          // 이미 키워드로 시작하면 건너뜀
          if (currentTitle.startsWith(keyword)) {
            appendLog(`🔝 키워드 앞배치: 이미 키워드로 시작 — 건너뜀`);
          } else {
            // ✅ [2026-03-14] 강화된 키워드 중복 제거 (따옴표/어순 변형/겹치는 접미사 대응)
            const cleaned = cleanKeywordFromTitle(keyword, currentTitle);

            // 4단계: 키워드 + 정리된 제목 조합
            if (cleaned) {
              structuredContent.selectedTitle = `${keyword} ${cleaned}`;
            } else {
              structuredContent.selectedTitle = keyword;
            }
            appendLog(`🔝 키워드 앞배치: "${currentTitle}" → "${structuredContent.selectedTitle}"`);
          }
        }
      }
      // 옵션 사용 후 정리
      (window as any)._keywordTitleOptions = null;
    }

    try {
      const seed = getReviewHeadingSeed(title, keywords, structuredContent);
      applyReviewHeadingPrefix(structuredContent, seed);
    } catch {
    }

    // ✅ 진행률 업데이트 - 필드 채움
    showUnifiedProgress(80, '✏️ 필드 자동 입력 중...', '제목, 본문, 해시태그 입력');

    // ✅ [2026-01-20 버그수정] 생성된 콘텐츠를 전역 상태에 저장 (필수!)
    // generateContentFromUrl과 동일한 버그였음 - 풀오토 키워드 발행 실패 원인
    currentStructuredContent = structuredContent;
    (window as any).currentStructuredContent = structuredContent;
    console.log('[GenerateContentKeywords] currentStructuredContent 저장 완료:', structuredContent?.selectedTitle);

    // 미리보기 업데이트 (소제목 없이)
    updateUnifiedPreview(structuredContent);

    // 필드 자동 채움
    fillSemiAutoFields(structuredContent);

    // ✅ CTA 자동 생성
    showUnifiedProgress(85, '🔗 CTA 자동 생성 중...', '관련 링크 생성');
    autoGenerateCTA(structuredContent);

    // ✅ 진행률 업데이트 - 소제목 분석
    showUnifiedProgress(90, '🔍 소제목 분석 중...', '이미지 배치 준비');
    appendLog('🎨 글 생성 완료! 소제목 분석을 자동으로 시작합니다...');

    // 소제목이 있으면 자동으로 분석 실행
    // ✅ [2026-02-04] 방어 코드 추가: headings가 undefined인 경우 처리
    const hasHeadings = structuredContent && Array.isArray(structuredContent.headings) && structuredContent.headings.length > 0;
    if (hasHeadings) {
      try {
        appendLog('🔍 소제목 분석 자동 실행 중...');
        await autoAnalyzeHeadings(structuredContent);
        appendLog('✅ 소제목 분석 완료! 이미지 생성이 준비되었습니다.');
      } catch (error) {
        appendLog(`⚠️ 소제목 자동 분석 실패: ${(error as Error).message}`);
      }

      // ✅ [2026-02-12] 소제목별 이미지 자동 수집 (체크박스 ON일 때만, 네이버 → 구글 폴백)
      // ✅ [v2.7.77] 풀오토/연속/다계정에서 force 옵션 주입
      // ✅ [v2.7.97] DOM 폴백 제거 — structuredContent.sourceUrl이 옵트인으로 오인되던 회귀 차단
      try {
        const mainKw = keywords || structuredContent?.selectedTitle || '';
        const forceOpts = (window as any)._publishForceOptions;
        await autoSearchAndPopulateImages(structuredContent, mainKw, suppressModal, forceOpts);
      } catch (imgErr) {
        console.warn('[GenerateContentKeywords] 이미지 자동 수집 실패 (무시):', imgErr);
      }
    } else {
      appendLog('⚠️ 소제목이 없어 자동 분석을 건너뜁니다.');
    }

    // ✅ 완료!
    showUnifiedProgress(100, '✅ 글 생성 완료!', `${structuredContent.bodyPlain?.length || 0}자 생성됨`);
    appendLog('✅ 키워드 기반 콘텐츠 생성 완료');

    // ✅ 위험 지표 업데이트 (AI탐지, 법적위험, SEO점수)
    updateRiskIndicators(structuredContent);

    // ✅ AI 글생성 진행률 모달 완료 표시
    if (!suppressModal && aiProgressModal.update) {
      aiProgressModal.update(100, '✅ 글 생성 완료!');
    }
    if (activeModal.addLog) activeModal.addLog(`✅ 콘텐츠 생성 완료 (${structuredContent.bodyPlain?.length || 0}자)`);

    // 개별 모달인 경우에만 닫기 (풀오토 모달은 유지해야 함)
    if (!suppressModal && aiProgressModal.hide) {
      setTimeout(() => aiProgressModal.hide(), 1500); // 1.5초 후 모달 자동 닫기
    }

    toastManager.success('✅ AI 글 생성이 완료되었습니다!');

    // ✅ 발행 모드 상태 업데이트 (syncPublishMode에서 관리됨 — markContentGenerated가 처리)
  } catch (error) {
    showUnifiedProgress(0, '❌ 오류 발생', (error as Error).message);
    appendLog(`❌ 키워드 기반 콘텐츠 생성 실패: ${(error as Error).message}`);
    // 에러 로그는 항상 기록
    if (activeModal.addLog) activeModal.addLog(`❌ 오류: ${(error as Error).message}`);

    // ✅ [2026-03-22 FIX] 에러 표시 후 3초 뒤 통합 진행률 모달 자동 숨김 (재시도 가능하도록)
    setTimeout(() => {
      try { hideUnifiedProgress(); } catch (e) { /* ignore */ }
    }, 3000);

    // ✅ [2026-03-22 FIX] 글 생성 실패 시 글 생성 상태만 리셋 (세분화 리셋)
    if (typeof (window as any).resetContentGeneration === 'function') {
      (window as any).resetContentGeneration();
    }

    // 개별 모달인 경우에만 닫기
    if (!suppressModal && aiProgressModal.hide) {
      aiProgressModal.hide();
    }
    throw error;
  }
}

// ✅ 풀오토 발행 버튼 비활성화 함수
export function disableFullAutoPublishButton(reason: string): void {
  const fullAutoBtn = document.getElementById('full-auto-publish-btn') as HTMLButtonElement;
  if (fullAutoBtn) {
    fullAutoBtn.disabled = true;
    fullAutoBtn.style.opacity = '0.5';
    fullAutoBtn.style.cursor = 'not-allowed';
    fullAutoBtn.title = reason;
    appendLog(`⚠️ ${reason}`);
  }
}

export function enableFullAutoPublishButton(): void {
  const fullAutoBtn = document.getElementById('full-auto-publish-btn') as HTMLButtonElement;
  if (!fullAutoBtn) return;
  fullAutoBtn.disabled = false;
  fullAutoBtn.style.opacity = '1';
  fullAutoBtn.style.cursor = 'pointer';
  fullAutoBtn.title = '';
}

export function enableSemiAutoPublishButton(): void {
  const semiAutoBtn = document.getElementById('semi-auto-publish-btn') as HTMLButtonElement;
  if (!semiAutoBtn) return;
  semiAutoBtn.disabled = false;
  semiAutoBtn.style.opacity = '1';
  semiAutoBtn.style.cursor = 'pointer';
  semiAutoBtn.title = '';
}

// ✅ CTA 자동 생성 함수 (내 블로그 이전 글만 연결 - 외부 사이트 연결 금지!)
export function autoGenerateCTA(structuredContent: any): void {
  const ctaTextInput = document.getElementById('unified-cta-text') as HTMLInputElement;
  const ctaLinkInput = document.getElementById('unified-cta-link') as HTMLInputElement;

  if (!ctaTextInput || !ctaLinkInput) {
    console.log('[CTA] CTA 입력 필드를 찾을 수 없습니다');
    return;
  }

  try {
    const autoCTA = generateAutoCTA(structuredContent?.selectedTitle || structuredContent?.title || '', '');
    if (autoCTA.ctaLink) {
      ctaTextInput.value = autoCTA.ctaText;
      ctaLinkInput.value = autoCTA.ctaLink;
      appendLog(`🔗 CTA 자동 생성: 내 블로그 이전 글 "${autoCTA.ctaText.replace(/^📖\s*/, '')}"`);
      return;
    }
  } catch (e) {
    console.warn('[CTA] CTA 자동 생성 실패:', e);
  }

  ctaTextInput.value = '';
  ctaLinkInput.value = '';
  appendLog(`ℹ️ 발행된 이전 글이 없어 CTA가 비어있습니다. 글 선택 버튼으로 연결할 글을 선택하세요.`);
}

// ✅ 불러오기/백업 복원 시 CTA 자동 채움
export function autoFillCTAFromContent(): void {
  const titleInput = document.getElementById('unified-title') as HTMLInputElement;
  const bodyInput = document.getElementById('unified-body') as HTMLTextAreaElement;

  if (!titleInput || !bodyInput) return;

  const structuredContent = {
    title: titleInput.value,
    bodyPlain: bodyInput.value
  };

  autoGenerateCTA(structuredContent);
}

// 반자동 모드 필드에 콘텐츠 채우기 (통합 및 강화됨)
export function fillSemiAutoFields(structuredContent: any): void {
  console.log('[fillSemiAutoFields] Called with:', JSON.stringify(structuredContent).substring(0, 100) + '...');

  // 반자동 모드 섹션 표시
  const semiAutoSection = document.getElementById('unified-semi-auto-section');
  if (semiAutoSection) {
    console.log('[fillSemiAutoFields] Showing unified-semi-auto-section');
    semiAutoSection.style.display = 'block';
    // 부드러운 애니메이션
    semiAutoSection.style.opacity = '0.5';
    setTimeout(() => {
      semiAutoSection.style.opacity = '1';
      semiAutoSection.style.transition = 'opacity 0.3s ease';
    }, 50);

    // 섹션으로 스크롤
    setTimeout(() => {
      semiAutoSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  } else {
    console.warn('[fillSemiAutoFields] unified-semi-auto-section NOT found in DOM!');
  }

  if (!structuredContent) {
    console.error('[fillSemiAutoFields] structuredContent is null or undefined!');
    return;
  }

  // 제목 필드 채움 (수정 가능)
  const titleInput = document.getElementById('unified-generated-title') as HTMLInputElement;
  if (titleInput) {
    let val = structuredContent.selectedTitle || structuredContent.title || '';
    // ✅ [2026-03-10 FIX] URL이 제목 필드에 표시되는 것을 방지
    if (/^https?:\/\//i.test(val.trim())) {
      console.warn(`[fillSemiAutoFields] ⚠️ 제목이 URL이므로 빈 문자열로 대체: "${val.substring(0, 60)}"`);
      val = '';
    }
    console.log('[fillSemiAutoFields] Updating title:', val);
    titleInput.value = val;
    titleInput.readOnly = false;
    appendLog(`📝 제목: "${val}"`);
  } else {
    console.error('[fillSemiAutoFields] unified-generated-title NOT found!');
  }

  // 본문 필드 채움 (수정 가능)
  const contentTextarea = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
  if (contentTextarea) {
    let body = structuredContent.bodyPlain || structuredContent.content || '';

    // ✅ [핵심 수정] 소제목이 있으면 항상 headings에서 본문 재구성
    // 미리보기(headings)와 편집 필드(bodyPlain)가 다른 내용일 수 있으므로 동기화
    if (structuredContent.headings && structuredContent.headings.length > 0) {
      console.log('[fillSemiAutoFields] ✅ headings에서 본문 재구성 (미리보기와 동기화)');
      const headings = structuredContent.headings;
      const structuredBlocks: string[] = [];

      // 도입부 있으면 추가
      if (structuredContent.introduction) {
        structuredBlocks.push(structuredContent.introduction);
      }

      // 소제목 + 본문 조합
      headings.forEach((h: any) => {
        if (h.title) {
          structuredBlocks.push(h.title);  // ### 없이 제목만
        }
        if (h.content) {
          structuredBlocks.push(h.content);
        } else if (h.summary) {
          structuredBlocks.push(h.summary);
        }
      });

      // 마무리 있으면 추가
      if (structuredContent.conclusion) {
        structuredBlocks.push(structuredContent.conclusion);
      }

      if (structuredBlocks.length > 0) {
        body = structuredBlocks.join('\n\n');
      }
    }

    const normalized = normalizeReadableBodyText(body);
    console.log('[fillSemiAutoFields] Updating content (length):', normalized.length);
    contentTextarea.value = normalized;
    contentTextarea.readOnly = false;
    appendLog(`📄 본문: ${normalized.length}자`);
  } else {
    console.error('[fillSemiAutoFields] unified-generated-content NOT found!');
  }

  // 해시태그 필드 채움 (수정 가능)
  const hashtagsInput = document.getElementById('unified-generated-hashtags') as HTMLInputElement;
  if (hashtagsInput && structuredContent.hashtags) {
    const hashtagsStr = Array.isArray(structuredContent.hashtags)
      ? structuredContent.hashtags.join(' ')
      : structuredContent.hashtags;
    console.log('[fillSemiAutoFields] Updating hashtags:', hashtagsStr);
    hashtagsInput.value = hashtagsStr;
    hashtagsInput.readOnly = false;
    appendLog(`🏷️ 해시태그: ${hashtagsStr}`);
  } else if (!hashtagsInput) {
    console.error('[fillSemiAutoFields] unified-generated-hashtags NOT found!');
  }

  // 소제목 정보 저장
  currentStructuredContent = structuredContent;
  (window as any).currentStructuredContent = structuredContent;


  // ✅ 생성된 글 목록에 저장 (postId 반환)
  const postId = saveGeneratedPost(structuredContent);
  if (postId) {
    currentPostId = postId; // 전역 변수에 저장 (이미지 생성 시 사용)
  }

  // ✅ 이미지 관리 탭 제목 필드도 자동으로 채우기
  const imageTitleInput = document.getElementById('image-title') as HTMLInputElement;
  if (imageTitleInput && structuredContent.selectedTitle) {
    imageTitleInput.value = structuredContent.selectedTitle;
    appendLog(`📝 이미지 관리 탭 제목도 자동 입력: "${structuredContent.selectedTitle}"`);
  }

  // ✅ 자동 저장 및 백업 시작
  startAutosave();
  startAutoBackup();
  // ✅ [2026-03-23 FIX] errorAndAutosave.ts에서 이미 시작하므로 여기서는 debug만
  console.debug('[contentGeneration] 자동 저장/백업 시작됨');

  // ✅ 생성된 글 목록 새로고침
  refreshGeneratedPostsList();

  // ✅ [New] 미리보기 즉시 동기화
  syncIntegratedPreviewFromInputs();
}

// ✅ [2026-03-29] 페러프레이징 모드 100점 개선
// 결함 수정: 다중클릭방지, 원본백업/복원, 응답검증, saveGeneratedPost, 프롬프트이중주입제거, 에러토스트

// ✅ 불용어 목록 (키워드 추출 품질 향상)
const KOREAN_STOP_WORDS = new Set([
  '이', '그', '저', '것', '수', '등', '및', '더', '를', '을', '에서', '으로', '에게', '까지',
  '부터', '대한', '위한', '통한', '따른', '관한', '있는', '없는', '하는', '되는', '같은',
  '모든', '매우', '아주', '정말', '진짜', '완전', '방법', '추천', '후기', '리뷰', '정리',
  '소개', '안내', '가이드', '비교', '분석', '총정리', '핵심', '포인트', '기본',
]);

// ✅ 다중 클릭 방지 플래그
let isParaphrasing = false;

// ✅ 페러프레이징 모드로 글쓰기
export async function paraphraseContent(): Promise<void> {
  console.log('[paraphraseContent] 함수 시작됨');

  // ✅ [결함 #5] 다중 클릭 방지
  if (isParaphrasing) {
    toastManager.warning('⏳ 페러프레이징이 이미 진행 중입니다. 잠시 기다려주세요.', 3000);
    console.warn('[paraphraseContent] 중복 호출 차단됨');
    return;
  }

  const paraphraseBtn = document.getElementById('paraphrase-mode-btn') as HTMLButtonElement | null;

  const titleInput = document.getElementById('unified-generated-title') as HTMLInputElement;
  const contentTextarea = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
  const hashtagsInput = document.getElementById('unified-generated-hashtags') as HTMLInputElement;

  console.log('[paraphraseContent] DOM 요소 확인:', { titleInput: !!titleInput, contentTextarea: !!contentTextarea, hashtagsInput: !!hashtagsInput });

  const title = titleInput?.value.trim() || '';
  const content = contentTextarea?.value.trim() || '';
  const hashtags = hashtagsInput?.value.trim() || '';

  console.log('[paraphraseContent] 입력값:', { titleLen: title.length, contentLen: content.length, hashtagsLen: hashtags.length });

  if (!title && !content) {
    toastManager.warning('⚠️ 제목 또는 본문을 먼저 입력해주세요.', 5000);
    appendLog('⚠️ 페러프레이징 취소: 제목과 본문이 비어있습니다.');
    return;
  }

  // ✅ [결함 #7] 원본 백업 (실패 시 복원용)
  const backupTitle = title;
  const backupContent = content;
  const backupHashtags = hashtags;

  // ✅ 실행 잠금
  isParaphrasing = true;
  if (paraphraseBtn) {
    paraphraseBtn.disabled = true;
    paraphraseBtn.style.opacity = '0.5';
    paraphraseBtn.style.cursor = 'not-allowed';
  }

  try {
    appendLog('✨ 페러프레이징 모드: 글의 퀄리티를 개선하여 새롭게 작성 중...');
    showUnifiedProgress(10, '페러프레이징 시작...', 'AI가 글을 분석하고 개선 중입니다');

    // 기존 콘텐츠 초기화
    if (currentStructuredContent) {
      currentStructuredContent = null;
      (window as any).currentStructuredContent = null;
      generatedImages = [];
    }

    const generator = UnifiedDOMCache.getGenerator();
    const targetAge = 'all';
    const toneStyle = UnifiedDOMCache.getToneStyle();
    const articleType = (document.getElementById('unified-article-type') as HTMLSelectElement)?.value || 'general';
    const minChars = parseInt((document.getElementById('unified-min-chars') as HTMLInputElement)?.value) || 2000;

    // ✅ 원문 구성
    let originalContent = '';
    if (title) originalContent += `제목: ${title}\n\n`;
    if (content) originalContent += `본문:\n${content}\n\n`;
    if (hashtags) originalContent += `해시태그: ${hashtags}`;

    // ✅ [결함 #8] 키워드 추출 개선 — 불용어 제거
    const paraphraseKeywords = title
      ? title.split(/[\s,]+/)
          .filter((w: string) => w.length >= 2 && !KOREAN_STOP_WORDS.has(w))
          .slice(0, 5)
      : [];

    const paraphrasePrompt = `위 글을 완전히 새롭게 재작성해주세요.

════════════════════════════════════════
🔥 패러프레이징 100점 공식 🔥
════════════════════════════════════════

[핵심 목표]
1. AI 탐지 100% 회피 (사람이 쓴 것처럼)
2. 네이버 상위노출/홈판노출 최적화
3. 원본 의미는 유지하되 표현은 완전히 새롭게

════════════════════════════════════════
📌 문장 변환 필수 규칙 (AI 탐지 회피)
════════════════════════════════════════

[문장 구조 변환]
- 능동태 ↔ 피동태 전환: "나는 ~했다" → "~가 되었다"
- 문장 순서 변경: 결론 → 과정 또는 과정 → 결론
- 복문 → 단문: 긴 문장을 2~3개로 분리
- 단문 → 복문: 짧은 문장들을 자연스럽게 연결

[어휘 변환 - 동의어 적극 활용]
- "좋다" → "괜찮다/만족스럽다/마음에 들다"
- "나쁘다" → "아쉽다/별로다/기대 이하다"
- "많다" → "꽤 된다/여럿이다/상당하다"
- "중요하다" → "핵심이다/빠지면 안 된다/꼭 알아야 한다"

[AI티 제거 필수]
❌ 절대 금지: "물론", "확실히", "분명히", "~것입니다", "~하겠습니다"
❌ 절대 금지: "살펴보겠습니다", "알아보겠습니다", "정리하자면"
✅ 대신 사용: "저도 그랬어요", "솔직히", "근데", "그래서", "아무튼"

[문체 규칙]
- 사용자가 선택한 글톤(STYLE OVERRIDE)에 맞는 어미를 사용하라
- 기본값: 자연스러운 구어체 (사용자 설정이 없을 때만)
- AI 특유의 딱딱한 설명체 금지

════════════════════════════════════════
📌 제목 100점 재작성
════════════════════════════════════════

[제목 공식]
[핵심키워드] + [구체적 상황/숫자] + [감정/결과 트리거]

[제목 트리거 필수 포함]
- 감정형: "~에 울컥", "~보고 소름", "~듣고 충격"
- 정보형: "총정리", "완벽 가이드", "~가지 방법"
- 현장감: "실시간", "방금", "댓글 난리"

════════════════════════════════════════
📌 도입부 후킹 100점 재작성
════════════════════════════════════════

[첫 문장 필수 패턴 중 하나]
- "저도 처음엔 이랬어요."
- "이거 보고 진짜 놀랐어요."
- "다들 이거 모르더라고요."
- "솔직히 말하면요."

[도입부 3줄 구성]
1줄: 공감/충격 (15~25자)
2줄: 상황 설명 (20~30자)
3줄: 본문 유도 (20~30자)

════════════════════════════════════════
📌 본문 변환 규칙
════════════════════════════════════════

[소제목 재작성]
- 원본 소제목 의미 유지하되 표현 완전 변경
- 감정/행동 중심 소제목으로 변환
❌ "제품 특징 정리" → ✅ "써보니까 이게 달랐어요"
❌ "장단점 분석" → ✅ "솔직히 좋은 점, 아쉬운 점"

[문단 재구성]
- 문단 순서 섞기 (논리적 흐름 유지하면서)
- 예시/사례 추가 또는 변경
- 숫자/데이터 표현 방식 변경 (50% → 절반, 2배 → 두 배로)

[반응 블록 추가]
📌 실제 반응:
- "~라는 댓글이 많았어요"
- "주변에서도 ~라고 하더라고요"

════════════════════════════════════════
📌 AI 인용 최적화 (네이버 AI 대응)
════════════════════════════════════════

[인용 가능한 문장 3개 이상 포함]
- "핵심은 딱 하나예요. ~"
- "결론부터 말하면, ~"
- "가장 중요한 건 ~이에요."

[구조화된 정보]
- 숫자 리스트 1개 이상 (3가지, 5단계 등)
- 비교/대조 문장 1개 이상

════════════════════════════════════════
📌 원본 해시태그 참고
════════════════════════════════════════
${hashtags ? `원본 해시태그: ${hashtags}\n위 해시태그를 참고하여 유사하지만 더 최적화된 해시태그를 생성하세요.` : '자유롭게 최적 해시태그를 생성하세요.'}

════════════════════════════════════════
⚠️ 최종 체크리스트
════════════════════════════════════════

□ AI 탐지 금지 표현 0개
□ 사용자 선택 글톤에 맞는 어미 통일
□ 제목에 감정/숫자 트리거 포함
□ 도입부 3줄 후킹 패턴 적용
□ 소제목 5개 이상
□ 인용 가능한 팩트 문장 3개 이상
□ 원본과 문장 유사도 30% 이하 (완전히 새롭게)

결과물은 AI가 아닌 사람이 직접 쓴 것처럼 자연스러워야 합니다.`;

    showUnifiedProgress(30, 'AI가 글을 개선 중...', '페러프레이징 및 퀄리티 향상 중');

    // ✅ [결함 #3] 프롬프트 이중 주입 제거
    // draftText에는 원문만, customPrompt에만 재작성 규칙 전달
    const payload = {
      assembly: {
        generator: generator as 'gemini' | 'openai' | 'claude' | 'perplexity',
        draftText: originalContent,
        targetAge: targetAge as '20s' | '30s' | '40s' | '50s' | 'all',
        minChars,
        articleType,
        toneStyle,
        contentMode: 'custom' as const,
        customPrompt: paraphrasePrompt,
        keywords: paraphraseKeywords,
      }
    };

    const apiClient = EnhancedApiClient.getInstance();
    const apiResponse = await apiClient.call(
      'generateStructuredContent',
      [payload],
      {
        retryCount: 2,
        retryDelay: 3000,
        timeout: 900000 // ✅ 15분 타임아웃
      }
    );

    if (!apiResponse.success || !apiResponse.data?.success) {
      throw new Error(apiResponse.data?.message || apiResponse.error || '페러프레이징 실패');
    }

    showUnifiedProgress(80, '페러프레이징 완료!', '개선된 글을 필드에 채우는 중');

    const result = apiResponse.data;

    // ✅ [결함 #6] API 응답 구조 검증
    const structuredContent = result.content;
    if (!structuredContent || typeof structuredContent !== 'object') {
      throw new Error('페러프레이징 응답 데이터가 유효하지 않습니다.');
    }

    // 필드에 개선된 글 채우기 (검증 후 반영)
    if (titleInput && structuredContent.selectedTitle && typeof structuredContent.selectedTitle === 'string') {
      titleInput.value = structuredContent.selectedTitle;
    }
    if (contentTextarea && structuredContent.bodyPlain && typeof structuredContent.bodyPlain === 'string') {
      const normalized = normalizeReadableBodyText(structuredContent.bodyPlain);
      structuredContent.bodyPlain = normalized;
      structuredContent.content = normalized;
      contentTextarea.value = normalized;
    } else if (contentTextarea) {
      // bodyPlain이 없으면 원본 유지 (덮어쓰기 방지)
      console.warn('[paraphraseContent] ⚠️ bodyPlain 없음 — 원본 본문 유지');
      appendLog('⚠️ AI 응답에 본문이 없어 원본을 유지합니다.');
    }
    if (hashtagsInput && Array.isArray(structuredContent.hashtags) && structuredContent.hashtags.length > 0) {
      hashtagsInput.value = structuredContent.hashtags.join(' ');
    }

    // 글로벌 상태 업데이트
    currentStructuredContent = structuredContent;
    (window as any).currentStructuredContent = structuredContent;

    // ✅ [결함 #2] saveGeneratedPost 호출 — 결과 영구 저장
    try {
      saveGeneratedPost(structuredContent, false, { source: 'paraphrase' });
      console.log('[paraphraseContent] ✅ 페러프레이징 결과 저장 완료');
    } catch (saveErr) {
      console.warn('[paraphraseContent] ⚠️ 저장 실패 (기능에는 영향 없음):', saveErr);
    }

    // 미리보기 및 목록 업데이트
    updateUnifiedPreview(structuredContent);
    refreshGeneratedPostsList();

    appendLog('✨ 페러프레이징 완료! 필드를 확인해주세요.');
    toastManager.success('✅ 페러프레이징 완료! 개선된 글이 반영되었습니다.', 5000);
  } catch (error: any) {
    console.error('Paraphrase failed:', error);
    appendLog(`❌ 페러프레이징 실패: ${error.message}`);

    // ✅ [결함 #4] catch 블록에 토스트 에러 표시
    toastManager.error(`❌ 페러프레이징 실패: ${error.message}`, 8000);

    // ✅ [결함 #7] 실패 시 원본 복원
    if (backupTitle && document.getElementById('unified-generated-title')) {
      (document.getElementById('unified-generated-title') as HTMLInputElement).value = backupTitle;
    }
    if (backupContent && document.getElementById('unified-generated-content')) {
      (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value = backupContent;
    }
    if (backupHashtags && document.getElementById('unified-generated-hashtags')) {
      (document.getElementById('unified-generated-hashtags') as HTMLInputElement).value = backupHashtags;
    }
    appendLog('🔄 원본 복원됨 — 페러프레이징 전 상태로 돌아갔습니다.');
  } finally {
    hideUnifiedProgress();

    // ✅ 실행 잠금 해제
    isParaphrasing = false;
    if (paraphraseBtn) {
      paraphraseBtn.disabled = false;
      paraphraseBtn.style.opacity = '1';
      paraphraseBtn.style.cursor = 'pointer';
    }
  }
}


// ✅ 갤러리 뷰 전환 상태
// ✅ [v1.4.59] let 복원 — postListUI.ts에서 재할당
let isGalleryView = false;



