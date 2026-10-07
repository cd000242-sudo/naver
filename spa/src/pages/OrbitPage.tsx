import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import ProductPageStyles from '../components/products/ProductPageStyles';
import OrbitExtras from '../components/products/OrbitExtras';
import {
    CloseBand, FaqList, FeatureBand, HeroActions, PriceBlock, ProofStrip, ReviewQuotes, VsPanel, useProduct,
} from '../components/products/ProductBlocks';
import { ArrowRight } from '../components/products/ProductIcons';
import { won } from '../lib/productCatalog';

/*
 * Leadernam Orbit 상세(2026-10-07 리디자인 — 시안 1 "비교로 증명").
 * 첫 화면은 "블로그마다 따로 vs Orbit 한 번에" 비교 판. 화면 캡처는 /images/orbit/ 의 실제 Orbit 화면만 쓴다.
 * 추정치 · 지어낸 통계 · 옛 구매 안내(올인원 전용 · 개별 구매 문의)를 쓰지 않는다 — Orbit 은 상점에서 단품으로 산다.
 */

// Orbit(워드프레스 · 티스토리 · 블로그스팟 발행)을 실제로 써 보고 남긴 후기만.
// 2026-10-07 기준 세 플랫폼 말이 든 후기 3건은 모두 Orbit 후기가 아니다(옛 무료 GPTs · 네이버 제품 · "개발해 주세요" 요청) → exclude.
const REVIEW_MATCH = /orbit|오르빗|(티스토리|워드프레스|블로그스팟|블로거).{0,20}(발행|자동)/i;
const REVIEW_EXCLUDE = /무료|개발해\s*주세요|gpts|애드포스트/i;

const VS_THEIRS = [
    '워드프레스 · 티스토리 · 블로그스팟에 하나씩 들어가 글을 따로 올린다',
    '키워드마다 글 쓰고, 이미지 찾고, 발행 버튼을 누른다',
    '지난 글은 블로그마다 찾아서 링크를 손으로 건다',
    '홍보 글은 올릴 곳마다 새로 쓴다',
];

const VS_OURS = [
    { text: '한 화면에서 플랫폼만 고르면 발행', edge: '세 블로그 연결은 처음 한 번만' },
    { text: '키워드 여러 개도 한 편씩 차례로 발행', edge: '이미지 · 자주 묻는 질문까지 함께' },
    { text: '지난 글을 골라 통합글 한 편으로 묶기', edge: '거미줄치기 통합글' },
    { text: '발행한 글 하나로 외부 유입용 글 초안', edge: '카드뉴스도 같은 프로그램에서' },
];

