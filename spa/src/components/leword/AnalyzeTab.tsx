import { useCallback, useEffect, useRef, useState } from 'react';
import { goldenIndex } from '../../lib/goldenIndex';
import {
    analyzeKeyword,
    fetchKeywordDocs,
    fetchKeywordPostIdeas,
    formatCount,
    getStoredLicense,
    setStoredLicense,
    type KeywordAnalysis,
    type KeywordUsage,
    type KinPostIdea,
} from '../../lib/keywordApi';
import { bridgePostIdeas } from '../../lib/bridge';
import { loadUserKeys } from '../../lib/userKeys';
import { ErrorNote, MetricCell, TabIntro, UsageBar } from './LewordShared';
import { groupByIntent } from '../../lib/intentGroups';
import TrendSparkline from './TrendSparkline';

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
    const [usage, setUsage] = useState<KeywordUsage | null>(null);
    const [error, setError] = useState<{ code?: string; message?: string; missing?: string[] }>({});
    const [loading, setLoading] = useState(false);
    const [licenseOpen, setLicenseOpen] = useState(false);
    const [licenseInput, setLicenseInput] = useState(getStoredLicense());
    const inputRef = useRef<HTMLInputElement | null>(null);
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
    const [expState, setExpState] = useState<'idle' | 'loading' | 'done'>('idle');
    /** 파고든 경로 — 어디서 여기까지 왔는지 되짚어 갈 수 있게. */
    const [trail, setTrail] = useState<string[]>([]);

    const run = useCallback(async (target: string) => {
        const trimmed = target.trim();
        if (!trimmed || loading) return;
        setLoading(true);
        setError({});
        const response = await analyzeKeyword(trimmed);
        setLoading(false);
        if (response.usage) setUsage(response.usage);
        if (response.ok && response.data) {
            setResult(response.data);
            setExpDocs({});
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
        if (!result) return [] as Array<{ keyword: string; searchVolume: number | null }>;
        const pool = boardRow
            ? [...(boardRow.subKeywords || []), ...(boardRow.keywordPool || [])]
            : [];
        const merged = [
            ...pool.map((p) => ({ keyword: p.keyword, searchVolume: p.searchVolume ?? null })),
            ...result.related.map((r) => ({ keyword: r.keyword, searchVolume: r.searchVolume })),
        ];
        const seen = new Set<string>();
        return merged
            .filter((r) => {
                const key = compact(r.keyword);
                if (!key || key === compact(result.keyword) || seen.has(key)) return false;
                seen.add(key);
                return typeof r.searchVolume === 'number' && r.searchVolume > 0;
            })
            .sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0))
            .slice(0, 24);
    })();

    /*
     * 문서수를 재서 붙인다. 화면이 열릴 때 자동으로 — 사장님이 버튼을 한 번 더
     * 누르게 만들 이유가 없다. 못 잰 것은 빈칸으로 두고 0 으로 적지 않는다.
     */
    useEffect(() => {
        if (!result || expansionRows.length === 0 || expState !== 'idle') return;
        setExpState('loading');
        let cancelled = false;
        fetchKeywordDocs(expansionRows.map((r) => r.keyword)).then((res) => {
            if (cancelled) return;
            if (res.ok && res.data) setExpDocs(res.data.docs || {});
            setExpState('done');
        });
        return () => { cancelled = true; };
        // expansionRows 는 result 에서 파생된다 — result 가 바뀔 때만 다시 잰다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, expState]);

    /** 한 칸 더 파고든다 — 지금 검색어를 경로에 남기고 그 확장어로 분석을 다시 돌린다. */
    const digInto = (next: string) => {
        if (!result) return;
        setTrail((prev) => [...prev, result.keyword].slice(-6));
        setKeyword(next);
        run(next);
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
        if (viaKeys.error && viaKeys.error !== 'needs-keys') {
            setIdeas({ status: 'error', message: viaKeys.message || viaKeys.error });
            return;
        }
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
        setIdeas({
            status: 'error',
            message: viaApp.status === 'outdated'
                ? 'LEWORD 앱이 구버전이라 이 기능이 없습니다 — 앱을 업데이트해 주세요.'
                : viaApp.status === 'offline'
                    ? 'LEWORD 앱을 켜면 본인 구독으로 바로 만듭니다. 앱 없이 쓰려면 내 API 키 탭에서 클로드 [연동]을 눌러 주세요.'
                    : `만들지 못했습니다: ${viaApp.message}`,
        });
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
                        <div className="lw-metrics">
                            <MetricCell label="월 검색량" value={formatCount(measured.searchVolume)} note="PC + 모바일" />
                            <MetricCell label="PC" value={formatCount(measured.searchVolumePc)} />
                            <MetricCell label="모바일" value={formatCount(measured.searchVolumeMobile)} />
                            <MetricCell label="블로그 문서수" value={formatCount(measured.documentCount)} />
                            <MetricCell label="지식인 질문" value={formatCount(measured.kinCount ?? null)} note="질문 많음 = 답 찾는 중" />
                            <MetricCell
                                label="검색량 ÷ 문서수"
                                value={measured.ratio === null ? '—' : String(measured.ratio)}
                                note="클수록 문서가 적다"
                            />
                            <MetricCell label="쇼핑 상품수" value={formatCount(measured.productCount)} />
                            <MetricCell label="광고 경쟁도" value={measured.competition || '—'} note="검색광고 표기" />
                            <MetricCell label="광고 노출 depth" value={formatCount(measured.adDepth)} />
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
                        {boardRow?.whySearch?.text && (
                            <div className="lw-analyze-why">
                                <strong>왜 지금 검색되나</strong>
                                <p>{boardRow.whySearch.text}</p>
                                {boardRow.whySearch.basis && <small>{boardRow.whySearch.basis}</small>}
                            </div>
                        )}
                        {/* 30일 추이 자동 표시 — "그래프가 보여야 이 키워드로 글을 써도 될지 안다". */}
                        {result.trend && result.trend.series.length >= 2 && (
                            <div className="lw-analyze-spark">
                                <TrendSparkline
                                    series={result.trend.series}
                                    height={72}
                                    monthlyVolume={result.measured.searchVolume ?? null}
                                />
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
                                            <th scope="col">자리</th>
                                            <th scope="col"> </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {expansionRows
                                            .map((row) => {
                                                const docs = expDocs[row.keyword];
                                                const ratio = typeof docs === 'number' && docs > 0 && row.searchVolume
                                                    ? row.searchVolume / docs
                                                    : null;
                                                return { ...row, docs, ratio };
                                            })
                                            /* 자리가 넓은 순 — 못 잰 것은 뒤로 민다(0 이 아니라 모름이다). */
                                            .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1))
                                            .map((row) => (
                                                <tr key={row.keyword}>
                                                    <td>{row.keyword}</td>
                                                    <td>{typeof row.searchVolume === 'number' ? formatCount(row.searchVolume) : '—'}</td>
                                                    <td>{typeof row.docs === 'number' ? formatCount(row.docs) : (expState === 'loading' ? '재는 중' : '—')}</td>
                                                    <td>{row.ratio === null ? '—' : row.ratio.toFixed(2)}</td>
                                                    <td>
                                                        {row.ratio === null
                                                            ? <span className="lw-slot-unknown">모름</span>
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
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="lw-note lw-note-plain">
                                <b>비율</b>은 월 검색량 ÷ 블로그 문서수입니다. 1 이 넘으면 찾는 사람이 쓰인 글보다 많다는 뜻이라
                                새 글이 들어갈 자리가 있습니다. 판정의 최종 확인은 실제 검색 화면에서 하세요.
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
