import { useEffect, useState } from 'react';
import { loadShortentsUpcoming, upcomingFreshness, type ShortentsUpcoming, type UpcomingCandidate } from '../../lib/shortentsUpcoming.mjs';
import { isUnlocked } from './LicenseGate';

/**
 * 곧 뜰 숏텐츠 후보(2026-10-30 사장님 "곧 뜰 숏텐츠를 우리 숏텐츠에 접목" · "로그인 회원만").
 * 앱이 10분마다 올리는 /data/shortents-upcoming.json — 실시간 급상승어 중 아직 숏텐츠에 없는 말을
 * 뉴스 최신순으로 잰 숫자(90분 기사 · 언론사 · 20분 기사 · 첫 기사 시각)와 적중 장부만 보여 준다. 확률 · 점수는 만들지 않는다.
 * 비로그인은 후보 개수와 적중 장부만 보고, 목록은 로그인하면 열린다(다른 보드와 같은 화면 잠금).
 */
const OPEN_KEY = 'lw-shortents-upcoming-open';
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; } };
const writeOpen = (open: boolean) => { try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* 저장 못 해도 화면은 동작 */ } };

const SOURCE_NAME: Record<string, string> = { 'signal.bz': '시그널', nate: '네이트', google: '구글', daum: '다음' };
const SURGE_RECENT = 3;

const clock = (iso?: string | null) => (iso && Number.isFinite(Date.parse(iso))
    ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(new Date(iso))
    : '');

