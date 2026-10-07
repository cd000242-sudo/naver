import { useEffect } from 'react';
import ProductPageStyles from '../components/products/ProductPageStyles';
import {
    AdsenseVsPanel, CloseBand, CompareBars, FaqList, FeatureBand, HeroActions, PriceBlock, ProofStrip, ReviewQuotes, useProduct,
} from '../components/products/ProductBlocks';
import { useAdsenseVs } from '../components/products/useAdsenseVs';
import { won } from '../lib/productCatalog';

/*
 * LEWORD 상세(2026-10-07 리디자인 — 시안 1 "고수보다 한 수 위, 비교로 증명").
 * 첫 화면은 애드센스 고수 판의 실제 카드 하나: 고수 제목 vs LEWORD 제목 + 나은 점 + 실측.
 * 화면 캡처는 실제 /leword 각 탭(2026-10-07). 추정치 · 지어낸 통계 · 영구제 안내를 쓰지 않는다.
 */

// 키워드 조회 · 리서치를 말한 후기만. 옛 무료판 · 영구제 · "글을 써 준다"는 후기는 지금 LEWORD 와 다른 기대를 준다.
const REVIEW_MATCH = /키워드\s*(조회|리서치|툴)|연관키워드|leword|리워드|키워드마스터/i;
const REVIEW_EXCLUDE = /무료(버전|일\s*때|로 풀|\s*키워드)|영구제|html로 작성|글도 쉽게 쓰/i;

const BANDS = [
    {
        title: '오늘 쓸 키워드는 이미 재 놓았습니다',
        body: '검색량은 붙었는데 블로그 글은 적은 말을, 매일 검색결과를 직접 열어 확인하고 남깁니다. 지금 뜨는 이슈 가운데 아직 글이 적은 틈새도 따로 모읍니다.',
        tabs: ['리더남 전용 황금키워드', '실검 틈새키워드', '오늘의 네이버 추천키워드'],
        shot: { src: '/images/leword/product/golden-board.webp', mobileSrc: '/images/leword/product/m/golden-board.webp', alt: 'LEWORD 리더남 전용 황금키워드 화면 — 오늘 확인 · 최근 7일 · 전체 보관', caption: '리더남 전용 황금키워드 · 실제 화면' },
    },
    {
        title: '고수가 지금 쓰는 소재, 그보다 나은 제목',
        body: '홈판 고수와 애드센스 고수 블로그가 요즘 올리는 글을 모아 소재와 제목을 보여 줍니다. LEWORD 제목에는 고수 글이 다루지 않은 점이 한 줄씩 붙습니다.',
        tabs: ['리더남 홈판 추천 소재 · 제목', '애드센스 고수 벤치마크'],
        shot: { src: '/images/leword/product/homefeed.webp', mobileSrc: '/images/leword/product/m/homefeed.webp', alt: 'LEWORD 홈판 추천 소재 · 제목 화면', caption: '리더남 홈판 추천 소재 · 제목 · 실제 화면' },
        flip: true,
    },
    {
        title: '키워드 하나를 넣으면 숫자부터 나옵니다',
        body: 'PC와 모바일 검색량, 블로그 문서수, 최근 30일 흐름, 이어지는 확장 키워드까지 한 화면에 나옵니다. 점수를 지어내지 않고 잰 숫자만 씁니다.',
        tabs: ['키워드 분석'],
        shot: { src: '/images/leword/product/analyzer.webp', mobileSrc: '/images/leword/product/m/analyzer.webp', alt: 'LEWORD 키워드 분석 화면 — 월 검색량 · PC · 모바일 · 블로그 문서수', caption: '키워드 분석 · 실제 화면' },
    },
    {
        title: '찾는 데서 끝나지 않고, 한 편을 설계합니다',
        body: '이 키워드로 이길 수 있는지, 1페이지에 없는 틀의 제목, 사람들이 최근 14일 동안 실제로 물은 것, 광고 단가까지 한 번에 잽니다.',
        tabs: ['글 한 편 유입 설계실', '지식인 황금질문', '외부유입 레이더'],
        shot: { src: '/images/leword/product/post-plan.webp', mobileSrc: '/images/leword/product/m/post-plan.webp', alt: 'LEWORD 글 한 편 유입 설계실 화면 — 이길 수 있나 · 검색용 제목', caption: '글 한 편 유입 설계실 · 실제 화면' },
        flip: true,
    },
    {
        title: '쓸거리가 떨어지지 않게',
        body: '지금 일어난 일, 곧 다가올 일, 늘 찾는 일로 나눈 글감을 매일 채웁니다. 근거 기사와 날짜가 함께 붙어 있어 무엇을 왜 써야 하는지 바로 보입니다.',
        tabs: ['오늘의 글감', '유튜브 급상승 글감', '제휴 황금키워드'],
        shot: { src: '/images/leword/product/briefs.webp', mobileSrc: '/images/leword/product/m/briefs.webp', alt: 'LEWORD 오늘의 글감 화면', caption: '오늘의 글감 · 실제 화면' },
    },
];

