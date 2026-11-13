import { useEffect, useRef, useState } from 'react';
import { fetchSiteContent } from '../lib/siteOps';
import { light, lightRadius, motion, type } from '../styles/tokens';
import { ShellIcon } from './ShellIcons';

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
    title: '배경음악',
    videoId: 'f4jS6yW83MU',
    playlistId: 'RDf4jS6yW83MU',
    startSec: 16,
    audioUrl: '',
    enabled: true,
};

const STORAGE_TIME = 'lp_music_time';
const STORAGE_TIME_TS = 'lp_music_time_ts';
const STORAGE_VOL = 'lp_music_volume';
/*
 * 이번 창에서 껐는가. sessionStorage 라 탭을 닫으면 사라진다 —
 * "한 번 노래 끄면 창을 다시 열기 전까지 안 나오게"(사장님 2026-08-20).
 * localStorage 로 두면 영영 안 나와서 껐다는 걸 잊은 사람이 고장으로 읽는다.
 */
const SESSION_OFF = 'lp_music_off_this_session';
const isOffThisSession = () => {
    try { return sessionStorage.getItem(SESSION_OFF) === '1'; } catch { return false; }
};
const setOffThisSession = (off: boolean) => {
    try {
        if (off) sessionStorage.setItem(SESSION_OFF, '1');
        else sessionStorage.removeItem(SESSION_OFF);
    } catch { /* 계속 */ }
};
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

/** 관리자 미리보기 iframe(src="/?nomusic=1")처럼 음악을 재생하면 안 되는 임베드 컨텍스트. */
export function isMusicSuppressed(): boolean {
    try {
        if (new URLSearchParams(window.location.search).has('nomusic')) return true;
        // 어떤 형태로든 iframe 안에 임베드됐으면(미리보기) 자동재생하지 않는다.
        if (window.self !== window.top) return true;
    } catch {
        return true; // cross-origin 접근 예외 = iframe 안 → 무음
    }
    return false;
}

/**
 * hidden 이면 보이는 부분만 감춘다 — **소리는 계속 난다**.
 * 접기는 "우하단을 치워 달라"는 뜻이지 "음악을 꺼 달라"가 아니다.
 * 오디오 엘리먼트는 이 아래 별도로 렌더되어 그대로 살아 있다.
 */
