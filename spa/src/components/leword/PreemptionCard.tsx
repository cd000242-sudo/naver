import type { ReactNode } from 'react';
import BoardCardHead from './BoardCardHead';
import TrendSparkline from './TrendSparkline';
import { naverSearchUrl } from './preemptionMeta';
import type { DemandPoint } from './DemandChartModal';
import type { BridgeMindmap } from '../../lib/bridge';
import { formatCount } from '../../lib/keywordApi';

/**
 * 보드 카드 본체 — 황금키워드 탭에서 떼어 냈다(사장님 지시 2026-09-03:
 * "황금키워드랑 똑같이 버튼이랑 연관키워드 등등 그래프도 똑같이 전부").
 *
 * 실검 틈새 탭이 같은 카드를 쓴다. 판정은 하나도 안 한다 — 회차가 실측·보강해
 * 준 값을 읽어 그릴 뿐이다. 상태(복사·계획 창·그래프·마인드맵)는 부모가 들고
 * 있고 여기는 콜백만 받는다. 지표 줄만 판마다 다르다(variant): 황금은 광고수·빈자리
 * (SERP 실측), 이슈는 정면 글(헌터 실측) + 자리(블로그탭 상위 10 실측, 2026-09-04 부터 —
 * 광고수는 안 잰다).
 */

/**
 * 이 자리를 **언제 쟀는지**. 이월된 행이 섞이므로 며칠 지난 값인지 보여야
 * "지금도 비어 있냐"는 물음에 사장님이 직접 판단할 수 있다.
 * 못 읽으면 빈 문자열 — 지어내지 않는다.
 */
function measuredAgo(iso: string): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const days = Math.floor((Date.now() - t) / 86_400_000);
    if (days <= 0) return '오늘 잼';
    if (days === 1) return '어제 잼';
    return `${days}일 전 잼`;
}

export type Evidence = { code: string; text: string };

export type PreemptionRow = {
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
    /**
     * 12개월 시계열의 최고치가 있던 달(1~12)과 그것이 지금의 몇 배인지(단순 나눗셈).
     * 발행이 board-order 로 계산한다(2026-09-07). 배수가 2 이상일 때만 카드에 적는다.
     * peakVolume 은 순서를 정하는 키일 뿐 화면에 숫자로 내지 않는다 — 추정치다.
     */
    peakMonth?: number;
    peakMultiplier?: number;
    /** 재작년에도 같은 달(±1)이 최고였나. 2년치가 없으면 null — 그때는 시기를 말하지 않는다. */
    peakRecurring?: boolean | null;
    /** 상위 10개 제목 중 정면 일치 8개↑ — 초보가 비집을 자리가 없다. 발행이 뒤로 보낸다. */
    frontalSaturated?: boolean;
    /** 애드센스 적합 실측 판정. null = 재료 부족(미판정). */
    adsenseFit?: boolean | null;
    /** 보강이 붙인 수익 결론 — bad 는 애드센스 레인에서 빠진다(이유는 카드에 남는다). */
    monetize?: { verdict: 'good' | 'bad' | 'mixed'; points: Array<{ text: string }>; angle?: string } | null;
    /** 실측 키워드 풀(연관 실측 + AI 검증분) — 검색량·문서수가 붙은 실존 검색어다. */
    keywordPool?: Array<{ keyword: string; searchVolume: number | null; documentCount?: number | null; source?: string }> | null;
    /** 30일 트렌드(데이터랩 상대값 실측) — 회차가 구워 준다. 폰에서도 그려진다. */
    trend?: { series: number[]; label?: string; recommendation?: string } | null;
    /** 24개월 실측 시계열(2026-08-19 배선) — 다음 회차부터 채워진다. 클릭 확대용. */
    demandSeries?: DemandPoint[] | null;
    demandAsOf?: string | null;
    /** 이 자리를 실제로 잰 시각 — 며칠 지난 값인지 화면이 밝힌다. */
    measuredAt?: string | null;
    /** "지금 왜 검색되는가" — 에이전트 추론 한 문장. 라벨로 실측과 구분한다. */
    whySearch?: { text: string; basis?: string } | null;
    /** 지식인 질문 수 실측 — 질문 많음 = 답을 못 찾는 중. */
    kinCount?: number | null;
    /** 최신 질문 중 조회수 높은 순(제목·링크·조회수·답변수 실측) — 클릭하면 질문으로 바로 간다. */
    kinTop?: Array<{ title: string; link: string; views?: number | null; answers?: number | null }> | null;
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
    /** 키워드도구가 PC·모바일 한쪽 이상을 "< 10" 으로 답함(실측). 양쪽 다면 searchVolume 은 null 인데 '—'(미측정)가 아니라 "10 미만"이다. */
    searchVolumeLt10?: boolean;
    /** 이슈 행: 헌터의 데이터랩 수요 실측이 잡혔는가. 안 잡혔으면 30일 그래프도 없는 게 정상(검색 기록 0). */
    hasLiveDemand?: boolean;
    documentCount: number | null;
    evidence: Evidence[];
    serp?: {
        hasAiBriefing?: boolean;
        sampledTitles: number;
        exactTitleHits: number;
        partialTitleHits: number;
        /** 상단 파워링크 광고 건수(실측). 없으면 못 잰 회차다. */
        adCount?: number | null;
        /** 황금 행만 잰다. 이슈 행의 자리 실측(블로그탭 상위 10 제목 판정)에는 없다. */
        medianDaysAgo?: number | null;
        /** 지금 그 자리를 차지한 글 제목(황금 3개 · 이슈 상위 10). */
        topTitles?: string[];
        /** 이슈 행의 자리 판정 — WINNABLE 만 틈새로 실린다. 잰 시각을 같이 둔다. */
        verdict?: 'WINNABLE' | 'CONTESTED' | 'LOCKED' | 'NO_DATA';
        measuredAt?: string;
        /*
         * 자리 판정의 근거 — 잰 순간의 블로그탭 상위 제목과 커버리지.
         * 커버리지 0.6 미만이면 그 자리를 '빈 것'으로 본다.
         */
        slots?: Array<{ rank: number; title: string; coverage: number }>;
    };
    firstSeenAt?: string | null;
    /** 실검 틈새 행만: 제목이 검색어를 정면으로 담은 글 수(헌터 실측). 황금 행엔 없다. */
    frontalDocCount?: number | null;
    freshFrontalCount?: number | null;
};

