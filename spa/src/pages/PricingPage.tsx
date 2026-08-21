import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ProofShowcase from '../components/ProofShowcase';
import ProductStore from '../components/store/ProductStore';
import { getScheduledAmount, isNormalPricingActive, PRICING_SWITCH_AT_MS } from '../lib/pricingSchedule';
import { fetchSiteContent, type SiteContent } from '../lib/siteOps';
import { gradient, onGold, whiteA } from '../styles/tokens';

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
            eventLabel: '10월 1일부터 정상가 100,000원',
            period: '/ 월 (공급가)',
            features: ['Better Life Naver 이용', 'LEWORD 키워드 분석 이용', 'Leadernam Orbit 이용', '이메일 고객 지원'],
        },
        {
            id: 'all-in-one-quarterly',
            name: '올인원 3개월',
            desc: '블로그 자동화 흐름을 안정적으로 운영',
            amount: 120000,
            futureAmount: 240000,
            eventLabel: '10월 1일부터 정상가 240,000원',
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
            eventLabel: '10월 1일부터 정상가 800,000원',
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
            eventLabel: '10월 1일부터 정상가 3,300,000원',
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
    const [paying, setPaying] = useState(false);
    const [pricingNow, setPricingNow] = useState(() => Date.now());
    const [siteContent, setSiteContent] = useState<SiteContent | null>(null);
    const tossRef = useRef<any | null>(null);
    const [sdkReady, setSdkReady] = useState(false);
    // 체험하기 클릭 시 비밀번호를 바로 보여주는 모달. 이메일 답장을 못 받아 비번을
    // 모르는 이탈을 막는다 — 모든 다운로드 비번은 1645 로 동일하다.
    const [trialPwOpen, setTrialPwOpen] = useState(false);

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
            // 무료 체험: 비밀번호를 모달로 바로 안내한다(이메일 답장 대기로 인한 이탈 방지).
            setTrialPwOpen(true);
            return;
        }
        // 결제는 상점 결제창에서 끝난다 — 예전처럼 아래 구역으로 데려갈 곳이 없다.
        setSelected(p);
    };

    /*
     * 이메일은 인자로도 받는다. 상점 창(ProductStore)이 담기·이메일·수단을 한
     * 자리에서 받게 되면서, 아래 결제 구역까지 내려오지 않고 곧장 결제창을
     * 띄우기 때문이다(사장님 지적 2026-08-21). 인자가 없으면 예전처럼
     * 아래 구역의 입력값을 쓴다 — 두 길이 같은 함수를 공유한다.
     */
    const requestPayment = async (emailArg?: string) => {
        if (!selected || !tossRef.current) return;
        const e = (emailArg || email).trim();
        if (!e || !e.includes('@')) {
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
        ? (pricingPage.titleNormal || '10월 1일부터 가격이 단계적으로 조정 중입니다')
        : (pricingPage.title || '지금 이벤트가로 이용하고, 10월 1일부터 가격이 점진적으로 상승합니다');
    const pricingEventTitle = normalPricingActive
        ? (pricingPage.eventTitleNormal || '가격이 단계적으로 조정 중입니다.')
        : (pricingPage.eventTitle || '현재 가격은 7월 31일까지 이벤트가입니다.');
    const pricingEventDesc = normalPricingActive
        ? (pricingPage.eventDescNormal || '2026년 10월 1일부터 가격이 점진적으로 상승하고 있습니다.')
        : (pricingPage.eventDesc || '2026년 10월 1일부터 가격이 점진적으로 상승합니다.');
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
                    {pricingPage.eventLine || '10월 1일부터 단계별 인상 예정 · 1개월 100,000원 · 3개월 240,000원 · 1년 800,000원 · 영구제 3,300,000원'}
                </div>
            </div>
        </div>
    );

    return (
        <div style={{
            position: 'relative',
            zIndex: 1,
        }}>
        {trialPwOpen && (
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="trial-pw-title"
                onClick={() => setTrialPwOpen(false)}
                style={{
                    position: 'fixed', inset: 0, zIndex: 2000,
                    background: 'rgba(3,6,12,0.72)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                }}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        width: '100%', maxWidth: 420, borderRadius: 20, padding: '30px 26px 26px',
                        background: 'linear-gradient(180deg, #141821, #0c0f16)',
                        border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 30px 90px rgba(0,0,0,0.5)',
                        textAlign: 'center', position: 'relative',
                    }}
                >
                    <button
                        type="button" aria-label="닫기" onClick={() => setTrialPwOpen(false)}
                        style={{
                            position: 'absolute', top: 14, right: 16, background: 'none', border: 'none',
                            color: 'rgba(255,255,255,0.55)', fontSize: 22, cursor: 'pointer', lineHeight: 1,
                        }}
                    >×</button>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#44d7b6', letterSpacing: '0.06em', marginBottom: 6 }}>무료 체험 다운로드 비밀번호</div>
                    <h3 id="trial-pw-title" style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.82)' }}>아래 비밀번호를 입력하면 바로 받으실 수 있습니다</h3>
                    <div style={{
                        fontSize: 64, fontWeight: 900, letterSpacing: '0.12em', lineHeight: 1,
                        color: '#FFD700', textShadow: '0 4px 24px rgba(255,215,0,0.35)', margin: '4px 0 10px',
                    }}>1645</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 22 }}>모든 비밀번호 동일합니다.</div>
                    <button
                        type="button"
                        onClick={() => { window.location.href = '/download'; }}
                        style={{
                            width: '100%', padding: '14px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
                            background: 'linear-gradient(135deg, #FF6B00, #FF9500)', color: '#fff',
                            fontSize: 16, fontWeight: 800,
                        }}
                    >🚀 다운로드 페이지로 이동</button>
                    <p style={{ margin: '14px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                        이메일 답장을 기다리지 않으셔도 됩니다. 위 비밀번호를 그대로 입력하세요.
                    </p>
                </div>
            </div>
        )}
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
            <section className="pricing-page-shell" style={{ padding: '140px 20px 80px', maxWidth: 1320, margin: '0 auto' }}>

                {/*
                  * PRICING 인트로는 뺐다(사장님 2026-08-20 "가격표에 다 보이니까").
                  * 이벤트가·10/1 전환은 상점의 D-day 띠와 취소선이 이미 말한다.
                  * 같은 말을 두 번 하면 화면만 길어진다.
                  */}

                {/*
                  * 제품 탭 알약("ALL · Leaders Pro 올인원")은 뺐다(사장님 2026-08-20).
                  * 탭이 하나뿐이라 고를 것이 없는데 버튼처럼 보였다.
                  */}

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

                    @media (max-width: 640px) {
                        .pricing-page-shell {
                            padding: 104px 12px 54px !important;
                        }

                        .purchase-proof-showcase {
                            gap: 14px;
                            margin-bottom: 24px;
                        }

                        .purchase-video-side {
                            padding: 14px;
                            border-radius: 12px;
                        }

                        .purchase-section-eyebrow {
                            min-height: 26px;
                            font-size: 11px;
                        }

                        .purchase-video-side h3 {
                            font-size: 24px;
                        }

                        .purchase-video-side > p {
                            font-size: 13px;
                            line-height: 1.65;
                        }

                        .purchase-main-video {
                            padding: 10px;
                            gap: 12px;
                        }

                        .purchase-main-video strong {
                            font-size: 16px;
                        }

                        .pricing-product-tabs {
                            display: grid !important;
                            grid-template-columns: 1fr 1fr;
                            gap: 8px !important;
                            margin-bottom: 24px !important;
                        }

                        .pricing-product-tabs button {
                            width: 100%;
                            min-height: 44px;
                            justify-content: center;
                            padding: 10px 12px !important;
                            font-size: 13px !important;
                        }

                        .pricing-plan-grid {
                            grid-template-columns: 1fr !important;
                            gap: 14px;
                        }
                    }

                    @media (max-width: 420px) {
                        .pricing-product-tabs {
                            grid-template-columns: 1fr;
                        }
                    }

                    /* 키보드 포커스 링 — 포커스 가능한 요금제 카드가 시각적으로 드러나야 접근성 완성 */
                    .pricing-plan-card:focus-visible {
                        outline: 2px solid #FFD700;
                        outline-offset: 3px;
                    }
                `}</style>

                {/* Pricing grid */}
                {/*
                  * 제품 진열대 — 예전 카드 격자를 갈아엎었다(사장님 2026-08-20
                  * "너무 정신사나워"). 제품은 productCatalog 가 쥐고, 여기서는
                  * 담은 결과만 받아 아래 결제 구역에 그대로 넘긴다 —
                  * 결제 코드는 손대지 않는다.
                  */}
                {/*
                  * 상점은 자기 바닥을 직접 칠한다. 이 페이지 배경이 밝은 해변
                  * 사진이라(계절 테마) 어두운 잉크가 그대로 얹히면 안 보인다
                  * (사장님 실측 2026-08-20 "배경이 밝은 색상인 걸 감안해서").
                  */}
                <div style={{ background: 'rgba(8, 10, 16, 0.94)', backdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22, padding: 'clamp(20px, 4vw, 40px)', marginBottom: 28 }}>
                <ProductStore
                    /*
                     * 증거를 진열대 **위**에 둔다(사장님 지시 2026-08-21 "먼저
                     * 보이게 하면 좋지 않니 · 한눈에 잘 보이면 좋겠어").
                     * 예전에는 판 바깥 저 아래에 있어서, 값을 본 사람이 증거까지
                     * 내려오지 않았다. 같은 판 안에 있어야 한 눈에 든다.
                     */
                    proof={<ProofShowcase compact variant="carousel" className="purchase-proof-inline" />}
                    /*
                     * 신뢰 지표는 값 **바로 옆**에 선다(사장님 지시 2026-08-21).
                     * 판 아래 따로 떠 있을 때는 값을 보고 결정하는 순간에 눈에
                     * 안 들어왔다 — 별점·사용자 수·환불 보장은 그 순간 필요한 재료다.
                     */
                    trust={(
                        <div className="st-trust">
                            <div><b>⭐ 4.9 / 5</b><span>실사용 후기 기반</span></div>
                            <div><b>2,847명</b><span>현재 활성 사용자</span></div>
                            <div><b>🛡️ 7일 환불</b><span>미사용 시 전액 환불</span></div>
                        </div>
                    )}
                    /*
                     * 값을 본 뒤 남는 물음 — FAQ·환불·계좌이체. 예전에는 이메일
                     * 입력칸이 딸린 별도 결제 구역에 얹혀 있었는데, 그 구역 자체가
                     * 상점과 겹쳐 사라졌다(결제는 이제 상점 결제창에서 끝난다).
                     * 남길 값어치가 있는 것만 판 안으로 옮겼다.
                     */
                    notes={(
                        <>
                            <details className="st-faq">
                                <summary>결제 전 자주 묻는 질문</summary>
                                <div>
                                    <p><b>결제 정보는 안전한가요?</b><br />토스페이먼츠 공식 PG 로 처리됩니다. 카드 정보는 저희 서버에 저장되지 않습니다.</p>
                                    <p><b>환불이 정말 가능한가요?</b><br />라이선스 발급 후 7일 이내·서비스 미사용이면 전액 환불됩니다. 카카오톡 1:1 상담으로 바로 신청하실 수 있습니다.</p>
                                    <p><b>사용법이 어렵지 않나요?</b><br />설치하고 키워드만 넣으면 글·이미지·발행까지 자동입니다. 처음 5분 안내 영상과 카카오톡 지원이 함께 갑니다.</p>
                                </div>
                            </details>
                            <p className="st-note-line">
                                라이선스 코드 발급 후 7일 이내, 서비스 미사용 시 전액 환불됩니다.{' '}
                                <Link to="/refund">환불정책 보기 →</Link>
                            </p>
                            <p className="st-note-line">
                                결제 진행 시 <Link to="/terms">이용약관</Link>과 <Link to="/privacy">개인정보처리방침</Link>에 동의하는 것으로 봅니다.
                            </p>
                        </>
                    )}
                    onPick={(pick) => setSelected(pick ? {
                        id: pick.id,
                        name: pick.name,
                        desc: pick.desc,
                        amount: pick.amount,
                        // 카드 결제 교리: 카드는 VAT 10% 포함 금액을 청구한다.
                        // 이게 없으면 담은 주문의 카드 청구가 부가세 없이 나갔다.
                        amountCard: Math.round(pick.amount * 1.1),
                        period: '',
                        features: [],
                    } : null)}
                    onCardPay={(mail) => {
                        // 창에서 받은 이메일을 아래 구역에도 채워 둔다 — 되돌아왔을 때 다시 안 적게.
                        setEmail(mail);
                        void requestPayment(mail);
                    }}
                />
                </div>


                <style>{`
                    @keyframes shakePay{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
                    @keyframes spinPay{to{transform:rotate(360deg)}}
                `}</style>
            </section>
        </div>
        </div>
    );
}

export default PricingPage;