function MusicPlayer({ hidden = false }: { hidden?: boolean } = {}) {
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
        const loadConfig = () => {
            fetchSiteContent().then((content) => {
                if (disposed) return;
                const next = normalizeMusicConfig(content?.theme?.music);
                setMusicConfig(next);
                setTrackTitle(next.title);
            });
        };
        const idleWindow = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
            cancelIdleCallback?: (id: number) => void;
        };
        const id = idleWindow.requestIdleCallback
            ? idleWindow.requestIdleCallback(loadConfig, { timeout: 4000 })
            : window.setTimeout(loadConfig, 2500);
        return () => {
            disposed = true;
            if (idleWindow.cancelIdleCallback && typeof id === 'number') idleWindow.cancelIdleCallback(id);
            else window.clearTimeout(id);
        };
    }, []);

    useEffect(() => {
        if (!musicConfig.enabled || musicConfig.audioUrl) return;
        // 이번 창에서 이미 껐으면 스스로 켜지지 않는다. 버튼을 누르면 그때 켜진다.
        if (isOffThisSession()) return;
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
                    /*
                     * 재생목록을 섞는다. 안 섞으면 고정된 videoId 로 시작해서
                     * 들어올 때마다 같은 노래가 나온다(사장님 2026-08-20).
                     * 섞은 뒤 임의의 자리에서 시작해 회차마다 달라지게 한다.
                     */
                    try {
                        event.target.setShuffle(true);
                        const list = event.target.getPlaylist?.() || [];
                        if (list.length > 1) event.target.playVideoAt(Math.floor(Math.random() * list.length));
                        else event.target.playVideo();
                    } catch {
                        try { event.target.playVideo(); } catch { /* 계속 */ }
                    }
                },
                onStateChange: (event: any) => {
                    if (!window.YT) return;
                    if (event.data === window.YT.PlayerState.PLAYING) {
                        setIsPlaying(true);
                        setOffThisSession(false);
                        // 섞으면 곡이 바뀌므로 설정에 적힌 제목이 아니라 지금 나오는 곡을 적는다.
                        let now = '';
                        try { now = String(event.target.getVideoData?.()?.title || ''); } catch { /* 계속 */ }
                        setTrackTitle(now || musicConfig.title || DEFAULT_MUSIC.title);
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
            if (isPlaying) {
                playerRef.current.pauseVideo();
                setOffThisSession(true); // 사람이 껐다 — 이번 창에서는 스스로 안 켜진다
            } else {
                setOffThisSession(false);
                playerRef.current.playVideo();
            }
        } catch { /* 계속 */ }
    };

    if (!musicConfig.enabled) return null;

    return (
        <>
            <style>{`
                .lp-music-player button:hover { border-color: ${light.lineStrong} !important; }
                .lp-music-player button:focus-visible { outline: 2px solid ${light.text}; outline-offset: 2px; }
                @media (max-width: 768px) {
                    .lp-music-player { right: 12px !important; }
                    .lp-music-button {
                        width: 44px !important;
                        min-width: 44px !important;
                        padding: 0 !important;
                        justify-content: center !important;
                        gap: 0 !important;
                    }
                    .lp-music-button .lp-music-label { display: none !important; }
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
                    display: hidden ? 'none' : 'flex',
                    position: 'fixed',
                    // Fourth slot of the floating stack (FloatStack: 20 + 3 * 52).
                    bottom: 'calc(176px + env(safe-area-inset-bottom, 0px))',
                    right: 24,
                    zIndex: 10000,
                    // The panel opens to the left of the button so it never covers the stack above it.
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    gap: 8,
                    pointerEvents: 'none',
                }}
            >
                {expanded && (
                    <div style={{
                        background: light.surface,
                        border: `1px solid ${light.line}`,
                        borderRadius: lightRadius.card,
                        padding: 16,
                        width: 240,
                        pointerEvents: 'auto',
                        boxShadow: light.shadowFloat,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: type.small, color: light.text, fontWeight: 600 }}>재생 목록</div>
                            <button
                                type="button"
                                onClick={() => setExpanded(false)}
                                aria-label="재생 목록 닫기"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 44, height: 44, margin: '-8px -8px -8px 0', padding: 0,
                                    background: 'transparent', border: '1px solid transparent', borderRadius: lightRadius.control,
                                    color: light.textSecondary, cursor: 'pointer',
                                }}
                            >
                                <ShellIcon name="close" />
                            </button>
                        </div>
                        <div style={{ background: light.raised, borderRadius: lightRadius.control, padding: 12, marginBottom: 12 }}>
                            <div style={{ fontSize: type.meta, color: light.textMuted, marginBottom: 4 }}>지금 재생</div>
                            <div style={{ fontSize: type.small, fontWeight: 500, color: light.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trackTitle}</div>
                        </div>
                        <button type="button" onClick={toggle} style={{
                            width: '100%',
                            minHeight: 44,
                            padding: '0 16px',
                            borderRadius: lightRadius.control,
                            background: light.btn,
                            color: light.onBtn,
                            fontWeight: 600,
                            fontSize: type.small,
                            border: '1px solid transparent',
                            cursor: 'pointer',
                        }}>
                            {isPlaying ? '일시정지' : '재생'}
                        </button>
                        <div style={{ fontSize: type.meta, color: light.textMuted, textAlign: 'center', marginTop: 8 }}>관리자 사이트 편집에서 음악을 바꿀 수 있습니다.</div>
                    </div>
                )}
                <button
                    type="button"
                    className="lp-music-button"
                    onClick={() => {
                        setExpanded((value) => !value);
                        if (!isPlaying) toggle();
                    }}
                    title="음악 플레이어"
                    aria-label={isPlaying ? '음악 플레이어, 재생 중' : '음악 플레이어'}
                    aria-expanded={expanded}
                    /*
                     * Light surface with one quiet line, like the other floating buttons.
                     * State is told by the small mark on the right, not by the button colour:
                     * gold while playing, neutral when stopped.
                     */
                    style={{
                        pointerEvents: 'auto',
                        boxSizing: 'border-box',
                        height: 44,
                        minWidth: 160,
                        background: light.surface,
                        border: `1px solid ${light.line}`,
                        borderRadius: lightRadius.control,
                        padding: '0 16px',
                        color: light.text,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 500,
                        fontSize: type.small,
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        boxShadow: light.shadowFloat,
                        transition: `border-color ${motion.fast} ${motion.ease}`,
                    }}
                >
                    <ShellIcon name="music" />
                    <span className="lp-music-label">{isPlaying ? '음악 재생 중' : '음악'}</span>
                    <span
                        aria-hidden="true"
                        className="lp-music-label"
                        style={{
                            width: 8, height: 8, borderRadius: 2, flex: 'none', marginLeft: 'auto',
                            background: isPlaying ? light.accent : light.lineStrong,
                            transition: `background-color ${motion.fast} ${motion.ease}`,
                        }}
                    />
                </button>
            </div>
        </>
    );
}

export default MusicPlayer;
