/**
 * tailUIUtils.ts — renderer.ts tail block extracted UI utilities
 * @module tailUIUtils
 * @since 2026-02-24
 */

import { loadTutorialVideos } from './tutorialsTab.js';

export function initToolsHubModal() {
  console.log('[ToolsHub] 초기화 시작...');

  // 이벤트 위임: document에서 클릭 이벤트 감지
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // 가이드/분석 모음 버튼 클릭
    if (target.id === 'tools-hub-btn' || target.closest('#tools-hub-btn')) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[ToolsHub] 버튼 클릭됨 (위임)');
      const modal = document.getElementById('tools-hub-modal');
      console.log('[ToolsHub] 모달 요소:', modal);
      if (modal) {
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        console.log('[ToolsHub] 모달 열림, display:', modal.style.display);

        // 사용법 영상 목록 로드
        loadTutorialVideos();
      } else {
        console.error('[ToolsHub] 모달을 찾을 수 없음');
      }
    }

    // 다계정 자동순환 버튼 클릭
    if (target.id === 'auto-rotation-btn' || target.closest('#auto-rotation-btn')) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[AutoRotation] 버튼 클릭됨');
      const modal = document.getElementById('auto-rotation-modal');
      if (modal) {
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        console.log('[AutoRotation] 모달 열림');
      }
    }

    // 닫기 버튼 클릭
    if (target.id === 'tools-hub-close' || target.closest('#tools-hub-close')) {
      const modal = document.getElementById('tools-hub-modal');
      if (modal) modal.style.display = 'none';
    }

    // 다계정 자동순환 모달 닫기
    if (target.id === 'auto-rotation-close' || target.closest('#auto-rotation-close')) {
      const modal = document.getElementById('auto-rotation-modal');
      if (modal) modal.style.display = 'none';
    }

    // 모달 외부 클릭
    if (target.id === 'tools-hub-modal') {
      target.style.display = 'none';
    }
    if (target.id === 'auto-rotation-modal') {
      target.style.display = 'none';
    }
  });

  const toolsTabs = document.querySelectorAll('.tools-hub-tab');
  const toolsPanels = document.querySelectorAll('.tools-tab-panel');

  // 탭 전환
  toolsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tools-tab');

      // 모든 탭 비활성화
      toolsTabs.forEach(t => {
        t.classList.remove('active');
        (t as HTMLElement).style.color = 'var(--text-muted)';
      });

      // 클릭한 탭 활성화
      tab.classList.add('active');
      (tab as HTMLElement).style.color = 'var(--text-strong)';

      // 모든 패널 숨기기
      toolsPanels.forEach(panel => {
        (panel as HTMLElement).style.display = 'none';
      });

      // 해당 패널 표시
      const targetPanel = document.getElementById(`tools-tab-${targetTab}`);
      if (targetPanel) targetPanel.style.display = 'block';

      // ✅ 사용법 탭 클릭 시 영상 목록 로드
      if (targetTab === 'tutorials') {
        console.log('[ToolsHub] 사용법 탭 클릭 - 영상 로드');
        loadTutorialVideos();
      }
    });
  });

  console.log('[ToolsHub] 도구 모음 모달 초기화 완료');
}

// initToolsHubModal, initGeminiSelectionUI → renderer.ts에서 호출

// ✅ Gemini 모델 선택 UI 스타일 로직
export function initGeminiSelectionUI(): void {
  const cards = document.querySelectorAll('.gemini-model-card');
  if (cards.length === 0) return;

  function updateStyles() {
    cards.forEach(card => {
      const input = card.querySelector('input[type="radio"]') as HTMLInputElement;
      if (!input) return;

      const cardEl = card as HTMLElement;
      const iconBg = card.querySelector('div:first-child') as HTMLElement;

      if (input.checked) {
        // 선택됨
        cardEl.style.borderColor = '#d4af37';
        cardEl.style.boxShadow = '0 4px 12px rgba(212, 175, 55, 0.15)';
        if (iconBg) iconBg.style.backgroundColor = '#fffbeb';
        input.style.accentColor = '#d4af37';
      } else {
        // 해제됨
        cardEl.style.borderColor = '#e5e7eb';
        cardEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.03)';
        if (iconBg) iconBg.style.backgroundColor = '#f3f4f6';
        input.style.accentColor = '#6b7280';
      }
    });
  }

  // 초기 실행
  updateStyles();

  // 이벤트 리스너
  const inputs = document.querySelectorAll('input[name="primaryGeminiTextModel"]');
  inputs.forEach(input => {
    input.addEventListener('change', updateStyles);
  });

  console.log('[UI] Gemini 모델 선택 스타일 초기화 완료');
}

