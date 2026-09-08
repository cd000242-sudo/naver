import { useEffect, useMemo, useState } from 'react';
import LicenseGate, { isUnlocked } from './LicenseGate';
import { naverSearchUrl } from './preemptionMeta';
import { TabIntro } from './LewordShared';

/**
 * 오늘의 글감 — NOW / NEXT / ALWAYS 글감 브리프(사장님 예시 형식, 2026-09-09).
 *
 * 키워드 목록이 아니라 **날짜가 박힌 공식 사실에서 나온 글감**이다. leword-app CI(topic-briefs.yml, 매일 아침)가
 * 분야별로 네이버 뉴스 API 기사를 실측해 사실 카드를 만들고, 에이전트가 카드 **안에서만** 글감을 고르며,
 * 검증기가 카드에 없는 날짜·숫자를 떨어뜨린다. 검색량은 검색광고 실측, SERP 적합성은 정면 글 수 실측이다.
 * 안 쟀으면 '미측정'으로 그대로 보인다. 여기서는 읽기만 한다.
 *
 * 무료 건수는 다른 정적 보드와 같은 3건이다.
 */

type Timing = 'NOW' | 'NEXT' | 'ALWAYS';

interface BriefFact { id: string; title: string; press: string; link: string; publishedAt: string }

interface Brief {
    title: string;
    timing: Timing;
    types: string[];
    primaryIntent: string;
    value: string;
    experience: string;
    differentiation: string;
    coreKeyword: string;
    field: string;
    facts: BriefFact[];
    searchVolume: number | null;
    /** 검색광고가 '< 10' 으로 답한 검색어 — 잰 것이다 */
    searchVolumeUnder10?: boolean;
    serpFacing: number | null;
    serpVacancy: number | null;
    serpFit: '높음' | '보통' | '낮음' | '미측정';
    star: boolean;
}

interface TopicBriefs {
    builtAt: string;
    counts: { briefs: number; now: number; next: number; always: number; star: number };
    briefs: Brief[];
}

const FREE_BRIEFS = 3;
const TIMING_LABEL: Record<Timing, { name: string; desc: string }> = {
    NOW: { name: 'NOW', desc: '지금 쓰는 글 — 이번 주 안에 찾는 것' },
    NEXT: { name: 'NEXT', desc: '날짜가 정해진 예정 — 미리 써 두는 글' },
    ALWAYS: { name: 'ALWAYS', desc: '철 안 타는 기준·제도 — 꾸준히 읽히는 글' },
};
const num = (value: number) => value.toLocaleString('ko-KR');
const kst = (iso: string) => new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });

export default function TopicBriefsBoard({ onAnalyze }: { onAnalyze?: (keyword: string) => void }) {
    const [data, setData] = useState<TopicBriefs | null>(null);
    const [error, setError] = useState('');
    const [unlocked, setUnlocked] = useState(() => isUnlocked());
    const [field, setField] = useState<string>('전체');

    useEffect(() => {
        let alive = true;
        fetch('/data/topic-briefs.json', { cache: 'no-cache' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then((json) => { if (alive) setData(json as TopicBriefs); })
            .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
        return () => { alive = false; };
    }, []);

    const all = data?.briefs ?? [];
    const fields = useMemo(() => ['전체', ...Array.from(new Set(all.map((b) => b.field)))], [all]);
    const filtered = field === '전체' ? all : all.filter((b) => b.field === field);
    const visible = unlocked ? filtered : filtered.slice(0, FREE_BRIEFS);
    const groups = (['NOW', 'NEXT', 'ALWAYS'] as const).map((timing) => ({ timing, items: visible.filter((b) => b.timing === timing) })).filter((g) => g.items.length > 0);

    return (
        <section className="lw-picks lw-picks-tab lw-briefs" aria-labelledby="lw-briefs-title">
            <h2 id="lw-briefs-title" hidden>오늘의 글감</h2>
            <TabIntro
                title="오늘의 글감"
                desc={`날짜가 박힌 공식 사실에서 뽑은 글감 — NOW(지금) · NEXT(예정) · ALWAYS(지속)${data ? ` · ${kst(data.builtAt)} 실측 · ${num(data.counts.briefs)}건 · ★ ${num(data.counts.star)}` : ''}`}
                source="네이버 뉴스 API 기사 실측 · 검색광고 검색량 실측 · 정면 글 수 실측(안 쟀으면 미측정) · 매일 아침 갱신"
            />

            {error && <p className="lw-note lw-note-error">글감을 못 읽었습니다 — {error}</p>}
            {!error && !data && <p className="lw-note">불러오는 중…</p>}

            {data && (
                <div className="lw-picks-topics" role="tablist" aria-label="분야">
                    {fields.map((name) => (
                        <button
                            key={name}
                            type="button"
                            role="tab"
                            aria-selected={field === name}
                            className={`lw-picks-topic-btn${field === name ? ' is-active' : ''}`}
                            onClick={() => setField(name)}
                        >
                            {name}
                            <b>{name === '전체' ? all.length : all.filter((b) => b.field === name).length}</b>
                        </button>
                    ))}
                </div>
            )}

            {groups.map(({ timing, items }) => (
                <div key={timing} className="lw-briefs-group">
                    <div className="lw-briefs-group-head">
                        <strong className={`lw-briefs-timing is-${timing.toLowerCase()}`}>{TIMING_LABEL[timing].name}</strong>
                        <span>{TIMING_LABEL[timing].desc} · {items.length}건</span>
                    </div>
                    {items.map((b) => (
                        <article key={`${b.field}-${b.title}`} className="lw-briefs-card">
                            <header className="lw-briefs-card-head">
                                <h3>{b.star && <span className="lw-briefs-star" title="적합성 높음 + 실측 뒷받침">★</span>}{b.title}</h3>
                                <div className="lw-briefs-chips">
                                    <span className="lw-picks-chip lw-briefs-field">{b.field}</span>
                                    {b.types.map((t) => <span key={t} className="lw-picks-chip lw-briefs-type">{t}</span>)}
                                    <span className={`lw-picks-chip lw-briefs-fit is-${b.serpFit}`}>SERP 적합성 {b.serpFit}{b.serpFacing != null ? ` · 정면 ${b.serpFacing}` : ''}{b.serpVacancy != null ? ` · 빈자리 ${b.serpVacancy}위` : ''}</span>
                                </div>
                            </header>
                            <dl className="lw-briefs-dl">
                                <dt>Primary Intent</dt><dd>{b.primaryIntent}</dd>
                                <dt>작성가치</dt><dd>{b.value}</dd>
                                <dt>경험활용</dt><dd>{b.experience}</dd>
                                <dt>차별화</dt><dd>{b.differentiation}</dd>
                            </dl>
                            <footer className="lw-briefs-foot">
                                <span>
                                    핵심 검색어 <a href={naverSearchUrl(b.coreKeyword)} target="_blank" rel="noreferrer">{b.coreKeyword}</a>
                                    {' · '}월 검색량 {b.searchVolume != null ? num(b.searchVolume) : b.searchVolumeUnder10 ? '10 미만' : '미측정'}
                                </span>
                                <span className="lw-briefs-facts">
                                    근거 {b.facts.slice(0, 2).map((f) => (
                                        <a key={f.id} href={f.link} target="_blank" rel="noreferrer" title={f.title}>{f.press || '기사'} {day(f.publishedAt)}</a>
                                    ))}
                                </span>
                                {onAnalyze && (
                                    <button type="button" className="lw-picks-btn" onClick={() => onAnalyze(b.coreKeyword)}>분석</button>
                                )}
                            </footer>
                        </article>
                    ))}
                </div>
            ))}

            {data && !unlocked && filtered.length > FREE_BRIEFS && (
                <LicenseGate
                    onUnlock={() => setUnlocked(true)}
                    remaining={filtered.length - FREE_BRIEFS}
                    freeRows={FREE_BRIEFS}
                    boardLabel="오늘의 글감"
                />
            )}
        </section>
    );
}
