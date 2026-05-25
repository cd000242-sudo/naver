import { useEffect, useRef, useState } from 'react';

interface Props {
    target: number;
    label: string;
}

/**
 * Trust Bar 의 단일 카운터. 화면에 들어오면 60프레임 동안 0 → target 증가.
 */
function TrustCounter({ target, label }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [value, setValue] = useState(0);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        let current = 0;
                        const step = Math.ceil(target / 60);
                        const timer = setInterval(() => {
                            current += step;
                            if (current >= target) {
                                current = target;
                                clearInterval(timer);
                            }
                            setValue(current);
                        }, 30);
                        observer.unobserve(el);
                    }
                });
            },
            { threshold: 0.5 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [target]);

    return (
        <div ref={ref} style={{ textAlign: 'center', padding: '0 24px' }}>
            <div style={{
                fontSize: 'clamp(28px, 4vw, 42px)',
                fontWeight: 900,
                background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-light))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                marginBottom: 4,
                fontVariantNumeric: 'tabular-nums',
            }}>{value.toLocaleString()}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, letterSpacing: 1 }}>{label}</div>
        </div>
    );
}

export default TrustCounter;
