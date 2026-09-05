import { useEffect, useRef, useState } from 'react';
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
    searchVolumeLt10?: boolean;
    documentCount: number | null;
    /** 데이터랩 최근 7일 수요가 잡혔는가(이슈 행). 트래픽 근거로 쓴다. */
    hasLiveDemand?: boolean;
    demandStatus?: string;
    serp?: {
        medianDaysAgo?: number | null;
        topTitles?: string[];
        verdict?: 'WINNABLE' | 'CONTESTED' | 'LOCKED' | 'NO_DATA';
        exactTitleHits?: number;
        sampledTitles?: number;
    };
    /*
     * 집필 브리핑 재료(2026-08-19 재구성) — 카드와 겹치던 지표·근거를 걷어내고
     * "글을 실제로 쓰게 만드는 것"만 남기라는 사장님 지시. 전부 회차 실측이다.
     */
    whySearch?: { text: string; basis?: string } | null;
    titles?: {
        seo?: { text: string; frame?: string; basis?: string };
        home?: { text: string; frame?: string; basis?: string };
    } | null;
    kinTop?: Array<{ title: string; link: string; views?: number | null; answers?: number | null }> | null;
    subKeywords?: { keyword: string; searchVolume: number | null; frame?: string }[];
    keywordPool?: Array<{ keyword: string; searchVolume: number | null; documentCount?: number | null }> | null;
};

type Props = {
    row: PlanRow;
    onClose: () => void;
    onAnalyze: (keyword: string) => void;
    /** 사용자가 자기 눈으로 자리를 확인할 수 있어야 한다. */
    searchUrl: string;
    /** 지금 실검에 살아있으면 그 순위·진입 경과(이슈 탭이 대조해 넘긴다). 트래픽 근거. */
    live?: { rank: number; ago: string } | null;
};

