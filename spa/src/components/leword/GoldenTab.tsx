import { useEffect, useMemo, useRef, useState } from 'react';
import PreemptionPlan from './PreemptionPlan';
import { naverSearchUrl, rowMatchesWriteLane } from './preemptionMeta';

import { MoneyFilter, TopicFilter, WriteLaneFilter } from './BoardFilters';
import { moneyRank } from './moneyBid';
import DemandChartModal, { pickChartSeries } from './DemandChartModal';
import PreemptionCard, { type PreemptionRow } from './PreemptionCard';
import { useMindmap } from './useMindmap';

import LicenseGate, { FREE_BOARD_ROWS, isUnlocked } from './LicenseGate';
import { repairFreeSample } from '../../lib/freeSample.mjs';
import { TabIntro } from './LewordShared';
import { BoardFreshness } from './BoardFreshness';
import ExternalTrafficBoard, { type ReferenceRow } from './ExternalTrafficBoard';
import { preemptionIndex, TIER_ORDER } from '../../lib/preemptionIndex';
import { goldenMeasurementLabel, matchesGoldenFocus, recentRiseRatio, summarizeGoldenFocus, type GoldenFocus } from '../../lib/goldenFocusModel';
import GoldenWritingRecommendations from './GoldenWritingRecommendations';
import { loadSavedBoard, boardSourceNote } from '../../lib/boardBridge';
import { currentGoldenBriefRows } from '../../lib/goldenCurrentBriefs';
import { defaultGoldenDailyView, goldenDailyCheckedAt, goldenDailyStatus, selectGoldenDailyRows, summarizeGoldenDaily } from '../../lib/goldenDailyModel';
import GoldenTrendCandidates, { type GoldenTrendCandidate } from './GoldenTrendCandidates';

/**
 * 네이버 데이터랩 검색어 트렌드. 우리가 그리는 그림이 아니라 네이버가 그린 것을 연다.
 * 데이터랩은 검색어를 해시(#) 뒤에 싣는다 — 쿼리스트링으로 넣으면 빈 화면이 뜬다.
 */
const dataLabUrl = (keyword: string) =>
    `https://datalab.naver.com/keyword/trendSearch.naver?hashKey=${encodeURIComponent(keyword)}`;

/** Measured opportunities with economic priority and separately verified daily trends. */

type Board = {
    publishedAt?: string;
    topicsTotal?: number;
    /** 무료로 여는 5건 — 발행본이 하루 동안 고정한다(새로고침으로 못 바꾼다). */
    freeSample?: { day: string; keywords: string[] };
    topicsWithRows?: number;
    verified?: number;
    rows: PreemptionRow[];
    trendCandidates?: GoldenTrendCandidate[];
    /** 2군 — 네이버 자리는 늦었지만 외부 유입으로 쓸 밭. */
    reference?: ReferenceRow[];
};

