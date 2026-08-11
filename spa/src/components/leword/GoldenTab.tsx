import { useEffect, useMemo, useState } from 'react';
import PreemptionPlan from './PreemptionPlan';
import { naverSearchUrl } from './preemptionMeta';

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
    tier?: 'top3' | 'page1' | 'page1-weak' | 'contested';
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
    /** 방금 복사한 키워드. 눌렀는지 안 눌렀는지 모르면 두 번 누르게 된다. */
    const [copied, setCopied] = useState('');

    useEffect(() => {
        let alive = true;
        fetch(BOARD_URL, { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no board'))))
            .then((data) => {
                if (!alive) return;
                const rows: PreemptionRow[] = Array.isArray(data?.rows) ? data.rows : [];
                setBoard({ ...data, rows, reference: Array.isArray(data?.reference) ? data.reference : [] });
                setStatus(rows.length > 0 ? 'ready' : 'empty');
            })
            .catch(() => { if (alive) setStatus('error'); });
        return () => { alive = false; };
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
            if (writeLane !== 'all' && row.layoutBestFor !== writeLane) return false;
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
        return [...filtered].sort((a, b) => {
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
    }, [board, topic, query, writeLane]);

    /** 계획 창에 띄울 행. 목록 밖에 한 개만 둔다 — 카드마다 창을 만들 이유가 없다. */
    const planRow = useMemo(() => rows.find((row) => row.keyword === openPlan) || null, [rows, openPlan]);

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
                            laneCount: (laneId) => board.rows.filter((row) => row.layoutBestFor === laneId).length,
                        }}
                    />

                    <TopicFilter value={topic} onChange={setTopic} topics={topics} total={board.rows.length} />

                    {!unlocked && rows.length > FREE_BOARD_ROWS && (
                        <LicenseGate onUnlock={() => setUnlocked(true)} />
                    )}

                    <div className="lw-board-list">
                        {rows.map((row, index) => {
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
                                          * 마인드맵 확장은 LEWORD 앱 기능이다(사장님 확인, 2026-08-11).
                                          *
                                          * 앱을 웹에서 직접 열 수는 없다 — 커스텀 프로토콜(leword://)을
                                          * 등록하지 않기 때문이다. 그래서 '앱에서 열기'라고 적으면 안 된다.
                                          * 눌러도 앱이 안 열리는데 열린다고 말하는 셈이다.
                                          * 어디에 있는 기능인지만 적고 소개 화면으로 보낸다.
                                          *
                                          * 웹에도 붙이려면 엔진을 새로 만들 필요는 없다 — 모바일 API 에
                                          * /v1/mindmap/expand 가 이미 있다(src/mobile/contracts.ts).
                                          */}
                                        <a href="/leword" target="_blank" rel="noreferrer">
                                            마인드맵 확장키워드<small>LEWORD 앱 기능</small>
                                        </a>
                                        {/* 데이터랩은 실제 검색량 추이를 그린다. 우리가 그리는 그림이 아니다. */}
                                        <a href={dataLabUrl(row.keyword)} target="_blank" rel="noreferrer">
                                            그래프보기<small>네이버 데이터랩</small>
                                        </a>
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

                                    {locked && (
                                        <div className="lw-lock" aria-hidden="true">
                                            <span>🔒</span>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>

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
