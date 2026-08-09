import { useEffect } from 'react';
import { Link } from 'react-router-dom';

function LewordPage() {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = 'LEWORD | Leaders Pro';
        return () => { document.title = previousTitle; };
    }, []);

    return (
        <main style={{ minHeight: 'calc(100vh - 72px)', background: 'radial-gradient(circle at 14% 18%, rgba(124,58,237,.25), transparent 34%), #07090d', padding: '132px 20px 86px' }}>
            <section style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(28px, 7vw, 68px)', border: '1px solid rgba(167,139,250,.36)', borderRadius: 28, background: 'rgba(12,14,24,.84)', boxShadow: '0 28px 80px rgba(0,0,0,.38)', textAlign: 'center' }}>
                <span style={{ display: 'inline-block', padding: '7px 14px', borderRadius: 999, border: '1px solid rgba(167,139,250,.46)', color: '#c4b5fd', fontSize: 12, fontWeight: 900, letterSpacing: 1.4 }}>LEWORD KEYWORD MASTER</span>
                <h1 style={{ margin: '20px 0 14px', color: '#fff', fontSize: 'clamp(32px, 6vw, 58px)', lineHeight: 1.14 }}>키워드 분석은 LEWORD 앱에서</h1>
                <p style={{ maxWidth: 620, margin: '0 auto', color: 'rgba(235,242,250,.78)', fontSize: 'clamp(16px, 2vw, 19px)', lineHeight: 1.7 }}>
                    프로그램을 다운로드해 키워드 분석을 시작하고, 공개 실시간 검색어는 사이트에서 바로 확인하세요.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 30 }}>
                    <Link to="/download" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 52, padding: '0 22px', borderRadius: 12, background: 'linear-gradient(135deg, #a78bfa, #6d5ce8)', color: '#07090d', fontWeight: 900, textDecoration: 'none' }}>LEWORD 다운로드</Link>
                    <a href="/#realtime-search" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 52, padding: '0 22px', borderRadius: 12, border: '1px solid rgba(255,255,255,.22)', color: '#f8fbff', fontWeight: 850, textDecoration: 'none' }}>실시간 검색어 보기</a>
                </div>
                <p style={{ margin: '22px 0 0', color: 'rgba(235,242,250,.54)', fontSize: 13, lineHeight: 1.6 }}>
                    공개 검색어는 수집·검증 후 갱신되는 스냅샷이며, 로그인이나 별도 웹 콘솔이 필요하지 않습니다.
                </p>
            </section>
        </main>
    );
}

export default LewordPage;
