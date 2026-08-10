import { useEffect, useMemo, useState } from 'react';
import { fetchCoupangProducts, formatCount, type CoupangProducts } from '../../lib/keywordApi';
import { goldenIndex } from '../../lib/goldenIndex';
import { TabIntro } from './LewordShared';
import { AFFILIATE_LANES, affiliateRows, brandToken, rowsForLane, type AffiliateRow } from './affiliateLanes';

/**
 * 제휴 황금키워드 — 세 판을 나란히.
 *
 * 검색창을 없앴다. 키워드를 넣어 조회하는 일은 '키워드 분석' 탭이 이미 한다.
 * 여기서 할 일은 **지금 글을 쓰면 성과가 날 상품 자리를 골라 줄 세우는 것**이다.
 *
 * 줄 세우는 근거는 전부 선점 보드가 실측한 값이다 — 쇼핑 구획이 실제로 떴는지,
 * 상품명·가격이 화면에서 읽혔는지, 검색량 대비 문서가 얼마나 적은지.
 * 없는 수치는 만들지 않는다.
 */

const BOARD_URL = '/data/preemption-board.json';

function AffiliateTab({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
    const [rows, setRows] = useState<AffiliateRow[] | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
    const [copied, setCopied] = useState('');
    /*
     * 쿠팡 상품은 키워드마다 따로 부른다. 한 번에 다 부르면 파트너스 쿼터가 확 탄다 —
     * 사용자가 펼친 카드만 조회한다.
     */
    const [coupang, setCoupang] = useState<Record<string, CoupangProducts | 'loading'>>({});

    const loadCoupang = async (keyword: string) => {
        if (coupang[keyword]) return;
        setCoupang((previous) => ({ ...previous, [keyword]: 'loading' }));
        const response = await fetchCoupangProducts(keyword);
        setCoupang((previous) => ({
            ...previous,
            [keyword]: response.ok && response.data
                ? response.data
                : { keyword, products: [], needsKeys: true },
        }));
    };

    useEffect(() => {
        let alive = true;
        fetch(BOARD_URL, { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no board'))))
            .then((data) => {
                if (!alive) return;
                const picked = affiliateRows(Array.isArray(data?.rows) ? data.rows : []);
                setRows(picked);
                setStatus(picked.length > 0 ? 'ready' : 'empty');
            })
            .catch(() => { if (alive) setStatus('error'); });
        return () => { alive = false; };
    }, []);

    const cards = useMemo(() => rows || [], [rows]);

    const copy = (keyword: string) => {
        navigator.clipboard?.writeText(keyword);
        setCopied(keyword);
        window.setTimeout(() => setCopied(''), 1400);
    };

    return (
        <>
            <TabIntro
                title="제휴 황금키워드"
                desc="검색결과에 상품 카드가 실제로 뜬 자리만 모았습니다. 파는 물건이 있어야 제휴가 성립하기 때문입니다. 상품명과 가격은 검색결과에서 그대로 읽은 값이고, 순서는 검색량 대비 문서가 적은 순입니다."
                source="Bright Data 검색결과 실측 · 네이버 쇼핑 카드"
            />

            {status === 'loading' && <div className="lw-note">상품 자리를 불러오는 중입니다…</div>}
            {status === 'error' && (
                <div className="lw-note lw-note-error">
                    <strong>보드를 불러오지 못했습니다</strong>
                    <p>잠시 후 다시 확인해 주세요.</p>
                </div>
            )}
            {status === 'empty' && (
                <div className="lw-note lw-note-limit">
                    <strong>이번 회차에 상품 자리가 없습니다</strong>
                    <p>쇼핑 구획이 실제로 뜬 검색어만 싣습니다. 억지로 채우지 않는 것이 이 보드의 규칙입니다.</p>
                </div>
            )}

            {status === 'ready' && (
                <div className="lw-lanes">
                    {AFFILIATE_LANES.map((lane) => (
                        <section key={lane.id} className="lw-lane" aria-label={lane.label}>
                            <header className="lw-lane-head">
                                <h2>{lane.label}</h2>
                                <p>{lane.desc}</p>
                                <p className="lw-lane-status">{lane.status}</p>
                                <a href={lane.consoleUrl} target="_blank" rel="noreferrer">콘솔 열기 →</a>
                            </header>

                            <ol className="lw-lane-list">
                                {rowsForLane(lane.id, cards).map((row, index) => {
                                    const index2 = goldenIndex(row.searchVolume, row.documentCount);
                                    const product = lane.id === 'brandconnect'
                                        ? `브랜드 «${brandToken(row)}»`
                                        : (row.meaning?.productNames || [])[0];
                                    const price = row.meaning?.priceMedian;
                                    const priceShown = price && (row.meaning?.priceSamples || 0) >= 3;
                                    return (
                                        <li key={`${lane.id}-${row.keyword}`} className="lw-lane-card">
                                            <div className="lw-lane-rank">{index + 1}</div>
                                            <div className="lw-lane-body">
                                                <div className="lw-lane-tags">
                                                    <span className="lw-topic-tag">{row.topic}</span>
                                                    {index2 && (
                                                        <span className={`lw-gold-mini lw-gold-${index2.tier}`}>
                                                            {index2.label} {index2.ratio!.toFixed(1)}
                                                        </span>
                                                    )}
                                                </div>
                                                <h3>{row.keyword}</h3>
                                                {product && <p className="lw-lane-product">{product}</p>}

                                                <div className="lw-lane-metrics">
                                                    <span>검색량 <strong>{formatCount(row.searchVolume)}</strong></span>
                                                    <span>문서수 <strong>{formatCount(row.documentCount)}</strong></span>
                                                    {priceShown && (
                                                        <span>노출가 <strong>{price!.toLocaleString('ko-KR')}원</strong></span>
                                                    )}
                                                </div>

                                                <div className="lw-lane-actions">
                                                    <button type="button" onClick={() => copy(row.keyword)}>
                                                        {copied === row.keyword ? '복사됨' : '복사'}
                                                    </button>
                                                    <button type="button" onClick={() => onAnalyze(row.keyword)}>분석</button>
                                                    {lane.id === 'coupang'
                                                        ? (
                                                            <button type="button" onClick={() => loadCoupang(row.keyword)}>
                                                                {coupang[row.keyword] === 'loading' ? '조회 중…' : '쿠팡 상품'}
                                                            </button>
                                                        )
                                                        : (
                                                            <a href={lane.consoleUrl} target="_blank" rel="noreferrer">
                                                                캠페인 확인
                                                            </a>
                                                        )}
                                                </div>

                                                {lane.id === 'coupang' && (() => {
                                                    const found = coupang[row.keyword];
                                                    if (!found || found === 'loading') return null;
                                                    if (found.needsKeys) {
                                                        return (
                                                            <p className="lw-lane-hint">
                                                                내 API 키에 쿠팡 파트너스 키를 넣으면 실제 상품이 나옵니다.
                                                            </p>
                                                        );
                                                    }
                                                    if (found.products.length === 0) {
                                                        return <p className="lw-lane-hint">쿠팡에 이 검색어로 잡히는 상품이 없습니다.</p>;
                                                    }
                                                    return (
                                                        <ul className="lw-coupang">
                                                            {found.products.slice(0, 4).map((item) => (
                                                                <li key={item.url}>
                                                                    {item.image && <img src={item.image} alt="" loading="lazy" />}
                                                                    <a href={item.url} target="_blank" rel="noreferrer">{item.name}</a>
                                                                    <strong>{item.price === null ? '—' : `${item.price.toLocaleString('ko-KR')}원`}</strong>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    );
                                                })()}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>

                            {rowsForLane(lane.id, cards).length === 0 && (
                                <p className="lw-lane-empty">이번 회차에 이 판에 맞는 자리가 없습니다.</p>
                            )}
                        </section>
                    ))}
                </div>
            )}
        </>
    );
}

export default AffiliateTab;
