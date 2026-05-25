function NotFoundPage() {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#fff', fontFamily: 'Pretendard Variable, sans-serif', textAlign: 'center' }}>
            <div>
                <h1 style={{ fontSize: '72px', fontWeight: 900, marginBottom: '16px', color: '#c9a84c' }}>404</h1>
                <p style={{ fontSize: '18px', color: '#a0a0b0', marginBottom: '24px' }}>페이지를 찾을 수 없습니다</p>
                <a href="/" style={{ color: '#c9a84c', textDecoration: 'none', fontWeight: 700 }}>🏠 홈으로</a>
            </div>
        </div>
    );
}

export default NotFoundPage;