// ✅ 콘텐츠 모드 도움말 시스템 및 스마트 발행 버튼 초기화
export function initContentModeHelpAndSmartPublish() {
  console.log('[ContentModeHelp] Initializing content mode help modal and smart publish buttons...');

  // 제휴마케팅 모드 지원 카테고리 [2026-01-22 확장]
  const AFFILIATE_ENABLED_CATEGORIES = [
    // 기존 카테고리
    'it_computer', 'shopping_review', 'fashion', 'food_recipe', 'tasty_restaurant',
    'parenting', 'interior', 'pet', 'car', 'game', 'hobby', 'travel_domestic', 'travel_world',
    // 추가 카테고리 (2026-01-22)
    'health', 'sports', 'gardening', 'photo', 'business_economy', 'education_scholarship',
    'language', 'realestate', 'self_dev', 'general', 'literature', 'movie', 'art_design',
    'music', 'good_writing', 'cartoon', 'it', 'tips'  // it, tips도 유지
  ];

  // ✅ 도움말 모달 표시 함수
  function showContentModeHelpModal(mode: string): void {
    const modal = document.getElementById('content-mode-help-modal');
    if (!modal) return;

    // 모든 섹션 숨기기
    document.querySelectorAll('.help-content-section').forEach(section => {
      (section as HTMLElement).style.display = 'none';
    });

    // 선택된 모드 섹션 표시
    const targetSection = document.getElementById(`help-content-${mode}`);
    if (targetSection) {
      targetSection.style.display = 'block';
    }

    // 타이틀 업데이트
    const icons: Record<string, string> = { seo: '🔍', homefeed: '🏠', affiliate: '🛒', custom: '✏️' };
    const names: Record<string, string> = { seo: 'SEO 모드 가이드', homefeed: '홈판 모드 가이드', affiliate: '쇼핑커넥트 모드 가이드', custom: '사용자정의 모드 가이드' };

    const iconEl = document.getElementById('content-mode-help-icon');
    const nameEl = document.getElementById('content-mode-help-mode-name');
    if (iconEl) iconEl.textContent = icons[mode] || '🎯';
    if (nameEl) nameEl.textContent = names[mode] || '콘텐츠 모드 가이드';

    modal.style.display = 'flex';
  }

  // ✅ 도움말 버튼 이벤트
  document.querySelectorAll('.content-mode-help-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // 버튼 클릭이 모드 버튼으로 전파되지 않도록
      const mode = (btn as HTMLElement).dataset.helpMode;
      if (mode) showContentModeHelpModal(mode);
    });
  });

  // ✅ 도움말 모달 닫기 이벤트
  document.getElementById('close-content-mode-help-modal')?.addEventListener('click', () => {
    const modal = document.getElementById('content-mode-help-modal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('close-content-mode-help-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('content-mode-help-modal');
    if (modal) modal.style.display = 'none';
  });

  // 모달 배경 클릭 시 닫기
  document.getElementById('content-mode-help-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      (e.currentTarget as HTMLElement).style.display = 'none';
    }
  });

  // ✅ 제휴마케팅 모드 조건부 활성화 함수
  function updateAffiliateModeState(): void {
    const affiliateBtn = document.getElementById('affiliate-mode-btn') as HTMLButtonElement;
    if (!affiliateBtn) return;

    // 현재 선택된 카테고리 가져오기
    const categorySelect = document.getElementById('unified-article-type') as HTMLSelectElement;
    const currentCategory = categorySelect?.value || '';

    const isEnabled = AFFILIATE_ENABLED_CATEGORIES.includes(currentCategory);

    if (isEnabled) {
      affiliateBtn.style.opacity = '1';
      affiliateBtn.disabled = false;
      affiliateBtn.title = '';
    } else {
      affiliateBtn.style.opacity = '0.5';
      affiliateBtn.disabled = true;
      affiliateBtn.title = '리뷰형 카테고리(상품리뷰, 자동차, IT 등)를 선택해야 사용할 수 있습니다';

      // 현재 제휴마케팅 모드가 선택된 상태라면 SEO로 전환
      const contentModeInput = document.getElementById('unified-content-mode') as HTMLInputElement;
      if (contentModeInput?.value === 'affiliate') {
        // SEO 모드로 자동 전환
        const seoBtn = document.querySelector('.content-mode-btn[data-mode="seo"]') as HTMLButtonElement;
        if (seoBtn) seoBtn.click();
      }
    }
  }

  // 카테고리 변경 시 쇼핑 커넥트 상태 업데이트
  document.getElementById('unified-article-type')?.addEventListener('change', () => {
    setTimeout(updateAffiliateModeState, 100);
  });

  // 카테고리 모달에서 선택 시에도 업데이트 (MutationObserver)
  const categoryDisplay = document.getElementById('selected-categories-display');
  if (categoryDisplay) {
    const observer = new MutationObserver(() => {
      setTimeout(updateAffiliateModeState, 100);
    });
    observer.observe(categoryDisplay, { childList: true, subtree: true, characterData: true });
  }

  // ✅ 쇼핑 커넥트 모드 시 카테고리 드롭다운 필터링
  let originalCategoryOptions: HTMLOptionElement[] = [];
  function filterCategoryForAffiliateMode(isAffiliateMode: boolean): void {
    const categorySelect = document.getElementById('unified-article-type') as HTMLSelectElement;
    if (!categorySelect) return;

    // 원본 옵션 백업 (최초 1회 또는 옵션 개수가 변동된 경우 - 35개 기준)
    if (originalCategoryOptions.length < 35 && categorySelect.options.length >= 35) {
      console.log('[AffiliateFilter] Capturing original category options (count:', categorySelect.options.length, ')');
      originalCategoryOptions = Array.from(categorySelect.options).map(opt => opt.cloneNode(true) as HTMLOptionElement);
    }

    const currentValue = categorySelect.value;
    console.log('[AffiliateFilter] mode:', isAffiliateMode ? 'AFFILIATE' : 'SEO/HOMEFEED', 'currentValue:', currentValue);

    const aiLabel = document.getElementById('unified-use-ai-image-label');
    const aiHint = document.getElementById('unified-use-ai-image-hint');
    const thumbLabel = document.getElementById('unified-create-product-thumbnail-label');
    const thumbHint = document.getElementById('unified-create-product-thumbnail-hint');

    if (isAffiliateMode) {
      // 제휴마케팅 모드: 리뷰 가능 카테고리만 표시
      categorySelect.innerHTML = '';
      originalCategoryOptions.forEach(opt => {
        if (AFFILIATE_ENABLED_CATEGORIES.includes(opt.value) || opt.value === '') {
          categorySelect.appendChild(opt.cloneNode(true));
        }
      });

      // 이전 선택 값이 여전히 유효하다면 복원, 아니면 첫 번째 유효 옵션
      if (currentValue && Array.from(categorySelect.options).some(o => o.value === currentValue)) {
        categorySelect.value = currentValue;
      } else {
        const firstValidOption = Array.from(categorySelect.options).find(o => AFFILIATE_ENABLED_CATEGORIES.includes(o.value));
        if (firstValidOption) categorySelect.value = firstValidOption.value;
      }
      console.log('🛒 쇼핑 커넥트 모드: 리뷰 가능 카테고리만 표시됩니다.');

      // ✅ 라벨 변경: 쇼핑커넥트 특화
      if (aiLabel) aiLabel.textContent = '🤖 AI 라이프스타일 이미지 생성';
      if (aiHint) aiHint.textContent = '수집된 제품 사진을 배경으로 연출 이미지를 생성합니다. (해제 시 수집 사진 그대로 사용)';
    } else {
      // 일반 모드: 모든 카테고리 복원
      const currentValue = categorySelect.value;
      categorySelect.innerHTML = '';
      originalCategoryOptions.forEach(opt => {
        categorySelect.appendChild(opt.cloneNode(true));
      });
      // 이전 선택 값 복원
      // ✅ 라벨 원복: 일반 모드
      if (aiLabel) aiLabel.textContent = '🤖 AI 이미지 생성 사용';
      if (aiHint) aiHint.textContent = '나노바나나 등 AI 엔진을 활용해 이미지를 생성합니다.';

      // 통일된 라벨 (다시 확인)
      if (thumbLabel) thumbLabel.textContent = '🎨 썸네일 텍스트 포함';
      if (thumbHint) thumbHint.textContent = '첫 번째 이미지에 제목 및 디자인 합성';
    }
  }

  // ✅ 콘텐츠 모드 버튼 클릭 시 카테고리 필터링 및 쇼핑 커넥트 설정 표시/숨김
  document.querySelectorAll('.content-mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = (btn as HTMLElement).dataset.mode;

      setTimeout(() => filterCategoryForAffiliateMode(mode === 'affiliate'), 100);

      // ✅ 쇼핑 커넥트 설정 영역 표시/숨김
      const shoppingConnectSettings = document.getElementById('shopping-connect-settings');
      const shoppingConnectImageOptions = document.getElementById('shopping-connect-image-options');
      const thumbnailTextOptionContainer = document.getElementById('thumbnail-text-option-container');
      // ✅ [2026-02-10] 쇼핑몰 이미지 수집 섹션
      const shoppingUrlContainer = document.getElementById('image-shopping-url-container');
      // ✅ [2026-01-19] 고급 화질 및 모델 설정 (쇼핑커넥트에서 불필요)
      const imageQualityToggle = document.getElementById('toggle-image-quality-settings')?.parentElement;
      const imageQualityPanel = document.getElementById('image-quality-settings-panel');

      if (mode === 'affiliate') {
        if (shoppingConnectSettings) shoppingConnectSettings.style.display = 'block';
        if (shoppingConnectImageOptions) shoppingConnectImageOptions.style.display = 'block';
        // ✅ [2026-02-10] 쇼핑몰 이미지 수집 섹션 표시
        if (shoppingUrlContainer) shoppingUrlContainer.style.display = 'block';
        // ✅ 쇼핑커넥트에서는 썸네일 텍스트 포함 옵션 숨김 (자동 적용)
        if (thumbnailTextOptionContainer) thumbnailTextOptionContainer.style.display = 'none';
        // ✅ [2026-01-19] 고급 화질 및 모델 설정 숨김
        if (imageQualityToggle) imageQualityToggle.style.display = 'none';
        if (imageQualityPanel) imageQualityPanel.style.display = 'none';
        console.log('🛒 쇼핑 커넥트 모드가 활성화되었습니다. 제휴 링크를 입력해주세요.');
      } else {
        if (shoppingConnectSettings) shoppingConnectSettings.style.display = 'none';
        if (shoppingConnectImageOptions) shoppingConnectImageOptions.style.display = 'none';
        // ✅ [2026-02-10] 쇼핑몰 이미지 수집 섹션 숨김
        if (shoppingUrlContainer) shoppingUrlContainer.style.display = 'none';
        // ✅ 일반 모드에서는 썸네일 텍스트 포함 옵션 표시
        if (thumbnailTextOptionContainer) thumbnailTextOptionContainer.style.display = 'block';
        // ✅ [2026-01-19] 일반 모드에서는 고급 화질 설정 표시
        if (imageQualityToggle) imageQualityToggle.style.display = 'block';
      }
    });
  });

  // 초기 상태 설정
  setTimeout(updateAffiliateModeState, 500);

  // ✅ 스마트 발행 버튼 가시성 관리 (발행 모드 상단 선택 연동)
  let hasGeneratedContent = false;

  // ✅ 핵심 함수: 발행 모드에 따라 글 생성/발행 버튼 상태 일괄 제어
  function syncPublishMode(mode: 'full-auto' | 'semi-auto'): void {
    const topSelect = document.getElementById('publish-mode-top-select') as HTMLSelectElement;
    const bottomSelect = document.getElementById('publish-mode-select') as HTMLSelectElement;
    const topDesc = document.getElementById('publish-mode-top-desc');
    const topSection = document.getElementById('publish-mode-top-section');
    const genTabs = document.getElementById('content-generation-tabs');
    const urlBtn = document.getElementById('generate-from-url-btn') as HTMLButtonElement;
    const keywordBtn = document.getElementById('generate-manual-btn') as HTMLButtonElement;
    const publishBtn = document.getElementById('unified-publish-btn') as HTMLButtonElement;
    const publishBtnText = document.getElementById('publish-btn-text');
    const publishBtnIcon = document.getElementById('publish-btn-icon');

    // 상단/하단 드롭다운 동기화
    if (topSelect) topSelect.value = mode;
    if (bottomSelect) bottomSelect.value = mode;

    if (mode === 'full-auto') {
      // ═══ 풀오토 모드 ═══
      // 글 생성 버튼만 비활성화 (풀오토가 자동으로 처리) — URL/키워드 입력은 유지
      if (urlBtn) {
        urlBtn.disabled = true;
        urlBtn.style.opacity = '0.4';
        urlBtn.style.cursor = 'not-allowed';
        urlBtn.title = '풀오토 모드에서는 발행 버튼 하나로 글 생성부터 발행까지 자동 처리됩니다';
      }
      if (keywordBtn) {
        keywordBtn.disabled = true;
        keywordBtn.style.opacity = '0.4';
        keywordBtn.style.cursor = 'not-allowed';
        keywordBtn.title = '풀오토 모드에서는 발행 버튼 하나로 글 생성부터 발행까지 자동 처리됩니다';
      }
      // ✅ [2026-02-27 FIX] 글 생성 탭 영역은 활성 유지 (URL/키워드 입력 가능)
      // 버튼만 비활성화, 입력 필드 및 탭 전환은 정상 동작
      if (genTabs) {
        genTabs.style.opacity = '1';
        genTabs.style.pointerEvents = 'auto';
      }

      // 발행 버튼 활성화 (파란색)
      if (publishBtn) {
        publishBtn.disabled = false;
        publishBtn.style.opacity = '1';
        publishBtn.style.cursor = 'pointer';
        publishBtn.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
        publishBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
      }
      if (publishBtnText) publishBtnText.textContent = '⚡ 풀오토 발행 시작';
      if (publishBtnIcon) publishBtnIcon.textContent = '🚀';

      // 설명 텍스트
      if (topDesc) topDesc.textContent = '💡 URL/키워드 → AI 글생성 → 이미지 → 발행까지 한 번에!';
      // 상단 섹션 색상
      if (topSection) topSection.style.borderColor = 'rgba(59, 130, 246, 0.4)';

    } else {
      // ═══ 반자동 모드 ═══
      // 글 생성 버튼 활성화
      if (urlBtn) {
        urlBtn.disabled = false;
        urlBtn.style.opacity = '1';
        urlBtn.style.cursor = 'pointer';
        urlBtn.title = '';
      }
      if (keywordBtn) {
        keywordBtn.disabled = false;
        keywordBtn.style.opacity = '1';
        keywordBtn.style.cursor = 'pointer';
        keywordBtn.title = '';
      }
      // 글 생성 탭 영역 활성화
      if (genTabs) {
        genTabs.style.opacity = '1';
        genTabs.style.pointerEvents = 'auto';
      }

      // 발행 버튼: 글 생성 여부에 따라 활성/비활성
      if (publishBtn) {
        if (hasGeneratedContent) {
          publishBtn.disabled = false;
          publishBtn.style.opacity = '1';
          publishBtn.style.cursor = 'pointer';
          publishBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
          publishBtn.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.4)';
          if (publishBtnText) publishBtnText.textContent = '📤 반자동 발행 시작';
        } else {
          publishBtn.disabled = true;
          publishBtn.style.opacity = '0.4';
          publishBtn.style.cursor = 'not-allowed';
          publishBtn.style.background = 'linear-gradient(135deg, #6b7280, #4b5563)';
          publishBtn.style.boxShadow = 'none';
          if (publishBtnText) publishBtnText.textContent = '⏳ 먼저 글을 생성하세요';
        }
      }
      if (publishBtnIcon) publishBtnIcon.textContent = hasGeneratedContent ? '📤' : '⏳';

      // 설명 텍스트
      if (topDesc) topDesc.textContent = hasGeneratedContent
        ? '✅ 글이 생성되었습니다! 미리보기 확인 후 발행하세요.'
        : '💡 먼저 URL 또는 키워드로 글을 생성한 후, 확인하고 발행합니다.';
      // 상단 섹션 색상
      if (topSection) topSection.style.borderColor = hasGeneratedContent
        ? 'rgba(245, 158, 11, 0.4)'
        : 'rgba(139, 92, 246, 0.3)';
    }

    console.log(`[SyncPublishMode] 모드 변경: ${mode}, 글 생성됨: ${hasGeneratedContent}`);
  }

  // 기존 호환성을 위한 updatePublishButtonVisibility (syncPublishMode 위임)
  function updatePublishButtonVisibility(): void {
    const topSelect = document.getElementById('publish-mode-top-select') as HTMLSelectElement;
    const mode = (topSelect?.value || 'full-auto') as 'full-auto' | 'semi-auto';
    syncPublishMode(mode);

    // 미리보기/반자동 섹션/글 목록 상태 관리 (모드 무관)
    const previewSection = document.getElementById('unified-preview-section');
    const semiAutoSection = document.getElementById('unified-semi-auto-section');
    const postsListContent = document.getElementById('posts-list-content');
    const postsListToggleIcon = document.getElementById('posts-list-toggle-icon');
    const postsListToggleHint = document.getElementById('posts-list-toggle-hint');

    if (hasGeneratedContent) {
      if (previewSection) previewSection.style.display = 'block';
      if (semiAutoSection) semiAutoSection.style.display = 'block';
    } else {
      if (previewSection) previewSection.style.display = 'none';
      if (semiAutoSection) semiAutoSection.style.display = 'block';
    }

    // 글 목록은 항상 접힌 상태
    const postsListContainer = document.getElementById('unified-only-posts-list');
    if (postsListContainer) postsListContainer.style.display = 'block';
    if (postsListContent) postsListContent.style.display = 'none';
    if (postsListToggleIcon) postsListToggleIcon.style.transform = 'rotate(0deg)';
    if (postsListToggleHint) postsListToggleHint.textContent = '클릭하여 펼치기';
  }

  // 발행 모드 드롭다운 변경 시 버튼 스타일 업데이트 (기존 호환)
  function updatePublishButtonStyle(): void {
    const topSelect = document.getElementById('publish-mode-top-select') as HTMLSelectElement;
    const mode = (topSelect?.value || 'full-auto') as 'full-auto' | 'semi-auto';
    syncPublishMode(mode);
  }

  // ✅ 상단 발행 모드 드롭다운 이벤트 리스너
  document.getElementById('publish-mode-top-select')?.addEventListener('change', (e) => {
    const mode = (e.target as HTMLSelectElement).value as 'full-auto' | 'semi-auto';
    syncPublishMode(mode);
  });

  // 하단 드롭다운 이벤트 리스너 (동기화)
  document.getElementById('publish-mode-select')?.addEventListener('change', (e) => {
    const mode = (e.target as HTMLSelectElement).value as 'full-auto' | 'semi-auto';
    syncPublishMode(mode);
  });

  // 통합 발행 버튼 클릭 핸들러
  document.getElementById('unified-publish-btn')?.addEventListener('click', () => {
    const topSelect = document.getElementById('publish-mode-top-select') as HTMLSelectElement;
    const mode = topSelect?.value || 'full-auto';

    if (mode === 'full-auto') {
      // 풀오토 발행 실행
      document.getElementById('full-auto-publish-btn')?.click();
    } else {
      // 반자동 발행 실행
      document.getElementById('semi-auto-publish-btn')?.click();
    }
  });


  // 콘텐츠 생성 완료 감지
  function markContentGenerated(): void {
    hasGeneratedContent = true;
    updatePublishButtonVisibility();
    console.log('[SmartPublish] Content generated - 반자동 모드 발행 버튼 활성화');
  }

  function markContentCleared(): void {
    hasGeneratedContent = false;
    updatePublishButtonVisibility();
    console.log('[SmartPublish] Content cleared - 상태 초기화');
  }

  // 글 생성 버튼 클릭 시 콘텐츠 생성됨으로 마킹
  document.getElementById('generate-from-url-btn')?.addEventListener('click', () => {
    markContentGenerated();
  });

  document.getElementById('generate-manual-btn')?.addEventListener('click', () => {
    markContentGenerated();
  });

  // 백업 불러오기 시 콘텐츠 생성됨으로 마킹
  document.getElementById('load-backup-btn')?.addEventListener('click', () => {
    setTimeout(markContentGenerated, 1000);
  });

  // 글 목록에서 불러오기 시 콘텐츠 생성됨으로 마킹 (이벤트 위임 사용)
  const postsListContainer = document.getElementById('generated-posts-list');
  if (postsListContainer) {
    postsListContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // "불러오기" 버튼 클릭 감지 (클래스 또는 텍스트로)
      if (target.classList.contains('load-post-btn') ||
        target.closest('.load-post-btn') ||
        target.textContent?.includes('불러오기')) {
        setTimeout(markContentGenerated, 500);
      }
    });
  }

  // 전체 초기화 버튼 클릭 시 콘텐츠 클리어
  document.getElementById('global-refresh-btn')?.addEventListener('click', () => {
    setTimeout(markContentCleared, 500);
  });

  // 초기 상태 설정
  setTimeout(() => {
    syncPublishMode('full-auto');
  }, 1000);

  // 전역 함수로 노출 (다른 곳에서도 사용 가능)
  (window as any).markContentGenerated = markContentGenerated;
  (window as any).markContentCleared = markContentCleared;
  (window as any).updateAffiliateModeState = updateAffiliateModeState;
  (window as any).syncPublishMode = syncPublishMode;

  console.log('[ContentModeHelp] Content mode help modal and smart publish buttons initialized');
}

