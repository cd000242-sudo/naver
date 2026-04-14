// ============================================
// rendererUtils.ts — renderer.ts에서 추출한 순수 유틸리티
// Phase 5B-1: 이벤트 리스너, DOM 캐시, API 중복 방지,
//             디바운스/스로틀, 버튼 상태, 에러 핸들링,
//             이미지 DataURL, 로깅 시스템
// ============================================

// ============================================
// 이벤트 리스너 중복 방지 시스템
// ============================================
const registeredEventListeners = new Map<string, { element: HTMLElement | Document | Window; type: string; handler: EventListener; }>();

function registerEventListener(
  key: string,
  element: HTMLElement | Document | Window,
  type: string,
  handler: EventListener,
  options?: AddEventListenerOptions
): void {
  // 이미 등록된 리스너가 있으면 제거
  if (registeredEventListeners.has(key)) {
    const existing = registeredEventListeners.get(key)!;
    existing.element.removeEventListener(existing.type, existing.handler);
    console.log(`[EventListener] 기존 리스너 제거: ${key}`);
  }

  // 새 리스너 등록
  element.addEventListener(type, handler, options);
  registeredEventListeners.set(key, { element, type, handler });
  console.log(`[EventListener] 새 리스너 등록: ${key}`);
}

function unregisterEventListener(key: string): void {
  if (registeredEventListeners.has(key)) {
    const { element, type, handler } = registeredEventListeners.get(key)!;
    element.removeEventListener(type, handler);
    registeredEventListeners.delete(key);
    console.log(`[EventListener] 리스너 제거: ${key}`);
  }
}

function clearAllEventListeners(): void {
  console.log(`[EventListener] 모든 리스너 제거: ${registeredEventListeners.size}개`);
  registeredEventListeners.forEach(({ element, type, handler }, key) => {
    element.removeEventListener(type, handler);
  });
  registeredEventListeners.clear();
}

// ============================================
// DOM 쿼리 캐싱 시스템
// ============================================
const rendererDomCache = new Map<string, HTMLElement | null>();
let domCacheEnabled = true;

function getElement<T extends HTMLElement = HTMLElement>(selector: string, refresh = false): T | null {
  if (!domCacheEnabled || refresh || !rendererDomCache.has(selector)) {
    const element = document.querySelector(selector) as T | null;
    if (domCacheEnabled) {
      rendererDomCache.set(selector, element);
    }
    return element;
  }
  return rendererDomCache.get(selector) as T | null;
}

function getElementById<T extends HTMLElement = HTMLElement>(id: string, refresh = false): T | null {
  return getElement<T>(`#${id}`, refresh);
}

function clearDomCache(): void {
  console.log(`[DOMCache] 캐시 클리어: ${rendererDomCache.size}개`);
  rendererDomCache.clear();
}

function disableDomCache(): void {
  domCacheEnabled = false;
  clearDomCache();
}

// ============================================
// API 호출 중복 방지 시스템
// ============================================
const apiCallsInProgress = new Map<string, Promise<any>>();

async function preventDuplicateApiCall<T>(
  key: string,
  apiFunction: () => Promise<T>
): Promise<T> {
  // 이미 진행 중인 API 호출이 있으면 대기
  if (apiCallsInProgress.has(key)) {
    console.log(`[API] 중복 호출 방지: ${key} (이미 진행 중)`);
    return apiCallsInProgress.get(key) as Promise<T>;
  }

  // 새로운 API 호출 시작
  const promise = apiFunction()
    .finally(() => {
      apiCallsInProgress.delete(key);
      console.log(`[API] 호출 완료: ${key}`);
    });

  apiCallsInProgress.set(key, promise);
  console.log(`[API] 호출 시작: ${key}`);
  return promise;
}

// debounce/throttle는 performanceUtils.ts에서 전역 스코프로 제공됨 (중복 제거)

// ============================================
// 버튼 상태 관리 시스템
// ============================================
const buttonStates = new Map<string, { disabled: boolean; originalText: string; }>();

