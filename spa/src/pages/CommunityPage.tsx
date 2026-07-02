import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { isValidEmail, isValidPhone, maskContactText, maskEmail, maskPhone } from '../lib/privacy';

/**
 * 커뮤니티
 * - 공지사항은 관리자 게시 흐름을 유지합니다.
 * - 수익 인증/활용 팁은 실제 서버 데이터만 노출하고, 이미지/동영상+글 작성 모달을 제공합니다.
 * - 로컬 캐시 선노출 후 서버 최신화로 체감 로딩을 줄입니다.
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const COMMUNITY_CACHE_KEY = 'leaderspro_community_cache_v2';
const COMMUNITY_TIMEOUT_MS = 4800;
const MAX_MEDIA_BYTES = 18 * 1024 * 1024;

type TabKey = 'notices' | 'income' | 'tips';
type WriteKind = 'income' | 'tips';

interface Notice { badge: string; date: string; title: string; preview: string; body: string; }
interface CommunityMedia { media?: string; mediaType?: 'image' | 'video'; mediaName?: string; }
interface Income extends CommunityMedia { amount: string; author: string; date: string; desc: string; tags: string[]; email?: string; phone?: string; }
interface Tip extends CommunityMedia { author?: string; title: string; detail: string; timestamp?: string; email?: string; phone?: string; }

interface CommunityCache {
    notices: Notice[];
    income: Income[];
    tips: Tip[];
    cachedAt: number;
}

const NOTICE_BADGE_LABEL: Record<string, string> = { important: '중요', update: '업데이트', event: '이벤트', tip: '안내' };

const FALLBACK_NOTICES: Notice[] = [
    {
        badge: 'important', date: '2026.05.23',
        title: 'Better Life Naver v2.10.337 — 안정성 11건 + 봇 우회 강화',
        preview: '발행 간격 jitter, 사람형 타이핑, 세션 워밍업 등 안정성 진단 픽스 11건을 통합했습니다.',
        body: 'v2.10.337 릴리즈가 배포되었습니다. 발행 간격에 ±40% 랜덤 jitter, 사람형 가우시안 타이핑, 세션 워밍업, 연속발행 try/catch 보호, AI 클리셰 금지어 제거 등이 포함되었습니다.',
    },
    {
        badge: 'update', date: '2026.05.22',
        title: '이미지 생성 모델 강화 — gpt-image-1.5 + 나노바나나 3종 분리',
        preview: '새 이미지 모델과 품질 선택을 추가하고, 한글 텍스트 깨짐 회귀를 잡았습니다.',
        body: 'gpt-image-1.5 모델 신규 지원 + 품질 선택, 나노바나나 3종 분리(Pro/2/기본), 썸네일만 모드 본문 중복 배치 버그 수정, Gemini 원문 모드 그라운딩 OFF.',
    },
    {
        badge: 'tip', date: '2026.03.10',
        title: '환불 정책 안내',
        preview: '라이선스 코드 발급 후 7일 이내, 서비스 미사용 시 전액 환불이 가능합니다.',
        body: '전액 환불: 발급 후 7일 이내 + 미사용. 부분 환불: 활성화 후 7일 이내. 환불 불가: 7일 초과 또는 정상 이용 후.',
    },
];

const panelStyle: CSSProperties = {
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    background: 'linear-gradient(180deg, rgba(15,23,42,0.86), rgba(6,10,18,0.92))',
    boxShadow: '0 24px 70px rgba(0,0,0,0.28)',
};

const fieldStyle: CSSProperties = {
    width: '100%',
    padding: '13px 14px',
    background: '#0d121b',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
};

function firstText(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function splitTags(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map((tag) => tag.trim()).filter(Boolean);
    return [];
}

function normalizeMedia(raw: any): CommunityMedia {
    const media = firstText(raw?.proofMedia, raw?.media, raw?.mediaUrl, raw?.proofImage, raw?.image, raw?.imageUrl, raw?.video, raw?.videoUrl);
    const mediaType = firstText(raw?.mediaType).startsWith('video') || media.startsWith('data:video') ? 'video' : 'image';
    return {
        media,
        mediaType: media ? mediaType : undefined,
        mediaName: firstText(raw?.mediaName, raw?.imageName, raw?.fileName),
    };
}

function normalizeNotice(raw: any): Notice | null {
    const title = firstText(raw?.title);
    if (!title) return null;
    return {
        badge: firstText(raw?.badge, 'tip'),
        date: firstText(raw?.date, raw?.createdAt, ''),
        title,
        preview: firstText(raw?.preview, raw?.summary, raw?.body, ''),
        body: firstText(raw?.body, raw?.detail, raw?.preview, ''),
    };
}

function normalizeIncome(raw: any): Income | null {
    const desc = firstText(raw?.desc, raw?.detail, raw?.reviewText, raw?.text);
    const amount = firstText(raw?.amount, raw?.title);
    const media = normalizeMedia(raw);
    if (!desc && !media.media && !amount) return null;
    const email = firstText(raw?.publicEmail, raw?.email);
    const phone = firstText(raw?.publicPhone, raw?.phone);
    return {
        amount: amount || '수익 인증',
        author: firstText(raw?.author, raw?.name, raw?.nickname, '익명'),
        date: firstText(raw?.date, raw?.timestamp, raw?.createdAt, ''),
        desc: maskContactText(desc || '수익인증 자료를 등록했습니다.'),
        tags: splitTags(raw?.tags),
        email: email ? (email.includes('*') ? email : maskEmail(email)) : '',
        phone: phone ? (phone.includes('*') ? phone : maskPhone(phone)) : '',
        ...media,
    };
}

function normalizeTip(raw: any): Tip | null {
    const title = firstText(raw?.title);
    const detail = firstText(raw?.detail, raw?.desc, raw?.text);
    const media = normalizeMedia(raw);
    if (!title && !detail && !media.media) return null;
    const email = firstText(raw?.publicEmail, raw?.email);
    const phone = firstText(raw?.publicPhone, raw?.phone);
    return {
        author: firstText(raw?.author, raw?.name, raw?.nickname, '익명'),
        title: title || '활용 팁',
        detail: maskContactText(detail || '이미지/영상으로 공유한 활용 팁입니다.'),
        timestamp: firstText(raw?.timestamp, raw?.createdAt, raw?.date),
        email: email ? (email.includes('*') ? email : maskEmail(email)) : '',
        phone: phone ? (phone.includes('*') ? phone : maskPhone(phone)) : '',
        ...media,
    };
}

function readCommunityCache(): CommunityCache | null {
    try {
        const raw = window.localStorage.getItem(COMMUNITY_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CommunityCache;
        if (!parsed || !Array.isArray(parsed.notices) || !Array.isArray(parsed.income) || !Array.isArray(parsed.tips)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeCommunityCache(cache: CommunityCache) {
    try {
        window.localStorage.setItem(COMMUNITY_CACHE_KEY, JSON.stringify({
            notices: cache.notices.slice(0, 80),
            income: cache.income.slice(0, 80),
            tips: cache.tips.slice(0, 80),
            cachedAt: Date.now(),
        }));
    } catch {
        /* cache is optional */
    }
}

