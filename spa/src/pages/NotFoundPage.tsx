import { Link } from 'react-router-dom';

function NotFoundPage() {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 24px', background: '#0a0a0f', color: '#fff', textAlign: 'center' }}>
            <div>
                <h1 style={{ fontSize: 96, fontWeight: 900, marginBottom: 16, background: 'linear-gradient(135deg, #c9a84c, #d4a012)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>404</h1>
                <p style={{ fontSize: 18, color: '#a0a0b0', marginBottom: 24 }}>페이지를 찾을 수 없습니다</p>
                <Link to="/" style={{ display: 'inline-block', padding: '12px 28px', background: 'linear-gradient(135deg, #c9a84c, #d4a012)', color: '#1a1a2e', borderRadius: 10, fontWeight: 800, textDecoration: 'none' }}>🏠 홈으로</Link>
            </div>
        </div>
    );
}

export default NotFoundPage;
