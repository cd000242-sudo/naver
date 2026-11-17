import { useEffect, useRef } from 'react';

/**
 * A silent product clip that plays only while it is on screen.
 *
 * Nothing is downloaded before that (preload="none", the poster stands in), so several clips on one page cost
 * nothing until the visitor scrolls to them. With reduced motion the clip never starts by itself; a tap or click
 * starts and stops it in every case.
 */
export default function InViewClip({ src, poster, label, className }: {
    src: string; poster: string; label: string; className?: string;
}) {
    const ref = useRef<HTMLVideoElement | null>(null);
    useEffect(() => {
        const video = ref.current;
        if (!video || typeof IntersectionObserver === 'undefined') return undefined;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) void video.play().catch(() => { /* autoplay refused: the poster stays */ });
            else video.pause();
        }, { threshold: 0.35 });
        observer.observe(video);
        return () => observer.disconnect();
    }, [src]);
    return (
        <video
            ref={ref}
            className={className}
            src={src}
            poster={poster}
            muted
            loop
            playsInline
            preload="none"
            aria-label={label}
            onClick={(event) => {
                const video = event.currentTarget;
                if (video.paused) void video.play().catch(() => { /* stays paused */ });
                else video.pause();
            }}
        />
    );
}
