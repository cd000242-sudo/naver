import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

type SignalItem = {
    keyword: string;
    title?: string;
    description: string;
    source: string;
    priority?: number;
};

type PublicKeyword = {
    id: string;
    rank: number;
    keyword: string;
    grade: string;
    freshness: 'live' | 'warm' | 'aging';
    isMeasured: boolean;
    publicSearchVolumeLabel: string;
    publicDocumentCountLabel: string;
    publicReason: string;
    updatedAt: string;
};

type PublicLivePayload = {
    ok: true;
    updatedAt: string;
    boardTarget: number;
    boardCount: number;
    lockedCount: number;
    publicPreviewCount: number;
    running: boolean;
    measurementSourceLabel: string;
    previewPolicyLabel: string;
    statusMessage?: string;
    publicPreview: PublicKeyword[];
};

type ProBoardItem = PublicKeyword & {
    totalSearchVolume?: number | null;
    documentCount?: number | null;
    goldenRatio?: number | null;
    cpc?: number | null;
    source?: string;
    evidence?: string[];
};

type ProSnapshot = {
    boardTarget: number;
    boardCount: number;
    running: boolean;
    board: ProBoardItem[];
    boardUpdatedAt?: string;
    lastMessage?: string;
};

type WebSession = {
    accessToken: string;
    userId: string;
    tier: string;
    source: string;
    apiBaseUrl?: string;
    linkedAt?: string;
    message?: string;
};

const C = {
    bg: '#07111f',
    bg2: '#0c1626',
    panel: '#101b2d',
    panel2: '#16243a',
    line: '#2d3f5d',
    text: '#f7fbff',
    muted: '#9fb1c8',
    gold: '#f8c21b',
    lime: '#9cff38',
    green: '#16c784',
    red: '#ff4d58',
    orange: '#ff7a2f',
    blue: '#35b7ff',
};

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
const isLocalHost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
const defaultApiBase = isLocalHost ? 'http://141.164.59.17' : 'https://141.164.59.17.sslip.io';
const LEWORD_API_BASE = (env.VITE_LEWORD_API_BASE_URL || defaultApiBase).replace(/\/+$/, '');

const fallbackLive: PublicLivePayload = {
    ok: true,
    updatedAt: new Date().toISOString(),
    boardTarget: 60,
    boardCount: 0,
    lockedCount: 0,
    publicPreviewCount: 0,
    running: false,
    measurementSourceLabel: 'Naver SearchAd + Naver Blog Search',
    previewPolicyLabel: '하위 5개 공개',
    statusMessage: 'LEWORD 서버 연결을 기다리는 중입니다.',
    publicPreview: [],
};

const fallbackSignals = {
    realtime: [
        { keyword: '여름 원피스 추천', description: '시즌 수요가 붙는 흐름입니다. 추천, 코디, 사이즈 비교로 쪼개서 검증합니다.', source: '네이버' },
        { keyword: '장마 준비물', description: '생활 정보와 구매 의도가 동시에 붙는 후보입니다.', source: '다음' },
        { keyword: '오늘 방송 출연진', description: '방송 직후 회차, 재방송, 출연진, 결말 키워드로 빠르게 선점합니다.', source: '네이트' },
        { keyword: '여름휴가 숙소', description: '지역, 가격, 예약 시점으로 나누면 바로 작성 가능한 후보가 됩니다.', source: 'Google' },
    ],
    policy: [
        { keyword: '근로장려금 지급일', description: '신청기간, 대상자, 지급일처럼 검색 의도가 뚜렷합니다.', source: '정책브리핑' },
        { keyword: '청년 월세 지원 조건', description: '조건, 서류, 지역 비교형으로 확장하기 좋습니다.', source: '정책브리핑' },
    ],
    issues: [
        { keyword: '신작 드라마 출연진', description: '몇부작, 원작, 인물관계도, 결말예상으로 바로 확장합니다.', source: '연예 이슈' },
        { keyword: '대표팀 경기 일정', description: '중계, 명단, 하이라이트 의도가 붙는 빠른 선점 후보입니다.', source: '스포츠 이슈' },
    ],
};

