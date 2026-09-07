import { useCallback, useEffect, useRef, useState } from 'react';
import { goldenIndex } from '../../lib/goldenIndex';
import {
    analyzeKeyword,
    fetchKeywordDocs,
    fetchKeywordExpansions,
    fetchKeywordFrontal,
    fetchKeywordPostIdeas,
    formatCount,
    getStoredLicense,
    setStoredLicense,
    type KeywordAnalysis,
    type KeywordUsage,
    type KinPostIdea,
} from '../../lib/keywordApi';
import { expansionTier, frontalCount, tierHeading, FRONTAL_SATURATION } from '../../lib/expansionTier';
import { bridgePostIdeas } from '../../lib/bridge';
import { loadUserKeys } from '../../lib/userKeys';
import { ErrorNote, MetricCell, TabIntro, UsageBar } from './LewordShared';
import { groupByIntent } from '../../lib/intentGroups';
import TrendSparkline from './TrendSparkline';
import DemandChartModal, { pickChartSeries } from './DemandChartModal';
import { naverSearchUrl } from './preemptionMeta';

/**
 * 키워드 분석 — 검색량·문서수·상품수·연관 키워드.
 *
 * 표시하는 값은 전부 API 가 준 실측이다. 유일한 계산은 검색량 ÷ 문서수 하나이고,
 * 그건 나눗셈이라 추정이 아니다. 등급·점수·예상 유입 같은 건 만들지 않는다.
 */
/**
 * 선점 보드가 이미 실측해 둔 행 — 분석 탭이 재측정 없이 얹어 쓴다(사장님 지시
 * 2026-08-19: "왜 뜨는지·확장 키워드·광고수·빈자리·지식인 전부 나와야").
 * 광고수·빈자리는 Bright Data 검색결과 실측이라 온디맨드로는 못 재는 값이다 —
 * 보드에 있는 키워드만 이 패널이 붙고, 없는 키워드는 API 실측만 나간다.
 */
type BoardJoinRow = {
    keyword: string;
    openSlot?: number | null;
    whySearch?: { text: string; basis?: string } | null;
    serp?: { adCount?: number | null };
    kinTop?: Array<{ title: string; link: string; views?: number | null; answers?: number | null }> | null;
    keywordPool?: Array<{ keyword: string; searchVolume: number | null; documentCount?: number | null }> | null;
    subKeywords?: { keyword: string; searchVolume: number | null }[];
};

