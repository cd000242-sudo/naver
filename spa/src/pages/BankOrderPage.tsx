import { useEffect, useRef, useState } from 'react';
import SplitWords from '../components/motion/SplitWords';
import { useSearchParams } from 'react-router-dom';
import { getScheduledAmount, isNormalPricingActive, PRICING_SWITCH_AT_MS } from '../lib/pricingSchedule';
import { applyStoreOverrides, isTaxIncludedPrice, normalPriceOf, TERMS, won, type Product, type TermId } from '../lib/productCatalog';
import { fetchSiteContent } from '../lib/siteOps';
import { purchaseGuide } from '../lib/purchaseGuide.mjs';
import PurchaseNextSteps from '../components/store/PurchaseNextSteps';
import { ShellIcon } from '../components/ShellIcons';
import { light, lightRadius, motion, type } from '../styles/tokens';

/**
 * 계좌이체 결제 — payment-page/bank-order.html 마이그.
 * GAS bank-order/check-order 흐름 + 10초 폴링 그대로 유지.
 * orderId URL param 으로 기존 주문 복원.
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

interface ProductOption { id: string; name: string; price: number; futurePrice?: number; period: string; normalPeriod?: string; }

const ALL_PRODUCTS: Record<string, ProductOption[]> = {
    naver: [
        // [2026-08-21] 하루 환산 첫 자리(사장님 지시) — 실청구액은 price 로 그대로 노출.
        // [2026-09-06] 즉시 조정(1년 50만·영구 200만) + 10월 1일 자동 2배 폐기 — 인상 예고는 금액 없이.
        { id: 'all-in-one-monthly', name: 'All in one 1개월', price: 50000, period: '하루 1,667원꼴' },
        { id: 'all-in-one-quarterly', name: 'All in one 3개월', price: 150000, period: '하루 1,667원꼴 (월 50,000원)' },
        { id: 'all-in-one-yearly', name: 'All in one 1년', price: 500000, period: '하루 1,370원꼴 (월 41,667원)' },
        { id: 'all-in-one-lifetime', name: 'All in one 영구제', price: 2000000, period: '영구 이용' },
    ],
};

const PRODUCT_LABELS: Record<string, string> = {
    naver: 'Leaders Pro All in one',
};

type Status = 'pending' | 'approved' | 'rejected';

interface ResultInfo { orderId: string; amount?: number; product?: string; status: Status; code?: string; }

const fmt = (n: number) => n.toLocaleString();
const productPrice = (p: ProductOption, nowMs: number = Date.now()) => getScheduledAmount(p.price, p.futurePrice, nowMs);
const productPeriod = (p: ProductOption, nowMs: number = Date.now()) => isNormalPricingActive(nowMs) && p.normalPeriod ? p.normalPeriod : p.period;

/*
 * 결제 흐름은 구글의 일시 HTML 응답(한도·점검)에 제일 민감하다 — 주문 접수 화면에서
 * "Unexpected token '<'" 가 뜨면 사용자는 결제가 됐는지조차 모른다.
 * JSON 이 아니면 사람 말로 던진다. 호출부의 catch 가 그대로 화면에 알린다.
 */
async function parseGasJson(res: Response) {
    const raw = await res.text();
    try {
        return JSON.parse(raw);
    } catch {
        throw new Error('서버가 잠시 붐빕니다. 몇 초 뒤 다시 시도해 주세요.');
    }
}

async function fetchOrderStatus(orderId: string) {
    const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'check-order', orderId }),
    });
    return parseGasJson(res);
}

/**
 * 상점에서 담아온 주문(?items=naver,leword&term=yearly)을 읽는다.
 *
 * 상점의 [결제하기]가 이 주소로 보내는데, 예전 이 화면은 올인원 기간권만
 * 알아서 담아온 것을 통째로 무시했다(사장님 실측 2026-08-20). 값은 카탈로그
 * 실측이다. 자동 인상은 껐다(배수 1) — 배수를 되살리면 여기서도 전환된다.
 */
