import { useEffect, useState } from 'react';
import { light, lightRadius, motion, type } from '../styles/tokens';

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
    variant?: 'grid' | 'carousel';
};

const ALL_PROOFS = [...ADSENSE_PROOFS, ...NAVER_PROOFS];

export default function ProofShowcase({ className = '', compact = false, variant = 'grid' }: ProofShowcaseProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const feature = ADSENSE_PROOFS[0];
    const subProofs = ADSENSE_PROOFS.slice(1);
    const activeProof = ALL_PROOFS[activeIndex] || ALL_PROOFS[0];

    useEffect(() => {
        if (variant !== 'carousel' || ALL_PROOFS.length <= 1) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const timerId = window.setInterval(() => {
            setActiveIndex((index) => (index + 1) % ALL_PROOFS.length);
        }, 3600);
        return () => window.clearInterval(timerId);
    }, [variant]);

    useEffect(() => {
        if (variant !== 'carousel' || ALL_PROOFS.length <= 1) return;
        const nextProof = ALL_PROOFS[(activeIndex + 1) % ALL_PROOFS.length];
        const timerId = window.setTimeout(() => {
            const image = new Image();
            image.decoding = 'async';
            image.src = nextProof.src;
        }, 900);
        return () => window.clearTimeout(timerId);
    }, [activeIndex, variant]);

    if (variant === 'carousel') {
        return (
            <section className={`proof-carousel${compact ? ' proof-showcase-compact' : ''}${className ? ` ${className}` : ''}`} aria-label="애드센스와 네이버 성과 자동 슬라이드">
                <div className="proof-carousel-stage">
                    <div className="proof-carousel-image-shell" aria-live="polite">
                        <img
                            key={`${activeProof.src}-${activeIndex}`}
                            src={activeProof.src}
                            alt={activeProof.title}
                            loading="lazy"
                            decoding="async"
                            className="proof-carousel-image active"
                        />
                    </div>

                    <div className="proof-carousel-summary">
                        <span>{activeProof.metric}</span>
                        <strong>{activeProof.title}</strong>
                        <small>{activeProof.desc}</small>
                    </div>

                    <div className="proof-carousel-dots" aria-label="성과 이미지 선택">
                        {ALL_PROOFS.map((proof, index) => (
                            <button
                                key={proof.src}
                                type="button"
                                className={index === activeIndex ? 'active' : ''}
                                aria-label={`${index + 1}번째 성과 보기`}
                                aria-pressed={index === activeIndex}
                                onClick={() => setActiveIndex(index)}
                            />
                        ))}
                    </div>
                </div>

                <style>{`
                    .proof-carousel {
                        width: 100%;
                        margin: 0;
                        padding: 16px;
                        border: 1px solid ${light.line};
                        border-radius: ${lightRadius.panel}px;
                        background: ${light.surface};
                        box-shadow: ${light.shadowSm};
                        overflow: hidden;
                    }

                    .proof-carousel-stage { display: flex; flex-direction: column; gap: 16px; }

                    /* The proof image is the real material here: it comes first, the caption sits under it. */
                    .proof-carousel-image-shell {
                        position: relative;
                        width: 100%;
                        height: 500px;
                        border-radius: ${lightRadius.card}px;
                        background: ${light.raised};
                        overflow: hidden;
                    }

                    .proof-carousel-image {
                        position: absolute;
                        inset: 0;
                        width: 100%;
                        height: 100%;
                        padding: 16px;
                        object-fit: contain;
                        object-position: center;
                    }

                    .proof-carousel-summary { display: grid; align-content: start; gap: 4px; min-height: 88px; padding: 0 8px; }
                    .proof-carousel-summary span { color: ${light.textMuted}; font-size: ${type.meta}px; font-weight: 500; }
                    .proof-carousel-summary strong {
                        color: ${light.text};
                        font-size: ${type.h3}px;
                        line-height: 1.3;
                        font-weight: 600;
                        font-variant-numeric: tabular-nums;
                    }
                    .proof-carousel-summary small { color: ${light.textSecondary}; font-size: ${type.small}px; line-height: 1.55; }

                    .proof-carousel-dots { display: flex; justify-content: center; align-items: center; }
                    .proof-carousel-dots button {
                        position: relative;
                        width: 32px;
                        height: 32px;
                        padding: 0;
                        border: 0;
                        border-radius: ${lightRadius.control}px;
                        background: transparent;
                        cursor: pointer;
                    }
                    .proof-carousel-dots button::before {
                        content: '';
                        position: absolute;
                        left: 12px;
                        top: 12px;
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: ${light.lineStrong};
                        transition: background ${motion.fast} ${motion.ease};
                    }
                    .proof-carousel-dots button.active::before { background: ${light.accent}; }
                    .proof-carousel-dots button:focus-visible { outline: 2px solid ${light.accentInk}; outline-offset: -2px; }

                    @media (max-width: 900px) {
                        .proof-carousel-image-shell { height: 420px; }
                    }

                    @media (max-width: 640px) {
                        .proof-carousel { padding: 12px; }
                        .proof-carousel-image-shell { height: 300px; }
                        .proof-carousel-image { padding: 8px; }
                        .proof-carousel-summary strong { font-size: ${type.lead}px; }
                    }
                `}</style>
            </section>
        );
    }

    return (
        <section className={`proof-showcase${compact ? ' proof-showcase-compact' : ''}${className ? ` ${className}` : ''}`} aria-label="애드센스와 네이버 성과 인증">
            <div className="proof-showcase-copy">
                <span>성과 인증</span>
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
                    padding: clamp(24px, 3vw, 32px);
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.panel}px;
                    background: ${light.surface};
                    box-shadow: ${light.shadowSm};
                    overflow: hidden;
                }

                .proof-showcase-copy { max-width: 760px; margin-bottom: 24px; }
                .proof-showcase-copy span { display: block; margin-bottom: 8px; color: ${light.accentInk}; font-size: ${type.meta}px; font-weight: 600; }
                .proof-showcase-copy h3 {
                    margin: 0 0 12px;
                    color: ${light.text};
                    font-size: ${type.h2}px;
                    line-height: 1.3;
                    font-weight: 600;
                }
                .proof-showcase-copy p { margin: 0; color: ${light.textSecondary}; font-size: ${type.body}px; line-height: 1.7; }

                .proof-showcase-layout {
                    display: grid;
                    grid-template-columns: minmax(0, 1.12fr) minmax(300px, 0.88fr);
                    gap: 16px;
                    align-items: stretch;
                }

                /* The screenshots stay as they are; only the frame and the caption under them are quiet. */
                .proof-feature-card,
                .proof-mini-card,
                .proof-naver-card {
                    min-width: 0;
                    margin: 0;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.card}px;
                    background: ${light.surface};
                    overflow: hidden;
                }

                .proof-feature-card { grid-row: span 2; }

                .proof-feature-card img,
                .proof-mini-card img,
                .proof-naver-card img {
                    width: 100%;
                    display: block;
                    object-fit: cover;
                    object-position: center;
                    background: ${light.raised};
                    border-bottom: 1px solid ${light.line};
                }
                .proof-feature-card img { height: clamp(260px, 30vw, 360px); }
                .proof-mini-card img { height: 126px; }
                .proof-naver-card img { height: 180px; padding: 8px; object-fit: contain; object-position: center top; }

                .proof-feature-card figcaption,
                .proof-mini-card figcaption,
                .proof-naver-card figcaption { display: grid; gap: 4px; padding: 12px 16px 16px; }

                .proof-feature-card span,
                .proof-naver-card span { color: ${light.textMuted}; font-size: ${type.meta}px; font-weight: 500; }

                .proof-feature-card strong,
                .proof-mini-card strong,
                .proof-naver-card strong {
                    color: ${light.text};
                    font-size: ${type.body}px;
                    font-weight: 600;
                    line-height: 1.35;
                    font-variant-numeric: tabular-nums;
                }
                .proof-feature-card strong { font-size: ${type.lead}px; }

                .proof-feature-card small,
                .proof-mini-card small { color: ${light.textSecondary}; font-size: ${type.small}px; line-height: 1.55; }

                .proof-mini-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }

                .proof-naver-row {
                    grid-column: 1 / -1;
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 16px;
                }

                .proof-showcase-compact { padding: 24px; }
                .proof-showcase-compact .proof-showcase-layout { grid-template-columns: 1fr; }
                .proof-showcase-compact .proof-feature-card { grid-row: auto; }
                .proof-showcase-compact .proof-feature-card img { height: 218px; }
                .proof-showcase-compact .proof-mini-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .proof-showcase-compact .proof-naver-row { grid-template-columns: 1fr; }
                .proof-showcase-compact .proof-naver-card img { height: 136px; }
                .proof-showcase-compact .proof-showcase-copy h3 { font-size: ${type.h3}px; }

                @media (max-width: 900px) {
                    .proof-showcase-layout,
                    .proof-mini-grid,
                    .proof-naver-row,
                    .proof-showcase-compact .proof-mini-grid { grid-template-columns: 1fr; }
                    .proof-feature-card { grid-row: auto; }
                    .proof-feature-card img { height: auto; max-height: 360px; }
                }

                @media (max-width: 640px) {
                    .proof-showcase { padding: 16px; }
                    .proof-showcase-copy h3 { font-size: ${type.h3}px; }
                    .proof-feature-card img,
                    .proof-mini-card img,
                    .proof-naver-card img,
                    .proof-showcase-compact .proof-naver-card img { height: auto; max-height: 260px; object-fit: contain; }
                }
            `}</style>
        </section>
    );
}
