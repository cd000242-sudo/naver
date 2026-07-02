import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ProofShowcase from '../components/ProofShowcase';
import { getScheduledAmount, isNormalPricingActive, PRICING_SWITCH_AT_MS } from '../lib/pricingSchedule';
import { fetchSiteContent, type SiteContent } from '../lib/siteOps';

/**
 * 요금제 — 올인원 기간제 이용권.
 * Toss Payments SDK (v1) 동적 로드 후 requestBillingAuth (정기구독).
 * 카드 결제는 amountCard(VAT 10% 포함)가 있으면 그 금액을 청구.
 * success/fail URL은 origin 직접 경로(leaderspro.kr root) 사용.
 */

const TOSS_CLIENT_KEY = 'live_ck_mBZ1gQ4YVX9M4BDM7a0Rrl2KPoqN';
// v2/standard — 원본 pricing.html과 동일 SDK URL. v1 은 API 시그니처가 다름.
const TOSS_SDK_URL = 'https://js.tosspayments.com/v2/standard';

interface Plan {
    id: string;
    name: string;
    desc: string;
    amount: number;
    amountCard?: number;
    futureAmountCard?: number;
    period: string;
    monthly?: string;
    futureAmount?: number;
    eventLabel?: string;
    features: string[];
    badge?: { text: string; type: 'best' | 'lifetime' | 'trial' };
    free?: boolean;
}

const PLANS: Record<string, Plan[]> = {
    naver: [
        {
            id: 'free-naver',
            name: 'Better Life Naver 무료 체험',
            desc: '네이버 자동화 먼저 체험',
            amount: 0,
            period: '무료',
            free: true,
            badge: { text: '🎁 FREE', type: 'trial' },
            features: ['Better Life Naver 체험', 'AI 콘텐츠 생성', '매일 2편 발행 제한', 'LEWORD·Orbit은 올인원 구매 후 이용'],
        },
        {
            id: 'all-in-one-monthly',
            name: '올인원 1개월',
            desc: '3개 앱을 한 번에 가볍게 시작',
            amount: 50000,
            amountCard: 55000,
            futureAmount: 100000,
            futureAmountCard: 110000,
            eventLabel: '8월 1일부터 정상가 100,000원',
            period: '/ 월 (공급가)',
            features: ['Better Life Naver 이용', 'LEWORD 키워드 분석 이용', 'Leadernam Orbit 이용', '이메일 고객 지원'],
        },
        {
            id: 'all-in-one-quarterly',
            name: '올인원 3개월',
            desc: '블로그 자동화 흐름을 안정적으로 운영',
            amount: 120000,
            futureAmount: 240000,
            eventLabel: '8월 1일부터 정상가 240,000원',
            period: '/ 3개월',
            monthly: '월 40,000원',
            features: ['Better Life Naver 이용', 'LEWORD 전체 기능 이용', 'Leadernam Orbit 이용', '우선 고객 지원'],
        },
        {
            id: 'all-in-one-yearly',
            name: '올인원 1년',
            desc: '가장 합리적인 전체 제품 기간권',
            amount: 400000,
            futureAmount: 800000,
            eventLabel: '8월 1일부터 정상가 800,000원',
            period: '/ 년',
            monthly: '월 33,333원',
            badge: { text: '👑 BEST VALUE', type: 'best' },
            features: ['모든 자동화툴 기간 내 이용', '라이선스 기간 내 업데이트', '전용 커뮤니티 안내', '1:1 우선 지원'],
        },
        {
            id: 'all-in-one-lifetime',
            name: '올인원 영구제',
            desc: '한 번 구매로 장기 운영하는 영구 이용권',
            amount: 1650000,
            futureAmount: 3300000,
            eventLabel: '8월 1일부터 정상가 3,300,000원',
            period: '영구 이용',
            badge: { text: '🌟 LIFETIME', type: 'lifetime' },
            features: ['3개 앱 모두 영구 이용', '영구제 전용 라이선스', '장기 운영자 우선 지원', '주요 업데이트 포함'],
        },
    ],
};

