import { useEffect, useMemo, useState } from 'react';
import { fetchKinAnswer, fetchKinPostIdeas, fetchKinQuestion, formatCount, searchKinQuestions, type KinPostIdea } from '../../lib/keywordApi';
import { bridgeKinAnswer, probeBridge, type BridgeStatus } from '../../lib/bridge';
import { loadUserKeys, saveUserKeys } from '../../lib/userKeys';
import { TabIntro } from './LewordShared';

/**
 * 지식인 황금질문 — 좌측 메뉴의 독립 탭(사장님 설계 2026-08-20).
 *
 * 질문이 곧 키워드다. 많이 본 질문은 지금 카페·SNS·검색 등 다른 판에서도 같은
 * 질문이 터지고 있다는 실측 신호라, 답변에 링크 한둘을 얹으면 외부유입이
 * 연쇄된다. 세 레인 전부 실측이다:
 *   실시간 = 지식인 홈 '많이 본 Q&A' 30건 전부
 *   급상승 = 직전 수집 대비 조회수가 붙는 속도(두 실측의 차이)
 *   숨은   = 최신 질문인데 조회 많고 답변 적은 것 + 황금키워드 보드의 실측 질문
 */

type KinQ = {
    title: string;
    link: string;
    summary?: string;
    views: number | null;
    answers: number | null;
    rank?: number;
    /** 질문 작성일 — "최신"이 조건이므로 화면에 그대로 적는다. */
    askedAt?: string;
    /** 직전 수집(15분 전) 대비 조회 증가 — "지금 보는 사람이 있는가"의 실측. */
    viewsDelta?: number | null;
    perHour?: number;
    /** 근거 키워드가 있으면 글감으로 바로 잇는다. */
    keyword?: string;
};

type KinGoldenData = {
    fetchedAt?: string;
    prevFetchedAt?: string | null;
    criteria?: { hidden?: string; rising?: string };
    realtime?: KinQ[];
    rising?: KinQ[];
    hidden?: KinQ[];
};

const LANES = [
    { id: 'realtime', label: '실시간 Q&A', hint: '지식인 홈 "많이 본 Q&A" 30건 전부 — 지금 사람들이 실제로 읽는 질문' },
    { id: 'rising', label: '급상승 Q&A', hint: '직전 수집 대비 조회수가 붙는 속도 순 — 두 번 실측한 차이만 싣는다' },
    { id: 'hidden', label: '숨은 Q&A', hint: '목록엔 안 떴지만 조회 많고 답변 적은 최신 질문 — 답변 선점 자리' },
    /*
     * 내가 작업한 질문(사장님 지시 2026-08-20 "자꾸 바뀌니까 다시 찾아야 한다").
     * 목록은 15분마다 갈리므로, 답변 초안을 만든 질문은 초안까지 통째로
     * 이 브라우저에 남겨 둔다 — 수집이 바뀌어도 사라지지 않는다.
     */
    { id: 'worked', label: '내가 작업한 질문', hint: '답변 초안을 만든 질문 — 목록이 갱신돼도 여기 남습니다(이 브라우저 저장)' },
    /* 키워드로 직접 찾기(사장님 지시 2026-08-20) — 수집을 기다리지 않고 원하는 주제의 질문을 찾는다. */
    { id: 'search', label: '질문 검색', hint: '키워드로 지식인 질문을 직접 찾습니다 — 조회수·답변수는 질문 페이지 실측' },
] as const;

type LaneId = (typeof LANES)[number]['id'];

/**
 * 링크 장부 — 지식인은 링크 비율이 높으면 계정이 죽는다(사장님 실전 지식:
 * 답변 10개 중 1개만). "복사"를 게시로 간주해 이 브라우저에 기록하고,
 * 최근 9개 안에 링크 답변이 있으면 체크박스를 잠근다.
 */
const LEDGER_KEY = 'leaderspro.leword.kinAnswerLedger.v1';
/** 작업한 질문 보관함 — 초안까지 함께 남긴다. */
const WORKED_KEY = 'leaderspro.leword.kinWorked.v1';

type WorkedItem = KinQ & { draft: string; savedAt: string; copied?: boolean };

function loadWorked(): WorkedItem[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(WORKED_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
    } catch {
        return [];
    }
}
const BLOG_URL_KEY = 'leaderspro.leword.kinBlogUrl.v1';

