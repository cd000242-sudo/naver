import { useEffect, useState } from 'react';

// Keep the Pro shell in Pages so UI fixes can ship before the API container restarts.
const LEWORD_PRO_WEB_URL = '/leword-pro-web.html';

function LewordPage() {
    const [iframeKey, setIframeKey] = useState(() => Date.now());
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const prevTitle = document.title;
        document.title = 'LEWORD Pro Web';

        return () => {
            document.title = prevTitle;
        };
    }, []);

    const iframeSrc = `${LEWORD_PRO_WEB_URL}?embed=leaderspro&v=${iframeKey}`;

    const retry = () => {
        setLoaded(false);
        setFailed(false);
        setIframeKey(Date.now());
    };

    return (
        <section
            aria-label="LEWORD Pro Web"
            style={{
                minHeight: 'calc(100vh - 72px)',
                background: '#07090d',
                padding: '10px 14px 14px',
            }}
        >
            <div
                style={{
                    position: 'relative',
                    minHeight: 'calc(100vh - 102px)',
                    border: '1px solid rgba(91,183,255,.28)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#07090d',
                    boxShadow: '0 20px 54px rgba(0,0,0,.34)',
                }}
            >
                {(!loaded || failed) && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 12,
                            left: 12,
                            right: 12,
                            zIndex: 3,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            pointerEvents: 'none',
                        }}
                    >
                        <div
                            role="status"
                            aria-live="polite"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                border: '1px solid rgba(245,197,66,.28)',
                                borderRadius: 8,
                                background: 'rgba(7,9,13,.72)',
                                color: '#f8fbff',
                                padding: '8px 10px',
                                boxShadow: '0 10px 28px rgba(0,0,0,.22)',
                                backdropFilter: 'blur(10px)',
                                pointerEvents: 'auto',
                            }}
                        >
                            <strong style={{ color: '#f5c542', fontSize: 13, fontWeight: 900 }}>
                                LEWORD Pro Web
                            </strong>
                            <span style={{ color: '#a4b1c4', fontSize: 12 }}>
                                {failed ? '연결 확인 필요' : '실시간 서버 연결 중'}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={retry}
                            style={{
                                minHeight: 36,
                                border: '1px solid rgba(91,183,255,.42)',
                                borderRadius: 8,
                                background: 'rgba(7,9,13,.72)',
                                color: '#dceaff',
                                padding: '7px 11px',
                                fontSize: 12,
                                fontWeight: 900,
                                boxShadow: '0 10px 28px rgba(0,0,0,.22)',
                                backdropFilter: 'blur(10px)',
                                pointerEvents: 'auto',
                            }}
                        >
                            새로고침
                        </button>
                    </div>
                )}
                <iframe
                    key={iframeKey}
                    title="LEWORD Pro Web"
                    src={iframeSrc}
                    onLoad={() => {
                        setLoaded(true);
                        setFailed(false);
                    }}
                    onError={() => {
                        setLoaded(false);
                        setFailed(true);
                    }}
                    style={{
                        width: '100%',
                        height: 'calc(100vh - 102px)',
                        minHeight: 720,
                        border: 0,
                        display: 'block',
                        background: '#07090d',
                        opacity: 1,
                        transition: 'opacity .18s ease',
                    }}
                    allow="clipboard-read; clipboard-write"
                    referrerPolicy="no-referrer-when-downgrade"
                />
            </div>
        </section>
    );
}

export default LewordPage;
