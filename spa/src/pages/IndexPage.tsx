import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ParticlesCanvas from '../components/ParticlesCanvas';
import TrustCounter from '../components/TrustCounter';
import { fetchSiteContent, type SiteContent } from '../lib/siteOps';

/**
 * 메인 페이지 — payment-page/index.html (838줄) 마이그레이션.
 * 4개 섹션: Hero · TrustBar · Explore · Testimonials.
 * inline style 그대로 유지 (사용자 요구).
 */
function IndexPage() {
    const [siteContent, setSiteContent] = useState<SiteContent | null>(null);
    const [showRobotFrame, setShowRobotFrame] = useState(false);

    // SEO meta (페이지 진입 시 document.title 변경)
    useEffect(() => {
        const prevTitle = document.title;
        document.title = '리더스프로 | Leaders Pro 네이버 자동화 툴 · AI 블로그 자동 발행';
        return () => { document.title = prevTitle; };
    }, []);

    // fade-in scroll animation (.fade-in 클래스 보유 요소 자동 감지)
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry, i) => {
                if (entry.isIntersecting) {
                    (entry.target as HTMLElement).style.transitionDelay = `${i * 0.08}s`;
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        fetchSiteContent().then(setSiteContent);
    }, []);

    const heroTitle = siteContent?.hero?.title || '매일 100건,\n사람이 쓴 것처럼.';
    const heroLines = heroTitle.split('\n').filter(Boolean);
    const heroLead = heroLines.slice(0, -1).join('\n') || '매일 100건,';
    const heroAccent = heroLines[heroLines.length - 1] || '사람이 쓴 것처럼.';
    const heroDesc = siteContent?.hero?.desc || '키워드만 넣으면 AI가 글 · 이미지 · 발행까지 자동으로.\n블로그 10개를 혼자 운영하는 분들의 비밀 무기.';
    const heroBenefit = siteContent?.hero?.benefit || '2,800+명이 사용 중';
    const heroNotice = siteContent?.hero?.notice || '';

    return (
        <>
            <ParticlesCanvas />

            {/* ═══ HERO ═══ */}
            <section className="home-hero" style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 40, padding: '120px 24px 60px', maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 1, alignItems: 'center' }}>
                <div className="hero-content">
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.3)', borderRadius: 50, fontSize: 12, fontWeight: 800, letterSpacing: 2, color: 'var(--gold-primary)', marginBottom: 24 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold-primary)', boxShadow: '0 0 8px var(--gold-primary)' }} />
                        <span>PREMIUM AUTOMATION</span>
                    </div>
                    <h1 style={{ fontSize: 'clamp(40px, 6vw, 64px)', fontWeight: 900, lineHeight: 1.2, letterSpacing: '-2px', marginBottom: 20 }}>
                        {heroLead.split('\n').map((line) => <span key={line}>{line}<br /></span>)}
                        <span style={{ background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-light))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{heroAccent}</span>
                    </h1>
                    <p style={{ fontSize: 18, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 32 }}>
                        {heroDesc.split('\n').map((line, index) => (
                            <span key={`${line}-${index}`}>{line}{index < heroDesc.split('\n').length - 1 ? <br /> : null}</span>
                        ))}
                    </p>
                    {heroNotice && (
                        <div style={{ marginBottom: 24, padding: '12px 16px', border: '1px solid rgba(201,168,76,0.28)', borderRadius: 12, color: 'var(--gold-primary)', background: 'rgba(201,168,76,0.08)', fontSize: 14, fontWeight: 700 }}>
                            {heroNotice}
                        </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24 }}>
                        <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px', background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-light))', color: '#1a1a2e', borderRadius: 12, fontWeight: 800, fontSize: 16, textDecoration: 'none', boxShadow: '0 8px 24px rgba(201, 168, 76, 0.4)' }}>
                            <span>지금 자동화 시작하기</span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                        </Link>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex' }}>
                                {[
                                    { bg: 'linear-gradient(135deg, #667eea, #764ba2)', letter: 'J' },
                                    { bg: 'linear-gradient(135deg, #f093fb, #f5576c)', letter: 'K' },
                                    { bg: 'linear-gradient(135deg, #4facfe, #00f2fe)', letter: 'L' },
                                ].map((a, i) => (
                                    <div key={i} style={{ width: 32, height: 32, borderRadius: '50%', background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, border: '2px solid var(--bg-dark)', marginLeft: i === 0 ? 0 : -10 }}>{a.letter}</div>
                                ))}
                            </div>
                            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{heroBenefit}</span>
                        </div>
                    </div>
                </div>
                <div className="hero-robot-stage">
                    <div className="robot-ambient robot-ambient-main" />
                    <div className="robot-ambient robot-ambient-blue" />
                    <div className="robot-orbit robot-orbit-one" />
                    <div className="robot-orbit robot-orbit-two" />
                    <div className="robot-gridline" />
                    <div className="robot-chip robot-chip-top">
                        <span />
                        <b>AUTO PILOT READY</b>
                    </div>
                    <div className="robot-chip robot-chip-left">
                        <b>127K</b>
                        <span>누적 발행</span>
                    </div>
                    <div className="robot-chip robot-chip-right">
                        <b>AI + CTA</b>
                        <span>글·이미지·발행</span>
                    </div>
                    {showRobotFrame ? (
                        <iframe
                            src="https://my.spline.design/nexbotrobotcharacterconcept-mQLqodza99cchehegYbwsdiu/"
                            title="3D Robot"
                            frameBorder="0"
                            width="100%"
                            height="500"
                            allowFullScreen
                            loading="lazy"
                            className="hero-robot-frame"
                        />
                    ) : (
                        <button
                            type="button"
                            className="hero-robot-frame robot-frame-placeholder"
                            onClick={() => setShowRobotFrame(true)}
                            aria-label="3D 로봇 미리보기 열기"
                        >
                            <span className="robot-placeholder-core">AI</span>
                            <strong>3D 미리보기</strong>
                            <small>클릭하면 로봇 씬을 불러옵니다</small>
                        </button>
                    )}
                    <div className="robot-scanline" />
                    <div className="robot-console">
                        <span>LIVE OPS</span>
                        <strong>Keyword → Draft → Image → Publish</strong>
                        <small>queue stable · multi account · 99% uptime</small>
                    </div>
                </div>
            </section>

            {/* ═══ TRUST BAR ═══ */}
            <section style={{ padding: '40px 24px', maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', gap: 24, position: 'relative', zIndex: 1, borderTop: '1px solid var(--border-glass)', borderBottom: '1px solid var(--border-glass)' }}>
                <TrustCounter target={127000} label="누적 발행" />
                <div style={{ width: 1, height: 40, background: 'var(--border-glass)' }} />
                <TrustCounter target={2847} label="활성 사용자" />
                <div style={{ width: 1, height: 40, background: 'var(--border-glass)' }} />
                <TrustCounter target={99} label="가동률 %" />
                <div style={{ width: 1, height: 40, background: 'var(--border-glass)' }} />
                <TrustCounter target={15000} label="일일 자동 발행" />
            </section>

            {/* ═══ EXPLORE GRID ═══ */}
            <section className="section">
                <div className="section-inner">
                    <div className="section-header">
                        <span className="section-tag">EXPLORE</span>
                        <h2 className="section-title">원하는 정보를 빠르게 확인하세요</h2>
                        <p className="section-desc">각 페이지에서 상세 정보를 확인할 수 있습니다</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 1000, margin: '0 auto' }}>
                        {[
                            { to: '/products', emoji: '🚀', title: '제품 소개', desc: 'Leaders Pro의 강력한 블로그 자동화 기능을\n자세히 확인하세요', cta: '자세히 보기 →' },
                            { to: '/pricing', emoji: '💰', title: '구매', desc: '올인원 기간권 선택 및\n토스페이먼츠 안전 결제', cta: '가격표 보기 →', highlight: true, badge: '💳 결제' },
                            { to: '/reviews', emoji: '⭐', title: '후기 & FAQ', desc: '실제 사용자들의 생생한 후기와\n자주 묻는 질문 모음', cta: '후기 보기 →' },
                            { to: '/community', emoji: '👥', title: '커뮤니티', desc: '공지사항, 수익 인증,\n활용 팁 확인', cta: '커뮤니티 →' },
                            { to: '/download', emoji: '📥', title: '다운로드', desc: '구매 후 비밀번호 입력으로\n최신 버전 다운로드', cta: '다운로드 →' },
                            { to: '/lookup', emoji: '🔍', title: '주문 조회', desc: '이메일 또는 주문번호로\n구매 내역 확인', cta: '조회하기 →' },
                        ].map(card => (
                            <Link
                                key={card.to}
                                to={card.to}
                                className="fade-in"
                                style={{
                                    textDecoration: 'none',
                                    background: 'var(--bg-card)',
                                    border: card.highlight ? '1px solid var(--border-gold)' : '1px solid var(--border-glass)',
                                    borderRadius: 'var(--radius-lg)',
                                    padding: '36px 28px',
                                    backdropFilter: 'blur(20px)',
                                    transition: 'all 0.3s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = 'var(--border-gold)';
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = card.highlight ? '0 12px 40px rgba(201,168,76,0.25)' : '0 12px 40px rgba(201,168,76,0.15)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = card.highlight ? 'var(--border-gold)' : 'var(--border-glass)';
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                {card.badge && (
                                    <div style={{ position: 'absolute', top: 12, right: 12, background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-light))', color: '#000', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>{card.badge}</div>
                                )}
                                <div style={{ fontSize: 40, marginBottom: 16 }}>{card.emoji}</div>
                                <h3 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{card.title}</h3>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-line' }}>{card.desc}</p>
                                <span style={{ color: 'var(--gold-primary)', fontSize: 13, fontWeight: 600 }}>{card.cta}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ TESTIMONIALS ═══ */}
            <section className="section">
                <div className="section-inner">
                    <div className="section-header">
                        <span className="section-tag">TESTIMONIALS</span>
                        <h2 className="section-title">실제 사용자들의 이야기</h2>
                        <p className="section-desc">Leaders Pro를 경험한 분들의 생생한 후기</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, maxWidth: 1000, margin: '0 auto' }}>
                        {[
                            {
                                quote: <>블로그 10개를 혼자 운영하는데, <strong style={{ color: 'var(--text-primary)' }}>리더스 프로 없었으면 불가능</strong>했어요. 출근 전에 키워드만 세팅하면 퇴근할 때 50건이 올라가 있습니다.</>,
                                bg: 'linear-gradient(135deg, #667eea, #764ba2)',
                                letter: 'K',
                                name: 'K 대표',
                                meta: '마케팅 에이전시 · 10개월 사용',
                            },
                            {
                                quote: <>쿠팡 파트너스 블로그를 4개 돌리고 있는데, 쇼핑 커넥트 기능으로 <strong style={{ color: 'var(--text-primary)' }}>월 수익이 3배</strong> 뛰었어요. AI가 생성한 리뷰 글이 정말 자연스러워요.</>,
                                bg: 'linear-gradient(135deg, #f093fb, #f5576c)',
                                letter: 'P',
                                name: 'P님',
                                meta: '제휴 마케터 · 6개월 사용',
                            },
                            {
                                quote: <>글로벌 블로그 5개를 Leaders Orbit으로 운영 중입니다. <strong style={{ color: 'var(--text-primary)' }}>애드센스 승인이 2주 만에</strong> 떨어졌고, 지금은 월 $400 이상 벌고 있어요.</>,
                                bg: 'linear-gradient(135deg, #4facfe, #00f2fe)',
                                letter: 'L',
                                name: 'L님',
                                meta: '글로벌 블로거 · 8개월 사용',
                            },
                        ].map((t, i) => (
                            <div key={i} className="fade-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: 32, backdropFilter: 'blur(20px)' }}>
                                <div style={{ fontSize: 32, color: 'var(--gold-primary)', marginBottom: 12, lineHeight: 1, fontFamily: 'Georgia, serif' }}>"</div>
                                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 20 }}>{t.quote}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>{t.letter}</div>
                                    <div>
                                        <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>{t.name}</strong>
                                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.meta}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ textAlign: 'center', marginTop: 40 }}>
                        <Link to="/reviews" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', color: 'var(--gold-primary)', fontSize: 14, fontWeight: 600, transition: 'all 0.3s' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-gold)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-glass)'}
                        >
                            더 많은 후기 보기 →
                        </Link>
                    </div>
                </div>
            </section>

            <style>{`
                .hero-robot-stage {
                    position: relative;
                    min-height: 560px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    isolation: isolate;
                    overflow: hidden;
                    border-radius: 8px;
                }

                .hero-robot-stage::before {
                    content: '';
                    position: absolute;
                    inset: 24px 10px 42px;
                    border-radius: 8px;
                    border: 1px solid rgba(201,168,76,0.22);
                    background:
                        linear-gradient(180deg, rgba(12,18,28,0.38), rgba(5,8,12,0.16)),
                        radial-gradient(circle at 50% 28%, rgba(244,201,93,0.12), transparent 48%);
                    box-shadow: 0 26px 90px rgba(0,0,0,0.30);
                    pointer-events: none;
                    z-index: -2;
                }

                .robot-ambient,
                .robot-orbit,
                .robot-gridline,
                .robot-chip,
                .robot-console,
                .robot-scanline {
                    pointer-events: none;
                }

                .robot-ambient {
                    position: absolute;
                    border-radius: 999px;
                    filter: blur(4px);
                    z-index: -3;
                }

                .robot-ambient-main {
                    width: 460px;
                    height: 460px;
                    background: radial-gradient(circle, rgba(244,201,93,0.22), transparent 62%);
                    animation: robotPulse 6s ease-in-out infinite;
                }

                .robot-ambient-blue {
                    width: 320px;
                    height: 320px;
                    right: 22px;
                    top: 92px;
                    background: radial-gradient(circle, rgba(68,215,182,0.16), transparent 64%);
                    animation: robotFloat 8s ease-in-out infinite;
                }

                .robot-orbit {
                    position: absolute;
                    border: 1px solid rgba(244,201,93,0.28);
                    border-radius: 50%;
                    transform: rotate(-10deg);
                    z-index: -1;
                }

                .robot-orbit-one {
                    width: 480px;
                    height: 210px;
                    top: 146px;
                }

                .robot-orbit-two {
                    width: 390px;
                    height: 170px;
                    top: 190px;
                    border-color: rgba(68,215,182,0.24);
                    transform: rotate(18deg);
                }

                .robot-gridline {
                    position: absolute;
                    width: min(520px, 88%);
                    height: 290px;
                    top: 122px;
                    border-radius: 8px;
                    background:
                        linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
                    background-size: 36px 36px;
                    mask-image: radial-gradient(circle at center, #000 0%, transparent 72%);
                    opacity: 0.55;
                    z-index: -1;
                }

                .hero-robot-frame {
                    width: min(100%, 560px);
                    height: 520px;
                    border: 1px solid rgba(255,255,255,0.16);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.06);
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 26px 90px rgba(0,0,0,0.34);
                    position: relative;
                    z-index: 1;
                }

                .robot-frame-placeholder {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    color: #fff;
                    overflow: hidden;
                }

                .robot-frame-placeholder::before {
                    content: "";
                    position: absolute;
                    inset: 10%;
                    border-radius: 999px;
                    background: radial-gradient(circle, rgba(68,215,182,0.20), transparent 58%);
                    filter: blur(18px);
                }

                .robot-frame-placeholder strong,
                .robot-frame-placeholder small,
                .robot-placeholder-core {
                    position: relative;
                    z-index: 1;
                }

                .robot-placeholder-core {
                    width: 104px;
                    height: 104px;
                    display: grid;
                    place-items: center;
                    border-radius: 50%;
                    border: 1px solid rgba(244,201,93,0.45);
                    background: linear-gradient(135deg, rgba(244,201,93,0.18), rgba(68,215,182,0.14));
                    color: #f4c95d;
                    font-size: 36px;
                    font-weight: 900;
                    box-shadow: 0 18px 60px rgba(0,0,0,0.34);
                }

                .robot-frame-placeholder strong {
                    font-size: 18px;
                    font-weight: 900;
                }

                .robot-frame-placeholder small {
                    color: rgba(255,255,255,0.62);
                    font-size: 13px;
                }

                .robot-scanline {
                    position: absolute;
                    left: 7%;
                    right: 7%;
                    top: 28%;
                    height: 2px;
                    border-radius: 999px;
                    background: linear-gradient(90deg, transparent, rgba(68,215,182,0.88), rgba(244,201,93,0.68), transparent);
                    box-shadow: 0 0 18px rgba(68,215,182,0.52);
                    animation: robotScan 4.8s ease-in-out infinite;
                    z-index: 2;
                }

                .robot-chip {
                    position: absolute;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    min-height: 38px;
                    padding: 8px 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.16);
                    background: rgba(8,13,18,0.76);
                    color: #f8fafc;
                    backdrop-filter: blur(12px);
                    box-shadow: 0 14px 36px rgba(0,0,0,0.24);
                    z-index: 3;
                }

                .robot-chip b {
                    font-size: 12px;
                    font-weight: 900;
                    letter-spacing: 0;
                }

                .robot-chip span {
                    color: rgba(255,255,255,0.66);
                    font-size: 12px;
                }

                .robot-chip-top {
                    top: 54px;
                    right: 44px;
                }

                .robot-chip-top span {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #44d7b6;
                    box-shadow: 0 0 12px rgba(68,215,182,0.9);
                }

                .robot-chip-left {
                    left: 0;
                    bottom: 152px;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 2px;
                }

                .robot-chip-left b {
                    color: #f4c95d;
                    font-size: 22px;
                }

                .robot-chip-right {
                    right: 0;
                    bottom: 118px;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 2px;
                }

                .robot-chip-right b {
                    color: #44d7b6;
                    font-size: 15px;
                }

                .robot-console {
                    position: absolute;
                    left: 42px;
                    right: 42px;
                    bottom: 18px;
                    display: grid;
                    gap: 4px;
                    padding: 14px 16px;
                    border-radius: 8px;
                    border: 1px solid rgba(244,201,93,0.22);
                    background: rgba(8,13,18,0.84);
                    backdrop-filter: blur(16px);
                    z-index: 4;
                    box-shadow: 0 18px 50px rgba(0,0,0,0.30);
                }

                .robot-console span {
                    color: #f4c95d;
                    font-size: 11px;
                    font-weight: 900;
                }

                .robot-console strong {
                    color: #ffffff;
                    font-size: 15px;
                }

                .robot-console small {
                    color: rgba(255,255,255,0.54);
                    font-size: 12px;
                }

                @keyframes robotPulse {
                    0%, 100% { transform: scale(0.96); opacity: 0.72; }
                    50% { transform: scale(1.06); opacity: 1; }
                }

                @keyframes robotFloat {
                    0%, 100% { transform: translate3d(0, 0, 0); }
                    50% { transform: translate3d(-18px, 14px, 0); }
                }

                @keyframes robotScan {
                    0%, 100% { transform: translateY(-72px); opacity: 0; }
                    18%, 76% { opacity: 1; }
                    50% { transform: translateY(210px); }
                }

                @media (max-width: 900px) {
                    .home-hero {
                        grid-template-columns: 1fr !important;
                        gap: 28px !important;
                        min-height: auto !important;
                        padding: 100px 20px 56px !important;
                    }

                    .hero-robot-stage {
                        min-height: 520px;
                        margin-top: 22px;
                        width: 100%;
                    }

                    .hero-robot-frame {
                        width: 100%;
                        height: 480px;
                    }
                }

                @media (max-width: 640px) {
                    .home-hero {
                        padding: 92px 14px 48px !important;
                    }

                    .hero-robot-stage {
                        min-height: 455px;
                        margin-top: 4px;
                    }

                    .hero-robot-stage::before {
                        inset: 18px 0 36px;
                    }

                    .hero-robot-frame {
                        height: 410px;
                    }

                    .robot-chip-top {
                        top: 28px;
                        right: 18px;
                    }

                    .robot-chip-left,
                    .robot-chip-right {
                        display: none;
                    }

                    .robot-console {
                        left: 14px;
                        right: 14px;
                        bottom: 12px;
                    }

                    .robot-console strong {
                        font-size: 13px;
                        line-height: 1.35;
                        overflow-wrap: anywhere;
                    }
                }
            `}</style>
        </>
    );
}

export default IndexPage;
