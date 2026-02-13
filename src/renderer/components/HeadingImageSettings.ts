/**
 * ✅ [2026-01-25 모듈화] 완전자동 이미지 설정 모달
 * - renderer.ts에서 분리됨
 * ✅ [2026-01-29 개선] 코드 품질 100점 달성
 * - 상수 통합, 에러 핸들링 강화, 메모리 관리 개선
 */

export type HeadingImageMode = 'all' | 'thumbnail-only' | 'odd-only' | 'even-only' | 'none';
// ✅ [2026-02-08 FIX] 이미지 관리 탭 드롭다운 value와 완전 통일
export type GlobalImageSource = 'nano-banana-pro' | 'falai' | 'prodia' | 'stability' | 'pollinations' | 'deepinfra';

// ✅ [2026-02-08] 이미지 스타일 타입 (11개, 3카테고리)
export type ImageStyleType =
  // 📷 실사 (Photo)
  | 'realistic'      // 실사 (한국인)
  | 'bokeh'          // 보케 (아웃포커스)
  // 🖌️ 아트 (Art)
  | 'vintage'        // 빈티지 일러스트
  | 'minimalist'     // 미니멀리스트
  | '3d-render'      // 3D 렌더
  | 'korean-folk'    // 한국 민화
  // ✨ 이색 (Exotic)
  | 'stickman'       // 졸라맨 (막대인간)
  | 'claymation'     // 클레이모션 (점토 인형)
  | 'neon-glow'      // 네온 글로우
  | 'papercut'       // 페이퍼컷 (종이공예)
  | 'isometric';     // 이소메트릭 (아이소)

// ✅ [2026-01-26] 이미지 비율 타입
export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

// ✅ [2026-01-29] 통합 상수 정의 (중복 제거)
export const MODE_NAMES: Record<HeadingImageMode, string> = {
  'all': '모두 생성',
  'thumbnail-only': '썸네일만',
  'odd-only': '홀수만',
  'even-only': '짝수만',
  'none': '이미지 없음'
};

export const SOURCE_NAMES: Record<GlobalImageSource, string> = {
  'nano-banana-pro': '나노 바나나 프로',
  'falai': 'Fal.ai',
  'prodia': 'Prodia',
  'stability': 'Stability AI',
  'pollinations': 'Pollinations',
  'deepinfra': 'FLUX-2 (DeepInfra)'
};

export const STYLE_NAMES: Record<ImageStyleType, string> = {
  // 📷 실사
  'realistic': '📷 실사',
  'bokeh': '📸 보케',
  // 🖌️ 아트
  'vintage': '📜 빈티지',
  'minimalist': '◻️ 미니멀',
  '3d-render': '🧊 3D렌더',
  'korean-folk': '🎑 한국민화',
  // ✨ 이색
  'stickman': '🤸 졸라맨',
  'claymation': '🧸 클레이',
  'neon-glow': '💡 네온글로우',
  'papercut': '📐 페이퍼컷',
  'isometric': '🔷 이소메트릭'
};

// ✅ [2026-02-08] 카테고리 그룹핑 (UI용)
export const STYLE_CATEGORIES: { label: string; styles: ImageStyleType[] }[] = [
  { label: '📷 실사', styles: ['realistic', 'bokeh'] },
  { label: '🖌️ 아트', styles: ['vintage', 'minimalist', '3d-render', 'korean-folk'] },
  { label: '✨ 이색', styles: ['stickman', 'claymation', 'neon-glow', 'papercut', 'isometric'] },
];

// ✅ [2026-01-29] 이벤트 리스너 정리용 (메모리 누수 방지)
const eventListenerCleanup: Array<() => void> = [];

function addManagedEventListener(
  element: Element | null,
  event: string,
  handler: EventListener
): void {
  if (!element) return;
  element.addEventListener(event, handler);
  eventListenerCleanup.push(() => element.removeEventListener(event, handler));
}

function cleanupAllEventListeners(): void {
  eventListenerCleanup.forEach(cleanup => cleanup());
  eventListenerCleanup.length = 0;
  console.log('[HeadingImageSettings] 🧹 이벤트 리스너 정리 완료');
}

// ✅ [2026-02-04 FIX] 풀오토 세팅 모달 복원 함수
// ✅ [2026-02-07 FIX] 모든 숨겨진 모달 복원 (continuous-settings-modal 포함)
// 이미지 설정 모달에서 돌아올 때 숨겨진 모달들을 다시 보이게 함
function restoreFullAutoSettingModal(): void {
  const modalsToRestore = ['ma-fullauto-setting-modal', 'continuous-settings-modal', 'continuous-mode-modal', 'ma-publish-modal', 'multi-account-modal'];
  modalsToRestore.forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal && modal.getAttribute('data-was-visible') === 'true') {
      modal.style.visibility = 'visible';
      modal.removeAttribute('data-was-visible');
      console.log(`[HeadingImageSettings] ✅ ${modalId} 복원됨`);
    }
  });
}

// ✅ [2026-01-29] 안전한 IPC 호출 (에러 핸들링 강화)
async function safeIpcInvoke<T>(channel: string, ...args: any[]): Promise<T | null> {
  try {
    if ((window as any).electron?.ipcRenderer) {
      return await (window as any).electron.ipcRenderer.invoke(channel, ...args);
    }
    console.warn(`[HeadingImageSettings] IPC not available: ${channel}`);
    return null;
  } catch (error) {
    console.error(`[HeadingImageSettings] IPC 호출 실패 (${channel}):`, error);
    if ((window as any).toastManager) {
      (window as any).toastManager.error(`설정 저장 실패: ${channel}`);
    }
    return null;
  }
}

// ✅ [2026-01-29] 안전한 localStorage 접근
function safeLocalStorageGet(key: string, defaultValue: string = ''): string {
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch (error) {
    console.error(`[HeadingImageSettings] localStorage 읽기 실패 (${key}):`, error);
    return defaultValue;
  }
}

function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`[HeadingImageSettings] localStorage 저장 실패 (${key}):`, error);
    return false;
  }
}

// ✅ [2026-01-29] 비율 분리 함수 - 썸네일/소제목 별도 관리
export function getThumbnailRatio(): ImageAspectRatio {
  const saved = safeLocalStorageGet('thumbnailImageRatio', '1:1') as ImageAspectRatio;
  return saved || '1:1';
}

export function getSubheadingRatio(): ImageAspectRatio {
  const saved = safeLocalStorageGet('subheadingImageRatio') || safeLocalStorageGet('imageRatio', '1:1');
  return (saved as ImageAspectRatio) || '1:1';
}

export function setThumbnailRatio(ratio: ImageAspectRatio): void {
  safeLocalStorageSet('thumbnailImageRatio', ratio);
  console.log(`[HeadingImageSettings] 썸네일 비율 설정: ${ratio}`);
}

export function setSubheadingRatio(ratio: ImageAspectRatio): void {
  safeLocalStorageSet('subheadingImageRatio', ratio);
  safeLocalStorageSet('imageRatio', ratio); // 기본 비율도 동기화
  console.log(`[HeadingImageSettings] 소제목 비율 설정: ${ratio}`);
}

// ✅ [2026-01-29] 소제목 인덱스가 현재 모드에서 이미지를 생성해야 하는지 확인
export function shouldGenerateImageForHeading(headingIndex: number, isThumbnail: boolean = false): boolean {
  const mode = safeLocalStorageGet('headingImageMode', 'all') as HeadingImageMode;

  switch (mode) {
    case 'all':
      return true;
    case 'thumbnail-only':
      return isThumbnail;
    case 'odd-only':
      return isThumbnail || (headingIndex + 1) % 2 === 1;
    case 'even-only':
      return isThumbnail || (headingIndex + 1) % 2 === 0;
    case 'none':
      return false;
    default:
      return true;
  }
}

// ✅ [2026-01-29] 현재 headingImageMode 표시 텍스트 반환
export function getHeadingImageModeDisplayText(): string {
  const mode = safeLocalStorageGet('headingImageMode', 'all') as HeadingImageMode;
  return MODE_NAMES[mode] || '모두';
}

let currentHeadingImageMode: HeadingImageMode = 'all';
let currentGlobalImageSource: GlobalImageSource = 'nano-banana-pro';
let currentImageStyle: ImageStyleType = 'realistic'; // ✅ 기본값: 실사
let currentImageRatio: ImageAspectRatio = '1:1'; // ✅ 기본값: 정사각형

// ✅ [2026-01-29] 안전한 localStorage 사용으로 에러 핸들링 강화
export function getHeadingImageMode(): HeadingImageMode {
  const saved = safeLocalStorageGet('headingImageMode') as HeadingImageMode;
  return saved || currentHeadingImageMode;
}

export function setHeadingImageMode(mode: HeadingImageMode): void {
  currentHeadingImageMode = mode;
  safeLocalStorageSet('headingImageMode', mode);
  console.log(`[HeadingImageSettings] 이미지 모드 설정: ${mode}`);
}

// ✅ 글로벌 이미지 소스 설정
export function getGlobalImageSource(): GlobalImageSource {
  const saved = safeLocalStorageGet('globalImageSource') as GlobalImageSource;
  return saved || currentGlobalImageSource;
}

export function setGlobalImageSource(source: GlobalImageSource): void {
  currentGlobalImageSource = source;
  safeLocalStorageSet('globalImageSource', source);
  console.log(`[HeadingImageSettings] 글로벌 이미지 소스 설정: ${source}`);
}

// ✅ [2026-02-02] 풀오토 전용 이미지 소스 설정 (이미지 관리 탭과 완전히 분리)
export function getFullAutoImageSource(): GlobalImageSource {
  // ✅ [2026-02-13 FIX] 유효한 AI 엔진 목록 (이것 외의 값은 모두 무효)
  const VALID_SOURCES: GlobalImageSource[] = ['nano-banana-pro', 'falai', 'prodia', 'stability', 'pollinations', 'deepinfra'];

  // 우선순위: fullAutoImageSource → globalImageSource → 'nano-banana-pro'
  const fullAutoSaved = safeLocalStorageGet('fullAutoImageSource');
  if (fullAutoSaved) {
    if (VALID_SOURCES.includes(fullAutoSaved as GlobalImageSource)) {
      return fullAutoSaved as GlobalImageSource;
    }
    // ⚠️ 오염된 값 발견 → 정리 (예: 'saved'가 저장되어 있던 경우)
    console.warn(`[HeadingImageSettings] ⚠️ fullAutoImageSource에 유효하지 않은 값 "${fullAutoSaved}" → 제거`);
    try { localStorage.removeItem('fullAutoImageSource'); } catch (_) { /* ignore */ }
  }
  const globalSaved = safeLocalStorageGet('globalImageSource');
  if (globalSaved) {
    if (VALID_SOURCES.includes(globalSaved as GlobalImageSource)) {
      console.log(`[HeadingImageSettings] ℹ️ fullAutoImageSource 미설정 → globalImageSource 사용: "${globalSaved}"`);
      return globalSaved as GlobalImageSource;
    }
    // ⚠️ 오염된 값 발견 → 정리
    console.warn(`[HeadingImageSettings] ⚠️ globalImageSource에 유효하지 않은 값 "${globalSaved}" → 제거`);
    try { localStorage.removeItem('globalImageSource'); } catch (_) { /* ignore */ }
  }
  return 'nano-banana-pro';
}

