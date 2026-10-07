import { useEffect } from 'react';
import ProductPageStyles from '../components/products/ProductPageStyles';
import {
    CloseBand, FaqList, FeatureBand, HeroActions, PriceBlock, ProofStrip, ReviewQuotes, VsPanel, useProduct,
} from '../components/products/ProductBlocks';
import { DetailExtrasStyles, LewordCompanion, NaverProofShots } from '../components/products/DetailExtras';
import { won } from '../lib/productCatalog';

/*
 * Better Life Naver 상세(2026-10-07 리디자인 — 시안 1 "고수보다 한 수 위, 비교로 증명").
 * 첫 화면은 "직접 할 때 vs Better Life Naver" 비교 판. 기능은 이전 페이지 · 상점 카탈로그에 있던 사실만,
 * 화면은 실제 발행 결과 캡처(/images/naver-detail). 사용자 수 · 발행 수 · 별점 · "N시간 절약" · 예상 수익 같은
 * 확인할 수 없는 숫자와 "무조건 환불" · "AI 탐지 우회" 같은 약속은 지웠다. 가격은 useProduct 로만 읽는다.
 */

// 네이버 자동화(홈판 · 풀오토 · 사람 같은 글)를 말한 후기만.
// GPTs · 무료판 · 체험권 · 영구제 · 다른 제품(티스토리 · 워드프레스 · 키워드 조회 · 지식인) · 수익 장담 후기는 지금 사실과 다른 기대를 준다.
const REVIEW_MATCH = /홈판|홈피드|자동화|예약\s*발행|풀오토|자동으로\s*(올라|발행)|사진\s*크롤링|사람(이|같은)/;
const REVIEW_EXCLUDE = /gpts|gems|무료|체험권|영구제|애드센스\s*승인|티스토리|워드프레스|키워드\s*(조회|툴)|leword|지식인|일 방문자 만명|본전|월 100/i;

const BANDS = [
    {
        title: '목적에 맞는 글 구조로 씁니다',
        body: '키워드나 URL을 넣고 모드를 고르면, 그 목적에 맞는 제목 · 소제목 · 본문 흐름으로 씁니다. 모바일에서 읽기 쉽게 문단을 나누고 중요한 문장만 하이라이트합니다.',
        tabs: ['SEO 모드', '홈판 모드', '네이버 메이트', '쇼핑커넥트', '업체홍보 · 사용자정의', '표 자동 삽입'],
        shot: { src: '/images/naver-detail/content-format-highlight.png', mobileSrc: '/images/naver-detail/m/content-format-highlight.webp', alt: 'Better Life Naver로 발행한 글 — 문단 정리와 핵심 문장 하이라이트', caption: '문단 정리 · 핵심 문장 하이라이트 · 실제 발행 글' },
    },
    {
        title: '이미지는 글 흐름에 맞춰 들어갑니다',
        body: '소제목과 문맥에 맞는 이미지를 AI로 만들거나, URL에서 대표 · 추가 이미지를 모아 씁니다. 원하는 소제목에는 내가 고른 이미지를 먼저 넣고, 제목 글자는 대표 썸네일에만 넣습니다.',
        tabs: ['AI 이미지 생성', 'URL 이미지 수집', '소제목별 이미지 지정', '썸네일 제목 글자'],
        shot: { src: '/images/naver-detail/shopping-result-cta.png', mobileSrc: '/images/naver-detail/m/shopping-result-cta.webp', alt: 'Better Life Naver로 발행한 글 — 본문 이미지와 CTA 배너', caption: '본문 이미지 · CTA 배너 · 실제 발행 글' },
        flip: true,
    },
    {
        title: '쇼핑커넥트 글은 상품 정보부터 읽습니다',
        body: '상품 링크를 넣으면 상품명 · 가격 · 대표 이미지 · 장단점을 읽어 글로 바꿉니다. 제품 정보 표, CTA 배너, 상품 카드를 고른 위치에 붙입니다.',
        tabs: ['쿠팡 파트너스', '네이버 쇼핑커넥트', '제품 정보 표', 'CTA 위치 선택', '상품 카드'],
        shot: { src: '/images/naver-detail/shopping-result-link-card.png', mobileSrc: '/images/naver-detail/m/shopping-result-link-card.webp', alt: 'Better Life Naver로 발행한 쇼핑커넥트 글 — 할인가 확인 버튼과 상품 카드', caption: '할인가 확인 버튼 · 상품 카드 · 실제 발행 글' },
    },
    {
        title: '마무리까지 채운 뒤 올립니다',
        body: '본문 뒤에 관련 이전글 카드와 해시태그를 붙여, 읽던 사람이 내 블로그 안에서 다음 글로 넘어가게 합니다.',
        tabs: ['이전글 엮기', '해시태그'],
        shot: { src: '/images/naver-detail/previous-post-hashtags.png', mobileSrc: '/images/naver-detail/m/previous-post-hashtags.webp', alt: 'Better Life Naver로 발행한 글 — 이전글 카드와 해시태그', caption: '이전글 카드 · 해시태그 · 실제 발행 글' },
        flip: true,
    },
];

