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
    /** 핵심 검색어가 낮음/보통일 때 자리를 재 본 좁은 검색어 — null = 재 봤는데 없음, 없음(undefined) = 안 잼 */
    alternative?: { keyword: string; searchVolume: number | null; serpFacing: number | null; serpVacancy: number | null; serpFit: '높음' | '보통' | '낮음' | '미측정' } | null;
}

type RoundSlot = '아침' | '오후' | '저녁';

interface BriefRound {
    slot: RoundSlot;
    builtAt: string;
    counts: { briefs: number; now: number; next: number; always: number; star: number };
    briefs: Brief[];
}

interface TopicBriefs {
    builtAt: string;
    slot?: RoundSlot;
    /** 오늘의 회차들(아침 07:00 · 오후 13:00 · 저녁 19:00 KST) — 사장님 2026-09-09 "오전 오후 저녁 나눠서" */
    rounds?: BriefRound[];
    counts: { briefs: number; now: number; next: number; always: number; star: number };
    briefs: Brief[];
}

// 크론이 정각을 피해 06:23·12:23·18:23 KST 로 돈다(정각은 GitHub 가 미룸). 표기도 그 시각.
const SLOT_TIME: Record<RoundSlot, string> = { 아침: '06:23', 오후: '12:23', 저녁: '18:23' };

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
    const [slot, setSlot] = useState<RoundSlot | null>(null);

    useEffect(() => {
        let alive = true;
        fetch('/data/topic-briefs.json', { cache: 'no-cache' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then((json) => { if (alive) setData(json as TopicBriefs); })
            .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
        return () => { alive = false; };
    }, []);

    // 회차 — rounds 가 없는 옛 파일은 한 회차로 본다. 기본은 가장 최근 회차.
    const rounds: BriefRound[] = useMemo(() => (
        data ? (data.rounds && data.rounds.length > 0 ? data.rounds : [{ slot: data.slot ?? '아침', builtAt: data.builtAt, counts: data.counts, briefs: data.briefs }]) : []
    ), [data]);
    const activeRound = rounds.find((r) => r.slot === slot) ?? rounds[rounds.length - 1] ?? null;
    const all = activeRound?.briefs ?? [];
    const todayTotal = rounds.reduce((sum, r) => sum + r.briefs.length, 0);
    const todayStar = rounds.reduce((sum, r) => sum + r.briefs.filter((b) => b.star).length, 0);
    const fields = useMemo(() => ['전체', ...Array.from(new Set(all.map((b) => b.field)))], [all]);
    const filtered = field === '전체' ? all : all.filter((b) => b.field === field);
    const visible = unlocked ? filtered : filtered.slice(0, FREE_BRIEFS);
    const groups = (['NOW', 'NEXT', 'ALWAYS'] as const).map((timing) => ({ timing, items: visible.filter((b) => b.timing === timing) })).filter((g) => g.items.length > 0);

    return (
        <section className="lw-picks lw-picks-tab lw-briefs" aria-labelledby="lw-briefs-title">
            <h2 id="lw-briefs-title" hidden>오늘의 글감</h2>
            <TabIntro
                title="오늘의 글감"
                desc={`날짜가 박힌 공식 사실에서 뽑은 글감 — NOW(지금) · NEXT(예정) · ALWAYS(지속)${data ? ` · 오늘 ${rounds.length}회차 ${num(todayTotal)}건 · ★ ${num(todayStar)}` : ''}`}
                source="네이버 뉴스 API 기사 실측 · 검색광고 검색량 실측 · 정면 글 수 실측(안 쟀으면 미측정) · 아침 06:23 · 오후 12:23 · 저녁 18:23 갱신"
            />

            {error && <p className="lw-note lw-note-error">글감을 못 읽었습니다 — {error}</p>}
            {!error && !data && <p className="lw-note">불러오는 중…</p>}

            {rounds.length > 0 && (
                <div className="lw-briefs-rounds" role="tablist" aria-label="회차">
                    {(['아침', '오후', '저녁'] as const).map((name) => {
                        const round = rounds.find((r) => r.slot === name);
                        const active = activeRound?.slot === name;
                        return (
                            <button
                                key={name}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                disabled={!round}
                                className={`lw-briefs-round${active ? ' is-active' : ''}${round ? '' : ' is-pending'}`}
                                onClick={() => round && setSlot(name)}
                                title={round ? `${kst(round.builtAt)} 실측` : `${SLOT_TIME[name]} 회차 예정`}
                            >
                                <strong>{name}</strong>
                                <span>{round ? `${round.briefs.length}건 · ★ ${round.briefs.filter((b) => b.star).length}` : `${SLOT_TIME[name]} 예정`}</span>
                            </button>
                        );
                    })}
                </div>
            )}

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
                            {(b.serpFit === '낮음' || b.serpFit === '보통') && b.alternative !== undefined && (
                                <p className={`lw-briefs-alt${b.alternative?.serpFit === '높음' ? ' is-open' : ''}`}>
                                    {b.alternative
                                        ? <>
                                            <em>{b.alternative.serpFit === '높음' ? '이 검색어로 쓰면 들어갑니다' : '가장 덜 막힌 대안'}</em>
                                            {' '}<a href={naverSearchUrl(b.alternative.keyword)} target="_blank" rel="noreferrer">{b.alternative.keyword}</a>
                                            {' · '}월 검색량 {b.alternative.searchVolume == null ? '10 미만' : num(b.alternative.searchVolume)}
                                            {' · '}정면 {b.alternative.serpFacing ?? '—'}{b.alternative.serpVacancy != null ? ` · 빈자리 ${b.alternative.serpVacancy}위` : ''}
                                            {' · '}적합성 {b.alternative.serpFit}
                                        </>
                                        : <><em>대안 검색어 없음</em> — 같은 주제의 좁은 검색어를 재 봤지만 열린 자리가 없습니다. 이 글감은 정면 승부가 어렵습니다.</>}
                                </p>
                            )}
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
