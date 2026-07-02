import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import ZoomableImage from '../components/ZoomableImage';

const FEATURES = [
    ['LIVE 보드', '네이버·다음·네이트·줌·정책·이슈 흐름을 한 화면에서 보고 오늘 쓸 키워드 후보를 빠르게 고릅니다.'],
    ['정밀 분석', 'PC/모바일 검색량, 문서수, 경쟁비, 의도를 함께 보고 발행 가능성을 판단합니다.'],
    ['Pro 헌터', '무료 보드보다 넓은 후보군을 서버가 돌려보고 유료 사용자용 선점 키워드를 따로 추립니다.'],
    ['마인드맵 확장', '단어 붙이기가 아니라 검색자가 이어서 궁금해할 질문과 후속 글감을 묶어줍니다.'],
];

const WORKFLOW = [
    ['01', '실시간 감지', '포털/정책/이슈 신호를 계속 모아 갑자기 검색이 붙는 후보를 찾습니다.'],
    ['02', '실측 검증', '검색량, 문서수, PC/모바일 수요, 경쟁비를 확인해 허수 키워드를 걸러냅니다.'],
    ['03', '의도 분류', '뉴스성 단순 키워드인지, 블로그 글로 답을 줄 수 있는 니즈 키워드인지 나눕니다.'],
    ['04', '발행 연결', 'Naver와 Orbit에서 바로 글감으로 쓰도록 제목, 마인드맵, 검색 바로가기를 붙입니다.'],
];

const SCREENS = [
    {
        title: '실시간 검색어 모니터링',
        src: '/images/leword/realtime-monitor-hero.png',
        alt: 'LEWORD 실시간 검색어 모니터링 화면',
        desc: '네이버·ZUM·네이트·다음 흐름을 한 화면에서 비교합니다.',
    },
    {
        title: '황금키워드 보드',
        src: '/images/leword/screen-golden-keywords.png',
        alt: 'LEWORD 황금키워드 보드 화면',
        desc: '검색량과 경쟁도를 기준으로 우선순위가 매겨진 후보를 확인합니다.',
    },
    {
        title: '17개 데이터 소스',
        src: '/images/leword/17-sources-orbit-fast.jpg',
        alt: 'LEWORD 17개 데이터 소스 화면',
        desc: '실시간 이슈와 발행 전 검증 소스를 한 흐름으로 연결합니다.',
    },
];

const FAQS = [
    ['LEWORD는 네이버 자동화와 뭐가 다른가요?', '네이버 자동화는 글을 만들고 발행하는 도구이고, LEWORD는 그 전에 무엇을 써야 하는지 고르는 키워드 판단 도구입니다.'],
    ['왜 Pro에서 봐야 하나요?', '무료 화면은 맛보기 후보만 보여주고, Pro에서는 더 넓은 후보군과 실측 지표, 분석 버튼, 마인드맵 확장을 함께 사용합니다.'],
    ['결과는 어디에 쓰나요?', 'LEWORD에서 키워드를 고른 뒤 Better Life Naver로 네이버 글을 발행하거나 Leaders Orbit으로 외부유입 글감을 확장합니다.'],
];

