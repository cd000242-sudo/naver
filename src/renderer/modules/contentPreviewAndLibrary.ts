// ============================================
// contentPreviewAndLibrary.ts — renderer.ts에서 추출
// Phase 5B-7: 이미지 라이브러리, 탭 전환, 즐겨찾기, 템플릿
// ============================================

// 전역 스코프 의존성
declare let generatedImages: any[];
declare let currentStructuredContent: any;
declare function appendLog(message: string, logOutputId?: string): void;
declare function escapeHtml(str: string): string;
declare function loadGeneratedPosts(...args: any[]): any[];
declare function loadGeneratedPost(postId: string): any;
declare function hydrateImageManagerFromImages(structuredContent: any, images: any[]): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function pushImageHistorySnapshot(reason: string): void;
declare const ImageManager: any;
declare const toastManager: any;
declare function toFileUrlMaybe(p: string): string;
declare function getFavoriteSettings(): any;

// ============================================
// 이미지 라이브러리 초기화
// ============================================
async function initImageLibrary(): Promise<void> {
  // 저작권 경고 확인
  const acceptCopyrightBtn = document.getElementById('accept-copyright-warning') as HTMLButtonElement;
  const libraryContent = document.getElementById('library-content') as HTMLDivElement;
  const copyrightWarning = document.querySelector('.copyright-warning') as HTMLDivElement;

  if (acceptCopyrightBtn && libraryContent && copyrightWarning) {
    // 이미 확인했는지 로컬 스토리지에서 확인 (기본적으로 허용)
    const copyrightAccepted = localStorage.getItem('copyright-warning-accepted');
    if (copyrightAccepted === 'true') {
      copyrightWarning.style.display = 'none';
      libraryContent.style.display = 'block';
    } else {
      // 처음 방문 시 자동으로 확인 처리 (사용자 편의를 위해)
      localStorage.setItem('copyright-warning-accepted', 'true');
      copyrightWarning.style.display = 'none';
      libraryContent.style.display = 'block';
      toastManager.info('저작권 경고를 확인했습니다. 이미지 라이브러리를 사용할 수 있습니다.');
    }

    acceptCopyrightBtn.addEventListener('click', () => {
      // 로컬 스토리지에 저장
      localStorage.setItem('copyright-warning-accepted', 'true');

      // UI 업데이트
      copyrightWarning.style.display = 'none';
      libraryContent.style.display = 'block';

      // 성공 토스트
      toastManager.success('저작권 경고를 확인했습니다. 이미지 라이브러리를 사용할 수 있습니다.');
    });
  }

  const collectImagesBtn = document.getElementById('collect-images-btn') as HTMLButtonElement;
  const imageCategoryFilter = document.getElementById('image-category-filter') as HTMLSelectElement;
  const imageSearchKeywords = document.getElementById('image-search-keywords') as HTMLInputElement;
  const libraryImagesGrid = document.getElementById('library-images-grid') as HTMLDivElement;

  // 카테고리 로드
  if (imageCategoryFilter) {
    try {
      const categories = await window.api.getLibraryCategories();
      imageCategoryFilter.innerHTML = '<option value="">전체</option>' +
        categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

      imageCategoryFilter.addEventListener('change', async () => {
        await loadLibraryImages(imageCategoryFilter.value);
      });
    } catch (error) {
      console.error('카테고리 로드 실패:', error);
    }
  }

  // 고화질 토글 설정
  const highQualityToggle = document.getElementById('library-high-quality-toggle') as HTMLInputElement;
  if (highQualityToggle) {
    // 저장된 설정 불러오기
    const savedSetting = localStorage.getItem('library-use-high-quality');
    highQualityToggle.checked = savedSetting === 'true';

    // 토글 이벤트
    highQualityToggle.addEventListener('change', () => {
      localStorage.setItem('library-use-high-quality', highQualityToggle.checked.toString());

      // 이미지 다시 로드
      const currentCategory = imageCategoryFilter?.value;
      loadLibraryImages(currentCategory);

      toastManager.info(highQualityToggle.checked ? '고화질 모드로 전환되었습니다.' : '미리보기 모드로 전환되었습니다.');
    });
  }

  // 이미지 수집 버튼
  if (collectImagesBtn && imageSearchKeywords) {
    collectImagesBtn.addEventListener('click', async () => {
      const keywords = imageSearchKeywords.value.trim();
      if (!keywords) {
        if ((window as any).toastManager) (window as any).toastManager.warning('키워드를 입력해주세요.');
        return;
      }

      collectImagesBtn.disabled = true;
      collectImagesBtn.textContent = '수집 중...';

      // 선택된 크롤링 소스 확인
      const selectedSources: string[] = [];
      document.querySelectorAll('.library-source-checkbox:checked').forEach(checkbox => {
        selectedSources.push((checkbox as HTMLInputElement).value);
      });

      // 기본적으로 크롤링 소스 사용, 없으면 경고
      if (selectedSources.length === 0) {
        if ((window as any).toastManager) (window as any).toastManager.warning('⚠️ 수집할 소스를 하나 이상 선택해주세요.');
        collectImagesBtn.disabled = false;
        collectImagesBtn.textContent = '이미지 수집';
        return;
      }

      try {
        // 선택된 소스들을 사용해서 이미지 수집
        const result = await window.api.collectImagesByTitle(keywords, selectedSources);
        if (result.success) {
          if ((window as any).toastManager) (window as any).toastManager.success(`✅ ${result.count}개의 이미지가 수집되었습니다.`);
          await loadLibraryImages();

          // 카테고리 새로고침
          const categories = await window.api.getLibraryCategories();
          if (imageCategoryFilter) {
            imageCategoryFilter.innerHTML = '<option value="">전체</option>' +
              categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
          }
        } else {
          if ((window as any).toastManager) (window as any).toastManager.error(`❌ 이미지 수집 실패: ${result.message || '알 수 없는 오류'}`);
        }
      } catch (error) {
        if ((window as any).toastManager) (window as any).toastManager.error(`❌ 오류: ${(error as Error).message}`);
      } finally {
        collectImagesBtn.disabled = false;
        collectImagesBtn.textContent = '이미지 수집';
      }
    });
  }

  // 이미지 그리드 초기 로드
  await loadLibraryImages();
}

