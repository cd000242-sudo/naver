import { useEffect, useState } from 'react';
import { createCoupangDeeplink, fetchAffiliateBoard, type AffiliateProduct } from '../../lib/keywordApi';
import { type LaneId } from './affiliateLanes';
import { goldenIndex } from '../../lib/goldenIndex';

/**
 * 쿠팡 상품 보드 — 상품에서 출발한다.
 *
 * 사장님 지적: "인기상품을 그냥 나열한 게 아니라, 지금 이 제품으로 글을 작성하면
 * 제휴수익이 날 확률이 높은 제품을 찾아서 나열해 달라는 뜻이야."
 *
 * 그래서 쿠팡이 지금 미는 상품(골드박스)을 받아, 상품마다 그 검색어의
 * 월 검색량과 블로그 문서수를 실제로 잰다. 줄 세우기는 검색량 ÷ 문서수 가 1차,
 * 할인율이 2차다 — 찾는 사람이 많고 쓴 글이 적은데 지금 싸기까지 하면
 * 그게 제일 좋은 자리다. 확률은 만들지 않는다.
 *
 * 조회는 방문자 자기 키로 돈다. 그래서 버튼을 눌러야 시작한다 —
 * 화면만 열었는데 남의 쿼터가 타면 안 된다.
 */
