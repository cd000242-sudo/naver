import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
    fetchCommunityIncomeProofs,
    fetchHomeKeywordBriefing,
    fetchHomeNotices,
    type CommunityIncomeProof,
    type CommunityIncomeProofResult,
    type HomeKeywordBriefingResult,
    type HomeNotice,
} from '../lib/siteOps';
import { selectKeywordChartRows, type HomeKeywordRow } from '../lib/homeKeywordBriefing';

const numberFormatter = new Intl.NumberFormat('ko-KR');
const decimalFormatter = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

type HomeOperationsTab = 'notice' | 'realtime' | 'income';

// 무료 선정 황금키워드는 홈 안의 탭이 아니라 전용 페이지(BRIEFING_PAGE_PATH)로 뺐다.
// 별도 주소여야 페이지 전환이 생기고, 그래야 구글 자체 전면광고(Vignette)가 뜰 자리가 생긴다.
// 광고 시청을 열람 조건으로 걸지는 않는다 — AdSense 는 보상형 유도를 금지한다.
const BRIEFING_PAGE_PATH = '/briefing';

const HOME_OPS_TAB_ORDER: HomeOperationsTab[] = ['realtime', 'notice', 'income'];
const HOME_OPS_TAB_META: Record<HomeOperationsTab, { label: string; desc: string; accent?: string }> = {
    realtime: { label: '실시간 검색어', desc: '네이버·뉴스 등 현재 흐름을 참고용으로 확인', accent: '#44d7b6' },
    notice: { label: '공지사항', desc: '최신 공지를 접고 펼쳐 확인' },
    income: { label: '수익 인증', desc: '승인된 실제 인증 자료만 표시' },
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
    if (normalized.includes('important') || normalized.includes('중요')) return { label: '중요', color: '#ff7a90' };
    if (normalized.includes('update') || normalized.includes('업데이트')) return { label: '업데이트', color: '#69b7ff' };
    if (normalized.includes('event') || normalized.includes('이벤트')) return { label: '이벤트', color: '#c995ff' };
    if (normalized.includes('tip') || normalized.includes('안내')) return { label: '안내', color: '#44d7b6' };
    return { label: '공지', color: '#f4c95d' };
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
            {state === 'copied' ? '복사됨 ✓' : state === 'failed' ? '복사 실패' : label}
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
                        <span className="home-ops-notice-badge" style={{ color: badge.color, borderColor: `${badge.color}55`, background: `${badge.color}16` }}>{badge.label}</span>
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

function IncomeProofCard({ proof }: { proof: CommunityIncomeProof }) {
    if (!proof.media) return null;
    const mediaAlt = proof.mediaName || `${proof.author} 수익 인증`;
    return (
        <article className="home-ops-income-card">
            <div className="home-ops-income-visual">
                {proof.mediaType === 'video' ? (
                    <video src={proof.media} controls playsInline preload="metadata" aria-label={mediaAlt} />
                ) : (
                    // eager: the income panel stays mounted (hidden) so a small set of
                    // proof images preloads in the background and appears instantly on tab open.
                    <img src={proof.media} alt={mediaAlt} loading="eager" decoding="async" referrerPolicy="no-referrer" />
                )}
            </div>
            <div className="home-ops-income-copy">
                <span>실제 수익 인증</span>
                <h3>{proof.amount}</h3>
                <p>{proof.desc}</p>
                <small>{proof.author}{proof.date ? ` · ${proof.date}` : ''}</small>
                <Link to="/community">커뮤니티에서 크게 보기 →</Link>
            </div>
        </article>
    );
}

function cleanManagedProofText(value: unknown, fallback: string, maxLength: number): string {
    const cleaned = String(value || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
    return cleaned || fallback;
}

function normalizeManagedProofSrc(value: unknown): string {
    const src = String(value || '').trim();
    if (!src || src.length > 4096 || /[\u0000-\u001f\u007f\\]/.test(src)) return '';
    if (src.startsWith('/images/') && !src.includes('..') && !src.startsWith('//')) return src;
    try {
        const parsed = new URL(src);
        const hostname = parsed.hostname.toLocaleLowerCase();
        const trustedHost = hostname === 'leaderspro.kr'
            || hostname === 'www.leaderspro.kr'
            || hostname === '141.164.59.17.sslip.io';
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password && trustedHost ? src : '';
    } catch {
        return '';
    }
}

function managedProofToIncomeProof(proof: HomeManagedProof, index: number): CommunityIncomeProof | null {
    const media = normalizeManagedProofSrc(proof.src);
    if (!media) return null;
    const amount = cleanManagedProofText(proof.title || proof.metric, '실제 인증 캡처', 100);
    return {
        id: `managed-income-${index + 1}-${media}`,
        amount,
        author: '운영 등록 인증',
        date: '',
        desc: cleanManagedProofText(proof.desc || proof.alt, '관리자가 등록한 실제 인증 이미지입니다.', 600),
        tags: [],
        media,
        mediaType: 'image',
        mediaName: cleanManagedProofText(proof.alt || proof.title, amount, 120),
    };
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
                                    {decimalFormatter.format(row.opportunity)}
                                </KeywordSearchLink>
                            </small>
                            <CopyKeywordButton text={row.keyword} />
                        </div>
                        <div className="home-ops-chart-track" aria-hidden="true">
                            <span style={{ width: `${width}%` }} />
                        </div>
                        <small>검색량 {numberFormatter.format(row.searchVolume)}</small>
                    </div>
                );
            })}
        </div>
    );
}

