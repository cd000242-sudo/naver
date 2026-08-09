import { FormEvent, useEffect, useState } from 'react';
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

type AdminView = 'content' | 'notices' | 'licenses' | 'trials' | 'orders' | 'community' | 'analytics' | 'tools';
type AdminPayload = {
    ok?: boolean;
    success?: boolean;
    error?: string;
    message?: string;
    [key: string]: unknown;
};
type RecordItem = Record<string, unknown>;
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

const adminToolActions = [
    'dbinfo', 'list', 'issue', 'revoke', 'revoke-batch', 'delete-batch', 'update-code', 'get-code',
    'repair-expirations', 'extend-expirations', 'force-logout', 'list-users', 'update-block',
    'get-settings', 'update-settings', 'list-pool', 'add-pool', 'delete-pool',
    'trial-list', 'trial-block', 'bank-list', 'bank-approve',
    'get-reviews-admin', 'review-approve', 'review-reject', 'review-update',
    'get-tips-admin', 'tip-approve', 'tip-reject',
    'get-income-admin', 'income-update', 'income-approve', 'income-reject', 'income-delete',
    'get-leads-admin', 'lead-delete', 'analytics-dashboard',
] as const;

const pageStyle = { minHeight: '100vh', background: '#080a10', color: '#f8fbff', padding: '36px 18px 72px' } as const;
const cardStyle = { border: '1px solid rgba(255,255,255,.14)', borderRadius: 18, background: 'rgba(255,255,255,.045)', padding: 22 } as const;
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(255,255,255,.18)', borderRadius: 10, background: 'rgba(0,0,0,.25)', color: '#fff', padding: '12px 13px', fontSize: 14 } as const;
const primaryStyle = { minHeight: 44, padding: '0 16px', border: 0, borderRadius: 10, background: '#d8b441', color: '#10131a', fontWeight: 900, cursor: 'pointer' } as const;
const secondaryStyle = { minHeight: 42, padding: '0 14px', border: '1px solid rgba(255,255,255,.2)', borderRadius: 10, background: 'transparent', color: '#f8fbff', fontWeight: 800, cursor: 'pointer' } as const;
const dangerStyle = { ...secondaryStyle, color: '#ff879a', borderColor: 'rgba(255,135,154,.55)' } as const;

function emptyNotice(): Partial<HomeNotice> {
    return { badge: 'notice', date: new Date().toISOString().slice(0, 10), title: '', summary: '', body: '' };
}

function text(value: unknown, fallback = ''): string {
    if (value === null || value === undefined) return fallback;
    return String(value);
}

function asRecord(value: unknown): RecordItem | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
}

function recordsFrom(payload: AdminPayload, keys: string[]): RecordItem[] {
    for (const key of keys) {
        const value = payload[key];
        if (Array.isArray(value)) return value.map(asRecord).filter((item): item is RecordItem => item !== null);
    }
    return [];
}

function firstText(item: RecordItem, keys: string[], fallback = ''): string {
    for (const key of keys) {
        const value = text(item[key]).trim();
        if (value) return value;
    }
    return fallback;
}

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
        'bank-approve': { orderId: '', reject: false },
    };
    return JSON.stringify(examples[action] || {}, null, 2);
}

function SectionTitle({ title, description, onRefresh, busy }: { title: string; description: string; onRefresh?: () => void; busy?: boolean }) {
    return <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14, alignItems: 'start', marginBottom: 18 }}>
        <div><h2 style={{ margin: 0 }}>{title}</h2><p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,.66)', lineHeight: 1.6 }}>{description}</p></div>
        {onRefresh && <button type="button" disabled={busy} style={secondaryStyle} onClick={onRefresh}>새로고침</button>}
    </div>;
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
            setMessage('등록한 관리자 이메일로 로그인 코드를 보냈습니다.');
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
            <p style={{ margin: '0 0 22px', color: 'rgba(255,255,255,.68)', lineHeight: 1.65 }}>아이디와 비밀번호로 로그인합니다. 비밀번호는 브라우저에 저장하지 않으며, 서버는 만료되는 세션만 발급합니다.</p>
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
                {emailRecovery ? '아이디·비밀번호 로그인으로 돌아가기' : '비밀번호 복구는 이메일 코드 사용'}
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
            setMessage('관리자 아이디와 비밀번호를 변경했습니다.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '비밀번호를 변경하지 못했습니다.');
        } finally {
            setBusy(false);
        }
    };

    return <details style={{ ...cardStyle, marginBottom: 18 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 900 }}>관리자 아이디·비밀번호 변경</summary>
        <p style={{ color: 'rgba(255,255,255,.66)', lineHeight: 1.6 }}>로그인한 관리자만 변경할 수 있습니다. 변경 후에는 새 아이디와 비밀번호로 로그인하세요.</p>
        <form onSubmit={saveCredentials} style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
            <input required minLength={4} maxLength={64} placeholder="새 관리자 아이디" value={loginId} onChange={(event) => setLoginId(event.target.value)} style={inputStyle} />
            <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" placeholder="새 비밀번호 (12자 이상)" value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} />
            <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" placeholder="새 비밀번호 확인" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} style={inputStyle} />
            <button type="submit" disabled={busy} style={{ ...primaryStyle, width: 'fit-content' }}>{busy ? '저장 중…' : '로그인 정보 변경'}</button>
        </form>
        {message && <p role="status" style={{ color: '#f5d76e', marginBottom: 0 }}>{message}</p>}
    </details>;
}

