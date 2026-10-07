import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductPageStyles from '../components/products/ProductPageStyles';
import { CloseBand, FaqList, HeroActions, ProofStrip, ReviewQuotes, VsPanel } from '../components/products/ProductBlocks';
import { ArrowRight } from '../components/products/ProductIcons';
import { BandPrice, PriceTable, ProductBand, ProductsExtrasStyles, type BandClip, type BandShot } from '../components/products/ProductsExtras';
import { applyStoreOverrides, individualTotal, sellableProducts, singleProducts, won, type Product } from '../lib/productCatalog';
import { fetchSiteContent, type SiteContent } from '../lib/siteOps';

/*
 * 제품 정보(2026-10-07 리디자인 — 시안 1 "고수보다 한 수 위, 비교로 증명").
 * 첫 화면 비교 판은 상점 값의 단순 합계뿐이다: 세 제품 1년씩 따로 vs All in one 1년(모두 부가세 별도).
 * 가격은 카탈로그 + 관리자 [상점 제품] 저장값(store.products)에서만 읽는다 — 화면에 숫자를 적지 않는다.
 *
 * 관리자 사이트콘텐츠 중 이 페이지가 더는 읽지 않는 것(옛 문구 · 영어 라벨 · 옛 화면):
 *   productsPage.* 전부(문구 · guideCards · suiteFlow · comparison · images) · products.<id> 의 문구 칸 · theme.productsBgImage.
 *   products.<id>.media 는 영상(type 'video')일 때만 읽어 띠의 작은 영상 창에 싣는다.
 */

// 제품 말이 들어간 후기만. 옛 무료판 · GPTs · 영구제 · 하루 체험권 · "Orbit 아직 없음" · HTML 글쓰기 · 가격 인상 재촉처럼 지금 사실과 다른 기대를 주는 후기는 뺀다.
const REVIEW_MATCH = /자동화|키워드|홈판|홈피드|발행|프로그램/;
const REVIEW_EXCLUDE = /무료|gpts|영구제|pro\s*버전|체험권|블로그스팟|워드프레스도|html로|만명|커서로|비싸지기/i;

const LEWORD_SHOTS: BandShot[] = [
    { label: '황금키워드', src: '/images/leword/product/golden-board.webp', mobileSrc: '/images/leword/product/m/golden-board.webp', alt: 'LEWORD 리더남 전용 황금키워드 화면', caption: '리더남 전용 황금키워드 · 실제 화면' },
    { label: '홈판 소재 · 제목', src: '/images/leword/product/homefeed.webp', mobileSrc: '/images/leword/product/m/homefeed.webp', alt: 'LEWORD 리더남 홈판 추천 소재 · 제목 화면', caption: '리더남 홈판 추천 소재 · 제목 · 실제 화면' },
    { label: '키워드 분석', src: '/images/leword/product/analyzer.webp', mobileSrc: '/images/leword/product/m/analyzer.webp', alt: 'LEWORD 키워드 분석 화면 — 검색량 · 블로그 문서수', caption: '키워드 분석 · 실제 화면' },
    { label: '글 한 편 설계', src: '/images/leword/product/post-plan.webp', mobileSrc: '/images/leword/product/m/post-plan.webp', alt: 'LEWORD 글 한 편 유입 설계실 화면', caption: '글 한 편 유입 설계실 · 실제 화면' },
    { label: '오늘의 글감', src: '/images/leword/product/briefs.webp', mobileSrc: '/images/leword/product/m/briefs.webp', alt: 'LEWORD 오늘의 글감 화면', caption: '오늘의 글감 · 실제 화면' },
];

const NAVER_SHOTS: BandShot[] = [
    { label: '문단 정리 · 강조', src: '/images/naver-detail/content-format-highlight.png', mobileSrc: '/images/naver-detail/m/content-format-highlight.webp', alt: 'Better Life Naver로 발행한 글 — 문단 정리와 강조 문장', caption: 'Better Life Naver로 발행한 실제 글' },
    { label: '본문 이미지 · CTA', src: '/images/naver-detail/shopping-result-cta.png', mobileSrc: '/images/naver-detail/m/shopping-result-cta.webp', alt: 'Better Life Naver로 발행한 글 — 본문 이미지와 CTA 배너', caption: '이미지와 CTA 배너가 들어간 실제 글' },
    { label: '쇼핑커넥트 글', src: '/images/naver-detail/shopping-result-main.png', mobileSrc: '/images/naver-detail/m/shopping-result-main.webp', alt: 'Better Life Naver 쇼핑커넥트 모드로 발행한 글', caption: '쇼핑커넥트 모드로 발행한 실제 글' },
    { label: '이전글 · 해시태그', src: '/images/naver-detail/previous-post-hashtags.png', mobileSrc: '/images/naver-detail/m/previous-post-hashtags.webp', alt: 'Better Life Naver로 발행한 글 끝의 이전글 연결과 해시태그', caption: '이전글 연결과 해시태그까지 들어간 실제 글' },
];

