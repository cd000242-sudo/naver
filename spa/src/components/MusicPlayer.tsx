import { useEffect, useRef, useState } from 'react';

/**
 * MusicPlayer — Layout 안에 mount.
 * React Router는 Layout을 unmount 안 시키므로 페이지 전환에도 음악 끊김 0.
 *
 * 기존 payment-page/music.js 로직을 React로 포팅 (간소화):
 * - YouTube IFrame Player API
 * - Radio playlist (RDf4jS6yW83MU, t=16s)
 * - 자동재생 (브라우저 정책: 첫 인터랙션 필요)
 * - localStorage 시간 저장 (이어재생)
 */

declare global {
    interface Window {
        YT?: any;
        onYouTubeIframeAPIReady?: () => void;
    }
}

const VIDEO_ID = 'f4jS6yW83MU';
const RADIO_LIST = 'RDf4jS6yW83MU';
const START_SEC = 16;
const STORAGE_TIME = 'lp_music_time';
const STORAGE_TIME_TS = 'lp_music_time_ts';
const STORAGE_VOL = 'lp_music_volume';
let musicPlayerMountSeq = 0;

function getResumeTime(): number {
    try {
        const t = parseFloat(localStorage.getItem(STORAGE_TIME) || '0');
        const ts = parseInt(localStorage.getItem(STORAGE_TIME_TS) || '0');
        if (t > 0 && ts > 0 && Date.now() - ts < 30 * 60 * 1000) return t;
    } catch {}
    return START_SEC;
}

