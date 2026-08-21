import { useMemo, useState } from 'react';
import {
    fetchRadarAnalyze, fetchRadarEvaluate, fetchRadarSearch, formatCount,
    type RadarAnalysis, type RadarEvaluated,
} from '../../lib/keywordApi';
import { TabIntro } from './LewordShared';

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

function RadarTab() {
    const [url, setUrl] = useState('');
    const [phase, setPhase] = useState<Phase>('idle');
    const [error, setError] = useState('');
    const [analysis, setAnalysis] = useState<RadarAnalysis | null>(null);
    const [providerStatus, setProviderStatus] = useState<Record<string, string>>({});
    const [counts, setCounts] = useState<{ found: number; deduped: number } | null>(null);
    const [items, setItems] = useState<RadarEvaluated[]>([]);
    const [marks, setMarks] = useState<Marks>(loadMarks);
    const [showDismissed, setShowDismissed] = useState(false);

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
        const analyzed = await fetchRadarAnalyze(target);
        if (!analyzed.ok || !analyzed.data) {
            setPhase('idle');
            setError(analyzed.message || '글을 분석하지 못했습니다.');
            return;
        }
        const meta = analyzed.data.analysis;
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
        if (searched.data.items.length === 0) {
            setPhase('done');
            return;
        }

        // ③ AI 평가 — 룰 점수 상위만 LLM 에 보낸다(§19 비용 원칙, 서버가 상한을 쥔다)
        setPhase('evaluating');
        const evaluated = await fetchRadarEvaluate(searched.data.items, meta.title, meta.moneyAngle);
        if (!evaluated.ok || !evaluated.data) {
            // 평가가 죽어도 검색 결과는 보여준다 — 빈 화면이 최악이다(§27)
            setItems(searched.data.items.map((item) => ({ ...item, evaluated: false })));
            setPhase('done');
            setError(evaluated.message || 'AI 평가에 실패해 검색 결과만 보여드립니다.');
            return;
        }
        setItems(evaluated.data.items);
        setPhase('done');
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
                source="네이버 오픈API + 커뮤니티 20판(구글 색인) + 검색광고 검색량 실측 + AI 평가"
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
                    <span className={phase === 'searching' ? 'on' : phase === 'evaluating' ? 'ok' : ''}>② 4판 검색</span>
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
                                <b>{k.searchVolume == null ? '측정 불가' : `월 ${formatCount(k.searchVolume)}`}</b>
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
                                            <a href={item.link} target="_blank" rel="noreferrer noopener">원문 열기</a>
                                            {state === 'dismissed' ? (
                                                <button type="button" onClick={() => mark(item.link, null)}>되살리기</button>
                                            ) : (
                                                <button type="button" onClick={() => mark(item.link, 'dismissed')}>관심 없음</button>
                                            )}
                                            {state === 'done' ? (
                                                <button type="button" onClick={() => mark(item.link, null)}>완료 취소</button>
                                            ) : (
                                                <button type="button" className="pri" onClick={() => mark(item.link, 'done')}>처리 완료</button>
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

            {phase === 'done' && dismissedCount > 0 && (
                <p className="lw-radar-dismissed">
                    관심 없음 처리 {dismissedCount}건 —{' '}
                    <button type="button" onClick={() => setShowDismissed((v) => !v)}>
                        {showDismissed ? '숨기기' : '보기'}
                    </button>
                </p>
            )}
        </div>
    );
}

export default RadarTab;