function PreemptionPlan({ row, onClose, onAnalyze, searchUrl, live }: Props) {
    const closeRef = useRef<HTMLButtonElement>(null);
    /** 방금 복사한 제목 — 제목은 복사해서 바로 쓰라고 있는 것이다. */
    const [copiedTitle, setCopiedTitle] = useState('');

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

    /*
     * 이 키워드로 트래픽을 어떻게 끄는가 — 초보자 3단계(사장님 2026-09-06
     * "이 키워드로 어떻게 트래픽을 끌고 오는지 초보자들은 모른다. 그냥 글만 적는다고
     * 되는 게 아니다"). 전부 회차 실측을 문장으로 옮긴 것이고, 없는 근거는 넣지 않는다.
     *   ① 수요가 있다(왜 트래픽인가): 검색량·데이터랩 7일·지금 실검
     *   ② 자리가 있다(왜 지금인가): 블로그탭 상위 10 정면글 수
     *   ③ 그래서 이렇게: 제목으로 선점 + 빠른 발행
     */
    const trafficSteps: Array<{ head: string; body: string }> = [];
    const demandBits: string[] = [];
    if (live) demandBits.push(`지금 실시간 검색어 ${live.rank}위${live.ago ? `(${live.ago} 진입)` : ''}로 사람이 몰리는 중`);
    if (typeof row.searchVolume === 'number') demandBits.push(`검색광고 실측 월 ${formatCount(row.searchVolume)}회`);
    else if (row.searchVolumeLt10) demandBits.push('검색광고 실측 월 10회 미만(신생 검색어)');
    if (row.hasLiveDemand) demandBits.push('데이터랩 최근 7일 수요 확인');
    if (demandBits.length > 0) {
        trafficSteps.push({
            head: '① 수요가 있다 — 그래서 트래픽이 된다',
            body: `${demandBits.join(' · ')}. 아무도 안 찾는 말은 상위에 올라도 트래픽이 없습니다. 이 키워드는 지금 검색되고 있는 게 실측으로 확인됐습니다.`,
        });
    }
    if (row.serp?.verdict === 'WINNABLE' && typeof row.serp.sampledTitles === 'number') {
        trafficSteps.push({
            head: '② 자리가 있다 — 그래서 내 글이 올라간다',
            body: `블로그탭 상위 ${row.serp.sampledTitles}개 중 이 검색어를 제목에 정면으로 담은 글이 ${row.serp.exactTitleHits ?? 0}건입니다. 정면으로 쓴 글이 없으니, 제목만 맞추면 그 빈자리를 받습니다 — 글을 잘 써서가 아니라 자리가 비어서입니다.`,
        });
    }
    trafficSteps.push({
        head: '③ 그래서 이렇게 — 제목 선점 + 빠른 발행',
        body: `${(row.titles?.seo || row.titles?.home) ? '아래 제목을 그대로 복사해 쓰고, ' : '검색어를 제목 앞자리에 넣고, '}본문은 아래 지식인 질문에 답하며 서브키워드로 넓히세요. 실시간 이슈는 시간이 관건입니다 — 남들이 쓰기 전에 지금 올리는 게 트래픽을 가장 많이 받습니다.`,
    });

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

                {/*
                  * 검색량·문서수·빈자리 지표와 '선점 적기'·'왜 이 키워드' 근거는
                  * 뺐다(사장님 지시 2026-08-19: "중복되는 게 있으면 굳이 있을 필요성을
                  * 못 느끼겠는데") — 전부 카드가 이미 말한 사실이다. 이 창은 카드가
                  * 못 하는 것, 즉 **글을 실제로 쓰게 만드는 브리핑**만 한다.
                  */}
                {plan.when && <p className="lw-plan-when">{plan.when}</p>}

                <div className="lw-plan-body">
                    {/* 트래픽을 어떻게 끄나 — 이 창의 첫 자리(사장님 2026-09-06: 틈새의 목적은 트래픽). */}
                    <section className="lw-plan-traffic">
                        <strong>이 키워드로 트래픽을 어떻게 끄나</strong>
                        <ol>
                            {trafficSteps.map((step) => (
                                <li key={step.head}>
                                    <b>{step.head}</b>
                                    <span>{step.body}</span>
                                </li>
                            ))}
                        </ol>
                    </section>

                    {row.whySearch?.text && (
                        <section className="lw-plan-why">
                            <strong>글의 도입 각도 — 왜 지금 검색되나</strong>
                            <p>{row.whySearch.text}</p>
                            {row.whySearch.basis && <small>{row.whySearch.basis}</small>}
                        </section>
                    )}

                    {(row.titles?.seo || row.titles?.home) && (
                        <section className="lw-plan-titles">
                            <strong>제목 — 복사해서 그대로 쓰세요</strong>
                            {[
                                { label: 'SEO', title: row.titles?.seo },
                                { label: '홈판', title: row.titles?.home },
                            ].map(({ label, title }) => title?.text && (
                                <div key={label} className="lw-plan-title-row">
                                    <span>{label}</span>
                                    <em>{title.text}</em>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard?.writeText(title.text);
                                            setCopiedTitle(title.text);
                                            window.setTimeout(() => setCopiedTitle(''), 1400);
                                        }}
                                    >{copiedTitle === title.text ? '복사됨' : '복사'}</button>
                                </div>
                            ))}
                        </section>
                    )}

                    {(row.kinTop || []).length > 0 && (
                        <section>
                            <strong>본문에서 답할 질문 — 지식인 실측</strong>
                            <ol className="lw-plan-rivals">
                                {row.kinTop!.slice(0, 5).map((q) => (
                                    <li key={q.link}>
                                        <a href={q.link} target="_blank" rel="noreferrer">{q.title}</a>
                                        {typeof q.views === 'number' && <small> 조회 {formatCount(q.views)}{typeof q.answers === 'number' ? ` · 답변 ${q.answers}` : ''}</small>}
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {((row.subKeywords || []).length > 0 || (row.keywordPool || []).length > 0) && (
                        <section>
                            <strong>소제목·다음 글감 — 실측 서브키워드</strong>
                            <div className="lw-plan-subs">
                                {(row.subKeywords || []).map((sub) => (
                                    <em key={sub.keyword}>
                                        {sub.keyword}{typeof sub.searchVolume === 'number' ? ` (${formatCount(sub.searchVolume)})` : ''}
                                    </em>
                                ))}
                                {(row.keywordPool || [])
                                    .filter((p) => !(row.subKeywords || []).some((s) => s.keyword === p.keyword))
                                    .slice(0, 8)
                                    .map((p) => (
                                        <em key={p.keyword} className="lw-plan-pool">
                                            {p.keyword}{typeof p.searchVolume === 'number' ? ` (${formatCount(p.searchVolume)})` : ''}
                                        </em>
                                    ))}
                            </div>
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
                            <strong>넘어야 할 글 — 지금 그 자리에 있는 제목</strong>
                            <ol className="lw-plan-rivals">
                                {rivals.map((title, index) => <li key={`${index}-${title}`}>{title}</li>)}
                            </ol>
                        </section>
                    )}

                    {row.layoutHeadline && (
                        <section className="lw-plan-surface">
                            <strong>어디에 쓸 판인가</strong>
                            <p>{row.layoutHeadline}</p>
                            {row.layoutAdsOnTop && <p className="lw-surface-note">광고가 맨 위를 차지한다 — 유기적 결과는 그만큼 아래로 밀린다</p>}
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
