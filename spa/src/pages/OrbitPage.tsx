import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const FEATURES = [
    { icon: '🔗', title: 'WordPress + Blogspot', desc: '두 플랫폼을 한 화면에서 관리하고 발행 흐름을 나눠 운영합니다.' },
    { icon: '🧠', title: '목적별 콘텐츠 모드', desc: 'SEO, 애드센스, 쇼핑, 내부링크, 페러프레이징 목적에 맞춰 글을 생성합니다.' },
    { icon: '🎨', title: '이미지 자동화', desc: '썸네일과 H2 이미지를 자동으로 만들고 글 구조에 맞게 배치합니다.' },
    { icon: '⚙️', title: '초기 세팅 보조', desc: 'Blogspot 스킨, 메타, 웹마스터 등록과 WordPress 발행 결과물을 빠르게 준비합니다.' },
    { icon: '📈', title: '수익형 블로그 운영', desc: '애드센스 승인과 장기 운영을 염두에 둔 콘텐츠 구조를 지원합니다.' },
    { icon: '🛰️', title: '올인원 이용권 포함', desc: 'Leaders Pro 기간권 안에서 네이버 자동화, Leword와 함께 사용할 수 있습니다.' },
];

const STEPS = [
    ['01', '키워드 입력', '주제와 타깃 플랫폼을 정합니다.'],
    ['02', '콘텐츠 생성', '목적별 모드로 본문과 구조를 만듭니다.'],
    ['03', '이미지 구성', '썸네일과 H2 이미지를 생성합니다.'],
    ['04', '검토 및 편집', '출력물을 확인하고 필요한 부분만 손봅니다.'],
    ['05', '발행', 'WordPress 또는 Blogspot으로 이어갑니다.'],
];

const EXAMPLE_LINKS = {
    wordpress: 'https://leadernam.com/%ea%b8%88%ec%9c%b5-%eb%b3%b4%ed%97%98/%ec%83%9d%ed%99%9c%c2%b7%ec%a0%95%ec%b1%85/2026%eb%85%84-%ec%84%b8%ea%b8%88-%ec%b6%94%ec%a7%95%ea%b3%bc-%ed%83%88%ec%84%b8%ec%9d%98-%ec%b0%a8%ec%9d%b4%ec%a0%90-%ed%95%b5%ec%8b%ac-3%ea%b0%80%ec%a7%80/',
    blogspot: 'https://tjdgus24280.blogspot.com/2026/06/2026-5.html',
} as const;

