import { useState } from 'react';
import type { BenchmarkTrends } from '../../../lib/homefeedBenchmarkModel.mjs';

/** 접기 상태는 이 브라우저에만 기억한다(사장님 2026-10-06 "오늘 홈판 흐름 접었다 폈다 가능하게"). 못 읽으면 펼친다. */
const OPEN_KEY = 'leword.homefeedTrends.open';
function readOpen(): boolean {
    try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; }
}

/*
 * 오늘의 홈판 흐름(2026-10-06) — 사장님 "홈판에 뜬 것들과 고수 블로거들을 어떻게 썼고 우리는 어떻게 써야 하는지
 * 정리해서 보여주자나? 오늘의 자주 뜨는 홈판 주제는 없네?".
 * 숫자는 전부 수집기가 센 값이다(trends). "우리는 이렇게"도 센 비율을 옮긴 문장 — 추정치(노출 가능성 · 효과)는 말하지 않는다.
 */
const STATS: Array<[keyof Omit<BenchmarkTrends['writing']['stats'], 'count' | 'length'>, string]> = [
    ['quoteStart', '따옴표로 시작'],
    ['ellipsis', '말줄임(… · ..)'],
    ['question', '물음표'],
    ['number', '숫자 포함'],
    ['colloquial', '말하듯 끝냄(~요)'],
];

