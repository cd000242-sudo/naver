/**
 * ✅ [2026-01-25 모듈화] 완전자동 이미지 설정 모달
 * - renderer.ts에서 분리됨
 * ✅ [2026-01-29 개선] 코드 품질 100점 달성
 * - 상수 통합, 에러 핸들링 강화, 메모리 관리 개선
 */

export type HeadingImageMode = 'all' | 'thumbnail-only' | 'odd-only' | 'even-only' | 'none';
// ✅ [2026-02-08 FIX] 이미지 관리 탭 드롭다운 value와 완전 통일
export type GlobalImageSource = 'nano-banana-pro' | 'falai' | 'prodia' | 'stability' | 'pollinations' | 'deepinfra' | 'openai-image' | 'leonardoai' | 'imagefx' | 'local-folder';

// ✅ [2026-02-18] 이미지 스타일 타입 (5개)
export type ImageStyleType =
  | 'realistic'      // 실사 이미지
  | 'vintage'        // 빈티지 이미지
  | 'stickman'       // 졸라맨 이미지
  | 'roundy'         // 뚱글이 이미지 (Molang/카카오프렌즈 계열)
  | '2d'             // 2D 이미지 (한국 웹툰/일러스트)
  | 'disney';        // 디즈니 3D 애니메이션

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
  'deepinfra': 'FLUX-2 (DeepInfra)',
  'openai-image': 'OpenAI DALL-E',
  'leonardoai': 'Leonardo AI',
  'imagefx': 'ImageFX (무료)',
  'local-folder': '📂 내 폴더'
};

export const STYLE_NAMES: Record<ImageStyleType, string> = {
  'realistic': '📷 실사 이미지',
  'vintage': '📜 빈티지 이미지',
  'stickman': '🤸 졸라맨 이미지',
  'roundy': '🫧 뚱글이 이미지',
  '2d': '🎨 2D 이미지',
  'disney': '🏰 디즈니 스타일',
};

// ✅ [2026-02-18] 카테고리 그룹핑 (UI용) - 5개
export const STYLE_CATEGORIES: { label: string; styles: ImageStyleType[] }[] = [
  { label: '📷 실사', styles: ['realistic'] },
  { label: '🎨 아트', styles: ['vintage', '2d'] },
  { label: '✨ 캐릭터', styles: ['stickman', 'roundy'] },
  { label: '🏰 3D', styles: ['disney'] },
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
      // ✅ [2026-03-23 FIX] main.ts:3921과 동일한 0-indexed 기준
      // origIdx=0(썸네일)→항상포함, origIdx=1→홀수(포함), origIdx=2→짝수(제외)
      return isThumbnail || headingIndex % 2 === 1;
    case 'even-only':
      // ✅ [2026-03-23 FIX] main.ts:3933과 동일한 0-indexed 기준
      // origIdx=0(썸네일)→항상포함, origIdx=1→홀수(제외), origIdx=2→짝수(포함)
      return isThumbnail || headingIndex % 2 === 0;
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
  // ✅ [2026-02-18 FIX] fullAutoImageSource도 동기화 — 이전에는 globalImageSource만 설정되어
  // getImageSource()가 fullAutoImageSource(="null")를 거부한 후 DOM 폴백으로 nano-banana-pro 반환
  const VALID_AI_SOURCES: GlobalImageSource[] = ['nano-banana-pro', 'deepinfra', 'openai-image', 'leonardoai', 'imagefx', 'local-folder'];
  if (VALID_AI_SOURCES.includes(source)) {
    safeLocalStorageSet('fullAutoImageSource', source);
    console.log(`[HeadingImageSettings] 글로벌 + 풀오토 이미지 소스 동기화: ${source}`);
  } else {
    console.log(`[HeadingImageSettings] 글로벌 이미지 소스 설정: ${source} (AI 엔진 아님 → fullAuto 미동기화)`);
  }
}

