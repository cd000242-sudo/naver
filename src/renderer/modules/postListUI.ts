// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 발행 글 목록 UI 모듈
// renderer.ts에서 추출된 글 목록 표시/검색/필터/재사용 기능
// ═══════════════════════════════════════════════════════════════════

// ✅ renderer.ts의 전역 변수/함수 참조 (인라인 빌드에서 동일 스코프)
declare let currentStructuredContent: any;
declare let generatedImages: any[];
declare const ImageManager: any;
declare const toastManager: any;
declare const UnifiedDOMCache: any;
declare const GENERATED_POSTS_KEY: string;
declare const BL_GENERATED_POSTS: string;
declare const GENERATED_POSTS_CATEGORY_COLLAPSE_PREFIX: string;
declare let isGalleryView: boolean;
declare let currentPostId: string;
declare function appendLog(msg: string): void;
declare function escapeHtml(str: string): string;
declare function getScheduleDateFromInput(inputId: string): string | undefined;
declare function loadGeneratedPosts(): any[];
declare function loadAllGeneratedPosts(): any[];
declare function loadGeneratedPost(postId: string): any;
declare function saveGeneratedPosts(posts: any[]): void;
declare function normalizeGeneratedPostCategoryKey(key: string): string;
declare function getGeneratedPostCategoryLabel(key: string): string;
declare function isGeneratedPostCategoryCollapsed(key: string): boolean;
declare function setGeneratedPostCategoryCollapsed(key: string, collapsed: boolean): void;
declare function getRequiredImageBasePath(): Promise<string>;
declare function updateUnifiedImagePreview(headings: any[], images: any[]): void;
declare function displayGeneratedImages(images: any[]): void;
declare function updateUnifiedPreview(content: any): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function syncHeadingVideoInPromptItems(): void;
declare function syncHeadingVideoSlotsInUnifiedPreview(): void;
declare function showFolderSelectionModal(options?: any): Promise<void>;
declare function loadImagesFromFolder(postId: string): Promise<any[]>;
declare function previewGeneratedPost(postId: string): void;
declare function copyGeneratedPost(postId: string): void;
declare function openPostImageFolder(postId: string): void;
declare function deleteGeneratedPost(postId: string): void;
declare function toFileUrlMaybe(path: string): string;
declare function normalizeReadableBodyText(text: string): string;
declare function hydrateImageManagerFromImages(images: any, headings?: any): void;
declare function autoGenerateCTA(content?: any): void;
declare function updateRiskIndicators(content?: any): void;

