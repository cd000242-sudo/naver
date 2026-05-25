import { Link } from 'react-router-dom';

// Phase 1b 임시 IndexPage — Layout 안에서 작동 확인용.
// Phase 2에서 기존 index.html (12,652줄) 본격 마이그레이션.
function IndexPage() {
    return (
        <div style={{ minHeight: '100vh', padding: '120px 24px 60px', background: '#0a0a0f', color: '#fff', fontFamily: 'Pretendard Variable, sans-serif' }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
                <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, marginBottom: 16, background: 'linear-gradient(135deg, #c9a84c, #d4a012)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    👑 Leaders Pro
                </h1>
                <p style={{ fontSize: 18, color: '#a0a0b0', marginBottom: 8 }}>AI 네이버 블로그 자동화의 끝판왕</p>
                <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>
                    Phase 1b · Router + Layout + 공통 컴포넌트 (Navbar/Footer/MusicPlayer/SakuraPetals/FloatStack)
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, maxWidth: 800, margin: '0 auto' }}>
                    {[
                        { to: '/products', label: '🚀 제품정보', desc: 'Better Life Naver · Leword' },
                        { to: '/pricing', label: '💎 구매', desc: '4가지 요금제' },
                        { to: '/leword', label: '🎯 Leword', desc: 'AI 키워드 인텔리전스' },
                        { to: '/reviews', label: '⭐ 후기', desc: '사용자 리얼 후기' },
                        { to: '/community', label: '💬 커뮤니티', desc: '소통과 정보' },
                        { to: '/download', label: '⬇️ 다운로드', desc: '최신 .exe' },
                    ].map(card => (
                        <Link
                            key={card.to}
                            to={card.to}
                            style={{
                                padding: 24, borderRadius: 16,
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                textDecoration: 'none', color: '#fff',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,168,76,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        >
                            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{card.label}</div>
                            <div style={{ fontSize: 13, color: '#a0a0b0' }}>{card.desc}</div>
                        </Link>
                    ))}
                </div>

                <div style={{ marginTop: 60, padding: 20, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 12, maxWidth: 600, margin: '60px auto 0' }}>
                    <div style={{ fontSize: 12, color: '#A78BFA', fontWeight: 800, marginBottom: 8 }}>🛡️ Phase 1b 검증 포인트</div>
                    <ul style={{ textAlign: 'left', fontSize: 13, color: '#a0a0b0', lineHeight: 1.8, listStyle: 'none' }}>
                        <li>✓ 우상단 네비게이션 보임 (홈/제품정보/구매/...)</li>
                        <li>✓ 페이지 클릭 시 즉시 전환 (URL 변경)</li>
                        <li>✓ 음악 플레이어 우하단 (♪ Music FAB)</li>
                        <li>✓ 우하단 stack: 1:1 문의 / 단톡방 / 유튜브 채널</li>
                        <li>✓ 벚꽃 페탈 떨어짐 (Sakura)</li>
                        <li>✓ 페이지 이동해도 음악 끊김 0 (Layout 영구 mount)</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default IndexPage;
