import { useEffect, useState } from 'react';
import { useEvidenceClock } from './useEvidenceClock';
import { createCoupangDeeplink, fetchAffiliateBoard, type AffiliateProduct } from '../../lib/keywordApi';
import { type LaneId } from './affiliateLanes';
import { affiliateTitle, recommendationReason } from '../../lib/recommendationView.mjs';
import { assessAffiliateRecommendation, compareAffiliateRecommendations } from '../../lib/affiliateRecommendation.mjs';
import RecommendationFilter, { type RecommendationStatus } from './RecommendationFilter';
import AffiliateTitles from './AffiliateTitles';
import { assessCoupangDiscovery, compareCoupangDiscovery, coupangProductUrl } from '../../lib/coupangDiscovery.mjs';
import CoupangDiscoveryBrief from './CoupangDiscoveryBrief';

/**
 * 쿠팡 상품 보드 — 상품에서 출발한다.
 *
 * 상품 발견과 검색 유입은 별개의 경로다. 낮은 검색량이나 높은 문서수가
 * 실용적인 상품 자체의 탈락 사유는 아니다. 기존 API 응답을 재사용하며,
 * 두 보기를 전환해도 수집·AI 호출을 추가하지 않는다.
 */
function CoupangBoard({ onAnalyze, lane = 'coupang' }: { onAnalyze: (keyword: string) => void; lane?: LaneId }) {
    const [rows, setRows] = useState<AffiliateProduct[] | null>(null);
    const nowMs = useEvidenceClock();
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'needs-keys' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [recommendationView, setRecommendationView] = useState<RecommendationStatus>('ready');
    const [route, setRoute] = useState<'discovery' | 'search'>('discovery');
    const [discoveryView, setDiscoveryView] = useState<'all' | 'candidate'>('all');
    const discoveryMode = route === 'discovery';
    // 제휴링크 버튼의 행별 상태. 링크는 방문자 본인 키로 만들어지는 본인 수익 링크다.
    const [linkState, setLinkState] = useState<{ key: string; label: string } | null>(null);
    // 토스·브랜드커넥트 레인의 복사 버튼 — 콘솔 검색창에 붙여넣을 재료.
    const [copiedKey, setCopiedKey] = useState('');
    const copyText = (key: string, text: string) => {
        navigator.clipboard?.writeText(text);
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey(''), 1500);
    };

    const makeLink = async (row: AffiliateProduct) => {
        setLinkState({ key: row.url, label: '만드는 중…' });
        // 원본 주소로 변환한다 — API 의 productUrl 은 이미 추적 링크라 재변환이 "url convert failed" 로 죽는다.
        const target = coupangProductUrl(row.rawUrl) || coupangProductUrl(row.url);
        if (!target) { setLinkState({ key: row.url, label: '쿠팡 상품 주소 확인 필요' }); return; }
        const res = await createCoupangDeeplink(target);
        const shorten = res.data?.shortenUrl;
        if (!res.ok || !shorten) {
            setLinkState({ key: row.url, label: res.message || '실패 — 다시 시도' });
            window.setTimeout(() => setLinkState(null), 3200);
            return;
        }
        try { await navigator.clipboard?.writeText(shorten); } catch { /* 복사가 막혀도 링크는 유효하다 */ }
        setLinkState({ key: row.url, label: `복사됨! ${shorten.replace('https://', '')}` });
        window.setTimeout(() => setLinkState(null), 4200);
    };

    const load = async () => {
        setState('loading');
        const response = await fetchAffiliateBoard();
        if (!response.ok || !response.data) {
            setState('error');
            setMessage(response.message || '상품을 불러오지 못했습니다.');
            return;
        }
        if (response.data.needsKeys) { setState('needs-keys'); return; }
        setRows(response.data.products);
        setState(response.data.products.length > 0 ? 'ready' : 'error');
        if (response.data.products.length === 0) setMessage('지금 수집된 쿠팡 상품이 없습니다.');
    };

    useEffect(() => { void load(); }, []);

    if (state === 'loading') return <div className="lw-note">쿠팡 상품을 받아 수요·경쟁을 재는 중입니다…</div>;
    if (state === 'needs-keys') {
        return (
            <div className="lw-note lw-note-limit">
                <strong>쿠팡 파트너스 키가 필요합니다</strong>
                <p>내 API 키 탭에 ACCESS KEY와 SECRET KEY를 넣으면 쿠팡 상품 목록을 조회할 수 있습니다.</p>
            </div>
        );
    }
    if (state === 'error') {
        return (
            <div className="lw-note lw-note-error">
                <strong>{message}</strong>
                <button type="button" className="lw-mini" onClick={() => void load()}>다시 시도</button>
            </div>
        );
    }

    // v1 endpoint contract: keyword (not needKeyword) is the exact query for all three measurements.
    // Preserve the server's measuredAt. Never stamp a cached result with the current time.
    const all = (rows || []).map(row => {
        const item = { ...row, collectedAt: row.measuredAt, keywordEvidence: [{
            query: row.keyword, serpQuery: row.keyword, monthlySearches: row.searchVolume,
            documentCount: row.documentCount, serpTop: row.serpTop,
            measuredAt: row.measuredAt, source: 'naver-searchad+blog-search',
        }] };
        return { row: item, recommendation: assessAffiliateRecommendation(item, { now: nowMs, collectedAt: row.measuredAt }),
            discovery: assessCoupangDiscovery(row, { now: nowMs }) };
    }).sort(discoveryMode ? compareCoupangDiscovery : compareAffiliateRecommendations);
    const counts = { ready: 0, research: 0, excluded: 0 };
    for (const entry of all) counts[entry.recommendation.status] += 1;
    const candidateCount = all.filter(entry => entry.discovery.status === 'candidate').length;
    const visible = all.filter(entry => discoveryMode
        ? discoveryView === 'all' || entry.discovery.status === 'candidate'
        : entry.recommendation.status === recommendationView);

    const renderRow = ({ row, recommendation: assessment, discovery }: typeof all[number], rank: number) => {
                const forged = affiliateTitle(row);
                const productUrl = coupangProductUrl(row.url);
                return (
                    <li key={row.url} className="lw-product">
                        <span className="lw-product-rank">{!discoveryMode && recommendationView === 'ready' ? rank : '·'}</span>
                        <img src={row.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="72" height="72"%3E%3C/svg%3E'} alt="" loading="lazy" />
                        <div className="lw-product-body">
                            <div className="lw-product-tags">
                                {!discoveryMode && row.serpTop && row.serpTop.sampled > 0 && (() => {
                                    const exact = row.serpTop!.exact;
                                    const verdict = exact <= 2
                                        ? { label: `상위 제목 정면 ${exact}개 · 본문 경쟁 별도 확인`, color: '#2ecc71', bg: 'rgba(46,204,113,.14)' }
                                        : exact <= 5
                                            ? { label: `경합 · 정면 ${exact}개`, color: '#f5a623', bg: 'rgba(245,166,35,.14)' }
                                            : { label: `정면 제목 다수 · ${exact}개`, color: '#ff6b6b', bg: 'rgba(255,107,107,.14)' };
                                    return (
                                        <span style={{
                                            color: verdict.color, background: verdict.bg,
                                            border: `1px solid ${verdict.color}44`, borderRadius: 999,
                                            padding: '2px 10px', fontWeight: 700, fontSize: 12,
                                        }}>{verdict.label}</span>
                                    );
                                })()}
                                <span className="lw-goldbox">{discoveryMode
                                    ? discovery.status === 'candidate' ? '실용 기능 단서 있음' : '상품 상세 탐색'
                                    : assessment.status === 'ready' ? '검색 근거 통과 · 성과 보장 아님' : '검색 공략 추가 검토'}</span>
                                {row.discountPercent !== null && <span className="lw-discount">{row.discountPercent}% 할인</span>}
                                {row.rocket && <span className="lw-rocket">로켓배송</span>}
                                <span className="lw-goldbox">
                                    {discovery.sourceLabel}
                                </span>
                                <span style={{ fontSize: 11 }}>{discovery.fresh ? '목록 관측' : '최근 목록 확인 필요'}
                                    {row.measuredAt && Number.isFinite(Date.parse(row.measuredAt)) && ` · ${new Date(row.measuredAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`}</span>
                            </div>
                            {productUrl ? <a className="lw-product-name" href={productUrl} target="_blank" rel="noreferrer">{row.name}</a>
                                : <strong className="lw-product-name">{row.name}</strong>}
                            {discoveryMode && <CoupangDiscoveryBrief discovery={discovery} />}
                            {!discoveryMode && forged && (
                                <div title={forged.basis} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 2px', minWidth: 0 }}>
                                    <span style={{ flexShrink: 0, padding: '1px 7px', borderRadius: 6, background: 'rgba(251,191,36,.14)', color: '#fbbf24', fontSize: 10, fontWeight: 800 }}>{forged.label}</span>
                                    <em style={{ fontStyle: 'normal', fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{forged.text}</em>
                                    <button
                                        type="button"
                                        className="lw-mini"
                                        onClick={() => copyText(`title:${row.url}`, forged.text)}
                                    >{copiedKey === `title:${row.url}` ? '복사됨!' : '복사'}</button>
                                </div>
                            )}
                            {!discoveryMode && <p style={{ fontSize: 12, color: '#f5a623' }}>{assessment.reasons.map(recommendationReason).join(' ')}</p>}
                            {discoveryMode && typeof row.price === 'number' && row.price > 0 && <p className="lw-product-price"><strong>{row.price.toLocaleString('ko-KR')}원</strong></p>}
                            <details open={discoveryMode ? undefined : true}>
                            <summary style={{ cursor: 'pointer', marginTop: 6, fontSize: 12 }}>검색 유입 참고 수치 · 상품 발견 판정과 별개</summary>
                            <div className="lw-product-metrics">
                                {typeof row.price === 'number' && row.price > 0 && (
                                    <span className="lw-product-price"><strong>{row.price.toLocaleString('ko-KR')}원</strong></span>
                                )}
                                {row.needKeyword && row.needVolume ? (
                                    <span className="lw-product-need" title="관련 검색어의 관측값이며 이 상품 자체의 수요로 확정하지 않습니다.">
                                        관련어 관측 <strong>{row.needKeyword}</strong> 월 <strong>{row.needVolume.toLocaleString('ko-KR')}</strong>
                                    </span>
                                ) : null}
                                <span>검색어 <strong>{row.keyword}</strong></span>
                                <span>월 검색량 <strong>{row.searchVolume === null ? '—' : row.searchVolume.toLocaleString('ko-KR')}</strong></span>
                                <span>문서수 <strong>{row.documentCount === null ? '—' : row.documentCount.toLocaleString('ko-KR')}</strong></span>
                                {row.serpTop && row.serpTop.sampled > 0 && (
                                    <span title={`블로그 검색 상위 ${row.serpTop.sampled}개 제목 중 '${row.keyword}'를 그대로 다룬 글 ${row.serpTop.exact}개`}>
                                        상위{row.serpTop.sampled} 정면 <strong>{row.serpTop.exact}개</strong>
                                    </span>
                                )}
                            </div>
                            </details>
                        </div>
                        <div className="lw-product-actions">
                            {/* 검색 분석은 서버에서 실제 측정한 동일 검색어로 연결한다. */}
                            <button type="button" className="lw-act lw-act-blue" onClick={() => onAnalyze(row.keyword)}>LEWORD 키워드분석</button>
                            {lane === 'coupang' && (
                                <a
                                    className="lw-act lw-act-orange"
                                    href={`https://www.coupang.com/np/search?q=${encodeURIComponent(row.keyword)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >쿠팡 검색해보기</a>
                            )}
                            {lane !== 'coupang' && (
                                <button
                                    type="button"
                                    className="lw-act lw-act-orange"
                                    onClick={() => copyText(row.url, lane === 'toss' ? row.name : (row.keyword.split(/\s+/)[0] || row.keyword))}
                                >
                                    {copiedKey === row.url ? '복사됨!' : (lane === 'toss' ? '상품명 복사' : '브랜드명 복사')}
                                </button>
                            )}
                            {/* 정면 수치를 못 믿겠으면 직접 세어 보라 — 실측을 파는 보드는 검증 동선까지 줘야 한다. */}
                            <a
                                className="lw-act lw-act-green"
                                href={`https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(row.keyword)}`}
                                target="_blank"
                                rel="noreferrer"
                            >네이버 검색분석</a>
                            {lane === 'coupang' && (
                                <button type="button" className="lw-act lw-act-gold" disabled={!productUrl} onClick={() => void makeLink(row)}>
                                    {linkState?.key === row.url
                                        ? linkState.label
                                        : (<>내 제휴링크 복사<span className="lw-act-sub">(API키 있어야됨)</span></>)}
                                </button>
                            )}
                            {lane === 'toss' && (
                                /*
                                 * 발급은 웹 콘솔이 아니라 토스 앱에서만 된다(공식 가이드
                                 * 실측 2026-08-21 — 콘솔엔 상품 검색 자체가 없다).
                                 * 상품명을 복사해 주고 앱 안 경로를 그대로 적는다.
                                 */
                                <button
                                    type="button"
                                    className="lw-act lw-act-gold"
                                    onClick={() => copyText(`toss-issue:${row.url}`, row.name)}
                                >
                                    {copiedKey === `toss-issue:${row.url}` ? '상품명 복사했습니다' : '토스 앱에서 발급'}
                                    <span className="lw-act-sub">토스 앱 쇼핑 검색 → 상품 → 공유 → 쉐어링크 공유하기</span>
                                </button>
                            )}
                            {lane === 'brandconnect' && (
                                <a className="lw-act lw-act-gold" href="https://brandconnect.naver.com/" target="_blank" rel="noreferrer">
                                    브랜드커넥트 콘솔<span className="lw-act-sub">브랜드명으로 캠페인 확인</span>
                                </a>
                            )}
                        </div>
                        {/* 세 레인이 같은 부품을 쓴다 — 제목 교리를 갈라 놓지 않는다. */}
                        {!discoveryMode && <AffiliateTitles
                            keyword={row.keyword}
                            product={row.name}
                            item={row}
                            assessment={assessment}
                            onAnalyze={onAnalyze}
                        />}
                    </li>
                );
    };

    return (
        <>
            <div className="lw-segment lw-segment-wrap" role="group" aria-label="쿠팡 발굴 방식">
                <button type="button" className={discoveryMode ? 'on' : ''} aria-pressed={discoveryMode} onClick={() => setRoute('discovery')}>신기·실용 상품 발견</button>
                <button type="button" className={!discoveryMode ? 'on' : ''} aria-pressed={!discoveryMode} onClick={() => setRoute('search')}>검색 유입 공략</button>
            </div>
            {discoveryMode ? <>
                <p className="lw-write-hint">검색량이 적어도 발견 후보에서 제외하지 않습니다. 구체적인 기능 표기와 사용 장면이 연결되는 상품을 먼저 보여줍니다. 상품명 기준 조사 후보이며, 실제 신기함·성능·판매 성과가 검증된 추천은 아닙니다. 목록 위치는 판매량 순위가 아닙니다.</p>
                <div className="lw-segment lw-segment-wrap" role="group" aria-label="쿠팡 발견 후보">
                    <button type="button" className={discoveryView === 'all' ? 'on' : ''} aria-pressed={discoveryView === 'all'} onClick={() => setDiscoveryView('all')}>전체 상품 <em>{all.length}</em></button>
                    <button type="button" className={discoveryView === 'candidate' ? 'on' : ''} aria-pressed={discoveryView === 'candidate'} onClick={() => setDiscoveryView('candidate')}>실용 단서 후보 <em>{candidateCount}</em></button>
                </div>
                {visible.length === 0 && <p role="status" className="lw-note">현재 상품명에서 실용 기능 단서를 찾은 후보가 없습니다. 전체 상품에서 상세정보를 확인할 수 있습니다. 검색량 때문에 제외한 것은 아닙니다.</p>}
            </> : <>
            <p className="lw-write-hint">
                <strong>상위10 정면이란?</strong> 이 검색어로 검색했을 때 첫 화면에 나오는 글 10개 중,
                제목이 이 검색어를 그대로 다룬 글이 몇 개인지 실제로 센 숫자입니다.
                {' '}다른 표현으로 같은 질문에 답한 글이 있을 수 있으므로, 이 숫자만으로 노출 가능성을 확정하지 않습니다.
            </p>
            <RecommendationFilter value={recommendationView} onChange={setRecommendationView} counts={counts} searchOnly />
            </>}
            {/* 그룹 헤더는 뺐다(사장님: 정면 설명 빼고 다 없애). 판정은 카드 배지가 이미 말한다. */}
            <ol className="lw-product-list">
                {visible.map((entry, index) => renderRow(entry, index + 1))}
            </ol>
        </>
    );
}

export default CoupangBoard;