function formatNumber(value: number | null | undefined) {
    if (value === null || value === undefined || Number.isNaN(value)) return '-';
    return new Intl.NumberFormat('ko-KR').format(value);
}

function formatTime(value?: string) {
    if (!value) return '대기';
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return '대기';
    return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(time);
}

function gradeStyle(grade: string): React.CSSProperties {
    const upper = grade.toUpperCase();
    if (upper === 'SSS') return { background: '#ff2d3d', color: '#fff' };
    if (upper === 'SS') return { background: C.orange, color: '#fff' };
    if (upper === 'S') return { background: C.gold, color: '#07111f' };
    return { background: '#64748b', color: '#fff' };
}

function panelStyle(extra?: React.CSSProperties): React.CSSProperties {
    return {
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        background: 'rgba(16,27,45,0.9)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.24)',
        ...extra,
    };
}

function tabStyle(active: boolean): React.CSSProperties {
    return {
        width: '100%',
        border: `1px solid ${active ? 'rgba(248,194,27,0.65)' : C.line}`,
        background: active ? 'linear-gradient(135deg, rgba(248,194,27,0.18), rgba(156,255,56,0.10))' : '#101b2d',
        color: active ? C.gold : C.muted,
        borderRadius: 8,
        padding: '12px 14px',
        textAlign: 'left',
        fontWeight: 900,
        cursor: 'pointer',
    };
}

function SignalColumn({ title, items }: { title: string; items: SignalItem[] }) {
    return (
        <section style={panelStyle({ padding: 18, minHeight: 250 })}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, color: C.gold }}>{title}</h3>
            <div style={{ display: 'grid', gap: 10 }}>
                {items.slice(0, 4).map((item) => (
                    <article key={`${title}-${item.keyword}`} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                        <strong style={{ display: 'block', fontSize: 15, color: C.text }}>{item.keyword}</strong>
                        <span style={{ display: 'block', marginTop: 5, color: C.muted, fontSize: 13, lineHeight: 1.45 }}>{item.description}</span>
                        <span style={{ display: 'inline-block', marginTop: 8, border: '1px solid rgba(53,183,255,0.42)', borderRadius: 999, padding: '4px 8px', color: '#bfe9ff', fontSize: 11, fontWeight: 900 }}>{item.source}</span>
                    </article>
                ))}
            </div>
        </section>
    );
}

