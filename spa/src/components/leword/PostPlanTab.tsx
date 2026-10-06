import { useEffect, useState } from 'react';
import { callWorkerRaw, fetchKeywordBid, fetchKeywordDocs, fetchKeywordExpansions, fetchKeywordFrontal, fetchKeywordVolumes } from '../../lib/keywordApi';
import { frontalCount, FRONTAL_SATURATION } from '../../lib/expansionTier';
import { forgeVariedTitles } from '../../lib/titleForge.generated.mjs';
import { affiliateCandidates, matchAppPlan, questionChecklist, relatedForTitles, volumeOf, type AffiliateCandidate, type PlanQuestion } from '../../lib/postPlanSiteModel.mjs';
import { loadAppPlans, type AppPlan, type AppPlansLoad } from '../../lib/postPlanSync';

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
    const [vol, docs, frontal, expansions, radar, bid, affiliate, board] = await Promise.all([
        fetchKeywordVolumes([keyword]),
        fetchKeywordDocs([keyword]),
        fetchKeywordFrontal([keyword]),
        fetchKeywordExpansions(keyword),
        // 키를 싣지 않는 호출 — 사용자 Bright Data 토큰이 실리면 유료 커뮤니티 검색이 돈다. 지식인 · 카페만(무료).
        callWorkerRaw('radar-search', {
            queries: JSON.stringify([keyword, `${keyword} 질문`]),
            coreKeywords: JSON.stringify([{ keyword }]),
            shortQueries: JSON.stringify([keyword]),
        }),
        fetchKeywordBid(keyword),
        json('/data/affiliate-campaigns.json'),
        json('/data/preemption-board.json'),
    ]);
    const topTitles = (frontal.ok && frontal.data?.titles?.[keyword]) || [];
    const derived = relatedForTitles(keyword, expansions.ok ? expansions.data?.items || [] : []);
    const row = (Array.isArray(board?.rows) ? board.rows : []).find((r: any) => compact(r.keyword) === compact(keyword));
    return {
        keyword,
        volume: vol.ok ? volumeOf(vol.data?.volumes, keyword) : null,
        docs: docs.ok ? (docs.data?.docs?.[keyword] ?? null) : null,
        frontal: frontalCount(topTitles, keyword),
        sampled: topTitles.length,
        board: row ? { openSlot: row.openSlot ?? null, tierLabel: String(row.tierLabel || '') } : null,
        titles: forgeVariedTitles(keyword, derived, topTitles).filter((t) => t.text).slice(0, 4),
        questions: radar && radar.ok ? questionChecklist((radar.items as unknown[]) || [], 10, keyword) : [],
        questionsNote: radar && radar.ok ? '' : '질문을 찾지 못했습니다 — 잠시 뒤 다시 눌러 주세요.',
        bid: bid.ok ? (bid.data?.bid ?? null) : null,
        bidNote: bid.ok ? '' : (bid.message || '내 API 키 탭에 검색광고 키를 넣으면 입찰가를 잽니다.'),
        affiliate: affiliateCandidates(keyword, affiliate, 3),
    };
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <div style={{ flex: '1 1 150px', padding: '10px 12px', borderRadius: 10, background: '#0b1220', border: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ fontSize: 11, color: '#7c8aa0' }}>{label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            {note && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{note}</div>}
        </div>
    );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="lw-panel" style={{ marginBottom: 12 }}>
            <div className="lw-panel-head"><h2 style={{ fontSize: 15, color: '#fde68a' }}>{title}</h2></div>
            <div style={{ padding: '4px 2px' }}>{children}</div>
        </section>
    );
}