// ✅ 반자동 모드 섹션 접기/펼치기 토글

// ✅ 개선된 스마트 발행 버튼 가시성 로직
// ✅ 개선된 스마트 발행 버튼 가시성 로직 (통합됨 - updatePublishButtonVisibility 사용)
// (function initImprovedSmartPublish() {
//   console.log('[ImprovedSmartPublish] Improved smart publish logic integrated into updatePublishButtonVisibility');
//   // Conflict resolution: Logic moved to updatePublishButtonVisibility to prevent UI state flapping
// })();

// ✅ URL/키워드 탭 전환 함수
(window as any).switchGenerationTab = function (tab: 'url' | 'keyword'): void {
  const urlTab = document.getElementById('tab-url-btn');
  const keywordTab = document.getElementById('tab-keyword-btn');
  const urlContent = document.getElementById('tab-content-url');
  const keywordContent = document.getElementById('tab-content-keyword');

  if (!urlTab || !keywordTab || !urlContent || !keywordContent) return;

  if (tab === 'url') {
    // URL 탭 활성화
    urlTab.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
    urlTab.style.color = 'white';
    keywordTab.style.background = 'transparent';
    keywordTab.style.color = 'var(--text-muted)';
    urlContent.style.display = 'block';
    keywordContent.style.display = 'none';
  } else {
    // 키워드 탭 활성화
    keywordTab.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    keywordTab.style.color = 'white';
    urlTab.style.background = 'transparent';
    urlTab.style.color = 'var(--text-muted)';
    keywordContent.style.display = 'block';
    urlContent.style.display = 'none';
  }

  console.log('[TabSwitch] Switched to:', tab);
};

