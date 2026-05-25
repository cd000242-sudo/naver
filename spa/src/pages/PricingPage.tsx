import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

/**
 * 요금제 — payment-page/pricing.html 마이그.
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
    period: string;
    monthly?: string;
    features: string[];
    badge?: { text: string; type: 'best' | 'lifetime' | 'trial' };
    free?: boolean;
}

const PLANS: Record<string, Plan[]> = {
    naver: [
        { id: 'free-naver', name: '무료 체험', desc: '부담 없이 시작', amount: 0, period: '무료', free: true, badge: { text: '🎁 FREE', type: 'trial' }, features: ['전체 기능 체험', 'AI 콘텐츠 생성', '매일 2회 발행 제한', '기간 제한 없음'] },
        { id: 'naver-monthly', name: '1개월', desc: '가볍게 시작하기', amount: 50000, amountCard: 55000, period: '/ 월 (공급가)', features: ['전체 기능 이용', 'AI 콘텐츠 자동 생성 (7종 AI)', '다계정 무제한 발행', '이메일 고객 지원'] },
        { id: 'naver-quarterly', name: '3개월', desc: '인기 있는 선택', amount: 120000, period: '/ 3개월', monthly: '월 40,000원', features: ['전체 기능 이용', 'AI 이미지·영상 생성', '쇼핑 커넥트 (제휴 마케팅)', '우선 고객 지원'] },
        { id: 'naver-yearly', name: '1년', desc: '가장 합리적인 선택', amount: 400000, period: '/ 년', monthly: '월 33,333원', badge: { text: '👑 BEST VALUE', type: 'best' }, features: ['전체 기능 이용', '스마트 스케줄링', '전용 커뮤니티 입장', '1:1 우선 지원'] },
    ],
    leword: [
        { id: 'leword-monthly', name: '1개월', desc: '키워드 분석 시작', amount: 30000, period: '/ 월', features: ['키워드 경쟁 분석', '블루오션 발굴', '트렌드 모니터링', '이메일 지원'] },
        { id: 'leword-quarterly', name: '3개월', desc: '인기 있는 선택', amount: 100000, period: '/ 3개월', monthly: '월 33,333원', features: ['전체 기능 이용', 'Leaders Pro 연동', '블루오션 키워드 자동 추천', '우선 고객 지원'] },
        { id: 'leword-yearly', name: '1년', desc: '가장 합리적인 선택', amount: 300000, period: '/ 년', monthly: '월 25,000원', badge: { text: '👑 BEST VALUE', type: 'best' }, features: ['전체 기능 이용', 'Leaders Pro 연동', '커뮤니티 입장', '1:1 우선 지원'] },
    ],
};

const TAB_LABELS: Record<string, string> = { naver: 'N · Leaders Pro 네이버', leword: 'L · Leword' };
const TAB_KEYS = ['naver', 'leword'] as const;
type TabKey = typeof TAB_KEYS[number];

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
    const tossRef = useRef<any | null>(null);
    const [sdkReady, setSdkReady] = useState(false);
    const paymentSectionRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = '요금제 — Leaders Pro';
        return () => { document.title = prev; };
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

    // 탭 전환 시 선택 초기화
    const onTab = (t: TabKey) => { setTab(t); setSelected(null); };

    const onSelect = (p: Plan) => {
        if (p.free) {
            // 무료 체험은 다운로드 페이지로
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
            const chargeAmount = selected.amountCard || selected.amount;
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
        const charge = selected.amountCard || selected.amount;
        const vatNote = selected.amountCard ? ' (VAT 포함)' : '';
        return `🎁 7일 무료 시작 — 이후 월 ${charge.toLocaleString()}원${vatNote}`;
    })();

    return (
        <div style={{ position: 'relative', zIndex: 1 }}>
            <section style={{ padding: '140px 20px 80px', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <span style={{ display: 'inline-block', padding: '6px 16px', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 50, color: '#FFD700', fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>PRICING</span>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, marginBottom: 12 }}>제품별 요금제</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>각 제품에 맞는 최적의 플랜을 선택하세요.</p>
                </div>

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
                        >{TAB_LABELS[k]}</button>
                    ))}
                </div>

                {/* Pricing grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
                    {PLANS[tab].map((p) => {
                        const isSelected = selected?.id === p.id;
                        const isFeatured = p.badge?.type === 'best';
                        const isTrial = p.free;
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
                                    <span style={{ fontSize: 28, fontWeight: 900, background: 'linear-gradient(135deg, #FFD700, #FFA500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                        {p.free ? '0' : p.amount.toLocaleString()}
                                    </span>
                                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginLeft: 4 }}>{p.free ? '원' : '원'}</span>
                                </div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                                    {p.period}
                                    {p.monthly && <span style={{ display: 'block', color: '#FFD700', marginTop: 4 }}>({p.monthly})</span>}
                                </div>
                                {p.amountCard && (
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6, lineHeight: 1.6 }}>
                                        카드 <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{p.amountCard.toLocaleString()}원</strong> <span style={{ opacity: 0.7 }}>(VAT 10%)</span><br />
                                        계좌이체 <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{p.amount.toLocaleString()}원</strong>
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
                    <label style={{ display: 'block', marginBottom: 8, color: '#FFD700', fontSize: 14, fontWeight: 700 }}>📧 라이선스를 받을 이메일</label>
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
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6, marginBottom: 14 }}>결제 완료 후 이 이메일로 라이선스 코드가 발송됩니다.</p>

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
                        🎁 <strong>7일간 무료</strong>로 사용해보세요. 7일 후 선택한 플랜의 정기구독이 시작되며,<br />
                        <strong>해지하지 않으면 자동결제</strong>됩니다. 무료 기간 내 해지 시 요금이 청구되지 않습니다.
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
