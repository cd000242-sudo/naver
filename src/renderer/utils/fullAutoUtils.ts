/**
 * ✅ [2026-01-25 모듈화] 전체 자동 발행 제어 유틸리티
 * - renderer.ts에서 분리됨
 * - 발행 중지 요청 및 상태 확인
 * ✅ [2026-01-29 개선] 타입 안전성 강화
 */

// 전역 ProgressModal 타입 참조
declare class ProgressModal {
    cancelled: boolean;
}

/**
 * ✅ [2026-01-29 NEW] 발행 상태 타입 정의
 * - 타입 안전성 강화를 위한 인터페이스
 */
interface WindowPublishState {
    // 발행 플래그
    stopFullAutoPublish: boolean;
    stopBatchPublish: boolean;
    isContinuousMode: boolean;
    stopRequested: boolean;
    isPublishing: boolean;
    isGeneratingContent: boolean;
    isGeneratingImages: boolean;

    // 콘텐츠 상태
    currentContent: any;
    currentStructuredContent: any;
    currentHeadings: any[];
    currentKeyword: string;
    currentTitle: string;
    currentSourceUrl: string;
    collectedImages: string[];
    crawledImages: string[];

    // 이미지 상태
    generatedImages: any[];
    headingImageMap: Map<string, string>;
    selectedThumbnail: string | null;
    manualThumbnailPath: string | null;

    // 발행 진행 상태
    publishProgress: { current: number; total: number };
    publishQueue: any[];
    currentPublishIndex: number;

    // 타이머/인터벌
    publishTimeoutId: ReturnType<typeof setTimeout> | null;
    progressIntervalId: ReturnType<typeof setInterval> | null;
}

/** 타입 안전한 window 접근 헬퍼 */
function getWindowState(): WindowPublishState {
    return window as unknown as WindowPublishState;
}

/** 타입 안전한 속성 설정 헬퍼 */
function setWindowState<K extends keyof WindowPublishState>(key: K, value: WindowPublishState[K]): void {
    (window as unknown as WindowPublishState)[key] = value;
}

/**
 * 전체 자동 발행 중지 요청 확인
 */
export function isFullAutoStopRequested(modal?: ProgressModal | null): boolean {
    if (modal?.cancelled) return true;
    return getWindowState().stopFullAutoPublish === true;
}

/**
 * 전체 자동 발행 중지 요청
 */
export async function requestStopFullAutoPublish(): Promise<void> {
    setWindowState('stopFullAutoPublish', true);
    setWindowState('stopBatchPublish', true);
    try {
        await window.api.cancelAutomation();
    } catch (e) {
        console.warn('[fullAutoUtils] catch ignored:', e);
    }
}

/**
 * 리뷰 소제목 시드 정규화
 */
export function normalizeReviewHeadingSeed(seed: string): string {
    return String(seed || '').trim().replace(/[\s\u00A0]+/g, ' ');
}

/**
 * 리뷰 소제목 접두어 적용
 */
export function applyReviewHeadingPrefix(structuredContent: any, seed: string): void {
    const ct = getWindowState().currentContent?.type || 'info';
    if (ct !== 'review') return;
    if (!structuredContent || !Array.isArray(structuredContent.headings)) return;
}

// 전역 노출 (하위 호환성)
(window as any).isFullAutoStopRequested = isFullAutoStopRequested;
(window as any).requestStopFullAutoPublish = requestStopFullAutoPublish;

/**
 * ✅ [2026-01-29 NEW] 발행 완료 후 전체 상태 초기화
 * - 새로운 발행을 위해 모든 상태를 리셋
 * - 모든 발행 모드(풀오토, 반자동, 쇼핑커넥트, 다중계정)에서 사용
 * - 타입 안전성 강화: WindowPublishState 인터페이스 사용
 */
export function resetAfterPublish(): void {
    console.log('[FullAutoUtils] 🔄 발행 완료 → 전체 상태 초기화 시작');

    const state = getWindowState();

    // 1. 발행 플래그 초기화
    // ✅ [2026-03-11 FIX] stopFullAutoPublish/stopBatchPublish는 여기서 리셋하지 않음
    // 중지 직후 이 함수가 호출되면 방금 설정한 true가 즉시 false로 소실되는 경쟁 조건 방지
    // 이 플래그들은 새로운 발행 시작 시에만 리셋됨 (renderer.ts 발행 버튼 클릭 핸들러)
    // setWindowState('stopFullAutoPublish', false);  // ❌ 삭제: 경쟁 조건 방지
    // setWindowState('stopBatchPublish', false);     // ❌ 삭제: 경쟁 조건 방지
    setWindowState('isContinuousMode', false);
    setWindowState('stopRequested', false);
    setWindowState('isPublishing', false);
    setWindowState('isGeneratingContent', false);
    setWindowState('isGeneratingImages', false);

    // 2. 콘텐츠 상태 초기화
    setWindowState('currentContent', null);
    setWindowState('currentStructuredContent', null);
    setWindowState('currentHeadings', []);
    setWindowState('currentKeyword', '');
    setWindowState('currentTitle', '');
    setWindowState('currentSourceUrl', '');
    setWindowState('collectedImages', []);
    setWindowState('crawledImages', []);

    // 3. 이미지 상태 초기화
    setWindowState('generatedImages', []);
    setWindowState('headingImageMap', new Map());
    setWindowState('selectedThumbnail', null);
    setWindowState('manualThumbnailPath', null);

    // ✅ [2026-03-29 FIX] ImageManager 초기화 — 이전에 누락되어 imageMap 잔존
    // 이 함수는 10+ 곳에서 호출되므로 여기서 한번 초기화하면 모든 모드에서 적용됨
    try {
      if (typeof (window as any).ImageManager !== 'undefined' && typeof (window as any).ImageManager.clearAll === 'function') {
        (window as any).ImageManager.clearAll();
      }
      (window as any).imageManagementGeneratedImages = [];
    } catch (e) {
      console.warn('[FullAutoUtils] ImageManager.clearAll() 실패:', e);
    }

    // 4. 발행 진행 상태 초기화
    setWindowState('publishProgress', { current: 0, total: 0 });
    setWindowState('publishQueue', []);
    setWindowState('currentPublishIndex', -1);

    // 5. 타이머/인터벌 정리 (타입 안전)
    if (state.publishTimeoutId) {
        clearTimeout(state.publishTimeoutId);
        setWindowState('publishTimeoutId', null);
    }
    if (state.progressIntervalId) {
        clearInterval(state.progressIntervalId);
        setWindowState('progressIntervalId', null);
    }

    // 6. ✅ [2026-01-29] 안정성 관리자 리셋 (대규모 발행 지원)
    if (typeof (window as any).stabilityManager?.reset === 'function') {
        // ✅ [2026-02-01] 메모리 모니터링 중지 + 정리
        (window as any).stabilityManager.stopMemoryMonitoring?.();
        (window as any).stabilityManager.reset();
        console.log('[FullAutoUtils] 🔄 StabilityManager 리셋 + 메모리 정리 완료');
    }

    console.log('[FullAutoUtils] ✅ 전체 상태 초기화 완료 → 새 발행 준비 완료');
}