export function refreshGeneratedPostsList(): void {
  const listContainer = document.getElementById('generated-posts-list');
  const searchInput = document.getElementById('posts-search-input') as HTMLInputElement;
  const filterSelect = document.getElementById('posts-filter-select') as HTMLSelectElement;
  const sortSelect = document.getElementById('posts-sort-select') as HTMLSelectElement;
  const countBadge = document.getElementById('posts-count-badge');

  if (!listContainer) return;

  // ✅ [2026-01-23 FIX] 모든 계정의 글을 표시 (계정별 분리로 인해 안 보이는 문제 해결)
  let posts = loadAllGeneratedPosts();
  const totalCount = posts.length;

  // ✅ 통계 정보 계산
  // ✅ [2026-02-04] 방어 코드 추가: content/images가 undefined인 경우 처리
  const totalImages = posts.reduce((sum, p) => sum + (p.images?.length || 0), 0);
  const totalChars = posts.reduce((sum, p) => sum + (p.content?.length || 0), 0);
  const avgChars = totalCount > 0 ? Math.round(totalChars / totalCount) : 0;
  const publishedCount = posts.filter(p => p.publishedUrl).length;

  // ✅ 필터링
  if (filterSelect) {
    const filterValue = filterSelect.value;
    switch (filterValue) {
      case 'with-images':
        posts = posts.filter(p => p.images && p.images.length > 0);
        break;
      case 'without-images':
        posts = posts.filter(p => !p.images || p.images.length === 0);
        break;
      case 'with-headings':
        posts = posts.filter(p => p.headings && p.headings.length > 0);
        break;
      case 'without-headings':
        posts = posts.filter(p => !p.headings || p.headings.length === 0);
        break;
      case 'favorites':
        posts = posts.filter(p => p.isFavorite);
        break;
      case 'published':
        posts = posts.filter(p => p.publishedUrl);
        break;
      case 'unpublished':
        posts = posts.filter(p => !p.publishedUrl);
        break;
    }
  }

  // 검색 필터링 (검색어 하이라이트를 위해 검색어 저장)
  let searchTerm = '';
  if (searchInput && searchInput.value.trim()) {
    searchTerm = searchInput.value.trim().toLowerCase();
    posts = posts.filter(post =>
      (post.title || '').toLowerCase().includes(searchTerm) ||
      (post.content || '').toLowerCase().includes(searchTerm) ||
      (post.hashtags || []).some((tag: any) => (tag || '').toLowerCase().includes(searchTerm))
    );
  }

  // 정렬
  if (sortSelect) {
    const sortValue = sortSelect.value;
    posts.sort((a, b) => {
      switch (sortValue) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'title-asc':
          return (a.title || '').localeCompare(b.title || '', 'ko');
        case 'title-desc':
          return (b.title || '').localeCompare(a.title || '', 'ko');
        case 'updated':
          const aUpdated = a.updatedAt ? new Date(a.updatedAt).getTime() : new Date(a.createdAt).getTime();
          const bUpdated = b.updatedAt ? new Date(b.updatedAt).getTime() : new Date(b.createdAt).getTime();
          return bUpdated - aUpdated;
        case 'content-length':
          return b.content.length - a.content.length;
        default:
          return 0;
      }
    });
  }

  // ✅ 개수 및 통계 표시
  if (countBadge) {
    const statsText = totalCount > 0
      ? `${posts.length}/${totalCount} | 🖼️${totalImages} | 📄${avgChars.toLocaleString()}자 평균 | 📤${publishedCount}`
      : '0';
    countBadge.textContent = statsText;
    countBadge.style.fontSize = '0.7rem';
    countBadge.style.padding = '0.25rem 0.5rem';
  }

  if (posts.length === 0) {
    listContainer.innerHTML = '<div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 2rem;">생성된 글이 없습니다.</div>';
    return;
  }

  // ✅ 검색어 하이라이트 함수
  const highlightText = (text: string, term: string): string => {
    if (!term) return text;
    const regex = new RegExp(`(${term})`, 'gi');
    return text.replace(regex, '<mark style="background: #fef08a; padding: 0.1rem 0.2rem; border-radius: 2px;">$1</mark>');
  };

  const renderGalleryItem = (post: any): string => {
    const firstImage = post.images && post.images.length > 0 ? post.images[0] : null;
    const thumbnailImage = firstImage
      ? (firstImage.previewDataUrl || firstImage.filePath || firstImage.url)
      : null;
    const highlightedTitle = searchTerm ? highlightText(post.title || '(제목 없음)', searchTerm) : (post.title || '(제목 없음)');

    return `
        <div class="post-item-gallery" data-post-id="${post.id}" style="background: var(--bg-secondary); border-radius: 8px; border: 1px solid ${post.isFavorite ? '#fbbf24' : 'var(--border-light)'}; overflow: hidden; cursor: pointer; transition: all 0.2s; position: relative;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
          <input type="checkbox" class="post-checkbox" data-post-id="${post.id}" style="position: absolute; top: 0.5rem; left: 0.5rem; width: 18px; height: 18px; cursor: pointer; z-index: 10;" onchange="event.stopPropagation(); updateBatchDeleteButton();">
          ${post.isFavorite ? '<div style="position: absolute; top: 0.5rem; right: 0.5rem; font-size: 1.25rem; z-index: 10;">⭐</div>' : ''}
          ${post.publishedUrl ? (() => { const pm = (post as any).publishMode; const badgeBg = pm === 'draft' ? '#3b82f6' : pm === 'schedule' ? '#8b5cf6' : '#10b981'; const badgeText = pm === 'draft' ? '📝 임시발행됨' : pm === 'schedule' ? '📅 예약발행됨' : '✅ 발행됨'; return `<div style="position: absolute; top: 0.5rem; left: 2rem; background: ${badgeBg}; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; z-index: 10; cursor: pointer;" onclick="event.stopPropagation(); window.open('${post.publishedUrl}', '_blank');">${badgeText}</div>`; })() : ''}
          ${thumbnailImage ? `
            <div class="thumbnail-container" style="width: 100%; height: 200px; overflow: hidden; background: var(--bg-tertiary); cursor: pointer;" onclick="event.stopPropagation(); showImageModal('${thumbnailImage}');">
              <img src="${thumbnailImage}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:3rem;color:var(--text-muted)\\'>🖼️</div>';" />
            </div>
          ` : '<div style="width: 100%; height: 200px; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 3rem; color: var(--text-muted);">📄</div>'}
          <div style="padding: 1rem;">
            <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.5rem; font-size: 1rem; word-break: break-word; line-height: 1.4;">${highlightedTitle}</div>
            <div style="display: flex; gap: 0.75rem; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem; flex-wrap: wrap;">
              <span>📄 ${(post.content?.length || 0).toLocaleString()}자</span>
              <span>🖼️ ${post.images?.length || 0}개</span>
              <span>📑 ${post.headings?.length || 0}개</span>
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              ${post.publishedUrl ? `<button type="button" class="open-url-btn" data-url="${post.publishedUrl}" style="flex: 1; padding: 0.5rem; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem; white-space: nowrap;" title="발행된 글 열기">🔗 바로가기</button>` : ''}
              <button type="button" class="load-post-btn" data-post-id="${post.id}" style="flex: 1; padding: 0.5rem; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem; white-space: nowrap;">📂 불러오기</button>
              <button type="button" class="preview-post-btn" data-post-id="${post.id}" style="flex: 1; padding: 0.5rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 4px; cursor: pointer; font-size: 0.875rem; white-space: nowrap;">👁️ 미리보기</button>
            </div>
          </div>
        </div>
      `;
  };

  const renderListItem = (post: any): string => {
    const date = new Date(post.createdAt);
    const dateStr = date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const updatedDateStr = post.updatedAt
      ? new Date(post.updatedAt).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
      : null;

    // ✅ [2026-02-04] post.content가 undefined일 경우 방어
    const safeContent = post.content || '';
    const contentPreview = safeContent.length > 100
      ? safeContent.substring(0, 100) + '...'
      : safeContent;

    const firstImage = post.images && post.images.length > 0 ? post.images[0] : null;
    const thumbnailImage = firstImage
      ? (firstImage.previewDataUrl || firstImage.filePath || firstImage.url)
      : null;

    const highlightedTitle = searchTerm ? highlightText(post.title || '(제목 없음)', searchTerm) : (post.title || '(제목 없음)');
    const highlightedPreview = searchTerm ? highlightText(contentPreview, searchTerm) : contentPreview;

    return `
      <div class="post-item" data-post-id="${post.id}" style="padding: 1rem; margin-bottom: 0.75rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid ${post.isFavorite ? '#fbbf24' : 'var(--border-light)'}; transition: all 0.2s; cursor: pointer; position: relative;" onmouseover="this.style.borderColor='var(--primary)'; this.style.boxShadow='0 2px 8px rgba(59, 130, 246, 0.2)'" onmouseout="this.style.borderColor='${post.isFavorite ? '#fbbf24' : 'var(--border-light)'}'; this.style.boxShadow='none'">
        <input type="checkbox" class="post-checkbox" data-post-id="${post.id}" style="position: absolute; top: 0.5rem; left: 0.5rem; width: 18px; height: 18px; cursor: pointer; z-index: 10;" onchange="event.stopPropagation(); updateBatchDeleteButton();">
        ${post.isFavorite ? '<div style="position: absolute; top: 0.5rem; right: 0.5rem; font-size: 1.25rem;">⭐</div>' : ''}
        ${post.publishedUrl ? (() => { const pm = (post as any).publishMode; const badgeBg = pm === 'draft' ? '#3b82f6' : pm === 'schedule' ? '#8b5cf6' : '#10b981'; const badgeText = pm === 'draft' ? '📝 임시발행됨' : pm === 'schedule' ? '📅 예약발행됨' : '✅ 발행됨'; return `<div style="position: absolute; top: 0.5rem; left: 2rem; background: ${badgeBg}; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; cursor: pointer;" onclick="event.stopPropagation(); window.open('${post.publishedUrl}', '_blank');" title="클릭하여 발행된 글 열기">${badgeText}</div>`; })() : ''}
        <div style="display: flex; align-items: start; justify-content: space-between; gap: 1rem;">
          ${thumbnailImage ? `
            <div class="thumbnail-container" style="flex-shrink: 0; width: 120px; height: 80px; border-radius: 4px; overflow: hidden; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="event.stopPropagation(); showImageModal('${thumbnailImage}');">
              <img src="${thumbnailImage}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='🖼️';" />
            </div>
          ` : ''}
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.5rem; font-size: 1rem; word-break: break-word;">${highlightedTitle}</div>
            <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">
              생성: ${dateStr}${updatedDateStr && updatedDateStr !== dateStr ? ` | 수정: ${updatedDateStr}` : ''}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem; line-height: 1.4; opacity: 0.8;">${highlightedPreview}</div>
            <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-muted); flex-wrap: wrap;">
              <span>📄 ${(post.content?.length || 0).toLocaleString()}자</span>
              <span>📑 ${post.headings?.length || 0}개 소제목</span>
              <span>🖼️ ${post.images?.length || 0}개 이미지</span>
              ${(post.hashtags?.length || 0) > 0 ? `<span>🏷️ ${(post.hashtags || []).slice(0, 3).join(', ')}${(post.hashtags?.length || 0) > 3 ? '...' : ''}</span>` : ''}
              ${post.publishedUrl ? (() => { const pm = (post as any).publishMode; const statusColor = pm === 'draft' ? '#3b82f6' : pm === 'schedule' ? '#8b5cf6' : '#10b981'; const statusText = pm === 'draft' ? '📝 임시발행됨' : pm === 'schedule' ? '📅 예약발행됨' : '✅ 발행됨'; return `<span style="color: ${statusColor}; cursor: pointer; text-decoration: underline;" onclick="event.stopPropagation(); window.open('${post.publishedUrl}', '_blank');" title="클릭하여 발행된 글 열기">${statusText}</span>`; })() : '<span style="color: var(--text-muted);">⏳ 미발행</span>'}
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; flex-shrink: 0;">
            ${post.publishedUrl ? `<button type="button" class="open-url-btn" data-url="${post.publishedUrl}" style="padding: 0.5rem 1rem; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem; white-space: nowrap;" title="발행된 글 열기">🔗 바로가기</button>` : ''}
            <button type="button" class="favorite-post-btn" data-post-id="${post.id}" style="padding: 0.5rem 1rem; background: ${post.isFavorite ? '#fbbf24' : 'var(--bg-tertiary)'}; color: ${post.isFavorite ? 'white' : 'var(--text-strong)'}; border: 1px solid var(--border-light); border-radius: 4px; cursor: pointer; font-size: 0.875rem; white-space: nowrap;">${post.isFavorite ? '⭐ 즐겨찾기 해제' : '☆ 즐겨찾기'}</button>
            <button type="button" class="load-post-btn" data-post-id="${post.id}" style="padding: 0.5rem 1rem; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem; white-space: nowrap;">📂 불러오기</button>
            <button type="button" class="copy-post-btn" data-post-id="${post.id}" style="padding: 0.5rem 1rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 4px; cursor: pointer; font-size: 0.875rem; white-space: nowrap;">📋 복사</button>
            <button type="button" class="preview-post-btn" data-post-id="${post.id}" style="padding: 0.5rem 1rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 4px; cursor: pointer; font-size: 0.875rem; white-space: nowrap;">👁️ 미리보기</button>
            <button type="button" class="open-folder-btn" data-post-id="${post.id}" style="padding: 0.5rem 1rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 4px; cursor: pointer; font-size: 0.875rem; white-space: nowrap; display: ${post.images && post.images.length > 0 ? 'block' : 'none'};">📁 폴더 열기</button>
            <button type="button" class="reuse-images-btn" data-post-id="${post.id}" style="padding: 0.5rem 1rem; background: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem; white-space: nowrap; display: ${post.images && post.images.length > 0 ? 'block' : 'none'};" title="이 글의 이미지를 현재 작업에 재사용">🖼️ 이미지 재사용</button>
            <button type="button" class="delete-post-btn" data-post-id="${post.id}" style="padding: 0.5rem 1rem; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem; white-space: nowrap;">🗑️ 삭제</button>
          </div>
        </div>
      </div>
    `;
  };

  // ✅ [2026-02-26] 계정별 > 카테고리별 2단계 그룹핑
  const ACCOUNT_COLLAPSE_PREFIX = 'generated_posts_account_collapsed:';
  const isAccountCollapsed = (accountKey: string): boolean =>
    localStorage.getItem(`${ACCOUNT_COLLAPSE_PREFIX}${accountKey}`) === '1';
  const setAccountCollapsed = (accountKey: string, collapsed: boolean): void =>
    localStorage.setItem(`${ACCOUNT_COLLAPSE_PREFIX}${accountKey}`, collapsed ? '1' : '0');

  // 계정별 분류
  const accountMap = new Map<string, any[]>();
  for (const p of posts) {
    const acctKey = (p.naverId || '').trim().toLowerCase() || '__unassigned__';
    const arr = accountMap.get(acctKey) || [];
    arr.push(p);
    accountMap.set(acctKey, arr);
  }

  const uniqueAccounts = Array.from(accountMap.keys());
  const isMultiAccount = uniqueAccounts.length > 1 || (uniqueAccounts.length === 1 && uniqueAccounts[0] !== '__unassigned__' && accountMap.size > 0);

  // 카테고리 그룹 생성 헬퍼
  const buildCategoryGroups = (acctPosts: any[]) => {
    const catGroups = new Map<string, any[]>();
    for (const p of acctPosts) {
      const key = normalizeGeneratedPostCategoryKey((p as any)?.category);
      const arr = catGroups.get(key) || [];
      arr.push(p);
      catGroups.set(key, arr);
    }
    const entries = Array.from(catGroups.entries()).map(([key, items]) => ({
      key, label: getGeneratedPostCategoryLabel(key), items,
      collapsed: isGeneratedPostCategoryCollapsed(key),
    }));
    entries.sort((a, b) => {
      if (a.key === 'uncategorized' && b.key !== 'uncategorized') return 1;
      if (b.key === 'uncategorized' && a.key !== 'uncategorized') return -1;
      const diff = b.items.length - a.items.length;
      if (diff !== 0) return diff;
      return a.label.localeCompare(b.label, 'ko');
    });
    return entries;
  };

  // 카테고리 HTML 렌더링 헬퍼
  const renderCategoryGroupHtml = (g: { key: string; label: string; items: any[]; collapsed: boolean }) => {
    const icon = g.collapsed ? '▶' : '▼';
    const bodyStyle = g.collapsed ? 'display:none;' : 'display:block;';
    const bodyHtml = isGalleryView
      ? `<div class="posts-category-body" style="${bodyStyle}">
           <div class="posts-category-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem;">
             ${g.items.map(renderGalleryItem).join('')}
           </div>
         </div>`
      : `<div class="posts-category-body" style="${bodyStyle}">
           ${g.items.map(renderListItem).join('')}
         </div>`;
    return `
      <div class="posts-category-group" data-category-key="${escapeHtml(g.key)}" style="margin-bottom: 0.75rem;">
        <div class="posts-category-header" data-category-key="${escapeHtml(g.key)}" style="display:flex; align-items:center; justify-content:space-between; gap: 0.75rem; padding: 0.6rem 0.9rem; border-radius: 8px; background: var(--bg-tertiary); border: 1px solid var(--border-light); cursor: pointer; user-select: none;">
          <div style="display:flex; align-items:center; gap: 0.6rem; min-width: 0;">
            <span class="posts-category-toggle-icon" style="font-weight: 900; color: var(--text-strong);">${icon}</span>
            <div style="font-weight: 900; color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(g.label)}</div>
          </div>
          <div style="display:flex; align-items:center; gap: 0.5rem; flex-shrink: 0;">
            <span style="background: rgba(59,130,246,0.15); color: var(--text-strong); padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 900;">${g.items.length}개</span>
          </div>
        </div>
        ${bodyHtml}
      </div>`;
  };

  listContainer.style.display = 'block';
  listContainer.style.gridTemplateColumns = '';
  listContainer.style.gap = '';

  // 계정이 1개뿐이면(또는 모두 미지정) 기존처럼 카테고리만 표시
  if (uniqueAccounts.length <= 1) {
    const catGroups = buildCategoryGroups(posts);
    listContainer.innerHTML = catGroups.map(renderCategoryGroupHtml).join('');
  } else {
    // 다중 계정: 계정별 > 카테고리별 2단계
    const accountEntries = uniqueAccounts.map(acctKey => ({
      key: acctKey,
      label: acctKey === '__unassigned__' ? '📦 (계정 미지정)' : `📦 ${acctKey}`,
      posts: accountMap.get(acctKey) || [],
      collapsed: isAccountCollapsed(acctKey),
    }));
    // 정렬: 미지정을 맨 뒤, 나머지는 글 수 내림차순
    accountEntries.sort((a, b) => {
      if (a.key === '__unassigned__') return 1;
      if (b.key === '__unassigned__') return -1;
      return b.posts.length - a.posts.length;
    });

    listContainer.innerHTML = accountEntries.map(acct => {
      const acctIcon = acct.collapsed ? '▶' : '▼';
      const acctBodyStyle = acct.collapsed ? 'display:none;' : 'display:block;';
      const catGroups = buildCategoryGroups(acct.posts);
      const catHtml = catGroups.map(renderCategoryGroupHtml).join('');
      return `
        <div class="posts-account-group" data-account-key="${escapeHtml(acct.key)}" style="margin-bottom: 1.25rem;">
          <div class="posts-account-header" data-account-key="${escapeHtml(acct.key)}" style="display:flex; align-items:center; justify-content:space-between; gap: 0.75rem; padding: 0.85rem 1rem; border-radius: 10px; background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08)); border: 1.5px solid rgba(59,130,246,0.25); cursor: pointer; user-select: none; margin-bottom: 0.5rem;">
            <div style="display:flex; align-items:center; gap: 0.6rem; min-width: 0;">
              <span class="posts-account-toggle-icon" style="font-weight: 900; color: var(--primary);">${acctIcon}</span>
              <div style="font-weight: 900; color: var(--primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1.05rem;">${escapeHtml(acct.label)}</div>
            </div>
            <div style="display:flex; align-items:center; gap: 0.5rem; flex-shrink: 0;">
              <span style="background: rgba(59,130,246,0.2); color: var(--primary); padding: 0.25rem 0.65rem; border-radius: 999px; font-size: 0.8rem; font-weight: 900;">${acct.posts.length}개</span>
            </div>
          </div>
          <div class="posts-account-body" style="${acctBodyStyle} padding-left: 0.75rem;">
            ${catHtml}
          </div>
        </div>`;
    }).join('');

    // 계정 헤더 접기/펼치기 이벤트
    listContainer.querySelectorAll('.posts-account-header').forEach((headerEl) => {
      headerEl.addEventListener('click', () => {
        const acctKey = String((headerEl as HTMLElement).getAttribute('data-account-key') || '').trim();
        if (!acctKey) return;
        const groupEl = listContainer.querySelector(`.posts-account-group[data-account-key="${CSS.escape(acctKey)}"]`) as HTMLElement | null;
        if (!groupEl) return;
        const body = groupEl.querySelector('.posts-account-body') as HTMLElement | null;
        const icon = groupEl.querySelector('.posts-account-toggle-icon') as HTMLElement | null;
        if (!body) return;
        const willCollapse = body.style.display !== 'none';
        body.style.display = willCollapse ? 'none' : 'block';
        if (icon) icon.textContent = willCollapse ? '▶' : '▼';
        setAccountCollapsed(acctKey, willCollapse);
      });
    });
  }

  // 카테고리 헤더 접기/펼치기 이벤트
  listContainer.querySelectorAll('.posts-category-header').forEach((headerEl) => {
    headerEl.addEventListener('click', () => {
      const key = String((headerEl as HTMLElement).getAttribute('data-category-key') || '').trim();
      if (!key) return;
      const groupEl = listContainer.querySelector(`.posts-category-group[data-category-key="${CSS.escape(key)}"]`) as HTMLElement | null;
      if (!groupEl) return;
      const body = groupEl.querySelector('.posts-category-body') as HTMLElement | null;
      const icon = groupEl.querySelector('.posts-category-toggle-icon') as HTMLElement | null;
      if (!body) return;
      const willCollapse = body.style.display !== 'none';
      body.style.display = willCollapse ? 'none' : 'block';
      if (icon) icon.textContent = willCollapse ? '▶' : '▼';
      setGeneratedPostCategoryCollapsed(key, willCollapse);
    });
  });

  attachPostItemEventListeners(listContainer);
}

