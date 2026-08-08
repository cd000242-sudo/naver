import { Link } from 'react-router-dom';
import { color, gradient, onGold, radius } from '../styles/tokens';

function NotFoundPage() {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 24px', background: color.bgDark, color: color.textPrimary, textAlign: 'center' }}>
            <div>
                <h1 style={{ fontSize: 96, fontWeight: 900, marginBottom: 16, background: gradient.goldBright, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>404</h1>
                <p style={{ fontSize: 18, color: color.textMuted, marginBottom: 24 }}>페이지를 찾을 수 없습니다</p>
                <Link to="/" style={{ display: 'inline-block', padding: '12px 28px', background: gradient.goldBright, color: onGold.black, borderRadius: radius.md, fontWeight: 800, textDecoration: 'none' }}>🏠 홈으로</Link>
            </div>
        </div>
    );
}

export default NotFoundPage;