type LedgerEntry = { at: string; withLink: boolean };

function loadLedger(): LedgerEntry[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
    } catch {
        return [];
    }
}

function KinGoldenTab({ onAnalyze }: { onAnalyze?: (keyword: string) => void }) {
    const [data, setData] = useState<KinGoldenData | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [lane, setLane] = useState<LaneId>('realtime');
    const [copied, setCopied] = useState('');

    /* ── 답변 작업대(사장님 확정 2026-08-20: 생성은 AI, 게시는 하나씩 직접) ── */
    const [work, setWork] = useState<KinQ | null>(null);
    const [workBody, setWorkBody] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });
    const [draft, setDraft] = useState('');
    const [generating, setGenerating] = useState(false);
    const [genNote, setGenNote] = useState('');
    const [withLink, setWithLink] = useState(false);
    const [blogUrl, setBlogUrl] = useState(() => localStorage.getItem(BLOG_URL_KEY) || '');
    const [ledger, setLedger] = useState<LedgerEntry[]>(() => loadLedger());
    const [draftCopied, setDraftCopied] = useState(false);
    /** 작업한 질문 보관함 — 수집이 갈려도 남는다. */
    const [worked, setWorked] = useState<WorkedItem[]>(() => loadWorked());
    /* 질문 검색 — 지식인에서 직접 찾는다. */
    const [searchQuery, setSearchQuery] = useState('');
    const [searchRecent, setSearchRecent] = useState(false);
    const [search, setSearch] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; list: KinQ[]; message?: string }>({ status: 'idle', list: [] });

    const runSearch = async () => {
        const query = searchQuery.trim();
        if (!query || search.status === 'loading') return;
        setSearch({ status: 'loading', list: [] });
        const result = await searchKinQuestions(query, searchRecent);
        if (result.ok && result.data) {
            const list = (result.data.questions || []).map((q) => ({
                title: q.title, link: q.link, summary: q.summary,
                views: q.views, answers: q.answers, askedAt: q.askedAt || undefined,
                keyword: query,
            }));
            setSearch({ status: 'done', list, message: list.length ? undefined : '검색 결과가 없습니다.' });
            return;
        }
        setSearch({ status: 'error', list: [], message: result.message || result.error || '검색 실패' });
    };

    const docIdOfLink = (link: string) => (link.match(/docId=(\d+)/) || [])[1] || link;
    /** 초안을 만들면 그 질문을 통째로 저장한다(같은 질문은 최신본으로 갱신). */
    const rememberWorked = (q: KinQ, draftText: string, copiedFlag?: boolean) => {
        setWorked((prev) => {
            const id = docIdOfLink(q.link);
            const rest = prev.filter((item) => docIdOfLink(item.link) !== id);
            const before = prev.find((item) => docIdOfLink(item.link) === id);
            const next = [{
                ...q,
                draft: draftText,
                savedAt: new Date().toISOString(),
                copied: copiedFlag ?? before?.copied ?? false,
            }, ...rest].slice(0, 200);
            try { localStorage.setItem(WORKED_KEY, JSON.stringify(next)); } catch { /* 계속 */ }
            return next;
        });
    };
    const forgetWorked = (link: string) => {
        setWorked((prev) => {
            const next = prev.filter((item) => docIdOfLink(item.link) !== docIdOfLink(link));
            try { localStorage.setItem(WORKED_KEY, JSON.stringify(next)); } catch { /* 계속 */ }
            return next;
        });
    };

    const linksInLast9 = ledger.slice(0, 9).filter((entry) => entry.withLink).length;
    const linkAllowed = linksInLast9 === 0;

    /*
     * 연동 상태 실측 — 누구나(사장님뿐 아니라) 자기 PC 앱 + 자기 구독으로 쓰는
     * 구조다. 안 되는 단계(앱 꺼짐/CLI 로그인 전)만 짚어 주면 사용자가 헤매지
     * 않는다. 첫 작업대 열기에서 한 번만 잰다(상태 조회가 몇 초 걸린다).
     */
    const [bridgeState, setBridgeState] = useState<BridgeStatus | 'probing' | null>(null);
    const probeOnce = () => {
        if (bridgeState !== null) return;
        setBridgeState('probing');
        probeBridge().then(setBridgeState);
    };
    const agentReady = typeof bridgeState === 'object' && bridgeState !== null
        && bridgeState.connected && (bridgeState.agents || []).some((agent) => agent.available);
    /** 클로드 구독 토큰 — 있으면 앱과 무관하게 서버가 생성한다(1순위 경로). */
    const storedKeys = loadUserKeys();
    const tokenReady = Boolean(storedKeys.claudeToken);
    // 기존에 저장돼 있던 Gemini/OpenAI 키가 있으면 서버 폴백으로 여전히 쓰인다.
    const anyKeyReady = tokenReady || Boolean(storedKeys.geminiKey || storedKeys.openaiKey);

    /*
     * 이 질문으로 쓸 글감(사장님 지시 2026-08-20) — 키워드를 누르면 그 키워드의
     * SEO·홈판 제목이 펼쳐진다. 답변만 달고 끝나는 게 아니라 글로 잇는 다리다.
     */
    const [ideas, setIdeas] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; list: KinPostIdea[]; message?: string }>({ status: 'idle', list: [] });
    const [openIdea, setOpenIdea] = useState('');
    const [copiedTitle, setCopiedTitle] = useState('');

    const loadIdeas = async () => {
        if (!work || ideas.status === 'loading') return;
        setIdeas({ status: 'loading', list: [] });
        const result = await fetchKinPostIdeas({ title: work.title, body: workBody.text });
        if (result.ok && result.data?.ideas?.length) {
            setIdeas({ status: 'done', list: result.data.ideas });
            setOpenIdea(result.data.ideas[0].keyword);
            return;
        }
        setIdeas({ status: 'error', list: [], message: result.message || result.error || '글감을 만들지 못했습니다.' });
    };

    const copyTitle = (text: string) => {
        navigator.clipboard?.writeText(text);
        setCopiedTitle(text);
        window.setTimeout(() => setCopiedTitle(''), 1500);
    };

    const openWork = (q: KinQ) => {
        probeOnce();
        setWork(q);
        setIdeas({ status: 'idle', list: [] });
        setOpenIdea('');
        setDraft('');
        setGenNote('');
        setWithLink(false);
        setDraftCopied(false);
        setWorkBody({ loading: true, text: '' });
        fetchKinQuestion(q.link).then((res) => {
            // 전문을 못 받으면 요약이라도 — 없는 본문을 지어내지 않는다.
            setWorkBody({ loading: false, text: (res.ok && res.data?.body) || q.summary || '' });
        });
    };

    const generate = async () => {
        if (!work || generating) return;
        setGenerating(true);
        setGenNote('');
        const input = {
            title: work.title,
            body: workBody.text,
            withLink: withLink && linkAllowed,
            blogUrl: blogUrl.trim(),
        };
        /*
         * 사용자가 고른 엔진을 따른다(사장님 확정 2026-08-20 "선택해서 연동하고
         * 쓰는 것"). 클로드는 사이트가 직접(앱 불필요), 나머지는 앱이 그 엔진
         * 하나로 실행한다 — 몰래 다른 엔진으로 갈아타지 않는다.
         */
        const picked = String(loadUserKeys().aiProvider || '');
        if (picked && picked !== 'claude') {
            const viaApp = await bridgeKinAnswer({ ...input, provider: picked });
            setGenerating(false);
            if (viaApp.status === 'ok') { setDraft(viaApp.answer); rememberWorked(work, viaApp.answer); return; }
            setGenNote(viaApp.status === 'error'
                ? `생성 실패(${picked}): ${viaApp.message}`
                : `${picked} 는 LEWORD 앱을 통해 돕니다 — 앱을 켜고 다시 눌러 주세요(내 API 키 탭에서 다른 엔진으로 바꿀 수도 있습니다).`);
            return;
        }

        const viaKeys = await fetchKinAnswer(input);
        if (viaKeys.ok && viaKeys.data?.answer) {
            setGenerating(false);
            setDraft(viaKeys.data.answer);
            rememberWorked(work, viaKeys.data.answer);
            return;
        }
        if (viaKeys.error && viaKeys.error !== 'needs-keys') {
            setGenerating(false);
            /*
             * 폐기된 수동 토큰(갱신 토큰 없음)이 남아 있으면 이 오류가 반복된다 —
             * 죽은 토큰은 지워 주고 버튼 재연결로 안내한다(사장님 실사고 2026-08-20).
             */
            const stored = loadUserKeys();
            if (/invalid bearer|revoked|expired/i.test(viaKeys.message || '') && stored.claudeToken && !stored.claudeRefresh) {
                saveUserKeys({ ...stored, claudeToken: '' });
                setGenNote('저장돼 있던 토큰이 폐기된 것이라 지웠습니다 — 내 API 키 탭의 [구독 연결] 버튼으로 다시 연결하면 자동 갱신되는 토큰이 저장됩니다.');
                return;
            }
            setGenNote(`생성 실패: ${viaKeys.message || viaKeys.error}`);
            return;
        }
        const viaApp = await bridgeKinAnswer(input);
        setGenerating(false);
        if (viaApp.status === 'ok') {
            setDraft(viaApp.answer);
            rememberWorked(work, viaApp.answer);
            return;
        }
        if (viaApp.status === 'error') {
            setGenNote(`생성 실패: ${viaApp.message}`);
            return;
        }
        setGenNote('내 API 키 탭에 클로드코드 토큰(터미널에서 claude setup-token 한 줄, 구독이라 무료)을 넣으면 앱 없이 바로 생성됩니다. Gemini 무료 키나 LEWORD 앱 실행으로도 됩니다.');
    };

    const copyDraft = () => {
        if (!draft.trim()) return;
        navigator.clipboard?.writeText(draft);
        setDraftCopied(true);
        window.setTimeout(() => setDraftCopied(false), 1600);
        // 복사 = 게시로 간주해 장부에 적는다 — 10:1 규칙의 눈금이다.
        const next = [{ at: new Date().toISOString(), withLink: withLink && linkAllowed }, ...ledger].slice(0, 50);
        setLedger(next);
        if (work) rememberWorked(work, draft, true);
        try { localStorage.setItem(LEDGER_KEY, JSON.stringify(next)); } catch { /* 계속 */ }
    };

    useEffect(() => {
        let cancelled = false;
        fetch('/data/kin-golden.json')
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then((json) => { if (!cancelled) { setData(json); setStatus('ready'); } })
            .catch(() => { if (!cancelled) setStatus('error'); });
        /*
         * 보드 출신 질문 합류는 뺐다(사장님 지적 2026-08-20): 작성일이 없어
         * "최신 질문" 약속과 모순되는 묵은 질문(조회 4만짜리 옵트아웃 등)이
         * 숨은 레인에 끼었다. 숨은 레인은 날짜·생기(조회 증가)가 실측된
         * 크롤 수집분만 싣는다.
         */
        return () => { cancelled = true; };
    }, []);

    const docIdOf = (link: string) => (link.match(/docId=(\d+)/) || [])[1] || link;

    const laneItems = useMemo<KinQ[]>(() => {
        // 보관함·검색은 수집과 무관하다 — 데이터가 없어도 보인다.
        if (lane === 'worked') return worked;
        if (lane === 'search') return search.list;
        if (!data) return [];
        if (lane === 'realtime') return data.realtime || [];
        if (lane === 'rising') return data.rising || [];
        // 정렬은 수집기가 한다 — 지금 조회가 붙는 순. 화면이 다시 섞지 않는다.
        return data.hidden || [];
    }, [data, lane, worked, search]);

    /** 이미 작업한 질문인지 — 다른 레인에서도 표시해 중복 작업을 막는다. */
    const workedIds = useMemo(() => new Set(worked.map((item) => docIdOfLink(item.link))), [worked]);

    const fetchedLabel = data?.fetchedAt
        ? new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(data.fetchedAt))
        : '';

    return (
        <>
            <TabIntro
                title="지식인 황금질문"
                desc="질문이 곧 키워드입니다. 많이 본 질문은 지금 카페·SNS·검색에서도 같은 질문이 터지고 있다는 실측 신호라, 답변에 글 링크를 얹으면 외부유입이 연쇄됩니다. 조회수·답변수는 전부 질문 페이지 실측입니다."
                source={`지식인 실측 수집${fetchedLabel ? ` · ${fetchedLabel} 수집` : ''} · 15분마다 갱신`}
            />

            <div className="lw-segment lw-segment-wrap" role="group" aria-label="질문 레인">
                {LANES.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={lane === item.id ? 'on' : ''}
                        onClick={() => setLane(item.id)}
                    >{item.label} <em>{item.id === 'realtime' ? (data?.realtime || []).length
                        : item.id === 'rising' ? (data?.rising || []).length
                            : item.id === 'worked' ? worked.length
                                : item.id === 'search' ? search.list.length
                                    : (data?.hidden || []).length}</em></button>
                ))}
            </div>
            <p className="lw-write-hint">{LANES.find((item) => item.id === lane)?.hint}</p>

            {lane === 'search' && (
                <form className="lw-search" onSubmit={(event) => { event.preventDefault(); runSearch(); }}>
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="찾을 키워드 (예: 전세보증금 반환)"
                        aria-label="지식인 질문 검색어"
                    />
                    <label className="lw-kg-recent">
                        <input type="checkbox" checked={searchRecent} onChange={(event) => setSearchRecent(event.target.checked)} />
                        최신순만
                    </label>
                    <button type="submit" disabled={search.status === 'loading' || !searchQuery.trim()}>
                        {search.status === 'loading' ? '찾는 중…' : '검색'}
                    </button>
                </form>
            )}
            {lane === 'search' && search.status !== 'loading' && search.message && (
                <div className="lw-note">{search.message}</div>
            )}
            {lane === 'search' && search.status === 'idle' && !search.message && (
                <div className="lw-note">키워드를 넣으면 그 주제의 지식인 질문을 찾아 조회수·답변수를 실측합니다.</div>
            )}

            {status === 'loading' && <div className="lw-note">질문 실측을 불러오는 중입니다…</div>}
            {status === 'error' && (
                <div className="lw-note lw-note-error">
                    <strong>아직 수집 전입니다</strong>
                    <p>15분 주기 수집이 한 번 돌면 여기에 채워집니다.</p>
                </div>
            )}

            {status === 'ready' && lane === 'rising' && laneItems.length === 0 && (
                <div className="lw-note">
                    급상승은 두 번의 실측 차이로만 잽니다. 직전 스냅샷이 쌓이면(다음 수집부터) 여기 채워집니다.
                    {data?.criteria?.rising ? ` 기준: ${data.criteria.rising}` : ''}
                </div>
            )}
            {lane === 'worked' && laneItems.length === 0 && (
                <div className="lw-note">
                    아직 없습니다. 질문에서 [답변 달기] → [AI 답변 생성]을 하면 그 질문과 초안이 여기 남습니다
                    — 목록이 15분마다 갱신돼도 사라지지 않습니다.
                </div>
            )}
            {status === 'ready' && lane === 'hidden' && laneItems.length === 0 && (
                <div className="lw-note">이번 실측에서 기준(조회 많음 · 답변 적음)을 만족한 숨은 질문이 없습니다.</div>
            )}

            {(status === 'ready' || lane === 'worked' || lane === 'search') && laneItems.length > 0 && (
                <ol className="lw-kg-list">
                    {laneItems.map((q, index) => (
                        <li key={q.link}>
                            <span className="lw-kg-rank">{q.rank ?? index + 1}</span>
                            <div className="lw-kg-body">
                                <a href={q.link} target="_blank" rel="noreferrer">{q.title}</a>
                                {q.summary && <p>{q.summary}</p>}
                                <small>
                                    {typeof q.views === 'number' && <b>조회 {formatCount(q.views)}</b>}
                                    {typeof q.viewsDelta === 'number' && q.viewsDelta > 0 && (
                                        <> · <em className="lw-kg-up">15분간 +{formatCount(q.viewsDelta)}</em></>
                                    )}
                                    {typeof q.answers === 'number' && <> · 답변 {q.answers}</>}
                                    {q.askedAt && <> · {q.askedAt.slice(5)} 질문</>}
                                    {lane !== 'worked' && workedIds.has(docIdOfLink(q.link)) && (
                                        <> · <em className="lw-kg-worked">✓ 작업함</em></>
                                    )}
                                    {lane === 'worked' && (q as WorkedItem).copied && (
                                        <> · <em className="lw-kg-worked">✓ 복사함</em></>
                                    )}
                                    {typeof q.perHour === 'number' && <> · <em className="lw-kg-up">시간당 +{formatCount(q.perHour)}</em></>}
                                    {q.keyword && (
                                        <> · 키워드 {onAnalyze
                                            ? <button type="button" className="lw-kg-kw" onClick={() => onAnalyze(q.keyword!)}>{q.keyword}</button>
                                            : q.keyword}</>
                                    )}
                                </small>
                            </div>
                            <span className="lw-kg-row-actions">
                                {lane === 'worked' ? (
                                    <button type="button" className="lw-kg-copy" onClick={() => forgetWorked(q.link)}>보관 해제</button>
                                ) : null}
                                <button type="button" className="lw-kg-answer" onClick={() => openWork(q)}>
                                    {workedIds.has(docIdOfLink(q.link)) ? '이어서 작업' : '답변 달기'}
                                </button>
                                <button
                                    type="button"
                                    className="lw-kg-copy"
                                    onClick={() => {
                                        navigator.clipboard?.writeText(q.title);
                                        setCopied(q.link);
                                        window.setTimeout(() => setCopied(''), 1400);
                                    }}
                                >{copied === q.link ? '복사됨' : '질문 복사'}</button>
                            </span>
                        </li>
                    ))}
                </ol>
            )}

            {/* 답변 작업대 — 질문 전문 + AI 초안 + 10:1 링크 장부. 게시는 사용자가 직접. */}
            {work && (
                <div className="lw-plan-backdrop" role="presentation" onClick={() => setWork(null)}>
                    <div
                        className="lw-plan-modal lw-kg-work"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${work.title} 답변 작업대`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="lw-plan-head">
                            <div>
                                <h3>{work.title}</h3>
                                <small className="lw-kg-work-meta">
                                    {typeof work.views === 'number' ? `조회 ${formatCount(work.views)}` : ''}
                                    {typeof work.answers === 'number' ? ` · 답변 ${work.answers}` : ''}
                                    {work.askedAt ? ` · ${work.askedAt.slice(5)} 질문` : ''}
                                </small>
                            </div>
                            <button type="button" className="lw-plan-close" onClick={() => setWork(null)} aria-label="닫기">✕</button>
                        </header>

                        <div className="lw-plan-body">
                            <section>
                                <strong>질문 전문</strong>
                                {workBody.loading
                                    ? <p className="lw-kg-work-body">질문 본문을 불러오는 중…</p>
                                    : <p className="lw-kg-work-body">{workBody.text || '본문 없이 제목만 있는 질문입니다.'}</p>}
                            </section>

                            <section>
                                <strong>답변 초안 — 깔끔·담백·정확, AI 티 0</strong>
                                {/* 연동 상태 — 안 된 단계만 짚어 준다. 실측이고, 지어낸 상태 표시는 없다. */}
                                <p className={`lw-kg-bridge${anyKeyReady || agentReady ? ' ok' : ''}`}>
                                    {anyKeyReady
                                        ? tokenReady
                                            ? '✅ 클로드코드 토큰 연동됨 — 앱 없이, 구독으로 추가 비용 없이 생성'
                                            : '✅ AI 키 연동됨 — 앱 없이 생성됩니다'
                                        : bridgeState === 'probing' || bridgeState === null
                                            ? '연동 상태 확인 중…'
                                            : agentReady
                                                ? '✅ 내 PC 의 LEWORD 앱 연동됨 — 구독으로 추가 비용 없이 생성'
                                                : '연동 전 — 내 API 키 탭에 클로드코드 토큰(claude setup-token, 구독 무료)을 넣으면 앱 없이 됩니다.'}
                                </p>
                                <textarea
                                    className="lw-kg-draft"
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    placeholder="'AI 답변 생성'을 누르면 내 구독으로 초안이 만들어집니다. 고쳐 쓰셔도 됩니다."
                                    rows={8}
                                />
                                {genNote && (
                                    <p className="lw-kg-work-note">
                                        {genNote} <a href="/leword?tab=keys">내 API 키 탭 열기</a>
                                    </p>
                                )}
                                <div className="lw-kg-work-actions">
                                    <button type="button" className="lw-kg-generate" onClick={generate} disabled={generating}>
                                        {generating ? '생성 중… (내 구독)' : draft ? '다시 생성' : 'AI 답변 생성'}
                                    </button>
                                    <button type="button" onClick={copyDraft} disabled={!draft.trim()}>
                                        {draftCopied ? '복사됨 — 지식인에 붙여넣으세요' : '복사 → 지식인에 붙여넣기'}
                                    </button>
                                    {/* 답변 편집기로 바로 — 로그인 상태면 그 화면이 열린다(앵커 실측: #smartEditorArea). */}
                                    <a
                                        href={`${work.link}${work.link.includes('?') ? '&' : '?'}answerWrite=Y#smartEditorArea`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="lw-kg-open"
                                    >답변 바로 하러 가기</a>
                                    <label className={`lw-kg-linkbox${linkAllowed ? '' : ' off'}`} title={linkAllowed ? '' : '최근 9개 안에 링크 답변이 있습니다 — 링크 없이 더 달아야 합니다'}>
                                        <input
                                            type="checkbox"
                                            checked={withLink && linkAllowed}
                                            disabled={!linkAllowed}
                                            onChange={(event) => setWithLink(event.target.checked)}
                                        />
                                        내 글 링크 추가
                                    </label>
                                </div>
                                {withLink && linkAllowed && (
                                    <input
                                        type="text"
                                        className="lw-kg-bloginput"
                                        value={blogUrl}
                                        onChange={(event) => {
                                            setBlogUrl(event.target.value);
                                            try { localStorage.setItem(BLOG_URL_KEY, event.target.value); } catch { /* 계속 */ }
                                        }}
                                        placeholder="자동화로 발행한 글 주소 (답변 끝에 사람 말투로 붙습니다)"
                                    />
                                )}
                            </section>

                            {/* 이 질문으로 쓸 글감 — 키워드 클릭 시 SEO·홈판 제목이 펼쳐진다. */}
                            <section>
                                <strong>이 질문으로 쓸 글감 — 키워드를 누르면 제목이 나옵니다</strong>
                                {ideas.status === 'idle' && (
                                    <button type="button" className="lw-mini" onClick={loadIdeas}>글감 뽑기</button>
                                )}
                                {ideas.status === 'loading' && <p className="lw-kg-work-note">질문에서 검색어를 추론하는 중…</p>}
                                {ideas.status === 'error' && (
                                    <p className="lw-kg-work-note">
                                        {ideas.message} <button type="button" className="lw-kg-kw" onClick={loadIdeas}>다시</button>
                                    </p>
                                )}
                                {ideas.status === 'done' && (
                                    <div className="lw-ideas">
                                        {ideas.list.map((idea) => (
                                            <div key={idea.keyword} className={`lw-idea${openIdea === idea.keyword ? ' on' : ''}`}>
                                                <button
                                                    type="button"
                                                    className="lw-idea-head"
                                                    aria-expanded={openIdea === idea.keyword}
                                                    onClick={() => setOpenIdea(openIdea === idea.keyword ? '' : idea.keyword)}
                                                >
                                                    <b>{idea.keyword}</b>
                                                    <span>{openIdea === idea.keyword ? '▲' : '▼'}</span>
                                                </button>
                                                {openIdea === idea.keyword && (
                                                    <div className="lw-idea-body">
                                                        {idea.why && <p className="lw-idea-why">{idea.why}</p>}
                                                        {/* 왜 클릭하는가 — 제목을 짓기 전 세운 동기. 제목이 이걸 지키는지 눈으로 검증한다. */}
                                                        {idea.clickWhy && <p className="lw-idea-click">왜 클릭하나 · {idea.clickWhy}</p>}
                                                        {[{ tag: 'SEO', text: idea.seo }, { tag: '홈판', text: idea.home }].map(
                                                            (row) => row.text && (
                                                                <div key={row.tag} className="lw-idea-title">
                                                                    <span>{row.tag}</span>
                                                                    <em>{row.text}</em>
                                                                    <button type="button" onClick={() => copyTitle(row.text)}>
                                                                        {copiedTitle === row.text ? '복사됨' : '복사'}
                                                                    </button>
                                                                </div>
                                                            ),
                                                        )}
                                                        {onAnalyze && (
                                                            <button type="button" className="lw-kg-kw" onClick={() => onAnalyze(idea.keyword)}>
                                                                이 키워드 분석하기 →
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="lw-kg-ledger">
                                <strong>계정 보호 장부</strong>
                                <p>
                                    최근 답변 {Math.min(ledger.length, 10)}개 중 링크 <b>{ledger.slice(0, 10).filter((e) => e.withLink).length}개</b>
                                    {linkAllowed
                                        ? ' — 이번 답변에 링크를 넣을 수 있습니다'
                                        : ' — 링크 없이 더 달아야 다음 링크 차례입니다 (10개 중 1개 규칙)'}
                                </p>
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default KinGoldenTab;
