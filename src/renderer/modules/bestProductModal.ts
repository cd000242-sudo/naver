/**
 * 🛒 베스트 상품 수집기 모달 — 프론트엔드 이벤트 핸들러
 * 
 * @module renderer/modules/bestProductModal
 * @created 2026-03-13
 */

declare const toastManager: any;

// 네이버 카테고리 매핑 (플랫폼 전환 시 카테고리 변경)
const NAVER_CATEGORY_OPTIONS = `
  <option value="all" style="background:#1a1a2e;">🔥 전체 인기상품</option>
  <option value="fashion" style="background:#1a1a2e;">👗 패션의류</option>
  <option value="beauty" style="background:#1a1a2e;">💄 화장품/미용</option>
  <option value="digital" style="background:#1a1a2e;">📱 디지털/가전</option>
  <option value="food" style="background:#1a1a2e;">🍔 식품</option>
  <option value="living" style="background:#1a1a2e;">🏠 생활/건강</option>
  <option value="baby" style="background:#1a1a2e;">👶 출산/육아</option>
  <option value="sports" style="background:#1a1a2e;">⚽ 스포츠/레저</option>
`;

const COUPANG_CATEGORY_OPTIONS = `
  <option value="all" style="background:#1a1a2e;">🏆 전체 베스트</option>
  <option value="electronics" style="background:#1a1a2e;">📱 가전·디지털</option>
  <option value="fashion" style="background:#1a1a2e;">👗 패션의류</option>
  <option value="beauty" style="background:#1a1a2e;">💄 뷰티</option>
  <option value="food" style="background:#1a1a2e;">🍔 식품</option>
  <option value="home" style="background:#1a1a2e;">🏠 홈·인테리어</option>
  <option value="sports" style="background:#1a1a2e;">⚽ 스포츠·레저</option>
  <option value="baby" style="background:#1a1a2e;">👶 출산·유아동</option>
  <option value="pet" style="background:#1a1a2e;">🐕 반려동물</option>
  <option value="kitchen" style="background:#1a1a2e;">🍳 주방용품</option>
  <option value="health" style="background:#1a1a2e;">💊 건강·의료</option>
`;

export function initBestProductModal(): void {
  console.log('[BestProductModal] 📦 모듈 로드됨!');

  const fetchBtn = document.getElementById('best-product-fetch-btn');
  const clearCacheBtn = document.getElementById('best-product-clear-cache-btn');
  const platformSelect = document.getElementById('best-product-platform') as HTMLSelectElement | null;
  const categorySelect = document.getElementById('best-product-category') as HTMLSelectElement | null;

  if (!fetchBtn) {
    console.warn('[BestProductModal] ⚠️ 수집 버튼을 찾을 수 없습니다.');
    return;
  }

  // ✅ 플랫폼 변경 시 카테고리 옵션 교체
  platformSelect?.addEventListener('change', () => {
    if (!categorySelect) return;
    const platform = platformSelect.value;
    categorySelect.innerHTML = platform === 'naver' ? NAVER_CATEGORY_OPTIONS : COUPANG_CATEGORY_OPTIONS;
  });

  // ✅ 수집 버튼 클릭
  fetchBtn.addEventListener('click', async () => {
    const platform = platformSelect?.value || 'coupang';
    const category = categorySelect?.value || 'all';
    // ✅ [2026-03-13] AdsPower 토글 상태 읽기
    const adsPowerToggle = document.getElementById('best-product-adspower-toggle') as HTMLInputElement | null;
    const useAdsPower = adsPowerToggle?.checked || false;

    console.log(`[BestProductModal] 수집 시작: ${platform} / ${category} / AdsPower: ${useAdsPower}`);

    // UI 상태 전환
    showLoading(platform);

    try {
      let result: any;

      if (platform === 'coupang') {
        result = await (window as any).api.fetchCoupangBest(category, 20, useAdsPower);
      } else {
        result = await (window as any).api.fetchNaverBest(category, 20, useAdsPower);
      }

      if (result && result.success && result.products && result.products.length > 0) {
        renderProducts(result.products, result.categoryName, result.platform);
        toastManager?.success(`🛒 ${result.categoryName}: ${result.products.length}개 수집 완료!`);
      } else {
        showEmpty(`수집된 상품이 없습니다. ${result?.error || '다른 카테고리를 시도해보세요.'}`);
        toastManager?.warning('상품을 찾지 못했습니다. IP 변경 필요할 수 있습니다.');
      }
    } catch (error) {
      console.error('[BestProductModal] 수집 오류:', error);
      showEmpty(`수집 중 오류가 발생했습니다: ${(error as Error).message}`);
      toastManager?.error('수집 실패! 네트워크 상태를 확인하세요.');
    }
  });

  // ✅ 캐시 초기화 버튼
  clearCacheBtn?.addEventListener('click', async () => {
    try {
      await (window as any).api.clearBestProductCache();
      toastManager?.success('🔄 캐시가 초기화되었습니다.');
    } catch (error) {
      console.error('[BestProductModal] 캐시 초기화 오류:', error);
    }
  });

  // ✅ 모달 백드롭 클릭으로 닫기
  const modal = document.getElementById('best-product-modal');
  modal?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'best-product-modal') {
      modal.style.display = 'none';
    }
  });

  // ✅ AdsPower 토글 초기화
  initAdsPowerToggle();

  console.log('[BestProductModal] ✅ 초기화 완료');
}

