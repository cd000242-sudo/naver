import { useEffect } from 'react';

/**
 * SummerEffect — payment-page/summer-theme.{css,js} 의 sun-dot 입자 + 하단 파도 SVG 를 React 로 포팅.
 * 벚꽃잎(SakuraPetals) 대신 사용.
 */
function SummerEffect() {
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let cancelled = false;
        const createParticles = () => {
            if (cancelled) return;
            const container = document.getElementById('lpm-summer-particles');
            if (!container || container.children.length > 0) return;
            const count = window.innerWidth < 768 ? 8 : 14;
            for (let i = 0; i < count; i++) {
                const dot = document.createElement('div');
                const small = Math.random() < 0.45;
                const startX = Math.random() * 100;
                const startY = 100 + Math.random() * 20;
                const duration = 14 + Math.random() * 20;
                const delay = -Math.random() * duration;
                const size = small ? 3 : 5;
                Object.assign(dot.style, {
                    position: 'absolute',
                    width: size + 'px',
                    height: size + 'px',
                    borderRadius: '50%',
                    background: small
                        ? 'radial-gradient(circle at 30% 30%, #ffffff 0%, #fff2cc 60%, rgba(255,242,204,0) 100%)'
                        : 'radial-gradient(circle at 30% 30%, #ffffff 0%, #ffd966 60%, rgba(255,217,102,0) 100%)',
                    boxShadow: small
                        ? '0 0 6px rgba(255,242,204,0.5)'
                        : '0 0 10px rgba(255,217,102,0.55), 0 0 20px rgba(255,217,102,0.3)',
                    opacity: '0',
                    left: startX + '%',
                    top: startY + 'vh',
                    animation: `lpmSunFloat ${duration}s linear infinite`,
                    animationDelay: delay + 's',
                });
                container.appendChild(dot);
            }
        };
        const idleWindow = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
            cancelIdleCallback?: (id: number) => void;
        };
        const id = idleWindow.requestIdleCallback
            ? idleWindow.requestIdleCallback(createParticles, { timeout: 2500 })
            : window.setTimeout(createParticles, 1800);
        return () => {
            cancelled = true;
            if (idleWindow.cancelIdleCallback && typeof id === 'number') idleWindow.cancelIdleCallback(id);
            else window.clearTimeout(id);
        };
    }, []);

    return (
        <>
            <style>{`
                @keyframes lpmSunFloat {
                    0%   { opacity: 0; transform: translate(0, 0) scale(0.6); }
                    10%  { opacity: 0.85; }
                    50%  { transform: translate(25px, -40vh) scale(1); }
                    90%  { opacity: 0.5; }
                    100% { opacity: 0; transform: translate(60px, -110vh) scale(0.4); }
                }
                @keyframes lpmWaveSlide {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(-30px); }
                }
                .lpm-wave-1 { animation: lpmWaveSlide 14s ease-in-out infinite; }
                .lpm-wave-2 { animation: lpmWaveSlide 22s ease-in-out infinite reverse; opacity: 0.7; }
                .lpm-wave-3 { animation: lpmWaveSlide 30s ease-in-out infinite; opacity: 0.5; }
            `}</style>

            {/* sun particles only — 사용자 요청으로 하단 파도 제거 */}
            <div
                id="lpm-summer-particles"
                style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' }}
            />
        </>
    );
}

export default SummerEffect;
