import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NewBadge from './NewBadge';
import { useUnseenNoticeCount } from '../lib/useNoticeAlerts';

/**
 * 우하단 영구 stack — 새소식 / 1:1 문의 / 단톡방 / 유튜브 채널
 * 음악 player와 별도 (음악은 bottom: 200px)
 * 새소식은 안 읽은 공지가 있을 때만 나타나며 홈 공지 영역으로 보낸다.
 */
/**
 * 접힘 상태는 이 브라우저에 남긴다 — 페이지를 옮길 때마다 다시 펴지면
 * 접은 의미가 없다. 기본은 펼침(사장님 2026-08-20 "기본적으로 보여주지만
 * 접었다 폈다 가능해?").
 */
const OPEN_KEY = 'leaderspro.floatStack.open.v1';
const loadOpen = () => {
    try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; }
};

function FloatStack() {
    const navigate = useNavigate();
    const unseenNoticeCount = useUnseenNoticeCount();
    const [open, setOpen] = useState(loadOpen);
    const toggle = () => {
        setOpen((was) => {
            const next = !was;
            try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* 계속 */ }
            return next;
        });
    };
    const baseStyle: React.CSSProperties = {
        position: 'fixed',
        right: 24,
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 20px',
        borderRadius: 50,
        backdropFilter: 'blur(16px)',
        textDecoration: 'none',
        fontFamily: 'inherit',
        minWidth: 160,
        transition: 'transform .2s, box-shadow .2s',
    };

    return (
        <>
            <style>{`
                @media (max-width: 768px) {
                    .lp-float-link {
                        right: 10px !important;
                        width: 42px !important;
                        min-width: 42px !important;
                        height: 42px !important;
                        padding: 0 !important;
                        border-radius: 50% !important;
                        justify-content: center !important;
                        gap: 0 !important;
                    }
                    .lp-float-link span { display: none !important; }
                    .lp-float-link > div { width: 26px !important; height: 26px !important; }
                    .lp-float-chat { bottom: calc(14px + env(safe-area-inset-bottom)) !important; }
                    .lp-float-room { bottom: calc(66px + env(safe-area-inset-bottom)) !important; }
                    .lp-float-youtube { bottom: calc(118px + env(safe-area-inset-bottom)) !important; }
                    .lp-float-notice { bottom: calc(238px + env(safe-area-inset-bottom)) !important; }
                    .lp-float-notice .lp-float-badge { display: inline-flex !important; }
                    .lp-float-toggle { right: 10px !important; }
                    .lp-float-toggle-open { bottom: calc(300px + env(safe-area-inset-bottom)) !important; }
                    .lp-float-toggle-shut { bottom: calc(14px + env(safe-area-inset-bottom)) !important; }
                }

                @media (max-width: 420px) {
                    .lp-float-link {
                        right: 8px !important;
                        width: 38px !important;
                        min-width: 38px !important;
                        height: 38px !important;
                    }
                    .lp-float-link > div { width: 24px !important; height: 24px !important; font-size: 12px !important; }
                }
            `}</style>
            {/* 위→아래 순서: 음악(MusicPlayer bottom:200) / 유튜브(140) / 단톡방(80) / 1:1(20)
                음악이 유튜브보다 위. 전체 stack을 살짝 하단으로 내림. */}
            {open && (
            <>
            <a
                className="lp-float-link lp-float-chat"
                href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener"
                title="1:1 카카오톡 문의"
                style={{
                    ...baseStyle, bottom: 20,
                    background: 'rgba(60,29,0,0.92)',
                    border: '1px solid rgba(254,229,0,0.45)',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
                }}
            >
                <div style={{ width: 26, height: 26, background: '#fee500', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>💬</div>
                <span style={{ color: '#fee500', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>1:1 문의</span>
            </a>

            <a
                className="lp-float-link lp-float-room"
                href="https://open.kakao.com/o/gQ1jRBwh" target="_blank" rel="noopener"
                title="단톡방 바로가기"
                style={{
                    ...baseStyle, bottom: 80,
                    background: 'rgba(254,229,0,0.95)',
                    border: '1px solid rgba(60,29,0,0.5)',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
                }}
            >
                <div style={{ width: 26, height: 26, background: '#1a0a10', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>👥</div>
                <span style={{ color: '#1a0a10', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>단톡방 바로가기</span>
            </a>

            <a
                className="lp-float-link lp-float-youtube"
                href="https://www.youtube.com/@leadernam-s5e" target="_blank" rel="noopener"
                title="공식 유튜브 채널"
                style={{
                    ...baseStyle, bottom: 140,
                    background: 'rgba(255,0,0,0.92)',
                    border: '1px solid rgba(255,100,100,0.5)',
                    boxShadow: '0 6px 24px rgba(255,0,0,0.35)',
                }}
            >
                <div style={{ width: 26, height: 26, background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#ff0000', fontWeight: 900 }}>▶</div>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>유튜브 채널</span>
            </a>
            </>
            )}

            {open && unseenNoticeCount > 0 && (
                <button
                    type="button"
                    className="lp-float-link lp-float-notice"
                    title={`읽지 않은 공지 ${unseenNoticeCount}건`}
                    onClick={() => navigate('/')}
                    style={{
                        ...baseStyle, bottom: 260, cursor: 'pointer',
                        background: 'rgba(124,58,237,0.95)',
                        border: '1px solid rgba(196,181,253,0.55)',
                        boxShadow: '0 6px 24px rgba(124,58,237,0.4)',
                    }}
                >
                    <div style={{ width: 26, height: 26, background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📢</div>
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>새소식</span>
                    <span className="lp-float-badge"><NewBadge count={unseenNoticeCount} size="md" /></span>
                </button>
            )}

            {/*
              * 접기·펴기. 열려 있을 땐 stack 맨 위에, 접으면 맨 아래로 내려온다.
              * 음악 플레이어(bottom:200)와 겹치지 않게 위쪽 자리를 쓴다.
              */}
            <button
                type="button"
                className={`lp-float-toggle lp-float-toggle-${open ? 'open' : 'shut'}`}
                onClick={toggle}
                aria-expanded={open}
                title={open ? '버튼 접기' : '문의·단톡방·유튜브 펴기'}
                style={{
                    position: 'fixed',
                    right: 24,
                    bottom: open ? 320 : 20,
                    zIndex: 10001,
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    background: 'rgba(20,22,28,0.92)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    color: '#fff',
                    fontSize: 15,
                    backdropFilter: 'blur(16px)',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
                    transition: 'bottom .25s ease, transform .2s',
                }}
            >
                <span aria-hidden="true">{open ? '✕' : '💬'}</span>
            </button>
        </>
    );
}

export default FloatStack;
