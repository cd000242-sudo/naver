import { useEffect, useMemo, useState } from 'react';
import {
    fetchRadarSearch, formatCount,
    type RadarAnalysis, type RadarEvaluated, type RadarGatedSite,
} from '../../lib/keywordApi';
import { loadUserKeys } from '../../lib/userKeys';
import { BRIDGE_OFFLINE_NOTE, BRIDGE_OUTDATED_NOTE, bridgeFailureNote, bridgeKinAnswer, bridgeRadarAnalyze, bridgeRadarEvaluate } from '../../lib/bridge';
import { TabIntro } from './LewordShared';

/*
 * 앱 경유 평가의 종합점수 — **정본은 워커의 RADAR_CONFIG** 다.
 * 두 판이 갈라지면 같은 후보가 사이트에서와 앱에서 다르게 판정된다.
 * 워커 쪽을 고치면 여기도 같이 고칠 것.
 */
const RADAR_WEIGHTS = {
    searchDemand: 0.15, commercialValue: 0.20, problemUrgency: 0.15,
    externalOpportunity: 0.20, siteFit: 0.15, freshness: 0.10, lowCompetitionBonus: 0.05,
};
const RADAR_THRESHOLDS = { now: 80, watch: 60 };

function scoreFromAxes(a: Record<string, number>): { score: number; action: 'NOW' | 'WATCH' | 'SKIP' } {
    const w = RADAR_WEIGHTS;
    const score = Math.round(
        (a.relevance || 0) * w.searchDemand
        + (a.commercialValue || 0) * w.commercialValue
        + (a.urgency || 0) * w.problemUrgency
        + (a.trafficPotential || 0) * w.externalOpportunity
        + (a.contentMatch || 0) * w.siteFit
        + (a.relevance || 0) * w.freshness
        + (100 - (a.spamRisk || 0)) * w.lowCompetitionBonus,
    );
    const action = score >= RADAR_THRESHOLDS.now ? 'NOW' : score >= RADAR_THRESHOLDS.watch ? 'WATCH' : 'SKIP';
    return { score, action };
}

/**
 * 외부유입 레이더 — 내 글 주소 하나로 "이 글로 사람을 데려올 수 있는 바깥 자리"를
 * 찾는다(사장님 명령서 2026-08-20, PHASE 1).
 *
 * 흐름: 글 분석 → 네이버 4판 검색(지식인·카페·블로그·웹) → AI 평가 →
 * NOW/WATCH/SKIP. 전부 "기회 탐색"까지다 — 답변·댓글 게시는 사람이 직접 한다.
 * 자동 게시는 만들지 않는다(약관·계정 안전).
 */

type Phase = 'idle' | 'analyzing' | 'searching' | 'evaluating' | 'done';

/** 처리 상태는 이 브라우저에만 남는다 — 서버에 개인 작업 기록을 쌓지 않는다. */
const MARKS_KEY = 'leaderspro.radar.marks';
type Marks = Record<string, 'done' | 'dismissed'>;
function loadMarks(): Marks {
    try { return JSON.parse(localStorage.getItem(MARKS_KEY) || '{}'); } catch { return {}; }
}

const SOURCE_LABEL: Record<string, string> = {
    kin: '지식인', cafearticle: '카페', blog: '블로그', webkr: '웹문서', community: '커뮤니티',
};
const PROVIDER_LABEL: Record<string, string> = {
    kin: '지식인', cafearticle: '카페', blog: '블로그', webkr: '웹문서', community: '커뮤니티(네이버 밖)',
};

/*
 * 링크 정책 — 그 판에 링크를 달아도 되는가(사장님 지시 2026-08-21).
 * 확인된 것만 단정한다. 모르면 '미확인'이라고 적고 사람이 판단하게 둔다 —
 * 지어내면 계정이 날아간다.
 */
const POLICY_LABEL: Record<string, string> = {
    ok: '링크 가능', careful: '링크 조심', banned: '링크 막힘', unknown: '정책 미확인',
};

