import { useEffect, useRef, useState } from 'react';
import {
    auditBlogCheck,
    auditBlogPosts,
    checkRank,
    fetchKeywordVolumes,
    fetchRankByTabs,
    type TabRank,
    fetchPostAnalysis,
    type BlogAuditPost,
    type EngineExposure,
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
    /*
     * 이 순위가 **실제 검색 화면**에서 잰 값인가(사장님 지적 2026-08-22
     * "2위라면서 2위가 아니네요?"). 오픈API 순위는 노출 순서와 다르다 —
     * 실측 예: 오픈API 27위인 글이 실제 화면에서는 3위였다.
     * live 가 아니면 "API 기준"이라고 화면에 밝힌다.
     */
    kwLive?: boolean;
    extLive?: boolean;
    /** 구글·다음·줌 제목검색 노출 실측(구글은 차단 시 '측정 불가'로 정직하게). */
    engines?: EngineExposure | null;
    /*
     * 색인 사실 — 순위와 **다른 사실**이다(사장님 지적 2026-08-22
     * "네이버 색인 성공한 글도 많은데 하나도 없다는 게 말이 안 되고").
     * 상위 100 밖인 것과 아예 색인이 안 된 것은 할 일이 전혀 다르다:
     * 전자는 제목·경쟁 문제, 후자는 색인 문제다.
     * null 이면 못 쟀다는 뜻 — 모르는 것을 "없음"으로 단정하지 않는다.
     */
    indexed?: { indexed: boolean; siteIndexed: boolean; sampled: number } | null;
    /** 무엇으로 쟀는지 — 블로그 글은 블로그검색, 자체 도메인은 웹문서검색. */
    searchSource?: 'blog' | 'web';
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

/** 엔진별 수동 확인 링크 — 자동 판정이 애매하면 눈으로 검증하는 문이다. */
/*
 * 다음·줌은 뺐다(사장님 지시 2026-08-22). 유입이 사실상 없는 판이라 칸만
 * 차지했고, 어차피 "없음"만 줄줄이 찍혔다. 구글 하나만 남긴다 —
 * 방문자 브라이트데이터 키가 있으면 실제로 재고, 없으면 "확인 필요"다.
 */
const ENGINE_META: Array<{ id: keyof EngineExposure; label: string; search: (q: string) => string }> = [
    { id: 'google', label: '구글', search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
];

/** 네이버에서 이 검색어로 실제 결과를 보는 주소 — 노출된 글은 바로 가서 확인한다. */
const naverSearchUrl = (query: string) =>
    // 블로그탭 — 순위를 잰 화면과 같은 곳으로 보내야 눈으로 대조가 된다.
    `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(query)}`;

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
     * 노출/미노출을 갈라 본다(사장님 지시 2026-08-22 "노출된 거랑 노출 안 된 거랑
     * 나눠서 볼 수 있게"). 200건을 한 판에 두면 무엇을 손봐야 하는지 안 보인다.
     */
    const [auditFilter, setAuditFilter] = useState<'all' | 'in' | 'out' | 'push'>('all');
    /*
     * 한 번에 몇 건까지 가져올지(사장님 지시 2026-08-22 "50건 더 찾기 해서
     * 발행한 글들 전체적으로 점검할 수 있게"). 네이버 블로그 RSS 는 50건이
     * 상한이라 447건짜리 블로그가 50건만 점검됐다 — 목록 API 로 바꾸고
     * 여기서 폭을 넓힌다.
     */
    const [auditLimit, setAuditLimit] = useState(50);
    /*
     * 밀면 되는 자리(사장님 제안 2026-08-22 "반대로 이걸 역이용해서 상위노출될 수
     * 있는 키워드를 찾는 방법도 있을 것 같은데").
     *
     * 점검이 이미 **내 글이 어느 검색어에서 몇 위인지**를 안다. 거기에 검색량만
     * 붙이면 "17위인데 월 2,400이 치는 자리 = 조금만 밀면 1페이지"가 나온다.
     * 새 글을 쓸 필요가 없다 — 이미 쓴 글로 노리는 자리다.
     * 검색량은 검색광고 실측이고, 못 잰 검색어는 빈칸으로 둔다(0 과 모름은 다르다).
     */
    const [volumes, setVolumes] = useState<Record<string, number>>({});
    const [volumeState, setVolumeState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [volumeNote, setVolumeNote] = useState('');

    /*
     * 탭별 자리(사장님 지시 2026-08-22): "확인할 키워드"와 "순위 보고 싶은 글 주소"를
     * 받아 통합검색·블로그·웹사이트 세 탭을 각각 잰다. 제목을 고친 뒤 바로
     * 확인하는 자리이기도 하다 — 실제로 추천대로 제목을 바꿔 순위가 올랐다.
     */
    const [tabQuery, setTabQuery] = useState('');
    const [tabLink, setTabLink] = useState('');
    const [tabResult, setTabResult] = useState<{ query: string; link: string; checkedAt: string; tabs: Record<string, TabRank> } | null>(null);
    const [tabState, setTabState] = useState<'idle' | 'loading' | 'error'>('idle');
    const [tabNote, setTabNote] = useState('');
    const TAB_META = [
        { id: 'all', label: '통합검색', hint: '사람이 검색하면 처음 보는 화면' },
        { id: 'blog', label: '블로그', hint: '블로그 탭 — 블로그 글은 여기가 본판' },
        { id: 'web', label: '웹사이트', hint: '웹사이트 탭 — 자체 도메인 글은 여기' },
    ];
    /*
     * 이 기능은 **혼자 돈다**(사장님 확인 2026-08-22 "확인할 키워드랑 내 글 주소
     * 넣고 순위 확인은 따로야"). 전체 글 점검과 무관하다 — 검색어와 글 주소만
     * 있으면 바로 잰다. 위 표에서 [탭별 순위]를 누르면 두 칸이 자동으로 채워질 뿐이다.
     */
    const runTabRank = async (query: string, link: string) => {
        if (tabState === 'loading') return;
        if (!query.trim() || !link.trim()) {
            setTabNote('확인할 키워드와 글 주소를 모두 넣어 주세요.');
            return;
        }
        setTabState('loading');
        setTabNote('');
        const result = await fetchRankByTabs(query.trim(), link.trim());
        if (result.ok && result.data) {
            setTabResult(result.data);
            setTabState('idle');
            return;
        }
        setTabState('error');
        setTabNote(result.message || result.error || '순위를 못 쟀습니다.');
    };

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
            platform: audit?.platform,
            kwQuery: row.kwQuery,
            kwRank: row.kwRank ?? null,
            extQuery: row.extQuery,
            extRank: row.extRank ?? null,
            titleRank: row.rank,
            engines: row.engines || null,
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

    /**
     * 이 글이 잡힌 자리들 — 검색어 하나당 한 줄. 순위가 있는 것만 낸다.
     * 세 눈(키워드·확장·제목검색)에서 나온 검색어를 그대로 쓴다 — 새로 만들지 않는다.
     */
    type Slot = { query: string; rank: number; row: AuditRow; via: string };
    const slotsOf = (row: AuditRow): Slot[] => {
        const out: Slot[] = [];
        if (row.kwQuery && row.kwRank != null) out.push({ query: row.kwQuery, rank: row.kwRank, row, via: '키워드' });
        if (row.extQuery && row.extRank != null && row.extQuery !== row.kwQuery) {
            out.push({ query: row.extQuery, rank: row.extRank, row, via: '확장' });
        }
        if (row.rank != null) out.push({ query: row.title, rank: row.rank, row, via: '제목' });
        return out;
    };

    /** 순위 구간 — 무엇을 해야 하는지가 구간마다 다르다. */
    const bandOf = (rank: number) => (rank <= 10 ? 'keep' : rank <= 30 ? 'push' : 'far');
    const BAND_META: Record<string, { label: string; hint: string; cls: string }> = {
        keep: { label: '지키기', hint: '이미 1페이지 — 경쟁자가 밀고 들어오는지 보면 됩니다', cls: 'lw-band-keep' },
        push: { label: '밀면 됨', hint: '1페이지 바로 밖 — 제목·본문을 조금 손보면 넘어갑니다', cls: 'lw-band-push' },
        far: { label: '보류', hint: '31위 아래 — 손봐서 되는 경우가 줄어듭니다', cls: 'lw-band-far' },
    };

    /** 검색량 재기 — 점검이 끝난 줄에서 나온 검색어만 모아 한 번에 묻는다. */
    const measureVolumes = async () => {
        if (!audit || volumeState === 'loading') return;
        const queries = [...new Set(audit.rows.filter((row) => row.status === 'done').flatMap((row) => slotsOf(row).map((s) => s.query)))];
        if (queries.length === 0) { setVolumeNote('아직 잡힌 자리가 없습니다 — 점검을 먼저 끝내 주세요.'); return; }
        setVolumeState('loading');
        setVolumeNote('');
        const result = await fetchKeywordVolumes(queries.slice(0, 100));
        if (result.ok && result.data?.volumes) {
            setVolumes(result.data.volumes);
            setVolumeState('done');
            setVolumeNote(`검색어 ${queries.length}개 중 ${Object.keys(result.data.volumes).length}개 실측`);
            return;
        }
        setVolumeState('error');
        setVolumeNote(result.message || result.error || '검색량을 못 쟀습니다.');
    };

    /** 검색광고는 공백을 뗀 형태로 돌려준다 — 같은 규칙으로 찾는다. */
    const volumeOf = (query: string) => volumes[query.replace(/\s+/g, '')] ?? null;

    const persistAudit = (state: AuditState | null) => {
        setAudit(state);
        try {
            if (state) localStorage.setItem(AUDIT_STORE_KEY, JSON.stringify(state));
        } catch { /* 저장 실패해도 화면은 산다 */ }
    };

    /*
     * resume=true 면 저장된 결과를 그대로 두고 **아직 못 본 줄만** 마저 본다
     * (사장님 지적 2026-08-22 "얘네는 왜 이런 식으로 나오니?" — 아래쪽이 전부 '—').
     *
     * 200건은 4줄로 돌려도 4분쯤 걸린다(실측: 한 건 중앙값 4.5초). 그 사이
     * 새로고침하거나 탭을 떠나면 이 루프가 사라지고, 남은 줄은 '확인 전' 상태로
     * 저장된 채 영영 '—' 로 남았다 — 다시 시작할 방법조차 없었다.
     */
    const runAudit = async (resume = false, nextLimit = auditLimit) => {
        const url = (resume && audit ? audit.url : auditUrl).trim();
        if (!url || auditLoading) return;
        const runId = auditRunId.current + 1;
        auditRunId.current = runId;
        setAuditLoading(true);
        setAuditError('');

        let state: AuditState;
        if (resume && audit && audit.rows.length > 0) {
            // 이미 본 줄은 그대로 두고, 못 본 줄만 다시 대기로 돌린다.
            state = {
                ...audit,
                rows: audit.rows.map((row) => (row.status === 'done' ? row : { ...row, status: 'wait' as const })),
            };
        } else {
            const listed = await auditBlogPosts(url, nextLimit);
            if (!listed.ok || !listed.data) {
                setAuditLoading(false);
                setAuditError(listed.message || '피드를 읽지 못했습니다.');
                return;
            }
            state = {
                url,
                platform: listed.data.platform,
                checkedAt: new Date().toISOString(),
                rows: listed.data.posts.map((post) => ({ ...post, status: 'wait', rank: null, sampled: 0, sympathy: null })),
            };
        }
        persistAudit(state);

        /*
         * 네 건씩 나란히 확인한다.
         *
         * 예전에는 한 건씩 줄 세웠다. 글이 다섯 건일 때는 그래도 됐지만, 피드
         * 대신 전량(200건)을 받게 되니 15분이 넘어간다(사장님 지시 2026-08-21
         * "5건만 말고 전부"). 네 갈래면 넉넉히 4분 안쪽이고, 네이버 오픈API
         * 하루 한도에 견주면 여전히 조용한 편이다.
         */
        const LANES = 4;
        const checkOne = async (index: number) => {
            if (auditRunId.current !== runId) return;
            try {
            state = { ...state, rows: state.rows.map((row, i) => (i === index ? { ...row, status: 'checking' } : row)) };
            setAudit(state);
            const post = state.rows[index];
            const checked = await auditBlogCheck(post.title, post.link);
            if (auditRunId.current !== runId) return;
            const payload = checked.ok ? checked.data as (typeof checked.data & {
                keyword?: { query: string; rank: number | null; live?: boolean; apiRank?: number | null };
                extended?: { query: string; rank: number | null; live?: boolean; apiRank?: number | null };
                engines?: EngineExposure;
                indexed?: { indexed: boolean; siteIndexed: boolean; sampled: number } | null;
                searchSource?: 'blog' | 'web';
            }) | null : null;
            const done: AuditRow = payload
                ? {
                    ...post, status: 'done',
                    rank: payload.rank, sampled: payload.sampled, sympathy: payload.sympathy,
                    kwQuery: payload.keyword?.query, kwRank: payload.keyword ? payload.keyword.rank : undefined,
                    extQuery: payload.extended?.query, extRank: payload.extended ? payload.extended.rank : undefined,
                    kwLive: payload.keyword?.live === true,
                    extLive: payload.extended?.live === true,
                    engines: payload.engines || null,
                    // 색인 사실과 무엇으로 쟀는지를 화면까지 그대로 나른다.
                    indexed: payload.indexed ?? null,
                    searchSource: payload.searchSource,
                }
                : { ...post, status: 'error', rank: null, sampled: 0, sympathy: null };
                state = { ...state, rows: state.rows.map((row, i) => (i === index ? done : row)) };
                persistAudit(state);
            } catch {
                /*
                 * 한 건이 터져도 그 줄만 실패로 두고 계속 간다. 예전엔 여기서
                 * 예외가 나면 그 갈래가 통째로 죽어 나머지가 영영 '—' 로 남았다.
                 */
                state = {
                    ...state,
                    rows: state.rows.map((row, i) => (i === index
                        ? { ...row, status: 'error' as const, rank: null, sampled: 0, sympathy: null }
                        : row)),
                };
                persistAudit(state);
            }
        };

        let cursor = 0;
        const lane = async () => {
            while (cursor < state.rows.length) {
                if (auditRunId.current !== runId) return;
                const index = cursor;
                cursor += 1;
                // 이어하기에서 이미 본 줄은 다시 재지 않는다 — API 를 아낀다.
                if (state.rows[index]?.status === 'done') continue;
                await checkOne(index);
            }
        };
        await Promise.all(Array.from({ length: LANES }, () => lane()));
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
                {audit && !auditLoading && (
                    <button
                        type="button"
                        className="lw-mini lw-mini-ghost"
                        onClick={() => {
                            auditRunId.current += 1;
                            persistAudit(null);
                            try { localStorage.removeItem(AUDIT_STORE_KEY); } catch { /* 계속 */ }
                        }}
                    >점검 초기화</button>
                )}
            </form>

            {auditError && <div className="lw-note lw-note-error"><strong>{auditError}</strong></div>}

            {audit && audit.rows.length > 0 && (
                <section className="lw-panel" aria-label="발행 글 노출 점검">
                    <div className="lw-panel-head">
                        <h2>
                            {PLATFORM_LABEL[audit.platform] || audit.platform} · 발행 글 {audit.rows.length}건
                            {auditLoading && (
                                <span className="lw-audit-progress">
                                    {audit.rows.filter((row) => row.status === 'done' || row.status === 'error').length}건 확인
                                </span>
                            )}
                        </h2>
                        <span>
                            순위 세 눈(각각 상위 100 실측): <strong>키워드</strong>(제목의 핵심어 검색 — 사람이 실제로 치는 것)
                            → <strong>확장</strong>(핵심어+한정어) → <strong>제목검색</strong>(제 제목으로 잡히는지).
                            각 칸 아래 회색 글씨가 실제 사용한 검색어이고, <strong>순위를 누르면 그 검색결과로 갑니다</strong>.
                            자체 도메인(워드프레스)은 웹문서 검색으로 잽니다 — 블로그 검색에는 원래 안 잡힙니다.
                            조회수·공감은 공개 API 가 없어 싣지 않습니다.
                        </span>
                    </div>
                    {(() => {
                        const done = audit.rows.filter((row) => row.status === 'done');
                        const shown = done.filter((row) => row.rank !== null).length;
                        const left = audit.rows.length - done.length;
                        return (
                          <>
                            {/*
                              * 중단된 점검을 이어서 한다. 200건은 4분쯤 걸리는데 그 사이
                              * 새로고침하면 루프가 사라지고 남은 줄이 '—' 로 굳어 버렸다.
                              * 이미 본 줄은 다시 재지 않는다.
                              */}
                            {/*
                              * 더 찾기 — 목록을 넓혀 다시 받는다. 이미 본 글은
                              * 다시 재지 않으므로 늘어난 만큼만 새로 걸린다.
                              */}
                            {!auditLoading && audit.rows.length >= auditLimit && (
                                <div className="lw-audit-resume">
                                    <span>지금 <b>{audit.rows.length}건</b>까지 받았습니다 — 발행 글이 더 있으면 넓혀서 받습니다.</span>
                                    <button type="button" onClick={() => {
                                        const next = auditLimit + 50;
                                        setAuditLimit(next);
                                        void runAudit(false, next);
                                    }}>50건 더 찾기</button>
                                </div>
                            )}
                            {left > 0 && !auditLoading && (
                                <div className="lw-audit-resume">
                                    <span>아직 못 본 글 <b>{left}건</b>이 남았습니다 — 새로고침하거나 탭을 옮기면 점검이 멈춥니다.</span>
                                    <button type="button" onClick={() => { void runAudit(true); }}>이어서 점검</button>
                                </div>
                            )}
                            <div className="lw-audit-filters" role="group" aria-label="노출 여부로 나눠 보기">
                                <button type="button" className={auditFilter === 'all' ? 'on' : ''} onClick={() => setAuditFilter('all')}>
                                    전체 <em>{audit.rows.length}</em>
                                </button>
                                <button type="button" className={auditFilter === 'in' ? 'on' : ''} onClick={() => setAuditFilter('in')}>
                                    노출됨 <em>{shown}</em>
                                </button>
                                <button type="button" className={auditFilter === 'out' ? 'on' : ''} onClick={() => setAuditFilter('out')}>
                                    노출 안 됨 <em>{done.length - shown}</em>
                                </button>
                                {/*
                                  * 역이용 — 이미 잡힌 자리에 검색량을 붙여 "밀면 되는 곳"을 고른다
                                  * (사장님 제안 2026-08-22). 새 글이 아니라 쓴 글로 노리는 자리다.
                                  */}
                                <button type="button" className={auditFilter === 'push' ? 'on' : ''} onClick={() => setAuditFilter('push')}>
                                    밀면 되는 자리 <em>{done.flatMap(slotsOf).length}</em>
                                </button>
                            </div>
                          </>
                        );
                    })()}
                    {auditFilter === 'push' ? (() => {
                        const slots = audit.rows.filter((row) => row.status === 'done').flatMap(slotsOf)
                            .sort((a, b) => {
                                // 구간이 먼저(지키기 → 밀기 → 보류), 같은 구간 안에서는 검색량 큰 순.
                                const order = { keep: 0, push: 1, far: 2 } as Record<string, number>;
                                const oa = order[bandOf(a.rank)];
                                const ob = order[bandOf(b.rank)];
                                if (oa !== ob) return oa - ob;
                                return (volumeOf(b.query) ?? -1) - (volumeOf(a.query) ?? -1);
                            });
                        return (
                            <>
                                <div className="lw-push-head">
                                    <p>
                                        이미 잡힌 자리에 <b>월 검색량</b>을 붙여 봅니다 — 새 글이 아니라 <b>이미 쓴 글</b>로 노리는 자리입니다.
                                        검색량은 네이버 검색광고 실측이고, 못 잰 검색어는 빈칸으로 둡니다.
                                    </p>
                                    <button type="button" onClick={() => { void measureVolumes(); }} disabled={volumeState === 'loading'}>
                                        {volumeState === 'loading' ? '재는 중…' : volumeState === 'done' ? '다시 재기' : '검색량 재기'}
                                    </button>
                                </div>
                                {volumeNote && <p className={`lw-push-note${volumeState === 'error' ? ' error' : ''}`}>{volumeNote}</p>}
                                {slots.length === 0 && <div className="lw-note">아직 잡힌 자리가 없습니다 — 점검을 끝내면 여기에 모입니다.</div>}
                                <div className="lw-table-scroll">
                                    <table className="lw-table lw-audit-table">
                                        <thead>
                                            <tr>
                                                <th scope="col">할 일</th>
                                                <th scope="col">검색어</th>
                                                <th scope="col">현재 순위</th>
                                                <th scope="col">월 검색량</th>
                                                <th scope="col">어느 글</th>
                                                <th scope="col" aria-label="분석" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {slots.map((slot) => {
                                                const band = BAND_META[bandOf(slot.rank)];
                                                const vol = volumeOf(slot.query);
                                                return (
                                                    <tr key={`${slot.row.link}-${slot.via}-${slot.query}`}>
                                                        <td><span className={`lw-audit-badge ${band.cls}`} title={band.hint}>{band.label}</span></td>
                                                        <td className="lw-rank-title">
                                                            <a href={naverSearchUrl(slot.query)} target="_blank" rel="noreferrer">{slot.query} ↗</a>
                                                            <small className="lw-audit-q">{slot.via} 검색</small>
                                                        </td>
                                                        <td className="lw-rank-in">{slot.rank}위</td>
                                                        <td className={vol === null ? 'lw-rank-out' : 'lw-rank-in'}>
                                                            {vol === null ? (volumeState === 'done' ? '못 쟀음' : '—') : vol.toLocaleString('ko-KR')}
                                                        </td>
                                                        <td className="lw-rank-title">
                                                            <a href={slot.row.link} target="_blank" rel="noreferrer">{slot.row.title}</a>
                                                        </td>
                                                        <td>
                                                            <button type="button" className="lw-mini" onClick={() => { void openAnalysis(slot.row); }}>글 분석하기</button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        );
                    })() : (
                    <div className="lw-table-scroll">
                        <table className="lw-table lw-audit-table">
                            <thead>
                                <tr>
                                    <th scope="col">상태</th>
                                    <th scope="col">제목</th>
                                    <th scope="col">발행일</th>
                                    <th scope="col">키워드 순위</th>
                                    <th scope="col">확장 순위</th>
                                    <th scope="col" title="그 글의 제목을 그대로 검색했을 때의 자리 — 생존 확인">네이버 제목검색</th>
                                    {/*
                                      * 엔진을 칸마다 갈라 세운다(사장님 지시 2026-08-21
                                      * "구글은 구글 다음은 다음 줌은 줌"). 한 칸에 칩 세 개를
                                      * 뭉쳐 두면 어느 엔진이 문제인지 눈으로 못 고른다 —
                                      * 엔진마다 대응이 다르므로 칸도 달라야 한다.
                                      */}
                                    {ENGINE_META.map((engine) => (
                                        <th key={engine.id} scope="col" title={`${engine.label} 제목검색에 이 글 주소가 보이는가 — 눌러서 직접 확인`}>{engine.label}</th>
                                    ))}
                                    <th scope="col" aria-label="분석" />
                                </tr>
                            </thead>
                            <tbody>
                                {audit.rows.filter((row) => (auditFilter === 'all'
                                    ? true
                                    // 확인 전인 줄은 아직 어느 쪽인지 모른다 — 나눠 볼 때는 숨긴다.
                                    : row.status === 'done' && (auditFilter === 'in' ? row.rank !== null : row.rank === null))).map((row) => (
                                    <tr key={row.link}>
                                        <td>
                                            {row.status === 'wait' && <span className="lw-audit-badge lw-audit-wait">대기</span>}
                                            {row.status === 'checking' && <span className="lw-audit-badge lw-audit-wait">확인 중…</span>}
                                            {row.status === 'error' && <span className="lw-audit-badge lw-audit-wait">확인 실패</span>}
                                            {/*
                                              * 순위와 색인을 갈라서 말한다(사장님 지적 2026-08-22).
                                              * 예전엔 상위 100 밖이면 무조건 "차단(저품질) 의심"이라
                                              * 찍었는데, 색인은 멀쩡한 경우가 대부분이다. 실측으로
                                              * 확인한 사실만 적는다 — 못 쟀으면 못 쟀다고 한다.
                                              */}
                                            {row.status === 'done' && (row.rank !== null
                                                ? <span className="lw-audit-badge lw-audit-in">노출</span>
                                                : row.indexed?.indexed
                                                    ? <span className="lw-audit-badge lw-audit-half">순위 밖</span>
                                                    : <span className="lw-audit-badge lw-audit-out">못 찾음</span>)}
                                            {row.status === 'done' && row.rank === null && (
                                                <small className="lw-audit-why">
                                                    {row.indexed === null || row.indexed === undefined
                                                        ? '상위 100 밖 · 색인 여부는 못 쟀습니다'
                                                        : row.indexed.indexed
                                                            ? '색인은 됨 · 상위 100 밖(제목·경쟁 문제)'
                                                            : row.indexed.siteIndexed
                                                                ? '사이트는 색인됨 · 이 글은 아직 안 잡힘'
                                                                : '이 사이트가 네이버에서 안 잡힙니다'}
                                                    {row.searchSource === 'web' ? ' · 웹문서 검색 기준' : ''}
                                                </small>
                                            )}
                                        </td>
                                        <td className="lw-rank-title">
                                            <a href={row.link} target="_blank" rel="noreferrer">{row.title}</a>
                                        </td>
                                        <td>{row.publishedAt || '—'}</td>
                                        <td className={row.kwRank === null ? 'lw-rank-out' : 'lw-rank-in'}>
                                            {/*
                                              * 노출된 자리는 눌러서 그 검색결과로 바로 간다
                                              * (사장님 지시 2026-08-22 "노출됐으면 노출된 검색결과를
                                              * 바로 갈 수 있게"). 순위만 적어 두면 눈으로 확인하려고
                                              * 검색어를 다시 쳐야 한다.
                                              */}
                                            {row.status !== 'done' ? '—' : row.kwRank != null
                                                ? (
                                                    <a
                                                        className={`lw-rank-go${row.kwLive ? '' : ' lw-rank-api'}`}
                                                        href={naverSearchUrl(row.kwQuery || '')}
                                                        target="_blank" rel="noreferrer"
                                                        title={row.kwLive ? '실제 검색 화면에서 잰 자리 — 눌러서 확인' : '오픈API 기준 — 실제 노출 순서와 다를 수 있습니다'}
                                                    >{row.kwRank}위{row.kwLive ? ' ↗' : ' (API) ↗'}</a>
                                                )
                                                : row.kwQuery ? '없음' : '—'}
                                            {row.kwQuery && (onAnalyze
                                                ? <button type="button" className="lw-audit-q lw-audit-q-btn" title="키워드 분석 탭으로" onClick={() => onAnalyze(row.kwQuery!)}>{row.kwQuery}</button>
                                                : <small className="lw-audit-q">{row.kwQuery}</small>)}
                                        </td>
                                        <td className={row.extRank === null ? 'lw-rank-out' : 'lw-rank-in'}>
                                            {row.status !== 'done' ? '—' : row.extRank != null
                                                ? (
                                                    <a
                                                        className={`lw-rank-go${row.extLive ? '' : ' lw-rank-api'}`}
                                                        href={naverSearchUrl(row.extQuery || '')}
                                                        target="_blank" rel="noreferrer"
                                                        title={row.extLive ? '실제 검색 화면에서 잰 자리 — 눌러서 확인' : '오픈API 기준 — 실제 노출 순서와 다를 수 있습니다'}
                                                    >{row.extRank}위{row.extLive ? ' ↗' : ' (API) ↗'}</a>
                                                )
                                                : row.extQuery ? '없음' : '—'}
                                            {row.extQuery && row.extQuery !== row.kwQuery && (onAnalyze
                                                ? <button type="button" className="lw-audit-q lw-audit-q-btn" title="키워드 분석 탭으로" onClick={() => onAnalyze(row.extQuery!)}>{row.extQuery}</button>
                                                : <small className="lw-audit-q">{row.extQuery}</small>)}
                                        </td>
                                        <td className={row.rank === null ? 'lw-rank-out' : 'lw-rank-in'}>
                                            {row.status !== 'done' ? '—' : row.rank !== null
                                                ? <a className="lw-rank-go" href={naverSearchUrl(row.title)} target="_blank" rel="noreferrer" title="이 검색결과 보기">{row.rank}위 ↗</a>
                                                : `${row.sampled}건 중 없음`}
                                        </td>
                                        {ENGINE_META.map((engine) => {
                                            const state = row.engines ? row.engines[engine.id] : null;
                                            return (
                                                <td key={engine.id} className="lw-engine-cell">
                                                    {state ? (
                                                        <a
                                                            className={`lw-engine lw-engine-${state}`}
                                                            href={engine.search(row.title)}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            title={state === 'found'
                                                                ? `${engine.label}에 이 글이 보입니다`
                                                                : state === 'blocked'
                                                                    ? `${engine.label}은 자동 측정을 막습니다 — 눌러서 직접 확인하세요`
                                                                    : `${engine.label}에서 안 보입니다 — 눌러서 직접 확인하세요`}
                                                        >{state === 'found' ? '노출' : state === 'blocked' ? '확인 필요' : '없음'}</a>
                                                    ) : '—'}
                                                </td>
                                            );
                                        })}
                                        <td className="lw-row-actions">
                                            <button type="button" className="lw-mini" onClick={() => openAnalysis(row)} disabled={row.status !== 'done'}>
                                                글 분석하기
                                            </button>
                                            {/*
                                              * 제목을 고친 뒤 바로 확인하는 자리(사장님 2026-08-22
                                              * "추천한 대로 제목만 바꿨는데도 글이 상단으로 올라왔네").
                                              * 전체를 다시 돌릴 필요 없이 이 글만 잰다. 아래 탭별 칸도
                                              * 같이 채워 준다 — 어느 탭에서 올랐는지가 바로 보인다.
                                              */}
                                            <button
                                                type="button"
                                                className="lw-mini lw-mini-ghost"
                                                disabled={row.status === 'checking'}
                                                onClick={() => {
                                                    const query = row.extQuery || row.kwQuery || row.title;
                                                    setTabQuery(query);
                                                    setTabLink(row.link);
                                                    void runTabRank(query, row.link);
                                                }}
                                            >탭별 순위</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    )}
                </section>
            )}

            <div className="lw-panel-head" style={{ marginTop: 26 }}>
                <h2>글 하나 순위 확인</h2>
                <span>검색어와 글 주소만 있으면 됩니다 · 통합검색·블로그·웹사이트를 각각 잽니다</span>
            </div>

            <form
                className="lw-search lw-search-two"
                onSubmit={(event) => { event.preventDefault(); void runTabRank(tabQuery, tabLink); }}
            >
                <input
                    type="search"
                    value={tabQuery}
                    onChange={(event) => setTabQuery(event.target.value)}
                    placeholder="확인할 키워드"
                    aria-label="확인할 키워드"
                />
                <input
                    type="text"
                    value={tabLink}
                    onChange={(event) => setTabLink(event.target.value)}
                    placeholder="순위를 볼 글 주소 (예: blog.naver.com/myid/224385098124)"
                    aria-label="순위를 볼 글 주소"
                />
                <button type="submit" disabled={tabState === 'loading'}>
                    {tabState === 'loading' ? '재는 중…' : '탭별 순위'}
                </button>
            </form>
            {tabNote && <div className={`lw-note${tabState === 'error' ? ' lw-note-err' : ''}`}>{tabNote}</div>}
            {!tabResult && !tabNote && tabState !== 'loading' && (
                <div className="lw-note lw-note-plain">
                    같은 글도 <b>탭마다 자리가 다릅니다</b> — 블로그 탭에서 3위인 글이 통합검색에는 없기도 합니다.
                    제목을 고친 뒤 여기서 바로 다시 재면 어느 탭에서 올랐는지 보입니다.
                </div>
            )}
            {tabResult && (
                <div className="lw-tabrank">
                    <div className="lw-tabrank-head">
                        <b>{tabResult.query}</b>
                        <a href={tabResult.link} target="_blank" rel="noreferrer">{tabResult.link.replace(/^https?:\/\//, '')}</a>
                        <button type="button" onClick={() => { void runTabRank(tabResult.query, tabResult.link); }} disabled={tabState === 'loading'}>
                            {tabState === 'loading' ? '재는 중…' : '다시 재기'}
                        </button>
                    </div>
                    <div className="lw-tabrank-grid">
                        {TAB_META.map((tab) => {
                            const value = tabResult.tabs[tab.id];
                            return (
                                <a
                                    key={tab.id}
                                    className={`lw-tabrank-card${value && value.rank ? ' on' : ''}`}
                                    href={tab.id === 'all'
                                        ? `https://search.naver.com/search.naver?query=${encodeURIComponent(tabResult.query)}`
                                        : `https://search.naver.com/search.naver?ssc=tab.${tab.id}.all&query=${encodeURIComponent(tabResult.query)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={tab.hint}
                                >
                                    <span>{tab.label}</span>
                                    <b>{value === null || value === undefined
                                        ? '못 쟀음'
                                        : value.rank ? `${value.rank}위` : '없음'}</b>
                                    <em>{value && value.sampled ? `이 탭에 뜬 ${value.sampled}개 중` : '결과 없음'}</em>
                                </a>
                            );
                        })}
                    </div>
                </div>
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

                                    {(analyzeState.data.titleScore !== null || analyzeState.data.contentScore !== null) && (
                                        <section>
                                            <strong>점수 — AI 평가</strong>
                                            <div className="lw-score-row">
                                                {analyzeState.data.titleScore !== null && (
                                                    <div className="lw-score">
                                                        <em>{analyzeState.data.titleScore}점</em>
                                                        <span>제목</span>
                                                        {analyzeState.data.titleNote && <small>{analyzeState.data.titleNote}</small>}
                                                    </div>
                                                )}
                                                {analyzeState.data.contentScore !== null && (
                                                    <div className="lw-score">
                                                        <em>{analyzeState.data.contentScore}점</em>
                                                        <span>글</span>
                                                        {analyzeState.data.contentNote && <small>{analyzeState.data.contentNote}</small>}
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    )}

                                    {analyzeState.data.missReasons.length > 0 && (
                                        <section className="lw-plan-caution">
                                            <strong>누락 원인 심층분석 — 확인 방법 포함</strong>
                                            <ul>{analyzeState.data.missReasons.map((line) => <li key={line}>{line}</li>)}</ul>
                                        </section>
                                    )}
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
