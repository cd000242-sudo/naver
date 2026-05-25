import { useEffect, useRef } from 'react';

/**
 * 파티클 캔버스 — 메인 페이지 배경.
 * 80개 파티클, 70% gold + 30% white. 위로 천천히 흐름.
 */
function ParticlesCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let w = 0, h = 0;
        const particles: Array<{
            x: number; y: number; size: number;
            speedY: number; speedX: number; opacity: number; gold: boolean;
        }> = [];

        function resize() {
            if (!canvas) return;
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight * 3;
        }
        resize();
        window.addEventListener('resize', resize);

        function makeParticle() {
            return {
                x: Math.random() * w,
                y: Math.random() * h,
                size: Math.random() * 2 + 0.5,
                speedY: -(Math.random() * 0.3 + 0.1),
                speedX: (Math.random() - 0.5) * 0.2,
                opacity: Math.random() * 0.5 + 0.1,
                gold: Math.random() > 0.3,
            };
        }
        for (let i = 0; i < 80; i++) particles.push(makeParticle());

        let raf = 0;
        function animate() {
            if (!ctx) return;
            ctx.clearRect(0, 0, w, h);
            for (const p of particles) {
                p.y += p.speedY;
                p.x += p.speedX;
                p.opacity += (Math.random() - 0.5) * 0.01;
                p.opacity = Math.max(0.05, Math.min(0.6, p.opacity));
                if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.gold ? `rgba(201, 168, 76, ${p.opacity})` : `rgba(255, 255, 255, ${p.opacity * 0.4})`;
                ctx.fill();
            }
            raf = requestAnimationFrame(animate);
        }
        animate();

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0, left: 0,
                width: '100%', height: '100%',
                pointerEvents: 'none',
                zIndex: 0,
            }}
        />
    );
}

export default ParticlesCanvas;
