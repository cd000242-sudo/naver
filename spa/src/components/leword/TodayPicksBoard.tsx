import { useEffect, useMemo, useState } from 'react';
import LicenseGate, { isUnlocked } from './LicenseGate';
import { naverSearchUrl } from './preemptionMeta';
import { TabIntro } from './LewordShared';

/**
 * 오늘의 네이버 추천키워드 — 사이드 메뉴에서 실검 틈새키워드와 키워드 분석 **사이의 서브탭**,
 * 그 안에서 **주제별 서브-서브 탭**(주제 칩을 눌러 한 주제씩 본다). 사장님 2026-09-08.
 *
 * 데이터는 leword-app CI(today-picks.yml, 매일 06:30 KST)가 씨앗 창고에서 주제별 후보를 넓게 뽑아
 * 블로그 문서수를 오픈 API로 실측하고 **황금비(검색량 ÷ 문서수) 1 이상만** 10개씩 정적 JSON 으로
 * 발행한 것이다. 예외는 "트래픽 몰릴 예정"(이번 달·다음 달 피크 계절 씨앗)뿐 — '시즌 앞' 칩이 붙는다.
 * 여기서는 읽기만 한다. 수치는 전부 실측이고 황금비는 그 나눗셈이다. 자리(SERP)는 안 쟀다.
 *
 * 무료 건수는 실검 틈새와 같은 3건(주제당)이다.
 */

interface PickRow {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    ratio: number;
    depth: number | null;
    comp: string | null;
    source: string | null;
    /** 계절 씨앗 예외 — 이번 달·다음 달 피크라 황금비가 1 미만이어도 실린 행 */
    seasonPeakMonth?: number;
}

interface PickTopic {
    topic: string;
    candidates: number;
    measured: number;
    golden?: number;
    rows: PickRow[];
}

interface TodayPicks {
    builtAt: string;
    warehouseBuiltAt: string | null;
    perTopic: number;
    keep: number;
    minRatio?: number;
    topics: PickTopic[];
}

const FREE_PICK_ROWS = 3;

const num = (value: number) => value.toLocaleString('ko-KR');
const ratioText = (ratio: number) => (ratio >= 100 ? Math.round(ratio).toLocaleString('ko-KR') : ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2));
const SOURCE_LABEL: Record<string, string> = { hint: '힌트', biztp: '업종', month: '월', event: '시즌', section: '블로그섹션' };
const kst = (iso: string) => new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export interface PicksTopicMeta { topic: string; golden: number }