function PublicKeywordRow({ item }: { item: PublicKeyword }) {
    const openSearch = (engine: 'naver' | 'google') => {
        const url = engine === 'naver'
            ? `https://search.naver.com/search.naver?query=${encodeURIComponent(item.keyword)}`
            : `https://www.google.com/search?q=${encodeURIComponent(item.keyword)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <article style={{
            display: 'grid',
            gridTemplateColumns: '44px minmax(0, 1fr) 58px',
            gap: 12,
            alignItems: 'center',
            padding: 13,
            borderRadius: 8,
            border: `1px solid ${C.line}`,
            background: 'rgba(7,17,31,0.78)',
        }}>
            <div style={{ color: C.gold, fontWeight: 1000, fontSize: 13 }}>#{item.rank}</div>
            <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 16 }}>{item.keyword}</strong>
                <span style={{ display: 'block', marginTop: 5, color: C.muted, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    검색량 {item.publicSearchVolumeLabel} · 문서수 {item.publicDocumentCountLabel} · {item.publicReason}
                </span>
            </div>
            <div style={{ ...gradeStyle(item.grade), borderRadius: 999, padding: '7px 8px', textAlign: 'center', fontSize: 12, fontWeight: 1000 }}>{item.grade}</div>
            <div style={{ gridColumn: '2 / 4', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" onClick={() => openSearch('naver')} style={smallButtonStyle()}>네이버 검색</button>
                <button type="button" onClick={() => openSearch('google')} style={smallButtonStyle()}>Google</button>
                <button type="button" style={smallButtonStyle(true)}>Pro 분석 잠금</button>
            </div>
        </article>
    );
}

function ProKeywordRow({ item, index }: { item: ProBoardItem; index: number }) {
    return (
        <article style={{
            display: 'grid',
            gridTemplateColumns: '42px minmax(210px, 1.7fr) 82px 92px 88px 70px',
            gap: 10,
            alignItems: 'center',
            padding: '12px 14px',
            borderTop: `1px solid ${C.line}`,
            minWidth: 760,
        }}>
            <span style={{ color: C.muted, fontWeight: 800 }}>{index + 1}</span>
            <strong style={{ color: C.text }}>{item.keyword}</strong>
            <span style={{ ...gradeStyle(item.grade), borderRadius: 999, padding: '6px 8px', textAlign: 'center', fontWeight: 1000, fontSize: 12 }}>{item.grade}</span>
            <span style={{ textAlign: 'right', fontWeight: 800 }}>{formatNumber(item.totalSearchVolume)}</span>
            <span style={{ textAlign: 'right', color: C.muted }}>{formatNumber(item.documentCount)}</span>
            <span style={{ textAlign: 'right', color: item.goldenRatio && item.goldenRatio >= 5 ? C.green : C.red, fontWeight: 900 }}>{item.goldenRatio?.toFixed?.(2) || '-'}</span>
        </article>
    );
}

function smallButtonStyle(pro = false): React.CSSProperties {
    return {
        border: `1px solid ${pro ? 'rgba(248,194,27,0.55)' : C.line}`,
        background: pro ? 'rgba(248,194,27,0.08)' : '#1a2a43',
        color: pro ? C.gold : C.text,
        borderRadius: 8,
        padding: '7px 10px',
        fontSize: 12,
        fontWeight: 900,
        cursor: 'pointer',
    };
}

function LoginModal({
    onClose,
    onLogin,
    loading,
    error,
}: {
    onClose: () => void;
    onLogin: (payload: { userId: string; password: string; licenseCode: string }) => void;
    loading: boolean;
    error: string;
}) {
    const [form, setForm] = useState({ userId: '', password: '', licenseCode: '' });
    const field = (key: keyof typeof form, label: string, type = 'text') => (
        <label style={{ display: 'grid', gap: 7, color: C.muted, fontSize: 13, fontWeight: 800 }}>
            {label}
            <input
                type={type}
                value={form[key]}
                onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                style={{ minHeight: 44, borderRadius: 8, border: `1px solid ${C.line}`, background: '#07111f', color: C.text, padding: '0 12px', fontSize: 15 }}
            />
        </label>
    );

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'grid', placeItems: 'center', background: 'rgba(2,6,23,0.76)', backdropFilter: 'blur(12px)', padding: 18 }}>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    onLogin(form);
                }}
                style={panelStyle({ width: 'min(460px, 100%)', padding: 22, background: '#101b2d' })}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 18 }}>
                    <div>
                        <strong style={{ display: 'block', fontSize: 22, color: C.gold }}>LEWORD Pro 로그인</strong>
                        <span style={{ display: 'block', marginTop: 5, color: C.muted, fontSize: 13 }}>앱 인증창과 같은 패널 계정/라이선스 코드로 연동합니다.</span>
                    </div>
                    <button type="button" onClick={onClose} style={smallButtonStyle()}>닫기</button>
                </div>
                <div style={{ display: 'grid', gap: 13 }}>
                    {field('userId', '아이디')}
                    {field('password', '비밀번호', 'password')}
                    {field('licenseCode', '라이선스 코드')}
                </div>
                {error && <div style={{ marginTop: 14, border: '1px solid rgba(255,77,88,0.45)', color: '#ffd1d5', background: 'rgba(255,77,88,0.12)', borderRadius: 8, padding: 12, fontSize: 13 }}>{error}</div>}
                <button
                    type="submit"
                    disabled={loading}
                    style={{ width: '100%', marginTop: 18, border: 0, borderRadius: 8, minHeight: 48, background: 'linear-gradient(135deg, #f8c21b, #9cff38)', color: '#07111f', fontWeight: 1000, cursor: loading ? 'wait' : 'pointer' }}
                >
                    {loading ? '연동 중...' : 'Pro 연동하기'}
                </button>
            </form>
        </div>
    );
}

function LewordPage() {
    const [activeTab, setActiveTab] = useState<'live' | 'signals' | 'pro' | 'workflow'>('live');
    const [live, setLive] = useState<PublicLivePayload>(fallbackLive);
    const [signals, setSignals] = useState(fallbackSignals);
    const [session, setSession] = useState<WebSession | null>(null);
    const [proSnapshot, setProSnapshot] = useState<ProSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [loginOpen, setLoginOpen] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState('');

    const progress = Math.min(100, Math.round((live.boardCount / Math.max(1, live.boardTarget)) * 100));
    const visibleProBoard = useMemo(() => (proSnapshot?.board || []).slice(0, 60), [proSnapshot]);

    useEffect(() => {
        const prev = document.title;
        document.title = 'LEWORD LIVE — 실시간 황금키워드';
        const saved = sessionStorage.getItem('leword-web-session');
        if (saved) {
            try {
                setSession(JSON.parse(saved));
            } catch {
                sessionStorage.removeItem('leword-web-session');
            }
        }
        return () => { document.title = prev; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const loadLiveBoard = async () => {
            try {
                setApiError('');
                const liveRes = await fetch(`${LEWORD_API_BASE}/v1/public/live-golden`, { cache: 'no-store' });
                if (!liveRes.ok) throw new Error(`live HTTP ${liveRes.status}`);
                const livePayload = await liveRes.json();
                if (!cancelled) setLive(livePayload);
            } catch (err) {
                if (!cancelled) {
                    setApiError((err as Error).message || 'LEWORD server connection failed');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        const loadSignals = async () => {
            try {
                const signalRes = await fetch(`${LEWORD_API_BASE}/v1/public/source-signals`, { cache: 'no-store' });
                if (!signalRes.ok) return;
                const signalPayload = await signalRes.json();
                if (!cancelled && signalPayload?.snapshot) {
                    setSignals({
                        realtime: signalPayload.snapshot.realtime || fallbackSignals.realtime,
                        policy: signalPayload.snapshot.policy || fallbackSignals.policy,
                        issues: signalPayload.snapshot.issues || fallbackSignals.issues,
                    });
                }
            } catch {
                // Keep the live board fast even when external issue feeds are slow.
            }
        };
        loadLiveBoard();
        loadSignals();
        const liveTimer = window.setInterval(loadLiveBoard, 30000);
        const signalTimer = window.setInterval(loadSignals, 45000);
        return () => {
            cancelled = true;
            window.clearInterval(liveTimer);
            window.clearInterval(signalTimer);
        };
    }, []);

    useEffect(() => {
        if (!session?.accessToken) return;
        let cancelled = false;
        const loadPro = async () => {
            try {
                const res = await fetch(`${LEWORD_API_BASE}/v1/live-golden/snapshot`, {
                    cache: 'no-store',
                    headers: { Authorization: `Bearer ${session.accessToken}` },
                });
                if (!res.ok) throw new Error(`Pro snapshot HTTP ${res.status}`);
                const payload = await res.json();
                if (!cancelled) setProSnapshot(payload.snapshot || payload.liveGolden || payload);
            } catch {
                if (!cancelled) setProSnapshot(null);
            }
        };
        loadPro();
        const timer = window.setInterval(loadPro, 45000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [session]);

    const login = async (payload: { userId: string; password: string; licenseCode: string }) => {
        setLoginLoading(true);
        setLoginError('');
        try {
            const res = await fetch(`${LEWORD_API_BASE}/v1/web/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, appId: 'com.leword.web' }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok || !data?.session?.accessToken) {
                throw new Error(data?.message || `로그인 HTTP ${res.status}`);
            }
            const nextSession = data.session as WebSession;
            setSession(nextSession);
            sessionStorage.setItem('leword-web-session', JSON.stringify(nextSession));
            setLoginOpen(false);
            setActiveTab('pro');
        } catch (err) {
            setLoginError((err as Error).message || '로그인 실패');
        } finally {
            setLoginLoading(false);
        }
    };

    const logout = () => {
        setSession(null);
        setProSnapshot(null);
        sessionStorage.removeItem('leword-web-session');
    };

    return (
        <div style={{ minHeight: '100vh', background: `radial-gradient(circle at 18% 0%, rgba(156,255,56,0.12), transparent 28%), radial-gradient(circle at 84% 3%, rgba(248,194,27,0.14), transparent 24%), ${C.bg}`, color: C.text, paddingTop: 76 }}>
            {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onLogin={login} loading={loginLoading} error={loginError} />}

            <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 18px 64px' }}>
                <section style={{ display: 'grid', gridTemplateColumns: '210px minmax(0, 1fr)', gap: 16 }}>
                    <aside style={panelStyle({ padding: 14, position: 'sticky', top: 86, alignSelf: 'start' })} className="leword-side-tabs">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px 16px' }}>
                            <span style={{ width: 36, height: 36, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #f8c21b, #9cff38)', color: C.bg, fontWeight: 1000 }}>L</span>
                            <div>
                                <strong style={{ display: 'block' }}>LEWORD</strong>
                                <span style={{ color: C.muted, fontSize: 12 }}>Live Radar</span>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gap: 8 }}>
                            <button type="button" onClick={() => setActiveTab('live')} style={tabStyle(activeTab === 'live')}>황금 보드</button>
                            <button type="button" onClick={() => setActiveTab('signals')} style={tabStyle(activeTab === 'signals')}>실시간 이슈</button>
                            <button type="button" onClick={() => setActiveTab('pro')} style={tabStyle(activeTab === 'pro')}>Pro 분석</button>
                            <button type="button" onClick={() => setActiveTab('workflow')} style={tabStyle(activeTab === 'workflow')}>연동 구조</button>
                        </div>
                    </aside>

                    <div style={{ minWidth: 0 }}>
                        <section style={panelStyle({ padding: 24, marginBottom: 16, background: 'linear-gradient(135deg, rgba(16,27,45,0.96), rgba(10,22,38,0.92))' })}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                                <div style={{ maxWidth: 760 }}>
                                    <div style={{ color: C.lime, fontSize: 13, fontWeight: 1000, textTransform: 'uppercase' }}>24H Live Golden Keyword Radar</div>
                                    <h1 style={{ margin: '10px 0 10px', fontSize: 'clamp(32px, 5vw, 54px)', lineHeight: 1.12, letterSpacing: 0 }}>
                                        실시간 이슈를 보고, 서버가 60개까지 계속 발굴합니다
                                    </h1>
                                    <p style={{ margin: 0, color: '#c8d5e7', fontSize: 17, lineHeight: 1.65 }}>
                                        네이버·다음·네이트·Google 흐름과 정책브리핑, 스타·연예·방송·스포츠 이슈를 같이 보고 검색량·문서수를 실측합니다.
                                        공개 화면은 하위 5개 맛보기만, 정확 수치와 전체 보드는 Pro에서 엽니다.
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {session ? (
                                        <>
                                            <span style={{ ...smallButtonStyle(true), cursor: 'default' }}>연동됨: {session.tier}</span>
                                            <button type="button" onClick={logout} style={smallButtonStyle()}>로그아웃</button>
                                        </>
                                    ) : (
                                        <button type="button" onClick={() => setLoginOpen(true)} style={{ border: 0, borderRadius: 8, padding: '13px 18px', background: 'linear-gradient(135deg, #f8c21b, #9cff38)', color: C.bg, fontWeight: 1000, cursor: 'pointer' }}>Pro 로그인</button>
                                    )}
                                    <Link to="/pricing" style={{ ...smallButtonStyle(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none', padding: '13px 18px' }}>이용권 보기</Link>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 10, marginTop: 22 }}>
                                <Metric label="검증 보드" value={`${live.boardCount}/${live.boardTarget}`} />
                                <Metric label="Pro 잠금" value={`${live.lockedCount}`} />
                                <Metric label="서버 상태" value={live.running ? '발굴중' : '대기'} />
                                <Metric label="최근 갱신" value={formatTime(live.updatedAt)} />
                            </div>
                            {apiError && (
                                <div style={{ marginTop: 14, border: '1px solid rgba(255,77,88,0.45)', borderRadius: 8, padding: 12, background: 'rgba(255,77,88,0.10)', color: '#ffd1d5', fontSize: 13 }}>
                                    API 연결 대기: {apiError} · 현재 사이트용 HTTPS API 기본값은 {LEWORD_API_BASE} 입니다.
                                </div>
                            )}
                        </section>

                        {activeTab === 'live' && (
                            <section style={panelStyle({ padding: 20 })}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                                    <h2 style={{ margin: 0, fontSize: 22, color: C.gold }}>LIVE 황금키워드 하위 5개</h2>
                                    <span style={{ border: '1px solid rgba(156,255,56,0.45)', color: C.lime, borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 1000 }}>{live.previewPolicyLabel}</span>
                                </div>
                                <div style={{ height: 10, borderRadius: 999, overflow: 'hidden', border: `1px solid ${C.line}`, background: '#07111f', marginBottom: 12 }}>
                                    <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #f8c21b, #9cff38)' }} />
                                </div>
                                <p style={{ margin: '0 0 14px', color: C.muted, fontSize: 13 }}>
                                    {loading ? '서버 보드 불러오는 중...' : `${live.measurementSourceLabel} 실측 기반입니다. 정확 검색량·문서수·황금비율은 Pro에서만 공개됩니다.`}
                                </p>
                                <div style={{ display: 'grid', gap: 9 }}>
                                    {live.publicPreview.length ? live.publicPreview.map((item) => <PublicKeywordRow key={item.id} item={item} />) : (
                                        <div style={{ border: `1px dashed ${C.line}`, borderRadius: 8, padding: 18, color: C.muted }}>
                                            서버가 첫 후보를 채우는 중입니다. API 키 연결과 라이브 레이더 상태를 확인하면 자동으로 표시됩니다.
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {activeTab === 'signals' && (
                            <div className="leword-signals-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
                                <SignalColumn title="실시간 검색어" items={signals.realtime} />
                                <SignalColumn title="정책브리핑" items={signals.policy} />
                                <SignalColumn title="스타·연예·이슈" items={signals.issues} />
                            </div>
                        )}

                        {activeTab === 'pro' && (
                            <section style={panelStyle({ padding: 20 })}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: 22, color: C.gold }}>Pro 전체 보드</h2>
                                        <p style={{ margin: '6px 0 0', color: C.muted, fontSize: 13 }}>로그인 후 전체 60개, 정확 검색량, 문서수, 황금비율을 확인합니다.</p>
                                    </div>
                                    {!session && <button type="button" onClick={() => setLoginOpen(true)} style={{ border: 0, borderRadius: 8, padding: '12px 16px', background: 'linear-gradient(135deg, #f8c21b, #9cff38)', color: C.bg, fontWeight: 1000, cursor: 'pointer' }}>Pro 로그인</button>}
                                </div>
                                {!session ? (
                                    <div style={{ border: '1px dashed rgba(248,194,27,0.42)', borderRadius: 8, padding: 18, color: '#dce7f6', background: 'rgba(248,194,27,0.06)' }}>
                                        앱 인증창과 같은 패널 계정/비밀번호/라이선스 코드로 로그인하면, 앱에서 보던 Pro 기능을 웹에서도 같은 서버 API로 호출합니다.
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                            {['마인드맵 확장', '정밀 분석', '트래픽 헌터 Pro', '엑셀 다운로드', '블로그 초안'].map((label) => (
                                                <button key={label} type="button" style={smallButtonStyle(true)}>{label}</button>
                                            ))}
                                        </div>
                                        <div style={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 8, background: '#07111f' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '42px minmax(210px, 1.7fr) 82px 92px 88px 70px', gap: 10, padding: '12px 14px', minWidth: 760, color: C.muted, fontSize: 12, fontWeight: 1000 }}>
                                                <span>#</span><span>키워드</span><span>등급</span><span style={{ textAlign: 'right' }}>검색량</span><span style={{ textAlign: 'right' }}>문서수</span><span style={{ textAlign: 'right' }}>비율</span>
                                            </div>
                                            {visibleProBoard.length ? visibleProBoard.map((item, index) => <ProKeywordRow key={item.id || item.keyword} item={item} index={index} />) : (
                                                <div style={{ padding: 18, color: C.muted }}>Pro 스냅샷을 불러오는 중입니다. 권한 서버 또는 토큰 검증 상태를 확인하세요.</div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </section>
                        )}

                        {activeTab === 'workflow' && (
                            <section style={panelStyle({ padding: 22 })}>
                                <h2 style={{ margin: '0 0 12px', color: C.gold }}>연동 구조</h2>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                                    {[
                                        ['1', '패널 로그인', '앱 인증창과 같은 계정/코드'],
                                        ['2', '서버 권한 토큰', '웹·앱이 같은 API 토큰 사용'],
                                        ['3', '24시간 발굴', '앱을 꺼도 서버 보드 유지'],
                                        ['4', 'Pro 기능 호출', '마인드맵·헌터·초안 전송 연결'],
                                    ].map(([num, title, desc]) => (
                                        <article key={num} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, background: '#07111f' }}>
                                            <strong style={{ color: C.lime }}>STEP {num}</strong>
                                            <h3 style={{ margin: '8px 0 6px', fontSize: 17 }}>{title}</h3>
                                            <p style={{ margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.5 }}>{desc}</p>
                                        </article>
                                    ))}
                                </div>
                                <p style={{ margin: '16px 0 0', color: C.muted, lineHeight: 1.65 }}>
                                    PC와 모바일/웹은 따로 설정하는 구조가 아닙니다. Pro 사용자는 패널 로그인만 하고, 네이버 API와 서버 작업은 LEWORD 서버가 담당합니다.
                                    GitHub Pages 운영 사이트에서는 HTTPS API 도메인 연결이 필요합니다.
                                </p>
                            </section>
                        )}
                    </div>
                </section>
            </main>

            <style>{`
                @media (max-width: 900px) {
                    .leword-side-tabs {
                        position: static !important;
                    }
                    main > section {
                        grid-template-columns: 1fr !important;
                    }
                    .leword-signals-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
                @media (max-width: 680px) {
                    main {
                        padding-left: 12px !important;
                        padding-right: 12px !important;
                    }
                }
            `}</style>
        </div>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, minWidth: 0 }}>
            <strong style={{ display: 'block', color: C.gold, fontSize: 24, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</strong>
            <span style={{ display: 'block', color: C.muted, fontSize: 12, marginTop: 4 }}>{label}</span>
        </div>
    );
}

export default LewordPage;