const BANDS = [
    {
        title: '키워드 하나 넣으면, 올릴 글이 됩니다',
        body: '키워드나 참고할 글 주소를 넣으면 제목과 본문을 만들고 이미지를 붙여 워드프레스 · 티스토리 · 블로그스팟에 올립니다. 글의 목적(검색용 · 애드센스 · 쇼핑 · 내부 연결)과 말투, 제목 옵션은 발행 전에 한 화면에서 고릅니다.',
        tabs: ['키워드로 생성', 'URL로 생성', '콘텐츠 모드', '말투 · 제목 옵션'],
        shot: { src: '/images/orbit/orbit-smart-keyword.png', mobileSrc: '/images/orbit/m/orbit-smart-keyword.webp', alt: 'Leadernam Orbit 스마트 키워드 입력 화면 — 단일 발행 · 키워드로 생성 · URL 이미지 자동 수집', caption: '스마트 키워드 입력 · 실제 화면' },
    },
    {
        title: '여러 편은 대기열에, 한 편씩 차례로',
        body: '키워드를 줄바꿈으로 여러 개 넣으면 대기열에 쌓이고, 정해 둔 간격(분)마다 한 편씩 발행합니다. 한 번에 몰아서 올리지 않고 순서대로 처리하니, 멈춘 곳이 있으면 어디인지 바로 보입니다.',
        tabs: ['연속 발행', '대기열', '발행 간격'],
        shot: { src: '/images/orbit/orbit-sequential-queue.png', mobileSrc: '/images/orbit/m/orbit-sequential-queue.webp', alt: 'Leadernam Orbit 연속 발행 화면 — 키워드 3개 입력 · 대기열 · 연속 발행 간격', caption: '연속 발행 대기열 · 실제 화면' },
        flip: true,
    },
    {
        title: '블로그 연결은 처음 한 번만',
        body: '블로그스팟은 구글 계정 인증과 블로그 ID로, 워드프레스는 앱 비밀번호로, 티스토리는 로그인으로 연결합니다. 연결 방식은 저마다 달라도 한 번 해 두면 발행할 때는 플랫폼만 고르면 됩니다.',
        tabs: ['블로그 플랫폼', 'API 키', '원클릭 세팅'],
        shot: { src: '/images/orbit/orbit-platform-settings.png', mobileSrc: '/images/orbit/m/orbit-platform-settings.webp', alt: 'Leadernam Orbit 환경 설정 — 블로그 플랫폼 탭 · Blogger 설정', caption: '환경 설정 · 블로그 플랫폼 · 실제 화면' },
    },
    {
        title: '이미 쓴 글을 묶어 한 편의 통합글로',
        body: '발행한 글을 목록에서 최대 5개 고르면, 글마다 핵심을 뽑아 엮은 통합글을 만들어 발행합니다. 흩어져 있던 지난 글이 한 편을 중심으로 서로 이어집니다.',
        tabs: ['거미줄치기 통합글', '목록에서 불러오기', '미리보기 · 발행'],
        shot: { src: '/images/orbit/orbit-spider-links.png', mobileSrc: '/images/orbit/m/orbit-spider-links.webp', alt: 'Leadernam Orbit 거미줄치기 통합글 만들기 화면 — 글 주소 입력 · 선택한 글 · 통합글 생성', caption: '거미줄치기 통합글 · 실제 화면' },
        flip: true,
    },
    {
        title: '발행한 글 하나로, 외부 유입용 글까지',
        body: '발행한 글을 고르면 네이버 블로그 · 블로그스팟 · 워드프레스 · 핀터레스트에 맞는 유입용 글 초안을 만듭니다. 자동으로 올리지는 않습니다. 자동 게시는 플랫폼 규정에 걸려 계정이 막힐 수 있어서, 복사와 바로가기 버튼으로 직접 붙여 넣게 했습니다.',
        tabs: ['글 생성', '사이트 모음', '사용량 · 비용', '패턴 · 동의'],
        shot: { src: '/images/orbit/orbit-external-traffic.png', mobileSrc: '/images/orbit/m/orbit-external-traffic.webp', alt: 'Leadernam Orbit 외부유입 글 생성 화면 — 원본 글 선택 · 플랫폼별 초안 · 복사 · 바로가기', caption: '외부유입 글 생성 · 실제 화면' },
    },
    {
        title: '올라간 글은 이렇게 보입니다',
        body: '본문 이미지와 강조 문구, 아래쪽 자주 묻는 질문까지 실제 공개된 글에 그대로 들어갑니다. 앱 화면이 아니라 독자가 보는 결과물입니다.',
        shot: { src: '/images/orbit/orbit-public-article-body.png', mobileSrc: '/images/orbit/m/orbit-public-article-body.webp', alt: 'Leadernam Orbit 로 발행한 공개 글 — 본문 이미지 · 강조 문구', caption: 'Orbit 으로 발행한 공개 글 · 실제 화면' },
        flip: true,
    },
];