function setButtonLoading(buttonId: string, loadingText: string = '처리 중...'): void {
  const button = document.getElementById(buttonId) as HTMLButtonElement;
  if (!button) return;

  // 현재 상태 저장
  if (!buttonStates.has(buttonId)) {
    buttonStates.set(buttonId, {
      disabled: button.disabled,
      originalText: button.innerHTML
    });
  }

  button.disabled = true;
  button.innerHTML = loadingText;
  button.style.opacity = '0.7';
  button.style.cursor = 'not-allowed';
  console.log(`[Button] 로딩 상태: ${buttonId}`);
}

function resetButtonState(buttonId: string): void {
  const button = document.getElementById(buttonId) as HTMLButtonElement;
  if (!button) return;

  const savedState = buttonStates.get(buttonId);
  if (savedState) {
    button.disabled = savedState.disabled;
    button.innerHTML = savedState.originalText;
    button.style.opacity = '';
    button.style.cursor = '';
    buttonStates.delete(buttonId);
    console.log(`[Button] 상태 복원: ${buttonId}`);
  }
}

function disableButton(buttonId: string, disabled: boolean = true): void {
  const button = document.getElementById(buttonId) as HTMLButtonElement;
  if (!button) return;

  button.disabled = disabled;
  console.log(`[Button] disabled=${disabled}: ${buttonId}`);
}

// ============================================
// 에러 핸들링 유틸리티
// ============================================
async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
  options: {
    showToast?: boolean;
    logError?: boolean;
    fallbackValue?: T;
  } = {}
): Promise<T | undefined> {
  const { showToast = true, logError = true, fallbackValue } = options;

  try {
    return await operation();
  } catch (error) {
    const message = (error as Error).message || '알 수 없는 오류';

    if (logError) {
      console.error(`[Error] ${context}:`, error);
      appendLog(`❌ ${context}: ${message}`);
    }

    if (showToast && (window as any).toastManager) {
      (window as any).toastManager.error(`❌ ${context}: ${message}`);
    }

    return fallbackValue;
  }
}

// ============================================
// 메모리 관리 유틸리티
// ============================================
const imageDataUrls = new Set<string>();

function createImageDataUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  imageDataUrls.add(url);
  return url;
}

function revokeImageDataUrl(url: string): void {
  if (imageDataUrls.has(url)) {
    URL.revokeObjectURL(url);
    imageDataUrls.delete(url);
    console.log(`[Memory] 이미지 URL 해제: ${url.substring(0, 50)}...`);
  }
}

function revokeAllImageDataUrls(): void {
  console.log(`[Memory] 모든 이미지 URL 해제: ${imageDataUrls.size}개`);
  imageDataUrls.forEach(url => URL.revokeObjectURL(url));
  imageDataUrls.clear();
}