const ORBIT_SHOTS: BandShot[] = [
    { label: '글쓰기', src: '/images/orbit/orbit-blogspot.png', mobileSrc: '/images/orbit/m/orbit-blogspot.webp', alt: 'Leadernam Orbit 글쓰기 화면 — 키워드 입력', caption: 'Leadernam Orbit 글쓰기 · 실제 화면', align: 'left' },
    { label: '연속 발행', src: '/images/orbit/orbit-sequential-queue.png', mobileSrc: '/images/orbit/m/orbit-sequential-queue.webp', alt: 'Leadernam Orbit 연속 발행 대기열 화면', caption: '여러 키워드를 차례로 올리는 연속 발행 · 실제 화면' },
    { label: '세 플랫폼 연결', src: '/images/orbit/orbit-platform-settings.png', mobileSrc: '/images/orbit/m/orbit-platform-settings.webp', alt: 'Leadernam Orbit 블로그 플랫폼 연결 설정 화면', caption: '블로그 플랫폼 연결 · 실제 화면' },
    { label: '외부 유입 글', src: '/images/orbit/orbit-external-traffic.png', mobileSrc: '/images/orbit/m/orbit-external-traffic.webp', alt: 'Leadernam Orbit 외부유입 글 생성 화면', caption: '발행한 글로 외부 유입 글 만들기 · 실제 화면' },
];

/** 관리자 media 가 영상일 때만 그것을, 아니면 기본 영상을 쓴다(옛 이미지 덮어쓰기 · 사라진 GIF 는 읽지 않는다). */
function clipFor(content: SiteContent | null, id: string, fallback: BandClip | null): BandClip | null {
    const media = content?.products?.[id]?.media;
    if (media?.type === 'video' && media.src) return { src: media.src, alt: media.alt || fallback?.alt || '실제 영상' };
    return fallback;
}

function BandLinks({ detail, product, trial }: { detail: string; product: Product | null; trial?: boolean }) {
    return (
        <div className="pp-pb-links">
            <Link to={detail} className="pp-btn pp-btn-line">자세히 보기<ArrowRight /></Link>
            {product && <Link to="/pricing" className="pp-pb-link">상점에서 담기<ArrowRight /></Link>}
            {trial && <Link to="/download" className="pp-pb-link">30일 체험 받기<ArrowRight /></Link>}
        </div>
    );
}

function useHashScroll(ready: unknown) {
    useEffect(() => {
        const scrollToHash = () => {
            const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
            if (!id) return;
            window.requestAnimationFrame(() => {
                const target = document.getElementById(id);
                if (!target) return;
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                target.focus({ preventScroll: true });
            });
        };
        scrollToHash();
        window.addEventListener('hashchange', scrollToHash);
        return () => window.removeEventListener('hashchange', scrollToHash);
    }, [ready]);
}