export function setFullAutoImageSource(source: GlobalImageSource): void {
  safeLocalStorageSet('fullAutoImageSource', source);
  console.log(`[HeadingImageSettings] 풀오토 전용 이미지 소스 설정: ${source}`);
}

// ✅ [2026-01-26] 이미지 스타일 설정 (확장)
export function getImageStyle(): ImageStyleType {
  const saved = safeLocalStorageGet('imageStyle') as ImageStyleType;
  return saved || currentImageStyle;
}

export function setImageStyle(style: ImageStyleType): void {
  currentImageStyle = style;
  safeLocalStorageSet('imageStyle', style);
  console.log(`[HeadingImageSettings] 이미지 스타일 설정: ${style}`);

  // ✅ [2026-02-03 FIX] config.json에도 동기화 (main 프로세스에서 읽을 수 있도록)
  syncImageStyleToConfig(style);
}

// ✅ [2026-02-03] config.json에 이미지 스타일 동기화 (비동기)
async function syncImageStyleToConfig(style: ImageStyleType): Promise<void> {
  try {
    const config = await safeIpcInvoke<any>('config:get');
    if (config) {
      config.imageStyle = style;
      await safeIpcInvoke('config:set', config);
      console.log(`[HeadingImageSettings] ✅ config.json에 이미지 스타일 저장: ${style}`);
    }
  } catch (err) {
    console.warn('[HeadingImageSettings] config.json 스타일 동기화 실패:', err);
  }
}

// ✅ [2026-01-26] 이미지 비율 설정
export function getImageRatio(): ImageAspectRatio {
  const saved = safeLocalStorageGet('imageRatio') as ImageAspectRatio;
  return saved || currentImageRatio;
}

export function setImageRatio(ratio: ImageAspectRatio): void {
  currentImageRatio = ratio;
  safeLocalStorageSet('imageRatio', ratio);
  console.log(`[HeadingImageSettings] 이미지 비율 설정: ${ratio}`);

  // ✅ [2026-02-03 FIX] config.json에도 동기화 (main 프로세스에서 읽을 수 있도록)
  syncImageRatioToConfig(ratio);
}

