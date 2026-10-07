/**
 * 구매 뒤 다음 할 일 — 설치 파일 바로가기 · 다운로드 비밀번호 · (LEWORD · 올인원) 노션 사용법.
 * 2026-10-07 사장님 "구매하면 다운로드 바로가기랑 비밀번호 알려 주는지 — 어떤 제품이든" · "LEWORD 사용법 노션 볼 수 있게".
 * 무통장 완료 · 주문 조회가 같이 쓴다(카드 완료는 payment-page/success.html 이 같은 규칙으로 그린다).
 */
import { DOWNLOAD_PASSWORD, LEWORD_GUIDE_URL, purchaseGuide } from '../../lib/purchaseGuide.mjs';

export default function PurchaseNextSteps({ product, compact = false }: { product: string; compact?: boolean }) {
    const guide = purchaseGuide(product);
    return (
        <div style={{ marginTop: compact ? 10 : 16, padding: compact ? '10px 12px' : '14px 16px', borderRadius: 12, border: '1px solid rgba(201,168,76,0.28)', background: 'rgba(201,168,76,0.06)', display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <a href={guide.downloadHref} target="_blank" rel="noreferrer"
                    style={{ padding: '9px 16px', borderRadius: 9, background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#1a1200', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
                    📥 설치 파일 받기
                </a>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12.5 }}>
                    다운로드 비밀번호 <strong style={{ color: '#fff', background: 'rgba(201,168,76,0.3)', padding: '2px 8px', borderRadius: 4 }}>{DOWNLOAD_PASSWORD}</strong>
                </span>
            </div>
            {guide.showGuide && (
                <a href={LEWORD_GUIDE_URL} target="_blank" rel="noreferrer"
                    style={{ justifySelf: 'start', padding: '8px 14px', borderRadius: 9, border: '1px solid #44d7b6', color: '#44d7b6', fontWeight: 700, fontSize: 12.5, textDecoration: 'none' }}>
                    📘 LEWORD 사용법 보기(노션)
                </a>
            )}
        </div>
    );
}
