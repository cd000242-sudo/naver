import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import LegalLayout from '../components/LegalLayout';

const h2: React.CSSProperties = { fontSize: 20, fontWeight: 800, color: '#FFD700', margin: '32px 0 14px' };
const h3: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: '#FFA500', margin: '20px 0 10px' };
const ul: React.CSSProperties = { paddingLeft: 22, margin: '0 0 16px' };
const box: React.CSSProperties = { background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 12, padding: 16, margin: '16px 0' };
const okBox: React.CSSProperties = { ...box, background: 'rgba(68,215,182,0.08)', borderColor: 'rgba(68,215,182,0.28)', marginTop: 0 };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', margin: '12px 0 20px', fontSize: 14 };
const th: React.CSSProperties = { background: 'rgba(255,215,0,0.08)', color: '#FFD700', padding: '10px 12px', textAlign: 'left', border: '1px solid rgba(255,255,255,0.08)', fontWeight: 700 };
const td: React.CSSProperties = { padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)' };

const CONTACT_EMAIL = 'tjdgus24280@naver.com';
const KAKAO_URL = 'https://open.kakao.com/o/sPcaslwh';

/** 환불 및 취소 정책 — 결제 페이지의 "7일 전액환불 보장"과 정합. */
function RefundPage() {
    useEffect(() => {
        const prev = document.title;
        document.title = '환불 및 취소 정책 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    return (
        <LegalLayout title="환불 및 취소 정책" effective="시행일: 2026년 8월 8일 (최종 수정)">
            <div style={okBox}>
                <p style={{ margin: 0 }}><strong>🛡️ 7일 전액환불 보장:</strong> 라이선스 코드 발급 후 <strong>7일 이내</strong>, 프로그램에 <strong>한 번도 로그인·사용하지 않은 경우</strong> 결제 금액을 <strong>전액 환불</strong>해 드립니다. 구매가 망설여지신다면 <strong>무료 체험</strong>으로 먼저 확인해 보셔도 좋습니다.</p>
            </div>

            <h2 style={h2}>제1조 (환불 정책 원칙)</h2>
            <p>Leaders Pro는 구매자의 신뢰를 최우선으로, <strong>라이선스 코드 발급일로부터 7일 이내이고 서비스를 사용하지 않은 경우 조건 없이 전액 환불</strong>합니다. 결제 전 무료 체험(Free Trial)으로 기능을 확인하실 수 있으며, 결제 후에도 위 기간 내 미사용 시 부담 없이 환불받으실 수 있습니다.</p>
            <p>본 정책은 「전자상거래 등에서의 소비자보호에 관한 법률」의 청약철회 규정에 부합하며, 소비자에게 더 유리한 방향으로 운영됩니다.</p>

            <h2 style={h2}>제2조 (환불 가능 조건)</h2>
            <p>아래 조건을 <strong>모두 충족</strong>하는 경우 전액 환불됩니다.</p>
            <ul style={ul}>
                <li>라이선스 코드 발급일로부터 <strong>7일(168시간) 이내</strong> 환불 요청</li>
                <li>프로그램에 <strong>로그인한 이력이 없는 경우</strong> (서버 로그 기준)</li>
                <li>라이선스 코드를 <strong>활성화·사용·공유하지 않은 경우</strong></li>
            </ul>
            <p>모든 상품(1개월권·3개월권·1년권·영구제)에 <strong>동일하게 7일 전액환불</strong>이 적용됩니다.</p>

            <h2 style={h2}>제3조 (환불이 제한되는 경우)</h2>
            <p>디지털 라이선스의 특성상, 다음의 경우에는 전액 환불이 제한될 수 있습니다.</p>
            <ul style={ul}>
                <li>라이선스 코드 발급 후 <strong>7일이 경과</strong>한 경우</li>
                <li><strong>프로그램 로그인 이력</strong>이 1회 이상 확인되는 경우 (이미 서비스를 이용하신 경우)</li>
                <li>콘텐츠 생성·발행·설정 변경 등 <strong>실제 사용 이력</strong>이 있는 경우</li>
                <li>이용약관 위반으로 서비스 이용이 제한된 경우</li>
                <li>라이선스 코드를 타인에게 양도·공유·재판매한 경우</li>
            </ul>
            <p>7일이 지났거나 사용 이력이 있는 경우에도, 서비스 하자·중대한 오류 등 회사의 귀책 사유가 있으면 관련 법령에 따라 환불해 드립니다.</p>

            <h2 style={h2}>제4조 (환불 요청 절차)</h2>
            <p>아래 어느 채널로든 신청하실 수 있습니다.</p>
            <h3 style={h3}>1단계: 환불 신청</h3>
            <div style={box}>
                <p style={{ margin: 0 }}><strong>💬 카카오톡 1:1 상담:</strong> <a href={KAKAO_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#FFD700' }}>{KAKAO_URL}</a> (가장 빠름)</p>
                <p style={{ margin: '8px 0 0' }}><strong>📧 이메일 접수:</strong> {CONTACT_EMAIL}</p>
                <p style={{ margin: '8px 0 0' }}><strong>기재 사항:</strong> 주문번호, 구매자명, 결제 이메일</p>
            </div>

            <h3 style={h3}>2단계: 사용 이력 확인</h3>
            <ul style={ul}>
                <li>접수 후 <strong>영업일 기준 1~3일 이내</strong> 서버 로그로 로그인·사용 이력을 확인합니다.</li>
                <li>7일 이내·미사용이 확인되면 별도 심사 없이 환불이 승인됩니다.</li>
            </ul>

            <h3 style={h3}>3단계: 환불 처리</h3>
            <ul style={ul}>
                <li>승인 시 <strong>영업일 기준 3~5일 이내</strong> 원래 결제 수단으로 전액 환불됩니다.</li>
                <li>카드사 처리 기간에 따라 실제 반영까지 며칠 더 걸릴 수 있습니다.</li>
            </ul>

            <h2 style={h2}>제5조 (플랜별 환불 기준)</h2>
            <table style={table}>
                <thead>
                    <tr><th style={th}>플랜</th><th style={th}>서비스 제공 기간</th><th style={th}>전액환불 가능 기간</th></tr>
                </thead>
                <tbody>
                    <tr><td style={td}>무료 체험</td><td style={td}>무기한 (기능 제한)</td><td style={td}>해당 없음 (무료)</td></tr>
                    <tr><td style={td}>1개월권</td><td style={td}>결제일로부터 30일</td><td style={td}>7일 이내 (미사용 시)</td></tr>
                    <tr><td style={td}>3개월권</td><td style={td}>결제일로부터 90일</td><td style={td}>7일 이내 (미사용 시)</td></tr>
                    <tr><td style={td}>1년권</td><td style={td}>결제일로부터 365일</td><td style={td}>7일 이내 (미사용 시)</td></tr>
                    <tr><td style={td}>영구제</td><td style={td}>무기한</td><td style={td}>7일 이내 (미사용 시)</td></tr>
                </tbody>
            </table>

            <h2 style={h2}>제6조 (정기결제 해지)</h2>
            <ul style={ul}>
                <li>정기결제(구독)는 언제든지 해지할 수 있습니다.</li>
                <li>해지 시 현재 결제 주기가 종료될 때까지 서비스를 이용할 수 있습니다.</li>
                <li>해지 후 다음 결제일에 자동 결제가 이루어지지 않습니다.</li>
                <li>해지는 주문 조회 페이지, 카카오톡 상담, 또는 이메일({CONTACT_EMAIL})로 가능합니다.</li>
            </ul>

            <h2 style={h2}>제7조 (분쟁 해결)</h2>
            <ul style={ul}>
                <li>환불과 관련한 분쟁은 「전자상거래 등에서의 소비자보호에 관한 법률」에 따릅니다.</li>
                <li>결제 관련 상담: 1544-7772 (토스페이먼츠)</li>
                <li>이메일 문의: {CONTACT_EMAIL}</li>
            </ul>

            <div style={box}>
                <p style={{ margin: 0 }}>
                    <strong>💡 참고:</strong> 본 환불정책은{' '}
                    <Link to="/terms" style={{ color: '#FFD700' }}>이용약관</Link>{' '}
                    제4조(결제 및 환불)에 근거합니다. 궁금한 점은 언제든 카카오톡 1:1 상담으로 문의해 주세요.
                </p>
            </div>
        </LegalLayout>
    );
}

export default RefundPage;
