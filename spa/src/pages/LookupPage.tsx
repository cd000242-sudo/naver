import { useEffect, useRef, useState } from 'react';

/**
 * 주문 조회 — payment-page/lookup.html 마이그.
 * Google Apps Script JSONP 호출 그대로 유지 (lookup-by-email / check-order).
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const TIMEOUT_MS = 15000;

interface Order { product?: string; code?: string; orderId?: string; date?: string; }

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
    const [error, setError] = useState<{ title: string; message: string } | null>(null);
    const emailInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = '주문 조회 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    const reset = () => { setError(null); setOrders(null); };

    const onTab = (t: 'email' | 'order') => { reset(); setTab(t); };

    const lookupByEmail = async () => {
        const e = email.trim();
        if (!e || !e.includes('@')) {
            setError({ title: '입력 오류', message: '올바른 이메일 주소를 입력해주세요.' });
            return;
        }
        reset(); setLoading(true);
        try {
            const result = await callGAS('lookup-by-email', { email: e });
            setLoading(false);
            if (result.ok) {
                setOrders(result.orders || []);
            } else {
                setError({ title: '조회 실패', message: result.error || '해당 이메일로 등록된 주문이 없습니다.' });
            }
        } catch {
            setLoading(false);
            setError({ title: '연결 실패', message: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' });
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
