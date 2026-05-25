// Phase 1b placeholder — 각 페이지가 라우터로 잘 연결되는지 확인용.
// Phase 2~6 에서 기존 payment-page/*.html 마이그레이션 시 교체.

interface Props {
    title: string;
    emoji: string;
    desc?: string;
    fromFile?: string;
}

function Placeholder({ title, emoji, desc, fromFile }: Props) {
    return (
        <div style={{ minHeight: '100vh', padding: '120px 24px 60px', background: '#0a0a0f', color: '#fff' }}>
            <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
                <div style={{ fontSize: 80, marginBottom: 16 }}>{emoji}</div>
                <h1 style={{ fontSize: 48, fontWeight: 900, marginBottom: 12, background: 'linear-gradient(135deg, #c9a84c, #d4a012)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    {title}
                </h1>
                {desc && <p style={{ fontSize: 18, color: '#a0a0b0', marginBottom: 24 }}>{desc}</p>}
                <div style={{ display: 'inline-block', padding: '12px 24px', background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 12, fontSize: 13, color: '#A78BFA' }}>
                    🚧 Phase 2~6 마이그레이션 대기
                    {fromFile && <div style={{ marginTop: 6, fontSize: 11, color: '#a0a0b0' }}>(원본: <code>payment-page/{fromFile}</code>)</div>}
                </div>
            </div>
        </div>
    );
}

export default Placeholder;
