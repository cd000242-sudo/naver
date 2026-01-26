/**
 * 쇼핑커넥트 배너 커스터마이징 UI 컴포넌트
 * - 배너 문구/색상/크기 선택
 * - 이미지 업로드 기능
 * - 애니메이션 스타일 선택
 * - 미리보기 기능
 */

// 배너 색상 프리셋
export const BANNER_COLORS: Record<string, { name: string; bg: string; accent: string }> = {
    'naver-green': { name: '네이버 그린', bg: '#03C75A', accent: '#02b653' },
    'ocean-blue': { name: '오션 블루', bg: '#3B82F6', accent: '#2563EB' },
    'sunset-red': { name: '선셋 레드', bg: '#EF4444', accent: '#DC2626' },
    'royal-purple': { name: '로얄 퍼플', bg: '#8B5CF6', accent: '#7C3AED' },
    'coral-pink': { name: '코랄 핑크', bg: '#F472B6', accent: '#EC4899' },
    'golden-amber': { name: '골든 앰버', bg: '#F59E0B', accent: '#D97706' },
    'midnight-black': { name: '미드나잇 블랙', bg: '#1F2937', accent: '#374151' },
    'gradient-rainbow': { name: '레인보우 그라데이션', bg: 'linear-gradient(135deg, #F59E0B, #EC4899, #8B5CF6, #3B82F6)', accent: '#7C3AED' },
};

// 애니메이션 스타일 프리셋
export const BANNER_ANIMATIONS: Record<string, { name: string; css: string }> = {
    'shimmer': { name: '✨ 반짝 샤인', css: 'shimmer 2s infinite linear' },
    'pulse': { name: '💓 펄스 효과', css: 'pulse 2s infinite' },
    'glow': { name: '🌟 글로우 효과', css: 'glow 1.5s infinite alternate' },
    'bounce': { name: '🎾 바운스', css: 'bounce 1s infinite' },
    'none': { name: '❌ 없음', css: 'none' },
};

// 배너 크기 프리셋
export const BANNER_SIZES: Record<string, { name: string; width: number; height: number; fontSize: number }> = {
    'compact': { name: '컴팩트 (480px)', width: 480, height: 80, fontSize: 24 },
    'standard': { name: '표준 (640px)', width: 640, height: 100, fontSize: 32 },
    'large': { name: '대형 (800px)', width: 800, height: 120, fontSize: 40 },
    'full': { name: '풀 사이즈 (960px)', width: 960, height: 140, fontSize: 48 },
};

// 배너 설정 인터페이스
export interface BannerSettings {
    text: string;
    colorKey: string;
    sizeKey: string;
    animationKey: string;
    customImagePath?: string;
    customBgColor?: string;
}

// 현재 배너 설정 (전역 상태)
let currentBannerSettings: BannerSettings = {
    text: '지금 바로 구매하기 →',
    colorKey: 'naver-green',
    sizeKey: 'standard',
    animationKey: 'shimmer',
};

// 생성된 배너 이미지 경로
let generatedBannerPath: string | null = null;

/**
 * 배너 커스터마이징 UI HTML 생성
 */
