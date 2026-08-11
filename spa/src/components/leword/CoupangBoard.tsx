import { useEffect, useState } from 'react';
import { fetchAffiliateBoard, type AffiliateProduct } from '../../lib/keywordApi';
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
function CoupangBoard({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
    const [rows, setRows] = useState<AffiliateProduct[] | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'needs-keys' | 'error'>('idle');
    const [message, setMessage] = useState('');

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
    const prime = all.filter((row) => {
        const gi = goldenIndex(row.searchVolume, row.documentCount);
        return gi !== null && gi.tier !== 'weak';
    });
    const rest = all.filter((row) => !prime.includes(row));

    const renderRow = (row: AffiliateProduct, rank: number) => {
                const index2 = goldenIndex(row.searchVolume, row.documentCount);
                return (
                    <li key={row.url} className="lw-product">
                        <span className="lw-product-rank">{rank}</span>
                        {row.image && <img src={row.image} alt="" loading="lazy" />}
                        <div className="lw-product-body">
                            <div className="lw-product-tags">
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
                            {(row.angles || []).slice(0, 2).map((angle) => (
                                <p key={angle.text} className="lw-lane-product">{angle.kind} · {angle.text}</p>
                            ))}
                            <div className="lw-product-metrics">
                                <span>검색어 <strong>{row.keyword}</strong></span>
                                <span>월 검색량 <strong>{row.searchVolume === null ? '—' : row.searchVolume.toLocaleString('ko-KR')}</strong></span>
                                <span>문서수 <strong>{row.documentCount === null ? '—' : row.documentCount.toLocaleString('ko-KR')}</strong></span>
                                <span>가격 <strong>{row.price === null ? '—' : `${row.price.toLocaleString('ko-KR')}원`}</strong></span>
                            </div>
                            <div className="lw-lane-actions">
                                <button type="button" onClick={() => onAnalyze(row.keyword)}>이 검색어 분석</button>
                                <a href={row.url} target="_blank" rel="noreferrer">상품 보기</a>
                            </div>
                        </div>
                    </li>
                );
    };

    return (
        <>
            {prime.length > 0 && (
                <>
                    <p className="lw-write-hint"><strong>지금 써볼 만한 것</strong> — 찾는 사람 대비 쓴 글이 적습니다.</p>
                    <ol className="lw-product-list">
                        {prime.map((row, index) => renderRow(row, index + 1))}
                    </ol>
                </>
            )}
            {rest.length > 0 && (
                <>
                    <p className="lw-write-hint">
                        <strong>판매 참고</strong> — 찾는 사람이 아직 적거나 이미 쓴 글이 많습니다.
                        선점보다는 상품 소개 글감으로 보세요.
                    </p>
                    <ol className="lw-product-list">
                        {rest.map((row, index) => renderRow(row, prime.length + index + 1))}
                    </ol>
                </>
            )}
        </>
    );
}

export default CoupangBoard;
