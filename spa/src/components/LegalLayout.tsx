import { Link } from 'react-router-dom';
import SplitWords from './motion/SplitWords';
import type { ReactNode } from 'react';
import { light, lightRadius, motion, type } from '../styles/tokens';
import { ShellIcon } from './ShellIcons';

interface Props {
    title: string;
    effective: string;
    children: ReactNode;
}

/**
 * 약관/개인정보처리방침/환불정책 공통 레이아웃.
 * 원본 *.html 의 .legal-hero + .legal-content 패턴을 그대로 옮김.
 *
 * The legal pages set their own light colours inline; only the back link and focus ring live here.
 */
function LegalLayout({ title, effective, children }: Props) {
    return (
        <div style={{
            maxWidth: 900, margin: '0 auto',
            padding: '160px 24px 80px',
            position: 'relative', zIndex: 1,
        }}>
            <style>{`
                .legal-content a.legal-back { color: ${light.text} !important; text-decoration: none; }
                .legal-content a.legal-back:hover { background: ${light.raised}; border-color: ${light.lineStrong}; }
                .legal-content :focus-visible { outline: 2px solid ${light.text}; outline-offset: 2px; }
            `}</style>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <h1 style={{
                    fontSize: `clamp(${type.h1Mobile}px, 5vw, ${type.h1}px)`, fontWeight: 700, lineHeight: 1.25,
                    marginBottom: 12, color: light.text,
                }}><SplitWords text={title} /></h1>
                <p style={{ color: light.textMuted, fontSize: type.small }}>{effective}</p>
            </div>

            <div style={{
                background: light.surface,
                border: `1px solid ${light.line}`,
                borderRadius: lightRadius.panel, padding: 'clamp(24px, 4vw, 48px)',
                color: light.text, fontSize: type.body, lineHeight: 1.8,
            }} className="legal-content">
                {children}
                <div style={{ marginTop: 40, textAlign: 'center' }}>
                    <Link to="/" className="legal-back" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        minHeight: 44, padding: '0 20px',
                        background: light.surface,
                        border: `1px solid ${light.line}`,
                        borderRadius: lightRadius.control, fontSize: type.small, fontWeight: 500,
                        transition: `background-color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease}`,
                    }}>
                        <ShellIcon name="chevronLeft" size={16} />
                        메인으로 돌아가기
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default LegalLayout;
