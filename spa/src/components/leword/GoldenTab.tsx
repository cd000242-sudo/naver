import { useEffect, useMemo, useState } from 'react';
import PreemptionPlan from './PreemptionPlan';
import { naverSearchUrl, rowMatchesWriteLane } from './preemptionMeta';

import { TopicFilter, WriteLaneFilter } from './BoardFilters';
import DemandChartModal, { pickChartSeries } from './DemandChartModal';
import PreemptionCard, { type PreemptionRow } from './PreemptionCard';
import { useMindmap } from './useMindmap';

import LicenseGate, { FREE_BOARD_ROWS, isUnlocked } from './LicenseGate';
import { TabIntro } from './LewordShared';
import ExternalTrafficBoard, { type ReferenceRow } from './ExternalTrafficBoard';
import { preemptionIndex, TIER_ORDER } from '../../lib/preemptionIndex';

/**
 * 네이버 데이터랩 검색어 트렌드. 우리가 그리는 그림이 아니라 네이버가 그린 것을 연다.
 * 데이터랩은 검색어를 해시(#) 뒤에 싣는다 — 쿼리스트링으로 넣으면 빈 화면이 뜬다.
 */
const dataLabUrl = (keyword: string) =>
    `https://datalab.naver.com/keyword/trendSearch.naver?hashKey=${encodeURIComponent(keyword)}`;

/**
 * 선점 황금키워드.
 *
 * 그냥 황금키워드(검색량↑ 문서수↓)가 아니다. 그건 실시간 검색어나 남의 툴과
 * 겹쳐서 값이 없다. 여기 올라오는 것은 배치가 **실제 검색결과를 열어 보고**
 * 네 조건을 전부 만족시킨 것만이다:
 *   정면으로 다룬 글 0건 · 상위 문서가 낡음 · 최근에 처음 관측 · 실시간에 아직 없음
 *
 * 사용자가 어느 주제로 블로그를 하는지 모르므로 32종을 전부 훑어 놓고 고르게 한다.
 * 카테고리를 하나씩 골라 검색하는 수고는 배치가 대신 한 것이다.
 *
 * 화면에 나가는 것은 전부 실측 사실이다. 점수·확률·예상 유입은 만들지 않는다.
 */

type Board = {
    publishedAt?: string;
    topicsTotal?: number;
    /** 무료로 여는 5건 — 발행본이 하루 동안 고정한다(새로고침으로 못 바꾼다). */
    freeSample?: { day: string; keywords: string[] };
    topicsWithRows?: number;
    verified?: number;
    rows: PreemptionRow[];
    /** 2군 — 네이버 자리는 늦었지만 외부 유입으로 쓸 밭. */
    reference?: ReferenceRow[];
};

