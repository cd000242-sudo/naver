/**
 * 소제목 이미지 세팅 모달
 * 풀오토/연속발행/다중계정 발행 모드에서 사용
 */

// ✅ 모듈 로드 확인용 즉시 실행 로그
console.log('[HeadingImageSettings] 📦 모듈 로드됨!');

export type HeadingImageMode = 'all' | 'thumbnail-only' | 'odd-only' | 'even-only' | 'none';

// 전역 설정 저장소
let currentHeadingImageMode: HeadingImageMode = 'all';

/**
 * 현재 설정된 headingImageMode 반환
 */
export function getHeadingImageMode(): HeadingImageMode {
  // localStorage에서 저장된 값 로드 (없으면 'all' 기본값)
  const saved = localStorage.getItem('headingImageMode') as HeadingImageMode | null;
  return saved || currentHeadingImageMode;
}

/**
 * headingImageMode 설정
 */
export function setHeadingImageMode(mode: HeadingImageMode): void {
  currentHeadingImageMode = mode;
  localStorage.setItem('headingImageMode', mode);
  console.log(`[HeadingImageSettings] 이미지 모드 설정: ${mode}`);
}

/**
 * 소제목 인덱스가 현재 모드에서 이미지를 생성해야 하는지 확인
 * @param headingIndex 0부터 시작하는 소제목 인덱스
 * @param isThumbnail 썸네일 이미지인지 여부
 */
export function shouldGenerateImageForHeading(headingIndex: number, isThumbnail: boolean = false): boolean {
  const mode = getHeadingImageMode();

  switch (mode) {
    case 'all':
      return true;
    case 'thumbnail-only':
      return isThumbnail;
    case 'odd-only':
      // 1, 3, 5... (1-indexed 기준 홀수)
      return isThumbnail || (headingIndex + 1) % 2 === 1;
    case 'even-only':
      // 2, 4, 6... (1-indexed 기준 짝수)
      return isThumbnail || (headingIndex + 1) % 2 === 0;
    case 'none':
      return false;
    default:
      return true;
  }
}

/**
 * 소제목 이미지 세팅 모달 HTML 생성 및 추가
 */
export function createHeadingImageModal(): void {
  // 이미 모달이 있으면 스킵
  if (document.getElementById('heading-image-modal')) {
    return;
  }

  const modalHtml = `
    <div id="heading-image-modal" class="modal-overlay" style="display:none;">
      <div class="modal-container glass-card" style="max-width:400px; padding:24px; border-radius:16px;">
        <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h3 style="margin:0; font-size:18px; font-weight:600;">🖼️ 생성할 소제목 이미지 선택</h3>
          <button id="heading-image-close-btn" style="background:none; border:none; font-size:24px; cursor:pointer; color:#888;">×</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:12px;">
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:10px; border-radius:8px; transition:background 0.2s;">
            <input type="radio" name="heading-image-mode" value="all" checked style="width:18px; height:18px;">
            <span>모두 (기본)</span>
          </label>
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:10px; border-radius:8px; transition:background 0.2s;">
            <input type="radio" name="heading-image-mode" value="thumbnail-only" style="width:18px; height:18px;">
            <span>썸네일만</span>
          </label>
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:10px; border-radius:8px; transition:background 0.2s;">
            <input type="radio" name="heading-image-mode" value="odd-only" style="width:18px; height:18px;">
            <span>홀수 소제목만 (1, 3, 5...)</span>
          </label>
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:10px; border-radius:8px; transition:background 0.2s;">
            <input type="radio" name="heading-image-mode" value="even-only" style="width:18px; height:18px;">
            <span>짝수 소제목만 (2, 4, 6...)</span>
          </label>
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:10px; border-radius:8px; transition:background 0.2s;">
            <input type="radio" name="heading-image-mode" value="none" style="width:18px; height:18px;">
            <span>이미지 없음</span>
          </label>
        </div>
        <div class="modal-footer" style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
          <button id="heading-image-save-btn" style="padding:10px 24px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:white; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer;">
            저장
          </button>
        </div>
      </div>
    </div>
  `;

  // body에 모달 추가
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // 이벤트 리스너 등록
  const modal = document.getElementById('heading-image-modal');
  const closeBtn = document.getElementById('heading-image-close-btn');
  const saveBtn = document.getElementById('heading-image-save-btn');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeHeadingImageModal());
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const selected = document.querySelector('input[name="heading-image-mode"]:checked') as HTMLInputElement;
      if (selected) {
        setHeadingImageMode(selected.value as HeadingImageMode);

        // 토스트 메시지
        const modeNames: Record<HeadingImageMode, string> = {
          'all': '모두',
          'thumbnail-only': '썸네일만',
          'odd-only': '홀수 소제목만',
          'even-only': '짝수 소제목만',
          'none': '이미지 없음'
        };

        if ((window as any).toastManager) {
          (window as any).toastManager.success(`🖼️ 이미지 설정: ${modeNames[selected.value as HeadingImageMode]}`);
        }
      }
      closeHeadingImageModal();
    });
  }

  // 오버레이 클릭 시 닫기
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeHeadingImageModal();
      }
    });
  }

  // 모달 오버레이 스타일
  const style = document.createElement('style');
  style.textContent = `
    #heading-image-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    }
    #heading-image-modal label:hover {
      background: rgba(102, 126, 234, 0.1);
    }
    #heading-image-save-btn:hover {
      transform: scale(1.02);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
  `;
  document.head.appendChild(style);

  console.log('[HeadingImageSettings] 모달 생성 완료');
}