// ✅ 생성된 글 목록 접기/펼치기 토글
(window as any).togglePostsListSection = function (): void {
  const content = document.getElementById('posts-list-content');
  const icon = document.getElementById('posts-list-toggle-icon');
  const hint = document.getElementById('posts-list-toggle-hint');

  if (!content || !icon || !hint) return;

  const isCollapsed = content.style.display === 'none';

  if (isCollapsed) {
    content.style.display = 'block';
    icon.style.transform = 'rotate(180deg)';
    hint.textContent = '클릭하여 접기';
  } else {
    content.style.display = 'none';
    icon.style.transform = 'rotate(0deg)';
    hint.textContent = '클릭하여 펼치기';
  }
};

// ✅ 로그 섹션 접기/펼치기 토글
(window as any).toggleLogSection = function (): void {
  const content = document.getElementById('log-section-content');
  const icon = document.getElementById('log-section-toggle-icon');
  const hint = document.getElementById('log-section-toggle-hint');

  if (!content || !icon || !hint) return;

  const isCollapsed = content.style.display === 'none';

  if (isCollapsed) {
    content.style.display = 'block';
    icon.style.transform = 'rotate(180deg)';
    hint.textContent = '클릭하여 접기';
  } else {
    content.style.display = 'none';
    icon.style.transform = 'rotate(0deg)';
    hint.textContent = '클릭하여 펼치기';
  }
};

