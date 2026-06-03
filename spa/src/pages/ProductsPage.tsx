import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import ParticlesCanvas from '../components/ParticlesCanvas';

/**
 * 제품 페이지 — payment-page/products.html (640줄) 마이그.
 * 가시 컨텐츠: Section header + Better Life Naver showcase + Leword showcase + Orbit showcase + 비교표.
 */

type Benefit = { icon: string; title: string; desc: string };

const BLN_BENEFITS: Benefit[] = [
    { icon: '⚡', title: '매일 100건, 사람이 쓴 것처럼', desc: 'GPT-4o, Gemini 2.5 등 AI 7종이 6,000~10,000자 자연스러운 본문 생성' },
    { icon: '👥', title: '블로그 10개를 혼자 운영하세요', desc: '계정 수 제한 없이 통합 관리. 계정별 개별 스케줄링' },
    { icon: '🌙', title: '자는 동안에도 블로그가 자란다', desc: '최적 시간대 자동 발행, 랜덤 딜레이로 봇 감지 우회' },
    { icon: '🎨', title: '저작권 걱정 없는 고유 이미지', desc: 'Imagen 4, DALL-E, ImageFX, Google Veo 영상까지 자동 생성·삽입' },
    { icon: '🛒', title: '쿠팡 파트너스로 월 수익 창출', desc: '쿠팡·네이버 스마트스토어 상품 크롤링 → 리뷰형 포스팅 → 제휴 링크 자동' },
    { icon: '🎯', title: '네이버 상위노출, AI가 알아서', desc: '14개 카테고리 맞춤 제목 생성, 홈피드 노출 최적화 100점 프로토콜' },
];

const LEWORD_BENEFITS: Benefit[] = [
    { icon: '📡', title: '4매체 실시간 검색어 통합', desc: '네이버 · ZUM · 네이트 · 다음 — 5분마다 자동 갱신, 한 화면에 모두' },
    { icon: '🧬', title: '17개 데이터 소스 교차검증', desc: '광고센터·트렌드·자동완성·시그널BZ 등을 동시에 비교 분석' },
    { icon: '📐', title: 'MDP v3.0 5차원 가중 기하평균', desc: '검색량·문서수·CPC·경쟁도·SERP — 한 점수로 결정론적 우선순위' },
    { icon: '🏆', title: 'SSS~B 등급 (4단 게이트)', desc: '점수 85+ AND 검색량 1,000+ AND 문서수 5,000↓ AND 비율 5+ 모두 통과만 SSS' },
    { icon: '⚡', title: 'Rising · 카테고리 롱테일 · PRO 헌터', desc: '4가지 발굴 엔진이 매일 새 후보를 채워줍니다' },
    { icon: '💰', title: 'Profit Engine — 블루오션 판정', desc: 'CPC 단일소스 DB로 트래픽뿐 아니라 수익 키워드까지' },
];

const ORBIT_BENEFITS: Benefit[] = [
    { icon: '🔗', title: '두 플랫폼을 한 화면에서', desc: 'WordPress REST API + Blogger API 기반 발행 흐름' },
    { icon: '🧠', title: '5개 콘텐츠 모드', desc: 'SEO·애드센스·쇼핑·내부링크·페러프레이징 목적별 글 생성' },
    { icon: '🎨', title: '썸네일과 H2 이미지 자동화', desc: 'Flow, ImageFX, Nano Banana, GPT Image 계열 이미지 엔진 지원' },
    { icon: '⚙️', title: '초기 세팅 시간 단축', desc: 'Blogspot 스킨·메타·웹마스터 등록 보조와 WordPress 결과물 지원' },
];