function AnalyzeTab({ initialKeyword }: { initialKeyword: string }) {
    const [keyword, setKeyword] = useState(initialKeyword);
    /** 방금 복사한 키워드 — 결과 헤더의 복사 버튼이 잠깐 "복사됨"으로 바뀐다. */
    const [copied, setCopied] = useState('');
    const [result, setResult] = useState<KeywordAnalysis | null>(null);
    const [boardRows, setBoardRows] = useState<BoardJoinRow[]>([]);

    // 보드는 정적 JSON 하나라 탭이 열릴 때 한 번만 읽는다. 실패해도 분석은 그대로 돈다.
    useEffect(() => {
        let cancelled = false;
        fetch('/data/preemption-board.json')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!cancelled && data && Array.isArray(data.rows)) setBoardRows(data.rows);
            })
            .catch(() => { /* 보드 없음 = 결합 패널 없이 계속 */ });
        return () => { cancelled = true; };
    }, []);
    /*
     * 제휴 상품 실측(사장님 지시 2026-08-23: "제휴 보면 크롤링해서 가격이랑
     * 잘 들고오잖아? 그걸 활용하고").
     *
     * 네이버 '쇼핑 상품수'는 쇼핑 검색 API 종료로 영영 못 잰다 — 그 자리에
     * 계속 '—' 만 떠 있었다. 대신 제휴 회차가 실제로 긁어 온 상품(이름·브랜드·
     * 가격)을 붙인다. 네이버 상품수와 다른 사실이므로 이름도 다르게 적는다.
     */
    const [affiliate, setAffiliate] = useState<Array<{ name: string; brand: string; price: unknown; keyword: string; url: string }>>([]);
    useEffect(() => {
        let cancelled = false;
        fetch('/data/affiliate-campaigns.json', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (cancelled || !data || !data.sites) return;
                const flat: Array<{ name: string; brand: string; price: unknown; keyword: string; url: string }> = [];
                for (const site of Object.values(data.sites as Record<string, unknown>)) {
                    const list = Array.isArray(site) ? site : [];
                    for (const item of list) flat.push(item as never);
                }
                setAffiliate(flat);
            })
            .catch(() => { /* 제휴 파일이 없어도 분석은 그대로 돈다 */ });
        return () => { cancelled = true; };
    }, []);
    const [usage, setUsage] = useState<KeywordUsage | null>(null);
    const [error, setError] = useState<{ code?: string; message?: string; missing?: string[] }>({});
    const [loading, setLoading] = useState(false);
    const [licenseOpen, setLicenseOpen] = useState(false);
    const [licenseInput, setLicenseInput] = useState(getStoredLicense());
    const inputRef = useRef<HTMLInputElement | null>(null);
    /** 마지막 조회만 화면에 반영하기 위한 순번. */
    const runTicket = useRef(0);
    /*
     * 확장 키워드 문서수 실측(사장님 지적 2026-08-23: "확장 키워드가 같이
     * 분석이 되어서 아래에 보여줘야 되고, 확장 키워드에 또 확장 키워드를 해서
     * 발굴을 할 수 있게 도와줘야지").
     *
     * 연관 목록에는 검색량만 있고 문서수가 없어서 비율도 자리 여부도 못 냈다.
     * 문서수는 블로그검색 total 로 무료다 — 재서 붙이면 황금키워드 카드와 같은
     * 판단(수요가 공급을 넘는가)을 여기서도 할 수 있다.
     */
    const [expDocs, setExpDocs] = useState<Record<string, number>>({});
    /** 실제 블로그 탭 화면 상위 10개 제목(keyword-frontal) — 정면 글 수(lib/expansionTier)를 센다. */
    const [expTitles, setExpTitles] = useState<Record<string, string[]>>({});
    /*
     * 원래 말로 확장어가 안 나올 때 쓰는 보충 목록(사장님 지시 2026-08-23
     * "만약 없으면 연관된 키워드를 넣어라, 방향만 살짝 바꿔서").
     * 자동완성이 공급원이라 같은 주제로 뻗는다.
     */
    const [extraExp, setExtraExp] = useState<Array<{ keyword: string; searchVolume: number | null; drifted?: boolean }>>([]);
    const [widenedFrom, setWidenedFrom] = useState<string | null>(null);
    /** 그래프 확대(사장님 지시 2026-08-23 "그래프 클릭하면 크게 볼 수 있게"). */
    const [chartOpen, setChartOpen] = useState(false);
    const [expState, setExpState] = useState<'idle' | 'loading' | 'done'>('idle');
    /** 파고든 경로 — 어디서 여기까지 왔는지 되짚어 갈 수 있게. */
    const [trail, setTrail] = useState<string[]>([]);

    const run = useCallback(async (target: string) => {
        const trimmed = target.trim();
        /*
         * loading 중이라고 무시하면 [더 파기]가 먹히지 않는다(사장님 지적
         * 2026-08-23 "더 파기 누르면 한 번에 분석되게"). 같은 검색어를 다시
         * 누른 게 아니라면 새 요청을 받는다.
         */
        if (!trimmed) return;
        /*
         * 요청 순번 — 빠르게 두 번 파고들면 먼저 띄운 응답이 늦게 와서
         * 새 결과를 덮을 수 있다. 마지막 요청만 화면에 쓴다.
         */
        const ticket = ++runTicket.current;
        setLoading(true);
        setError({});
        const response = await analyzeKeyword(trimmed);
        if (ticket !== runTicket.current) return;
        setLoading(false);
        if (response.usage) setUsage(response.usage);
        if (response.ok && response.data) {
            setResult(response.data);
            setExpDocs({});
            docsAsked.current = new Set();
            setExpState('idle');
            return;
        }
        setResult(null);
        setError({ code: response.error, message: response.message, missing: response.missing });
    }, [loading]);

    // 다른 탭에서 "이 키워드 분석"을 누르면 그대로 이어서 조회한다.
    useEffect(() => {
        if (!initialKeyword) return;
        setKeyword(initialKeyword);
        run(initialKeyword);
        // run 은 loading 에 의존해 매번 새로 만들어진다. 여기서 재실행 트리거로 쓰면
        // 조회가 두 번 나간다 — initialKeyword 가 바뀔 때만 돈다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialKeyword]);

    const measured = result?.measured;
    const compact = (t: string) => t.replace(/\s+/g, '');
    const boardRow = result
        ? boardRows.find((row) => compact(row.keyword) === compact(result.keyword)) || null
        : null;

    /*
     * 확장 후보 = 회차 실측 풀(보드에 있으면) + 검색광고 연관 실측.
     * 검색량이 있는 것만 남긴다 — 없는 것은 잴 값이 없다.
     */
    const expansionRows = (() => {
        if (!result) return [] as Array<{ keyword: string; searchVolume: number | null; drifted?: boolean; tier: number }>;
        const pool = boardRow
            ? [...(boardRow.subKeywords || []), ...(boardRow.keywordPool || [])]
            : [];
        const merged = [
            ...pool.map((p) => ({ keyword: p.keyword, searchVolume: p.searchVolume ?? null, drifted: false })),
            ...result.related.map((r) => ({ keyword: r.keyword, searchVolume: r.searchVolume, drifted: false })),
            // 자동완성·연관으로 뻗은 가지. drifted 는 주제가 옮겨간 새 가지다.
            ...extraExp.map((r) => ({ keyword: r.keyword, searchVolume: r.searchVolume, drifted: Boolean(r.drifted) })),
        ];
        const seen = new Set<string>();
        return merged
            .filter((r) => {
                const key = compact(r.keyword);
                if (!key || key === compact(result.keyword) || seen.has(key)) return false;
                seen.add(key);
                return typeof r.searchVolume === 'number' && r.searchVolume > 0;
            })
            /*
             * 층을 매긴다(사장님 2026-09-07 "순서가 잘못됐다"). 주제 그대로인 가지가
             * 먼저, 꼬리말만 같은 것은 뒤. 층 안에서는 검색량 순. 그래야 아래의
             * 문서수 실측(상위 40)도 줄기 쪽에 먼저 붙는다.
             */
            .map((r) => ({ ...r, tier: expansionTier(r.keyword, result.keyword) }))
            .sort((a, b) => (a.tier - b.tier) || ((b.searchVolume || 0) - (a.searchVolume || 0)))
            /*
             * 가지는 넉넉히 보여 준다(사장님 2026-08-23 "가지는 많을수록 좋아.
             * 그래야 생각지도 못한 키워드를 찾거든"). 자리 판정(문서수)은
             * 아래에서 상위 40건만 잰다 — 그 이상은 네이버가 속도로 막는다(실측).
             */
            .slice(0, 120);
    })();

    /*
     * 문서수를 재서 붙인다. 화면이 열릴 때 자동으로 — 사장님이 버튼을 한 번 더
     * 누르게 만들 이유가 없다. 못 잰 것은 빈칸으로 두고 0 으로 적지 않는다.
     */
    /*
     * [버그 주의] 의존성에 expState 를 넣으면 안 된다(2026-08-23 실사고).
     * setExpState('loading') 이 곧바로 이 effect 를 다시 돌리고, 그때 정리
     * 함수가 **방금 띄운 요청을 취소**해서 화면이 영영 '재는 중'에 멈춘다.
     * 그래서 여기엔 취소가 없다 — 늦게 온 응답도 그냥 합친다(문서수는
     * 검색어의 사실이라 어느 분석에서 왔든 같은 값이다).
     *
     * [실사고 2026-09-03] "확장 키워드 — 자리까지 실측인데 문서수·비율·자리가
     * 안 뜬다". 이 effect 가 result 가 바뀔 때 한 번만 돌아서, 그 뒤에 도착하는
     * 자동완성 보충(fetchKeywordExpansions)·보드 풀 줄은 영영 안 쟀다. 롱테일은
     * 검색광고 연관이 0건이라 첫 실행에 잴 줄이 없고 → 표 전체가 '모름'이었다.
     * 지금은 표의 상위 40줄 가운데 **아직 안 잰 줄만** 골라 그때그때 잰다.
     */
    const docsAsked = useRef<Set<string>>(new Set());
    const docsInFlight = useRef(0);
    /*
     * 상위 40건만 — 실측: 40건은 100% 통과(6.7초), 60건은 83%, 92건은 54%.
     * 검색량이 큰 쪽부터 재야 판정이 쓸모 있는 자리에 붙는다.
     * 못 잰 줄도 표에는 남아 [더 파기]로 이어 갈 수 있다.
     */
    const docsWanted = expansionRows.slice(0, 40).map((r) => r.keyword);
    const docsKey = docsWanted.join('\n');
    useEffect(() => {
        if (!result) return;
        const targets = docsWanted.filter((k) => !docsAsked.current.has(k));
        if (targets.length === 0) return;
        targets.forEach((k) => docsAsked.current.add(k));
        docsInFlight.current += 1;
        setExpState('loading');
        fetchKeywordDocs(targets)
            .then((res) => {
                if (res.ok && res.data) {
                    const got = res.data.docs || {};
                    setExpDocs((prev) => ({ ...prev, ...got }));
                }
            })
            .catch(() => { /* 실패한 줄은 '—' 로 남는다 — 0 으로 적지 않는다. */ })
            .finally(() => {
                docsInFlight.current -= 1;
                // 실패해도 '재는 중'에 묶어 두지 않는다 — 마지막 요청이 끝나면 끝낸다.
                if (docsInFlight.current === 0) setExpState('done');
            });
        // 표의 상위 40줄이 바뀔 때(연관 도착·보충 도착·보드 풀 합류)마다 안 잰 줄을 잰다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, docsKey]);

    /*
     * 정면 글 — 실제 블로그 탭 화면을 긁는다(사장님 2026-09-07). 화면 한 장이 400KB 라
     * 줄기(①②층) 상위 12줄만 잰다. 그 아래는 비율만 보고 [더 파기]로 이어 간다.
     * 문서수와 같은 방식으로 "아직 안 잰 줄만" 그때그때 — 재는 중 상태에 묶지 않는다.
     */
    const frontalAsked = useRef<Set<string>>(new Set());
    const frontalWanted = expansionRows.filter((r) => r.tier <= 2).slice(0, 12).map((r) => r.keyword);
    const frontalKey = frontalWanted.join('\n');
    useEffect(() => {
        if (!result) return;
        const targets = frontalWanted.filter((k) => !frontalAsked.current.has(k));
        if (targets.length === 0) return;
        targets.forEach((k) => frontalAsked.current.add(k));
        fetchKeywordFrontal(targets)
            .then((res) => {
                if (res.ok && res.data && res.data.titles) {
                    const titles = res.data.titles;
                    if (Object.keys(titles).length > 0) setExpTitles((prev) => ({ ...prev, ...titles }));
                }
            })
            .catch(() => { /* 못 잰 줄은 '—' 로 남는다 */ });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, frontalKey]);

    /*
     * 확장어가 얇으면 보충한다(2026-08-23).
     *
     * 실측: 롱테일로 파고들면 검색광고 연관이 그 말 자신 1건만 준다 —
     * '주민세 미납 조회' · '인상주의를 넘어 예매' 둘 다 그랬고, 그래서 표가
     * 통째로 비었다. 자동완성은 같은 주제로 뻗으므로 그걸로 채운다.
     */
    const expFor = useRef<string>('');
    useEffect(() => {
        if (!result) return;
        if (expFor.current === result.keyword) return;
        /*
         * **늘 부른다**(2026-08-23 방향 수정). 처음엔 확장어가 얇을 때만 불렀는데,
         * 사장님이 원하는 건 가지 뻗기다 — "조금이라도 연관된 키워드를 알려주면
         * 관련된 걸 가지로 뻗어나가면서 전혀 관련 없는 키워드라도 황금키워드
         * 발굴이 될 거 아냐." 그러니 충분해 보여도 가지를 더 준다.
         */
        expFor.current = result.keyword;
        let cancelled = false;
        fetchKeywordExpansions(result.keyword).then((res) => {
            if (cancelled || !res.ok || !res.data) return;
            setExtraExp(res.data.items.map((item) => ({
                keyword: item.keyword, searchVolume: item.searchVolume, drifted: item.drifted,
            })));
            setWidenedFrom(res.data.widenedFrom);
        }).catch(() => { /* 보충이 없어도 표는 그대로 */ });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result]);

    /** 한 칸 더 파고든다 — 지금 검색어를 경로에 남기고 그 확장어로 분석을 다시 돌린다. */
    const digInto = (next: string) => {
        if (!result || !next.trim()) return;
        setTrail((prev) => [...prev, result.keyword].slice(-6));
        setKeyword(next);
        // 새 검색어의 문서수를 다시 재도록 잠금을 푼다.
        docsAsked.current = new Set();
        expFor.current = '';
        setExpDocs({});
        setExtraExp([]);
        setWidenedFrom(null);
        setExpState('idle');
        void run(next);
    };

    /*
     * 글감·제목(사장님 지적 2026-08-22 "왜 뜨는지 / 확장할 수 있는 키워드 /
     * 어떤 제목으로 쓰면 상위노출에 유리한지 — 제목 생성 버튼을 여기 달아야").
     *
     * 유튜브 글감과 같은 경로를 쓴다. 한 번에 키워드·왜 나오는지·누가 왜 클릭하는지·
     * SEO 제목·홈판 제목이 같이 온다 — 셋이 한 자리에서 풀린다.
     * 서버(사이트 토큰) 먼저, 안 되면 앱(본인 구독)으로 넘어간다.
     */
    const [ideas, setIdeas] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; list?: KinPostIdea[]; message?: string }>({ status: 'idle' });
    const makeIdeas = async () => {
        if (!result || ideas.status === 'loading') return;
        setIdeas({ status: 'loading' });
        const context = boardRow?.whySearch?.text || '';
        const viaKeys = await fetchKeywordPostIdeas(result.keyword, context);
        if (viaKeys.ok && viaKeys.data?.ideas?.length) {
            setIdeas({ status: 'done', list: viaKeys.data.ideas });
            return;
        }
        /*
         * 사이트가 실패해도 **앱을 한 번 더 시도한다**(사장님 실측 2026-08-28:
         * 클로드 토큰이 취소돼 "연동된 엔진이 모두 실패했습니다"만 떴다).
         * 예전에는 needs-keys 가 아닌 실패면 여기서 멈춰서, 앱에 연동된 구독이
         * 멀쩡한데도 사이트 토큰 하나 죽었다고 통째로 죽었다.
         * 앱까지 실패하면 아래에서 두 사유를 함께 보여 준다.
         */
        const siteWhy = viaKeys.error && viaKeys.error !== 'needs-keys'
            ? (viaKeys.message || viaKeys.error) : '';
        const viaApp = await bridgePostIdeas({
            kind: 'keyword',
            keyword: result.keyword,
            context,
            provider: String(loadUserKeys().aiProvider || ''),
        });
        if (viaApp.status === 'ok') {
            const usable = viaApp.ideas
                .filter((idea) => idea.seo && idea.home)
                .map((idea) => ({
                    keyword: idea.keyword,
                    why: idea.why || '',
                    clickWhy: idea.clickWhy,
                    seo: idea.seo as string,
                    home: idea.home as string,
                    sub: idea.sub,
                }));
            setIdeas(usable.length > 0
                ? { status: 'done', list: usable }
                : { status: 'error', message: `${viaApp.provider} 가 제목을 못 만들었습니다 — 다시 눌러 주세요.` });
            return;
        }
        const appWhy = viaApp.status === 'outdated'
            ? 'LEWORD 앱이 구버전이라 이 기능이 없습니다 — 앱을 업데이트해 주세요.'
            : viaApp.status === 'offline'
                ? 'LEWORD 앱을 켜면 본인 구독으로 바로 만듭니다. 앱 없이 쓰려면 내 API 키 탭에서 클로드 [연동]을 눌러 주세요.'
                : `만들지 못했습니다: ${viaApp.message}`;
        setIdeas({ status: 'error', message: siteWhy ? `${siteWhy} · ${appWhy}` : appWhy });
    };
    // 보드 지식인 실측(조회수 포함)이 있으면 그것이 우선이다 — API 는 조회수를 못 준다.
    const kinList = (boardRow?.kinTop?.length ? boardRow.kinTop : result?.kinTop) || [];

    return (
        <>
            <TabIntro
                title="키워드 분석"
                desc="검색량과 문서수를 실제로 조회해 보여 줍니다. 점수나 예상 유입 같은 추정값은 표시하지 않습니다."
                source="네이버 검색광고 · 네이버 블로그/쇼핑 검색 API"
            />

            <form
                className="lw-search"
                onSubmit={(event) => { event.preventDefault(); run(keyword); }}
            >
                <input
                    ref={inputRef}
                    type="search"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="분석할 키워드를 입력하세요"
                    aria-label="분석할 키워드"
                />
                <button type="submit" disabled={loading || !keyword.trim()}>
                    {loading ? '조회 중…' : '분석'}
                </button>
            </form>

            <UsageBar usage={usage} />
            <ErrorNote
                error={error.code}
                message={error.message}
                missing={error.missing}
                onLicense={() => setLicenseOpen(true)}
            />

            {licenseOpen && (
                <div className="lw-license">
                    <label htmlFor="lw-license-input">라이선스 코드</label>
                    <div>
                        <input
                            id="lw-license-input"
                            value={licenseInput}
                            onChange={(event) => setLicenseInput(event.target.value)}
                            placeholder="구매 시 발급된 코드"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                setStoredLicense(licenseInput.trim());
                                setLicenseOpen(false);
                                run(keyword);
                            }}
                        >확인</button>
                    </div>
                    <small>코드는 이 브라우저에만 저장되며 조회할 때 서버가 대조합니다.</small>
                </div>
            )}

            {measured && result && (
                <>
                    <section className="lw-panel" aria-label={`${result.keyword} 실측값`}>
                        <div className="lw-panel-head">
                            <h2>{result.keyword}</h2>
                            <span>실측값</span>
                            {/* 복사·네이버 검색 — 다른 탭 카드에는 있는데 분석 결과에만 없었다(사장님 2026-09-06). */}
                            <div className="lw-analyze-head-actions">
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard?.writeText(result.keyword)
                                            .then(() => { setCopied(result.keyword); window.setTimeout(() => setCopied(''), 1400); })
                                            .catch(() => { /* 복사가 막힌 브라우저면 직접 선택 */ });
                                    }}
                                >{copied === result.keyword ? '복사됨' : '복사'}</button>
                                <a href={naverSearchUrl(result.keyword)} target="_blank" rel="noreferrer">네이버 검색</a>
                            </div>
                        </div>

                        {(() => {
                            /*
                             * 황금지수 — 등급 SSoT 를 그대로 옮긴 것이지 새로 만든 점수가 아니다.
                             * 못 쟀으면 아무것도 안 띄운다. '약함'으로 적으면 못 잰 것과
                             * 나쁜 것이 화면에서 같아진다.
                             */
                            const index = goldenIndex(measured.searchVolume, measured.documentCount);
                            if (!index) return null;
                            return (
                                <div className={`lw-gold lw-gold-${index.tier}`}>
                                    <div className="lw-gold-head">
                                        <span className="lw-gold-label">{index.label}</span>
                                        <strong className="lw-gold-keyword">{result.keyword}</strong>
                                    </div>
                                    <div className="lw-gold-figure">
                                        <em>{index.ratio!.toFixed(1)}</em>
                                        <span>황금지수 · 검색량 ÷ 문서수</span>
                                    </div>
                                    <p className="lw-gold-reason">{index.reason}</p>
                                </div>
                            );
                        })()}
                        {/*
                          * 지표는 왼쪽 두 줄(4 + 5), 그래프는 그 오른쪽(사장님 지시 2026-08-23:
                          * "1열로 하지 말고 2줄로 첫 줄 4개, 우측 빈 공간에 황금키워드처럼 그래프를.
                          * 아래에 두니까 보기 힘들어").
                          * 뺀 것 둘 — '광고 노출 depth'와 '검색량 ÷ 문서수'. 후자는 바로 위
                          * 황금지수 카드가 같은 값을 더 크게 말하고 있어 두 번 나왔다.
                          */}
                        <div className="lw-analyze-grid">
                            <div className="lw-metrics lw-metrics-2row">
                                <MetricCell label="월 검색량" value={formatCount(measured.searchVolume)} note="PC + 모바일" />
                                <MetricCell label="PC" value={formatCount(measured.searchVolumePc)} />
                                <MetricCell label="모바일" value={formatCount(measured.searchVolumeMobile)} />
                                <MetricCell label="블로그 문서수" value={formatCount(measured.documentCount)} />
                                <MetricCell label="지식인 질문" value={formatCount(measured.kinCount ?? null)} note="질문 많음 = 답 찾는 중" />
                                {(() => {
                                    /*
                                     * 네이버 쇼핑 상품수는 못 잰다(검색 API 종료). 대신 제휴 회차가
                                     * 실제로 긁어 온 상품을 센다. 다른 사실이므로 이름도 다르게 적는다.
                                     */
                                    const hits = affiliate.filter((item) =>
                                        compact(String(item.keyword || '')) === compact(result.keyword)
                                        || compact(String(item.name || '')).includes(compact(result.keyword)));
                                    const prices = hits
                                        .map((item) => Number(item.price))
                                        .filter((n) => Number.isFinite(n) && n > 0);
                                    const low = prices.length > 0 ? Math.min(...prices) : null;
                                    return (
                                        <MetricCell
                                            label="제휴 상품"
                                            value={hits.length > 0 ? `${hits.length}개` : '없음'}
                                            note={low !== null ? `최저 ${low.toLocaleString('ko-KR')}원` : '제휴 회차 실측'}
                                        />
                                    );
                                })()}
                                <MetricCell label="광고 경쟁도" value={measured.competition || '—'} note="검색광고 표기" />
                                {/* 광고수·빈자리 — 검색결과를 직접 열어 본 회차 실측(보드에 있는 키워드만). */}
                                {boardRow && typeof boardRow.serp?.adCount === 'number' && (
                                    <MetricCell label="광고수" value={String(boardRow.serp.adCount)} note="검색결과 상단 실측" />
                                )}
                                {boardRow && (
                                    <MetricCell
                                        label="빈자리"
                                        value={boardRow.openSlot ? `${boardRow.openSlot}위` : '10위 내 없음'}
                                        note="검색결과 배치 실측"
                                    />
                                )}
                            </div>
                            {/* 30일 추이 자동 표시 — "그래프가 보여야 이 키워드로 글을 써도 될지 안다". */}
                            {result.trend && result.trend.series.length >= 2 && (
    <button
                                    type="button"
                                    className="lw-analyze-spark lw-analyze-spark-btn"
                                    onClick={() => setChartOpen(true)}
                                    title="크게 보기"
                                >
                                    <TrendSparkline
                                        series={result.trend.series}
                                        height={72}
                                        monthlyVolume={result.measured.searchVolume ?? null}
                                    />
                                    <span className="lw-spark-more">크게 보기 ⤢</span>
                                </button>
                            )}

                        </div>
                        {boardRow?.whySearch?.text && (
                            <div className="lw-analyze-why">
                                <strong>왜 지금 검색되나</strong>
                                <p>{boardRow.whySearch.text}</p>
                                {/*
                                  * 근거는 **있을 때만** 적는다(사장님 지적 2026-08-23 "근거 부족은 뭐야").
                                  * '근거 부족'은 우리 내부 사정이지 사장님이 읽을 말이 아니다.
                                  * 게다가 그 라벨이 붙은 행도 내용 자체는 맞았다 — 라벨이 결과를 깎았다.
                                  * 무엇을 보고 썼는지 말할 수 있을 때만 그대로 적는다.
                                  */}
                                {boardRow.whySearch.basis && !/근거 부족/.test(boardRow.whySearch.basis) && (
                                    <small>{boardRow.whySearch.basis}</small>
                                )}
                            </div>
                        )}
                        {/*
                          * 글감·제목(사장님 지적 2026-08-22) — 숫자만 보여 주면
                          * "그래서 뭘 쓰지"가 남는다. 왜 나오는 말인지·누가 왜 누르는지·
                          * 어떤 제목으로 쓸지를 한 번에 낸다.
                          */}
                        <div className="lw-analyze-ideas">
                            <div className="lw-analyze-ideas-head">
                                <b>이 키워드로 뭘 쓸까</b>
                                <span>왜 나오는 말인지 · 누가 왜 누르는지 · 검색용 제목과 홈판 제목까지</span>
                                <button type="button" onClick={() => { void makeIdeas(); }} disabled={ideas.status === 'loading'}>
                                    {ideas.status === 'loading' ? '만드는 중…' : ideas.status === 'done' ? '다시 만들기' : '글감·제목 만들기'}
                                </button>
                            </div>
                            {ideas.status === 'error' && <p className="lw-analyze-ideas-err">{ideas.message}</p>}
                            {ideas.status === 'done' && ideas.list && (
                                <ul className="lw-idea-list">
                                    {ideas.list.map((idea) => (
                                        <li key={idea.keyword}>
                                            <b>{idea.keyword}</b>
                                            {idea.why && <em>{idea.why}</em>}
                                            {idea.clickWhy && <em className="lw-idea-click">누가 왜 누르나 · {idea.clickWhy}</em>}
                                            <p><span>검색용</span>{idea.seo}</p>
                                            <p><span>홈판용</span>{idea.home}</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <p className="lw-panel-foot">
                            {Object.entries(result.sources).map(([, label]) => label).join(' · ')}
                        </p>
                    </section>

                    {kinList.length > 0 && (
                        <section className="lw-panel" aria-label="지식인 질문">
                            <div className="lw-panel-head">
                                <h2>지식인에서 묻는 것</h2>
                                <span>
                                    {boardRow?.kinTop?.length
                                        ? `최신 질문 조회순 상위 ${Math.min(kinList.length, 5)}개 · 조회수는 질문 페이지 실측`
                                        : `상위 ${kinList.length}개 · 클릭하면 질문으로 갑니다`}
                                </span>
                            </div>
                            <div className="lw-kin">
                                <ol className="lw-kin-list">
                                    {kinList.slice(0, 5).map((q) => (
                                        <li key={q.link}>
                                            <a href={q.link} target="_blank" rel="noreferrer">{q.title}</a>
                                            {typeof (q as { views?: number | null }).views === 'number' && (
                                                <span className="lw-kin-views">
                                                    조회 {formatCount((q as { views?: number | null }).views as number)}
                                                    {typeof (q as { answers?: number | null }).answers === 'number' ? ` · 답변 ${(q as { answers?: number | null }).answers}` : ''}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        </section>
                    )}

                    {chartOpen && result.trend && (() => {
                        /* 카드의 작은 선과 같은 자료로 연다 — 다른 그림이면 사장님이 또 물으신다. */
                        const ranges = pickChartSeries({ demandSeries: null, trend: result.trend });
                        if (!ranges) return null;
                        return (
                            <DemandChartModal
                                keyword={result.keyword}
                                ranges={ranges.ranges}
                                onClose={() => setChartOpen(false)}
                            />
                        );
                    })()}

                    {/*
                      * 확장 키워드 — 검색량 + 문서수 실측으로 **자리까지 판정**한다.
                      * 사장님 지적(2026-08-23): 황금키워드 카드처럼 여기서도
                      * 확장어가 같이 분석돼야 하고, 거기서 또 파고들 수 있어야 한다.
                      */}
                    {expansionRows.length > 0 && (
                        <section className="lw-panel" aria-label="확장 키워드">
                            <div className="lw-panel-head">
                                <h2>확장 키워드 — 자리까지 실측</h2>
                                <span>
                                    검색량은 검색광고, 문서수는 블로그검색 실측
                                    {expState === 'loading' ? ' · 문서수 재는 중…' : ''}
                                    {' · 한 줄을 누르면 그 검색어로 이어서 파고듭니다'}
                                </span>
                            </div>
                            {trail.length > 0 && (
                                <div className="lw-analyze-trail">
                                    {trail.map((step) => (
                                        <button key={step} type="button" onClick={() => { setKeyword(step); run(step); }}>
                                            {step}
                                        </button>
                                    ))}
                                    <span>→ {result.keyword}</span>
                                </div>
                            )}
                            <div className="lw-table-scroll">
                                <table className="lw-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">확장 키워드</th>
                                            <th scope="col">월 검색량</th>
                                            <th scope="col">문서수</th>
                                            <th scope="col">비율</th>
                                            <th scope="col">정면 글</th>
                                            <th scope="col">자리</th>
                                            <th scope="col"> </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const measured = expansionRows.map((row) => {
                                                const docs = expDocs[row.keyword];
                                                const ratio = typeof docs === 'number' && docs > 0 && row.searchVolume
                                                    ? row.searchVolume / docs
                                                    : null;
                                                const frontal = frontalCount(expTitles[row.keyword], row.keyword);
                                                const saturated = typeof frontal === 'number' && frontal >= FRONTAL_SATURATION;
                                                return { ...row, docs, ratio, frontal, saturated };
                                            });
                                            /*
                                             * 구역 = 층. 구역 안에서는 정면 글 8/10↑(초보가 못 비집는 자리)를
                                             * 뒤로 보내고, 그다음 자리가 넓은 순. 못 잰 것은 맨 뒤(0 이 아니라 모름).
                                             * 황금보드와 같은 기준이다(board-order).
                                             */
                                            const inTier = (tier: number) => measured
                                                .filter((row) => row.tier === tier)
                                                .sort((a, b) => (Number(a.saturated) - Number(b.saturated)) || ((b.ratio ?? -1) - (a.ratio ?? -1)));
                                            return ([1, 2, 3, 4] as const).flatMap((tier) => {
                                                const rows = inTier(tier);
                                                if (rows.length === 0) return [];
                                                return [
                                                    <tr key={`tier-${tier}`} className="lw-tier-row">
                                                        <td colSpan={7}>{tierHeading(tier, result.keyword)} <em>{rows.length}</em></td>
                                                    </tr>,
                                                    ...rows.map((row) => (
                                                        <tr key={row.keyword}>
                                                            <td>{row.keyword}</td>
                                                            <td>{typeof row.searchVolume === 'number' ? formatCount(row.searchVolume) : '—'}</td>
                                                            <td>{typeof row.docs === 'number' ? formatCount(row.docs) : (expState === 'loading' ? '재는 중' : '—')}</td>
                                                            <td>{row.ratio === null ? '—' : row.ratio.toFixed(2)}</td>
                                                            <td>
                                                                {row.frontal === null
                                                                    ? <span className="lw-slot-unknown">—</span>
                                                                    : <span className={row.saturated ? 'lw-frontal-hot' : ''}>{row.frontal}/{Math.min(10, (expTitles[row.keyword] || []).length)}</span>}
                                                            </td>
                                                            <td>
                                                                {row.ratio === null
                                                                    ? <span className="lw-slot-unknown">모름</span>
                                                                    : row.saturated
                                                                        /* 비율이 좋아도 상위가 정면 글로 찼으면 자리라고 말하지 않는다. */
                                                                        ? <span className="lw-slot-tight">정면 글 많음</span>
                                                                        : row.ratio >= 1
                                                                            ? <span className="lw-slot-open">자리 있음</span>
                                                                            : row.ratio >= 0.1
                                                                                ? <span className="lw-slot-tight">좁음</span>
                                                                                : <span className="lw-slot-none">글이 많음</span>}
                                                            </td>
                                                            <td>
                                                                <button type="button" className="lw-dig" onClick={() => digInto(row.keyword)}>
                                                                    더 파기 →
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    )),
                                                ];
                                            });
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                            <p className="lw-note lw-note-plain">
                                <b>구역</b>은 씨앗과 얼마나 같은 주제인가입니다 — ① 주제 그대로 ② 주제는 같고 방향이 다름
                                ③ 꼬리말만 같음 ④ 새 가지. 가지는 자동완성·뉴스 제목 어휘·검색광고 연관에서 전부 실측으로 뻗습니다.
                                구역 안에서는 자리가 넓은 순이고, <b>정면 글</b>(실제 블로그 탭 화면 상위 10개 제목 중 이 검색어를
                                그대로 다룬 글 수 — ①② 구역 상위 12줄만 잽니다)이 8 이상이면 비율이 좋아도 뒤로 갑니다.
                                <b>비율</b>은 월 검색량 ÷ 블로그 문서수 — 1 이 넘으면 찾는 사람이 쓰인 글보다 많다는 뜻입니다.
                            </p>
                        </section>
                    )}

                    {result.related.length > 0 && (
                        <section className="lw-panel" aria-label="연관 키워드">
                            <div className="lw-panel-head">
                                <h2>연관 키워드 — 검색의도별</h2>
                                <span>검색광고가 함께 돌려준 실측 목록 {result.related.length}개 · 의도는 키워드 속 단서 어휘로 분류</span>
                            </div>
                            <div className="lw-table-scroll">
                                <table className="lw-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">키워드</th>
                                            <th scope="col">월 검색량</th>
                                            <th scope="col">PC</th>
                                            <th scope="col">모바일</th>
                                            <th scope="col">경쟁도</th>
                                            <th scope="col" aria-label="조회" />
                                        </tr>
                                    </thead>
                                    {groupByIntent(result.related, (row) => row.keyword, keyword.trim()).map((bucket) => (
                                        <tbody key={bucket.id}>
                                            <tr className="lw-intent-row">
                                                <th colSpan={6} scope="colgroup">
                                                    {bucket.label} <small>{bucket.items.length}개</small>
                                                </th>
                                            </tr>
                                            {bucket.items.map((row) => (
                                                <tr key={row.keyword}>
                                                    <th scope="row">{row.keyword}</th>
                                                    <td>{formatCount(row.searchVolume)}</td>
                                                    <td>{formatCount(row.searchVolumePc)}</td>
                                                    <td>{formatCount(row.searchVolumeMobile)}</td>
                                                    <td>{row.competition || '—'}</td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className="lw-mini"
                                                            onClick={() => { setKeyword(row.keyword); run(row.keyword); }}
                                                        >분석</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    ))}
                                </table>
                            </div>
                        </section>
                    )}
                </>
            )}

            {!measured && !error.code && !loading && (
                <div className="lw-note">키워드를 입력하면 검색량·문서수를 실제로 조회합니다.</div>
            )}
        </>
    );
}

export default AnalyzeTab;
