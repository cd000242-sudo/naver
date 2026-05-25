import { useEffect, useRef, useState } from 'react';

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
        tooltip.textContent = '✅ 복사됨!';
        tooltip.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#FFD700,#FFA500);color:#0a0a0f;padding:8px 20px;border-radius:100px;font-size:13px;font-weight:600;z-index:9999;';
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
    const emailInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = '주문 조회 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    const reset = () => { setError(null); setOrders(null); setSubscriptions(null); setNotice(null); };

    const onTab = (t: 'email' | 'order') => { reset(); setTab(t); };

    const lookupByEmail = async () => {
        const e = email.trim();
        if (!e || !e.includes('@')) {
            setError({ title: '입력 오류', message: '올바른 이메일 주소를 입력해주세요.' });
            return;
        }
        reset(); setLoading(true);
        try {
            // 주문 + 구독 동시 조회
            const [orderResult, subResult] = await Promise.all([
                callGAS('lookup-by-email', { email: e }),
                callGAS('lookup-subscriptions-by-email', { email: e }),
            ]);
            setLoading(false);
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
                setNotice(`✅ ${result.message || '구독이 해지되었습니다.'}`);
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

    const activeTabStyle: React.CSSProperties = { flex: 1, padding: 10, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, color: '#FFD700', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' };
    const inactiveTabStyle: React.CSSProperties = { flex: 1, padding: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'rgba(255,255,255,0.6)', fontWeight: 500, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' };

    const inputStyle: React.CSSProperties = { width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: '#fff', fontSize: 14, marginBottom: 12, outline: 'none' };
    const btnStyle: React.CSSProperties = { width: '100%', padding: 14, background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#000', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' };

    return (
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '140px 20px 80px', position: 'relative', zIndex: 1 }}>
            <div style={{ background: 'rgba(18,18,26,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 32 }}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>주문 조회</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6 }}>구매 시 입력한 이메일 또는 주문번호로<br />라이선스 코드를 확인하세요.</p>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                    <button onClick={() => onTab('email')} style={tab === 'email' ? activeTabStyle : inactiveTabStyle}>📧 이메일로 조회</button>
                    <button onClick={() => onTab('order')} style={tab === 'order' ? activeTabStyle : inactiveTabStyle}>📋 주문번호로 조회</button>
                </div>

                {tab === 'email' && (
                    <div>
                        <input
                            ref={emailInputRef}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') lookupByEmail(); }}
                            placeholder="구매 시 입력한 이메일 주소"
                            style={inputStyle}
                        />
                        <button onClick={lookupByEmail} disabled={loading} style={btnStyle}>{loading ? '조회 중...' : '조회하기'}</button>
                    </div>
                )}

                {tab === 'order' && (
                    <div>
                        <input
                            type="text"
                            value={orderId}
                            onChange={(e) => setOrderId(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') lookupByOrderId(); }}
                            placeholder="주문번호 (예: LP-1234567890-ABCDEF)"
                            style={inputStyle}
                        />
                        <button onClick={lookupByOrderId} disabled={loading} style={btnStyle}>{loading ? '조회 중...' : '조회하기'}</button>
                    </div>
                )}

                {loading && (
                    <div style={{ textAlign: 'center', padding: '30px 0' }}>
                        <div style={{ width: 32, height: 32, border: '3px solid rgba(255,215,0,0.2)', borderTopColor: '#FFD700', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 12 }}>조회 중...</p>
                        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    </div>
                )}

                {orders && orders.length === 0 && (
                    <div style={{ marginTop: 20, padding: 20, background: 'rgba(255,200,76,0.06)', border: '1px solid rgba(255,200,76,0.15)', borderRadius: 10, textAlign: 'center' }}>
                        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>주문 내역이 없습니다.</p>
                    </div>
                )}

                {orders && orders.length > 0 && orders.map((order, i) => (
                    <div key={i} style={{ marginTop: i === 0 ? 20 : 12, padding: 16, background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.18)', borderRadius: 12 }}>
                        <ResultRow label="상품" value={order.product || '—'} />
                        <ResultRow label="라이선스 코드" value={order.code || '—'} mono copy onCopy={() => order.code && copyText(order.code)} />
                        <ResultRow label="주문번호" value={order.orderId || '—'} small />
                        <ResultRow label="결제일" value={order.date || '—'} dim />
                    </div>
                ))}

                {/* 정기구독 섹션 — 해지 버튼 포함 */}
                {subscriptions && subscriptions.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                        <div style={{ fontSize: 13, color: '#FFD700', fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>📅 정기구독</div>
                        {subscriptions.map((sub) => {
                            const isActive = sub.status === 'active';
                            const isCancelled = sub.status === 'cancelled';
                            const isExpired = sub.status === 'expired';
                            const nextDate = (sub.nextPaymentDate || '').split('T')[0];
                            const cancelDate = (sub.cancelledAt || '').split('T')[0];
                            const accent = isActive ? '#44d7b6' : isCancelled ? '#FFA500' : '#ff5c75';
                            const statusLabel = isActive ? '활성' : isCancelled ? `해지됨 (${nextDate}까지 사용 가능)` : isExpired ? '만료' : sub.status;
                            return (
                                <div key={sub.licenseCode} style={{ marginTop: 12, padding: 16, background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent}33`, borderRadius: 12 }}>
                                    <ResultRow label="상품" value={sub.productName} />
                                    <ResultRow label="라이선스 코드" value={sub.licenseCode || '—'} mono copy onCopy={() => sub.licenseCode && copyText(sub.licenseCode)} />
                                    <ResultRow label="결제 금액" value={sub.amount ? `${sub.amount.toLocaleString()}원` : '—'} />
                                    <ResultRow label={isActive ? '다음 결제일' : isCancelled ? '서비스 종료일' : '결제 예정일'} value={nextDate || '—'} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>상태</span>
                                        <span style={{ fontSize: 13, color: accent, fontWeight: 700 }}>● {statusLabel}</span>
                                    </div>
                                    {isCancelled && cancelDate && (
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>해지일: {cancelDate}</div>
                                    )}
                                    {isActive && (
                                        <button
                                            onClick={() => cancelSubscription(sub)}
                                            disabled={cancellingCode === sub.licenseCode}
                                            style={{
                                                width: '100%', marginTop: 10, padding: 10,
                                                background: cancellingCode === sub.licenseCode ? 'rgba(255,255,255,0.06)' : 'rgba(255,92,117,0.12)',
                                                border: '1px solid rgba(255,92,117,0.35)',
                                                color: cancellingCode === sub.licenseCode ? 'rgba(255,255,255,0.4)' : '#ff5c75',
                                                borderRadius: 8, fontSize: 13, fontWeight: 700,
                                                cursor: cancellingCode === sub.licenseCode ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            {cancellingCode === sub.licenseCode ? '해지 처리 중...' : '🛑 정기결제 해지'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {notice && (
                    <div style={{ marginTop: 20, padding: 14, background: 'rgba(68,215,182,0.08)', border: '1px solid rgba(68,215,182,0.3)', borderRadius: 10, textAlign: 'center', fontSize: 13, color: '#44d7b6', fontWeight: 600 }}>
                        {notice}
                    </div>
                )}

                {error && (
                    <div style={{ marginTop: 20, padding: 16, background: 'rgba(255,92,117,0.06)', border: '1px solid rgba(255,92,117,0.15)', borderRadius: 10, textAlign: 'center' }}>
                        <p style={{ fontSize: 14, color: '#ff5c75', fontWeight: 600, marginBottom: 4 }}>{error.title}</p>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{error.message}</p>
                    </div>
                )}
            </div>

            <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                조회가 되지 않으시면{' '}
                <a href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener noreferrer" style={{ color: '#FFD700' }}>cd000242@gmail.com</a>
                으로 문의해주세요.
            </div>
        </div>
    );
}

function ResultRow({ label, value, mono, copy, onCopy, small, dim }: { label: string; value: string; mono?: boolean; copy?: boolean; onCopy?: () => void; small?: boolean; dim?: boolean; }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>{label}</span>
            <span
                onClick={copy ? onCopy : undefined}
                style={{
                    fontSize: small ? 12 : 14,
                    fontFamily: mono ? 'monospace' : 'inherit',
                    letterSpacing: mono ? 1 : 'normal',
                    color: dim ? 'rgba(255,255,255,0.5)' : '#fff',
                    cursor: copy ? 'pointer' : 'default',
                    fontWeight: 500,
                }}
                title={copy ? '클릭하여 복사' : undefined}
            >{value}</span>
        </div>
    );
}

export default LookupPage;
