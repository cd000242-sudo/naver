import { Link } from 'react-router-dom';

function Footer() {
    return (
        <footer style={{ padding: '60px 24px 40px', background: '#06060a', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 18, marginBottom: 20, color: '#fff' }}>
                    <img src="/favicon-32x32.png" alt="" aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 8, display: 'block' }} />
                    <span>Leaders Pro</span>
                </div>
                <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
                    <Link to="/terms" style={{ color: '#a0a0b0', fontSize: 14, textDecoration: 'none' }}>이용약관</Link>
                    <Link to="/refund" style={{ color: '#a0a0b0', fontSize: 14, textDecoration: 'none' }}>환불정책</Link>
                    <Link to="/privacy" style={{ color: '#a0a0b0', fontSize: 14, textDecoration: 'none' }}>개인정보처리방침</Link>
                    <Link to="/chatbots" style={{ color: '#a0a0b0', fontSize: 14, textDecoration: 'none' }}>무료 챗봇</Link>
                    <Link to="/lookup" style={{ color: '#a0a0b0', fontSize: 14, textDecoration: 'none' }}>주문 조회</Link>
                    <a href="mailto:tjdgus24280@naver.com" style={{ color: '#a0a0b0', fontSize: 14, textDecoration: 'none' }}>고객 문의</a>
                </div>
                <div style={{ color: '#a0a0b0', fontSize: 12, lineHeight: 1.7, marginBottom: 20 }}>
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
                <p style={{ color: 'rgba(160,160,176,0.5)', fontSize: 12 }}>© 2026 Leaders Pro. All rights reserved.</p>
            </div>
        </footer>
    );
}

export default Footer;
