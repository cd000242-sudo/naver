/**
 * ✅ [2026-01-25 모듈화] UI 매니저 클래스
 *
 * ToastManager, LoadingManager, AnimationHelper
 */

// ✅ [v2.7.44] 사용자 노출 메시지 친화화 (renderer 인라인 — main의 userMessageMapper와 동일 로직)
//   reviewer 권고 #4: userMessageMapper.ts 신설했으나 적용 0% → 단일 지점 적용
const FRIENDLY_PREFIX_STRIP = /^(FLOW_[A-Z_]+|NAVER_[A-Z_]+|HTTP_\d+|AdsPower\s+API\s+HTTP\s+\d+):?\s*/;
const FRIENDLY_KEYWORDS: Array<[RegExp, string]> = [
    [/Access Denied/gi, '네이버가 봇 차단했습니다 (5~10분 후 재시도 또는 IP 변경)'],
    [/\bENOENT\b/gi, '파일을 찾을 수 없습니다'],
    [/\bEACCES\b/gi, '파일 접근 권한이 없습니다'],
    [/Invalid JSONP response format/gi, '네이버 응답 형식이 변경되었습니다. 패치를 기다려주세요'],
    [/Invalid state\b/gi, '내부 상태 오류 (앱 재시작 권장)'],
    [/원인 불명|알 수 없는 오류|unknown error|Unknown error|\bunknown\b/gi, '잠시 후 다시 시도하거나 다른 옵션을 선택해주세요'],
];
function toUserFriendlyMessage(input: string): string {
    let msg = String(input || '').trim();
    if (!msg) return '잠시 후 다시 시도해주세요.';
    msg = msg.replace(FRIENDLY_PREFIX_STRIP, '');
    for (const [pattern, replacement] of FRIENDLY_KEYWORDS) {
        msg = msg.replace(pattern, replacement);
    }
    msg = msg.replace(/\s*[a-zA-Z][a-zA-Z0-9]*\(\)을?를?\s*먼저\s*호출하세요\.?/g, '');
    return msg;
}

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

        // ✅ [2026-03-13] 에러 발생 시 오디오 알림(Beep) 추가
        if (type === 'error') {
            this.playErrorSound();
        }

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

    // ✅ [2026-03-13] 웹 오디오 API를 사용한 자체 에러 사운드(Beep) 발생기
    private playErrorSound(): void {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            // 삐- 소리 (Sine 파형, 800Hz)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            
            // 볼륨 조절 (시작: 0.1 -> 짧게 유지 후 페이드아웃)
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            
            // 연결 및 0.3초 재생
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (error) {
            console.warn('[ToastManager] 오디오 재생 실패:', error);
        }
    }

    success(message: string, duration?: number): void {
        this.show(message, 'success', duration);
    }

    error(message: string, duration?: number): void {
        // ✅ [v2.7.44] reviewer 권고 #4 — userMessageMapper 실제 적용
        //   디버그 prefix(FLOW_*/HTTP_*/NAVER_*) 자동 strip + 영문 jargon 한국어 변환
        //   toastManager.error 단일 지점이라 여기에 적용하면 1,644개 메시지 대부분 친화화
        this.show(toUserFriendlyMessage(message), 'error', duration);
    }

    warning(message: string, duration?: number): void {
        // ✅ [v2.7.44] warning도 동일 친화화
        this.show(toUserFriendlyMessage(message), 'warning', duration);
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
