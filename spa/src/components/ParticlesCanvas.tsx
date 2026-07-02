import { useEffect, useRef } from 'react';

/**
 * 파티클 캔버스 — 메인 페이지 배경.
 * 첫 화면 이후에만 붙는 가벼운 배경 파티클.
 */
function ParticlesCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
        if (connection?.saveData || /2g/i.test(connection?.effectiveType || '')) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const context = ctx;

        let w = 0, h = 0, dpr = 1;
        const particles: Array<{
            x: number; y: number; size: number;
            speedY: number; speedX: number; opacity: number; gold: boolean;
        }> = [];

        function resize() {
            if (!canvas) return;
            dpr = Math.min(window.devicePixelRatio || 1, 1);
            w = window.innerWidth;
            h = window.innerHeight;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
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
        const particleCount = window.innerWidth < 768 ? 10 : (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 ? 20 : 34);
        for (let i = 0; i < particleCount; i++) particles.push(makeParticle());

        let raf = 0;
        let visible = !document.hidden;
        function animate() {
            if (!visible) return;
            context.clearRect(0, 0, w, h);
            for (const p of particles) {
                p.y += p.speedY;
                p.x += p.speedX;
                p.opacity += (Math.random() - 0.5) * 0.01;
                p.opacity = Math.max(0.05, Math.min(0.6, p.opacity));
                if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
                context.beginPath();
                context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                context.fillStyle = p.gold ? `rgba(201, 168, 76, ${p.opacity})` : `rgba(255, 255, 255, ${p.opacity * 0.4})`;
                context.fill();
            }
            raf = requestAnimationFrame(animate);
        }

        function onVisibilityChange() {
            visible = !document.hidden;
            if (visible && !raf) animate();
            if (!visible) {
                cancelAnimationFrame(raf);
                raf = 0;
            }
        }

        animate();
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', onVisibilityChange);
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