/**
 * ✅ [2026-03-22 NEW] 진행률 UI 및 타이머 초기화 헬퍼
 * - 발행 실패 시 진행률 바가 멈춘 상태로 남는 것 방지
 * - 타이머 + DOM 진행률 바 모두 정리
 */
function resetProgressUI(): void {
    const state = getWindowState();
    if (state.publishTimeoutId) {
        clearTimeout(state.publishTimeoutId);
        setWindowState('publishTimeoutId', null);
    }
    if (state.progressIntervalId) {
        clearInterval(state.progressIntervalId);
        setWindowState('progressIntervalId', null);
    }

    // ✅ [2026-03-22] DOM 진행률 바 숨기기 (잔류 방지)
    try {
        const progressContainer = document.getElementById('unified-progress-container');
        if (progressContainer) progressContainer.style.display = 'none';
    } catch (e) { /* DOM 접근 실패 무시 */ }
}

/**
 * ✅ [2026-03-22 NEW] 이미지 생성 락 해제
 */
function clearImageGenerationLocks(): void {
    (window as any).imageGenerationLock = false;
    (window as any).imageGenerationAbortController = null;
}

/**
 * ✅ [2026-03-22 NEW] 글 생성 실패 시 — 글 생성 상태만 리셋
 * - 이미지/발행 상태는 건드리지 않음
 * - 재시도 시 바로 글 생성 가능
 * @description 세분화 API: 글 생성 단계만 실패했을 때 사용
 */
export function resetContentGeneration(): void {
    console.log('[FullAutoUtils] 🔄 글 생성 실패 → 글 생성 상태만 리셋');
    setWindowState('isGeneratingContent', false);
    setWindowState('isPublishing', false);
    resetProgressUI();
    console.log('[FullAutoUtils] ✅ 글 생성 상태 리셋 완료 → 재시도 가능');
}

/**
 * ✅ [2026-03-22 NEW] 이미지 생성 실패 시 — 이미지 상태만 리셋
 * - 이미 생성된 글(currentStructuredContent)은 보존
 * - 이미지만 재생성 가능
 * @description 세분화 API: 이미지 생성 단계만 실패했을 때 사용. 생성된 글 보존.
 */
export function resetImageGeneration(): void {
    console.log('[FullAutoUtils] 🔄 이미지 생성 실패 → 이미지 상태만 리셋');
    setWindowState('isGeneratingImages', false);
    setWindowState('isPublishing', false);
    setWindowState('generatedImages', []);
    // ✅ [2026-03-29 FIX] ImageManager도 초기화 — 이전 이미지 잔존으로 재시도 시 오염 방지
    try {
      if (typeof (window as any).ImageManager !== 'undefined' && typeof (window as any).ImageManager.clear === 'function') {
        (window as any).ImageManager.clear();
      }
      (window as any).imageManagementGeneratedImages = [];
    } catch (e) {
      console.warn('[FullAutoUtils] ImageManager.clear() 실패:', e);
    }
    clearImageGenerationLocks();
    resetProgressUI();
    console.log('[FullAutoUtils] ✅ 이미지 상태 리셋 완료 → 재시도 가능 (글 보존)');
}

/**
 * ✅ [2026-03-22 NEW] 발행 실패 시 — 발행 상태만 리셋
 * - 이미 생성된 글 + 이미지 모두 보존
 * - 발행만 재시도 가능
 */
export function resetPublishing(): void {
    console.log('[FullAutoUtils] 🔄 발행 실패 → 발행 상태만 리셋');
    setWindowState('isPublishing', false);
    setWindowState('isGeneratingContent', false);
    setWindowState('isGeneratingImages', false);
    setWindowState('stopRequested', false);
    resetProgressUI();
    console.log('[FullAutoUtils] ✅ 발행 상태 리셋 완료 → 재시도 가능 (글+이미지 보존)');
}

// 전역 노출
(window as any).resetAfterPublish = resetAfterPublish;
(window as any).resetContentGeneration = resetContentGeneration;
(window as any).resetImageGeneration = resetImageGeneration;
(window as any).resetPublishing = resetPublishing;

console.log('[FullAutoUtils] 📦 모듈 로드됨 (타입 안전 버전 + 기능별 리셋)!');