// ✅ [2026-02-02] 풀오토 전용 이미지 소스 설정 (이미지 관리 탭과 완전히 분리)
export function getFullAutoImageSource(): GlobalImageSource {
  // ✅ [2026-02-13 FIX] 유효한 AI 엔진 목록 (이것 외의 값은 모두 무효)
  const VALID_SOURCES: GlobalImageSource[] = ['nano-banana-pro', 'falai', 'prodia', 'stability', 'pollinations', 'deepinfra', 'openai-image', 'leonardoai', 'imagefx', 'local-folder'];

  // 우선순위: fullAutoImageSource → globalImageSource → 'nano-banana-pro' (Gemini 기본값)
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

// ✅ [2026-02-18] 웹툰 성별 설정 (2D 스타일 전용)
export type WebtoonGenderType = 'male' | 'female' | 'neutral';

let currentWebtoonGender: WebtoonGenderType = 'male';

export function getWebtoonGender(): WebtoonGenderType {
  const saved = safeLocalStorageGet('webtoonGender') as WebtoonGenderType;
  return saved || currentWebtoonGender;
}

export function setWebtoonGender(gender: WebtoonGenderType): void {
  currentWebtoonGender = gender;
  safeLocalStorageSet('webtoonGender', gender);
  console.log(`[HeadingImageSettings] 웹툰 성별 설정: ${gender}`);
  syncWebtoonGenderToConfig(gender);
}

async function syncWebtoonGenderToConfig(gender: WebtoonGenderType): Promise<void> {
  try {
    const config = await safeIpcInvoke<any>('config:get');
    if (config) {
      config.webtoonGender = gender;
      await safeIpcInvoke('config:set', config);
      console.log(`[HeadingImageSettings] ✅ config.json에 웹툰 성별 저장: ${gender}`);
    }
  } catch (err) {
    console.warn('[HeadingImageSettings] config.json 웹툰 성별 동기화 실패:', err);
  }
}

// ✅ [2026-02-19] 웹툰 서브스타일 설정 (2D 스타일 전용)
export type WebtoonSubStyleType = 'webtoon_illust' | 'chibi' | 'flat';

export const SUBSTYLE_NAMES: Record<WebtoonSubStyleType, string> = {
  'webtoon_illust': '🖌️ 웹툰 일러스트',
  'chibi': '🎀 치비',
  'flat': '📐 플랫 벡터',
};

let currentWebtoonSubStyle: WebtoonSubStyleType = 'webtoon_illust';

export function getWebtoonSubStyle(): WebtoonSubStyleType {
  const saved = safeLocalStorageGet('webtoonSubStyle') as WebtoonSubStyleType;
  return saved || currentWebtoonSubStyle;
}

export function setWebtoonSubStyle(subStyle: WebtoonSubStyleType): void {
  currentWebtoonSubStyle = subStyle;
  safeLocalStorageSet('webtoonSubStyle', subStyle);
  console.log(`[HeadingImageSettings] 웹툰 서브스타일 설정: ${subStyle}`);
  syncWebtoonSubStyleToConfig(subStyle);
}

async function syncWebtoonSubStyleToConfig(subStyle: WebtoonSubStyleType): Promise<void> {
  try {
    const config = await safeIpcInvoke<any>('config:get');
    if (config) {
      config.webtoonSubStyle = subStyle;
      await safeIpcInvoke('config:set', config);
      console.log(`[HeadingImageSettings] ✅ config.json에 웹툰 서브스타일 저장: ${subStyle}`);
    }
  } catch (err) {
    console.warn('[HeadingImageSettings] config.json 웹툰 서브스타일 동기화 실패:', err);
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
                  <div class="btn-value" id="current-image-source-display">ImageFX (무료)</div>
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

          <!-- ✅ [2026-03-16] Google 계정 변경 버튼 (ImageFX) -->
          <div style="margin-bottom: 16px;">
            <button type="button" class="premium-setting-btn" id="switch-google-account-btn">
              <div style="display: flex; align-items: center; gap: 14px;">
                <div class="btn-icon" style="background: linear-gradient(135deg, #4285F4 0%, #1a73e8 100%);">🔄</div>
                <div>
                  <div class="btn-text">Google 계정 변경하기</div>
                  <div class="btn-value" id="google-account-status" style="color: #4285F4;">ImageFX 로그인 계정 변경 →</div>
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
                <div class="checkbox-label">🖼️ 썸네일 텍스트 포함</div>
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

          <!-- ✅ [2026-03-23] 내 폴더 선택 시 부족 이미지 처리 옵션 -->
          <div id="local-folder-fallback-options" style="display: none; margin-bottom: 16px; padding: 14px 16px; border-radius: 12px; background: linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%); border: 1px solid rgba(99,102,241,0.3);">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
              <span style="font-size: 1.1rem;">📂</span>
              <span style="font-weight: 600; color: #a5b4fc; font-size: 13px;">폴더 이미지 부족 시 처리</span>
            </div>
            <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 6px; border-radius: 8px; cursor: pointer; transition: background 0.2s; background: rgba(255,255,255,0.04);" onmouseover="this.style.background='rgba(99,102,241,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
              <input type="radio" name="local-folder-fallback" value="skip" checked style="accent-color: #6366f1; width: 16px; height: 16px;">
              <div>
                <div style="font-size: 13px; font-weight: 600; color: #e2e8f0;">⏭️ 부족한 이미지는 건너뛰기</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">추가 비용 없이 있는 이미지만 사용</div>
              </div>
            </label>
            <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background 0.2s; background: rgba(255,255,255,0.04);" onmouseover="this.style.background='rgba(99,102,241,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
              <input type="radio" name="local-folder-fallback" value="ai-generate" style="accent-color: #6366f1; width: 16px; height: 16px;">
              <div>
                <div style="font-size: 13px; font-weight: 600; color: #e2e8f0;">✨ 부족한 이미지는 AI 생성하기</div>
                <div style="font-size: 11px; color: #f59e0b; margin-top: 2px;">⚠️ AI 이미지 생성 비용이 발생할 수 있음</div>
              </div>
            </label>
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
          <label class="source-option" data-value="deepinfra" style="cursor: pointer; padding: 12px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #d1fae5, #6ee7b7); text-align: center; transition: all 0.2s;">
            <div style="font-size: 1.5rem;">🚀</div>
            <div style="font-size: 12px; font-weight: 600; color: #047857;">FLUX-2</div>
            <div style="font-size: 10px; color: #059669;">DeepInfra</div>
          </label>
          <label class="source-option" data-value="openai-image" style="cursor: pointer; padding: 12px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #ede9fe, #c4b5fd); text-align: center; transition: all 0.2s;">
            <div style="font-size: 1.5rem;">🎨</div>
            <div style="font-size: 12px; font-weight: 600; color: #5b21b6;">OpenAI DALL-E</div>
            <div style="font-size: 10px; color: #7c3aed;">API 키 필요</div>
          </label>
          <label class="source-option" data-value="leonardoai" style="cursor: pointer; padding: 12px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #ffedd5, #fdba74); text-align: center; transition: all 0.2s;">
            <div style="font-size: 1.5rem;">🦁</div>
            <div style="font-size: 12px; font-weight: 600; color: #9a3412;">Leonardo AI</div>
            <div style="font-size: 10px; color: #ea580c;">API 키 필요</div>
          </label>
          <label class="source-option" data-value="imagefx" style="cursor: pointer; padding: 12px; border-radius: 10px; border: 2px solid #10b981; background: linear-gradient(135deg, #d1fae5, #a7f3d0); text-align: center; transition: all 0.2s; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2); position: relative;">
            <div style="position: absolute; top: -6px; right: -6px; background: linear-gradient(135deg, #10b981, #059669); color: white; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 8px;">무료</div>
            <div style="font-size: 1.5rem;">✨</div>
            <div style="font-size: 12px; font-weight: 600; color: #047857;">ImageFX</div>
            <div style="font-size: 10px; color: #059669;">Google 무료 | 1000장/일</div>
          </label>
          <label class="source-option" data-value="local-folder" style="cursor: pointer; padding: 12px; border-radius: 10px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #e0e7ff, #c7d2fe); text-align: center; transition: all 0.2s; position: relative;">
            <div style="font-size: 1.5rem;">📂</div>
            <div style="font-size: 12px; font-weight: 600; color: #4338ca;">내 폴더</div>
            <div style="font-size: 10px; color: #6366f1;" id="local-folder-path-display">폴더 선택 필요</div>
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
              <!-- ✅ [2026-02-17] 4개 스타일로 축소 -->
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                <!-- 📷 실사 -->
                <label class="style-option" data-value="realistic" data-icon="📷" data-title="📷 실사 (Realistic)" data-desc="실제 사진처럼 보이는 고퀄리티 이미지입니다. 한국인 모델, 제품 사진, 음식 사진 등에 적합합니다. 8K 고해상도, DSLR 카메라 품질로 생성됩니다." data-keywords="RAW photo, hyperrealistic, Fujifilm XT3" data-usage="제품 리뷰, 음식 블로그, 인물 사진, 일상 기록" style="cursor: pointer; padding: 14px 12px; border-radius: 12px; border: 2px solid #16a34a; background: linear-gradient(135deg, #f0fdf4, #dcfce7); display: flex; flex-direction: column; align-items: center; gap: 6px; transition: all 0.2s; text-align: center; box-shadow: 0 2px 8px rgba(22, 163, 74, 0.15);">
                  <div class="style-card-thumb" data-style="realistic" style="width: 120px; height: 90px; border-radius: 12px; overflow: hidden; box-shadow: 0 3px 12px rgba(0,0,0,0.15); position: relative;">
                    <img class="style-preview-cached" data-style="realistic" style="width: 100%; height: 100%; object-fit: cover; display: none;" />
                    <svg class="style-preview-svg" viewBox="0 0 120 90" width="120" height="90" xmlns="http://www.w3.org/2000/svg">
                      <defs><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#87CEEB"/><stop offset="100%" stop-color="#E0F0FF"/></linearGradient></defs>
                      <rect width="120" height="90" fill="url(#rs)"/><circle cx="95" cy="18" r="12" fill="#FFD93D" opacity="0.9"/>
                      <path d="M0 50 Q30 35 60 45 Q90 30 120 42 L120 90 L0 90Z" fill="#5B8C5A" opacity="0.8"/>
                      <path d="M0 65 Q30 58 60 62 Q90 55 120 65 L120 90 L0 90Z" fill="#3A8BC2" opacity="0.5"/>
                      <text x="60" y="82" text-anchor="middle" font-size="9" fill="white" opacity="0.8" font-family="sans-serif">📷 8K Photo</text>
                    </svg>
                  </div>
                  <div style="font-size: 13px; font-weight: 700; color: #166534;">실사</div>
                  <div style="font-size: 10px; color: #6b7280;">Realistic</div>
                  <input type="radio" name="sub-image-style" value="realistic" checked style="accent-color: #16a34a; margin-top: 4px;">
                </label>
                <!-- 📜 빈티지 -->
                <label class="style-option" data-value="vintage" data-icon="📜" data-title="📜 빈티지 (Vintage)" data-desc="1950년대 레트로 포스터 스타일입니다. 바랜 색감, 클래식한 디자인이 특징입니다. 복고풍, 향수 어린 분위기에 적합합니다." data-keywords="vintage retro, 1950s poster art, muted colors" data-usage="레트로 감성, 복고풍 콘텐츠, 클래식 디자인" style="cursor: pointer; padding: 14px 12px; border-radius: 12px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #fef7ee, #fed7aa); display: flex; flex-direction: column; align-items: center; gap: 6px; transition: all 0.2s; text-align: center;">
                  <div class="style-card-thumb" data-style="vintage" style="width: 120px; height: 90px; border-radius: 12px; overflow: hidden; box-shadow: 0 3px 12px rgba(0,0,0,0.15); position: relative;">
                    <img class="style-preview-cached" data-style="vintage" style="width: 100%; height: 100%; object-fit: cover; display: none;" />
                    <svg class="style-preview-svg" viewBox="0 0 120 90" width="120" height="90" xmlns="http://www.w3.org/2000/svg">
                      <rect width="120" height="90" fill="#F5E6C8"/>
                      <rect x="10" y="8" width="100" height="55" rx="4" fill="#E8D5B0" stroke="#C4A56E" stroke-width="1.5"/>
                      <circle cx="45" cy="32" r="12" fill="#D4A76A" opacity="0.6"/><path d="M10 50 L45 25 L68 40 L110 18 L110 63 L10 63Z" fill="#B8860B" opacity="0.3"/>
                      <text x="60" y="80" text-anchor="middle" font-size="10" fill="#92400e" font-family="serif" opacity="0.7">RETRO 1950s</text>
                    </svg>
                  </div>
                  <div style="font-size: 13px; font-weight: 700; color: #92400e;">빈티지</div>
                  <div style="font-size: 10px; color: #6b7280;">Vintage</div>
                  <input type="radio" name="sub-image-style" value="vintage" style="accent-color: #16a34a; margin-top: 4px;">
                </label>
                <!-- 🤸 졸라맨 -->
                <label class="style-option" data-value="stickman" data-icon="🤸" data-title="🤸 졸라맨 (Stickman)" data-desc="둥근 흰 머리에 표정이 있는 귀여운 졸라맨 캐릭터입니다. 컬러풀한 옷과 배경, 디테일한 장면이 특징입니다. 유머러스하고 친근한 블로그에 적합합니다." data-keywords="chibi cartoon, oversized head, cel-shaded, bold outlines" data-usage="유머 블로그, 일상 에세이, 가벼운 콘텐츠" style="cursor: pointer; padding: 14px 12px; border-radius: 12px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #f8fafc, #e2e8f0); display: flex; flex-direction: column; align-items: center; gap: 6px; transition: all 0.2s; text-align: center;">
                  <div class="style-card-thumb" data-style="stickman" style="width: 120px; height: 90px; border-radius: 12px; overflow: hidden; box-shadow: 0 3px 12px rgba(0,0,0,0.15); position: relative;">
                    <img class="style-preview-cached" data-style="stickman" style="width: 100%; height: 100%; object-fit: cover; display: none;" />
                    <svg class="style-preview-svg" viewBox="0 0 120 90" width="120" height="90" xmlns="http://www.w3.org/2000/svg">
                      <rect width="120" height="90" fill="#FFF9C4"/>
                      <circle cx="60" cy="28" r="18" fill="white" stroke="#333" stroke-width="2.5"/>
                      <circle cx="54" cy="25" r="2" fill="#333"/><circle cx="66" cy="25" r="2" fill="#333"/>
                      <path d="M56 32 Q60 36 64 32" stroke="#333" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                      <rect x="55" y="46" width="10" height="18" rx="3" fill="#FF6B35"/>
                      <line x1="60" y1="52" x2="44" y2="62" stroke="#333" stroke-width="3" stroke-linecap="round"/>
                      <line x1="60" y1="52" x2="76" y2="58" stroke="#333" stroke-width="3" stroke-linecap="round"/>
                      <line x1="57" y1="64" x2="50" y2="82" stroke="#333" stroke-width="3" stroke-linecap="round"/>
                      <line x1="63" y1="64" x2="70" y2="82" stroke="#333" stroke-width="3" stroke-linecap="round"/>
                    </svg>
                  </div>
                  <div style="font-size: 13px; font-weight: 700; color: #374151;">졸라맨</div>
                  <div style="font-size: 10px; color: #6b7280;">Stickman</div>
                  <input type="radio" name="sub-image-style" value="stickman" style="accent-color: #16a34a; margin-top: 4px;">
                </label>
                <!-- 🫧 뚱글이 -->
                <label class="style-option" data-value="roundy" data-icon="🫧" data-title="🫧 뚱글이 (Roundy)" data-desc="둥글고 통통한 캐릭터가 등장하는 힐링 스타일입니다. 파스텔톤 색감, 부드러운 외곽선, 감성적인 분위기가 특징입니다. Molang/카카오프렌즈 느낌의 독보적인 캐릭터입니다." data-keywords="chubby round, pastel, soft, healing, Molang style" data-usage="감성 블로그, 힐링 콘텐츠, 라이프스타일, 일상 기록" style="cursor: pointer; padding: 14px 12px; border-radius: 12px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #fdf2f8, #fce7f3); display: flex; flex-direction: column; align-items: center; gap: 6px; transition: all 0.2s; text-align: center;">
                  <div class="style-card-thumb" data-style="roundy" style="width: 120px; height: 90px; border-radius: 12px; overflow: hidden; box-shadow: 0 3px 12px rgba(0,0,0,0.15); position: relative;">
                    <img class="style-preview-cached" data-style="roundy" style="width: 100%; height: 100%; object-fit: cover; display: none;" />
                    <svg class="style-preview-svg" viewBox="0 0 120 90" width="120" height="90" xmlns="http://www.w3.org/2000/svg">
                      <rect width="120" height="90" fill="#FFF0F5"/>
                      <ellipse cx="60" cy="48" rx="26" ry="24" fill="white" stroke="#F9A8D4" stroke-width="2"/>
                      <circle cx="52" cy="42" r="3" fill="#333"/><circle cx="68" cy="42" r="3" fill="#333"/>
                      <ellipse cx="44" cy="48" rx="5" ry="3" fill="#FCA5A5" opacity="0.4"/>
                      <ellipse cx="76" cy="48" rx="5" ry="3" fill="#FCA5A5" opacity="0.4"/>
                      <path d="M55 53 Q60 58 65 53" stroke="#333" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                      <ellipse cx="38" cy="62" rx="6" ry="4" fill="white" stroke="#F9A8D4" stroke-width="1.5"/>
                      <ellipse cx="82" cy="62" rx="6" ry="4" fill="white" stroke="#F9A8D4" stroke-width="1.5"/>
                      <text x="18" y="22" font-size="14" opacity="0.5">💕</text>
                      <text x="88" y="18" font-size="12" opacity="0.4">✨</text>
                    </svg>
                  </div>
                  <div style="font-size: 13px; font-weight: 700; color: #be185d;">뚱글이</div>
                  <div style="font-size: 10px; color: #6b7280;">Roundy</div>
                  <input type="radio" name="sub-image-style" value="roundy" style="accent-color: #16a34a; margin-top: 4px;">
                </label>
                <!-- 🎨 한국웹툰 -->
                <label class="style-option" data-value="2d" data-icon="🎨" data-title="🎨 한국웹툰 (Korean Webtoon)" data-desc="한국 웹툰/만화 스타일의 2D 일러스트입니다. 깔끔한 선화, 선명한 플랫 컬러, 귀엽고 표현력 있는 캐릭터 디자인이 특징입니다. 트렌디한 블로그에 적합합니다." data-keywords="Korean webtoon, manhwa, flat colors, clean line art" data-usage="트렌디 블로그, 웹툰 스타일, 캐릭터 콘텐츠" style="cursor: pointer; padding: 14px 12px; border-radius: 12px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #fdf4ff, #e9d5ff); display: flex; flex-direction: column; align-items: center; gap: 6px; transition: all 0.2s; text-align: center;">
                  <div class="style-card-thumb" data-style="2d" style="width: 120px; height: 90px; border-radius: 12px; overflow: hidden; box-shadow: 0 3px 12px rgba(0,0,0,0.15); position: relative;">
                    <img class="style-preview-cached" data-style="2d" style="width: 100%; height: 100%; object-fit: cover; display: none;" />
                    <svg class="style-preview-svg" viewBox="0 0 120 90" width="120" height="90" xmlns="http://www.w3.org/2000/svg">
                      <rect width="120" height="90" fill="#F5EEFF"/>
                      <circle cx="60" cy="32" r="18" fill="#FEF3C7"/>
                      <path d="M44 25 Q47 14 60 16 Q73 14 76 25" fill="#374151"/>
                      <ellipse cx="54" cy="33" rx="4.5" ry="5" fill="white"/><ellipse cx="66" cy="33" rx="4.5" ry="5" fill="white"/>
                      <circle cx="54.5" cy="34" r="2.5" fill="#7C3AED"/><circle cx="66.5" cy="34" r="2.5" fill="#7C3AED"/>
                      <circle cx="55.5" cy="32" r="0.8" fill="white"/><circle cx="67.5" cy="32" r="0.8" fill="white"/>
                      <path d="M57 40 Q60 43 63 40" stroke="#EC4899" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                      <ellipse cx="47" cy="37" rx="3.5" ry="2" fill="#FCA5A5" opacity="0.35"/>
                      <ellipse cx="73" cy="37" rx="3.5" ry="2" fill="#FCA5A5" opacity="0.35"/>
                      <rect x="52" y="50" width="16" height="22" rx="3" fill="#A78BFA"/>
                      <rect x="44" y="54" width="8" height="12" rx="2" fill="#FEF3C7"/>
                      <rect x="68" y="54" width="8" height="12" rx="2" fill="#FEF3C7"/>
                    </svg>
                  </div>
                  <div style="font-size: 13px; font-weight: 700; color: #7c3aed;">한국웹툰</div>
                  <div style="font-size: 10px; color: #6b7280;">Korean Webtoon</div>
                  <input type="radio" name="sub-image-style" value="2d" style="accent-color: #16a34a; margin-top: 4px;">
                </label>
                <!-- 🏰 디즈니 -->
                <label class="style-option" data-value="disney" data-icon="🏰" data-title="🏰 디즈니 (Disney Pixar)" data-desc="디즈니/픽사 3D 애니메이션 스타일입니다. 부드러운 조명, 생동감 넘치는 색감, 귀여운 3D 캐릭터가 특징입니다. 동화 같은 판타지 분위기의 블로그에 적합합니다." data-keywords="Disney Pixar 3D, animated movie, soft diffused lighting" data-usage="판타지 블로그, 동화 콘텐츠, 감성 블로그, 키즈 콘텐츠" style="cursor: pointer; padding: 14px 12px; border-radius: 12px; border: 2px solid #e5e7eb; background: linear-gradient(135deg, #eff6ff, #dbeafe); display: flex; flex-direction: column; align-items: center; gap: 6px; transition: all 0.2s; text-align: center;">
                  <div class="style-card-thumb" data-style="disney" style="width: 120px; height: 90px; border-radius: 12px; overflow: hidden; box-shadow: 0 3px 12px rgba(0,0,0,0.15); position: relative;">
                    <img class="style-preview-cached" data-style="disney" style="width: 100%; height: 100%; object-fit: cover; display: none;" />
                    <svg class="style-preview-svg" viewBox="0 0 120 90" width="120" height="90" xmlns="http://www.w3.org/2000/svg">
                      <rect width="120" height="90" fill="#EBF5FF"/>
                      <path d="M42 82 L50 52 Q60 38 70 52 L78 82" fill="#60A5FA" opacity="0.4"/>
                      <circle cx="60" cy="32" r="20" fill="#FDE68A" stroke="#F59E0B" stroke-width="1.5"/>
                      <circle cx="52" cy="28" r="5" fill="white"/><circle cx="68" cy="28" r="5" fill="white"/>
                      <circle cx="53" cy="29" r="3" fill="#3B82F6"/><circle cx="69" cy="29" r="3" fill="#3B82F6"/>
                      <circle cx="54" cy="27.5" r="1" fill="white"/><circle cx="70" cy="27.5" r="1" fill="white"/>
                      <path d="M55 39 Q60 43 65 39" stroke="#EC4899" stroke-width="2" fill="none" stroke-linecap="round"/>
                      <text x="15" y="20" font-size="14" opacity="0.6">✨</text>
                      <text x="92" y="18" font-size="12" opacity="0.5">⭐</text>
                    </svg>
                  </div>
                  <div style="font-size: 13px; font-weight: 700; color: #2563eb;">디즈니</div>
                  <div style="font-size: 10px; color: #6b7280;">Disney Pixar</div>
                  <input type="radio" name="sub-image-style" value="disney" style="accent-color: #16a34a; margin-top: 4px;">
                </label>
              </div>
            </div>
            
            <!-- ✅ [2026-02-19] 2D 서브스타일 선택 (2D 스타일 선택 시에만 표시) -->
            <div id="webtoon-substyle-section" style="display: none; margin-bottom: 16px; padding: 14px; border-radius: 12px; background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 2px solid #60a5fa;">
              <h5 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600; color: #2563eb;">🎨 2D 스타일 선택</h5>
              <div style="display: flex; gap: 10px;">
                <label data-substyle="webtoon_illust" style="flex: 1; cursor: pointer; padding: 10px; border-radius: 10px; border: 2px solid #2563eb; background: white; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.15);">
                  <input type="radio" name="webtoon-substyle" value="webtoon_illust" checked style="display: none;">
                  <span style="font-size: 22px;">🖌️</span>
                  <span style="font-size: 11px; font-weight: 700; color: #1e40af; text-align: center;">웹툰<br>일러스트</span>
                  <span style="font-size: 9px; color: #6b7280; text-align: center;">기본 · 깔끔</span>
                </label>
                <label data-substyle="chibi" style="flex: 1; cursor: pointer; padding: 10px; border-radius: 10px; border: 2px solid #e5e7eb; background: white; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s;">
                  <input type="radio" name="webtoon-substyle" value="chibi" style="display: none;">
                  <span style="font-size: 22px;">🎀</span>
                  <span style="font-size: 11px; font-weight: 700; color: #374151; text-align: center;">치비</span>
                  <span style="font-size: 9px; color: #6b7280; text-align: center;">SD캐릭터</span>
                </label>
                <label data-substyle="flat" style="flex: 1; cursor: pointer; padding: 10px; border-radius: 10px; border: 2px solid #e5e7eb; background: white; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s;">
                  <input type="radio" name="webtoon-substyle" value="flat" style="display: none;">
                  <span style="font-size: 22px;">📐</span>
                  <span style="font-size: 11px; font-weight: 700; color: #374151; text-align: center;">플랫 벡터</span>
                  <span style="font-size: 9px; color: #6b7280; text-align: center;">텍스트 제로</span>
                </label>
              </div>
            </div>
            
            <!-- ✅ [2026-02-18] 웹툰 성별 선택 (2D 스타일 선택 시에만 표시) -->
            <div id="webtoon-gender-section" style="display: none; margin-bottom: 16px; padding: 14px; border-radius: 12px; background: linear-gradient(135deg, #faf5ff, #f3e8ff); border: 2px solid #c084fc;">
              <h5 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600; color: #7c3aed;">🎭 웹툰 캐릭터 성별</h5>
              <div style="display: flex; gap: 10px;">
                <label style="flex: 1; cursor: pointer; padding: 10px; border-radius: 10px; border: 2px solid #7c3aed; background: white; display: flex; align-items: center; gap: 8px; transition: all 0.2s; box-shadow: 0 2px 6px rgba(124, 58, 237, 0.15);">
                  <input type="radio" name="webtoon-gender" value="male" checked style="accent-color: #7c3aed;">
                  <span style="font-size: 18px;">👨</span>
                  <span style="font-size: 12px; font-weight: 600; color: #5b21b6;">남성</span>
                </label>
                <label style="flex: 1; cursor: pointer; padding: 10px; border-radius: 10px; border: 2px solid #e5e7eb; background: white; display: flex; align-items: center; gap: 8px; transition: all 0.2s;">
                  <input type="radio" name="webtoon-gender" value="female" style="accent-color: #7c3aed;">
                  <span style="font-size: 18px;">👩</span>
                  <span style="font-size: 12px; font-weight: 600; color: #374151;">여성</span>
                </label>
                <label style="flex: 1; cursor: pointer; padding: 10px; border-radius: 10px; border: 2px solid #e5e7eb; background: white; display: flex; align-items: center; gap: 8px; transition: all 0.2s;">
                  <input type="radio" name="webtoon-gender" value="neutral" style="accent-color: #7c3aed;">
                  <span style="font-size: 18px;">🫨</span>
                  <span style="font-size: 12px; font-weight: 600; color: #374151;">중성</span>
                </label>
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
                <option value="openai-image">🎨 OpenAI DALL-E</option>
                <option value="leonardoai">🦁 Leonardo AI</option>
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
            
            <!-- 아이콘 & 타이틀 + 스타일 미리보기 이미지 -->
            <div style="text-align: center; margin-bottom: 16px;">
              <div id="style-preview-image" style="width: 100%; aspect-ratio: 4/3; border-radius: 14px; overflow: hidden; margin-bottom: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.10); background: #f0fdf4; display: flex; align-items: center; justify-content: center;">
                <svg viewBox="0 0 400 300" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                  <!-- 실사 스타일: 카메라 + 풍경 사진 -->
                  <defs>
                    <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#87CEEB"/><stop offset="100%" stop-color="#E0F0FF"/></linearGradient>
                    <linearGradient id="mountain-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5B8C5A"/><stop offset="100%" stop-color="#2D5A27"/></linearGradient>
                    <linearGradient id="lake-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6BB5E0"/><stop offset="100%" stop-color="#3A8BC2"/></linearGradient>
                  </defs>
                  <rect width="400" height="300" fill="url(#sky-grad)"/>
                  <circle cx="320" cy="60" r="35" fill="#FFD93D" opacity="0.9"/>
                  <circle cx="80" cy="50" rx="40" ry="20" fill="white" opacity="0.7"/><circle cx="110" cy="45" rx="30" ry="18" fill="white" opacity="0.6"/>
                  <path d="M0 180 Q50 120 100 160 Q150 110 200 140 Q250 100 300 150 Q350 120 400 160 L400 300 L0 300Z" fill="url(#mountain-grad)" opacity="0.8"/>
                  <path d="M0 220 Q100 200 200 215 Q300 200 400 225 L400 300 L0 300Z" fill="url(#lake-grad)" opacity="0.6"/>
                  <path d="M150 200 L155 170 L165 185 L170 160 L180 190 L185 175 L190 200Z" fill="#2D5A27" opacity="0.9"/>
                  <path d="M210 210 L215 180 L225 195 L230 165 L240 195 L245 180 L250 210Z" fill="#3A6B35" opacity="0.8"/>
                  <text x="200" y="275" text-anchor="middle" font-size="14" fill="white" opacity="0.9" font-family="sans-serif" font-weight="600">📷 8K Hyperrealistic Photo</text>
                </svg>
              </div>
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

    // ✅ [2026-03-23] 내 폴더 부족 이미지 처리 옵션 저장
    const localFolderFallbackRadio = document.querySelector('input[name="local-folder-fallback"]:checked') as HTMLInputElement;
    if (localFolderFallbackRadio) {
      localStorage.setItem('localFolderFallback', localFolderFallbackRadio.value);
      console.log(`[HeadingImageSettings] 📂 내 폴더 부족 이미지 처리: ${localFolderFallbackRadio.value}`);
    }

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
  document.getElementById('image-source-confirm')?.addEventListener('click', async () => {
    // ✅ [2026-03-22] local-folder 선택 시 폴더 선택 다이얼로그
    if (selectedSourceValue === 'local-folder') {
      try {
        const result = await (window as any).api.selectFolder();
        if (result && result.filePaths && result.filePaths.length > 0) {
          const folderPath = result.filePaths[0];
          localStorage.setItem('localFolderPath', folderPath);
          console.log(`[HeadingImageSettings] 📂 로컬 폴더 선택: ${folderPath}`);
          // 카드에 폴더 경로 표시
          const pathDisplay = document.getElementById('local-folder-path-display');
          if (pathDisplay) {
            const shortPath = folderPath.length > 20 ? '...' + folderPath.slice(-20) : folderPath;
            pathDisplay.textContent = shortPath;
          }
        } else {
          // 폴더 선택 취소 → 이전 소스로 복원
          console.log('[HeadingImageSettings] 폴더 선택 취소');
          if ((window as any).toastManager) {
            (window as any).toastManager.warning('📂 폴더를 선택하지 않으면 AI 이미지가 사용됩니다.');
          }
          return; // 모달 닫지 않음
        }
      } catch (e) {
        console.error('[HeadingImageSettings] 폴더 선택 실패:', e);
        return;
      }
    }
    setGlobalImageSource(selectedSourceValue);
    // 메인 모달 표시 업데이트
    const display = document.getElementById('current-image-source-display');
    if (display) {
      if (selectedSourceValue === 'local-folder') {
        const savedPath = localStorage.getItem('localFolderPath') || '';
        const folderName = savedPath.split(/[/\\]/).filter(Boolean).pop() || '';
        display.textContent = folderName ? `📂 ${folderName}` : '📂 내 폴더';
      } else {
        display.textContent = SOURCE_NAMES[selectedSourceValue];
      }
    }
    const subModal = document.getElementById('image-source-submodal');
    if (subModal) subModal.style.display = 'none';

    // ✅ [2026-03-23] local-folder 선택 시 부족 이미지 옵션 표시/숨김
    const fallbackSection = document.getElementById('local-folder-fallback-options');
    if (fallbackSection) {
      fallbackSection.style.display = selectedSourceValue === 'local-folder' ? 'block' : 'none';
      // 저장된 값 복원
      if (selectedSourceValue === 'local-folder') {
        const savedFallback = localStorage.getItem('localFolderFallback') || 'skip';
        const radio = document.querySelector(`input[name="local-folder-fallback"][value="${savedFallback}"]`) as HTMLInputElement;
        if (radio) radio.checked = true;
      }
    }
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

      // ✅ [2026-02-18] 2D 스타일이면 성별 섹션 표시 + 저장된 성별 복원
      const genderSection = document.getElementById('webtoon-gender-section');
      if (genderSection) {
        genderSection.style.display = currentStyle === '2d' ? 'block' : 'none';
      }
      // ✅ [2026-02-19] 2D 스타일이면 서브스타일 섹션 표시 + 저장된 서브스타일 복원
      const substyleSection = document.getElementById('webtoon-substyle-section');
      if (substyleSection) {
        substyleSection.style.display = currentStyle === '2d' ? 'block' : 'none';
      }
      if (currentStyle === '2d') {
        // 서브스타일 복원
        const savedSubStyle = getWebtoonSubStyle();
        const substyleRadio = document.querySelector(`input[name="webtoon-substyle"][value="${savedSubStyle}"]`) as HTMLInputElement;
        if (substyleRadio) {
          substyleRadio.checked = true;
          document.querySelectorAll('input[name="webtoon-substyle"]').forEach(r => {
            const label = (r as HTMLElement).closest('label') as HTMLElement;
            if (label) {
              if ((r as HTMLInputElement).checked) {
                label.style.borderColor = '#2563eb';
                label.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.15)';
                const nameSpan = label.querySelectorAll('span')[1] as HTMLElement;
                if (nameSpan) nameSpan.style.color = '#1e40af';
              } else {
                label.style.borderColor = '#e5e7eb';
                label.style.boxShadow = 'none';
                const nameSpan = label.querySelectorAll('span')[1] as HTMLElement;
                if (nameSpan) nameSpan.style.color = '#374151';
              }
            }
          });
        }
        // 성별 복원
        const savedGender = getWebtoonGender();
        const genderRadio = document.querySelector(`input[name="webtoon-gender"][value="${savedGender}"]`) as HTMLInputElement;
        if (genderRadio) {
          genderRadio.checked = true;
          // 선택된 라벨 스타일 업데이트
          document.querySelectorAll('input[name="webtoon-gender"]').forEach(r => {
            const label = (r as HTMLElement).closest('label') as HTMLElement;
            if (label) {
              if ((r as HTMLInputElement).checked) {
                label.style.borderColor = '#7c3aed';
                label.style.boxShadow = '0 2px 6px rgba(124, 58, 237, 0.15)';
                const nameSpan = label.querySelector('span:last-child') as HTMLElement;
                if (nameSpan) nameSpan.style.color = '#5b21b6';
              } else {
                label.style.borderColor = '#e5e7eb';
                label.style.boxShadow = 'none';
                const nameSpan = label.querySelector('span:last-child') as HTMLElement;
                if (nameSpan) nameSpan.style.color = '#374151';
              }
            }
          });
        }
      }
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
      const title = opt.getAttribute('data-title') || '스타일';
      const desc = opt.getAttribute('data-desc') || '스타일 설명';
      const keywords = opt.getAttribute('data-keywords') || '';

      const previewImage = document.getElementById('style-preview-image');
      const previewTitle = document.getElementById('style-preview-title');
      const previewDesc = document.getElementById('style-preview-desc');
      const previewKeywords = document.getElementById('style-preview-keywords');
      const previewUsage = document.getElementById('style-preview-usage');

      // ✅ [2026-02-18] 스타일별 미리보기 SVG 일러스트레이션 교체
      const previewSvgMap: Record<string, string> = {
        'realistic': `<svg viewBox="0 0 400 300" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#87CEEB"/><stop offset="100%" stop-color="#E0F0FF"/></linearGradient>
          <linearGradient id="mountain-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5B8C5A"/><stop offset="100%" stop-color="#2D5A27"/></linearGradient>
          <linearGradient id="lake-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6BB5E0"/><stop offset="100%" stop-color="#3A8BC2"/></linearGradient></defs>
          <rect width="400" height="300" fill="url(#sky-grad)"/><circle cx="320" cy="60" r="35" fill="#FFD93D" opacity="0.9"/>
          <circle cx="80" cy="50" rx="40" ry="20" fill="white" opacity="0.7"/><circle cx="110" cy="45" rx="30" ry="18" fill="white" opacity="0.6"/>
          <path d="M0 180 Q50 120 100 160 Q150 110 200 140 Q250 100 300 150 Q350 120 400 160 L400 300 L0 300Z" fill="url(#mountain-grad)" opacity="0.8"/>
          <path d="M0 220 Q100 200 200 215 Q300 200 400 225 L400 300 L0 300Z" fill="url(#lake-grad)" opacity="0.6"/>
          <path d="M150 200 L155 170 L165 185 L170 160 L180 190 L185 175 L190 200Z" fill="#2D5A27" opacity="0.9"/>
          <path d="M210 210 L215 180 L225 195 L230 165 L240 195 L245 180 L250 210Z" fill="#3A6B35" opacity="0.8"/>
          <text x="200" y="275" text-anchor="middle" font-size="14" fill="white" opacity="0.9" font-family="sans-serif" font-weight="600">📷 8K Hyperrealistic Photo</text></svg>`,
        'vintage': `<svg viewBox="0 0 400 300" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#F5E6C8"/>
          <rect x="30" y="20" width="340" height="210" rx="8" fill="#E8D5B0" stroke="#C4A56E" stroke-width="3"/>
          <circle cx="150" cy="110" r="45" fill="#D4A76A" opacity="0.6"/>
          <path d="M30 180 L150 90 L230 140 L370 60 L370 230 L30 230Z" fill="#B8860B" opacity="0.3"/>
          <rect x="30" y="240" width="150" height="8" rx="4" fill="#92400e" opacity="0.35"/>
          <rect x="30" y="255" width="100" height="6" rx="3" fill="#92400e" opacity="0.25"/>
          <circle cx="350" cy="30" r="20" fill="#fbbf24" opacity="0.25"/>
          <text x="200" y="280" text-anchor="middle" font-size="16" fill="#92400e" font-family="serif" font-weight="600" opacity="0.8">📜 Retro Vintage 1950s Style</text></svg>`,
        'stickman': `<svg viewBox="0 0 400 300" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#FFF9C4"/>
          <rect x="20" y="200" width="360" height="80" rx="10" fill="#A5D6A7" opacity="0.5"/>
          <circle cx="100" cy="220" r="15" fill="#81C784" opacity="0.6"/><circle cx="300" cy="210" r="20" fill="#81C784" opacity="0.5"/>
          <circle cx="200" cy="85" r="55" fill="white" stroke="#333" stroke-width="5"/>
          <circle cx="182" cy="75" r="6" fill="#333"/><circle cx="218" cy="75" r="6" fill="#333"/>
          <path d="M185 100 Q200 115 215 100" stroke="#333" stroke-width="4" fill="none" stroke-linecap="round"/>
          <rect x="188" y="140" width="24" height="50" rx="8" fill="#FF6B35"/>
          <line x1="200" y1="160" x2="155" y2="190" stroke="#333" stroke-width="8" stroke-linecap="round"/>
          <line x1="200" y1="160" x2="250" y2="175" stroke="#333" stroke-width="8" stroke-linecap="round"/>
          <line x1="192" y1="190" x2="170" y2="260" stroke="#333" stroke-width="8" stroke-linecap="round"/>
          <line x1="208" y1="190" x2="230" y2="260" stroke="#333" stroke-width="8" stroke-linecap="round"/>
          <text x="200" y="285" text-anchor="middle" font-size="14" fill="#374151" font-family="sans-serif" font-weight="600">🤸 졸라맨 Doodle Comic Style</text></svg>`,
        'roundy': `<svg viewBox="0 0 400 300" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFF0F5"/><stop offset="100%" stop-color="#FFE4F0"/></linearGradient></defs>
          <rect width="400" height="300" fill="url(#rg)"/>
          <text x="80" y="50" font-size="24" opacity="0.4">💕</text><text x="300" y="70" font-size="18" opacity="0.3">✨</text>
          <text x="50" y="250" font-size="20" opacity="0.3">🌸</text><text x="330" y="230" font-size="16" opacity="0.35">💖</text>
          <ellipse cx="200" cy="145" rx="85" ry="75" fill="white" stroke="#F9A8D4" stroke-width="3"/>
          <circle cx="175" cy="125" r="8" fill="#333"/><circle cx="225" cy="125" r="8" fill="#333"/>
          <ellipse cx="155" cy="145" rx="14" ry="10" fill="#FCA5A5" opacity="0.4"/>
          <ellipse cx="245" cy="145" rx="14" ry="10" fill="#FCA5A5" opacity="0.4"/>
          <path d="M185 160 Q200 175 215 160" stroke="#333" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <ellipse cx="130" cy="195" rx="18" ry="14" fill="white" stroke="#F9A8D4" stroke-width="2"/>
          <ellipse cx="270" cy="195" rx="18" ry="14" fill="white" stroke="#F9A8D4" stroke-width="2"/>
          <ellipse cx="175" cy="225" rx="15" ry="12" fill="white" stroke="#F9A8D4" stroke-width="2"/>
          <ellipse cx="225" cy="225" rx="15" ry="12" fill="white" stroke="#F9A8D4" stroke-width="2"/>
          <text x="200" y="280" text-anchor="middle" font-size="14" fill="#be185d" font-family="sans-serif" font-weight="600">🫧 Molang-style Healing Character</text></svg>`,
        '2d': `<svg viewBox="0 0 400 300" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#F5EEFF"/>
          <circle cx="150" cy="50" r="15" fill="#E9D5FF" opacity="0.5"/><circle cx="300" cy="40" r="10" fill="#DDD6FE" opacity="0.4"/>
          <circle cx="200" cy="100" r="55" fill="#FEF3C7"/>
          <path d="M150 80 Q160 40 200 50 Q240 40 250 80" fill="#374151"/>
          <ellipse cx="180" cy="100" rx="14" ry="16" fill="white"/><ellipse cx="220" cy="100" rx="14" ry="16" fill="white"/>
          <circle cx="182" cy="102" r="8" fill="#7C3AED"/><circle cx="222" cy="102" r="8" fill="#7C3AED"/>
          <circle cx="185" cy="96" r="3" fill="white"/><circle cx="225" cy="96" r="3" fill="white"/>
          <path d="M192 120 Q200 130 208 120" stroke="#EC4899" stroke-width="3" fill="none" stroke-linecap="round"/>
          <ellipse cx="160" cy="112" rx="10" ry="7" fill="#FCA5A5" opacity="0.35"/>
          <ellipse cx="240" cy="112" rx="10" ry="7" fill="#FCA5A5" opacity="0.35"/>
          <rect x="175" y="155" width="50" height="60" rx="6" fill="#A78BFA"/>
          <rect x="157" y="165" width="22" height="35" rx="5" fill="#FEF3C7"/>
          <rect x="222" y="165" width="22" height="35" rx="5" fill="#FEF3C7"/>
          <rect x="180" y="215" width="16" height="35" rx="5" fill="#FEF3C7"/>
          <rect x="205" y="215" width="16" height="35" rx="5" fill="#FEF3C7"/>
          <text x="200" y="280" text-anchor="middle" font-size="14" fill="#7c3aed" font-family="sans-serif" font-weight="600">🎨 Korean Webtoon 2D Style</text></svg>`
      };
      if (previewImage) {
        // ✅ 캐시된 AI 미리보기 이미지가 있으면 사용, 없으면 SVG 표시
        const cachedImg = document.querySelector(`.style-preview-cached[data-style="${value}"]`) as HTMLImageElement;
        if (cachedImg && cachedImg.src && cachedImg.style.display !== 'none') {
          previewImage.innerHTML = `<img src="${cachedImg.src}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 14px;" />`;
        } else {
          previewImage.innerHTML = previewSvgMap[value] || previewSvgMap['realistic'];
        }
      }
      if (previewTitle) previewTitle.textContent = title;
      if (previewDesc) previewDesc.textContent = desc;
      if (previewKeywords) previewKeywords.textContent = keywords;

      // 스타일별 추천 용도
      const usageMap: Record<string, string> = {
        'realistic': '제품 리뷰, 음식 블로그, 인물 사진, 일상 기록',
        'vintage': '카페/맛집, 패션, 레트로 제품, 복고풍 컨텐츠',
        'stickman': '유머, 일상 꿀팁, 가벼운 정보, 재미있는 콘텐츠',
        'roundy': '힐링, 감성 일상, 귀여운 캐릭터, 아기자기한 블로그',
        '2d': '웹툰 스타일, 일러스트, 감성 블로그, 한국 스타일 일러스트'
      };
      if (previewUsage) previewUsage.textContent = usageMap[value] || '다양한 블로그 콘텐츠';

      // ✅ [2026-02-18] 2D 스타일 선택 시 성별 섹션 표시/숨김
      const genderSection = document.getElementById('webtoon-gender-section');
      if (genderSection) {
        genderSection.style.display = value === '2d' ? 'block' : 'none';
      }
      // ✅ [2026-02-19] 2D 스타일 선택 시 서브스타일 섹션 표시/숨김
      const substyleSection = document.getElementById('webtoon-substyle-section');
      if (substyleSection) {
        substyleSection.style.display = value === '2d' ? 'block' : 'none';
      }
    });
  });

  // ✅ [2026-02-23] 스타일 예시이미지 자동 생성 + 캐시 로드 시스템
  // 모달 열릴 때 캐시된 이미지 로드 → 없는 스타일은 generateStylePreview IPC로 자동 생성

  const ALL_STYLES = ['realistic', 'vintage', 'stickman', 'roundy', '2d', 'disney'];

  // 카드에 로딩 오버레이 표시/숨기기
  function showCardLoading(style: string, show: boolean) {
    const thumb = document.querySelector(`.style-card-thumb[data-style="${style}"]`) as HTMLElement;
    if (!thumb) return;

    let overlay = thumb.querySelector('.style-loading-overlay') as HTMLElement;
    if (show) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'style-loading-overlay';
        overlay.style.cssText = 'position: absolute; inset: 0; background: rgba(255,255,255,0.85); display: flex; align-items: center; justify-content: center; border-radius: 12px; z-index: 2;';
        overlay.innerHTML = '<div style="text-align: center;"><div style="width: 24px; height: 24px; border: 3px solid #e5e7eb; border-top-color: #16a34a; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto;"></div><div style="font-size: 9px; color: #6b7280; margin-top: 4px;">생성중...</div></div>';
        thumb.appendChild(overlay);

        // 스핀 애니메이션 추가 (한 번만)
        if (!document.getElementById('style-spin-keyframes')) {
          const styleEl = document.createElement('style');
          styleEl.id = 'style-spin-keyframes';
          styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
          document.head.appendChild(styleEl);
        }
      }
    } else {
      if (overlay) overlay.remove();
    }
  }

  // 카드에 생성된 이미지 표시
  function applyStyleImage(style: string, filePath: string) {
    const cachedImg = document.querySelector(`.style-preview-cached[data-style="${style}"]`) as HTMLImageElement;
    const svgEl = document.querySelector(`.style-card-thumb[data-style="${style}"] .style-preview-svg`) as HTMLElement;

    if (cachedImg && filePath) {
      cachedImg.src = `file:///${(filePath as string).replace(/\\/g, '/').replace(/^\/+/, '')}?t=${Date.now()}`;
      cachedImg.style.display = 'block';
      if (svgEl) svgEl.style.display = 'none';
    }

    // 현재 선택된 스타일이면 우측 큰 미리보기도 업데이트
    if (style === selectedStyleValue) {
      const previewImage = document.getElementById('style-preview-image');
      if (previewImage) {
        previewImage.innerHTML = `<img src="file:///${(filePath as string).replace(/\\/g, '/').replace(/^\/+/, '')}?t=${Date.now()}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 14px;" />`;
      }
    }

    showCardLoading(style, false);
  }

  // 캐시 로드 + 없는 스타일 자동 생성
  (async () => {
    try {
      // 1단계: 기존 캐시 로드
      let cachedStyles: Record<string, string> = {};
      try {
        const result = await (window as any).api.getStylePreviewCache();
        if (result?.success && result.cache && typeof result.cache === 'object') {
          cachedStyles = result.cache as Record<string, string>;
          Object.entries(cachedStyles).forEach(([style, filePath]) => {
            applyStyleImage(style, filePath as string);
          });
        }
      } catch (err) {
        console.log('[StylePreview] 캐시 로드 실패 (무시):', err);
      }

      // 2단계: 캐시에 없는 스타일 자동 생성
      const missingStyles = ALL_STYLES.filter(s => !cachedStyles[s]);

      if (missingStyles.length > 0) {
        console.log(`[StylePreview] 📸 ${missingStyles.length}개 스타일 예시이미지 자동 생성 시작:`, missingStyles);

        for (const style of missingStyles) {
          try {
            showCardLoading(style, true);

            const result = await (window as any).api?.generateStylePreview({
              style: style,
            });

            if (result?.success && result?.path) {
              console.log(`[StylePreview] ✅ ${style} 예시이미지 생성 완료:`, result.path);
              applyStyleImage(style, result.path);
            } else {
              console.warn(`[StylePreview] ⚠️ ${style} 생성 실패:`, result?.error);
              showCardLoading(style, false);
            }
          } catch (err) {
            console.warn(`[StylePreview] ⚠️ ${style} 예시이미지 생성 오류:`, err);
            showCardLoading(style, false);
          }
        }

        console.log('[StylePreview] 🎉 모든 스타일 예시이미지 생성 완료');
      }
    } catch (err) {
      console.log('[StylePreview] 예시이미지 시스템 오류 (무시):', err);
    }
  })();

  // ✅ [2026-02-18] 웹툰 성별 라디오 버튼 이벤트
  const genderRadios = document.querySelectorAll('input[name="webtoon-gender"]');
  genderRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const gender = target.value as WebtoonGenderType;
      setWebtoonGender(gender);

      // 선택된 라벨 스타일 업데이트
      genderRadios.forEach(r => {
        const label = (r as HTMLElement).closest('label') as HTMLElement;
        if (label) {
          if ((r as HTMLInputElement).checked) {
            label.style.borderColor = '#7c3aed';
            label.style.boxShadow = '0 2px 6px rgba(124, 58, 237, 0.15)';
            const nameSpan = label.querySelector('span:last-child') as HTMLElement;
            if (nameSpan) nameSpan.style.color = '#5b21b6';
          } else {
            label.style.borderColor = '#e5e7eb';
            label.style.boxShadow = 'none';
            const nameSpan = label.querySelector('span:last-child') as HTMLElement;
            if (nameSpan) nameSpan.style.color = '#374151';
          }
        }
      });

      // 미리보기 텍스트 업데이트 (성별 표시)
      const genderLabel: Record<string, string> = { 'male': '남성', 'female': '여성', 'neutral': '중성' };
      const previewTitle = document.getElementById('style-preview-title');
      if (previewTitle) {
        previewTitle.textContent = `🎨 2D 일러스트 (${genderLabel[gender] || '남성'})`;
      }
    });
  });

  // ✅ [2026-02-19] 웹툰 서브스타일 라디오 버튼 이벤트
  const substyleRadios = document.querySelectorAll('input[name="webtoon-substyle"]');
  substyleRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const subStyle = target.value as WebtoonSubStyleType;
      setWebtoonSubStyle(subStyle);

      // 선택된 라벨 스타일 업데이트
      substyleRadios.forEach(r => {
        const label = (r as HTMLElement).closest('label') as HTMLElement;
        if (label) {
          if ((r as HTMLInputElement).checked) {
            label.style.borderColor = '#2563eb';
            label.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.15)';
            const nameSpan = label.querySelectorAll('span')[1] as HTMLElement;
            if (nameSpan) nameSpan.style.color = '#1e40af';
          } else {
            label.style.borderColor = '#e5e7eb';
            label.style.boxShadow = 'none';
            const nameSpan = label.querySelectorAll('span')[1] as HTMLElement;
            if (nameSpan) nameSpan.style.color = '#374151';
          }
        }
      });

      // 미리보기 타이틀 업데이트
      const substyleLabel: Record<string, string> = { 'webtoon_illust': '웹툰 일러스트', 'chibi': '치비', 'flat': '플랫 벡터' };
      const previewTitle = document.getElementById('style-preview-title');
      if (previewTitle) {
        const genderLabel: Record<string, string> = { 'male': '남성', 'female': '여성', 'neutral': '중성' };
        const currentGender = getWebtoonGender();
        previewTitle.textContent = `🎨 2D ${substyleLabel[subStyle] || '웹툰 일러스트'} (${genderLabel[currentGender] || '남성'})`;
      }
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
            <img src="file:///${result.path.replace(/\\/g, '/').replace(/^\/+/, '')}" 
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
    if (display) {
      // ✅ [2026-02-18] 2D 스타일이면 성별 정보 포함
      if (selectedStyleValue === '2d') {
        const gender = getWebtoonGender();
        const genderLabel: Record<string, string> = { 'male': '남성', 'female': '여성', 'neutral': '중성' };
        display.textContent = `${styleNames[selectedStyleValue]} (${genderLabel[gender] || '남성'})`;
      } else {
        display.textContent = styleNames[selectedStyleValue] || selectedStyleValue;
      }
    }

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
  // ✅ [2026-03-16] Google 계정 변경 버튼 → ImageFX 계정 전환
  document.getElementById('switch-google-account-btn')?.addEventListener('click', async () => {
    console.log('[HeadingImageSettings] 🔄 Google 계정 변경 시작');
    const statusEl = document.getElementById('google-account-status');
    const btn = document.getElementById('switch-google-account-btn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = '⏳ 계정 변경 중...';
    try {
      const result = await (window as any).api.switchImageFxGoogleAccount();
      if (result?.success) {
        if (statusEl) statusEl.textContent = `✅ ${result.userName || '변경 완료'}`;
        console.log('[HeadingImageSettings] ✅ Google 계정 변경 완료:', result.userName);
      } else {
        if (statusEl) statusEl.textContent = `⚠️ ${result?.message || '변경 실패'}`;
        console.warn('[HeadingImageSettings] ⚠️ Google 계정 변경 실패:', result?.message);
      }
    } catch (err: any) {
      console.error('[HeadingImageSettings] ❌ Google 계정 변경 오류:', err);
      if (statusEl) statusEl.textContent = '❌ 오류 발생';
    } finally {
      if (btn) btn.disabled = false;
    }
  });

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
          <!-- 🍌 나노 바나나 프로 (Gemini) - 분리 -->
          <div style="background: rgba(251, 191, 36, 0.1); padding: 14px; border-radius: 12px; border: 1px solid rgba(251, 191, 36, 0.3); display: flex; flex-direction: column; gap: 10px;">
            <label style="display: block; font-weight: 600; color: #fbbf24; font-size: 13px; margin-bottom: 2px;">🍌 나노 바나나 프로 (Gemini) <span style="color: #22c55e; font-size: 11px;">★ 추천</span></label>
            
            <div>
              <label style="display: block; font-weight: 500; color: #d1d5db; margin-bottom: 6px; font-size: 12px;">🖼️ 썸네일 (대표) 모델</label>
              <select id="submodal-nano-main-model" style="width: 100%; padding: 10px; background: #1a1a2e; border: 2px solid rgba(251, 191, 36, 0.4); border-radius: 8px; color: white; font-size: 13px; cursor: pointer;">
                <option value="gemini-3-pro-4k">👑 Gemini 3 Pro 4K - ₩336 (초고해상도, 최고품질)</option>
                <option value="gemini-3-pro">🏆 Gemini 3 Pro - ₩77 (고품질)</option>
                <option value="gemini-3-1-flash">⚡ Gemini 3.1 Flash - ₩97 (고품질 + 빠른속도, ★추천)</option>
                <option value="imagen-4">🌟 Imagen 4 - ₩46 (기본 폴백용)</option>
                <option value="gemini-2.5-flash">💡 Gemini 2.5 Flash - ₩20 (빠른 속도, 가성비)</option>
                <option value="gemini-2.0-flash-exp">🆓 Gemini 2.0 Flash Exp - ₩0 (무료, 한글 정확)</option>
              </select>
            </div>

            <div>
              <label style="display: block; font-weight: 500; color: #d1d5db; margin-bottom: 6px; font-size: 12px;">📝 본문 (서브) 모델</label>
              <select id="submodal-nano-sub-model" style="width: 100%; padding: 10px; background: #1a1a2e; border: 2px solid rgba(251, 191, 36, 0.4); border-radius: 8px; color: white; font-size: 13px; cursor: pointer;">
                <option value="gemini-3-pro-4k">👑 Gemini 3 Pro 4K - ₩336 (초고해상도, 최고품질)</option>
                <option value="gemini-3-pro">🏆 Gemini 3 Pro - ₩77 (고품질)</option>
                <option value="gemini-3-1-flash">⚡ Gemini 3.1 Flash - ₩97 (고품질 + 빠른속도, ★추천)</option>
                <option value="imagen-4">🌟 Imagen 4 - ₩46 (기본 폴백용)</option>
                <option value="gemini-2.5-flash">💡 Gemini 2.5 Flash - ₩20 (빠른 속도, 가성비)</option>
                <option value="gemini-2.0-flash-exp">🆓 Gemini 2.0 Flash Exp - ₩0 (무료, 한글 정확)</option>
              </select>
            </div>
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

          <!-- 🦁 Leonardo AI -->
          <div style="background: rgba(234, 88, 12, 0.1); padding: 14px; border-radius: 12px; border: 1px solid rgba(234, 88, 12, 0.3);">
            <label style="display: block; font-weight: 600; color: #ea580c; margin-bottom: 8px; font-size: 13px;">🦁 Leonardo AI</label>
            <select id="submodal-leonardoai-model" style="width: 100%; padding: 10px; background: #1a1a2e; border: 2px solid rgba(234, 88, 12, 0.4); border-radius: 8px; color: white; font-size: 13px; cursor: pointer;">
              <option value="seedream-4.5">🏆 SeeDream 4.5 - $0.04 (가성비 최강, 추천)</option>
              <option value="phoenix-1.0">🔥 Phoenix 1.0 - 고품질</option>
              <option value="ideogram-3.0">✍️ Ideogram 3.0 - $0.11 (텍스트 렌더링)</option>
              <option value="nano-banana-pro">🍌 Nano Banana Pro - $0.21 (한글 최강)</option>
            </select>
            <p style="margin: 6px 0 0; font-size: 11px; color: #9ca3af;">ℹ️ Leonardo AI API 키 필요 (환경설정에서 입력)</p>
          </div>
        </div>
        
        <!-- 퀄리티 순서 안내 -->
        <div style="margin-top: 16px; padding: 12px; background: rgba(34, 197, 94, 0.1); border-radius: 10px; border: 1px dashed rgba(34, 197, 94, 0.4);">
          <p style="margin: 0; font-size: 12px; color: #22c55e; font-weight: 600;">📊 퀄리티 순서 (높음 → 낮음)</p>
          <p style="margin: 4px 0 0; font-size: 11px; color: #9ca3af; line-height: 1.5;">
            Gemini 3 Pro 4K > Gemini 3.1 Flash ≈ Gemini 3 Pro > Imagen 4 > FLUX.2-dev > Gemini 2.5 Flash > SDXL
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
    const nanoMainSelect = subModal.querySelector('#submodal-nano-main-model') as HTMLSelectElement;
    const nanoSubSelect = subModal.querySelector('#submodal-nano-sub-model') as HTMLSelectElement;
    const deepinfraSelect = subModal.querySelector('#submodal-deepinfra-model') as HTMLSelectElement;
    const leonardoaiSelect = subModal.querySelector('#submodal-leonardoai-model') as HTMLSelectElement;

    // localStorage에서 현재 값 로드
    if (nanoMainSelect) nanoMainSelect.value = localStorage.getItem('nanoBananaMainModel') || localStorage.getItem('nanoBananaModel') || 'gemini-3-1-flash';
    if (nanoSubSelect) nanoSubSelect.value = localStorage.getItem('nanoBananaSubModel') || localStorage.getItem('nanoBananaModel') || 'gemini-3-1-flash';
    if (deepinfraSelect) deepinfraSelect.value = localStorage.getItem('deepinfraModel') || 'flux-2-dev';
    if (leonardoaiSelect) leonardoaiSelect.value = localStorage.getItem('leonardoaiModel') || 'seedream-4.5';

    // 닫기 버튼
    subModal.querySelector('#close-image-model-submodal')?.addEventListener('click', () => subModal.remove());
    subModal.querySelector('#cancel-image-model-submodal')?.addEventListener('click', () => subModal.remove());

    // 배경 클릭 시 닫기
    subModal.addEventListener('click', (e) => { if (e.target === subModal) subModal.remove(); });

    // 프리셋 버튼 - 가성비 (SDXL + Gemini 3 Pro)
    subModal.querySelector('#preset-budget-submodal')?.addEventListener('click', () => {
      if (nanoMainSelect) nanoMainSelect.value = 'gemini-3-1-flash';
      if (nanoSubSelect) nanoSubSelect.value = 'gemini-2.5-flash';
      if (deepinfraSelect) deepinfraSelect.value = 'flux-schnell';
      if (leonardoaiSelect) leonardoaiSelect.value = 'seedream-4.5';
      if ((window as any).toastManager) (window as any).toastManager.success('💰 가성비 조합 적용됨');
    });

    // 프리셋 버튼 - 고퀄리티 (Ultra + Pro 4K)
    subModal.querySelector('#preset-premium-submodal')?.addEventListener('click', () => {
      if (nanoMainSelect) nanoMainSelect.value = 'gemini-3-pro-4k';
      if (nanoSubSelect) nanoSubSelect.value = 'gemini-3-pro';
      if (deepinfraSelect) deepinfraSelect.value = 'flux-2-dev';
      if (leonardoaiSelect) leonardoaiSelect.value = 'phoenix-1.0';
      if ((window as any).toastManager) (window as any).toastManager.success('🏆 고퀄리티 조합 적용됨');
    });

    // 프리셋 버튼 - 균형 (Turbo + Pro)
    subModal.querySelector('#preset-balanced-submodal')?.addEventListener('click', () => {
      if (nanoMainSelect) nanoMainSelect.value = 'gemini-3-1-flash';
      if (nanoSubSelect) nanoSubSelect.value = 'gemini-3-1-flash';
      if (deepinfraSelect) deepinfraSelect.value = 'flux-2-dev';
      if (leonardoaiSelect) leonardoaiSelect.value = 'seedream-4.5';
      if ((window as any).toastManager) (window as any).toastManager.success('⚖️ 균형 조합 적용됨');
    });

    // 저장 버튼
    subModal.querySelector('#save-image-model-submodal')?.addEventListener('click', async () => {
      // localStorage에 저장
      if (nanoMainSelect) {
        localStorage.setItem('nanoBananaMainModel', nanoMainSelect.value);
        localStorage.setItem('nanoBananaModel', nanoMainSelect.value); // backward compatibility
      }
      if (nanoSubSelect) {
        localStorage.setItem('nanoBananaSubModel', nanoSubSelect.value);
      }
      if (deepinfraSelect) localStorage.setItem('deepinfraModel', deepinfraSelect.value);
      if (leonardoaiSelect) localStorage.setItem('leonardoaiModel', leonardoaiSelect.value);

      // ✅ [2026-01-27] config.json에도 저장 (메인 프로세스에서 읽을 수 있도록)
      // ✅ [2026-01-29] safeIpcInvoke 사용으로 에러 핸들링 강화
      const currentConfig = await safeIpcInvoke<any>('config:get');
      if (currentConfig) {
        // 새 설정 merge
        if (nanoMainSelect) {
          currentConfig.nanoBananaMainModel = nanoMainSelect.value;
          currentConfig.nanoBananaModel = nanoMainSelect.value; // backward compatibility
        }
        if (nanoSubSelect) {
          currentConfig.nanoBananaSubModel = nanoSubSelect.value;
        }
        if (deepinfraSelect) currentConfig.deepinfraModel = deepinfraSelect.value;
        if (leonardoaiSelect) currentConfig.leonardoaiModel = leonardoaiSelect.value;

        // 저장
        await safeIpcInvoke('config:set', currentConfig);
        console.log('[HeadingImageSettings] ✅ config.json에 모델 설정 저장됨:', {
          nanoBananaMainModel: currentConfig.nanoBananaMainModel,
          nanoBananaSubModel: currentConfig.nanoBananaSubModel,
          deepinfraModel: currentConfig.deepinfraModel,
          leonardoaiModel: currentConfig.leonardoaiModel
        });
      }

      // 이미지 관리 탭의 드롭다운도 동기화
      const mainNanoMainSelect = document.getElementById('nano-banana-main-model') as HTMLSelectElement;
      const mainNanoSubSelect = document.getElementById('nano-banana-sub-model') as HTMLSelectElement;

      if (mainNanoMainSelect && nanoMainSelect) mainNanoMainSelect.value = nanoMainSelect.value;
      if (mainNanoSubSelect && nanoSubSelect) mainNanoSubSelect.value = nanoSubSelect.value;

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
    if (sourceDisplay) {
      if (currentSource === 'local-folder') {
        const savedPath = localStorage.getItem('localFolderPath') || '';
        const folderName = savedPath.split(/[/\\]/).filter(Boolean).pop() || '';
        sourceDisplay.textContent = folderName ? `📂 ${folderName}` : '📂 내 폴더';
      } else {
        sourceDisplay.textContent = SOURCE_NAMES[currentSource];
      }
    }

    // ✅ [2026-03-23] local-folder 선택 시 부족 이미지 옵션 토글
    const fallbackSection = document.getElementById('local-folder-fallback-options');
    if (fallbackSection) {
      fallbackSection.style.display = currentSource === 'local-folder' ? 'block' : 'none';
      if (currentSource === 'local-folder') {
        const savedFallback = localStorage.getItem('localFolderFallback') || 'skip';
        const radio = document.querySelector(`input[name="local-folder-fallback"][value="${savedFallback}"]`) as HTMLInputElement;
        if (radio) radio.checked = true;
      }
    }

    // ✅ [2026-01-26] 이미지 스타일 표시 초기화 (통합 상수 사용)
    const currentStyle = getImageStyle();
    const styleDisplay = document.getElementById('current-image-style-display');
    if (styleDisplay) {
      // ✅ [2026-02-18] 2D 스타일이면 성별 정보 포함
      if (currentStyle === '2d') {
        const gender = getWebtoonGender();
        const genderLabel: Record<string, string> = { 'male': '남성', 'female': '여성', 'neutral': '중성' };
        styleDisplay.textContent = `${STYLE_NAMES[currentStyle]} (${genderLabel[gender] || '남성'})`;
      } else {
        styleDisplay.textContent = STYLE_NAMES[currentStyle] || currentStyle;
      }
    }

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
        const scSubImageSource = localStorage.getItem('scSubImageSource') || 'collected';
        const scSubImageRadio = document.querySelector(`input[name="sc-sub-image-source"][value="${scSubImageSource}"]`) as HTMLInputElement;
        if (scSubImageRadio) scSubImageRadio.checked = true;

        const scAutoThumbnailCheck = document.getElementById('sc-auto-thumbnail-setting') as HTMLInputElement;
        if (scAutoThumbnailCheck) scAutoThumbnailCheck.checked = localStorage.getItem('scAutoThumbnailSetting') === 'true';
      }
    }
  }
}



