import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
    adminPost,
    clearAdminSession,
    loginWithAdminPassword,
    logoutAdmin,
    removeNotice,
    requestAdminOtp,
    saveNotice,
    saveSiteContent,
    setAdminPasswordCredentials,
    verifyAdminOtp,
    verifyAdminSession,
} from '../lib/adminApi';
import {
    fetchHomeNotices,
    fetchSiteContent,
    invalidateHomeNoticeCache,
    invalidateSiteContentCache,
    type HomeNotice,
    type SiteContent,
} from '../lib/siteOps';

type AdminView = 'content' | 'notices' | 'orders' | 'tools';

type BankOrder = {
    orderId: string;
    name: string;
    email: string;
    product: string;
    amount: number;
    status: string;
    licenseCode?: string;
    createdAt?: string;
    approvedAt?: string;
};

type BankListResponse = { ok?: boolean; success?: boolean; orders?: BankOrder[] };

const adminToolActions = [
    'dbinfo', 'list', 'issue', 'revoke', 'revoke-batch', 'delete-batch',
    'repair-expirations', 'extend-expirations', 'force-logout', 'list-users',
    'update-block', 'trial-list', 'trial-block', 'get-reviews-admin',
    'review-approve', 'review-reject', 'review-update', 'get-tips-admin',
    'tip-approve', 'tip-reject', 'get-income-admin', 'income-update',
    'income-approve', 'income-reject', 'income-delete', 'get-leads-admin',
    'lead-delete', 'analytics-dashboard',
] as const;

function examplePayload(action: string): string {
    const examples: Record<string, Record<string, unknown>> = {
        issue: { platform: 'LEWORD', type: 'CUSTOM', customDays: 30, count: 1 },
        revoke: { code: '' },
        'revoke-batch': { codes: [], includeUsed: false },
        'delete-batch': { codes: [] },
        'extend-expirations': { codes: [], days: 30 },
        'force-logout': { code: '' },
        'update-block': { userId: '', blocked: true },
        'trial-block': { email: '', block: true, reason: '' },
        'review-approve': { timestamp: '' },
        'review-reject': { timestamp: '' },
        'review-update': { timestamp: '' },
        'tip-approve': { timestamp: '' },
        'tip-reject': { timestamp: '' },
        'income-approve': { id: '' },
        'income-reject': { id: '' },
        'income-delete': { id: '' },
        'income-update': { id: '' },
        'lead-delete': { id: '' },
        'analytics-dashboard': { period: 'today' },
    };
    return JSON.stringify(examples[action] || {}, null, 2);
}

const pageStyle = { minHeight: '100vh', background: '#080a10', color: '#f8fbff', padding: '36px 18px 72px' } as const;
const cardStyle = { border: '1px solid rgba(255,255,255,.14)', borderRadius: 18, background: 'rgba(255,255,255,.045)', padding: 22 } as const;
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(255,255,255,.18)', borderRadius: 10, background: 'rgba(0,0,0,.25)', color: '#fff', padding: '12px 13px', fontSize: 14 } as const;
const primaryStyle = { minHeight: 44, padding: '0 16px', border: 0, borderRadius: 10, background: '#d8b441', color: '#10131a', fontWeight: 900, cursor: 'pointer' } as const;
const secondaryStyle = { minHeight: 42, padding: '0 14px', border: '1px solid rgba(255,255,255,.2)', borderRadius: 10, background: 'transparent', color: '#f8fbff', fontWeight: 800, cursor: 'pointer' } as const;

function emptyNotice(): Partial<HomeNotice> {
    return { badge: 'notice', date: new Date().toISOString().slice(0, 10), title: '', summary: '', body: '' };
}

function formatAmount(value: number): string {
    return new Intl.NumberFormat('ko-KR').format(value || 0);
}