const BOARD_URL = '/data/preemption-board.json';
function GoldenTab({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
    const [board, setBoard] = useState<Board | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
    const [topic, setTopic] = useState('전체');
    /** 어느 판에 쓸 글인가. 배치 순서 실측으로 가른다. */
    const [writeLane, setWriteLane] = useState('all');
    // 라이선스 코드 또는 자기 API 키. 둘 중 하나면 전부 열린다.
    const [unlocked, setUnlocked] = useState(() => isUnlocked());
    /** 실행 계획을 펼친 카드. 한 번에 하나만 연다 — 다 펼치면 목록이 안 읽힌다. */
    const [openPlan, setOpenPlan] = useState('');
    /*
     * '전체' 탭 주제 로테이션 시드 — 방문마다 주제 순서가 바뀐다(사장님 지시
     * 2026-08-19: "계속 마키나락스만 먼저 나오니 특별함이 없다. 섞어서, 계속
     * 바뀌면서 '이런 키워드도 있었어?!' 느낌으로"). 난수는 **섞기에만** 쓴다 —
     * 등급·점수 계산에 쓰는 것은 이 앱에서 금지다. 주제 안 순서는 등급순 유지.
     */
    const [shuffleSeed] = useState(() => Math.random());
    /*
     * 점진 렌더 — 보드가 누적형(목표 2,000행)이 되면서 전량 렌더는 폰에서 못 버틴다.
     * 처음 60행만 그리고 "더 보기"로 늘린다. 필터가 바뀌면 처음으로 돌아간다.
     */
    const [visibleCount, setVisibleCount] = useState(60);
    /** 방금 복사한 키워드. 눌렀는지 안 눌렀는지 모르면 두 번 누르게 된다. */
    const [copied, setCopied] = useState('');
    /** 크게 보는 수요 그래프의 대상 키워드. 한 번에 하나만 연다. */
    const [chartKeyword, setChartKeyword] = useState('');
    const { mindmap, openMindmap } = useMindmap();

    /*
     * 그래프 — 앱의 30일 트렌드와 같은 실측을 웹에 그린다. 앱이 꺼져 있으면
     * 데이터랩 새 창으로 폴백한다 — 링크는 항상 살아 있는 최후의 수단이다.
     */
    // '그래프보기' 버튼·상태는 제거(2026-08-19) — 30일 실측이 카드 상단에 자동으로 그려진다.

    useEffect(() => {
        let alive = true;
        let lastEnrichedAt = '';
        const load = () => {
            fetch(BOARD_URL, { cache: 'no-store' })
                .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no board'))))
                .then((data) => {
                    if (!alive) return;
                    // 같은 판이면 화면을 안 건드린다 — 스크롤·펼친 카드가 튀지 않게.
                    const stamp = String(data?.enrichedAt || data?.publishedAt || '');
                    if (stamp && stamp === lastEnrichedAt) return;
                    lastEnrichedAt = stamp;
                    const rows: PreemptionRow[] = Array.isArray(data?.rows) ? data.rows : [];
                    setBoard({ ...data, rows, reference: Array.isArray(data?.reference) ? data.reference : [] });
                    setStatus(rows.length > 0 ? 'ready' : 'empty');
                })
                .catch(() => { if (alive && !lastEnrichedAt) setStatus('error'); });
        };
        load();
        /*
         * 데이터 자동 갱신(2026-08-18). 번들 감시(versionWatch)는 코드 배포만
         * 잡는다 — 회차·재보강은 데이터만 바뀌므로 열려 있던 탭이 옛 보드를
         * 계속 보여줬다("사이트 그대론데?" — 사장님 실측). 탭에 돌아온 순간과
         * 10분 주기로 다시 불러온다.
         */
        const interval = window.setInterval(load, 10 * 60_000);
        const onVisible = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            alive = false;
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    /** 실제로 행이 있는 주제만 칩으로 낸다. 빈 칩을 누르게 하면 안 된다. */
    const topics = useMemo(() => {
        const counts = new Map<string, number>();
        for (const row of board?.rows || []) counts.set(row.topic, (counts.get(row.topic) || 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [board]);

    const rows = useMemo(() => {
        const all = board?.rows || [];
        const filtered = all.filter((row) => {
            // 레인 판정은 rowMatchesWriteLane 단일 출처 — 애드센스만 실측 의도, 나머지는 배치 순서.
            if (!rowMatchesWriteLane(row, writeLane)) return false;
            if (topic !== '전체' && row.topic !== topic) return false;
            return true;
        });
        /*
         * 줄 세우기 — **황금키워드끼리 모아 놓고, 그 안에서 광고 많은 순.**
         *
         * 사장님 기준(여러 번 확인):
         *   "검색량이 높고 문서수가 낮아야 황금키워드다."
         *   "황금키워드면서 광고가 많은 게 제일 베스트다."
         *
         * 그래서 두 단계다. ① 황금 등급(검색량 ÷ 문서수)으로 묶고 ② 같은 등급 안에서
         * 광고 많은 순. 광고를 1순위로 두면 밭이 꽉 찬 키워드가 맨 위로 온다 —
         * 실측: '증명사진 규격 변환' 은 광고 7건인데 검색 2,440에 문서 3,801이었다.
         * 반대로 광고를 안 쓰면 "돈 되는 자리" 라는 신호가 통째로 죽는다.
         *
         * 등급 판정은 preemptionIndex 가 단일 출처다 — 화면이 따로 계산하면
         * 배지와 순서가 어긋난다.
         */
        const sorted = [...filtered].sort((a, b) => {
            const rank = (row: PreemptionRow) => TIER_ORDER[preemptionIndex({
                searchVolume: row.searchVolume, documentCount: row.documentCount,
            }).tier];
            if (rank(a) !== rank(b)) return rank(a) - rank(b);
            /*
             * **오르는 중인 것을 위로**(사장님 지시 2026-08-29: "우상향이 예상되는
             * 키워드가 특히 상위로 와야 된다").
             *
             * 예상이 아니라 **실측 시계열의 기울기**다 — 데이터랩 12개월 수요에서
             * 최근 3개월 평균이 그 앞 3개월 평균보다 큰가. 앞으로 오를 것이라고
             * 말하지 않는다(그건 추정이고 화면에 낼 수 없다). 지금까지 올라왔다는
             * 사실만 쓰고, 그 사실로 순서를 정한다.
             *
             * 못 쟀으면(시계열 없음) 이 축을 건너뛴다 — 안 본 것을 '안 오른다'로
             * 벌주지 않는다. 등급 다음에 두어 층 자체는 뒤집지 않는다.
             */
            const slope = (row: PreemptionRow) => {
                /* demandSeries 는 {period, ratio} 객체 배열이다 — ratio 만 꺼내 쓴다. */
                const series = (Array.isArray(row.demandSeries) ? row.demandSeries : [])
                    .map((point) => Number(point?.ratio))
                    .filter((n) => Number.isFinite(n));
                if (series.length < 6) return null;
                const avg = (list: number[]) => list.reduce((sum, n) => sum + n, 0) / list.length;
                const recent = avg(series.slice(-3));
                const before = avg(series.slice(-6, -3));
                if (!(before > 0)) return null;
                return recent / before;
            };
            const sa = slope(a);
            const sb = slope(b);
            if (sa !== null && sb !== null && Math.abs(sa - sb) > 0.05) return sb - sa;
            // 못 쟀으면 광고 축은 건너뛴다 — 안 본 것을 '광고 없음'으로 벌주지 않는다.
            const ads = (row: PreemptionRow) => (typeof row.serp?.adCount === 'number' ? row.serp.adCount : null);
            if (ads(a) !== null && ads(b) !== null && ads(a) !== ads(b)) return (ads(b) as number) - (ads(a) as number);
            const worth = (row: PreemptionRow) => preemptionIndex({
                searchVolume: row.searchVolume, documentCount: row.documentCount,
            }).worth ?? -1;
            if (worth(a) !== worth(b)) return worth(b) - worth(a);
            return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
        });

        /*
         * '전체' 탭(검색 없음)은 주제 로테이션 인터리브 — 결정론 정렬이라 매번
         * 같은 키워드가 1등이면 "특별함이 없다"(사장님). 각 주제의 1등들이 먼저
         * 섞여 나오고, 주제 순서는 방문마다 바뀐다. 주제 안은 위의 등급순 그대로라
         * 품질 순서는 안 무너진다. 주제 필터를 걸면 원래 정렬로 돌아간다.
         */
        /*
         * 비로그인이면 **무료로 여는 다섯 건을 맨 앞으로 끌어올린다.**
         *
         * 왜(사장님 실측 2026-08-23 "무료는 5개 공개인데 다 가려놨네"): 무료 다섯
         * 건은 발행본 순서 1~5번 '이름'으로 고정돼 있는데, 화면 순서는 바로 아래
         * 인터리브가 방문마다 섞는다. 두 로직이 서로를 몰라서, 열려 있는 다섯 장이
         * 60장 어딘가로 흩어졌다 — 위에서부터 보는 사람 눈에는 전부 블러였다.
         *
         * 순번으로 자르지 않고 이름을 그대로 쓰기 때문에, 주제·레인을 돌려 가며
         * 새 키워드를 여는 구멍은 그대로 막혀 있다(아래 locked 판정과 같은 출처).
         */
        const hoistFree = (list: PreemptionRow[]) => {
            if (unlocked) return list;
            const freeNames = board?.freeSample?.keywords;
            if (!freeNames || freeNames.length === 0) return list;
            const open: PreemptionRow[] = [];
            const rest: PreemptionRow[] = [];
            for (const row of list) (freeNames.includes(row.keyword) ? open : rest).push(row);
            return [...open, ...rest];
        };

        if (topic !== '전체') return hoistFree(sorted);
        const byTopicOrder = new Map<string, PreemptionRow[]>();
        for (const row of sorted) {
            const key = row.topic || '?';
            if (!byTopicOrder.has(key)) byTopicOrder.set(key, []);
            byTopicOrder.get(key)!.push(row);
        }
        const topicKeys = [...byTopicOrder.keys()];
        // 시드 기반 셔플(Fisher–Yates) — 렌더 안에서는 안정, 방문마다 달라진다.
        let seedState = Math.floor(shuffleSeed * 2 ** 31);
        const nextRandom = () => {
            seedState = (seedState * 1103515245 + 12345) % 2 ** 31;
            return seedState / 2 ** 31;
        };
        for (let i = topicKeys.length - 1; i > 0; i--) {
            const j = Math.floor(nextRandom() * (i + 1));
            [topicKeys[i], topicKeys[j]] = [topicKeys[j], topicKeys[i]];
        }
        const interleaved: PreemptionRow[] = [];
        let depth = 0;
        let added = true;
        while (added) {
            added = false;
            for (const key of topicKeys) {
                const bucket = byTopicOrder.get(key)!;
                if (depth < bucket.length) {
                    interleaved.push(bucket[depth]);
                    added = true;
                }
            }
            depth += 1;
        }
        return hoistFree(interleaved);
    }, [board, topic, writeLane, shuffleSeed, unlocked]);

    /** 계획 창에 띄울 행. 목록 밖에 한 개만 둔다 — 카드마다 창을 만들 이유가 없다. */
    const planRow = useMemo(() => rows.find((row) => row.keyword === openPlan) || null, [rows, openPlan]);

    useEffect(() => {
        setVisibleCount(60);
    }, [topic, writeLane]);

    // '지식인 황금질문'은 좌측 메뉴 독립 탭(KinGoldenTab)으로 옮겨졌다(2026-08-20 정정).
    const publishedLabel = board?.publishedAt
        ? new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            .format(new Date(board.publishedAt))
        : '';

    return (
        <>
            <TabIntro
                title="리더남 전용 황금키워드"
                desc="검색결과를 직접 열어 보고 '지금 들어갈 자리가 있는' 것만 남겼습니다. 상위 자리가 비어 있는 것이 맨 앞이고, 그 아래로 자리가 확실한 순서입니다. 블로그 주제 32종을 한 번에 훑었으니 카테고리를 하나씩 뒤질 필요가 없습니다."
                /* 어떤 도구로 재는지는 밝히지 않는다(사장님 2026-08-20) — 잰 사실만 적는다. */
                source={`검색결과 직접 확인${publishedLabel ? ` · ${publishedLabel} 발행` : ''}${board?.verified ? ` · ${board.verified}건 검증` : ''}`}
            />

            {status === 'loading' && <div className="lw-note">발굴 결과를 불러오는 중입니다…</div>}

            {status === 'error' && (
                <div className="lw-note lw-note-error">
                    <strong>선점 보드가 아직 발행되지 않았습니다</strong>
                    <p>배치가 한 번 돌면 여기에 채워집니다. 잠시 후 다시 확인해 주세요.</p>
                </div>
            )}

            {status === 'empty' && (
                <div className="lw-note lw-note-limit">
                    <strong>이번 회차에 통과한 키워드가 없습니다</strong>
                    <p>
                        조건을 전부 만족한 것만 올리기 때문에 빈 회차가 나올 수 있습니다.
                        억지로 채우지 않는 것이 이 보드의 규칙입니다.
                    </p>
                </div>
            )}

            {status === 'ready' && board && (
                <>
                    {/*
                      * 검색창을 뺐다(사장님 2026-08-20): "어떤 키워드인 줄 알고
                      * 찾는다고 필드를 구현해 놓은 거야." 맞다 — 여기는 모르는
                      * 키워드를 발견하러 오는 곳이지 아는 것을 찾으러 오는 곳이 아니다.
                      * 주제·레인 고르개가 추리는 일을 한다.
                      */}
                    <div className="lw-toolbar">
                        <span className="lw-count">
                            {rows.length}개 · 주제 {board.topicsWithRows ?? topics.length}/{board.topicsTotal ?? 32}종
                        </span>
                    </div>

                    <WriteLaneFilter
                        value={writeLane}
                        onChange={setWriteLane}
                        counts={{
                            total: board.rows.length,
                            laneCount: (laneId) => board.rows.filter((row) => rowMatchesWriteLane(row, laneId)).length,
                        }}
                    />

                    <TopicFilter value={topic} onChange={setTopic} topics={topics} total={board.rows.length} />

                    {!unlocked && rows.length > FREE_BOARD_ROWS && (
                        <LicenseGate
                            onUnlock={() => setUnlocked(true)}
                            remaining={rows.length - FREE_BOARD_ROWS}
                        />
                    )}

                    <div className="lw-board-list">
                        {rows.slice(0, visibleCount).map((row, index) => {
                            /*
                             * 잠금 판정은 순번이 아니라 **이름**으로 한다.
                             * 순번으로 자르면 주제·레인 고르개를 바꿀 때마다 5건이
                             * 갈려서, 무료 사용자가 필터만 돌려 가며 보드를 다 볼 수 있다
                             * (사장님 지적 2026-08-20 "새로고침하면 새 키워드"와 같은 구멍).
                             * 발행본이 하루 동안 고정한 다섯 이름만 열린다.
                             */
                            const freeNames = board.freeSample?.keywords;
                            const locked = unlocked
                                ? false
                                : (freeNames && freeNames.length > 0
                                    ? !freeNames.includes(row.keyword)
                                    : index >= FREE_BOARD_ROWS);
                            return (
                        <PreemptionCard
                            key={`${row.topic}-${row.keyword}`}
                            row={row}
                            rank={index + 1}
                            locked={locked}
                            copied={copied === row.keyword}
                            onCopy={() => {
                                navigator.clipboard?.writeText(row.keyword);
                                setCopied(row.keyword);
                                window.setTimeout(() => setCopied(''), 1400);
                            }}
                            planOpen={openPlan === row.keyword}
                            onTogglePlan={() => setOpenPlan(openPlan === row.keyword ? '' : row.keyword)}
                            onOpenChart={() => setChartKeyword(row.keyword)}
                            mindmap={mindmap[row.keyword]}
                            onMindmap={() => openMindmap(row)}
                            onAnalyze={onAnalyze}
                        />
                            );
                        })}
                    </div>

                    {rows.length > visibleCount && (
                        <button
                            type="button"
                            className="lw-more-btn"
                            onClick={() => setVisibleCount((count) => count + 60)}
                        >
                            더 보기 — 남은 {(rows.length - visibleCount).toLocaleString('ko-KR')}개
                        </button>
                    )}

                    {rows.length === 0 && <div className="lw-note">이 주제에는 통과한 키워드가 없습니다.</div>}

                    {/*
                      * 2군은 발행 데이터에 계속 있었는데 읽는 화면이 없어 묻혀 있었다.
                      * 매 회차 80건쯤이 그렇게 버려졌다 — 사장님 지적으로 드러났다.
                      * 주제 필터는 여기에도 건다(위에서 고른 주제와 따로 놀면 안 된다).
                      */}
                    <ExternalTrafficBoard
                        rows={(board.reference || []).filter((row) => topic === '전체' || row.topic === topic)}
                        onAnalyze={onAnalyze}
                        searchUrl={naverSearchUrl}
                        locked={!unlocked}
                    />

                    {(() => {
                        const chartRow = rows.find((row) => row.keyword === chartKeyword);
                        const chart = chartRow ? pickChartSeries(chartRow) : null;
                        return chartRow && chart ? (
                            <DemandChartModal
                                keyword={chartRow.keyword}
                                ranges={chart.ranges}
                                asOf={chartRow.demandAsOf}
                                onClose={() => setChartKeyword('')}
                            />
                        ) : null;
                    })()}

                    {planRow && (
                        <PreemptionPlan
                            row={planRow}
                            onClose={() => setOpenPlan('')}
                            onAnalyze={onAnalyze}
                            searchUrl={naverSearchUrl(planRow.keyword)}
                        />
                    )}
                </>
            )}
        </>
    );
}

export default GoldenTab;