async function fetchCommunityAction(action: string, signal: AbortSignal) {
    const res = await fetch(`${GAS_URL}?action=${action}`, { cache: 'no-store', signal });
    return res.json();
}

function CommunityPage() {
    const [tab, setTab] = useState<TabKey>('notices');
    const [notices, setNotices] = useState<Notice[]>(FALLBACK_NOTICES);
    const [income, setIncome] = useState<Income[]>([]);
    const [tips, setTips] = useState<Tip[]>([]);
    const [loading, setLoading] = useState(true);
    const [openNotice, setOpenNotice] = useState<number | null>(null);
    const [writer, setWriter] = useState<WriteKind | null>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = '커뮤니티 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    const refreshCommunity = useCallback(async (silent = false) => {
        const cached = readCommunityCache();
        if (cached) {
            setNotices(cached.notices.length ? cached.notices : FALLBACK_NOTICES);
            setIncome(cached.income);
            setTips(cached.tips);
            setLoading(false);
        } else if (!silent) {
            setLoading(true);
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), COMMUNITY_TIMEOUT_MS);
        try {
            const [noticeResult, incomeResult, tipResult] = await Promise.allSettled([
                fetchCommunityAction('get-notices', controller.signal),
                fetchCommunityAction('income-list', controller.signal),
                fetchCommunityAction('get-tips', controller.signal),
            ]);

            const nextNotices = noticeResult.status === 'fulfilled' && noticeResult.value?.success
                ? (noticeResult.value.notices || []).map(normalizeNotice).filter(Boolean) as Notice[]
                : cached?.notices || FALLBACK_NOTICES;
            const nextIncome = incomeResult.status === 'fulfilled' && incomeResult.value?.success
                ? (incomeResult.value.income || []).map(normalizeIncome).filter(Boolean) as Income[]
                : cached?.income || [];
            const nextTips = tipResult.status === 'fulfilled' && tipResult.value?.success
                ? (tipResult.value.tips || []).map(normalizeTip).filter(Boolean) as Tip[]
                : cached?.tips || [];

            setNotices(nextNotices.length ? nextNotices : FALLBACK_NOTICES);
            setIncome(nextIncome);
            setTips(nextTips);
            writeCommunityCache({
                notices: nextNotices.length ? nextNotices : FALLBACK_NOTICES,
                income: nextIncome,
                tips: nextTips,
                cachedAt: Date.now(),
            });
        } catch {
            if (!cached) {
                setNotices(FALLBACK_NOTICES);
                setIncome([]);
                setTips([]);
            }
        } finally {
            window.clearTimeout(timer);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshCommunity();
    }, [refreshCommunity]);

    return (
        <div style={{ position: 'relative', zIndex: 1 }}>
            <style>{`
                .community-field::placeholder { color: rgba(226,232,240,0.64); opacity: 1; }
                .community-field:focus {
                    border-color: rgba(68,215,182,0.76) !important;
                    box-shadow: 0 0 0 3px rgba(68,215,182,0.14) !important;
                }
                .community-write-button:hover,
                .community-card:hover { transform: translateY(-2px); }
                @media (max-width: 720px) {
                    .community-grid { grid-template-columns: 1fr !important; }
                    .community-modal-grid { grid-template-columns: 1fr !important; }
                }
            `}</style>
            <section style={{ padding: '140px 20px 100px', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, marginBottom: 34, flexWrap: 'wrap' }}>
                    <div>
                        <span style={{ display: 'inline-flex', minHeight: 30, alignItems: 'center', padding: '6px 14px', background: 'rgba(68,215,182,0.10)', border: '1px solid rgba(68,215,182,0.28)', borderRadius: 8, color: '#44d7b6', fontSize: 12, fontWeight: 900, letterSpacing: 0, marginBottom: 16 }}>COMMUNITY</span>
                        <h1 style={{ fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 900, marginBottom: 12 }}>Leaders Pro 커뮤니티</h1>
                        <p style={{ color: 'rgba(255,255,255,0.66)', fontSize: 16, lineHeight: 1.7, margin: 0 }}>공지사항, 실제 수익 인증, 운영자가 직접 남긴 활용 팁을 확인하세요.</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {tab === 'income' && <WriteButton label="수익인증 작성" onClick={() => setWriter('income')} />}
                        {tab === 'tips' && <WriteButton label="활용팁 작성" onClick={() => setWriter('tips')} />}
                        <button
                            type="button"
                            onClick={() => refreshCommunity(true)}
                            style={{ minHeight: 42, padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: '#e5edf7', fontWeight: 800, cursor: 'pointer' }}
                        >
                            새로고침
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 34, flexWrap: 'wrap' }}>
                    {(
                        [
                            ['notices', '공지사항'],
                            ['income', '수익 인증'],
                            ['tips', '활용 팁'],
                        ] as Array<[TabKey, string]>
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            style={{
                                minHeight: 44,
                                padding: '10px 22px',
                                borderRadius: 8,
                                background: tab === key ? '#16c47f' : 'rgba(255,255,255,0.06)',
                                border: tab === key ? '1px solid rgba(68,215,182,0.7)' : '1px solid rgba(255,255,255,0.10)',
                                color: tab === key ? '#061018' : 'rgba(255,255,255,0.72)',
                                fontWeight: 900,
                                cursor: 'pointer',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {loading && (
                    <div style={{ ...panelStyle, padding: 24, marginBottom: 24, color: 'rgba(255,255,255,0.70)' }}>
                        캐시를 확인하면서 최신 커뮤니티 데이터를 불러오는 중입니다.
                    </div>
                )}

                {tab === 'notices' && <NoticesPanel notices={notices} openIdx={openNotice} onToggle={(i) => setOpenNotice(openNotice === i ? null : i)} />}
                {tab === 'income' && <IncomePanel items={income} onWrite={() => setWriter('income')} />}
                {tab === 'tips' && <TipsPanel items={tips} onWrite={() => setWriter('tips')} />}
            </section>

            {writer && (
                <CommunityWriteModal
                    kind={writer}
                    onClose={() => setWriter(null)}
                    onSubmitted={() => {
                        setWriter(null);
                        refreshCommunity(true);
                    }}
                />
            )}
        </div>
    );
}

function WriteButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="community-write-button"
            onClick={onClick}
            style={{
                minHeight: 42,
                padding: '10px 18px',
                borderRadius: 8,
                border: '1px solid rgba(68,215,182,0.46)',
                background: '#16c47f',
                color: '#061018',
                fontWeight: 900,
                cursor: 'pointer',
                transition: 'transform .18s ease',
            }}
        >
            {label}
        </button>
    );
}

