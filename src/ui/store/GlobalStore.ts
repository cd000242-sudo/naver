// src/ui/store/GlobalStore.ts
// 전역 상태 관리 싱글톤

import { StructuredContent, GeneratedImage } from '../types';

export interface GlobalState {
    // 콘텐츠 상태
    currentStructuredContent: StructuredContent | null;
    generatedImages: GeneratedImage[];

    // 자동화 상태
    automationRunning: boolean;
    isFullAuto: boolean;
    isContinuous: boolean;
    stopRequested: boolean;

    // UI 상태
    currentTab: string;
    selectedAccountId: string | null;

    // 발행 상태
    publishedUrl: string | null;
    lastPublishTime: number | null;
}

/**
 * 전역 상태 관리 싱글톤
 * window as any 패턴을 대체
 */
class GlobalStoreImpl {
    private state: GlobalState;
    private listeners: Set<(state: GlobalState) => void> = new Set();

    constructor() {
        this.state = this.getInitialState();
    }

    private getInitialState(): GlobalState {
        return {
            currentStructuredContent: null,
            generatedImages: [],
            automationRunning: false,
            isFullAuto: false,
            isContinuous: false,
            stopRequested: false,
            currentTab: 'unified',
            selectedAccountId: null,
            publishedUrl: null,
            lastPublishTime: null
        };
    }

    /**
     * 상태 가져오기
     */
    getState(): Readonly<GlobalState> {
        return this.state;
    }

    /**
     * 특정 키의 상태 가져오기
     */
    get<K extends keyof GlobalState>(key: K): GlobalState[K] {
        return this.state[key];
    }

    /**
     * 상태 업데이트
     */
    set<K extends keyof GlobalState>(key: K, value: GlobalState[K]): void {
        this.state[key] = value;
        this.notifyListeners();
    }

    /**
     * 부분 상태 업데이트
     */
    update(partial: Partial<GlobalState>): void {
        this.state = { ...this.state, ...partial };
        this.notifyListeners();
    }

    /**
     * 상태 리셋
     */
    reset(): void {
        this.state = this.getInitialState();
        this.notifyListeners();
    }

    /**
     * 구조화된 콘텐츠 설정
     */
    setStructuredContent(content: StructuredContent | null): void {
        this.state.currentStructuredContent = content;
        this.notifyListeners();
    }

    /**
     * 이미지 추가
     */
    addImage(image: GeneratedImage): void {
        this.state.generatedImages = [...this.state.generatedImages, image];
        this.notifyListeners();
    }

    /**
     * 이미지 목록 설정
     */
    setImages(images: GeneratedImage[]): void {
        this.state.generatedImages = images;
        this.notifyListeners();
    }

    /**
     * 이미지 제거
     */
    removeImage(index: number): void {
        this.state.generatedImages = this.state.generatedImages.filter((_, i) => i !== index);
        this.notifyListeners();
    }

    /**
     * 자동화 시작
     */
    startAutomation(options: { isFullAuto?: boolean; isContinuous?: boolean } = {}): void {
        this.update({
            automationRunning: true,
            stopRequested: false,
            isFullAuto: options.isFullAuto ?? false,
            isContinuous: options.isContinuous ?? false
        });
    }

    /**
     * 자동화 중지
     */
    stopAutomation(): void {
        this.update({
            automationRunning: false,
            stopRequested: true
        });
    }

    /**
     * 상태 변경 리스너 등록
     */
    subscribe(listener: (state: GlobalState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.state));
    }
}

// 싱글톤 인스턴스
export const GlobalStore = new GlobalStoreImpl();

// 타입 export
export type { GlobalStoreImpl };