function LewordDetailPage() {
    useEffect(() => {
        const prev = document.title;
        document.title = 'LEWORD 상세 — AI 키워드 인텔리전스';
        return () => { document.title = prev; };
    }, []);

    return (
        <main className="leword-detail-page">
            <section className="leword-detail-hero">
                <div className="leword-detail-wrap hero-grid">
                    <div className="hero-copy">
                        <span className="detail-kicker">LEWORD INTELLIGENCE</span>
                        <h1>글 쓰기 전에, 먼저 이길 키워드만 남깁니다</h1>
                        <p>
                            LEWORD는 실시간 검색어를 나열하는 화면이 아니라 검색량, 문서수, 경쟁도,
                            발행 의도를 함께 보고 블로그 글감으로 쓸 수 있는 후보를 골라내는 키워드 판단 엔진입니다.
                        </p>
                        <div className="hero-actions">
                            <Link to="/leword" className="detail-btn primary">LIVE 보드 열기</Link>
                            <Link to="/pricing" className="detail-btn secondary">Pro로 전체 기능 보기</Link>
                        </div>
                    </div>
                    <div className="hero-shot">
                        <ZoomableImage
                            src="/images/leword/realtime-monitor-hero.png"
                            alt="LEWORD 실시간 검색어 모니터링 화면"
                            title="LEWORD LIVE 보드"
                        />
                    </div>
                </div>
            </section>

            <section className="leword-detail-section">
                <div className="leword-detail-wrap">
                    <div className="section-head">
                        <span className="detail-kicker">WHY USE</span>
                        <h2>사용자가 LEWORD를 쓰는 이유</h2>
                        <p>자동화는 많이 쓰는 것보다, 먼저 쓸 만한 키워드를 정확히 고르는 쪽에서 성과가 갈립니다.</p>
                    </div>
                    <div className="feature-grid">
                        {FEATURES.map(([title, desc]) => (
                            <article key={title}>
                                <strong>{title}</strong>
                                <p>{desc}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="leword-detail-section darker">
                <div className="leword-detail-wrap">
                    <div className="section-head">
                        <span className="detail-kicker">PIPELINE</span>
                        <h2>감지부터 발행 연결까지 한 흐름</h2>
                    </div>
                    <div className="workflow-row">
                        {WORKFLOW.map(([step, title, desc]) => (
                            <article key={step}>
                                <small>{step}</small>
                                <strong>{title}</strong>
                                <p>{desc}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="leword-detail-section">
                <div className="leword-detail-wrap">
                    <div className="section-head">
                        <span className="detail-kicker">SCREENS</span>
                        <h2>실제 화면으로 보는 LEWORD</h2>
                    </div>
                    <div className="screen-grid">
                        {SCREENS.map((screen) => (
                            <figure key={screen.src}>
                                <ZoomableImage src={screen.src} alt={screen.alt} title={screen.title} />
                                <figcaption>
                                    <strong>{screen.title}</strong>
                                    <p>{screen.desc}</p>
                                </figcaption>
                            </figure>
                        ))}
                    </div>
                </div>
            </section>

            <section className="leword-detail-section darker">
                <div className="leword-detail-wrap cta-grid">
                    <div>
                        <span className="detail-kicker">NEXT STEP</span>
                        <h2>LEWORD에서 고르고, Naver와 Orbit으로 발행하세요</h2>
                        <p>
                            키워드 판단은 LEWORD가 맡고, 실제 글 발행은 Better Life Naver와 Leaders Orbit으로 이어집니다.
                            세 제품은 올인원 라이선스로 함께 쓰는 흐름이 가장 좋습니다.
                        </p>
                    </div>
                    <div className="cta-actions">
                        <Link to="/leword" className="detail-btn primary">LEWORD 열기</Link>
                        <Link to="/download" className="detail-btn secondary">앱 다운로드</Link>
                    </div>
                </div>
            </section>

            <section className="leword-detail-section faq-section">
                <div className="leword-detail-wrap">
                    <div className="section-head">
                        <span className="detail-kicker">FAQ</span>
                        <h2>자주 묻는 질문</h2>
                    </div>
                    <div className="faq-list">
                        {FAQS.map(([q, a]) => (
                            <details key={q}>
                                <summary>{q}</summary>
                                <p>{a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            <style>{`
                .leword-detail-page {
                    min-height: 100vh;
                    color: #f8fbff;
                    background:
                        linear-gradient(180deg, rgba(5,8,13,0.88), rgba(6,9,16,0.94)),
                        url('/images/hero-beach-bg-fast.jpg') center top / cover no-repeat;
                }

                .leword-detail-wrap {
                    width: min(1180px, calc(100% - 40px));
                    margin: 0 auto;
                }

                .leword-detail-hero {
                    padding: 130px 0 76px;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                }

                .hero-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 0.9fr) minmax(420px, 1.1fr);
                    gap: 42px;
                    align-items: center;
                }

                .detail-kicker {
                    display: inline-flex;
                    width: fit-content;
                    align-items: center;
                    min-height: 30px;
                    padding: 5px 14px;
                    border-radius: 999px;
                    border: 1px solid rgba(56,189,248,0.38);
                    background: rgba(56,189,248,0.12);
                    color: #7dd3fc;
                    font-size: 12px;
                    font-weight: 950;
                    letter-spacing: 0;
                }

                .hero-copy h1,
                .section-head h2,
                .cta-grid h2 {
                    margin: 16px 0 14px;
                    color: #fff;
                    font-size: clamp(34px, 5vw, 62px);
                    line-height: 1.08;
                    font-weight: 950;
                    letter-spacing: 0;
                }

                .section-head h2,
                .cta-grid h2 {
                    font-size: clamp(28px, 3.6vw, 44px);
                }

                .hero-copy p,
                .section-head p,
                .cta-grid p {
                    margin: 0;
                    color: rgba(226,232,240,0.78);
                    font-size: 17px;
                    line-height: 1.8;
                }

                .hero-actions,
                .cta-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    margin-top: 28px;
                }

                .detail-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 50px;
                    padding: 13px 22px;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 950;
                    text-decoration: none;
                }

                .detail-btn.primary {
                    background: linear-gradient(135deg, #38bdf8, #7c3aed);
                    color: #fff;
                    box-shadow: 0 18px 44px rgba(56,189,248,0.22);
                }

                .detail-btn.secondary {
                    border: 1px solid rgba(148,163,184,0.36);
                    background: rgba(15,23,42,0.72);
                    color: #e2e8f0;
                }

                .hero-shot {
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid rgba(125,211,252,0.22);
                    background: rgba(7,12,20,0.74);
                    box-shadow: 0 28px 80px rgba(0,0,0,0.36);
                }

                .hero-shot img,
                .screen-grid img {
                    display: block;
                    width: 100%;
                    height: auto;
                }

                .leword-detail-section {
                    padding: 76px 0;
                    background: rgba(6,10,18,0.55);
                }

                .leword-detail-section.darker {
                    background: rgba(3,7,14,0.82);
                }

                .section-head {
                    max-width: 760px;
                    margin-bottom: 28px;
                }

                .feature-grid,
                .workflow-row,
                .screen-grid {
                    display: grid;
                    gap: 16px;
                }

                .feature-grid {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                }

                .workflow-row {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                }

                .feature-grid article,
                .workflow-row article,
                .screen-grid figure,
                .faq-list details {
                    border: 1px solid rgba(148,163,184,0.16);
                    border-radius: 8px;
                    background: linear-gradient(180deg, rgba(15,23,42,0.76), rgba(8,13,22,0.68));
                    box-shadow: 0 18px 48px rgba(0,0,0,0.20);
                }

                .feature-grid article,
                .workflow-row article {
                    padding: 22px;
                }

                .workflow-row small {
                    display: inline-flex;
                    color: #38bdf8;
                    font-weight: 950;
                    margin-bottom: 14px;
                }

                .feature-grid strong,
                .workflow-row strong,
                .screen-grid strong {
                    display: block;
                    color: #fff;
                    font-size: 20px;
                    line-height: 1.35;
                    font-weight: 950;
                }

                .feature-grid p,
                .workflow-row p,
                .screen-grid p,
                .faq-list p {
                    margin: 10px 0 0;
                    color: rgba(226,232,240,0.68);
                    font-size: 14px;
                    line-height: 1.7;
                }

                .screen-grid {
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                }

                .screen-grid figure {
                    margin: 0;
                    overflow: hidden;
                }

                .screen-grid figcaption {
                    padding: 18px;
                }

                .cta-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto;
                    gap: 24px;
                    align-items: center;
                }

                .faq-list {
                    display: grid;
                    gap: 12px;
                }

                .faq-list details {
                    padding: 18px 20px;
                }

                .faq-list summary {
                    cursor: pointer;
                    color: #fff;
                    font-size: 17px;
                    font-weight: 900;
                }

                @media (max-width: 980px) {
                    .hero-grid,
                    .cta-grid {
                        grid-template-columns: minmax(0, 1fr);
                    }

                    .feature-grid,
                    .workflow-row,
                    .screen-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }

                @media (max-width: 640px) {
                    .leword-detail-wrap {
                        width: min(100% - 28px, 1180px);
                    }

                    .leword-detail-hero {
                        padding: 108px 0 54px;
                    }

                    .feature-grid,
                    .workflow-row,
                    .screen-grid {
                        grid-template-columns: minmax(0, 1fr);
                    }

                    .hero-actions,
                    .cta-actions {
                        flex-direction: column;
                    }

                    .detail-btn {
                        width: 100%;
                    }
                }
            `}</style>
        </main>
    );
}

export default LewordDetailPage;
