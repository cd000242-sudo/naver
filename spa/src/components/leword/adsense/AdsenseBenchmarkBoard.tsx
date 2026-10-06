/**
 * 애드센스 고수 벤치마크(2026-10-07 사장님 "에드센스 벤치마킹은 홈판 아래에 넣어주세요 · 홈판처럼 똑같이").
 * 앱 레포 scripts/adsense-benchmarks.cjs 가 사장님 엑셀에서 고른 고수 블로그 786곳의 RSS 를 3시간마다 읽어
 * 최근 7일 소재 판을 싣는다. 화면은 홈판 추천 판과 같은 틀 · 같은 스타일(hfb-*)이다. 수치는 판에 실린 실측만 그린다.
 */
import { useEffect, useMemo, useState } from 'react';
import HomefeedBenchmarkStyles from '../homefeed/HomefeedBenchmarkStyles';
import { bridgeBenchmarkTitles } from '../../../lib/bridge';
import { adsenseCategories, adsenseWritingAdvice, blogCount, filterAdsenseCards, type AdsenseBoard, type AdsenseCard } from '../../../lib/adsenseBenchmarkModel.mjs';

const kst = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
};
const day = (iso: string | null | undefined) => (iso ? kst(iso).replace(/\s*\d{1,2}:\d{2}.*$/, '').replace(/\s*(오전|오후).*$/, '') : '');

/** 앱이 즉석으로 지은 검색용 제목은 이 브라우저에 기억(다음 회차 제목이 붙으면 그쪽이 우선). */
const MADE_KEY = (id: string) => `leword.ads.madeTitles.${id}`;
function readMade(id: string): string[] { try { const v = JSON.parse(localStorage.getItem(MADE_KEY(id)) || 'null'); return Array.isArray(v) ? v.filter((t) => typeof t === 'string') : []; } catch { return []; } }

function SearchTitles({ c }: { c: AdsenseCard }) {
    const [made, setMade] = useState<string[]>(() => (c.titles?.length ? [] : readMade(c.id)));
    const titles = c.titles?.length ? c.titles : made;
    const [open, setOpen] = useState(false);
    const [state, setState] = useState<'idle' | 'loading'>('idle');
    const [note, setNote] = useState('');
    const [copied, setCopied] = useState('');
    const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); setCopied(t); window.setTimeout(() => setCopied(''), 1200); } catch { setNote('제목을 선택해 복사해 주세요'); } };
    const make = async () => {
        if (!c.metrics?.query) return;
        setState('loading'); setNote('');
        const r = await bridgeBenchmarkTitles({ kind: 'adsense', query: c.metrics.query, id: c.id, keyword: c.keyword, category: c.category, title: c.title, summary: '', sourceTitles: c.sources.map((s) => s.title).slice(0, 6), relatedKeywords: [] });
        setState('idle');
        if (r.status === 'ok' && r.result.titles.length) { try { localStorage.setItem(MADE_KEY(c.id), JSON.stringify(r.result.titles)); } catch { /* 기억 못 해도 화면엔 보인다 */ } setMade(r.result.titles); return; }
        if (r.status === 'ok') { setNote('검사를 통과한 제목이 없었습니다 — 한 번 더 눌러 주세요.'); return; }
        if (r.status === 'offline') { setNote('PC 에서 LEWORD 앱을 켜 두면 내 구독 AI 로 바로 만듭니다 — 앱을 켠 뒤 다시 눌러 주세요.'); return; }
        if (r.status === 'outdated') { setNote('LEWORD 앱이 구버전이라 이 기능이 없습니다 — 앱을 최신 버전으로 업데이트해 주세요.'); return; }
        setNote(r.message || '만들지 못했습니다 — 잠시 뒤 다시 눌러 주세요.');
    };
    const shown = open ? titles : titles.slice(0, 5);
    return (
        <div className="hfb-title-box">
            <div className="hfb-title-head"><h4>검색용 제목 {titles.length > 0 ? <span>{titles.length}개</span> : null}</h4>{titles.length > 0 && <button type="button" onClick={() => void copy(titles.join(String.fromCharCode(10)))}>전체 복사</button>}</div>
            {titles.length === 0 && (
                <div className="hfb-title-empty">
                    {c.metrics?.query
                        ? <><p>이 소재는 아직 회차가 검색용 제목을 짓지 못했습니다.</p><button type="button" className="hfb-title-make" disabled={state === 'loading'} onClick={() => void make()}>{state === 'loading' ? '제목 만드는 중… (약 1~2분)' : '지금 제목 만들기 · 내 구독 AI'}</button></>
                        : <p>대표 검색어가 아직 실측되지 않아 검색용 제목을 짓지 않았습니다.</p>}
                    {note && <small role="status">{note}</small>}
                </div>
            )}
            {shown.map((t, i) => (
                <div key={t} className="hfb-title-row"><span>{i + 1}</span><p>{t}</p><button type="button" onClick={() => void copy(t)}>{copied === t ? '복사됨' : '복사'}</button></div>
            ))}
            {titles.length > 5 && <button type="button" className="hfb-title-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? '접기' : `나머지 ${titles.length - 5}개 더 보기`}</button>}
        </div>
    );
}