export type MindmapEntry = {
    status: 'loading' | 'done' | 'offline' | 'error';
    data?: BridgeMindmap;
    error?: string;
    /** 자동 연쇄 — 검색량 상위 연관을 경량 분석한 결과가 순서대로 쌓인다. */
    related?: Array<{ keyword: string; status: 'loading' | 'done' | 'error'; data?: BridgeMindmap }>;
};

type Props = {
    row: PreemptionRow;
    rank: number;
    locked: boolean;
    copied: boolean;
    onCopy: () => void;
    planOpen: boolean;
    onTogglePlan: () => void;
    onOpenChart: () => void;
    mindmap?: MindmapEntry;
    onMindmap: () => void;
    onAnalyze?: (keyword: string) => void;
    /** 지표 줄 변형 — 'issue' 는 광고수·빈자리 대신 정면 글을 낸다. */
    variant?: 'golden' | 'issue';
    /** 카드 머리 배지 앞에 끼울 태그(이슈 탭: 이슈명·실측 수요·급상승). */
    headTags?: ReactNode;
};

function PreemptionCard({
    row, rank, locked, copied, onCopy, planOpen, onTogglePlan, onOpenChart, mindmap, onMindmap, onAnalyze,
    variant = 'golden', headTags,
}: Props) {
    return (
                <article className={`lw-card lw-card-pre${locked ? ' locked' : ''}`}>
                    <BoardCardHead
                        row={row}
                        rank={rank}
                        extraTags={headTags}
                        copied={copied}
                        onCopy={onCopy}
                    />

                    {/*
                      * 30일 추이 자동 표시(사장님 2026-08-19: "그래프가 보여야 이 키워드로
                      * 글을 써도 될지 알 수 있다"). 헤드와 지표 사이 빈 공간(스크린샷의
                      * 빨간 네모 자리)에 구워진 실측(row.trend)을 그린다 — 클릭 불필요.
                      */}
                    <div className="lw-card-spark">
                        {row.trend && (row.trend.series || []).length >= 2 ? (
                            /*
                             * 스파크라인 클릭 = 크게 보기(24개월 실측이 있으면 그것,
                             * 없으면 이 30일 실측 그대로). 축·정점·기간이 붙은 큰
                             * 그래프는 모달이 그린다 — 카드 안에서는 흐름만 본다.
                             */
                            <button
                                type="button"
                                className="lw-spark-open"
                                onClick={onOpenChart}
                                aria-label={`${row.keyword} 수요 그래프 크게 보기`}
                            >
                                <TrendSparkline series={row.trend.series!} label={row.trend.label} />
                            </button>
                        ) : variant === 'issue' ? (
                            /*
                             * 이슈 행에 그래프가 없는 이유를 적는다(사장님 2026-09-03: "그래프는
                             * 안 되는 거니?"). 데이터랩은 검색이 잡힌 날만 주는데 선점 후보는
                             * 한 날도 없다 — 0점은 그릴 게 없다. 수요가 잡혔는데도 없으면
                             * 회차가 아직 안 잰 것이다. 둘을 구분해 적는다.
                             */
                            <p className="lw-why lw-why-empty">
                                <em>30일 그래프 없음</em>
                                {row.hasLiveDemand
                                    ? '추세 미측정 — 다음 회차에 다시 잰다'
                                    : '데이터랩에 아직 검색이 잡힌 날이 없다 — 선점 자리'}
                            </p>
                        ) : null}
                        {row.whySearch?.text && (
                            <p className="lw-why" title={row.whySearch.basis || 'AI 추론'}>
                                <em>왜 지금?</em> {row.whySearch.text}
                                <small>{row.whySearch.basis || 'AI 추론'}</small>
                            </p>
                        )}
                    </div>

                    {/*
                      * 지표 열. 사장님 지정 4개 — 검색량 · 문서수 · 광고수 · 빈자리.
                      *
                      * 광고수가 여기 있는 이유: "상위에 광고가 많이 떠 있다면 그 키워드는
                      * 돈이 되는 키워드다 — 광고주가 많으니까." 우리가 만든 수익 추정이
                      * 아니라 광고주들이 이미 낸 판단이라 그대로 싣는다.
                      * 못 쟀으면 '—' 다. 0건이라고 쓰면 안 본 것이 '광고 없음'이 된다.
                      */}
                    <div className="lw-card-metrics">
                        {/*
                          * 키워드도구의 "< 10" 은 실측 답이다 — '—'(못 잼)와 다르다. 양쪽 다
                          * "< 10" 이면 "10 미만", 한쪽만이면 숫자를 싣고 툴팁에 밝힌다.
                          */}
                        <div title={row.searchVolumeLt10 ? '키워드도구 실측 — PC·모바일 한쪽 이상이 월 10회 미만' : undefined}>
                            <span>검색량</span>
                            <strong>{row.searchVolume === null && row.searchVolumeLt10 ? '10 미만' : formatCount(row.searchVolume)}</strong>
                        </div>
                        <div><span>문서수</span><strong>{formatCount(row.documentCount)}</strong></div>
                        {variant === 'issue' ? (
                            <>
                                {/*
                                  * 이슈 행은 광고수를 안 쟀다 — 헌터가 잰 정면 글 수와 자리 실측(아래)이다.
                                  * 못 잰 값은 '—' 다. 0 으로 채우면 안 본 것이 '없음'이 된다.
                                  */}
                                <div title="제목이 검색어를 정면으로 담은 글 수 — 블로그 상위 실측">
                                    <span>정면 글</span>
                                    <strong>{typeof row.frontalDocCount === 'number' ? `${row.frontalDocCount}건` : '—'}</strong>
                                </div>
                                <div title="최근 글 중 정면으로 다룬 수">
                                    <span>최근 정면</span>
                                    <strong>{typeof row.freshFrontalCount === 'number' ? `${row.freshFrontalCount}건` : '—'}</strong>
                                </div>
                                {/*
                                  * 자리(블로그탭 상위 10) — 틈새의 세 번째 게이트. 회차가 Bright Data 로
                                  * 실제 블로그탭을 받아 제목을 판정한 값이다. 틈새 행은 정면 0건(WINNABLE)
                                  * 만 실린다. 안 잰 행은 '—' — 0 으로 채우면 안 본 것이 '비었음'이 된다.
                                  */}
                                <div
                                    className={row.serp?.verdict === 'WINNABLE' ? 'hot' : ''}
                                    title={row.serp?.verdict
                                        ? `잰 순간의 블로그탭 상위 ${row.serp.sampledTitles}개 — 정면 ${row.serp.exactTitleHits}건 · 부분 ${row.serp.partialTitleHits}건`
                                        : '이 회차엔 블로그탭 상위 10 을 재지 않았습니다'}
                                >
                                    <span>
                                        자리<i className="lw-slot-basis">블로그탭</i>
                                        {row.serp?.measuredAt && <i className="lw-slot-basis">{measuredAgo(row.serp.measuredAt)}</i>}
                                    </span>
                                    <strong>
                                        {row.serp?.verdict
                                            ? `정면 ${row.serp.exactTitleHits} / ${row.serp.sampledTitles}`
                                            : '—'}
                                    </strong>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={typeof row.serp?.adCount === 'number' && row.serp.adCount >= 5 ? 'money' : ''}>
                                    <span>광고수</span>
                                    <strong>{typeof row.serp?.adCount === 'number' ? `${row.serp.adCount}개` : '—'}</strong>
                                </div>
                                {/*
                                  * null 은 '없음'이 아니다 — findOpenSlot 은 "훑은 자리가
                                  * 전부 찼다" 를 null 로 돌려주고, 그 아래는 보지 않았다.
                                  * '없음'이라고 적으면 안 잰 것을 단정하는 것이 된다.
                                  */}
                                {/*
                                  * 근거를 함께 보여준다(사장님 반증 2026-08-21: "어딜 봐서
                                  * 빈자리야?"). 무엇을 기준으로 셌는지(블로그탭)와 그 자리에
                                  * 무엇이 있었는지를 안 보여주면 검증할 수 없는 주장이 된다.
                                  * 순위는 몇 시간이면 바뀌므로 잰 순간의 제목을 남긴다.
                                  */}
                                <div className="hot">
                                    {/*
                                      * **언제 잰 값인지** 붙인다(사장님 지시 2026-08-28:
                                      * "가치 입증이 제대로 되고 사용자의 반박 제거가 된다면").
                                      * 이월된 행이 섞이므로, 이 숫자가 오늘 것인지 며칠 전
                                      * 것인지 안 보이면 "지금도 비어 있냐"에 답할 수 없다.
                                      * 순위는 몇 시간이면 바뀐다.
                                      */}
                                    <span>
                                        빈자리<i className="lw-slot-basis">블로그탭</i>
                                        {row.measuredAt && <i className="lw-slot-basis">{measuredAgo(row.measuredAt)}</i>}
                                    </span>
                                    <strong
                                        title={(row.serp?.slots || []).length > 0
                                            ? `잰 순간의 블로그탭 상위 — 커버리지 0.6 미만이 빈자리\n${(row.serp?.slots || [])
                                                .map((slot) => `${slot.rank}. [${slot.coverage.toFixed(2)}] ${slot.title}`).join('\n')}`
                                            : (row.openSlot
                                                ? `블로그탭 상위 ${row.openSlot}번째 자리가 비어 있었습니다 (근거 제목은 이 회차에 저장되지 않음)`
                                                : '상위 10개는 모두 차 있습니다 — 그 아래는 재지 않았습니다')}
                                    >
                                        {row.openSlot ? `${row.openSlot}위` : '10위 내 없음'}
                                    </strong>
                                </div>
                            </>
                        )}
                        <div title="지식인 질문 수 실측 — 질문이 많으면 사람들이 아직 답을 못 찾고 있다는 신호">
                            <span>지식인</span>
                            <strong>{typeof row.kinCount === 'number' ? formatCount(row.kinCount) : '—'}</strong>
                        </div>
                    </div>

                    {(row.serp?.slots || []).length > 0 && (
                        <details className="lw-slots">
                            <summary>
                                빈자리 근거 보기 — 잰 순간 블로그탭 상위 {(row.serp?.slots || []).length}개
                            </summary>
                            <ol>
                                {(row.serp?.slots || []).map((slot) => (
                                    <li key={slot.rank} className={slot.coverage < 0.6 ? 'open' : ''}>
                                        <b>{slot.rank}</b>
                                        <em>{slot.title}</em>
                                        <i>{slot.coverage < 0.6 ? '빈자리' : '찬자리'}</i>
                                    </li>
                                ))}
                            </ol>
                            <p>검색어를 제목이 60% 넘게 담으면 '찬자리'로 봅니다. 순위는 시간이 지나면 바뀝니다.</p>
                        </details>
                    )}

                    {/*
                      * 이슈 행의 자리 근거 — 잰 순간 블로그탭 상위 제목을 그대로 보인다(사장님 반증
                      * 2026-08-21 "어딜 봐서 빈자리야?"). 제목이 검색어를 정면으로 담았는지는 회차가
                      * 셌고(exactTitleHits), 여기서는 그 제목들을 검증용으로 늘어놓기만 한다.
                      */}
                    {variant === 'issue' && row.serp?.verdict && (row.serp.topTitles || []).length > 0 && (
                        <details className="lw-slots">
                            <summary>
                                자리 근거 보기 — 잰 순간 블로그탭 상위 {(row.serp.topTitles || []).length}개 제목
                                {row.serp.measuredAt ? ` (${measuredAgo(row.serp.measuredAt)})` : ''}
                            </summary>
                            <ol>
                                {(row.serp.topTitles || []).map((title, index) => (
                                    <li key={`${index}-${title}`} className={row.serp?.verdict === 'WINNABLE' ? 'open' : ''}>
                                        <b>{index + 1}</b>
                                        <em>{title}</em>
                                    </li>
                                ))}
                            </ol>
                            <p>
                                {row.serp.verdict === 'WINNABLE'
                                    ? `상위 ${row.serp.sampledTitles}개 중 검색어를 정면으로 담은 제목이 0건이었습니다 — 정면으로 쓰면 자리가 있습니다. 순위는 시간이 지나면 바뀝니다.`
                                    : `상위 ${row.serp.sampledTitles}개 중 정면 ${row.serp.exactTitleHits}건 · 부분 ${row.serp.partialTitleHits}건. 순위는 시간이 지나면 바뀝니다.`}
                            </p>
                        </details>
                    )}

                    {/* 지식인 최신 질문을 조회수 높은 순으로(사장님 지시 2026-08-19).
                        조회수는 질문 페이지 실측 — 글감의 원료다: 사람들이 정확히 뭘 묻는지가 여기 있다. */}
                    {(row.kinTop || []).length > 0 && (
                        <div className="lw-kin">
                            <em>지식인 최신 질문 · 조회순</em>
                            {/* 번호 목록(사장님 지시 2026-08-19 "최대 5개까지 1. 2. 3. 이런식으로"). */}
                            <ol className="lw-kin-list">
                                {row.kinTop!.slice(0, 5).map((q) => (
                                    <li key={q.link}>
                                        <a href={q.link} target="_blank" rel="noreferrer">{q.title}</a>
                                        {(typeof q.views === 'number' || typeof q.answers === 'number') && (
                                            <span className="lw-kin-views">
                                                {typeof q.views === 'number' ? `조회 ${formatCount(q.views)}` : ''}
                                                {typeof q.views === 'number' && typeof q.answers === 'number' ? ' · ' : ''}
                                                {typeof q.answers === 'number' ? `답변 ${q.answers}` : ''}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

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
                            {/* 클릭 = 키워드 분석기(사장님 지시 2026-08-20 "검색으로 가는 게 아니라 분석기로 가야지"). */}
                            {(row.keywordPool || []).map((item) => (
                                <button
                                    type="button"
                                    key={item.keyword}
                                    onClick={() => onAnalyze?.(item.keyword)}
                                    className={item.source === 'ai-verified' ? 'lw-mindmap-ai' : ''}
                                    title={`월 검색량 ${item.searchVolume?.toLocaleString() ?? '실측'} · 문서수 ${typeof item.documentCount === 'number' ? item.documentCount.toLocaleString() : '미측정'} · 누르면 분석`}
                                >
                                    {item.keyword}
                                    {/* 검색량/문서수 — 사장님 지정 표기(177,500 / 2,345). 문서수가 곧 경쟁이다. */}
                                    <span>
                                        {item.searchVolume ? item.searchVolume.toLocaleString() : '실측'}
                                        {typeof item.documentCount === 'number' ? ` / ${item.documentCount.toLocaleString()}` : ''}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/*
                      * 수익 결론 — 어느 카드에나 뜬다.
                      *
                      * 예전엔 애드센스 후보(88/126)만 이 칸이 있어 "나오는 게 있고 안 나오는 게
                      * 있다"(사장님 2026-08-20)로 보였다. 판정을 안 한 행에도 이유는 이미
                      * 있었다(adsenseReason) — 안 보여줬을 뿐이다. 빈 칸이 아니라 이유를 적는다.
                      */}
                    {!row.monetize && row.adsenseReason && (
                        <div className={`lw-mindmap-money lw-mindmap-money-${row.adsenseFit === false ? 'bad' : 'unknown'}`}>
                            <div className="lw-mindmap-money-head">
                                💰 광고 수익 관점
                                <strong>
                                    {row.adsenseFit === false ? '⛔ 광고 수익 안 나온다 — 애드센스 탈락' : '— 판정하지 않음'}
                                </strong>
                            </div>
                            <ul><li>{row.adsenseReason}</li></ul>
                        </div>
                    )}
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
                            aria-expanded={planOpen}
                            onClick={onTogglePlan}
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
                            onClick={onMindmap}
                            disabled={mindmap?.status === 'loading'}
                        >
                            {mindmap?.status === 'loading' ? '확장 중…' : '마인드맵 확장키워드'}
                            <small>내 클로드코드 구독</small>
                        </button>
                        {/* '그래프보기' 버튼은 뺐다(사장님 지시 2026-08-19) — 30일 실측이
                            카드 상단 중앙에 자동으로 그려지므로 버튼이 할 일이 없다. */}
                        {/*
                          * 'AI 서브 보강' 버튼은 뺐다(사장님 지시 2026-08-18) —
                          * 서브키워드가 회차 보강에서 이미 구워져 오므로 온디맨드
                          * 버튼은 같은 일을 두 번 시키는 군더더기였다.
                          */}
                        {/* '복사'는 키워드 옆 아이콘으로 옮겼다(사장님 지시 2026-08-19
                            "복사만 아래에 빠져있으니까 보기싫은데") — 4버튼 한 줄. */}
                    </div>

                    {/* 하단 트렌드 뷰는 그래프 자동화(카드 상단 스파크)로 대체 — 버튼과 함께 제거. */}

                    {/* 마인드맵 결과 — 중심 키워드에서 실측 확장어가 갈라져 나온다. */}
                    {mindmap?.status === 'offline' && (
                        <div className="lw-forge lw-forge-ai">
                            <div className="lw-forge-subs">
                                LEWORD 앱이 꺼져 있습니다 — 앱을 켜면 마인드맵이 <strong>내 클로드코드 구독</strong>으로
                                확장됩니다. <a href="/download">⬇ 앱 받기</a>
                            </div>
                        </div>
                    )}
                    {mindmap?.status === 'error' && (
                        <div className="lw-forge lw-forge-ai">
                            <div className="lw-forge-subs">확장 실패: {mindmap?.error}</div>
                        </div>
                    )}
                    {mindmap?.status === 'done' && (
                        <div className="lw-mindmap">
                            <div className="lw-mindmap-core">{row.keyword}</div>
                            {(mindmap?.data?.reasons || []).length > 0 && (
                                <ul className="lw-mindmap-why">
                                    {(mindmap?.data?.reasons || []).map((reason) => (
                                        <li key={reason.text}>
                                            {reason.text}
                                            <em>{reason.basis} 실측</em>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="lw-mindmap-branches">
                                {(mindmap?.data?.expansions || []).map((item) => (
                                    <button
                                        type="button"
                                        key={item.keyword}
                                        onClick={() => onAnalyze?.(item.keyword)}
                                        className={item.source === 'ai-verified' ? 'lw-mindmap-ai' : ''}
                                        title="누르면 키워드 분석기로 갑니다"
                                    >
                                        {item.keyword}
                                        <span>{item.searchVolume ? item.searchVolume.toLocaleString() : '자동완성'}</span>
                                    </button>
                                ))}
                            </div>
                            {(mindmap?.data?.expansions || []).length === 0 && (
                                <div className="lw-forge-subs">실존이 확인된 확장 검색어가 없습니다.</div>
                            )}
                            {/* 자동 연쇄 — 많이 찾는 연관을 스스로 이어서 분석한 결과. */}
                            {(mindmap?.related?.length ?? 0) > 0 && (
                                <div className="lw-mindmap-chain">
                                    <div className="lw-mindmap-chain-head">🔗 많이 찾는 연관 자동 분석</div>
                                    {(mindmap?.related || []).map((rel) => (
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

                            {/*
                              * 수익 결론은 카드 본문에 이미 그려진다 — 마인드맵에서 같은
                              * 블록을 또 그리던 중복 제거(사장님 지시 2026-08-19).
                              */}
                        </div>
                    )}

                    {locked && (
                        <div className="lw-lock" aria-hidden="true">
                            <span>🔒</span>
                        </div>
                    )}
                </article>
    );
}

export default PreemptionCard;
