import { useEffect, useState } from 'react';
import { callWorkerRaw, fetchKeywordBid, fetchKeywordDocs, fetchKeywordExpansions, fetchKeywordFrontal, fetchKeywordVolumes } from '../../lib/keywordApi';
import { frontalCount, FRONTAL_SATURATION } from '../../lib/expansionTier';
import { forgeVariedTitles } from '../../lib/titleForge.generated.mjs';
import { affiliateCandidates, expansionRetryQueries, matchAppPlan, questionChecklist, searchCuriosities, spaceOutKeyword, volumeOf, type AffiliateCandidate, type PlanQuestion } from '../../lib/postPlanSiteModel.mjs';
import { loadAppPlans, type AppPlan, type AppPlansLoad } from '../../lib/postPlanSync';
import CountUp from '../motion/CountUp';
import Reveal from '../motion/Reveal';

/*
 * 글 한 편 유입 설계실 — 사이트판(2026-10-06 4차, 사장님 "사이트판 설계실 + 앱 결과 동기화").
 * 사이트만으로 ① 검색량 · 문서수 · 1페이지 정면 글 ② 검색용 제목(앱과 같은 빈 틀 엔진, AI 없음) ③ 최근 14일 질문 ④ 제휴 · 입찰가 를 잰다.
 * 앱으로 만든 설계(1페이지 자리 판정 · 내 크기 · 홈판 제목 · 링크 자리 · 3/7일 결과)가 있으면 아래에 덧붙인다.
 * 값은 전부 실측이고 확률 · 예상 유입은 쓰지 않는다. 글 본문은 쓰지 않는다.
 */
interface SiteResult {
    keyword: string;
    volume: number | null;
    docs: number | null;
    frontal: number | null;
    sampled: number;
    board: { openSlot: number | null; tierLabel: string } | null;
    titles: Array<{ text: string; kind: string; frameLabel: string; basis: string }>;
    searches: Array<{ keyword: string; searchVolume: number | null }>;
    searchesNote: string;
    questions: PlanQuestion[];
    questionsNote: string;
    bid: number | null;
    bidNote: string;
    affiliate: AffiliateCandidate[];
}

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('ko-KR') : '—');
const day = (ymd: string) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(ymd || ''); return m ? `${Number(m[1])}월 ${Number(m[2])}일` : ''; };
const compact = (s: string) => String(s || '').replace(/\s+/g, '');

async function json(url: string): Promise<any> {
    try { const res = await fetch(url, { cache: 'no-store' }); return res.ok ? await res.json() : null; } catch { return null; }
}

