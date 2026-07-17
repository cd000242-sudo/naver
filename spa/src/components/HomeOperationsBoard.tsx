import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
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

type HomeOperationsTab = 'deputy' | 'realtime';

interface HomeOperationsBoardProps {
    realtimePanel?: ReactNode;
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
    const mediaAlt = proof.mediaName || `${proof.author} 수익 인증`;
    return (
        <article className="home-ops-income-card">
            <div className="home-ops-income-visual">
                {proof.media ? (
                    proof.mediaType === 'video' ? (
                        <video src={proof.media} controls playsInline preload="none" aria-label={mediaAlt} />
                    ) : (
                        <img src={proof.media} alt={mediaAlt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                    )
                ) : (
                    <strong>{proof.amount}</strong>
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
                            <strong>{row.keyword}</strong>
                            <small>{decimalFormatter.format(row.opportunity)}</small>
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
            <table className="home-ops-table">
                <caption className="home-ops-sr-only">부방장 황금키워드 전체 {rows.length}행</caption>
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">키워드</th>
                        <th scope="col">검색량</th>
                        <th scope="col">블로그 문서수</th>
                        <th scope="col">기회지수</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={`${index}-${row.keyword}-${row.documentCount}`}>
                            <td>{index + 1}</td>
                            <th scope="row">{row.keyword}</th>
                            <td>{numberFormatter.format(row.searchVolume)}</td>
                            <td>{numberFormatter.format(row.documentCount)}</td>
                            <td>{decimalFormatter.format(row.opportunity)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function HomeOperationsBoard({ realtimePanel }: HomeOperationsBoardProps) {
    const [notices, setNotices] = useState<HomeNotice[]>([]);
    const [openNoticeId, setOpenNoticeId] = useState<string | null>(null);
    const [incomeResult, setIncomeResult] = useState<CommunityIncomeProofResult | null>(null);
    const [briefingResult, setBriefingResult] = useState<HomeKeywordBriefingResult | null>(null);
    const [activeTab, setActiveTab] = useState<HomeOperationsTab>('deputy');
    const [noticeLoading, setNoticeLoading] = useState(true);
    const [incomeLoading, setIncomeLoading] = useState(true);
    const [briefingLoading, setBriefingLoading] = useState(true);

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
    const incomeProofs = incomeResult?.items || [];
    const chartRows = useMemo(() => briefing ? selectKeywordChartRows(briefing, 10) : [], [briefing]);
    const uniqueCount = useMemo(() => briefing ? uniqueKeywordCount(briefing.rows) : 0, [briefing]);
    const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: HomeOperationsTab) => {
        const tabs: HomeOperationsTab[] = ['deputy', 'realtime'];
        const currentIndex = tabs.indexOf(currentTab);
        let nextTab: HomeOperationsTab | undefined;
        if (event.key === 'ArrowRight') nextTab = tabs[(currentIndex + 1) % tabs.length];
        if (event.key === 'ArrowLeft') nextTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
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
                .home-ops-community-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
                    align-items: start;
                    gap: 18px;
                    margin-bottom: 18px;
                }
                .home-ops-community-grid > .home-ops-panel { min-width: 0; }
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
                .home-ops-income-list { display: grid; gap: 10px; padding: 12px; }
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
                .home-ops-tabs {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 10px;
                    margin-bottom: 12px;
                    padding: 8px;
                    border: 1px solid rgba(255,255,255,0.13);
                    border-radius: 14px;
                    background: rgba(5,11,18,0.84);
                }
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
                .home-ops-table { width: 100%; min-width: 820px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
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
                .home-ops-table tbody td:last-child { color: #58e8c8; font-weight: 900; }
                .home-ops-table tbody tr:hover { background: rgba(68,215,182,0.055); }
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
                    .home-ops-community-grid { grid-template-columns: minmax(0, 1fr); }
                    .home-ops-realtime-panel .hero-realtime-board { min-height: 0; }
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
                    .home-ops-tabs { grid-template-columns: 1fr; }
                    .home-ops-tab { min-height: 60px; }
                    .home-ops-brief-head { align-items: flex-start; flex-direction: column; padding: 20px 16px; }
                    .home-ops-fixed-badge { width: 100%; box-sizing: border-box; text-align: left; }
                    .home-ops-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 14px 12px 0; }
                    .home-ops-chart-wrap { padding: 20px 14px; }
                    .home-ops-subhead { align-items: flex-start; flex-direction: column; }
                    .home-ops-chart-row { grid-template-columns: minmax(0, 1fr) 112px; }
                    .home-ops-table-title { align-items: flex-start; flex-direction: column; padding: 18px 14px 12px; }
                    .home-ops-table-title span { text-align: left; }
                    .home-ops-table-shell { margin: 0 8px 14px; }
                    .home-ops-realtime-panel { padding: 10px; }
                }
            `}</style>

            <header className="home-ops-header">
                <span className="home-ops-kicker">HOME OPERATIONS</span>
                <h2 id="home-ops-title">공지사항과 실제 수익 인증을 한눈에 확인하세요</h2>
                <p>공지는 제목을 눌러 편하게 접고 펼칠 수 있습니다. 최신 수익 인증을 함께 확인한 뒤, 매일 업데이트되는 부방장 황금키워드를 전체 폭으로 살펴보세요.</p>
            </header>

            <div className="home-ops-community-grid" data-home-ops-community>
                <aside className="home-ops-panel home-ops-notice-panel" data-home-ops-notices aria-label="공지사항">
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
                </aside>

                <aside className="home-ops-panel home-ops-income-panel" data-home-ops-income aria-label="수익 인증">
                    <div className="home-ops-panel-head">
                        <div>
                            <strong>수익 인증</strong><br />
                            <small>{incomeResult?.source === 'cache' ? '최근 확인한 승인 자료입니다.' : incomeResult?.source === 'unavailable' ? '서버 연결 상태를 확인 중입니다.' : '승인된 실제 자료만 보여드립니다.'}</small>
                        </div>
                        <Link to="/community">전체 보기·작성 →</Link>
                    </div>
                    {incomeProofs.length > 0 ? (
                        <div className="home-ops-income-list">
                            {incomeProofs.map((proof) => <IncomeProofCard key={proof.id} proof={proof} />)}
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
                </aside>
            </div>

            <div className="home-ops-tabs" role="tablist" aria-label="홈 키워드 보기 선택">
                <button
                    id="home-ops-tab-deputy"
                    type="button"
                    role="tab"
                    data-home-ops-tab="deputy"
                    className={`home-ops-tab${activeTab === 'deputy' ? ' active' : ''}`}
                    aria-selected={activeTab === 'deputy'}
                    aria-controls="home-ops-panel-deputy"
                    tabIndex={activeTab === 'deputy' ? 0 : -1}
                    onClick={() => setActiveTab('deputy')}
                    onKeyDown={(event) => handleTabKeyDown(event, 'deputy')}
                >
                    <strong>부방장 황금키워드</strong>
                    <small>매일 검토해 올린 고정 키워드 전체 보기</small>
                </button>
                <button
                    id="home-ops-tab-realtime"
                    type="button"
                    role="tab"
                    data-home-ops-tab="realtime"
                    className={`home-ops-tab${activeTab === 'realtime' ? ' active' : ''}`}
                    aria-selected={activeTab === 'realtime'}
                    aria-controls="home-ops-panel-realtime"
                    tabIndex={activeTab === 'realtime' ? 0 : -1}
                    onClick={() => setActiveTab('realtime')}
                    onKeyDown={(event) => handleTabKeyDown(event, 'realtime')}
                >
                    <strong>실시간 검색어</strong>
                    <small>네이버·뉴스 등 현재 흐름을 참고용으로 확인</small>
                </button>
            </div>

            <div
                id="home-ops-panel-deputy"
                className="home-ops-panel"
                role="tabpanel"
                aria-labelledby="home-ops-tab-deputy"
                hidden={activeTab !== 'deputy'}
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
                hidden={activeTab !== 'realtime'}
            >
                {activeTab === 'realtime' ? realtimePanel : null}
            </div>
        </section>
    );
}

export default HomeOperationsBoard;