// ✅ 글 항목 이벤트 리스너 연결 (공통 함수)
export function attachPostItemEventListeners(listContainer: HTMLElement): void {
  // 글 항목 클릭 시 미리보기
  listContainer.querySelectorAll('.post-item, .post-item-gallery').forEach(item => {
    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') return;
      const postId = (item as HTMLElement).getAttribute('data-post-id');
      if (postId) previewGeneratedPost(postId);
    });
  });

  // ✅ 일괄 선택 체크박스 이벤트
  listContainer.querySelectorAll('.post-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      updateBatchDeleteButton();
    });
  });

  // 기존 이벤트 리스너들
  listContainer.querySelectorAll('.favorite-post-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = (e.target as HTMLElement).getAttribute('data-post-id');
      if (postId) toggleFavoritePost(postId);
    });
  });

  listContainer.querySelectorAll('.load-post-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = (e.target as HTMLElement).getAttribute('data-post-id');
      if (postId) loadGeneratedPostToFields(postId);
    });
  });

  listContainer.querySelectorAll('.copy-post-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = (e.target as HTMLElement).getAttribute('data-post-id');
      if (postId) copyGeneratedPost(postId);
    });
  });

  listContainer.querySelectorAll('.preview-post-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = (e.target as HTMLElement).getAttribute('data-post-id');
      if (postId) previewGeneratedPost(postId);
    });
  });

  listContainer.querySelectorAll('.open-folder-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = (e.target as HTMLElement).getAttribute('data-post-id');
      if (postId) openPostImageFolder(postId);
    });
  });

  // ✅ 발행된 글 바로가기 버튼 (외부 브라우저로 열기)
  listContainer.querySelectorAll('.open-url-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = (e.target as HTMLElement).getAttribute('data-url');
      if (url) {
        window.api.openExternalUrl(url);
      }
    });
  });

  listContainer.querySelectorAll('.reuse-images-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const postId = (e.target as HTMLElement).getAttribute('data-post-id');
      if (postId) {
        await reusePostImages(postId);
      }
    });
  });

  listContainer.querySelectorAll('.delete-post-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = (e.target as HTMLElement).getAttribute('data-post-id');
      if (postId && confirm('이 글과 관련된 이미지 폴더도 함께 삭제됩니다. 정말 삭제하시겠습니까?')) {
        deleteGeneratedPost(postId);
        refreshGeneratedPostsList();
      }
    });
  });

  // 썸네일 클릭 이벤트
  listContainer.querySelectorAll('.thumbnail-container').forEach(container => {
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      const img = container.querySelector('img');
      if (img && img.src) {
        showImageModal(img.src);
      }
    });
  });
}