// ✅ [2026-03-02] 이미지 사용한도 대시보드 모달
const GEMINI_TOTAL_LIMIT_KRW = 420000; // ₩420K 기본 한도

export async function openImageQuotaDashboard(): Promise<void> {
  // 기존 모달 제거
  document.getElementById('image-quota-dashboard-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'image-quota-dashboard-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    z-index: 60000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const container = document.createElement('div');
  container.style.cssText = `
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    border-radius: 20px; padding: 32px; width: 680px; max-width: 90vw;
    box-shadow: 0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
    color: #e0e0e0;
  `;

  // 헤더
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
      <h2 style="margin:0;font-size:20px;color:#fff;">📊 이미지 엔진 사용량</h2>
      <button id="iqd-close" style="background:rgba(255,255,255,0.1);border:none;color:#aaa;font-size:20px;
        cursor:pointer;border-radius:8px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;
        transition:all 0.2s;">✕</button>
    </div>
    <div id="iqd-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;"></div>
    <div style="margin-top:16px;text-align:center;">
      <button id="iqd-refresh" style="background:linear-gradient(135deg,#667eea,#764ba2);border:none;color:#fff;
        padding:10px 24px;border-radius:10px;cursor:pointer;font-size:14px;transition:all 0.2s;
        box-shadow:0 4px 15px rgba(102,126,234,0.3);">🔄 새로고침</button>
    </div>
  `;

  modal.appendChild(container);
  document.body.appendChild(modal);

  // 닫기
  document.getElementById('iqd-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // 새로고침
  document.getElementById('iqd-refresh')?.addEventListener('click', () => loadDashboardData());

  // 데이터 로드
  async function loadDashboardData() {
    const grid = document.getElementById('iqd-grid');
    if (!grid) return;
    grid.innerHTML = `
      <div style="text-align:center;grid-column:1/4;padding:40px;color:#888;">
        <div style="font-size:28px;margin-bottom:8px;">⏳</div>
        데이터를 불러오는 중...
      </div>
    `;

    // 병렬 로드
    const [geminiResult, leonardoResult] = await Promise.allSettled([
      (window as any).api?.getImageApiUsage?.() || { success: false },
      (window as any).api?.getLeonardoCredits?.() || { success: false },
    ]);

    const gemini = geminiResult.status === 'fulfilled' ? geminiResult.value : { success: false };
    const leonardo = leonardoResult.status === 'fulfilled' ? leonardoResult.value : { success: false };

    // Gemini 카드
    const geminiCostKrw = gemini.todayCostKrw || 0;
    const geminiCalls = gemini.todayCalls || 0;
    const geminiPercent = Math.min(100, Math.round((geminiCostKrw / GEMINI_TOTAL_LIMIT_KRW) * 100));
    const geminiBarColor = geminiPercent > 80 ? '#ef4444' : geminiPercent > 50 ? '#f59e0b' : '#22c55e';

    // Leonardo 카드
    const leonardoHasKey = leonardo.success || (leonardo.message !== 'API 키 미설정');
    const leonardoCredits = leonardo.credits || 0;

    grid.innerHTML = `
      <!-- Gemini Card -->
      <div style="background:rgba(255,255,255,0.05);border-radius:14px;padding:20px;
        border:1px solid rgba(255,255,255,0.08);transition:transform 0.2s;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="font-size:22px;">🟢</span>
          <span style="font-weight:600;color:#fff;font-size:15px;">Gemini</span>
        </div>
        <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:4px;">
          ₩${Math.round(geminiCostKrw / 1000)}K
          <span style="font-size:14px;color:#888;font-weight:400;">/ ₩${GEMINI_TOTAL_LIMIT_KRW / 1000}K</span>
        </div>
        <div style="background:rgba(255,255,255,0.1);border-radius:6px;height:8px;margin:10px 0 8px;">
          <div style="background:${geminiBarColor};height:100%;border-radius:6px;width:${geminiPercent}%;
            transition:width 0.5s;"></div>
        </div>
        <div style="font-size:12px;color:#888;">오늘 ${geminiCalls}회 사용 (추정)</div>
      </div>

      <!-- Leonardo AI Card -->
      <div style="background:rgba(255,255,255,0.05);border-radius:14px;padding:20px;
        border:1px solid rgba(255,255,255,0.08);transition:transform 0.2s;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="font-size:22px;">${leonardoHasKey ? '🟢' : '⚫'}</span>
          <span style="font-weight:600;color:#fff;font-size:15px;">Leonardo AI</span>
        </div>
        ${leonardoHasKey && leonardo.success ? `
          <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:4px;">
            $${typeof leonardoCredits === 'number' ? leonardoCredits.toFixed(2) : leonardoCredits}
            <span style="font-size:14px;color:#888;font-weight:400;">남음</span>
          </div>
        ` : `
          <div style="font-size:14px;color:${leonardoHasKey ? '#ef4444' : '#666'};margin-top:8px;">
            ${leonardoHasKey ? `❌ ${leonardo.message || '조회 실패'}` : 'API키: ❌ 미설정'}
          </div>
        `}
        <div style="font-size:12px;color:#888;margin-top:8px;">실시간 크레딧 조회</div>
      </div>

      <!-- DeepInfra Card -->
      <div style="background:rgba(255,255,255,0.05);border-radius:14px;padding:20px;
        border:1px solid rgba(255,255,255,0.08);transition:transform 0.2s;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="font-size:22px;">🟡</span>
          <span style="font-weight:600;color:#fff;font-size:15px;">DeepInfra</span>
        </div>
        <div style="font-size:14px;color:#888;margin-top:8px;">
          로컬 추적만 가능<br>
          <span style="font-size:11px;">(잔액 조회 API 없음)</span>
        </div>
      </div>
    `;
  }

  await loadDashboardData();
}

// 전역에 노출
(window as any).openHeadingImageModal = openHeadingImageModal;
(window as any).getHeadingImageMode = getHeadingImageMode;
(window as any).setHeadingImageMode = setHeadingImageMode;
(window as any).getGlobalImageSource = getGlobalImageSource;
(window as any).setGlobalImageSource = setGlobalImageSource;

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
(window as any).openImageQuotaDashboard = openImageQuotaDashboard;

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

