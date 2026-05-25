// Phase 1a — 임시 IndexPage. Phase 2에서 기존 index.html (12,652줄) 마이그레이션
function IndexPage() {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#fff', fontFamily: 'Pretendard Variable, sans-serif' }}>
            <div style={{ textAlign: 'center', padding: '40px' }}>
                <h1 style={{ fontSize: '48px', fontWeight: 900, marginBottom: '16px', background: 'linear-gradient(135deg, #c9a84c, #d4a012)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    👑 Leaders Pro
                </h1>
                <p style={{ fontSize: '18px', color: '#a0a0b0', marginBottom: '8px' }}>
                    SPA 토대 작동 확인
                </p>
                <p style={{ fontSize: '14px', color: '#64748b' }}>
                    Phase 1a complete · React 18 + Vite + TS · Phase 2부터 기존 페이지 마이그레이션
                </p>
            </div>
        </div>
    );
}

export default IndexPage;
