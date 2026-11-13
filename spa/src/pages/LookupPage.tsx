import { useEffect, useRef, useState } from 'react';
import SplitWords from '../components/motion/SplitWords';
import { light, lightRadius, motion, type } from '../styles/tokens';
import PurchaseNextSteps from '../components/store/PurchaseNextSteps';

/**
 * 주문 조회 — payment-page/lookup.html 마이그.
 * Google Apps Script JSONP 호출 그대로 유지 (lookup-by-email / check-order).
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const TIMEOUT_MS = 15000;

interface Order { product?: string; code?: string; orderId?: string; date?: string; }
interface Subscription {
    productId: string;
    productName: string;
    amount: number;
    nextPaymentDate: string;
    status: 'active' | 'cancelled' | 'expired' | string;
    licenseCode: string;
    createdAt: string;
    cancelledAt: string;
}

function callGAS(action: string, params: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
        const callbackName = '__lookupCb_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const timeoutId = window.setTimeout(() => {
            delete (window as any)[callbackName];
            reject(new Error('TIMEOUT'));
        }, TIMEOUT_MS);

        (window as any)[callbackName] = (data: any) => {
            window.clearTimeout(timeoutId);
            delete (window as any)[callbackName];
            resolve(data);
        };

        const queryParts = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        const script = document.createElement('script');
        script.src = `${GAS_URL}?action=${action}&${queryParts}&callback=${callbackName}`;
        script.onerror = () => {
            window.clearTimeout(timeoutId);
            delete (window as any)[callbackName];
            reject(new Error('NETWORK'));
        };
        document.head.appendChild(script);
    });
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        const tooltip = document.createElement('div');
        tooltip.textContent = '복사됨!';
        tooltip.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + light.btn + ';color:' + light.onBtn + ';padding:8px 20px;border-radius:' + lightRadius.control + 'px;font-size:' + type.small + 'px;font-weight:500;z-index:9999;';
        document.body.appendChild(tooltip);
        window.setTimeout(() => tooltip.remove(), 1500);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
}

function LookupPage() {
    const [tab, setTab] = useState<'email' | 'order'>('email');
    const [email, setEmail] = useState('');
    const [orderId, setOrderId] = useState('');
    const [loading, setLoading] = useState(false);
    const [orders, setOrders] = useState<Order[] | null>(null);
    const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
    const [cancellingCode, setCancellingCode] = useState<string | null>(null);
    const [error, setError] = useState<{ title: string; message: string } | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    // 이메일 인증(2026-10-20) — 이메일만으로 남의 코드가 보이던 구멍을 막았다. 그 메일함으로 간 6자리를 맞혀야 조회된다.
    const [codeSent, setCodeSent] = useState(false);
    const [authCode, setAuthCode] = useState('');
    const emailInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = '주문 조회 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    const reset = () => { setError(null); setOrders(null); setSubscriptions(null); setNotice(null); };

    const onTab = (t: 'email' | 'order') => { reset(); setTab(t); };

    const requestLookupCode = async () => {
        const e = email.trim();
        if (!e || !e.includes('@')) {
            setError({ title: '입력 오류', message: '올바른 이메일 주소를 입력해주세요.' });
            return;
        }
        reset(); setLoading(true);
        try {
            const result = await callGAS('lookup-email-request-code', { email: e });
            setLoading(false);
            if (result?.ok) {
                setCodeSent(true);
                setAuthCode('');
                setNotice(result.message || '인증번호를 보냈습니다. 메일함을 확인해 주세요.');
            } else {
                setError({ title: '인증번호 요청 실패', message: result?.error || '잠시 후 다시 시도해주세요.' });
            }
        } catch {
            setLoading(false);
            setError({ title: '연결 실패', message: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' });
        }
    };

    const lookupByEmail = async () => {
        const e = email.trim();
        const c = authCode.trim();
        if (!/^\d{6}$/.test(c)) {
            setError({ title: '입력 오류', message: '메일로 받은 6자리 인증번호를 입력해주세요.' });
            return;
        }
        reset(); setLoading(true);
        try {
            const verified = await callGAS('lookup-email-verify', { email: e, authCode: c });
            if (!verified?.ok || !verified.lookupToken) {
                setLoading(false);
                setError({ title: '인증 실패', message: verified?.error || '인증번호가 올바르지 않습니다.' });
                return;
            }
            // 주문 + 구독 동시 조회 — 같은 조회 토큰(30분)으로
            const [orderResult, subResult] = await Promise.all([
                callGAS('lookup-by-email', { email: e, lookupToken: verified.lookupToken }),
                callGAS('lookup-subscriptions-by-email', { email: e, lookupToken: verified.lookupToken }),
            ]);
            setLoading(false);
            setCodeSent(false);
            setAuthCode('');
            const hasOrders = orderResult?.ok && (orderResult.orders || []).length > 0;
            const hasSubs = subResult?.ok && (subResult.subscriptions || []).length > 0;
            if (hasOrders) setOrders(orderResult.orders || []);
            if (hasSubs) setSubscriptions(subResult.subscriptions || []);
            if (!hasOrders && !hasSubs) {
                setError({ title: '조회 실패', message: orderResult?.error || '해당 이메일로 등록된 주문/구독이 없습니다.' });
            }
        } catch {
            setLoading(false);
            setError({ title: '연결 실패', message: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' });
        }
    };

    const cancelSubscription = async (sub: Subscription) => {
        if (sub.status !== 'active') return;
        const confirmed = window.confirm(
            `구독을 해지하시겠습니까?\n\n` +
            `상품: ${sub.productName}\n` +
            `다음 결제 예정일: ${(sub.nextPaymentDate || '').split('T')[0]}\n\n` +
            `해지해도 위 결제 예정일까지는 서비스를 계속 이용하실 수 있습니다. 그 이후 자동결제는 발생하지 않습니다.`
        );
        if (!confirmed) return;

        setCancellingCode(sub.licenseCode);
        try {
            const result = await callGAS('cancel-subscription', { email: email.trim(), licenseCode: sub.licenseCode });
            setCancellingCode(null);
            if (result?.ok) {
                setNotice(`${result.message || '구독이 해지되었습니다.'}`);
                // 상태 갱신: 해당 구독 cancelled 로
                setSubscriptions((prev) => prev ? prev.map((s) =>
                    s.licenseCode === sub.licenseCode ? { ...s, status: 'cancelled' } : s
                ) : prev);
            } else {
                setError({ title: '해지 실패', message: result?.error || '해지 중 오류가 발생했습니다.' });
            }
        } catch {
            setCancellingCode(null);
            setError({ title: '연결 실패', message: '서버에 연결할 수 없습니다.' });
        }
    };

    const lookupByOrderId = async () => {
        const o = orderId.trim();
        if (!o) {
            setError({ title: '입력 오류', message: '주문번호를 입력해주세요.' });
            return;
        }
        reset(); setLoading(true);
        try {
            const result = await callGAS('check-order', { orderId: o });
            setLoading(false);
            if (result.ok && result.code) {
                setOrders([{ product: result.product, code: result.code, orderId: o, date: result.date || '—' }]);
            } else {
                setError({ title: '조회 실패', message: result.error || '해당 주문번호를 찾을 수 없습니다.' });
            }
        } catch {
            setLoading(false);
            setError({ title: '연결 실패', message: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' });
        }
    };

    const tabBase: React.CSSProperties = { flex: 1, minHeight: 44, padding: '0 12px', borderRadius: lightRadius.control, fontSize: type.small, cursor: 'pointer', transition: `background-color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease}, color ${motion.fast} ${motion.ease}` };
    const activeTabStyle: React.CSSProperties = { ...tabBase, background: light.accentSoft, border: `1px solid ${light.accent}`, color: light.text, fontWeight: 600 };
    const inactiveTabStyle: React.CSSProperties = { ...tabBase, background: light.surface, border: `1px solid ${light.line}`, color: light.textSecondary, fontWeight: 500 };

    const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 8, color: light.text, fontSize: type.small, fontWeight: 500 };
    const inputStyle: React.CSSProperties = { width: '100%', minHeight: 48, padding: '0 16px', background: light.surface, border: `1px solid ${light.lineStrong}`, borderRadius: lightRadius.control, color: light.text, fontSize: type.body, fontFamily: 'inherit', marginBottom: 16 };
    const btnStyle: React.CSSProperties = { width: '100%', minHeight: 48, padding: '0 16px', background: light.accent, color: light.onAccent, border: 'none', borderRadius: lightRadius.control, fontSize: type.body, fontWeight: 600, cursor: 'pointer' };
    const softBox: React.CSSProperties = { background: light.raised, border: `1px solid ${light.line}`, borderRadius: lightRadius.card };
    const inkLink: React.CSSProperties = { color: light.accentInk, textDecoration: 'underline', textUnderlineOffset: 3 };

    return (
        <div data-lookup-form style={{ maxWidth: 520, margin: '0 auto', padding: '144px 20px 80px', position: 'relative', zIndex: 1 }}>
            {/* Focus ring, placeholder colour and the loading spinner cannot be written inline. */}
            <style>{`[data-lookup-form] input::placeholder{color:${light.textMuted}}
[data-lookup-form] :focus-visible{outline:2px solid ${light.text};outline-offset:2px}
@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ background: light.surface, border: `1px solid ${light.line}`, borderRadius: lightRadius.panel, padding: 'clamp(24px, 4vw, 32px)', boxShadow: light.shadowSm, color: light.text }}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <h1 style={{ fontSize: type.h2, fontWeight: 700, lineHeight: 1.25, marginBottom: 8, color: light.text }}><SplitWords text="주문 조회" /></h1>
                    <p style={{ color: light.textSecondary, fontSize: type.small, lineHeight: 1.6 }}>구매 시 입력한 이메일 또는 주문번호로<br />라이선스 코드를 확인하세요.</p>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                    <button onClick={() => onTab('email')} style={tab === 'email' ? activeTabStyle : inactiveTabStyle}>이메일로 조회</button>
                    <button onClick={() => onTab('order')} style={tab === 'order' ? activeTabStyle : inactiveTabStyle}>주문번호로 조회</button>
                </div>

                {tab === 'email' && (
                    <div>
                        <label htmlFor="lookup-email" style={labelStyle}>구매 시 입력한 이메일 주소</label>
                        <input
                            id="lookup-email"
                            ref={emailInputRef}
                            type="email"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setCodeSent(false); setAuthCode(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !codeSent) requestLookupCode(); }}
                            placeholder="example@email.com"
                            style={inputStyle}
                        />
                        {codeSent && (
                            <>
                            <label htmlFor="lookup-auth-code" style={labelStyle}>메일로 받은 6자리 인증번호</label>
                            <input
                                id="lookup-auth-code"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                value={authCode}
                                onChange={(e) => setAuthCode(e.target.value.replace(/\D/g, ''))}
                                onKeyDown={(e) => { if (e.key === 'Enter') lookupByEmail(); }}
                                style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }}
                            />
                            </>
                        )}
                        {codeSent
                            ? <button onClick={lookupByEmail} disabled={loading} className="lp-lift lp-sheen" style={btnStyle}>{loading ? '조회 중...' : '확인하고 조회'}</button>
                            : <button onClick={requestLookupCode} disabled={loading} className="lp-lift lp-sheen" style={btnStyle}>{loading ? '보내는 중...' : '인증번호 받기'}</button>}
                        {codeSent && (
                            <button onClick={requestLookupCode} disabled={loading} style={{ background: 'none', border: 'none', color: light.textSecondary, fontSize: type.small, minHeight: 44, marginTop: 8, cursor: 'pointer', width: '100%', textDecoration: 'underline', textUnderlineOffset: 3 }}>인증번호 다시 받기</button>
                        )}
                    </div>
                )}

                {tab === 'order' && (
                    <div>
                        <label htmlFor="lookup-order-id" style={labelStyle}>주문번호</label>
                        <input
                            id="lookup-order-id"
                            type="text"
                            value={orderId}
                            onChange={(e) => setOrderId(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') lookupByOrderId(); }}
                            placeholder="예: LP-1234567890-ABCDEF"
                            style={inputStyle}
                        />
                        <button onClick={lookupByOrderId} disabled={loading} className="lp-lift lp-sheen" style={btnStyle}>{loading ? '조회 중...' : '조회하기'}</button>
                    </div>
                )}

                {loading && (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <div style={{ width: 32, height: 32, border: `3px solid ${light.line}`, borderTopColor: light.text, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                        <p style={{ fontSize: type.small, color: light.textSecondary, marginTop: 12 }}>조회 중...</p>
                    </div>
                )}

                {orders && orders.length === 0 && (
                    <div style={{ ...softBox, marginTop: 20, padding: 20, textAlign: 'center' }}>
                        <p style={{ fontSize: type.small, color: light.textSecondary }}>주문 내역이 없습니다.</p>
                    </div>
                )}

                {orders && orders.length > 0 && orders.map((order, i) => (
                    <div key={i} style={{ ...softBox, marginTop: i === 0 ? 20 : 12, padding: 16 }}>
                        <ResultRow label="상품" value={order.product || '—'} />
                        <ResultRow label="라이선스 코드" value={order.code || '—'} mono copy onCopy={() => order.code && copyText(order.code)} />
                        <ResultRow label="주문번호" value={order.orderId || '—'} small />
                        <ResultRow label="결제일" value={order.date || '—'} dim />
                        {order.code && <PurchaseNextSteps product={order.product || ''} compact />}
                    </div>
                ))}

                {/* 정기구독 섹션 — 해지 버튼 포함 */}
                {subscriptions && subscriptions.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                        <h2 style={{ fontSize: type.body, color: light.text, fontWeight: 600 }}>정기구독</h2>
                        {subscriptions.map((sub) => {
                            const isActive = sub.status === 'active';
                            const isCancelled = sub.status === 'cancelled';
                            const isExpired = sub.status === 'expired';
                            const nextDate = (sub.nextPaymentDate || '').split('T')[0];
                            const cancelDate = (sub.cancelledAt || '').split('T')[0];
                            // Colour carries meaning only: active = positive, expired = negative, everything else neutral.
                            const accent = isActive ? light.positive : isExpired ? light.negative : light.textSecondary;
                            // 'paid' — 1년권 · 영구제는 한 번만 결제하고 끝난다(2026-10-07, 자동결제 없음).
                            const statusLabel = isActive ? '활성' : isCancelled ? `해지됨 (${nextDate}까지 사용 가능)` : isExpired ? '만료' : sub.status === 'paid' ? '결제 완료 (자동결제 없음)' : sub.status;
                            return (
                                <div key={sub.licenseCode} style={{ ...softBox, marginTop: 12, padding: 16 }}>
                                    <ResultRow label="상품" value={sub.productName} />
                                    <ResultRow label="라이선스 코드" value={sub.licenseCode || '—'} mono copy onCopy={() => sub.licenseCode && copyText(sub.licenseCode)} />
                                    <ResultRow label="결제 금액" value={sub.amount ? `${sub.amount.toLocaleString()}원` : '—'} />
                                    {sub.licenseCode && <PurchaseNextSteps product={sub.productName || ''} compact />}
                                    <ResultRow label={isActive ? '다음 결제일' : isCancelled ? '서비스 종료일' : '결제 예정일'} value={nextDate || '—'} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                                        <span style={{ fontSize: type.meta, color: light.textSecondary, flexShrink: 0 }}>상태</span>
                                        <span style={{ fontSize: type.small, color: accent, fontWeight: 600, textAlign: 'right' }}>● {statusLabel}</span>
                                    </div>
                                    {isCancelled && cancelDate && (
                                        <div style={{ fontSize: type.meta, color: light.textMuted, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>해지일: {cancelDate}</div>
                                    )}
                                    {isActive && (
                                        <button
                                            onClick={() => cancelSubscription(sub)}
                                            disabled={cancellingCode === sub.licenseCode}
                                            style={{
                                                width: '100%', minHeight: 44, marginTop: 12, padding: '0 16px',
                                                background: cancellingCode === sub.licenseCode ? light.raised : light.surface,
                                                border: `1px solid ${light.lineStrong}`,
                                                color: cancellingCode === sub.licenseCode ? light.textMuted : light.negative,
                                                borderRadius: lightRadius.control, fontSize: type.small, fontWeight: 600,
                                                cursor: cancellingCode === sub.licenseCode ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            {cancellingCode === sub.licenseCode ? '해지 처리 중...' : '정기결제 해지'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {notice && (
                    <div role="status" style={{ marginTop: 20, padding: '12px 16px', background: light.positiveSoft, borderRadius: lightRadius.control, textAlign: 'center', fontSize: type.small, color: light.positive, fontWeight: 500 }}>
                        {notice}
                    </div>
                )}

                {error && (
                    <div role="alert" style={{ marginTop: 20, padding: 16, background: light.negativeSoft, borderRadius: lightRadius.control, textAlign: 'center' }}>
                        <p style={{ fontSize: type.small, color: light.negative, fontWeight: 600, marginBottom: 4 }}>{error.title}</p>
                        <p style={{ fontSize: type.small, color: light.text }}>{error.message}</p>
                    </div>
                )}
            </div>

            <div style={{ marginTop: 20, textAlign: 'center', fontSize: type.meta, color: light.textMuted, lineHeight: 1.7 }}>
                {/* 링크가 카카오 오픈채팅인데 앵커 텍스트가 이메일이라 어디로 가는지 어긋났다.
                    조회 실패한 구매자의 마지막 안내 지점이라 둘 다 명확히 준다. */}
                조회가 되지 않으시면{' '}
                <a href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener noreferrer" style={inkLink}>카카오톡 1:1 문의</a>
                {' '}또는{' '}
                <a href="mailto:tjdgus24280@naver.com" style={inkLink}>tjdgus24280@naver.com</a>
                으로 연락해주세요.
            </div>
        </div>
    );
}

function ResultRow({ label, value, mono, copy, onCopy, small, dim }: { label: string; value: string; mono?: boolean; copy?: boolean; onCopy?: () => void; small?: boolean; dim?: boolean; }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${light.line}` }}>
            <span style={{ fontSize: type.meta, color: light.textSecondary, flexShrink: 0 }}>{label}</span>
            <span
                onClick={copy ? onCopy : undefined}
                style={{
                    fontSize: small ? type.meta : type.small,
                    fontFamily: mono ? 'monospace' : 'inherit',
                    letterSpacing: mono ? 1 : 'normal',
                    color: dim ? light.textSecondary : light.text,
                    cursor: copy ? 'pointer' : 'default',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    textAlign: 'right',
                    overflowWrap: 'anywhere',
                    minWidth: 0,
                }}
                title={copy ? '클릭하여 복사' : undefined}
            >{value}</span>
        </div>
    );
}

export default LookupPage;