export default function HomefeedTrendsPanel({ trends, realTitles, onPickCategory }: {
    trends: BenchmarkTrends;
    realTitles: { title: string; url?: string }[];
    onPickCategory: (category: string) => void;
}) {
    const cats = trends.categories.slice(0, 8);
    const max = Math.max(1, ...cats.map((c) => c.channels));
    const stats = trends.writing.stats;
    const [open, setOpen] = useState(readOpen);
    const toggle = () => setOpen((prev) => {
        const next = !prev;
        try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* 저장 못 해도 이번 화면에선 접힌다 */ }
        return next;
    });
    return (
        <section className={`hft${open ? '' : ' closed'}`} aria-label="오늘의 홈판 흐름">
            <style>{CSS}</style>
            <div className="hft-head">
                <div className="hft-head-text">
                    <span className="hft-eyebrow">TODAY · 최근 {trends.windowHours}시간</span>
                    <h3>오늘의 홈판 흐름</h3>
                    <p>벤치마크 채널 {trends.channels.toLocaleString('ko-KR')}곳이 올린 글 {trends.posts.toLocaleString('ko-KR')}개를 분야별로 셌습니다. 분야를 누르면 아래 소재가 그 분야로 걸러집니다.</p>
                </div>
                <button type="button" className="hft-toggle" onClick={toggle} aria-expanded={open} aria-controls="hft-body">{open ? '접기 ▲' : '펼치기 ▼'}</button>
            </div>
            {open && <div id="hft-body">
            <div className="hft-grid">
                <div className="hft-card">
                    <h4>오늘 자주 뜨는 홈판 주제</h4>
                    <ol className="hft-cats">
                        {cats.map((c, i) => (
                            <li key={c.category}>
                                <button type="button" onClick={() => onPickCategory(c.category)} aria-label={`${c.category} 소재만 보기`}>
                                    <span className="hft-rank">{i + 1}</span>
                                    <span className="hft-name">{c.category}</span>
                                    <span className="hft-bar" aria-hidden="true"><i style={{ width: `${Math.max(6, Math.round((c.channels / max) * 100))}%` }} /></span>
                                    <span className="hft-num">채널 {c.channels} · 글 {c.posts}</span>
                                </button>
                                {c.stories.length > 0 && (
                                    <div className="hft-stories">{c.stories.map((s) => <span key={s.keyword} title={s.title}>{s.keyword}<b>{s.channels}곳</b></span>)}</div>
                                )}
                            </li>
                        ))}
                    </ol>
                    <p className="hft-note">'채널'은 그 분야 글을 올린 서로 다른 벤치마크 블로그 · 계정 수입니다. 소재 옆 숫자는 같은 소재를 다룬 채널 수입니다.</p>
                </div>
                <div className="hft-card">
                    <h4>고수 블로거는 이렇게 썼다</h4>
                    {stats.count > 0 ? (
                        <>
                            <div className="hft-tiles">
                                <div className="hft-tile wide"><strong>{stats.length.median}<small>자</small></strong><span>제목 길이 중앙값 · 가운데 절반 {stats.length.p25}~{stats.length.p75}자</span></div>
                                {STATS.map(([key, label]) => <div key={key} className="hft-tile"><strong>{stats[key]}<small>%</small></strong><span>{label}</span></div>)}
                            </div>
                            <p className="hft-note">네이버 블로그 고수 제목 {stats.count.toLocaleString('ko-KR')}개 기준.</p>
                            <h5>우리는 이렇게 쓰자</h5>
                            <ul className="hft-guide">{trends.writing.guide.map((line) => <li key={line}>{line}</li>)}</ul>
                        </>
                    ) : <p className="hft-note">이번 회차엔 셀 제목이 모이지 않았습니다.</p>}
                </div>
            </div>
            {cats.some((c) => c.examples.length) && (
                <details className="hft-examples">
                    <summary>분야별 고수 제목 본보기 보기</summary>
                    <div className="hft-ex-grid">
                        {cats.filter((c) => c.examples.length).slice(0, 6).map((c) => (
                            <div key={c.category}>
                                <b>{c.category}</b>
                                <ul>{c.examples.map((e) => <li key={e.title}>{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a> : e.title}<small> · {e.name}</small></li>)}</ul>
                            </div>
                        ))}
                    </div>
                </details>
            )}
            {realTitles.length > 0 && (
                <details className="hft-examples" open>
                    <summary>어제 실제 홈판에 오른 글 (앱 어드바이저 실측 · 상위 {realTitles.length}개)</summary>
                    <ol className="hft-real">{realTitles.slice(0, 20).map((t) => <li key={t.title}>{t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer">{t.title}</a> : t.title}</li>)}</ol>
                </details>
            )}
            </div>}
        </section>
    );
}

const CSS = `
.hft{border:1px solid rgba(250,204,21,.28);border-radius:16px;background:linear-gradient(180deg,rgba(250,204,21,.06),rgba(20,30,48,.6) 40%);padding:18px 20px;margin:14px 0}
.hft-head{display:flex;align-items:flex-start;gap:14px}
.hft-head-text{flex:1;min-width:0}
.hft-toggle{flex:none;margin-top:2px;font:inherit;font-size:12px;font-weight:700;color:#fde68a;border:1px solid rgba(250,204,21,.4);border-radius:8px;padding:5px 11px;background:rgba(250,204,21,.08);cursor:pointer}
.hft-toggle:hover{background:rgba(250,204,21,.16)}
.hft-toggle:focus-visible{outline:3px solid #67e8f9;outline-offset:3px}
.hft.closed .hft-head p{display:none}
.hft-head h3{margin:2px 0 4px;font-size:19px;color:#fff;text-wrap:balance}
.hft-head p{margin:0;color:#a8b6cb;font-size:12.5px}
.hft-eyebrow{font-size:10px;letter-spacing:1.6px;font-weight:800;color:#fcd34d}
.hft-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:14px;margin-top:14px}
.hft-card{border:1px solid var(--hfb-line,rgba(148,163,184,.22));border-radius:12px;background:#121b2b;padding:14px 15px;min-width:0}
.hft-card h4{margin:0 0 10px;font-size:14.5px;color:#fde68a}
.hft-card h5{margin:12px 0 6px;font-size:13.5px;color:#a5f3fc}
.hft-cats{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.hft-cats button{width:100%;display:grid;grid-template-columns:20px 92px minmax(40px,1fr) auto;align-items:center;gap:8px;background:none;border:0;color:inherit;padding:3px 2px;border-radius:7px;text-align:left}
.hft-cats button:hover{background:rgba(250,204,21,.07)}
.hft-rank{font-size:11px;color:#94a3b8;font-variant-numeric:tabular-nums}
.hft-name{font-weight:700;font-size:13px;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hft-bar{height:8px;border-radius:99px;background:rgba(148,163,184,.15);overflow:hidden}
.hft-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#f59e0b,#fde68a)}
.hft-num{font-size:11.5px;color:#cbd5e1;font-variant-numeric:tabular-nums;white-space:nowrap}
.hft-stories{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0 2px 28px}
.hft-stories span{font-size:11.5px;color:#e2e8f0;background:#1c2740;border:1px solid rgba(148,163,184,.2);border-radius:99px;padding:2px 9px}
.hft-stories b{margin-left:5px;color:#fcd34d;font-weight:700}
.hft-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.hft-tile{border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0f1726;padding:9px 10px;display:grid;gap:2px}
.hft-tile.wide{grid-column:1/-1}
.hft-tile strong{font-size:22px;color:#fff;font-variant-numeric:tabular-nums;line-height:1.1}
.hft-tile strong small{font-size:12px;color:#94a3b8;margin-left:2px}
.hft-tile span{font-size:11.5px;color:#a8b6cb}
.hft-guide{margin:0;padding-left:18px;display:grid;gap:4px;font-size:12.8px;color:#e2e8f0}
.hft-note{margin:8px 0 0;font-size:11.5px;color:#8d9db4}
.hft-examples{margin-top:12px;border:1px solid var(--hfb-line,rgba(148,163,184,.22));border-radius:11px;background:#121b2b;padding:10px 14px}
.hft-examples summary{cursor:pointer;font-size:13px;color:#e2e8f0;font-weight:700}
.hft-ex-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:10px}
.hft-ex-grid b{font-size:12.5px;color:#fde68a}
.hft-ex-grid ul,.hft-real{margin:4px 0 0;padding-left:18px;display:grid;gap:4px;font-size:12.5px}
.hft-ex-grid small{color:#8d9db4}
@media(max-width:860px){.hft-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-width:520px){.hft{padding:14px}.hft-cats button{grid-template-columns:18px 78px minmax(30px,1fr)}.hft-num{grid-column:2/-1}.hft-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