function MediaView({ item, height = 230 }: { item: CommunityMedia; height?: number }) {
    if (!item.media) return null;
    return item.mediaType === 'video' ? (
        <video src={item.media} controls playsInline style={{ width: '100%', height, objectFit: 'cover', display: 'block', background: '#050812' }} />
    ) : (
        <img src={item.media} alt={item.mediaName || '커뮤니티 첨부 이미지'} style={{ width: '100%', height, objectFit: 'cover', display: 'block', background: '#050812' }} />
    );
}

function EmptyState({ title, desc, action, onWrite }: { title: string; desc: string; action: string; onWrite: () => void }) {
    return (
        <div style={{ ...panelStyle, padding: '44px 26px', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 24 }}>{title}</h2>
            <p style={{ margin: '0 auto 22px', maxWidth: 560, color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>{desc}</p>
            <WriteButton label={action} onClick={onWrite} />
        </div>
    );
}

function NoticesPanel({ notices, openIdx, onToggle }: { notices: Notice[]; openIdx: number | null; onToggle: (i: number) => void }) {
    const badgeColor = (badge: string) => {
        switch (badge) {
            case 'important': return { bg: 'rgba(255,92,117,0.15)', color: '#ff8798', border: 'rgba(255,92,117,0.30)' };
            case 'update': return { bg: 'rgba(56,189,248,0.13)', color: '#7dd3fc', border: 'rgba(56,189,248,0.30)' };
            case 'event': return { bg: 'rgba(68,215,182,0.13)', color: '#8ff5d4', border: 'rgba(68,215,182,0.30)' };
            default: return { bg: 'rgba(244,201,93,0.12)', color: '#f4c95d', border: 'rgba(244,201,93,0.30)' };
        }
    };

    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {notices.map((notice, index) => {
                const open = openIdx === index;
                const colors = badgeColor(notice.badge);
                return (
                    <article
                        key={`${notice.title}-${index}`}
                        onClick={() => onToggle(index)}
                        style={{ ...panelStyle, padding: 24, marginBottom: 14, cursor: 'pointer' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 900, background: colors.bg, color: colors.color, border: `1px solid ${colors.border}` }}>{NOTICE_BADGE_LABEL[notice.badge] || notice.badge}</span>
                            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{notice.date}</span>
                        </div>
                        <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>{notice.title}</h3>
                        <p style={{ color: 'rgba(255,255,255,0.64)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{notice.preview}</p>
                        <div style={{ maxHeight: open ? 700 : 0, overflow: 'hidden', transition: 'max-height 0.25s ease' }}>
                            <div
                                style={{ paddingTop: 14, marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 14, color: 'rgba(255,255,255,0.74)', lineHeight: 1.8 }}
                                dangerouslySetInnerHTML={{ __html: notice.body }}
                            />
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

function IncomePanel({ items, onWrite }: { items: Income[]; onWrite: () => void }) {
    if (items.length === 0) {
        return <EmptyState title="아직 공개된 수익인증이 없습니다" desc="더미 수익인증은 표시하지 않습니다. 실제 이미지/영상과 글이 승인되면 이곳에 노출됩니다." action="수익인증 작성" onWrite={onWrite} />;
    }

    return (
        <div className="community-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
            {items.map((item, index) => (
                <article key={`${item.amount}-${index}`} className="community-card" style={{ ...panelStyle, overflow: 'hidden', transition: 'transform .18s ease' }}>
                    {item.media ? (
                        <MediaView item={item} />
                    ) : (
                        <div style={{ height: 180, background: 'linear-gradient(135deg, rgba(68,215,182,0.22), rgba(244,201,93,0.12))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 34, fontWeight: 900, color: '#f4c95d' }}>{item.amount}</span>
                        </div>
                    )}
                    <div style={{ padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                            <div>
                                <b style={{ display: 'block', color: '#f4c95d', fontSize: 13, marginBottom: 6 }}>수익인증</b>
                                <h3 style={{ margin: 0, fontSize: 23, lineHeight: 1.2 }}>{item.amount}</h3>
                            </div>
                            {item.date && <span style={{ color: 'rgba(255,255,255,0.48)', fontSize: 12, whiteSpace: 'nowrap' }}>{item.date}</span>}
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 1.72, margin: '0 0 14px', whiteSpace: 'pre-wrap' }}>{item.desc}</p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                            <span style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>{item.author}</span>
                            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{item.phone || item.email}</span>
                        </div>
                        {item.tags.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {item.tags.map((tag) => (
                                    <span key={tag} style={{ background: 'rgba(244,201,93,0.10)', color: '#f4c95d', fontSize: 11, padding: '4px 9px', borderRadius: 999, border: '1px solid rgba(244,201,93,0.24)' }}>{tag}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </article>
            ))}
        </div>
    );
}

function TipsPanel({ items, onWrite }: { items: Tip[]; onWrite: () => void }) {
    if (items.length === 0) {
        return <EmptyState title="아직 공개된 활용 팁이 없습니다" desc="실제 사용자가 이미지/영상과 함께 남긴 활용 팁만 공개됩니다." action="활용팁 작성" onWrite={onWrite} />;
    }

    return (
        <div className="community-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
            {items.map((tip, index) => (
                <article key={`${tip.title}-${index}`} className="community-card" style={{ ...panelStyle, overflow: 'hidden', transition: 'transform .18s ease' }}>
                    {tip.media && <MediaView item={tip} height={190} />}
                    <div style={{ padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                            <span style={{ color: '#44d7b6', fontSize: 12, fontWeight: 900 }}>활용 팁</span>
                            {tip.timestamp && <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: 11 }}>{new Date(tip.timestamp).toLocaleDateString('ko-KR')}</span>}
                        </div>
                        <h3 style={{ fontSize: 18, lineHeight: 1.42, margin: '0 0 10px' }}>{tip.title}</h3>
                        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.74)', lineHeight: 1.72, whiteSpace: 'pre-wrap', margin: '0 0 14px' }}>{tip.detail}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: 'rgba(255,255,255,0.48)', fontSize: 12 }}>
                            <span>{tip.author}</span>
                            <span>{tip.phone || tip.email}</span>
                        </div>
                    </div>
                </article>
            ))}
            <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'rgba(255,255,255,0.46)', fontSize: 13, marginTop: 20 }}>
                더 많은 정보는 <Link to="/reviews" style={{ color: '#44d7b6' }}>후기</Link> 또는 <a href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener noreferrer" style={{ color: '#44d7b6' }}>카카오톡 채널</a>에서 확인하세요.
            </p>
        </div>
    );
}

function CommunityWriteModal({ kind, onClose, onSubmitted }: { kind: WriteKind; onClose: () => void; onSubmitted: () => void }) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const isIncome = kind === 'income';
    const [form, setForm] = useState({
        author: '',
        email: '',
        phone: '',
        amount: '',
        date: '',
        title: '',
        detail: '',
        tags: '',
    });
    const [media, setMedia] = useState('');
    const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
    const [mediaName, setMediaName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

    const handleMediaChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            setMsg({ type: 'error', text: '이미지 또는 동영상 파일만 선택할 수 있습니다.' });
            return;
        }
        if (file.size > MAX_MEDIA_BYTES) {
            setMsg({ type: 'error', text: '파일은 18MB 이하로 선택해주세요.' });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setMedia(String(reader.result || ''));
            setMediaName(file.name);
            setMediaType(file.type.startsWith('video/') ? 'video' : 'image');
            setMsg(null);
        };
        reader.onerror = () => setMsg({ type: 'error', text: '파일을 읽지 못했습니다. 다른 파일을 선택해주세요.' });
        reader.readAsDataURL(file);
    };

    const submit = async () => {
        if (!form.author.trim()) { setMsg({ type: 'error', text: '닉네임을 입력해주세요.' }); return; }
        if (!form.email.trim() || !isValidEmail(form.email)) { setMsg({ type: 'error', text: '정확한 이메일을 입력해주세요.' }); return; }
        if (!form.phone.trim() || !isValidPhone(form.phone)) { setMsg({ type: 'error', text: '정확한 휴대폰 번호를 입력해주세요.' }); return; }
        if (!media) { setMsg({ type: 'error', text: '이미지 또는 동영상을 선택해주세요.' }); return; }
        if (isIncome && !form.amount.trim()) { setMsg({ type: 'error', text: '수익 금액을 입력해주세요.' }); return; }
        if (!isIncome && !form.title.trim()) { setMsg({ type: 'error', text: '제목을 입력해주세요.' }); return; }
        if (!form.detail.trim()) { setMsg({ type: 'error', text: isIncome ? '수익인증 글을 작성해주세요.' : '활용 팁 글을 작성해주세요.' }); return; }

        setSubmitting(true);
        setMsg(null);
        try {
            const maskedDetail = maskContactText(form.detail.trim());
            const payload = isIncome
                ? {
                    action: 'income-submit',
                    author: form.author.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim(),
                    publicEmail: maskEmail(form.email),
                    publicPhone: maskPhone(form.phone),
                    amount: form.amount.trim(),
                    date: form.date.trim(),
                    desc: maskedDetail,
                    tags: form.tags.trim(),
                    proofMedia: media,
                    image: media,
                    media,
                    mediaType,
                    mediaName,
                    timestamp: new Date().toISOString(),
                }
                : {
                    action: 'submit-tip',
                    author: form.author.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim(),
                    publicEmail: maskEmail(form.email),
                    publicPhone: maskPhone(form.phone),
                    title: form.title.trim(),
                    detail: maskedDetail,
                    proofMedia: media,
                    image: media,
                    media,
                    mediaType,
                    mediaName,
                    timestamp: new Date().toISOString(),
                };
            const res = await fetch(GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                setMsg({ type: 'success', text: '접수되었습니다. 검토 후 공개됩니다.' });
                window.setTimeout(onSubmitted, 500);
            } else {
                setMsg({ type: 'error', text: data.message || '등록 실패. 다시 시도해주세요.' });
            }
        } catch (error: any) {
            setMsg({ type: 'error', text: `오류: ${error?.message || '서버 연결 실패'}` });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={isIncome ? '수익인증 작성' : '활용 팁 작성'}
            onClick={() => { if (!submitting) onClose(); }}
            style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, background: 'rgba(2,6,12,0.78)', backdropFilter: 'blur(10px)' }}
        >
            <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(680px, 100%)', maxHeight: 'calc(100vh - 36px)', overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(68,215,182,0.28)', background: '#101721', boxShadow: '0 30px 90px rgba(0,0,0,0.48)', color: '#fff' }}>
                <div style={{ padding: '26px 28px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                        <h2 style={{ margin: '0 0 8px', fontSize: 26 }}>{isIncome ? '수익인증 작성' : '활용 팁 작성'}</h2>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6 }}>이메일과 휴대폰 번호는 검토용이며 공개 영역에서는 마스킹됩니다.</p>
                    </div>
                    <button type="button" onClick={onClose} style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#0b111a', color: '#fff', fontSize: 20, cursor: 'pointer' }}>x</button>
                </div>

                <div style={{ padding: 28 }}>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleMediaChange} style={{ display: 'none' }} />
                    <button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: '100%', minHeight: 48, borderRadius: 8, border: '1px solid rgba(68,215,182,0.42)', background: 'rgba(68,215,182,0.10)', color: '#8ff5d4', fontWeight: 900, cursor: 'pointer', marginBottom: 12 }}>
                        {media ? '파일 다시 선택하기' : '이미지 또는 동영상 선택하기'}
                    </button>
                    {media && (
                        <div style={{ marginBottom: 16, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, background: '#080d14', overflow: 'hidden' }}>
                            {mediaType === 'video' ? (
                                <video src={media} controls playsInline style={{ width: '100%', maxHeight: 320, display: 'block' }} />
                            ) : (
                                <img src={media} alt="선택한 첨부 미리보기" style={{ width: '100%', maxHeight: 280, objectFit: 'contain', display: 'block' }} />
                            )}
                            <div style={{ padding: '9px 12px', color: 'rgba(255,255,255,0.58)', fontSize: 12 }}>{mediaName}</div>
                        </div>
                    )}

                    <div className="community-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <input className="community-field" value={form.author} maxLength={20} onChange={(event) => update('author', event.target.value)} placeholder="닉네임 필수" style={fieldStyle} />
                        <input className="community-field" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="이메일 필수" style={fieldStyle} />
                    </div>
                    <input className="community-field" type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="휴대폰 번호 필수" style={{ ...fieldStyle, marginBottom: 12 }} />

                    {isIncome ? (
                        <>
                            <div className="community-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                <input className="community-field" value={form.amount} maxLength={50} onChange={(event) => update('amount', event.target.value)} placeholder="수익 금액 예: 월 127만원" style={fieldStyle} />
                                <input className="community-field" value={form.date} maxLength={20} onChange={(event) => update('date', event.target.value)} placeholder="시점 예: 2026.07" style={fieldStyle} />
                            </div>
                            <textarea className="community-field" value={form.detail} maxLength={800} rows={5} onChange={(event) => update('detail', event.target.value)} placeholder="어떤 제품으로 어떻게 성과가 났는지 작성해주세요. 본문 속 연락처는 자동으로 가려집니다." style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.65, marginBottom: 12 }} />
                            <input className="community-field" value={form.tags} maxLength={200} onChange={(event) => update('tags', event.target.value)} placeholder="태그 선택, 콤마 구분" style={{ ...fieldStyle, marginBottom: 14 }} />
                        </>
                    ) : (
                        <>
                            <input className="community-field" value={form.title} maxLength={100} onChange={(event) => update('title', event.target.value)} placeholder="제목 필수" style={{ ...fieldStyle, marginBottom: 12 }} />
                            <textarea className="community-field" value={form.detail} maxLength={1500} rows={6} onChange={(event) => update('detail', event.target.value)} placeholder="활용 팁을 이미지/영상과 함께 자세히 작성해주세요. 본문 속 연락처는 자동으로 가려집니다." style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.65, marginBottom: 14 }} />
                        </>
                    )}

                    <button onClick={submit} disabled={submitting} style={{ width: '100%', minHeight: 50, borderRadius: 8, border: 'none', background: submitting ? '#233044' : '#16c47f', color: submitting ? 'rgba(255,255,255,0.5)' : '#061018', fontSize: 15, fontWeight: 900, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                        {submitting ? '등록 중...' : isIncome ? '수익인증 등록하기' : '활용팁 등록하기'}
                    </button>
                    {msg && (
                        <div style={{ marginTop: 14, padding: 13, borderRadius: 8, textAlign: 'center', fontSize: 13, background: msg.type === 'success' ? 'rgba(68,215,182,0.10)' : 'rgba(255,92,117,0.10)', border: `1px solid ${msg.type === 'success' ? 'rgba(68,215,182,0.34)' : 'rgba(255,92,117,0.28)'}`, color: msg.type === 'success' ? '#8ff5d4' : '#ff9aaa' }}>{msg.text}</div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default CommunityPage;
