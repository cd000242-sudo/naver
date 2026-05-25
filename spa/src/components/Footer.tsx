import { Link } from 'react-router-dom';

function Footer() {
    return (
        <footer style={{ padding: '60px 24px 40px', background: '#06060a', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 18, marginBottom: 20, color: '#fff' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #f5c842, #d4a012)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#1a1a2e' }}>👑</span>
                    <span>Leaders Pro</span>
                </div>
                <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
                    <Link to="/terms" style={{ color: '#a0a0b0', fontSize: 14, textDecoration: 'none' }}>이용약관</Link>
                    <Link to="/refund" style={{ color: '#a0a0b0', fontSize: 14, textDecoration: 'none' }}>환불정책</Link>
                    <Link to="/privacy" style={{ color: '#a0a0b0', fontSize: 14, textDecoration: 'none' }}>개인정보처리방침</Link>
                    <Link to="/lookup" style={{ color: '#a0a0b0', fontSize: 14, textDecoration: 'none' }}>주문 조회</Link>
                    <a href="mailto:cd000242@gmail.com" style={{ color: '#a0a0b0', fontSize: 14, textDecoration: 'none' }}>고객 문의</a>
                </div>
                <div style={{ color: '#a0a0b0', fontSize: 12, lineHeight: 1.7, marginBottom: 20 }}>
                    <p>상호: Leaders Pro | 대표: 박성현 | 사업자등록번호: 515-97-01802</p>
                    <p>주소: 경남 김해시 장유로334번길9 107동 3105호</p>
                    <p>이메일: tjdgus24280@naver.com | 전화: 010-7545-1645</p>
                </div>
                <p style={{ color: 'rgba(160,160,176,0.5)', fontSize: 12 }}>© 2026 Leaders Pro. All rights reserved.</p>
            </div>
        </footer>
    );
}

export default Footer;