// URL 필드 컨테이너에서 모든 URL 수집
function getAllUrls(): string[] {
  const urlFieldsContainer = document.getElementById('url-fields-container') as HTMLDivElement;
  if (!urlFieldsContainer) return [];
  const urlInputs = urlFieldsContainer.querySelectorAll<HTMLInputElement>('.url-field-input');
  return Array.from(urlInputs)
    .map(input => input.value.trim())
    .filter(url => url.length > 0 && /^https?:\/\//i.test(url));
}

function getUrlsAsString(): string {
  return getAllUrls().join('\n');
}

// ============================================
// 로그 DOM 배치 업데이트 시스템
// ============================================
let _logUpdatePending = false;
const _logPendingEntries: { message: string; timestamp: string }[] = [];

function _flushLogEntries(logOutputs: HTMLElement[]): void {
  const entries = _logPendingEntries.splice(0);
  _logUpdatePending = false;

  if (entries.length === 0) return;

  // DocumentFragment로 DOM 조작 최소화
  logOutputs.forEach(currentLogOutput => {
    // 기존 로그 지우기 (너무 많이 쌓이지 않도록, 200개까지 유지)
    while (currentLogOutput.children.length > 200) {
      currentLogOutput.removeChild(currentLogOutput.firstChild!);
    }

    const fragment = document.createDocumentFragment();
    entries.forEach(({ message, timestamp }) => {
      const logEntry = document.createElement('div');
      logEntry.className = 'log-entry';
      logEntry.style.cssText = `
        padding: 4px 0;
        border-bottom: 1px solid rgba(212, 175, 55, 0.2);
        color: #F4D03F;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        line-height: 1.4;
        word-wrap: break-word;
      `;
      logEntry.textContent = `[${timestamp}] ${message}`;
      fragment.appendChild(logEntry);
    });
    currentLogOutput.appendChild(fragment);
    // ✅ [2026-02-15] scrollTop은 rAF로 배치하여 layout thrashing 방지
    requestAnimationFrame(() => { currentLogOutput.scrollTop = currentLogOutput.scrollHeight; });
  });

  // 마지막 항목만 콘솔에 기록 (과다 로그 방지)
  if (entries.length > 0) {
    console.log(`[LOG] 로그 ${entries.length}건 표시 완료: ${entries[entries.length - 1].message}`);
  }
}

// 로그 표시 및 진행상황 표시 함수 (중복 방지)
function appendLog(message: string, logOutputId?: string): void {
  // 중복 로그 방지 강화 - 같은 메시지는 2초 이내에 다시 표시하지 않음
  const now = Date.now();
  const lastMessage = (appendLog as any).lastMessage;
  const lastTime = (appendLog as any).lastTime;

  if (lastMessage === message && lastTime && now - lastTime < 2000) {
    console.log('[LOG] 중복 로그 방지됨:', message);
    return;
  }
  (appendLog as any).lastMessage = message;
  (appendLog as any).lastTime = now;

  console.log('[LOG] 진행상황:', message);

  // 진행 상황을 시각적으로 표시
  const progressIndicator = document.getElementById('progress-indicator');
  const progressText = document.getElementById('progress-text');

  if (progressIndicator && progressText) {
    progressIndicator.style.display = 'block';
    progressText.textContent = message;
    progressText.style.color = message.includes('❌') || message.includes('실패') ? '#ef4444' : '#10b981';

    // 성공 메시지는 3초, 에러 메시지는 5초 후 자동 숨김
    const hideDelay = message.includes('❌') || message.includes('실패') || message.includes('오류') ? 5000 : 3000;
    setTimeout(() => {
      if (progressIndicator && progressText.textContent === message) {
        progressIndicator.style.display = 'none';
      }
    }, hideDelay);
  }

  // 로그 출력 요소들
  let logOutputs: HTMLElement[] = [];

  if (logOutputId) {
    // 특정 로그 출력 요소만 사용
    const specificOutput = document.getElementById(logOutputId) as HTMLElement;
    if (specificOutput) {
      logOutputs = [specificOutput];
    }
  } else {
    // 기본 로그 출력 요소들
    logOutputs = [
      document.getElementById('unified-log-output') as HTMLElement, // 통합 탭 로그
      document.getElementById('log-output') as HTMLElement // 기존 로그
    ].filter(output => output !== null);
  }

  if (logOutputs.length === 0) {
    console.error('[LOG] 로그 출력 요소를 찾을 수 없음!');
    // 대안으로 alert로 표시
    alert(`진행상황: ${message}`);
    return;
  }

  const timestamp = new Date().toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  // ✅ [2026-02-08 FIX] requestAnimationFrame으로 DOM 업데이트 배치 — UI 깜빡거림 방지
  if (!_logUpdatePending) {
    _logUpdatePending = true;
    _logPendingEntries.push({ message, timestamp });
    requestAnimationFrame(() => {
      _flushLogEntries(logOutputs);
    });
  } else {
    _logPendingEntries.push({ message, timestamp });
  }
}

export {
  // 이벤트 리스너
  registeredEventListeners,
  registerEventListener,
  unregisterEventListener,
  clearAllEventListeners,
  // DOM 캐시
  rendererDomCache,
  getElement,
  getElementById,
  clearDomCache,
  disableDomCache,
  // API 중복 방지
  apiCallsInProgress,
  preventDuplicateApiCall,
  // 버튼 상태
  buttonStates,
  setButtonLoading,
  resetButtonState,
  disableButton,
  // 에러 핸들링
  withErrorHandling,
  // 이미지 DataURL
  imageDataUrls,
  createImageDataUrl,
  revokeImageDataUrl,
  revokeAllImageDataUrls,
  getAllUrls,
  getUrlsAsString,
  // 로깅
  _logUpdatePending,
  _logPendingEntries,
  _flushLogEntries,
  appendLog,
};
