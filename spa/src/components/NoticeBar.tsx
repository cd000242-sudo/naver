import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { isNoticeModalSuppressed, suppressNoticeModalToday } from '../lib/noticeAlerts';
import { useNoticeAlerts } from '../lib/useNoticeAlerts';
import { light, lightRadius, motion, type } from '../styles/tokens';
import { ShellIcon } from './ShellIcons';

/**
 * Home notice bar: one thin strip right under the fixed top menu (replaces the full-screen NoticeModal).
 *
 * - Shows only while there are unseen notices and "not today" is not set (same rules and storage as the modal).
 * - [보기] unfolds the notice in place; several notices are stepped with 이전/다음.
 * - Closing stores "not today" (KST end of day) and marks the notices seen, exactly like the modal's
 *   "오늘은 띄우지 않기".
 *
 * Layout: the strip sits in the document flow. The wrapper reserves the menu height on top (the menu is
 * position:fixed) and gives the same amount back with a negative bottom margin, because the home page
 * already keeps that clearance for the menu. Net effect: the page moves down by the strip height only.
 */

const PANEL_ID = 'lp-notice-bar-panel';

/** Display-only: long dashes in a title read as a separator, shown as a middle dot. Data is untouched. */
function displayTitle(title: string): string {
    return title.replace(/\s*[—–]\s*/g, ' · ');
}

function displayDate(value: string): string {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return value;
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(parsed));
}

/** Same wording as the home board's notice cards. */
function badgeLabel(badge: string): string {
    const normalized = String(badge || '').toLocaleLowerCase();
    if (normalized.includes('important') || normalized.includes('중요')) return '중요';
    if (normalized.includes('update') || normalized.includes('업데이트')) return '업데이트';
    if (normalized.includes('event') || normalized.includes('이벤트')) return '이벤트';
    if (normalized.includes('tip') || normalized.includes('안내')) return '안내';
    return '공지';
}

const TRANSITION = `background-color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease}, color ${motion.fast} ${motion.ease}`;

const lineButton: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 'none',
    minHeight: 44, padding: '0 12px', borderRadius: lightRadius.control,
    border: `1px solid ${light.line}`, background: light.surface, color: light.text,
    fontSize: type.small, fontWeight: 500, lineHeight: 1.2, whiteSpace: 'nowrap', cursor: 'pointer',
    transition: TRANSITION,
};

const iconButton: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
    width: 44, height: 44, padding: 0, borderRadius: lightRadius.control,
    border: 'none', background: 'transparent', color: light.textSecondary, cursor: 'pointer',
    transition: TRANSITION,
};

