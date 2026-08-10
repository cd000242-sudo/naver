import { useEffect, useMemo, useState } from 'react';
import { goldenIndex } from '../../lib/goldenIndex';
import PreemptionPlan from './PreemptionPlan';
import { EVIDENCE_ICON, naverSearchUrl, SURFACE_TAG, TIER_BADGE, TIER_RANK } from './preemptionMeta';
import { formatCount } from '../../lib/keywordApi';
import { hasAnyUserKey } from '../../lib/userKeys';
import { TabIntro } from './LewordShared';

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
};

const BOARD_URL = '/data/preemption-board.json';
/** 키·라이선스 없이 온전히 보이는 건수. 나머지는 흐림 처리된다. */
const FREE_PREVIEW_ROWS = 5;

function GoldenTab({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
    const [board, setBoard] = useState<Board | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
    const [topic, setTopic] = useState('전체');
    const [query, setQuery] = useState('');
    const unlocked = useMemo(() => hasAnyUserKey(), []);
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
                setBoard({ ...data, rows });
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
            if (topic !== '전체' && row.topic !== topic) return false;
            return !needle || row.keyword.toLowerCase().includes(needle);
        });
        /*
         * 보드는 주제 순으로 저장된다. 그대로 내면 '전체' 첫 화면이 알파벳 순 첫 주제로
         * 채워져, 제일 확실한 자리가 한참 아래에 묻힌다. 확실한 층부터 올린다.
         * 같은 층이면 빈자리가 앞쪽인 것, 그 다음 검색량이 많은 것 순이다.
         */
        return [...filtered].sort((a, b) => {
            // 선점 적기가 맨 위다. "자리가 비었다"보다 "뜨는 중인데 아직 비었다"가 값나간다.
            if (Boolean(a.earlyMover) !== Boolean(b.earlyMover)) return a.earlyMover ? -1 : 1;
            /*
             * 그 다음이 AI 브리핑 유무 — 층보다 먼저다(게이트와 같은 순서).
             * 브리핑에서 답을 얻으면 자리가 좋아도 클릭이 안 온다.
             * 못 잰 것(undefined)은 "있다"로 치지 않는다.
             */
            const brief = (row: PreemptionRow) => (row.serp?.hasAiBriefing === true ? 1 : 0);
            if (brief(a) !== brief(b)) return brief(a) - brief(b);
            const rank = (row: PreemptionRow) => TIER_RANK[row.tier || 'contested'] ?? 9;
            if (rank(a) !== rank(b)) return rank(a) - rank(b);
            const slot = (row: PreemptionRow) => row.openSlot ?? 99;
            if (slot(a) !== slot(b)) return slot(a) - slot(b);
            return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
        });
    }, [board, topic, query]);

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

                    <div className="lw-segment lw-segment-wrap lw-topic-chips" role="group" aria-label="블로그 주제">
                        <button type="button" className={topic === '전체' ? 'on' : ''} onClick={() => setTopic('전체')}>
                            전체 <em>{board.rows.length}</em>
                        </button>
                        {topics.map(([label, count]) => (
                            <button
                                key={label}
                                type="button"
                                className={topic === label ? 'on' : ''}
                                onClick={() => setTopic(label)}
                            >{label} <em>{count}</em></button>
                        ))}
                    </div>

                    {!unlocked && rows.length > FREE_PREVIEW_ROWS && (
                        <div className="lw-note lw-note-plain">
                            무료로는 상위 {FREE_PREVIEW_ROWS}건까지 보입니다.
                            <strong style={{ display: 'inline', marginLeft: 4 }}>내 API 키를 등록하면 전체가 열립니다</strong>
                            — 자기 쿼터를 쓰므로 조회 제한도 없습니다.
                        </div>
                    )}

                    <div className="lw-grid">
                        {rows.map((row, index) => {
                            const locked = !unlocked && index >= FREE_PREVIEW_ROWS;
                            return (
                                <article key={`${row.topic}-${row.keyword}`} className={`lw-card lw-card-pre${locked ? ' locked' : ''}`}>
                                    <div className="lw-card-tags">
                                        <span className="lw-topic-tag">{row.topic}</span>
                                        {row.earlyMover && <span className="lw-early-tag">지금이 선점 적기</span>}
                                        {row.layoutBestFor && (
                                            <span className={`lw-surface-tag surface-${row.layoutBestFor}`}>
                                                {SURFACE_TAG[row.layoutBestFor]}
                                            </span>
                                        )}
                                        {row.tier && TIER_BADGE[row.tier] && (
                                            <span className={`lw-tier-tag ${TIER_BADGE[row.tier].cls}`}>
                                                {TIER_BADGE[row.tier].text}
                                            </span>
                                        )}
                                        {/* 구매 검토형이 블로그에 제일 값어치가 크다(리서치 §3). */}
                                        {row.intentLabel && row.intentLabel !== '분류 안 됨' && (
                                            <span className="lw-intent-tag">{row.intentLabel}</span>
                                        )}
                                        {row.trendLabel && row.trendLabel !== '판정불가' && (
                                            <span className="lw-trend-tag">{row.trendLabel}</span>
                                        )}
                                        {/* 자리가 비어 있어도 AI 가 답을 대신하면 클릭이 안 온다. */}
                                        {row.briefingRisk === 'high' && (
                                            <span className="lw-warn-tag">AI 답변 잠식</span>
                                        )}
                                        {row.regulatoryLabel && (
                                            <span className="lw-warn-tag">{row.regulatoryLabel}</span>
                                        )}
                                    </div>
                                    {(() => {
                                        /* 황금지수는 등급 SSoT 를 옮긴 것이다. 못 쟀으면 아무 색도 주지 않는다. */
                                        const index = goldenIndex(row.searchVolume, row.documentCount);
                                        return index
                                            ? (
                                                <h3 className={`lw-card-gold lw-gold-${index.tier}`}>
                                                    <span className="lw-gold-mini">{index.label} {index.ratio!.toFixed(1)}</span>
                                                    {row.keyword}
                                                </h3>
                                            )
                                            : <h3>{row.keyword}</h3>;
                                    })()}

                                    <ul className="lw-evidence">
                                        {(row.earlyMoverReasons || []).map((text) => (
                                            <li key={text} className="lw-evidence-early">
                                                <span aria-hidden="true">↗</span>{text}
                                            </li>
                                        ))}
                                        {row.evidence.map((item) => (
                                            <li key={item.code}>
                                                <span aria-hidden="true">{EVIDENCE_ICON[item.code] || '·'}</span>
                                                {item.text}
                                            </li>
                                        ))}
                                    </ul>

                                    {row.timing && <p className="lw-timing">{row.timing}</p>}

                                    <div className="lw-card-metrics">
                                        <div><span>검색량</span><strong>{formatCount(row.searchVolume)}</strong></div>
                                        <div><span>문서수</span><strong>{formatCount(row.documentCount)}</strong></div>
                                        <div className="hot">
                                            <span>빈자리</span>
                                            <strong>{row.openSlot ? `${row.openSlot}위` : '—'}</strong>
                                        </div>
                                    </div>

                                    <div className="lw-card-actions">
                                        <button
                                            type="button"
                                            aria-expanded={openPlan === row.keyword}
                                            onClick={() => setOpenPlan(openPlan === row.keyword ? '' : row.keyword)}
                                        >어떻게 쓸까</button>
                                        <a href={naverSearchUrl(row.keyword)} target="_blank" rel="noreferrer">검색결과 확인</a>
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
