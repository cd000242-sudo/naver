/**
 * ✅ [2026-01-25 모듈화] 앱 이벤트 핸들러
 * - renderer.ts에서 분리됨
 * - 공지사항 모달, 종료 카운트다운, 전역 에러 핸들러
 */

import { translateGeminiError } from './errorUtils.js';

/**
 * 배너 탭으로 이동하는 전역 함수
 */
export function navigateToBannerTab(): void {
    console.log('[BannerNav] navigateToBannerTab 호출됨!');

    // 썸네일/배너 생성기 탭으로 이동
    const imageToolsTab = document.querySelector('[data-tab="image-tools"]') as HTMLElement;
    console.log('[BannerNav] imageToolsTab 찾기:', !!imageToolsTab);
    if (imageToolsTab) {
        imageToolsTab.click();

        // 쇼핑커넥트 배너 서브탭으로 이동
        setTimeout(() => {
            const bannerSubtab = document.querySelector('[data-subtab="shopping-banner"]') as HTMLElement;
            console.log('[BannerNav] bannerSubtab 찾기:', !!bannerSubtab);
            if (bannerSubtab) {
                bannerSubtab.click();
                if ((window as any).toastManager) {
                    (window as any).toastManager.info('🎨 쇼핑커넥트 배너 설정 화면입니다.');
                }
            }
        }, 150);
    }
}

/**
 * 공지사항 모달 이벤트 리스너 초기화
 */
export function initNoticeModalListener(): void {
    if (!window.api || !window.api.on) return;

    window.api.on('app:show-notice', (noticeContent: string) => {
        const modal = document.getElementById('notice-modal');
        const contentEl = document.getElementById('notice-content');
        const closeBtn = document.getElementById('close-notice-btn');

        if (modal && contentEl) {
            contentEl.textContent = noticeContent;
            modal.style.display = 'flex';

            // 점검 모드 키워드 감지
            const isMaintenanceMode = String(noticeContent).includes('점검') ||
                String(noticeContent).includes('서비스 중단') ||
                String(noticeContent).includes('이용 제한');

            const closeHandler = () => {
                modal.style.display = 'none';
                if (isMaintenanceMode && typeof (window as any).api?.forceQuit === 'function') {
                    (window as any).api.forceQuit();
                }
            };

            closeBtn?.addEventListener('click', closeHandler, { once: true });

            if (!isMaintenanceMode) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) closeHandler();
                }, { once: true });
            }
        }
    });
}

/**
 * 종료 카운트다운 UI 이벤트 리스너 초기화
 */
export function initShutdownCountdownListener(): void {
    if (!window.api || !window.api.on) return;

    window.api.on('app:shutdown-countdown', (data: { reason: string; message: string; seconds: number }) => {
        console.log('[Renderer] 🔴 강제 종료 카운트다운 시작:', data);

        const existingOverlay = document.getElementById('shutdown-countdown-overlay');
        if (existingOverlay) existingOverlay.remove();

        let remainingSeconds = data.seconds;

        const overlay = document.createElement('div');
        overlay.id = 'shutdown-countdown-overlay';
        overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: linear-gradient(135deg, rgba(220, 38, 38, 0.95) 0%, rgba(127, 29, 29, 0.98) 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      backdrop-filter: blur(10px);
      animation: shutdownFadeIn 0.5s ease-out;
    `;

        overlay.innerHTML = `
      <style>
        @keyframes shutdownFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.9; }
        }
        @keyframes countdown-glow {
          0%, 100% { text-shadow: 0 0 20px rgba(255,255,255,0.5), 0 0 40px rgba(255,255,255,0.3); }
          50% { text-shadow: 0 0 40px rgba(255,255,255,0.8), 0 0 80px rgba(255,255,255,0.5); }
        }
      </style>
      <div style="text-align: center; color: white; font-family: 'Segoe UI', sans-serif;">
        <div style="font-size: 5rem; margin-bottom: 1rem;">⚠️</div>
        <h1 style="font-size: 2.5rem; margin-bottom: 1rem; font-weight: 700;">${data.message}</h1>
        <p style="font-size: 1.3rem; opacity: 0.9; margin-bottom: 2rem;">
          보안상의 이유로 앱이 자동 종료됩니다
        </p>
        <div style="
          font-size: 8rem; 
          font-weight: 800; 
          animation: countdown-glow 1s ease-in-out infinite;
          margin: 2rem 0;
        " id="countdown-number">${remainingSeconds}</div>
        <p style="font-size: 1.1rem; opacity: 0.8;">초 후 앱이 종료됩니다</p>
        <div style="margin-top: 3rem;">
          <p style="font-size: 0.9rem; opacity: 0.7;">
            💾 작업 중인 내용을 저장해 주세요
          </p>
        </div>
      </div>
    `;

        document.body.appendChild(overlay);

        const countdownInterval = setInterval(() => {
            remainingSeconds--;
            const countdownEl = document.getElementById('countdown-number');
            if (countdownEl) {
                countdownEl.textContent = String(remainingSeconds);
                if (remainingSeconds <= 10) {
                    countdownEl.style.color = '#fbbf24';
                    countdownEl.style.animation = 'pulse 0.5s ease-in-out infinite, countdown-glow 0.5s ease-in-out infinite';
                }
            }
            if (remainingSeconds <= 0) {
                clearInterval(countdownInterval);
            }
        }, 1000);

        (overlay as any).__countdownInterval = countdownInterval;
    });
}

/**
 * 전역 에러 핸들러 초기화
 */
export function initGlobalErrorHandler(): void {
    window.addEventListener('error', (event) => {
        if (event.message?.includes('Script error')) return;
        const msg = event.error instanceof Error ? translateGeminiError(event.error) : event.message;
        console.error('⚠️ [Global Catch] Uncaught Exception:', event.error);

        if ((window as any).showToast) {
            (window as any).showToast(`⚠️ 시스템 오류: ${msg}`, 'error', 5000);
        }
    });
}

/**
 * 모든 앱 이벤트 핸들러 초기화
 */
export function initAllAppEventHandlers(): void {
    initNoticeModalListener();
    initShutdownCountdownListener();
    initGlobalErrorHandler();
}

// 전역 노출 (하위 호환성)
(window as any).navigateToBannerTab = navigateToBannerTab;

console.log('[AppEventsHandler] 📦 모듈 로드됨!');
