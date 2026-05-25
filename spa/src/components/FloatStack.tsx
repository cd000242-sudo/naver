/**
 * 우하단 영구 stack — 1:1 문의 / 단톡방 / 유튜브 채널
 * 음악 player와 별도 (음악은 bottom: 100px 영역에 있음)
 */
function FloatStack() {
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
            {/* 위→아래 순서: 음악(MusicPlayer bottom:200) / 유튜브(140) / 단톡방(80) / 1:1(20)
                음악이 유튜브보다 위. 전체 stack을 살짝 하단으로 내림. */}
            <a
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
    );
}

export default FloatStack;
