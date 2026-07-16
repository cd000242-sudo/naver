import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    fetchHomeKeywordBriefing,
    fetchHomeNotices,
    type HomeKeywordBriefingResult,
    type HomeNotice,
} from '../lib/siteOps';
import { selectKeywordChartRows, type HomeKeywordRow } from '../lib/homeKeywordBriefing';

const numberFormatter = new Intl.NumberFormat('ko-KR');
const decimalFormatter = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

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

function NoticeCard({ notice }: { notice: HomeNotice }) {
    const badge = noticeBadge(notice.badge);
    return (
        <article className="home-ops-notice">
            <div className="home-ops-notice-meta">
                <span style={{ color: badge.color, borderColor: `${badge.color}55`, background: `${badge.color}16` }}>{badge.label}</span>
                <time>{formatDate(notice.date)}</time>
            </div>
            <strong>{notice.title}</strong>
            {notice.summary && <p>{notice.summary}</p>}
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
                        <div
                            className="home-ops-chart-track"
                            role="img"
                            aria-label={`${row.keyword}, 기회지수 ${decimalFormatter.format(row.opportunity)}`}
                        >
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
        <div className="home-ops-table-shell" tabIndex={0} aria-label={`부방장 키워드 전체 ${rows.length}행`}>
            <table className="home-ops-table">
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

function HomeOperationsBoard() {
    const [notices, setNotices] = useState<HomeNotice[]>([]);
    const [briefingResult, setBriefingResult] = useState<HomeKeywordBriefingResult | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        Promise.all([fetchHomeNotices(3), fetchHomeKeywordBriefing()])
            .then(([latestNotices, latestBriefing]) => {
                if (!active) return;
                setNotices(latestNotices);
                setBriefingResult(latestBriefing);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, []);

    const briefing = briefingResult?.briefing || null;
    const chartRows = useMemo(() => briefing ? selectKeywordChartRows(briefing, 10) : [], [briefing]);
    const uniqueCount = useMemo(() => briefing ? uniqueKeywordCount(briefing.rows) : 0, [briefing]);

    return (
        <section className="home-ops" aria-labelledby="home-ops-title">
            <style>{`
                .home-ops {
                    position: relative;
                    z-index: 1;
                    max-width: 1412px;
                    margin: 18px auto 70px;
                    padding: 0 24px;
                }
                .home-ops-header {
                    display: flex;
                    align-items: flex-end;
                    justify-content: space-between;
                    gap: 24px;
                    margin-bottom: 20px;
                }
                .home-ops-kicker {
                    display: inline-flex;
                    align-items: center;
                    min-height: 28px;
                    padding: 5px 11px;
                    border: 1px solid rgba(68,215,182,0.32);
                    border-radius: 999px;
                    background: rgba(68,215,182,0.10);
                    color: #44d7b6;
                    font-size: 11px;
                    font-weight: 900;
                    letter-spacing: 1.4px;
                }
                .home-ops-header h2 {
                    margin: 10px 0 6px;
                    color: #fff;
                    font-size: clamp(27px, 3.5vw, 42px);
                    line-height: 1.15;
                }
                .home-ops-header p {
                    margin: 0;
                    color: rgba(235,242,250,0.66);
                    font-size: 14px;
                    line-height: 1.65;
                }
                .home-ops-grid {
                    display: grid;
                    grid-template-columns: minmax(280px, .72fr) minmax(0, 1.8fr);
                    gap: 18px;
                    align-items: start;
                }
                .home-ops-panel {
                    min-width: 0;
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 12px;
                    background: linear-gradient(180deg, rgba(14,23,36,0.92), rgba(6,11,19,0.94));
                    box-shadow: 0 26px 70px rgba(0,0,0,0.28);
                    overflow: hidden;
                }
                .home-ops-panel-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    padding: 18px 20px;
                    border-bottom: 1px solid rgba(255,255,255,0.09);
                }
                .home-ops-panel-head strong {
                    color: #fff;
                    font-size: 17px;
                    font-weight: 900;
                }
                .home-ops-panel-head a {
                    color: #f4c95d;
                    font-size: 12px;
                    font-weight: 850;
                    text-decoration: none;
                }
                .home-ops-notices {
                    display: grid;
                    gap: 10px;
                    padding: 14px;
                }
                .home-ops-notice {
                    padding: 15px;
                    border: 1px solid rgba(255,255,255,0.09);
                    border-radius: 9px;
                    background: rgba(255,255,255,0.035);
                }
                .home-ops-notice-meta {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    margin-bottom: 10px;
                }
                .home-ops-notice-meta span {
                    padding: 3px 7px;
                    border: 1px solid;
                    border-radius: 999px;
                    font-size: 10px;
                    font-weight: 900;
                }
                .home-ops-notice-meta time {
                    color: rgba(235,242,250,0.48);
                    font-size: 11px;
                }
                .home-ops-notice > strong {
                    display: block;
                    color: #f7fbff;
                    font-size: 14px;
                    line-height: 1.45;
                }
                .home-ops-notice p {
                    display: -webkit-box;
                    margin: 8px 0 0;
                    overflow: hidden;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 3;
                    color: rgba(235,242,250,0.62);
                    font-size: 12px;
                    line-height: 1.55;
                }
                .home-ops-empty {
                    padding: 30px 20px;
                    color: rgba(235,242,250,0.58);
                    font-size: 13px;
                    line-height: 1.6;
                    text-align: center;
                }
                .home-ops-brief-head {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 18px;
                    padding: 20px;
                    border-bottom: 1px solid rgba(255,255,255,0.09);
                }
                .home-ops-brief-head h3 {
                    margin: 7px 0 6px;
                    color: #fff;
                    font-size: clamp(20px, 2.6vw, 28px);
                }
                .home-ops-brief-head p {
                    margin: 0;
                    color: rgba(235,242,250,0.62);
                    font-size: 12px;
                    line-height: 1.6;
                }
                .home-ops-fixed-badge {
                    flex: 0 0 auto;
                    display: grid;
                    gap: 3px;
                    min-width: 124px;
                    padding: 10px 12px;
                    border: 1px solid rgba(244,201,93,0.32);
                    border-radius: 8px;
                    background: rgba(244,201,93,0.09);
                    text-align: right;
                }
                .home-ops-fixed-badge strong { color: #f4c95d; font-size: 11px; }
                .home-ops-fixed-badge span { color: rgba(235,242,250,0.55); font-size: 10px; }
                .home-ops-metrics {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 8px;
                    padding: 14px 20px 0;
                }
                .home-ops-metric {
                    padding: 11px 12px;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.035);
                }
                .home-ops-metric strong { display: block; color: #fff; font-size: 16px; }
                .home-ops-metric span { display: block; margin-top: 3px; color: rgba(235,242,250,0.50); font-size: 10px; }
                .home-ops-chart-wrap { padding: 18px 20px 20px; }
                .home-ops-subhead {
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    margin-bottom: 12px;
                    color: rgba(235,242,250,0.58);
                    font-size: 11px;
                }
                .home-ops-subhead strong { color: #fff; font-size: 13px; }
                .home-ops-chart { display: grid; gap: 11px; }
                .home-ops-chart-row { display: grid; grid-template-columns: minmax(0, 1fr) 96px; gap: 5px 12px; }
                .home-ops-chart-label { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 7px; align-items: center; }
                .home-ops-chart-label > span { color: #f4c95d; font-size: 10px; font-weight: 900; }
                .home-ops-chart-label strong { overflow: hidden; color: #eef5fb; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
                .home-ops-chart-label small { color: #44d7b6; font-size: 10px; font-weight: 900; }
                .home-ops-chart-track { grid-column: 1; height: 6px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,0.07); }
                .home-ops-chart-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #44d7b6, #f4c95d); }
                .home-ops-chart-row > small { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: rgba(235,242,250,0.50); font-size: 10px; text-align: right; }
                .home-ops-table-title {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 14px;
                    padding: 16px 20px 10px;
                    border-top: 1px solid rgba(255,255,255,0.08);
                }
                .home-ops-table-title strong { color: #fff; font-size: 13px; }
                .home-ops-table-title span { color: rgba(235,242,250,0.48); font-size: 10px; text-align: right; }
                .home-ops-table-shell {
                    max-height: 540px;
                    margin: 0 12px 16px;
                    overflow: auto;
                    border: 1px solid rgba(255,255,255,0.09);
                    border-radius: 8px;
                    outline: none;
                }
                .home-ops-table-shell:focus { border-color: rgba(68,215,182,0.60); box-shadow: 0 0 0 3px rgba(68,215,182,0.10); }
                .home-ops-table { width: 100%; min-width: 650px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
                .home-ops-table th, .home-ops-table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.065); }
                .home-ops-table thead th { position: sticky; top: 0; z-index: 1; background: #111d2c; color: rgba(235,242,250,0.66); font-size: 10px; font-weight: 900; text-align: right; }
                .home-ops-table thead th:nth-child(2) { text-align: left; }
                .home-ops-table tbody td { color: rgba(235,242,250,0.62); font-size: 11px; text-align: right; }
                .home-ops-table tbody th { color: #f3f8fc; font-size: 11px; font-weight: 750; text-align: left; }
                .home-ops-table tbody td:first-child { width: 34px; color: rgba(235,242,250,0.35); }
                .home-ops-table tbody td:last-child { color: #44d7b6; font-weight: 900; }
                .home-ops-table tbody tr:hover { background: rgba(68,215,182,0.045); }
                @media (max-width: 980px) {
                    .home-ops-grid { grid-template-columns: 1fr; }
                    .home-ops-notices { grid-template-columns: repeat(3, minmax(0, 1fr)); }
                }
                @media (max-width: 720px) {
                    .home-ops { padding: 0 12px; margin-top: 8px; }
                    .home-ops-header, .home-ops-brief-head { align-items: flex-start; flex-direction: column; }
                    .home-ops-notices { grid-template-columns: 1fr; }
                    .home-ops-fixed-badge { width: 100%; box-sizing: border-box; text-align: left; }
                    .home-ops-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 12px 12px 0; }
                    .home-ops-chart-wrap { padding: 16px 12px; }
                    .home-ops-chart-row { grid-template-columns: minmax(0, 1fr) 78px; }
                    .home-ops-table-title { align-items: flex-start; flex-direction: column; padding: 14px 12px 9px; }
                    .home-ops-table-title span { text-align: left; }
                    .home-ops-table-shell { margin: 0 8px 12px; }
                }
            `}</style>

            <header className="home-ops-header">
                <div>
                    <span className="home-ops-kicker">HOME OPERATIONS</span>
                    <h2 id="home-ops-title">공지와 키워드 브리핑을 한곳에서</h2>
                    <p>운영 공지는 최신 3건만, 부방장이 공유한 키워드는 저장된 스냅샷 그대로 보여드립니다.</p>
                </div>
            </header>

            <div className="home-ops-grid">
                <aside className="home-ops-panel" aria-label="최신 공지사항">
                    <div className="home-ops-panel-head">
                        <strong>최신 공지사항</strong>
                        <Link to="/community">전체 보기 →</Link>
                    </div>
                    {notices.length > 0 ? (
                        <div className="home-ops-notices">
                            {notices.map((notice, index) => <NoticeCard key={`${notice.id}-${index}`} notice={notice} />)}
                        </div>
                    ) : (
                        <div className="home-ops-empty">{loading ? '최신 공지를 불러오는 중입니다.' : '등록된 공지는 커뮤니티에서 확인할 수 있습니다.'}</div>
                    )}
                </aside>

                <div className="home-ops-panel" aria-label="부방장 키워드 브리핑">
                    {briefing ? (
                        <>
                            <div className="home-ops-brief-head">
                                <div>
                                    <span className="home-ops-kicker">DEPUTY BRIEFING</span>
                                    <h3>{briefing.title}</h3>
                                    <p>{briefing.author} 제공 · {formatDate(briefing.publishedAt)} · 원본 이미지 {briefing.sourceImages.length}장 추적 정보 기록</p>
                                </div>
                                <div className="home-ops-fixed-badge">
                                    <strong>{briefingResult?.source === 'saved' ? '관리자 저장본' : '초기 고정본'}</strong>
                                    <span>다시 수정하기 전까지 고정</span>
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
                                <span>중복 행도 원문 그대로 보존 · 기회지수 = 검색량 ÷ (문서수 + 1) · 실시간 값이 아닌 고정 스냅샷</span>
                            </div>
                            <KeywordTable rows={briefing.rows} />
                        </>
                    ) : (
                        <div className="home-ops-empty">{loading ? '저장된 키워드 브리핑을 불러오는 중입니다.' : '표시할 키워드 브리핑이 없습니다.'}</div>
                    )}
                </div>
            </div>
        </section>
    );
}

export default HomeOperationsBoard;
