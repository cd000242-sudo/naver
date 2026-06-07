import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ParticlesCanvas from '../components/ParticlesCanvas';

type ProductId = 'naver' | 'leword' | 'orbit';
type Product = {
    id: ProductId;
    eyebrow: string;
    name: string;
    subtitle: string;
    headline: string;
    desc: ReactNode;
    href: string;
    cta: string;
    media: { type: 'video' | 'image'; src: string; alt: string };
    metrics: Array<[string, string]>;
    bullets: string[];
    fit: string[];
};

const PRODUCTS: Product[] = [
    {
        id: 'naver',
        eyebrow: 'FLAGSHIP',
        name: 'Better Life Naver',
        subtitle: '네이버 블로그 자동화',
        headline: '키워드 하나로 글, 이미지, 발행까지 끝내는 메인 엔진',
        desc: <>계정별 대기열, 글 생성, 이미지 생성, 자동 발행, 제휴 링크까지 한 화면에서 운영합니다. 네이버 블로그를 꾸준히 쌓아야 하는 사용자에게 가장 먼저 필요한 제품입니다.</>,
        href: '/detail',
        cta: '네이버 자동화 자세히 보기',
        media: { type: 'video', src: '/images/hero-demo.mp4', alt: 'Better Life Naver 자동 발행 데모' },
        metrics: [['100건', '일 최대 자동 발행'], ['7 AI', '본문·이미지 엔진'], ['다계정', '계정별 간격 관리']],
        bullets: [
            '키워드 입력 후 제목, 본문, 이미지, CTA까지 자동 구성',
            '쿠팡·스마트스토어 상품 기반 리뷰형 포스팅 지원',
            '사람형 타이핑, 랜덤 딜레이, 계정별 스케줄링으로 운영 부담 감소',
        ],
        fit: ['네이버 블로그를 본진으로 키우는 경우', '다계정 운영과 반복 발행이 필요한 경우', '제휴/리뷰형 콘텐츠까지 함께 돌리는 경우'],
    },
    {
        id: 'leword',
        eyebrow: 'INTELLIGENCE',
        name: 'LEWORD',
        subtitle: 'AI 키워드 인텔리전스',
        headline: '검색량, 문서수, 경쟁도를 보고 쓸 키워드만 남깁니다',
        desc: <>네이버·ZUM·네이트·다음 실시간 검색어와 17개 데이터 소스를 교차검증해 운영자가 바로 판단할 수 있는 키워드 후보를 보여줍니다.</>,
        href: '/leword',
        cta: 'LEWORD 자세히 보기',
        media: { type: 'image', src: '/images/leword/realtime-monitor-hero.png', alt: 'LEWORD 실시간 검색어 모니터링 화면' },
        metrics: [['4매체', '실시간 검색어'], ['17소스', '교차검증'], ['SSS', '황금키워드 등급']],
        bullets: [
            '실시간 이슈와 롱테일 후보를 한 화면에서 확인',
            '검색량, 문서수, CPC, SERP 지표를 조합해 우선순위 계산',
            'Naver와 Orbit 발행 전에 키워드 선별 단계로 사용',
        ],
        fit: ['무엇을 써야 할지 먼저 정해야 하는 경우', '키워드 경쟁도를 숫자로 보고 싶은 경우', '트렌드형/정보형 콘텐츠를 섞어 운영하는 경우'],
    },
    {
        id: 'orbit',
        eyebrow: 'GLOBAL',
        name: 'Leaders Orbit',
        subtitle: '블로그스팟 · 워드프레스 자동화',
        headline: '외부유입용 글과 링크 구조를 한 번에 만드는 글로벌 발행 엔진',
        desc: <>블로그스팟과 워드프레스 발행, 내부링크, 외부유입 문안, 공개 글 확인까지 이어지는 보조 채널 자동화입니다. 올인원 이용권 안에서 함께 씁니다.</>,
        href: '/orbit',
        cta: 'Orbit 자세히 보기',
        media: { type: 'image', src: '/images/orbit/orbit-smart-keyword.png', alt: 'Leaders Orbit 키워드 입력과 발행 설정 화면' },
        metrics: [['2플랫폼', 'Blogger·WordPress'], ['5모드', '목적별 콘텐츠'], ['유입글', '채널별 문안 생성']],
        bullets: [
            'WordPress REST API와 Blogger API 기반 발행 흐름',
            '종합글, 하위글, FAQ, CTA가 이어지는 공개 글 구조',
            '네이버 자동화와 함께 외부유입 보조 채널을 구축',
        ],
        fit: ['네이버 외 보조 채널을 만들고 싶은 경우', '외부유입 글과 내부링크 구조가 필요한 경우', '워드프레스/블로그스팟을 함께 쓰는 경우'],
    },
];