// ============================================
// ✅ 이미지 화질/모델 설정 UI 관리
// ============================================

export async function initImageQualitySettings(): Promise<void> {
  const toggleBtn = document.getElementById('toggle-image-quality-settings');
  const panel = document.getElementById('image-quality-settings-panel');
  const arrow = document.getElementById('image-quality-arrow');

  if (!toggleBtn || !panel || !arrow) return;

  console.log('[ImageQuality] UI 초기화 시작');

  // 1. 토글 기능
  toggleBtn.addEventListener('click', () => {
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  });

  // 2. 초기 설정 로드
  try {
    // configManager에서 설정 가져오기 (비동기)
    const config = await window.api.getConfig();
    console.log('[ImageQuality] 로드된 설정:', config);

    const defaults = {
      imageQualityMode: 'balanced',
      thumbnailImageModel: 'gemini-3-1-flash',  // ✅ [2026-03-01] 기본값 나노바나나2로 변경
      otherImagesModel: 'gemini-3-1-flash',  // ✅ [2026-03-01] 본문 이미지도 나노바나나2 기본
      lockThumbnailTo4K: false  // ✅ 4K 고정 해제
    };

    const settings = { ...defaults, ...config };

    // 화질 모드 라디오 버튼 설정
    const modeRadio = document.querySelector(`input[name="imageQualityMode"][value="${settings.imageQualityMode}"]`) as HTMLInputElement;
    if (modeRadio) modeRadio.checked = true;

    // 상세 설정 드롭다운 값 설정
    const thumbSelect = document.getElementById('thumbnail-model-select') as HTMLSelectElement;
    const bodySelect = document.getElementById('body-image-model-select') as HTMLSelectElement;
    if (thumbSelect) thumbSelect.value = settings.thumbnailImageModel || 'gemini-3-1-flash';  // ✅ 기본값 나노바나나2
    if (bodySelect) bodySelect.value = settings.otherImagesModel || 'gemini-2.5-flash';

    // 썸네일 고정 체크박스
    const lockCheckbox = document.getElementById('lock-thumbnail-4k') as HTMLInputElement;
    if (lockCheckbox) lockCheckbox.checked = settings.lockThumbnailTo4K !== false; // 기본값 true

    // 초기 UI 상태 업데이트 (커스텀 상세 설정 표시 여부 등)
    updateQualityUISubState(settings.imageQualityMode);

  } catch (e) {
    console.warn('[ImageQuality] 설정 로드 실패:', e);
  }

  // 3. UI 변경 이벤트 리스너 (설정 저장)

  // 화질 모드 변경
  document.querySelectorAll('input[name="imageQualityMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = (e.target as HTMLInputElement).value;
      updateQualityUISubState(mode);
      saveImageQualitySettings();
    });
  });

  // 상세 모델 변경
  document.getElementById('thumbnail-model-select')?.addEventListener('change', saveImageQualitySettings);
  document.getElementById('body-image-model-select')?.addEventListener('change', saveImageQualitySettings);
  document.getElementById('lock-thumbnail-4k')?.addEventListener('change', saveImageQualitySettings);
}

