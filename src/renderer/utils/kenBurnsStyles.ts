/**
 * ✅ [2026-01-25 모듈화] Ken Burns Styles
 * - renderer.ts에서 분리됨
 * - Ken Burns 애니메이션 CSS 스타일 주입
 */

let kenBurnsStylesInjected = false;

/**
 * Ken Burns CSS 애니메이션 스타일 주입
 */
export function ensureKenBurnsStyles(): void {
    if (kenBurnsStylesInjected) return;
    kenBurnsStylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
    @keyframes kenBurnsFloat {
      0% { transform: scale(1.02) translate3d(0px, 0px, 0px); }
      50% { transform: scale(1.08) translate3d(-8px, -6px, 0px); }
      100% { transform: scale(1.12) translate3d(8px, 6px, 0px); }
    }
    .ken-burns-media {
      animation: kenBurnsFloat 8s ease-in-out infinite alternate;
      transform-origin: 50% 50%;
      will-change: transform;
    }
  `;
    document.head.appendChild(style);
}

// 전역 노출 (하위 호환성)
(window as any).ensureKenBurnsStyles = ensureKenBurnsStyles;

console.log('[KenBurnsStyles] 📦 모듈 로드됨!');
