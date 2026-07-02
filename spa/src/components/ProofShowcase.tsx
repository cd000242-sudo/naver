type ProofItem = {
    src: string;
    title: string;
    desc: string;
    metric: string;
};

const ADSENSE_PROOFS: ProofItem[] = [
    {
        src: '/images/pricing-proof/adsense-10000-month.jpg',
        title: '이번 달 US$1만',
        desc: '애드센스 예상 수입 상승 인증',
        metric: '월 수익',
    },
    {
        src: '/images/pricing-proof/adsense-daily-100.jpg',
        title: '오늘 US$100+',
        desc: '일 수익 상승 사례',
        metric: '일 수익',
    },
    {
        src: '/images/pricing-proof/adsense-28days-931.jpg',
        title: '최근 28일 US$931',
        desc: '월간 운영 성과',
        metric: '28일 성과',
    },
    {
        src: '/images/pricing-proof/adsense-today-95.jpg',
        title: '오늘 US$95.57',
        desc: '당일 수익 인증',
        metric: '당일 수익',
    },
    {
        src: '/images/pricing-proof/adsense-small-start.jpg',
        title: '작은 블로그도 수익 흐름 확인',
        desc: '초기 운영 단계의 수익 상승 사례',
        metric: '시작 사례',
    },
];

const NAVER_PROOFS: ProofItem[] = [
    {
        src: '/images/proof-user/fast/KakaoTalk_20260305_004700252_07-fast.jpg',
        title: '방문횟수 9,177 돌파',
        desc: '2월 15일 기준 방문 지표가 크게 상승한 실제 성과 화면입니다.',
        metric: '방문 9,177',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260310_002438127-fast.jpg',
        title: '조회수 19,896 인증',
        desc: '조회수와 공감수가 함께 쌓인 네이버 운영 성과입니다.',
        metric: '조회 19,896',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260309_163736774-fast.jpg',
        title: '조회수 10,003 기록',
        desc: '발행 후 조회수가 빠르게 누적된 실제 인증 화면입니다.',
        metric: '조회 10,003',
    },
];

type ProofShowcaseProps = {
    className?: string;
    compact?: boolean;
};