// UI 상태 업데이트 헬퍼
function updateQualityUISubState(mode: string): void {
  const customSettings = document.getElementById('custom-quality-settings');
  if (customSettings) {
    customSettings.style.display = mode === 'custom' ? 'block' : 'none';
  }

  // 패널이 닫혀있다면 모드가 변경되었을 때 자동으로 열기 (사용자 피드백)
  const panel = document.getElementById('image-quality-settings-panel');
  const arrow = document.getElementById('image-quality-arrow');
  if (panel && panel.style.display === 'none' && mode === 'custom') {
    panel.style.display = 'block';
    if (arrow) arrow.style.transform = 'rotate(180deg)';
  }
}

// 설정 저장 헬퍼
async function saveImageQualitySettings(): Promise<void> {
  const mode = (document.querySelector('input[name="imageQualityMode"]:checked') as HTMLInputElement)?.value || 'balanced';
  const thumbModel = (document.getElementById('thumbnail-model-select') as HTMLSelectElement)?.value;
  const bodyModel = (document.getElementById('body-image-model-select') as HTMLSelectElement)?.value;
  const lockThumb = (document.getElementById('lock-thumbnail-4k') as HTMLInputElement)?.checked;

  const newSettings = {
    imageQualityMode: mode,
    thumbnailImageModel: thumbModel,
    otherImagesModel: bodyModel,
    lockThumbnailTo4K: lockThumb
  };

  console.log('[ImageQuality] 설정 저장 중...', newSettings);

  try {
    await window.api.saveConfig(newSettings);
    // 토스트 메시지는 너무 빈번할 수 있으므로 생략하거나 console 로그만 남김
    console.log('[ImageQuality] 설정 저장 완료');
  } catch (e) {
    console.error('[ImageQuality] 설정 저장 실패:', e);
  }
}

// 초기화 실행
document.addEventListener('DOMContentLoaded', initImageQualitySettings);

