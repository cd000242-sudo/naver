import { useEffect } from 'react';

const PETAL_COUNT = 30;

function SakuraPetals() {
    useEffect(() => {
        const container = document.getElementById('lpm-petals');
        if (!container || container.children.length > 0) return;
        for (let i = 0; i < PETAL_COUNT; i++) {
            const petal = document.createElement('div');
            const size = Math.random() * 14 + 8;
            const isOdd = i % 2 === 1;
            Object.assign(petal.style, {
                position: 'absolute',
                top: '-60px',
                width: size + 'px',
                height: size + 'px',
                background: isOdd
                    ? 'radial-gradient(ellipse at 30% 30%, #ffd4e0 0%, #ffaac4 40%, #ff85a1 100%)'
                    : 'radial-gradient(ellipse at 30% 30%, #ffb7c5 0%, #ff8fa3 40%, #ff6b8a 100%)',
                borderRadius: isOdd ? '0 50% 50% 50%' : '50% 0 50% 50%',
                left: Math.random() * 100 + '%',
                animation: `lpmPetalFall ${Math.random() * 8 + 7}s linear infinite`,
                animationDelay: Math.random() * 10 + 's',
                filter: 'blur(0.5px)',
                boxShadow: '0 0 6px rgba(255,183,197,0.3)',
                opacity: '0',
            });
            container.appendChild(petal);
        }
    }, []);

    return (
        <>
            <style>{`
                @keyframes lpmPetalFall {
                    0%   { opacity: 0; transform: translateX(0) rotate(0deg) scale(0.8); }
                    10%  { opacity: 0.9; }
                    90%  { opacity: 0.6; }
                    100% { opacity: 0; transform: translateX(120px) rotate(720deg) scale(0.4) translateY(110vh); }
                }
            `}</style>
            <div id="lpm-petals" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }} />
        </>
    );
}

export default SakuraPetals;
