import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getScheduledAmount, isNormalPricingActive, PRICING_SWITCH_AT_MS } from '../lib/pricingSchedule';

/**
 * 계좌이체 결제 — payment-page/bank-order.html 마이그.
 * GAS bank-order/check-order 흐름 + 10초 폴링 그대로 유지.
 * orderId URL param 으로 기존 주문 복원.
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

interface ProductOption { id: string; name: string; price: number; futurePrice?: number; period: string; normalPeriod?: string; }

const ALL_PRODUCTS: Record<string, ProductOption[]> = {
    naver: [
        { id: 'all-in-one-monthly', name: '올인원 1개월', price: 50000, futurePrice: 100000, period: '/ 월 · 8월 1일부터 100,000원', normalPeriod: '/ 월 · 정상가 적용 중' },
        { id: 'all-in-one-quarterly', name: '올인원 3개월', price: 120000, futurePrice: 240000, period: '월 40,000원 · 8월 1일부터 240,000원', normalPeriod: '월 80,000원 · 정상가 적용 중' },
        { id: 'all-in-one-yearly', name: '올인원 1년', price: 400000, futurePrice: 800000, period: '월 33,333원 · 8월 1일부터 800,000원', normalPeriod: '월 66,667원 · 정상가 적용 중' },
        { id: 'all-in-one-lifetime', name: '올인원 영구제', price: 1650000, futurePrice: 3300000, period: '영구 이용 · 8월 1일부터 3,300,000원', normalPeriod: '영구 이용 · 정상가 적용 중' },
    ],
};

const PRODUCT_LABELS: Record<string, string> = {
    naver: 'Leaders Pro 올인원',
};

type Status = 'pending' | 'approved' | 'rejected';

interface ResultInfo { orderId: string; amount?: number; product?: string; status: Status; code?: string; }

const fmt = (n: number) => n.toLocaleString();
const productPrice = (p: ProductOption, nowMs: number = Date.now()) => getScheduledAmount(p.price, p.futurePrice, nowMs);
const productPeriod = (p: ProductOption, nowMs: number = Date.now()) => isNormalPricingActive(nowMs) && p.normalPeriod ? p.normalPeriod : p.period;

async function fetchOrderStatus(orderId: string) {
    const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'check-order', orderId }),
    });
    return res.json();
}

function BankOrderPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [tab, setTab] = useState<string>('naver');
    const [selected, setSelected] = useState<ProductOption | null>(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<ResultInfo | null>(null);
    const [pricingNow, setPricingNow] = useState(() => Date.now());
    const [copyLabel, setCopyLabel] = useState('📋 복사');
    const [licCopyLabel, setLicCopyLabel] = useState('📋 복사');
    const [shake, setShake] = useState<'name' | 'email' | null>(null);
    const pollingRef = useRef<number | null>(null);

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
            setCopyLabel('✅ 복사됨');
            window.setTimeout(() => setCopyLabel('📋 복사'), 2000);
        });
    };

    const onCopyLicense = (code: string) => {
        navigator.clipboard.writeText(code).then(() => {
            setLicCopyLabel('✅ 복사됨');
            window.setTimeout(() => setLicCopyLabel('📋 복사'), 1500);
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
        const productLabel = selected.name.startsWith('올인원')
            ? `Leaders Pro ${selected.name}`
            : `${PRODUCT_LABELS[tab]} ${selected.name}`;
        try {
            const res = await fetch(GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'bank-order', name: n, email: e, product: productLabel, amount: orderAmount }),
            });
            const data = await res.json();
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
    const inputBase: React.CSSProperties = { width: '100%', padding: '14px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.18)', borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none' };

    return (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '140px 20px 80px', position: 'relative', zIndex: 1 }}>
            <div style={{ background: 'rgba(18,18,26,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.18)', borderRadius: 24, padding: 'clamp(24px, 4vw, 40px)' }}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <h1 style={{ fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 900, marginBottom: 8, background: 'linear-gradient(135deg, #FFD700, #FFA500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>💰 계좌이체 결제</h1>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>올인원 기간권 선택 → 정보 입력 → 입금 → 올인원 라이선스 발급</p>
                </div>

                {/* Step 1 */}
                <Step n={1} label="올인원 기간권 선택">
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        {Object.keys(PRODUCT_LABELS).filter((k) => k === 'naver').map((k) => (
                            <button
                                key={k}
                                onClick={() => onSelectTab(k)}
                                style={{
                                    padding: '10px 20px', borderRadius: 10,
                                    background: tab === k ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'rgba(255,255,255,0.05)',
                                    color: tab === k ? '#000' : '#fff',
                                    border: '1px solid rgba(201,168,76,0.3)',
                                    fontWeight: tab === k ? 800 : 500,
                                    cursor: 'pointer', fontSize: 14,
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
                                        padding: 16, borderRadius: 12, cursor: 'pointer',
                                        background: sel ? 'rgba(201,168,76,0.15)' : 'rgba(0,0,0,0.3)',
                                        border: sel ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.08)',
                                        textAlign: 'center', transition: 'all 0.2s',
                                    }}
                                >
                                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>{p.name}</div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: '#FFD700' }}>{fmt(productPrice(p, pricingNow))}원</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{productPeriod(p, pricingNow)}</div>
                                </div>
                            );
                        })}
                    </div>
                </Step>

                {/* Step 2 */}
                <Step n={2} label="정보 입력">
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', marginBottom: 6, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>입금자명 (실명)</label>
                        <input
                            type="text"
                            value={name}
                            maxLength={20}
                            placeholder="홍길동"
                            onChange={(e) => setName(e.target.value)}
                            style={{ ...inputBase, ...(shake === 'name' ? { animation: 'shake 0.4s' } : {}) }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: 6, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>이메일 (라이선스 코드 수신)</label>
                        <input
                            type="email"
                            value={email}
                            placeholder="example@email.com"
                            onChange={(e) => setEmail(e.target.value)}
                            style={{ ...inputBase, ...(shake === 'email' ? { animation: 'shake 0.4s' } : {}) }}
                        />
                    </div>
                    <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
                </Step>

                {/* Step 3 */}
                <Step n={3} label="입금 계좌 안내">
                    <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 14, padding: 20 }}>
                        <h4 style={{ marginBottom: 14, fontSize: 15, color: '#FFD700' }}>💰 아래 계좌로 입금해주세요</h4>
                        <BankRow label="은행" value="토스뱅크" />
                        <BankRow label="계좌번호" value={<>1000-1770-4358 <span onClick={onCopyAccount} style={{ marginLeft: 8, color: '#FFD700', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{copyLabel}</span></>} />
                        <BankRow label="예금주" value="박성현" />
                        <BankRow label="입금 금액" value={selected ? <strong style={{ color: '#FFD700' }}>{fmt(productPrice(selected, pricingNow))}원</strong> : '기간권을 선택해주세요'} />
                    </div>
                </Step>

                <button
                    onClick={submitOrder}
                    disabled={!selected || submitting}
                    style={{
                        width: '100%', padding: '18px', marginTop: 24,
                        background: selected && !submitting ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'rgba(255,255,255,0.08)',
                        color: selected && !submitting ? '#000' : 'rgba(255,255,255,0.4)',
                        border: 'none', borderRadius: 14,
                        fontSize: 16, fontWeight: 800,
                        cursor: selected && !submitting ? 'pointer' : 'not-allowed',
                    }}
                >
                    {submitting ? '접수 중...' : selected ? `${fmt(productPrice(selected, pricingNow))}원 주문 접수하기` : '기간권을 선택해주세요'}
                </button>

                <div style={{ marginTop: 18, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
                    주문 접수 후 입금이 확인되면 올인원 라이선스 코드가 이메일로 발송됩니다.<br />
                    결제 진행 시 <a href="/terms" style={{ color: '#FFD700' }}>이용약관</a> 및 <a href="/privacy" style={{ color: '#FFD700' }}>개인정보처리방침</a>에 동의하는 것으로 간주됩니다.
                </div>
            </div>
        </div>
    );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#000', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{n}</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{label}</div>
            </div>
            {children}
        </div>
    );
}

function BankRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 14 }}>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
            <span style={{ color: '#fff', fontWeight: 500 }}>{value}</span>
        </div>
    );
}