// ✅ [2026-01-22] 예약 설정 도움말 모달
export function showScheduleHelpModal(): void {
  // 기존 모달이 있으면 제거
  const existingModal = document.getElementById('schedule-help-modal-overlay');
  if (existingModal) {
    existingModal.remove();
  }

  const overlay = document.createElement('div');
  overlay.id = 'schedule-help-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-radius: 16px;
    padding: 28px;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
  `;

  modal.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0; font-size: 22px; color: #4ade80;">📅 순차 예약 발행 가이드</h2>
      <button id="close-schedule-help" style="background: none; border: none; color: #fff; font-size: 24px; cursor: pointer; padding: 5px;">&times;</button>
    </div>

    <div style="background: rgba(74, 222, 128, 0.1); border-left: 4px solid #4ade80; padding: 12px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
      <strong>💡 TIP:</strong> 먼저 발행할 글을 대기열에 추가한 후 예약 설정을 진행하세요!
    </div>

    <div style="margin-bottom: 24px;">
      <h3 style="color: #60a5fa; margin-bottom: 12px; font-size: 16px;">📋 설정 순서</h3>
      <ol style="margin: 0; padding-left: 20px; line-height: 1.8;">
        <li><strong>발행 큐 세팅</strong> - 발행할 글들을 대기열에 추가</li>
        <li><strong>예약 설정 탭</strong>으로 이동</li>
        <li>아래 옵션들 설정 후 <strong>"대기열 전체에 순차 예약 적용"</strong> 클릭</li>
      </ol>
    </div>

    <div style="margin-bottom: 24px;">
      <h3 style="color: #60a5fa; margin-bottom: 12px; font-size: 16px;">⚙️ 옵션 설명</h3>
      
      <div style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 14px; margin-bottom: 12px;">
        <strong style="color: #fbbf24;">📅 예약 시작 일시</strong>
        <p style="margin: 8px 0 0; color: #d1d5db; font-size: 14px;">
          첫 번째 글의 발행 시간.<br>
          <span style="color: #4ade80;">비워두면 → 현재 시간부터 자동 시작!</span>
        </p>
      </div>

      <div style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 14px; margin-bottom: 12px;">
        <strong style="color: #fbbf24;">⏱️ 항목별 발행 간격</strong>
        <p style="margin: 8px 0 0; color: #d1d5db; font-size: 14px;">
          각 글 사이의 시간 간격 설정.<br>
          예: <code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">2시간</code> 선택 시 → 10:00, 12:00, 14:00 ...
        </p>
      </div>

      <div style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 14px;">
        <strong style="color: #fbbf24;">🎲 랜덤 시간 편차 적용</strong>
        <p style="margin: 8px 0 0; color: #d1d5db; font-size: 14px;">
          체크 시 각 발행에 <strong>±15분</strong> 랜덤 편차 추가.<br>
          <span style="color: #4ade80;">✓ 봇 감지 방지 효과!</span><br>
          예: 2시간 간격 → 실제로 1:45 ~ 2:15 사이로 분산됨
        </p>
      </div>
    </div>

    <div style="background: rgba(96, 165, 250, 0.1); border-left: 4px solid #60a5fa; padding: 12px; border-radius: 0 8px 8px 0;">
      <strong>📊 예시 (5개 글, 2시간 간격, 랜덤 ON)</strong>
      <div style="font-family: monospace; font-size: 13px; margin-top: 8px; color: #d1d5db;">
        1번 글: 10:08 (+8분 랜덤)<br>
        2번 글: 11:55 (-5분 랜덤)<br>
        3번 글: 14:12 (+12분 랜덤)<br>
        4번 글: 15:57 (-3분 랜덤)<br>
        5번 글: 18:07 (+7분 랜덤)
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // 닫기 이벤트
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  modal.querySelector('#close-schedule-help')?.addEventListener('click', () => {
    overlay.remove();
  });

  // ESC 키로 닫기
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}

// ✅ 전역으로 노출 (버튼 onclick에서 호출 가능)
(window as any).showScheduleHelpModal = showScheduleHelpModal;

// ✅ [2026-01-22] 예약 설정 모달 감지 및 도움말 버튼 자동 주입
export function injectScheduleHelpButton(container: Element): void {
  // 이미 버튼이 있으면 추가하지 않음
  if (container.querySelector('.schedule-help-btn-injected')) return;

  // "순차 예약 설정" 텍스트가 포함된 요소 찾기
  const headings = container.querySelectorAll('h2, h3, h4, .modal-title, div');
  let targetHeading: Element | null = null;

  for (const el of headings) {
    if (el.textContent?.includes('순차 예약') || el.textContent?.includes('예약 설정')) {
      targetHeading = el;
      break;
    }
  }

  if (targetHeading) {
    const helpBtn = document.createElement('button');
    helpBtn.className = 'schedule-help-btn-injected';
    helpBtn.innerHTML = '❓';
    helpBtn.title = '예약 발행 도움말';
    helpBtn.style.cssText = `
      margin-left: 10px;
      padding: 4px 10px;
      border: none;
      border-radius: 50%;
      background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
      color: white;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(74, 222, 128, 0.3);
    `;
    helpBtn.onmouseover = () => {
      helpBtn.style.transform = 'scale(1.1)';
      helpBtn.style.boxShadow = '0 4px 12px rgba(74, 222, 128, 0.5)';
    };
    helpBtn.onmouseout = () => {
      helpBtn.style.transform = 'scale(1)';
      helpBtn.style.boxShadow = '0 2px 8px rgba(74, 222, 128, 0.3)';
    };
    helpBtn.onclick = (e) => {
      e.stopPropagation();
      showScheduleHelpModal();
    };

    // 제목 옆에 버튼 추가 (또는 부모에 추가)
    if (targetHeading.parentElement) {
      targetHeading.parentElement.style.display = 'flex';
      targetHeading.parentElement.style.alignItems = 'center';
    }
    targetHeading.appendChild(helpBtn);
    console.log('[ScheduleHelp] ✅ 도움말 버튼 주입 완료');
  }
}

// ✅ MutationObserver로 모달 감지
const scheduleModalObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        // 모달이나 다이얼로그 감지
        if (
          node.classList.contains('modal') ||
          node.classList.contains('dialog') ||
          node.getAttribute('role') === 'dialog' ||
          node.querySelector('.modal-content') ||
          node.textContent?.includes('순차 예약') ||
          node.textContent?.includes('예약 설정') ||
          node.textContent?.includes('항목별 발행') ||
          node.textContent?.includes('대기열 전체')
        ) {
          setTimeout(() => injectScheduleHelpButton(node), 100);
        }
      }
    }
  }
});

// Observer 시작
scheduleModalObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// ✅ [2026-01-22] 연속 발행 예약 시간 자동 계산 및 적용 (window에 노출)
function calculateAndApplyScheduleTimes(options: {
  baseTime?: Date;
  intervalMinutes?: number;
  useRandomOffset?: boolean;
}): void {
  const {
    baseTime = new Date(),
    intervalMinutes = 120, // 기본 2시간
    useRandomOffset = true
  } = options;

  console.log('[ScheduleCalc] 예약 시간 계산 시작:', {
    baseTime: baseTime.toLocaleString(),
    intervalMinutes,
    useRandomOffset
  });

  // 대기열 아이템 (내부 변수 또는 DOM에서 찾기)
  const queueItems = document.querySelectorAll('[data-queue-item], .queue-item, .publishing-queue-item');

  if (queueItems.length === 0) {
    console.warn('[ScheduleCalc] 대기열 아이템을 찾지 못했습니다.');
    return;
  }

  queueItems.forEach((item, index) => {
    const offsetMinutes = index * intervalMinutes;
    // 랜덤 편차: ±15분
    const randomOffset = useRandomOffset ? Math.floor(Math.random() * 31) - 15 : 0;
    const scheduledTime = new Date(baseTime.getTime() + (offsetMinutes + randomOffset) * 60000);

    // ISO-like 문자열 생성
    const yyyy = scheduledTime.getFullYear();
    const mm = String(scheduledTime.getMonth() + 1).padStart(2, '0');
    const dd = String(scheduledTime.getDate()).padStart(2, '0');
    const hh = String(scheduledTime.getHours()).padStart(2, '0');
    const mi = String(scheduledTime.getMinutes()).padStart(2, '0');
    const scheduleStr = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;

    // 아이템에 데이터 속성 설정
    item.setAttribute('data-schedule-date', scheduleStr);
    item.setAttribute('data-publish-mode', 'schedule');

    console.log(`[ScheduleCalc] ${index + 1}번 글: ${scheduledTime.toLocaleString()} (${randomOffset >= 0 ? '+' : ''}${randomOffset}분 편차)`);
  });

  console.log('[ScheduleCalc] ✅ 모든 아이템에 예약 시간 적용 완료');
}

(window as any).calculateAndApplyScheduleTimes = calculateAndApplyScheduleTimes;

// ✅ [2026-01-22] collectFormData 강화 - 대기열 아이템의 예약 시간 읽기
(window as any).getScheduleDataFromQueueItem = function (index: number): { publishMode: string; scheduleDate: string } | null {
  const queueItems = document.querySelectorAll('[data-queue-item], .queue-item, .publishing-queue-item');
  const item = queueItems[index];

  if (item) {
    return {
      publishMode: item.getAttribute('data-publish-mode') || 'publish',
      scheduleDate: item.getAttribute('data-schedule-date') || ''
    };
  }
  return null;
};

console.log('[Renderer] ✅ 예약 설정 도움말 및 자동 주입 시스템 초기화 완료');

// ✅ [2026-01-22] 수동 썸네일 설정 함수 - 썸네일 생성기에서 호출
(window as any).setManualThumbnailForFullAuto = function (thumbnailData: {
  url: string;
  filePath?: string;
  heading?: string;
  provider?: string;
}): void {
  const manualThumbnail = {
    ...thumbnailData,
    heading: thumbnailData.heading || '썸네일',
    headingIndex: 0,
    isManualThumbnail: true, // ✅ 수동 썸네일 플래그
    source: 'thumbnail-generator', // ✅ 썸네일 생성기에서 설정됨
    isThumbnail: true,
  };

  // 기존 이미지 배열 가져오기
  const existingImages = (window as any).imageManagementGeneratedImages || [];

  // 첫 번째 이미지가 이미 수동 썸네일이면 교체, 아니면 앞에 추가
  if (existingImages.length > 0 && (existingImages[0]?.isManualThumbnail || existingImages[0]?.source === 'thumbnail-generator')) {
    existingImages[0] = manualThumbnail;
    console.log('[ManualThumbnail] ✅ 기존 수동 썸네일 교체');
  } else {
    existingImages.unshift(manualThumbnail);
    console.log('[ManualThumbnail] ✅ 수동 썸네일 추가 (기존 이미지 앞에 삽입)');
  }

  (window as any).imageManagementGeneratedImages = existingImages;
  console.log('[ManualThumbnail] 현재 이미지 개수:', existingImages.length);
};

// ✅ 수동 썸네일 제거 함수
(window as any).clearManualThumbnail = function (): void {
  const existingImages = (window as any).imageManagementGeneratedImages || [];

  if (existingImages.length > 0 && (existingImages[0]?.isManualThumbnail || existingImages[0]?.source === 'thumbnail-generator')) {
    existingImages.shift();
    (window as any).imageManagementGeneratedImages = existingImages;
    console.log('[ManualThumbnail] ✅ 수동 썸네일 제거됨');
  }
};

console.log('[Renderer] ✅ 수동 썸네일 설정 함수 등록 완료');

// ✅ [2026-01-25] 환경설정 닫기/저장 관련 로직은 priceInfoModal.ts로 이전됨

// ✅ [2026-01-25] 환경설정 모달 닫기 전역 함수
(window as any).closeSettingsModal = function (): void {
  const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
  if (settingsModal) {
    settingsModal.setAttribute('aria-hidden', 'true');
    settingsModal.style.display = 'none';
  }
  console.log('[Settings] 환경설정 모달 닫힘');
};

console.log('[Renderer] ✅ 환경설정 저장/닫기 함수 등록 완료');

setTimeout(() => {
  try {
    if (typeof (window as any).injectDeepInfraImageSourceOption === 'function') {
      (window as any).injectDeepInfraImageSourceOption();
    }
  } catch (e) {
    console.warn('[DeepInfra] 버튼 삽입 실패:', e);
  }
}, 1000);

// ✅ [2026-01-27] 모든 모달을 body 직속으로 자동 이동 (position:fixed 정상 작동을 위해)
// - 부모 요소에 transform/filter 속성이 있으면 position:fixed가 깨지는 문제 해결
// - 동적으로 생성되는 모달(풀오토 다중계정, 연속발행 등)도 자동 처리
const modalMoveObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
      const target = mutation.target as HTMLElement;
      // modal-backdrop 클래스를 가진 요소가 display:flex로 변경될 때
      if (target.classList.contains('modal-backdrop') &&
        target.style.display === 'flex' &&
        target.parentElement !== document.body) {
        console.log('[ModalFix] 모달을 body로 이동:', target.id || target.className);
        document.body.appendChild(target);
      }
    }
    // 새로 추가된 노드 중 modal-backdrop 확인
    mutation.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement && node.classList.contains('modal-backdrop')) {
        if (node.parentElement !== document.body) {
          console.log('[ModalFix] 새 모달을 body로 이동:', node.id || node.className);
          document.body.appendChild(node);
        }
      }
    });
  });
});

// 전체 document 관찰
modalMoveObserver.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['style']
});

console.log('[Renderer] ✅ 모달 자동 body 이동 Observer 등록 완료');