function Login({ onAuthenticated }: { onAuthenticated: () => void }) {
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [requested, setRequested] = useState(false);
    const [emailRecovery, setEmailRecovery] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    const loginWithPassword = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setMessage('');
        try {
            await loginWithAdminPassword(loginId, password);
            onAuthenticated();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '로그인에 실패했습니다.');
        } finally {
            setBusy(false);
        }
    };

    const requestCode = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setMessage('');
        try {
            await requestAdminOtp(email);
            setRequested(true);
            setMessage('등록된 관리자 이메일로 6자리 코드를 보냈습니다. 코드는 10분 후 만료됩니다.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '로그인 코드를 보낼 수 없습니다.');
        } finally {
            setBusy(false);
        }
    };

    const verifyCode = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setMessage('');
        try {
            await verifyAdminOtp(email, code);
            onAuthenticated();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '로그인에 실패했습니다.');
        } finally {
            setBusy(false);
        }
    };

    return <main style={pageStyle}>
        <section style={{ ...cardStyle, maxWidth: 440, margin: '12vh auto 0' }}>
            <span style={{ color: '#f5d76e', fontWeight: 900, letterSpacing: 1.1, fontSize: 12 }}>LEADERS PRO ADMIN</span>
            <h1 style={{ margin: '12px 0 8px', fontSize: 30 }}>관리자 로그인</h1>
            <p style={{ margin: '0 0 22px', color: 'rgba(255,255,255,.68)', lineHeight: 1.65 }}>
                아이디와 비밀번호로 로그인합니다. 비밀번호는 브라우저에 저장하지 않으며, 서버는 만료되는 세션만 발급합니다.
            </p>
            {!emailRecovery ? <form onSubmit={loginWithPassword} style={{ display: 'grid', gap: 12 }}>
                <label style={{ display: 'grid', gap: 7, fontWeight: 800 }}>관리자 아이디<input autoComplete="username" required value={loginId} onChange={(event) => setLoginId(event.target.value)} style={inputStyle} /></label>
                <label style={{ display: 'grid', gap: 7, fontWeight: 800 }}>비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} /></label>
                <button type="submit" disabled={busy} style={{ ...primaryStyle, opacity: busy ? .6 : 1 }}>{busy ? '처리 중…' : '로그인'}</button>
            </form> : <form onSubmit={requested ? verifyCode : requestCode} style={{ display: 'grid', gap: 12 }}>
                <label style={{ display: 'grid', gap: 7, fontWeight: 800 }}>관리자 이메일<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} /></label>
                {requested && <label style={{ display: 'grid', gap: 7, fontWeight: 800 }}>로그인 코드<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} style={inputStyle} /></label>}
                <button type="submit" disabled={busy} style={{ ...primaryStyle, opacity: busy ? .6 : 1 }}>{busy ? '처리 중…' : requested ? '이메일 코드 로그인' : '로그인 코드 받기'}</button>
            </form>}
            <button type="button" style={{ ...secondaryStyle, width: '100%', marginTop: 12 }} onClick={() => { setEmailRecovery(!emailRecovery); setRequested(false); setMessage(''); }}>
                {emailRecovery ? '아이디·비밀번호 로그인으로 돌아가기' : '최초 비밀번호 설정·복구는 이메일 코드 사용'}
            </button>
            {message && <p role="status" style={{ margin: '16px 0 0', color: '#f5d76e', lineHeight: 1.55 }}>{message}</p>}
        </section>
    </main>;
}