async function measureOnSite(keyword: string): Promise<SiteResult> {
    // ③ 검색에서 궁금해하는 것(2026-10-07) — 확장을 먼저 받고(띄어쓰기 없는 긴 키워드는 0개라 띄운 말로 다시),
    // 지식인 · 카페는 띄운 말 · 검색 궁금증 맨 위 말로도 함께 찾는다. 앱 설계실과 같은 규칙(postPlanSiteModel).
    const searchesRun = (async () => {
        let res = await fetchKeywordExpansions(keyword);
        for (const retry of expansionRetryQueries(keyword)) {
            if (res.ok && (res.data?.items || []).length) break;
            res = await fetchKeywordExpansions(retry);
        }
        return { ok: res.ok, items: res.ok ? res.data?.items || [] : [] };
    })();
    const radarRun = searchesRun.then((s) => {
        const top = searchCuriosities(keyword, s.items, 1)[0]?.keyword;
        const extra = [...new Set([spaceOutKeyword(keyword), top].filter((x): x is string => Boolean(x) && compact(String(x)) !== compact(keyword)))].slice(0, 2);
        // 키를 싣지 않는 호출 — 사용자 Bright Data 토큰이 실리면 유료 커뮤니티 검색이 돈다. 지식인 · 카페만(무료).
        return callWorkerRaw('radar-search', {
            queries: JSON.stringify([keyword, `${keyword} 질문`, ...extra]),
            coreKeywords: JSON.stringify([{ keyword }, ...extra.map((q) => ({ keyword: q }))]),
            shortQueries: JSON.stringify([keyword, ...extra]),
        }).then((radar) => ({ radar, extra }));
    });
    const [vol, docs, frontal, searched, radarOut, bid, affiliate, board] = await Promise.all([
        fetchKeywordVolumes([keyword]),
        fetchKeywordDocs([keyword]),
        fetchKeywordFrontal([keyword]),
        searchesRun,
        radarRun,
        fetchKeywordBid(keyword),
        json('/data/affiliate-campaigns.json'),
        json('/data/preemption-board.json'),
    ]);
    const { radar, extra } = radarOut;
    const topTitles = (frontal.ok && frontal.data?.titles?.[keyword]) || [];
    // 제목 재료 = ③ 검색 궁금증 중 검색량을 잰 말(2026-10-07) — 붙여 쓴 키워드는 연관어 필터를 못 넘어 일반형 제목만 나왔다(앱과 같은 재료)
    const derived = searchCuriosities(keyword, searched.items, 20)
        .filter((v) => typeof v.searchVolume === 'number' && v.searchVolume > 0)
        .map((v) => ({ keyword: v.keyword, searchVolume: v.searchVolume as number }));
    const row = (Array.isArray(board?.rows) ? board.rows : []).find((r: any) => compact(r.keyword) === compact(keyword));
    return {
        keyword,
        volume: vol.ok ? volumeOf(vol.data?.volumes, keyword) : null,
        docs: docs.ok ? (docs.data?.docs?.[keyword] ?? null) : null,
        frontal: frontalCount(topTitles, keyword),
        sampled: topTitles.length,
        board: row ? { openSlot: row.openSlot ?? null, tierLabel: String(row.tierLabel || '') } : null,
        titles: forgeVariedTitles(keyword, derived, topTitles).filter((t) => t.text).slice(0, 4),
        searches: searchCuriosities(keyword, searched.items, 10),
        searchesNote: searched.ok ? '' : '검색 자동완성 · 연관 키워드를 받지 못했습니다 — 잠시 뒤 다시 눌러 주세요.',
        questions: radar && radar.ok ? questionChecklist((radar.items as unknown[]) || [], 10, keyword, extra) : [],
        questionsNote: radar && radar.ok ? '' : '질문을 찾지 못했습니다 — 잠시 뒤 다시 눌러 주세요.',
        bid: bid.ok ? (bid.data?.bid ?? null) : null,
        bidNote: bid.ok ? '' : (bid.message || '내 API 키 탭에 검색광고 키를 넣으면 입찰가를 잽니다.'),
        affiliate: affiliateCandidates(keyword, affiliate, 3),
    };
}

/** `count` (a measured number) counts up to itself; `value` stays the text shown and read. */
function Stat({ label, value, note, count, unit = '' }: { label: string; value: string; note?: string; count?: number | null; unit?: string }) {
    const counted = typeof count === 'number' && Number.isFinite(count);
    return (
        <div style={{ flex: '1 1 150px', padding: '12px 16px', borderRadius: 14, background: 'var(--lw-surface)', border: '1px solid var(--lw-line)' }}>
            <div style={{ fontSize: 13, color: 'var(--lw-text-muted)' }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--lw-text)', fontVariantNumeric: 'tabular-nums' }}>
                {counted ? <CountUp value={count} format={(n) => `${n.toLocaleString('ko-KR')}${unit}`} reserve /> : value}
            </div>
            {note && <div style={{ fontSize: 13, color: 'var(--lw-text-secondary)', marginTop: 4 }}>{note}</div>}
        </div>
    );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="lw-panel" style={{ marginBottom: 12 }}>
            <div className="lw-panel-head"><h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--lw-text)' }}>{title}</h2></div>
            <div style={{ padding: '4px 0' }}>{children}</div>
        </section>
    );
}