const GUIDE_CARDS = [
    ['블로그 운영 자동화가 먼저라면', 'Better Life Naver', '본문·이미지·발행까지 반복 업무를 줄이는 메인 제품입니다.', '/detail'],
    ['키워드 판단이 막힌다면', 'LEWORD', '검색량과 경쟁도를 보고 발행할 주제를 먼저 골라냅니다.', '/leword'],
    ['외부유입 채널이 필요하다면', 'Leaders Orbit', '블로그스팟·워드프레스 글과 링크 구조를 보조 채널로 만듭니다.', '/orbit'],
];

const SUITE_FLOW = [
    ['01', 'LEWORD', '쓸 만한 키워드 후보를 찾고 경쟁도를 확인'],
    ['02', 'Naver', '네이버 블로그에 본문·이미지·CTA 자동 발행'],
    ['03', 'Orbit', '블로그스팟·워드프레스로 외부유입 글 확장'],
    ['04', '운영', '주문·결제·지원까지 Leaders Pro에서 관리'],
];

const COMPARISON = [
    ['주요 목적', '네이버 블로그 성장', '키워드 발굴', '외부유입 채널 확장'],
    ['입력값', '키워드, 계정, 발행 옵션', '주제, 카테고리, 지표 조건', '키워드, 플랫폼 연결, 글 모드'],
    ['결과물', '네이버 블로그 공개 글', '우선순위가 매겨진 키워드 후보', 'Blogger·WordPress 공개 글'],
    ['잘 맞는 사용자', '꾸준한 발행량이 필요한 운영자', '쓰기 전 판단을 정확히 하고 싶은 운영자', '보조 채널과 링크 구조가 필요한 운영자'],
    ['추천 조합', 'LEWORD와 함께 쓰면 주제 선정이 쉬움', 'Naver·Orbit의 출발점으로 사용', 'Naver 글의 외부유입 보조 채널로 사용'],
];

const stackStyle: Record<ProductId, string> = {
    naver: 'linear-gradient(135deg, #f4c95d 0%, #44d7b6 100%)',
    leword: 'linear-gradient(135deg, #7c3aed 0%, #38bdf8 100%)',
    orbit: 'linear-gradient(135deg, #1fb6ff 0%, #34d399 100%)',
};

function ProductMedia({ product }: { product: Product }) {
    if (product.media.type === 'video') {
        return (
            <video className="products-media" autoPlay muted loop playsInline aria-label={product.media.alt}>
                <source src={product.media.src} type="video/mp4" />
            </video>
        );
    }

    return <img className="products-media" src={product.media.src} alt={product.media.alt} loading="lazy" />;
}