// ✅ [2026-02-03] config.json에 이미지 비율 동기화 (비동기)
async function syncImageRatioToConfig(ratio: ImageAspectRatio): Promise<void> {
  try {
    const config = await safeIpcInvoke<any>('config:get');
    if (config) {
      config.imageRatio = ratio;
      await safeIpcInvoke('config:set', config);
      console.log(`[HeadingImageSettings] ✅ config.json에 이미지 비율 저장: ${ratio}`);
    }
  } catch (err) {
    console.warn('[HeadingImageSettings] config.json 비율 동기화 실패:', err);
  }
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
      background: linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(20,20,20,0.95) 100%);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      z-index: 10020;
      justify-content: center;
      align-items: center;
    ">
      <div style="
        max-width: 420px;
        width: 92%;
        max-height: 90vh;
        padding: 0;
        border-radius: 24px;
        background: linear-gradient(165deg, #1a1a1a 0%, #0d0d0d 100%);
        box-shadow: 
          0 0 60px rgba(212,175,55,0.4),
          0 0 30px rgba(212,175,55,0.3),
          0 32px 64px -16px rgba(0,0,0,0.8),
          inset 0 1px 0 rgba(212,175,55,0.3);
        animation: modalSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
        border: 2px solid #D4AF37;
        display: flex;
        flex-direction: column;
      ">

        <style>
          @keyframes modalSlideIn {
            from { opacity: 0; transform: translateY(-24px) scale(0.92); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes goldShimmer {
            0% { background-position: -200% center; }
            100% { background-position: 200% center; }
          }
          .premium-setting-btn {
            width: 100%;
            padding: 16px 20px;
            margin-bottom: 12px;
            border-radius: 14px;
            border: 1px solid rgba(212,175,55,0.15);
            background: linear-gradient(135deg, #1e1e1e 0%, #2a2a2a 100%);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
          }
          .premium-setting-btn:hover {
            background: linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%);
            border-color: rgba(212,175,55,0.4);
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(212,175,55,0.15), 0 0 20px rgba(212,175,55,0.1);
          }
          .premium-setting-btn .btn-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            background: linear-gradient(135deg, #D4AF37 0%, #B8860B 50%, #D4AF37 100%);
            background-size: 200% auto;
            box-shadow: 0 4px 12px rgba(212,175,55,0.4);

          }
          .premium-setting-btn .btn-text { font-size: 15px; font-weight: 600; color: #f0e6d2; text-align: left; }
          .premium-setting-btn .btn-value { font-size: 13px; color: #D4AF37; font-weight: 500; margin-top: 2px; }
          .premium-setting-btn .arrow { color: #D4AF37; font-size: 1.3rem; font-weight: 300; }
          .premium-checkbox {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px 16px;
            margin-bottom: 10px;
            border-radius: 12px;
            background: linear-gradient(135deg, #1e1e1e 0%, #2a2a2a 100%);
            cursor: pointer;
            transition: all 0.2s ease;
            border: 1px solid rgba(212,175,55,0.15);
          }
          .premium-checkbox:hover {
            background: linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%);
            border-color: rgba(212,175,55,0.3);
          }
          .premium-checkbox input[type="checkbox"] {
            width: 20px;
            height: 20px;
            accent-color: #D4AF37;
            cursor: pointer;
            border-radius: 6px;
          }
          .premium-checkbox .checkbox-label {
            font-size: 14px;
            color: #f0e6d2;
            font-weight: 500;
            flex: 1;
          }
          .premium-checkbox .checkbox-desc {
            font-size: 11px;
            color: #a0a0a0;
            margin-top: 2px;
          }
          .shopping-connect-section {
            display: none;
            padding: 14px 16px;
            margin-bottom: 10px;
            border-radius: 12px;
            background: linear-gradient(135deg, #2a2a1a 0%, #3a3a2a 100%);
            border: 1px solid rgba(212,175,55,0.3);
          }
        </style>

        
        <!-- ✅ 헤더 (골드+블랙 프리미엄) -->
        <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); padding: 24px 24px 20px; position: relative; border-bottom: 2px solid #D4AF37;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #D4AF37; display: flex; align-items: center; gap: 10px; text-shadow: 0 2px 8px rgba(212,175,55,0.3);">
                <span style="font-size: 28px;">⚡</span>
                메인 풀오토 이미지 설정
              </h3>

              <p style="margin: 6px 0 0 0; font-size: 13px; color: rgba(240,230,210,0.7);">전역 설정 - 모든 발행에 자동 적용</p>
            </div>
            <button id="heading-image-close-btn" style="
              background: rgba(212,175,55,0.15);
              border: 1px solid rgba(212,175,55,0.3);
              width: 36px;
              height: 36px;
              border-radius: 10px;
              font-size: 20px;
              cursor: pointer;
              color: #D4AF37;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s;
              backdrop-filter: blur(8px);
            " onmouseover="this.style.background='rgba(212,175,55,0.3)';this.style.color='#FFD700';" onmouseout="this.style.background='rgba(212,175,55,0.15)';this.style.color='#D4AF37';">×</button>
          </div>
        </div>
        
        <!-- ✅ 본문 (스크롤 가능) -->
        <div style="padding: 20px 24px 24px; overflow-y: auto; flex: 1;">

          
          <!-- ✅ 버튼식 설정 -->
          <div style="margin-bottom: 16px;">
            <button type="button" class="premium-setting-btn" id="open-image-mode-btn">
              <div style="display: flex; align-items: center; gap: 14px;">
                <div class="btn-icon">🖼️</div>
                <div>
                  <div class="btn-text">소제목 이미지 선택</div>
                  <div class="btn-value" id="current-image-mode-display">모두 생성</div>
                </div>
              </div>
              <span class="arrow">›</span>
            </button>
            
            <button type="button" class="premium-setting-btn" id="open-image-source-btn">
              <div style="display: flex; align-items: center; gap: 14px;">
                <div class="btn-icon">🎨</div>
                <div>
                  <div class="btn-text">AI 이미지 생성 엔진</div>
                  <div class="btn-value" id="current-image-source-display">나노 바나나 프로</div>
                </div>
              </div>
              <span class="arrow">›</span>
            </button>
            
            <!-- ✅ [2026-01-26] 이미지 스타일 선택 버튼 (실사/애니메이션) -->
            <button type="button" class="premium-setting-btn" id="open-image-style-btn">
              <div style="display: flex; align-items: center; gap: 14px;">
                <div class="btn-icon" style="background: linear-gradient(135deg, #f472b6 0%, #ec4899 100%);">✨</div>
                <div>
                  <div class="btn-text">이미지 스타일</div>
                  <div class="btn-value" id="current-image-style-display">📷 실사 (Realistic)</div>
                </div>
              </div>
              <span class="arrow">›</span>
            </button>
            
            <!-- ✅ [2026-01-27] 이미지 생성 모델 상세 설정 버튼 -->
            <button type="button" class="premium-setting-btn" id="open-advanced-image-model-btn">
              <div style="display: flex; align-items: center; gap: 14px;">
                <div class="btn-icon" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">⚙️</div>
                <div>
                  <div class="btn-text">이미지 생성 모델 상세 설정</div>
                  <div class="btn-value" style="color: #10b981;">프리셋 & 세부 모델 선택 →</div>
                </div>
              </div>
              <span class="arrow">›</span>
            </button>
          </div>

          
          <!-- ✅ 체크박스 옵션 -->
          <div style="margin-bottom: 16px;">
            <div class="premium-checkbox">
              <input type="checkbox" id="thumbnail-text-include" />
              <div>
                <div class="checkbox-label">📝 1번 이미지에 제목 텍스트 포함</div>
                <div class="checkbox-desc">썸네일에 블로그 제목을 합성합니다</div>
              </div>
            </div>
            <div class="premium-checkbox">
              <input type="checkbox" id="text-only-publish" />
              <div>
                <div class="checkbox-label">📄 이미지 없이 글만 발행</div>
                <div class="checkbox-desc">이미지 비용을 절약합니다</div>
              </div>
            </div>
          </div>
          
          <!-- ✅ 쇼핑커넥트 전용 옵션 (기본 숨김) - [2026-01-28] 연속발행과 동일한 UI로 업데이트 -->
          <div id="shopping-connect-options" class="shopping-connect-section">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
              <span style="font-size: 1.3rem;">🛒</span>
              <span style="font-weight: 600; color: #92400e; font-size: 14px;">쇼핑커넥트 전용</span>
            </div>
            
            <!-- ✅ 소제목 이미지 소스 선택 (라디오 버튼) -->
            <div style="margin-bottom: 16px;">
              <div style="font-size: 13px; font-weight: 600; color: #4a4a4a; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                <span>🖼️</span> 소제목 이미지 소스
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <label style="display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: linear-gradient(135deg, rgba(139,92,246,0.1), rgba(139,92,246,0.05)); border: 2px solid #8b5cf6; border-radius: 10px; cursor: pointer; transition: all 0.2s;">
                  <input type="radio" name="sc-sub-image-source" value="ai" checked style="accent-color: #8b5cf6; width: 16px; height: 16px;">
                  <span style="font-size: 13px; font-weight: 600; color: #7c3aed;">✨ AI 이미지 활용하기</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: linear-gradient(135deg, rgba(75,85,99,0.1), rgba(75,85,99,0.05)); border: 2px solid #6b7280; border-radius: 10px; cursor: pointer; transition: all 0.2s;">
                  <input type="radio" name="sc-sub-image-source" value="collected" style="accent-color: #6b7280; width: 16px; height: 16px;">
                  <span style="font-size: 13px; font-weight: 600; color: #4b5563;">📦 수집 이미지 사용</span>
                </label>
              </div>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #666; line-height: 1.4;">
                ℹ️ AI 활용: 수집한 이미지 기반으로 AI가 새 이미지 생성 (나노바나나프로/딥인프라 등) | 수집 이미지: 크롤링한 원본 이미지 그대로 사용
              </p>
            </div>
            
            <!-- ✅ 자동 이미지 수집 및 썸네일 세팅 -->
            <div class="premium-checkbox" style="background: rgba(255,255,255,0.7); margin-bottom: 12px; border: 2px solid #10b981; padding: 14px;">
              <input type="checkbox" id="sc-auto-thumbnail-setting" />
              <div>
                <div class="checkbox-label" style="color: #059669; font-weight: 700;">🖼️ 자동 이미지 수집 및 썸네일 세팅</div>
              </div>
            </div>
          </div>
          
          <!-- ✅ 완료 버튼 (골드 테마) - 항상 표시 -->
          <button id="heading-image-done-btn" style="
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #D4AF37 0%, #B8860B 50%, #D4AF37 100%);
            background-size: 200% auto;
            color: #0d0d0d;
            border: none;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(212,175,55,0.4);
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            text-shadow: 0 1px 2px rgba(255,255,255,0.2);
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 32px rgba(212,175,55,0.5)'; this.style.backgroundPosition='right center';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 24px rgba(212,175,55,0.4)'; this.style.backgroundPosition='left center';">
            <span>✓</span> 설정 완료
          </button>

        </div>
      </div>
    </div>

    
    <!-- ✅ 소제목 이미지 모드 선택 서브 모달 -->
    <div id="image-mode-submodal" style="
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(8px);
      z-index: 10030;
      justify-content: center;
      align-items: center;
    ">
      <div style="max-width: 350px; width: 90%; padding: 20px; border-radius: 16px; background: white; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
        <h4 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #166534;">🖼️ 소제목 이미지 선택</h4>
        <div id="image-mode-options">
          <label style="display: flex; align-items: center; gap: 10px; padding: 10px; margin-bottom: 6px; border-radius: 8px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#dcfce7';" onmouseout="this.style.background='transparent';">
            <input type="radio" name="sub-image-mode" value="all" style="accent-color: #16a34a;">
            <span style="color: #166534; font-weight: 500;">✨ 모두 생성 (기본)</span>
          </label>
          <label style="display: flex; align-items: center; gap: 10px; padding: 10px; margin-bottom: 6px; border-radius: 8px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#dcfce7';" onmouseout="this.style.background='transparent';">
            <input type="radio" name="sub-image-mode" value="thumbnail-only" style="accent-color: #16a34a;">
            <span style="color: #166534; font-weight: 500;">🎯 썸네일만</span>
          </label>
          <label style="display: flex; align-items: center; gap: 10px; padding: 10px; margin-bottom: 6px; border-radius: 8px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#dcfce7';" onmouseout="this.style.background='transparent';">
            <input type="radio" name="sub-image-mode" value="odd-only" style="accent-color: #16a34a;">
            <span style="color: #166534; font-weight: 500;">🔢 홀수 소제목만</span>
          </label>
          <label style="display: flex; align-items: center; gap: 10px; padding: 10px; margin-bottom: 6px; border-radius: 8px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#dcfce7';" onmouseout="this.style.background='transparent';">
            <input type="radio" name="sub-image-mode" value="even-only" style="accent-color: #16a34a;">
            <span style="color: #166534; font-weight: 500;">🔢 짝수 소제목만</span>
          </label>
          <label style="display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 8px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#dcfce7';" onmouseout="this.style.background='transparent';">
            <input type="radio" name="sub-image-mode" value="none" style="accent-color: #16a34a;">
            <span style="color: #166534; font-weight: 500;">🚫 이미지 없음</span>
          </label>
        </div>
        <button id="image-mode-confirm" style="width: 100%; margin-top: 14px; padding: 12px; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3);">확인</button>
      </div>
    </div>

    
    <!-- ✅ AI 엔진 선택 서브 모달 -->
    <div id="image-source-submodal" style="
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(8px);
      z-index: 10030;
      justify-content: center;
      align-items: center;
    ">
      <div style="max-width: 360px; width: 90%; padding: 20px; border-radius: 16px; background: white; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
        <h4 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #1a1a2e;">🎨 AI 이미지 생성 엔진</h4>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
          <label class="source-option" data-value="nano-banana-pro" style="cursor: pointer; padding: 12px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #fef3c7, #fde68a); text-align: center; transition: all 0.2s;">
            <div style="font-size: 1.5rem;">🍌</div>
            <div style="font-size: 12px; font-weight: 600; color: #92400e;">나노 바나나 프로</div>
            <div style="font-size: 10px; color: #a16207;">Gemini | 추천</div>
          </label>
          <label class="source-option" data-value="falai" style="cursor: pointer; padding: 12px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #fce7f3, #f9a8d4); text-align: center; transition: all 0.2s;">
            <div style="font-size: 1.5rem;">🚀</div>
            <div style="font-size: 12px; font-weight: 600; color: #9d174d;">Fal.ai (FLUX)</div>
            <div style="font-size: 10px; color: #be185d;">고화질</div>
          </label>
          <label class="source-option" data-value="prodia" style="cursor: pointer; padding: 12px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #fce4ec, #f8bbd9); text-align: center; transition: all 0.2s;">
            <div style="font-size: 1.5rem;">⚡</div>
            <div style="font-size: 12px; font-weight: 600; color: #880e4f;">Prodia AI</div>
            <div style="font-size: 10px; color: #ad1457;">가성비 | 빠름</div>
          </label>
          <label class="source-option" data-value="stability" style="cursor: pointer; padding: 12px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #ede9fe, #ddd6fe); text-align: center; transition: all 0.2s;">
            <div style="font-size: 1.5rem;">✨</div>
            <div style="font-size: 12px; font-weight: 600; color: #5b21b6;">Stability AI</div>
            <div style="font-size: 10px; color: #7c3aed;">고품질</div>
          </label>
          <label class="source-option" data-value="pollinations" style="cursor: pointer; padding: 12px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #d1fae5, #a7f3d0); text-align: center; transition: all 0.2s;">
            <div style="font-size: 1.5rem;">🌸</div>
            <div style="font-size: 12px; font-weight: 600; color: #047857;">Pollinations</div>
            <div style="font-size: 10px; color: #059669;">무료 | 빠름</div>
          </label>
          <label class="source-option" data-value="deepinfra" style="cursor: pointer; padding: 12px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #d1fae5, #6ee7b7); text-align: center; transition: all 0.2s;">
            <div style="font-size: 1.5rem;">🚀</div>
            <div style="font-size: 12px; font-weight: 600; color: #047857;">FLUX-2</div>
            <div style="font-size: 10px; color: #059669;">DeepInfra</div>
          </label>
        </div>
        <button id="image-source-confirm" style="width: 100%; margin-top: 14px; padding: 12px; background: #667eea; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">확인</button>
      </div>
    </div>
    
    <!-- ✅ [2026-01-27] 이미지 스타일 선택 서브 모달 (넓은 레이아웃 + 우측 미리보기) -->
    <div id="image-style-submodal" style="
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(10px);
      z-index: 10030;
      justify-content: center;
      align-items: center;
      overflow-y: auto;
    ">
      <div style="max-width: 900px; width: 95%; max-height: 90vh; overflow-y: auto; padding: 28px; border-radius: 20px; background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); box-shadow: 0 25px 60px rgba(0,0,0,0.4); margin: 20px 0; position: relative; border: 2px solid #22c55e;">
        <button id="image-style-close" style="position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; border: none; background: #ef4444; border-radius: 50%; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; color: white; transition: all 0.2s; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);" onmouseover="this.style.background='#dc2626'; this.style.transform='scale(1.1)'" onmouseout="this.style.background='#ef4444'; this.style.transform='scale(1)'">✕</button>
        
        <h4 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #166534;">✨ 이미지 스타일 선택</h4>
        <p style="margin: 0 0 20px 0; font-size: 12px; color: #64748b;">FLUX-2, Fal.ai, 나노 바나나 프로 등 AI 엔진에 적용됩니다</p>
        
        <!-- 좌우 레이아웃 (미리보기 우측 크게) -->
        <div style="display: grid; grid-template-columns: 1fr 420px; gap: 28px;">
          
          <!-- 좌측: 스타일 선택 그리드 -->
          <div>
            <h5 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 600; color: #374151;">🎨 스타일 선택</h5>
            <div id="image-style-options" style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px;">
              <!-- 📷 실사 -->
              <div>
                <div style="font-size: 11px; font-weight: 700; color: #6b7280; margin-bottom: 6px; padding-left: 2px;">📷 실사</div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                  <label class="style-option" data-value="realistic" data-icon="📷" data-title="📷 실사 (Realistic)" data-desc="실제 사진처럼 보이는 고퀄리티 이미지입니다. 한국인 모델, 제품 사진, 음식 사진 등에 적합합니다. 8K 고해상도, DSLR 카메라 품질로 생성됩니다." data-keywords="RAW photo, hyperrealistic, Fujifilm XT3" style="cursor: pointer; padding: 10px 8px; border-radius: 10px; border: 2px solid #16a34a; background: linear-gradient(135deg, #f0fdf4, #dcfce7); display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; text-align: center; box-shadow: 0 2px 8px rgba(22, 163, 74, 0.15);">
                    <div style="font-size: 1.5rem;">📷</div>
                    <div style="font-size: 11px; font-weight: 600; color: #1e293b;">실사</div>
                    <input type="radio" name="sub-image-style" value="realistic" checked style="accent-color: #16a34a; margin-top: 2px;">
                  </label>
                  <label class="style-option" data-value="bokeh" data-icon="📸" data-title="📸 보케 (Bokeh)" data-desc="아웃포커스 보케 사진 스타일입니다. 배경이 몽환적으로 흐려지며 주제가 선명하게 부각됩니다. 감성적인 분위기, 제품 사진에 적합합니다." data-keywords="beautiful bokeh, shallow depth of field, dreamy lights, f/1.4" style="cursor: pointer; padding: 10px 8px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #fdf4ff, #f5d0fe); display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; text-align: center;">
                    <div style="font-size: 1.5rem;">📸</div>
                    <div style="font-size: 11px; font-weight: 600; color: #1e293b;">보케</div>
                    <input type="radio" name="sub-image-style" value="bokeh" style="accent-color: #16a34a; margin-top: 2px;">
                  </label>
                </div>
              </div>
              <!-- 🖌️ 아트 -->
              <div>
                <div style="font-size: 11px; font-weight: 700; color: #6b7280; margin-bottom: 6px; padding-left: 2px;">🖌️ 아트</div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                  <label class="style-option" data-value="vintage" data-icon="📜" data-title="📜 빈티지 (Vintage)" data-desc="1950년대 레트로 포스터 스타일입니다. 바랜 색감, 클래식한 디자인이 특징입니다. 복고풍, 향수 어린 분위기에 적합합니다." data-keywords="vintage retro, 1950s poster art, muted colors" style="cursor: pointer; padding: 10px 8px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #fef7ee, #fed7aa); display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; text-align: center;">
                    <div style="font-size: 1.5rem;">📜</div>
                    <div style="font-size: 11px; font-weight: 600; color: #1e293b;">빈티지</div>
                    <input type="radio" name="sub-image-style" value="vintage" style="accent-color: #16a34a; margin-top: 2px;">
                  </label>
                  <label class="style-option" data-value="minimalist" data-icon="◻️" data-title="◻️ 미니멀 (Minimalist)" data-desc="심플하고 깔끔한 플랫 디자인 스타일입니다. 단순한 선, 솔리드 컬러가 특징입니다. 비즈니스, 인포그래픽에 적합합니다." data-keywords="minimalist flat design, simple clean lines, solid colors" style="cursor: pointer; padding: 10px 8px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #f8fafc, #f1f5f9); display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; text-align: center;">
                    <div style="font-size: 1.5rem;">◻️</div>
                    <div style="font-size: 11px; font-weight: 600; color: #1e293b;">미니멀</div>
                    <input type="radio" name="sub-image-style" value="minimalist" style="accent-color: #16a34a; margin-top: 2px;">
                  </label>
                  <label class="style-option" data-value="3d-render" data-icon="🧊" data-title="🧊 3D렌더 (3D Render)" data-desc="Blender, Cinema 4D 스타일의 3D 렌더링입니다. 입체적인 그래픽, 스튜디오 조명이 특징입니다. 제품 소개, 테크 주제에 적합합니다." data-keywords="3D render, octane render, cinema 4d, blender 3d" style="cursor: pointer; padding: 10px 8px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #ede9fe, #ddd6fe); display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; text-align: center;">
                    <div style="font-size: 1.5rem;">🧊</div>
                    <div style="font-size: 11px; font-weight: 600; color: #1e293b;">3D렌더</div>
                    <input type="radio" name="sub-image-style" value="3d-render" style="accent-color: #16a34a; margin-top: 2px;">
                  </label>
                  <label class="style-option" data-value="korean-folk" data-icon="🎑" data-title="🎑 한국 민화" data-desc="한국 전통 민화 스타일입니다. 호랑이와 까치, 꽃과 나비 같은 전통 모티프와 선명한 색감이 특징입니다. 한국적 감성과 따뜻한 정서를 전달합니다. 🇰🇷 우리만의 독보적인 스타일!" data-keywords="Korean folk painting, Minhwa, tiger and magpie, vibrant traditional colors" style="cursor: pointer; padding: 10px 8px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #fef7ee, #fed7aa); display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; text-align: center;">
                    <div style="font-size: 1.5rem;">🎑</div>
                    <div style="font-size: 11px; font-weight: 600; color: #1e293b;">한국민화</div>
                    <input type="radio" name="sub-image-style" value="korean-folk" style="accent-color: #16a34a; margin-top: 2px;">
                  </label>
                </div>
              </div>
              <!-- ✨ 이색 -->
              <div>
                <div style="font-size: 11px; font-weight: 700; color: #6b7280; margin-bottom: 6px; padding-left: 2px;">✨ 이색</div>
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;">
                  <label class="style-option" data-value="stickman" data-icon="🤸" data-title="🤸 졸라맨 (Stickman)" data-desc="심플한 막대 인간 드로잉 스타일입니다. 흰 배경에 검은 선으로 그린 귀여운 졸라맨이 상황을 표현합니다. 유머러스한 블로그에 적합합니다." data-keywords="stick figure, black line art, white background, humorous doodle" style="cursor: pointer; padding: 10px 6px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #f8fafc, #e2e8f0); display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; text-align: center;">
                    <div style="font-size: 1.5rem;">🤸</div>
                    <div style="font-size: 10px; font-weight: 600; color: #1e293b;">졸라맨</div>
                    <input type="radio" name="sub-image-style" value="stickman" style="accent-color: #16a34a; margin-top: 2px;">
                  </label>
                  <label class="style-option" data-value="claymation" data-icon="🧸" data-title="🧸 클레이 (Claymation)" data-desc="점토 인형 스톱모션 스타일입니다. 둥글둥글한 질감, 미니어처 세트, 따뜻한 조명이 특징입니다. 귀엽고 독특한 분위기에 적합합니다." data-keywords="claymation, clay figurines, plasticine, stop-motion, miniature" style="cursor: pointer; padding: 10px 6px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #fef7ee, #fde68a40); display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; text-align: center;">
                    <div style="font-size: 1.5rem;">🧸</div>
                    <div style="font-size: 10px; font-weight: 600; color: #1e293b;">클레이</div>
                    <input type="radio" name="sub-image-style" value="claymation" style="accent-color: #16a34a; margin-top: 2px;">
                  </label>
                  <label class="style-option" data-value="neon-glow" data-icon="💡" data-title="💡 네온글로우 (Neon Glow)" data-desc="어두운 배경에 빛나는 네온 라인 스타일입니다. 신스웨이브, 레트로 감성의 빛 효과가 인상적입니다. 야경, 테크, 트렌디한 분위기에 적합합니다." data-keywords="neon glow, dark background, synthwave, luminous trails, LED sign" style="cursor: pointer; padding: 10px 6px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #1e1b4b20, #4c1d9520); display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; text-align: center;">
                    <div style="font-size: 1.5rem;">💡</div>
                    <div style="font-size: 10px; font-weight: 600; color: #1e293b;">네온</div>
                    <input type="radio" name="sub-image-style" value="neon-glow" style="accent-color: #16a34a; margin-top: 2px;">
                  </label>
                  <label class="style-option" data-value="papercut" data-icon="📐" data-title="📐 페이퍼컷 (Papercut)" data-desc="레이어드 종이 공예 스타일입니다. 겹겹이 쌓인 색종이가 만드는 입체적 그림자와 질감이 특징입니다. 독특하고 따뜻한 느낌에 적합합니다." data-keywords="paper cut art, layered paper, kirigami, shadow, handmade texture" style="cursor: pointer; padding: 10px 6px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #fef7ee, #fed7aa40); display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; text-align: center;">
                    <div style="font-size: 1.5rem;">📐</div>
                    <div style="font-size: 10px; font-weight: 600; color: #1e293b;">페이퍼컷</div>
                    <input type="radio" name="sub-image-style" value="papercut" style="accent-color: #16a34a; margin-top: 2px;">
                  </label>
                  <label class="style-option" data-value="isometric" data-icon="🔷" data-title="🔷 이소메트릭 (Isometric)" data-desc="30도 각도의 이소메트릭 미니어처 월드 스타일입니다. 귀여운 하이퍼 디테일 3D 세계를 내려다보는 구도입니다. IT, 비즈니스, 가이드에 적합합니다." data-keywords="isometric 3d, miniature world, 30 degree angle, pastel, game perspective" style="cursor: pointer; padding: 10px 6px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #eff6ff, #bfdbfe40); display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; text-align: center;">
                    <div style="font-size: 1.5rem;">🔷</div>
                    <div style="font-size: 10px; font-weight: 600; color: #1e293b;">이소메트릭</div>
                    <input type="radio" name="sub-image-style" value="isometric" style="accent-color: #16a34a; margin-top: 2px;">
                  </label>
                </div>
              </div>
            </div>
            
            <!-- 이미지 비율 선택 -->
            <h5 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600; color: #374151; border-top: 1px solid #e5e7eb; padding-top: 16px;">📐 이미지 비율</h5>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              <div>
                <label style="display: block; font-size: 11px; color: #6b7280; margin-bottom: 4px;">🖼️ 썸네일:</label>
                <select id="thumbnail-ratio-select" style="width: 100%; padding: 10px; border-radius: 8px; border: 2px solid #16a34a; background: #dcfce7; font-size: 12px; color: #374151; cursor: pointer;">
                  <option value="1:1">⬛ 1:1 (1024×1024)</option>
                  <option value="16:9">▬ 16:9 (1344×768)</option>
                  <option value="9:16">▮ 9:16 (768×1344)</option>
                  <option value="4:3">📺 4:3 (1152×896)</option>
                  <option value="3:4">📱 3:4 (896×1152)</option>
                </select>
              </div>
              <div>
                <label style="display: block; font-size: 11px; color: #6b7280; margin-bottom: 4px;">📝 소제목:</label>
                <select id="subheading-ratio-select" style="width: 100%; padding: 10px; border-radius: 8px; border: 2px solid #6366f1; background: #eef2ff; font-size: 12px; color: #374151; cursor: pointer;">
                  <option value="1:1">⬛ 1:1 (1024×1024)</option>
                  <option value="16:9">▬ 16:9 (1344×768)</option>
                  <option value="9:16">▮ 9:16 (768×1344)</option>
                  <option value="4:3">📺 4:3 (1152×896)</option>
                  <option value="3:4">📱 3:4 (896×1152)</option>
                </select>
              </div>
            </div>
            
            <!-- 기존 라디오 버튼 숨김 -->
            <div id="image-ratio-options" style="display: none;">
              <input type="radio" name="sub-image-ratio" value="1:1" checked>
            </div>
            
            <!-- 테스트 키워드 입력 -->
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px;">🔍 테스트 키워드 (선택)</label>
              <input id="test-keyword-input" type="text" placeholder="예: 겨울철 다이어트 식단, 한우 선물세트 추천..." style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 13px; box-sizing: border-box; transition: border-color 0.2s;" onfocus="this.style.borderColor='#16a34a'" onblur="this.style.borderColor='#e5e7eb'">
            </div>
            
            <!-- ✅ [2026-02-08] 텍스트 오버레이 미리보기 -->
            <div style="margin-bottom: 12px; padding: 10px 14px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0;">
              <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                <input type="checkbox" id="test-text-overlay-check" style="width: 18px; height: 18px; accent-color: #6366f1; cursor: pointer;" />
                <div>
                  <div style="font-size: 13px; font-weight: 600; color: #374151;">📝 텍스트 오버레이 미리보기</div>
                  <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">생성된 이미지에 키워드 텍스트를 합성합니다</div>
                </div>
              </label>
            </div>
            
            <!-- ✅ [2026-02-08] AI 엔진 임시 선택 (테스트 전용) -->
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px;">🔧 테스트용 AI 엔진 (저장 안 됨)</label>
              <select id="test-engine-select" style="width: 100%; padding: 10px 12px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 13px; color: #374151; background: white; cursor: pointer; transition: border-color 0.2s;" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e5e7eb'">
                <option value="">📌 현재 저장된 엔진 사용</option>
                <option value="nano-banana-pro">🍌 나노 바나나 프로 (Gemini)</option>
                <option value="deepinfra">⚡ FLUX-2 (DeepInfra)</option>
                <option value="falai">🎨 Fal.ai</option>
                <option value="prodia">🔮 Prodia</option>
                <option value="stability">🏔️ Stability AI</option>
                <option value="pollinations">🌸 Pollinations</option>
              </select>
            </div>
            
            <!-- 버튼 영역 (세로 배치) -->
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <button id="image-style-test" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 13px; cursor: pointer; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);">🎨 테스트 생성</button>
              <button id="image-style-confirm" style="width: 100%; padding: 16px; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3);">✅ 확인</button>
            </div>
          </div>
          
          <!-- 우측: 큰 미리보기 -->
          <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-radius: 16px; border: 2px solid #86efac; padding: 20px; display: flex; flex-direction: column;">
            <h5 style="margin: 0 0 16px 0; font-size: 13px; font-weight: 600; color: #166534;">👁️ 미리보기</h5>
            
            <!-- 아이콘 & 타이틀 -->
            <div style="text-align: center; margin-bottom: 16px;">
              <div id="style-preview-icon" style="font-size: 4rem; line-height: 1; margin-bottom: 10px;">📷</div>
              <div id="style-preview-title" style="font-weight: 700; font-size: 18px; color: #166534;">📷 실사 (Realistic)</div>
            </div>
            
            <!-- 설명 -->
            <div style="flex: 1; background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
              <div id="style-preview-desc" style="font-size: 13px; color: #4b5563; line-height: 1.7; margin-bottom: 12px;">실제 사진처럼 보이는 고퀄리티 이미지입니다. 한국인 모델, 제품 사진, 음식 사진 등에 적합합니다. 8K 고해상도, DSLR 카메라 품질로 생성됩니다.</div>
              <div style="border-top: 1px dashed #e5e7eb; padding-top: 12px;">
                <div style="font-size: 11px; font-weight: 600; color: #9ca3af; margin-bottom: 4px;">🔑 프롬프트 키워드</div>
                <div id="style-preview-keywords" style="font-size: 12px; color: #6366f1; font-style: italic; line-height: 1.5;">RAW photo, hyperrealistic, Fujifilm XT3</div>
              </div>
            </div>
            
            <!-- 추천 용도 -->
            <div style="margin-top: 16px; padding: 12px; background: rgba(99, 102, 241, 0.1); border-radius: 10px; border: 1px solid rgba(99, 102, 241, 0.2);">
              <div style="font-size: 11px; font-weight: 600; color: #6366f1; margin-bottom: 4px;">💡 추천 용도</div>
              <div id="style-preview-usage" style="font-size: 11px; color: #4b5563;">제품 리뷰, 음식 블로그, 인물 사진, 일상 기록</div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  `;




  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // ✅ [2026-01-27] 드롭다운 초기값 복원
  const savedThumbnailRatio = localStorage.getItem('thumbnailImageRatio') || '1:1';
  const savedSubheadingRatio = localStorage.getItem('subheadingImageRatio') || localStorage.getItem('imageRatio') || '1:1';

  const thumbnailRatioSelect = document.getElementById('thumbnail-ratio-select') as HTMLSelectElement;
  const subheadingRatioSelect = document.getElementById('subheading-ratio-select') as HTMLSelectElement;

  if (thumbnailRatioSelect) thumbnailRatioSelect.value = savedThumbnailRatio;
  if (subheadingRatioSelect) subheadingRatioSelect.value = savedSubheadingRatio;


  // ✅ 닫기 버튼 (리스너 정리 포함)
  document.getElementById('heading-image-close-btn')?.addEventListener('click', () => {
    cleanupAllEventListeners(); // ✅ [2026-01-29] 메모리 누수 방지
    const modal = document.getElementById('heading-image-modal');
    if (modal) modal.style.display = 'none';

    // ✅ [2026-02-04 FIX] 풀오토 세팅 모달이 숨겨진 상태라면 다시 복원
    restoreFullAutoSettingModal();
  });

  // ✅ 완료 버튼
  document.getElementById('heading-image-done-btn')?.addEventListener('click', async () => {
    // 체크박스 상태 저장
    const thumbnailTextCheck = document.getElementById('thumbnail-text-include') as HTMLInputElement;
    const textOnlyCheck = document.getElementById('text-only-publish') as HTMLInputElement;
    const lifestyleCheck = document.getElementById('lifestyle-image-generate') as HTMLInputElement;
    if (thumbnailTextCheck) localStorage.setItem('thumbnailTextInclude', String(thumbnailTextCheck.checked));
    if (textOnlyCheck) localStorage.setItem('textOnlyPublish', String(textOnlyCheck.checked));
    if (lifestyleCheck) localStorage.setItem('lifestyleImageGenerate', String(lifestyleCheck.checked));

    // ✅ [2026-01-28] 쇼핑커넥트 전용 필드들 저장
    const scSubImageSourceRadio = document.querySelector('input[name="sc-sub-image-source"]:checked') as HTMLInputElement;
    const scAutoThumbnailCheck = document.getElementById('sc-auto-thumbnail-setting') as HTMLInputElement;
    if (scSubImageSourceRadio) {
      localStorage.setItem('scSubImageSource', scSubImageSourceRadio.value);
      console.log(`[HeadingImageSettings] 쇼핑커넥트 소제목 이미지 소스: ${scSubImageSourceRadio.value}`);
    }
    if (scAutoThumbnailCheck) {
      localStorage.setItem('scAutoThumbnailSetting', String(scAutoThumbnailCheck.checked));
      console.log(`[HeadingImageSettings] 쇼핑커넥트 자동 썸네일 세팅: ${scAutoThumbnailCheck.checked}`);
    }

    // ✅ [2026-01-27] 썸네일/소제목 비율 드롭다운 값 저장
    const thumbnailRatioSelect = document.getElementById('thumbnail-ratio-select') as HTMLSelectElement;
    const subheadingRatioSelect = document.getElementById('subheading-ratio-select') as HTMLSelectElement;
    if (thumbnailRatioSelect) {
      localStorage.setItem('thumbnailImageRatio', thumbnailRatioSelect.value);
      console.log(`[HeadingImageSettings] 썸네일 비율 저장: ${thumbnailRatioSelect.value}`);
    }
    if (subheadingRatioSelect) {
      localStorage.setItem('subheadingImageRatio', subheadingRatioSelect.value);
      // 기존 imageRatio도 소제목 비율로 동기화 (호환성)
      localStorage.setItem('imageRatio', subheadingRatioSelect.value);
      console.log(`[HeadingImageSettings] 소제목 비율 저장: ${subheadingRatioSelect.value}`);
    }

    // ✅ [2026-01-27] config.json에도 비율 저장 (메인 프로세스에서 읽을 수 있도록)
    // ✅ [2026-01-29] safeIpcInvoke 사용으로 에러 핸들링 강화
    const ratioConfig = await safeIpcInvoke<any>('config:get');
    if (ratioConfig) {
      if (thumbnailRatioSelect) ratioConfig.thumbnailImageRatio = thumbnailRatioSelect.value;
      if (subheadingRatioSelect) {
        ratioConfig.subheadingImageRatio = subheadingRatioSelect.value;
        ratioConfig.imageRatio = subheadingRatioSelect.value; // 기본 비율
      }
      await safeIpcInvoke('config:set', ratioConfig);
      console.log('[HeadingImageSettings] ✅ config.json에 비율 설정 저장됨');
    }

    // ✅ [2026-01-28] 설정 저장 완료 토스트 알림
    if ((window as any).toastManager) {
      (window as any).toastManager.success('✅ 이미지 설정이 저장되었습니다!');
    } else {
      alert('✅ 이미지 설정이 저장되었습니다!');
    }

    const modal = document.getElementById('heading-image-modal');
    if (modal) modal.style.display = 'none';

    // ✅ [2026-02-04 FIX] 풀오토 세팅 모달이 숨겨진 상태라면 다시 복원
    restoreFullAutoSettingModal();
  });


  // ✅ 소제목 이미지 선택 버튼 → 서브 모달 열기
  document.getElementById('open-image-mode-btn')?.addEventListener('click', () => {
    const subModal = document.getElementById('image-mode-submodal');
    if (subModal) {
      subModal.style.display = 'flex';
      // 현재 모드 선택
      const currentMode = getHeadingImageMode();
      const radio = document.querySelector(`input[name="sub-image-mode"][value="${currentMode}"]`) as HTMLInputElement;
      if (radio) radio.checked = true;
    }
  });

  // ✅ AI 엔진 선택 버튼 → 서브 모달 열기
  document.getElementById('open-image-source-btn')?.addEventListener('click', () => {
    const subModal = document.getElementById('image-source-submodal');
    if (subModal) {
      subModal.style.display = 'flex';
      // 현재 소스 선택 표시
      const currentSource = getGlobalImageSource();
      const options = document.querySelectorAll('.source-option');
      options.forEach(opt => {
        const value = opt.getAttribute('data-value');
        (opt as HTMLElement).style.borderColor = value === currentSource ? '#667eea' : '#e5e7eb';
        (opt as HTMLElement).style.transform = value === currentSource ? 'scale(1.02)' : 'scale(1)';
      });
    }
  });

  // ✅ 이미지 모드 서브 모달 확인 버튼
  document.getElementById('image-mode-confirm')?.addEventListener('click', () => {
    const selected = document.querySelector('input[name="sub-image-mode"]:checked') as HTMLInputElement;
    if (selected) {
      setHeadingImageMode(selected.value as HeadingImageMode);
      // 메인 모달 표시 업데이트
      const display = document.getElementById('current-image-mode-display');
      if (display) display.textContent = MODE_NAMES[selected.value as HeadingImageMode];
    }
    const subModal = document.getElementById('image-mode-submodal');
    if (subModal) subModal.style.display = 'none';
  });

  // ✅ AI 엔진 서브 모달 - 카드 클릭 이벤트
  let selectedSourceValue: GlobalImageSource = getGlobalImageSource();
  const sourceOptions = document.querySelectorAll('.source-option');
  sourceOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const value = opt.getAttribute('data-value') as GlobalImageSource;
      selectedSourceValue = value;
      // 모든 카드 스타일 리셋
      sourceOptions.forEach(o => {
        (o as HTMLElement).style.borderColor = '#e5e7eb';
        (o as HTMLElement).style.transform = 'scale(1)';
      });
      // 선택된 카드 스타일
      (opt as HTMLElement).style.borderColor = '#667eea';
      (opt as HTMLElement).style.transform = 'scale(1.02)';
    });
  });

  // ✅ AI 엔진 서브 모달 확인 버튼
  document.getElementById('image-source-confirm')?.addEventListener('click', () => {
    setGlobalImageSource(selectedSourceValue);
    // 메인 모달 표시 업데이트
    const display = document.getElementById('current-image-source-display');
    if (display) display.textContent = SOURCE_NAMES[selectedSourceValue];
    const subModal = document.getElementById('image-source-submodal');
    if (subModal) subModal.style.display = 'none';
  });

  // ✅ [2026-01-26] 이미지 스타일 버튼 클릭 → 서브 모달 열기
  document.getElementById('open-image-style-btn')?.addEventListener('click', () => {
    const subModal = document.getElementById('image-style-submodal');
    if (subModal) {
      subModal.style.display = 'flex';
      // 현재 스타일 선택 표시
      const currentStyle = getImageStyle();
      const radioBtn = document.querySelector(`input[name="sub-image-style"][value="${currentStyle}"]`) as HTMLInputElement;
      if (radioBtn) radioBtn.checked = true;
      // 카드 스타일 업데이트
      const styleOptions = document.querySelectorAll('.style-option');
      styleOptions.forEach(opt => {
        const value = opt.getAttribute('data-value');
        (opt as HTMLElement).style.borderColor = value === currentStyle ? '#16a34a' : '#e5e7eb';
        (opt as HTMLElement).style.transform = value === currentStyle ? 'scale(1.02)' : 'scale(1)';
      });
    }
  });

  // ✅ 이미지 스타일 카드 클릭 이벤트 (상세 설명 업데이트 포함)
  let selectedStyleValue: ImageStyleType = getImageStyle();
  const styleOptions = document.querySelectorAll('.style-option');
  styleOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const value = opt.getAttribute('data-value') as ImageStyleType;
      selectedStyleValue = value;

      // 라디오 버튼 체크
      const radioBtn = (opt as HTMLElement).querySelector('input[type="radio"]') as HTMLInputElement;
      if (radioBtn) radioBtn.checked = true;

      // 모든 카드 스타일 리셋
      styleOptions.forEach(o => {
        (o as HTMLElement).style.borderColor = '#e5e7eb';
        (o as HTMLElement).style.transform = 'scale(1)';
      });

      // 선택된 카드 스타일
      (opt as HTMLElement).style.borderColor = '#16a34a';
      (opt as HTMLElement).style.transform = 'scale(1.02)';

      // ✅ 상세 설명 영역 업데이트
      const icon = opt.getAttribute('data-icon') || '📷';
      const title = opt.getAttribute('data-title') || '스타일';
      const desc = opt.getAttribute('data-desc') || '스타일 설명';
      const keywords = opt.getAttribute('data-keywords') || '';

      const previewIcon = document.getElementById('style-preview-icon');
      const previewTitle = document.getElementById('style-preview-title');
      const previewDesc = document.getElementById('style-preview-desc');
      const previewKeywords = document.getElementById('style-preview-keywords');
      const previewUsage = document.getElementById('style-preview-usage');

      if (previewIcon) previewIcon.textContent = icon;
      if (previewTitle) previewTitle.textContent = title;
      if (previewDesc) previewDesc.textContent = desc;
      if (previewKeywords) previewKeywords.textContent = keywords;

      // 스타일별 추천 용도
      const usageMap: Record<string, string> = {
        'realistic': '제품 리뷰, 음식 블로그, 인물 사진, 일상 기록',
        'bokeh': '감성 사진, 제품 클로즈업, 분위기 있는 일상',
        'vintage': '카페/맛집, 패션, 레트로 제품, 복고풍 컨텐츠',
        'minimalist': '비즈니스, 인포그래픽, IT/테크, 가이드',
        '3d-render': '제품 소개, IT 리뷰, 테크 뉴스, 미래 컨셉',
        'korean-folk': '한국 문화, 전통, 명절, 한국적 감성 콘텐츠',
        'stickman': '유머, 일상 꿀팁, 가벼운 정보, 재미있는 콘텐츠',
        'claymation': '키즈, 귀여운 제품 소개, 독특한 분위기',
        'neon-glow': '야경, IT/테크, 트렌디, 클럽/음악 컨텐츠',
        'papercut': 'DIY, 핸드크래프트, 따뜻한 감성, 독특한 느낌',
        'isometric': '비즈니스, IT, 가이드, 인포그래픽, 미니어처'
      };
      if (previewUsage) previewUsage.textContent = usageMap[value] || '다양한 블로그 콘텐츠';
    });
  });

  // ✅ [2026-01-27] 스타일 모달 닫기 버튼 이벤트
  document.getElementById('image-style-close')?.addEventListener('click', () => {
    const styleModal = document.getElementById('image-style-submodal');
    if (styleModal) styleModal.style.display = 'none';
  });

  // ✅ 테스트 생성 버튼 이벤트
  document.getElementById('image-style-test')?.addEventListener('click', async () => {
    const testBtn = document.getElementById('image-style-test') as HTMLButtonElement;
    if (testBtn) {
      testBtn.disabled = true;
      testBtn.innerHTML = '⏳ 생성 중...';
    }

    try {
      // IPC를 통해 테스트 이미지 생성 요청
      const selectedRatio = document.querySelector('input[name="sub-image-ratio"]:checked') as HTMLInputElement;
      const ratio = selectedRatio?.value || '1:1';

      // ✅ [2026-01-28] window.api.generateTestImage 사용 - 현재 선택된 엔진 포함
      const keywordInput = document.getElementById('test-keyword-input') as HTMLInputElement;
      const customKeyword = keywordInput?.value?.trim();
      const promptText = customKeyword || '아름다운 풍경, 맑은 하늘';

      // ✅ [2026-02-08] 임시 엔진 선택 (드롭다운) 우선, 없으면 저장된 설정 사용
      const testEngineSelect = document.getElementById('test-engine-select') as HTMLSelectElement;
      const tempEngine = testEngineSelect?.value?.trim();
      const currentEngine = tempEngine || getGlobalImageSource();
      const isTemporaryEngine = !!tempEngine;
      console.log(`[HeadingImageSettings] 🎨 테스트 이미지 생성 - 엔진: ${currentEngine} (${isTemporaryEngine ? '임시 선택' : '저장된 설정'}), 스타일: ${selectedStyleValue}`);

      // ✅ [2026-02-08] 텍스트 오버레이 옵션
      const textOverlayCheck = document.getElementById('test-text-overlay-check') as HTMLInputElement;
      const textOverlayEnabled = textOverlayCheck?.checked || false;
      const textOverlayText = promptText; // 키워드를 오버레이 텍스트로 사용

      const result = await (window as any).api?.generateTestImage({
        style: selectedStyleValue,
        ratio: ratio,
        prompt: promptText,
        engine: currentEngine, // ✅ 임시 엔진 또는 저장된 엔진
        textOverlay: textOverlayEnabled ? { enabled: true, text: textOverlayText } : undefined
      });

      if (result?.success && result?.path) {
        // ✅ 우측 미리보기 카드 영역에 이미지 표시
        const previewDescContainer = document.getElementById('style-preview-desc')?.parentElement;
        if (previewDescContainer) {
          // 기존 설명 영역 위에 이미지 추가
          let previewImageEl = document.getElementById('style-test-preview-image');
          if (!previewImageEl) {
            previewImageEl = document.createElement('div');
            previewImageEl.id = 'style-test-preview-image';
            previewImageEl.style.cssText = 'margin-bottom: 12px; text-align: center;';
            previewDescContainer.insertBefore(previewImageEl, previewDescContainer.firstChild);
          }

          previewImageEl.innerHTML = `
            <img src="file://${result.path.replace(/\\/g, '/')}" 
                 style="max-width: 100%; max-height: 280px; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.15);" 
                 alt="테스트 이미지" />
            <p style="color: #16a34a; margin-top: 8px; font-size: 12px; font-weight: 600;">✅ 생성 완료!</p>
          `;
        }

        alert(`✅ 테스트 이미지 생성 완료!\n저장 위치: ${result.path}`);
      } else {
        alert(`⚠️ 테스트 생성 실패: ${result?.error || '알 수 없는 오류'}`);
      }
    } catch (err: any) {
      console.error('[StyleTest] 오류:', err);
      alert(`❌ 테스트 생성 중 오류: ${err.message || err}`);
    } finally {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.innerHTML = '🎨 테스트 생성';
      }
    }
  });


  // ✅ 이미지 스타일 서브 모달 확인 버튼
  document.getElementById('image-style-confirm')?.addEventListener('click', () => {
    setImageStyle(selectedStyleValue);
    // 메인 모달 표시 업데이트
    const styleNames = STYLE_NAMES;
    const display = document.getElementById('current-image-style-display');
    if (display) display.textContent = styleNames[selectedStyleValue] || selectedStyleValue;

    // ✅ 비율 설정도 저장
    const selectedRatio = document.querySelector('input[name="sub-image-ratio"]:checked') as HTMLInputElement;
    if (selectedRatio) {
      setImageRatio(selectedRatio.value as ImageAspectRatio);
    }

    const subModal = document.getElementById('image-style-submodal');
    if (subModal) subModal.style.display = 'none';
  });

  // ✅ 비율 옵션 클릭 이벤트
  const ratioOptions = document.querySelectorAll('.ratio-option');
  ratioOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      ratioOptions.forEach(o => {
        (o as HTMLElement).style.borderColor = '#e5e7eb';
        (o as HTMLElement).style.background = '#f9fafb';
      });
      (opt as HTMLElement).style.borderColor = '#16a34a';
      (opt as HTMLElement).style.background = '#dcfce7';
    });
  });


  // ✅ 메인 모달 배경 클릭 시 닫기
  const modal = document.getElementById('heading-image-modal');
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      // ✅ [2026-02-04 FIX] 배경 클릭으로 닫을 때도 풀오토 세팅 모달 복원
      restoreFullAutoSettingModal();
    }
  });

  // ✅ 서브 모달 배경 클릭 시 닫기
  const modeSubModal = document.getElementById('image-mode-submodal');
  modeSubModal?.addEventListener('click', (e) => { if (e.target === modeSubModal) modeSubModal.style.display = 'none'; });
  const sourceSubModal = document.getElementById('image-source-submodal');
  sourceSubModal?.addEventListener('click', (e) => { if (e.target === sourceSubModal) sourceSubModal.style.display = 'none'; });
  const styleSubModal = document.getElementById('image-style-submodal');
  styleSubModal?.addEventListener('click', (e) => { if (e.target === styleSubModal) styleSubModal.style.display = 'none'; });

  // ✅ [2026-01-27] 이미지 생성 모델 상세 설정 버튼 클릭 → 동적 서브 모달 생성
  document.getElementById('open-advanced-image-model-btn')?.addEventListener('click', () => {
    console.log('[HeadingImageSettings] 🎨 이미지 생성 모델 상세 설정 열기');

    // 기존 서브 모달이 있으면 제거
    const existingModal = document.getElementById('image-model-settings-submodal');
    if (existingModal) existingModal.remove();

    // 서브 모달 생성
    const subModal = document.createElement('div');
    subModal.id = 'image-model-settings-submodal';
    subModal.style.cssText = `
      display: flex;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(8px);
      z-index: 10040;
      justify-content: center;
      align-items: center;
    `;

    subModal.innerHTML = `
      <div style="max-width: 520px; width: 95%; max-height: 85vh; overflow-y: auto; padding: 24px; border-radius: 20px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); box-shadow: 0 25px 50px rgba(0,0,0,0.5); border: 2px solid #22c55e;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h4 style="margin: 0; font-size: 18px; font-weight: 700; color: #22c55e; display: flex; align-items: center; gap: 8px;">
            <span>🎨</span> 이미지 생성 모델 상세 설정
          </h4>
          <button id="close-image-model-submodal" style="background: none; border: none; color: #9ca3af; font-size: 24px; cursor: pointer;">×</button>
        </div>
        
        <p style="margin: 0 0 16px 0; font-size: 13px; color: #9ca3af;">각 이미지 소스별 세부 모델을 선택하세요. (퀄리티 순 정렬)</p>
        
        <!-- 빠른 설정 프리셋 -->
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
          <button id="preset-budget-submodal" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 14px;">
            💰 가성비 조합<br><span style="font-size: 11px; opacity: 0.85;">SDXL + Gemini 3 Pro</span>
          </button>
          <button id="preset-premium-submodal" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 14px;">
            🏆 고퀄리티 조합<br><span style="font-size: 11px; opacity: 0.85;">Ultra + Pro 4K</span>
          </button>
          <button id="preset-balanced-submodal" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 14px;">
            ⚖️ 균형 조합<br><span style="font-size: 11px; opacity: 0.85;">Turbo + Pro</span>
          </button>
        </div>
        
        <div style="display: grid; gap: 12px;">
          <!-- 🍌 나노 바나나 프로 (Gemini) - 통일 -->
          <div style="background: rgba(251, 191, 36, 0.1); padding: 14px; border-radius: 12px; border: 1px solid rgba(251, 191, 36, 0.3);">
            <label style="display: block; font-weight: 600; color: #fbbf24; margin-bottom: 8px; font-size: 13px;">🍌 나노 바나나 프로 (Gemini) <span style="color: #22c55e; font-size: 11px;">★ 추천</span></label>
            <select id="submodal-nano-model" style="width: 100%; padding: 10px; background: #1a1a2e; border: 2px solid rgba(251, 191, 36, 0.4); border-radius: 8px; color: white; font-size: 13px; cursor: pointer;">
              <option value="gemini-3-pro-4k">👑 Gemini 3 Pro 4K - ₩336 (초고해상도, 최고품질)</option>
              <option value="gemini-3-pro">🏆 Gemini 3 Pro - ₩77 (고품질, 추천)</option>
            </select>
            <p style="margin: 6px 0 0; font-size: 11px; color: #9ca3af;">ℹ️ 대표 이미지 + 본문 서브 이미지 모두 동일 모델 적용</p>
          </div>
          
          <!-- 🎨 Fal.ai (FLUX) -->
          <div style="background: rgba(236, 72, 153, 0.1); padding: 14px; border-radius: 12px; border: 1px solid rgba(236, 72, 153, 0.3);">
            <label style="display: block; font-weight: 600; color: #ec4899; margin-bottom: 8px; font-size: 13px;">🎨 Fal.ai (FLUX)</label>
            <select id="submodal-falai-model" style="width: 100%; padding: 10px; background: #1a1a2e; border: 2px solid rgba(236, 72, 153, 0.4); border-radius: 8px; color: white; font-size: 13px; cursor: pointer;">
              <option value="flux-1.1-pro">👑 FLUX 1.1 Pro - ₩77 (최고품질)</option>
              <option value="flux-realism">🏆 FLUX Realism - ₩29 (실사 추천)</option>
              <option value="flux-dev">🔧 FLUX Dev - ₩35 (테스트용)</option>
              <option value="flux-schnell">⚡ FLUX Schnell - ₩11 (초고속)</option>
            </select>
          </div>
          
          <!-- 🚀 Stability.AI -->
          <div style="background: rgba(59, 130, 246, 0.1); padding: 14px; border-radius: 12px; border: 1px solid rgba(59, 130, 246, 0.3);">
            <label style="display: block; font-weight: 600; color: #3b82f6; margin-bottom: 8px; font-size: 13px;">🚀 Stability.AI</label>
            <select id="submodal-stability-model" style="width: 100%; padding: 10px; background: #1a1a2e; border: 2px solid rgba(59, 130, 246, 0.4); border-radius: 8px; color: white; font-size: 13px; cursor: pointer;">
              <option value="stable-image-ultra">👑 Stable Image Ultra - ₩112 (최고품질)</option>
              <option value="sd35-large">🏆 SD 3.5 Large - ₩91 (디테일)</option>
              <option value="sd35-large-turbo">🚀 SD 3.5 Large Turbo - ₩56 (고품질+빠름)</option>
              <option value="sd35-medium">⚖️ SD 3.5 Medium - ₩49 (균형)</option>
              <option value="sd35-flash">⚡ SD 3.5 Flash - ₩35 (빠른 속도)</option>
              <option value="sdxl-1.0">💰 SDXL 1.0 - ₩13 (최저가)</option>
            </select>
          </div>
          
          <!-- 🔥 DeepInfra (FLUX) -->
          <div style="background: rgba(239, 68, 68, 0.1); padding: 14px; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.3);">
            <label style="display: block; font-weight: 600; color: #ef4444; margin-bottom: 8px; font-size: 13px;">🔥 DeepInfra (FLUX)</label>
            <select id="submodal-deepinfra-model" style="width: 100%; padding: 10px; background: #1a1a2e; border: 2px solid rgba(239, 68, 68, 0.4); border-radius: 8px; color: white; font-size: 13px; cursor: pointer;">
              <option value="flux-2-dev">👑 FLUX.2-dev - ₩35 (최신, 고품질)</option>
              <option value="flux-dev">🏆 FLUX.1-dev - ₩35 (고품질)</option>
              <option value="flux-schnell">⚡ FLUX.1-schnell - ₩0 (무료, 빠름)</option>
            </select>
            <p style="margin: 6px 0 0; font-size: 11px; color: #9ca3af;">ℹ️ DeepInfra 계정 필요</p>
          </div>
          
          <!-- ⚡ Prodia AI -->
          <div style="background: rgba(168, 85, 247, 0.1); padding: 14px; border-radius: 12px; border: 1px solid rgba(168, 85, 247, 0.3);">
            <label style="display: block; font-weight: 600; color: #a855f7; margin-bottom: 8px; font-size: 13px;">⚡ Prodia AI</label>
            <select id="submodal-prodia-model" style="width: 100%; padding: 10px; background: #1a1a2e; border: 2px solid rgba(168, 85, 247, 0.4); border-radius: 8px; color: white; font-size: 13px; cursor: pointer;">
              <option value="sdxl-v10">👑 SDXL v1.0 - $0.0025 (고품질)</option>
              <option value="sd-v15">🏆 SD v1.5 - $0.002 (안정적)</option>
              <option value="sd-v21">⚡ SD v2.1 - $0.002 (빠름)</option>
              <option value="realistic-vision-v51">📷 Realistic Vision v5.1 - $0.003 (실사)</option>
              <option value="dreamshaper-8">✨ Dreamshaper 8 - $0.002 (다양한 스타일)</option>
            </select>
            <p style="margin: 6px 0 0; font-size: 11px; color: #9ca3af;">ℹ️ Prodia Token 필요 (환경설정에서 입력)</p>
          </div>
          
          <!-- 🆓 Pollinations (무료) -->
          <div style="background: rgba(156, 163, 175, 0.1); padding: 14px; border-radius: 12px; border: 1px solid rgba(156, 163, 175, 0.3);">
            <label style="display: block; font-weight: 600; color: #9ca3af; margin-bottom: 8px; font-size: 13px;">🆓 Pollinations</label>
            <select disabled style="width: 100%; padding: 10px; background: #1a1a2e; border: 2px solid rgba(156, 163, 175, 0.3); border-radius: 8px; color: #6b7280; font-size: 13px; cursor: not-allowed; opacity: 0.6;">
              <option>🆓 Pollinations AI - ₩0 (무료, 모델 선택 없음)</option>
            </select>
          </div>
        </div>
        
        <!-- 퀄리티 순서 안내 -->
        <div style="margin-top: 16px; padding: 12px; background: rgba(34, 197, 94, 0.1); border-radius: 10px; border: 1px dashed rgba(34, 197, 94, 0.4);">
          <p style="margin: 0; font-size: 12px; color: #22c55e; font-weight: 600;">📊 퀄리티 순서 (높음 → 낮음)</p>
          <p style="margin: 4px 0 0; font-size: 11px; color: #9ca3af; line-height: 1.5;">
            Gemini 3 Pro 4K > Ultra/Pro > Large > Turbo > Medium > Realism > Flash/Schnell > SDXL
          </p>
        </div>
        
        <div style="margin-top: 20px; display: flex; gap: 10px;">
          <button id="save-image-model-submodal" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 14px; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);">
            💾 저장
          </button>
          <button id="cancel-image-model-submodal" style="flex: 0.5; padding: 14px; background: #374151; color: #9ca3af; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; font-size: 14px;">
            취소
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(subModal);

    // 현재 설정값 로드
    const nanoSelect = subModal.querySelector('#submodal-nano-model') as HTMLSelectElement;
    const falaiSelect = subModal.querySelector('#submodal-falai-model') as HTMLSelectElement;
    const stabilitySelect = subModal.querySelector('#submodal-stability-model') as HTMLSelectElement;
    const deepinfraSelect = subModal.querySelector('#submodal-deepinfra-model') as HTMLSelectElement;
    const prodiaSelect = subModal.querySelector('#submodal-prodia-model') as HTMLSelectElement;  // ✅ Prodia 추가

    // localStorage에서 현재 값 로드
    if (nanoSelect) nanoSelect.value = localStorage.getItem('nanoBananaModel') || 'gemini-3-pro';
    if (falaiSelect) falaiSelect.value = localStorage.getItem('falaiModel') || 'flux-realism';
    if (stabilitySelect) stabilitySelect.value = localStorage.getItem('stabilityModel') || 'sd35-large-turbo';
    if (deepinfraSelect) deepinfraSelect.value = localStorage.getItem('deepinfraModel') || 'flux-2-dev';
    if (prodiaSelect) prodiaSelect.value = localStorage.getItem('prodiaModel') || 'sdxl-v10';  // ✅ Prodia 추가

    // 닫기 버튼
    subModal.querySelector('#close-image-model-submodal')?.addEventListener('click', () => subModal.remove());
    subModal.querySelector('#cancel-image-model-submodal')?.addEventListener('click', () => subModal.remove());

    // 배경 클릭 시 닫기
    subModal.addEventListener('click', (e) => { if (e.target === subModal) subModal.remove(); });

    // 프리셋 버튼 - 가성비 (SDXL + Gemini 3 Pro)
    subModal.querySelector('#preset-budget-submodal')?.addEventListener('click', () => {
      if (nanoSelect) nanoSelect.value = 'gemini-3-pro';
      if (falaiSelect) falaiSelect.value = 'flux-schnell';
      if (stabilitySelect) stabilitySelect.value = 'sdxl-1.0';
      if (deepinfraSelect) deepinfraSelect.value = 'flux-schnell';
      if (prodiaSelect) prodiaSelect.value = 'sd-v15';  // ✅ Prodia 추가
      if ((window as any).toastManager) (window as any).toastManager.success('💰 가성비 조합 적용됨');
    });

    // 프리셋 버튼 - 고퀄리티 (Ultra + Pro 4K)
    subModal.querySelector('#preset-premium-submodal')?.addEventListener('click', () => {
      if (nanoSelect) nanoSelect.value = 'gemini-3-pro-4k';
      if (falaiSelect) falaiSelect.value = 'flux-1.1-pro';
      if (stabilitySelect) stabilitySelect.value = 'stable-image-ultra';
      if (deepinfraSelect) deepinfraSelect.value = 'flux-2-dev';
      if (prodiaSelect) prodiaSelect.value = 'sdxl-v10';  // ✅ Prodia 추가
      if ((window as any).toastManager) (window as any).toastManager.success('🏆 고퀄리티 조합 적용됨');
    });

    // 프리셋 버튼 - 균형 (Turbo + Pro)
    subModal.querySelector('#preset-balanced-submodal')?.addEventListener('click', () => {
      if (nanoSelect) nanoSelect.value = 'gemini-3-pro';
      if (falaiSelect) falaiSelect.value = 'flux-realism';
      if (stabilitySelect) stabilitySelect.value = 'sd35-large-turbo';
      if (deepinfraSelect) deepinfraSelect.value = 'flux-2-dev';
      if (prodiaSelect) prodiaSelect.value = 'realistic-vision-v51';  // ✅ Prodia 추가
      if ((window as any).toastManager) (window as any).toastManager.success('⚖️ 균형 조합 적용됨');
    });

    // 저장 버튼
    subModal.querySelector('#save-image-model-submodal')?.addEventListener('click', async () => {
      // localStorage에 저장
      if (nanoSelect) {
        localStorage.setItem('nanoBananaModel', nanoSelect.value);
        // 이전 버전 호환 (main/sub 둘 다 같은 값으로)
        localStorage.setItem('nanoBananaMainModel', nanoSelect.value);
        localStorage.setItem('nanoBananaSubModel', nanoSelect.value);
      }
      if (falaiSelect) localStorage.setItem('falaiModel', falaiSelect.value);
      if (stabilitySelect) localStorage.setItem('stabilityModel', stabilitySelect.value);
      if (deepinfraSelect) localStorage.setItem('deepinfraModel', deepinfraSelect.value);
      if (prodiaSelect) localStorage.setItem('prodiaModel', prodiaSelect.value);  // ✅ Prodia 추가

      // ✅ [2026-01-27] config.json에도 저장 (메인 프로세스에서 읽을 수 있도록)
      // ✅ [2026-01-29] safeIpcInvoke 사용으로 에러 핸들링 강화
      const currentConfig = await safeIpcInvoke<any>('config:get');
      if (currentConfig) {
        // 새 설정 merge
        if (nanoSelect) {
          currentConfig.nanoBananaModel = nanoSelect.value;
          currentConfig.nanoBananaMainModel = nanoSelect.value;
          currentConfig.nanoBananaSubModel = nanoSelect.value;
        }
        if (falaiSelect) currentConfig.falaiModel = falaiSelect.value;
        if (stabilitySelect) currentConfig.stabilityModel = stabilitySelect.value;
        if (deepinfraSelect) currentConfig.deepinfraModel = deepinfraSelect.value;
        if (prodiaSelect) currentConfig.prodiaModel = prodiaSelect.value;  // ✅ Prodia 추가

        // 저장
        await safeIpcInvoke('config:set', currentConfig);
        console.log('[HeadingImageSettings] ✅ config.json에 모델 설정 저장됨:', {
          nanoBananaModel: currentConfig.nanoBananaModel,
          falaiModel: currentConfig.falaiModel,
          stabilityModel: currentConfig.stabilityModel,
          deepinfraModel: currentConfig.deepinfraModel
        });
      }

      // 이미지 관리 탭의 드롭다운도 동기화
      const mainFalaiSelect = document.getElementById('falai-model-select') as HTMLSelectElement;
      const mainStabilitySelect = document.getElementById('stability-model-select') as HTMLSelectElement;
      const mainNanoMainSelect = document.getElementById('nano-banana-main-model') as HTMLSelectElement;
      const mainNanoSubSelect = document.getElementById('nano-banana-sub-model') as HTMLSelectElement;

      if (mainFalaiSelect && falaiSelect) mainFalaiSelect.value = falaiSelect.value;
      if (mainStabilitySelect && stabilitySelect) mainStabilitySelect.value = stabilitySelect.value;
      if (mainNanoMainSelect && nanoSelect) mainNanoMainSelect.value = nanoSelect.value;
      if (mainNanoSubSelect && nanoSelect) mainNanoSubSelect.value = nanoSelect.value;

      if ((window as any).toastManager) (window as any).toastManager.success('✅ 이미지 모델 설정 저장됨');
      subModal.remove();
    });

    console.log('[HeadingImageSettings] ✅ 이미지 모델 설정 서브 모달 열림');
  });

  console.log('[HeadingImageSettings] 모달 생성 완료');
}



// ✅ [2026-01-29] 모달 닫기 함수
export function closeHeadingImageModal(): void {
  const modal = document.getElementById('heading-image-modal');
  if (modal) {
    modal.style.display = 'none';
    cleanupAllEventListeners();
  }
}

export function openHeadingImageModal(): void {
  createHeadingImageModal();
  const modal = document.getElementById('heading-image-modal');
  if (modal) {
    modal.style.display = 'flex';

    // ✅ 버튼 표시 값 초기화 (통합 상수 사용)
    const currentMode = getHeadingImageMode();
    const modeDisplay = document.getElementById('current-image-mode-display');
    if (modeDisplay) modeDisplay.textContent = MODE_NAMES[currentMode];

    const currentSource = getGlobalImageSource();
    const sourceDisplay = document.getElementById('current-image-source-display');
    if (sourceDisplay) sourceDisplay.textContent = SOURCE_NAMES[currentSource];

    // ✅ [2026-01-26] 이미지 스타일 표시 초기화 (통합 상수 사용)
    const currentStyle = getImageStyle();
    const styleDisplay = document.getElementById('current-image-style-display');
    if (styleDisplay) styleDisplay.textContent = STYLE_NAMES[currentStyle] || currentStyle;

    // ✅ 비율 라디오 버튼 초기화
    const currentRatio = getImageRatio();
    const ratioRadio = document.querySelector(`input[name="sub-image-ratio"][value="${currentRatio}"]`) as HTMLInputElement;
    if (ratioRadio) ratioRadio.checked = true;



    // ✅ 체크박스 상태 초기화
    const thumbnailTextCheck = document.getElementById('thumbnail-text-include') as HTMLInputElement;
    const textOnlyCheck = document.getElementById('text-only-publish') as HTMLInputElement;
    const lifestyleCheck = document.getElementById('lifestyle-image-generate') as HTMLInputElement;
    if (thumbnailTextCheck) thumbnailTextCheck.checked = localStorage.getItem('thumbnailTextInclude') === 'true';
    if (textOnlyCheck) textOnlyCheck.checked = localStorage.getItem('textOnlyPublish') === 'true';
    if (lifestyleCheck) lifestyleCheck.checked = localStorage.getItem('lifestyleImageGenerate') === 'true';

    // ✅ 쇼핑커넥트 모드 감지 및 전용 옵션 표시
    const shoppingConnectSection = document.getElementById('shopping-connect-options');
    if (shoppingConnectSection) {
      // 쇼핑커넥트 모드 체크 (여러 방법으로 확인)
      const contentModeInput = document.getElementById('unified-content-mode') as HTMLInputElement | null;
      const shoppingConnectSettings = document.getElementById('shopping-connect-settings');

      // 1. isShoppingConnectModeActive() 전역 함수 사용
      // 2. unified-content-mode 값이 'affiliate'인지 확인
      // 3. shopping-connect-settings 섹션이 보이는지 확인
      const isShoppingConnect =
        (typeof (window as any).isShoppingConnectModeActive === 'function' && (window as any).isShoppingConnectModeActive()) ||
        contentModeInput?.value === 'affiliate' ||
        (shoppingConnectSettings && shoppingConnectSettings.style.display !== 'none');

      shoppingConnectSection.style.display = isShoppingConnect ? 'block' : 'none';
      console.log('[HeadingImageSettings] 쇼핑커넥트 모드:', isShoppingConnect);

      // ✅ [2026-01-28] 쇼핑커넥트 전용 필드들 로드
      if (isShoppingConnect) {
        const scSubImageSource = localStorage.getItem('scSubImageSource') || 'ai';
        const scSubImageRadio = document.querySelector(`input[name="sc-sub-image-source"][value="${scSubImageSource}"]`) as HTMLInputElement;
        if (scSubImageRadio) scSubImageRadio.checked = true;

        const scAutoThumbnailCheck = document.getElementById('sc-auto-thumbnail-setting') as HTMLInputElement;
        if (scAutoThumbnailCheck) scAutoThumbnailCheck.checked = localStorage.getItem('scAutoThumbnailSetting') === 'true';
      }
    }
  }
}




// 전역에 노출
(window as any).openHeadingImageModal = openHeadingImageModal;
(window as any).getHeadingImageMode = getHeadingImageMode;
(window as any).setHeadingImageMode = setHeadingImageMode;
(window as any).getGlobalImageSource = getGlobalImageSource;
(window as any).setGlobalImageSource = setGlobalImageSource;

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
    btn.innerHTML = '⚡ 메인 풀오토 이미지 설정';

    // ✅ [2026-01-28] 플로팅 버튼 - 금색 테마 + 검은 테두리 + 반짝거리는 애니메이션
    btn.style.cssText = `
      position: fixed;
      bottom: 130px;
      right: 24px;
      z-index: 9998;
      padding: 14px 24px;
      background: linear-gradient(135deg, #D4AF37 0%, #FFD700 50%, #D4AF37 100%);
      background-size: 200% auto;
      color: #0d0d0d;
      border: 3px solid #1a1a1a;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.3s;
      box-shadow: 0 4px 20px rgba(212, 175, 55, 0.5), 0 0 30px rgba(212, 175, 55, 0.3);
      text-shadow: 0 1px 2px rgba(255,255,255,0.2);
      animation: shimmer-gold 3s ease-in-out infinite;
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-3px) scale(1.02)';
      btn.style.boxShadow = '0 8px 30px rgba(212, 175, 55, 0.6), 0 0 40px rgba(212, 175, 55, 0.4)';
      btn.style.backgroundPosition = 'right center';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0) scale(1)';
      btn.style.boxShadow = '0 4px 20px rgba(212, 175, 55, 0.5), 0 0 30px rgba(212, 175, 55, 0.3)';
      btn.style.backgroundPosition = 'left center';
    });
    btn.addEventListener('click', () => openHeadingImageModal());

    // ✅ 항상 body에 플로팅 버튼으로 추가
    document.body.appendChild(btn);
    console.log('[HeadingImageSettings] ✅ 플로팅 버튼 항상 표시됨 (금색 테마)');
  }, 500);
}

// ✅ [2026-01-29] 전역 노출 - 모든 유틸 함수 접근 가능
(window as any).getHeadingImageMode = getHeadingImageMode;
(window as any).setHeadingImageMode = setHeadingImageMode;
(window as any).getGlobalImageSource = getGlobalImageSource;
(window as any).setGlobalImageSource = setGlobalImageSource;
(window as any).getImageStyle = getImageStyle;
(window as any).setImageStyle = setImageStyle;
(window as any).getImageRatio = getImageRatio;
(window as any).setImageRatio = setImageRatio;
(window as any).getThumbnailRatio = getThumbnailRatio;
(window as any).getSubheadingRatio = getSubheadingRatio;
(window as any).setThumbnailRatio = setThumbnailRatio;
(window as any).setSubheadingRatio = setSubheadingRatio;
(window as any).shouldGenerateImageForHeading = shouldGenerateImageForHeading;
(window as any).getHeadingImageModeDisplayText = getHeadingImageModeDisplayText;
(window as any).openHeadingImageModal = openHeadingImageModal;
(window as any).closeHeadingImageModal = closeHeadingImageModal;

console.log('[HeadingImageSettings] 📦 모듈 로드됨! (100점 버전)');