const ALL_FEATURES: Array<[string, string]> = [
    ['세 블로그 발행', '워드프레스 · 티스토리 · 블로그스팟에 같은 프로그램에서 올립니다.'],
    ['키워드 · URL로 글 만들기', '키워드나 참고할 글 주소를 넣으면 제목과 본문을 만듭니다.'],
    ['콘텐츠 모드', '검색용 · 애드센스 · 쇼핑 · 내부 연결처럼 목적에 맞춰 글 구조를 나눕니다.'],
    ['이미지 붙이기', '썸네일과 소제목 이미지를 만들거나, 참고 글 주소에서 이미지를 모아 붙입니다.'],
    ['연속 발행 대기열', '여러 키워드를 정해 둔 간격마다 한 편씩 차례로 발행합니다.'],
    ['발행한 글 관리', '지난 글을 목록에서 불러와 다시 고르고 묶습니다.'],
    ['거미줄치기 통합글', '지난 글 최대 5개의 핵심을 엮어 통합글 한 편으로 만들어 발행합니다.'],
    ['외부 유입용 글 · 홍보', '발행한 글로 채널별 유입 글 초안을 만들고, 복사 · 바로가기로 직접 올립니다.'],
    ['카드뉴스 만들기', '홍보에 쓸 카드뉴스도 같은 프로그램에서 만듭니다.'],
    ['환경 설정 한 창', 'API 키 · 블로그 플랫폼 · 원클릭 세팅을 한 창에서 관리합니다.'],
];