/**
 * 모달 열기
 */
export function openHeadingImageModal(): void {
  createHeadingImageModal();

  const modal = document.getElementById('heading-image-modal');
  if (modal) {
    modal.style.display = 'flex';

    // 현재 설정값으로 라디오 버튼 선택
    const currentMode = getHeadingImageMode();
    const radioBtn = document.querySelector(`input[name="heading-image-mode"][value="${currentMode}"]`) as HTMLInputElement;
    if (radioBtn) {
      radioBtn.checked = true;
    }
  }
}

/**
 * 모달 닫기
 */
export function closeHeadingImageModal(): void {
  const modal = document.getElementById('heading-image-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * "생성할 소제목 이미지 선택하기" 버튼 생성
 */
export function createHeadingImageSettingButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = 'heading-image-setting-btn';
  btn.className = 'btn-secondary';
  btn.innerHTML = '🖼️ 소제목 이미지 설정';
  btn.style.cssText = `
    padding: 8px 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `;

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.02)';
    btn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = 'none';
  });

  btn.addEventListener('click', () => {
    openHeadingImageModal();
  });

  return btn;
}

/**
 * 발행 UI에 소제목 이미지 설정 버튼을 자동으로 삽입
 * - 풀오토/연속발행/다중계정 발행 영역에 버튼 추가
 */