// ✅ 일괄 삭제 버튼 업데이트
export function updateBatchDeleteButton(): void {
  const checkboxes = document.querySelectorAll('.post-checkbox:checked') as NodeListOf<HTMLInputElement>;
  const batchDeleteBtn = document.getElementById('posts-batch-delete-btn');

  if (batchDeleteBtn) {
    if (checkboxes.length > 0) {
      batchDeleteBtn.style.display = 'block';
      batchDeleteBtn.textContent = `🗑️ 선택삭제 (${checkboxes.length})`;
    } else {
      batchDeleteBtn.style.display = 'none';
    }
  }
}

// ✅ 전체 선택/해제
export function toggleSelectAllPosts(): void {
  const checkboxes = document.querySelectorAll('.post-checkbox') as NodeListOf<HTMLInputElement>;
  const selectAllBtn = document.getElementById('posts-select-all-btn');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);

  checkboxes.forEach(cb => {
    cb.checked = !allChecked;
  });

  if (selectAllBtn) {
    selectAllBtn.textContent = allChecked ? '☑️ 전체선택' : '☐ 선택해제';
  }

  updateBatchDeleteButton();
}

// ✅ 일괄 삭제
export function batchDeletePosts(): void {
  const checkboxes = document.querySelectorAll('.post-checkbox:checked') as NodeListOf<HTMLInputElement>;
  const postIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-post-id')).filter(id => id !== null) as string[];

  if (postIds.length === 0) {
    alert('삭제할 글을 선택해주세요.');
    return;
  }

  if (confirm(`선택한 ${postIds.length}개의 글을 삭제하시겠습니까?\n\n관련된 이미지 폴더도 함께 삭제됩니다.`)) {
    postIds.forEach(postId => {
      if (postId) deleteGeneratedPost(postId);
    });
    refreshGeneratedPostsList();
    appendLog(`🗑️ ${postIds.length}개의 글이 일괄 삭제되었습니다.`);
  }
}

// ✅ 이미지 모달 (확대 보기) - window 객체에 등록하여 inline onclick에서 호출 가능
export function showImageModal(imageUrl: string): void {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.9); z-index: 10001; display: flex;
    align-items: center; justify-content: center; padding: 2rem;
    cursor: pointer;
  `;

  modal.innerHTML = `
    <div style="position: relative; width: min(1100px, 92vw); height: min(78vh, 720px); overflow: hidden; border-radius: 8px; background: rgba(0,0,0,0.2);">
      <button type="button" class="close-image-modal-btn" style="position: absolute; top: -2rem; right: 0; background: rgba(255,255,255,0.2); border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.5rem; color: white; display: flex; align-items: center; justify-content: center;">×</button>
      <img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%23999%22%3E이미지 로드 실패%3C/text%3E%3C/svg%3E';">
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('.close-image-modal-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => modal.remove());
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal || (e.target as HTMLElement).classList.contains('close-image-modal-btn')) {
      modal.remove();
    }
  });

  // ESC 키로 닫기
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleKeydown);
    }
  };
  document.addEventListener('keydown', handleKeydown);
}

