import { useEffect, useRef, useState } from 'react';
import { fetchSiteContent } from '../lib/siteOps';

declare global {
    interface Window {
        YT?: any;
        onYouTubeIframeAPIReady?: () => void;
    }
}

type MusicConfig = {
    title: string;
    videoId: string;
    playlistId: string;
    startSec: number;
    audioUrl: string;
    enabled: boolean;
};

const DEFAULT_MUSIC: MusicConfig = {
    title: 'Summer Vibes',
    videoId: 'f4jS6yW83MU',
    playlistId: 'RDf4jS6yW83MU',
    startSec: 16,
    audioUrl: '',
    enabled: true,
};

const STORAGE_TIME = 'lp_music_time';
const STORAGE_TIME_TS = 'lp_music_time_ts';
const STORAGE_VOL = 'lp_music_volume';
let musicPlayerMountSeq = 0;

function normalizeMusicConfig(input: unknown): MusicConfig {
    const value = (input || {}) as Partial<MusicConfig>;
    const start = Number(value.startSec);
    return {
        title: String(value.title || DEFAULT_MUSIC.title),
        videoId: String(value.videoId || DEFAULT_MUSIC.videoId),
        playlistId: String(value.playlistId || DEFAULT_MUSIC.playlistId),
        startSec: Number.isFinite(start) && start >= 0 ? start : DEFAULT_MUSIC.startSec,
        audioUrl: String(value.audioUrl || ''),
        enabled: value.enabled !== false,
    };
}

function getResumeTime(defaultStart: number): number {
    try {
        const t = parseFloat(localStorage.getItem(STORAGE_TIME) || '0');
        const ts = parseInt(localStorage.getItem(STORAGE_TIME_TS) || '0', 10);
        if (t > 0 && ts > 0 && Date.now() - ts < 30 * 60 * 1000) return t;
    } catch {}
    return defaultStart;
}

