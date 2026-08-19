import { useEffect, useRef, useState } from 'react';
import {
    auditBlogCheck,
    auditBlogPosts,
    checkRank,
    fetchPostAnalysis,
    type BlogAuditPost,
    type KeywordUsage,
    type PostAnalysis,
    type RankResult,
} from '../../lib/keywordApi';
import { ErrorNote, TabIntro, UsageBar } from './LewordShared';

/**
 * 노출 추적 — 블로그 주소 하나로 발행 글 전체의 노출·누락·순위를 실측한다
 * (사장님 설계 2026-08-20: "상태/제목/발행일/순위/댓글·공감/분석하기 이런식으로").
 *
 * 범용이다: 네이버 블로그·티스토리·워드프레스·블로그스팟 — 글 목록은 각
 * 플랫폼의 공개 피드에서 온다. 노출·순위는 그 글 제목으로 네이버 블로그검색
 * 상위 100을 직접 스캔해 그 글이 있는 자리를 센 것이고, 공감은 네이버 공개
 * 리액션 API 실측이다. 예측·추정은 없다 — 조회수는 어느 플랫폼도 공개 API 가
 * 없어 싣지 않는다(없는 값을 지어내지 않는다).
 */

const STORE_KEY = 'leaderspro.leword.rankTargets.v1';
const AUDIT_STORE_KEY = 'leaderspro.leword.blogAudit.v1';

type TrackedRow = {
    id: string;
    keyword: string;
    target: string;
    rank: number | null;
    title: string;
    link: string;
    checkedAt: string;
    scanned: number;
};

type AuditRow = BlogAuditPost & {
    status: 'wait' | 'checking' | 'done' | 'error';
    /** 제목검색(생존 확인) 순위 — 노출/누락 판정의 기준. */
    rank: number | null;
    sampled: number;
    sympathy: number | null;
    /* 순위 3눈(사장님 지시 2026-08-20): 키워드 → 확장 → 제목. 쿼리를 그대로
       실어 화면에서 "무엇으로 검색했는지"가 검증 가능하다. */
    kwQuery?: string;
    kwRank?: number | null;
    extQuery?: string;
    extRank?: number | null;
};

function loadTracked(): TrackedRow[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
    } catch {
        return [];
    }
}

function saveTracked(rows: TrackedRow[]) {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(rows.slice(0, 50)));
    } catch {
        // 저장 실패가 조회를 막으면 안 된다.
    }
}

type AuditState = { url: string; platform: string; checkedAt: string; rows: AuditRow[] };

function loadAudit(): AuditState | null {
    try {
        const parsed = JSON.parse(localStorage.getItem(AUDIT_STORE_KEY) || 'null');
        return parsed && Array.isArray(parsed.rows) ? parsed : null;
    } catch {
        return null;
    }
}

const PLATFORM_LABEL: Record<string, string> = {
    naver: '네이버 블로그',
    tistory: '티스토리',
    wordpress: '워드프레스',
    blogspot: '블로그스팟',
};