function NoticeBar() {
    const { unseen, loaded, markAllSeen } = useNoticeAlerts();
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [index, setIndex] = useState(0);
    const viewButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!loaded || unseen.length === 0) return;
        if (isNoticeModalSuppressed()) return;
        setIndex((current) => (current < unseen.length ? current : 0));
        setOpen(true);
    }, [loaded, unseen]);

    const dismiss = useCallback(() => {
        suppressNoticeModalToday();
        markAllSeen();
        setExpanded(false);
        setOpen(false);
    }, [markAllSeen]);

    useEffect(() => {
        if (!open || !expanded) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setExpanded(false);
            viewButtonRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, expanded]);

    if (!open || unseen.length === 0) return null;

    const total = unseen.length;
    const safeIndex = Math.min(index, total - 1);
    const notice = unseen[safeIndex];
    const title = displayTitle(notice.title);
    const atFirst = safeIndex === 0;
    const atLast = safeIndex === total - 1;
    const stepStyle = (disabled: boolean): CSSProperties => ({
        ...lineButton,
        ...(disabled ? { color: light.textMuted, background: light.raised, cursor: 'default' } : null),
    });

    return (
        <aside
            className="lp-notice-bar"
            aria-label="공지"
            style={{ position: 'relative', zIndex: 5, paddingTop: 'var(--lp-notice-nav-h)', marginBottom: 'calc(var(--lp-notice-nav-h) * -1)' }}
        >
            <style>{`
                .lp-notice-bar { --lp-notice-nav-h: 72px; --lp-notice-pad: 24px; }
                .lp-notice-bar :focus-visible { outline: 2px solid ${light.text}; outline-offset: 2px; }
                .lp-notice-bar .lp-notice-line:hover { background: ${light.raised}; border-color: ${light.lineStrong}; }
                .lp-notice-bar .lp-notice-icon:hover { background: ${light.raised}; color: ${light.text}; }
                @media (max-width: 720px) {
                    .lp-notice-bar { --lp-notice-nav-h: 64px; --lp-notice-pad: 16px; }
                    .lp-notice-bar .lp-notice-date { display: none; }
                }
            `}</style>
            <div style={{ background: light.surface, borderBottom: `1px solid ${light.line}` }}>
                <div style={{
                    boxSizing: 'border-box', maxWidth: 1280, margin: '0 auto', padding: '4px var(--lp-notice-pad)',
                    display: 'flex', alignItems: 'center', gap: 8, minHeight: 52,
                }}>
                    <span style={{
                        flex: 'none', padding: '4px 8px', borderRadius: lightRadius.pill,
                        background: light.accentSoft, color: light.accentInk,
                        fontSize: type.meta, fontWeight: 500, lineHeight: 1.2, whiteSpace: 'nowrap',
                    }}>
                        {badgeLabel(notice.badge)}
                    </span>
                    <p style={{
                        flex: 1, minWidth: 0, margin: 0, padding: '0 4px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        color: light.text, fontSize: type.small, fontWeight: 500, lineHeight: 1.4,
                    }}>
                        {title}
                    </p>
                    {notice.date && (
                        <time
                            className="lp-notice-date"
                            dateTime={notice.date}
                            style={{ flex: 'none', color: light.textMuted, fontSize: type.meta, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                        >
                            {displayDate(notice.date)}
                        </time>
                    )}
                    <button
                        ref={viewButtonRef}
                        type="button"
                        className="lp-notice-line"
                        aria-expanded={expanded}
                        aria-controls={PANEL_ID}
                        onClick={() => setExpanded((value) => !value)}
                        style={lineButton}
                    >
                        {expanded ? '접기' : '보기'}
                        <span style={{ display: 'inline-flex', transform: expanded ? 'rotate(180deg)' : 'none', transition: `transform ${motion.fast} ${motion.ease}` }}>
                            <ShellIcon name="chevronDown" size={16} />
                        </span>
                    </button>
                    <button
                        type="button"
                        className="lp-notice-icon"
                        aria-label="공지 닫기, 오늘은 띄우지 않기"
                        title="오늘은 띄우지 않기"
                        onClick={dismiss}
                        style={iconButton}
                    >
                        <ShellIcon name="close" />
                    </button>
                </div>

                {expanded && (
                    <div
                        id={PANEL_ID}
                        role="region"
                        aria-label="공지 내용"
                        style={{ boxSizing: 'border-box', maxWidth: 1280, margin: '0 auto', padding: '8px var(--lp-notice-pad) 20px' }}
                    >
                        <div style={{ maxWidth: 760 }}>
                            <h2 style={{ margin: 0, color: light.text, fontSize: type.lead, fontWeight: 600, lineHeight: 1.4, wordBreak: 'keep-all' }}>
                                {title}
                            </h2>
                            <p style={{ margin: '4px 0 12px', color: light.textMuted, fontSize: type.meta, fontVariantNumeric: 'tabular-nums' }}>
                                {notice.date && <time dateTime={notice.date}>{displayDate(notice.date)}</time>}
                                {notice.date && total > 1 ? ' · ' : ''}
                                {total > 1 ? `${safeIndex + 1} / ${total}` : ''}
                            </p>
                            <div
                                tabIndex={0}
                                role="group"
                                aria-label="공지 본문"
                                style={{
                                    maxHeight: 'min(40vh, 360px)', overflowY: 'auto', paddingRight: 8,
                                    color: light.text, fontSize: type.body, lineHeight: 1.7,
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                }}
                            >
                                {notice.body || notice.summary}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                                {total > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            className={atFirst ? undefined : 'lp-notice-line'}
                                            disabled={atFirst}
                                            onClick={() => setIndex(safeIndex - 1)}
                                            style={stepStyle(atFirst)}
                                        >
                                            <ShellIcon name="chevronLeft" size={16} />
                                            이전
                                        </button>
                                        <button
                                            type="button"
                                            className={atLast ? undefined : 'lp-notice-line'}
                                            disabled={atLast}
                                            onClick={() => setIndex(safeIndex + 1)}
                                            style={stepStyle(atLast)}
                                        >
                                            다음
                                            <ShellIcon name="chevronRight" size={16} />
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    className="lp-notice-line"
                                    onClick={() => { setExpanded(false); viewButtonRef.current?.focus(); }}
                                    style={lineButton}
                                >
                                    접기
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}

export default NoticeBar;
