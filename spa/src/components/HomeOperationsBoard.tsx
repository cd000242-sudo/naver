import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
    fetchCommunityIncomeProofs,
    fetchHomeKeywordBriefing,
    fetchKeywordBriefingSeed,
    fetchHomeNotices,
    managedHomeProofsToIncomeProofs,
    type CommunityIncomeProof,
    type CommunityIncomeProofResult,
    type HomeKeywordBriefingResult,
    type HomeNotice,
} from '../lib/siteOps';
import { selectKeywordChartRows, type HomeKeywordRow } from '../lib/homeKeywordBriefing';
import { keywordSlug, isEvergreenKeyword } from '../lib/keywordDetailContent.mjs';
import NewBadge from './NewBadge';
import TrendSparkline from './leword/TrendSparkline';
import { fetchKeywordTrend } from '../lib/keywordApi';
import { useNoticeAlerts } from '../lib/useNoticeAlerts';
import { light, lightRadius, motion, type } from '../styles/tokens';
import SplitWords from './motion/SplitWords';
import CountUp from './motion/CountUp';
import { useReveal } from './motion/Reveal';
import LiveKeywordStack from './home/LiveKeywordStack';
import { readCachedHomeBriefing, writeCachedHomeBriefing } from '../lib/homeBriefingCache';

const numberFormatter = new Intl.NumberFormat('ko-KR');
// Opportunity index is shown with exactly one decimal everywhere on the board (874.0 / 290.0 / 149.6). Display only.
const decimalFormatter = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type HomeOperationsTab = 'notice' | 'realtime' | 'income';

// 무료 선정 황금키워드는 홈 안의 탭이 아니라 전용 페이지(BRIEFING_PAGE_PATH)로 뺐다.
// 별도 주소여야 페이지 전환이 생기고, 그래야 구글 자체 전면광고(Vignette)가 뜰 자리가 생긴다.
// 광고 시청을 열람 조건으로 걸지는 않는다 — AdSense 는 보상형 유도를 금지한다.
const BRIEFING_PAGE_PATH = '/briefing';

const HOME_OPS_TAB_ORDER: HomeOperationsTab[] = ['realtime', 'notice', 'income'];
const HOME_OPS_TAB_META: Record<HomeOperationsTab, { label: string; desc: string }> = {
    realtime: { label: '실시간 검색어', desc: '네이버·뉴스 등 현재 흐름을 참고용으로 확인' },
    notice: { label: '공지사항', desc: '최신 공지를 접고 펼쳐 확인' },
    income: { label: '수익 인증', desc: '승인된 수익·실제 운영 성과 자료만 표시' },
};

type HomeManagedProof = {
    src?: string;
    alt?: string;
    title?: string;
    desc?: string;
    metric?: string;
};

interface HomeOperationsBoardProps {
    realtimePanel?: ReactNode;
    /** One line shown between the first screen and the board (the home keyword ribbon). */
    ribbon?: ReactNode;
    managedProofs?: HomeManagedProof[];
    /** true 면 부방장 브리핑 본문만 렌더한다(전용 페이지용). 탭·헤더·다른 패널은 그리지 않는다. */
    briefingOnly?: boolean;
}

function formatDate(value: string): string {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return value || '날짜 미등록';
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(parsed));
}

function noticeBadge(badge: string): { label: string; color: string } {
    const normalized = badge.toLocaleLowerCase();
    if (normalized.includes('important') || normalized.includes('중요')) return { label: '중요', color: light.negative };
    if (normalized.includes('update') || normalized.includes('업데이트')) return { label: '업데이트', color: light.textSecondary };
    if (normalized.includes('event') || normalized.includes('이벤트')) return { label: '이벤트', color: light.textSecondary };
    if (normalized.includes('tip') || normalized.includes('안내')) return { label: '안내', color: light.textSecondary };
    return { label: '공지', color: light.textSecondary };
}

function uniqueKeywordCount(rows: HomeKeywordRow[]): number {
    return new Set(rows.map((row) => row.keyword.toLocaleLowerCase('ko-KR').replace(/\s+/g, ''))).size;
}

type KeywordSearchProvider = 'naver' | 'daum' | 'google';

const KEYWORD_SEARCH_PROVIDERS: Array<{ id: KeywordSearchProvider; label: string }> = [
    { id: 'naver', label: '네이버' },
    { id: 'daum', label: '다음' },
    { id: 'google', label: '구글' },
];

function keywordSearchUrl(keyword: string, provider: KeywordSearchProvider): string {
    const query = encodeURIComponent(keyword.trim());
    if (provider === 'daum') return `https://search.daum.net/search?w=tot&q=${query}`;
    if (provider === 'google') return `https://www.google.com/search?q=${query}`;
    return `https://search.naver.com/search.naver?query=${query}`;
}