function TitleRow({ tag, text, sub }: { tag: string; text: string; sub?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 4px 4px 12px', borderRadius: 10, background: 'var(--lw-surface)', border: '1px solid var(--lw-line)', marginBottom: 8 }}>
            <span style={{ flex: 'none', fontSize: 13, color: 'var(--lw-text-secondary)', background: 'var(--lw-raised)', borderRadius: 999, padding: '2px 8px' }}>{tag}</span>
            <span style={{ flex: 1, fontSize: 15, color: 'var(--lw-text)' }}>{text}{sub && <span style={{ display: 'block', fontSize: 13, color: 'var(--lw-text-muted)', marginTop: 4 }}>{sub}</span>}</span>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
                style={{ flex: 'none', minWidth: 44, minHeight: 44, border: 0, borderRadius: 10, background: 'none', color: 'var(--lw-text-secondary)', fontSize: 13, cursor: 'pointer' }}>{copied ? '복사됨' : '복사'}</button>
        </div>
    );
}

function AppPlanBlock({ plan, from }: { plan: AppPlan; from: 'app' | 'sync' }) {
    const r = plan.result;
    const rank = (c: { status: string; rank: number | null; sampled: number } | null | undefined) =>
        !c ? '—' : c.status !== 'ok' ? '못 잼' : c.rank ? `${c.rank}위` : c.sampled ? `${c.sampled}위 밖` : '못 읽음';
    const byDay = (d: number) => r?.checks.find((c) => c.day === d);
    return (
        <Box title={`앱 설계 덧붙임 · ${from === 'app' ? '이 PC 앱에서' : '계정 동기화본에서'} 받음`}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {plan.judge && <Stat label="1페이지 자리(앱 판정)" value={plan.judge.seat || '—'} note={plan.judge.facing != null ? `정면 글 ${plan.judge.facing}개${plan.judge.vacancy ? ` · 빈자리 ${plan.judge.vacancy}위` : ''}` : ''} />}
                {plan.judge && <Stat label="내 블로그 크기" value={plan.judge.range === 'in' ? '붙어 본 크기 안' : plan.judge.range === 'out' ? '붙어 본 적 없는 크기' : '견줄 기록 없음'} note={plan.judge.rangeReason} />}
                {r && <Stat label="3일 뒤 순위" value={rank(byDay(3))} />}
                {r && <Stat label="7일 뒤 순위" value={rank(byDay(7))} />}
                {r && <Stat label="홈판 유입(어드바이저)" value={r.homefeed ? `${num(r.homefeed.count)}명` : '—'} note={r.homefeed ? `${r.homefeed.day} 기준` : ''} />}
            </div>
            {(plan.titles?.homefeed || []).length > 0 && <div style={{ marginTop: 12 }}>{plan.titles!.homefeed.map((t) => <TitleRow key={t} tag="홈판용" text={t} />)}</div>}
            {plan.inflow && (
                <div style={{ marginTop: 12, fontSize: 13, color: 'var(--lw-text-secondary)' }}>
                    <div style={{ color: 'var(--lw-text-muted)', marginBottom: 4 }}>발행 글 {plan.inflow.postTitle || plan.inflow.postUrl} · 찾음 {num(plan.inflow.found)}곳 · 관련 {num(plan.inflow.relevant)}곳 · 초안 {plan.inflow.answered}개</div>
                    {plan.inflow.spots.map((s) => (
                        <div key={s.link} style={{ padding: '8px 0', borderTop: '1px solid var(--lw-line)' }}>
                            <span style={{ fontSize: 13, color: s.action === 'NOW' ? 'var(--lw-positive)' : 'var(--lw-accent-ink)', marginRight: 8 }}>{s.action === 'NOW' ? '지금 답하면 유입' : '지켜볼 자리'}</span>
                            <a href={s.link} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--lw-text)' }}>{s.title}</a>
                            <span style={{ fontSize: 13, color: 'var(--lw-text-muted)', marginLeft: 8 }}>{day(s.postdate)} · {s.where}</span>
                        </div>
                    ))}
                </div>
            )}
        </Box>
    );
}