export function createBannerCustomizationUI(): string {
    const colorOptions = Object.entries(BANNER_COLORS)
        .map(([key, val]) => {
            const bgStyle = val.bg.includes('gradient')
                ? `background: ${val.bg};`
                : `background: ${val.bg};`;
            return `
        <button type="button" class="banner-color-btn" data-color="${key}" 
          style="${bgStyle} width: 36px; height: 36px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; transition: all 0.2s;"
          title="${val.name}">
        </button>
      `;
        }).join('');

    const sizeOptions = Object.entries(BANNER_SIZES)
        .map(([key, val]) => `<option value="${key}">${val.name}</option>`)
        .join('');

    const animOptions = Object.entries(BANNER_ANIMATIONS)
        .map(([key, val]) => `<option value="${key}">${val.name}</option>`)
        .join('');

    return `
    <div id="banner-customization-section" style="
      margin-top: 1rem;
      background: linear-gradient(135deg, rgba(3, 199, 90, 0.08), rgba(59, 130, 246, 0.05));
      border: 1px solid rgba(3, 199, 90, 0.25);
      border-radius: 12px;
      padding: 1rem;
    ">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
        <h4 style="margin: 0; color: #03C75A; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1.2rem;">🎨</span> CTA 배너 커스터마이징
        </h4>
        <button type="button" id="banner-toggle-btn" style="
          background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem;
        ">▼</button>
      </div>
      
      <div id="banner-customization-content" style="display: block;">
        <!-- 배너 문구 -->
        <div style="margin-bottom: 0.75rem;">
          <label style="display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">
            📝 배너 문구
          </label>
          <input type="text" id="banner-text-input" value="지금 바로 구매하기 →" 
            placeholder="구매를 유도하는 문구를 입력하세요"
            style="width: 100%; padding: 0.6rem 0.75rem; border: 1px solid var(--border-light); border-radius: 8px; 
              background: var(--bg-primary); color: var(--text-strong); font-size: 0.9rem;">
        </div>
        
        <!-- 배경 색상 -->
        <div style="margin-bottom: 0.75rem;">
          <label style="display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.4rem;">
            🎨 배경 색상
          </label>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            ${colorOptions}
          </div>
        </div>
        
        <!-- 크기 선택 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
          <div>
            <label style="display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">
              📐 배너 크기
            </label>
            <select id="banner-size-select" style="
              width: 100%; padding: 0.5rem; border: 1px solid var(--border-light); border-radius: 8px;
              background: var(--bg-primary); color: var(--text-strong); font-size: 0.85rem;">
              ${sizeOptions}
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">
              ✨ 애니메이션
            </label>
            <select id="banner-animation-select" style="
              width: 100%; padding: 0.5rem; border: 1px solid var(--border-light); border-radius: 8px;
              background: var(--bg-primary); color: var(--text-strong); font-size: 0.85rem;">
              ${animOptions}
            </select>
          </div>
        </div>
        
        <!-- 이미지 업로드 -->
        <div style="margin-bottom: 0.75rem;">
          <label style="display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">
            📷 커스텀 배경 이미지 (선택)
          </label>
          <div style="display: flex; gap: 0.5rem;">
            <input type="file" id="banner-image-upload" accept="image/*" style="display: none;">
            <button type="button" id="banner-image-upload-btn" style="
              flex: 1; padding: 0.5rem; background: var(--bg-secondary); border: 1px dashed var(--border-light);
              border-radius: 8px; color: var(--text-muted); cursor: pointer; font-size: 0.85rem;
              transition: all 0.2s;">
              🖼️ 이미지 선택...
            </button>
            <button type="button" id="banner-image-clear-btn" style="
              padding: 0.5rem 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3);
              border-radius: 8px; color: #EF4444; cursor: pointer; font-size: 0.85rem;
              display: none;">
              ✕
            </button>
          </div>
          <div id="banner-image-preview-name" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;"></div>
        </div>
        
        <!-- 액션 버튼 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem;">
          <button type="button" id="banner-preview-btn" style="
            padding: 0.6rem; background: linear-gradient(135deg, #3B82F6, #2563EB);
            border: none; border-radius: 8px; color: white; font-weight: 600;
            cursor: pointer; font-size: 0.9rem; transition: all 0.2s;">
            👁️ 미리보기
          </button>
          <button type="button" id="banner-generate-btn" style="
            padding: 0.6rem; background: linear-gradient(135deg, #03C75A, #02b653);
            border: none; border-radius: 8px; color: white; font-weight: 600;
            cursor: pointer; font-size: 0.9rem; transition: all 0.2s;">
            ✨ 배너 생성
          </button>
        </div>
        
        <!-- 미리보기 영역 -->
        <div id="banner-preview-container" style="
          background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem;
          display: none; text-align: center;">
          <div id="banner-preview-area" style="display: inline-block; max-width: 100%; overflow: hidden; border-radius: 8px;"></div>
          <div id="banner-preview-status" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;"></div>
        </div>
      </div>
    </div>
  `;
}

/**
 * 배너 커스터마이징 UI 이벤트 바인딩
 */