function TitleRow({ tag, text, sub }: { tag: string; text: string; sub?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 11px', borderRadius: 8, background: '#0b1220', border: '1px solid rgba(255,255,255,.08)', marginBottom: 6 }}>
            <span style={{ flex: 'none', fontSize: 11, color: '#a5f3fc', background: '#153440', borderRadius: 4, padding: '2px 6px' }}>{tag}</span>
            <span style={{ flex: 1, fontSize: 14, color: '#f1f5f9' }}>{text}{sub && <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</span>}</span>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
                style={{ flex: 'none', border: 0, background: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>{copied ? '복사됨' : '복사'}</button>
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
            {(plan.titles?.homefeed || []).length > 0 && <div style={{ marginTop: 10 }}>{plan.titles!.homefeed.map((t) => <TitleRow key={t} tag="홈판용" text={t} />)}</div>}
            {plan.inflow && (
                <div style={{ marginTop: 10, fontSize: 12.5, color: '#cbd5e1' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 4 }}>발행 글 {plan.inflow.postTitle || plan.inflow.postUrl} · 찾음 {num(plan.inflow.found)}곳 · 관련 {num(plan.inflow.relevant)}곳 · 초안 {plan.inflow.answered}개</div>
                    {plan.inflow.spots.map((s) => (
                        <div key={s.link} style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,.05)' }}>
                            <span style={{ fontSize: 11, color: s.action === 'NOW' ? '#86efac' : '#fde68a', marginRight: 6 }}>{s.action === 'NOW' ? '지금 답하면 유입' : '지켜볼 자리'}</span>
                            <a href={s.link} target="_blank" rel="noreferrer noopener" style={{ color: '#e2e8f0' }}>{s.title}</a>
                            <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>{day(s.postdate)} · {s.where}</span>
                        </div>
                    ))}
                </div>
            )}
        </Box>
    );
}

export default function PostPlanTab() {
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

    const appPlans = app.status === 'ok' ? app.plans : [];
    const matched = result ? matchAppPlan(appPlans, result.keyword) : null;

    return (
        <div>
            <section className="lw-panel" style={{ marginBottom: 14, borderColor: 'rgba(250,204,21,.28)' }}>
                <div style={{ fontSize: 10.5, letterSpacing: 1.6, fontWeight: 800, color: '#fcd34d' }}>POST PLAN</div>
                <h2 style={{ margin: '4px 0 6px', fontSize: 21, color: '#fff' }}>글 한 편 유입 설계실</h2>
                <p style={{ margin: 0, fontSize: 13, color: '#a8b6cb' }}>키워드 하나를 넣으면 이길 수 있는지 · 쓸 제목 · 사람들이 최근 14일 실제로 물은 것 · 돈이 되는지를 한 번에 잽니다. 전부 실측값입니다.</p>
                <form onSubmit={(e) => { e.preventDefault(); void run(keyword); }} style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <input value={keyword} onChange={(e) => setKeyword(e.target.value)} maxLength={60} placeholder="예: 자동차 보험 갱신" aria-label="설계할 키워드"
                        style={{ flex: '1 1 280px', padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: '#0b1220', color: '#f1f5f9', fontSize: 14 }} />
                    <button type="submit" disabled={running} style={{ padding: '10px 18px', border: 0, borderRadius: 9, background: '#fbbf24', color: '#1a1200', fontWeight: 800, cursor: running ? 'wait' : 'pointer', opacity: running ? 0.6 : 1 }}>{running ? '재는 중…' : '설계 시작'}</button>
                </form>
                {appPlans.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                        <span style={{ fontSize: 11.5, color: '#7c8aa0', alignSelf: 'center' }}>앱에서 만든 설계</span>
                        {appPlans.slice(0, 12).map((p) => <button key={p.id} type="button" onClick={() => void run(p.keyword)} style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,.14)', background: '#13202e', color: '#a1b3c9', fontSize: 12, cursor: 'pointer' }}>{p.keyword}</button>)}
                    </div>
                )}
                {error && <p role="alert" style={{ color: '#fca5a5', fontSize: 12.5, margin: '8px 0 0' }}>{error}</p>}
            </section>

            {result && (
                <>
                    <Box title="① 이 키워드, 이길 수 있나">
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Stat label="월 검색량" value={num(result.volume)} />
                            <Stat label="블로그 문서수" value={num(result.docs)} />
                            <Stat label="1페이지 정면 글" value={result.frontal == null ? '—' : `${result.frontal}개 / ${result.sampled}`}
                                note={result.frontal != null && result.frontal >= FRONTAL_SATURATION ? '정면 글이 많음 — 같은 제목으로는 들어가기 어렵습니다' : '실제 블로그탭 상위 제목 기준'} />
                            {result.board && <Stat label="선점 보드" value={result.board.tierLabel || '실림'} note={result.board.openSlot ? `빈자리 ${result.board.openSlot}위` : ''} />}
                        </div>
                    </Box>
                    <Box title="② 제목 · 검색용(1페이지에 없는 틀부터)">
                        {result.titles.length ? result.titles.map((t) => <TitleRow key={t.text} tag={t.kind === '검색용' ? '검색용' : '끌리는'} text={t.text} sub={`${t.frameLabel} · ${t.basis}`} />)
                            : <p style={{ fontSize: 12.5, color: '#94a3b8' }}>만든 제목이 없습니다.</p>}
                    </Box>
                    <Box title="③ 사람들이 실제로 물은 것 · 최근 14일">
                        {result.questionsNote && <p style={{ fontSize: 12, color: '#fbbf24' }}>{result.questionsNote}</p>}
                        {!result.questionsNote && result.questions.length === 0 && <p style={{ fontSize: 12.5, color: '#94a3b8' }}>최근 14일 안에 이 키워드로 새로 올라온 질문이 없습니다.</p>}
                        {result.questions.map((q) => (
                            <div key={q.link} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '6px 0', borderTop: '1px solid rgba(255,255,255,.05)' }}>
                                <span style={{ color: '#64748b' }}>□</span>
                                <a href={q.link} target="_blank" rel="noreferrer noopener" style={{ flex: 1, color: '#e2e8f0', fontSize: 13 }}>{q.title}</a>
                                <span style={{ fontSize: 11, color: '#64748b' }}>{day(q.postdate)} · {q.where}</span>
                            </div>
                        ))}
                    </Box>
                    <Box title="④ 돈">
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Stat label="모바일 파워링크 3위 입찰가" value={result.bid == null ? '—' : `${num(result.bid)}원`} note={result.bidNote || '검색광고 입찰가 조회(실측)'} />
                        </div>
                        {result.affiliate.length
                            ? <div style={{ marginTop: 8 }}><div style={{ fontSize: 11.5, color: '#94a3b8' }}>관련 제휴 상품 후보(이름이 겹치는 상품 · 성과 판정 아님)</div>
                                {result.affiliate.map((a) => <div key={a.name} style={{ fontSize: 12.5, color: '#e2e8f0', padding: '3px 0' }}>{a.platform} · {a.name}{a.reward && <span style={{ color: '#fbbf24' }}> {a.reward}</span>}</div>)}</div>
                            : <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 8 }}>이름이 겹치는 제휴 상품이 없습니다.</p>}
                    </Box>
                    {matched && app.status === 'ok' && <AppPlanBlock plan={matched} from={app.from} />}
                </>
            )}
        </div>
    );
}
