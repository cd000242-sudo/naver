import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface Props {
    title: string;
    effective: string;
    children: ReactNode;
}

/**
 * 약관/개인정보처리방침/환불정책 공통 레이아웃.
 * 원본 *.html 의 .legal-hero + .legal-content 패턴을 그대로 옮김.
 */
function LegalLayout({ title, effective, children }: Props) {
    return (
        <div style={{
            maxWidth: 900, margin: '0 auto',
            padding: '160px 24px 80px',
            position: 'relative', zIndex: 1,
        }}>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
                <h1 style={{
                    fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 900, marginBottom: 12,
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>{title}</h1>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{effective}</p>
            </div>

            <div style={{
                background: 'rgba(18,18,26,0.6)', backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16, padding: 'clamp(24px, 4vw, 48px)',
                color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 1.8,
            }} className="legal-content">
                {children}
                <div style={{ marginTop: 40, textAlign: 'center' }}>
                    <Link to="/" style={{
                        display: 'inline-block', padding: '10px 24px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 10, color: '#fff', fontSize: 14,
                        textDecoration: 'none',
                    }}>← 메인으로 돌아가기</Link>
                </div>
            </div>
        </div>
    );
}

export default LegalLayout;