const GROUPS = [
    { id: 'NOW', label: '지금 답하면 유입', icon: '🔥', hint: '질문이 살아 있고 내 글이 해결책 — 오늘 답변 달 자리' },
    { id: 'WATCH', label: '지켜볼 자리', icon: '🟡', hint: '관련은 있지만 긴급하지 않음 — 여유 있을 때' },
    { id: 'SKIP', label: '건너뜀', icon: '⚫', hint: 'AI 가 걸러낸 자리 — 근거는 카드에 적혀 있습니다' },
] as const;

function canonical(link: string): string {
    return link.replace(/[?#].*$/, '');
}

/**
 * @param initialUrl RPM 탭에서 [외부유입]으로 넘어온 글 주소.
 *   RPM 을 보고 "이 글에 사람을 데려올까"를 정한 다음 여기로 온다
 *   (사장님 지시 2026-08-28: "이걸로 외부유입을 이 글로 해야 될지 말지 판단이 선다").
 */
function RadarTab({ initialUrl }: { initialUrl?: string } = {}) {
    const [url, setUrl] = useState(initialUrl || '');
    const [phase, setPhase] = useState<Phase>('idle');
    /* 다른 탭에서 글을 들고 오면 칸을 그 글로 바꾼다 — 사용자가 다시 붙여넣지 않게. */
    useEffect(() => { if (initialUrl) setUrl(initialUrl); }, [initialUrl]);
    const [error, setError] = useState('');
    const [analysis, setAnalysis] = useState<RadarAnalysis | null>(null);
    const [providerStatus, setProviderStatus] = useState<Record<string, string>>({});
    const [counts, setCounts] = useState<{ found: number; deduped: number } | null>(null);
    /** 훑지 않은 판 — 미리 가입해 두면 열리는 곳이 있다. */
    const [gatedSites, setGatedSites] = useState<RadarGatedSite[]>([]);
    const [items, setItems] = useState<RadarEvaluated[]>([]);
    const [marks, setMarks] = useState<Marks>(loadMarks);
    const [showDismissed, setShowDismissed] = useState(false);

    /*
     * 답변 작업대(사장님 2026-09-06 "지식인처럼 바로 답변을 만들어서 복사·붙여넣기,
     * 링크 포함해서"). "지금 답하면 유입"인데 답을 손으로 쓰게 두면 그 자리를 놓친다.
     * 지식인 답변 초안(kin-answer)을 그대로 재사용한다 — 내 구독으로 돌고, 내 글
     * 링크를 답변에 넣어 준다.
     */
    const [answerFor, setAnswerFor] = useState<RadarEvaluated | null>(null);
    const [draft, setDraft] = useState('');
    const [genBusy, setGenBusy] = useState(false);
    const [genNote, setGenNote] = useState('');
    const [copied, setCopied] = useState(false);
    const [withLink, setWithLink] = useState(true);

    const openAnswer = (item: RadarEvaluated) => {
        setAnswerFor(item);
        setDraft('');
        setGenNote('');
        setCopied(false);
        setWithLink(item.linkPolicy !== 'banned');
    };
    const generateAnswer = async () => {
        if (!answerFor || genBusy) return;
        setGenBusy(true);
        setGenNote('');
        const body = [answerFor.title, answerFor.excerpt].filter(Boolean).join('\n');
        const input = {
            title: answerFor.title,
            body: body || answerFor.title,
            withLink: withLink && answerFor.linkPolicy !== 'banned',
            blogUrl: url.trim(),
        };
        /*
         * 답변은 이 PC 의 LEWORD 앱이 내 구독으로 만든다(사장님 결정 2026-09-16 "브리지 전용으로 정리").
         * 사이트는 구독 토큰을 들고 있지 않다. 앱이 꺼져 있거나 구버전이면 그 사실을 그대로 알린다.
         */
        const viaApp = await bridgeKinAnswer({ ...input, provider: String(loadUserKeys().aiProvider || '') });
        setGenBusy(false);
        if (viaApp.status === 'ok') { setDraft(viaApp.answer); setCopied(false); return; }
        setGenNote(bridgeFailureNote(viaApp, '생성 실패'));
    };
    const copyAnswer = () => {
        navigator.clipboard?.writeText(draft)
            .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); })
            .catch(() => { /* 막힌 브라우저면 직접 선택 복사 */ });
    };

    const running = phase === 'analyzing' || phase === 'searching' || phase === 'evaluating';

    const mark = (link: string, value: 'done' | 'dismissed' | null) => {
        setMarks((prev) => {
            const next = { ...prev };
            if (value) next[canonical(link)] = value;
            else delete next[canonical(link)];
            try { localStorage.setItem(MARKS_KEY, JSON.stringify(next)); } catch { /* 저장 실패해도 화면은 동작 */ }
            return next;
        });
    };

    const run = async (event: React.FormEvent) => {
        event.preventDefault();
        const target = url.trim();
        if (!target || running) return;
        setError('');
        setAnalysis(null);
        setItems([]);
        setCounts(null);
        setProviderStatus({});

        // ① 글 분석 — 핵심키워드(검색량 실측)·의도·돈각도·확장 질의
        setPhase('analyzing');
        /*
         * 분석은 AI 라 이 PC 의 LEWORD 앱으로만 돈다(사장님 결정 2026-09-16 "브리지 전용으로 정리").
         * 앱이 워커에서 글 근거·프롬프트를 받아 내 구독으로 분석하고, 검색량은 내 실측 키로 잰다.
         * 앱이 꺼져 있으면 여기서 멈춘다 — 다음 걸음의 검색어가 이 분석에서 나오기 때문이다.
         */
        const analyzed = await bridgeRadarAnalyze({
            url: target,
            keys: loadUserKeys() as Record<string, string>,
            provider: String(loadUserKeys().aiProvider || ''),
        });
        if (analyzed.status !== 'ok') {
            setPhase('idle');
            setError(analyzed.status === 'error'
                ? `글을 분석하지 못했습니다: ${analyzed.message}`
                : `글 분석은 AI 라 앱이 있어야 돕니다 — ${bridgeFailureNote(analyzed)}`);
            return;
        }
        const meta = analyzed.result.analysis;
        setAnalysis(meta);

        // ② 검색 — 프로바이더 일부가 죽어도 나머지로 계속한다(§26)
        setPhase('searching');
        const searched = await fetchRadarSearch(
            meta.queries,
            meta.coreKeywords.map((k) => k.keyword),
            meta.shortQueries || [],
        );
        if (!searched.ok || !searched.data) {
            setPhase('idle');
            setError(searched.message || '검색에 실패했습니다.');
            return;
        }
        setProviderStatus(searched.data.providerStatus || {});
        setCounts({ found: searched.data.totalFound, deduped: searched.data.afterDedupe });
        setGatedSites(searched.data.gatedSites || []);
        if (searched.data.items.length === 0) {
            setPhase('done');
            return;
        }

        // ③ AI 평가 — 이 PC 의 LEWORD 앱이 내 구독으로 판을 평가한다(사장님 결정 2026-09-16 "브리지 전용으로 정리")
        setPhase('evaluating');
        const viaApp = await bridgeRadarEvaluate({
            items: searched.data.items.map((item) => ({
                title: String(item.title || ''),
                source: String(item.source || ''),
                link: String(item.link || ''),
            })),
            myTitle: meta.title,
            mySummary: meta.moneyAngle,
            provider: String(loadUserKeys().aiProvider || ''),
        });
        if (viaApp.ok) {
            const merged: RadarEvaluated[] = searched.data.items.map((item, index) => {
                const row = viaApp.evaluations.find((e) => Number(e.index) === index + 1);
                if (!row) return { ...item, evaluated: false };
                const axes = row as unknown as Record<string, number>;
                const { score, action } = scoreFromAxes(axes);
                return {
                    ...item,
                    evaluated: true,
                    relevance: axes.relevance, urgency: axes.urgency,
                    commercialValue: axes.commercialValue, trafficPotential: axes.trafficPotential,
                    contentMatch: axes.contentMatch, spamRisk: axes.spamRisk,
                    score, recommendedAction: action,
                    reason: String(row.why || ''),
                };
            });
            setItems(merged);
            setPhase('done');
            setError('');
            return;
        }
        // 평가가 죽어도 검색 결과는 보여준다 — 빈 화면이 최악이다(§27)
        setItems(searched.data.items.map((item) => ({ ...item, evaluated: false })));
        setPhase('done');
        setError(viaApp.reason === 'failed'
            ? `판 평가를 못 했습니다: ${viaApp.message || '앱이 평가를 돌려주지 못했습니다.'} — 검색 결과는 그대로 보여드립니다.`
            : `판 평가는 AI 라 앱이 있어야 돕니다 — ${viaApp.reason === 'outdated' ? BRIDGE_OUTDATED_NOTE : BRIDGE_OFFLINE_NOTE} 검색 결과는 그대로 보여드립니다.`);
    };

    const grouped = useMemo(() => {
        const visible = items.filter((item) => showDismissed || marks[canonical(item.link)] !== 'dismissed');
        return {
            NOW: visible.filter((i) => i.evaluated && i.recommendedAction === 'NOW').sort((a, b) => (b.score || 0) - (a.score || 0)),
            WATCH: visible.filter((i) => i.evaluated && i.recommendedAction === 'WATCH').sort((a, b) => (b.score || 0) - (a.score || 0)),
            SKIP: visible.filter((i) => i.evaluated && i.recommendedAction === 'SKIP').sort((a, b) => (b.score || 0) - (a.score || 0)),
            rest: visible.filter((i) => !i.evaluated),
        };
    }, [items, marks, showDismissed]);

    const dismissedCount = items.filter((item) => marks[canonical(item.link)] === 'dismissed').length;
    const failedProviders = Object.entries(providerStatus).filter(([, v]) => v !== 'ok');

    return (
        <div className="lw-radar">
            <TabIntro
                title="외부유입 레이더"
                desc="내 글 주소 하나면 됩니다 — 지식인·카페는 물론 디시·클리앙·더쿠 같은 네이버 밖 커뮤니티까지 훑어 지금 답할 자리를 찾아 줍니다. 판마다 링크를 달아도 되는지도 함께 적습니다. 게시는 직접 하세요(자동 게시 없음)."
                source={loadUserKeys().brightDataToken
                    ? '지식인·카페 + 커뮤니티 31판(구글 색인) + 검색광고 검색량 실측 + AI 평가'
                    : '지식인·카페 + 검색광고 검색량 실측 + AI 평가 · 커뮤니티 31판은 내 API 키 탭에 Bright Data 토큰을 넣으면 함께 훑습니다'}
            />

            <form className="lw-search" onSubmit={run}>
                <input
                    type="url"
                    value={url}
                    placeholder="내 글 주소 — 예: https://leadernam.com/…"
                    onChange={(event) => setUrl(event.target.value)}
                    disabled={running}
                    required
                />
                <button type="submit" disabled={running || !url.trim()}>
                    {running ? '레이더 도는 중…' : '레이더 실행'}
                </button>
            </form>

            {running && (
                <div className="lw-radar-progress" role="status">
                    <span className={phase === 'analyzing' ? 'on' : 'ok'}>① 글 분석</span>
                    <span className={phase === 'searching' ? 'on' : phase === 'evaluating' ? 'ok' : ''}>② 질문 판 검색</span>
                    <span className={phase === 'evaluating' ? 'on' : ''}>③ AI 평가</span>
                </div>
            )}

            {error && (
                <div className="lw-note lw-note-error"><p>{error}</p></div>
            )}

            {analysis && (
                <section className="lw-panel lw-radar-brief">
                    <div className="lw-panel-head">
                        <h2>{analysis.title || '제목 없는 글'}</h2>
                        {counts && <span>검색 {counts.found}건 → 중복 제거 {counts.deduped}건</span>}
                    </div>
                    <div className="lw-radar-kws">
                        {analysis.coreKeywords.map((k) => (
                            <span key={k.keyword} className="lw-radar-kw">
                                {k.keyword}
                                {/*
                                  검색량이 없어도 문서수는 잡힌다 — "측정 불가" 대신 있는 실측을
                                  보여준다(사장님 2026-09-06). 둘 다 없을 때만 검색량 없음으로 둔다.
                                */}
                                <b>{k.searchVolume == null ? '검색량 미집계' : `월 ${formatCount(k.searchVolume)}`}</b>
                                {k.documentCount != null && <b className="doc">문서 {formatCount(k.documentCount)}</b>}
                            </span>
                        ))}
                    </div>
                    {analysis.audience && (
                        <p className="lw-radar-audience">이 글을 찾는 사람 · {analysis.audience}</p>
                    )}
                    {analysis.moneyAngle && analysis.moneyAngle !== '없음' && (
                        <p className="lw-radar-money">돈과 닿는 지점 · {analysis.moneyAngle}</p>
                    )}
                    {(analysis.answers || []).length > 0 && (
                        <details className="lw-radar-anatomy">
                            <summary>이 글이 답하는 것 {(analysis.answers || []).length}가지 — 답변 각도의 재료</summary>
                            <ul>
                                {(analysis.answers || []).map((row) => (
                                    <li key={row.q}>
                                        <b>{row.q}</b>
                                        <span>{row.a}</span>
                                    </li>
                                ))}
                            </ul>
                            {(analysis.notCovered || []).length > 0 && (
                                <div className="lw-radar-gap">
                                    <b>이 글이 답하지 못하는 것</b>
                                    <p>{(analysis.notCovered || []).join(' · ')}</p>
                                    <em>이런 질문에는 답을 달아도 유입이 안 붙습니다 — 글을 먼저 채우세요.</em>
                                </div>
                            )}
                        </details>
                    )}
                    {providerStatus.community === 'needs-token' && (
                        /*
                         * 커뮤니티는 방문자 본인 Bright Data 키로만 훑는다. 서버에 키를
                         * 두면 누가 돌리든 한 사람의 크레딧이 나간다(사장님 지적 2026-08-21).
                         * 키가 없다고 기능이 죽지는 않는다 — 네이버 4판 결과는 그대로 나온다.
                         */
                        <p className="lw-radar-needkey">
                            지식인·카페만 훑었습니다. 디시·아하·아카라이브 같은 <b>커뮤니티 31판</b>까지 보려면{' '}
                            <a href="?tab=keys">내 API 키</a> 탭에 Bright Data 토큰을 넣어 주세요 —{' '}
                            가입하면 매달 5,000건이 공짜라 레이더를 190회쯤 돌릴 수 있습니다.
                        </p>
                    )}
                    {failedProviders.length > 0 && (
                        <p className="lw-radar-partial">
                            일부 검색판 실패: {failedProviders.map(([k]) => PROVIDER_LABEL[k] || k).join(', ')} — 나머지 결과로 계속했습니다.
                        </p>
                    )}
                </section>
            )}

            {phase === 'done' && items.length === 0 && !error && (
                <div className="lw-note">
                    <strong>아직 공략할 자리가 안 보입니다</strong>
                    <p>이 글의 핵심 검색어로 최근 올라온 질문이 없습니다. 글이 새 주제라면 곧 생깁니다 — 며칠 뒤 다시 돌려 보세요.</p>
                </div>
            )}

            {phase === 'done' && items.length > 0 && GROUPS.map((group) => {
                const list = grouped[group.id];
                if (group.id !== 'NOW' && list.length === 0) return null;
                return (
                    <section key={group.id} className={`lw-panel lw-radar-group lw-radar-${group.id.toLowerCase()}`}>
                        <div className="lw-panel-head">
                            <h2><span aria-hidden="true">{group.icon}</span> {group.label} <em>{list.length}</em></h2>
                            <span>{group.hint}</span>
                        </div>
                        {group.id === 'NOW' && list.length === 0 && (
                            <p className="lw-radar-empty">지금 당장 답할 자리는 없습니다 — 아래 지켜볼 자리부터 보세요.</p>
                        )}
                        <div className="lw-radar-cards">
                            {list.map((item) => {
                                const state = marks[canonical(item.link)];
                                return (
                                    <article key={item.link} className={`lw-radar-card${state ? ` is-${state}` : ''}`}>
                                        <div className="lw-radar-card-head">
                                            <span className={`lw-radar-src src-${item.source}`}>
                                                {item.source === 'community' && item.siteName
                                                    ? item.siteName
                                                    : SOURCE_LABEL[item.source] || item.source}
                                            </span>
                                            {item.source === 'community' && item.replyGate === 'instant' && (
                                                <span className="lw-radar-gate" title={item.gateWhy || '지금 바로 답을 달 수 있는 판입니다'}>
                                                    바로 답변 가능
                                                </span>
                                            )}
                                            {item.source === 'community' && item.linkPolicy && (
                                                <span
                                                    className={`lw-radar-policy pol-${item.linkPolicy}`}
                                                    title={item.linkPolicy === 'banned'
                                                        ? '이 판은 외부 링크가 삭제·차단됩니다 — 링크 없이 답만 다는 자리로 보세요'
                                                        : item.linkPolicy === 'careful'
                                                            ? '링크를 달 수 있으나 홍보로 보이면 지워집니다'
                                                            : item.linkPolicy === 'unknown'
                                                                ? '링크 정책을 아직 확인하지 못했습니다 — 직접 확인하고 판단하세요'
                                                                : '링크를 달 수 있는 판입니다'}
                                                >{POLICY_LABEL[item.linkPolicy]}</span>
                                            )}
                                            {typeof item.score === 'number' && <b className="lw-radar-score">{item.score}점</b>}
                                            {state === 'done' && <i className="lw-radar-state">처리 완료</i>}
                                        </div>
                                        <h3><a href={item.link} target="_blank" rel="noreferrer noopener">{item.title}</a></h3>
                                        {item.excerpt && <p className="lw-radar-excerpt">{item.excerpt}</p>}
                                        {item.reason && <p className="lw-radar-reason">판정 근거 · {item.reason}</p>}
                                        {group.id !== 'SKIP' && item.answerAngle && (
                                            <p className="lw-radar-angle">답변 각도 · {item.answerAngle}</p>
                                        )}
                                        <div className="lw-radar-meta">
                                            {item.matchedQueries?.length > 0 && <span>걸린 검색어 · {item.matchedQueries.slice(0, 3).join(' · ')}</span>}
                                            {item.postdate && <span>{item.postdate}</span>}
                                        </div>
                                        <div className="lw-radar-actions">
                                            {group.id !== 'SKIP' && (
                                                <button type="button" className="pri" onClick={() => openAnswer(item)}>✏️ 답변 만들기</button>
                                            )}
                                            <a href={item.link} target="_blank" rel="noreferrer noopener">원문 열기</a>
                                            {state === 'dismissed' ? (
                                                <button type="button" onClick={() => mark(item.link, null)}>되살리기</button>
                                            ) : (
                                                <button type="button" onClick={() => mark(item.link, 'dismissed')}>관심 없음</button>
                                            )}
                                            {state === 'done' ? (
                                                <button type="button" onClick={() => mark(item.link, null)}>완료 취소</button>
                                            ) : (
                                                <button type="button" onClick={() => mark(item.link, 'done')}>처리 완료</button>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                );
            })}

            {phase === 'done' && grouped.rest.length > 0 && (
                <section className="lw-panel lw-radar-group">
                    <div className="lw-panel-head">
                        <h2>평가 밖 후보 <em>{grouped.rest.length}</em></h2>
                        <span>비용 관리로 상위 후보만 AI 평가합니다 — 나머지는 제목으로 직접 훑어보세요</span>
                    </div>
                    <ul className="lw-radar-rest">
                        {grouped.rest.map((item) => (
                            <li key={item.link}>
                                <span className={`lw-radar-src src-${item.source}`}>{SOURCE_LABEL[item.source] || item.source}</span>
                                <a href={item.link} target="_blank" rel="noreferrer noopener">{item.title}</a>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {phase === 'done' && gatedSites.length > 0 && (
                /*
                 * 훑지 않은 판을 이유와 함께 보여준다. 클리앙처럼 "가입은 되는데
                 * 보름 기다려야 하는" 판은 오늘 가입해 두면 그때부터 쓸 수 있다 —
                 * 조용히 빼면 그 준비를 할 기회가 사라진다.
                 */
                <section className="lw-panel lw-radar-gated">
                    <div className="lw-panel-head">
                        <h2>지금은 답을 못 다는 판 <em>{gatedSites.length}</em></h2>
                        <span>훑지 않았습니다 — 미리 준비해 두면 열리는 곳이 있습니다</span>
                    </div>
                    <ul>
                        {gatedSites.map((site) => (
                            <li key={site.domain} className={site.gate}>
                                <a href={`https://${site.domain}`} target="_blank" rel="noreferrer noopener">{site.name}</a>
                                {/*
                                  * '기다리면 열림'은 블라인드(회사 이메일)에만 맞는 말이었다.
                                  * 아하는 전문가 등록을 해야 열린다 — 기다린다고 열리지 않는다.
                                  * 둘을 함께 담는 말로 바꾸고, 무엇을 해야 하는지는 아래 why 가 적는다.
                                  */}
                                <i>{site.gate === 'delayed' ? '조건 채우면 열림' : '가입 막힘'}</i>
                                <span>{site.why || '확인된 근거 없음'}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {phase === 'done' && dismissedCount > 0 && (
                <p className="lw-radar-dismissed">
                    관심 없음 처리 {dismissedCount}건 —{' '}
                    <button type="button" onClick={() => setShowDismissed((v) => !v)}>
                        {showDismissed ? '숨기기' : '보기'}
                    </button>
                </p>
            )}

            {/*
              답변 작업대 — 지식인 답변 초안(kin-answer)을 그대로 재사용한다.
              전부 내 구독으로 돌고, 링크를 켜면 내 글 주소가 답변에 들어간다.
              게시는 사람이 한다(자동 게시 없음) — 복사해 붙여 넣는다.
            */}
            {answerFor && (
                <div className="lw-plan-backdrop" role="presentation" onClick={() => setAnswerFor(null)}>
                    <div
                        className="lw-plan-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${answerFor.title} 답변 만들기`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="lw-plan-head">
                            <div>
                                <h3>{answerFor.title}</h3>
                                <small className="lw-kg-work-meta">
                                    {SOURCE_LABEL[answerFor.source] || answerFor.source}
                                    {answerFor.linkPolicy ? ` · ${POLICY_LABEL[answerFor.linkPolicy]}` : ''}
                                </small>
                            </div>
                            <button type="button" className="lw-plan-close" onClick={() => setAnswerFor(null)} aria-label="닫기">✕</button>
                        </header>
                        <div className="lw-plan-body">
                            {answerFor.excerpt && (
                                <section>
                                    <strong>질문·글 내용</strong>
                                    <p className="lw-kg-work-body">{answerFor.excerpt}</p>
                                </section>
                            )}
                            <section>
                                <strong>답변 초안 — 깔끔·담백·정확, AI 티 0</strong>
                                <textarea
                                    className="lw-kg-draft"
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    placeholder="'AI 답변 생성'을 누르면 내 구독으로 초안이 만들어집니다. 고쳐 쓰셔도 됩니다."
                                    rows={9}
                                />
                                {genNote && (
                                    <p className="lw-kg-work-note">
                                        {genNote} <a href="/leword?tab=keys">내 API 키 탭 열기</a>
                                    </p>
                                )}
                                <div className="lw-kg-work-actions">
                                    <button type="button" className="lw-kg-generate" onClick={generateAnswer} disabled={genBusy}>
                                        {genBusy ? '생성 중… (내 구독)' : draft ? '다시 생성' : 'AI 답변 생성'}
                                    </button>
                                    <button type="button" onClick={copyAnswer} disabled={!draft.trim()}>
                                        {copied ? '복사됨 — 원문에 붙여넣으세요' : '복사 → 붙여넣기'}
                                    </button>
                                    <a href={answerFor.link} target="_blank" rel="noreferrer noopener" className="lw-kg-open">답변하러 가기</a>
                                    <label className={`lw-kg-linkbox${answerFor.linkPolicy === 'banned' ? ' off' : ''}`} title={answerFor.linkPolicy === 'banned' ? '이 판은 외부 링크가 삭제·차단됩니다' : ''}>
                                        <input
                                            type="checkbox"
                                            checked={withLink && answerFor.linkPolicy !== 'banned'}
                                            disabled={answerFor.linkPolicy === 'banned'}
                                            onChange={(event) => setWithLink(event.target.checked)}
                                        />
                                        내 글 링크 추가
                                    </label>
                                </div>
                                <p className="lw-kg-work-note">게시는 직접 하세요 — 자동 게시는 없습니다. 붙여 넣고 확인 후 올리시면 됩니다.</p>
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RadarTab;
