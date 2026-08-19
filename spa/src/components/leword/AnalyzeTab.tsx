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

/**
 * 키워드 분석 — 검색량·문서수·상품수·연관 키워드.
 *
 * 표시하는 값은 전부 API 가 준 실측이다. 유일한 계산은 검색량 ÷ 문서수 하나이고,
 * 그건 나눗셈이라 추정이 아니다. 등급·점수·예상 유입 같은 건 만들지 않는다.
 */
function AnalyzeTab({ initialKeyword }: { initialKeyword: string }) {
    const [keyword, setKeyword] = useState(initialKeyword);
    const [result, setResult] = useState<KeywordAnalysis | null>(null);
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
                            <MetricCell
                                label="검색량 ÷ 문서수"
                                value={measured.ratio === null ? '—' : String(measured.ratio)}
                                note="클수록 문서가 적다"
                            />
                            <MetricCell label="쇼핑 상품수" value={formatCount(measured.productCount)} />
                            <MetricCell label="광고 경쟁도" value={measured.competition || '—'} note="검색광고 표기" />
                            <MetricCell label="광고 노출 depth" value={formatCount(measured.adDepth)} />
                        </div>
                        <p className="lw-panel-foot">
                            {Object.entries(result.sources).map(([, label]) => label).join(' · ')}
                        </p>
                    </section>

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
