import { useCallback, useEffect, useState } from 'react';
import { isNoticeModalSuppressed, suppressNoticeModalToday } from '../lib/noticeAlerts';
import { useNoticeAlerts } from '../lib/useNoticeAlerts';

/**
 * 홈 공지 모달.
 *
 * - 안 읽은 공지가 있을 때만 뜬다(매 방문마다 뜨지 않는다).
 * - "오늘은 띄우지 않기"를 누르면 KST 당일 23:59:59 까지 억제한다.
 * - 닫기만 누르면 읽음 처리해서 같은 공지로는 다시 안 뜬다.
 */
function NoticeModal() {
    const { unseen, loaded, markAllSeen } = useNoticeAlerts();
    const [open, setOpen] = useState(false);
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (!loaded || unseen.length === 0) return;
        if (isNoticeModalSuppressed()) return;
        setIndex(0);
        setOpen(true);
    }, [loaded, unseen]);

    const close = useCallback((suppressToday: boolean) => {
        if (suppressToday) suppressNoticeModalToday();
        markAllSeen();
        setOpen(false);
    }, [markAllSeen]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close(false);
        };
        window.addEventListener('keydown', onKey);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, close]);

    if (!open || unseen.length === 0) return null;

    const notice = unseen[Math.min(index, unseen.length - 1)];
    const total = unseen.length;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notice-modal-title"
            onClick={(e) => { if (e.target === e.currentTarget) close(false); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 4000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 20, background: 'rgba(4,6,12,0.76)', backdropFilter: 'blur(6px)',
            }}
        >
            <div style={{
                width: 'min(680px, 100%)', maxHeight: '84vh', overflowY: 'auto',
                borderRadius: 20, border: '1px solid rgba(167,139,250,0.28)',
                background: 'linear-gradient(160deg,#141726 0%,#0d0f1a 100%)',
                boxShadow: '0 30px 90px rgba(0,0,0,0.6)', padding: '28px 28px 22px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <span style={{
                        padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 800,
                        color: '#f4c95d', background: 'rgba(244,201,93,0.14)', border: '1px solid rgba(244,201,93,0.35)',
                    }}>
                        {notice.badge || '공지'}
                    </span>
                    <time dateTime={notice.date} style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{notice.date}</time>
                    {total > 1 && (
                        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                            {index + 1} / {total}
                        </span>
                    )}
                </div>

                <h2 id="notice-modal-title" style={{
                    margin: '0 0 14px', color: '#fff', fontSize: 24, fontWeight: 800, lineHeight: 1.35,
                }}>
                    {notice.title}
                </h2>

                <div style={{
                    color: 'rgba(255,255,255,0.78)', fontSize: 15.5, lineHeight: 1.75,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                    {notice.body || notice.summary}
                </div>

                {total > 1 && index < total - 1 && (
                    <button
                        type="button"
                        onClick={() => setIndex((i) => i + 1)}
                        style={{
                            marginTop: 18, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                            border: '1px solid rgba(167,139,250,0.4)', background: 'rgba(124,58,237,0.16)',
                            color: '#c4b5fd', fontSize: 14, fontWeight: 700,
                        }}
                    >
                        다음 공지 보기 ({index + 2}/{total})
                    </button>
                )}

                <div style={{
                    display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap',
                    marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)',
                }}>
                    <button
                        type="button"
                        onClick={() => close(true)}
                        style={{
                            padding: '11px 18px', borderRadius: 10, cursor: 'pointer',
                            border: '1px solid rgba(255,255,255,0.16)', background: 'transparent',
                            color: 'rgba(255,255,255,0.66)', fontSize: 14, fontWeight: 600,
                        }}
                    >
                        오늘은 띄우지 않기
                    </button>
                    <button
                        type="button"
                        onClick={() => close(false)}
                        style={{
                            padding: '11px 22px', borderRadius: 10, cursor: 'pointer', border: 'none',
                            background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                            color: '#fff', fontSize: 14, fontWeight: 800,
                        }}
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    );
}

export default NoticeModal;