const ALL_TABS: Array<[string, string]> = [
    ['리더남 전용 황금키워드', '검색량은 붙고 문서수는 적은 키워드를 매일 검색결과를 열어 확인해 고릅니다.'],
    ['실검 틈새키워드', '지금 뜨는 이슈 가운데 아직 블로그 글이 적은 말만 남깁니다.'],
    ['리더남 홈판 추천 소재 · 제목', '홈판 고수 블로그가 요즘 쓰는 소재와, 그보다 나은 제목을 보여 줍니다.'],
    ['애드센스 고수 벤치마크', '애드센스 고수 글의 구조와 검색용 제목, 고수보다 나은 점을 붙여 줍니다.'],
    ['오늘의 네이버 추천키워드', '네이버 블로그 32개 주제별로 오늘 쓸 키워드를 표로 정리합니다.'],
    ['오늘의 글감', '지금 · 곧 · 늘 찾는 일로 나눈 글감을 근거 기사와 날짜와 함께 줍니다.'],
    ['키워드 분석', 'PC · 모바일 검색량, 블로그 문서수, 30일 흐름, 확장 키워드를 한 번에 봅니다.'],
    ['글 한 편 유입 설계실', '이길 수 있는지, 쓸 제목, 최근 14일 실제 질문, 광고 단가를 한 번에 잽니다.'],
    ['지식인 황금질문', '답을 달면 내 글로 사람을 데려올 수 있는 지식인 질문을 찾습니다.'],
    ['제휴 황금키워드', '제휴 상품 이름 대신, 사람들이 실제로 검색하는 필요의 말을 찾아 줍니다.'],
    ['유튜브 급상승 글감', '유튜브에서 갑자기 오르는 주제를 블로그 글감으로 옮겨 줍니다.'],
    ['외부유입 레이더', '카페 · 지식인 · 구글에 최근 올라온 질문 중 내 글로 데려올 자리를 찾습니다.'],
    ['노출 추적', '블로그 주소 하나로 발행한 글 전체의 노출 · 누락 · 순위를 직접 셉니다.'],
    ['내 API 키', '내 키를 넣으면 내 몫으로 조회해 횟수 제한 없이 씁니다.'],
];

