import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { light, type } from '../styles/tokens';

const linkStyle: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', minHeight: 44,
    color: light.textSecondary, fontSize: type.small, textDecoration: 'none',
};

function Footer() {
    return (
        <footer style={{ padding: '64px 24px 40px', background: light.raised, borderTop: `1px solid ${light.line}` }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: type.body, marginBottom: 16, color: light.text }}>
                    <img src="/favicon-32x32.png" alt="" aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 8, display: 'block' }} />
                    <span>Leaders Pro</span>
                </div>
                <div style={{ display: 'flex', gap: '0 24px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                    <Link to="/terms" style={linkStyle}>이용약관</Link>
                    <Link to="/refund" style={linkStyle}>환불정책</Link>
                    <Link to="/privacy" style={linkStyle}>개인정보처리방침</Link>
                    <Link to="/chatbots" style={linkStyle}>무료 챗봇</Link>
                    <Link to="/lookup" style={linkStyle}>주문 조회</Link>
                    <a href="mailto:tjdgus24280@naver.com" style={linkStyle}>고객 문의</a>
                </div>
                <div style={{ color: light.textMuted, fontSize: type.meta, lineHeight: 1.7, marginBottom: 20, fontVariantNumeric: 'tabular-nums' }}>
                    <p>상호: Leaders Pro | 대표: 박성현 | 사업자등록번호: 515-97-01802</p>
                    {/*
                      통신판매업 신고번호는 국내 유료 판매 사이트 필수 표기 항목이다.
                      실제 신고번호를 확인한 뒤(정부24 > "통신판매업 신고" 또는 사업자 정보에서 조회)
                      아래 줄의 주석을 풀고 번호를 채워 넣을 것. 가짜 번호는 절대 넣지 말 것.
                      <p>통신판매업 신고번호: 제0000-지역-00000호</p>
                    */}
                    <p>주소: 경남 김해시 장유로334번길9 107동 3105호</p>
                    <p>이메일: tjdgus24280@naver.com | 전화: 010-7545-1645</p>
                </div>
                <p style={{ color: light.textMuted, fontSize: type.meta }}>© 2026 Leaders Pro. All rights reserved.</p>
            </div>
        </footer>
    );
}

export default Footer;