function AdsenseCardView({ c }: { c: AdsenseCard }) {
    const blogs = blogCount(c);
    return (
        <article className={`hfb-card${c.recommended ? ' recommended' : ''}`}>
            <div className="hfb-card-top">
                <span className="hfb-status review-now">{c.grade}등급 블로그</span>
                {c.recommended && <span className="hfb-star">★ 고수 {blogs}곳</span>}
                {!c.recommended && blogs > 1 && <span className="hfb-category">고수 {blogs}곳</span>}
                <span className="hfb-category">{c.category}</span>
                <span className="hfb-timing">발행 {day(c.publishedAt)}</span>
            </div>
            <h3>{c.title}</h3>
            {/* 실측(2단계) — 대표 검색어(소재 낱말 후보의 정확 검색량 최대) · 블로그 문서수 · 파워링크 3위 입찰가. 없으면 '미측정'만. */}
            <div className="hfb-keyword">
                <strong>{c.metrics?.query || c.keyword}</strong>
                <span>월 검색량<b>{typeof c.metrics?.searchVolume === 'number' ? c.metrics.searchVolume.toLocaleString('ko-KR') : '미측정'}</b></span>
                <span>블로그 문서수<b>{typeof c.metrics?.documentCount === 'number' ? c.metrics.documentCount.toLocaleString('ko-KR') : '미측정'}</b></span>
                <span>파워링크 3위 입찰가<b>{typeof c.metrics?.bid === 'number' ? `${c.metrics.bid.toLocaleString('ko-KR')}원` : '미측정'}</b></span>
            </div>
            {c.why?.length > 0 && <div className="hfb-why"><span>검토 이유</span><ul>{c.why.map((w) => <li key={w}>{w}</li>)}</ul></div>}
            <SearchTitles c={c} />
            <div className="hfb-title-box">
                <div className="hfb-title-head"><h4>고수들이 쓴 제목 <span>{c.sources.length}개</span></h4></div>
                {c.sources.map((s) => (
                    <div key={s.url} className="hfb-title-row">
                        <span>{s.grade || '—'}</span>
                        <p><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></p>
                        <small style={{ color: '#8d9db4' }}>{s.name} · {day(s.publishedAt)}</small>
                    </div>
                ))}
            </div>
        </article>
    );
}