function PasswordSetup() {
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    const saveCredentials = async (event: FormEvent) => {
        event.preventDefault();
        if (password !== confirmPassword) {
            setMessage('새 비밀번호가 서로 다릅니다.');
            return;
        }
        setBusy(true);
        setMessage('');
        try {
            await setAdminPasswordCredentials(loginId, password);
            setPassword('');
            setConfirmPassword('');
            setMessage('아이디·비밀번호를 저장했습니다. 다음부터 이메일 코드 없이 로그인할 수 있습니다.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '비밀번호를 저장하지 못했습니다.');
        } finally {
            setBusy(false);
        }
    };

    return <details style={{ ...cardStyle, marginBottom: 18 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 900 }}>아이디·비밀번호 최초 설정 또는 변경</summary>
        <p style={{ color: 'rgba(255,255,255,.66)', lineHeight: 1.6 }}>이메일 코드로 로그인한 뒤에만 새 비밀번호를 설정할 수 있습니다. 기존에 공개됐던 비밀번호는 사용하지 마세요.</p>
        <form onSubmit={saveCredentials} style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
            <input required minLength={4} maxLength={64} placeholder="새 관리자 아이디" value={loginId} onChange={(event) => setLoginId(event.target.value)} style={inputStyle} />
            <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" placeholder="새 비밀번호 (12자 이상)" value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} />
            <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" placeholder="새 비밀번호 확인" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} style={inputStyle} />
            <button type="submit" disabled={busy} style={{ ...primaryStyle, width: 'fit-content' }}>{busy ? '저장 중…' : '아이디·비밀번호 저장'}</button>
        </form>
        {message && <p role="status" style={{ color: '#f5d76e', marginBottom: 0 }}>{message}</p>}
    </details>;
}

function Orders({ orders, busy, onRefresh, onProcess }: {
    orders: BankOrder[];
    busy: boolean;
    onRefresh: () => void;
    onProcess: (order: BankOrder, reject: boolean) => void;
}) {
    const pending = orders.filter((order) => order.status === 'pending');
    return <section style={cardStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
                <h2 style={{ margin: 0 }}>계좌이체 주문</h2>
                <p style={{ color: 'rgba(255,255,255,.66)', marginBottom: 0 }}>대기 {pending.length}건 · 전체 {orders.length}건</p>
            </div>
            <button type="button" disabled={busy} style={secondaryStyle} onClick={onRefresh}>새로고침</button>
        </div>
        {orders.length === 0 ? <p style={{ color: 'rgba(255,255,255,.66)', margin: '22px 0 0' }}>표시할 주문이 없습니다.</p> : <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
            {orders.map((order) => <article key={order.orderId} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 15 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{order.product || '상품 미확인'}</strong>
                    <span style={{ color: order.status === 'pending' ? '#f5d76e' : order.status === 'approved' ? '#76e6bf' : '#ff879a', fontWeight: 800 }}>{order.status}</span>
                </div>
                <p style={{ margin: '9px 0', color: 'rgba(255,255,255,.76)', lineHeight: 1.6 }}>
                    {order.name} · {order.email}<br />
                    {formatAmount(order.amount)}원 · {order.createdAt || order.orderId}
                </p>
                {order.licenseCode && <p style={{ margin: '0 0 10px', fontFamily: 'monospace', color: '#f5d76e' }}>라이선스: {order.licenseCode}</p>}
                {order.status === 'pending' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" disabled={busy} style={primaryStyle} onClick={() => onProcess(order, false)}>입금 확인 · 라이선스 발급</button>
                    <button type="button" disabled={busy} style={{ ...secondaryStyle, color: '#ff879a' }} onClick={() => onProcess(order, true)}>주문 거절</button>
                </div>}
            </article>)}
        </div>}
    </section>;
}

function AdminPage() {
    const [authenticated, setAuthenticated] = useState(false);
    const [checking, setChecking] = useState(true);
    const [view, setView] = useState<AdminView>('content');
    const [contentText, setContentText] = useState('');
    const [contentReady, setContentReady] = useState(false);
    const [notices, setNotices] = useState<HomeNotice[]>([]);
    const [orders, setOrders] = useState<BankOrder[]>([]);
    const [draft, setDraft] = useState<Partial<HomeNotice> | null>(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [toolAction, setToolAction] = useState<(typeof adminToolActions)[number]>('list');
    const [toolPayload, setToolPayload] = useState(examplePayload('list'));
    const [toolResult, setToolResult] = useState('');

    const refreshContent = async (): Promise<boolean> => {
        invalidateSiteContentCache();
        const content = await fetchSiteContent();
        if (!content) {
            setContentReady(false);
            setMessage('사이트 콘텐츠를 불러오지 못했습니다. 저장하지 말고 잠시 후 다시 시도하세요.');
            return false;
        }
        setContentText(JSON.stringify(content, null, 2));
        setContentReady(true);
        return true;
    };

    const refreshNotices = async () => {
        const noticeList = await fetchHomeNotices(100);
        setNotices(noticeList);
    };

    const refreshOrders = async () => {
        const response = await adminPost<BankListResponse>('bank-list', { status: 'all' });
        setOrders(Array.isArray(response.orders) ? response.orders : []);
    };

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const valid = await verifyAdminSession();
                if (!active) return;
                setAuthenticated(valid);
                if (valid) await Promise.all([refreshContent(), refreshNotices()]);
            } catch {
                clearAdminSession();
            } finally {
                if (active) setChecking(false);
            }
        })();
        return () => { active = false; };
    }, []);

    const noticeSummary = useMemo(() => notices.length ? `등록 공지 ${notices.length}개` : '등록된 공지가 없습니다.', [notices.length]);

    const run = async (task: () => Promise<void>) => {
        setBusy(true);
        setMessage('');
        try {
            await task();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.');
        } finally {
            setBusy(false);
        }
    };

    const saveContent = () => void run(async () => {
        if (!contentReady) throw new Error('콘텐츠가 안전하게 로드되지 않았습니다. 먼저 다시 불러오세요.');
        const content = JSON.parse(contentText) as SiteContent;
        if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('콘텐츠 JSON 형식이 올바르지 않습니다.');
        await saveSiteContent(content);
        await refreshContent();
        setMessage('사이트 콘텐츠를 저장했습니다.');
    });

    const saveDraft = (event: FormEvent) => {
        event.preventDefault();
        void run(async () => {
            if (!draft) return;
            await saveNotice(draft);
            invalidateHomeNoticeCache();
            await refreshNotices();
            setDraft(null);
            setMessage('공지사항을 저장했습니다.');
        });
    };

    const deleteNotice = (id: string) => {
        if (!window.confirm('이 공지를 삭제 처리할까요?')) return;
        void run(async () => {
            await removeNotice(id);
            invalidateHomeNoticeCache();
            await refreshNotices();
            setMessage('공지사항을 삭제 처리했습니다.');
        });
    };

    const processOrder = (order: BankOrder, reject: boolean) => {
        const actionName = reject ? '거절' : '입금 확인 및 라이선스 발급';
        if (!window.confirm(`${order.orderId} 주문을 ${actionName}할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
        void run(async () => {
            await adminPost('bank-approve', { orderId: order.orderId, reject });
            await refreshOrders();
            setMessage(reject ? '주문을 거절 처리했습니다.' : '입금을 확인하고 라이선스를 발급했습니다.');
        });
    };

    const runAdminTool = () => void run(async () => {
        const payload = JSON.parse(toolPayload) as Record<string, unknown>;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('요청 JSON은 객체 형식이어야 합니다.');
        const result = await adminPost<Record<string, unknown>>(toolAction, payload);
        setToolResult(JSON.stringify(result, null, 2));
        setMessage(`${toolAction} 요청을 완료했습니다.`);
    });

    if (checking) return <main style={pageStyle}><p style={{ textAlign: 'center', paddingTop: '25vh', color: 'rgba(255,255,255,.65)' }}>관리자 세션을 확인하는 중…</p></main>;
    if (!authenticated) return <Login onAuthenticated={() => {
        setAuthenticated(true);
        void refreshContent();
        void refreshNotices();
    }} />;

    return <main style={pageStyle}>
        <section style={{ maxWidth: 1120, margin: '0 auto' }}>
            <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                <div><span style={{ color: '#f5d76e', fontWeight: 900, fontSize: 12, letterSpacing: 1.1 }}>SECURE ADMIN</span><h1 style={{ margin: '5px 0 0', fontSize: 30 }}>Leaders Pro 운영 관리</h1></div>
                <button type="button" style={secondaryStyle} onClick={() => void run(async () => { await logoutAdmin(); setAuthenticated(false); })}>로그아웃</button>
            </header>
            <PasswordSetup />
            <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                <button type="button" style={view === 'content' ? primaryStyle : secondaryStyle} onClick={() => setView('content')}>사이트 콘텐츠</button>
                <button type="button" style={view === 'notices' ? primaryStyle : secondaryStyle} onClick={() => setView('notices')}>공지사항</button>
                <button type="button" style={view === 'orders' ? primaryStyle : secondaryStyle} onClick={() => { setView('orders'); void run(refreshOrders); }}>계좌이체 주문</button>
                <button type="button" style={view === 'tools' ? primaryStyle : secondaryStyle} onClick={() => setView('tools')}>고급 운영 도구</button>
            </nav>
            {message && <p role="alert" style={{ color: '#f5d76e', margin: '0 0 16px' }}>{message}</p>}
            {view === 'content' && <section style={cardStyle}>
                <h2 style={{ marginTop: 0 }}>사이트 콘텐츠와 다운로드 링크</h2>
                <p style={{ color: 'rgba(255,255,255,.66)', lineHeight: 1.6 }}>Google Apps Script와 스프레드시트에 반영됩니다. 다운로드 URL은 GitHub Releases의 HTTPS 주소만 사용하세요.</p>
                <textarea value={contentText} onChange={(event) => setContentText(event.target.value)} disabled={!contentReady} spellCheck={false} style={{ ...inputStyle, minHeight: 460, fontFamily: 'Consolas, monospace', lineHeight: 1.55, opacity: contentReady ? 1 : .55 }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                    <button type="button" disabled={busy || !contentReady} style={{ ...primaryStyle, opacity: contentReady ? 1 : .55 }} onClick={saveContent}>저장</button>
                    <button type="button" disabled={busy} style={secondaryStyle} onClick={() => void run(async () => { await refreshContent(); })}>다시 불러오기</button>
                </div>
            </section>}
            {view === 'notices' && <section style={cardStyle}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div><h2 style={{ margin: 0 }}>공지사항</h2><p style={{ color: 'rgba(255,255,255,.66)' }}>{noticeSummary}</p></div>
                    <button type="button" style={primaryStyle} onClick={() => setDraft(emptyNotice())}>새 공지</button>
                </div>
                {draft && <form onSubmit={saveDraft} style={{ ...cardStyle, margin: '18px 0', display: 'grid', gap: 10 }}>
                    <input required placeholder="분류" value={draft.badge || ''} onChange={(event) => setDraft({ ...draft, badge: event.target.value })} style={inputStyle} />
                    <input required type="date" value={draft.date || ''} onChange={(event) => setDraft({ ...draft, date: event.target.value })} style={inputStyle} />
                    <input required placeholder="제목" value={draft.title || ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })} style={inputStyle} />
                    <input placeholder="요약" value={draft.summary || ''} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} style={inputStyle} />
                    <textarea required placeholder="본문" value={draft.body || ''} onChange={(event) => setDraft({ ...draft, body: event.target.value })} style={{ ...inputStyle, minHeight: 140 }} />
                    <div style={{ display: 'flex', gap: 10 }}><button type="submit" disabled={busy} style={primaryStyle}>저장</button><button type="button" style={secondaryStyle} onClick={() => setDraft(null)}>취소</button></div>
                </form>}
                <div style={{ display: 'grid', gap: 10 }}>
                    {notices.map((notice) => <article key={notice.id} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 15 }}>
                        <small style={{ color: '#f5d76e' }}>{notice.badge} · {notice.date}</small>
                        <h3 style={{ margin: '6px 0' }}>{notice.title}</h3>
                        <p style={{ color: 'rgba(255,255,255,.68)', margin: '0 0 12px' }}>{notice.summary}</p>
                        <div style={{ display: 'flex', gap: 8 }}><button type="button" style={secondaryStyle} onClick={() => setDraft(notice)}>수정</button><button type="button" style={{ ...secondaryStyle, color: '#ff879a' }} onClick={() => deleteNotice(notice.id)}>삭제</button></div>
                    </article>)}
                </div>
            </section>}
            {view === 'orders' && <Orders orders={orders} busy={busy} onRefresh={() => void run(refreshOrders)} onProcess={processOrder} />}
            {view === 'tools' && <section style={cardStyle}>
                <h2 style={{ marginTop: 0 }}>고급 운영 도구</h2>
                <p style={{ color: 'rgba(255,255,255,.66)', lineHeight: 1.6 }}>
                    기존 GAS 운영 기능을 안전한 관리자 세션으로 실행합니다. 라이선스 발급·회수, 체험 차단, 후기·팁·수익 검수, 리드 관리와 분석을 여기서 처리할 수 있습니다. 실행 전 요청 JSON을 확인하세요.
                </p>
                <label style={{ display: 'grid', gap: 7, fontWeight: 800, marginTop: 16 }}>
                    작업
                    <select value={toolAction} onChange={(event) => {
                        const action = event.target.value as (typeof adminToolActions)[number];
                        setToolAction(action);
                        setToolPayload(examplePayload(action));
                        setToolResult('');
                    }} style={inputStyle}>
                        {adminToolActions.map((action) => <option key={action} value={action}>{action}</option>)}
                    </select>
                </label>
                <label style={{ display: 'grid', gap: 7, fontWeight: 800, marginTop: 14 }}>
                    요청 JSON
                    <textarea value={toolPayload} onChange={(event) => setToolPayload(event.target.value)} spellCheck={false} style={{ ...inputStyle, minHeight: 190, fontFamily: 'Consolas, monospace', lineHeight: 1.55 }} />
                </label>
                <button type="button" disabled={busy} style={{ ...primaryStyle, marginTop: 14 }} onClick={runAdminTool}>안전한 관리자 세션으로 실행</button>
                {toolResult && <label style={{ display: 'grid', gap: 7, fontWeight: 800, marginTop: 18 }}>
                    결과
                    <textarea readOnly value={toolResult} spellCheck={false} style={{ ...inputStyle, minHeight: 280, fontFamily: 'Consolas, monospace', lineHeight: 1.55 }} />
                </label>}
            </section>}
        </section>
    </main>;
}

export default AdminPage;
