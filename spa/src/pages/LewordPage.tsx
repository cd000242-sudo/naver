import { useEffect, useMemo, useState } from 'react';

const LEWORD_PRO_WEB_URL = 'https://141.164.59.17.sslip.io/leword';

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

    const iframeSrc = useMemo(() => {
        return `${LEWORD_PRO_WEB_URL}?embed=leaderspro&v=${iframeKey}`;
    }, [iframeKey]);

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
                padding: '12px 16px 18px',
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
                {!loaded && (
                    <div
                        role="status"
                        aria-live="polite"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 2,
                            display: 'grid',
                            placeItems: 'center',
                            background: 'linear-gradient(180deg, #07090d, #0b1119)',
                            color: '#f8fbff',
                            textAlign: 'center',
                            padding: 24,
                        }}
                    >
                        <div>
                            <strong style={{ display: 'block', color: '#f5c542', fontSize: 20, marginBottom: 8 }}>
                                LEWORD Pro Web 불러오는 중
                            </strong>
                            <span style={{ color: '#a4b1c4', fontSize: 14 }}>
                                서버 콘솔을 연결하고 있습니다. 잠시만 기다려주세요.
                            </span>
                            {failed && (
                                <div style={{ marginTop: 16 }}>
                                    <button
                                        type="button"
                                        onClick={retry}
                                        style={{
                                            minHeight: 38,
                                            border: '1px solid rgba(245,197,66,.48)',
                                            borderRadius: 8,
                                            background: 'rgba(245,197,66,.12)',
                                            color: '#f5c542',
                                            padding: '8px 14px',
                                            fontWeight: 900,
                                        }}
                                    >
                                        다시 불러오기
                                    </button>
                                </div>
                            )}
                        </div>
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
                        opacity: loaded ? 1 : 0.01,
                        transition: 'opacity .18s ease',
                    }}
                    allow="clipboard-read; clipboard-write"
                    referrerPolicy="no-referrer-when-downgrade"
                />
                <a
                    href={LEWORD_PRO_WEB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        position: 'absolute',
                        right: 14,
                        bottom: 14,
                        zIndex: 3,
                        minHeight: 38,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(245,197,66,.42)',
                        borderRadius: 8,
                        background: 'rgba(7,9,13,.78)',
                        color: '#f5c542',
                        padding: '8px 12px',
                        fontSize: 13,
                        fontWeight: 900,
                        boxShadow: '0 10px 28px rgba(0,0,0,.24)',
                        backdropFilter: 'blur(10px)',
                    }}
                >
                    새 창
                </a>
            </div>
        </section>
    );
}

export default LewordPage;