/** AdsPower 토글 UI 초기화 + CSS + 이벤트 */
function initAdsPowerToggle(): void {
  const toggle = document.getElementById('best-product-adspower-toggle') as HTMLInputElement | null;
  const dot = document.getElementById('adspower-toggle-dot');
  const benefitBar = document.getElementById('adspower-benefit-bar');
  const offHint = document.getElementById('adspower-off-hint');
  
  if (!toggle) return;

  // localStorage에서 이전 설정 복원
  const saved = localStorage.getItem('adspower_enabled');
  const isEnabled = saved === 'true';
  toggle.checked = isEnabled;
  
  // 초기 상태 반영
  updateToggleUI(isEnabled, dot, benefitBar, offHint);
  
  // ✅ 앱 시작 시 백엔드에도 초기 설정 동기화
  (window as any).api?.setAdsPowerEnabled?.(isEnabled);

  // 토글 변경 시 UI + localStorage + 백엔드 IPC 동기화
  toggle.addEventListener('change', () => {
    const checked = toggle.checked;
    localStorage.setItem('adspower_enabled', checked ? 'true' : 'false');
    updateToggleUI(checked, dot, benefitBar, offHint);
    
    // ✅ 백엔드(crawlerBrowser)에 설정 동기화
    (window as any).api?.setAdsPowerEnabled?.(checked);
    
    if (checked) {
      toastManager?.success('🌐 AdsPower 모드 활성! 크롤링 시 지문 마스킹 브라우저를 사용합니다.');
    } else {
      toastManager?.info('⚡ 일반 모드로 전환. HTTP 요청으로 수집합니다.');
    }
  });
}

function updateToggleUI(
  isEnabled: boolean,
  dot: HTMLElement | null,
  benefitBar: HTMLElement | null,
  offHint: HTMLElement | null
): void {
  if (dot) {
    dot.style.left = isEnabled ? '22px' : '2px';
    dot.style.background = isEnabled ? '#22c55e' : '#fff';
  }
  // 토글 배경색 변경
  const toggleBg = dot?.previousElementSibling as HTMLElement | null;
  if (toggleBg) {
    toggleBg.style.background = isEnabled
      ? 'rgba(34,197,94,0.4)'
      : 'rgba(255,255,255,0.1)';
  }
  if (benefitBar) benefitBar.style.display = isEnabled ? 'flex' : 'none';
  if (offHint) offHint.style.display = isEnabled ? 'none' : 'flex';
}

// =============================================
// UI 상태 관리
// =============================================

function showLoading(platform: string): void {
  const empty = document.getElementById('best-product-empty');
  const loading = document.getElementById('best-product-loading');
  const grid = document.getElementById('best-product-grid');
  const detail = document.getElementById('best-product-loading-detail');

  if (empty) empty.style.display = 'none';
  if (loading) loading.style.display = 'block';
  if (grid) { grid.style.display = 'none'; grid.innerHTML = ''; }
  if (detail) detail.textContent = platform === 'coupang' ? '쿠팡 베스트셀러 수집 중...' : '네이버 인기상품 수집 중...';
}