export default function AdsenseBenchmarkBoard() {
    const [board, setBoard] = useState<AdsenseBoard | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<'all' | 'star'>('all');
    const [category, setCategory] = useState('');
    const [query, setQuery] = useState('');
    const [limit, setLimit] = useState(24);

    useEffect(() => {
        const controller = new AbortController();
        fetch('/data/adsense-benchmarks.json', { cache: 'no-store', signal: controller.signal })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((data: AdsenseBoard) => { if (data && Array.isArray(data.candidates)) setBoard(data); else setError('판 형식이 올바르지 않습니다.'); })
            .catch((e) => { if ((e as Error)?.name !== 'AbortError') setError('애드센스 벤치마크 판을 불러오지 못했습니다 — 잠시 뒤 다시 열어 주세요.'); })
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, []);

    const cards = board?.candidates ?? [];
    const items = useMemo(() => filterAdsenseCards(cards, { mode, category, query }), [cards, mode, category, query]);
    const cats = useMemo(() => adsenseCategories(cards), [cards]);
    const advice = adsenseWritingAdvice(board?.trends?.titleShape);
    const shape = board?.trends?.titleShape;
    const failed = board ? board.sourceCount - board.okCount : 0;

    return (
        <section className="hf-benchmark" aria-label="애드센스 고수 벤치마크">
            <HomefeedBenchmarkStyles />
            <header className="hfb-header">
                <div>
                    <span className="hfb-eyebrow">ADSENSE BENCHMARK · 애드센스 고수 블로그 {board?.sourceCount ?? '—'}곳</span>
                    <h2>애드센스 고수 <span>벤치마크</span></h2>
                    <p>애드센스로 수익을 내는 고수 블로그(티스토리 · 워드프레스)가 최근 {board?.windowDays ?? 7}일 안에 쓴 글을 소재별로 모았습니다. 여러 고수가 함께 다룬 소재가 먼저 나옵니다.</p>
                </div>
                <div className="hfb-count"><strong>{board ? cards.length : '—'}</strong><span>검토할 소재</span></div>
            </header>
            <div className="hfb-meta"><span>{board ? `정기 수집 ${kst(board.generatedAt || board.attemptedAt)} KST · 3시간마다 다시 읽습니다` : loading ? '벤치마크 자료 연결 중' : ''}</span></div>
            {error && <div className="hfb-alert" role="alert">{error}</div>}
            {board?.status === 'stale' && <div className="hfb-alert" role="status">이번 수집에서 새 글을 받지 못해 마지막 판을 보여 드립니다.</div>}
            {!board && !loading && !error && <p className="hfb-empty">아직 공개된 애드센스 벤치마크 자료가 없습니다.</p>}
            {board && <>
                <details className="hfb-coverage">
                    <summary>출처 {board.okCount}/{board.sourceCount}곳 확인 · 최근 {board.windowDays}일 글 {board.collectedPostCount.toLocaleString('ko-KR')}개 <span>{failed > 0 ? `· ${failed}곳 확인 필요` : ''}</span><small>수집 상태 보기</small></summary>
                    <p>글 수는 수집 범위입니다. 수익 · 노출 성과를 잰 값이 아닙니다.</p>
                    <div className="hfb-source-grid">{board.sources.slice(0, 800).map((s) => (
                        <div key={s.id} className="hfb-channel"><b>{s.name}</b><span data-state={s.status}>{s.status === 'ok' ? `확인 · ${s.postCount}개` : '확인 필요'}</span><small>{s.category} · {s.grade}등급</small></div>
                    ))}</div>
                </details>
                {shape && shape.count > 0 && (
                    <div className="hfb-direction" style={{ marginBottom: 12 }}>
                        <h4>애드센스 고수는 이렇게 썼다 · 최근 {board.windowDays}일 제목 {shape.count.toLocaleString('ko-KR')}개</h4>
                        <p style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
                            <span>제목 길이 중앙값 <b>{shape.lengthMedian}자</b></span>
                            <span>숫자 포함 <b>{shape.numberPct}%</b></span>
                            <span>연도 포함 <b>{shape.yearPct}%</b></span>
                            <span>질문형 <b>{shape.questionPct}%</b></span>
                            <span>괄호 <b>{shape.bracketPct}%</b></span>
                        </p>
                        {advice.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, color: '#c4d5e5' }}>{advice.map((a) => <li key={a}>{a}</li>)}</ul>}
                        {board.trends.categories.length > 0 && <p style={{ marginTop: 8, fontSize: 12, color: '#a8b6cb' }}>많이 쓴 분야: {board.trends.categories.slice(0, 6).map((c) => `${c.category} ${c.posts.toLocaleString('ko-KR')}글`).join(' · ')}</p>}
                    </div>
                )}
                <div className="hfb-filters">
                    <div className="hfb-filter-row" role="group" aria-label="보기">
                        <button type="button" aria-pressed={mode === 'all'} onClick={() => setMode('all')}>전체 <span>{cards.length}</span></button>
                        <button type="button" aria-pressed={mode === 'star'} onClick={() => setMode('star')}>★ 고수 3곳 이상 <span>{cards.filter((c) => c.recommended).length}</span></button>
                    </div>
                    <div className="hfb-filter-bottom">
                        <div className="hfb-categories" role="group" aria-label="분야">
                            <button type="button" aria-pressed={category === ''} onClick={() => setCategory('')}>전체</button>
                            {cats.map((c) => <button type="button" key={c.category} aria-pressed={category === c.category} onClick={() => setCategory(c.category)}>{c.category} {c.count}</button>)}
                        </div>
                        <input type="search" aria-label="애드센스 벤치마크 소재 검색" placeholder="키워드·제목 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </div>
                </div>
                <p className="hfb-legend">★는 최근 {board.windowDays}일 안에 애드센스 고수 블로그 세 곳 이상이 함께 다룬 소재입니다. 제목을 누르면 고수의 원문이 열립니다.</p>
                <div className="hfb-list">{items.slice(0, limit).map((c) => <AdsenseCardView key={c.id} c={c} />)}</div>
                {items.length === 0 && <p className="hfb-empty">조건에 맞는 소재가 없습니다.</p>}
                {items.length > limit && <button type="button" className="hfb-more" onClick={() => setLimit((n) => n + 24)}>소재 더 보기 · {Math.min(limit, items.length)}/{items.length}</button>}
            </>}
        </section>
    );
}