function WindowShot({
    title,
    src,
    alt,
    href,
    ctaLabel,
    tall = false,
}: {
    title: string;
    src: string;
    alt: string;
    href?: string;
    ctaLabel?: string;
    tall?: boolean;
}) {
    const className = tall ? 'orbit-shot orbit-shot-tall' : 'orbit-shot';
    const content = (
        <>
            <div className="orbit-shot-bar">
                <span className="orbit-dot red" />
                <span className="orbit-dot yellow" />
                <span className="orbit-dot green" />
                <span>{title}</span>
            </div>
            <img src={src} alt={alt} loading="lazy" />
            {href ? <span className="orbit-shot-cta">{ctaLabel || '예시글 보기'}</span> : null}
        </>
    );

    if (href) {
        return (
            <a className={`${className} orbit-shot-link`} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${title} 예시글 열기`}>
                {content}
            </a>
        );
    }

    return (
        <div className={className}>
            {content}
        </div>
    );
}

function OrbitPage() {
    useEffect(() => {
        const prev = document.title;
        document.title = 'Leaders Orbit — 블로그스팟·워드프레스 자동화';
        return () => { document.title = prev; };
    }, []);

    return (
        <div className="orbit-page">
            <section className="orbit-hero">
                <div className="orbit-hero-inner">
                    <div className="orbit-kicker"><span /> GLOBAL PUBLISHER</div>
                    <h1>블로그스팟과 워드프레스까지 <strong>한 이용권 안에서</strong></h1>
                    <p>
                        Leaders Orbit은 키워드 입력, AI 콘텐츠 생성, 이미지 구성, 발행 준비를 한 화면에서 이어주는
                        글로벌 블로그 자동화 도구입니다.
                    </p>
                    <div className="orbit-actions">
                        <Link to="/pricing" className="orbit-btn primary">올인원 이용권 보기</Link>
                        <Link to="/products" className="orbit-btn secondary">제품으로 돌아가기</Link>
                    </div>
                    <div className="orbit-metrics">
                        <div><strong>2 platforms</strong><span>Blogspot · WordPress</span></div>
                        <div><strong>5 modes</strong><span>SEO · Adsense · Shopping</span></div>
                        <div><strong>All Access</strong><span>기간권 하나로 함께 사용</span></div>
                    </div>
                </div>
            </section>

            <section className="orbit-band">
                <strong>Leaders Pro 올인원 이용권 포함</strong>
                <div>
                    <span>네이버 자동화</span>
                    <span>Blogspot · WordPress</span>
                    <span>Leword</span>
                </div>
            </section>

            <section className="orbit-section">
                <div className="orbit-container">
                    <div className="orbit-section-head">
                        <span>FEATURES</span>
                        <h2>글로벌 블로그 운영에 필요한 흐름을 한 번에</h2>
                        <p>콘텐츠 제작과 발행 준비에서 반복되는 일을 줄이고, 운영자는 주제와 검수에 집중할 수 있게 설계했습니다.</p>
                    </div>
                    <div className="orbit-feature-grid">
                        {FEATURES.map((feature) => (
                            <div className="orbit-card" key={feature.title}>
                                <div>{feature.icon}</div>
                                <h3>{feature.title}</h3>
                                <p>{feature.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="orbit-section alt">
                <div className="orbit-container orbit-showcase">
                    <WindowShot title="Keyword Builder" src="/images/orbit/orbit-keyword.png" alt="Leaders Orbit 키워드 입력 화면" />
                    <div className="orbit-copy">
                        <span>KEYWORD TO DRAFT</span>
                        <h2>키워드에서 발행 준비까지 이어집니다</h2>
                        <p>주제와 방향을 입력하면 플랫폼 목적에 맞는 초안과 이미지 구성이 함께 만들어집니다.</p>
                        <ul>
                            <li>SEO 중심 글 구조 생성</li>
                            <li>애드센스 승인용 콘텐츠 흐름</li>
                            <li>쇼핑·내부링크 목적별 변형</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="orbit-section">
                <div className="orbit-container orbit-showcase flip">
                    <div className="orbit-copy">
                        <span>OUTPUT</span>
                        <h2>WordPress와 Blogspot 결과물을 함께 확인</h2>
                        <p>생성 결과를 플랫폼별로 확인하고, 필요한 부분만 손본 뒤 발행 흐름으로 이어갈 수 있습니다.</p>
                        <ul>
                            <li>WordPress 포스트 구조 확인</li>
                            <li>Blogspot 발행 준비 화면</li>
                            <li>이미지와 본문 흐름 동시 검토</li>
                        </ul>
                        <div className="orbit-example-links">
                            <a href={EXAMPLE_LINKS.wordpress} target="_blank" rel="noopener noreferrer">WordPress 예시글 보기</a>
                            <a href={EXAMPLE_LINKS.blogspot} target="_blank" rel="noopener noreferrer">Blogspot 예시글 보기</a>
                        </div>
                    </div>
                    <div className="orbit-output-pair">
                        <WindowShot title="WordPress Post" src="/images/orbit/orbit-wordpress-post.png" alt="Leaders Orbit 워드프레스 포스트 결과" href={EXAMPLE_LINKS.wordpress} ctaLabel="WordPress 예시글 열기" tall />
                        <WindowShot title="Blogspot Ready" src="/images/orbit/orbit-blogspot.png" alt="Leaders Orbit 블로그스팟 발행 준비 화면" href={EXAMPLE_LINKS.blogspot} ctaLabel="Blogspot 예시글 열기" tall />
                    </div>
                </div>
            </section>

            <section className="orbit-section alt">
                <div className="orbit-container">
                    <div className="orbit-section-head">
                        <span>WORKFLOW</span>
                        <h2>반복 작업은 줄이고 검수 지점은 남깁니다</h2>
                        <p>완전 자동보다 중요한 건 운영자가 판단해야 하는 순간을 놓치지 않는 것입니다.</p>
                    </div>
                    <div className="orbit-pipeline">
                        {STEPS.map(([n, title, desc]) => (
                            <div className="orbit-step" key={n}>
                                <strong>{n}</strong>
                                <h3>{title}</h3>
                                <p>{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="orbit-cta">
                <h2>네이버, 글로벌 블로그, 키워드 분석을 따로 사지 않아도 됩니다</h2>
                <p>기간제 올인원 이용권 하나로 필요한 도구를 함께 열어두세요.</p>
                <Link to="/pricing" className="orbit-btn primary">올인원 가격표 보기</Link>
            </section>

            <style>{`
                .orbit-page {
                    --orbit-bg: #05070d;
                    --orbit-panel: #0d1220;
                    --orbit-line: rgba(226,232,240,.12);
                    --orbit-muted: #94a3b8;
                    --orbit-sky: #38bdf8;
                    --orbit-green: #34d399;
                    --orbit-gradient: linear-gradient(135deg, #facc15 0%, #38bdf8 52%, #34d399 100%);
                    background: var(--orbit-bg);
                    color: #f8fafc;
                }
                .orbit-hero {
                    min-height: 84vh;
                    display: flex;
                    align-items: flex-end;
                    padding: 128px 24px 74px;
                    background-image: linear-gradient(90deg, rgba(5,7,13,.94) 0%, rgba(5,7,13,.78) 45%, rgba(5,7,13,.38) 100%), linear-gradient(180deg, rgba(5,7,13,.18) 0%, rgba(5,7,13,.94) 100%), url('/images/orbit/orbit-hero.png');
                    background-size: cover;
                    background-position: center top;
                }
                .orbit-hero-inner, .orbit-container {
                    width: min(1180px, 100%);
                    margin: 0 auto;
                }
                .orbit-kicker {
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 16px;
                    border: 1px solid rgba(56,189,248,.34);
                    border-radius: 999px;
                    background: rgba(8,47,73,.42);
                    color: #bae6fd;
                    font-size: 12px;
                    font-weight: 900;
                    letter-spacing: .14em;
                    margin-bottom: 20px;
                }
                .orbit-kicker span {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--orbit-green);
                    box-shadow: 0 0 18px rgba(52,211,153,.8);
                }
                .orbit-hero h1 {
                    max-width: 840px;
                    font-size: clamp(38px, 7vw, 78px);
                    line-height: 1.05;
                    font-weight: 900;
                    margin: 0 0 22px;
                }
                .orbit-hero h1 strong {
                    background: var(--orbit-gradient);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .orbit-hero p {
                    max-width: 720px;
                    color: #cbd5e1;
                    font-size: clamp(16px, 2vw, 20px);
                    line-height: 1.8;
                    margin: 0 0 32px;
                }
                .orbit-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-bottom: 32px;
                }
                .orbit-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 52px;
                    padding: 0 24px;
                    border-radius: 12px;
                    font-weight: 900;
                    text-decoration: none;
                    border: 1px solid transparent;
                }
                .orbit-btn.primary {
                    color: #07111f;
                    background: var(--orbit-gradient);
                    box-shadow: 0 18px 44px rgba(56,189,248,.2);
                }
                .orbit-btn.secondary {
                    color: #f8fafc;
                    background: rgba(255,255,255,.07);
                    border-color: rgba(255,255,255,.16);
                }
                .orbit-metrics {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 12px;
                    max-width: 720px;
                }
                .orbit-metrics div, .orbit-card, .orbit-step {
                    border: 1px solid var(--orbit-line);
                    border-radius: 14px;
                    background: rgba(15,23,42,.68);
                    padding: 18px;
                }
                .orbit-metrics strong {
                    display: block;
                    margin-bottom: 4px;
                }
                .orbit-metrics span, .orbit-card p, .orbit-section-head p, .orbit-copy p, .orbit-copy li, .orbit-step p {
                    color: var(--orbit-muted);
                }
                .orbit-band {
                    display: flex;
                    justify-content: center;
                    gap: 24px;
                    flex-wrap: wrap;
                    padding: 18px 24px;
                    background: #090d16;
                    border-top: 1px solid var(--orbit-line);
                    border-bottom: 1px solid var(--orbit-line);
                }
                .orbit-band div {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }
                .orbit-band span {
                    padding: 6px 12px;
                    border: 1px solid var(--orbit-line);
                    border-radius: 999px;
                    color: #dbeafe;
                    font-size: 13px;
                    font-weight: 800;
                }
                .orbit-section {
                    padding: 92px 24px;
                    background: var(--orbit-bg);
                }
                .orbit-section.alt {
                    background: #080b12;
                }
                .orbit-section-head {
                    max-width: 760px;
                    margin-bottom: 40px;
                }
                .orbit-section-head span, .orbit-copy span {
                    color: var(--orbit-sky);
                    font-size: 12px;
                    font-weight: 900;
                    letter-spacing: .14em;
                }
                .orbit-section h2, .orbit-cta h2 {
                    font-size: clamp(28px, 4vw, 48px);
                    line-height: 1.18;
                    margin: 12px 0 14px;
                }
                .orbit-feature-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 16px;
                }
                .orbit-card div {
                    font-size: 28px;
                    margin-bottom: 16px;
                }
                .orbit-card h3, .orbit-step h3 {
                    margin: 0 0 10px;
                }
                .orbit-showcase {
                    display: grid;
                    grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr);
                    gap: 44px;
                    align-items: center;
                }
                .orbit-showcase.flip {
                    grid-template-columns: minmax(320px, .95fr) minmax(0, 1.05fr);
                }
                .orbit-shot {
                    border: 1px solid var(--orbit-line);
                    border-radius: 16px;
                    overflow: hidden;
                    background: #111827;
                    box-shadow: 0 24px 70px rgba(0,0,0,.34);
                }
                .orbit-shot-link {
                    display: block;
                    color: inherit;
                    text-decoration: none;
                    transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
                }
                .orbit-shot-link:hover {
                    transform: translateY(-4px);
                    border-color: rgba(56,189,248,.48);
                    box-shadow: 0 28px 78px rgba(56,189,248,.16);
                }
                .orbit-shot-link:focus-visible {
                    outline: 3px solid rgba(56,189,248,.75);
                    outline-offset: 4px;
                }
                .orbit-shot-bar {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    padding: 12px 14px;
                    background: rgba(255,255,255,.04);
                    border-bottom: 1px solid var(--orbit-line);
                    color: var(--orbit-muted);
                    font-size: 12px;
                    font-weight: 800;
                }
                .orbit-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                }
                .orbit-dot.red { background: #fb7185; }
                .orbit-dot.yellow { background: #facc15; }
                .orbit-dot.green { background: #34d399; }
                .orbit-shot img {
                    width: 100%;
                    display: block;
                }
                .orbit-shot-tall img {
                    height: 520px;
                    object-fit: cover;
                    object-position: top;
                }
                .orbit-shot-cta {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 44px;
                    padding: 0 14px;
                    color: #06111d;
                    background: var(--orbit-gradient);
                    font-size: 13px;
                    font-weight: 900;
                }
                .orbit-output-pair {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 14px;
                }
                .orbit-example-links {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-top: 22px;
                }
                .orbit-example-links a {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 44px;
                    padding: 0 16px;
                    border-radius: 10px;
                    background: rgba(255,255,255,.08);
                    border: 1px solid rgba(255,255,255,.16);
                    color: #e0f2fe;
                    font-size: 13px;
                    font-weight: 900;
                    text-decoration: none;
                }
                .orbit-example-links a:hover {
                    background: rgba(56,189,248,.16);
                    border-color: rgba(56,189,248,.42);
                }
                .orbit-copy ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    display: grid;
                    gap: 10px;
                }
                .orbit-copy li::before {
                    content: '•';
                    color: var(--orbit-green);
                    font-weight: 900;
                    margin-right: 8px;
                }
                .orbit-pipeline {
                    display: grid;
                    grid-template-columns: repeat(5, minmax(0, 1fr));
                    gap: 12px;
                }
                .orbit-step strong {
                    color: #facc15;
                    display: block;
                    margin-bottom: 18px;
                }
                .orbit-cta {
                    text-align: center;
                    padding: 110px 24px 126px;
                    background: linear-gradient(180deg, #080b12, #05070d);
                }
                .orbit-cta p {
                    color: var(--orbit-muted);
                    margin: 0 auto 28px;
                    max-width: 620px;
                    font-size: 17px;
                }
                @media (max-width: 900px) {
                    .orbit-feature-grid, .orbit-pipeline, .orbit-showcase, .orbit-showcase.flip {
                        grid-template-columns: minmax(0, 1fr);
                    }
                    .orbit-output-pair {
                        grid-template-columns: minmax(0, 1fr);
                    }
                    .orbit-metrics {
                        grid-template-columns: minmax(0, 1fr);
                    }
                    .orbit-hero {
                        min-height: 78vh;
                        padding-top: 112px;
                    }
                }
            `}</style>
        </div>
    );
}

export default OrbitPage;
