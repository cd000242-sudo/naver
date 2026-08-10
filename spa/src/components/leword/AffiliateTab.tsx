import { useEffect, useState } from 'react';
import {
    fetchShoppingSignal,
    formatCount,
    type KeywordUsage,
    type ShoppingSignal,
} from '../../lib/keywordApi';
import { ErrorNote, MetricCell, TabIntro, UsageBar } from './LewordShared';

/**
 * 제휴 황금키워드.
 *
 * 솔직하게 짚고 갈 것: 쿠팡 파트너스·토스 쉐어링크·브랜드커넥트는 지금 이 사이트가
 * 대신 조회해 줄 수 있는 공개 API 가 없다(쿠팡은 파트너스 키가 필요하고, 나머지 둘은
 * 공개 API 자체가 없다). 그래서 **없는 수치를 지어내지 않는다.**
 *
 * 대신 실제로 잴 수 있는 것을 잰다 — 네이버 쇼핑에 그 키워드로 상품이 몇 개
 * 올라와 있고 최저가가 얼마인지. 판매되는 물건이 있어야 제휴가 성립하므로
 * 이건 제휴 가능성에 대한 실측 근거다. 각 플랫폼은 바로가기로 연결한다.
 */

const AFFILIATE_LINKS = [
    {
        id: 'coupang',
        label: '쿠팡 파트너스',
        desc: '상품 검색 후 파트너스 링크 생성',
        build: (keyword: string) => `https://partners.coupang.com/#affiliate/ws/link?keyword=${encodeURIComponent(keyword)}`,
    },
    {
        id: 'toss',
        label: '토스 쉐어링크',
        desc: '토스 제휴 캠페인 목록',
        build: () => 'https://toss.im/',
    },
    {
        id: 'brandconnect',
        label: '네이버 브랜드커넥트',
        desc: '브랜드 캠페인 지원',
        build: () => 'https://brandconnect.naver.com/',
    },
];

function AffiliateTab({ initialKeyword, onAnalyze }: { initialKeyword: string; onAnalyze: (keyword: string) => void }) {
    const [keyword, setKeyword] = useState(initialKeyword);
    const [signal, setSignal] = useState<ShoppingSignal | null>(null);
    const [usage, setUsage] = useState<KeywordUsage | null>(null);
    const [error, setError] = useState<{ code?: string; message?: string; missing?: string[] }>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialKeyword) setKeyword(initialKeyword);
    }, [initialKeyword]);

    const run = async (target: string) => {
        const trimmed = target.trim();
        if (!trimmed || loading) return;
        setLoading(true);
        setError({});
        const response = await fetchShoppingSignal(trimmed);
        setLoading(false);
        if (response.usage) setUsage(response.usage);
        if (response.ok && response.data) {
            setSignal(response.data);
            return;
        }
        setSignal(null);
        setError({ code: response.error, message: response.message, missing: response.missing });
    };

    return (
        <>
            <TabIntro
                title="제휴 황금키워드"
                desc="그 키워드로 실제 판매되는 상품이 있는지 확인합니다. 팔리는 물건이 있어야 제휴 글이 성립합니다."
                source="네이버 쇼핑 검색 API (상품수·최저가·판매몰 실측)"
            />

            <form className="lw-search" onSubmit={(event) => { event.preventDefault(); run(keyword); }}>
                <input
                    type="search"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="제휴 가능성을 확인할 키워드"
                    aria-label="제휴 확인 키워드"
                />
                <button type="submit" disabled={loading || !keyword.trim()}>
                    {loading ? '조회 중…' : '상품 확인'}
                </button>
            </form>

            <UsageBar usage={usage} />
            <ErrorNote error={error.code} message={error.message} missing={error.missing} />

            <div className="lw-note lw-note-plain">
                아래 플랫폼 버튼은 각 서비스의 <strong>공식 화면으로 이동하는 바로가기</strong>입니다.
                제휴 추적 링크가 아니며, 이 사이트에 수수료가 발생하지 않습니다.
                쿠팡 파트너스·토스 쉐어링크·브랜드커넥트의 실적 데이터는 각 플랫폼에서 직접 확인해야 합니다.
            </div>

            {signal && (
                <>
                    <section className="lw-panel" aria-label={`${signal.keyword} 상품 신호`}>
                        <div className="lw-panel-head">
                            <h2>{signal.keyword}</h2>
                            <span>실측값</span>
                        </div>
                        <div className="lw-metrics">
                            <MetricCell label="등록 상품수" value={formatCount(signal.productCount)} note="네이버 쇼핑 전체" />
                            <MetricCell
                                label="최저가"
                                value={signal.lowestPrice === null ? '—' : `${formatCount(signal.lowestPrice)}원`}
                                note="상위 노출 10개 기준"
                            />
                            <MetricCell label="판매몰" value={String(new Set(signal.items.map((i) => i.mall).filter(Boolean)).size)} note="상위 10개 중" />
                        </div>
                        <div className="lw-affiliate-links">
                            {AFFILIATE_LINKS.map((platform) => (
                                <a key={platform.id} href={platform.build(signal.keyword)} target="_blank" rel="noreferrer">
                                    <strong>{platform.label}</strong>
                                    <span>{platform.desc}</span>
                                </a>
                            ))}
                        </div>
                    </section>

                    {signal.items.length > 0 && (
                        <section className="lw-panel" aria-label="상위 노출 상품">
                            <div className="lw-panel-head">
                                <h2>상위 노출 상품</h2>
                                <span>{signal.items.length}개</span>
                            </div>
                            <div className="lw-grid">
                                {signal.items.map((item) => (
                                    <article key={item.link || item.title} className="lw-card">
                                        <h3>{item.title}</h3>
                                        <div className="lw-card-metrics">
                                            <div>
                                                <span>최저가</span>
                                                <strong>{item.lowPrice === null ? '—' : `${formatCount(item.lowPrice)}원`}</strong>
                                            </div>
                                            <div><span>판매몰</span><strong>{item.mall || '—'}</strong></div>
                                            <div><span>브랜드</span><strong>{item.brand || '—'}</strong></div>
                                        </div>
                                        {item.category && <p className="lw-card-note">{item.category}</p>}
                                        <div className="lw-card-actions">
                                            <button type="button" onClick={() => onAnalyze(signal.keyword)}>키워드 분석</button>
                                            {item.link && <a href={item.link} target="_blank" rel="noreferrer">상품 보기</a>}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    )}

                    {signal.productCount === 0 && (
                        <div className="lw-note">
                            이 키워드로 등록된 상품이 없습니다. 제휴보다는 정보성 글이 맞는 키워드입니다.
                        </div>
                    )}
                </>
            )}

            {!signal && !error.code && !loading && (
                <div className="lw-note">키워드를 입력하면 그 키워드로 팔리는 상품이 있는지 조회합니다.</div>
            )}
        </>
    );
}

export default AffiliateTab;