function showEmpty(message: string): void {
  const empty = document.getElementById('best-product-empty');
  const loading = document.getElementById('best-product-loading');
  const grid = document.getElementById('best-product-grid');

  if (loading) loading.style.display = 'none';
  if (grid) grid.style.display = 'none';
  if (empty) {
    empty.style.display = 'block';
    const h3 = empty.querySelector('h3');
    const p = empty.querySelector('p');
    if (h3) h3.textContent = '수집 결과가 없습니다';
    if (p) p.innerHTML = message;
  }
}

function renderProducts(products: any[], categoryName: string, platform: string): void {
  const empty = document.getElementById('best-product-empty');
  const loading = document.getElementById('best-product-loading');
  const grid = document.getElementById('best-product-grid');

  if (empty) empty.style.display = 'none';
  if (loading) loading.style.display = 'none';
  if (!grid) return;

  grid.style.display = 'grid';

  // 요약 바
  const now = new Date();
  const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  let html = `
    <div class="bp-summary" style="grid-column: 1 / -1;">
      <div class="bp-summary-item">📋 <strong>${categoryName}</strong></div>
      <div class="bp-summary-item">📦 <strong>${products.length}</strong>개 수집</div>
      <div class="bp-summary-item">⏰ ${timeStr} 기준</div>
      <div class="bp-summary-item" style="margin-left:auto;">
        <span style="font-size:0.7rem;color:rgba(255,255,255,0.3);">💡 상품 클릭 → URL 자동 입력 → 바로 글 생성</span>
      </div>
    </div>
  `;

  // 상품 카드
  products.forEach((product: any, index: number) => {
    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
    const imgSrc = product.imageUrl || '';
    const name = escapeHtml(product.name || '상품명 없음');
    const price = product.price || '가격 정보 없음';
    const url = product.productUrl || '';
    const reviewCount = product.reviewCount || 0;
    const rating = product.rating || 0;

    html += `
      <div class="bp-card" data-url="${escapeHtml(url)}" data-name="${escapeHtml(product.name || '')}">
        <div class="bp-card-rank ${rankClass}">${index + 1}위</div>
        ${imgSrc 
          ? `<img class="bp-card-img" src="${escapeHtml(imgSrc)}" alt="${name}" loading="lazy" onerror="this.style.display='none';">`
          : `<div class="bp-card-img" style="display:flex;align-items:center;justify-content:center;font-size:2rem;color:rgba(255,255,255,0.2);">🛒</div>`
        }
        <div class="bp-card-body">
          <div class="bp-card-name">${name}</div>
          <div class="bp-card-price">${escapeHtml(price)}</div>
          <div class="bp-card-meta">
            ${platform === 'coupang' ? '🛒 쿠팡' : '🔍 네이버'}
            ${reviewCount > 0 ? `· 리뷰 ${reviewCount.toLocaleString()}개` : ''}
            ${rating > 0 ? `· ⭐ ${rating}` : ''}
          </div>
        </div>
        <div class="bp-card-actions">
          <button class="bp-action-btn bp-action-use" onclick="event.stopPropagation(); useBestProduct('${escapeHtml(url)}', '${escapeJs(product.name || '')}');">
            ✍️ 이 상품으로 글쓰기
          </button>
          <button class="bp-action-btn bp-action-open" onclick="event.stopPropagation(); window.api?.openExternalUrl('${escapeHtml(url)}');">
            🔗 보기
          </button>
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
}

// =============================================
// 글쓰기 연동
// =============================================

// 전역에 등록
(window as any).useBestProduct = function(url: string, name: string): void {
  console.log(`[useBestProduct] 상품 글쓰기 연동 시작: "${name.substring(0, 30)}..." / URL: ${url}`);

  // 1. 모달 닫기
  const modal = document.getElementById('best-product-modal');
  if (modal) modal.style.display = 'none';

  // 2. ✅ 콘텐츠 모드 → "쇼핑 커넥트" (affiliate) 자동 전환
  const contentModeSelect = document.getElementById('unified-content-mode') as HTMLSelectElement | null;
  if (contentModeSelect) {
    contentModeSelect.value = 'shopping-connect';
    contentModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[useBestProduct] ✅ 콘텐츠 모드 → 쇼핑 커넥트 설정 완료');
  }

  // 모드 버튼 UI도 동기화 (선택 상태 시각적 반영)
  const modeButtons = document.querySelectorAll('.unified-mode-btn');
  modeButtons.forEach(btn => {
    const btnEl = btn as HTMLElement;
    if (btnEl.dataset.mode === 'affiliate' || btnEl.dataset.mode === 'shopping-connect') {
      btnEl.classList.add('selected');
    } else {
      btnEl.classList.remove('selected');
    }
  });

  // 쇼핑 커넥트 설정 영역 표시
  const shoppingSettings = document.getElementById('shopping-connect-settings');
  if (shoppingSettings) {
    shoppingSettings.style.display = 'block';
    console.log('[useBestProduct] ✅ 쇼핑 커넥트 설정 영역 표시');
  }

  // 3. ✅ 카테고리 → "상품리뷰" 자동 선택
  const categorySelect = document.getElementById('real-blog-category-select') as HTMLSelectElement | null;
  if (categorySelect) {
    // "상품리뷰" 옵션 찾기
    const options = Array.from(categorySelect.options);
    const reviewOption = options.find(opt =>
      opt.text.includes('상품리뷰') || opt.value.includes('상품리뷰')
    );
    if (reviewOption) {
      categorySelect.value = reviewOption.value;
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[useBestProduct] ✅ 카테고리 → "${reviewOption.text}" 설정 완료`);
    } else {
      console.warn('[useBestProduct] ⚠️ "상품리뷰" 카테고리를 찾을 수 없습니다. 사용 가능한 카테고리:', options.map(o => o.text));
    }
  }

  // 카테고리 드롭다운 UI 텍스트도 동기화
  const categoryDropdownText = document.getElementById('real-category-dropdown-text');
  if (categoryDropdownText) {
    categoryDropdownText.textContent = '상품리뷰';
  }

  // 4. ✅ URL 입력 필드에 상품 URL 자동 삽입
  // 기존 shopping-url-input
  const shoppingUrlInput = document.getElementById('shopping-url-input') as HTMLInputElement | null;
  if (shoppingUrlInput) {
    shoppingUrlInput.value = url;
    shoppingUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
    shoppingUrlInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 통합 URL 입력 (.unified-url-input 첫 번째)
  const unifiedUrlInput = document.querySelector('.unified-url-input') as HTMLInputElement | null;
  if (unifiedUrlInput) {
    unifiedUrlInput.value = url;
    unifiedUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
    unifiedUrlInput.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[useBestProduct] ✅ URL 입력 필드에 상품 URL 삽입 완료');
  }

  // 5. ✅ 제휴링크 필드에 상품 URL 자동 삽입
  const affiliateLinkInput = document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement | null;
  if (affiliateLinkInput) {
    affiliateLinkInput.value = url;
    affiliateLinkInput.dispatchEvent(new Event('input', { bubbles: true }));
    affiliateLinkInput.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[useBestProduct] ✅ 제휴링크 필드에 상품 URL 삽입 완료');
  }

  // 6. 키워드 입력에 상품명 삽입
  const keywordInput = document.getElementById('keyword-input') as HTMLInputElement | null;
  if (keywordInput && name) {
    const shortName = name.length > 30 ? name.substring(0, 30) : name;
    keywordInput.value = shortName;
    keywordInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 통합 키워드 입력에도 삽입
  const unifiedKeywords = document.getElementById('unified-keywords') as HTMLInputElement | null;
  if (unifiedKeywords && name) {
    const shortName = name.length > 30 ? name.substring(0, 30) : name;
    unifiedKeywords.value = shortName;
    unifiedKeywords.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 7. 쇼핑 커넥트 컨테이너 표시 (레거시)
  const shoppingContainer = document.getElementById('image-shopping-url-container');
  if (shoppingContainer) {
    shoppingContainer.style.display = 'block';
  }

  toastManager?.success(`🛒 "${name.substring(0, 30)}..." 상품이 자동 설정되었습니다!\n📂 카테고리: 상품리뷰 | 🔗 모드: 쇼핑 커넥트 | ✅ URL & 제휴링크 삽입 완료`);
  console.log('[useBestProduct] ✅ 모든 자동 연동 완료');
};

// =============================================
// 유틸리티
// =============================================

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeJs(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
