import { useEffect, useMemo, useState } from 'react';
import LicenseGate, { isUnlocked } from './LicenseGate';
import { naverSearchUrl } from './preemptionMeta';
import { TabIntro } from './LewordShared';

/**
 * 오늘의 네이버 추천키워드 — 사이드 메뉴에서 실검 틈새키워드와 키워드 분석 **사이의 서브탭**
 * (사장님 2026-09-08. 처음엔 실검 틈새 탭 안 아래쪽에 넣었다가 "서브탭을 만들라고 했다"로 바로잡음).
 *
 * 황금키워드보드·실검 틈새와 같은 방식이다: leword-app CI(today-picks.yml, 매일 06:30 KST)가
 * 씨앗 창고에서 주제별 후보를 뽑아 블로그 문서수를 오픈 API로 실측하고 황금비(검색량 ÷ 문서수)
 * 순 10개씩 정적 JSON 으로 발행한다. 여기서는 읽기만 한다 — 방문자마다 돌리지 않는다.
 *
 * 수치는 전부 실측이다(검색광고 검색량 · 오픈 API 문서수 · 노출 광고 수). 황금비는 그 둘의
 * 나눗셈일 뿐이다. **자리(SERP)는 안 쟀다** — 그건 선점 회차가 잰다. 그래서 이 표는 "황금
 * 키워드" 가 아니라 "오늘 볼 만한 후보" 로 적고, 파일이 담아 온 한계 문장을 그대로 보여 준다.
 *
 * 무료 건수는 실검 틈새와 같은 3건(주제당)이다 — 옆 판이 3건인데 이 판이 전부 열려 있으면
 * 옆 판이 무의미해진다.
 */

interface PickRow {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    ratio: number;
    depth: number | null;
    comp: string | null;
    source: string | null;
}

interface PickTopic {
    topic: string;
    candidates: number;
    measured: number;
    rows: PickRow[];
}

interface TodayPicks {
    builtAt: string;
    warehouseBuiltAt: string | null;
    perTopic: number;
    keep: number;
    method: Record<string, string>;
    topics: PickTopic[];
}

const FREE_PICK_ROWS = 3;

const num = (value: number) => value.toLocaleString('ko-KR');
const ratioText = (ratio: number) => (ratio >= 100 ? Math.round(ratio).toLocaleString('ko-KR') : ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2));
const SOURCE_LABEL: Record<string, string> = { hint: '힌트', biztp: '업종', month: '월', event: '시즌' };
const kst = (iso: string) => new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function TodayPicksBoard({ onAnalyze }: { onAnalyze?: (keyword: string) => void }) {
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

    const topics = useMemo(() => (data?.topics ?? []).filter((topic) => topic.rows.length > 0), [data]);
    const total = topics.reduce((sum, topic) => sum + topic.rows.length, 0);
    const shown = unlocked ? total : topics.reduce((sum, topic) => sum + Math.min(topic.rows.length, FREE_PICK_ROWS), 0);
    const golden = topics.reduce((sum, topic) => sum + topic.rows.filter((row) => row.ratio >= 1).length, 0);

    return (
        <section className="lw-picks lw-picks-tab" aria-labelledby="lw-picks-title">
            <h2 id="lw-picks-title" hidden>오늘의 네이버 추천키워드</h2>
            <TabIntro
                title="오늘의 네이버 추천키워드"
                desc={`주제별 ${data?.keep ?? 10}개 · 검색량 ÷ 문서수 순 · 네이버 블로그 홈판·SEO 전용${data ? ` · ${kst(data.builtAt)} 실측 · ${num(total)}건 중 황금 비율 ${num(golden)}건` : ''}`}
                source="씨앗 창고 → 블로그 문서수 실측(오픈 API) → 황금비 · 매일 06:30 KST 갱신 · 자리(SERP)는 안 잼"
            />

            {error && <p className="lw-note lw-note-error">추천키워드를 못 읽었습니다 — {error}</p>}
            {!error && !data && <p className="lw-note">불러오는 중…</p>}
            {data && (
                <p className="lw-note">
                    {data.method.serp}. 검색량은 검색광고 실측, 문서수는 오픈 API 실측이고 광고는 월 평균 노출
                    검색광고 수다(0 이면 광고주가 없는 말). 공백 없는 표기는 검색광고 원문 그대로다.
                </p>
            )}

            <div className="lw-picks-grid">
                {topics.map((topic) => {
                    const rows = unlocked ? topic.rows : topic.rows.slice(0, FREE_PICK_ROWS);
                    const top = topic.rows[0];
                    return (
                        <details key={topic.topic} className="lw-picks-topic" open>
                            <summary>
                                <span className="lw-picks-topic-name">{topic.topic}</span>
                                <b>{topic.rows.length}</b>
                                {top && (
                                    <span className="lw-picks-tease">
                                        {top.keyword} · {ratioText(top.ratio)}배
                                    </span>
                                )}
                            </summary>
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
                                                    {row.ratio >= 1 && <span className="lw-picks-chip">황금 비율</span>}
                                                </td>
                                                <td className="n">{num(row.searchVolume)}</td>
                                                <td className="n">{num(row.documentCount)}</td>
                                                <td className={`n${row.ratio >= 1 ? ' lw-picks-gold' : ''}`}>{ratioText(row.ratio)}</td>
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
                                {!unlocked && topic.rows.length > FREE_PICK_ROWS && (
                                    <p className="lw-picks-more">{topic.rows.length - FREE_PICK_ROWS}건 더 — 로그인하면 보입니다</p>
                                )}
                            </div>
                        </details>
                    );
                })}
            </div>

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
