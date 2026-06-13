import { useEffect } from 'react';

const LEWORD_PRO_WEB_URL = 'https://141.164.59.17.sslip.io/leword';

function LewordPage() {
    useEffect(() => {
        const prevTitle = document.title;
        const prevOverflow = document.body.style.overflow;

        document.title = 'LEWORD Pro Web';
        document.body.style.overflow = 'hidden';

        return () => {
            document.title = prevTitle;
            document.body.style.overflow = prevOverflow;
        };
    }, []);

    return (
        <section
            aria-label="LEWORD Pro Web"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 5000,
                background: '#07090d',
            }}
        >
            <iframe
                title="LEWORD Pro Web"
                src={LEWORD_PRO_WEB_URL}
                style={{
                    width: '100%',
                    height: '100%',
                    border: 0,
                    display: 'block',
                    background: '#07090d',
                }}
                allow="clipboard-read; clipboard-write"
                referrerPolicy="no-referrer-when-downgrade"
            />
            <a
                href={LEWORD_PRO_WEB_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    position: 'fixed',
                    right: 18,
                    bottom: 18,
                    zIndex: 5001,
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
        </section>
    );
}

export default LewordPage;