export function showHeadingImagesModal(encodedHeadingTitle: string, initialImageUrl?: string): void {
  const decodeHeading = (v: string): string => {
    try {
      return decodeURIComponent(String(v || '').trim());
    } catch {
      return String(v || '').trim();
    }
  };

  const headingTitle = decodeHeading(encodedHeadingTitle);
  if (!headingTitle) {
    if (initialImageUrl) showImageModal(initialImageUrl);
    return;
  }

  const titleKey = ImageManager.resolveHeadingKey(headingTitle);
  const getImagesForHeading = (): any[] => {
    try {
      const arr = ImageManager.getImages(titleKey);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  const toUrl = (img: any): string => {
    const raw = img?.url || img?.filePath || img?.previewDataUrl || '';
    return toFileUrlMaybe(String(raw || '').trim());
  };

  let images = getImagesForHeading();
  if (images.length === 0) {
    if (initialImageUrl) showImageModal(initialImageUrl);
    return;
  }

  let currentIndex = 0;
  const initialDecoded = initialImageUrl ? decodeHeading(String(initialImageUrl || '').trim()) : '';
  const initialNorm = initialDecoded ? toFileUrlMaybe(String(initialDecoded || '').trim()) : '';
  if (initialNorm) {
    const idx = images.findIndex((img: any) => toUrl(img) === initialNorm);
    if (idx >= 0) currentIndex = idx;
  }

  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.92); z-index: 10001; display: flex;
    align-items: center; justify-content: center; padding: 2rem;
  `;

  const render = () => {
    images = getImagesForHeading();
    if (images.length === 0) {
      modal.remove();
      return;
    }
    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex >= images.length) currentIndex = images.length - 1;

    const url = toUrl(images[currentIndex]);
    const titleText = escapeHtml(String(headingTitle || '').trim());
    const counterText = `${currentIndex + 1} / ${images.length}`;

    modal.innerHTML = `
      <div style="position: relative; width: min(1100px, 92vw); height: min(78vh, 720px); display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 10px; background: rgba(0,0,0,0.2);">
        <button type="button" class="heading-image-modal-close" style="position: absolute; top: -2.2rem; right: 0; background: rgba(255,255,255,0.2); border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.5rem; color: white; display: flex; align-items: center; justify-content: center;">×</button>
        <div style="position: absolute; top: -2.1rem; left: 0; color: rgba(255,255,255,0.92); font-weight: 700; font-size: 0.95rem; max-width: 70vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${titleText}</div>
        <div style="position: absolute; bottom: -2.1rem; left: 0; color: rgba(255,255,255,0.85); font-size: 0.9rem; font-weight: 700;">${counterText}</div>

        <button type="button" class="heading-image-modal-prev" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); z-index: 30; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.25); border-radius: 12px; padding: 0.75rem 0.9rem; cursor: pointer; font-weight: 900;">◀</button>
        <button type="button" class="heading-image-modal-next" style="position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); z-index: 30; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.25); border-radius: 12px; padding: 0.75rem 0.9rem; cursor: pointer; font-weight: 900;">▶</button>

        <img class="heading-image-modal-img" src="${escapeHtml(url)}" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%23999%22%3E이미지 로드 실패%3C/text%3E%3C/svg%3E';" />

        <div style="position: absolute; bottom: 1rem; right: 1rem; display: flex; gap: 0.5rem; z-index: 40;">
          <button type="button" class="heading-image-modal-delete" style="background: rgba(239,68,68,0.18); color: #ef4444; border: 1px solid rgba(239,68,68,0.35); border-radius: 10px; padding: 0.65rem 0.9rem; cursor: pointer; font-weight: 900;">삭제</button>
          <button type="button" class="heading-image-modal-close2" style="background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.25); border-radius: 10px; padding: 0.65rem 0.9rem; cursor: pointer; font-weight: 800;">닫기</button>
        </div>
      </div>
    `;

    (modal.querySelector('.heading-image-modal-prev') as HTMLButtonElement | null)?.addEventListener('click', () => {
      currentIndex = (currentIndex - 1 + images.length) % images.length;
      render();
    });
    (modal.querySelector('.heading-image-modal-next') as HTMLButtonElement | null)?.addEventListener('click', () => {
      currentIndex = (currentIndex + 1) % images.length;
      render();
    });

    (modal.querySelector('.heading-image-modal-close') as HTMLButtonElement | null)?.addEventListener('click', () => {
      modal.remove();
    });

    (modal.querySelector('.heading-image-modal-close2') as HTMLButtonElement | null)?.addEventListener('click', () => {
      modal.remove();
    });

    (modal.querySelector('.heading-image-modal-delete') as HTMLButtonElement | null)?.addEventListener('click', () => {
      if (!confirm('이 이미지를 제거하시겠습니까?')) return;
      try {
        ImageManager.removeImageAtIndex(titleKey, currentIndex);
      } catch {
        return;
      }

      try {
        // ✅ [2026-02-12 P3 FIX #15] 중복 할당 제거 — syncGlobal이 처리
        syncGlobalImagesFromImageManager();
        const allImages = ImageManager.getAllImages();
        const sc: any = (window as any).currentStructuredContent;
        if (sc?.headings) updateUnifiedImagePreview(sc.headings, allImages);
        updatePromptItemsWithImages(allImages);
        ImageManager.syncAllPreviews();
      } catch (e) {
        console.warn('[postListUI] catch ignored:', e);
      }

      images = getImagesForHeading();
      if (images.length === 0) {
        modal.remove();
        return;
      }
      if (currentIndex >= images.length) currentIndex = images.length - 1;
      render();
    });
  };

  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleKeydown);
      return;
    }
    if (e.key === 'ArrowLeft') {
      currentIndex = (currentIndex - 1 + images.length) % images.length;
      render();
    }
    if (e.key === 'ArrowRight') {
      currentIndex = (currentIndex + 1) % images.length;
      render();
    }
  };
  document.addEventListener('keydown', handleKeydown);

  const observer = new MutationObserver(() => {
    if (!modal.isConnected) {
      document.removeEventListener('keydown', handleKeydown);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  render();
}

// ✅ 통계 대시보드 표시
export function showPostsStatsDashboard(): void {
  const posts = loadGeneratedPosts();
  const totalCount = posts.length;
  const totalImages = posts.reduce((sum, p) => sum + (p.images?.length || 0), 0);
  const totalChars = posts.reduce((sum, p) => sum + p.content.length, 0);
  const avgChars = totalCount > 0 ? Math.round(totalChars / totalCount) : 0;
  const publishedCount = posts.filter(p => p.publishedUrl).length;
  const favoritesCount = posts.filter(p => p.isFavorite).length;
  const withImagesCount = posts.filter(p => p.images && p.images.length > 0).length;
  const withHeadingsCount = posts.filter(p => p.headings && p.headings.length > 0).length;

  // 날짜별 통계
  const dateStats: Record<string, number> = {};
  posts.forEach(post => {
    const date = new Date(post.createdAt).toISOString().split('T')[0];
    dateStats[date] = (dateStats[date] || 0) + 1;
  });
  const mostActiveDate = Object.entries(dateStats).sort((a, b) => b[1] - a[1])[0];

  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); z-index: 10000; display: flex;
    align-items: center; justify-content: center; padding: 2rem;
  `;

  modal.innerHTML = `
    <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 800px; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3); position: relative;">
      <button type="button" class="close-stats-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: var(--bg-tertiary); border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.25rem; display: flex; align-items: center; justify-content: center;">×</button>
      <h2 style="margin: 0 0 1.5rem 0; color: var(--text-strong); font-size: 1.5rem;">📊 글 통계 대시보드</h2>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
        <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 1.5rem; border-radius: 8px; color: white;">
          <div style="font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem;">${totalCount}</div>
          <div style="font-size: 0.875rem; opacity: 0.9;">총 글 수</div>
        </div>
        <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 1.5rem; border-radius: 8px; color: white;">
          <div style="font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem;">${publishedCount}</div>
          <div style="font-size: 0.875rem; opacity: 0.9;">발행된 글</div>
        </div>
        <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 1.5rem; border-radius: 8px; color: white;">
          <div style="font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem;">${totalImages}</div>
          <div style="font-size: 0.875rem; opacity: 0.9;">총 이미지</div>
        </div>
        <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); padding: 1.5rem; border-radius: 8px; color: white;">
          <div style="font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem;">${favoritesCount}</div>
          <div style="font-size: 0.875rem; opacity: 0.9;">즐겨찾기</div>
        </div>
      </div>
      
      <div style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem;">
        <h3 style="margin: 0 0 1rem 0; color: var(--text-strong); font-size: 1.1rem;">📈 상세 통계</h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
          <div>
            <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.25rem;">평균 글자 수</div>
            <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-strong);">${avgChars.toLocaleString()}자</div>
          </div>
          <div>
            <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.25rem;">이미지 있는 글</div>
            <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-strong);">${withImagesCount}개 (${totalCount > 0 ? Math.round(withImagesCount / totalCount * 100) : 0}%)</div>
          </div>
          <div>
            <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.25rem;">소제목 있는 글</div>
            <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-strong);">${withHeadingsCount}개 (${totalCount > 0 ? Math.round(withHeadingsCount / totalCount * 100) : 0}%)</div>
          </div>
          <div>
            <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.25rem;">발행률</div>
            <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-strong);">${totalCount > 0 ? Math.round(publishedCount / totalCount * 100) : 0}%</div>
          </div>
        </div>
      </div>
      
      ${mostActiveDate ? `
        <div style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px;">
          <h3 style="margin: 0 0 1rem 0; color: var(--text-strong); font-size: 1.1rem;">📅 활동 통계</h3>
          <div style="font-size: 0.875rem; color: var(--text-muted);">
            가장 활발한 날: <span style="color: var(--text-strong); font-weight: 600;">${mostActiveDate[0]}</span> (${mostActiveDate[1]}개 글 작성)
          </div>
        </div>
      ` : ''}
      
      <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
        <button type="button" class="close-stats-modal-btn" style="flex: 1; padding: 0.75rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">닫기</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll('.close-stats-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => modal.remove());
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// ✅ 갤러리 뷰 전환
export function togglePostsView(): void {
  isGalleryView = !isGalleryView;
  const viewToggleBtn = document.getElementById('posts-view-toggle-btn');
  if (viewToggleBtn) {
    viewToggleBtn.textContent = isGalleryView ? '📋 리스트' : '🖼️ 갤러리';
  }
  refreshGeneratedPostsList();
}

// ✅ 생성된 글을 필드에 불러오기
export async function loadGeneratedPostToFields(postId: string): Promise<void> {
  const post = loadGeneratedPost(postId);
  if (!post) {
    alert('글을 찾을 수 없습니다.');
    return;
  }

  // ✅ 기존 콘텐츠 및 이미지 완전 초기화 (이전 글 데이터 충돌 방지)
  currentStructuredContent = null;
  (window as any).currentStructuredContent = null;
  generatedImages = [];
  (window as any).imageManagementGeneratedImages = [];
  ImageManager.clear(); // ✅ ImageManager도 초기화 (이전 글의 이미지 매핑 제거)
  currentPostId = postId; // ✅ 현재 글 ID 설정

  // structuredContent 재구성
  const structuredContent = {
    selectedTitle: post.title,
    bodyPlain: post.content,
    content: post.content,
    hashtags: post.hashtags || [],
    headings: post.headings || []
  };

  currentStructuredContent = structuredContent as any;
  (window as any).currentStructuredContent = structuredContent;

  // ✅ 반자동 모드 섹션 표시 및 필드 채우기
  const semiAutoSection = document.getElementById('unified-semi-auto-section');
  if (semiAutoSection) {
    semiAutoSection.style.display = 'block';

    // 부드러운 애니메이션
    semiAutoSection.style.opacity = '0';
    setTimeout(() => {
      semiAutoSection.style.opacity = '1';
      semiAutoSection.style.transition = 'opacity 0.5s ease';
    }, 100);
  }

  // ✅ 반자동 모드 필드에 채우기 (수정 가능)
  const titleInput = document.getElementById('unified-generated-title') as HTMLInputElement;
  const contentTextarea = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
  const hashtagsInput = document.getElementById('unified-generated-hashtags') as HTMLInputElement;
  const imageTitleInput = document.getElementById('image-title') as HTMLInputElement;

  if (titleInput) {
    titleInput.value = post.title;
    titleInput.readOnly = false; // 수정 가능하게
  }
  if (contentTextarea) {
    const normalized = normalizeReadableBodyText(post.content);
    contentTextarea.value = normalized;
    contentTextarea.readOnly = false; // 수정 가능하게
  }
  if (hashtagsInput) {
    hashtagsInput.value = (post.hashtags || []).join(' ');
    hashtagsInput.readOnly = false; // 수정 가능하게
  }
  if (imageTitleInput) {
    imageTitleInput.value = post.title;
  }

  // ✅ 이미지 불러오기 (저장된 이미지 경로 사용 및 검증)
  if (post.images && post.images.length > 0) {
    // 이미지 경로 검증 및 복구
    let validImages = await validateAndRecoverImages(post.images, postId);
    if (validImages.length > 0) {
      const headingTitles = (structuredContent?.headings || [])
        .map((h: any) => (typeof h === 'string' ? h : (h?.title || '')))
        .map((t: string) => String(t || '').trim())
        .filter((t: string) => t.length > 0);

      if (headingTitles.length > 0) {
        validImages = validImages.map((img: any, idx: number) => {
          const heading = String(img?.heading || '').trim();
          if (!heading && idx < headingTitles.length) {
            const fixedHeading = headingTitles[idx];
            return {
              ...img,
              heading: fixedHeading,
              prompt: img?.prompt || fixedHeading,
            };
          }
          return img;
        });
      }

      generatedImages = validImages;
      (window as any).imageManagementGeneratedImages = validImages;
      appendLog(`🖼️ ${validImages.length}개의 이미지를 불러왔습니다.`);

      try {
        hydrateImageManagerFromImages(structuredContent, validImages);
        appendLog(`🔗 ImageManager에 ${validImages.length}개 이미지 등록 완료`);
      } catch (e) {
        console.warn('[postListUI] catch ignored:', e);
      }

      // 일부 이미지가 복구된 경우 저장
      if (validImages.length !== post.images.length) {
        const updatedPost = { ...post, images: validImages };
        const posts = loadGeneratedPosts();
        const index = posts.findIndex(p => p.id === postId);
        if (index >= 0) {
          posts[index] = updatedPost;
          localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
        }
      }
    } else {
      appendLog(`⚠️ 저장된 이미지 경로가 유효하지 않습니다.`);
    }
  } else {
    // 이미지가 없으면 글 ID 폴더에서 이미지 찾기 시도
    appendLog(`📁 글 ID 폴더에서 이미지를 확인합니다: ${postId}`);
    const folderImages = await loadImagesFromFolder(postId);
    if (folderImages.length > 0) {
      const headingTitles = (structuredContent?.headings || [])
        .map((h: any) => (typeof h === 'string' ? h : (h?.title || '')))
        .map((t: string) => String(t || '').trim())
        .filter((t: string) => t.length > 0);

      const fixedImages = headingTitles.length > 0
        ? folderImages.map((img: any, idx: number) => {
          const heading = String(img?.heading || '').trim();
          if (!heading && idx < headingTitles.length) {
            const fixedHeading = headingTitles[idx];
            return {
              ...img,
              heading: fixedHeading,
              prompt: img?.prompt || fixedHeading,
            };
          }
          return img;
        })
        : folderImages;

      generatedImages = fixedImages;
      (window as any).imageManagementGeneratedImages = fixedImages;
      appendLog(`🖼️ 폴더에서 ${folderImages.length}개의 이미지를 찾았습니다.`);

      try {
        hydrateImageManagerFromImages(structuredContent, fixedImages);
        appendLog(`🔗 ImageManager에 ${fixedImages.length}개 이미지 등록 완료`);
      } catch (e) {
        console.warn('[postListUI] catch ignored:', e);
      }
    }
  }

  appendLog(`📂 생성된 글을 불러왔습니다: "${post.title}"`);
  appendLog(`📝 제목: "${post.title}"`);
  appendLog(`📄 본문: ${(post.content || '').length}자`);
  appendLog(`🏷️ 해시태그: ${(post.hashtags || []).join(', ')}`);
  appendLog(`🖼️ 이미지: ${generatedImages.length}개`);
  appendLog(`✅ 반자동 모드에서 수정 후 발행할 수 있습니다.`);

  // ✅ [2026-01-22] 카테고리 복원
  if ((post as any).category) {
    const categorySelect = document.getElementById('unified-category-select') as HTMLSelectElement;
    if (categorySelect) {
      // 카테고리 옵션 중 일치하는 것 선택
      const options = Array.from(categorySelect.options);
      const matchingOption = options.find(opt =>
        opt.value === (post as any).category ||
        opt.textContent?.includes((post as any).category)
      );
      if (matchingOption) {
        categorySelect.value = matchingOption.value;
        appendLog(`📁 카테고리 복원: ${(post as any).category}`);
      }
    }
  }

  // ✅ [2026-01-22] 쇼핑커넥트 모드 복원 (affiliateLink, contentMode)
  if ((post as any).affiliateLink) {
    const affiliateLinkInput = document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement;
    if (affiliateLinkInput) {
      affiliateLinkInput.value = (post as any).affiliateLink;
      appendLog(`🔗 제휴링크 복원: ${(post as any).affiliateLink.substring(0, 50)}...`);
    }
    // 쇼핑커넥트 모드 활성화 (contentMode가 affiliate인 경우)
    if ((post as any).contentMode === 'affiliate') {
      const affiliateModeBtn = document.getElementById('affiliate-mode-btn');
      if (affiliateModeBtn) {
        affiliateModeBtn.click();
        appendLog(`🛒 쇼핑커넥트 모드 복원`);
      }
    }
  }

  // ✅ [2026-01-22] CTA 필드 복원
  if ((post as any).ctas && (post as any).ctas.length > 0) {
    const ctaItemsContainer = document.getElementById('unified-cta-items-container');
    if (ctaItemsContainer) {
      // 기존 CTA 삭제 후 복원
      ctaItemsContainer.innerHTML = '';
      for (const cta of (post as any).ctas) {
        // CTA 추가 버튼 클릭하여 새 CTA 생성
        const addCtaBtn = document.getElementById('unified-add-cta-btn');
        if (addCtaBtn) addCtaBtn.click();
        // 마지막 추가된 CTA 필드에 값 설정
        const ctaItems = ctaItemsContainer.querySelectorAll('.cta-item');
        const lastCtaItem = ctaItems[ctaItems.length - 1];
        if (lastCtaItem) {
          const textInput = lastCtaItem.querySelector('input[data-field="text"], input:first-of-type') as HTMLInputElement;
          const linkInput = lastCtaItem.querySelector('input[data-field="link"], input:last-of-type') as HTMLInputElement;
          if (textInput) textInput.value = cta.text || '';
          if (linkInput) linkInput.value = cta.link || '';
        }
      }
      appendLog(`📎 CTA ${(post as any).ctas.length}개 복원`);
    }
  } else if ((post as any).ctaText) {
    // 단일 CTA 복원, 컨테이너에 없는 경우 기본 필드로
    const ctaTextInput = document.getElementById('unified-cta-text') as HTMLInputElement;
    const ctaLinkInput = document.getElementById('unified-cta-link') as HTMLInputElement;
    if (ctaTextInput) ctaTextInput.value = (post as any).ctaText || '';
    if (ctaLinkInput) ctaLinkInput.value = (post as any).ctaLink || '';
    appendLog(`📎 CTA 복원: ${(post as any).ctaText}`);
  }

  // ✅ 반자동 모드 섹션으로 스크롤
  setTimeout(() => {
    const semiAutoSection = document.getElementById('unified-semi-auto-section');
    if (semiAutoSection) {
      semiAutoSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 300);

  // ✅ 글 불러오기 완료 후 자동 소제목 분석
  if (structuredContent?.headings?.length > 0) {
    setTimeout(async () => {
      try {
        appendLog('🔍 자동 소제목 분석 시작...');
        await autoAnalyzeHeadings(structuredContent);

        // ✅ 소제목 분석 완료 후 모든 미리보기 동기화 (영어 프롬프트 + 생성된 이미지)
        ImageManager.setHeadings(structuredContent.headings);
        try {
          syncGlobalImagesFromImageManager();
        } catch (e) {
          console.warn('[postListUI] catch ignored:', e);
        }

        const allImagesAfter = (() => {
          try {
            const all = ImageManager.getAllImages();
            return Array.isArray(all) ? all : [];
          } catch {
            return [];
          }
        })();

        displayGeneratedImages(allImagesAfter.length > 0 ? allImagesAfter : generatedImages);
        ImageManager.syncAllPreviews();

        // ✅ 영어 프롬프트 미리보기에도 이미지 업데이트
        (window as any).imageManagementGeneratedImages = allImagesAfter.length > 0 ? allImagesAfter : generatedImages;
        updatePromptItemsWithImages(allImagesAfter.length > 0 ? allImagesAfter : generatedImages);

        appendLog('✅ 소제목 분석 완료! 이미지를 배치할 수 있습니다.');
      } catch (error) {
        appendLog(`⚠️ 소제목 자동 분석 실패: ${(error as Error).message}`);
      }
    }, 500);
  } else {
    // ✅ 소제목이 없어도 이미지는 표시
    const allImagesAfter = (() => {
      try {
        const all = ImageManager.getAllImages();
        return Array.isArray(all) ? all : [];
      } catch {
        return [];
      }
    })();

    displayGeneratedImages(allImagesAfter.length > 0 ? allImagesAfter : generatedImages);

    // ✅ 영어 프롬프트 미리보기에도 이미지 업데이트
    (window as any).imageManagementGeneratedImages = allImagesAfter.length > 0 ? allImagesAfter : generatedImages;
    updatePromptItemsWithImages(allImagesAfter.length > 0 ? allImagesAfter : generatedImages);
  }

  // ✅ CTA 불러오기 (저장된 CTA가 있으면 사용, 없으면 자동 생성)
  const ctaTextInput = document.getElementById('unified-cta-text') as HTMLInputElement;
  const ctaLinkInput = document.getElementById('unified-cta-link') as HTMLInputElement;
  const selectedPostInfo = document.getElementById('selected-previous-post-info') as HTMLDivElement;

  if (post.ctaText || post.ctaLink) {
    // 저장된 CTA가 있으면 불러오기
    if (ctaTextInput) ctaTextInput.value = post.ctaText || '';
    if (ctaLinkInput) ctaLinkInput.value = post.ctaLink || '';
    if (selectedPostInfo) selectedPostInfo.style.display = 'none';
    appendLog(`🔗 저장된 CTA 불러옴: "${post.ctaText || '(없음)'}"`);
  } else {
    // 저장된 CTA가 없으면 자동 생성
    autoGenerateCTA(structuredContent);
  }

  // ✅ 위험 지표 업데이트 (AI탐지, 법적위험, SEO점수)
  updateRiskIndicators(structuredContent as any);

  // ✅ [2026-02-27 FIX] 글 불러오기 후 발행 UI 상태 동기화
  // 1. hasGeneratedContent 플래그 업데이트 → 반자동 모드에서 발행 버튼 활성화
  if (typeof (window as any).markContentGenerated === 'function') {
    (window as any).markContentGenerated();
  }
  // 2. 미리보기 업데이트 (현재 선택된 발행 모드는 유지)
  try { updateUnifiedPreview(structuredContent); } catch (_e) { /* 무시 */ }

  toastManager.success(`✅ 생성된 글을 불러왔습니다! 반자동 모드에서 수정 후 발행할 수 있습니다.`);
}

// ✅ 이미지 경로 검증 및 복구 (+ prompt 필드 자동 추가)
export async function validateAndRecoverImages(images: any[], postId: string): Promise<any[]> {
  const validImages: any[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    // ✅ prompt 필드가 없으면 heading 또는 기본값 사용
    const ensurePrompt = (imgObj: any) => {
      const rawFilePath = String(imgObj.filePath || '').trim();
      const toFileUrl = (p: string): string => {
        const cleaned = String(p || '')
          .replace(/^file:\/\//i, '')
          .replace(/^\/+/, '')
          .replace(/\\/g, '/');
        if (!cleaned) return '';
        return `file:///${cleaned}`;
      };
      const isRenderableUrl = (u: string): boolean => /^(https?:\/\/|data:|blob:|file:\/\/)/i.test(String(u || '').trim());

      const fileUrl = rawFilePath ? toFileUrl(rawFilePath) : '';
      const candidate = String(imgObj.previewDataUrl || imgObj.url || '').trim();
      const displayUrl = candidate
        ? (isRenderableUrl(candidate) ? candidate : toFileUrl(candidate))
        : (fileUrl || '');

      return {
        ...imgObj,
        prompt: imgObj.prompt || imgObj.heading || `이미지 ${i + 1}`,
        url: displayUrl,
        previewDataUrl: displayUrl,
      };
    };

    const isRenderableUrl = (u: string): boolean => /^(https?:\/\/|data:|blob:)/i.test(String(u || '').trim());
    const filePathStr = String(img?.filePath || '').trim();
    const candidateStr = String(img?.previewDataUrl || img?.url || '').trim();

    // ✅ data:/blob:/http(s) 등은 로컬 파일 검증 대상이 아님 (재사용 시 base64 조각이 filePath에 들어오는 케이스 방지)
    if (isRenderableUrl(filePathStr)) {
      validImages.push(ensurePrompt(img));
      continue;
    }
    if (isRenderableUrl(candidateStr)) {
      validImages.push(ensurePrompt({ ...img, filePath: '' }));
      continue;
    }

    // URL인 경우 그대로 사용
    if (img.filePath && (img.filePath.startsWith('http://') || img.filePath.startsWith('https://'))) {
      validImages.push(ensurePrompt(img));
      continue;
    }

    // 로컬 파일 경로인 경우 검증
    if (img.filePath) {
      try {
        // 파일 존재 확인 (IPC를 통해)
        let exists = false;
        if (window.api.checkFileExists) {
          const raw = String(img.filePath)
            .replace(/^file:\/\//i, '')
            .replace(/^\/+/, '')
            .replace(/\\/g, '/');
          exists = await window.api.checkFileExists(raw);
        }

        if (exists) {
          // ✅ 로컬 경로는 브라우저 표시용 file:/// 보장
          const raw = String(img.filePath)
            .replace(/^file:\/\//i, '')
            .replace(/^\/+/, '')
            .replace(/\\/g, '/');
          validImages.push(ensurePrompt({
            ...img,
            filePath: raw,
          }));
        } else {
          // 파일이 없으면 폴더에서 찾기 시도
          // ✅ [2026-03-23 FIX] os/path 동적 import 제거 (dead code, renderer에서 require 에러 유발)
          if (!window.api.getUserHomeDir || !window.api.checkFileExists) {
            console.error('[Image] 파일 시스템 API를 사용할 수 없습니다.');
            continue;
          }

          const originalPath = String(img.filePath).replace(/^file:\/\//i, '').replace(/^\/+/, '');
          const fileName = originalPath.split(/[/\\]/).pop() || '';

          const basePath = await getRequiredImageBasePath();

          const folderPath = `${basePath}/${postId}`.replace(/\\/g, '/');
          const folderFilePath = `${folderPath}/${fileName}`.replace(/\\/g, '/');

          // 폴더에서 이미지 찾기
          const exists = await window.api.checkFileExists(folderFilePath);
          if (exists) {
            // 폴더에서 찾았으면 경로 업데이트
            validImages.push(ensurePrompt({ ...img, filePath: folderFilePath }));
            appendLog(`✅ 이미지 경로 복구: ${fileName}`);
          } else {
            // 폴더에도 없으면 건너뛰기
            appendLog(`⚠️ 이미지를 찾을 수 없습니다: ${fileName}`);
          }
        }
      } catch (error) {
        // 검증 실패 시 건너뛰기
        console.warn('이미지 검증 실패:', error);
      }
    }
  }

  return validImages;
}

// ✅ 즐겨찾기 토글
export function toggleFavoritePost(postId: string): void {
  try {
    const posts = loadGeneratedPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    post.isFavorite = !post.isFavorite;
    if (post.isFavorite) {
      post.updatedAt = new Date().toISOString();
    }

    const index = posts.findIndex(p => p.id === postId);
    if (index >= 0) {
      posts[index] = post;
      localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
      appendLog(`⭐ 즐겨찾기 ${post.isFavorite ? '추가' : '해제'}: "${post.title}"`);
      refreshGeneratedPostsList();
    }
  } catch (error) {
    console.error('즐겨찾기 토글 실패:', error);
  }
}

// ✅ 글의 이미지 재사용
export async function reusePostImages(postId: string): Promise<void> {
  try {
    const post = loadGeneratedPost(postId);
    if (!post) {
      alert('글을 찾을 수 없습니다.');
      return;
    }

    if (!post.images || post.images.length === 0) {
      alert('이 글에는 이미지가 없습니다.');
      return;
    }

    // 이미지 경로 검증 및 복구
    let validImages = await validateAndRecoverImages(post.images, postId);

    if (validImages.length === 0) {
      // 폴더에서 이미지 찾기 시도
      const folderImages = await loadImagesFromFolder(postId);
      if (folderImages.length === 0) {
        alert('이미지를 찾을 수 없습니다.');
        return;
      }
      validImages = folderImages;
    }

    // ✅ 현재 이미지 상태를 선택한 글의 이미지 세트로 완전히 교체
    // 1) ImageManager 초기화
    ImageManager.clear();

    // 2) currentStructuredContent 기준으로 소제목 목록 설정 (없으면 post.structuredContent 사용)
    const sc: any = (window as any).currentStructuredContent || currentStructuredContent || post.structuredContent || {};
    const headings = Array.isArray(sc?.headings) ? sc.headings : (post.structuredContent?.headings || []);
    if (Array.isArray(headings) && headings.length > 0) {
      ImageManager.setHeadings(headings);
    }

    // 3) heading 정보 보정 (loadGeneratedPostToFields 와 동일한 방식 재사용)
    const headingTitles = (headings || [])
      .map((h: any) => (typeof h === 'string' ? h : (h?.title || '')))
      .map((t: string) => String(t || '').trim())
      .filter((t: string) => t.length > 0);

    if (headingTitles.length > 0) {
      validImages = validImages.map((img: any, idx: number) => {
        const heading = String(img?.heading || '').trim();
        if (!heading && idx < headingTitles.length) {
          const fixedHeading = headingTitles[idx];
          return {
            ...img,
            heading: fixedHeading,
            prompt: img?.prompt || fixedHeading,
          };
        }
        return img;
      });
    }

    // 4) ImageManager에 이미지 등록 (소제목별로 세팅)
    validImages.forEach((img: any) => {
      const heading = String(img?.heading || '').trim();
      if (!heading) return;
      const candidate = {
        ...img,
        timestamp: Date.now(),
      };

      try {
        // ✅ 소제목당 여러 장 지원 (가능하면 addImage)
        ImageManager.addImage(heading, candidate);
      } catch {
        ImageManager.setImage(heading, candidate);
      }
    });

    // 5) 전역 배열/상태 동기화
    // ✅ [2026-02-12 P1 FIX #6] 직접 할당 → syncGlobalImagesFromImageManager
    try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }

    appendLog(`🖼️ ${validImages.length}개의 이미지를 재사용했습니다. (${post.title})`);
    alert(`✅ ${validImages.length}개의 이미지를 재사용했습니다!\n\n제목: ${post.title}`);

    // 이미지 관리 탭으로 전환하고 미리보기 업데이트
    const imagesTab = document.querySelector('[data-tab="images"]') as HTMLElement;
    if (imagesTab) {
      imagesTab.click();
    }

    // 이미지/영상 미리보기 전체 업데이트
    const imagesForUi = (() => {
      try {
        const all = ImageManager.getAllImages();
        if (Array.isArray(all) && all.length > 0) return all;
      } catch (e) {
        console.warn('[postListUI] catch ignored:', e);
      }
      return Array.isArray(generatedImages) ? generatedImages : [];
    })();

    if (Array.isArray(headings) && headings.length > 0) {
      updateUnifiedImagePreview(headings, imagesForUi);
    } else {
      updateUnifiedImagePreview([], imagesForUi);
    }

    ImageManager.syncAllPreviews();
    syncHeadingVideoInPromptItems();
    syncHeadingVideoSlotsInUnifiedPreview();

    refreshGeneratedPostsList();
  } catch (error) {
    console.error('이미지 재사용 실패:', error);
    alert(`이미지 재사용에 실패했습니다: ${(error as Error).message}`);
  }
}