function ResultView({ info, copyLicense, licCopyLabel }: { info: ResultInfo; copyLicense: (code: string) => void; licCopyLabel: string }) {
    const { status, code, orderId, amount } = info;

    return (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '140px 20px 80px', position: 'relative', zIndex: 1 }}>
            <div style={{ background: 'rgba(18,18,26,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.18)', borderRadius: 24, padding: 'clamp(28px, 4vw, 40px)', textAlign: 'center' }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>{status === 'approved' ? '🎉' : status === 'rejected' ? '❌' : '✅'}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
                    {status === 'approved' && '라이선스가 발급되었습니다!'}
                    {status === 'rejected' && '주문이 거절되었습니다'}
                    {status === 'pending' && '주문이 접수되었습니다!'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.8 }}>
                    {status === 'approved' && <>아래 올인원 라이선스 코드를 사용해주세요.<br />이메일로도 발송되었습니다.</>}
                    {status === 'rejected' && '문의 사항이 있으시면 아래 연락처로 연락주세요.'}
                    {status === 'pending' && <>아래 계좌로 입금해주세요.<br />입금 확인 후 <strong>올인원 라이선스 코드</strong>가 이메일로 발송됩니다.<br /><span style={{ display: 'inline-block', marginTop: 8, color: '#c9a84c', fontSize: 13 }}>📡 이 페이지는 자동으로 상태가 갱신됩니다.</span></>}
                </div>
                <div style={{ marginTop: 18, color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>주문번호: <strong style={{ color: '#FFD700' }}>{orderId}</strong></div>

                {status === 'pending' && (
                    <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 14, padding: 20, marginTop: 20, textAlign: 'left' }}>
                        <h4 style={{ marginBottom: 14, fontSize: 15, color: '#FFD700' }}>💰 입금 계좌</h4>
                        <BankRow label="은행" value="토스뱅크" />
                        <BankRow label="계좌번호" value="1000-1770-4358" />
                        <BankRow label="예금주" value="박성현" />
                        {amount && <BankRow label="입금 금액" value={`${fmt(amount)}원`} />}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0 0', marginTop: 14, borderTop: '1px solid rgba(201,168,76,0.2)' }}>
                            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>상태</span>
                            <span style={{ color: '#ffc107', fontSize: 14, fontWeight: 600 }}>⏳ 입금 확인 대기 중</span>
                        </div>
                    </div>
                )}

                {status === 'approved' && code && (
                    <div style={{ background: 'linear-gradient(135deg, rgba(68,215,182,0.08), rgba(201,168,76,0.08))', border: '1px solid rgba(68,215,182,0.4)', borderRadius: 14, padding: 24, marginTop: 18, textAlign: 'left' }}>
                        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 8 }}>🎉</div>
                        <div style={{ textAlign: 'center', color: '#44d7b6', fontSize: 18, fontWeight: 800, marginBottom: 16 }}>올인원 라이선스 발급 완료</div>
                        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 6 }}>올인원 라이선스 코드</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input readOnly value={code} style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 10, padding: '14px 16px', color: '#c9a84c', fontFamily: 'monospace', fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }} />
                            <button onClick={() => copyLicense(code)} style={{ background: 'linear-gradient(135deg, #c9a84c, #e8d48b)', color: '#0a0a0f', border: 'none', borderRadius: 10, padding: '14px 18px', fontWeight: 800, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' }}>{licCopyLabel}</button>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 14, lineHeight: 1.6 }}>
                            이 코드는 입력하신 이메일로도 발송되었습니다.<br />
                            올인원 코드 1개로 이용 기간 안에서 Better Life Naver, Leaders Orbit, LEWORD를 함께 사용할 수 있습니다.
                        </div>
                    </div>
                )}

                {status === 'rejected' && (
                    <div style={{ background: 'rgba(233,94,44,0.08)', border: '1px solid rgba(233,94,44,0.4)', borderRadius: 14, padding: 24, marginTop: 18, textAlign: 'center' }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>❌</div>
                        <div style={{ color: '#e95e2c', fontSize: 17, fontWeight: 800, marginBottom: 8 }}>주문이 거절되었습니다</div>
                        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.6 }}>
                            입금 확인이 되지 않았거나 다른 사유로 거절 처리되었습니다.<br />
                            문의: <a href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener noreferrer" style={{ color: '#c9a84c' }}>cd000242@gmail.com</a>
                        </div>
                    </div>
                )}

                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 20 }}>
                    문의: <a href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener noreferrer" style={{ color: '#c9a84c' }}>cd000242@gmail.com</a>
                    {' | '}
                    <a href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener noreferrer" style={{ color: '#FEE500' }}>카카오톡 1:1 문의</a>
                </p>
            </div>
        </div>
    );
}

export default BankOrderPage;
