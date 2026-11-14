import { useEffect, useState } from 'react';
import { freshness, groupByCategory, loadShortentsRising, type ShortentsRising, type ShortentsTopic } from '../../lib/shortentsRising.mjs';

/**
 * 숏텐츠 급상승(2026-10-29 사장님 "숏텐츠 중에서 가장 빠르게 뜨는 키워드").
 * 앱이 30분마다 올리는 /data/shortents-rising.json 을 읽어 보여 준다. 순서는 앱이 정한 '빠르게 뜨는 순' 그대로.
 * 잰 사실(등장 시각 · 순위 변화 · 연속 횟수 · 블로그 문서수)만 적고 확률·예상 조회수는 만들지 않는다.
 */
/*
 * 2026-10-29 사장님 "접었다 폈다 가능하게 해주고 … 카테고리별로 나눠주고" — 칸 전체를 접고 펼 수 있고(이 브라우저에 기억),
 * 분야 칩으로 거르거나, '전체'면 분야별 묶음(각 묶음도 접기)으로 보여 준다.
 */
const OPEN_KEY = 'lw-shortents-open';
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; } };
const writeOpen = (open: boolean) => { try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* 저장 못 해도 화면은 동작 */ } };

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
    new: { color: 'var(--lw-negative)', bg: 'var(--lw-negative-soft)' },
    rising: { color: 'var(--lw-accent-ink)', bg: 'var(--lw-accent-soft)' },
    steady: { color: 'var(--lw-text-secondary)', bg: 'var(--lw-raised)' },
    falling: { color: 'var(--lw-text-secondary)', bg: 'var(--lw-raised)' },
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
    const [open, setOpen] = useState(readOpen);
    const [category, setCategory] = useState('전체');
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        let alive = true;
        void loadShortentsRising().then((r) => { if (alive) { setData(r); setNowMs(Date.now()); } });
        return () => { alive = false; };
    }, []);

    if (!data || data.topics.length === 0) return null;
    const fresh = freshness(data.builtAt, nowMs);
    const published = fmtTime(data.latest?.publishTime || data.builtAt);
    const groups = groupByCategory(data.topics);
    const activeCategory = category === '전체' || groups.some((g) => g.category === category) ? category : '전체';
    const shown = activeCategory === '전체' ? groups : groups.filter((g) => g.category === activeCategory);
    const link = { display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 4px', color: 'var(--lw-accent-ink)', fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 3 } as const;
    const toggle = () => setOpen((v) => { writeOpen(!v); return !v; });
    const chip = (on: boolean) => ({ minHeight: 44, padding: '0 16px', borderRadius: 999, fontSize: 13, fontVariantNumeric: 'tabular-nums' as const, cursor: 'pointer', color: on ? 'var(--lw-text)' : 'var(--lw-text-secondary)', background: on ? 'var(--lw-accent-soft)' : 'var(--lw-surface)', border: `1px solid ${on ? 'var(--lw-accent)' : 'var(--lw-line)'}` });
    const renderTopic = (t: ShortentsTopic, i: number) => {
        const b = BADGE[t.status];
        return (
            <li key={`${t.keyword}-${i}`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: i ? '1px solid var(--lw-line)' : 'none', fontSize: 15, color: 'var(--lw-text)' }}>
                <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 13, whiteSpace: 'nowrap', color: b.color, background: b.bg }}>{badgeText(t, nowMs)}</span>
                <strong style={{ color: 'var(--lw-text)', fontWeight: 600 }}>{t.keyword}</strong>
                {t.summary && <span style={{ flex: '1 1 220px', minWidth: 0, fontSize: 13, color: 'var(--lw-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.summary}>{t.summary}</span>}
                {t.docs != null && <span style={{ fontSize: 13, color: 'var(--lw-text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>블로그 문서 {t.docs.toLocaleString('ko-KR')}개</span>}
                <span style={{ display: 'inline-flex', gap: 6, marginLeft: 'auto' }}>
                    {onAnalyze && <button type="button" className="lw-mini" style={{ minHeight: 44 }} onClick={() => onAnalyze(t.keyword)}>LEWORD 분석</button>}
                    <a className="lw-mini" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }} href={`https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(t.keyword)}`} target="_blank" rel="noreferrer">네이버 블로그 검색</a>
                    {t.articleUrl && <a style={link} href={t.articleUrl} target="_blank" rel="noreferrer">기사</a>}
                </span>
            </li>
        );
    };

    return (
        <section aria-label="숏텐츠 급상승" style={{ margin: '0 0 16px', padding: '12px 16px', border: '1px solid var(--lw-line)', borderRadius: 14, background: 'var(--lw-surface)', boxShadow: 'var(--lw-shadow-sm)' }}>
            <button type="button" onClick={toggle} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--lw-text)' }}>{open ? '▾' : '▸'} 숏텐츠 급상승</span>
                <small style={{ fontSize: 13, color: 'var(--lw-text-muted)' }}>{published ? `${published} 발행 · ` : ''}30분마다 갱신 · {data.topics.length}개</small>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--lw-accent-ink)' }}>{open ? '접기' : '펼치기'}</span>
            </button>
            {fresh.stale && (
                <p role="status" style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--lw-accent-ink)' }}>
                    앱이 꺼져 있어 {fresh.minutes == null ? '예전' : agoText(fresh.minutes)} 목록입니다 — LEWORD 앱이 켜져 있어야 30분마다 갱신됩니다
                </p>
            )}
            {open && <>
                {groups.length > 1 && (
                    <div role="group" aria-label="숏텐츠 분야" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 4px' }}>
                        <button type="button" aria-pressed={activeCategory === '전체'} style={chip(activeCategory === '전체')} onClick={() => setCategory('전체')}>전체 {data.topics.length}</button>
                        {groups.map((g) => (
                            <button key={g.category} type="button" aria-pressed={activeCategory === g.category} style={chip(activeCategory === g.category)} onClick={() => setCategory(g.category)}>{g.category} {g.topics.length}</button>
                        ))}
                    </div>
                )}
                {shown.map((g) => (
                    <details key={g.category} open style={{ marginTop: 8 }}>
                        <summary style={{ cursor: 'pointer', padding: '12px 0', fontSize: 15, fontWeight: 600, color: 'var(--lw-text)' }}>{g.category} <span style={{ color: 'var(--lw-text-muted)', fontWeight: 500, fontSize: 13 }}>{g.topics.length}개</span></summary>
                        <ol style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
                            {g.topics.map(renderTopic)}
                        </ol>
                    </details>
                ))}
            </>}
        </section>
    );
}