function MetricList({ items }: { items: Array<[string, string]> }) {
    return (
        <div className="products-metrics">
            {items.map(([value, label]) => (
                <div key={`${value}-${label}`}>
                    <b>{value}</b>
                    <span>{label}</span>
                </div>
            ))}
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
        }, { threshold: 0.12 });
        document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    return (
        <>
            <ParticlesCanvas />
            <main className="products-page">
                <section className="products-hero">
                    <div className="products-wrap products-hero-grid">
                        <div className="products-hero-copy">
                            <span className="products-kicker">PRODUCTS</span>
                            <h1>운영 목적에 맞는 자동화를 바로 고르세요</h1>
                            <p>
                                Leaders Pro는 키워드 발굴, 네이버 블로그 발행, 블로그스팟·워드프레스 외부유입까지
                                하나의 운영 흐름으로 이어지도록 만든 제품군입니다.
                            </p>
                            <div className="products-actions">
                                <a className="products-btn primary" href="#products-guide">제품 선택 가이드</a>
                                <Link className="products-btn secondary" to="/pricing">요금제 보기</Link>
                            </div>
                        </div>
                        <div className="products-suite-panel" aria-label="Leaders Pro 제품 흐름">
                            <div className="suite-panel-head">
                                <span />
                                <span />
                                <span />
                                <b>Leaders Pro Suite</b>
                            </div>
                            <div className="suite-steps">
                                {SUITE_FLOW.map(([step, name, desc]) => (
                                    <article key={step}>
                                        <small>{step}</small>
                                        <strong>{name}</strong>
                                        <p>{desc}</p>
                                    </article>
                                ))}
                            </div>
                            <div className="suite-preview">
                                <img src="/images/leword/screen-golden-keywords.png" alt="LEWORD 황금키워드 화면" />
                                <img src="/images/orbit/orbit-sequential-queue.png" alt="Orbit 연속 발행 대기열 화면" />
                            </div>
                        </div>
                    </div>
                </section>

                <section id="products-guide" className="products-section light">
                    <div className="products-wrap">
                        <div className="products-section-head fade-in">
                            <span className="products-kicker">CHOICE MAP</span>
                            <h2>지금 필요한 제품부터 고르면 됩니다</h2>
                            <p>처음에는 하나로 시작하고, 운영이 커지면 LEWORD → Naver → Orbit 흐름으로 확장하면 됩니다.</p>
                        </div>
                        <div className="guide-grid">
                            {GUIDE_CARDS.map(([title, product, desc, href]) => (
                                <Link className="guide-card fade-in" to={href} key={product}>
                                    <span>{title}</span>
                                    <strong>{product}</strong>
                                    <p>{desc}</p>
                                    <b>자세히 보기</b>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="products-section dark">
                    <div className="products-wrap">
                        <div className="products-section-head fade-in">
                            <span className="products-kicker">PRODUCT LINEUP</span>
                            <h2>각 제품의 역할이 겹치지 않게 나뉩니다</h2>
                            <p>키워드 판단, 네이버 발행, 외부유입 발행을 서로 다른 단계로 분리해 운영 흐름을 단순하게 만듭니다.</p>
                        </div>

                        <div className="product-panels">
                            {PRODUCTS.map((product) => (
                                <article className={`product-panel fade-in ${product.id}`} key={product.id}>
                                    <div className="product-panel-copy">
                                        <span className="product-badge" style={{ background: stackStyle[product.id] }}>{product.eyebrow}</span>
                                        <h3>{product.name}</h3>
                                        <strong>{product.subtitle}</strong>
                                        <h4>{product.headline}</h4>
                                        <p>{product.desc}</p>
                                        <MetricList items={product.metrics} />
                                        <ul>
                                            {product.bullets.map((item) => <li key={item}>{item}</li>)}
                                        </ul>
                                        <Link className="products-btn panel-btn" to={product.href}>{product.cta}</Link>
                                    </div>
                                    <div className="product-panel-media">
                                        <ProductMedia product={product} />
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="products-section light">
                    <div className="products-wrap">
                        <div className="products-section-head fade-in">
                            <span className="products-kicker">BEST FIT</span>
                            <h2>이럴 때 이 제품을 쓰면 됩니다</h2>
                            <p>구매 전 가장 많이 헷갈리는 기준만 따로 정리했습니다.</p>
                        </div>
                        <div className="fit-grid">
                            {PRODUCTS.map((product) => (
                                <article className={`fit-card fade-in ${product.id}`} key={product.id}>
                                    <div className="fit-title">
                                        <span style={{ background: stackStyle[product.id] }}>{product.name.slice(0, 1)}</span>
                                        <div>
                                            <b>{product.name}</b>
                                            <small>{product.subtitle}</small>
                                        </div>
                                    </div>
                                    <ul>
                                        {product.fit.map((item) => <li key={item}>{item}</li>)}
                                    </ul>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="products-section dark compact">
                    <div className="products-wrap">
                        <div className="products-section-head fade-in">
                            <span className="products-kicker">ONE SUITE</span>
                            <h2>올인원 코드로 운영 흐름이 더 깔끔해집니다</h2>
                            <p>LEWORD에서 키워드를 고르고, Naver와 Orbit으로 발행 채널을 나눠도 기간제 구매자는 올인원 라이선스 코드 하나로 함께 이용합니다.</p>
                        </div>
                        <div className="flow-line fade-in">
                            {SUITE_FLOW.map(([step, name, desc]) => (
                                <article key={step}>
                                    <small>{step}</small>
                                    <b>{name}</b>
                                    <p>{desc}</p>
                                </article>
                            ))}
                        </div>
                        <div className="workflow-shots fade-in">
                            <img src="/images/leword/17-sources-orbit.png" alt="LEWORD 17개 데이터 소스 화면" loading="lazy" />
                            <img src="/images/orbit/orbit-external-traffic.png" alt="Orbit 외부유입 글 생성 화면" loading="lazy" />
                        </div>
                    </div>
                </section>

                <section className="products-section light">
                    <div className="products-wrap">
                        <div className="products-section-head fade-in">
                            <span className="products-kicker">COMPARE</span>
                            <h2>한눈에 보는 제품 비교</h2>
                            <p>세 제품은 경쟁 제품이 아니라, 운영 단계별로 이어지는 역할을 맡습니다.</p>
                        </div>
                        <div className="compare-table-wrap fade-in">
                            <table className="compare-table">
                                <thead>
                                    <tr>
                                        <th>구분</th>
                                        <th>Better Life Naver</th>
                                        <th>LEWORD</th>
                                        <th>Leaders Orbit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {COMPARISON.map(([label, naver, leword, orbit]) => (
                                        <tr key={label}>
                                            <th>{label}</th>
                                            <td>{naver}</td>
                                            <td>{leword}</td>
                                            <td>{orbit}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <section className="products-final">
                    <div className="products-wrap">
                        <span className="products-kicker">START</span>
                        <h2>고민되면 올인원으로 시작하면 됩니다</h2>
                        <p>네이버 자동화, LEWORD, Orbit은 함께 쓸 때 키워드 발굴부터 발행, 외부유입까지 흐름이 가장 좋아집니다.</p>
                        <p className="products-note">무료 체험은 Better Life Naver 기준입니다. LEWORD와 Orbit은 올인원 라이선스에서 함께 이용합니다. 개별 구매는 영구제만 별도 문의로 가능하며 각 100만원입니다.</p>
                        <div className="products-actions center">
                            <Link className="products-btn primary" to="/pricing">요금제 확인하기</Link>
                            <Link className="products-btn secondary" to="/download">네이버 무료 체험 다운로드</Link>
                        </div>
                    </div>
                </section>
            </main>

            <style>{`
                .products-page {
                    position: relative;
                    z-index: 1;
                    color: #f8fafc;
                    background: rgba(5, 8, 12, 0.54);
                }

                .products-wrap {
                    width: min(1180px, calc(100% - 48px));
                    margin: 0 auto;
                }

                .products-hero {
                    min-height: 720px;
                    display: flex;
                    align-items: center;
                    padding: 118px 0 64px;
                    background:
                        linear-gradient(135deg, rgba(8, 13, 18, 0.88), rgba(7, 35, 31, 0.76) 52%, rgba(48, 39, 17, 0.70));
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }

                .products-hero-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 0.92fr) minmax(420px, 1.08fr);
                    gap: 48px;
                    align-items: center;
                }

                .products-kicker {
                    display: inline-flex;
                    align-items: center;
                    min-height: 28px;
                    padding: 5px 12px;
                    border: 1px solid rgba(244, 201, 93, 0.45);
                    border-radius: 8px;
                    background: rgba(244, 201, 93, 0.10);
                    color: #f4c95d;
                    font-size: 12px;
                    font-weight: 900;
                    letter-spacing: 0;
                }

                .products-hero h1 {
                    margin: 18px 0 18px;
                    font-size: 48px;
                    line-height: 1.13;
                    letter-spacing: 0;
                }

                .products-hero p,
                .products-section-head p,
                .products-final p {
                    color: rgba(255,255,255,0.76);
                    font-size: 17px;
                    line-height: 1.75;
                }

                .products-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-top: 30px;
                }

                .products-actions.center {
                    justify-content: center;
                }

                .products-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 46px;
                    padding: 12px 20px;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 900;
                    text-decoration: none;
                    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
                }

                .products-btn:hover {
                    transform: translateY(-2px);
                }

                .products-btn.primary {
                    border: 1px solid rgba(244, 201, 93, 0.7);
                    background: #f4c95d;
                    color: #071018;
                }

                .products-btn.secondary {
                    border: 1px solid rgba(255,255,255,0.20);
                    background: rgba(255,255,255,0.08);
                    color: #ffffff;
                }

                .products-suite-panel {
                    border: 1px solid rgba(255,255,255,0.16);
                    border-radius: 8px;
                    overflow: hidden;
                    background: rgba(8, 13, 18, 0.72);
                    box-shadow: 0 28px 90px rgba(0,0,0,0.34);
                    backdrop-filter: blur(12px);
                }

                .suite-panel-head {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 14px 16px;
                    background: rgba(255,255,255,0.06);
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }

                .suite-panel-head span {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: #ef4444;
                }

                .suite-panel-head span:nth-child(2) { background: #f59e0b; }
                .suite-panel-head span:nth-child(3) { background: #22c55e; }
                .suite-panel-head b {
                    margin-left: 8px;
                    color: rgba(255,255,255,0.70);
                    font-size: 13px;
                }

                .suite-steps {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1px;
                    background: rgba(255,255,255,0.08);
                }

                .suite-steps article {
                    min-height: 142px;
                    padding: 18px;
                    background: rgba(8, 13, 18, 0.94);
                }

                .suite-steps small,
                .flow-line small {
                    display: inline-flex;
                    margin-bottom: 12px;
                    color: #44d7b6;
                    font-size: 12px;
                    font-weight: 900;
                }

                .suite-steps strong,
                .flow-line b {
                    display: block;
                    color: #ffffff;
                    font-size: 18px;
                    margin-bottom: 8px;
                }

                .suite-steps p,
                .flow-line p {
                    color: rgba(255,255,255,0.62);
                    font-size: 13px;
                    line-height: 1.6;
                }

                .suite-preview {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    padding: 16px;
                    background: rgba(255,255,255,0.04);
                    align-items: stretch;
                }

                .suite-preview img,
                .workflow-shots img {
                    width: 100%;
                    display: block;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: #071018;
                }

                .suite-preview img {
                    height: 312px;
                    object-fit: cover;
                    object-position: left top;
                }

                .suite-preview img:nth-child(2) {
                    object-position: center top;
                }

                .products-section {
                    padding: 88px 0;
                }

                .products-section.light {
                    background: rgba(248, 250, 252, 0.96);
                    color: #0f172a;
                }

                .products-section.dark {
                    background: rgba(7, 16, 24, 0.94);
                    color: #f8fafc;
                }

                .products-section.compact {
                    padding-bottom: 76px;
                }

                .products-section-head {
                    text-align: center;
                    max-width: 760px;
                    margin: 0 auto 42px;
                }

                .products-section-head h2,
                .products-final h2 {
                    margin: 14px 0 12px;
                    font-size: 38px;
                    line-height: 1.2;
                    letter-spacing: 0;
                }

                .products-section.light .products-section-head p,
                .products-section.light .product-panel-copy p,
                .products-section.light .fit-card li,
                .products-section.light .guide-card p {
                    color: #526173;
                }

                .guide-grid,
                .fit-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 18px;
                }

                .guide-card,
                .fit-card {
                    display: block;
                    min-height: 220px;
                    padding: 24px;
                    border-radius: 8px;
                    border: 1px solid rgba(15, 23, 42, 0.10);
                    background: #ffffff;
                    color: #0f172a;
                    box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
                    text-decoration: none;
                }

                .guide-card span {
                    display: block;
                    color: #0f766e;
                    font-size: 13px;
                    font-weight: 900;
                    margin-bottom: 12px;
                }

                .guide-card strong {
                    display: block;
                    font-size: 24px;
                    margin-bottom: 10px;
                }

                .guide-card p {
                    min-height: 72px;
                    font-size: 14px;
                    line-height: 1.65;
                }

                .guide-card b {
                    display: inline-flex;
                    margin-top: 18px;
                    color: #b8860b;
                    font-size: 14px;
                }

                .product-panels {
                    display: flex;
                    flex-direction: column;
                    gap: 34px;
                }

                .product-panel {
                    display: grid;
                    grid-template-columns: minmax(0, 0.9fr) minmax(420px, 1.1fr);
                    gap: 34px;
                    align-items: center;
                    padding: 28px;
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.06);
                }

                .product-panel:nth-child(even) .product-panel-copy {
                    order: 2;
                }

                .product-panel:nth-child(even) .product-panel-media {
                    order: 1;
                }

                .product-badge {
                    display: inline-flex;
                    min-height: 26px;
                    align-items: center;
                    padding: 5px 10px;
                    border-radius: 8px;
                    color: #071018;
                    font-size: 11px;
                    font-weight: 900;
                    letter-spacing: 0;
                    margin-bottom: 14px;
                }

                .product-panel h3 {
                    font-size: 34px;
                    line-height: 1.2;
                    margin-bottom: 6px;
                    letter-spacing: 0;
                }

                .product-panel-copy > strong {
                    display: block;
                    color: #f4c95d;
                    font-size: 16px;
                    margin-bottom: 18px;
                }

                .product-panel h4 {
                    font-size: 22px;
                    line-height: 1.45;
                    margin-bottom: 12px;
                }

                .product-panel-copy p {
                    color: rgba(255,255,255,0.70);
                    font-size: 15px;
                    line-height: 1.75;
                }

                .products-metrics {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 10px;
                    margin: 22px 0;
                }

                .products-metrics div {
                    padding: 14px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(255,255,255,0.06);
                }

                .products-metrics b {
                    display: block;
                    font-size: 21px;
                    color: #ffffff;
                    line-height: 1.1;
                    margin-bottom: 6px;
                }

                .products-metrics span {
                    color: rgba(255,255,255,0.60);
                    font-size: 12px;
                }

                .product-panel ul,
                .fit-card ul {
                    list-style: none;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    padding: 0;
                    margin: 0;
                }

                .product-panel li,
                .fit-card li {
                    position: relative;
                    padding-left: 18px;
                    color: rgba(255,255,255,0.72);
                    font-size: 14px;
                    line-height: 1.6;
                }

                .product-panel li::before,
                .fit-card li::before {
                    content: "";
                    position: absolute;
                    left: 0;
                    top: 10px;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #44d7b6;
                }

                .panel-btn {
                    margin-top: 24px;
                    border: 1px solid rgba(244, 201, 93, 0.55);
                    background: rgba(244, 201, 93, 0.12);
                    color: #f4c95d;
                }

                .product-panel-media {
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.14);
                    background: #071018;
                    box-shadow: 0 22px 70px rgba(0,0,0,0.36);
                }

                .products-media {
                    display: block;
                    width: 100%;
                    min-height: 300px;
                    object-fit: cover;
                    background: #071018;
                }

                .fit-card {
                    min-height: 250px;
                }

                .fit-title {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 18px;
                }

                .fit-title span {
                    width: 42px;
                    height: 42px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    color: #071018;
                    font-weight: 900;
                }

                .fit-title b,
                .fit-title small {
                    display: block;
                }

                .fit-title b {
                    font-size: 18px;
                    color: #0f172a;
                }

                .fit-title small {
                    color: #64748b;
                    font-size: 13px;
                }

                .flow-line {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 14px;
                }

                .flow-line article {
                    min-height: 180px;
                    padding: 22px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(255,255,255,0.06);
                }

                .workflow-shots {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 18px;
                    margin-top: 26px;
                }

                .compare-table-wrap {
                    overflow-x: auto;
                    border-radius: 8px;
                    border: 1px solid rgba(15, 23, 42, 0.10);
                    box-shadow: 0 14px 44px rgba(15, 23, 42, 0.08);
                }

                .compare-table {
                    width: 100%;
                    min-width: 760px;
                    border-collapse: collapse;
                    background: #ffffff;
                    color: #0f172a;
                    font-size: 14px;
                }

                .compare-table th,
                .compare-table td {
                    padding: 18px;
                    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
                    vertical-align: top;
                    text-align: left;
                }

                .compare-table thead th {
                    color: #0f172a;
                    background: #f8fafc;
                    font-size: 14px;
                    font-weight: 900;
                }

                .compare-table tbody th {
                    width: 160px;
                    color: #0f766e;
                    font-weight: 900;
                    background: #f8fafc;
                }

                .compare-table tr:last-child th,
                .compare-table tr:last-child td {
                    border-bottom: none;
                }

                .products-final {
                    padding: 84px 0 96px;
                    text-align: center;
                    background:
                        linear-gradient(135deg, rgba(6, 95, 70, 0.94), rgba(10, 16, 24, 0.96) 58%, rgba(87, 66, 18, 0.90));
                    border-top: 1px solid rgba(255,255,255,0.10);
                }

                .products-final .products-wrap {
                    max-width: 760px;
                }

                .products-note {
                    margin-top: 12px;
                    color: rgba(255,255,255,0.68) !important;
                    font-size: 14px !important;
                }

                @media (max-width: 980px) {
                    .products-hero {
                        min-height: auto;
                    }

                    .products-hero-grid,
                    .product-panel,
                    .workflow-shots {
                        grid-template-columns: 1fr;
                    }

                    .product-panel:nth-child(even) .product-panel-copy,
                    .product-panel:nth-child(even) .product-panel-media {
                        order: initial;
                    }

                    .guide-grid,
                    .fit-grid,
                    .flow-line {
                        grid-template-columns: 1fr 1fr;
                    }

                    .suite-steps {
                        grid-template-columns: 1fr 1fr;
                    }
                }

                @media (max-width: 640px) {
                    .products-wrap {
                        width: min(100% - 28px, 1180px);
                    }

                    .products-hero {
                        padding: 96px 0 42px;
                    }

                    .products-hero h1 {
                        font-size: 34px;
                    }

                    .products-hero p,
                    .products-section-head p,
                    .products-final p {
                        font-size: 15px;
                    }

                    .products-section {
                        padding: 62px 0;
                    }

                    .products-section-head h2,
                    .products-final h2 {
                        font-size: 28px;
                    }

                    .products-actions,
                    .products-actions.center {
                        display: grid;
                        grid-template-columns: 1fr;
                    }

                    .products-btn {
                        width: 100%;
                    }

                    .suite-steps,
                    .suite-preview,
                    .guide-grid,
                    .fit-grid,
                    .flow-line,
                    .products-metrics {
                        grid-template-columns: 1fr;
                    }

                    .product-panel {
                        padding: 18px;
                    }

                    .product-panel h3 {
                        font-size: 28px;
                    }

                    .product-panel h4 {
                        font-size: 20px;
                    }

                    .products-media {
                        min-height: 220px;
                    }

                    .suite-preview img {
                        height: 220px;
                    }
                }
            `}</style>
        </>
    );
}

export default ProductsPage;