function readCartOrder(params: URLSearchParams, catalog: Product[]): { label: string; names: string[]; amount: number; monthly: boolean; taxNote: string } | null {
    const ids = (params.get('items') || '').split(',').map((id) => id.trim()).filter(Boolean);
    const term = params.get('term') as TermId | null;
    if (ids.length === 0 || !term || !TERMS.some((item) => item.id === term)) return null;
    const picked = ids
        .map((id) => catalog.find((product) => product.id === id && product.status === 'on'))
        .filter((product): product is NonNullable<typeof product> => Boolean(product) && Boolean(product!.prices[term]));
    if (picked.length === 0) return null;
    const normal = isNormalPricingActive();
    const amount = picked.reduce((sum, product) => {
        const event = product.prices[term] || 0;
        return sum + (normal ? normalPriceOf(event) : event);
    }, 0);
    const termLabel = TERMS.find((item) => item.id === term)?.label || '';
    return {
        label: `${picked.map((product) => product.name).join(' · ')} ${termLabel}`,
        names: picked.map((product) => `${product.name} ${termLabel}`),
        amount,
        monthly: term === 'monthly',
        taxNote: picked.every((product) => isTaxIncludedPrice(product, term)) ? '부가세 포함' : picked.some((product) => isTaxIncludedPrice(product, term)) ? 'LEWORD 월 구독 부가세 포함 · 나머지 별도' : '부가세 별도',
    };
}

function BankOrderPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [tab, setTab] = useState<string>('naver');
    const [selected, setSelected] = useState<ProductOption | null>(null);
    const [name, setName] = useState('');
    /*
     * 상점 결제창에서 이미 적은 이메일을 이어받는다(?email=). 같은 주소를
     * 두 번 적게 하면 흐름이 끊긴다 — 로그인이 없어 이 주소가 유일한 통로다.
     */
    const [email, setEmail] = useState(() => searchParams.get('email') || '');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<ResultInfo | null>(null);
    const [pricingNow, setPricingNow] = useState(() => Date.now());
    const [copyLabel, setCopyLabel] = useState('복사');
    const [licCopyLabel, setLicCopyLabel] = useState('복사');
    const [shake, setShake] = useState<'name' | 'email' | null>(null);
    const pollingRef = useRef<number | null>(null);
    /*
     * 상점에서 담아온 주문. 값은 상점과 **같은 저장값**(어드민 덮어쓰기)으로
     * 계산해야 한다 — 아니면 상점에서 본 값과 결제 값이 어긋난다.
     */
    const [catalog, setCatalog] = useState<Product[]>(() => applyStoreOverrides(null));
    useEffect(() => {
        let cancelled = false;
        fetchSiteContent().then((content) => {
            if (!cancelled && content?.store?.products) setCatalog(applyStoreOverrides(content.store.products));
        }).catch(() => { /* 기본값 그대로 */ });
        return () => { cancelled = true; };
    }, []);
    const cartOrder = readCartOrder(searchParams, catalog);

    useEffect(() => {
        if (!cartOrder) return;
        // 아래 submitOrder 가 쓰는 모양 그대로 만든다 — futurePrice 를 안 주면
        // productPrice 가 이 값을 그대로 돌려준다(전환 판단은 이미 끝났다).
        // 덮어쓰기가 늦게 도착해 값이 바뀌면 따라간다(제출 전까지만).
        setSelected({ id: 'cart', name: cartOrder.label, price: cartOrder.amount, period: '' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cartOrder?.label, cartOrder?.amount]);

    useEffect(() => {
        const prev = document.title;
        document.title = '계좌이체 결제 — Leaders Pro';
        return () => {
            document.title = prev;
            if (pollingRef.current) window.clearInterval(pollingRef.current);
        };
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

    // 기존 orderId 복원
    useEffect(() => {
        const existing = searchParams.get('orderId');
        if (!existing) return;
        (async () => {
            try {
                const data = await fetchOrderStatus(existing);
                if (!data.ok) return;
                setResult({
                    orderId: existing,
                    amount: data.amount,
                    product: data.product,
                    status: data.status,
                    code: data.code,
                });
                if (data.status === 'pending') startPolling(existing);
            } catch {
                /* ignore */
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startPolling = (orderId: string) => {
        if (pollingRef.current) window.clearInterval(pollingRef.current);
        const tick = async () => {
            try {
                const data = await fetchOrderStatus(orderId);
                if (!data.ok) return;
                setResult((prev) => prev ? { ...prev, status: data.status, code: data.code } : prev);
                if (data.status === 'approved' || data.status === 'rejected') {
                    if (pollingRef.current) {
                        window.clearInterval(pollingRef.current);
                        pollingRef.current = null;
                    }
                }
            } catch {
                /* network error, retry next tick */
            }
        };
        tick();
        pollingRef.current = window.setInterval(tick, 10000);
    };

    const onSelectTab = (t: string) => { setTab(t); setSelected(null); };
    const onSelectProduct = (p: ProductOption) => setSelected(p);

    const onCopyAccount = () => {
        navigator.clipboard.writeText('1000-1770-4358').then(() => {
            setCopyLabel('복사됨');
            window.setTimeout(() => setCopyLabel('복사'), 2000);
        });
    };

    const onCopyLicense = (code: string) => {
        navigator.clipboard.writeText(code).then(() => {
            setLicCopyLabel('복사됨');
            window.setTimeout(() => setLicCopyLabel('복사'), 1500);
        });
    };

    const submitOrder = async () => {
        if (!selected) return;
        const n = name.trim();
        const e = email.trim();
        if (!n || n.length < 2) { setShake('name'); window.setTimeout(() => setShake(null), 500); return; }
        if (!e || !e.includes('@')) { setShake('email'); window.setTimeout(() => setShake(null), 500); return; }

        setSubmitting(true);
        const orderAmount = productPrice(selected);
        const productLabel = cartOrder
            ? selected.name
            /* 제품 이름을 'All in one' 으로 바꿨다 — 옛 이름으로 검사하면 안 걸린다. */
            : selected.name.startsWith('All in one')
                ? `Leaders Pro ${selected.name}`
                : `${PRODUCT_LABELS[tab]} ${selected.name}`;
        try {
            const res = await fetch(GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'bank-order', name: n, email: e, product: productLabel, amount: orderAmount }),
            });
            const data = await parseGasJson(res);
            if (data.ok) {
                setSearchParams({ orderId: data.orderId }, { replace: true });
                setResult({ orderId: data.orderId, amount: orderAmount, product: productLabel, status: 'pending' });
                startPolling(data.orderId);
            } else {
                alert(data.error || '주문 접수에 실패했습니다.');
                setSubmitting(false);
            }
        } catch (err: any) {
            alert('서버 연결 오류: ' + (err?.message || ''));
            setSubmitting(false);
        }
    };

    // ─── result 화면 ───
    if (result) return <ResultView info={result} copyLicense={onCopyLicense} licCopyLabel={licCopyLabel} />;

    // ─── 주문 화면 ───
    const products = ALL_PRODUCTS[tab];

    return (
        <div data-order-form style={{ ...pageWrap, maxWidth: 720 }}>
            <style>{formCss}</style>
            <div style={panel}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <h1 style={pageTitle}><SplitWords text="계좌이체 결제" /></h1>
                    <p style={{ color: light.textSecondary, fontSize: type.small }}>{cartOrder ? '주문 확인 → 정보 입력 → 입금 → 라이선스 발급' : 'All in one 기간권 선택 → 정보 입력 → 입금 → 라이선스 발급'}</p>
                </div>

                {/* Step 1 — 상점에서 담아왔으면 다시 고르게 하지 않는다. 주문 내역만 보여 준다. */}
                {cartOrder ? (
                    <Step n={1} label="주문 내역">
                        <div style={{ ...softBox, padding: '16px 20px' }}>
                            {cartOrder.names.map((item) => (
                                <div key={item} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: type.small, color: light.text }}>
                                    <span>{item}</span>
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${light.line}` }}>
                                <span style={{ fontSize: type.meta, color: light.textSecondary }}>합계 ({cartOrder.taxNote})</span>
                                <strong style={{ fontSize: type.h3, fontWeight: 600, color: light.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{won(cartOrder.amount)}원</strong>
                            </div>
                        </div>
                        {cartOrder.monthly && <p style={{ margin: '12px 0 0', padding: '12px 16px', borderRadius: lightRadius.control, background: light.raised, border: `1px solid ${light.line}`, color: light.textSecondary, fontSize: type.small, lineHeight: 1.7 }}>월 이용권 · 30일 이용 후 수동 갱신<br />계좌이체는 자동출금되지 않습니다. 계속 이용하려면 매 회차 직접 주문·입금해 주세요. 입금 확인 후 새 이용권을 발급합니다.</p>}
                        <p style={{ margin: '12px 0 0', fontSize: type.small, color: light.textSecondary }}>
                            제품을 바꾸시려면 <a href="/pricing" style={inkLink}>가격표로 돌아가기 →</a>
                        </p>
                    </Step>
                ) : (
                <Step n={1} label="All in one 기간권 선택">
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        {Object.keys(PRODUCT_LABELS).filter((k) => k === 'naver').map((k) => (
                            <button
                                key={k}
                                onClick={() => onSelectTab(k)}
                                style={{
                                    minHeight: 44, padding: '0 20px', borderRadius: lightRadius.control,
                                    background: tab === k ? light.accentSoft : light.surface,
                                    color: tab === k ? light.text : light.textSecondary,
                                    border: `1px solid ${tab === k ? light.accent : light.line}`,
                                    fontWeight: tab === k ? 600 : 500,
                                    cursor: 'pointer', fontSize: type.small,
                                }}
                            >{PRODUCT_LABELS[k]}</button>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                        {products.map((p) => {
                            const sel = selected?.id === p.id;
                            return (
                                <div
                                    key={p.id}
                                    onClick={() => onSelectProduct(p)}
                                    style={{
                                        padding: 16, borderRadius: lightRadius.card, cursor: 'pointer',
                                        background: sel ? light.accentSoft : light.surface,
                                        border: `1px solid ${sel ? light.accent : light.line}`,
                                        textAlign: 'center', transition: quietTransition,
                                    }}
                                >
                                    <div style={{ fontSize: type.small, color: light.textSecondary, marginBottom: 8 }}>{p.name}</div>
                                    <div style={{ fontSize: type.lead, fontWeight: 600, color: light.text, fontVariantNumeric: 'tabular-nums' }}>{fmt(productPrice(p, pricingNow))}원</div>
                                    <div style={{ fontSize: type.meta, color: light.textMuted, marginTop: 4 }}>{productPeriod(p, pricingNow)}</div>
                                </div>
                            );
                        })}
                    </div>
                </Step>
                )}

                {/* Step 2 */}
                <Step n={2} label="정보 입력">
                    <div style={{ marginBottom: 16 }}>
                        <label htmlFor="bank-order-name" style={fieldLabel}>입금자명 (실명)</label>
                        <input
                            id="bank-order-name"
                            type="text"
                            value={name}
                            maxLength={20}
                            placeholder="홍길동"
                            onChange={(e) => setName(e.target.value)}
                            style={{ ...inputBase, ...(shake === 'name' ? inputShake : {}) }}
                        />
                    </div>
                    <div>
                        <label htmlFor="bank-order-email" style={fieldLabel}>이메일 (라이선스 코드 수신)</label>
                        <input
                            id="bank-order-email"
                            type="email"
                            value={email}
                            placeholder="example@email.com"
                            onChange={(e) => setEmail(e.target.value)}
                            style={{ ...inputBase, ...(shake === 'email' ? inputShake : {}) }}
                        />
                    </div>
                </Step>

                {/* Step 3 */}
                <Step n={3} label="입금 계좌 안내">
                    <div style={{ ...softBox, padding: 20 }}>
                        <h3 style={boxTitle}>아래 계좌로 입금해주세요</h3>
                        <BankRow label="은행" value="토스뱅크" />
                        <BankRow label="계좌번호" value={<>1000-1770-4358 <span onClick={onCopyAccount} style={copyChip}>{copyLabel}</span></>} />
                        <BankRow label="예금주" value="박성현" />
                        <BankRow label="입금 금액" value={selected ? <strong style={{ color: light.text, fontWeight: 600 }}>{fmt(productPrice(selected, pricingNow))}원</strong> : '기간권을 선택해주세요'} />
                    </div>
                </Step>

                <button
                    onClick={submitOrder}
                    disabled={!selected || submitting}
                    style={{
                        width: '100%', minHeight: 56, padding: '12px 16px', marginTop: 8,
                        background: selected && !submitting ? light.accent : light.raised,
                        color: selected && !submitting ? light.onAccent : light.textMuted,
                        border: `1px solid ${selected && !submitting ? light.accent : light.line}`,
                        borderRadius: lightRadius.control,
                        fontSize: type.body, fontWeight: 600,
                        cursor: selected && !submitting ? 'pointer' : 'not-allowed',
                    }}
                >
                    {submitting ? '접수 중...' : selected ? `${fmt(productPrice(selected, pricingNow))}원 주문 접수하기` : '기간권을 선택해주세요'}
                </button>

                <div style={{ marginTop: 16, textAlign: 'center', fontSize: type.meta, color: light.textMuted, lineHeight: 1.7 }}>
                    주문 접수 후 입금이 확인되면 라이선스 코드가 이메일로 발송됩니다.<br />
                    결제 진행 시 <a href="/terms" style={inkLink}>이용약관</a> 및 <a href="/privacy" style={inkLink}>개인정보처리방침</a>에 동의하는 것으로 간주됩니다.
                </div>
            </div>
        </div>
    );
}

// Light-theme styles shared by the order form and the result view. Plain objects, no CSS classes.
const pageWrap: React.CSSProperties = { margin: '0 auto', padding: '144px 20px 80px', position: 'relative', zIndex: 1 };
const panel: React.CSSProperties = { background: light.surface, border: `1px solid ${light.line}`, borderRadius: lightRadius.panel, padding: 'clamp(24px, 4vw, 40px)', boxShadow: light.shadowSm, color: light.text };
const pageTitle: React.CSSProperties = { fontSize: type.h2, fontWeight: 700, lineHeight: 1.25, marginBottom: 8, color: light.text };
const softBox: React.CSSProperties = { background: light.raised, border: `1px solid ${light.line}`, borderRadius: lightRadius.card };
const boxTitle: React.CSSProperties = { marginBottom: 8, fontSize: type.body, fontWeight: 600, color: light.text };
const inkLink: React.CSSProperties = { color: light.accentInk, textDecoration: 'underline', textUnderlineOffset: 3 };
const fieldLabel: React.CSSProperties = { display: 'block', marginBottom: 8, color: light.text, fontSize: type.small, fontWeight: 500 };
// Border longhands on purpose: the error state swaps borderColor only.
const inputBase: React.CSSProperties = { width: '100%', minHeight: 48, padding: '0 16px', background: light.surface, borderWidth: 1, borderStyle: 'solid', borderColor: light.lineStrong, borderRadius: lightRadius.control, color: light.text, fontSize: type.body, fontFamily: 'inherit' };
const inputShake: React.CSSProperties = { animation: 'shake 0.4s', borderColor: light.negative };
const copyChip: React.CSSProperties = { display: 'inline-block', marginLeft: 8, padding: '4px 12px', background: light.surface, border: `1px solid ${light.lineStrong}`, borderRadius: lightRadius.control, color: light.text, cursor: 'pointer', fontSize: type.meta, fontWeight: 500 };
const quietTransition = `background-color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease}`;
// Focus ring and placeholder colour cannot be written inline, so they live in one scoped rule set.
const formCss = `@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
[data-order-form] input::placeholder{color:${light.textMuted}}
[data-order-form] :focus-visible{outline:2px solid ${light.text};outline-offset:2px}`;

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
    return (
        <div data-rv style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', background: light.raised, border: `1px solid ${light.lineStrong}`, color: light.text, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: type.small, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
                <h2 style={{ fontSize: type.lead, fontWeight: 600, color: light.text }}>{label}</h2>
            </div>
            {children}
        </div>
    );
}

function BankRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${light.line}`, fontSize: type.small }}>
            <span style={{ color: light.textSecondary, flexShrink: 0 }}>{label}</span>
            <span style={{ color: light.text, fontWeight: 500, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value}</span>
        </div>
    );
}

/** Status mark for the result view: a check for received/issued, a cross for rejected. */
function StatusMark({ rejected }: { rejected: boolean }) {
    return (
        <div aria-hidden="true" style={{ width: 48, height: 48, margin: '0 auto 16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rejected ? light.negativeSoft : light.positiveSoft, color: rejected ? light.negative : light.positive }}>
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                {rejected ? <path d="M7 7l10 10M17 7 7 17" /> : <path d="m6 12.5 4 4 8-9" />}
            </svg>
        </div>
    );
}

function ResultView({ info, copyLicense, licCopyLabel }: { info: ResultInfo; copyLicense: (code: string) => void; licCopyLabel: string }) {
    const { status, code, orderId, amount } = info;

    return (
        <div data-order-form style={{ ...pageWrap, maxWidth: 600 }}>
            <style>{formCss}</style>
            <div style={{ ...panel, textAlign: 'center' }}>
                <StatusMark rejected={status === 'rejected'} />
                <h1 style={{ fontSize: type.h3, fontWeight: 700, lineHeight: 1.35, marginBottom: 12, color: light.text }}>
                    {status === 'approved' && '라이선스가 발급되었습니다!'}
                    {status === 'rejected' && '주문이 거절되었습니다'}
                    {status === 'pending' && '주문이 접수되었습니다!'}
                </h1>
                <div style={{ color: light.textSecondary, fontSize: type.body, lineHeight: 1.7 }}>
                    {status === 'approved' && <>아래 All in one 라이선스 코드를 사용해주세요.<br />이메일로도 발송되었습니다.</>}
                    {status === 'rejected' && '문의 사항이 있으시면 아래 연락처로 연락주세요.'}
                    {status === 'pending' && <>아래 계좌로 입금해주세요.<br />입금 확인 후 <strong>라이선스 코드</strong>가 이메일로 발송됩니다.<br /><span style={{ display: 'inline-block', marginTop: 8, color: light.textMuted, fontSize: type.meta }}>이 페이지는 자동으로 상태가 갱신됩니다.</span></>}
                </div>
                <div style={{ marginTop: 16, color: light.textSecondary, fontSize: type.small }}>주문번호: <strong style={{ color: light.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{orderId}</strong></div>

                {status === 'pending' && (
                    <div style={{ ...softBox, padding: 20, marginTop: 20, textAlign: 'left' }}>
                        <h2 style={boxTitle}>입금 계좌</h2>
                        <BankRow label="은행" value="토스뱅크" />
                        <BankRow label="계좌번호" value="1000-1770-4358" />
                        <BankRow label="예금주" value="박성현" />
                        {amount && <BankRow label="입금 금액" value={`${fmt(amount)}원`} />}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0 0' }}>
                            <span style={{ color: light.textSecondary, fontSize: type.small }}>상태</span>
                            <span style={{ color: light.accentInk, fontSize: type.small, fontWeight: 600 }}>입금 확인 대기 중</span>
                        </div>
                        {/*
                          * 입금 확인은 사람이 한다 — 관리자에게 메일이 가고, 확인을 누르면
                          * 이 화면에 코드가 뜬다. 그 사이가 비어 있으면 "입금했는데 왜
                          * 안 되지" 가 되므로(사장님 2026-08-20), 기다리지 않아도 되는
                          * 길(1:1 오픈채팅)을 바로 준다. 주소는 우하단 문의 버튼과 같은 방이다.
                          */}
                        <div style={{ marginTop: 16, padding: '12px 16px', background: light.surface, border: `1px solid ${light.line}`, borderRadius: lightRadius.control, fontSize: type.small, lineHeight: 1.6, color: light.textSecondary }}>
                            입금 확인은 관리자에게 알림이 간 뒤 처리됩니다 — <strong>시간이 조금 걸릴 수 있습니다.</strong><br />
                            급하시면 입금 내역을 캡처해서 1:1 오픈채팅으로 바로 주시면 됩니다.
                            <a
                                href="https://open.kakao.com/o/sPcaslwh"
                                target="_blank"
                                rel="noopener"
                                style={{ display: 'flex', width: 'fit-content', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 12, padding: '0 16px', background: light.btn, color: light.onBtn, borderRadius: lightRadius.control, fontSize: type.small, fontWeight: 600, textDecoration: 'none' }}
                            ><ShellIcon name="chat" size={16} />1:1 오픈채팅 바로가기</a>
                        </div>
                    </div>
                )}

                {status === 'approved' && code && (
                    <div style={{ ...softBox, padding: 24, marginTop: 20, textAlign: 'left' }}>
                        <h2 style={{ textAlign: 'center', color: light.positive, fontSize: type.lead, fontWeight: 600, marginBottom: 16 }}>라이선스 발급 완료</h2>
                        <div style={{ color: light.textSecondary, fontSize: type.meta, marginBottom: 8 }}>{purchaseGuide(info.product || '').codeLabel}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input readOnly value={code} style={{ ...inputBase, flex: 1, minWidth: 0, fontFamily: 'monospace', fontWeight: 600, letterSpacing: 0.5 }} />
                            <button onClick={() => copyLicense(code)} style={{ minHeight: 48, padding: '0 20px', background: light.accent, color: light.onAccent, border: 'none', borderRadius: lightRadius.control, fontWeight: 600, cursor: 'pointer', fontSize: type.small, whiteSpace: 'nowrap' }}>{licCopyLabel}</button>
                        </div>
                        <div style={{ color: light.textSecondary, fontSize: type.small, marginTop: 16, lineHeight: 1.6 }}>
                            이 코드는 입력하신 이메일로도 발송되었습니다.<br />
                            {purchaseGuide(info.product || '').usage}
                        </div>
                        {/* 2026-10-07 — 어떤 제품이든 설치 파일 바로가기 · 다운로드 비밀번호 · (LEWORD) 노션 사용법 */}
                        <PurchaseNextSteps product={info.product || ''} />
                    </div>
                )}

                {status === 'rejected' && (
                    <div style={{ ...softBox, padding: 24, marginTop: 20, textAlign: 'center' }}>
                        <h2 style={{ color: light.negative, fontSize: type.body, fontWeight: 600, marginBottom: 8 }}>주문이 거절되었습니다</h2>
                        <div style={{ color: light.textSecondary, fontSize: type.small, lineHeight: 1.6 }}>
                            입금 확인이 되지 않았거나 다른 사유로 거절 처리되었습니다.<br />
                            문의: <a href="mailto:tjdgus24280@naver.com" style={inkLink}>tjdgus24280@naver.com</a>
                        </div>
                    </div>
                )}

                <p style={{ color: light.textMuted, fontSize: type.meta, marginTop: 20 }}>
                    문의: <a href="mailto:tjdgus24280@naver.com" style={inkLink}>tjdgus24280@naver.com</a>
                    {' | '}
                    <a href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener noreferrer" style={inkLink}>카카오톡 1:1 문의</a>
                </p>
            </div>
        </div>
    );
}

export default BankOrderPage;
