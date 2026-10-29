import { useEffect, useState } from 'react';
import { freshness, loadShortentsRising, type ShortentsRising, type ShortentsTopic } from '../../lib/shortentsRising.mjs';

/**
 * 숏텐츠 급상승(2026-10-29 사장님 "숏텐츠 중에서 가장 빠르게 뜨는 키워드").
 * 앱이 30분마다 올리는 /data/shortents-rising.json 을 읽어 보여 준다. 순서는 앱이 정한 '빠르게 뜨는 순' 그대로.
 * 잰 사실(등장 시각 · 순위 변화 · 연속 횟수 · 블로그 문서수)만 적고 확률·예상 조회수는 만들지 않는다.
 */
const SHOW_TOP = 10;

const fmtTime = (iso?: string | null) => (iso && Number.isFinite(Date.parse(iso))
    ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '');

function agoText(minutes: number): string {
    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    const h = Math.floor(minutes / 60);
    return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

const BADGE = {
    new: { color: '#fecaca', bg: 'rgba(239,68,68,.18)', border: 'rgba(239,68,68,.5)' },
    rising: { color: '#fde68a', bg: 'rgba(245,158,11,.16)', border: 'rgba(245,158,11,.5)' },
    steady: { color: '#cbd5e1', bg: 'rgba(148,163,184,.12)', border: 'rgba(148,163,184,.35)' },
    falling: { color: '#bfdbfe', bg: 'rgba(59,130,246,.14)', border: 'rgba(59,130,246,.45)' },
} as const;

export function badgeText(t: ShortentsTopic, nowMs: number): string {
    if (t.status === 'new') {
        const first = Date.parse(t.firstSeenAt || '');
        return Number.isFinite(first) ? `방금 등장 ${agoText(Math.max(0, Math.floor((nowMs - first) / 60000)))}` : '방금 등장';
    }
    const n = t.rankDelta == null ? null : Math.abs(t.rankDelta);
    if (t.status === 'rising') return n ? `▲${n} 상승` : '▲ 상승';
    if (t.status === 'falling') return n ? `▼${n} 하락` : '▼ 하락';
    return t.streak ? `유지 연속 ${t.streak}회` : '유지';
}

export default function ShortentsRisingPanel({ onAnalyze }: { onAnalyze?: (keyword: string) => void }) {
    const [data, setData] = useState<ShortentsRising | null>(null);
    const [all, setAll] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        let alive = true;
        void loadShortentsRising().then((r) => { if (alive) { setData(r); setNowMs(Date.now()); } });
        return () => { alive = false; };
    }, []);

    if (!data || data.topics.length === 0) return null;
    const fresh = freshness(data.builtAt, nowMs);
    const published = fmtTime(data.latest?.publishTime || data.builtAt);
    const rows = all ? data.topics : data.topics.slice(0, SHOW_TOP);
    const link = { color: '#93c5fd', fontSize: 12, textDecoration: 'none' } as const;

    return (
        <section aria-label="숏텐츠 급상승" style={{ margin: '0 0 16px', padding: '12px 14px', border: '1px solid #b8962e', borderRadius: 14, background: 'rgba(15,23,42,.55)' }}>
            <h3 style={{ margin: 0, fontSize: 15, color: '#fff7d1' }}>
                숏텐츠 급상승
                <small style={{ marginLeft: 8, fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>
                    {published ? `${published} 발행 · ` : ''}30분마다 갱신
                </small>
            </h3>
            {fresh.stale && (
                <p role="status" style={{ margin: '6px 0 0', fontSize: 12.5, color: '#fbbf24' }}>
                    앱이 꺼져 있어 {fresh.minutes == null ? '예전' : agoText(fresh.minutes)} 목록입니다 — LEWORD 앱이 켜져 있어야 30분마다 갱신됩니다
                </p>
            )}
            <ol style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                {rows.map((t, i) => {
                    const b = BADGE[t.status];
                    return (
                        <li key={`${t.keyword}-${i}`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: i ? '1px solid rgba(148,163,184,.15)' : 'none', fontSize: 13, color: '#e2e8f0' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11.5, whiteSpace: 'nowrap', color: b.color, background: b.bg, border: `1px solid ${b.border}` }}>{badgeText(t, nowMs)}</span>
                            {t.category && <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{t.category}</span>}
                            <strong style={{ color: '#fff' }}>{t.keyword}</strong>
                            {t.summary && <span style={{ flex: '1 1 220px', minWidth: 0, fontSize: 12.5, color: '#b6c4d6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.summary}>{t.summary}</span>}
                            {t.docs != null && <span style={{ fontSize: 12, color: '#cbd5e1', whiteSpace: 'nowrap' }}>블로그 문서 {t.docs.toLocaleString('ko-KR')}개</span>}
                            <span style={{ display: 'inline-flex', gap: 6, marginLeft: 'auto' }}>
                                {onAnalyze && <button type="button" className="lw-mini" onClick={() => onAnalyze(t.keyword)}>LEWORD 분석</button>}
                                <a className="lw-mini" href={`https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(t.keyword)}`} target="_blank" rel="noreferrer">네이버 블로그 검색</a>
                                {t.articleUrl && <a style={link} href={t.articleUrl} target="_blank" rel="noreferrer">기사</a>}
                            </span>
                        </li>
                    );
                })}
            </ol>
            {data.topics.length > SHOW_TOP && (
                <button type="button" className="lw-mini" style={{ marginTop: 8 }} onClick={() => setAll((v) => !v)}>
                    {all ? '접기' : `${data.topics.length}개 다 보기`}
                </button>
            )}
        </section>
    );
}
