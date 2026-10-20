/**
 * 지금 쓰면 트래픽이 오나(2026-10-20 사장님 "그래프로 확인을 하지만 그걸 확인해서 알려줘야 됩니다").
 * 판의 card.demand 는 앱 레포 adsense-benchmarks-trend.cjs 가 데이터랩 주별 실측으로 붙인다 — 여기서는 판정 · 사실 문장 · 26주 선만 그린다.
 * 예상 유입 · 확률 같은 추정치는 그리지 않는다(상대값 선과 잰 변화율뿐).
 */
import { useRef, useState } from 'react';
import { adsenseCompetition, blogCount, type AdsenseCard, type AdsenseDemand } from '../../../lib/adsenseBenchmarkModel.mjs';

const TONE: Record<AdsenseDemand['verdict'], { fg: string; bg: string }> = {
    rising: { fg: '#052e16', bg: '#4ade80' },
    'season-soon': { fg: '#3b2a07', bg: '#fbbf24' },
    steady: { fg: '#e2e8f0', bg: '#334155' },
    cooling: { fg: '#ffe4e6', bg: '#9f1239' },
    'past-peak': { fg: '#fee2e2', bg: '#7f1d1d' },
    unknown: { fg: '#cbd5e1', bg: '#1e293b' },
};

export function DemandChip({ demand }: { demand: AdsenseDemand }) {
    const tone = TONE[demand.verdict] || TONE.unknown;
    return <span style={{ borderRadius: 5, padding: '2px 8px', fontWeight: 800, fontSize: 11, color: tone.fg, background: tone.bg }}>{demand.label}</span>;
}

/** 최근 26주 데이터랩 상대값 — 올리면 그 주의 값. */
export function DemandSpark({ series, verdict }: { series: number[]; verdict: AdsenseDemand['verdict'] }) {
    const [hover, setHover] = useState(-1);
    const ref = useRef<SVGSVGElement>(null);
    if (!Array.isArray(series) || series.length < 2) return null;
    const w = 220; const h = 44; const pad = 3;
    const max = Math.max(...series, 1);
    const step = (w - pad * 2) / (series.length - 1);
    const xy = series.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)] as const);
    const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const stroke = verdict === 'rising' ? '#4ade80' : verdict === 'season-soon' ? '#fbbf24' : verdict === 'cooling' || verdict === 'past-peak' ? '#fb7185' : '#7c9cff';
    const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r || !r.width) return;
        setHover(Math.max(0, Math.min(series.length - 1, Math.round(((e.clientX - r.left) / r.width) * (series.length - 1)))));
    };
    const weeksAgo = series.length - 1 - hover;
    return (
        <div style={{ display: 'grid', gap: 2, width: 'min(100%, 260px)' }} title="네이버 데이터랩 주별 상대 검색 관심(실측)">
            <svg ref={ref} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="최근 26주 검색 관심 추이" onMouseMove={onMove} onMouseLeave={() => setHover(-1)} style={{ width: '100%', height: 44 }}>
                <polygon points={`${pad},${h - pad} ${line} ${w - pad},${h - pad}`} fill={stroke} opacity={0.12} />
                <polyline points={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {hover >= 0 && <circle cx={xy[hover][0]} cy={xy[hover][1]} r={3.5} fill={stroke} />}
            </svg>
            <small style={{ color: '#8d9db4', fontSize: 11 }}>{hover >= 0 ? `${weeksAgo === 0 ? '지난주' : `${weeksAgo + 1}주 전`} · 상대값 ${series[hover]}` : '최근 26주 검색 관심 · 데이터랩 실측(상대값)'}</small>
        </div>
    );
}

/** 카드 안 — 판정 · 사실 한 줄 · 26주 선. 판정이 없으면 아무것도 그리지 않는다. */
export function DemandBlock({ c }: { c: AdsenseCard }) {
    if (!c.demand) return null;
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', margin: '2px 0 10px', padding: '9px 12px', border: '1px solid rgba(148,163,184,.22)', borderRadius: 10, background: 'rgba(15,23,42,.45)' }}>
            <div style={{ display: 'grid', gap: 4, flex: '1 1 220px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#a8b6cb' }}>지금 쓰면 트래픽 <DemandChip demand={c.demand} /></span>
                <span style={{ fontSize: 13, color: '#e2e8f0' }}>{c.demand.fact}</span>
            </div>
            <DemandSpark series={c.demand.series} verdict={c.demand.verdict} />
        </div>
    );
}

/** 맨 위 "지금 써야 할 키워드" — 오르는 중 · 곧 시즌이면서 문서 경쟁 낮은 실측 소재. 누르면 그 소재만 보이게 거른다. */
export function NowPicksPanel({ picks, now, onPick, platformLabel }: { picks: AdsenseCard[]; now: number; onPick: (query: string) => void; platformLabel: string }) {
    if (!picks.length) return null;
    return (
        <section aria-label="지금 써야 할 키워드" style={{ margin: '6px 0 16px', padding: '16px 18px', border: '1px solid #b8962e', borderRadius: 16, background: 'radial-gradient(ellipse at 0 0,rgba(74,222,128,.10),transparent 60%),linear-gradient(130deg,#1c2133,#111a2a)' }}>
            <h3 style={{ margin: 0, fontSize: 17, color: '#fff7d1', letterSpacing: '-.3px' }}>지금 써야 할 키워드 <small style={{ fontSize: 12, color: '#fcd34d', fontWeight: 500 }}>{platformLabel} · {picks.length}개</small></h3>
            <p style={{ margin: '4px 0 12px', fontSize: 12.5, color: '#b6c4d6' }}>데이터랩 주별 실측으로 <b style={{ color: '#4ade80' }}>지금 검색 관심이 오르고 있거나</b> <b style={{ color: '#fbbf24' }}>작년 이맘때 곧 올랐던</b> 소재 중, 검색량 대비 블로그 문서가 적은 것만 골랐습니다.</p>
            <div style={{ display: 'grid', gap: 8 }}>
                {picks.map((c) => {
                    const comp = adsenseCompetition(c, now);
                    const m = c.metrics || ({} as AdsenseCard['metrics']);
                    return (
                        <div key={c.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', padding: '10px 12px', border: '1px solid rgba(148,163,184,.22)', borderRadius: 10, background: '#0d1728' }}>
                            <div style={{ flex: '1 1 260px', display: 'grid', gap: 3 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><strong style={{ fontSize: 15, color: '#f1f5f9' }}>{m.query || c.keyword}</strong>{c.demand && <DemandChip demand={c.demand} />}</span>
                                {c.demand && <span style={{ fontSize: 12.5, color: '#d6e2f0' }}>{c.demand.fact}</span>}
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>월 검색 {typeof m.searchVolume === 'number' ? m.searchVolume.toLocaleString('ko-KR') : '—'} · 문서 {typeof m.documentCount === 'number' ? m.documentCount.toLocaleString('ko-KR') : '—'} · 문서/검색 {comp.ratio !== null ? `${comp.ratio.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}배` : '—'} · 고수 {blogCount(c)}곳</span>
                            </div>
                            {c.demand && <DemandSpark series={c.demand.series} verdict={c.demand.verdict} />}
                            <button type="button" onClick={() => onPick(m.query || c.keyword)} style={{ border: '1px solid #8c7320', background: '#2e2610', color: '#fff1b8', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>이 소재 보기</button>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