function KeywordTable({ rows }: { rows: HomeKeywordRow[] }) {
    return (
        <div className="home-ops-table-shell" tabIndex={0} aria-label={`부방장 키워드 전체 ${rows.length}행`} aria-describedby="home-ops-table-note">
            <div className="home-ops-copy-all-bar">
                <CopyKeywordButton
                    text={rows.map((row) => row.keyword).join(String.fromCharCode(10))}
                    label={`📋 전체 ${rows.length}개 복사`}
                    ariaLabel={`부방장 키워드 ${rows.length}개 전체 복사`}
                />
            </div>
            <table className="home-ops-table">
                <caption className="home-ops-sr-only">부방장 황금키워드 전체 {rows.length}행</caption>
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">키워드</th>
                        <th scope="col">검색량</th>
                        <th scope="col">블로그 문서수</th>
                        <th scope="col">기회지수</th>
                        <th scope="col">바로가기</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={`${index}-${row.keyword}-${row.documentCount}`}>
                            <td>{index + 1}</td>
                            <th scope="row">
                                <KeywordSearchLink row={row} provider="naver" className="home-ops-keyword-link">
                                    {row.keyword}
                                </KeywordSearchLink>
                                <CopyKeywordButton text={row.keyword} />
                            </th>
                            <td>{numberFormatter.format(row.searchVolume)}</td>
                            <td>{numberFormatter.format(row.documentCount)}</td>
                            <td className="home-ops-opportunity-cell">
                                <KeywordSearchLink row={row} provider="daum" className="home-ops-opportunity-link">
                                    {decimalFormatter.format(row.opportunity)}
                                </KeywordSearchLink>
                            </td>
                            <td className="home-ops-search-cell"><KeywordSearchLinks row={row} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function KeywordMobileCards({ rows }: { rows: HomeKeywordRow[] }) {
    return (
        <div className="home-ops-keyword-cards" aria-label={`부방장 키워드 모바일 목록 ${rows.length}행`}>
            {rows.map((row, index) => (
                <article className="home-ops-keyword-card" key={`mobile-${index}-${row.keyword}-${row.documentCount}`}>
                    <div className="home-ops-keyword-card-head">
                        <span>#{index + 1}</span>
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

function HomeOperationsBoard({ realtimePanel, managedProofs = [], briefingOnly = false }: HomeOperationsBoardProps) {
    const [notices, setNotices] = useState<HomeNotice[]>([]);
    const [openNoticeId, setOpenNoticeId] = useState<string | null>(null);
    const [incomeResult, setIncomeResult] = useState<CommunityIncomeProofResult | null>(null);
    const [briefingResult, setBriefingResult] = useState<HomeKeywordBriefingResult | null>(null);
    const [activeTab, setActiveTab] = useState<HomeOperationsTab>('realtime');
    const [noticeLoading, setNoticeLoading] = useState(true);
    const [incomeLoading, setIncomeLoading] = useState(true);
    const [briefingLoading, setBriefingLoading] = useState(true);
    const sidenavRef = useRef<HTMLDivElement>(null);

    // On mobile the side-nav collapses to a horizontal scroll row; keep the
    // active tab centered in view. Scrolls only the nav container, never the page.
    useEffect(() => {
        const nav = sidenavRef.current;
        const el = nav?.querySelector<HTMLElement>(`#home-ops-tab-${activeTab}`);
        if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
        const target = el.offsetLeft - (nav.clientWidth - el.clientWidth) / 2;
        nav.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }, [activeTab]);

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

        fetchHomeKeywordBriefing()
            .then((latestBriefing) => { if (active) setBriefingResult(latestBriefing); })
            .catch(() => undefined)
            .finally(() => { if (active) setBriefingLoading(false); });
        return () => { active = false; };
    }, []);

    const briefing = briefingResult?.briefing || null;
    const incomeProofs = (incomeResult?.items || []).filter((proof) => Boolean(proof.media));
    const managedIncomeProofs = useMemo(() => (
        managedProofs
            .map(managedProofToIncomeProof)
            .filter((proof): proof is CommunityIncomeProof => Boolean(proof))
            .slice(0, 3)
    ), [managedProofs]);
    const displayIncomeProofs = incomeProofs.length > 0 ? incomeProofs : managedIncomeProofs;
    const usingManagedProofs = incomeProofs.length === 0 && managedIncomeProofs.length > 0;
    const chartRows = useMemo(() => briefing ? selectKeywordChartRows(briefing, 10) : [], [briefing]);
    const uniqueCount = useMemo(() => briefing ? uniqueKeywordCount(briefing.rows) : 0, [briefing]);
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
        <section className="home-ops" aria-labelledby="home-ops-title">
            <style>{`
                .home-ops {
                    position: relative;
                    z-index: 2;
                    max-width: 1412px;
                    margin: 0 auto 46px;
                    padding: 92px 24px 0;
                    word-break: keep-all;
                    overflow-wrap: break-word;
                }
                .home-ops-header { margin-bottom: 20px; }
                /* 처음 온 사람이 이 사이트가 뭘 하는 곳인지 3초 안에 알 수 있게 하는 소개 문단.
                   홈 배경이 밝은 사진이라 반투명 판을 깔지 않으면 본문이 배경에 묻힌다. */
                .home-ops-intro-wrap {
                    max-width: 760px;
                    margin-top: 12px;
                    padding: 16px 18px;
                    border-radius: 14px;
                    border: 1px solid rgba(255, 255, 255, .12);
                    background: rgba(8, 12, 20, .58);
                    backdrop-filter: blur(6px);
                }
                .home-ops-intro {
                    margin: 0;
                    font-size: 15px;
                    line-height: 1.7;
                    color: rgba(255, 255, 255, .88);
                }
                .home-ops-intro + .home-ops-intro { margin-top: 10px; }
                .home-ops-intro strong { color: #fff; font-weight: 800; }
                @media (max-width: 720px) {
                    .home-ops-intro-wrap { padding: 13px 14px; }
                    .home-ops-intro { font-size: 14px; }
                }
                .home-ops-kicker {
                    display: inline-flex;
                    align-items: center;
                    min-height: 32px;
                    padding: 6px 12px;
                    border: 1px solid rgba(68,215,182,0.36);
                    border-radius: 999px;
                    background: rgba(68,215,182,0.11);
                    color: #63efd0;
                    font-size: 13px;
                    font-weight: 900;
                    letter-spacing: 1.2px;
                }
                .home-ops-header h2 {
                    margin: 12px 0 8px;
                    color: #fff;
                    font-size: clamp(31px, 4vw, 48px);
                    line-height: 1.18;
                }
                .home-ops-header p {
                    max-width: 850px;
                    margin: 0;
                    color: rgba(235,242,250,0.74);
                    font-size: 17px;
                    line-height: 1.75;
                }
                .home-ops-panel {
                    min-width: 0;
                    border: 1px solid rgba(255,255,255,0.14);
                    border-radius: 14px;
                    background: linear-gradient(180deg, rgba(14,23,36,0.95), rgba(6,11,19,0.96));
                    box-shadow: 0 26px 70px rgba(0,0,0,0.28);
                    overflow: hidden;
                }
                .home-ops-panel-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    padding: 20px 22px;
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }
                .home-ops-panel-head strong { color: #fff; font-size: 20px; font-weight: 900; }
                .home-ops-panel-head small { color: rgba(235,242,250,0.72); font-size: 16px; line-height: 1.55; }
                .home-ops-panel-head a {
                    flex: 0 0 auto;
                    color: #f4c95d;
                    font-size: 16px;
                    font-weight: 850;
                    text-decoration: none;
                }
                .home-ops-notices {
                    display: grid;
                    gap: 10px;
                    max-height: 640px;
                    padding: 12px;
                    overflow-y: auto;
                    scrollbar-gutter: stable;
                }
                .home-ops-notice {
                    min-width: 0;
                    border: 1px solid rgba(255,255,255,0.10);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.04);
                    overflow: hidden;
                }
                .home-ops-notice.open {
                    border-color: rgba(244,201,93,0.30);
                    background: linear-gradient(135deg, rgba(244,201,93,0.10), rgba(68,215,182,0.055));
                }
                .home-ops-notice h3 { margin: 0; }
                .home-ops-notice-toggle {
                    display: block;
                    width: 100%;
                    min-height: 48px;
                    padding: 18px;
                    border: 0;
                    background: transparent;
                    color: inherit;
                    font: inherit;
                    text-align: left;
                }
                .home-ops-notice-toggle:focus-visible { outline: 3px solid rgba(68,215,182,0.62); outline-offset: -3px; }
                .home-ops-notice-meta {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 12px;
                }
                .home-ops-notice-badge {
                    padding: 4px 8px;
                    border: 1px solid;
                    border-radius: 999px;
                    font-size: 16px;
                    font-weight: 900;
                }
                .home-ops-notice-meta time { color: rgba(235,242,250,0.72); font-size: 16px; }
                .home-ops-notice-indicator { margin-left: auto; color: #f4c95d; font-size: 24px; font-weight: 900; line-height: 1; }
                .home-ops-notice-title { display: block; color: #f7fbff; font-size: 19px; font-weight: 900; line-height: 1.5; }
                .home-ops-notice-summary {
                    display: block;
                    margin-top: 7px;
                    color: rgba(235,242,250,0.72);
                    font-size: 16px;
                    line-height: 1.65;
                }
                .home-ops-notice-detail {
                    padding: 0 18px 20px;
                    border-top: 1px solid rgba(255,255,255,0.08);
                }
                .home-ops-notice-detail p {
                    margin: 18px 0 0;
                    color: rgba(245,249,253,0.82);
                    font-size: 17px;
                    line-height: 1.8;
                    white-space: pre-line;
                }
                .home-ops-income-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr)); gap: 12px; padding: 12px; }
                .home-ops-income-card {
                    display: grid;
                    grid-template-columns: 136px minmax(0, 1fr);
                    min-width: 0;
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.10);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.04);
                }
                .home-ops-income-visual {
                    min-height: 136px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    background: linear-gradient(145deg, rgba(68,215,182,0.24), rgba(244,201,93,0.16));
                }
                .home-ops-income-visual img,
                .home-ops-income-visual video { width: 100%; height: 100%; min-height: 136px; object-fit: contain; display: block; }
                .home-ops-income-visual > strong { padding: 10px; color: #f4c95d; font-size: 20px; line-height: 1.35; text-align: center; }
                .home-ops-income-copy { min-width: 0; padding: 15px 16px; }
                .home-ops-income-copy > span { color: #63efd0; font-size: 16px; font-weight: 900; }
                .home-ops-income-copy h3 { margin: 5px 0 7px; color: #fff; font-size: 21px; line-height: 1.35; }
                .home-ops-income-copy p {
                    display: -webkit-box;
                    margin: 0 0 9px;
                    overflow: hidden;
                    color: rgba(235,242,250,0.74);
                    font-size: 16px;
                    line-height: 1.6;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 3;
                }
                .home-ops-income-copy small { display: block; color: rgba(235,242,250,0.72); font-size: 16px; line-height: 1.5; }
                .home-ops-income-copy a { display: inline-block; margin-top: 10px; color: #f4c95d; font-size: 16px; font-weight: 850; text-decoration: none; }
                .home-ops-empty {
                    padding: 34px 22px;
                    color: rgba(235,242,250,0.68);
                    font-size: 16px;
                    line-height: 1.65;
                    text-align: center;
                }
                .home-ops-layout {
                    display: grid;
                    grid-template-columns: minmax(210px, 250px) minmax(0, 1fr);
                    gap: 16px;
                    align-items: start;
                }
                /* 전용 페이지에서는 사이드탭을 렌더하지 않는다. 이때 2열 그리드를 그대로 두면
                   본문이 사이드탭 자리(250px)로 밀려 들어가 글자가 세로로 쪼개진다. */
                .home-ops-layout.briefing-only { grid-template-columns: minmax(0, 1fr); }
                /* 무료 선정 황금키워드는 이 사이트의 대표 콘텐츠라 다른 항목과 확실히 구분한다. */
                .home-ops-tab-featured {
                    position: relative;
                    text-decoration: none;
                    border-color: rgba(244, 201, 93, .55);
                    background: linear-gradient(135deg, rgba(244, 201, 93, .16), rgba(244, 201, 93, .05));
                    box-shadow: 0 6px 20px rgba(244, 201, 93, .12);
                }
                .home-ops-tab-featured:hover {
                    border-color: rgba(244, 201, 93, .9);
                    box-shadow: 0 10px 26px rgba(244, 201, 93, .22);
                }
                .home-ops-tab-featured strong { color: #f4c95d; }
                .home-ops-featured-flag {
                    display: inline-block;
                    align-self: flex-start;
                    margin-bottom: 6px;
                    padding: 2px 8px;
                    border-radius: 999px;
                    font-size: 10px;
                    font-weight: 900;
                    letter-spacing: .04em;
                    color: #1b1405;
                    background: #f4c95d;
                }
                .home-ops-sidenav {
                    position: sticky;
                    top: 80px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 8px;
                    border: 1px solid rgba(255,255,255,0.13);
                    border-radius: 14px;
                    background: rgba(5,11,18,0.84);
                }
                .home-ops-sidenav .home-ops-tab { width: 100%; }
                .home-ops-content { min-width: 0; }
                .home-ops-tab {
                    min-height: 64px;
                    display: grid;
                    align-content: center;
                    gap: 4px;
                    padding: 10px 16px;
                    border: 1px solid transparent;
                    border-radius: 10px;
                    background: transparent;
                    color: rgba(235,242,250,0.70);
                    font: inherit;
                    text-align: left;
                    cursor: pointer;
                }
                .home-ops-tab strong { font-size: 18px; line-height: 1.35; }
                .home-ops-tab small { font-size: 14px; line-height: 1.45; }
                .home-ops-tab.active {
                    border-color: rgba(244,201,93,0.48);
                    background: linear-gradient(135deg, rgba(244,201,93,0.18), rgba(68,215,182,0.10));
                    color: #fff;
                    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
                }
                .home-ops-tab:focus-visible { outline: 3px solid rgba(68,215,182,0.55); outline-offset: 2px; }
                .home-ops-brief-head {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 18px;
                    padding: 24px;
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }
                .home-ops-brief-head h3 { margin: 9px 0 7px; color: #fff; font-size: clamp(25px, 3vw, 34px); line-height: 1.3; }
                .home-ops-brief-head p { margin: 0; color: rgba(235,242,250,0.70); font-size: 15px; line-height: 1.65; }
                .home-ops-fixed-badge {
                    flex: 0 0 auto;
                    display: grid;
                    gap: 4px;
                    min-width: 170px;
                    padding: 12px 14px;
                    border: 1px solid rgba(244,201,93,0.36);
                    border-radius: 10px;
                    background: rgba(244,201,93,0.10);
                    text-align: right;
                }
                .home-ops-fixed-badge strong { color: #f4c95d; font-size: 14px; }
                .home-ops-fixed-badge span { color: rgba(235,242,250,0.64); font-size: 13px; }
                .home-ops-metrics {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 10px;
                    padding: 18px 22px 0;
                }
                .home-ops-metric {
                    padding: 14px;
                    border: 1px solid rgba(255,255,255,0.09);
                    border-radius: 9px;
                    background: rgba(255,255,255,0.04);
                }
                .home-ops-metric strong { display: block; color: #fff; font-size: 22px; }
                .home-ops-metric span { display: block; margin-top: 5px; color: rgba(235,242,250,0.62); font-size: 13px; line-height: 1.4; }
                .home-ops-chart-wrap { padding: 22px 24px 24px; }
                .home-ops-subhead {
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    margin-bottom: 16px;
                    color: rgba(235,242,250,0.68);
                    font-size: 14px;
                    line-height: 1.5;
                }
                .home-ops-subhead strong { color: #fff; font-size: 17px; }
                .home-ops-chart { display: grid; gap: 14px; }
                .home-ops-chart-row { display: grid; grid-template-columns: minmax(0, 1fr) 128px; gap: 7px 14px; }
                .home-ops-chart-label { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 9px; align-items: center; }
                .home-ops-chart-label > span { color: #f4c95d; font-size: 14px; font-weight: 900; }
                .home-ops-chart-label strong { overflow: hidden; color: #eef5fb; font-size: 16px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
                .home-ops-chart-label small { color: #44d7b6; font-size: 14px; font-weight: 900; }
                .home-ops-chart-track { grid-column: 1; height: 9px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,0.08); }
                .home-ops-chart-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #44d7b6, #f4c95d); }
                .home-ops-chart-row > small { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: rgba(235,242,250,0.64); font-size: 13px; text-align: right; white-space: nowrap; }
                .home-ops-table-title {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 18px;
                    padding: 20px 24px 13px;
                    border-top: 1px solid rgba(255,255,255,0.09);
                }
                .home-ops-table-title strong { color: #fff; font-size: 18px; }
                .home-ops-table-title span { max-width: 720px; color: rgba(235,242,250,0.60); font-size: 13px; line-height: 1.55; text-align: right; }
                .home-ops-table-shell {
                    max-height: none;
                    margin: 0 16px 20px;
                    overflow: auto;
                    border: 1px solid rgba(255,255,255,0.10);
                    border-radius: 10px;
                    outline: none;
                    scrollbar-gutter: stable;
                }
                .home-ops-table-shell:focus { border-color: rgba(68,215,182,0.68); box-shadow: 0 0 0 3px rgba(68,215,182,0.11); }
                .home-ops-table { width: 100%; min-width: 980px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
                .home-ops-table th, .home-ops-table td { padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.07); }
                .home-ops-table thead th {
                    position: sticky;
                    top: 0;
                    z-index: 1;
                    background: #111d2c;
                    color: rgba(235,242,250,0.78);
                    font-size: 15px;
                    font-weight: 900;
                    text-align: right;
                    white-space: nowrap;
                }
                .home-ops-table thead th:nth-child(2) { text-align: left; }
                .home-ops-table tbody td { color: rgba(235,242,250,0.76); font-size: 16px; text-align: right; white-space: nowrap; }
                .home-ops-table tbody th { color: #f3f8fc; font-size: 16px; font-weight: 780; line-height: 1.5; text-align: left; white-space: nowrap; }
                .home-ops-table tbody td:first-child { width: 44px; color: rgba(235,242,250,0.50); }
                .home-ops-table tbody td.home-ops-opportunity-cell { color: #58e8c8; font-weight: 900; }
                .home-ops-table tbody td.home-ops-search-cell { min-width: 178px; text-align: left; }
                .home-ops-table tbody tr:hover { background: rgba(68,215,182,0.055); }
                .home-ops-keyword-link,
                .home-ops-opportunity-link {
                    color: inherit;
                    text-decoration: none;
                    border-bottom: 1px solid rgba(244,201,93,0.42);
                    transition: color .16s ease, border-color .16s ease, background .16s ease;
                }
                .home-ops-keyword-link:hover,
                .home-ops-keyword-link:focus-visible {
                    color: #f4c95d;
                    border-color: rgba(244,201,93,0.92);
                    outline: none;
                }
                .home-ops-opportunity-link {
                    color: #58e8c8;
                    border-color: rgba(88,232,200,0.44);
                    font-weight: 950;
                }
                .home-ops-opportunity-link:hover,
                .home-ops-opportunity-link:focus-visible {
                    color: #9dffe8;
                    border-color: rgba(157,255,232,0.92);
                    outline: none;
                }
                .home-ops-copy-btn {
                    display: inline-flex;
                    align-items: center;
                    min-height: 26px;
                    margin-left: 6px;
                    border: 1px solid rgba(245,197,66,.34);
                    border-radius: 999px;
                    background: rgba(245,197,66,.08);
                    color: #f5c542;
                    padding: 3px 9px;
                    font-size: 11px;
                    font-weight: 900;
                    cursor: pointer;
                }
                .home-ops-copy-btn:disabled { opacity: .7; }
                .home-ops-copy-all-bar {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 8px;
                }
                .home-ops-search-links {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 7px;
                    justify-content: flex-start;
                    align-items: center;
                }
                .home-ops-search-links a {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 34px;
                    padding: 0 11px;
                    border: 1px solid rgba(244,201,93,0.36);
                    border-radius: 999px;
                    background: rgba(244,201,93,0.09);
                    color: #ffe6a6;
                    font-size: 14px;
                    font-weight: 900;
                    text-decoration: none;
                    white-space: nowrap;
                }
                .home-ops-search-links a:hover,
                .home-ops-search-links a:focus-visible {
                    border-color: rgba(244,201,93,0.80);
                    background: rgba(244,201,93,0.18);
                    color: #fff2c8;
                    outline: none;
                }
                .home-ops-search-links.compact {
                    padding: 12px 14px 14px;
                    border-top: 1px solid rgba(255,255,255,0.07);
                }
                .home-ops-search-links.compact a {
                    flex: 1 1 86px;
                    min-height: 40px;
                    font-size: 15px;
                }
                .home-ops-keyword-cards { display: none; }
                .home-ops-keyword-card {
                    border: 1px solid rgba(255,255,255,0.10);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.045);
                    overflow: hidden;
                }
                .home-ops-keyword-card-head {
                    display: grid;
                    grid-template-columns: 42px minmax(0, 1fr);
                    gap: 10px;
                    align-items: start;
                    padding: 14px;
                    border-bottom: 1px solid rgba(255,255,255,0.07);
                }
                .home-ops-keyword-card-head span {
                    color: #f4c95d;
                    font-size: 15px;
                    font-weight: 900;
                }
                .home-ops-keyword-card-head strong {
                    min-width: 0;
                    color: #f7fbff;
                    font-size: 18px;
                    line-height: 1.45;
                    overflow-wrap: anywhere;
                }
                .home-ops-keyword-card dl {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 1px;
                    margin: 0;
                    background: rgba(255,255,255,0.06);
                }
                .home-ops-keyword-card dl div {
                    min-width: 0;
                    padding: 12px 10px;
                    background: rgba(8,14,24,0.94);
                }
                .home-ops-keyword-card dt {
                    margin: 0 0 5px;
                    color: rgba(235,242,250,0.62);
                    font-size: 13px;
                    font-weight: 800;
                }
                .home-ops-keyword-card dd {
                    margin: 0;
                    color: #fff;
                    font-size: 16px;
                    font-weight: 900;
                    line-height: 1.35;
                    word-break: break-word;
                }
                .home-ops-keyword-card dl div:last-child dd { color: #58e8c8; }
                .home-ops-realtime-panel { padding: 18px; }
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
                    .home-ops-sidenav .home-ops-tab { flex: 0 0 auto; min-width: 200px; }
                }
                @media (max-width: 720px) {
                    .home-ops { padding: 82px 12px 0; margin-bottom: 34px; }
                    .home-ops-header h2 { font-size: clamp(29px, 9vw, 40px); }
                    .home-ops-header p { font-size: 16px; }
                    .home-ops-panel-head { align-items: flex-start; padding: 18px 16px; }
                    .home-ops-notice-toggle { padding: 16px; }
                    .home-ops-notice-detail { padding: 0 16px 18px; }
                    .home-ops-income-card { grid-template-columns: minmax(0, 1fr); }
                    .home-ops-income-visual,
                    .home-ops-income-visual img,
                    .home-ops-income-visual video { min-height: 200px; max-height: 360px; }
                    .home-ops-income-visual img { min-height: 200px; max-height: 360px; }
                    .home-ops-tab { min-height: 60px; }
                    .home-ops-brief-head { align-items: flex-start; flex-direction: column; padding: 20px 16px; }
                    .home-ops-fixed-badge { width: 100%; box-sizing: border-box; text-align: left; }
                    .home-ops-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 14px 12px 0; }
                    .home-ops-chart-wrap { padding: 20px 14px; }
                    .home-ops-subhead { align-items: flex-start; flex-direction: column; }
                    .home-ops-chart-row { grid-template-columns: minmax(0, 1fr); }
                    .home-ops-chart-label { grid-template-columns: 24px minmax(0, 1fr); }
                    .home-ops-chart-label strong { white-space: normal; }
                    .home-ops-chart-label small { grid-column: 2; }
                    .home-ops-chart-track { grid-column: 1 / -1; }
                    .home-ops-chart-row > small { grid-column: 1 / -1; grid-row: auto; text-align: left; }
                    .home-ops-table-title { align-items: flex-start; flex-direction: column; padding: 18px 14px 12px; }
                    .home-ops-table-title span { text-align: left; }
                    .home-ops-table-shell { display: none; }
                    .home-ops-keyword-cards { display: grid; gap: 10px; padding: 0 10px 16px; }
                    .home-ops-realtime-panel { padding: 10px; }
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
                    <span className="home-ops-kicker">WELCOME</span>
                    <h2 id="home-ops-title">블로그로 수익을 내는 데 필요한 것들을 한곳에 모았습니다</h2>
                    <div className="home-ops-intro-wrap">
                        <p className="home-ops-intro">
                            리더스프로는 <strong>키워드 발굴부터 글쓰기·발행까지</strong> 이어지는 블로그 운영 도구를 만듭니다.
                            어떤 키워드를 써야 할지 찾아주는 <strong>LEWORD</strong>, 키워드만 넣으면 글·이미지·발행까지 처리하는
                            <strong> Better Life Naver</strong>, 외부 유입을 보조하는 <strong>Leaders Orbit</strong>이 있습니다.
                        </p>
                        <p className="home-ops-intro">
                            아래는 <strong>무료로 열려 있는 자료</strong>입니다. 매일 검토해 올리는 무료 선정 황금키워드와
                            실시간 검색어 흐름은 회원가입 없이 그냥 보셔도 됩니다. 둘러보시고 필요하시면 무료 체험부터 해보세요.
                        </p>
                    </div>
                </header>
            )}

            <div className={`home-ops-layout${briefingOnly ? ' briefing-only' : ''}`}>
                {!briefingOnly && (
                <div ref={sidenavRef} className="home-ops-sidenav" role="tablist" aria-label="홈 보기 선택" aria-orientation="vertical">
                    {/* react-router Link 가 아니라 일반 <a> 다. 클라이언트 라우팅은 AdSense 가
                        새 페이지로 인식하지 않아 전면광고가 뜨지 않는다. 실제 페이지 로드가
                        일어나야 광고 자리가 생긴다(정적 /briefing 페이지를 빌드에서 생성해 둔다). */}
                    <a className="home-ops-tab home-ops-tab-featured" href={BRIEFING_PAGE_PATH}>
                        <span className="home-ops-featured-flag">매일 갱신</span>
                        <strong>무료 선정 황금키워드</strong>
                        <small>매일 검토해 올린 고정 키워드 전체 보기 →</small>
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
                            <strong style={HOME_OPS_TAB_META[tab].accent ? { color: HOME_OPS_TAB_META[tab].accent } : undefined}>
                                {HOME_OPS_TAB_META[tab].label}
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
                        <div className="home-ops-panel-head">
                            <div>
                                <strong>공지사항</strong><br />
                                <small>제목을 누르면 내용을 접거나 펼칠 수 있습니다.</small>
                            </div>
                        </div>
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
                                        <span className="home-ops-kicker">DEPUTY GOLDEN KEYWORDS</span>
                                        <h3>{briefing.title}</h3>
                                        <p>{briefing.author} 제공 · {formatDate(briefing.publishedAt)} · 원본 이미지 {briefing.sourceImages.length}장 추적 정보 기록</p>
                                    </div>
                                    <div className="home-ops-fixed-badge">
                                        <strong>{briefingResult?.source === 'saved' ? '관리자 저장본' : '초기 고정본'}</strong>
                                        <span>관리자가 수정·발행하기 전까지 유지</span>
                                    </div>
                                </div>
                                <div className="home-ops-metrics">
                                    <div className="home-ops-metric"><strong>{briefing.rows.length}</strong><span>원본 전체 행</span></div>
                                    <div className="home-ops-metric"><strong>{uniqueCount}</strong><span>차트용 고유 키워드</span></div>
                                    <div className="home-ops-metric"><strong>{numberFormatter.format(Math.max(...briefing.rows.map((row) => row.searchVolume)))}</strong><span>최대 검색량</span></div>
                                    <div className="home-ops-metric"><strong>{decimalFormatter.format(Math.max(...briefing.rows.map((row) => row.opportunity)))}</strong><span>최대 기회지수</span></div>
                                </div>
                                <div className="home-ops-chart-wrap">
                                    <div className="home-ops-subhead">
                                        <strong>기회지수 TOP 10</strong>
                                        <span>차트만 띄어쓰기·완전 중복을 정리합니다.</span>
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
                        <div className="home-ops-panel-head">
                            <div>
                                <strong>수익 인증</strong><br />
                                <small>{usingManagedProofs ? '관리자가 등록한 실제 인증 자료입니다.' : incomeResult?.source === 'cache' ? '최근 확인한 승인 자료입니다.' : incomeResult?.source === 'unavailable' ? '서버 연결 상태를 확인 중입니다.' : '승인된 실제 자료만 보여드립니다.'}</small>
                            </div>
                            <Link to="/community">전체 보기·작성 →</Link>
                        </div>
                        {displayIncomeProofs.length > 0 ? (
                            <div className="home-ops-income-list">
                                {displayIncomeProofs.map((proof) => <IncomeProofCard key={proof.id} proof={proof} />)}
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
