/**
 * 구매 뒤 다음 할 일 — 설치 파일 바로가기 · 다운로드 비밀번호 · (LEWORD · 올인원) 노션 사용법.
 * 2026-10-07 사장님 "구매하면 다운로드 바로가기랑 비밀번호 알려 주는지 — 어떤 제품이든" · "LEWORD 사용법 노션 볼 수 있게".
 * 무통장 완료 · 주문 조회가 같이 쓴다(카드 완료는 payment-page/success.html 이 같은 규칙으로 그린다).
 */
import type { CSSProperties } from 'react';
import { DOWNLOAD_PASSWORD, LEWORD_GUIDE_URL, purchaseGuide } from '../../lib/purchaseGuide.mjs';
import { light, lightRadius, type } from '../../styles/tokens';

/* The box paints its own surface, so it reads the same on any page that hosts it. */
const linkBase: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 16px',
    borderRadius: lightRadius.control, fontSize: type.small, fontWeight: 600, textDecoration: 'none',
};

export default function PurchaseNextSteps({ product, compact = false }: { product: string; compact?: boolean }) {
    const guide = purchaseGuide(product);
    return (
        <div style={{ marginTop: compact ? 12 : 16, padding: compact ? 12 : 16, borderRadius: lightRadius.control, border: `1px solid ${light.line}`, background: light.raised, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <a href={guide.downloadHref} target="_blank" rel="noreferrer"
                    style={{ ...linkBase, background: light.btn, color: light.onBtn }}>
                    설치 파일 받기
                </a>
                <span style={{ color: light.textSecondary, fontSize: type.small }}>
                    다운로드 비밀번호 <strong style={{ color: light.text, background: light.surface, border: `1px solid ${light.line}`, padding: '4px 8px', borderRadius: 6, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{DOWNLOAD_PASSWORD}</strong>
                </span>
            </div>
            {guide.showGuide && (
                <a href={LEWORD_GUIDE_URL} target="_blank" rel="noreferrer"
                    style={{ ...linkBase, justifySelf: 'start', background: light.surface, border: `1px solid ${light.lineStrong}`, color: light.text }}>
                    LEWORD 사용법 보기(노션)
                </a>
            )}
        </div>
    );
}