const PURCHASE_SHOWCASE_VIDEOS = [
    {
        title: 'Better-Life-Naver 글발행 예시 영상',
        label: '네이버 자동 발행',
        desc: '키워드 입력부터 글 작성, 이미지 구성, 발행 흐름까지 실제 구매자가 가장 먼저 확인해야 할 장면입니다.',
        src: '/videos/pricing-showcase/better-life-naver-publish-demo.mp4',
    },
    {
        title: 'LEADERNAM-Orbit 글 발행 영상',
        label: 'Orbit 통합 발행',
        desc: '외부유입용 글 발행 흐름을 한 번에 확인합니다.',
        src: '/videos/pricing-showcase/leadernam-orbit-publish-demo.mp4',
    },
    {
        title: 'LEADERNAM-Orbit 블로그스팟 발행 예시 영상',
        label: '블로그스팟',
        desc: 'Blogger 채널에 글이 올라가는 실제 장면입니다.',
        src: '/videos/pricing-showcase/leadernam-orbit-blogspot-demo.mp4',
    },
    {
        title: 'LEADERNAM-Orbit 워드프레스 발행 예시 영상',
        label: '워드프레스',
        desc: 'WordPress 발행 채널을 운영하는 사용자를 위한 예시입니다.',
        src: '/videos/pricing-showcase/leadernam-orbit-wordpress-demo.mp4',
    },
    {
        title: 'LEADERNAM-Orbit 티스토리 발행 예시 영상',
        label: '티스토리',
        desc: 'Tistory 발행까지 연결되는 외부유입 운영 흐름입니다.',
        src: '/videos/pricing-showcase/leadernam-orbit-tistory-demo.mp4',
    },
];

const TAB_LABELS: Record<string, string> = { naver: 'ALL · Leaders Pro 올인원' };
const TAB_KEYS = ['naver'] as const;
type TabKey = typeof TAB_KEYS[number];

function getPlanAmount(plan: Plan, nowMs: number = Date.now()) {
    return getScheduledAmount(plan.amount, plan.futureAmount, nowMs);
}

function getPlanCardAmount(plan: Plan, nowMs: number = Date.now()) {
    if (!plan.amountCard) return getPlanAmount(plan, nowMs);
    const normalCard = plan.futureAmountCard ?? (plan.futureAmount ? Math.round(plan.futureAmount * 1.1) : undefined);
    return getScheduledAmount(plan.amountCard, normalCard, nowMs);
}

function applyPlanOverrides(plans: Plan[], siteContent: SiteContent | null): Plan[] {
    const overrides = siteContent?.pricing?.plans || {};
    return plans.map((plan) => {
        const patch = overrides[plan.id];
        if (!patch) return plan;
        return {
            ...plan,
            ...patch,
            features: Array.isArray(patch.features) && patch.features.length > 0 ? patch.features : plan.features,
            badge: patch.badgeText ? { ...(plan.badge || { type: 'best' as const }), text: patch.badgeText } : plan.badge,
            free: plan.free,
        };
    });
}

declare global {
    interface Window { TossPayments?: (key: string) => any; }
}

// SDK 싱글톤 로더 — 페이지 리마운트 시 중복 로드 방지
let sdkLoadingPromise: Promise<void> | null = null;
function loadTossSdk(): Promise<void> {
    if (typeof window !== 'undefined' && window.TossPayments) return Promise.resolve();
    if (sdkLoadingPromise) return sdkLoadingPromise;
    sdkLoadingPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${TOSS_SDK_URL}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('Toss SDK load failed')), { once: true });
            if ((existing as HTMLScriptElement).getAttribute('data-loaded') === '1') resolve();
            return;
        }
        const s = document.createElement('script');
        s.src = TOSS_SDK_URL;
        s.async = true;
        s.onload = () => { s.setAttribute('data-loaded', '1'); resolve(); };
        s.onerror = () => reject(new Error('Toss SDK load failed'));
        document.head.appendChild(s);
    });
    return sdkLoadingPromise;
}

const generateOrderId = () => {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `LP-${ts}-${rand}`;
};

