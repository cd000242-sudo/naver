import { useEffect, useRef } from 'react';
import { buildActionPlan } from '../../lib/keywordActionPlan';
import { formatCount } from '../../lib/keywordApi';

/**
 * 키워드 한 건의 실행 계획 — 가운데 큰 창으로 연다.
 *
 * 왜 카드 안이 아니라 창인가: 카드 폭(약 280px)에 계획을 넣었더니 버튼이 두 줄로
 * 깨지고, 한 카드만 세로로 길어져 옆 카드 자리가 텅 비었다. 계획은 열 줄이 넘는
 * 읽을거리라 목록 칸에 들어갈 물건이 아니다.
 *
 * 내용 규칙은 그대로다 — **측정한 사실과 거기서 곧바로 따라오는 지침만**.
 * 문장 생성은 keywordActionPlan 이 하고, 이 파일은 배치와 여닫기만 맡는다.
 */

export type PlanRow = {
    keyword: string;
    topic: string;
    tier?: 'top3' | 'page1' | 'golden-ratio' | 'page1-weak' | 'contested';
    tierLabel?: string;
    openSlot?: number | null;
    intentLabel?: string;
    briefingRisk?: 'high' | 'medium' | 'low' | null;
    regulatoryLabel?: string;
    trendLabel?: string;
    timing?: string;
    serpSections?: string[];
    layoutBestFor?: 'naver-blog' | 'wordpress' | 'kin' | 'shopping' | null;
    layoutHeadline?: string;
    layoutRanked?: { surface: string; label: string; position: number }[];
    layoutAdsOnTop?: boolean;
    earlyMover?: boolean;
    earlyMoverReasons?: string[];
    searchVolume: number | null;
    documentCount: number | null;
    serp?: { medianDaysAgo?: number | null; topTitles?: string[] };
};

type Props = {
    row: PlanRow;
    onClose: () => void;
    onAnalyze: (keyword: string) => void;
    /** 사용자가 자기 눈으로 자리를 확인할 수 있어야 한다. */
    searchUrl: string;
};

function PreemptionPlan({ row, onClose, onAnalyze, searchUrl }: Props) {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        // 뒤 목록이 같이 스크롤되면 창을 닫은 줄 안다.
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previous;
        };
    }, [onClose]);

    const plan = buildActionPlan({
        keyword: row.keyword,
        topic: row.topic,
        tier: row.tier ?? null,
        openSlot: row.openSlot ?? null,
        searchVolume: row.searchVolume,
        documentCount: row.documentCount,
        intentLabel: row.intentLabel,
        briefingRisk: row.briefingRisk ?? null,
        regulatoryLabel: row.regulatoryLabel,
        trendLabel: row.trendLabel,
        timing: row.timing,
        sections: row.serpSections,
        medianDaysAgo: row.serp?.medianDaysAgo ?? null,
    });

    // 지금 그 자리를 차지한 글 제목. 무엇을 넘어야 하는지 보여 주는 가장 직접적인 사실이다.
    const rivals = row.serp?.topTitles || [];

    return (
        <div className="lw-plan-backdrop" role="presentation" onClick={onClose}>
            <div
                className="lw-plan-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${row.keyword} 실행 계획`}
                onClick={(event) => event.stopPropagation()}
            >
                <header className="lw-plan-head">
                    <div>
                        <span className="lw-topic-tag">{row.topic}</span>
                        {row.tierLabel && <span className="lw-plan-tier">{row.tierLabel}</span>}
                        <h3>{row.keyword}</h3>
                    </div>
                    <button ref={closeRef} type="button" className="lw-plan-close" onClick={onClose} aria-label="닫기">✕</button>
                </header>

                <div className="lw-plan-metrics">
                    <div><span>검색량</span><strong>{formatCount(row.searchVolume)}</strong></div>
                    <div><span>문서수</span><strong>{formatCount(row.documentCount)}</strong></div>
                    <div className="hot"><span>빈자리</span><strong>{row.openSlot ? `${row.openSlot}위` : '—'}</strong></div>
                </div>

                {row.earlyMover && (row.earlyMoverReasons || []).length > 0 && (
                    <section className="lw-plan-early">
                        <strong>지금이 선점 적기다</strong>
                        <ul>{(row.earlyMoverReasons || []).map((text) => <li key={text}>{text}</li>)}</ul>
                    </section>
                )}

                {plan.when && <p className="lw-plan-when">{plan.when}</p>}

                <div className="lw-plan-body">
                    {row.layoutHeadline && (
                        <section className="lw-plan-surface">
                            <strong>어디에 쓸 판인가</strong>
                            <p>{row.layoutHeadline}</p>
                            {(row.layoutRanked || []).length > 0 && (
                                <ol className="lw-surface-rank">
                                    {(row.layoutRanked || []).map((item) => (
                                        <li key={item.surface}>
                                            <span>{item.position}번째 묶음</span>{item.label}
                                        </li>
                                    ))}
                                </ol>
                            )}
                            {row.layoutAdsOnTop && <p className="lw-surface-note">광고가 맨 위를 차지한다 — 유기적 결과는 그만큼 아래로 밀린다</p>}
                        </section>
                    )}
                    {plan.why.length > 0 && (
                        <section>
                            <strong>왜 이 키워드인가</strong>
                            <ul>{plan.why.map((line) => <li key={line}>{line}</li>)}</ul>
                        </section>
                    )}

                    {plan.how.length > 0 && (
                        <section>
                            <strong>어떻게 쓸까</strong>
                            <ul>{plan.how.map((line) => <li key={line}>{line}</li>)}</ul>
                        </section>
                    )}

                    {rivals.length > 0 && (
                        <section>
                            <strong>지금 그 자리에 있는 글</strong>
                            <ol className="lw-plan-rivals">
                                {rivals.map((title, index) => <li key={`${index}-${title}`}>{title}</li>)}
                            </ol>
                        </section>
                    )}

                    {plan.caution.length > 0 && (
                        <section className="lw-plan-caution">
                            <strong>조심할 것</strong>
                            <ul>{plan.caution.map((line) => <li key={line}>{line}</li>)}</ul>
                        </section>
                    )}
                </div>

                <footer className="lw-plan-foot">
                    <button type="button" onClick={() => { onAnalyze(row.keyword); onClose(); }}>이 키워드 분석하기</button>
                    <a href={searchUrl} target="_blank" rel="noreferrer">검색결과 직접 확인</a>
                </footer>
            </div>
        </div>
    );
}

export default PreemptionPlan;