const COMPARISON: Array<{ feature: string; manual: string; generic: string; ours: string; manualColor?: string; genericColor?: string }> = [
    { feature: '한국어 AI 자연도', manual: '사람 작성', generic: '△ 영문 번역체', genericColor: '#b97a1a', ours: '✓ 한국어 네이티브 (7종 AI)' },
    { feature: '봇 감지 회피', manual: '위험 없음', generic: '△ 기본 딜레이', genericColor: '#b97a1a', ours: '✓ 사람형 타이핑 + 세션 워밍업 + jitter' },
    { feature: '다계정 지원', manual: '사람이 직접', generic: '× 단일', genericColor: '#ff3b5c', ours: '✓ 무제한' },
    { feature: 'AI 이미지 생성', manual: '별도 도구', generic: '× 또는 유료 추가', genericColor: '#ff3b5c', ours: '✓ Imagen 4 / gpt-image-1.5 포함' },
    { feature: '하루 10건 소요 시간', manual: '3~5시간', manualColor: '#ff3b5c', generic: '30분 설정 후 자동', ours: '✓ 키워드 입력만 (5분)' },
    { feature: '카카오톡 무료 지원', manual: '—', generic: '×', genericColor: '#ff3b5c', ours: '✓ 1:1 상담' },
    { feature: '무료 체험', manual: '—', generic: '× 또는 제한적', genericColor: '#ff3b5c', ours: '✓ 매일 2건 무제한 기간' },
];

function BenefitList({ items }: { items: Benefit[] }) {
    return (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 16, padding: 0, margin: '24px 0 32px' }}>
            {items.map((b, i) => (
                <li key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{b.icon}</span>
                    <div>
                        <strong style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{b.title}</strong>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{b.desc}</span>
                    </div>
                </li>
            ))}
        </ul>
    );
}

interface ShowcaseProps {
    tag: React.ReactNode;
    title: string;
    subtitle: string;
    desc: React.ReactNode;
    benefits: Benefit[];
    cta: { to: string; label: string };
    visual: React.ReactNode;
    accent?: 'green' | 'blue' | 'orbit';
}

function ProductShowcase({ tag, title, subtitle, desc, benefits, cta, visual, accent = 'green' }: ShowcaseProps) {
    // 카드 배경: 텍스트 가독성을 위해 색깔이 들어간 카드로 감쌈.
    const palette = accent === 'orbit'
        ? { bg: 'linear-gradient(135deg, rgba(14,165,233,0.18), rgba(34,197,94,0.07))', border: 'rgba(125,211,252,0.34)' }
        : accent === 'blue'
        ? { bg: 'linear-gradient(135deg, rgba(20,120,255,0.18), rgba(20,120,255,0.06))', border: 'rgba(80,150,255,0.35)' }
        : { bg: 'linear-gradient(135deg, rgba(20,170,90,0.20), rgba(20,170,90,0.06))', border: 'rgba(50,200,120,0.35)' };

    return (
        <div className="fade-in" style={{
            padding: 'clamp(28px, 4vw, 48px)',
            marginBottom: 60,
            borderRadius: 24,
            background: palette.bg,
            border: `1px solid ${palette.border}`,
            backdropFilter: 'blur(14px)',
            boxShadow: '0 10px 36px rgba(0,0,0,0.25)',
        }}>
            <div className="product-showcase-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 48, alignItems: 'center' }}>
                <div>
                    <ProductInfo tag={tag} title={title} subtitle={subtitle} desc={desc} />
                    <BenefitList items={benefits} />
                    <Link to={cta.to} style={ctaStyle}>{cta.label}</Link>
                </div>
                <div>{visual}</div>
            </div>
        </div>
    );
}

const ctaStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '14px 28px',
    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--gold-primary)', fontSize: 15, fontWeight: 700,
    textDecoration: 'none', transition: 'all 0.2s',
};

