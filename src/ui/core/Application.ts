// src/ui/core/Application.ts
// 애플리케이션 초기화 및 부트스트랩

import { GlobalStore } from '../store/GlobalStore';
import { ApiBridge } from '../services/ApiBridge';
import { EventManager } from '../managers/EventManager';
import { ErrorHandler, withAsyncErrorHandling } from '../managers/ErrorHandler';
import { clearElementCache } from '../components';

export interface ApplicationOptions {
    debug?: boolean;
    onReady?: () => void;
    onError?: (error: Error) => void;
}

/**
 * 애플리케이션 초기화 클래스
 * renderer.ts의 진입점 역할
 */
class ApplicationImpl {
    private initialized = false;
    private debug = false;

    /**
     * 애플리케이션 초기화
     */
    async initialize(options: ApplicationOptions = {}): Promise<void> {
        if (this.initialized) {
            console.warn('[Application] Already initialized');
            return;
        }

        this.debug = options.debug ?? false;

        try {
            this.log('🚀 Application initializing...');

            // 1. Store 초기화
            this.log('📦 Initializing GlobalStore...');
            GlobalStore.reset();

            // 2. API 연결 확인
            this.log('🔌 Checking API connection...');
            if (!ApiBridge.isAvailable()) {
                console.warn('[Application] API Bridge not available - running in limited mode');
            }

            // 3. 전역 에러 핸들러 설정
            this.log('🛡️ Setting up error handlers...');
            this.setupGlobalErrorHandlers();

            // 4. 전역 키보드 단축키 설정
            this.log('⌨️ Setting up keyboard shortcuts...');
            this.setupKeyboardShortcuts();

            // 5. IPC 이벤트 리스너 설정
            this.log('📡 Setting up IPC listeners...');
            this.setupIpcListeners();

            // 6. 초기화 완료
            this.initialized = true;
            this.log('✅ Application initialized successfully');

            // 콜백 호출
            options.onReady?.();

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            ErrorHandler.handle(err, { component: 'Application', action: 'initialize', severity: 'critical' });
            options.onError?.(err);
        }
    }

    /**
     * 전역 에러 핸들러 설정
     */
    private setupGlobalErrorHandlers(): void {
        // 미처리 Promise 에러
        window.addEventListener('unhandledrejection', (event) => {
            ErrorHandler.handle(event.reason, {
                component: 'Global',
                action: 'unhandledRejection',
                severity: 'high'
            });
        });

        // 일반 JS 에러
        window.addEventListener('error', (event) => {
            ErrorHandler.handle(event.error || new Error(event.message), {
                component: 'Global',
                action: 'uncaughtException',
                severity: 'high'
            });
        });
    }

    /**
     * 전역 키보드 단축키
     */
    private setupKeyboardShortcuts(): void {
        EventManager.onGlobalKeydown((e) => {
            // Escape: 자동화 중지
            if (e.key === 'Escape' && GlobalStore.get('automationRunning')) {
                this.log('⏹️ Escape pressed - stopping automation');
                GlobalStore.stopAutomation();
                EventManager.emit('automation:stop');
            }

            // Ctrl+S: 저장 (기본 동작 방지)
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                EventManager.emit('save:trigger');
            }
        });
    }

    /**
     * IPC 이벤트 리스너
     */
    private setupIpcListeners(): void {
        // 자동화 진행 상황
        ApiBridge.on('automation:progress', (progress) => {
            EventManager.emit('automation:progress', progress);
        });

        // 자동화 완료
        ApiBridge.on('automation:complete', (result) => {
            GlobalStore.stopAutomation();
            EventManager.emit('automation:complete', result);
        });

        // 자동화 에러
        ApiBridge.on('automation:error', (error) => {
            GlobalStore.stopAutomation();
            ErrorHandler.handle(error, { component: 'Automation', action: 'run', severity: 'high' });
            EventManager.emit('automation:error', error);
        });
    }

    /**
     * 이벤트 바인딩 헬퍼 (각 탭/컴포넌트에서 호출)
     */
    bindEvents(bindings: Record<string, () => void | Promise<void>>): void {
        for (const [elementId, handler] of Object.entries(bindings)) {
            EventManager.onClick(elementId, () => {
                try {
                    const result = handler();
                    if (result instanceof Promise) {
                        result.catch((err) => ErrorHandler.handle(err, {
                            component: 'UI',
                            action: elementId
                        }));
                    }
                } catch (err) {
                    ErrorHandler.handle(err, {
                        component: 'UI',
                        action: elementId
                    });
                }
            });
        }
    }

    /**
     * 정리 (페이지 이탈 시)
     */
    cleanup(): void {
        this.log('🧹 Cleaning up application...');
        EventManager.cleanup();
        clearElementCache();
        GlobalStore.reset();
        this.initialized = false;
    }

    /**
     * 디버그 로그
     */
    private log(message: string, ...args: any[]): void {
        if (this.debug) {
            console.log(`[Application] ${message}`, ...args);
        }
    }

    /**
     * 초기화 상태 확인
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}

// 싱글톤 인스턴스
export const Application = new ApplicationImpl();
export type { ApplicationImpl };