function MusicPlayer() {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const playerElementIdRef = useRef('');
    const playerRef = useRef<any>(null);
    const [musicConfig, setMusicConfig] = useState<MusicConfig>(DEFAULT_MUSIC);
    const [shouldLoadApi, setShouldLoadApi] = useState(false);
    const [apiReady, setApiReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [trackTitle, setTrackTitle] = useState(DEFAULT_MUSIC.title);

    if (!playerElementIdRef.current) {
        musicPlayerMountSeq += 1;
        playerElementIdRef.current = `lpm-yt-player-${musicPlayerMountSeq}`;
    }

    useEffect(() => {
        let disposed = false;
        fetchSiteContent().then((content) => {
            if (disposed) return;
            const next = normalizeMusicConfig(content?.theme?.music);
            setMusicConfig(next);
            setTrackTitle(next.title);
        });
        return () => {
            disposed = true;
        };
    }, []);

    useEffect(() => {
        if (!musicConfig.enabled || musicConfig.audioUrl) return;
        const loadWhenIdle = () => setShouldLoadApi(true);
        const idleWindow = window as any;
        const idleId = 'requestIdleCallback' in idleWindow
            ? idleWindow.requestIdleCallback(loadWhenIdle, { timeout: 9000 })
            : window.setTimeout(loadWhenIdle, 7000);
        return () => {
            if ('cancelIdleCallback' in idleWindow && typeof idleId === 'number') idleWindow.cancelIdleCallback(idleId);
            else window.clearTimeout(idleId);
        };
    }, [musicConfig.audioUrl, musicConfig.enabled]);

    useEffect(() => {
        if (!musicConfig.enabled || musicConfig.audioUrl || !shouldLoadApi) return;
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
            if (window.onYouTubeIframeAPIReady === onReady) window.onYouTubeIframeAPIReady = undefined;
        };
    }, [musicConfig.audioUrl, musicConfig.enabled, shouldLoadApi]);

    useEffect(() => {
        if (!apiReady || musicConfig.audioUrl || !musicConfig.enabled) return;
        if (playerRef.current) return;

        const host = hostRef.current;
        if (!host) return;

        host.replaceChildren();
        const playerNode = document.createElement('div');
        playerNode.id = playerElementIdRef.current;
        host.appendChild(playerNode);

        playerRef.current = new window.YT.Player(playerNode.id, {
            videoId: musicConfig.videoId,
            playerVars: {
                autoplay: 1,
                start: Math.floor(getResumeTime(musicConfig.startSec)),
                listType: 'playlist',
                list: musicConfig.playlistId,
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                rel: 0,
            },
            events: {
                onReady: (event: any) => {
                    const vol = parseInt(localStorage.getItem(STORAGE_VOL) || '40', 10);
                    event.target.setVolume(isNaN(vol) ? 40 : vol);
                    try { event.target.playVideo(); } catch {}
                },
                onStateChange: (event: any) => {
                    if (!window.YT) return;
                    if (event.data === window.YT.PlayerState.PLAYING) {
                        setIsPlaying(true);
                        try {
                            const videoData = event.target.getVideoData();
                            setTrackTitle(videoData?.title || musicConfig.title);
                        } catch {
                            setTrackTitle(musicConfig.title);
                        }
                    } else if (event.data === window.YT.PlayerState.PAUSED) {
                        setIsPlaying(false);
                    }
                },
                onError: (event: any) => {
                    console.warn('[MusicPlayer] YouTube error:', event?.data);
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
    }, [apiReady, musicConfig.audioUrl, musicConfig.enabled, musicConfig.playlistId, musicConfig.startSec, musicConfig.title, musicConfig.videoId]);

    useEffect(() => {
        if (!musicConfig.audioUrl) return;
        setTrackTitle(musicConfig.title);
        try {
            const vol = parseInt(localStorage.getItem(STORAGE_VOL) || '40', 10);
            if (audioRef.current) audioRef.current.volume = (isNaN(vol) ? 40 : vol) / 100;
        } catch {}
    }, [musicConfig.audioUrl, musicConfig.title]);

    useEffect(() => {
        const tryPlay = () => {
            try {
                if (musicConfig.audioUrl && audioRef.current) {
                    audioRef.current.play().catch(() => undefined);
                    return;
                }
                playerRef.current?.playVideo?.();
            } catch {}
            ['click', 'touchstart', 'scroll', 'keydown', 'mousemove'].forEach((eventName) =>
                document.removeEventListener(eventName, tryPlay)
            );
        };
        ['click', 'touchstart', 'scroll', 'keydown', 'mousemove'].forEach((eventName) =>
            document.addEventListener(eventName, tryPlay, { once: true, passive: true })
        );
        return () => {
            ['click', 'touchstart', 'scroll', 'keydown', 'mousemove'].forEach((eventName) =>
                document.removeEventListener(eventName, tryPlay)
            );
        };
    }, [musicConfig.audioUrl]);

    useEffect(() => {
        const id = window.setInterval(() => {
            try {
                if (musicConfig.audioUrl) {
                    const t = audioRef.current?.currentTime || 0;
                    if (t > 0) {
                        localStorage.setItem(STORAGE_TIME, String(t));
                        localStorage.setItem(STORAGE_TIME_TS, String(Date.now()));
                    }
                    return;
                }
                if (!playerRef.current?.getCurrentTime) return;
                const t = playerRef.current.getCurrentTime();
                if (t > 0) {
                    localStorage.setItem(STORAGE_TIME, String(t));
                    localStorage.setItem(STORAGE_TIME_TS, String(Date.now()));
                }
            } catch {}
        }, 5000);
        return () => window.clearInterval(id);
    }, [musicConfig.audioUrl]);

    const toggle = () => {
        if (musicConfig.audioUrl) {
            const audio = audioRef.current;
            if (!audio) return;
            if (isPlaying) {
                audio.pause();
                setIsPlaying(false);
            } else {
                audio.play().then(() => setIsPlaying(true)).catch(() => undefined);
            }
            setExpanded(true);
            return;
        }
        if (!playerRef.current) {
            setShouldLoadApi(true);
            setExpanded(true);
            return;
        }
        try {
            if (isPlaying) playerRef.current.pauseVideo();
            else playerRef.current.playVideo();
        } catch {}
    };

    if (!musicConfig.enabled) return null;

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
            <div ref={hostRef} style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
            {musicConfig.audioUrl && (
                <audio
                    ref={audioRef}
                    src={musicConfig.audioUrl}
                    loop
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    style={{ display: 'none' }}
                />
            )}
            <div
                className="lp-music-player"
                style={{
                    position: 'fixed',
                    bottom: 200,
                    right: 24,
                    zIndex: 10000,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 8,
                    pointerEvents: 'none',
                }}
            >
                {expanded && (
                    <div style={{
                        background: 'rgba(18,18,26,0.95)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,215,0,0.2)',
                        borderRadius: 16,
                        padding: 16,
                        width: 240,
                        pointerEvents: 'auto',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ fontSize: 11, color: '#ffd700', fontWeight: 800, letterSpacing: 0 }}>재생 목록</div>
                            <button onClick={() => setExpanded(false)} style={{ background: 'transparent', border: 'none', color: '#a0a0b0', cursor: 'pointer', fontSize: 16 }}>x</button>
                        </div>
                        <div style={{ background: 'rgba(255,215,0,0.06)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                            <div style={{ fontSize: 10, color: '#a0a0b0', marginBottom: 2 }}>지금 재생</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trackTitle}</div>
                        </div>
                        <button onClick={toggle} style={{
                            width: '100%',
                            padding: 10,
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #c9a84c, #d4a012)',
                            color: '#1a0a2e',
                            fontWeight: 800,
                            fontSize: 14,
                            border: 'none',
                            cursor: 'pointer',
                        }}>
                            {isPlaying ? '일시정지' : '재생'}
                        </button>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 8 }}>관리자 사이트 편집에서 음악을 바꿀 수 있습니다.</div>
                    </div>
                )}
                <button
                    className="lp-music-button"
                    onClick={() => {
                        setExpanded((value) => !value);
                        if (!isPlaying) toggle();
                    }}
                    title="음악 플레이어"
                    style={{
                        pointerEvents: 'auto',
                        background: 'linear-gradient(135deg, rgba(255,183,197,0.25), rgba(201,168,76,0.25))',
                        border: '1px solid rgba(255,183,197,0.5)',
                        backdropFilter: 'blur(12px)',
                        borderRadius: 28,
                        padding: '10px 16px',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 700,
                        fontSize: 13,
                        boxShadow: '0 4px 20px rgba(255,107,138,0.2)',
                    }}
                >
                    <span style={{ fontSize: 16 }}>{isPlaying ? '일시정지' : '재생'}</span>
                    <span>음악</span>
                </button>
            </div>
        </>
    );
}

export default MusicPlayer;