async function loadLibraryImages(category?: string): Promise<void> {
  const libraryImagesGrid = document.getElementById('library-images-grid') as HTMLDivElement;
  if (!libraryImagesGrid) return;

  try {
    const titleInput = document.getElementById('post-title') as HTMLInputElement;
    const keywords = titleInput?.value.trim() ? [titleInput.value.trim()] : undefined;
    const images = await window.api.getLibraryImages(category, keywords);

    if (images.length === 0) {
      libraryImagesGrid.innerHTML = '<p class="text-center text-muted" style="grid-column: 1 / -1; padding: 2rem;">수집된 이미지가 없습니다.</p>';
      return;
    }

    // 고해상도 이미지 사용 옵션 확인
    const useHighQuality = localStorage.getItem('library-use-high-quality') === 'true';

    libraryImagesGrid.innerHTML = images.map(img => `
      <div class="image-item" data-image-id="${img.id}" style="position: relative;">
        <img src="${useHighQuality ? (img.url || img.previewDataUrl) : (img.previewDataUrl || img.url)}"
             alt="${img.sourceTitle || ''}"
             loading="lazy"
             style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px;">
        <div class="image-quality-indicator" style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">
          ${useHighQuality ? '고화질' : '미리보기'}
        </div>
        <div class="image-item-overlay">
          <button type="button" class="use-image-btn" data-image-id="${img.id}" title="이 이미지를 사용하여 블로그에 삽입">사용하기</button>
          <button type="button" class="save-image-btn" data-image-path="${img.filePath}" title="이 이미지를 로컬에 저장">로컬 저장</button>
          <button type="button" class="delete-image-btn" data-image-id="${img.id}" title="이 이미지를 라이브러리에서 삭제">삭제</button>
        </div>
      </div>
    `).join('');

    // 호버 이벤트는 CSS로 처리됨 (.image-item:hover .image-item-overlay)

    // 버튼 이벤트
    libraryImagesGrid.querySelectorAll('.use-image-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const imageId = (btn as HTMLButtonElement).getAttribute('data-image-id');
        if (imageId) {
          useLibraryImage(imageId);
        }
      });
    });

    libraryImagesGrid.querySelectorAll('.save-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const filePath = (btn as HTMLButtonElement).getAttribute('data-image-path');
        if (filePath) {
          try {
            const success = await window.api.saveImageToLocal(filePath, `image-${Date.now()}.jpg`);
            if (success) {
              alert('✅ 이미지가 로컬에 저장되었습니다.');
            } else {
              alert('❌ 이미지 저장에 실패했습니다.');
            }
          } catch (error) {
            alert(`❌ 오류: ${(error as Error).message}`);
          }
        }
      });
    });

    libraryImagesGrid.querySelectorAll('.delete-image-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const imageId = (btn as HTMLButtonElement).getAttribute('data-image-id');
        if (imageId && confirm('이미지를 삭제하시겠습니까?')) {
          try {
            const success = await window.api.deleteLibraryImage(imageId);
            if (success) {
              await loadLibraryImages(category);
            }
          } catch (error) {
            alert(`❌ 삭제 실패: ${(error as Error).message}`);
          }
        }
      });
    });
  } catch (error) {
    console.error('이미지 로드 실패:', error);
    libraryImagesGrid.innerHTML = '<p class="text-center text-muted" style="grid-column: 1 / -1; padding: 2rem;">이미지를 불러오는 중 오류가 발생했습니다.</p>';
  }
}

