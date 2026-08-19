import { useEffect, useMemo, useState } from 'react';
import PreemptionPlan from './PreemptionPlan';
import { naverSearchUrl, rowMatchesWriteLane } from './preemptionMeta';
import { bridgeMindmap, bridgeTrend, type BridgeMindmap, type BridgeTrend } from '../../lib/bridge';

import { TopicFilter, WriteLaneFilter } from './BoardFilters';
import BoardCardHead from './BoardCardHead';
import { formatCount } from '../../lib/keywordApi';
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

type Evidence = { code: string; text: string };

type PreemptionRow = {
    keyword: string;
    topic: string;
    /** 어느 층에서 올라왔는가. 확실한 층일수록 앞이다. */
    tier?: 'top3' | 'page1' | 'golden-ratio' | 'page1-weak' | 'contested';
    tierLabel?: string;
    /** 상위 몇 번째 자리가 비어 있는가. */
    openSlot?: number | null;
    /** 검색 의도(구매 검토·거래·정보). 구매 검토형이 블로그에 제일 값어치가 크다. */
    intentLabel?: string;
    /** AI 브리핑 잠식 위험 — 실측 또는 어절 추론. */
    briefingRisk?: 'high' | 'medium' | 'low' | null;
    /** 의료·금융 규제 주의 라벨. */
    regulatoryLabel?: string;
    /** 수요 모양(시즌성·에버그린·상승세…). */
    trendLabel?: string;
    /** 시즌성일 때 "언제 써야 하는가". */
    timing?: string;
    /** 시기 그룹(지금 적기/준비 시기/지금 뜨는 중/연중 상시). 빈 문자열 = 미측정. */
    timingGroup?: string;
    monthsToPeak?: number | null;
    /** 애드센스 적합 실측 판정. null = 재료 부족(미판정). */
    adsenseFit?: boolean | null;
    /** 보강이 붙인 수익 결론 — bad 는 애드센스 레인에서 빠진다(이유는 카드에 남는다). */
    monetize?: { verdict: 'good' | 'bad' | 'mixed'; points: Array<{ text: string }>; angle?: string } | null;
    /** 실측 키워드 풀(연관 실측 + AI 검증분) — 검색량·문서수가 붙은 실존 검색어다. */
    keywordPool?: Array<{ keyword: string; searchVolume: number | null; documentCount?: number | null; source?: string }> | null;
    /** 30일 트렌드(데이터랩 상대값 실측) — 회차가 구워 준다. 폰에서도 그려진다. */
    trend?: { series: number[]; label?: string; recommendation?: string } | null;
    adsenseReason?: string;
    /** 회차 실측으로 만든 제목 2종(SEO/홈판). 옛 회차 데이터에는 없다. */
    titles?: {
        seo?: { text: string; frame?: string; basis?: string };
        home?: { text: string; frame?: string; basis?: string };
    } | null;
    /** 문제해결 서브(형제 실측 선별). 빈 배열 = 파생 실측 없음. */
    subKeywords?: { keyword: string; searchVolume: number | null; frame?: string }[];
    serpSections?: string[];
    /** 뜨는 중 · 밭 비어 있음 · 실시간 전 · 새로 생긴 말 — 네 조건을 다 만족. */
    /** 배치 순서로 본 "어디에 쓸 판인가". */
    layoutBestFor?: 'naver-blog' | 'wordpress' | 'kin' | 'shopping' | null;
    layoutHeadline?: string;
    layoutRanked?: { surface: string; label: string; position: number }[];
    layoutAdsOnTop?: boolean;
    earlyMover?: boolean;
    earlyMoverReasons?: string[];
    searchVolume: number | null;
    documentCount: number | null;
    evidence: Evidence[];
    serp?: {
        hasAiBriefing?: boolean;
        sampledTitles: number;
        exactTitleHits: number;
        partialTitleHits: number;
        /** 상단 파워링크 광고 건수(실측). 없으면 못 잰 회차다. */
        adCount?: number | null;
        medianDaysAgo: number | null;
        /** 지금 그 자리를 차지한 글 제목 3개. */
        topTitles?: string[];
    };
    firstSeenAt?: string | null;
};

