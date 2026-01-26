/**
 * ✅ [2026-01-25 모듈화] 소제목 이미지 설정 모달
 * - renderer.ts에서 분리됨
 */

export type HeadingImageMode = 'all' | 'thumbnail-only' | 'odd-only' | 'even-only' | 'none';

let currentHeadingImageMode: HeadingImageMode = 'all';

export function getHeadingImageMode(): HeadingImageMode {
  const saved = localStorage.getItem('headingImageMode') as HeadingImageMode | null;
  return saved || currentHeadingImageMode;
}

export function setHeadingImageMode(mode: HeadingImageMode): void {
  currentHeadingImageMode = mode;
  localStorage.setItem('headingImageMode', mode);
  console.log(`[HeadingImageSettings] 이미지 모드 설정: ${mode}`);
}

export function createHeadingImageModal(): void {
  if (document.getElementById('heading-image-modal')) return;

  const modalHtml = `
    <div id="heading-image-modal" style="
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(30,30,60,0.8) 100%);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 10000;
      justify-content: center;
      align-items: center;
    ">
      <div style="
        max-width: 420px;
        width: 90%;
        padding: 28px 32px;
        border-radius: 24px;
        background: linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(248,250,255,0.92) 100%);
        box-shadow: 
          0 25px 50px -12px rgba(0,0,0,0.35),
          0 0 0 1px rgba(255,255,255,0.2),
          inset 0 1px 0 rgba(255,255,255,0.8);
        animation: modalSlideIn 0.3s ease-out;
      ">
        <style>
          @keyframes modalSlideIn {
            from { opacity: 0; transform: translateY(-20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .heading-img-option {
            display: flex;
            align-items: center;
            gap: 14px;
            cursor: pointer;
            padding: 14px 16px;
            border-radius: 12px;
            background: rgba(255,255,255,0.6);
            border: 2px solid transparent;
            transition: all 0.2s ease;
            margin-bottom: 10px;
          }
          .heading-img-option:hover {
            background: linear-gradient(135deg, rgba(102,126,234,0.08) 0%, rgba(118,75,162,0.08) 100%);
            border-color: rgba(102,126,234,0.3);
            transform: translateX(4px);
          }
          .heading-img-option:has(input:checked) {
            background: linear-gradient(135deg, rgba(102,126,234,0.15) 0%, rgba(118,75,162,0.15) 100%);
            border-color: #667eea;
            box-shadow: 0 4px 12px rgba(102,126,234,0.2);
          }
          .heading-img-option input[type="radio"] {
            width: 20px;
            height: 20px;
            accent-color: #667eea;
            cursor: pointer;
          }
          .heading-img-option .option-text {
            font-size: 15px;
            font-weight: 500;
            color: #1a1a2e;
          }
          .heading-img-option .option-desc {
            font-size: 12px;
            color: #6b7280;
            margin-top: 2px;
          }
        </style>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <div>
            <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a2e; display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 24px;">🖼️</span>
              소제목 이미지 설정
            </h3>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #6b7280;">전역 설정 - 모든 발행에 적용됩니다</p>
          </div>
          <button id="heading-image-close-btn" style="
            background: rgba(0,0,0,0.05);
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            font-size: 20px;
            cursor: pointer;
            color: #6b7280;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          " onmouseover="this.style.background='rgba(239,68,68,0.1)'; this.style.color='#ef4444';" onmouseout="this.style.background='rgba(0,0,0,0.05)'; this.style.color='#6b7280';">×</button>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label class="heading-img-option">
            <input type="radio" name="heading-image-mode" value="all" checked>
            <div>
              <div class="option-text">✨ 모두 생성 (기본)</div>
              <div class="option-desc">썸네일 + 모든 소제목 이미지 생성</div>
            </div>
          </label>
          
          <label class="heading-img-option">
            <input type="radio" name="heading-image-mode" value="thumbnail-only">
            <div>
              <div class="option-text">🎯 썸네일만</div>
              <div class="option-desc">대표 이미지만 생성, 소제목 이미지 없음</div>
            </div>
          </label>
          
          <label class="heading-img-option">
            <input type="radio" name="heading-image-mode" value="odd-only">
            <div>
              <div class="option-text">🔢 홀수 소제목만</div>
              <div class="option-desc">1, 3, 5번째 소제목에만 이미지 생성</div>
            </div>
          </label>
          
          <label class="heading-img-option">
            <input type="radio" name="heading-image-mode" value="even-only">
            <div>
              <div class="option-text">🔢 짝수 소제목만</div>
              <div class="option-desc">2, 4, 6번째 소제목에만 이미지 생성</div>
            </div>
          </label>
          
          <label class="heading-img-option">
            <input type="radio" name="heading-image-mode" value="none">
            <div>
              <div class="option-text">🚫 이미지 없음</div>
              <div class="option-desc">텍스트만으로 발행 (이미지 비용 절약)</div>
            </div>
          </label>
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button id="heading-image-cancel-btn" style="
            padding: 12px 24px;
            background: rgba(0,0,0,0.05);
            color: #4b5563;
            border: none;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          " onmouseover="this.style.background='rgba(0,0,0,0.1)';" onmouseout="this.style.background='rgba(0,0,0,0.05)';">취소</button>
          <button id="heading-image-save-btn" style="
            padding: 12px 28px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(102,126,234,0.4);
            transition: all 0.2s;
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(102,126,234,0.5)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 14px rgba(102,126,234,0.4)';">💾 저장</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  document.getElementById('heading-image-close-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('heading-image-modal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('heading-image-cancel-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('heading-image-modal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('heading-image-save-btn')?.addEventListener('click', () => {
    const selected = document.querySelector('input[name="heading-image-mode"]:checked') as HTMLInputElement;
    if (selected) {
      setHeadingImageMode(selected.value as HeadingImageMode);
      const modeNames: Record<HeadingImageMode, string> = {
        'all': '모두 생성', 'thumbnail-only': '썸네일만', 'odd-only': '홀수만', 'even-only': '짝수만', 'none': '이미지 없음'
      };
      if ((window as any).toastManager) {
        (window as any).toastManager.success(`🖼️ 이미지 설정 저장: ${modeNames[selected.value as HeadingImageMode]}`);
      }
    }
    const modal = document.getElementById('heading-image-modal');
    if (modal) modal.style.display = 'none';
  });

  const modal = document.getElementById('heading-image-modal');
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  console.log('[HeadingImageSettings] 모달 생성 완료');
}

export function openHeadingImageModal(): void {
  createHeadingImageModal();
  const modal = document.getElementById('heading-image-modal');
  if (modal) {
    modal.style.display = 'flex';
    const currentMode = getHeadingImageMode();
    const radioBtn = document.querySelector(`input[name="heading-image-mode"][value="${currentMode}"]`) as HTMLInputElement;
    if (radioBtn) radioBtn.checked = true;
  }
}

// 전역에 노출
(window as any).openHeadingImageModal = openHeadingImageModal;
(window as any).getHeadingImageMode = getHeadingImageMode;
(window as any).setHeadingImageMode = setHeadingImageMode;

// DOM 로드 후 버튼 자동 삽입
export function initHeadingImageButton(): void {
  // 이미 존재하면 스킵
  if (document.getElementById('heading-image-setting-btn')) {
    console.log('[HeadingImageSettings] 버튼 이미 존재');
    return;
  }

  setTimeout(() => {
    const btn = document.createElement('button');
    btn.id = 'heading-image-setting-btn';
    btn.innerHTML = '🖼️ 소제목 이미지 설정';
    btn.style.cssText = `
      padding: 10px 18px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      margin: 10px 0;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
    });
    btn.addEventListener('click', () => openHeadingImageModal());

    const insertTargets = [
      '.unified-options-section',
      '#unified-publish-options',
      '.publish-options',
      '#image-options-container',
      '.automation-settings',
      '[data-section="options"]',
      '#unified-tab .glass-card:first-child',
      '.settings-section',
      '#main-content',
    ];

    let inserted = false;
    for (const selector of insertTargets) {
      const container = document.querySelector(selector);
      if (container) {
        if (!container.querySelector('#heading-image-setting-btn')) {
          container.insertBefore(btn, container.firstChild);
          console.log(`[HeadingImageSettings] ✅ 버튼 삽입 완료: ${selector}`);
          inserted = true;
          break;
        }
      }
    }

    // 항상 플로팅 버튼으로 표시 (삽입 실패 시)
    if (!inserted) {
      console.log('[HeadingImageSettings] ⚠️ 삽입 위치 못 찾음, 플로팅 버튼 표시');
      btn.style.position = 'fixed';
      btn.style.bottom = '100px';  // ✅ [2026-01-26] 추가 30% 아래로 이동 (140px -> 100px)
      btn.style.right = '24px';    // 우측 메뉴 버튼들과 정렬
      btn.style.zIndex = '9998';   // AI 비서보다 살짝 아래
      btn.style.boxShadow = '0 4px 20px rgba(102, 126, 234, 0.5)';  // 더 눈에 띄게
      document.body.appendChild(btn);
      console.log('[HeadingImageSettings] ✅ 플로팅 버튼으로 추가됨 (bottom: 140px, right: 24px)');
    }
  }, 500); // 500ms로 단축
}

console.log('[HeadingImageSettings] 📦 모듈 로드됨!');