export default function PostPlanTab({ initialKeyword = '' }: { initialKeyword?: string } = {}) {
    const [keyword, setKeyword] = useState('');
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<SiteResult | null>(null);
    const [app, setApp] = useState<AppPlansLoad>({ status: 'none' });

    useEffect(() => { void loadAppPlans().then(setApp).catch(() => setApp({ status: 'none' })); }, []);

    const run = async (target: string) => {
        const kw = target.trim().slice(0, 60);
        if (!kw || running) return;
        setKeyword(kw); setRunning(true); setError(''); setResult(null);
        try { setResult(await measureOnSite(kw)); } catch (e) { setError(e instanceof Error ? e.message : '설계하지 못했습니다.'); } finally { setRunning(false); }
    };

    // 다른 탭(제목이 없는 카드)에서 키워드를 넘겨받으면 바로 설계한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (initialKeyword.trim()) void run(initialKeyword); }, [initialKeyword]);

    const appPlans = app.status === 'ok' ? app.plans : [];
    const matched = result ? matchAppPlan(appPlans, result.keyword) : null;

    return (
        <div>
            <section className="lw-panel" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--lw-text-muted)' }}>POST PLAN</div>
                <h2 style={{ margin: '4px 0 8px', fontSize: 22, fontWeight: 600, color: 'var(--lw-text)' }}>글 한 편 유입 설계실</h2>
                <p style={{ margin: 0, fontSize: 15, color: 'var(--lw-text-secondary)' }}>키워드 하나를 넣으면 이길 수 있는지 · 쓸 제목 · 사람들이 최근 14일 실제로 물은 것 · 돈이 되는지를 한 번에 잽니다. 전부 실측값입니다.</p>
                <form onSubmit={(e) => { e.preventDefault(); void run(keyword); }} style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                    <input value={keyword} onChange={(e) => setKeyword(e.target.value)} maxLength={60} placeholder="예: 자동차 보험 갱신" aria-label="설계할 키워드"
                        style={{ flex: '1 1 280px', minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--lw-line-strong)', background: 'var(--lw-surface)', color: 'var(--lw-text)', fontSize: 15 }} />
                    <button type="submit" disabled={running} style={{ minHeight: 44, padding: '0 20px', border: 0, borderRadius: 10, background: 'var(--lw-accent)', color: 'var(--lw-on-accent)', fontSize: 15, fontWeight: 600, cursor: running ? 'wait' : 'pointer', opacity: running ? 0.6 : 1 }}>{running ? '재는 중…' : '설계 시작'}</button>
                </form>
                {appPlans.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                        <span style={{ fontSize: 13, color: 'var(--lw-text-muted)', alignSelf: 'center' }}>앱에서 만든 설계</span>
                        {appPlans.slice(0, 12).map((p) => <button key={p.id} type="button" onClick={() => void run(p.keyword)} style={{ minHeight: 44, padding: '0 12px', borderRadius: 999, border: '1px solid var(--lw-line)', background: 'var(--lw-surface)', color: 'var(--lw-text-secondary)', fontSize: 13, cursor: 'pointer' }}>{p.keyword}</button>)}
                    </div>
                )}
                {error && <p role="alert" style={{ color: 'var(--lw-negative)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
            </section>

            {running && !result && <div className="lw-skel" aria-hidden="true"><i /><i /><i /></div>}
            {result && (
                <Reveal stagger key={result.keyword}>
                    <Box title="① 이 키워드, 이길 수 있나">
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Stat label="월 검색량" value={num(result.volume)} count={result.volume} />
                            <Stat label="블로그 문서수" value={num(result.docs)} count={result.docs} />
                            <Stat label="1페이지 정면 글" value={result.frontal == null ? '—' : `${result.frontal}개 / ${result.sampled}`}
                                note={result.frontal != null && result.frontal >= FRONTAL_SATURATION ? '정면 글이 많음 — 같은 제목으로는 들어가기 어렵습니다' : '실제 블로그탭 상위 제목 기준'} />
                            {result.board && <Stat label="선점 보드" value={result.board.tierLabel || '실림'} note={result.board.openSlot ? `빈자리 ${result.board.openSlot}위` : ''} />}
                        </div>
                    </Box>
                    <Box title="② 제목 · 검색용(1페이지에 없는 틀부터)">
                        {result.titles.length ? result.titles.map((t) => <TitleRow key={t.text} tag={t.kind === '검색용' ? '검색용' : '끌리는'} text={t.text} sub={`${t.frameLabel} · ${t.basis}`} />)
                            : <p style={{ fontSize: 13, color: 'var(--lw-text-muted)' }}>만든 제목이 없습니다.</p>}
                    </Box>
                    <Box title="③ 사람들이 궁금해하는 것">
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lw-text)', marginBottom: 8 }}>검색에서</div>
                        {result.searchesNote && <p style={{ fontSize: 13, color: 'var(--lw-accent-ink)' }}>{result.searchesNote}</p>}
                        {!result.searchesNote && result.searches.length === 0 && <p style={{ fontSize: 13, color: 'var(--lw-text-muted)' }}>검색 자동완성 · 연관 키워드에서 이 키워드와 겹치는 말을 찾지 못했습니다.</p>}
                        {result.searches.length > 0 && <p style={{ fontSize: 13, color: 'var(--lw-text-muted)', margin: '0 0 8px' }}>사람들이 검색으로 실제로 찾는 말입니다. 소제목 · 본문에서 답해 주면 그 검색까지 받습니다. 숫자는 월 검색량(실측).</p>}
                        {result.searches.map((s) => (
                            <div key={s.keyword} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '8px 0', borderTop: '1px solid var(--lw-line)' }}>
                                <span style={{ color: 'var(--lw-text-muted)' }}>□</span>
                                <span style={{ flex: 1, color: 'var(--lw-text)', fontSize: 15 }}>{s.keyword}</span>
                                <span style={{ fontSize: 13, color: 'var(--lw-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{s.searchVolume == null ? '미측정' : num(s.searchVolume)}</span>
                            </div>
                        ))}
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lw-text)', margin: '16px 0 8px' }}>지식인 · 카페 · 최근 14일</div>
                        {result.questionsNote && <p style={{ fontSize: 13, color: 'var(--lw-accent-ink)' }}>{result.questionsNote}</p>}
                        {!result.questionsNote && result.questions.length === 0 && <p style={{ fontSize: 13, color: 'var(--lw-text-muted)' }}>최근 14일 안에 이 키워드로 새로 올라온 질문이 없습니다.</p>}
                        {result.questions.map((q) => (
                            <div key={q.link} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '8px 0', borderTop: '1px solid var(--lw-line)' }}>
                                <span style={{ color: 'var(--lw-text-muted)' }}>□</span>
                                <a href={q.link} target="_blank" rel="noreferrer noopener" style={{ flex: 1, color: 'var(--lw-text)', fontSize: 15 }}>{q.title}</a>
                                <span style={{ fontSize: 13, color: 'var(--lw-text-muted)' }}>{day(q.postdate)} · {q.where}</span>
                            </div>
                        ))}
                    </Box>
                    <Box title="④ 돈">
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Stat label="모바일 파워링크 3위 입찰가" value={result.bid == null ? '—' : `${num(result.bid)}원`} count={result.bid} unit="원" note={result.bidNote || '검색광고 입찰가 조회(실측)'} />
                        </div>
                        {result.affiliate.length
                            ? <div style={{ marginTop: 8 }}><div style={{ fontSize: 13, color: 'var(--lw-text-muted)' }}>관련 제휴 상품 후보(이름이 겹치는 상품 · 성과 판정 아님)</div>
                                {result.affiliate.map((a) => <div key={a.name} style={{ fontSize: 15, color: 'var(--lw-text)', padding: '4px 0' }}>{a.platform} · {a.name}{a.reward && <span style={{ color: 'var(--lw-accent-ink)' }}> {a.reward}</span>}</div>)}</div>
                            : <p style={{ fontSize: 13, color: 'var(--lw-text-muted)', marginTop: 8 }}>이름이 겹치는 제휴 상품이 없습니다.</p>}
                    </Box>
                    {matched && app.status === 'ok' && <AppPlanBlock plan={matched} from={app.from} />}
                </Reveal>
            )}
        </div>
    );
}