function agoText(minutes: number): string {
    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    const h = Math.floor(minutes / 60);
    return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

export function factsText(c: UpcomingCandidate, windowMin = 90, recentMin = 20): string {
    const parts: string[] = [];
    if (c.articles90 != null) parts.push(`${windowMin}분 기사 ${c.articles90}건${c.capped ? '+' : ''}`);
    if (c.press != null) parts.push(`언론사 ${c.press}곳`);
    if (c.recent20 != null) parts.push(`최근 ${recentMin}분 ${c.recent20}건`);
    const first = clock(c.firstArticleAt);
    if (first) parts.push(`첫 기사 ${first}`);
    return parts.join(' · ');
}

export function hitRateText(h: ShortentsUpcoming['hitRate']): string {
    if (!h) return '';
    // 적중이 하나도 없을 때 '0개가 떴음'은 막 시작한 장부를 실패로 읽히게 한다 — 추적 중인 수만 적는다.
    if (!h.matched) return h.flagged ? `적중 기록 쌓는 중 — 후보 ${h.flagged}개 추적 중` : '적중 기록 쌓는 중';
    const lead = h.avgLeadMin != null ? ` · 평균 ${h.avgLeadMin}분 먼저` : '';
    return `최근 ${h.days}일 후보 ${h.flagged}개 중 ${h.matched}개가 숏텐츠에 떴음${lead}`;
}

const pill = (color: string, bg: string) => ({ padding: '4px 8px', borderRadius: 999, fontSize: 13, whiteSpace: 'nowrap' as const, color, background: bg });

export default function ShortentsUpcomingPanel({ onAnalyze }: { onAnalyze?: (keyword: string) => void }) {
    const [data, setData] = useState<ShortentsUpcoming | null>(null);
    const [open, setOpen] = useState(readOpen);
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        let alive = true;
        void loadShortentsUpcoming().then((r) => { if (alive) { setData(r); setNowMs(Date.now()); } });
        return () => { alive = false; };
    }, []);

    if (!data || !data.builtAt) return null;
    const unlocked = isUnlocked();
    const fresh = upcomingFreshness(data.builtAt, nowMs);
    const windowMin = data.rule?.windowMin ?? 90;
    const recentMin = data.rule?.recentMin ?? 20;
    const toggle = () => setOpen((v) => { writeOpen(!v); return !v; });
    const hit = hitRateText(data.hitRate);

    const renderCandidate = (c: UpcomingCandidate, i: number) => (
        <li key={`${c.keyword}-${i}`} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--lw-line)' : 'none', fontSize: 15, color: 'var(--lw-text)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--lw-text-muted)', minWidth: 20, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                <strong style={{ color: 'var(--lw-text)', fontWeight: 600 }}>{c.keyword}</strong>
                {c.exclusive && <span style={pill('var(--lw-negative)', 'var(--lw-negative-soft)')}>단독·공식</span>}
                {(c.recent20 ?? 0) >= SURGE_RECENT && <span style={pill('var(--lw-accent-ink)', 'var(--lw-accent-soft)')}>급증</span>}
                <span style={{ fontSize: 13, color: 'var(--lw-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{factsText(c, windowMin, recentMin)}</span>
                {c.sources.length > 0 && <span style={{ fontSize: 13, color: 'var(--lw-text-muted)' }}>{c.sources.map((s) => SOURCE_NAME[s] || s).join('·')} 급상승</span>}
                <span style={{ display: 'inline-flex', gap: 6, marginLeft: 'auto' }}>
                    {onAnalyze && <button type="button" className="lw-mini" style={{ minHeight: 44 }} onClick={() => onAnalyze(c.keyword)}>LEWORD 분석</button>}
                    <a className="lw-mini" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }} href={`https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(c.keyword)}`} target="_blank" rel="noreferrer">네이버 블로그 검색</a>
                </span>
            </div>
            {c.samples.length > 0 && (
                <details style={{ margin: '4px 0 0 28px' }}>
                    <summary style={{ cursor: 'pointer', padding: '12px 0', fontSize: 13, color: 'var(--lw-accent-ink)' }}>관련 기사 {c.samples.length}건</summary>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 13, color: 'var(--lw-text-secondary)' }}>
                        {c.samples.map((s, j) => (
                            <li key={j}>
                                {s.link ? <a href={s.link} target="_blank" rel="noreferrer" style={{ color: 'var(--lw-text-secondary)' }}>{s.title}</a> : s.title}
                                <small style={{ marginLeft: 8, fontSize: 13, color: 'var(--lw-text-muted)' }}>{[s.press, clock(s.publishedAt)].filter(Boolean).join(' · ')}</small>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </li>
    );

    return (
        <section aria-label="곧 뜰 숏텐츠 후보" style={{ margin: '0 0 16px', padding: '12px 16px', border: '1px solid var(--lw-line)', borderRadius: 14, background: 'var(--lw-surface)', boxShadow: 'var(--lw-shadow-sm)' }}>
            <button type="button" onClick={toggle} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--lw-text)' }}>{open ? '▾' : '▸'} 곧 뜰 숏텐츠 후보</span>
                <small style={{ fontSize: 13, color: 'var(--lw-text-muted)' }}>{clock(data.builtAt) ? `${clock(data.builtAt)} 측정 · ` : ''}10분마다 갱신 · {data.candidates.length}개</small>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--lw-accent-ink)' }}>{open ? '접기' : '펼치기'}</span>
            </button>
            {fresh.stale && (
                <p role="status" style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--lw-accent-ink)' }}>
                    앱이 꺼져 있어 {fresh.minutes == null ? '예전' : agoText(fresh.minutes)} 목록입니다 — LEWORD 앱이 켜져 있어야 10분마다 갱신됩니다
                </p>
            )}
            {open && <>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--lw-text-secondary)' }}>
                    실시간 급상승어 중 아직 숏텐츠에 없는 말을 뉴스로 쟀습니다 — {windowMin}분 안에 기사 {data.rule?.minArticles ?? 3}건·언론사 {data.rule?.minPress ?? 2}곳 이상만.
                    {hit && <strong style={{ marginLeft: 8, color: 'var(--lw-text)', fontWeight: 600 }}>{hit}</strong>}
                </p>
                {unlocked && data.hitRate && data.hitRate.recent.length > 0 && (
                    <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', padding: '12px 0', fontSize: 13, color: 'var(--lw-accent-ink)' }}>적중 사례 {data.hitRate.recent.length}건</summary>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 13, color: 'var(--lw-text-secondary)' }}>
                            {data.hitRate.recent.map((r, i) => (
                                <li key={i}>{r.keyword} → 숏텐츠 「{r.hitKeyword}」{r.leadMin != null ? ` · ${r.leadMin}분 먼저` : ''}</li>
                            ))}
                        </ul>
                    </details>
                )}
                {!unlocked ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12, padding: '12px', borderRadius: 10, background: 'var(--lw-raised)', border: '1px solid var(--lw-line)' }}>
                        <span style={{ fontSize: 15, color: 'var(--lw-text)' }}>로그인 회원 전용입니다 — 지금 후보 {data.candidates.length}개</span>
                        <button type="button" className="lw-mini" style={{ minHeight: 44 }} onClick={() => window.dispatchEvent(new CustomEvent('leword:login'))}>로그인 · 계정 만들기</button>
                    </div>
                ) : data.candidates.length === 0 ? (
                    <p role="status" style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--lw-text-muted)' }}>
                        지금은 조건을 넘은 후보가 없습니다{data.measured != null ? ` (급상승어 ${data.measured}개를 재 봄)` : ''}
                    </p>
                ) : (
                    <ol style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                        {data.candidates.map(renderCandidate)}
                    </ol>
                )}
            </>}
        </section>
    );
}