function ProductsPage() {
    const [content, setContent] = useState<SiteContent | null>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = '제품 정보 — LEWORD · Better Life Naver · Orbit · All in one';
        return () => { document.title = prev; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetchSiteContent().then((value) => { if (!cancelled) setContent(value); }).catch(() => { /* 카탈로그 기본값 그대로 */ });
        return () => { cancelled = true; };
    }, []);
    useHashScroll(content);

    // 상점과 같은 값 — 카탈로그 기본값 위에 관리자 [상점 제품] 저장값을 얹는다(useProduct 와 같은 규칙).
    const catalog = useMemo(() => applyStoreOverrides(content?.store?.products ?? null), [content]);
    const sellable = sellableProducts(catalog);
    const pick = (id: string) => sellable.find((item) => item.id === id) || null;
    const leword = pick('leword');
    const naver = pick('naver');
    const orbit = pick('orbit');
    const bundle = sellable.find((item) => item.bundle) || null;

    const singles = singleProducts(catalog).filter((item) => (item.prices.yearly || 0) > 0);
    const yearlySum = individualTotal('yearly', catalog);
    const bundleYearly = bundle?.prices.yearly || 0;
    const yearlyGap = yearlySum - bundleYearly;
    const lewordMonthly = leword?.prices.monthly || 0;

    const faqs: Array<[string, string]> = [
        ['하나만 사도 되나요?', '네. 제품마다 상점에서 따로 담아 살 수 있습니다. 세 제품을 모두 쓰실 거면 All in one 하나로 사면 됩니다.'],
        ['사기 전에 써 볼 수 있나요?', 'Better Life Naver와 Leadernam Orbit은 30일 동안 하루 3편까지 무료로 써 볼 수 있습니다(다운로드 페이지에서 설치). LEWORD는 로그인하지 않아도 황금키워드 상위 5건과 실검 틈새 3건을 볼 수 있습니다.'],
        ['설치해야 하나요?', 'Better Life Naver와 Leadernam Orbit은 PC에 설치해서 씁니다. LEWORD는 사이트에서 로그인만 하면 바로 쓰고, PC 앱도 있습니다.'],
        ['LEWORD도 글을 써 주나요?', '아니요. LEWORD는 무엇을 쓸지 찾고 설계하는 도구입니다. 네이버 글은 Better Life Naver, 워드프레스 · 티스토리 · 블로그스팟 글은 Leadernam Orbit이 씁니다.'],
        ['All in one에는 무엇이 들어 있나요?', 'Better Life Naver · Leadernam Orbit · LEWORD를 모두 씁니다. 이용 기간 안에 새 제품이 나오면 그것도 그대로 쓰실 수 있고, 문의는 1:1로 먼저 도와드립니다.'],
        ['한 계정으로 여러 곳에서 쓸 수 있나요?', 'LEWORD는 한 계정을 사이트 1곳과 PC 앱 1곳에서 동시에 쓸 수 있습니다. 먼저 쓰고 있는 쪽이 우선입니다.'],
        ['부가세는 어떻게 되나요?', lewordMonthly > 0
            ? `LEWORD 1개월(${won(lewordMonthly)}원)만 부가세가 포함된 값이고 30일마다 자동결제됩니다. LEWORD 1년과 다른 제품의 값은 모두 부가세 별도입니다.`
            : 'LEWORD 1개월만 부가세가 포함된 값입니다. 그 밖의 값은 모두 부가세 별도입니다.'],
        ['환불은 어떻게 하나요?', '환불 조건은 사이트 맨 아래 환불정책 페이지에 정리돼 있습니다.'],
    ];

    return (
        <main className="pp">
            <ProductPageStyles />
            <ProductsExtrasStyles />
            <section className="pp-hero">
                <div className="pp-wrap">
                    <div className="pp-hero-grid">
                        <div>
                            <h1>찾고, 쓰고, 올리는<br /><em>블로그로 버는 데<br />필요한 도구</em></h1>
                            <p className="pp-hero-sub">키워드를 찾는 LEWORD, 네이버에 올리는 Better Life Naver, 워드프레스 · 티스토리 · 블로그스팟을 맡는 Orbit. 필요한 것만 하나씩 사도 됩니다.</p>
                            <HeroActions primary={{ to: '/pricing', label: '상점에서 고르기' }} secondary={{ to: '/leword', label: 'LEWORD 맛보기' }} />
                        </div>
                        {bundle && bundleYearly > 0 && (
                            <VsPanel
                                label="1년 이용권 기준 — 하나씩 따로 살 때와 All in one 비교"
                                chip={<>
                                    <span>1년 이용권</span><i aria-hidden />
                                    {yearlyGap > 0 && <><span>차이 <b>{won(yearlyGap)}</b>원</span><i aria-hidden /></>}
                                    <span>부가세 별도</span>
                                </>}
                                theirsTitle="하나씩 따로 살 때"
                                oursTitle={bundle.name}
                                theirs={[
                                    ...singles.map((item) => `${item.name} 1년 · ${won(item.prices.yearly || 0)}원`),
                                    `합계 ${won(yearlySum)}원`,
                                ]}
                                ours={[
                                    { text: '세 제품을 코드 하나로', edge: '세 제품 모두' },
                                    { text: '새 제품도 기간 안에 그대로', edge: '앞으로 나올 제품 포함' },
                                    { text: '1:1로 먼저 도와드립니다', edge: '1:1 우선 지원' },
                                    { text: `1년 ${won(bundleYearly)}원`, edge: yearlyGap > 0 ? `따로 살 때보다 ${won(yearlyGap)}원 적게` : undefined },
                                ]}
                                foot="상점 값 그대로 · 1년 이용권 단순 합계 · 모두 부가세 별도"
                            />
                        )}
                    </div>
                    <ProofStrip items={[
                        { to: '/reviews', title: '구매 후기', desc: '실제 구매자가 남긴 후기', icon: 'review' },
                        { to: '/reviews', title: '수익 인증', desc: '사용자가 올린 블로그 수익 인증', icon: 'income' },
                        { to: '/download', title: '30일 무료 체험', desc: 'Naver · Orbit 은 설치해서 바로', icon: 'devices' },
                    ]} />
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <h2 className="pp-h2">제품마다 맡은 일이 다릅니다</h2>
                    <p className="pp-lead">LEWORD가 무엇을 쓸지 찾고, Better Life Naver와 Orbit이 글을 써서 올립니다. 화면 이름을 누르면 실제 화면이 바뀝니다.</p>

                    <ProductBand
                        id="product-leword"
                        title="LEWORD는 무엇을 쓸지 먼저 찾아 줍니다"
                        body="검색량은 붙었는데 글은 적은 키워드를 매일 검색결과를 직접 열어 확인하고 남깁니다. 고수 블로그가 요즘 쓰는 소재와 그보다 나은 제목, 글 한 편의 설계까지 이어 줍니다. 웹에서 바로 쓰고 PC 앱도 있습니다. 글을 쓰지는 않습니다."
                        shots={LEWORD_SHOTS}
                        clip={clipFor(content, 'leword', null)}
                    >
                        {leword && <BandPrice product={leword} />}
                        <BandLinks detail="/leword-detail" product={leword} />
                    </ProductBand>

                    <ProductBand
                        id="product-naver"
                        title="Better Life Naver는 네이버 블로그에 글을 올립니다"
                        body="키워드나 상품 주소를 넣으면 글과 이미지 구성을 만들어 네이버 블로그에 예약 발행합니다. 검색 · 홈판 · 쇼핑커넥트 · 사용자 정의 네 가지 모드가 있고, 여러 계정을 차례로 돌릴 수 있습니다."
                        shots={NAVER_SHOTS}
                        clip={clipFor(content, 'naver', { src: '/images/hero-demo.mp4', alt: 'Better Life Naver 자동 발행 장면' })}
                        flip
                    >
                        {naver && <BandPrice product={naver} />}
                        <BandLinks detail="/detail" product={naver} trial />
                    </ProductBand>

                    <ProductBand
                        id="product-orbit"
                        title={'Orbit은 워드프레스\u00a0· 티스토리\u00a0· 블로그스팟을 맡습니다'}
                        body="세 블로그에 글을 쓰고 발행합니다. 여러 키워드를 대기열에 넣어 차례로 올리고, 발행한 글을 바탕으로 외부 유입용 글과 카드뉴스도 만듭니다."
                        shots={ORBIT_SHOTS}
                        clip={clipFor(content, 'orbit', { src: '/images/orbit/orbit-hero-live.mp4', alt: 'Leadernam Orbit 발행 결과 화면' })}
                    >
                        {orbit && <BandPrice product={orbit} />}
                        <BandLinks detail="/orbit" product={orbit} trial />
                    </ProductBand>
                </div>
            </section>

            <section className="pp-section" id="price">
                <div className="pp-wrap">
                    <h2 className="pp-h2">요금 한눈에</h2>
                    <p className="pp-lead">
                        하나만 필요하면 그 제품만 사면 됩니다.
                        {bundleYearly > 0 && yearlyGap > 0 && ` 세 제품을 1년씩 따로 사면 ${won(yearlySum)}원, ${bundle?.name} 1년은 ${won(bundleYearly)}원입니다(모두 부가세 별도).`}
                    </p>
                    <PriceTable products={sellable} />
                    <p className="pp-source">‘부가세 포함’ 표시가 없는 값은 모두 부가세 별도입니다. 값은 상점과 같은 곳에서 읽어 옵니다.</p>
                    <div className="pp-price-cta">
                        <Link to="/pricing" className="pp-btn pp-btn-gold">상점에서 고르기<ArrowRight /></Link>
                        <Link to="/bank-order" className="pp-btn pp-btn-line">계좌이체로 사기<ArrowRight /></Link>
                    </div>
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <ReviewQuotes match={REVIEW_MATCH} exclude={REVIEW_EXCLUDE} title="써 본 분들의 말" />
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <h2 className="pp-h2">자주 묻는 질문</h2>
                    <FaqList items={faqs} />
                    <CloseBand title="필요한 것부터 골라 보세요" primary={{ to: '/pricing', label: '상점에서 고르기' }} secondary={{ to: '/leword', label: 'LEWORD 맛보기' }} />
                </div>
            </section>
        </main>
    );
}

export default ProductsPage;