const BOARD_URL = '/data/preemption-board.json';
function GoldenTab({ onAnalyze, onPlan }: { onAnalyze: (keyword: string) => void; onPlan?: (keyword: string) => void }) {
    const [board, setBoard] = useState<Board | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
    const [topic, setTopic] = useState('전체');
    /** 어느 판에 쓸 글인가. 배치 순서 실측으로 가른다. */
    const [writeLane, setWriteLane] = useState('all');
    /** 네이버 광고 3위 입찰가 하한(원). 0 = 거르지 않음. */
    const [moneyMin, setMoneyMin] = useState(0);
    // 라이선스 코드 또는 자기 API 키. 둘 중 하나면 전부 열린다.
    const [unlocked, setUnlocked] = useState(() => isUnlocked());
    /** 실행 계획을 펼친 카드. 한 번에 하나만 연다 — 다 펼치면 목록이 안 읽힌다. */
    const [openPlan, setOpenPlan] = useState('');
    const [focus, setFocus] = useState<GoldenFocus>('all');
    const [now, setNow] = useState(() => Date.now());
    /*
     * '전체' 탭 주제 로테이션 시드 — 방문마다 주제 순서가 바뀐다(사장님 지시
     * 2026-08-19: "계속 마키나락스만 먼저 나오니 특별함이 없다. 섞어서, 계속
     * 바뀌면서 '이런 키워드도 있었어?!' 느낌으로"). 난수는 **섞기에만** 쓴다 —
     * 등급·점수 계산에 쓰는 것은 이 앱에서 금지다. 주제 안 순서는 등급순 유지.
     */
    const [shuffleSeed] = useState(() => Math.random());
    /** 7일 수요 상승 실측(데이터랩 14일, 최근 확인 행만). 못 쟀으면 null — 라벨을 안 단다. */
    const sevenDayRise = (row: PreemptionRow) => recentRiseRatio(row, now);
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
    const [currentBriefs, setCurrentBriefs] = useState<unknown>(null);
    const [currentBriefSource, setCurrentBriefSource] = useState('');
    const [dailyView, setDailyView] = useState<'today' | 'recent' | 'all'>('today');
    const dailySummary = useMemo(() => summarizeGoldenDaily(board?.rows || [], now), [board, now]);
    const dailyRows = useMemo(() => {
        const all = board?.rows || [];
        if (dailyView === 'all') return all;
        const today = selectGoldenDailyRows(all, 'today', now);
        return dailyView === 'today' ? today : [...today, ...selectGoldenDailyRows(all, 'recent', now)];
    }, [board, dailyView, now]);
    /*
     * 처음 열 보기는 보드를 읽은 뒤 한 번만 고른다 — 회차 없는 날 '오늘 확인' 0행으로 판이 빈 것처럼 보이던 것(2026-10-06).
     * 사용자가 버튼을 누른 뒤로는 그 선택을 따른다.
     */
    const viewPicked = useRef(false);
    const changeDailyView = (view: 'today' | 'recent' | 'all') => {
        viewPicked.current = true;
        setDailyView(view); setTopic('전체'); setWriteLane('all'); setMoneyMin(0); setFocus('all');
        setOpenPlan(''); setChartKeyword('');
    };

    /*
     * 그래프 — 앱의 30일 트렌드와 같은 실측을 웹에 그린다. 앱이 꺼져 있으면
     * 데이터랩 새 창으로 폴백한다 — 링크는 항상 살아 있는 최후의 수단이다.
     */
    // '그래프보기' 버튼·상태는 제거(2026-08-19) — 30일 실측이 카드 상단에 자동으로 그려진다.

    useEffect(() => {
        let alive = true;
        let lastEnrichedAt = '';
        const load = () => {
            setNow(Date.now());
            loadSavedBoard('topic-briefs')
                .then(result => { if (alive && result.board) { setCurrentBriefs(result.board); setCurrentBriefSource(boardSourceNote(result)); } })
                .catch(() => { /* Keep the last verified payload; the quality gate checks its age. */ });
            fetch(BOARD_URL, { cache: 'no-store' })
                .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no board'))))
                .then((data) => {
                    if (!alive) return;
                    // 같은 판이면 화면을 안 건드린다 — 스크롤·펼친 카드가 튀지 않게.
                    const stamp = [data?.publishedAt, data?.enrichedAt, data?.revalidatedAt].filter(Boolean).join('|');
                    if (stamp && stamp === lastEnrichedAt) return;
                    lastEnrichedAt = stamp;
                    const rows: PreemptionRow[] = Array.isArray(data?.rows) ? data.rows : [];
                    setBoard({ ...data, rows, reference: Array.isArray(data?.reference) ? data.reference : [] });
                    setStatus(rows.length > 0 || (Array.isArray(data?.trendCandidates) && data.trendCandidates.length > 0) ? 'ready' : 'empty');
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

    // 처음 열 보기 — 보드 읽기 effect 뒤에 둔다(위 viewPicked 주석).
    useEffect(() => {
        if (viewPicked.current || !board?.rows?.length) return;
        viewPicked.current = true;
        setDailyView(defaultGoldenDailyView(dailySummary));
    }, [board, dailySummary]);

    /** 실제로 행이 있는 주제만 칩으로 낸다. 빈 칩을 누르게 하면 안 된다. */
    const topics = useMemo(() => {
        const counts = new Map<string, number>();
        for (const row of dailyRows) counts.set(row.topic, (counts.get(row.topic) || 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [dailyRows]);

    /*
     * 실제로 열어 줄 다섯 이름.
     *
     * 발행본이 하루 동안 박아 둔 이름을 그대로 쓰되, **보드에서 사라진 자리는 메운다**.
     * 실측(2026-09-11): 발행본의 다섯 중 보드에 남은 것이 하나뿐이라 방문자가 카드 한 장만 봤다
     * (사장님 "황금키워드는 1개만 보인다고 문의왔어요"). 발행기도 같은 함수를 쓴다 —
     * 둘이 다른 다섯을 고르면 잠금과 정렬이 어긋난다.
     *
     * 메울 때는 board.rows(발행 순서) 에서만 가져온다. 화면이 주제·레인으로 거른 목록에서
     * 채우면 필터를 돌려 가며 새 키워드를 여는 구멍이 생긴다.
     */
    const freeNames = useMemo(() => {
        // 처음 열리는 '오늘 확인'(없으면 최근 7일) 목록에서 먼저 연다 — 필터 전 전체라 하루 동안 같은 다섯(2026-10-07).
        const all = board?.rows || [];
        const firstSeen = [...selectGoldenDailyRows(all, 'today', now), ...selectGoldenDailyRows(all, 'recent', now)].map((row) => row.keyword);
        return repairFreeSample(board, board?.freeSample?.keywords, firstSeen);
    }, [board, now]);

    const currentRows = useMemo(() => currentGoldenBriefRows(currentBriefs, now), [currentBriefs, now]);
    const focusSummary = useMemo(() => summarizeGoldenFocus(dailyRows, now), [dailyRows, now]);
    const trendCandidates = useMemo(() => (Array.isArray(board?.trendCandidates) ? board.trendCandidates : []).filter((row) =>
        matchesGoldenFocus(row, 'economy', now) && matchesGoldenFocus(row, 'rising', now)
        && matchesGoldenFocus(row, focus, now) && rowMatchesWriteLane(row, writeLane)
        && (topic === '전체' || row.topic === topic)
        && (moneyMin === 0 || (row.money?.value ?? 0) >= moneyMin)), [board, focus, writeLane, topic, moneyMin, now]);
    const focusOptions: Array<{ id: GoldenFocus; label: string; count: number }> = [
        { id: 'all', label: '전체', count: focusSummary.total },
        { id: 'economy', label: '경제·지원금', count: focusSummary.economy },
        { id: 'rising', label: '최근 상승', count: focusSummary.rising },
        { id: 'high-rising', label: '고단가 상승', count: focusSummary.highRising },
    ];

    const rows = useMemo(() => {
        const all = dailyRows;
        const filtered = all.filter((row) => {
            // 레인 판정은 rowMatchesWriteLane 단일 출처 — 애드센스만 실측 의도, 나머지는 배치 순서.
            if (!rowMatchesWriteLane(row, writeLane)) return false;
            if (topic !== '전체' && row.topic !== topic) return false;
            if (moneyMin > 0 && !((row.money?.value ?? 0) >= moneyMin)) return false;
            return matchesGoldenFocus(row, focus, now);
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
            /*
             * 경제 우선 정렬(09-28)은 뺐다 — 사장님 정정(2026-09-29): 경제 비중은 **발굴**에서
             * 늘리는 것이지 화면에서 경제를 맨 앞에 세우는 게 아니다. 경제만 보려면
             * '경제·지원금' 고르개가 있다. 전체 탭은 아래 주제 로테이션으로 돌아간다.
             */
            const rank = (row: PreemptionRow) => TIER_ORDER[preemptionIndex({
                searchVolume: row.searchVolume, documentCount: row.documentCount,
            }).tier];
            if (rank(a) !== rank(b)) return rank(a) - rank(b);
            /*
             * 같은 등급이면 **돈 되는 말을 위로**(사장님 2026-09-24 "지금 이건 황금키워드는 맞는데
             * 메리트가 별로 없어. 돈 될 만한 황금키워드가 절대 아냐").
             *
             * 네이버 광고 3위 입찰가 구간(고단가 → 중단가 → 저단가 → 광고 경쟁 없음) — 발행이 매 회차 잰
             * 실측이다. 구간으로만 가른다: 같은 구간 안에서는 아래 오름세 · 광고 수가 그대로 순서를 정한다.
             * 못 잰 행이 끼면 이 축은 건너뛴다 — 안 본 것을 '돈 안 됨'으로 벌주지 않는다.
             */
            const ma = moneyRank(a.money);
            const mb = moneyRank(b.money);
            if (ma !== null && mb !== null && ma !== mb) return ma - mb;
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
            if (freeNames.length === 0) return list;
            const open: PreemptionRow[] = [];
            const rest: PreemptionRow[] = [];
            for (const row of list) (freeNames.includes(row.keyword) ? open : rest).push(row);
            return [...open, ...rest];
        };

        /*
         * '전체' 탭은 주제 로테이션 인터리브 — 결정론 정렬이라 매번 같은 키워드가
         * 1등이면 "특별함이 없다"(사장님 2026-08-19). 각 주제의 1등들이 먼저 섞여
         * 나오고, 주제 순서는 방문마다 바뀐다. 주제 안은 위의 등급순 그대로라 품질
         * 순서는 안 무너진다. 주제 필터를 걸면 원래 정렬로 돌아간다.
         */
        // 오늘/최근 목록은 측정 시점과 작성 시기 순서를 유지한다. 보관 목록만 주제를 섞는다.
        if (dailyView !== 'all') return hoistFree(filtered);
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
    }, [dailyRows, dailyView, topic, writeLane, moneyMin, focus, now, shuffleSeed, unlocked, freeNames]);

    /** 계획 창에 띄울 행. 목록 밖에 한 개만 둔다 — 카드마다 창을 만들 이유가 없다. */
    const planRow = useMemo(() => rows.find((row) => row.keyword === openPlan) || null, [rows, openPlan]);

    useEffect(() => {
        setVisibleCount(60);
    }, [topic, writeLane, moneyMin, focus, dailyView]);

    // '지식인 황금질문'은 좌측 메뉴 독립 탭(KinGoldenTab)으로 옮겨졌다(2026-08-20 정정).
    const publishedLabel = board?.publishedAt
        ? new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            .format(new Date(board.publishedAt))
        : '';

    return (
        <>
            <TabIntro
                title="리더남 전용 황금키워드"
                desc="오늘 검색 수요와 경쟁을 확인한 황금키워드부터 살펴보세요. 지난 측정과 계절성 키워드는 최근 7일·전체 보관에서 이어서 볼 수 있습니다."
                /* 어떤 도구로 재는지는 밝히지 않는다(사장님 2026-08-20) — 잰 사실만 적는다. */
                source={`검색결과 직접 확인${publishedLabel ? ` · ${publishedLabel} 발행` : ''}${board?.verified ? ` · ${board.verified}건 검증` : ''}`}
            />

            <details style={{ marginBottom: 14, color: '#aebbd1', fontSize: 13 }}>
                <summary style={{ cursor: 'pointer', padding: '8px 0' }}>수집 일정·최근 발행 확인</summary>
                <BoardFreshness
                    cadence="매일 오전에 일부 키워드를 재검증하고"
                    rounds={[{ hour: 7, minute: 23 }]}
                    lastBuiltAt={board?.publishedAt ?? null}
                />
                <p>월·금에는 전체 발굴도 진행합니다. 오늘 확인은 개별 키워드의 실제 측정일로 구분합니다.</p>
            </details>

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

            {(board || currentRows.length > 0) && <GoldenWritingRecommendations rows={board?.rows || []} currentRows={currentRows} sourceNote={currentBriefSource} freeNames={freeNames} unlocked={unlocked} now={now} onUnlock={() => setUnlocked(true)} onAnalyze={onAnalyze} />}

            {status === 'ready' && board && (
                <>
                    {/*
                      * 검색창을 뺐다(사장님 2026-08-20): "어떤 키워드인 줄 알고
                      * 찾는다고 필드를 구현해 놓은 거야." 맞다 — 여기는 모르는
                      * 키워드를 발견하러 오는 곳이지 아는 것을 찾으러 오는 곳이 아니다.
                      * 주제·레인 고르개가 추리는 일을 한다.
                      */}

                    <div style={{ margin: '18px 0', padding: 18, borderRadius: 16, border: '1px solid #365564', background: 'linear-gradient(115deg, #132a30, #1c2236)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <h2 style={{ fontSize: 21, margin: 0 }}>오늘 쓸 키워드 찾기</h2>
                            <span style={{ fontSize: 12, color: '#9bded6' }}>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(now)} 기준</span>
                        </div>
                        <div role="group" aria-label="키워드 확인 시점" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                            {([
                                { id: 'today', label: '오늘 확인', count: dailySummary.today },
                                { id: 'recent', label: '최근 7일', count: dailySummary.today + dailySummary.recent },
                                { id: 'all', label: '전체 보관', count: board.rows.length },
                            ] as const).map(item => <button key={item.id} type="button" aria-pressed={dailyView === item.id} onClick={() => changeDailyView(item.id)} style={{ flex: '1 1 140px', cursor: 'pointer', padding: '12px 16px', borderRadius: 11, border: dailyView === item.id ? '1px solid #68dec5' : '1px solid #ffffff25', background: dailyView === item.id ? '#b4f7df' : '#101926', color: dailyView === item.id ? '#09251e' : '#c7d5e9', fontWeight: 800, fontSize: 15 }}>{item.label} <span style={{ marginLeft: 8 }}>{item.count}</span></button>)}
                        </div>
                        <p style={{ color: '#bacddd', fontSize: 13, lineHeight: 1.7, margin: '12px 0 0' }}>{dailyView === 'today'
                            ? '한국 시간 오늘 확인한 수요·검색결과 중, 황금 비율과 경쟁 여지가 확인된 키워드입니다. 먼 시즌의 준비 주제는 보관 목록에 둡니다.'
                            : dailyView === 'recent' ? '최근 7일 안에 확인한 후보입니다. 오늘 확인된 항목도 함께 보여주며, 카드에 실제 확인일을 표시합니다.'
                            : '기존 키워드 전체를 보관합니다. 지난 측정·미리 준비할 시즌 주제도 포함되니 작성 전 다시 확인하세요.'} 월 검색량은 월간 조회수이며 오늘 하루의 검색량이 아닙니다.</p>
                    </div>
                    <div className="lw-toolbar"><span className="lw-count">현재 조건 {rows.length}개 · 주제 {topics.length}종</span></div>

                    {dailyRows.length > 0 && <>
                    <div className="lw-segment lw-segment-wrap lw-write-lanes" role="group" aria-label="경제와 최근 트렌드로 거르기">
                        {focusOptions.map((option) => (
                            <button key={option.id} type="button" className={focus === option.id ? 'on' : ''}
                                aria-pressed={focus === option.id} onClick={() => setFocus(option.id)}>
                                {option.label} <em>{option.count}</em>
                            </button>
                        ))}
                    </div>
                    <details style={{ margin: '8px 0 14px', color: '#aebbd1', fontSize: 12 }}>
                        <summary style={{ cursor: 'pointer' }}>선정 기준·검색 지표 안내</summary>
                        <p className="lw-write-hint">오늘·최근 목록은 실제 확인일과 현재 작성 시기로 추립니다. 전체 보관은 주제를 섞어 보여주며, 카드의 시즌 배지를 유지합니다. 경제·지원금 필터는 아래 주제·용도·입찰가 조건과 함께 적용됩니다. 입찰가는 광고주의 경쟁 지표이며 예상 수익이 아닙니다.</p>
                        {focusSummary.stale > 0 && <p className="lw-note lw-note-limit">검색결과 확인이 7일 넘게 지난 항목 또는 확인일이 없는 항목 {focusSummary.stale}개는 최근 상승에서 제외했습니다. 카드의 확인일을 함께 살펴보세요.</p>}
                    </details>

                    <WriteLaneFilter
                        value={writeLane}
                        onChange={setWriteLane}
                        counts={{
                            total: dailyRows.length,
                            laneCount: (laneId) => dailyRows.filter((row) => rowMatchesWriteLane(row, laneId)).length,
                        }}
                    />

                    <MoneyFilter
                        value={moneyMin}
                        onChange={setMoneyMin}
                        measured={dailyRows.filter((row) => row.money).length}
                        countAtLeast={(min) => dailyRows.filter((row) => (row.money?.value ?? 0) >= min).length}
                        total={dailyRows.length}
                    />

                    <TopicFilter value={topic} onChange={setTopic} topics={topics} total={dailyRows.length} />
                    </>}

                    {dailyView === 'all' && <GoldenTrendCandidates rows={trendCandidates} unlocked={unlocked} now={now}
                        onUnlock={() => setUnlocked(true)} onAnalyze={onAnalyze} />}
                    {trendCandidates.length > 0 && <h3 style={{ margin: '22px 0 12px' }}>{dailyView === 'all' ? '탐색·계절성 목록' : dailyView === 'today' ? '오늘 확인한 황금키워드' : '최근 확인한 황금키워드'} · {rows.length}개</h3>}

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
                            const locked = unlocked
                                ? false
                                : (freeNames.length > 0
                                    ? !freeNames.includes(row.keyword)
                                    : index >= FREE_BOARD_ROWS);
                            return (
                        <PreemptionCard
                            onPlan={onPlan}
                            key={`${row.topic}-${row.keyword}`}
                            /*
                             * 행은 발행본 그대로 넘긴다 — 시기 배지(timingGroup)·장기 추세(trendLabel)는
                             * 발행이 잰 시즌성 실측이다. 09-28 판이 이 둘을 지우고 7일 라벨로 덮어써서
                             * "성수기까지 약 6개월" 같은 배지가 화면에서 통째로 사라졌다(사장님
                             * "serp 트렌드 황금키워드가 빠졌어, 시즌성이 중요하거든"). 7일 상승은
                             * 실측된 행에만 **덧붙인다**.
                             */
                            row={row}
                            titleReview
                            headTags={<>
                                {dailyView !== 'all' && <span style={{ color: '#92e9cc', fontSize: 12 }}>✓ {goldenDailyStatus(row, now).reason}</span>}
                                <span className="lw-surface-tag">{row.topic}</span>
                                <span className="lw-slot-basis">{goldenMeasurementLabel({ ...row, measuredAt: goldenDailyCheckedAt(row, now) === null ? null : new Date(goldenDailyCheckedAt(row, now)!).toISOString() }, now)}</span>
                                {sevenDayRise(row) !== null && <span className="lw-trend-tag">최근 7일 수요 {sevenDayRise(row)!.toFixed(2)}배</span>}
                            </>}
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

                    {rows.length === 0 && <div className="lw-note">
                        <strong>{dailyView === 'today' && dailySummary.today === 0 ? '오늘 확인 기준을 통과한 키워드가 아직 없습니다' : '현재 조건에서 확인된 키워드가 없습니다'}</strong>
                        <p>{dailyView === 'today' && dailySummary.today === 0
                            ? '지난 측정에 오늘 날짜를 붙이지 않습니다. 최근 7일 후보나 전체 보관 목록을 확인해보세요.'
                            : '주제·용도·입찰가 조건을 줄이면 다른 후보를 볼 수 있습니다.'}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            <button type="button" className="lw-more-btn" onClick={() => { setFocus('all'); setTopic('전체'); setWriteLane('all'); setMoneyMin(0); }}>필터 초기화</button>
                            {dailyView === 'today' && <button type="button" className="lw-more-btn" onClick={() => changeDailyView('recent')}>최근 7일 후보 보기 ({dailySummary.today + dailySummary.recent})</button>}
                            {dailyView !== 'all' && <button type="button" className="lw-more-btn" onClick={() => changeDailyView('all')}>전체 보관 보기 ({board.rows.length})</button>}
                        </div>
                    </div>}

                    {/*
                      * 2군은 발행 데이터에 계속 있었는데 읽는 화면이 없어 묻혀 있었다.
                      * 매 회차 80건쯤이 그렇게 버려졌다 — 사장님 지적으로 드러났다.
                      * 주제 필터는 여기에도 건다(위에서 고른 주제와 따로 놀면 안 된다).
                      */}
                    {dailyView === 'all' && <details style={{ marginTop: 20 }}>
                        <summary style={{ cursor: 'pointer', padding: 14, border: '1px solid #ffffff25', borderRadius: 12 }}>외부유입 참고 키워드 보기</summary>
                        <ExternalTrafficBoard
                            rows={(board.reference || []).filter((row) => topic === '전체' || row.topic === topic)}
                            onAnalyze={onAnalyze}
                            searchUrl={naverSearchUrl}
                            locked={!unlocked}
                        />
                    </details>}

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
                            onPlan={onPlan}
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