function PricingPage() {
    const [searchParams] = useSearchParams();
    const initialTab = (searchParams.get('tab') as TabKey | null);
    const [tab, setTab] = useState<TabKey>(TAB_KEYS.includes(initialTab as TabKey) ? (initialTab as TabKey) : 'naver');
    const [selected, setSelected] = useState<Plan | null>(null);
    const [email, setEmail] = useState('');
    const [emailShake, setEmailShake] = useState(false);
    const [paying, setPaying] = useState(false);
    const [pricingNow, setPricingNow] = useState(() => Date.now());
    const [siteContent, setSiteContent] = useState<SiteContent | null>(null);
    const tossRef = useRef<any | null>(null);
    const [sdkReady, setSdkReady] = useState(false);
    const paymentSectionRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = '올인원 기간제 이용권 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    useEffect(() => {
        const refreshPricing = () => setPricingNow(Date.now());
        const intervalId = window.setInterval(refreshPricing, 60000);
        const switchDelay = Math.max(1000, PRICING_SWITCH_AT_MS - Date.now() + 1000);
        const switchTimeoutId = window.setTimeout(refreshPricing, switchDelay);
        return () => {
            window.clearInterval(intervalId);
            window.clearTimeout(switchTimeoutId);
        };
    }, []);

    useEffect(() => {
        (async () => {
            try {
                await loadTossSdk();
                if (window.TossPayments) {
                    tossRef.current = window.TossPayments(TOSS_CLIENT_KEY);
                    setSdkReady(true);
                }
            } catch (e) {
                console.error('Toss SDK init failed:', e);
            }
        })();
    }, []);

    useEffect(() => {
        fetchSiteContent().then(setSiteContent);
    }, []);

    // 탭 전환 시 선택 초기화
    const onTab = (t: TabKey) => { setTab(t); setSelected(null); };

    const onSelect = (p: Plan) => {
        if (p.free) {
            // 무료 체험은 Better Life Naver만 제공되며 다운로드 페이지로 이동한다.
            window.location.href = '/download';
            return;
        }
        setSelected(p);
        window.setTimeout(() => {
            paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
    };

    const requestPayment = async () => {
        if (!selected || !tossRef.current) return;
        const e = email.trim();
        if (!e || !e.includes('@')) {
            setEmailShake(true);
            window.setTimeout(() => setEmailShake(false), 600);
            return;
        }
        setPaying(true);
        try {
            const chargeAmount = getPlanCardAmount(selected);
            const customerKey = 'LP_' + e.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now();
            const orderId = generateOrderId();
            const origin = window.location.origin;
            const successUrl = `${origin}/success.html?email=${encodeURIComponent(e)}&productId=${encodeURIComponent(selected.id)}&amount=${chargeAmount}&orderName=${encodeURIComponent(selected.name)}&customerKey=${encodeURIComponent(customerKey)}&orderId=${encodeURIComponent(orderId)}`;
            const failUrl = `${origin}/fail.html`;
            const payment = tossRef.current.payment({ customerKey });
            await payment.requestBillingAuth({ method: 'CARD', successUrl, failUrl });
        } catch (err: any) {
            // 사용자가 결제창을 닫은 경우(USER_CANCEL)와 실제 SDK 오류 구분
            const code = err?.code || '';
            const msg = err?.message || String(err);
            console.error('[Toss requestBillingAuth] code:', code, 'message:', msg, err);
            if (code !== 'USER_CANCEL' && !msg.includes('취소')) {
                alert(`결제창 호출 실패\n\ncode: ${code || '(없음)'}\nmessage: ${msg}\n\n토스 콘솔에 successUrl(${window.location.origin}/success.html) 등록 여부를 확인해주세요.`);
            }
            setPaying(false);
        }
    };

    const chargeLabel = (() => {
        if (!selected) return '플랜을 선택해주세요';
        const charge = getPlanCardAmount(selected);
        const vatNote = selected.amountCard ? ' (VAT 포함)' : '';
        return `${selected.name} 시작 · 7일 환불 보장 · ${charge.toLocaleString()}원${vatNote}`;
    })();

    const normalPricingActive = isNormalPricingActive(pricingNow);
    const activePlans = applyPlanOverrides(PLANS[tab], siteContent);
    const pricingPage = siteContent?.pricing?.page || {};
    const pricingBgImage = siteContent?.theme?.pricingBgImage;
    const pricingTitle = normalPricingActive
        ? (pricingPage.titleNormal || '8월 1일부터 가격이 단계적으로 조정 중입니다')
        : (pricingPage.title || '지금 이벤트가로 이용하고, 8월 1일부터 가격이 점진적으로 상승합니다');
    const pricingEventTitle = normalPricingActive
        ? (pricingPage.eventTitleNormal || '가격이 단계적으로 조정 중입니다.')
        : (pricingPage.eventTitle || '현재 가격은 7월 31일까지 이벤트가입니다.');
    const pricingEventDesc = normalPricingActive
        ? (pricingPage.eventDescNormal || '2026년 8월 1일부터 가격이 점진적으로 상승하고 있습니다.')
        : (pricingPage.eventDesc || '2026년 8월 1일부터 가격이 점진적으로 상승합니다.');
    const pricingIntro = (
        <div style={{ textAlign: 'center', margin: '42px 0 36px' }}>
            <span style={{ display: 'inline-block', padding: '6px 16px', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 50, color: '#FFD700', fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>{pricingPage.eyebrow || 'PRICING'}</span>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, marginBottom: 12 }}>
                {pricingTitle}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>{pricingPage.desc || '1개월·3개월·1년·영구제 모두 올인원 라이선스로 Better Life Naver, LEWORD, Leadernam Orbit을 함께 이용합니다.'}</p>
            <div style={{ margin: '20px auto 0', maxWidth: 860, padding: '18px 24px', borderRadius: 16, border: '1px solid rgba(255,215,0,0.34)', background: 'rgba(255,215,0,0.10)', color: '#FFD700', fontSize: 16, fontWeight: 900, lineHeight: 1.75, boxShadow: '0 12px 36px rgba(0,0,0,0.16)' }}>
                <div style={{ fontSize: 18, marginBottom: 2 }}>
                    {pricingEventTitle}
                </div>
                <div>{pricingEventDesc}</div>
                <div style={{ marginTop: 4, color: '#fff7b0', fontSize: 15 }}>
                    {pricingPage.eventLine || '8월 1일부터 단계별 인상 예정 · 1개월 100,000원 · 3개월 240,000원 · 1년 800,000원 · 영구제 3,300,000원'}
                </div>
            </div>
        </div>
    );

    return (
        <div style={{
            position: 'relative',
            zIndex: 1,
            ...(pricingBgImage ? {
                backgroundImage: `linear-gradient(rgba(5,8,12,0.34), rgba(5,8,12,0.50)), url(${pricingBgImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center top',
                backgroundAttachment: 'fixed',
            } : {}),
        }}>
            <section style={{ padding: '140px 20px 80px', maxWidth: 1320, margin: '0 auto' }}>
                <section className="purchase-proof-showcase" aria-label="실제 발행 영상과 수익 성과 인증">
                    <div className="purchase-video-side">
                        <div className="purchase-section-eyebrow">REAL WORKFLOW</div>
                        <h3>결제 전, 실제로 글이 발행되는 장면부터 확인하세요</h3>
                        <p>
                            Better Life Naver와 Leadernam Orbit이 실제로 글을 만들고 각 채널에 발행되는 과정을 영상으로 먼저 보여줍니다.
                            구매 페이지에서 기능이 말이 아니라 화면으로 증명되도록 배치했습니다.
                        </p>
                        <article className="purchase-main-video">
                            <video
                                src={PURCHASE_SHOWCASE_VIDEOS[0].src}
                                controls
                                muted
                                loop
                                playsInline
                                preload="metadata"
                                aria-label={PURCHASE_SHOWCASE_VIDEOS[0].title}
                            />
                            <div>
                                <span>{PURCHASE_SHOWCASE_VIDEOS[0].label}</span>
                                <strong>{PURCHASE_SHOWCASE_VIDEOS[0].title}</strong>
                                <p>{PURCHASE_SHOWCASE_VIDEOS[0].desc}</p>
                            </div>
                        </article>
                        <div className="purchase-video-grid">
                            {PURCHASE_SHOWCASE_VIDEOS.slice(1).map((video) => (
                                <article className="purchase-mini-video" key={video.src}>
                                    <video
                                        src={video.src}
                                        controls
                                        muted
                                        playsInline
                                        preload="metadata"
                                        aria-label={video.title}
                                    />
                                    <div>
                                        <span>{video.label}</span>
                                        <strong>{video.title}</strong>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>

                    <ProofShowcase compact variant="carousel" className="purchase-proof-side" />
                </section>

                {pricingIntro}

                {/* Product tabs */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 36, flexWrap: 'wrap' }}>
                    {TAB_KEYS.map((k) => (
                        <button
                            key={k}
                            onClick={() => onTab(k)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '12px 22px', borderRadius: 50, cursor: 'pointer',
                                background: tab === k ? 'linear-gradient(135deg, rgba(255,215,0,0.18), rgba(255,215,0,0.06))' : 'rgba(255,255,255,0.04)',
                                border: tab === k ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.08)',
                                color: tab === k ? '#FFD700' : 'rgba(255,255,255,0.7)',
                                fontWeight: 700, fontSize: 14,
                            }}
                        >{pricingPage.tabLabel || TAB_LABELS[k]}</button>
                    ))}
                </div>

                <style>{`
                    .purchase-proof-showcase {
                        display: grid;
                        grid-template-columns: minmax(0, 1.18fr) minmax(360px, 0.82fr);
                        gap: 18px;
                        align-items: stretch;
                        margin: 0 0 34px;
                    }

                    .purchase-video-side {
                        border-radius: 18px;
                        border: 1px solid rgba(255, 255, 255, 0.10);
                        background: linear-gradient(180deg, rgba(12, 18, 31, 0.88), rgba(9, 13, 22, 0.74));
                        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
                        padding: 22px;
                        overflow: hidden;
                    }

                    .purchase-section-eyebrow {
                        display: inline-flex;
                        align-items: center;
                        min-height: 28px;
                        padding: 5px 12px;
                        border-radius: 999px;
                        background: rgba(56, 189, 248, 0.12);
                        border: 1px solid rgba(56, 189, 248, 0.28);
                        color: #7dd3fc;
                        font-size: 12px;
                        font-weight: 900;
                        letter-spacing: 0;
                        margin-bottom: 12px;
                    }

                    .purchase-section-eyebrow.proof {
                        background: rgba(68, 215, 182, 0.12);
                        border-color: rgba(68, 215, 182, 0.30);
                        color: #8af5dd;
                    }

                    .purchase-video-side h3 {
                        margin: 0 0 8px;
                        color: #fff;
                        font-size: clamp(22px, 2.4vw, 30px);
                        line-height: 1.25;
                        font-weight: 950;
                        letter-spacing: 0;
                    }

                    .purchase-video-side > p {
                        margin: 0 0 18px;
                        color: rgba(226, 232, 240, 0.74);
                        font-size: 14px;
                        line-height: 1.75;
                    }

                    .purchase-main-video {
                        display: grid;
                        grid-template-columns: minmax(0, 1.22fr) minmax(220px, 0.78fr);
                        gap: 16px;
                        align-items: stretch;
                        padding: 14px;
                        border-radius: 14px;
                        border: 1px solid rgba(56, 189, 248, 0.18);
                        background: rgba(2, 6, 23, 0.62);
                    }

                    .purchase-main-video video,
                    .purchase-mini-video video {
                        width: 100%;
                        display: block;
                        border-radius: 10px;
                        background: #000;
                        aspect-ratio: 16 / 9;
                        object-fit: cover;
                    }

                    .purchase-main-video div {
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        min-width: 0;
                    }

                    .purchase-main-video span,
                    .purchase-mini-video span {
                        color: #7dd3fc;
                        font-size: 12px;
                        font-weight: 900;
                        margin-bottom: 7px;
                    }

                    .purchase-main-video strong,
                    .purchase-mini-video strong {
                        color: #fff;
                        font-size: 18px;
                        line-height: 1.35;
                        font-weight: 900;
                    }

                    .purchase-main-video p {
                        margin: 10px 0 0;
                        color: rgba(203, 213, 225, 0.76);
                        font-size: 13px;
                        line-height: 1.65;
                    }

                    .purchase-video-grid {
                        display: grid;
                        grid-template-columns: repeat(4, minmax(0, 1fr));
                        gap: 12px;
                        margin-top: 14px;
                    }

                    .purchase-mini-video {
                        padding: 10px;
                        border-radius: 12px;
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        background: rgba(15, 23, 42, 0.56);
                    }

                    .purchase-mini-video div {
                        display: flex;
                        flex-direction: column;
                        margin-top: 10px;
                    }

                    .purchase-mini-video strong {
                        font-size: 12px;
                    }

                    .adsense-proof-grid {
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 10px;
                    }

                    .adsense-proof-card,
                    .naver-proof-strip figure {
                        margin: 0;
                        border-radius: 12px;
                        border: 1px solid rgba(255, 255, 255, 0.10);
                        background: rgba(15, 23, 42, 0.62);
                        overflow: hidden;
                    }

                    .adsense-proof-card.featured {
                        grid-column: span 2;
                    }

                    .adsense-proof-card img,
                    .naver-proof-strip img {
                        display: block;
                        width: 100%;
                        height: 118px;
                        object-fit: cover;
                        background: #0f172a;
                    }

                    .adsense-proof-card.featured img {
                        height: 190px;
                    }

                    .adsense-proof-card figcaption {
                        display: flex;
                        flex-direction: column;
                        gap: 3px;
                        padding: 10px 12px 12px;
                    }

                    .adsense-proof-card strong,
                    .naver-proof-strip figcaption {
                        color: #fff;
                        font-size: 13px;
                        font-weight: 900;
                        line-height: 1.35;
                    }

                    .adsense-proof-card span {
                        color: rgba(203, 213, 225, 0.70);
                        font-size: 12px;
                        line-height: 1.4;
                    }

                    .naver-proof-strip {
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 10px;
                        margin-top: 12px;
                    }

                    .naver-proof-strip img {
                        height: 82px;
                    }

                    .naver-proof-strip figcaption {
                        padding: 8px 10px 10px;
                        color: #8af5dd;
                        font-size: 11px;
                    }

                    .pricing-plan-grid {
                        display: grid;
                        grid-template-columns: repeat(5, minmax(0, 1fr));
                        gap: 18px;
                    }
                    @media (max-width: 1180px) {
                        .purchase-proof-showcase {
                            grid-template-columns: 1fr;
                        }

                        .pricing-plan-grid {
                            grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                        }
                    }
                    @media (max-width: 860px) {
                        .purchase-video-side {
                            padding: 16px;
                        }

                        .purchase-main-video {
                            grid-template-columns: 1fr;
                        }

                        .purchase-video-grid,
                        .adsense-proof-grid,
                        .naver-proof-strip {
                            grid-template-columns: 1fr;
                        }

                        .adsense-proof-card.featured {
                            grid-column: auto;
                        }
                    }
                `}</style>

                {/* Pricing grid */}
                <div className="pricing-plan-grid">
                    {activePlans.map((p) => {
                        const isSelected = selected?.id === p.id;
                        const isFeatured = p.badge?.type === 'best';
                        const isTrial = p.free;
                        const activeAmount = getPlanAmount(p, pricingNow);
                        const activeCardAmount = getPlanCardAmount(p, pricingNow);
                        const showEventPrice = !normalPricingActive && !!p.futureAmount && !p.free;
                        const showNormalBadge = normalPricingActive && !!p.futureAmount && !p.free;
                        return (
                            <div
                                key={p.id}
                                onClick={() => onSelect(p)}
                                style={{
                                    background: isSelected ? 'linear-gradient(180deg, rgba(255,215,0,0.10), rgba(18,18,26,0.85))' : isFeatured ? 'linear-gradient(180deg, rgba(255,215,0,0.04), rgba(18,18,26,0.7))' : 'rgba(18,18,26,0.6)',
                                    border: isSelected ? '2px solid #FFD700' : isFeatured ? '1px solid rgba(255,215,0,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 18, padding: '28px 22px',
                                    cursor: 'pointer', transition: 'all 0.25s',
                                    position: 'relative', textAlign: 'center',
                                }}
                            >
                                {p.badge && (
                                    <div style={{
                                        position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                                        background: p.badge.type === 'best' ? 'linear-gradient(135deg, #FFD700, #FFA500)' : p.badge.type === 'lifetime' ? 'linear-gradient(135deg, #A78BFA, #7C3AED)' : 'linear-gradient(135deg, #44d7b6, #2bb89c)',
                                        color: p.badge.type === 'trial' ? '#0a0a0f' : '#000',
                                        padding: '4px 14px', borderRadius: 50,
                                        fontSize: 11, fontWeight: 800, letterSpacing: 0.5, whiteSpace: 'nowrap',
                                    }}>{p.badge.text}</div>
                                )}
                                <div style={{ marginBottom: 12 }}>
                                    <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{p.name}</h3>
                                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{p.desc}</p>
                                </div>
                                <div style={{ marginBottom: 10 }}>
                                    {showEventPrice && p.futureAmount && (
                                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textDecoration: 'line-through', marginBottom: 4 }}>
                                            정상가 {p.futureAmount.toLocaleString()}원
                                        </div>
                                    )}
                                    <span style={{ fontSize: 28, fontWeight: 900, background: 'linear-gradient(135deg, #FFD700, #FFA500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                        {p.free ? '0' : activeAmount.toLocaleString()}
                                    </span>
                                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginLeft: 4 }}>{p.free ? '원' : '원'}</span>
                                    {showEventPrice && p.eventLabel && (
                                        <div style={{ margin: '10px auto 0', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '7px 12px', borderRadius: 14, background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.26)', color: '#FFD700', fontSize: 12, fontWeight: 900, lineHeight: 1.35 }}>
                                            <span>지금 이벤트가</span>
                                            <span style={{ color: '#fff7b0', fontSize: 11 }}>{p.eventLabel}</span>
                                        </div>
                                    )}
                                    {showNormalBadge && (
                                        <div style={{ margin: '10px auto 0', display: 'inline-flex', padding: '7px 12px', borderRadius: 14, background: 'rgba(68,215,182,0.12)', border: '1px solid rgba(68,215,182,0.28)', color: '#8af5dd', fontSize: 12, fontWeight: 900 }}>
                                            정상가 적용 중
                                        </div>
                                    )}
                                </div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                                    {p.period}
                                    {p.monthly && <span style={{ display: 'block', color: '#FFD700', marginTop: 4 }}>({p.monthly})</span>}
                                </div>
                                {p.amountCard && (
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6, lineHeight: 1.6 }}>
                                        카드 <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{activeCardAmount.toLocaleString()}원</strong> <span style={{ opacity: 0.7 }}>(VAT 10%)</span><br />
                                        계좌이체 <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{activeAmount.toLocaleString()}원</strong>
                                    </div>
                                )}
                                <ul style={{ listStyle: 'none', textAlign: 'left', marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    {p.features.map((f, i) => (
                                        <li key={i} style={{ padding: '5px 0', fontSize: 12, color: 'rgba(255,255,255,0.75)', display: 'flex', gap: 8 }}>
                                            <span style={{ color: isFeatured ? '#FFD700' : '#44d7b6', fontWeight: 700 }}>✓</span>{f}
                                        </li>
                                    ))}
                                </ul>
                                <div style={{
                                    marginTop: 18, padding: '10px 16px', borderRadius: 10,
                                    background: isTrial ? 'linear-gradient(135deg, rgba(68,215,182,0.2), rgba(68,215,182,0.05))' : isSelected ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'rgba(255,255,255,0.05)',
                                    color: isTrial ? '#44d7b6' : isSelected ? '#000' : 'rgba(255,255,255,0.85)',
                                    fontSize: 13, fontWeight: 700, border: isTrial ? '1px solid rgba(68,215,182,0.4)' : 'none',
                                }}>
                                    {isTrial ? '🚀 체험하기 (다운로드)' : isSelected ? '✓ 선택됨' : '선택하기'}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Trust bar */}
                <div style={{ maxWidth: 720, margin: '36px auto 18px', padding: '18px 22px', background: 'rgba(255,255,255,0.95)', borderRadius: 14, boxShadow: '0 6px 22px rgba(0,0,0,0.14)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-around', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ textAlign: 'center', minWidth: 90 }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#c9a84c' }}>⭐ 4.9 / 5</div>
                            <div style={{ fontSize: 12, color: '#5b6b7a', marginTop: 2 }}>실사용 후기 기반</div>
                        </div>
                        <div style={{ textAlign: 'center', minWidth: 90 }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#14304d' }}>2,847명</div>
                            <div style={{ fontSize: 12, color: '#5b6b7a', marginTop: 2 }}>현재 활성 사용자</div>
                        </div>
                        <div style={{ textAlign: 'center', minWidth: 90 }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#44d7b6' }}>🛡️ 7일 환불</div>
                            <div style={{ fontSize: 12, color: '#5b6b7a', marginTop: 2 }}>미사용 시 전액 환불</div>
                        </div>
                    </div>
                </div>

                {/* Payment section */}
                <div ref={paymentSectionRef} style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px', background: 'rgba(18,18,26,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: 18 }}>
                    <label style={{ display: 'block', marginBottom: 8, color: '#FFD700', fontSize: 14, fontWeight: 700 }}>📧 {pricingPage.paymentEmailLabel || '라이선스를 받을 이메일'}</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="example@email.com"
                        style={{
                            width: '100%', padding: '14px 16px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 10, color: '#fff', fontSize: 14,
                            outline: 'none', boxSizing: 'border-box',
                            animation: emailShake ? 'shakePay 0.4s' : 'none',
                        }}
                    />
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6, marginBottom: 14 }}>{pricingPage.paymentEmailHelp || '결제 완료 후 이 이메일로 올인원 라이선스 코드가 발송됩니다.'}</p>

                    <button
                        onClick={requestPayment}
                        disabled={!selected || paying || !sdkReady}
                        style={{
                            width: '100%', padding: 18, borderRadius: 14, border: 'none',
                            background: selected && sdkReady && !paying ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'rgba(255,255,255,0.08)',
                            color: selected && sdkReady && !paying ? '#000' : 'rgba(255,255,255,0.4)',
                            fontSize: 16, fontWeight: 800,
                            cursor: selected && sdkReady && !paying ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                    >
                        {paying && <span style={{ width: 16, height: 16, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spinPay 0.8s linear infinite' }} />}
                        <span>{paying ? '결제 중...' : chargeLabel}</span>
                    </button>
                    <p style={{ textAlign: 'center', color: '#c9a84c', fontSize: 13, marginTop: 10, lineHeight: 1.7 }}>
                        {(pricingPage.paymentNote || '구매 시 올인원 코드 1개가 발급되며, 이용 기간 안에서 네이버 자동화툴·LEWORD·Leaders Orbit을 함께 사용할 수 있습니다.\n무료 다운로드 체험은 Better Life Naver 기준이며, LEWORD·Orbit은 올인원 구매 후 함께 이용합니다.').split('\n').map((line, index, arr) => (
                            <Fragment key={`${line}-${index}`}>{line}{index < arr.length - 1 ? <br /> : null}</Fragment>
                        ))}
                    </p>
                    <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 8 }}>
                        결제 진행 시 <Link to="/terms" style={{ color: '#FFD700' }}>이용약관</Link> 및 <Link to="/privacy" style={{ color: '#FFD700' }}>개인정보처리방침</Link>에 동의하는 것으로 간주됩니다.
                    </p>

                    <details style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(20,48,77,0.15)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>❓ 결제 전 자주 묻는 질문</summary>
                        <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.65)' }}>
                            <p style={{ marginBottom: 10 }}><strong>Q. 결제 정보는 안전한가요?</strong><br />토스페이먼츠(Toss Payments) 공식 PG를 통해 처리됩니다. 카드 정보가 저희 서버에 저장되지 않으며, 토스 보안 인증을 거칩니다.</p>
                            <p style={{ marginBottom: 10 }}><strong>Q. 환불이 정말 가능한가요?</strong><br />라이선스 발급 후 7일 이내·서비스 미사용 시 전액 환불됩니다. 카카오톡 1:1 상담으로 즉시 신청 가능합니다.</p>
                            <p style={{ margin: 0 }}><strong>Q. 사용법이 어렵지 않나요?</strong><br />설치 후 키워드만 입력하면 AI가 자동으로 글·이미지·발행까지 처리합니다. 처음 5분 안내 영상 제공 + 카카오톡 무료 지원 포함.</p>
                        </div>
                    </details>
                </div>

                {/* Individual lifetime inquiry */}
                <div style={{ maxWidth: 920, margin: '28px auto 0', padding: '26px 24px', background: 'linear-gradient(135deg, rgba(124,58,237,0.10), rgba(18,18,26,0.78))', border: '1px solid rgba(167,139,250,0.28)', borderRadius: 18 }}>
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <span style={{ display: 'inline-flex', padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.42)', color: '#A78BFA', fontSize: 12, fontWeight: 900, marginBottom: 12 }}>LIFETIME ONLY</span>
                        <h3 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>개별 제품은 영구제만 별도 문의로 구매 가능합니다</h3>
                        <p style={{ color: 'rgba(255,255,255,0.62)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>기간제는 올인원 코드로 구매하고, 특정 제품만 영구제로 쓰고 싶을 때는 1:1 문의로 발급합니다.</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                        {[
                            ['Better Life Naver', '개별 영구제', '별도 문의'],
                            ['Leadernam Orbit', '개별 영구제', '별도 문의'],
                            ['LEWORD', '개별 영구제', '별도 문의'],
                        ].map(([name, type, price]) => (
                            <article key={name} style={{ padding: 18, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
                                <strong style={{ display: 'block', color: '#fff', fontSize: 16, marginBottom: 6 }}>{name}</strong>
                                <span style={{ display: 'block', color: '#A78BFA', fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{type}</span>
                                <b style={{ color: '#FFD700', fontSize: 22 }}>{price}</b>
                            </article>
                        ))}
                    </div>
                    <div style={{ textAlign: 'center', marginTop: 18 }}>
                        <a href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '12px 22px', borderRadius: 10, background: 'linear-gradient(135deg, #FEE500, #F5D100)', color: '#3C1E1E', fontSize: 14, fontWeight: 900, textDecoration: 'none' }}>개별 영구제 문의하기</a>
                    </div>
                </div>

                {/* Refund banners */}
                <div style={{ maxWidth: 720, margin: '14px auto 0', padding: '12px 20px', background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 10, fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>
                    💡 라이선스 코드 발급 후 7일 이내, 서비스 미사용 시 전액 환불 가능합니다.{' '}
                    <Link to="/refund" style={{ color: '#FFD700' }}>환불정책 자세히 보기 →</Link>
                </div>
                <div style={{ maxWidth: 720, margin: '12px auto 0', padding: '12px 20px', background: 'linear-gradient(135deg, rgba(68,215,182,0.08), rgba(68,215,182,0.02))', border: '1px solid rgba(68,215,182,0.3)', borderRadius: 10, fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>
                    🏦 카드 결제가 어려우신가요?{' '}
                    <Link to="/bank-order" style={{ color: '#44d7b6' }}>계좌이체로 결제하기 →</Link>
                </div>

                <style>{`
                    @keyframes shakePay{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
                    @keyframes spinPay{to{transform:rotate(360deg)}}
                `}</style>
            </section>
        </div>
    );
}

export default PricingPage;