export function initBannerCustomizationUI(): void {
    // 토글 버튼
    const toggleBtn = document.getElementById('banner-toggle-btn');
    const content = document.getElementById('banner-customization-content');
    if (toggleBtn && content) {
        toggleBtn.addEventListener('click', () => {
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
            toggleBtn.textContent = isVisible ? '▶' : '▼';
        });
    }

    // 색상 버튼 클릭
    const colorBtns = document.querySelectorAll('.banner-color-btn');
    colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            colorBtns.forEach(b => (b as HTMLElement).style.borderColor = 'transparent');
            (btn as HTMLElement).style.borderColor = 'white';
            currentBannerSettings.colorKey = (btn as HTMLElement).dataset.color || 'naver-green';
            updateBannerPreview();
        });
    });

    // 첫 번째 색상 버튼 선택
    const firstColorBtn = document.querySelector('.banner-color-btn') as HTMLElement;
    if (firstColorBtn) {
        firstColorBtn.style.borderColor = 'white';
    }

    // 문구 입력
    const textInput = document.getElementById('banner-text-input') as HTMLInputElement;
    if (textInput) {
        textInput.addEventListener('input', () => {
            currentBannerSettings.text = textInput.value;
            updateBannerPreview();
        });
    }

    // 크기 선택
    const sizeSelect = document.getElementById('banner-size-select') as HTMLSelectElement;
    if (sizeSelect) {
        sizeSelect.value = 'standard';
        sizeSelect.addEventListener('change', () => {
            currentBannerSettings.sizeKey = sizeSelect.value;
            updateBannerPreview();
        });
    }

    // 애니메이션 선택
    const animSelect = document.getElementById('banner-animation-select') as HTMLSelectElement;
    if (animSelect) {
        animSelect.value = 'shimmer';
        animSelect.addEventListener('change', () => {
            currentBannerSettings.animationKey = animSelect.value;
            updateBannerPreview();
        });
    }

    // 이미지 업로드
    const imageUploadBtn = document.getElementById('banner-image-upload-btn');
    const imageUpload = document.getElementById('banner-image-upload') as HTMLInputElement;
    const imageClearBtn = document.getElementById('banner-image-clear-btn');
    const imagePreviewName = document.getElementById('banner-image-preview-name');

    if (imageUploadBtn && imageUpload) {
        imageUploadBtn.addEventListener('click', () => imageUpload.click());

        imageUpload.addEventListener('change', () => {
            const file = imageUpload.files?.[0];
            if (file) {
                currentBannerSettings.customImagePath = URL.createObjectURL(file);
                if (imagePreviewName) imagePreviewName.textContent = `✅ ${file.name}`;
                if (imageClearBtn) imageClearBtn.style.display = 'block';
                updateBannerPreview();
            }
        });
    }

    if (imageClearBtn && imagePreviewName && imageUpload) {
        imageClearBtn.addEventListener('click', () => {
            currentBannerSettings.customImagePath = undefined;
            imageUpload.value = '';
            imagePreviewName.textContent = '';
            imageClearBtn.style.display = 'none';
            updateBannerPreview();
        });
    }

    // 미리보기 버튼
    const previewBtn = document.getElementById('banner-preview-btn');
    if (previewBtn) {
        previewBtn.addEventListener('click', () => {
            const container = document.getElementById('banner-preview-container');
            if (container) {
                container.style.display = container.style.display === 'none' ? 'block' : 'none';
                updateBannerPreview();
            }
        });
    }

    // 배너 생성 버튼
    const generateBtn = document.getElementById('banner-generate-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            await generateCustomBanner();
        });
    }
}

/**
 * 실시간 미리보기 업데이트
 */