function CoupangBoard({ onAnalyze, lane = 'coupang' }: { onAnalyze: (keyword: string) => void; lane?: LaneId }) {
    const [rows, setRows] = useState<AffiliateProduct[] | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'needs-keys' | 'error'>('idle');
    const [message, setMessage] = useState('');
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
        const res = await createCoupangDeeplink(row.rawUrl || row.url);
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
        if (response.data.products.length === 0) setMessage('지금 골드박스에 잡히는 상품이 없습니다.');
    };

    useEffect(() => { void load(); }, []);

    if (state === 'loading') return <div className="lw-note">쿠팡 상품을 받아 수요·경쟁을 재는 중입니다…</div>;
    if (state === 'needs-keys') {
        return (
            <div className="lw-note lw-note-limit">
                <strong>쿠팡 파트너스 키가 필요합니다</strong>
                <p>내 API 키 탭에 ACCESS KEY와 SECRET KEY를 넣으면 지금 팔리는 상품이 채워집니다.</p>
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

    /*
     * 사장님 지적: "검색량이 적고 문서량이 많네 — 이런 제품들은 선점하기 힘들지 않니."
     * 맞다. 골드박스는 '쿠팡이 미는 상품'이지 '블로그 자리가 빈 상품'이 아니라서,
     * 써볼 만한 것은 매일 몇 개뿐이다. 그래서 한 줄로 섞지 않고 두 덩이로 가른다.
     * 기준은 황금지수(등급 SSoT의 사본) 그대로다 — 여기서 새 임계값을 만들지 않는다.
     */
    const all = rows || [];

    const renderRow = (row: AffiliateProduct, rank: number) => {
                const index2 = goldenIndex(row.searchVolume, row.documentCount);
                return (
                    <li key={row.url} className="lw-product">
                        <span className="lw-product-rank">{rank}</span>
                        {row.image && <img src={row.image} alt="" loading="lazy" />}
                        <div className="lw-product-body">
                            <div className="lw-product-tags">
                                {row.serpTop && row.serpTop.sampled > 0 && (() => {
                                    const exact = row.serpTop!.exact;
                                    const verdict = exact <= 2
                                        ? { label: `자리 있음 · 정면 ${exact}개 — 고르세요`, color: '#2ecc71', bg: 'rgba(46,204,113,.14)' }
                                        : exact <= 5
                                            ? { label: `경합 · 정면 ${exact}개`, color: '#f5a623', bg: 'rgba(245,166,35,.14)' }
                                            : { label: `포화 · 정면 ${exact}개 — 피하세요`, color: '#ff6b6b', bg: 'rgba(255,107,107,.14)' };
                                    return (
                                        <span style={{
                                            color: verdict.color, background: verdict.bg,
                                            border: `1px solid ${verdict.color}44`, borderRadius: 999,
                                            padding: '2px 10px', fontWeight: 700, fontSize: 12,
                                        }}>{verdict.label}</span>
                                    );
                                })()}
                                {index2 && (
                                    <span className={`lw-gold-mini lw-gold-${index2.tier}`}>
                                        {index2.label} {index2.ratio!.toFixed(1)}
                                    </span>
                                )}
                                {row.discountPercent !== null && <span className="lw-discount">{row.discountPercent}% 할인</span>}
                                {row.rocket && <span className="lw-rocket">로켓배송</span>}
                                <span className="lw-goldbox">
                                    {row.source
                                        ? `${row.source} ${row.bestRank ?? row.goldboxRank}위`
                                        : `골드박스 ${row.goldboxRank}위`}
                                </span>
                            </div>
                            <a className="lw-product-name" href={row.url} target="_blank" rel="noreferrer">{row.name}</a>
                            <div className="lw-product-metrics">
                                <span>검색어 <strong>{row.keyword}</strong></span>
                                <span>월 검색량 <strong>{row.searchVolume === null ? '—' : row.searchVolume.toLocaleString('ko-KR')}</strong></span>
                                <span>문서수 <strong>{row.documentCount === null ? '—' : row.documentCount.toLocaleString('ko-KR')}</strong></span>
                                {row.serpTop && row.serpTop.sampled > 0 && (
                                    <span title={`블로그 검색 상위 ${row.serpTop.sampled}개 제목 중 '${row.keyword}'를 그대로 다룬 글 ${row.serpTop.exact}개`}>
                                        상위{row.serpTop.sampled} 정면 <strong>{row.serpTop.exact}개</strong>
                                    </span>
                                )}
                                <span>가격 <strong>{row.price === null ? '—' : `${row.price.toLocaleString('ko-KR')}원`}</strong></span>
                            </div>
                        </div>
                        <div className="lw-product-actions">
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
                                <button type="button" className="lw-act lw-act-gold" onClick={() => void makeLink(row)}>
                                    {linkState?.key === row.url
                                        ? linkState.label
                                        : (<>내 제휴링크 복사<span className="lw-act-sub">(API키 있어야됨)</span></>)}
                                </button>
                            )}
                            {lane === 'toss' && (
                                <a className="lw-act lw-act-gold" href="https://sharelink.toss.im/home" target="_blank" rel="noreferrer">
                                    토스 콘솔 열기<span className="lw-act-sub">상품명 붙여넣어 검색</span>
                                </a>
                            )}
                            {lane === 'brandconnect' && (
                                <a className="lw-act lw-act-gold" href="https://brandconnect.naver.com/" target="_blank" rel="noreferrer">
                                    브랜드커넥트 콘솔<span className="lw-act-sub">브랜드명으로 캠페인 확인</span>
                                </a>
                            )}
                        </div>
                    </li>
                );
    };

    return (
        <>
            <p className="lw-write-hint">
                <strong>상위10 정면이란?</strong> 이 검색어로 검색했을 때 첫 화면에 나오는 글 10개 중,
                제목이 이 검색어를 그대로 다룬 글이 몇 개인지 실제로 센 숫자입니다.
                {' '}<strong>정면 0~2개(초록)를 고르면 됩니다</strong> — 첫 화면에 경쟁 글이 거의 없어
                내 글이 그 자리를 차지합니다. 3~5개(경합)는 더 잘 쓰면 노려볼 수 있는 자리라 남겨 뒀고,
                6개 이상(포화)은 애초에 보드에서 뺐습니다. 문서수가 커도 정면이 적으면 쓸 자리가 있습니다.
            </p>
            {/* 그룹 헤더는 뺐다(사장님: 정면 설명 빼고 다 없애). 판정은 카드 배지가 이미 말한다. */}
            <ol className="lw-product-list">
                {all.map((row, index) => renderRow(row, index + 1))}
            </ol>
        </>
    );
}

export default CoupangBoard;
