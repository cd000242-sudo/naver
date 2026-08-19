import { useCallback, useEffect, useRef, useState } from 'react';
import { goldenIndex } from '../../lib/goldenIndex';
import {
    analyzeKeyword,
    formatCount,
    getStoredLicense,
    setStoredLicense,
    type KeywordAnalysis,
    type KeywordUsage,
} from '../../lib/keywordApi';
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
                                <TrendSparkline series={result.trend.series} height={72} />
                            </div>
                        )}
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

                    {/* 확장 키워드 — 보드 회차가 실측으로 굳혀 둔 풀(검색량·문서수 붙은 실존 검색어). */}
                    {boardRow && ((boardRow.keywordPool || []).length > 0 || (boardRow.subKeywords || []).length > 0) && (
                        <section className="lw-panel" aria-label="확장 키워드">
                            <div className="lw-panel-head">
                                <h2>확장 키워드 — 회차 실측 풀</h2>
                                <span>전부 검색량 확인된 실존 검색어 · 누르면 이어서 분석합니다</span>
                            </div>
                            <div className="lw-analyze-pool">
                                {[...(boardRow.subKeywords || []), ...(boardRow.keywordPool || [])]
                                    .filter((p, idx, arr) => arr.findIndex((x) => x.keyword === p.keyword) === idx)
                                    .slice(0, 14)
                                    .map((p) => (
                                        <button
                                            key={p.keyword}
                                            type="button"
                                            onClick={() => { setKeyword(p.keyword); run(p.keyword); }}
                                        >
                                            {p.keyword}
                                            <span>
                                                {typeof p.searchVolume === 'number' ? formatCount(p.searchVolume) : '실측'}
                                                {typeof (p as { documentCount?: number | null }).documentCount === 'number'
                                                    ? ` / ${formatCount((p as { documentCount?: number | null }).documentCount as number)}`
                                                    : ''}
                                            </span>
                                        </button>
                                    ))}
                            </div>
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