const PUBLISH_FEATURES: Array<[string, string]> = [
    ['반자동 모드', '글은 내가 확인하고, 이미지 넣기와 발행 흐름은 앱이 처리합니다.'],
    ['풀오토 모드', '키워드나 URL만 넣으면 글 · 이미지 · 발행까지 한 번에 진행합니다.'],
    ['예약 발행', '날짜와 시간을 정해 두면 그때 올립니다.'],
    ['연속 발행', '자기 전에 여러 편을 세팅해 두면 간격을 두고 차례로 올립니다.'],
    ['발행 한도 관리', '정해 둔 발행 한도 안에서만 올립니다.'],
    ['다중계정 발행', '계정마다 설정을 따로 두고, 계정별로 차례로 발행합니다.'],
    ['댓글 크롤링과 응답', '내 글에 달린 댓글을 모아 보고 응답합니다.'],
    ['임시저장', '바로 올리지 않고 임시저장해 두었다가, 확인한 뒤 발행할 수 있습니다.'],
    ['글 톤 · 문체 고르기', '전문적 · 친근한 · 경험담처럼 글의 말투를 고릅니다.'],
    ['이메일 고객 지원', '막히는 곳은 이메일로 물어보시면 답해 드립니다.'],
];

function DetailPage() {
    const product = useProduct('naver');
    const prices = product?.prices;
    const startLabel = prices?.monthly ? `월 ${won(prices.monthly)}원으로 시작` : '요금 보기';

    useEffect(() => {
        const prev = document.title;
        document.title = 'Better Life Naver — 키워드 하나로 네이버 블로그 발행까지';
        return () => { document.title = prev; };
    }, []);

    const priceAnswer = prices?.monthly && prices?.yearly
        ? `1개월 ${won(prices.monthly)}원 · 1년 ${won(prices.yearly)}원${prices.lifetime ? ` · 영구제 ${won(prices.lifetime)}원` : ''}이고, 모두 부가세 별도입니다. 상점에서 Better Life Naver만 따로 담아 사시면 됩니다.`
        : '상점(요금 페이지)에서 기간별 값을 확인하고 Better Life Naver만 따로 담아 사시면 됩니다.';

    const faqs: Array<[string, string]> = [
        ['설치해야 하나요?', '네. Better Life Naver는 PC에 설치해서 쓰는 앱입니다. 다운로드 페이지에서 받아 설치하고, 구매 후 받은 라이선스 코드를 넣으면 됩니다.'],
        ['사기 전에 써 볼 수 있나요?', '네. 앱을 설치하면 30일 동안 하루 3편까지 무료로 써 볼 수 있습니다.'],
        ['글을 바로 올리지 않고 확인할 수 있나요?', '네. 반자동 모드로 글을 먼저 확인하거나, 임시저장해 두었다가 발행할 수 있습니다. 끝까지 맡기고 싶으면 풀오토 모드를 쓰면 됩니다.'],
        ['계정 여러 개를 같이 돌릴 수 있나요?', '네. 다중계정 발행으로 계정마다 설정을 따로 두고, 계정별로 차례로 발행합니다.'],
        ['워드프레스나 티스토리에도 올리나요?', '아니요. Better Life Naver는 네이버 블로그용입니다. 워드프레스 · 티스토리 · 블로그스팟은 Leadernam Orbit이 맡습니다.'],
        ['어떤 키워드로 쓸지도 정해 주나요?', 'Better Life Naver는 넣은 키워드나 URL로 글을 씁니다. 될 만한 키워드를 찾는 일은 키워드 도구 LEWORD가 전문이고, LEWORD는 상점에서 따로 살 수 있습니다.'],
        ['요금은 어떻게 되나요?', priceAnswer],
        ['환불되나요?', '라이선스 코드를 받은 뒤 7일 안에, 프로그램에 한 번도 로그인 · 사용하지 않았다면 전액 환불됩니다. 자세한 조건은 환불정책 페이지에 있습니다.'],
    ];

    return (
        <main className="pp">
            <ProductPageStyles />
            <DetailExtrasStyles />
            <section className="pp-hero">
                <div className="pp-wrap">
                    <div className="pp-hero-grid">
                        <div>
                            <h1>쓰고, 꾸미고, 올리는 일을<br /><em>키워드 하나로</em></h1>
                            <p className="pp-hero-sub">제목과 본문, 이미지, 표, 해시태그까지 채워 네이버 블로그에 예약 발행합니다</p>
                            <HeroActions primary={{ to: '/download', label: '30일 무료 체험' }} secondary={{ to: '/pricing', label: startLabel }} />
                        </div>
                        <VsPanel
                            label="네이버 블로그 글 한 편 — 직접 할 때와 Better Life Naver 비교"
                            chip={<>
                                <span>30일 무료 체험</span><i aria-hidden />
                                <span>하루 <b>3</b>편까지</span><i aria-hidden />
                                <span>설치형 PC 앱</span>
                            </>}
                            theirsTitle="직접 할 때"
                            oursTitle="Better Life Naver"
                            theirs={[
                                '키워드를 잡고 제목 · 본문을 처음부터 씁니다',
                                '이미지를 찾거나 만들어 소제목마다 넣습니다',
                                '글마다 들어가 발행 시간을 맞춥니다',
                            ]}
                            ours={[
                                { text: '키워드나 URL 하나로 제목 · 본문을 씁니다', edge: 'SEO · 홈판 · 쇼핑커넥트 모드별 구조' },
                                { text: '글 흐름에 맞춰 이미지를 만들거나 모아 넣습니다', edge: '소제목별 지정 · 썸네일에만 제목 글자' },
                                { text: '예약 · 연속 발행에 발행 한도까지 관리합니다', edge: '계정별 설정 · 차례로 발행' },
                            ]}
                            foot="Better Life Naver PC 앱 기능 기준"
                        />
                    </div>
                    <ProofStrip items={[
                        { to: '/reviews', title: '구매 후기', desc: '실제 구매자가 남긴 후기', icon: 'review' },
                        { to: '/reviews', title: '수익 인증', desc: '사용자가 올린 블로그 수익 인증', icon: 'income' },
                        { to: '/download', title: 'PC 앱 설치', desc: '내려받아 30일 무료 체험', icon: 'devices' },
                    ]} />
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <h2 className="pp-h2">글 한 편이 이렇게 나옵니다</h2>
                    <p className="pp-lead">아래 화면은 모두 Better Life Naver로 발행한 실제 글입니다. 글 구조, 표, 이미지, 상품 정보, 마무리까지 앱이 채웁니다.</p>
                    {BANDS.map((band) => <FeatureBand key={band.title} {...band} />)}
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <h2 className="pp-h2">발행까지 앱 하나로</h2>
                    <p className="pp-lead">글을 확인하고 올릴지, 끝까지 맡길지 고를 수 있습니다. 발행 일정과 계정, 댓글까지 한 앱에서 다룹니다.</p>
                    <ul className="pp-all" role="list">
                        {PUBLISH_FEATURES.map(([name, desc]) => <li key={name}><b>{name}</b><span>{desc}</span></li>)}
                    </ul>
                    <LewordCompanion />
                </div>
            </section>

            {product && (
                <section className="pp-section" id="price">
                    <div className="pp-wrap">
                        <h2 className="pp-h2">요금</h2>
                        <p className="pp-lead">30일 무료 체험(하루 3편)으로 먼저 써 보고 고르셔도 됩니다. Better Life Naver만 따로 살 수 있습니다.</p>
                        <PriceBlock product={product} cta={{ to: '/pricing', label: 'Better Life Naver 담으러 가기' }} />
                    </div>
                </section>
            )}

            <section className="pp-section">
                <div className="pp-wrap">
                    <ReviewQuotes match={REVIEW_MATCH} exclude={REVIEW_EXCLUDE} title="써 본 분들의 말" />
                    <NaverProofShots />
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <h2 className="pp-h2">자주 묻는 질문</h2>
                    <FaqList items={faqs} />
                    <CloseBand title="오늘 한 편부터 맡겨 보세요" primary={{ to: '/download', label: '30일 무료 체험' }} secondary={{ to: '/pricing', label: startLabel }} />
                </div>
            </section>
        </main>
    );
}

export default DetailPage;