function AdminPage() {
    const [authenticated, setAuthenticated] = useState(false);
    const [checking, setChecking] = useState(true);
    const [view, setView] = useState<AdminView>('content');
    const [contentText, setContentText] = useState('');
    const [contentReady, setContentReady] = useState(false);
    const [notices, setNotices] = useState<HomeNotice[]>([]);
    const [draft, setDraft] = useState<Partial<HomeNotice> | null>(null);
    const [licenses, setLicenses] = useState<RecordItem[]>([]);
    const [trials, setTrials] = useState<RecordItem[]>([]);
    const [orders, setOrders] = useState<BankOrder[]>([]);
    const [reviews, setReviews] = useState<RecordItem[]>([]);
    const [income, setIncome] = useState<RecordItem[]>([]);
    const [tips, setTips] = useState<RecordItem[]>([]);
    const [leads, setLeads] = useState<RecordItem[]>([]);
    const [analytics, setAnalytics] = useState<RecordItem | null>(null);
    const [issuePlatform, setIssuePlatform] = useState('LEWORD');
    const [issueType, setIssueType] = useState('CUSTOM');
    const [issueDays, setIssueDays] = useState('30');
    const [issueCount, setIssueCount] = useState('1');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [toolAction, setToolAction] = useState<(typeof adminToolActions)[number]>('list');
    const [toolPayload, setToolPayload] = useState(examplePayload('list'));
    const [toolResult, setToolResult] = useState('');

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

    const refreshNotices = async () => setNotices(await fetchHomeNotices(100));

    const refreshLicenses = async () => {
        const response = await adminPost<AdminPayload>('list');
        setLicenses(recordsFrom(response, ['data', 'items', 'licenses']));
    };

    const refreshTrials = async () => {
        const response = await adminPost<AdminPayload>('trial-list');
        setTrials(recordsFrom(response, ['trials', 'data', 'items', 'users']));
    };

    const refreshOrders = async () => {
        const response = await adminPost<AdminPayload>('bank-list', { status: 'all' });
        setOrders(recordsFrom(response, ['orders', 'data', 'items']).map((item) => ({
            orderId: firstText(item, ['orderId', 'id']),
            name: firstText(item, ['name']),
            email: firstText(item, ['email']),
            product: firstText(item, ['product']),
            amount: Number(item.amount || 0),
            status: firstText(item, ['status'], 'pending'),
            licenseCode: firstText(item, ['licenseCode', 'code']),
            createdAt: firstText(item, ['createdAt', 'date']),
            approvedAt: firstText(item, ['approvedAt']),
        })));
    };

    const refreshCommunity = async () => {
        const [reviewResponse, incomeResponse, tipResponse, leadResponse] = await Promise.all([
            adminPost<AdminPayload>('get-reviews-admin'),
            adminPost<AdminPayload>('get-income-admin'),
            adminPost<AdminPayload>('get-tips-admin'),
            adminPost<AdminPayload>('get-leads-admin'),
        ]);
        setReviews(recordsFrom(reviewResponse, ['reviews', 'data', 'items']));
        setIncome(recordsFrom(incomeResponse, ['items', 'income', 'data']));
        setTips(recordsFrom(tipResponse, ['tips', 'data', 'items']));
        setLeads(recordsFrom(leadResponse, ['leads', 'data', 'items']));
    };

    const refreshAnalytics = async () => {
        const response = await adminPost<AdminPayload>('analytics-dashboard', { period: 'today' });
        setAnalytics(asRecord(response.analytics) || asRecord(response.data) || response);
    };

    const openView = (next: AdminView) => {
        setView(next);
        if (next === 'licenses') void run(refreshLicenses);
        if (next === 'trials') void run(refreshTrials);
        if (next === 'orders') void run(refreshOrders);
        if (next === 'community') void run(refreshCommunity);
        if (next === 'analytics') void run(refreshAnalytics);
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
        if (!window.confirm('이 공지를 삭제할까요?')) return;
        void run(async () => {
            await removeNotice(id);
            invalidateHomeNoticeCache();
            await refreshNotices();
            setMessage('공지를 삭제했습니다.');
        });
    };

    const issueLicense = () => void run(async () => {
        const count = Math.max(1, Math.min(100, Number(issueCount) || 1));
        const customDays = Math.max(1, Math.min(3650, Number(issueDays) || 30));
        const response = await adminPost<AdminPayload>('issue', { platform: issuePlatform, type: issueType, count, ...(issueType === 'CUSTOM' ? { customDays } : {}) });
        await refreshLicenses();
        setToolResult(JSON.stringify(response, null, 2));
        setMessage(`${count}개의 라이선스를 발급했습니다. 발급 결과는 아래 '최근 실행 결과'에서 확인할 수 있습니다.`);
    });

    const revokeLicense = (code: string) => {
        if (!code || !window.confirm(`${code} 라이선스를 회수할까요?`)) return;
        void run(async () => {
            await adminPost('revoke', { code });
            await refreshLicenses();
            setMessage('라이선스를 회수했습니다.');
        });
    };

    const toggleTrial = (item: RecordItem) => {
        const email = firstText(item, ['email']);
        const blocked = text(item.blocked).toLowerCase() === 'true';
        if (!email || !window.confirm(`${email} 체험 사용자를 ${blocked ? '차단 해제' : '차단'}할까요?`)) return;
        void run(async () => {
            await adminPost('trial-block', { email, block: !blocked, reason: !blocked ? '관리자 차단' : '' });
            await refreshTrials();
            setMessage(blocked ? '체험 사용자 차단을 해제했습니다.' : '체험 사용자를 차단했습니다.');
        });
    };

    const processOrder = (order: BankOrder, reject: boolean) => {
        const operation = reject ? '거절' : '입금 확인 및 라이선스 발급';
        if (!order.orderId || !window.confirm(`${order.orderId} 주문을 ${operation}할까요? 이 작업은 되돌리기 어렵습니다.`)) return;
        void run(async () => {
            await adminPost('bank-approve', { orderId: order.orderId, reject });
            await refreshOrders();
            setMessage(reject ? '주문을 거절했습니다.' : '입금을 확인하고 라이선스를 발급했습니다.');
        });
    };

    const moderate = (action: string, value: RecordItem, label: string) => {
        const id = action.startsWith('income-') || action === 'lead-delete' ? firstText(value, ['id']) : firstText(value, ['timestamp', 'id']);
        if (!id || !window.confirm(`${label} 처리할까요?`)) return;
        void run(async () => {
            await adminPost(action, action.startsWith('income-') || action === 'lead-delete' ? { id } : { timestamp: id });
            await refreshCommunity();
            setMessage(`${label} 처리했습니다.`);
        });
    };

    const runAdminTool = () => void run(async () => {
        const payload = JSON.parse(toolPayload) as Record<string, unknown>;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('요청 JSON은 객체 형식이어야 합니다.');
        const result = await adminPost<AdminPayload>(toolAction, payload);
        setToolResult(JSON.stringify(result, null, 2));
        setMessage(`${toolAction} 작업을 완료했습니다.`);
    });

    if (checking) return <main style={pageStyle}><p style={{ textAlign: 'center', paddingTop: '25vh', color: 'rgba(255,255,255,.65)' }}>관리자 세션을 확인하는 중…</p></main>;
    if (!authenticated) return <Login onAuthenticated={() => {
        setAuthenticated(true);
        void refreshContent();
        void refreshNotices();
    }} />;

    return <main style={pageStyle}>
        <section style={{ maxWidth: 1220, margin: '0 auto' }}>
            <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                <div><span style={{ color: '#f5d76e', fontWeight: 900, fontSize: 12, letterSpacing: 1.1 }}>SECURE ADMIN</span><h1 style={{ margin: '5px 0 0', fontSize: 30 }}>Leaders Pro 운영 관리</h1></div>
                <button type="button" style={secondaryStyle} onClick={() => void run(async () => { await logoutAdmin(); setAuthenticated(false); })}>로그아웃</button>
            </header>
            <PasswordSetup />
            <nav aria-label="관리자 메뉴" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                {([
                    ['content', '사이트 편집'], ['notices', '홈 공지'], ['licenses', '라이선스'], ['trials', '체험 관리'],
                    ['orders', '계좌이체'], ['community', '후기·수익·팁·리드'], ['analytics', '매출·방문 분석'], ['tools', '전체 운영 도구'],
                ] as Array<[AdminView, string]>).map(([id, label]) => <button key={id} type="button" style={view === id ? primaryStyle : secondaryStyle} onClick={() => openView(id)}>{label}</button>)}
            </nav>
            {message && <p role="alert" style={{ color: '#f5d76e', margin: '0 0 16px', lineHeight: 1.55 }}>{message}</p>}

            {view === 'content' && <section style={cardStyle}>
                <SectionTitle title="사이트 콘텐츠와 다운로드 링크" description="홈, 요금제, 제품, 다운로드, 디자인 설정을 하나의 콘텐츠 데이터로 편집합니다. 다운로드 URL은 GitHub Releases의 HTTPS 주소만 사용하세요." onRefresh={() => void run(async () => { await refreshContent(); })} busy={busy} />
                <textarea aria-label="사이트 콘텐츠 JSON" value={contentText} onChange={(event) => setContentText(event.target.value)} disabled={!contentReady} spellCheck={false} style={{ ...inputStyle, minHeight: 460, fontFamily: 'Consolas, monospace', lineHeight: 1.55, opacity: contentReady ? 1 : .55 }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}><button type="button" disabled={busy || !contentReady} style={{ ...primaryStyle, opacity: contentReady ? 1 : .55 }} onClick={saveContent}>저장</button></div>
            </section>}

            {view === 'notices' && <section style={cardStyle}>
                <SectionTitle title="홈 공지 운영" description={`등록된 공지 ${notices.length}개입니다. 공지 작성·수정·삭제는 즉시 공개 사이트에 반영됩니다.`} onRefresh={() => void run(refreshNotices)} busy={busy} />
                <button type="button" style={primaryStyle} onClick={() => setDraft(emptyNotice())}>새 공지</button>
                {draft && <form onSubmit={saveDraft} style={{ ...cardStyle, margin: '18px 0', display: 'grid', gap: 10 }}>
                    <input required aria-label="공지 분류" placeholder="분류" value={draft.badge || ''} onChange={(event) => setDraft({ ...draft, badge: event.target.value })} style={inputStyle} />
                    <input required aria-label="공지 날짜" type="date" value={draft.date || ''} onChange={(event) => setDraft({ ...draft, date: event.target.value })} style={inputStyle} />
                    <input required aria-label="공지 제목" placeholder="제목" value={draft.title || ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })} style={inputStyle} />
                    <input aria-label="공지 요약" placeholder="요약" value={draft.summary || ''} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} style={inputStyle} />
                    <textarea required aria-label="공지 본문" placeholder="본문" value={draft.body || ''} onChange={(event) => setDraft({ ...draft, body: event.target.value })} style={{ ...inputStyle, minHeight: 140 }} />
                    <div style={{ display: 'flex', gap: 10 }}><button type="submit" disabled={busy} style={primaryStyle}>저장</button><button type="button" style={secondaryStyle} onClick={() => setDraft(null)}>취소</button></div>
                </form>}
                <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
                    {notices.map((notice) => <article key={notice.id} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 15 }}>
                        <small style={{ color: '#f5d76e' }}>{notice.badge} · {notice.date}</small><h3 style={{ margin: '6px 0' }}>{notice.title}</h3><p style={{ color: 'rgba(255,255,255,.68)', margin: '0 0 12px' }}>{notice.summary}</p>
                        <div style={{ display: 'flex', gap: 8 }}><button type="button" style={secondaryStyle} onClick={() => setDraft(notice)}>수정</button><button type="button" style={dangerStyle} onClick={() => deleteNotice(notice.id)}>삭제</button></div>
                    </article>)}
                </div>
            </section>}

            {view === 'licenses' && <section style={cardStyle}>
                <SectionTitle title="라이선스 발급·회수" description={`현재 불러온 라이선스 ${licenses.length}개입니다. 발급, 회수, 연장, 강제 로그아웃 등 전체 작업은 이 화면과 전체 운영 도구에서 수행할 수 있습니다.`} onRefresh={() => void run(refreshLicenses)} busy={busy} />
                <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
                    <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>제품<select value={issuePlatform} onChange={(event) => setIssuePlatform(event.target.value)} style={inputStyle}><option>LEWORD</option><option>NAVER</option><option>ORBIT</option><option>TISTORY</option><option>LEADERNAM</option></select></label>
                    <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>유형<select value={issueType} onChange={(event) => setIssueType(event.target.value)} style={inputStyle}><option value="CUSTOM">기간 지정</option><option value="MONTHLY">월간</option><option value="YEARLY">연간</option><option value="UNLIMITED">무제한</option></select></label>
                    {issueType === 'CUSTOM' && <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>사용일<input inputMode="numeric" value={issueDays} onChange={(event) => setIssueDays(event.target.value)} style={inputStyle} /></label>}
                    <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>발급 수<input inputMode="numeric" value={issueCount} onChange={(event) => setIssueCount(event.target.value)} style={inputStyle} /></label>
                    <button type="button" disabled={busy} style={{ ...primaryStyle, alignSelf: 'end' }} onClick={issueLicense}>라이선스 발급</button>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>{licenses.map((item, index) => {
                    const code = firstText(item, ['code']);
                    const used = text(item.used).toLowerCase() === 'true';
                    return <article key={code || index} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 15, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
                        <div><strong style={{ fontFamily: 'Consolas, monospace', color: '#f5d76e' }}>{code || '코드 없음'}</strong><p style={{ margin: '7px 0 0', color: 'rgba(255,255,255,.7)' }}>{firstText(item, ['platform'], '제품 미지정')} · {firstText(item, ['type'], '유형 미지정')} · {used ? '사용 중' : '미사용'}<br />사용자: {firstText(item, ['user', 'who'], '-')} · 만료: {firstText(item, ['expiresAt'], '-')}</p></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button type="button" disabled={busy || !code} style={dangerStyle} onClick={() => revokeLicense(code)}>회수</button></div>
                    </article>;
                })}</div>
                {licenses.length === 0 && <p style={{ color: 'rgba(255,255,255,.65)' }}>표시할 라이선스가 없습니다.</p>}
            </section>}

            {view === 'trials' && <section style={cardStyle}>
                <SectionTitle title="체험 사용자 관리" description={`현재 불러온 체험 사용자 ${trials.length}명입니다. 이메일별 차단과 차단 해제를 즉시 처리할 수 있습니다.`} onRefresh={() => void run(refreshTrials)} busy={busy} />
                <div style={{ display: 'grid', gap: 10 }}>{trials.map((item, index) => {
                    const email = firstText(item, ['email'], '이메일 없음');
                    const blocked = text(item.blocked).toLowerCase() === 'true';
                    return <article key={`${email}-${index}`} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 15, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
                        <div><strong>{email}</strong><p style={{ margin: '7px 0 0', color: 'rgba(255,255,255,.7)' }}>상태: <span style={{ color: blocked ? '#ff879a' : '#76e6bf' }}>{blocked ? '차단됨' : '사용 가능'}</span> · 시작: {firstText(item, ['startedAt', 'createdAt', 'date'], '-')}<br />{firstText(item, ['blockReason', 'reason'])}</p></div>
                        <button type="button" disabled={busy || email === '이메일 없음'} style={blocked ? secondaryStyle : dangerStyle} onClick={() => toggleTrial(item)}>{blocked ? '차단 해제' : '차단'}</button>
                    </article>;
                })}</div>
                {trials.length === 0 && <p style={{ color: 'rgba(255,255,255,.65)' }}>등록된 체험 사용자가 없습니다.</p>}
            </section>}

            {view === 'orders' && <section style={cardStyle}>
                <SectionTitle title="계좌이체 주문 관리" description={`대기 주문 ${orders.filter((order) => order.status === 'pending').length}건 · 전체 ${orders.length}건입니다. 입금을 확인하면 라이선스를 발급하고, 잘못된 주문은 거절할 수 있습니다.`} onRefresh={() => void run(refreshOrders)} busy={busy} />
                <div style={{ display: 'grid', gap: 10 }}>{orders.map((order) => <article key={order.orderId} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 15 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}><strong>{order.product || '상품 미확인'}</strong><span style={{ color: order.status === 'pending' ? '#f5d76e' : order.status === 'approved' ? '#76e6bf' : '#ff879a', fontWeight: 800 }}>{order.status}</span></div>
                    <p style={{ margin: '9px 0', color: 'rgba(255,255,255,.76)', lineHeight: 1.6 }}>{order.name} · {order.email}<br />{new Intl.NumberFormat('ko-KR').format(order.amount || 0)}원 · {order.createdAt || order.orderId}</p>
                    {order.licenseCode && <p style={{ margin: '0 0 10px', fontFamily: 'Consolas, monospace', color: '#f5d76e' }}>라이선스: {order.licenseCode}</p>}
                    {order.status === 'pending' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" disabled={busy} style={primaryStyle} onClick={() => processOrder(order, false)}>입금 확인 · 라이선스 발급</button><button type="button" disabled={busy} style={dangerStyle} onClick={() => processOrder(order, true)}>주문 거절</button></div>}
                </article>)}</div>
                {orders.length === 0 && <p style={{ color: 'rgba(255,255,255,.65)' }}>표시할 계좌이체 주문이 없습니다.</p>}
            </section>}

            {view === 'community' && <section style={{ display: 'grid', gap: 16 }}>
                <section style={cardStyle}><SectionTitle title="후기 관리" description={`후기 ${reviews.length}건입니다. 승인하면 공개되고, 거절하면 비공개 처리됩니다.`} onRefresh={() => void run(refreshCommunity)} busy={busy} />
                    <div style={{ display: 'grid', gap: 10 }}>{reviews.map((item, index) => <article key={`${firstText(item, ['timestamp', 'id'])}-${index}`} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 15 }}><strong>{firstText(item, ['title', 'author'], '제목 없음')}</strong><p style={{ color: 'rgba(255,255,255,.7)', whiteSpace: 'pre-wrap' }}>{firstText(item, ['detail', 'content', 'message'])}</p><small style={{ color: '#f5d76e' }}>{firstText(item, ['author', 'email'])} · {firstText(item, ['status'], 'pending')}</small><div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button type="button" disabled={busy} style={primaryStyle} onClick={() => moderate('review-approve', item, '후기를 승인')}>승인</button><button type="button" disabled={busy} style={dangerStyle} onClick={() => moderate('review-reject', item, '후기를 거절')}>거절</button></div></article>)}</div>
                    {reviews.length === 0 && <p style={{ color: 'rgba(255,255,255,.65)' }}>표시할 후기가 없습니다.</p>}
                </section>
                <section style={cardStyle}><SectionTitle title="수익 인증 관리" description={`수익 인증 ${income.length}건입니다.`} />
                    <div style={{ display: 'grid', gap: 10 }}>{income.map((item, index) => <article key={`${firstText(item, ['id', 'timestamp'])}-${index}`} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 15 }}><strong>{firstText(item, ['title', 'author', 'amount'], '수익 인증')}</strong><p style={{ color: 'rgba(255,255,255,.7)', whiteSpace: 'pre-wrap' }}>{firstText(item, ['detail', 'content', 'description'])}</p><small style={{ color: '#f5d76e' }}>{firstText(item, ['email'])} · {firstText(item, ['status'], 'pending')}</small><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}><button type="button" disabled={busy} style={primaryStyle} onClick={() => moderate('income-approve', item, '수익 인증을 승인')}>승인</button><button type="button" disabled={busy} style={secondaryStyle} onClick={() => moderate('income-reject', item, '수익 인증을 거절')}>거절</button><button type="button" disabled={busy} style={dangerStyle} onClick={() => moderate('income-delete', item, '수익 인증을 삭제')}>삭제</button></div></article>)}</div>
                    {income.length === 0 && <p style={{ color: 'rgba(255,255,255,.65)' }}>표시할 수익 인증이 없습니다.</p>}
                </section>
                <section style={cardStyle}><SectionTitle title="활용 팁 관리" description={`활용 팁 ${tips.length}건입니다.`} />
                    <div style={{ display: 'grid', gap: 10 }}>{tips.map((item, index) => <article key={`${firstText(item, ['timestamp', 'id'])}-${index}`} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 15 }}><strong>{firstText(item, ['title', 'author'], '활용 팁')}</strong><p style={{ color: 'rgba(255,255,255,.7)', whiteSpace: 'pre-wrap' }}>{firstText(item, ['detail', 'content'])}</p><small style={{ color: '#f5d76e' }}>{firstText(item, ['email'])} · {firstText(item, ['status'], 'pending')}</small><div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button type="button" disabled={busy} style={primaryStyle} onClick={() => moderate('tip-approve', item, '활용 팁을 승인')}>승인</button><button type="button" disabled={busy} style={dangerStyle} onClick={() => moderate('tip-reject', item, '활용 팁을 거절')}>거절</button></div></article>)}</div>
                    {tips.length === 0 && <p style={{ color: 'rgba(255,255,255,.65)' }}>표시할 활용 팁이 없습니다.</p>}
                </section>
                <section style={cardStyle}><SectionTitle title="리드 관리" description={`수집된 리드 ${leads.length}건입니다. 개인정보가 포함될 수 있으므로 이 관리자 세션에서만 표시됩니다.`} />
                    <div style={{ display: 'grid', gap: 10 }}>{leads.map((item, index) => <article key={`${firstText(item, ['id', 'timestamp'])}-${index}`} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 15, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}><div><strong>{firstText(item, ['email', 'name'], '리드')}</strong><p style={{ color: 'rgba(255,255,255,.7)', marginBottom: 0 }}>{firstText(item, ['source', 'message', 'createdAt', 'timestamp'])}</p></div><button type="button" disabled={busy} style={dangerStyle} onClick={() => moderate('lead-delete', item, '리드를 삭제')}>삭제</button></article>)}</div>
                    {leads.length === 0 && <p style={{ color: 'rgba(255,255,255,.65)' }}>표시할 리드가 없습니다.</p>}
                </section>
            </section>}

            {view === 'analytics' && <section style={cardStyle}>
                <SectionTitle title="매출·방문 분석" description="GAS에 누적된 매출·방문 데이터의 현재 집계입니다. 기간별 상세 조회는 전체 운영 도구의 analytics-dashboard에서 수행할 수 있습니다." onRefresh={() => void run(refreshAnalytics)} busy={busy} />
                {analytics ? <pre style={{ ...inputStyle, margin: 0, minHeight: 300, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'Consolas, monospace', lineHeight: 1.55 }}>{JSON.stringify(analytics, null, 2)}</pre> : <p style={{ color: 'rgba(255,255,255,.65)' }}>분석 데이터를 불러오는 중입니다.</p>}
            </section>}

            {view === 'tools' && <section style={cardStyle}>
                <SectionTitle title="전체 운영 도구" description="구형 어드민의 세부 API까지 모두 현재 로그인 세션으로 호출합니다. 전용 화면에 없는 일괄 회수, 기간 연장, 사용자 강제 로그아웃, 앱 설정, 코드 풀 등은 여기서 안전하게 실행할 수 있습니다." />
                <label style={{ display: 'grid', gap: 7, fontWeight: 800 }}>작업<select value={toolAction} onChange={(event) => { const action = event.target.value as (typeof adminToolActions)[number]; setToolAction(action); setToolPayload(examplePayload(action)); setToolResult(''); }} style={inputStyle}>{adminToolActions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
                <label style={{ display: 'grid', gap: 7, fontWeight: 800, marginTop: 14 }}>요청 JSON<textarea value={toolPayload} onChange={(event) => setToolPayload(event.target.value)} spellCheck={false} style={{ ...inputStyle, minHeight: 190, fontFamily: 'Consolas, monospace', lineHeight: 1.55 }} /></label>
                <button type="button" disabled={busy} style={{ ...primaryStyle, marginTop: 14 }} onClick={runAdminTool}>선택한 관리자 작업 실행</button>
                {toolResult && <section style={{ marginTop: 18 }}><h3>최근 실행 결과</h3><textarea aria-label="최근 실행 결과" readOnly value={toolResult} spellCheck={false} style={{ ...inputStyle, minHeight: 280, fontFamily: 'Consolas, monospace', lineHeight: 1.55 }} /></section>}
            </section>}
        </section>
    </main>;
}

export default AdminPage;
