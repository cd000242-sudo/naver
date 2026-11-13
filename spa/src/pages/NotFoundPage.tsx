import { Link } from 'react-router-dom';
import { light, lightRadius, type } from '../styles/tokens';

function NotFoundPage() {
    return (
        <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '144px 24px 80px', color: light.text, textAlign: 'center' }}>
            <div>
                <h1 style={{ fontSize: `clamp(${type.h1Mobile}px, 5vw, ${type.h1}px)`, fontWeight: 700, lineHeight: 1.25, marginBottom: 12, color: light.text, fontVariantNumeric: 'tabular-nums' }}>404</h1>
                <p style={{ fontSize: type.body, color: light.textSecondary, marginBottom: 24 }}>페이지를 찾을 수 없습니다</p>
                <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 24px', background: light.accent, color: light.onAccent, borderRadius: lightRadius.control, fontSize: type.body, fontWeight: 600, textDecoration: 'none' }}>홈으로</Link>
            </div>
        </div>
    );
}

export default NotFoundPage;