async function useLibraryImage(imageId: string): Promise<void> {
  try {
    const images = await window.api.getLibraryImages();
    const image = images.find(img => img.id === imageId);
    if (!image) {
      alert('이미지를 찾을 수 없습니다.');
      return;
    }

    // 이미지 선택 모달 열기
    const libraryImageModal = document.getElementById('library-image-modal') as HTMLDivElement;
    const libraryModalImagePreview = document.getElementById('library-modal-image-preview') as HTMLImageElement;
    const useLibraryImageBtn = document.getElementById('use-library-image-btn') as HTMLButtonElement;
    const saveLibraryImageLocalBtn = document.getElementById('save-library-image-local-btn') as HTMLButtonElement;
    const deleteLibraryImageBtn = document.getElementById('delete-library-image-btn') as HTMLButtonElement;

    if (libraryImageModal && libraryModalImagePreview) {
      libraryModalImagePreview.src = toFileUrlMaybe(image.previewDataUrl || image.url || '');

      // 이미지 사용 버튼
      if (useLibraryImageBtn) {
        useLibraryImageBtn.onclick = () => {
          // 이미지 사용 로직 (나중에 구현)
          alert(`이미지 "${image.sourceTitle || imageId}"를 사용합니다.`);
          libraryImageModal.setAttribute('aria-hidden', 'true');
          libraryImageModal.style.display = 'none';
        };
      }

      // 로컬 저장 버튼
      if (saveLibraryImageLocalBtn) {
        saveLibraryImageLocalBtn.onclick = async () => {
          try {
            const success = await window.api.saveImageToLocal(image.filePath, `image-${Date.now()}.jpg`);
            if (success) {
              alert('✅ 이미지가 로컬에 저장되었습니다.');
            } else {
              alert('❌ 이미지 저장에 실패했습니다.');
            }
          } catch (error) {
            alert(`❌ 오류: ${(error as Error).message}`);
          }
        };
      }

      // 삭제 버튼
      if (deleteLibraryImageBtn) {
        deleteLibraryImageBtn.onclick = async () => {
          if (confirm('이미지를 삭제하시겠습니까?')) {
            try {
              const success = await window.api.deleteLibraryImage(imageId);
              if (success) {
                alert('✅ 이미지가 삭제되었습니다.');
                libraryImageModal.setAttribute('aria-hidden', 'true');
                libraryImageModal.style.display = 'none';
                await loadLibraryImages();
              }
            } catch (error) {
              alert(`❌ 삭제 실패: ${(error as Error).message}`);
            }
          }
        };
      }

      libraryImageModal.setAttribute('aria-hidden', 'false');
      libraryImageModal.style.display = 'flex';
    }
  } catch (error) {
    alert(`❌ 오류: ${(error as Error).message}`);
  }
}

// 라이브러리 이미지 모달 닫기 (전역 초기화)
const libraryImageModalForClose = document.getElementById('library-image-modal') as HTMLDivElement;
const closeLibraryImageButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-close-library-image]'));
if (libraryImageModalForClose) {
  closeLibraryImageButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      libraryImageModalForClose.setAttribute('aria-hidden', 'true');
      libraryImageModalForClose.style.display = 'none';
    });
  });

  libraryImageModalForClose.addEventListener('click', (e) => {
    if (e.target === libraryImageModalForClose) {
      libraryImageModalForClose.setAttribute('aria-hidden', 'true');
      libraryImageModalForClose.style.display = 'none';
    }
  });
}

// ============================================
// 썸네일 생성기 초기화 - ✅ 대폭 개선
// ============================================

// 썸네일 생성기 전역 상태
let thumbnailBackgroundImage: string | null = null;
let thumbnailBackgroundDataUrl: string | null = null;

