/**
 * ✅ [2026-01-25 모듈화] UI 매니저 클래스
 * 
 * ToastManager, LoadingManager, AnimationHelper
 */

// 로딩 표시 관리
export class LoadingManager {
    private static instance: LoadingManager;
    private overlay: HTMLElement | null = null;
    private textElement: HTMLElement | null = null;
    private progressBar: HTMLElement | null = null;

    static getInstance(): LoadingManager {
        if (!LoadingManager.instance) {
            LoadingManager.instance = new LoadingManager();
        }
        return LoadingManager.instance;
    }

    show(text: string = '처리 중...', progress: number = 0): void {
        if (!this.overlay) {
            this.overlay = document.getElementById('loading-overlay');
            this.textElement = document.getElementById('loading-text');
            this.progressBar = document.getElementById('loading-progress-bar');
        }

        if (this.overlay) {
            this.overlay.style.display = 'flex';
            if (this.textElement) this.textElement.textContent = text;
            if (this.progressBar) this.progressBar.style.width = `${progress}%`;
        }
    }

    update(text: string, progress: number): void {
        if (this.textElement) this.textElement.textContent = text;
        if (this.progressBar) this.progressBar.style.width = `${progress}%`;
    }

    hide(): void {
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
    }
}

// 토스트 알림 관리
export class ToastManager {
    private static instance: ToastManager;
    private container: HTMLElement | null = null;

    static getInstance(): ToastManager {
        if (!ToastManager.instance) {
            ToastManager.instance = new ToastManager();
        }
        return ToastManager.instance;
    }

    show(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 3000): void {
        if (!this.container) {
            this.container = document.getElementById('toast-container');

            // ✅ toast-container가 없으면 자동 생성
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'toast-container';
                this.container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 100000; display: flex; flex-direction: column; gap: 10px; max-width: 350px;';
                document.body.appendChild(this.container);
            }
        }

        if (!this.container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        // ✅ 인라인 스타일로 토스트 표시 (CSS 없어도 동작)
        const bgColors: Record<string, string> = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        toast.style.cssText = `
      padding: 12px 16px;
      background: ${bgColors[type]};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 14px;
      font-weight: 500;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
    `;

        toast.innerHTML = `
      <div style="flex: 1;">${message}</div>
      <button style="background: transparent; border: none; color: white; font-size: 18px; cursor: pointer; padding: 0; line-height: 1;" onclick="this.parentElement.remove()">×</button>
    `;

        this.container.appendChild(toast);

        // ✅ 애니메이션 시작 (인라인 스타일)
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);

        // ✅ 자동 제거
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    success(message: string, duration?: number): void {
        this.show(message, 'success', duration);
    }

    error(message: string, duration?: number): void {
        this.show(message, 'error', duration);
    }

    warning(message: string, duration?: number): void {
        this.show(message, 'warning', duration);
    }

    info(message: string, duration?: number): void {
        this.show(message, 'info', duration);
    }
}

// 애니메이션 헬퍼
export class AnimationHelper {
    static fadeIn(element: HTMLElement, duration: number = 300): void {
        element.style.opacity = '0';
        element.style.transform = 'translateY(10px)';
        element.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;

        requestAnimationFrame(() => {
            element.classList.add('fade-in');
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        });
    }

    static successBounce(element: HTMLElement): void {
        element.classList.add('success-animation');
        setTimeout(() => element.classList.remove('success-animation'), 1000);
    }

    static shake(element: HTMLElement): void {
        element.style.animation = 'shake 0.5s ease';
        setTimeout(() => element.style.animation = '', 500);
    }
}

// 글로벌 인스턴스
export const loadingManager = LoadingManager.getInstance();
export const toastManager = ToastManager.getInstance();