function LewordDetailPage() {
    const sample = useAdsenseVs();
    const product = useProduct('leword');
    const monthly = product?.prices.monthly || 19900;

    useEffect(() => {
        const prev = document.title;
        document.title = 'LEWORD — 고수보다 한 수 위의 키워드 · 제목';
        return () => { document.title = prev; };
    }, []);

    const faqs: Array<[string, string]> = [
        ['설치해야 하나요?', '아니요. 사이트에서 로그인만 하면 바로 씁니다. PC 앱도 있어서, 앱을 켜 두면 내 컴퓨터에서 잰 결과(1페이지 자리 확인 등)가 같은 화면에 더 붙습니다.'],
        ['사기 전에 써 볼 수 있나요?', '네. 로그인하지 않아도 황금키워드 상위 5건과 실검 틈새 3건을 볼 수 있습니다. 나머지 탭은 이용권이 있어야 열립니다.'],
        ['글도 써 주나요?', '아니요. LEWORD는 무엇을 쓸지 찾고 설계하는 도구입니다. 글 쓰기와 발행은 Better Life Naver(네이버) · Leadernam Orbit(워드프레스 · 티스토리 · 블로그스팟)이 맡습니다.'],
        ['숫자는 어디서 오나요?', '검색량은 네이버 검색광고 조회값, 문서수는 블로그 검색결과, 1페이지 자리는 검색결과를 직접 열어 확인한 값입니다. 예상 수익이나 노출 확률 같은 추정치는 보여 드리지 않습니다.'],
        ['요금은 어떻게 되나요?', `월 ${won(monthly)}원(부가세 포함 · 30일마다 자동결제) 또는 1년 이용권이 있습니다. 영구제는 판매하지 않습니다 — 매일 새로 재는 도구라 수집 비용이 매달 나가기 때문입니다.`],
        ['여러 곳에서 동시에 쓸 수 있나요?', '한 계정은 사이트 1곳과 PC 앱 1곳에서 동시에 쓸 수 있습니다. 먼저 쓰고 있는 쪽이 우선입니다.'],
    ];

    return (
        <main className="pp">
            <ProductPageStyles />
            <section className="pp-hero">
                <div className="pp-wrap">
                    <div className="pp-hero-grid">
                        <div>
                            <h1>고수 블로그보다<br />한 수 위의 제목,<br /><em>오늘 바로</em></h1>
                            <p className="pp-hero-sub">실제로 재서 찾은 키워드와,<br />고수 제목을 넘는 제목만 남깁니다</p>
                            <HeroActions primary={{ to: '/leword', label: '맛보기 시작' }} secondary={{ to: '/pricing', label: `월 ${won(monthly)}원으로 시작` }} />
                        </div>
                        <AdsenseVsPanel sample={sample} />
                    </div>
                    <ProofStrip items={[
                        { to: '/reviews', title: '구매 후기', desc: '실제 구매자가 남긴 후기', icon: 'review' },
                        { to: '/reviews', title: '수익 인증', desc: '사용자가 올린 블로그 수익 인증', icon: 'income' },
                        { to: '/download', title: '웹 · PC 앱', desc: '웹에서 바로, PC 앱도 있어요', icon: 'devices' },
                    ]} />
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <h2 className="pp-h2">찾아 주고, 설계까지</h2>
                    <p className="pp-lead">키워드를 조회만 하는 도구가 아닙니다. 될 만한 키워드와 글감과 제목을 먼저 찾아 오고, 글 한 편의 설계까지 이어 줍니다.</p>
                    {BANDS.map((band) => <FeatureBand key={band.title} {...band} />)}
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <h2 className="pp-h2">탭 14개가 이용권 하나에 다 들어 있습니다</h2>
                    <p className="pp-lead">단계별로 기능을 잠그지 않습니다. 이용권이 있으면 아래가 전부 열립니다.</p>
                    <ul className="pp-all" role="list">
                        {ALL_TABS.map(([name, desc]) => <li key={name}><b>{name}</b><span>{desc}</span></li>)}
                    </ul>
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <h2 className="pp-h2">같은 값에 훨씬 많이</h2>
                    <p className="pp-lead">검증된 키워드 도구는 단계마다 기능과 조회량이 나뉩니다. LEWORD는 한 가지 요금으로 14개 탭을 전부 엽니다.</p>
                    <CompareBars
                        rows={[
                            { name: '블랙키위', low: 13800, high: 89100, note: '30일 · 3단계' },
                            { name: '판다랭크', low: 19800, high: 99000, note: '월 · 3단계' },
                            { name: 'LEWORD', low: monthly, high: monthly, ours: true, note: '월 · 한 가지, 전 기능' },
                        ]}
                        source={`각 사 공식 요금 페이지 표시가 기준(2026-10-07 확인). LEWORD 월 ${won(monthly)}원은 부가세 포함입니다.`}
                    />
                </div>
            </section>

            {product && (
                <section className="pp-section" id="price">
                    <div className="pp-wrap">
                        <h2 className="pp-h2">요금</h2>
                        <p className="pp-lead">영구제는 판매하지 않습니다. 매일 새로 재는 도구라 수집 비용이 매달 나가기 때문입니다.</p>
                        <PriceBlock product={product} cta={{ to: '/pricing', label: 'LEWORD 담으러 가기' }} />
                    </div>
                </section>
            )}

            <section className="pp-section">
                <div className="pp-wrap">
                    <ReviewQuotes match={REVIEW_MATCH} exclude={REVIEW_EXCLUDE} title="써 본 분들의 말" />
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <h2 className="pp-h2">자주 묻는 질문</h2>
                    <FaqList items={faqs} />
                    <CloseBand title="오늘 쓸 키워드부터 보세요" primary={{ to: '/leword', label: '맛보기 시작' }} secondary={{ to: '/pricing', label: `월 ${won(monthly)}원으로 시작` }} />
                </div>
            </section>
        </main>
    );
}

export default LewordDetailPage;