export default function TodayPicksBoard({ onAnalyze, topic, onTopics, onTopicChange }: {
    onAnalyze?: (keyword: string) => void;
    /** 사이드 메뉴 하위 항목이 고른 주제 — 없으면 첫 주제 */
    topic?: string | null;
    /** 읽어 온 주제 목록(황금 수 포함)을 사이드 메뉴로 올려보낸다 */
    onTopics?: (topics: PicksTopicMeta[]) => void;
    /** 모바일에는 사이드 메뉴 하위 항목이 없다(햄버거 메뉴는 탭만) — 표 위 주제 칩이 이걸로 고른다(사장님 2026-09-09). */
    onTopicChange?: (topic: string) => void;
}) {
    const [data, setData] = useState<TodayPicks | null>(null);
    const [error, setError] = useState('');
    const [unlocked, setUnlocked] = useState(() => isUnlocked());

    useEffect(() => {
        let alive = true;
        fetch('/data/today-picks.json', { cache: 'no-cache' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then((json) => { if (alive) setData(json as TodayPicks); })
            .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
        return () => { alive = false; };
    }, []);

    const minRatio = data?.minRatio ?? 1;
    const topics = useMemo(() => (data?.topics ?? []).filter((topic) => topic.rows.length > 0), [data]);
    const goldenOf = (topic: PickTopic) => topic.golden ?? topic.rows.filter((row) => row.ratio >= minRatio).length;
    const total = topics.reduce((sum, topic) => sum + topic.rows.length, 0);
    const golden = topics.reduce((sum, topic) => sum + goldenOf(topic), 0);
    const active = topics.find((item) => item.topic === topic) ?? topics[0] ?? null;
    const rows = active ? (unlocked ? active.rows : active.rows.slice(0, FREE_PICK_ROWS)) : [];
    const shown = unlocked ? total : topics.reduce((sum, topic) => sum + Math.min(topic.rows.length, FREE_PICK_ROWS), 0);

    useEffect(() => {
        if (onTopics && topics.length > 0) onTopics(topics.map((item) => ({ topic: item.topic, golden: goldenOf(item) })));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topics]);

    return (
        <section className="lw-picks lw-picks-tab" aria-labelledby="lw-picks-title">
            <h2 id="lw-picks-title" hidden>오늘의 네이버 추천키워드</h2>
            <TabIntro
                title="오늘의 네이버 추천키워드"
                desc={`주제별 황금 비율(검색량 ÷ 문서수 ${minRatio} 이상) 키워드 · 네이버 블로그 홈판·SEO 전용${data ? ` · ${kst(data.builtAt)} 실측 · 황금 ${num(golden)}건` : ''}`}
                source="검색광고 검색량 실측 · 블로그 문서수 실측 · 매일 06:30 KST 갱신"
            />

            {error && <p className="lw-note lw-note-error">추천키워드를 못 읽었습니다 — {error}</p>}
            {!error && !data && <p className="lw-note">불러오는 중…</p>}

            {/* 모바일 전용 주제 칩 — PC 에서는 사이드 메뉴 하위 항목이 같은 역할이라 CSS 로 숨긴다. */}
            {onTopicChange && topics.length > 0 && (
                <div className="lw-picks-topics lw-picks-topics-mobile" role="tablist" aria-label="주제">
                    {topics.map((item) => (
                        <button
                            key={item.topic}
                            type="button"
                            role="tab"
                            aria-selected={active?.topic === item.topic}
                            className={`lw-picks-topic-btn${active?.topic === item.topic ? ' is-active' : ''}`}
                            onClick={() => onTopicChange(item.topic)}
                        >
                            {item.topic}<b>{goldenOf(item)}</b>
                        </button>
                    ))}
                </div>
            )}

            {active && (
                <div className="lw-picks-panel" role="tabpanel" aria-label={active.topic}>
                    <div className="lw-picks-panel-head">
                        <strong>{active.topic}</strong>
                        <span>황금 {goldenOf(active)}건{active.rows.length > goldenOf(active) ? ` · 시즌 앞 ${active.rows.length - goldenOf(active)}건` : ''}</span>
                    </div>
                    <div className="lw-picks-scroll">
                        <table className="lw-picks-table">
                            <thead>
                                <tr>
                                    <th>키워드</th>
                                    <th className="n">월 검색량</th>
                                    <th className="n">블로그 문서수</th>
                                    <th className="n">황금비</th>
                                    <th className="n">광고</th>
                                    <th>출처</th>
                                    {onAnalyze && <th aria-label="분석" />}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.keyword}>
                                        <td>
                                            <a href={naverSearchUrl(row.keyword)} target="_blank" rel="noreferrer">{row.keyword}</a>
                                            {row.ratio >= minRatio && <span className="lw-picks-chip">황금 비율</span>}
                                            {row.seasonPeakMonth && <span className="lw-picks-chip lw-picks-season">{row.seasonPeakMonth}월 시즌 앞</span>}
                                        </td>
                                        <td className="n">{num(row.searchVolume)}</td>
                                        <td className="n">{num(row.documentCount)}</td>
                                        <td className={`n${row.ratio >= minRatio ? ' lw-picks-gold' : ''}`}>{ratioText(row.ratio)}</td>
                                        <td className="n">{row.depth == null ? '—' : num(row.depth)}</td>
                                        <td className="lw-picks-src">{row.source ? (SOURCE_LABEL[row.source] ?? row.source) : '—'}</td>
                                        {onAnalyze && (
                                            <td>
                                                <button type="button" className="lw-picks-btn" onClick={() => onAnalyze(row.keyword)}>
                                                    분석
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!unlocked && active.rows.length > FREE_PICK_ROWS && (
                            <p className="lw-picks-more">{active.rows.length - FREE_PICK_ROWS}건 더 — 로그인하면 보입니다</p>
                        )}
                    </div>
                </div>
            )}

            {data && !unlocked && total > shown && (
                <LicenseGate
                    onUnlock={() => setUnlocked(true)}
                    remaining={total - shown}
                    freeRows={FREE_PICK_ROWS}
                    boardLabel="오늘의 네이버 추천키워드"
                />
            )}
        </section>
    );
}