function updateBannerPreview(): void {
    const previewArea = document.getElementById('banner-preview-area');
    if (!previewArea) return;

    const color = BANNER_COLORS[currentBannerSettings.colorKey] || BANNER_COLORS['naver-green'];
    const size = BANNER_SIZES[currentBannerSettings.sizeKey] || BANNER_SIZES['standard'];
    const anim = BANNER_ANIMATIONS[currentBannerSettings.animationKey] || BANNER_ANIMATIONS['shimmer'];

    const bgStyle = currentBannerSettings.customImagePath
        ? `background-image: url('${currentBannerSettings.customImagePath}'); background-size: cover; background-position: center;`
        : (color.bg.includes('gradient') ? `background: ${color.bg};` : `background: ${color.bg};`);

    // 애니메이션 CSS 추가
    const animationCSS = anim.css !== 'none' ? `
    <style>
      @keyframes shimmer {
        0% { background-position: -${size.width}px 0; }
        100% { background-position: ${size.width}px 0; }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); }
      }
      @keyframes glow {
        0% { box-shadow: 0 0 10px rgba(255,255,255,0.3); }
        100% { box-shadow: 0 0 25px rgba(255,255,255,0.6); }
      }
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }
    </style>
  ` : '';

    const shimmerOverlay = anim.css.includes('shimmer') ? `
    <div style="
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%);
      background-size: ${size.width}px 100%;
      animation: ${anim.css};
      pointer-events: none;
    "></div>
  ` : '';

    previewArea.innerHTML = `
    ${animationCSS}
    <div style="
      ${bgStyle}
      width: ${Math.min(size.width, 600)}px;
      padding: ${size.height * 0.3}px ${size.width * 0.05}px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      text-align: center;
      position: relative;
      overflow: hidden;
      ${anim.css !== 'none' && !anim.css.includes('shimmer') ? `animation: ${anim.css};` : ''}
    ">
      ${shimmerOverlay}
      <div style="
        font-size: ${Math.min(size.fontSize, 32)}px;
        font-weight: 900;
        color: white;
        text-shadow: 2px 2px 8px rgba(0,0,0,0.3);
        position: relative;
        z-index: 1;
      ">${currentBannerSettings.text || '지금 바로 구매하기 →'}</div>
      <div style="
        font-size: ${Math.min(size.fontSize * 0.5, 16)}px;
        color: rgba(255,255,255,0.8);
        margin-top: 0.5rem;
        position: relative;
        z-index: 1;
      ">👆 지금 클릭!</div>
    </div>
  `;
}

/**
 * 커스텀 배너 이미지 생성
 */
async function generateCustomBanner(): Promise<void> {
    const statusEl = document.getElementById('banner-preview-status');
    const generateBtn = document.getElementById('banner-generate-btn') as HTMLButtonElement;

    try {
        if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.textContent = '⏳ 생성 중...';
        }

        if (statusEl) statusEl.textContent = '🎨 배너 이미지 생성 중...';

        // IPC를 통해 main 프로세스에서 배너 생성
        const result = await (window as any).api.generateCustomBanner({
            text: currentBannerSettings.text,
            colorKey: currentBannerSettings.colorKey,
            sizeKey: currentBannerSettings.sizeKey,
            animationKey: currentBannerSettings.animationKey,
            customImagePath: currentBannerSettings.customImagePath,
        });

        if (result?.success && result.path) {
            generatedBannerPath = result.path;

            // 전역 상태에 저장 (발행 시 사용)
            (window as any).customBannerPath = result.path;

            if (statusEl) statusEl.textContent = `✅ 배너 생성 완료! (${result.path.split(/[/\\]/).pop()})`;

            // 생성된 이미지 미리보기 표시
            const previewArea = document.getElementById('banner-preview-area');
            if (previewArea) {
                previewArea.innerHTML = `
          <img src="file://${result.path.replace(/\\/g, '/')}" 
            style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);"
            alt="생성된 배너">
        `;
            }

            // 컨테이너 표시
            const container = document.getElementById('banner-preview-container');
            if (container) container.style.display = 'block';

            (window as any).toastManager?.success('✅ 커스텀 배너가 생성되었습니다!');
        } else {
            throw new Error(result?.message || '배너 생성 실패');
        }
    } catch (error) {
        console.error('[BannerCustomization] 배너 생성 오류:', error);
        if (statusEl) statusEl.textContent = `❌ 오류: ${(error as Error).message}`;
        (window as any).toastManager?.error(`배너 생성 실패: ${(error as Error).message}`);
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = '✨ 배너 생성';
        }
    }
}

/**
 * 현재 배너 설정 가져오기
 */
export function getCurrentBannerSettings(): BannerSettings {
    return { ...currentBannerSettings };
}

/**
 * 생성된 커스텀 배너 경로 가져오기
 */
export function getGeneratedBannerPath(): string | null {
    return generatedBannerPath || (window as any).customBannerPath || null;
}
