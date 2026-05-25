import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import LegalLayout from '../components/LegalLayout';

const h2: React.CSSProperties = { fontSize: 20, fontWeight: 800, color: '#FFD700', margin: '32px 0 14px' };
const h3: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: '#FFA500', margin: '20px 0 10px' };
const ul: React.CSSProperties = { paddingLeft: 22, margin: '0 0 16px' };
const box: React.CSSProperties = { background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 12, padding: 16, margin: '16px 0' };
const warnBox: React.CSSProperties = { ...box, background: 'rgba(255,59,92,0.06)', borderColor: 'rgba(255,59,92,0.25)', marginTop: 0 };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', margin: '12px 0 20px', fontSize: 14 };
const th: React.CSSProperties = { background: 'rgba(255,215,0,0.08)', color: '#FFD700', padding: '10px 12px', textAlign: 'left', border: '1px solid rgba(255,255,255,0.08)', fontWeight: 700 };
const td: React.CSSProperties = { padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)' };

/** 환불 및 취소 정책 — payment-page/refund.html 마이그 */
function RefundPage() {
    useEffect(() => {
        const prev = document.title;
        document.title = '환불 및 취소 정책 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    return (
        <LegalLayout title="환불 및 취소 정책" effective="시행일: 2026년 3월 27일 (최종 수정)">
            <div style={warnBox}>
                <p style={{ margin: 0 }}><strong>⚠️ 중요 안내:</strong> Leaders Pro는 <strong>디지털 라이선스 상품</strong>으로, 그 특성상 구매 후 환불이 매우 제한적입니다. 구매 전 반드시 <strong>무료 체험</strong>을 통해 서비스를 충분히 확인하신 후 결제해 주시기 바랍니다.</p>
            </div>

            <h2 style={h2}>제1조 (환불 정책 원칙)</h2>
            <p>Leaders Pro의 모든 상품은 <strong>디지털 라이선스 코드</strong> 형태로 제공되며, 라이선스 코드가 발급되는 즉시 서비스 이용이 가능합니다. 디지털 콘텐츠의 특성상, 라이선스 코드 발급 후에는 <strong>원칙적으로 환불이 불가</strong>합니다.</p>
            <p>구매자는 결제 전 무료 체험(Free Trial)을 통해 프로그램의 기능과 적합성을 충분히 확인할 수 있으므로, 결제 후 "기대와 다르다"는 사유만으로는 환불이 불가합니다.</p>

            <h2 style={h2}>제2조 (예외적 환불 가능 조건)</h2>
            <p>아래 조건을 <strong>모두 동시에 충족</strong>하는 경우에 한해 예외적으로 환불을 검토합니다.</p>
            <ul style={ul}>
                <li>라이선스 코드 발급일로부터 <strong>48시간(2일) 이내</strong> 환불 요청</li>
                <li>프로그램에 <strong>1회도 로그인한 이력이 없는 경우</strong> (서버 로그 기준)</li>
                <li>라이선스 코드를 <strong>어떤 형태로도 사용·활성화·공유하지 않은 경우</strong></li>
            </ul>
            <p>위 조건을 충족하더라도, 회사의 내부 심사를 거쳐 환불 여부가 최종 결정됩니다.</p>

            <h2 style={h2}>제3조 (환불 불가 사유)</h2>
            <p>다음 중 <strong>하나라도 해당</strong>하는 경우 환불이 절대 불가합니다.</p>
            <ul style={ul}>
                <li>라이선스 코드 발급 후 <strong>48시간이 경과</strong>한 경우</li>
                <li><strong>프로그램 로그인 이력</strong>이 1회 이상 확인되는 경우</li>
                <li>콘텐츠 생성, 발행, 설정 변경 등 <strong>서비스 사용 이력</strong>이 있는 경우</li>
                <li>"생각보다 어렵다", "기대와 다르다" 등 <strong>단순 변심</strong>에 의한 요청</li>
                <li>이용약관 위반으로 서비스 이용이 제한된 경우</li>
                <li>라이선스 코드를 타인에게 양도·공유·재판매한 경우</li>
                <li><strong>영구제(Lifetime)</strong> 상품의 경우 (일체 환불 불가)</li>
            </ul>

            <h2 style={h2}>제4조 (환불 요청 절차)</h2>
            <p>환불 대상에 해당한다고 판단되시는 경우, 아래 단계를 따라주세요.</p>
            <h3 style={h3}>1단계: 환불 신청</h3>
            <div style={box}>
                <p style={{ margin: 0 }}><strong>📧 환불 접수 이메일:</strong> cd000242@gmail.com</p>
                <p style={{ margin: '8px 0 0' }}><strong>필수 기재 사항:</strong> 주문번호, 구매자명, 결제 이메일, 구체적 환불 사유</p>
                <p style={{ color: 'rgba(255,100,100,0.8)', fontSize: 12, marginTop: 8, marginBottom: 0 }}>※ 필수 사항이 누락되거나 사유가 불명확한 경우 접수가 거부됩니다.</p>
            </div>

            <h3 style={h3}>2단계: 사용 이력 심사</h3>
            <ul style={ul}>
                <li>환불 요청 접수 후 <strong>영업일 기준 3~5일 이내</strong> 서버 로그 기반으로 사용 이력을 정밀 확인합니다.</li>
                <li>프로그램 로그인, API 호출, 콘텐츠 생성/발행 기록 등을 종합적으로 검토합니다.</li>
                <li>심사 결과를 이메일로 회신드립니다.</li>
            </ul>

            <h3 style={h3}>3단계: 환불 처리 (승인 시)</h3>
            <ul style={ul}>
                <li>환불 승인 시 <strong>영업일 기준 5~7일 이내</strong> 원래 결제 수단으로 환불됩니다.</li>
                <li>카드사 처리 기간에 따라 최대 14일이 소요될 수 있습니다.</li>
                <li>환불 시 결제 수수료(PG 수수료 등)가 차감될 수 있습니다.</li>
            </ul>

            <h2 style={h2}>제5조 (서비스 제공 기간)</h2>
            <p>각 라이선스의 서비스 제공 기간은 다음과 같습니다.</p>
            <table style={table}>
                <thead>
                    <tr><th style={th}>플랜</th><th style={th}>서비스 제공 기간</th><th style={th}>환불 검토 가능 기간</th></tr>
                </thead>
                <tbody>
                    <tr><td style={td}>무료 체험</td><td style={td}>무기한 (기능 제한)</td><td style={td}>해당 없음 (무료)</td></tr>
                    <tr><td style={td}>1개월권</td><td style={td}>결제일로부터 30일</td><td style={td}>48시간 이내 (미사용 시)</td></tr>
                    <tr><td style={td}>3개월권</td><td style={td}>결제일로부터 90일</td><td style={td}>48시간 이내 (미사용 시)</td></tr>
                    <tr><td style={td}>1년권</td><td style={td}>결제일로부터 365일</td><td style={td}>48시간 이내 (미사용 시)</td></tr>
                    <tr><td style={td}>영구제</td><td style={td}>무기한</td><td style={{ ...td, color: 'rgba(255,100,100,0.85)', fontWeight: 600 }}>환불 불가</td></tr>
                </tbody>
            </table>

            <h2 style={h2}>제6조 (정기결제 해지)</h2>
            <ul style={ul}>
                <li>정기결제(구독)는 언제든지 해지할 수 있습니다.</li>
                <li>해지 시 현재 결제 주기가 종료될 때까지 서비스를 이용할 수 있습니다.</li>
                <li>해지 후 다음 결제일에 자동 결제가 이루어지지 않습니다.</li>
                <li><strong>해지는 환불과 무관합니다.</strong> 이미 결제된 기간에 대한 환불은 위 조건에 따릅니다.</li>
                <li>해지는 주문 조회 페이지 또는 이메일(cd000242@gmail.com)을 통해 가능합니다.</li>
            </ul>

            <h2 style={h2}>제7조 (면책 사항)</h2>
            <ul style={ul}>
                <li>디지털 라이선스의 특성상, <strong>복제·무단사용 방지를 위해 환불 조건이 엄격히 적용</strong>됩니다.</li>
                <li>결제 전 무료 체험 기간이 제공되므로, 구매 후 기능 불만족은 환불 사유로 인정되지 않습니다.</li>
                <li>회사는 환불 심사 과정에서 요청을 거부할 수 있으며, 이에 대한 최종 결정권은 회사에 있습니다.</li>
            </ul>

            <h2 style={h2}>제8조 (분쟁 해결)</h2>
            <ul style={ul}>
                <li>환불과 관련한 분쟁은 전자상거래 등에서의 소비자보호에 관한 법률에 따릅니다.</li>
                <li>소비자 상담: 1544-7772 (토스페이먼츠)</li>
                <li>이메일 문의: cd000242@gmail.com</li>
            </ul>

            <div style={box}>
                <p style={{ margin: 0 }}>
                    <strong>💡 참고:</strong> 본 환불정책은{' '}
                    <Link to="/terms" style={{ color: '#FFD700' }}>이용약관</Link>{' '}
                    제4조(결제 및 환불)에 근거합니다. 구매 전 반드시 무료 체험을 이용해주세요.
                </p>
            </div>
        </LegalLayout>
    );
}

export default RefundPage;