function ProductInfo({ tag, title, subtitle, desc }: Pick<ShowcaseProps, 'tag' | 'title' | 'subtitle' | 'desc'>) {
    return (
        <>
            <div style={{ display: 'inline-block', padding: '6px 14px', background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.3)', borderRadius: 50, fontSize: 12, fontWeight: 800, color: 'var(--gold-primary)', marginBottom: 16 }}>{tag}</div>
            <h3 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 900, marginBottom: 8, letterSpacing: '-1px' }}>{title}</h3>
            <p style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 16, fontWeight: 600 }}>{subtitle}</p>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{desc}</p>
        </>
    );
}

function VisualMockup({ title, children, tint = 'gold' }: { title: string; children: React.ReactNode; tint?: 'gold' | 'purple' | 'blue' }) {
    return (
        <div style={{
            borderRadius: 16,
            overflow: 'hidden',
            border: tint === 'purple'
                ? '1px solid rgba(124,58,237,0.25)'
                : tint === 'blue' ? '1px solid rgba(56,189,248,0.28)' : '1px solid var(--border-glass)',
            background: tint === 'purple'
                ? 'linear-gradient(135deg, rgba(124,58,237,0.10) 0%, rgba(124,58,237,0.04) 100%)'
                : tint === 'blue' ? 'linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(34,197,94,0.05) 100%)'
                : '#1a1a2e',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>{title}</span>
            </div>
            <div style={{ padding: 0 }}>{children}</div>
        </div>
    );
}

function ProductsPage() {
    useEffect(() => {
        const prev = document.title;
        document.title = '제품 정보 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    return (
        <>
            <ParticlesCanvas />
            <section className="section" style={{ paddingTop: 120, position: 'relative', zIndex: 1 }}>
                <div className="section-inner">
                    <div className="section-header">
                        <span className="section-tag">PRODUCTS</span>
                        <h2 className="section-title">당신에게 맞는 자동화를 선택하세요</h2>
                        <p className="section-desc">각 플랫폼에 최적화된 전문 자동화 솔루션</p>
                    </div>

                    {/* Better Life Naver */}
                    <ProductShowcase
                        accent="green"
                        tag={<>🚀 FLAGSHIP</>}
                        title="Better Life Naver"
                        subtitle="네이버 블로그 자동화"
                        desc={<>키워드 하나만 입력하면 끝.<br />AI가 글을 쓰고, 이미지를 만들고, <strong style={{ color: 'var(--text-primary)' }}>네이버 블로그에 자동으로 올립니다.</strong></>}
                        benefits={BLN_BENEFITS}
                        cta={{ to: '/detail', label: '자세히 보기 →' }}
                        visual={
                            <VisualMockup title="Better Life Naver — Dashboard">
                                <video autoPlay muted loop playsInline style={{ width: '100%', display: 'block' }}>
                                    <source src="/images/hero-demo.mp4" type="video/mp4" />
                                </video>
                            </VisualMockup>
                        }
                    />

                    {/* Leword */}
                    <ProductShowcase
                        accent="blue"
                        tag={<span style={{ background: 'linear-gradient(135deg, #7C3AED, #A78BFA)', color: '#fff', padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 800 }}>💎 INTELLIGENCE</span>}
                        title="Leword"
                        subtitle="AI 키워드 인텔리전스 · 실시간 트렌드"
                        desc={<>네이버·ZUM·네이트·다음 <strong style={{ color: 'var(--text-primary)' }}>4개 매체 실시간 검색어</strong>를 한 화면에서.<br />17개 데이터 소스 교차검증으로 <strong style={{ color: 'var(--text-primary)' }}>황금키워드 SSS 등급만</strong> 골라드립니다.</>}
                        benefits={LEWORD_BENEFITS}
                        cta={{ to: '/leword', label: '자세히 보기 →' }}
                        visual={
                            <VisualMockup title="Leword — 실시간 검색어 모니터링" tint="purple">
                                <img src="/images/leword/realtime-monitor-hero.png" alt="Leword 실시간 검색어 모니터링 — 네이버·ZUM·네이트·다음 4매체 통합" loading="lazy" style={{ width: '100%', display: 'block' }} />
                            </VisualMockup>
                        }
                    />

                    {/* Leaders Orbit */}
                    <ProductShowcase
                        accent="orbit"
                        tag={<span style={{ background: 'linear-gradient(135deg, #38bdf8, #34d399)', color: '#06111d', padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 900 }}>🌐 GLOBAL</span>}
                        title="Leaders Orbit"
                        subtitle="블로그스팟 · 워드프레스 자동화"
                        desc={<>키워드 입력부터 AI 콘텐츠 생성, 이미지, 발행, 원클릭 세팅까지.<br /><strong style={{ color: 'var(--text-primary)' }}>Leaders Pro 올인원 이용권</strong> 안에서 함께 사용하는 글로벌 블로그 자동화입니다.</>}
                        benefits={ORBIT_BENEFITS}
                        cta={{ to: '/orbit', label: '자세히 보기 →' }}
                        visual={
                            <VisualMockup title="Leaders Orbit — Global Publisher" tint="blue">
                                <img src="/images/orbit/orbit-ready.png" alt="Leaders Orbit 워드프레스 블로그스팟 자동 발행 화면" loading="lazy" style={{ width: '100%', display: 'block' }} />
                            </VisualMockup>
                        }
                    />

                    {/* CRO-2 비교표 */}
                    <div style={{ maxWidth: 1000, margin: '80px auto 0' }}>
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <span className="section-tag">WHY LEADERS PRO</span>
                            <h2 className="section-title">왜 리더스프로(Leaders Pro)일까?</h2>
                            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 8 }}>수동 작성·일반 자동화 도구와 비교한 핵심 차별점</p>
                        </div>
                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'separate', borderSpacing: 0, background: 'rgba(255,255,255,0.95)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 28px rgba(0,0,0,0.14)', fontSize: 14 }}>
                                <thead>
                                    <tr style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05))' }}>
                                        <th style={{ padding: '16px 14px', textAlign: 'left', color: '#14304d', fontWeight: 700, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>기능 / 항목</th>
                                        <th style={{ padding: '16px 14px', textAlign: 'center', color: '#8a9aae', fontWeight: 600, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>수동 작성</th>
                                        <th style={{ padding: '16px 14px', textAlign: 'center', color: '#8a9aae', fontWeight: 600, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>일반 자동화 도구</th>
                                        <th style={{ padding: '16px 14px', textAlign: 'center', color: '#c9a84c', fontWeight: 800, borderBottom: '1px solid rgba(0,0,0,0.08)', background: 'rgba(201,168,76,0.08)' }}>Leaders Pro</th>
                                    </tr>
                                </thead>
                                <tbody style={{ color: '#3d5876' }}>
                                    {COMPARISON.map((row, i) => (
                                        <tr key={i}>
                                            <td style={{ padding: 14, borderBottom: i < COMPARISON.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>{row.feature}</td>
                                            <td style={{ padding: 14, textAlign: 'center', borderBottom: i < COMPARISON.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none', color: row.manualColor || 'inherit' }}>{row.manual}</td>
                                            <td style={{ padding: 14, textAlign: 'center', borderBottom: i < COMPARISON.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none', color: row.genericColor || 'inherit' }}>{row.generic}</td>
                                            <td style={{ padding: 14, textAlign: 'center', borderBottom: i < COMPARISON.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none', background: 'rgba(201,168,76,0.04)', color: '#1a8a55', fontWeight: 600 }}>{row.ours}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ textAlign: 'center', marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <Link to="/download" style={{ display: 'inline-block', padding: '14px 28px', background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 50, color: '#14304d', textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>🎁 먼저 무료 체험</Link>
                            <Link to="/pricing" style={{ display: 'inline-block', padding: '14px 28px', background: 'linear-gradient(135deg, #c9a84c, #d4a012)', borderRadius: 50, color: '#1a1a2e', textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>🚀 요금제 확인하기 →</Link>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}

export default ProductsPage;
