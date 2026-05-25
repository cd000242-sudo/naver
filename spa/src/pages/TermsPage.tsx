import { useEffect } from 'react';
import LegalLayout from '../components/LegalLayout';

const h2: React.CSSProperties = { fontSize: 20, fontWeight: 800, color: '#FFD700', margin: '32px 0 14px' };
const ul: React.CSSProperties = { paddingLeft: 22, margin: '0 0 16px' };

/** 이용약관 — payment-page/terms.html 마이그 */
function TermsPage() {
    useEffect(() => {
        const prev = document.title;
        document.title = '이용약관 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    return (
        <LegalLayout title="이용약관" effective="시행일: 2026년 3월 24일 (최종 수정)">
            <h2 style={{ ...h2, marginTop: 0 }}>제1조 (목적)</h2>
            <p>본 약관은 Leaders Pro (이하 "회사")가 제공하는 블로그 자동화 소프트웨어 (이하 "서비스")의 이용 조건과 절차, 권리, 의무 및 기타 필요한 사항을 규정함을 목적으로 합니다.</p>

            <h2 style={h2}>제2조 (정의)</h2>
            <ul style={ul}>
                <li>"서비스"란 회사가 제공하는 Leaders Pro, Leaders Orbit, Leaders Tistory, Leword 등의 자동화 프로그램을 의미합니다.</li>
                <li>"라이선스 코드"란 서비스 이용을 위해 발급되는 고유한 인증 코드를 의미합니다.</li>
                <li>"이용자"란 본 약관에 동의하고 라이선스를 구매한 자를 의미합니다.</li>
            </ul>

            <h2 style={h2}>제3조 (라이선스)</h2>
            <ul style={ul}>
                <li>라이선스 코드는 구매자 본인에게만 사용 권한이 부여됩니다.</li>
                <li>1개월권: 구매일로부터 30일간 유효합니다.</li>
                <li>3개월권: 구매일로부터 90일간 유효합니다.</li>
                <li>1년권: 구매일로부터 365일간 유효합니다.</li>
                <li>영구제: 기간 제한 없이 사용 가능합니다.</li>
                <li>라이선스 코드의 양도, 재판매, 공유는 금지됩니다.</li>
                <li>동시에 1대의 기기에서만 사용 가능합니다.</li>
            </ul>

            <h2 style={h2}>제4조 (결제 및 환불)</h2>
            <ul style={ul}>
                <li>결제는 토스페이먼츠를 통해 처리되며, 카드 결제 및 계좌이체를 지원합니다.</li>
                <li>모든 가격은 부가가치세(VAT)가 포함된 금액입니다.</li>
                <li>라이선스 코드 발급 후 7일 이내, 서비스 미사용 시 전액 환불 가능합니다.</li>
                <li>서비스 사용 이력이 있는 경우 환불이 제한될 수 있습니다.</li>
                <li>환불은 cd000242@gmail.com으로 요청해주세요.</li>
            </ul>

            <h2 style={h2}>제5조 (서비스 이용 제한)</h2>
            <p>다음의 경우 서비스 이용이 제한될 수 있습니다:</p>
            <ul style={ul}>
                <li>라이선스 코드를 타인에게 공유하거나 판매하는 행위</li>
                <li>서비스를 역공학, 분해, 변조하는 행위</li>
                <li>서비스를 이용하여 불법적인 활동을 하는 행위</li>
            </ul>

            <h2 style={h2}>제6조 (면책)</h2>
            <ul style={ul}>
                <li>네이버 등 외부 플랫폼의 정책 변경으로 인한 서비스 기능 제한에 대해 회사는 책임을 지지 않습니다.</li>
                <li>이용자의 부주의로 인한 라이선스 코드 분실에 대해 책임지지 않습니다. (이메일 백업을 권장합니다)</li>
            </ul>

            <h2 style={h2}>제7조 (약관 변경)</h2>
            <p>회사는 필요 시 약관을 변경할 수 있으며, 변경 사항은 본 페이지에 게시됩니다.</p>
        </LegalLayout>
    );
}

export default TermsPage;