export default function ProofShowcase({ className = '', compact = false }: ProofShowcaseProps) {
    const feature = ADSENSE_PROOFS[0];
    const subProofs = ADSENSE_PROOFS.slice(1);

    return (
        <section className={`proof-showcase${compact ? ' proof-showcase-compact' : ''}${className ? ` ${className}` : ''}`} aria-label="애드센스와 네이버 성과 인증">
            <div className="proof-showcase-copy">
                <span>PROOF</span>
                <h3>성과 화면까지 같이 보면 구매 판단이 빨라집니다</h3>
                <p>
                    애드센스 예상 수익과 기존 네이버 성과를 한 화면에 붙여, 자동화가 단순 기능이 아니라
                    운영 결과로 이어지는 느낌을 바로 줍니다.
                </p>
            </div>

            <div className="proof-showcase-layout">
                <figure className="proof-feature-card">
                    <img src={feature.src} alt={feature.title} loading="lazy" />
                    <figcaption>
                        <span>{feature.metric}</span>
                        <strong>{feature.title}</strong>
                        <small>{feature.desc}</small>
                    </figcaption>
                </figure>

                <div className="proof-mini-grid" aria-label="애드센스 수익 인증">
                    {subProofs.map((proof) => (
                        <figure key={proof.src} className="proof-mini-card">
                            <img src={proof.src} alt={proof.title} loading="lazy" />
                            <figcaption>
                                <strong>{proof.title}</strong>
                                <small>{proof.desc}</small>
                            </figcaption>
                        </figure>
                    ))}
                </div>

                <div className="proof-naver-row" aria-label="네이버 성과 인증">
                    {NAVER_PROOFS.map((proof) => (
                        <figure key={proof.src} className="proof-naver-card">
                            <img src={proof.src} alt={proof.title} loading="lazy" />
                            <figcaption>
                                <span>{proof.metric}</span>
                                <strong>{proof.title}</strong>
                            </figcaption>
                        </figure>
                    ))}
                </div>
            </div>

            <style>{`
                .proof-showcase {
                    width: 100%;
                    margin: 0 auto;
                    padding: clamp(22px, 3vw, 34px);
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
                    background:
                        linear-gradient(180deg, rgba(10,17,28,0.92), rgba(6,10,18,0.86)),
                        radial-gradient(circle at 15% 0%, rgba(68,215,182,0.12), transparent 34%);
                    box-shadow: 0 24px 80px rgba(0,0,0,0.30);
                    overflow: hidden;
                }

                .proof-showcase-copy {
                    max-width: 760px;
                    margin-bottom: 22px;
                }

                .proof-showcase-copy span {
                    display: inline-flex;
                    align-items: center;
                    min-height: 28px;
                    padding: 5px 13px;
                    border-radius: 999px;
                    border: 1px solid rgba(68,215,182,0.36);
                    background: rgba(68,215,182,0.13);
                    color: #84f2d7;
                    font-size: 12px;
                    font-weight: 950;
                    letter-spacing: 0;
                    margin-bottom: 14px;
                }

                .proof-showcase-copy h3 {
                    margin: 0 0 12px;
                    color: #fff;
                    font-size: clamp(26px, 3.2vw, 42px);
                    line-height: 1.18;
                    font-weight: 950;
                    letter-spacing: 0;
                }

                .proof-showcase-copy p {
                    margin: 0;
                    color: rgba(226,232,240,0.78);
                    font-size: 15px;
                    line-height: 1.8;
                }

                .proof-showcase-layout {
                    display: grid;
                    grid-template-columns: minmax(0, 1.12fr) minmax(300px, 0.88fr);
                    gap: 12px;
                    align-items: stretch;
                }

                .proof-feature-card,
                .proof-mini-card,
                .proof-naver-card {
                    min-width: 0;
                    margin: 0;
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
                    background: rgba(12,18,28,0.72);
                    overflow: hidden;
                    box-shadow: 0 18px 48px rgba(0,0,0,0.20);
                }

                .proof-feature-card {
                    grid-row: span 2;
                }

                .proof-feature-card img {
                    width: 100%;
                    height: clamp(260px, 30vw, 360px);
                    display: block;
                    object-fit: cover;
                    object-position: center;
                    background: #0b1220;
                }

                .proof-feature-card figcaption,
                .proof-mini-card figcaption,
                .proof-naver-card figcaption {
                    display: grid;
                    gap: 5px;
                    padding: 13px 15px 15px;
                }

                .proof-feature-card span,
                .proof-naver-card span {
                    color: #5eead4;
                    font-size: 12px;
                    font-weight: 950;
                }

                .proof-feature-card strong {
                    color: #fff;
                    font-size: 20px;
                    font-weight: 950;
                    line-height: 1.25;
                }

                .proof-feature-card small,
                .proof-mini-card small {
                    color: rgba(203,213,225,0.70);
                    font-size: 13px;
                    line-height: 1.55;
                }

                .proof-mini-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 12px;
                }

                .proof-mini-card img {
                    width: 100%;
                    height: 126px;
                    display: block;
                    object-fit: cover;
                    object-position: center;
                    background: #0b1220;
                }

                .proof-mini-card strong,
                .proof-naver-card strong {
                    color: #fff;
                    font-size: 14px;
                    font-weight: 950;
                    line-height: 1.35;
                }

                .proof-naver-row {
                    grid-column: 1 / -1;
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 12px;
                }

                .proof-naver-card img {
                    width: 100%;
                    height: 180px;
                    display: block;
                    object-fit: contain;
                    object-position: center top;
                    padding: 10px;
                    background: rgba(0,0,0,0.24);
                }

                .proof-showcase-compact {
                    padding: 22px;
                }

                .proof-showcase-compact .proof-showcase-layout {
                    grid-template-columns: 1fr;
                }

                .proof-showcase-compact .proof-feature-card {
                    grid-row: auto;
                }

                .proof-showcase-compact .proof-feature-card img {
                    height: 218px;
                }

                .proof-showcase-compact .proof-mini-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                .proof-showcase-compact .proof-naver-row {
                    grid-template-columns: 1fr;
                }

                .proof-showcase-compact .proof-naver-card img {
                    height: 136px;
                }

                .proof-showcase-compact .proof-showcase-copy h3 {
                    font-size: clamp(23px, 2.4vw, 30px);
                }

                @media (max-width: 900px) {
                    .proof-showcase-layout,
                    .proof-mini-grid,
                    .proof-naver-row,
                    .proof-showcase-compact .proof-mini-grid {
                        grid-template-columns: 1fr;
                    }

                    .proof-feature-card {
                        grid-row: auto;
                    }

                    .proof-feature-card img {
                        height: auto;
                        max-height: 360px;
                    }
                }
            `}</style>
        </section>
    );
}