function switchToTab(tabName: string): void {
  // 모든 탭 버튼에서 active 제거
  const tabButtons = document.querySelectorAll('.tab-button');
  tabButtons.forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  // 모든 탭 패널 숨김
  const tabPanels = document.querySelectorAll('.tab-panel');
  tabPanels.forEach(panel => {
    panel.classList.remove('active');
  });

  // 지정된 탭 활성화
  const targetButton = document.querySelector(`[data-tab="${tabName}"]`) as HTMLElement;
  const targetPanel = document.getElementById(`tab-${tabName}`) as HTMLElement;

  if (targetButton && targetPanel) {
    targetButton.classList.add('active');
    targetButton.setAttribute('aria-selected', 'true');
    targetPanel.classList.add('active');
  }
}


// 즐겨찾기 컨텐츠 생성
function generateFavoritesContent(): string {
  const favorites = getFavoriteSettings();

  if (favorites.length === 0) {
    return `
      <div style="text-align: center; padding: 3rem; color: #6b7280;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⭐</div>
        <h3>즐겨찾기가 없습니다</h3>
        <p>자주 사용하는 설정을 즐겨찾기에 추가해보세요.</p>
      </div>
    `;
  }

  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; padding: 0;">
      ${favorites.map((fav: any, index: number) => `
        <div class="unified-item" data-index="${index}" data-type="favorites" onclick="selectUnifiedItem(this)" ondblclick="applyUnifiedItem('favorites', ${index})" style="
          border: 2px solid #e5e7eb; border-radius: 12px; padding: 1.5rem;
          cursor: pointer; transition: all 0.2s; background: white;
        ">
          <div style="display: flex; align-items: start; gap: 1rem;">
            <div style="width: 40px; height: 40px; border-radius: 8px; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; color: white; font-size: 1.2rem;">
              ⭐
            </div>
            <div style="flex: 1;">
              <h4 style="margin: 0 0 0.5rem 0; font-size: 1rem; font-weight: 600; color: #1f2937;">${fav.name}</h4>
              <p style="margin: 0 0 0.5rem 0; font-size: 0.8rem; color: #6b7280;">${fav.description}</p>
              <div style="display: flex; align-items: center; gap: 1rem; font-size: 0.75rem; color: #9ca3af;">
                <span>🎯 ${fav.category || '일반'}</span>
                <span>📊 ${fav.usageCount || 0}회 사용</span>
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// 템플릿 컨텐츠 생성
function generateTemplatesContent(): string {
  const templates = getEnhancedTemplates();

  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; padding: 0;">
      ${templates.map((template, index) => `
        <div class="unified-item" data-index="${index}" data-type="templates" onclick="selectUnifiedItem(this)" ondblclick="applyUnifiedItem('templates', ${index})" style="
          border: 2px solid #e5e7eb; border-radius: 12px; padding: 1.5rem;
          cursor: pointer; transition: all 0.2s; background: white; position: relative;
        ">
          <div style="position: absolute; top: 1rem; right: 1rem;">
            <span style="background: ${template.color}; color: white; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">${template.category}</span>
          </div>
          <div style="display: flex; align-items: start; gap: 1rem;">
            <div style="width: 50px; height: 50px; border-radius: 10px; background: ${template.bgColor}; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.5rem;">
              ${template.icon}
            </div>
            <div style="flex: 1;">
              <h4 style="margin: 0 0 0.5rem 0; font-size: 1.1rem; font-weight: 600; color: #1f2937;">${template.name}</h4>
              <p style="margin: 0 0 0.75rem 0; font-size: 0.85rem; color: #6b7280; line-height: 1.4;">${template.description}</p>
              <div style="display: flex; align-items: center; gap: 1rem; font-size: 0.75rem; color: #9ca3af;">
                <span>📊 ${template.wordCount}자</span>
                <span>⭐ ${template.popularity}/5.0</span>
                <span>👥 ${template.usageCount}회 사용</span>
              </div>
              <div style="margin-top: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.25rem;">
                ${template.tags.map(tag => `<span style="background: #f3f4f6; color: #374151; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem;">${tag}</span>`).join('')}
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// 향상된 템플릿 데이터
function getEnhancedTemplates(): Array<{
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  bgColor: string;
  wordCount: number;
  popularity: number;
  usageCount: number;
  tags: string[];
}> {
  return [
    {
      name: '📰 뉴스 스타일',
      description: '최신 뉴스나 트렌드 정보를 전문적으로 전달하는 형식입니다. 객관적이고 신뢰할 수 있는 콘텐츠를 생성합니다.',
      category: '정보',
      icon: '📰',
      color: '#3b82f6',
      bgColor: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
      wordCount: 1200,
      popularity: 4.8,
      usageCount: 1247,
      tags: ['뉴스', '트렌드', '정보', '전문성']
    },
    {
      name: '⭐ 제품 리뷰',
      description: '제품이나 서비스의 장단점을 분석하고 사용자 경험을 공유하는 리뷰 형식입니다.',
      category: '리뷰',
      icon: '⭐',
      color: '#f59e0b',
      bgColor: 'linear-gradient(135deg, #f59e0b, #d97706)',
      wordCount: 800,
      popularity: 4.6,
      usageCount: 892,
      tags: ['리뷰', '제품', '서비스', '분석']
    },
    {
      name: '📚 사용법 가이드',
      description: '단계별로 설명하는 사용법이나 튜토리얼 형식입니다. 초보자도 쉽게 따라할 수 있도록 구성됩니다.',
      category: '교육',
      icon: '📚',
      color: '#10b981',
      bgColor: 'linear-gradient(135deg, #10b981, #059669)',
      wordCount: 1500,
      popularity: 4.7,
      usageCount: 756,
      tags: ['가이드', '튜토리얼', '교육', '단계별']
    },
    {
      name: '📖 스토리텔링',
      description: '이야기 형식으로 콘텐츠를 전달하는 형식입니다. 독자의 공감을 불러일으키는 감성적인 접근을 합니다.',
      category: '스토리',
      icon: '📖',
      color: '#8b5cf6',
      bgColor: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
      wordCount: 1000,
      popularity: 4.5,
      usageCount: 634,
      tags: ['스토리', '이야기', '감성', '공감']
    },
    {
      name: '💡 꿀팁 공유',
      description: '실용적이고 도움이 되는 생활 꿀팁이나 노하우를 공유하는 형식입니다.',
      category: '라이프',
      icon: '💡',
      color: '#06b6d4',
      bgColor: 'linear-gradient(135deg, #06b6d4, #0891b2)',
      wordCount: 600,
      popularity: 4.4,
      usageCount: 523,
      tags: ['꿀팁', '라이프', '실용', '노하우']
    },
    {
      name: '🔬 전문 분석',
      description: '데이터와 사실에 기반한 전문적인 분석 콘텐츠입니다. 신뢰할 수 있는 정보를 제공합니다.',
      category: '분석',
      icon: '🔬',
      color: '#ef4444',
      bgColor: 'linear-gradient(135deg, #ef4444, #dc2626)',
      wordCount: 1800,
      popularity: 4.9,
      usageCount: 445,
      tags: ['분석', '데이터', '전문성', '신뢰성']
    },
    {
      name: '🎯 비교 분석',
      description: '여러 옵션을 비교하고 장단점을 분석하는 형식입니다. 선택에 도움이 되는 정보를 제공합니다.',
      category: '비교',
      icon: '🎯',
      color: '#f97316',
      bgColor: 'linear-gradient(135deg, #f97316, #ea580c)',
      wordCount: 1400,
      popularity: 4.6,
      usageCount: 398,
      tags: ['비교', '분석', '선택', '장단점']
    },
    {
      name: '🌟 성공 사례',
      description: '실제 성공 사례를 공유하고 교훈을 전달하는 형식입니다. 동기부여 콘텐츠에 적합합니다.',
      category: '동기부여',
      icon: '🌟',
      color: '#ec4899',
      bgColor: 'linear-gradient(135deg, #ec4899, #db2777)',
      wordCount: 900,
      popularity: 4.3,
      usageCount: 312,
      tags: ['성공', '사례', '동기부여', '교훈']
    },
    {
      name: '🤝 인터뷰 형식',
      description: 'Q&A 형식의 인터뷰 콘텐츠입니다. 전문가의 의견을 자연스럽게 전달합니다.',
      category: '인터뷰',
      icon: '🤝',
      color: '#84cc16',
      bgColor: 'linear-gradient(135deg, #84cc16, #65a30d)',
      wordCount: 1100,
      popularity: 4.2,
      usageCount: 267,
      tags: ['인터뷰', 'Q&A', '전문가', '의견']
    },
    {
      name: '📈 트렌드 분석',
      description: '시장 트렌드와 미래 전망을 분석하는 콘텐츠입니다. 인사이트를 제공합니다.',
      category: '트렌드',
      icon: '📈',
      color: '#6366f1',
      bgColor: 'linear-gradient(135deg, #6366f1, #4f46e5)',
      wordCount: 1300,
      popularity: 4.7,
      usageCount: 589,
      tags: ['트렌드', '분석', '미래', '인사이트']
    }
  ];
}

export { initImageLibrary, loadLibraryImages, useLibraryImage, switchToTab, generateFavoritesContent, generateTemplatesContent, getEnhancedTemplates };