function KeywordSearchLink({
    row,
    provider,
    children,
    className,
}: {
    row: HomeKeywordRow;
    provider: KeywordSearchProvider;
    children: ReactNode;
    className?: string;
}) {
    const target = KEYWORD_SEARCH_PROVIDERS.find((item) => item.id === provider);
    const label = target?.label || provider;
    return (
        <a
            className={className}
            href={keywordSearchUrl(row.keyword, provider)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${row.keyword} ${label} 검색으로 바로가기`}
        >
            {children}
        </a>
    );
}

async function copyKeywordText(text: string): Promise<void> {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    if (!ok) throw new Error('clipboard unavailable');
}

function CopyKeywordButton({ text, label = '복사', ariaLabel }: { text: string; label?: string; ariaLabel?: string }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const onCopy = async () => {
        try {
            await copyKeywordText(text);
            setState('copied');
        } catch {
            setState('failed');
        }
        window.setTimeout(() => setState('idle'), 1200);
    };
    return (
        <button
            type="button"
            className="home-ops-copy-btn"
            onClick={onCopy}
            aria-label={ariaLabel || `${text} 복사`}
        >
            {state === 'copied' ? '복사됨' : state === 'failed' ? '복사 실패' : label}
        </button>
    );
}

function KeywordSearchLinks({ row, compact = false }: { row: HomeKeywordRow; compact?: boolean }) {
    return (
        <div className={`home-ops-search-links${compact ? ' compact' : ''}`} aria-label={`${row.keyword} 검색 바로가기`}>
            <CopyKeywordButton text={row.keyword} />
            {KEYWORD_SEARCH_PROVIDERS.map((provider) => (
                <KeywordSearchLink key={provider.id} row={row} provider={provider.id}>
                    {provider.label}
                </KeywordSearchLink>
            ))}
        </div>
    );
}

function NoticeCard({ notice, index, open, onToggle }: {
    notice: HomeNotice;
    index: number;
    open: boolean;
    onToggle: () => void;
}) {
    const badge = noticeBadge(notice.badge);
    const buttonId = `home-notice-button-${index}`;
    const contentId = `home-notice-content-${index}`;
    const detail = notice.body || notice.summary;
    return (
        <article className={`home-ops-notice${open ? ' open' : ''}`}>
            <h3>
                <button
                    id={buttonId}
                    type="button"
                    className="home-ops-notice-toggle"
                    aria-expanded={open}
                    aria-controls={contentId}
                    onClick={onToggle}
                >
                    <span className="home-ops-notice-meta">
                        <span className="home-ops-notice-badge" style={{ color: badge.color }}>{badge.label}</span>
                        <time dateTime={notice.date}>{formatDate(notice.date)}</time>
                        <span className="home-ops-notice-indicator" aria-hidden="true">{open ? '−' : '+'}</span>
                    </span>
                    <span className="home-ops-notice-title">{notice.title}</span>
                    {notice.summary && <span className="home-ops-notice-summary">{notice.summary}</span>}
                </button>
            </h3>
            <div
                id={contentId}
                className="home-ops-notice-detail"
                role="region"
                aria-labelledby={buttonId}
                hidden={!open}
            >
                <p>{detail}</p>
            </div>
        </article>
    );
}

function IncomeProofCard({ proof, eager = false }: { proof: CommunityIncomeProof; eager?: boolean }) {
    if (!proof.media) return null;
    const isManagedProof = proof.source === 'site-proof';
    const mediaAlt = proof.mediaName || `${proof.author} ${isManagedProof ? '운영 성과' : '수익'} 인증`;
    return (
        <article className={`home-ops-income-card${isManagedProof ? ' managed-proof' : ''}`}>
            <div className="home-ops-income-visual">
                {proof.mediaType === 'video' ? (
                    <video src={proof.media} controls playsInline preload="metadata" aria-label={mediaAlt} />
                ) : (
                    <img src={proof.media} alt={mediaAlt} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" />
                )}
            </div>
            <div className="home-ops-income-copy">
                <span>{isManagedProof ? '실제 운영 성과' : '승인된 수익 인증'}</span>
                <h3>{proof.amount}</h3>
                <p>{proof.desc}</p>
                <small>{isManagedProof ? '관리자 등록 자료' : `${proof.author}${proof.date ? ` · ${proof.date}` : ''}`}</small>
                <Link to="/community">커뮤니티에서 크게 보기 →</Link>
            </div>
        </article>
    );
}

/**
 * 자리 — 경쟁 글 수로만 나눈다. 상위노출을 약속하는 값이 아니라 "지금 몇 명이 이미 썼나"다.
 * 실측 분포(2026-09-10 192행): 10 이하 7건 · 200 이하 5건 · 1천 이하 74건 · 그 위 106건.
 */
const SEAT_STEPS = [
    { max: 10, label: '거의 빔', tone: 'open' },
    { max: 200, label: '여유', tone: 'easy' },
    { max: 5000, label: '붐빔', tone: 'busy' },
    { max: Infinity, label: '포화', tone: 'full' },
] as const;

function seatOf(documentCount: number) {
    return SEAT_STEPS.find((step) => documentCount <= step.max) || SEAT_STEPS[SEAT_STEPS.length - 1];
}

/** 한 글자리당 찾는 사람 = 검색량 ÷ (경쟁 글 + 1). '기회지수'를 초보자 말로 부른 것이다. */
function sharePerPost(row: HomeKeywordRow): number {
    return Math.round(row.searchVolume / (row.documentCount + 1));
}

/**
 * 오늘 고른 셋 — 가장 비어 있는 자리 · 아직 한 자릿수 · 사람이 가장 몰리는 말.
 * 같은 키워드가 두 자리에 겹치지 않게 앞에서 고른 것을 빼고 고른다.
 */
function pickThree(rows: readonly HomeKeywordRow[]) {
    const used = new Set<string>();
    const take = (list: HomeKeywordRow[]) => {
        const found = list.find((row) => !used.has(row.keyword));
        if (found) used.add(found.keyword);
        return found || null;
    };
    const lead = take([...rows].sort((a, b) => sharePerPost(b) - sharePerPost(a)));
    const small = take([...rows].filter((row) => row.documentCount <= 10).sort((a, b) => b.searchVolume - a.searchVolume));
    const big = take([...rows].sort((a, b) => b.searchVolume - a.searchVolume));
    return { lead, small, big };
}

function KeywordChart({ rows }: { rows: HomeKeywordRow[] }) {
    const maxOpportunity = Math.max(1, ...rows.map((row) => row.opportunity));
    return (
        <div className="home-ops-chart" aria-label="기회지수 상위 키워드 차트">
            {rows.map((row, index) => {
                const width = Math.max(5, (row.opportunity / maxOpportunity) * 100);
                return (
                    <div className="home-ops-chart-row" key={`${row.keyword}-${row.searchVolume}-${index}`}>
                        <div className="home-ops-chart-label">
                            <span>{index + 1}</span>
                            <strong>
                                <KeywordSearchLink row={row} provider="naver" className="home-ops-keyword-link">
                                    {row.keyword}
                                </KeywordSearchLink>
                            </strong>
                            <small>
                                <KeywordSearchLink row={row} provider="daum" className="home-ops-opportunity-link">
                                    {/* Counts in tenths so the one-decimal figure lands on exactly the same text as the static format. */}
                                    <CountUp value={Math.round(row.opportunity * 10)} format={(n) => decimalFormatter.format(n / 10)} reserve />
                                </KeywordSearchLink>
                            </small>
                            <CopyKeywordButton text={row.keyword} />
                        </div>
                        <div className="home-ops-chart-track" aria-hidden="true">
                            <span style={{ width: `${width}%` }} />
                        </div>
                        <small>검색량<b>{numberFormatter.format(row.searchVolume)}</b></small>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * 30일 추이 모달 — "그래프가 보여야 이 키워드로 글을 써도 될지 알 수 있다"
 * (사장님 2026-08-19). 데이터랩 실측을 keyword-trend 경량 액션으로 받아 그린다.
 */
function TrendModal({ state, onClose }: {
    state: { keyword: string; status: 'loading' | 'ready' | 'error'; series?: number[]; message?: string };
    onClose: () => void;
}) {
    return (
        <div className="home-ops-trend-overlay" role="dialog" aria-modal="true" aria-label={`${state.keyword} 최근 30일 검색 추이`} onClick={onClose}>
            <div className="home-ops-trend-modal" onClick={(event) => event.stopPropagation()}>
                <div className="home-ops-trend-head">
                    <strong>{state.keyword}</strong>
                    <button type="button" onClick={onClose} aria-label="닫기"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" /></svg></button>
                </div>
                {state.status === 'loading' && <p className="home-ops-trend-note">데이터랩 30일 실측을 불러오는 중…</p>}
                {state.status === 'ready' && state.series && <TrendSparkline series={state.series} height={90} />}
                {state.status === 'error' && (
                    <p className="home-ops-trend-note">{state.message || '추이를 가져오지 못했습니다.'}</p>
                )}
                <p className="home-ops-trend-src">네이버 데이터랩 최근 30일 상대 추이 · 실측</p>
            </div>
        </div>
    );
}

function KeywordTable({ rows }: { rows: HomeKeywordRow[] }) {
    const [trendModal, setTrendModal] = useState<{ keyword: string; status: 'loading' | 'ready' | 'error'; series?: number[]; message?: string } | null>(null);

    const openTrend = async (keyword: string) => {
        setTrendModal({ keyword, status: 'loading' });
        const response = await fetchKeywordTrend(keyword);
        if (response.ok && response.data?.trend?.series?.length) {
            setTrendModal({ keyword, status: 'ready', series: response.data.trend.series });
        } else {
            setTrendModal({
                keyword,
                status: 'error',
                message: response.error === 'needs-setup'
                    ? '내 API 키(네이버 API HUB 또는 오픈 API)를 등록하면 바로 보입니다.'
                    : response.message || '추이를 가져오지 못했습니다.',
            });
        }
    };

    return (
        <div className="home-ops-table-shell" tabIndex={0} aria-label={`부방장 키워드 전체 ${rows.length}행`} aria-describedby="home-ops-table-note">
            <div className="home-ops-copy-all-bar">
                <CopyKeywordButton
                    text={rows.map((row) => row.keyword).join(String.fromCharCode(10))}
                    label={`전체 ${rows.length}개 복사`}
                    ariaLabel={`부방장 키워드 ${rows.length}개 전체 복사`}
                />
            </div>
            <table className="home-ops-table">
                <caption className="home-ops-sr-only">부방장 황금키워드 전체 {rows.length}행</caption>
                <thead>
                    <tr>
                        <th scope="col">순위</th>
                        <th scope="col">키워드</th>
                        <th scope="col">검색량</th>
                        <th scope="col">블로그 문서수</th>
                        <th scope="col">자리</th>
                        <th scope="col">기회지수</th>
                        <th scope="col">바로가기</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={`${index}-${row.keyword}-${row.documentCount}`}>
                            <td>{index + 1}</td>
                            <th scope="row">
                                {/* 상세 페이지는 evergreen 키워드만 빌드된다(generate-static-route-pages.mjs).
                                    전 행을 링크하면 나머지가 크롤러에게 404 로 잡히므로 같은 게이트로 묶는다.
                                    react-router Link 가 아니라 <a> 인 이유는 실제 페이지 로드가 있어야
                                    구글 전면광고(Vignette)가 뜰 자리가 생기기 때문이다. */}
                                {isEvergreenKeyword(row.keyword) ? (
                                    <a className="home-ops-keyword-link" href={`/keyword/${encodeURIComponent(keywordSlug(row.keyword))}`}>
                                        {row.keyword}
                                    </a>
                                ) : (
                                    <span className="home-ops-keyword-link">{row.keyword}</span>
                                )}
                                <CopyKeywordButton text={row.keyword} />
                            </th>
                            <td>{numberFormatter.format(row.searchVolume)}</td>
                            <td>{numberFormatter.format(row.documentCount)}</td>
                            <td>
                                <span className={`home-ops-seat tone-${seatOf(row.documentCount).tone}`}>
                                    <i />{seatOf(row.documentCount).label}
                                </span>
                            </td>
                            <td className="home-ops-opportunity-cell">
                                <KeywordSearchLink row={row} provider="daum" className="home-ops-opportunity-link">
                                    {decimalFormatter.format(row.opportunity)}
                                </KeywordSearchLink>
                            </td>
                            <td className="home-ops-search-cell">
                                <button
                                    type="button"
                                    className="home-ops-trend-btn"
                                    onClick={() => openTrend(row.keyword)}
                                    title="최근 30일 검색 추이(데이터랩 실측)"
                                >추이</button>
                                <KeywordSearchLinks row={row} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {trendModal && <TrendModal state={trendModal} onClose={() => setTrendModal(null)} />}
        </div>
    );
}

function KeywordMobileCards({ rows }: { rows: HomeKeywordRow[] }) {
    return (
        <div className="home-ops-keyword-cards" aria-label={`부방장 키워드 모바일 목록 ${rows.length}행`}>
            {rows.map((row, index) => (
                <article className="home-ops-keyword-card" key={`mobile-${index}-${row.keyword}-${row.documentCount}`}>
                    <div className="home-ops-keyword-card-head">
                        <span>{index + 1}</span>
                        <strong>
                            <KeywordSearchLink row={row} provider="naver" className="home-ops-keyword-link">
                                {row.keyword}
                            </KeywordSearchLink>
                        </strong>
                    </div>
                    <dl>
                        <div>
                            <dt>검색량</dt>
                            <dd>{numberFormatter.format(row.searchVolume)}</dd>
                        </div>
                        <div>
                            <dt>문서수</dt>
                            <dd>{numberFormatter.format(row.documentCount)}</dd>
                        </div>
                        <div>
                            <dt>기회지수</dt>
                            <dd>
                                <KeywordSearchLink row={row} provider="daum" className="home-ops-opportunity-link">
                                    {decimalFormatter.format(row.opportunity)}
                                </KeywordSearchLink>
                            </dd>
                        </div>
                    </dl>
                    <KeywordSearchLinks row={row} compact />
                </article>
            ))}
        </div>
    );
}

function HomeOperationsBoard({ realtimePanel, ribbon, managedProofs = [], briefingOnly = false }: HomeOperationsBoardProps) {
    const [notices, setNotices] = useState<HomeNotice[]>([]);
    const [openNoticeId, setOpenNoticeId] = useState<string | null>(null);
    const [incomeResult, setIncomeResult] = useState<CommunityIncomeProofResult | null>(null);
    // The briefing from the previous visit is drawn at once; the live answer replaces it quietly.
    const [cachedBriefing] = useState(readCachedHomeBriefing);
    const [briefingResult, setBriefingResult] = useState<HomeKeywordBriefingResult | null>(cachedBriefing);
    const [activeTab, setActiveTab] = useState<HomeOperationsTab>('realtime');
    // 공지 배지는 모달·네비바와 같은 스토어를 본다(카운트가 어긋나지 않게).
    const { unseen: unseenNotices, markAllSeen: markNoticeAlertsSeen } = useNoticeAlerts();
    const unseenNoticeCount = unseenNotices.length;
    const [noticeLoading, setNoticeLoading] = useState(true);
    const [incomeLoading, setIncomeLoading] = useState(true);
    const [briefingLoading, setBriefingLoading] = useState(cachedBriefing === null);
    const sidenavRef = useRef<HTMLDivElement>(null);
    const layoutRef = useRef<HTMLDivElement>(null);
    const introCardsRef = useRef<HTMLDivElement>(null);
    useReveal(layoutRef, { stagger: true });
    useReveal(introCardsRef, { stagger: true });

    // On mobile the side-nav collapses to a horizontal scroll row; keep the
    // active tab centered in view. Scrolls only the nav container, never the page.
    useEffect(() => {
        const nav = sidenavRef.current;
        const el = nav?.querySelector<HTMLElement>(`#home-ops-tab-${activeTab}`);
        if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
        const target = el.offsetLeft - (nav.clientWidth - el.clientWidth) / 2;
        nav.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }, [activeTab]);

    // 공지 탭을 실제로 열면 읽은 것으로 보고 배지를 내린다(네비바·플로팅도 같이 내려감).
    useEffect(() => {
        if (activeTab === 'notice' && unseenNoticeCount > 0) markNoticeAlertsSeen();
    }, [activeTab, unseenNoticeCount, markNoticeAlertsSeen]);

    useEffect(() => {
        let active = true;
        fetchHomeNotices(50)
            .then((latestNotices) => {
                if (!active) return;
                setNotices(latestNotices);
                setOpenNoticeId((current) => current ?? latestNotices[0]?.id ?? null);
            })
            .catch(() => undefined)
            .finally(() => { if (active) setNoticeLoading(false); });

        fetchCommunityIncomeProofs(3, { view: 'home' })
            .then((latestIncomeResult) => { if (active) setIncomeResult(latestIncomeResult); })
            .catch(() => { if (active) setIncomeResult({ items: [], source: 'unavailable' }); })
            .finally(() => { if (active) setIncomeLoading(false); });

        /*
         * The reviewed copy (site content, Apps Script) can take seconds to answer. Waiting for it
         * left the first screen's card stack empty. So the published snapshot file, which ships with
         * the site, is the first picture on a first visit; the reviewed copy replaces it when it lands.
         */
        let settled = false;
        fetchKeywordBriefingSeed()
            .then((seed) => {
                if (!active || settled || !seed || seed.rows.length === 0) return;
                setBriefingResult((current) => current ?? { briefing: seed, source: 'seed' });
                setBriefingLoading(false);
            })
            .catch(() => undefined);

        fetchHomeKeywordBriefing()
            .then((latestBriefing) => {
                settled = true;
                if (!active || !latestBriefing) return;
                writeCachedHomeBriefing(latestBriefing);
                setBriefingResult((current) => (
                    current && current.source === latestBriefing.source && current.briefing.snapshotId === latestBriefing.briefing.snapshotId
                        ? current
                        : latestBriefing
                ));
            })
            .catch(() => undefined)
            .finally(() => { if (active) setBriefingLoading(false); });
        return () => { active = false; };
    }, []);

    const briefing = briefingResult?.briefing || null;
    const incomeProofs = (incomeResult?.items || []).filter((proof) => Boolean(proof.media));
    const managedIncomeProofs = useMemo(
        () => managedHomeProofsToIncomeProofs(managedProofs, 12),
        [managedProofs],
    );
    const displayIncomeProofs = incomeProofs.length > 0 ? incomeProofs : managedIncomeProofs;
    const usingManagedProofs = incomeProofs.length === 0 && managedIncomeProofs.length > 0;
    const chartRows = useMemo(() => briefing ? selectKeywordChartRows(briefing, 10) : [], [briefing]);
    // 고른 셋 — 숫자 넉 장을 대신한다. 초보자는 개수보다 "무엇을 쓰면 되나"가 먼저다.
    const picks = useMemo(() => briefing ? pickThree(briefing.rows) : { lead: null, small: null, big: null }, [briefing]);
    const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: HomeOperationsTab) => {
        const tabs = HOME_OPS_TAB_ORDER;
        const currentIndex = tabs.indexOf(currentTab);
        let nextTab: HomeOperationsTab | undefined;
        // Vertical side-nav: Up/Down move between tabs (Left/Right kept as aliases).
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextTab = tabs[(currentIndex + 1) % tabs.length];
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
        if (event.key === 'Home') nextTab = tabs[0];
        if (event.key === 'End') nextTab = tabs[tabs.length - 1];
        if (!nextTab) return;
        event.preventDefault();
        setActiveTab(nextTab);
        window.requestAnimationFrame(() => document.getElementById(`home-ops-tab-${nextTab}`)?.focus());
    };

    return (
        <section id="realtime-search" className="home-ops" aria-labelledby="home-ops-title">
            <style>{`
                .home-ops {
                    position: relative;
                    z-index: 2;
                    max-width: 1412px;
                    margin: 0 auto 48px;
                    padding: 112px 24px 0;
                    color: ${light.text};
                    word-break: keep-all;
                    overflow-wrap: break-word;
                }
                .home-ops a:focus-visible,
                .home-ops button:focus-visible,
                .home-ops-table-shell:focus-visible { outline: 2px solid ${light.accentInk}; outline-offset: 2px; }
                /* First screen: headline, intro and two buttons on the left, the three products as one list on the right. */
                .home-ops-header {
                    display: grid;
                    grid-template-columns: minmax(0, 1.15fr) minmax(320px, .85fr);
                    gap: 24px 64px;
                    align-items: end;
                    margin-bottom: 32px;
                }
                .home-ops-title-short { display: none; }
                .home-ops-header h1 {
                    margin: 0 0 16px;
                    color: ${light.text};
                    font-size: ${type.h1}px;
                    font-weight: 700;
                    line-height: 1.2;
                    letter-spacing: -0.02em;
                    text-wrap: balance;
                }
                .home-ops-intro { max-width: 60ch; margin: 0; font-size: ${type.body}px; line-height: 1.7; color: ${light.textSecondary}; }
                .home-ops-intro strong { color: ${light.text}; font-weight: 600; }
                .home-ops-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
                .home-ops-cta {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 48px;
                    padding: 0 24px;
                    border: 1px solid ${light.accent};
                    border-radius: ${lightRadius.control}px;
                    background: ${light.accent};
                    color: ${light.onAccent};
                    font-size: ${type.body}px;
                    font-weight: 600;
                    text-decoration: none;
                    transition: background ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease};
                }
                .home-ops-cta:hover { border-color: ${light.accentInk}; }
                .home-ops-cta-quiet { border-color: ${light.line}; background: ${light.surface}; color: ${light.text}; }
                .home-ops-cta-quiet:hover { border-color: ${light.lineStrong}; background: ${light.raised}; }
                .home-ops-intro-cards { border-top: 1px solid ${light.line}; }
                .home-ops-intro-card {
                    display: grid;
                    grid-template-columns: 168px minmax(0, 1fr) auto;
                    align-items: baseline;
                    gap: 4px 16px;
                    min-height: 56px;
                    padding: 16px 8px;
                    border-bottom: 1px solid ${light.line};
                    text-decoration: none;
                    transition: background ${motion.fast} ${motion.ease};
                }
                .home-ops-intro-card:hover { background: ${light.surface}; }
                .home-ops-intro-card strong { color: ${light.text}; font-size: ${type.body}px; font-weight: 600; }
                .home-ops-intro-card span { font-size: ${type.small}px; line-height: 1.55; color: ${light.textSecondary}; }
                .home-ops-intro-card i { color: ${light.textMuted}; font-style: normal; }
                .home-ops-kicker { display: block; color: ${light.accentInk}; font-size: ${type.meta}px; font-weight: 600; }
                .home-ops-panel {
                    min-width: 0;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.panel}px;
                    background: ${light.surface};
                    box-shadow: ${light.shadowSm};
                    overflow: hidden;
                }
                .home-ops-panel-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    padding: 12px 24px;
                    border-bottom: 1px solid ${light.line};
                }
                .home-ops-panel-hint { margin: 0; padding: 16px 24px 0; color: ${light.textSecondary}; font-size: ${type.small}px; }
                .home-ops-panel-head small { color: ${light.textSecondary}; font-size: ${type.small}px; line-height: 1.55; }
                .home-ops-panel-head a,
                .home-ops-income-copy a {
                    flex: 0 0 auto;
                    display: inline-flex;
                    align-items: center;
                    min-height: 44px;
                    color: ${light.accentInk};
                    font-size: ${type.small}px;
                    font-weight: 600;
                    text-decoration: none;
                }
                .home-ops-panel-head a:hover,
                .home-ops-income-copy a:hover { text-decoration: underline; }
                .home-ops-notices {
                    display: grid;
                    gap: 8px;
                    max-height: 640px;
                    padding: 16px;
                    overflow-y: auto;
                    scrollbar-gutter: stable;
                }
                .home-ops-notice {
                    min-width: 0;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.control}px;
                    background: ${light.surface};
                    overflow: hidden;
                }
                .home-ops-notice.open { border-color: ${light.lineStrong}; background: ${light.raised}; }
                .home-ops-notice h3 { margin: 0; }
                .home-ops-notice-toggle {
                    display: block;
                    width: 100%;
                    min-height: 48px;
                    padding: 16px;
                    border: 0;
                    background: transparent;
                    color: inherit;
                    font: inherit;
                    font-weight: 400;
                    text-align: left;
                }
                .home-ops-notice-toggle:focus-visible { outline-offset: -2px; }
                .home-ops-notice-meta {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 8px;
                }
                .home-ops-notice-badge {
                    padding: 2px 8px;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.pill}px;
                    background: ${light.surface};
                    font-size: ${type.meta}px;
                    font-weight: 600;
                }
                .home-ops-notice-meta time { color: ${light.textMuted}; font-size: ${type.meta}px; font-variant-numeric: tabular-nums; }
                .home-ops-notice-indicator { margin-left: auto; color: ${light.textMuted}; font-size: ${type.lead}px; line-height: 1; }
                .home-ops-notice-title { display: block; color: ${light.text}; font-size: ${type.body}px; font-weight: 600; line-height: 1.5; }
                .home-ops-notice-summary {
                    display: block;
                    margin-top: 4px;
                    color: ${light.textSecondary};
                    font-size: ${type.small}px;
                    line-height: 1.65;
                }
                .home-ops-notice-detail {
                    padding: 0 16px 16px;
                    border-top: 1px solid ${light.line};
                }
                .home-ops-notice-detail p {
                    margin: 16px 0 0;
                    color: ${light.text};
                    font-size: ${type.body}px;
                    line-height: 1.75;
                    white-space: pre-line;
                }
                .home-ops-income-list {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(min(236px, 100%), 1fr));
                    gap: 16px;
                    padding: 16px;
                }
                .home-ops-income-card {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                    overflow: hidden;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.card}px;
                    background: ${light.surface};
                }
                .home-ops-income-visual {
                    aspect-ratio: 4 / 3;
                    min-height: 190px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    background: ${light.raised};
                    border-bottom: 1px solid ${light.line};
                }
                .home-ops-income-visual img,
                .home-ops-income-visual video { width: 100%; height: 100%; min-height: 190px; object-fit: contain; display: block; }
                .home-ops-income-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; padding: 16px; }
                .home-ops-income-copy > span { color: ${light.textMuted}; font-size: ${type.meta}px; font-weight: 500; }
                .home-ops-income-copy h3 {
                    margin: 4px 0 8px; color: ${light.text}; font-size: ${type.lead}px; font-weight: 600;
                    line-height: 1.35; font-variant-numeric: tabular-nums;
                }
                .home-ops-income-copy p {
                    display: -webkit-box;
                    margin: 0 0 8px;
                    overflow: hidden;
                    color: ${light.textSecondary};
                    font-size: ${type.small}px;
                    line-height: 1.6;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 2;
                }
                .home-ops-income-copy small { display: block; color: ${light.textMuted}; font-size: ${type.meta}px; line-height: 1.5; }
                .home-ops-income-copy a { align-self: flex-start; margin-top: auto; }
                .home-ops-empty {
                    padding: 32px 24px;
                    color: ${light.textSecondary};
                    font-size: ${type.small}px;
                    line-height: 1.65;
                    text-align: center;
                }
                .home-ops-layout {
                    display: grid;
                    grid-template-columns: minmax(210px, 250px) minmax(0, 1fr);
                    gap: 16px;
                    align-items: start;
                }
                /* The briefing page renders no side tabs; a two-column grid there would squeeze the body
                   into the 250px tab column. */
                .home-ops-layout.briefing-only { grid-template-columns: minmax(0, 1fr); }
                .home-ops-sidenav {
                    position: sticky;
                    top: 80px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    padding: 8px;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.card}px;
                    background: ${light.surface};
                    box-shadow: ${light.shadowSm};
                }
                .home-ops-sidenav .home-ops-tab { width: 100%; }
                .home-ops-content { min-width: 0; }
                .home-ops-tab {
                    min-height: 64px;
                    display: grid;
                    align-content: center;
                    gap: 4px;
                    padding: 12px 16px;
                    border: 1px solid transparent;
                    border-radius: ${lightRadius.control}px;
                    background: transparent;
                    color: ${light.textSecondary};
                    font: inherit;
                    text-align: left;
                    text-decoration: none;
                    cursor: pointer;
                    transition: background ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease};
                }
                .home-ops-tab:hover { background: ${light.raised}; }
                .home-ops-tab strong { color: ${light.text}; font-size: ${type.body}px; font-weight: 600; line-height: 1.35; }
                .home-ops-tab small { font-size: ${type.small}px; line-height: 1.5; }
                /* Only the selected tab carries the accent. */
                .home-ops-tab.active { border-color: ${light.accentLine}; background: ${light.accentSoft}; }
                .home-ops-tab-flag { color: ${light.textMuted}; font-size: ${type.meta}px; font-weight: 500; }
                .home-ops-tab-featured .home-ops-tab-flag { color: ${light.accentInk}; }
                .home-ops-brief-head {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 16px;
                    padding: 24px;
                    border-bottom: 1px solid ${light.line};
                }
                .home-ops-brief-head h3 { margin: 8px 0; color: ${light.text}; font-size: ${type.h2}px; font-weight: 600; line-height: 1.3; }
                .home-ops-brief-head p { margin: 0; color: ${light.textMuted}; font-size: ${type.meta}px; line-height: 1.65; }
                .home-ops-brief-head p.home-ops-brief-lead {
                    margin: 0 0 8px; max-width: 56ch; color: ${light.textSecondary};
                    font-size: ${type.body}px; line-height: 1.6; text-wrap: balance;
                }
                .home-ops-fixed-badge {
                    flex: 0 0 auto;
                    display: grid;
                    gap: 4px;
                    min-width: 170px;
                    padding: 12px 16px;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.control}px;
                    background: ${light.raised};
                    text-align: right;
                }
                .home-ops-fixed-badge strong { color: ${light.text}; font-size: ${type.small}px; font-weight: 600; }
                .home-ops-fixed-badge span { color: ${light.textMuted}; font-size: ${type.meta}px; }
                /* Seat: split by competing-post count only. The dot is a signal, the text stays neutral. */
                .home-ops-seat { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; font-size: ${type.meta}px; color: ${light.textSecondary}; }
                .home-ops-seat i,
                .home-ops-pick-tag i { width: 8px; height: 8px; border-radius: 50%; flex: none; background: ${light.lineStrong}; }
                .home-ops-seat.tone-open { color: ${light.positive}; }
                .home-ops-seat.tone-open i, .home-ops-seat.tone-easy i, .home-ops-pick-tag i.tone-open { background: ${light.positive}; }
                .home-ops-seat.tone-easy i { opacity: .5; }
                .home-ops-seat.tone-busy i, .home-ops-pick-tag i.tone-busy { background: ${light.accent}; }
                .home-ops-seat.tone-full { color: ${light.textMuted}; }
                /* Today's three picks: not three equal cells. One leads because the three do not weigh the same. */
                .home-ops-picks {
                    display: grid; grid-template-columns: 1.45fr 1fr; gap: 1px;
                    background: ${light.line}; border-bottom: 1px solid ${light.line};
                }
                .home-ops-pick-side { display: grid; grid-template-rows: 1fr 1fr; gap: 1px; background: ${light.line}; }
                .home-ops-pick { background: ${light.surface}; padding: 20px 24px; display: flex; flex-direction: column; }
                .home-ops-pick-lead { padding: 24px; }
                .home-ops-pick-tag {
                    display: inline-flex; align-items: center; gap: 8px; margin-bottom: 12px;
                    font-size: ${type.meta}px; color: ${light.textMuted};
                }
                .home-ops-pick-kw {
                    margin: 0 0 12px; color: ${light.text}; font-size: ${type.body}px; font-weight: 600;
                    letter-spacing: -.01em; line-height: 1.35; text-wrap: balance;
                }
                .home-ops-pick-lead .home-ops-pick-kw { font-size: ${type.h3}px; }
                .home-ops-pick-say { margin: 0 0 16px; color: ${light.textSecondary}; font-size: ${type.small}px; line-height: 1.6; }
                .home-ops-pick-say b { color: ${light.positive}; font-weight: 600; }
                .home-ops-pick-figs {
                    display: flex; gap: 24px; margin-top: auto; padding-top: 16px;
                    border-top: 1px solid ${light.line};
                }
                .home-ops-pick-figs span { display: block; margin-bottom: 4px; font-size: ${type.meta}px; color: ${light.textMuted}; }
                .home-ops-pick-figs b {
                    display: block; color: ${light.text}; font-size: ${type.body}px; font-weight: 500;
                    font-variant-numeric: tabular-nums; letter-spacing: -.01em;
                }
                .home-ops-pick-lead .home-ops-pick-figs b { font-size: ${type.lead}px; }
                .home-ops-pick-figs b.tone-open-text { color: ${light.positive}; }
                .home-ops-chart-wrap { padding: 24px; }
                .home-ops-subhead {
                    display: flex;
                    justify-content: space-between;
                    align-items: baseline;
                    gap: 16px;
                    margin-bottom: 16px;
                    color: ${light.textMuted};
                    font-size: ${type.meta}px;
                    line-height: 1.5;
                }
                .home-ops-subhead strong { color: ${light.text}; font-size: ${type.body}px; font-weight: 600; }
                .home-ops-chart { display: grid; gap: 12px; font-variant-numeric: tabular-nums; }
                .home-ops-chart-row { display: grid; grid-template-columns: minmax(0, 1fr) 128px; gap: 8px 16px; }
                .home-ops-chart-label { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto auto; gap: 8px; align-items: center; min-height: 36px; }
                .home-ops-chart-label > span { color: ${light.textMuted}; font-size: ${type.small}px; text-align: right; }
                .home-ops-chart-label strong { overflow: hidden; color: ${light.text}; font-size: ${type.body}px; font-weight: 500; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
                .home-ops-chart-label small { color: ${light.text}; font-size: ${type.small}px; font-weight: 600; }
                .home-ops-chart-track { grid-column: 1; height: 8px; overflow: hidden; border-radius: ${lightRadius.pill}px; background: ${light.line}; }
                .home-ops-chart-track span { display: block; height: 100%; border-radius: inherit; background: ${light.accent}; }
                .home-ops-chart-row > small { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: ${light.textMuted}; font-size: ${type.meta}px; text-align: right; white-space: nowrap; }
                .home-ops-chart-row > small b { margin-left: 4px; color: ${light.text}; font-size: ${type.small}px; font-weight: 500; }
                /* Row actions (copy, trend, search links) share one quiet control shape. */
                .home-ops-trend-btn,
                .home-ops-copy-btn,
                .home-ops-search-links a {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 36px;
                    padding: 0 12px;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.control}px;
                    background: ${light.surface};
                    color: ${light.textSecondary};
                    font: inherit;
                    font-size: ${type.meta}px;
                    font-weight: 500;
                    text-decoration: none;
                    white-space: nowrap;
                    cursor: pointer;
                    transition: background ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease}, color ${motion.fast} ${motion.ease};
                }
                .home-ops-trend-btn:hover,
                .home-ops-copy-btn:hover,
                .home-ops-search-links a:hover { border-color: ${light.lineStrong}; background: ${light.raised}; color: ${light.text}; }
                .home-ops-trend-btn { margin-right: 8px; }
                .home-ops-copy-btn { margin-left: 8px; }
                .home-ops-copy-btn:disabled { opacity: .7; }
                .home-ops-trend-overlay {
                    position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center;
                    background: rgba(20, 24, 28, 0.45); padding: 20px;
                }
                .home-ops-trend-modal {
                    width: min(440px, 100%); background: ${light.surface}; border: 1px solid ${light.line};
                    border-radius: ${lightRadius.panel}px; padding: 20px 24px; box-shadow: ${light.shadowFloat};
                }
                .home-ops-trend-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
                .home-ops-trend-head strong { font-size: ${type.lead}px; font-weight: 600; color: ${light.text}; }
                .home-ops-trend-head button {
                    flex: none; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px;
                    background: ${light.surface}; border: 1px solid ${light.line}; border-radius: ${lightRadius.control}px;
                    color: ${light.text}; cursor: pointer;
                }
                .home-ops-trend-head button:hover { background: ${light.raised}; }
                .home-ops-trend-note { margin: 8px 0; font-size: ${type.small}px; color: ${light.textSecondary}; line-height: 1.6; }
                .home-ops-trend-src { margin: 12px 0 0; font-size: ${type.meta}px; color: ${light.textMuted}; }
                /* The sparkline rules live in the leword tab sheet, which the home page does not load. */
                .home-ops-trend-modal .lw-spark { display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; border: 1px solid ${light.line}; border-radius: ${lightRadius.control}px; background: ${light.raised}; }
                .home-ops-trend-modal .lw-spark svg { width: 100%; height: 90px; display: block; }
                .home-ops-trend-modal .lw-spark-foot { display: flex; gap: 8px; font-size: ${type.meta}px; color: ${light.textMuted}; font-variant-numeric: tabular-nums; }
                .home-ops-trend-modal .lw-spark-foot em { font-style: normal; color: ${light.textSecondary}; font-weight: 600; }
                .home-ops-trend-modal .lw-spark-foot .lw-spark-hot { color: ${light.positive}; font-weight: 600; }
                .home-ops-table-title {
                    display: flex;
                    align-items: baseline;
                    justify-content: space-between;
                    gap: 16px;
                    padding: 20px 24px 12px;
                    border-top: 1px solid ${light.line};
                }
                .home-ops-table-title strong { color: ${light.text}; font-size: ${type.body}px; font-weight: 600; }
                .home-ops-table-title span { max-width: 720px; color: ${light.textMuted}; font-size: ${type.meta}px; line-height: 1.55; text-align: right; }
                .home-ops-table-shell {
                    max-height: none;
                    margin: 0 16px 20px;
                    overflow: auto;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.control}px;
                    scrollbar-gutter: stable;
                }
                .home-ops-table { width: 100%; min-width: 980px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
                .home-ops-table th, .home-ops-table td { height: 48px; padding: 4px 16px; border-bottom: 1px solid ${light.line}; }
                .home-ops-table tbody tr:last-child th, .home-ops-table tbody tr:last-child td { border-bottom: 0; }
                .home-ops-table thead th {
                    position: sticky;
                    top: 0;
                    z-index: 1;
                    background: ${light.raised};
                    color: ${light.textMuted};
                    font-size: ${type.meta}px;
                    font-weight: 500;
                    text-align: right;
                    white-space: nowrap;
                }
                .home-ops-table thead th:nth-child(2),
                .home-ops-table thead th:nth-child(5),
                .home-ops-table thead th:nth-child(7) { text-align: left; }
                .home-ops-table tbody td { color: ${light.text}; font-size: ${type.small}px; text-align: right; white-space: nowrap; }
                .home-ops-table tbody th { color: ${light.text}; font-size: ${type.body}px; font-weight: 500; line-height: 1.5; text-align: left; white-space: nowrap; }
                .home-ops-table tbody td:first-child { width: 44px; color: ${light.textMuted}; }
                .home-ops-table tbody td:nth-child(5) { text-align: left; }
                .home-ops-table tbody td.home-ops-opportunity-cell { font-weight: 600; }
                .home-ops-table tbody td.home-ops-search-cell { min-width: 178px; text-align: left; }
                .home-ops-table tbody tr:hover { background: ${light.raised}; }
                .home-ops-keyword-link,
                .home-ops-opportunity-link {
                    color: inherit;
                    text-decoration: none;
                    border-bottom: 1px solid ${light.lineStrong};
                    transition: color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease};
                }
                span.home-ops-keyword-link { border-bottom: 0; }
                a.home-ops-keyword-link:hover,
                .home-ops-opportunity-link:hover { color: ${light.accentInk}; border-color: ${light.accentInk}; }
                .home-ops-copy-all-bar { display: flex; justify-content: flex-end; padding: 8px; border-bottom: 1px solid ${light.line}; }
                .home-ops-search-links {
                    display: inline-flex;
                    gap: 8px;
                    justify-content: flex-start;
                    align-items: center;
                }
                .home-ops-search-links .home-ops-copy-btn { margin-left: 0; }
                .home-ops-search-links.compact {
                    display: flex;
                    flex-wrap: wrap;
                    padding: 12px 16px 16px;
                    border-top: 1px solid ${light.line};
                }
                .home-ops-search-links.compact a,
                .home-ops-search-links.compact .home-ops-copy-btn { flex: 1 1 0; min-width: 0; min-height: 44px; padding: 0 4px; font-size: ${type.small}px; }
                .home-ops-keyword-cards { display: none; }
                .home-ops-keyword-card {
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.card}px;
                    background: ${light.surface};
                    overflow: hidden;
                }
                .home-ops-keyword-card-head {
                    display: grid;
                    grid-template-columns: 32px minmax(0, 1fr);
                    gap: 8px;
                    align-items: baseline;
                    padding: 16px;
                    border-bottom: 1px solid ${light.line};
                }
                .home-ops-keyword-card-head span { color: ${light.textMuted}; font-size: ${type.small}px; font-variant-numeric: tabular-nums; }
                .home-ops-keyword-card-head strong {
                    min-width: 0;
                    color: ${light.text};
                    font-size: ${type.body}px;
                    font-weight: 600;
                    line-height: 1.45;
                    overflow-wrap: anywhere;
                }
                .home-ops-keyword-card dl {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 1px;
                    margin: 0;
                    background: ${light.line};
                }
                .home-ops-keyword-card dl div { min-width: 0; padding: 12px 16px; background: ${light.surface}; text-align: right; }
                .home-ops-keyword-card dt { margin: 0 0 4px; color: ${light.textMuted}; font-size: ${type.meta}px; }
                .home-ops-keyword-card dd {
                    margin: 0;
                    color: ${light.text};
                    font-size: ${type.body}px;
                    font-weight: 500;
                    line-height: 1.35;
                    font-variant-numeric: tabular-nums;
                    word-break: break-word;
                }
                .home-ops-realtime-panel { padding: 16px; }
                .home-ops-sr-only {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0, 0, 0, 0);
                    white-space: nowrap;
                    border: 0;
                }
                .home-ops-realtime-panel .hero-realtime-board {
                    box-sizing: border-box;
                    height: auto;
                    min-height: 650px;
                    padding: 4px;
                    border: 0;
                    background: transparent;
                    box-shadow: none;
                    backdrop-filter: none;
                }
                /* Motion pass (2026-11): hover lift and press, transform/shadow only. */
                .home-ops-header { align-items: center; }
                .home-ops-hero-side { display: grid; gap: 24px; min-width: 0; }
                .home-ops-cta,
                .home-ops-intro-card,
                .home-ops-sidenav .home-ops-tab {
                    transition-property: background-color, border-color, color, box-shadow, transform;
                    transition-duration: 200ms;
                    transition-timing-function: ${motion.ease};
                }
                .home-ops-cta:hover,
                .home-ops-intro-card:hover,
                .home-ops-sidenav .home-ops-tab:hover { transform: translateY(-2px); box-shadow: ${light.shadowFloat}; }
                .home-ops-cta:active,
                .home-ops-intro-card:active,
                .home-ops-sidenav .home-ops-tab:active { transform: scale(0.98); }
                @media (prefers-reduced-motion: reduce) {
                    .home-ops-cta:hover, .home-ops-intro-card:hover, .home-ops-sidenav .home-ops-tab:hover,
                    .home-ops-cta:active, .home-ops-intro-card:active, .home-ops-sidenav .home-ops-tab:active { transform: none; }
                }
                @media (max-width: 960px) {
                    .home-ops-realtime-panel .hero-realtime-board { min-height: 0; }
                    .home-ops-layout { grid-template-columns: minmax(0, 1fr); }
                    .home-ops-sidenav {
                        position: static;
                        flex-direction: row;
                        overflow-x: auto;
                        -webkit-overflow-scrolling: touch;
                    }
                    .home-ops-sidenav .home-ops-tab { flex: 0 0 auto; width: 216px; }
                    .home-ops-header { grid-template-columns: minmax(0, 1fr); }
                }
                @media (max-width: 720px) {
                    .home-ops { padding: 96px 16px 0; margin-bottom: 32px; }
                    .home-ops-header h1 { font-size: ${type.h1Mobile}px; }
                    .home-ops-title-full { display: none; }
                    .home-ops-title-short { display: inline; }
                    .home-ops-brief-head h3 { font-size: ${type.h3}px; }
                    .home-ops-cta { flex: 1 1 auto; padding: 0 16px; }
                    .home-ops-intro-card { grid-template-columns: minmax(0, 1fr) auto; }
                    .home-ops-intro-card span { grid-column: 1; grid-row: 2; }
                    .home-ops-intro-card i { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
                    .home-ops-panel-head { padding: 12px 16px; }
                    .home-ops-panel-hint { padding: 16px 16px 0; }
                    .home-ops-notices { padding: 12px; }
                    .home-ops-income-list { grid-template-columns: 1fr; padding: 12px; }
                    .home-ops-income-visual,
                    .home-ops-income-visual img,
                    .home-ops-income-visual video { min-height: 210px; max-height: 420px; }
                    .home-ops-brief-head { flex-direction: column; padding: 20px 16px; }
                    .home-ops-fixed-badge { width: 100%; box-sizing: border-box; text-align: left; }
                    .home-ops-picks { grid-template-columns: 1fr; }
                    .home-ops-pick, .home-ops-pick-lead { padding: 20px 16px; }
                    .home-ops-pick-lead .home-ops-pick-kw { font-size: ${type.lead}px; }
                    .home-ops-chart-wrap { padding: 20px 16px; }
                    .home-ops-subhead { flex-direction: column; gap: 4px; }
                    .home-ops-chart-row { grid-template-columns: minmax(0, 1fr); }
                    .home-ops-chart-label { grid-template-columns: 24px minmax(0, 1fr) auto; }
                    .home-ops-chart-label strong { white-space: normal; }
                    .home-ops-chart-label small { grid-column: 2; grid-row: 2; }
                    .home-ops-chart-label .home-ops-copy-btn { grid-column: 3; grid-row: 1; min-height: 44px; }
                    .home-ops-chart-track { grid-column: 1 / -1; }
                    .home-ops-chart-row > small { grid-column: 1 / -1; grid-row: auto; text-align: left; }
                    .home-ops-table-title { flex-direction: column; gap: 4px; padding: 20px 16px 12px; }
                    .home-ops-table-title span { text-align: left; }
                    .home-ops-table-shell { display: none; }
                    .home-ops-keyword-cards { display: grid; gap: 8px; padding: 0 12px 16px; }
                    .home-ops-realtime-panel { padding: 8px; }
                    .home-ops-realtime-panel .hero-source-tabs,
                    .home-ops-realtime-panel .hero-source-body,
                    .home-ops-realtime-panel .source-strategy-grid { grid-template-columns: minmax(0, 1fr) !important; }
                    .home-ops-realtime-panel .hero-source-list-shell,
                    .home-ops-realtime-panel .source-insight-panel { min-width: 0; }
                    .home-ops-realtime-panel .hero-source-row-main { grid-template-columns: 32px minmax(0, 1fr) 48px; }
                    .home-ops-realtime-panel .hero-source-row-main strong,
                    .home-ops-realtime-panel .source-idea-card strong,
                    .home-ops-realtime-panel .source-question-list strong,
                    .home-ops-realtime-panel .source-cluster-list strong { white-space: normal; overflow-wrap: anywhere; }
                }
            `}</style>

            {!briefingOnly && (
                <header className="home-ops-header">
                    <div>
                        <h1 id="home-ops-title">
                            <span className="home-ops-title-full"><SplitWords text="블로그로 수익을 내는 데 필요한 것들을 한곳에 모았습니다" /></span>
                            {/* Shorter wording on phones so the headline stays within two lines. */}
                            <span className="home-ops-title-short"><SplitWords text="블로그 수익 도구를 한곳에 모았습니다" /></span>
                        </h1>
                        <p className="home-ops-intro">
                            리더스프로는 <strong>키워드 발굴부터 글쓰기·발행까지</strong> 블로그 운영에 필요한 도구를 만듭니다.
                            아래 <strong>무료 선정 황금키워드</strong>와 <strong>실시간 검색어</strong>는 회원가입 없이 그냥 보셔도 됩니다.
                        </p>
                        <div className="home-ops-actions">
                            <a className="home-ops-cta lp-sheen" href="/leword">황금키워드 보러 가기</a>
                            <Link className="home-ops-cta home-ops-cta-quiet" to="/products">제품 보기</Link>
                        </div>
                    </div>
                    <div className="home-ops-hero-side">
                    {/* Hold the deck's height while the briefing loads so the first screen does not jump. */}
                    {chartRows.length === 0 && briefingLoading && <div className="lks-reserve" aria-hidden="true" />}
                    {chartRows.length > 0 && (
                        <LiveKeywordStack
                            rows={chartRows}
                            href={BRIEFING_PAGE_PATH}
                            caption={`${formatDate(briefing?.publishedAt || '')} 검토본`}
                        />
                    )}
                    <div ref={introCardsRef} className="home-ops-intro-cards">
                        <a className="home-ops-intro-card" href="/leword">
                            <strong>LEWORD</strong>
                            <span>황금키워드 찾기 프로그램</span>
                            <i aria-hidden="true">→</i>
                        </a>
                        <a className="home-ops-intro-card" href="/detail">
                            <strong>Better Life Naver</strong>
                            <span>네이버 자동화 프로그램</span>
                            <i aria-hidden="true">→</i>
                        </a>
                        <a className="home-ops-intro-card" href="/orbit">
                            <strong>Leaders Orbit</strong>
                            <span>워드프레스·티스토리·블로그스팟 자동화 및 외부유입 전용 프로그램</span>
                            <i aria-hidden="true">→</i>
                        </a>
                    </div>
                    </div>
                </header>
            )}

            {!briefingOnly && ribbon}

            <div ref={layoutRef} className={`home-ops-layout${briefingOnly ? ' briefing-only' : ''}`}>
                {!briefingOnly && (
                <div ref={sidenavRef} className="home-ops-sidenav" role="tablist" aria-label="홈 보기 선택" aria-orientation="vertical">
                    {/* react-router Link 가 아니라 일반 <a> 다. 클라이언트 라우팅은 AdSense 가
                        새 페이지로 인식하지 않아 전면광고가 뜨지 않는다. 실제 페이지 로드가
                        일어나야 광고 자리가 생긴다(정적 /briefing 페이지를 빌드에서 생성해 둔다). */}
                    <a className="home-ops-tab home-ops-tab-featured" href={BRIEFING_PAGE_PATH}>
                        <span className="home-ops-tab-flag">오늘 무료 공개</span>
                        <strong>무료 선정 황금키워드</strong>
                        <small>검색은 많은데 아직 글이 적은 키워드만 골랐습니다. 지금 바로 확인 →</small>
                    </a>
                    {/* 실검 틈새키워드 — 하루 3회 CI 가 정적으로 발행하는 보드(/leword?tab=issue). 황금키워드와 같은 이유로 일반 <a> 다. */}
                    <a className="home-ops-tab home-ops-tab-issue" href="/leword?tab=issue">
                        <span className="home-ops-tab-flag">하루 3번 갱신</span>
                        <strong>실검 틈새키워드</strong>
                        <small>지금 뜨는 실시간 이슈에서 검색은 있는데 글이 적은 키워드만 골랐습니다 →</small>
                    </a>
                    {HOME_OPS_TAB_ORDER.map((tab) => (
                        <button
                            key={tab}
                            id={`home-ops-tab-${tab}`}
                            type="button"
                            role="tab"
                            data-home-ops-tab={tab}
                            className={`home-ops-tab${activeTab === tab ? ' active' : ''}`}
                            aria-selected={activeTab === tab}
                            aria-controls={`home-ops-panel-${tab}`}
                            tabIndex={activeTab === tab ? 0 : -1}
                            onClick={() => setActiveTab(tab)}
                            onKeyDown={(event) => handleTabKeyDown(event, tab)}
                        >
                            <strong>
                                {HOME_OPS_TAB_META[tab].label}
                                {tab === 'notice' && <NewBadge count={unseenNoticeCount} />}
                            </strong>
                            <small>{HOME_OPS_TAB_META[tab].desc}</small>
                        </button>
                    ))}
                </div>
                )}

                <div className="home-ops-content">
                    <div
                        id="home-ops-panel-notice"
                        className="home-ops-panel home-ops-notice-panel"
                        role="tabpanel"
                        aria-labelledby="home-ops-tab-notice"
                        hidden={briefingOnly || activeTab !== 'notice'}
                    >
                        {/*
                          * 제목을 다시 찍지 않는다(2026-09-10, 사장님 "홈탭에 수익인증이 중복으로 있네요").
                          * 바로 위 탭 버튼이 이미 '공지사항' 과 그 설명을 보여 준다 — 패널이 같은 말을 또 하면
                          * 화면 한 뼘이 같은 글자 두 줄로 채워진다. 쓰는 법만 한 줄 남긴다.
                          */}
                        <p className="home-ops-panel-hint">제목을 누르면 내용을 접거나 펼칠 수 있습니다.</p>
                        {notices.length > 0 ? (
                            <div className="home-ops-notices">
                                {notices.map((notice, index) => (
                                    <NoticeCard
                                        key={notice.id || `notice-${index}`}
                                        notice={notice}
                                        index={index}
                                        open={openNoticeId === notice.id}
                                        onToggle={() => setOpenNoticeId((current) => current === notice.id ? null : notice.id)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="home-ops-empty">{noticeLoading ? '최신 공지를 불러오는 중입니다.' : '현재 등록된 공지사항이 없습니다.'}</div>
                        )}
                    </div>

                    <div
                        id="home-ops-panel-deputy"
                        className="home-ops-panel"
                        hidden={!briefingOnly}
                    >
                        {briefing ? (
                            <>
                                <div className="home-ops-brief-head">
                                    <div>
                                        <span className="home-ops-kicker">부방장 황금키워드</span>
                                        <h3>{briefing.title}</h3>
                                        <p className="home-ops-brief-lead">사람은 많이 찾는데 글은 적은 말을 골라 뒀습니다. 경쟁 글이 몇 개인지 먼저 보세요. 그 숫자가 작을수록 지금 들어갈 자리가 있습니다.</p>
                                        <p>{briefing.author} 제공 · {formatDate(briefing.publishedAt)} 검토본 · 키워드 {briefing.rows.length}개 · 원본 이미지 {briefing.sourceImages.length}장 추적 정보 기록</p>
                                    </div>
                                    <div className="home-ops-fixed-badge">
                                        <strong>{briefingResult?.source === 'saved' ? '관리자 저장본' : '초기 고정본'}</strong>
                                        <span>관리자가 수정·발행하기 전까지 유지</span>
                                    </div>
                                </div>
                                <div className="home-ops-picks">
                                    {picks.lead && (
                                        <div className="home-ops-pick home-ops-pick-lead">
                                            <span className="home-ops-pick-tag"><i className="tone-open" />경쟁 글이 가장 적은 말</span>
                                            <p className="home-ops-pick-kw">{picks.lead.keyword}</p>
                                            <p className="home-ops-pick-say">
                                                {numberFormatter.format(picks.lead.searchVolume)}명이 찾는 말인데 지금 올라온 글은 <b>{numberFormatter.format(picks.lead.documentCount)}개</b>입니다.
                                            </p>
                                            <div className="home-ops-pick-figs">
                                                <div><span>한 달 검색</span><b><CountUp value={picks.lead.searchVolume} /></b></div>
                                                <div><span>경쟁 글</span><b className="tone-open-text"><CountUp value={picks.lead.documentCount} /></b></div>
                                                <div><span>한 글자리당 사람</span><b><CountUp value={sharePerPost(picks.lead)} /></b></div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="home-ops-pick-side">
                                        {picks.small && (
                                            <div className="home-ops-pick">
                                                <span className="home-ops-pick-tag"><i className="tone-open" />글이 아직 한 자릿수</span>
                                                <p className="home-ops-pick-kw">{picks.small.keyword}</p>
                                                <div className="home-ops-pick-figs">
                                                    <div><span>한 달 검색</span><b><CountUp value={picks.small.searchVolume} /></b></div>
                                                    <div><span>경쟁 글</span><b className="tone-open-text"><CountUp value={picks.small.documentCount} /></b></div>
                                                </div>
                                            </div>
                                        )}
                                        {picks.big && (
                                            <div className="home-ops-pick">
                                                <span className="home-ops-pick-tag"><i className="tone-busy" />사람이 가장 몰리는 말</span>
                                                <p className="home-ops-pick-kw">{picks.big.keyword}</p>
                                                <div className="home-ops-pick-figs">
                                                    <div><span>한 달 검색</span><b><CountUp value={picks.big.searchVolume} /></b></div>
                                                    <div><span>경쟁 글</span><b><CountUp value={picks.big.documentCount} /></b></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="home-ops-chart-wrap">
                                    <div className="home-ops-subhead">
                                        <strong>한 글자리당 찾는 사람이 많은 10개</strong>
                                        <span>검색량 ÷ (경쟁 글 + 1) 순 · 차트만 띄어쓰기·완전 중복을 정리합니다.</span>
                                    </div>
                                    <KeywordChart rows={chartRows} />
                                </div>
                                <div className="home-ops-table-title">
                                    <strong>이미지 원문 전체 {briefing.rows.length}행</strong>
                                    <span id="home-ops-table-note">중복 행도 원문 그대로 보존 · 기회지수 = 검색량 ÷ (문서수 + 1) · 실시간 값이 아닌 고정 스냅샷</span>
                                </div>
                                <KeywordTable rows={briefing.rows} />
                                <KeywordMobileCards rows={briefing.rows} />
                            </>
                        ) : (
                            <div className="home-ops-empty">{briefingLoading ? '저장된 키워드 브리핑을 불러오는 중입니다.' : '표시할 키워드 브리핑이 없습니다.'}</div>
                        )}
                    </div>

                    <div
                        id="home-ops-panel-realtime"
                        className="home-ops-panel home-ops-realtime-panel"
                        role="tabpanel"
                        aria-labelledby="home-ops-tab-realtime"
                        hidden={briefingOnly || activeTab !== 'realtime'}
                    >
                        {activeTab === 'realtime' ? realtimePanel : null}
                    </div>

                    <div
                        id="home-ops-panel-income"
                        className="home-ops-panel home-ops-income-panel"
                        role="tabpanel"
                        aria-labelledby="home-ops-tab-income"
                        hidden={briefingOnly || activeTab !== 'income'}
                    >
                        {/* 제목은 탭 버튼이 이미 말한다 — 여기서는 이 자료가 어디서 온 것인지와 전체 보기만. */}
                        <div className="home-ops-panel-head home-ops-panel-head-slim">
                            <small>{usingManagedProofs ? '관리자가 등록한 실제 인증 자료입니다.' : incomeResult?.source === 'cache' ? '최근 확인한 승인 자료입니다.' : incomeResult?.source === 'unavailable' ? '서버 연결 상태를 확인 중입니다.' : '승인된 실제 자료만 보여드립니다.'}</small>
                            <Link to="/community">전체 보기·작성 →</Link>
                        </div>
                        {displayIncomeProofs.length > 0 ? (
                            <div className="home-ops-income-list">
                                {displayIncomeProofs.map((proof, index) => (
                                    <IncomeProofCard key={proof.id} proof={proof} eager={index < 3} />
                                ))}
                            </div>
                        ) : (
                            <div className="home-ops-empty">
                                {incomeLoading
                                    ? '수익 인증을 불러오는 중입니다.'
                                    : incomeResult?.source === 'unavailable'
                                        ? '수익 인증을 일시적으로 불러오지 못했습니다. 잠시 후 다시 확인해주세요.'
                                        : '현재 공개된 수익 인증이 없습니다.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

export default HomeOperationsBoard;