type Board = {
    publishedAt?: string;
    topicsTotal?: number;
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
    const [query, setQuery] = useState('');
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
    /*
     * AI 서브 보강(2026-08-17 재설계) — API 키가 아니라 **클로드코드 연동**이다.
     * 같은 PC 의 LEWORD 앱 브리지가 사용자의 클로드코드 구독으로 추론 체인
     * (자동완성 실측→규칙 선별→AI 제안→실존 결재)을 통째로 돌려준다.
     * 그래서 결과는 전부 검증된 실존 검색어다. 앱이 꺼져 있으면 안내만 한다.
     */
    /*
     * [2026-08-18] 'AI 서브 보강' 온디맨드 기능 제거 — 서브키워드가 회차
     * 보강에서 이미 구워져 오므로 같은 일을 두 번 시키는 군더더기였다.
     */
    /*
     * 마인드맵 — 앱으로 보내는 링크였던 것을 실제 기능으로 바꾼다.
     * 브리지가 사용자 PC 의 앱을 통해 본인 구독으로 돌린다. 앱이 꺼져 있으면
     * 'offline' 로 안내할 뿐, 확장어를 지어내지 않는다.
     */
    const [mindmap, setMindmap] = useState<Record<string, {
        status: 'loading' | 'done' | 'offline' | 'error';
        data?: BridgeMindmap;
        error?: string;
        /** 자동 연쇄 — 검색량 상위 연관을 경량 분석한 결과가 순서대로 쌓인다. */
        related?: Array<{ keyword: string; status: 'loading' | 'done' | 'error'; data?: BridgeMindmap }>;
    }>>({});

    const openMindmap = async (row: PreemptionRow) => {
        const keyword = row.keyword;
        if (mindmap[keyword]?.status === 'done') {
            setMindmap((prev) => { const next = { ...prev }; delete next[keyword]; return next; });
            return;
        }

        /*
         * 회차가 구워 준 실측(키워드 풀 + 수익 판정)이 1순위다 — 폰에서도
         * 즉시 펼쳐진다. 예전엔 브리지(사용자 PC 앱)만 봤는데, 폰에는 브리지가
         * 없으니 "앱이 꺼져 있다"는 안내가 떴다(사장님: "연동 안 돼 있다고
         * 헛소리"). 브리지는 있으면 라이브 분석으로 **더** 얹는 보너스다.
         */
        const baked: BridgeMindmap | null = (row.keywordPool?.length ?? 0) > 0 ? {
            keyword,
            reasons: [],
            expansions: (row.keywordPool || []).map((p) => ({
                keyword: p.keyword,
                searchVolume: p.searchVolume ?? null,
                source: p.source || 'searchad-related',
            })),
            signals: ['검색량', '문서수'],
            monetize: row.monetize || null,
            agent: { available: false, provider: '회차 실측', proposed: 0, verified: 0 },
        } : null;

        if (baked) {
            setMindmap((prev) => ({ ...prev, [keyword]: { status: 'done', data: baked } }));
        } else {
            setMindmap((prev) => ({ ...prev, [keyword]: { status: 'loading' } }));
        }

        try {
            const result = await bridgeMindmap(keyword);
            if (!result) {
                if (!baked) setMindmap((prev) => ({ ...prev, [keyword]: { status: 'offline' } }));
                return;
            }
            setMindmap((prev) => ({ ...prev, [keyword]: { status: 'done', data: result } }));

            /*
             * 자동 연쇄(사장님 지시 2026-08-18): "비슷하게 많이 찾는 키워드를
             * 자동으로 분석해줄 순 없을까". 확장어 중 검색량 상위 2개를 경량
             * (AI 1콜)으로 이어서 분석한다 — 순차라 부담이 겹치지 않고,
             * 도착하는 대로 아래에 쌓인다.
             */
            const relatedTargets = (result.expansions || [])
                .filter((e) => typeof e.searchVolume === 'number' && e.searchVolume > 0)
                .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
                .slice(0, 2)
                .map((e) => e.keyword);
            for (const target of relatedTargets) {
                setMindmap((prev) => {
                    const entry = prev[keyword];
                    if (!entry || entry.status !== 'done') return prev;
                    return {
                        ...prev,
                        [keyword]: { ...entry, related: [...(entry.related || []), { keyword: target, status: 'loading' as const }] },
                    };
                });
                // eslint-disable-next-line no-await-in-loop -- 순차 실행이 의도다(구독 부담 분산)
                const sub = await bridgeMindmap(target, true).catch(() => null);
                setMindmap((prev) => {
                    const entry = prev[keyword];
                    if (!entry || entry.status !== 'done') return prev;
                    return {
                        ...prev,
                        [keyword]: {
                            ...entry,
                            related: (entry.related || []).map((r) => (r.keyword === target
                                ? (sub ? { keyword: target, status: 'done' as const, data: sub } : { keyword: target, status: 'error' as const })
                                : r)),
                        },
                    };
                });
            }
        } catch (error) {
            // 구운 데이터가 이미 떠 있으면 라이브 실패는 조용히 넘긴다.
            if (!baked) {
                const message = error instanceof Error ? error.message : String(error);
                setMindmap((prev) => ({ ...prev, [keyword]: { status: 'error', error: message } }));
            }
        }
    };

    /*
     * 그래프 — 앱의 30일 트렌드와 같은 실측을 웹에 그린다. 앱이 꺼져 있으면
     * 데이터랩 새 창으로 폴백한다 — 링크는 항상 살아 있는 최후의 수단이다.
     */
    const [trend, setTrend] = useState<Record<string, {
        status: 'loading' | 'done' | 'offline' | 'error';
        data?: BridgeTrend;
    }>>({});

    const openTrend = async (row: PreemptionRow) => {
        const keyword = row.keyword;
        if (trend[keyword]?.status === 'done' || trend[keyword]?.status === 'error') {
            setTrend((prev) => { const next = { ...prev }; delete next[keyword]; return next; });
            return;
        }
        /*
         * 회차가 구워 준 실측이 1순위다 — 폰에서도 즉시 그려진다. 예전엔
         * 브리지(사용자 PC 앱) 실패 시 데이터랩 새 창으로 튕겼는데, 폰에는
         * 브리지가 없으니 버튼이 광고 낀 외부 페이지로 가는 꼴이 됐다(사장님
         * 실측). 새 창 자동 열기는 하지 않는다.
         */
        if (row.trend && (row.trend.series || []).length > 0) {
            setTrend((prev) => ({
                ...prev,
                [keyword]: {
                    status: 'done',
                    data: { success: true, series: row.trend!.series, analysis: { label: row.trend!.label, recommendation: row.trend!.recommendation } },
                },
            }));
            return;
        }
        setTrend((prev) => ({ ...prev, [keyword]: { status: 'loading' } }));
        try {
            const result = await bridgeTrend(keyword);
            if (!result || !result.success || !(result.series || []).length) {
                setTrend((prev) => ({ ...prev, [keyword]: { status: 'error' } }));
                return;
            }
            setTrend((prev) => ({ ...prev, [keyword]: { status: 'done', data: result } }));
        } catch {
            setTrend((prev) => ({ ...prev, [keyword]: { status: 'error' } }));
        }
    };

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
        const needle = query.trim().toLowerCase();
        const filtered = all.filter((row) => {
            // 레인 판정은 rowMatchesWriteLane 단일 출처 — 애드센스만 실측 의도, 나머지는 배치 순서.
            if (!rowMatchesWriteLane(row, writeLane)) return false;
            if (topic !== '전체' && row.topic !== topic) return false;
            return !needle || row.keyword.toLowerCase().includes(needle);
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
         * 품질 순서는 안 무너진다. 주제·검색 필터를 걸면 원래 정렬로 돌아간다.
         */
        if (topic !== '전체' || needle) return sorted;
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
        return interleaved;
    }, [board, topic, query, writeLane, shuffleSeed]);

    /** 계획 창에 띄울 행. 목록 밖에 한 개만 둔다 — 카드마다 창을 만들 이유가 없다. */
    const planRow = useMemo(() => rows.find((row) => row.keyword === openPlan) || null, [rows, openPlan]);

    useEffect(() => {
        setVisibleCount(60);
    }, [topic, query, writeLane]);

    const publishedLabel = board?.publishedAt
        ? new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            .format(new Date(board.publishedAt))
        : '';

    return (
        <>
            <TabIntro
                title="리더남 전용 황금키워드"
                desc="검색결과를 직접 열어 보고 '지금 들어갈 자리가 있는' 것만 남겼습니다. 상위 자리가 비어 있는 것이 맨 앞이고, 그 아래로 자리가 확실한 순서입니다. 블로그 주제 32종을 한 번에 훑었으니 카테고리를 하나씩 뒤질 필요가 없습니다."
                source={`Bright Data 검색결과 실측${publishedLabel ? ` · ${publishedLabel} 발행` : ''}${board?.verified ? ` · ${board.verified}건 검증` : ''}`}
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
                    <div className="lw-toolbar">
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="키워드 안에서 찾기"
                            aria-label="선점 키워드 검색"
                        />
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
                        <LicenseGate onUnlock={() => setUnlocked(true)} />
                    )}

                    <div className="lw-board-list">
                        {rows.slice(0, visibleCount).map((row, index) => {
                            const locked = !unlocked && index >= FREE_BOARD_ROWS;
                            return (
                                <article key={`${row.topic}-${row.keyword}`} className={`lw-card lw-card-pre${locked ? ' locked' : ''}`}>
                                    <BoardCardHead row={row} rank={index + 1} />

                                    {/*
                                      * 지표 열. 사장님 지정 4개 — 검색량 · 문서수 · 광고수 · 빈자리.
                                      *
                                      * 광고수가 여기 있는 이유: "상위에 광고가 많이 떠 있다면 그 키워드는
                                      * 돈이 되는 키워드다 — 광고주가 많으니까." 우리가 만든 수익 추정이
                                      * 아니라 광고주들이 이미 낸 판단이라 그대로 싣는다.
                                      * 못 쟀으면 '—' 다. 0건이라고 쓰면 안 본 것이 '광고 없음'이 된다.
                                      */}
                                    <div className="lw-card-metrics">
                                        <div><span>검색량</span><strong>{formatCount(row.searchVolume)}</strong></div>
                                        <div><span>문서수</span><strong>{formatCount(row.documentCount)}</strong></div>
                                        <div className={typeof row.serp?.adCount === 'number' && row.serp.adCount >= 5 ? 'money' : ''}>
                                            <span>광고수</span>
                                            <strong>{typeof row.serp?.adCount === 'number' ? `${row.serp.adCount}개` : '—'}</strong>
                                        </div>
                                        {/*
                                          * null 은 '없음'이 아니다 — findOpenSlot 은 "훑은 자리가
                                          * 전부 찼다" 를 null 로 돌려주고, 그 아래는 보지 않았다.
                                          * '없음'이라고 적으면 안 잰 것을 단정하는 것이 된다.
                                          */}
                                        <div className="hot">
                                            <span>빈자리</span>
                                            <strong title={row.openSlot ? `상위 ${row.openSlot}번째 자리가 비어 있습니다` : '상위 10개는 모두 차 있습니다 — 그 아래는 재지 않았습니다'}>
                                                {row.openSlot ? `${row.openSlot}위` : '10위 내 없음'}
                                            </strong>
                                        </div>
                                    </div>

                                    {/*
                                      * 대장간 산출물 — 제목 2종 + 문제해결 서브(2026-08-17 재편).
                                      * 전부 회차 실측에서 조립된 값이고, 옛 회차 데이터에는 없으므로
                                      * 있을 때만 그린다. 서브는 마인드맵 확장의 시작점이다.
                                      */}
                                    {(row.titles?.seo || row.titles?.home || (row.subKeywords?.length ?? 0) > 0) && (
                                        <div className="lw-forge">
                                            {row.titles?.seo && (
                                                <div className="lw-forge-title" title={row.titles.seo.basis || ''}>
                                                    <span>SEO 제목</span>{row.titles.seo.text}
                                                </div>
                                            )}
                                            {row.titles?.home && (
                                                <div className="lw-forge-title" title={row.titles.home.basis || ''}>
                                                    <span>홈판 제목</span>{row.titles.home.text}
                                                </div>
                                            )}
                                            {(row.subKeywords?.length ?? 0) > 0 && (
                                                <div className="lw-forge-subs">
                                                    <span>서브키워드</span>
                                                    {(row.subKeywords || []).map((sub) => (
                                                        <em key={sub.keyword}>
                                                            {sub.keyword}
                                                            {typeof sub.searchVolume === 'number' ? ` (${sub.searchVolume.toLocaleString()})` : ''}
                                                        </em>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 실측 키워드 풀 — 연관 실측 + AI 검증분, 전부 검색량 확인된 실존 검색어. */}
                                    {(row.keywordPool?.length ?? 0) > 0 && (
                                        <div className="lw-mindmap-branches" style={{ marginTop: 10 }}>
                                            {(row.keywordPool || []).map((item) => (
                                                <a
                                                    key={item.keyword}
                                                    href={naverSearchUrl(item.keyword)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className={item.source === 'ai-verified' ? 'lw-mindmap-ai' : ''}
                                                    title={`월 검색량 ${item.searchVolume?.toLocaleString() ?? '실측'} · 문서수 ${typeof item.documentCount === 'number' ? item.documentCount.toLocaleString() : '미측정'}`}
                                                >
                                                    {item.keyword}
                                                    {/* 검색량/문서수 — 사장님 지정 표기(177,500 / 2,345). 문서수가 곧 경쟁이다. */}
                                                    <span>
                                                        {item.searchVolume ? item.searchVolume.toLocaleString() : '실측'}
                                                        {typeof item.documentCount === 'number' ? ` / ${item.documentCount.toLocaleString()}` : ''}
                                                    </span>
                                                </a>
                                            ))}
                                        </div>
                                    )}

                                    {/* 수익 결론 — 회차 보강이 붙인 판정. bad 는 애드센스 레인에서 빠진 이유가 이것이다. */}
                                    {row.monetize && (
                                        <div className={`lw-mindmap-money lw-mindmap-money-${row.monetize.verdict}`}>
                                            <div className="lw-mindmap-money-head">
                                                💰 광고 수익 관점
                                                <strong>
                                                    {row.monetize.verdict === 'good' ? '✅ 쓸 만하다'
                                                        : row.monetize.verdict === 'bad' ? '⛔ 광고 수익 안 나온다 — 애드센스 탈락'
                                                            : '⚖ 각도에 달렸다'}
                                                </strong>
                                            </div>
                                            <ul>
                                                {row.monetize.points.slice(0, 3).map((point) => <li key={point.text}>{point.text}</li>)}
                                            </ul>
                                            {row.monetize.angle && <p><strong>쓴다면:</strong> {row.monetize.angle}</p>}
                                        </div>
                                    )}

                                    <div className="lw-card-actions">
                                        <button
                                            type="button"
                                            aria-expanded={openPlan === row.keyword}
                                            onClick={() => setOpenPlan(openPlan === row.keyword ? '' : row.keyword)}
                                        >어떻게 쓸까</button>
                                        <a href={naverSearchUrl(row.keyword)} target="_blank" rel="noreferrer">
                                            네이버 검색결과<small>빈자리 확인</small>
                                        </a>
                                        <button type="button" onClick={() => onAnalyze?.(row.keyword)}>
                                            LEWORD 키워드 분석
                                        </button>
                                        {/*
                                          * 예전에는 여기가 /leword 소개로 보내는 링크였다. "앱 기능이라
                                          * 웹에서는 못 돈다"는 전제였는데, 브리지가 생긴 뒤로 그 전제가
                                          * 사라졌다 — 사용자 PC 의 앱이 켜져 있으면 본인 구독으로 돈다.
                                          */}
                                        <button
                                            type="button"
                                            onClick={() => openMindmap(row)}
                                            disabled={mindmap[row.keyword]?.status === 'loading'}
                                        >
                                            {mindmap[row.keyword]?.status === 'loading' ? '확장 중…' : '마인드맵 확장키워드'}
                                            <small>내 클로드코드 구독</small>
                                        </button>
                                        {/* 앱과 같은 30일 실측 그래프. 앱이 꺼져 있으면 데이터랩 새 창 폴백. */}
                                        <button
                                            type="button"
                                            onClick={() => openTrend(row)}
                                            disabled={trend[row.keyword]?.status === 'loading'}
                                        >
                                            {trend[row.keyword]?.status === 'loading' ? '불러오는 중…' : '그래프보기'}
                                            <small>30일 실측</small>
                                        </button>
                                        {/*
                                          * 'AI 서브 보강' 버튼은 뺐다(사장님 지시 2026-08-18) —
                                          * 서브키워드가 회차 보강에서 이미 구워져 오므로 온디맨드
                                          * 버튼은 같은 일을 두 번 시키는 군더더기였다.
                                          */}
                                        <button
                                            type="button"
                                            className="lw-copy"
                                            title="키워드 복사"
                                            onClick={() => {
                                                navigator.clipboard?.writeText(row.keyword);
                                                setCopied(row.keyword);
                                                window.setTimeout(() => setCopied(''), 1400);
                                            }}
                                        >{copied === row.keyword ? '복사됨' : '복사'}</button>
                                    </div>

                                    {trend[row.keyword]?.status === 'error' && (
                                        <div className="lw-forge lw-forge-ai">
                                            <div className="lw-forge-subs">
                                                이 행은 트렌드 실측이 아직 없습니다 — 다음 회차부터 카드 안에 그려집니다.
                                                지금 보려면 <a href={dataLabUrl(row.keyword)} target="_blank" rel="noreferrer">네이버 데이터랩</a>에서 확인하세요.
                                            </div>
                                        </div>
                                    )}

                                    {/* 30일 트렌드 — 데이터랩 상대값(최대일=100). 막대는 실측 그대로다. */}
                                    {trend[row.keyword]?.status === 'done' && (() => {
                                        const data = trend[row.keyword]!.data!;
                                        const series = data.series || [];
                                        const dates = data.dates || [];
                                        return (
                                            <div className="lw-trend">
                                                <div className="lw-trend-head">
                                                    📈 30일 트렌드 — 데이터랩 상대값(최대일 100)
                                                    {data.analysis?.label && <strong>{data.analysis.label}</strong>}
                                                </div>
                                                <div className="lw-trend-bars" role="img" aria-label={`${row.keyword} 30일 검색 추이`}>
                                                    {series.map((value, index) => (
                                                        <span
                                                            key={`${dates[index] || index}`}
                                                            style={{ height: `${Math.max(3, value)}%` }}
                                                            title={`${dates[index] || ''} · ${Math.round(value)}`}
                                                        />
                                                    ))}
                                                </div>
                                                {data.analysis?.recommendation && (
                                                    <p className="lw-trend-note">{data.analysis.recommendation}</p>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* 마인드맵 결과 — 중심 키워드에서 실측 확장어가 갈라져 나온다. */}
                                    {mindmap[row.keyword]?.status === 'offline' && (
                                        <div className="lw-forge lw-forge-ai">
                                            <div className="lw-forge-subs">
                                                LEWORD 앱이 꺼져 있습니다 — 앱을 켜면 마인드맵이 <strong>내 클로드코드 구독</strong>으로
                                                확장됩니다. <a href="/download">⬇ 앱 받기</a>
                                            </div>
                                        </div>
                                    )}
                                    {mindmap[row.keyword]?.status === 'error' && (
                                        <div className="lw-forge lw-forge-ai">
                                            <div className="lw-forge-subs">확장 실패: {mindmap[row.keyword]?.error}</div>
                                        </div>
                                    )}
                                    {mindmap[row.keyword]?.status === 'done' && (
                                        <div className="lw-mindmap">
                                            <div className="lw-mindmap-core">{row.keyword}</div>
                                            {(mindmap[row.keyword]?.data?.reasons || []).length > 0 && (
                                                <ul className="lw-mindmap-why">
                                                    {(mindmap[row.keyword]?.data?.reasons || []).map((reason) => (
                                                        <li key={reason.text}>
                                                            {reason.text}
                                                            <em>{reason.basis} 실측</em>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            <div className="lw-mindmap-branches">
                                                {(mindmap[row.keyword]?.data?.expansions || []).map((item) => (
                                                    <a
                                                        key={item.keyword}
                                                        href={naverSearchUrl(item.keyword)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className={item.source === 'ai-verified' ? 'lw-mindmap-ai' : ''}
                                                    >
                                                        {item.keyword}
                                                        <span>{item.searchVolume ? item.searchVolume.toLocaleString() : '자동완성'}</span>
                                                    </a>
                                                ))}
                                            </div>
                                            {(mindmap[row.keyword]?.data?.expansions || []).length === 0 && (
                                                <div className="lw-forge-subs">실존이 확인된 확장 검색어가 없습니다.</div>
                                            )}
                                            {/* 자동 연쇄 — 많이 찾는 연관을 스스로 이어서 분석한 결과. */}
                                            {(mindmap[row.keyword]?.related?.length ?? 0) > 0 && (
                                                <div className="lw-mindmap-chain">
                                                    <div className="lw-mindmap-chain-head">🔗 많이 찾는 연관 자동 분석</div>
                                                    {(mindmap[row.keyword]?.related || []).map((rel) => (
                                                        <div key={rel.keyword} className="lw-mindmap-chain-item">
                                                            <strong>{rel.keyword}</strong>
                                                            {rel.status === 'loading' && <span className="lw-chain-wait">분석 중…</span>}
                                                            {rel.status === 'error' && <span className="lw-chain-wait">실패 — 넘어감</span>}
                                                            {rel.status === 'done' && rel.data && (
                                                                <>
                                                                    {rel.data.monetize && (
                                                                        <em className={`lw-chain-verdict lw-chain-${rel.data.monetize.verdict}`}>
                                                                            {rel.data.monetize.verdict === 'good' ? '✅ 쓸 만하다'
                                                                                : rel.data.monetize.verdict === 'bad' ? '⛔ 수익 안 나옴' : '⚖ 각도에 달림'}
                                                                        </em>
                                                                    )}
                                                                    <ul>
                                                                        {rel.data.reasons.slice(0, 2).map((reason) => <li key={reason.text}>{reason.text}</li>)}
                                                                        {rel.data.monetize?.angle && <li><b>쓴다면:</b> {rel.data.monetize.angle}</li>}
                                                                    </ul>
                                                                </>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {mindmap[row.keyword]?.data?.monetize && (() => {
                                                const verdict = mindmap[row.keyword]!.data!.monetize!;
                                                const label = verdict.verdict === 'good' ? '✅ 쓸 만하다'
                                                    : verdict.verdict === 'bad' ? '⛔ 광고 수익 안 나온다' : '⚖ 각도에 달렸다';
                                                return (
                                                    <div className={`lw-mindmap-money lw-mindmap-money-${verdict.verdict}`}>
                                                        <div className="lw-mindmap-money-head">
                                                            💰 광고 수익 관점 — 클릭할까 · 무슨 광고가 뜰까 · 머물까
                                                            <strong>{label}</strong>
                                                        </div>
                                                        <ul>
                                                            {verdict.points.map((point) => <li key={point.text}>{point.text}</li>)}
                                                        </ul>
                                                        {verdict.angle && <p><strong>쓴다면:</strong> {verdict.angle}</p>}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {locked && (
                                        <div className="lw-lock" aria-hidden="true">
                                            <span>🔒</span>
                                        </div>
                                    )}
                                </article>
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
                    />

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