function MusicPlayer() {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const playerElementIdRef = useRef('');
    const playerRef = useRef<any>(null);
    const [apiReady, setApiReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [trackTitle, setTrackTitle] = useState('Summer Vibes');

    if (!playerElementIdRef.current) {
        musicPlayerMountSeq += 1;
        playerElementIdRef.current = `lpm-yt-player-${musicPlayerMountSeq}`;
    }

    // YT IFrame API 로드 (한 번만)
    useEffect(() => {
        if (window.YT && window.YT.Player) {
            setApiReady(true);
            return;
        }
        let disposed = false;
        const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
        if (!existing) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        }
        const onReady = () => {
            if (!disposed) setApiReady(true);
        };
        window.onYouTubeIframeAPIReady = onReady;
        return () => {
            disposed = true;
            if (window.onYouTubeIframeAPIReady === onReady) {
                window.onYouTubeIframeAPIReady = undefined;
            }
        };
    }, []);

    // Player 생성 (apiReady 가 true 가 되면)
    useEffect(() => {
        if (!apiReady) return;
        if (playerRef.current) return;

        const host = hostRef.current;
        if (!host) return;

        host.replaceChildren();
        const playerNode = document.createElement('div');
        playerNode.id = playerElementIdRef.current;
        host.appendChild(playerNode);

        playerRef.current = new window.YT.Player(playerNode.id, {
            videoId: VIDEO_ID,
            playerVars: {
                autoplay: 1,
                start: Math.floor(getResumeTime()),
                listType: 'playlist',
                list: RADIO_LIST,
                controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0,
            },
            events: {
                onReady: (e: any) => {
                    const vol = parseInt(localStorage.getItem(STORAGE_VOL) || '40');
                    e.target.setVolume(isNaN(vol) ? 40 : vol);
                    // 자동재생 시도 — 브라우저 정책상 첫 인터랙션 필요할 수 있음
                    try { e.target.playVideo(); } catch {}
                },
                onStateChange: (e: any) => {
                    if (!window.YT) return;
                    if (e.data === window.YT.PlayerState.PLAYING) {
                        setIsPlaying(true);
                        try {
                            const vd = e.target.getVideoData();
                            if (vd && vd.title) setTrackTitle(vd.title);
                        } catch {}
                    } else if (e.data === window.YT.PlayerState.PAUSED) {
                        setIsPlaying(false);
                    }
                    // ENDED는 Radio가 자동 진행 → loadVideoById 호출 안 함
                },
                onError: (e: any) => {
                    console.warn('[MusicPlayer] YT Error:', e?.data);
                    try { playerRef.current?.nextVideo(); } catch {}
                },
            },
        });

        return () => {
            const player = playerRef.current;
            playerRef.current = null;
            try { player?.destroy?.(); } catch {}
            try { host.replaceChildren(); } catch {}
        };
    }, [apiReady]);

    // 첫 인터랙션 시 자동재생 시도 (브라우저 정책 우회)
    useEffect(() => {
        const tryPlay = () => {
            try { playerRef.current?.playVideo(); } catch {}
            ['click', 'touchstart', 'scroll', 'keydown', 'mousemove'].forEach(ev =>
                document.removeEventListener(ev, tryPlay)
            );
        };
        ['click', 'touchstart', 'scroll', 'keydown', 'mousemove'].forEach(ev =>
            document.addEventListener(ev, tryPlay, { once: true, passive: true })
        );
        return () => {
            ['click', 'touchstart', 'scroll', 'keydown', 'mousemove'].forEach(ev =>
                document.removeEventListener(ev, tryPlay)
            );
        };
    }, []);

    // 시간 저장 (0.5s 간격)
    useEffect(() => {
        const id = setInterval(() => {
            try {
                if (!playerRef.current?.getCurrentTime) return;
                const t = playerRef.current.getCurrentTime();
                if (t > 0) {
                    localStorage.setItem(STORAGE_TIME, String(t));
                    localStorage.setItem(STORAGE_TIME_TS, String(Date.now()));
                }
            } catch {}
        }, 500);
        const saveOnHide = () => {
            try {
                if (!playerRef.current?.getCurrentTime) return;
                const t = playerRef.current.getCurrentTime();
                if (t > 0) {
                    localStorage.setItem(STORAGE_TIME, String(t));
                    localStorage.setItem(STORAGE_TIME_TS, String(Date.now()));
                }
            } catch {}
        };
        window.addEventListener('pagehide', saveOnHide, { passive: true });
        window.addEventListener('beforeunload', saveOnHide, { passive: true });
        return () => {
            clearInterval(id);
            window.removeEventListener('pagehide', saveOnHide);
            window.removeEventListener('beforeunload', saveOnHide);
        };
    }, []);

    const toggle = () => {
        if (!playerRef.current) return;
        try {
            if (isPlaying) playerRef.current.pauseVideo();
            else playerRef.current.playVideo();
        } catch {}
    };

    return (
        <>
            <style>{`
                @media (max-width: 768px) {
                    .lp-music-player { right: 12px !important; bottom: 186px !important; }
                    .lp-music-button {
                        width: 46px !important;
                        min-width: 46px !important;
                        height: 46px !important;
                        padding: 0 !important;
                        border-radius: 50% !important;
                        justify-content: center !important;
                        gap: 0 !important;
                    }
                    .lp-music-button span:last-child { display: none !important; }
                }
            `}</style>
            {/* 숨김 YT 플레이어 */}
            <div ref={hostRef} style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />

            {/* 미니 플레이어 FAB — 4개 stack 중 가장 위 (유튜브 위로) */}
            <div
                className="lp-music-player"
                style={{
                    position: 'fixed', bottom: 200, right: 24, zIndex: 10000,
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
                    pointerEvents: 'none',
                }}
            >
                {expanded && (
                    <div style={{
                        background: 'rgba(18,18,26,0.95)', backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,215,0,0.2)', borderRadius: 16,
                        padding: 16, width: 240, pointerEvents: 'auto',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ fontSize: 11, color: '#ffd700', fontWeight: 800, letterSpacing: 1 }}>♪ PLAYLIST</div>
                            <button onClick={() => setExpanded(false)} style={{ background: 'transparent', border: 'none', color: '#a0a0b0', cursor: 'pointer', fontSize: 16 }}>✕</button>
                        </div>
                        <div style={{ background: 'rgba(255,215,0,0.06)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                            <div style={{ fontSize: 10, color: '#a0a0b0', marginBottom: 2 }}>NOW PLAYING</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎵 {trackTitle}</div>
                        </div>
                        <button onClick={toggle} style={{
                            width: '100%', padding: 10, borderRadius: 10,
                            background: 'linear-gradient(135deg, #c9a84c, #d4a012)',
                            color: '#1a0a2e', fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer',
                        }}>
                            {isPlaying ? '⏸ 일시정지' : '▶ 재생'}
                        </button>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 8 }}>🔄 Radio 자동재생</div>
                    </div>
                )}
                <button
                    className="lp-music-button"
                    onClick={() => setExpanded(e => !e)}
                    title="🌸 음악 플레이어"
                    style={{
                        pointerEvents: 'auto',
                        background: 'linear-gradient(135deg, rgba(255,183,197,0.25), rgba(201,168,76,0.25))',
                        border: '1px solid rgba(255,183,197,0.5)',
                        backdropFilter: 'blur(12px)',
                        borderRadius: 28, padding: '10px 16px',
                        color: '#fff', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontWeight: 700, fontSize: 13,
                        boxShadow: '0 4px 20px rgba(255,107,138,0.2)',
                    }}
                >
                    <span style={{ fontSize: 16 }}>{isPlaying ? '⏸' : '♪'}</span>
                    <span>Music</span>
                </button>
            </div>
        </>
    );
}

export default MusicPlayer;
