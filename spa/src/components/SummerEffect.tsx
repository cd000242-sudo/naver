import { useEffect } from 'react';

/**
 * SummerEffect — payment-page/summer-theme.{css,js} 의 sun-dot 입자 + 하단 파도 SVG 를 React 로 포팅.
 * 벚꽃잎(SakuraPetals) 대신 사용.
 */
function SummerEffect() {
    useEffect(() => {
        const container = document.getElementById('lpm-summer-particles');
        if (!container || container.children.length > 0) return;
        const count = window.innerWidth < 768 ? 14 : 22;
        for (let i = 0; i < count; i++) {
            const dot = document.createElement('div');
            const small = Math.random() < 0.45;
            const startX = Math.random() * 100;
            const startY = 100 + Math.random() * 20;
            const duration = 12 + Math.random() * 18;
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

            {/* sun particles */}
            <div
                id="lpm-summer-particles"
                style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' }}
            />

            {/* bottom ocean waves */}
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 130, pointerEvents: 'none', zIndex: 1, opacity: 0.55 }} aria-hidden="true">
                <svg viewBox="0 0 1440 140" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', display: 'block' }}>
                    <defs>
                        <linearGradient id="summerWaveGrad1" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4dd0e1" stopOpacity="0.6" />
                            <stop offset="100%" stopColor="#00838f" stopOpacity="0.85" />
                        </linearGradient>
                        <linearGradient id="summerWaveGrad2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#80deea" stopOpacity="0.45" />
                            <stop offset="100%" stopColor="#0097a7" stopOpacity="0.7" />
                        </linearGradient>
                        <linearGradient id="summerWaveGrad3" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#b2ebf2" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#26c6da" stopOpacity="0.55" />
                        </linearGradient>
                    </defs>
                    <path className="lpm-wave-3" fill="url(#summerWaveGrad3)" d="M0,80 C240,30 480,130 720,80 C960,30 1200,130 1440,80 L1440,140 L0,140 Z" />
                    <path className="lpm-wave-2" fill="url(#summerWaveGrad2)" d="M0,95 C200,55 400,135 720,95 C1040,55 1240,135 1440,95 L1440,140 L0,140 Z" />
                    <path className="lpm-wave-1" fill="url(#summerWaveGrad1)" d="M0,110 C240,75 480,140 720,110 C960,75 1200,140 1440,110 L1440,140 L0,140 Z" />
                </svg>
            </div>
        </>
    );
}

export default SummerEffect;