export function initHeadingImageSettingButtons(): void {
  // 이미 초기화되었으면 스킵
  if ((window as any).__headingImageSettingButtonsInitialized) {
    return;
  }
  (window as any).__headingImageSettingButtonsInitialized = true;

  console.log('[HeadingImageSettings] 버튼 자동 삽입 시작...');

  // ✅ 모달 미리 생성
  createHeadingImageModal();

  // ✅ 버튼을 삽입할 대상 요소 ID 목록 (각 발행 모드별)
  const targetSelectors = [
    // 풀오토 발행 영역
    '#full-auto-options-area',
    '#full-auto-settings',
    '#fullAutoPublishSection',
    '[data-section="full-auto"]',
    // 연속 발행 영역
    '#continuous-publish-options',
    '#continuous-settings-area',
    '#continuousPublishSection',
    '[data-section="continuous"]',
    '.continuous-publish-settings',
    // 다중 계정 발행 영역
    '#multi-account-options',
    '#multi-account-settings',
    '#multiAccountPublishSection',
    '[data-section="multi-account"]',
    '.multi-account-publish-settings',
    // 일반 발행 옵션 영역 (fallback)
    '#publish-options',
    '#automation-options',
    '.publish-options-container',
    '.automation-settings',
  ];

  let buttonsInserted = 0;

  for (const selector of targetSelectors) {
    const container = document.querySelector(selector);
    if (container && !container.querySelector('#heading-image-setting-btn')) {
      const btn = createHeadingImageSettingButton();
      btn.id = `heading-image-setting-btn-${buttonsInserted}`;
      btn.style.marginTop = '10px';
      btn.style.marginBottom = '10px';
      container.appendChild(btn);
      console.log(`[HeadingImageSettings] ✅ 버튼 삽입 완료: ${selector}`);
      buttonsInserted++;
    }
  }

  // ✅ 타겟 요소를 찾지 못하면 DOM 변화 감시하여 나중에 삽입
  if (buttonsInserted === 0) {
    console.log('[HeadingImageSettings] ⚠️ 대상 요소를 찾지 못함. MutationObserver로 감시 시작...');

    const observer = new MutationObserver(() => {
      for (const selector of targetSelectors) {
        const container = document.querySelector(selector);
        if (container && !container.querySelector('[id^="heading-image-setting-btn"]')) {
          const btn = createHeadingImageSettingButton();
          btn.id = `heading-image-setting-btn-observed`;
          btn.style.marginTop = '10px';
          btn.style.marginBottom = '10px';
          container.appendChild(btn);
          console.log(`[HeadingImageSettings] ✅ 버튼 삽입 완료 (observed): ${selector}`);
          observer.disconnect();
          return;
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // 30초 후 자동 해제 (메모리 누수 방지)
    setTimeout(() => observer.disconnect(), 30000);
  }

  console.log(`[HeadingImageSettings] 버튼 삽입 완료: ${buttonsInserted}개`);
}

/**
 * 현재 headingImageMode 표시 텍스트 반환
 */
export function getHeadingImageModeDisplayText(): string {
  const mode = getHeadingImageMode();
  const modeNames: Record<HeadingImageMode, string> = {
    'all': '모두',
    'thumbnail-only': '썸네일만',
    'odd-only': '홀수만',
    'even-only': '짝수만',
    'none': '없음'
  };
  return modeNames[mode] || '모두';
}

// 전역에 노출 (renderer.ts에서 접근 가능하도록)
(window as any).openHeadingImageModal = openHeadingImageModal;
(window as any).closeHeadingImageModal = closeHeadingImageModal;
(window as any).getHeadingImageMode = getHeadingImageMode;
(window as any).setHeadingImageMode = setHeadingImageMode;
(window as any).shouldGenerateImageForHeading = shouldGenerateImageForHeading;
(window as any).createHeadingImageSettingButton = createHeadingImageSettingButton;
(window as any).initHeadingImageSettingButtons = initHeadingImageSettingButtons;
(window as any).getHeadingImageModeDisplayText = getHeadingImageModeDisplayText;

// ✅ [2026-01-24] window.api.generateImages를 프록시하여 headingImageMode 자동 주입
(function wrapGenerateImagesApi() {
  // DOM 로드 후 실행
  const wrapApi = () => {
    if (!(window as any).api?.generateImages) {
      console.log('[HeadingImageSettings] api.generateImages 아직 없음, 1초 후 재시도');
      setTimeout(wrapApi, 1000);
      return;
    }

    const originalGenerateImages = (window as any).api.generateImages;

    // 프록시 함수로 래핑
    (window as any).api.generateImages = async (options: any) => {
      // headingImageMode가 없으면 자동으로 추가
      if (!options.headingImageMode) {
        options.headingImageMode = getHeadingImageMode();
        console.log(`[HeadingImageSettings] 🖼️ API 호출에 headingImageMode 자동 주입: "${options.headingImageMode}"`);
      }
      return originalGenerateImages(options);
    };

    console.log('[HeadingImageSettings] ✅ api.generateImages 프록시 래핑 완료');
  };

  // 즉시 시도
  setTimeout(wrapApi, 500);
})();


