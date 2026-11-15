import { useNavigate } from 'react-router-dom';
import NewBadge from './NewBadge';
import { ShellIcon } from './ShellIcons';
import { useUnseenNoticeCount } from '../lib/useNoticeAlerts';
import { light, lightRadius, motion, type } from '../styles/tokens';

/**
 * 우하단 영구 stack — 새소식 / 1:1 문의 / 단톡방 / 유튜브 채널
 * 음악 player와 별도 (음악은 네 번째 칸, MusicPlayer 의 bottom 과 맞춘다)
 * 새소식은 안 읽은 공지가 있을 때만 나타나며 홈 공지 영역으로 보낸다.
 */
/**
 * 접힘 상태는 Layout 이 들고 있다 — 음악 플레이어와 같이 접혀야 하는데
 * 그건 별도 컴포넌트라 이 안에 두면 공유가 안 된다(사장님 지적 2026-08-20
 * "음악 재생 버튼은 같이 안 접히네?").
 */

/** One slot = 44px button + 8px gap. Slot 3 belongs to MusicPlayer (bottom 176). */
const slotBottom = (slot: number) => `calc(${20 + slot * 52}px + env(safe-area-inset-bottom, 0px))`;

const TRANSITION = `background-color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease}`;

function FloatStack({ open, onToggle }: { open: boolean; onToggle: () => void }) {
    const navigate = useNavigate();
    const unseenNoticeCount = useUnseenNoticeCount();
    const hasNotice = unseenNoticeCount > 0;
    const baseStyle: React.CSSProperties = {
        position: 'fixed',
        right: 24,
        zIndex: 10001,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 44,
        minWidth: 160,
        padding: '0 16px',
        borderRadius: lightRadius.control,
        background: light.surface,
        border: `1px solid ${light.line}`,
        boxShadow: light.shadowFloat,
        color: light.text,
        fontFamily: 'inherit',
        fontSize: type.small,
        fontWeight: 500,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        textDecoration: 'none',
        transition: TRANSITION,
    };
    const toggleLabel = open ? '버튼 접기' : '문의·단톡방·유튜브 펴기';

    return (
        <>
            <style>{`
                .lp-float-link:hover, .lp-float-toggle:hover { background: ${light.raised} !important; border-color: ${light.lineStrong} !important; }
                .lp-float-link:focus-visible, .lp-float-toggle:focus-visible { outline: 2px solid ${light.text}; outline-offset: 2px; }
                @media (max-width: 768px) {
                    .lp-float-link {
                        right: 12px !important;
                        width: 44px !important;
                        min-width: 44px !important;
                        padding: 0 !important;
                        justify-content: center !important;
                        gap: 0 !important;
                    }
                    .lp-float-link .lp-float-label { display: none !important; }
                    .lp-float-notice .lp-float-badge { position: absolute; top: -4px; right: -4px; }
                    .lp-float-toggle { right: 12px !important; }
                }
            `}</style>
            {/* 아래→위 순서: 1:1(0) / 단톡방(1) / 유튜브(2) / 음악(3, MusicPlayer) / 새소식(4) / 접기 */}
            {open && (
            <>
            <a
                className="lp-float-link lp-float-chat"
                href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener"
                title="1:1 카카오톡 문의"
                aria-label="1:1 카카오톡 문의"
                style={{ ...baseStyle, bottom: slotBottom(0) }}
            >
                <ShellIcon name="chat" />
                <span className="lp-float-label">1:1 문의</span>
            </a>

            <a
                className="lp-float-link lp-float-room"
                href="https://open.kakao.com/o/gQ1jRBwh" target="_blank" rel="noopener"
                title="단톡방 바로가기"
                aria-label="단톡방 바로가기"
                style={{ ...baseStyle, bottom: slotBottom(1) }}
            >
                <ShellIcon name="people" />
                <span className="lp-float-label">단톡방 바로가기</span>
            </a>

            <a
                className="lp-float-link lp-float-youtube"
                href="https://www.youtube.com/@leadernam-s5e" target="_blank" rel="noopener"
                title="공식 유튜브 채널"
                aria-label="공식 유튜브 채널"
                style={{ ...baseStyle, bottom: slotBottom(2) }}
            >
                <ShellIcon name="play" />
                <span className="lp-float-label">유튜브 채널</span>
            </a>
            </>
            )}

            {open && hasNotice && (
                <button
                    type="button"
                    className="lp-float-link lp-float-notice"
                    title={`읽지 않은 공지 ${unseenNoticeCount}건`}
                    aria-label={`새소식, 읽지 않은 공지 ${unseenNoticeCount}건`}
                    onClick={() => navigate('/')}
                    style={{ ...baseStyle, bottom: slotBottom(4), cursor: 'pointer' }}
                >
                    <ShellIcon name="megaphone" />
                    <span className="lp-float-label">새소식</span>
                    <span className="lp-float-badge" style={{ display: 'inline-flex' }}><NewBadge count={unseenNoticeCount} size="md" /></span>
                </button>
            )}

            {/*
              * 접기·펴기. 열려 있을 땐 stack 맨 위에, 접으면 맨 아래로 내려온다.
              * 음악 플레이어(네 번째 칸)와 겹치지 않게 그 위 자리를 쓴다.
              */}
            <button
                type="button"
                className={`lp-float-toggle lp-float-toggle-${open ? 'open' : 'shut'}`}
                onClick={onToggle}
                aria-expanded={open}
                aria-label={toggleLabel}
                title={toggleLabel}
                style={{
                    position: 'fixed',
                    right: 24,
                    bottom: open ? slotBottom(hasNotice ? 5 : 4) : slotBottom(0),
                    zIndex: 10001,
                    width: 44,
                    height: 44,
                    padding: 0,
                    borderRadius: lightRadius.control,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    background: light.surface,
                    border: `1px solid ${light.line}`,
                    color: light.text,
                    boxShadow: light.shadowFloat,
                    transition: TRANSITION,
                }}
            >
                <ShellIcon name={open ? 'close' : 'chat'} />
            </button>
        </>
    );
}

export default FloatStack;