function OrbitPage() {
    const product = useProduct('orbit');
    const monthly = product?.prices.monthly || 39000;
    const hasLifetime = (product?.prices.lifetime || 0) > 0;

    useEffect(() => {
        const prev = document.title;
        document.title = 'Leadernam Orbit — 워드프레스 · 티스토리 · 블로그스팟 한 번에';
        return () => { document.title = prev; };
    }, []);

    const faqs: Array<[string, string]> = [
        ['어떤 블로그에 올릴 수 있나요?', '워드프레스 · 티스토리 · 블로그스팟(구글 블로거) 세 곳입니다. 네이버 블로그 발행은 Better Life Naver가 맡습니다.'],
        ['사기 전에 써 볼 수 있나요?', '네. 다운로드 페이지에서 프로그램을 받아 30일 동안 하루 3편까지 무료로 써 볼 수 있습니다.'],
        ['설치해야 하나요?', '네. Orbit은 PC에 설치해서 쓰는 프로그램입니다. 다운로드 페이지에서 받습니다.'],
        ['외부 유입용 글은 자동으로 올라가나요?', '아니요. 초안을 만들고 복사 · 바로가기 버튼만 드립니다. 자동 게시는 플랫폼 규정에 걸려 계정이 막힐 위험이 커서, 직접 붙여 넣는 방식으로 만들었습니다.'],
        ['키워드는 어떻게 고르나요?', '쓰고 싶은 키워드를 직접 넣으면 됩니다. 검색량과 문서수를 재서 쓸 키워드를 고르고 싶다면 키워드 도구 LEWORD를 함께 쓰면 좋습니다. LEWORD는 상점에서 따로 사는 단품입니다.'],
        ['상위 노출이나 수익을 보장하나요?', '아니요. 검색 노출과 수익은 키워드, 글 품질, 블로그 상태, 운영 기간, 플랫폼 정책에 따라 달라집니다.'],
        ['요금은 어떻게 되나요?', `월 ${won(monthly)}원부터이고, 1년${hasLifetime ? ' · 영구' : ''} 이용권도 있습니다. 모두 부가세 별도이며 상점에서 Orbit만 따로 살 수 있습니다.`],
    ];

    return (
        <main className="pp pp-orbit">
            <ProductPageStyles />
            <OrbitExtras />
            <section className="pp-hero">
                <div className="pp-wrap">
                    <div className="pp-hero-grid">
                        <div>
                            <h1>블로그마다<br />따로 하던 일,<br /><em>Orbit 한 번에</em></h1>
                            <p className="pp-hero-sub">워드프레스 · 티스토리 · 블로그스팟 발행부터 지난 글 정리, 외부 유입용 글까지 한 프로그램에서 합니다</p>
                            <HeroActions primary={{ to: '/download', label: '30일 무료 체험' }} secondary={{ to: '/pricing', label: `월 ${won(monthly)}원으로 시작` }} />
                        </div>
                        <VsPanel
                            label="블로그마다 따로 할 때와 Leadernam Orbit 으로 할 때 비교"
                            chip={<>
                                <span>30일 무료 체험</span><i aria-hidden />
                                <span>하루 <b>3</b>편까지</span><i aria-hidden />
                                <span>블로그 <b>3</b>곳 한 번에</span>
                            </>}
                            theirsTitle="블로그마다 따로"
                            oursTitle="Leadernam Orbit"
                            theirs={VS_THEIRS}
                            ours={VS_OURS}
                            foot="Leadernam Orbit 실제 기능 기준"
                        />
                    </div>
                    <ProofStrip items={[
                        { to: '/reviews', title: '구매 후기', desc: '실제 구매자가 남긴 후기', icon: 'review' },
                        { to: '/reviews', title: '수익 인증', desc: '사용자가 올린 블로그 수익 인증', icon: 'income' },
                        { to: '/download', title: '30일 무료 체험', desc: 'PC 프로그램 · 하루 3편까지', icon: 'devices' },
                    ]} />
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <h2 className="pp-h2">쓰고, 올리고, 묶고, 알리기까지</h2>
                    <p className="pp-lead">글 한 편 올리는 데서 끝나지 않습니다. 여러 편을 차례로 올리고, 지난 글을 묶고, 밖에서 사람을 데려올 글까지 한 프로그램에서 이어집니다.</p>
                    {BANDS.map((band) => <FeatureBand key={band.title} {...band} />)}
                </div>
            </section>

            <section className="pp-section">
                <div className="pp-wrap">
                    <h2 className="pp-h2">이용권 하나에 다 들어 있습니다</h2>
                    <p className="pp-lead">기능을 단계별로 잠그지 않습니다. Orbit 이용권이 있으면 아래가 전부 열립니다.</p>
                    <ul className="pp-all" role="list">
                        {ALL_FEATURES.map(([name, desc]) => <li key={name}><b>{name}</b><span>{desc}</span></li>)}
                    </ul>
                    <div className="pp-orbit-pair">
                        <div>
                            <h3>무엇을 쓸지는 LEWORD, 올리는 일은 Orbit</h3>
                            <p>Orbit은 글을 만들어 올리고 관리하는 도구입니다. 검색량과 문서수를 재서 쓸 키워드를 고르는 일은 키워드 도구 LEWORD가 합니다. 두 제품은 따로 삽니다.</p>
                            <Link to="/leword-detail" className="pp-more">LEWORD 자세히 보기<ArrowRight /></Link>
                        </div>
                        <ul className="pp-orbit-roles" role="list">
                            <li><b>LEWORD</b><span>될 만한 키워드 · 글감 · 제목을 찾고 글 한 편을 설계합니다.</span></li>
                            <li className="ours"><b>Leadernam Orbit</b><span>워드프레스 · 티스토리 · 블로그스팟에 글을 만들어 올리고, 묶고, 알립니다.</span></li>
                            <li><b>Better Life Naver</b><span>네이버 블로그 글쓰기와 발행을 맡습니다.</span></li>
                        </ul>
                    </div>
                </div>
            </section>

            {product && (
                <section className="pp-section" id="price">
                    <div className="pp-wrap">
                        <h2 className="pp-h2">요금</h2>
                        <p className="pp-lead">상점에서 Orbit만 따로 삽니다. 사기 전에 30일 동안 하루 3편까지 무료로 써 볼 수 있습니다.</p>
                        <PriceBlock product={product} cta={{ to: '/pricing', label: 'Orbit 담으러 가기' }} />
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
                    <CloseBand title="블로그 세 곳, 이제 한 번에" primary={{ to: '/download', label: '30일 무료 체험' }} secondary={{ to: '/pricing', label: `월 ${won(monthly)}원으로 시작` }} />
                </div>
            </section>
        </main>
    );
}

export default OrbitPage;