function RankTab({ initialKeyword, onAnalyze }: { initialKeyword: string; onAnalyze?: (keyword: string) => void }) {
    const [keyword, setKeyword] = useState(initialKeyword);
    const [target, setTarget] = useState('');
    const [rows, setRows] = useState<TrackedRow[]>(() => loadTracked());
    const [usage, setUsage] = useState<KeywordUsage | null>(null);
    const [error, setError] = useState<{ code?: string; message?: string; missing?: string[] }>({});
    const [loading, setLoading] = useState(false);

    /** 블로그 전체 감사 상태 — 새로고침해도 남게 이 브라우저에 저장한다. */
    const [auditUrl, setAuditUrl] = useState('');
    const [audit, setAudit] = useState<AuditState | null>(() => loadAudit());
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState('');
    /** 진행 중 감사를 새 감사가 밀어내면 이전 루프를 멈춘다. */
    const auditRunId = useRef(0);

    /*
     * 글 진단(사장님 확정 2026-08-20 "키워드 추출이 아니라 글을 분석해야") —
     * 실측 순위 3종 + 글 전문을 구독 AI 가 읽고, 보이는 사실만으로 원인·수정안을
     * 짚는다. 키워드 지표 분석은 각 순위 칸의 검색어 클릭으로 여전히 간다.
     */
    const [analyzeRow, setAnalyzeRow] = useState<AuditRow | null>(null);
    const [analyzeState, setAnalyzeState] = useState<{ status: 'loading' | 'done' | 'error'; data?: PostAnalysis; message?: string }>({ status: 'loading' });

    const openAnalysis = async (row: AuditRow) => {
        setAnalyzeRow(row);
        setAnalyzeState({ status: 'loading' });
        const result = await fetchPostAnalysis({
            title: row.title,
            link: row.link,
            kwQuery: row.kwQuery,
            kwRank: row.kwRank ?? null,
            extQuery: row.extQuery,
            extRank: row.extRank ?? null,
            titleRank: row.rank,
        });
        if (result.ok && result.data?.analysis) {
            setAnalyzeState({ status: 'done', data: result.data.analysis });
            return;
        }
        setAnalyzeState({ status: 'error', message: result.message || result.error || '진단 실패' });
    };

    useEffect(() => {
        if (initialKeyword) setKeyword(initialKeyword);
    }, [initialKeyword]);

    const persistAudit = (state: AuditState | null) => {
        setAudit(state);
        try {
            if (state) localStorage.setItem(AUDIT_STORE_KEY, JSON.stringify(state));
        } catch { /* 저장 실패해도 화면은 산다 */ }
    };

    const runAudit = async () => {
        const url = auditUrl.trim();
        if (!url || auditLoading) return;
        const runId = auditRunId.current + 1;
        auditRunId.current = runId;
        setAuditLoading(true);
        setAuditError('');
        const listed = await auditBlogPosts(url);
        if (!listed.ok || !listed.data) {
            setAuditLoading(false);
            setAuditError(listed.message || '피드를 읽지 못했습니다.');
            return;
        }
        let state: AuditState = {
            url,
            platform: listed.data.platform,
            checkedAt: new Date().toISOString(),
            rows: listed.data.posts.map((post) => ({ ...post, status: 'wait', rank: null, sampled: 0, sympathy: null })),
        };
        persistAudit(state);

        // 글 하나씩 순서대로 — 진행이 눈에 보이고, API 를 예의 있게 쓴다.
        for (let index = 0; index < state.rows.length; index += 1) {
            if (auditRunId.current !== runId) return;
            state = { ...state, rows: state.rows.map((row, i) => (i === index ? { ...row, status: 'checking' } : row)) };
            setAudit(state);
            const post = state.rows[index];
            const checked = await auditBlogCheck(post.title, post.link);
            const payload = checked.ok ? checked.data as (typeof checked.data & {
                keyword?: { query: string; rank: number | null };
                extended?: { query: string; rank: number | null };
            }) | null : null;
            const done: AuditRow = payload
                ? {
                    ...post, status: 'done',
                    rank: payload.rank, sampled: payload.sampled, sympathy: payload.sympathy,
                    kwQuery: payload.keyword?.query, kwRank: payload.keyword ? payload.keyword.rank : undefined,
                    extQuery: payload.extended?.query, extRank: payload.extended ? payload.extended.rank : undefined,
                }
                : { ...post, status: 'error', rank: null, sampled: 0, sympathy: null };
            state = { ...state, rows: state.rows.map((row, i) => (i === index ? done : row)) };
            persistAudit(state);
        }
        if (auditRunId.current === runId) setAuditLoading(false);
    };

    const applyResult = (result: RankResult) => {
        const row: TrackedRow = {
            id: `${result.keyword}${result.target}`,
            keyword: result.keyword,
            target: result.target,
            rank: result.found ? result.found.rank : null,
            title: result.found ? result.found.title : '',
            link: result.found ? result.found.link : '',
            checkedAt: new Date().toISOString(),
            scanned: result.scanned,
        };
        setRows((previous) => {
            const next = [row, ...previous.filter((entry) => entry.id !== row.id)];
            saveTracked(next);
            return next;
        });
    };

    const run = async (checkKeyword: string, checkTarget: string) => {
        const trimmedKeyword = checkKeyword.trim();
        const trimmedTarget = checkTarget.trim();
        if (!trimmedKeyword || !trimmedTarget || loading) return;
        setLoading(true);
        setError({});
        const response = await checkRank(trimmedKeyword, trimmedTarget);
        setLoading(false);
        if (response.usage) setUsage(response.usage);
        if (response.ok && response.data) {
            applyResult(response.data);
            return;
        }
        setError({ code: response.error, message: response.message, missing: response.missing });
    };

    const removeRow = (id: string) => {
        setRows((previous) => {
            const next = previous.filter((entry) => entry.id !== id);
            saveTracked(next);
            return next;
        });
    };

    const doneCount = (audit?.rows || []).filter((row) => row.status === 'done' || row.status === 'error').length;

    return (
        <>
            <TabIntro
                title="노출 추적"
                desc="블로그 주소 하나만 넣으면 발행한 글 전체의 노출·누락·순위를 직접 세어 봅니다. 네이버·티스토리·워드프레스·블로그스팟 전부 됩니다. 100위 안에 없으면 없다고 말합니다."
                source="플랫폼 공개 피드 + 네이버 블로그검색 상위 100 실측 · 공감은 네이버 공개 API"
            />

            <form
                className="lw-search"
                onSubmit={(event) => { event.preventDefault(); runAudit(); }}
            >
                <input
                    type="text"
                    value={auditUrl}
                    onChange={(event) => setAuditUrl(event.target.value)}
                    placeholder="블로그 주소 (blog.naver.com/아이디 · ○○.tistory.com · 워드프레스 · blogspot)"
                    aria-label="점검할 블로그 주소"
                />
                <button type="submit" disabled={auditLoading || !auditUrl.trim()}>
                    {auditLoading ? `점검 중… ${doneCount}/${audit?.rows.length ?? 0}` : '전체 글 점검'}
                </button>
            </form>

            {auditError && <div className="lw-note lw-note-error"><strong>{auditError}</strong></div>}

            {audit && audit.rows.length > 0 && (
                <section className="lw-panel" aria-label="발행 글 노출 점검">
                    <div className="lw-panel-head">
                        <h2>{PLATFORM_LABEL[audit.platform] || audit.platform} · 최근 발행 {audit.rows.length}건</h2>
                        <span>
                            순위 세 눈(각각 상위 100 실측): <strong>키워드</strong>(제목의 핵심어 검색 — 사람이 실제로 치는 것)
                            → <strong>확장</strong>(핵심어+한정어) → <strong>제목검색</strong>(제 제목으로도 안 잡히면 차단·저품질 의심).
                            각 칸 아래 회색 글씨가 실제 사용한 검색어입니다 · 조회수는 공개 API 가 없어 싣지 않습니다
                        </span>
                    </div>
                    <div className="lw-table-scroll">
                        <table className="lw-table lw-audit-table">
                            <thead>
                                <tr>
                                    <th scope="col">상태</th>
                                    <th scope="col">제목</th>
                                    <th scope="col">발행일</th>
                                    <th scope="col">공감·댓글</th>
                                    <th scope="col">키워드 순위</th>
                                    <th scope="col">확장 순위</th>
                                    <th scope="col" title="그 글의 제목을 그대로 검색했을 때의 자리 — 생존 확인">제목검색</th>
                                    <th scope="col" aria-label="분석" />
                                </tr>
                            </thead>
                            <tbody>
                                {audit.rows.map((row) => (
                                    <tr key={row.link}>
                                        <td>
                                            {row.status === 'wait' && <span className="lw-audit-badge lw-audit-wait">대기</span>}
                                            {row.status === 'checking' && <span className="lw-audit-badge lw-audit-wait">확인 중…</span>}
                                            {row.status === 'error' && <span className="lw-audit-badge lw-audit-wait">확인 실패</span>}
                                            {row.status === 'done' && (row.rank !== null
                                                ? <span className="lw-audit-badge lw-audit-in">노출</span>
                                                : <span className="lw-audit-badge lw-audit-out">누락</span>)}
                                            {row.status === 'done' && row.rank === null && (
                                                <small className="lw-audit-why">검색 미노출 · 차단(저품질) 의심</small>
                                            )}
                                        </td>
                                        <td className="lw-rank-title">
                                            <a href={row.link} target="_blank" rel="noreferrer">{row.title}</a>
                                        </td>
                                        <td>{row.publishedAt || '—'}</td>
                                        <td>
                                            {row.sympathy !== null ? `공감 ${row.sympathy}` : ''}
                                            {row.sympathy !== null && row.comments !== null ? ' · ' : ''}
                                            {row.comments !== null ? `댓글 ${row.comments}` : ''}
                                            {row.sympathy === null && row.comments === null ? '—' : ''}
                                        </td>
                                        <td className={row.kwRank === null ? 'lw-rank-out' : 'lw-rank-in'}>
                                            {row.status !== 'done' ? '—' : row.kwRank != null ? `${row.kwRank}위` : row.kwQuery ? '없음' : '—'}
                                            {row.kwQuery && (onAnalyze
                                                ? <button type="button" className="lw-audit-q lw-audit-q-btn" title="키워드 분석 탭으로" onClick={() => onAnalyze(row.kwQuery!)}>{row.kwQuery}</button>
                                                : <small className="lw-audit-q">{row.kwQuery}</small>)}
                                        </td>
                                        <td className={row.extRank === null ? 'lw-rank-out' : 'lw-rank-in'}>
                                            {row.status !== 'done' ? '—' : row.extRank != null ? `${row.extRank}위` : row.extQuery ? '없음' : '—'}
                                            {row.extQuery && row.extQuery !== row.kwQuery && (onAnalyze
                                                ? <button type="button" className="lw-audit-q lw-audit-q-btn" title="키워드 분석 탭으로" onClick={() => onAnalyze(row.extQuery!)}>{row.extQuery}</button>
                                                : <small className="lw-audit-q">{row.extQuery}</small>)}
                                        </td>
                                        <td className={row.rank === null ? 'lw-rank-out' : 'lw-rank-in'}>
                                            {row.status !== 'done' ? '—' : row.rank !== null ? `${row.rank}위` : `${row.sampled}건 중 없음`}
                                        </td>
                                        <td className="lw-row-actions">
                                            <button type="button" className="lw-mini" onClick={() => openAnalysis(row)} disabled={row.status !== 'done'}>
                                                글 분석하기
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <div className="lw-panel-head" style={{ marginTop: 26 }}>
                <h2>키워드로 직접 확인</h2>
                <span>특정 키워드에서 내 블로그가 몇 위인지 하나씩 볼 때</span>
            </div>

            <form
                className="lw-search lw-search-two"
                onSubmit={(event) => { event.preventDefault(); run(keyword, target); }}
            >
                <input
                    type="search"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="확인할 키워드"
                    aria-label="확인할 키워드"
                />
                <input
                    type="text"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    placeholder="내 블로그 주소 또는 아이디 (예: blog.naver.com/myid)"
                    aria-label="내 블로그 주소 또는 아이디"
                />
                <button type="submit" disabled={loading || !keyword.trim() || !target.trim()}>
                    {loading ? '확인 중…' : '순위 확인'}
                </button>
            </form>

            <UsageBar usage={usage} />
            <ErrorNote error={error.code} message={error.message} missing={error.missing} />

            {rows.length === 0 && !loading && !audit && (
                <div className="lw-note">
                    블로그 주소를 넣고 전체 글 점검을 누르면 발행 글 전체의 노출 상태가 여기에 쌓입니다. 목록은 이 브라우저에만 저장됩니다.
                </div>
            )}

            {rows.length > 0 && (
                <section className="lw-panel" aria-label="추적 중인 키워드">
                    <div className="lw-panel-head">
                        <h2>추적 목록</h2>
                        <span>{rows.length}건 · 이 브라우저에만 저장</span>
                    </div>
                    <div className="lw-table-scroll">
                        <table className="lw-table">
                            <thead>
                                <tr>
                                    <th scope="col">키워드</th>
                                    <th scope="col">순위</th>
                                    <th scope="col">확인한 글</th>
                                    <th scope="col">확인 시각</th>
                                    <th scope="col" aria-label="동작" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.id}>
                                        <th scope="row">
                                            {row.keyword}
                                            <small>{row.target}</small>
                                        </th>
                                        <td className={row.rank === null ? 'lw-rank-out' : 'lw-rank-in'}>
                                            {row.rank === null ? `${row.scanned}건 중 없음` : `${row.rank}위`}
                                        </td>
                                        <td className="lw-rank-title">
                                            {row.link
                                                ? <a href={row.link} target="_blank" rel="noreferrer">{row.title || '내 글'}</a>
                                                : '—'}
                                        </td>
                                        <td>
                                            {new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                                                .format(new Date(row.checkedAt))}
                                        </td>
                                        <td className="lw-row-actions">
                                            <button type="button" className="lw-mini" onClick={() => run(row.keyword, row.target)}>다시</button>
                                            <button type="button" className="lw-mini lw-mini-ghost" onClick={() => removeRow(row.id)}>삭제</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
            {/* 글 진단 창 — 실측 3종 + 본문을 읽은 결과만 싣는다. */}
            {analyzeRow && (
                <div className="lw-plan-backdrop" role="presentation" onClick={() => setAnalyzeRow(null)}>
                    <div
                        className="lw-plan-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${analyzeRow.title} 글 진단`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="lw-plan-head">
                            <div>
                                <h3>{analyzeRow.title}</h3>
                                <small className="lw-kg-work-meta">
                                    {analyzeRow.kwQuery ? `키워드 ${analyzeRow.kwRank != null ? `${analyzeRow.kwRank}위` : '없음'}` : ''}
                                    {analyzeRow.extQuery && analyzeRow.extQuery !== analyzeRow.kwQuery ? ` · 확장 ${analyzeRow.extRank != null ? `${analyzeRow.extRank}위` : '없음'}` : ''}
                                    {` · 제목검색 ${analyzeRow.rank != null ? `${analyzeRow.rank}위` : '누락'}`}
                                </small>
                            </div>
                            <button type="button" className="lw-plan-close" onClick={() => setAnalyzeRow(null)} aria-label="닫기">✕</button>
                        </header>
                        <div className="lw-plan-body">
                            {analyzeState.status === 'loading' && (
                                <p className="lw-kg-work-body">글 본문을 읽고 진단하는 중… (내 구독으로 실행)</p>
                            )}
                            {analyzeState.status === 'error' && (
                                <p className="lw-kg-work-note">
                                    {analyzeState.message} <a href="/leword?tab=keys">내 API 키 탭 열기</a>
                                </p>
                            )}
                            {analyzeState.status === 'done' && analyzeState.data && (
                                <>
                                    <section>
                                        <strong>판정</strong>
                                        <p className="lw-kg-work-body" style={{ maxHeight: 'none' }}>
                                            <b style={{ color: '#ffa500' }}>{analyzeState.data.verdict}</b>
                                            {analyzeState.data.targetKeyword && <> · 이 글이 노려야 할 검색어: <b>{analyzeState.data.targetKeyword}</b></>}
                                            {!analyzeState.data.contentRead && <><br /><small>본문을 가져오지 못해 제목·실측만으로 진단했습니다.</small></>}
                                        </p>
                                    </section>
                                    {analyzeState.data.diagnosis.length > 0 && (
                                        <section>
                                            <strong>왜 이런가 — 글에서 보이는 것</strong>
                                            <ul>{analyzeState.data.diagnosis.map((line) => <li key={line}>{line}</li>)}</ul>
                                        </section>
                                    )}
                                    {analyzeState.data.fixes.length > 0 && (
                                        <section>
                                            <strong>이렇게 고치세요</strong>
                                            <ul>{analyzeState.data.fixes.map((line) => <li key={line}>{line}</li>)}</ul>
                                        </section>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default RankTab;
