import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import ZoomableImage from '../components/ZoomableImage';

const FEATURE_CARDS = [
    { title: '세 플랫폼을 한 화면에서', desc: 'Blogger API, WordPress REST API, Tistory 브라우저 발행 흐름을 같은 제품 안에서 관리합니다.' },
    { title: '콘텐츠 모드 분리', desc: 'SEO, 애드센스, 쇼핑, 내부링크, 페러프레이징 목적에 맞춰 글 구조를 나눕니다.' },
    { title: '이미지 흐름까지 포함', desc: '썸네일, H2 이미지, URL 이미지 수집, CTA 배너를 발행 흐름 안에서 함께 봅니다.' },
    { title: '연속 발행 대기열', desc: '여러 키워드를 한 번에 넣고 진행, 대기, 실패 상태를 순차적으로 확인합니다.' },
];

const FLOW_STEPS = [
    ['01', 'Keyword', '키워드 또는 URL을 입력하고 콘텐츠 방향을 잡습니다.'],
    ['02', 'Generate', '본문, 제목, FAQ, CTA 구간을 생성합니다.'],
    ['03', 'Image', '썸네일과 본문 이미지를 생성하거나 수집합니다.'],
    ['04', 'Publish', '블로그스팟, 워드프레스, 티스토리로 순차 발행합니다.'],
    ['05', 'Link', '종합글과 하위글을 내부링크로 연결합니다.'],
    ['06', 'Traffic', '발행글 기반 외부유입 문안을 만듭니다.'],
];

const SCREENSHOTS = [
    ['키워드 입력', '/images/orbit/orbit-smart-keyword.png', '본문 모드, 이미지 엔진, CTA 설정까지 함께 확인'],
    ['연속 발행', '/images/orbit/orbit-sequential-queue.png', '여러 키워드를 순서대로 처리하고 상태를 추적'],
    ['플랫폼 연동', '/images/orbit/orbit-platform-settings.png', 'Blogger, WordPress, Tistory 연결 정보를 한 화면에서 확인'],
    ['외부유입 생성', '/images/orbit/orbit-external-traffic.png', '공개 글을 기준으로 채널별 보조 문안 생성'],
    ['내부링크', '/images/orbit/orbit-spider-links.png', '종합글과 하위글을 연결하는 거미줄 구조'],
    ['이미지 도구', '/images/orbit/leadernam-orbit-download.png', '썸네일, 배너, 발행용 이미지 흐름 보조'],
];

const TRAFFIC_SHOTS = [
    ['문안 생성', '/images/orbit/orbit-traffic-generate.png', '원본 글 선택 후 유입 글 초안 생성'],
    ['사이트 라이브러리', '/images/orbit/orbit-traffic-sites.png', '공식 링크와 후보 채널 관리'],
    ['활용 흐름', '/images/orbit/orbit-traffic-usage.png', '플랫폼별 톤에 맞는 보조 문안 확인'],
    ['CTA 패턴', '/images/orbit/orbit-traffic-patterns.png', '정보형, 비교형, 마감형 CTA 흐름 점검'],
];

const PERSONAS = [
    '블로그스팟, 워드프레스, 티스토리를 보조 채널로 키우려는 분',
    '네이버블로그 외부유입 동선을 함께 만들고 싶은 분',
    '애드센스형 정보 글과 제휴 글을 반복 운영하는 분',
    '종합글, 하위글, 보조 글을 역할별로 나누고 싶은 분',
    '이미지, CTA, FAQ까지 포함된 발행 흐름이 필요한 분',
    '연속 발행 대기열과 결과 확인을 한 번에 보고 싶은 분',
];

const FAQS = [
    ['Leaders Orbit은 어떤 제품인가요?', '블로그스팟, 워드프레스, 티스토리 발행을 중심으로 본문 생성, 이미지, CTA, 내부링크, 외부유입 문안 흐름을 지원하는 자동화 제품입니다.'],
    ['네이버블로그 자동화와 다른 점은 무엇인가요?', '네이버 자동화는 네이버 채널 운영에 초점을 두고, Orbit은 블로그스팟·워드프레스·티스토리 기반 보조 콘텐츠와 외부유입 동선에 초점을 둡니다.'],
    ['상위노출이나 수익을 보장하나요?', '아닙니다. 검색 결과와 수익은 키워드, 콘텐츠 품질, 도메인 상태, 운영 기간, 플랫폼 정책에 따라 달라집니다.'],
    ['어떤 정보를 먼저 보내면 좋나요?', '사용 PC 환경, 운영 중인 플랫폼, 연결하려는 계정 수, 필요한 기능 범위를 먼저 알려주시면 확인이 빠릅니다.'],
];

type ShotProps = {
    title: string;
    src: string;
    alt: string;
    desc?: string;
    wide?: boolean;
};

function Shot({ title, src, alt, desc, wide = false }: ShotProps) {
    const shotClassName = [
        'orbit-shot',
        wide ? 'orbit-shot-wide' : '',
        src.includes('leadernam-orbit-download') ? 'orbit-shot-contain' : '',
    ].filter(Boolean).join(' ');

    return (
        <figure className={shotClassName}>
            <div className="orbit-shot-bar">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
                <b>{title}</b>
            </div>
            <ZoomableImage className="orbit-zoom-trigger" src={src} alt={alt} title={title} />
            {desc ? <figcaption>{desc}</figcaption> : null}
        </figure>
    );
}

function OrbitPage() {
    useEffect(() => {
        const prev = document.title;
        document.title = 'Leaders Orbit — 블로그스팟·워드프레스·티스토리 자동화';
        return () => { document.title = prev; };
    }, []);

    return (
        <div className="orbit-page">
            <section className="orbit-hero" id="orbit-top">
                <div className="orbit-wrap hero-grid">
                    <div>
                        <p className="orbit-kicker">GLOBAL PUBLISHER</p>
                        <h1>Leaders Orbit</h1>
                        <p className="hero-subtitle">블로그스팟·워드프레스·티스토리를 한 화면에서 운영하는 글로벌 블로그 자동화</p>
                        <p className="hero-copy">
                            키워드 입력, 본문 생성, 이미지 수집, 썸네일과 H2 이미지, CTA 배치, 발행, 내부링크,
                            외부유입 문안까지 실제 운영자가 반복해서 하던 흐름을 하나의 제품 안에 묶었습니다.
                        </p>
                        <div className="orbit-actions">
                            <a className="orbit-btn primary" href="#orbit-workflow">운영 흐름 보기</a>
                            <a className="orbit-btn secondary" href="#orbit-screens">실제 화면 보기</a>
                        </div>
                    </div>
                    <Shot
                        title="Leaders Orbit - Global Publisher"
                        src="/images/orbit/leadernam-orbit-download.png"
                        alt="Leaders Orbit 글로벌 퍼블리셔 대표 이미지"
                        wide
                    />
                </div>
                <div className="orbit-wrap metric-row">
                    <article><b>3 Platforms</b><span>Blogger API + WordPress REST + Tistory</span></article>
                    <article><b>5 Modes</b><span>SEO, 애드센스, 쇼핑, 내부링크, 페러프레이징</span></article>
                    <article><b>Images</b><span>썸네일, 본문 이미지, CTA 배너 흐름</span></article>
                    <article><b>Traffic</b><span>발행글 기반 외부유입 문안 생성</span></article>
                </div>
            </section>

            <section className="orbit-section light">
                <div className="orbit-wrap">
                    <p className="orbit-kicker">WHY IT MATTERS</p>
                    <h2>글을 많이 쓰는 것보다 중요한 건, 글이 서로 이어지는 구조입니다</h2>
                    <p className="section-lead">
                        블로그스팟, 워드프레스, 티스토리는 외부유입, 보조 콘텐츠, 애드센스형 글, 제휴 글을 운영하기 좋지만
                        설정과 발행 흐름이 흩어지면 매번 처음부터 다시 세팅하게 됩니다.
                    </p>
                    <div className="feature-grid">
                        {FEATURE_CARDS.map((item) => (
                            <article className="orbit-card" key={item.title}>
                                <h3>{item.title}</h3>
                                <p>{item.desc}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="orbit-section dark" id="orbit-workflow">
                <div className="orbit-wrap">
                    <p className="orbit-kicker">ORBIT FLOW</p>
                    <h2>키워드에서 공개 발행글까지, 흐름이 끊기지 않게 설계했습니다</h2>
                    <div className="flow-grid">
                        {FLOW_STEPS.map(([num, title, desc]) => (
                            <article className="flow-card" key={num}>
                                <span>{num}</span>
                                <b>{title}</b>
                                <p>{desc}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="orbit-section light">
                <div className="orbit-wrap two-col">
                    <div>
                        <p className="orbit-kicker">ONE SCREEN SETUP</p>
                        <h2>초기 설정값을 유지한 채 단일 발행과 연속 발행을 오갑니다</h2>
                        <p>
                            Leaders Orbit은 키워드 입력창만 있는 도구가 아닙니다. 플랫폼, 콘텐츠 모드, 이미지 정책,
                            썸네일 엔진, CTA, 말투, 제목 옵션을 발행 흐름 안에서 같이 다룹니다.
                        </p>
                        <ul className="check-list">
                            <li>Blogger, WordPress, Tistory 발행 흐름을 같은 화면에서 선택</li>
                            <li>키워드 기반, URL 기반, 이미지 기반 글 생성 흐름 지원</li>
                            <li>본문 모드와 이미지 정책을 발행 전 한 번에 확인</li>
                            <li>대기열에 들어간 글을 1개씩 순차 처리해 실패 지점을 추적</li>
                        </ul>
                    </div>
                    <Shot
                        title="Sequential Publishing"
                        src="/images/orbit/orbit-sequential-queue.png"
                        alt="Leaders Orbit 연속 발행 대기열 화면"
                        desc="여러 키워드를 넣어도 설정값과 진행 상태가 함께 유지되는 연속 발행 대기열"
                    />
                </div>
            </section>

            <section className="orbit-section dark">
                <div className="orbit-wrap">
                    <p className="orbit-kicker">PLATFORM CONNECTION</p>
                    <h2>블로그스팟, 워드프레스, 티스토리 연결 방식은 다르지만, 발행 경험은 하나로 맞췄습니다</h2>
                    <p className="section-lead">
                        Blogger는 Google 계정 인증과 Blog ID를 기준으로, WordPress는 REST API와 Application Password를 기준으로, Tistory는 로그인 세션과 브라우저 발행 흐름을 기준으로 연결합니다.
                    </p>
                    <div className="split-gallery">
                        <Shot title="Platform Settings" src="/images/orbit/orbit-platform-settings.png" alt="블로그스팟 워드프레스 티스토리 플랫폼 연결 설정 화면" desc="플랫폼 연결, 인증 상태, 발행 대상 정보를 한 화면에서 확인" />
                        <Shot title="Blogspot Output" src="/images/orbit/orbit-blogspot.png" alt="블로그스팟 공개 발행글 화면" desc="발행 후 공개 URL에서 본문, CTA, FAQ 구간을 확인" />
                    </div>
                </div>
            </section>

            <section className="orbit-section light" id="orbit-screens">
                <div className="orbit-wrap">
                    <p className="orbit-kicker">REAL PRODUCT SCREENS</p>
                    <h2>제품 설명보다 중요한 실제 화면을 더 많이 보여줍니다</h2>
                    <p className="section-lead">
                        구매자는 “무엇을 할 수 있다”보다 “어디서 어떻게 보이는가”를 보고 판단합니다.
                        실제 앱 화면을 넓게 배치해 발행 전, 발행 중, 발행 후 흐름을 숨기지 않았습니다.
                    </p>
                    <div className="screen-grid">
                        {SCREENSHOTS.map(([title, src, desc]) => (
                            <Shot key={title} title={title} src={src} alt={`${title} 화면`} desc={desc} />
                        ))}
                    </div>
                </div>
            </section>

            <section className="orbit-section dark">
                <div className="orbit-wrap two-col reverse">
                    <Shot title="Published Output" src="/images/orbit/orbit-public-article-body.png" alt="공개 발행글 본문과 이미지 구간" desc="앱 안에서 끝나지 않고 공개 글에서 확인되는 실제 결과물" />
                    <div>
                        <p className="orbit-kicker">PUBLISHED OUTPUT</p>
                        <h2>발행 결과물은 본문, 이미지, 강조 문구, FAQ까지 확인할 수 있어야 합니다</h2>
                        <p>
                            앱 화면만 보여주는 것보다 공개 발행글의 완성 형태를 같이 보여주는 편이 신뢰를 줍니다.
                            Leaders Orbit은 발행된 글에서 이미지, CTA, FAQ가 어떻게 보이는지까지 확인하는 흐름을 전제로 합니다.
                        </p>
                        <div className="mini-gallery">
                            <Shot title="FAQ Top" src="/images/orbit/orbit-public-faq-top.png" alt="공개 글 FAQ 시작 구간" />
                            <Shot title="FAQ Full" src="/images/orbit/orbit-public-faq-full.png" alt="공개 글 FAQ 전체 구간" />
                        </div>
                    </div>
                </div>
            </section>

            <section className="orbit-section light">
                <div className="orbit-wrap">
                    <p className="orbit-kicker">SPIDER LINKING</p>
                    <h2>발행된 글을 그냥 쌓아두지 않고, 종합글과 하위글 구조로 다시 연결합니다</h2>
                    <p className="section-lead">
                        거미줄치기는 이미 발행한 글을 선택해 종합글로 묶고, 하위글에서 다시 핵심 글로 돌아오는 CTA를 넣는 구조입니다.
                    </p>
                    <Shot title="Spider Linking" src="/images/orbit/orbit-spider-links.png" alt="내부링크 거미줄 구성 화면" desc="앱 안에서 기존 글과 종합글 연결 흐름을 구성" wide />
                </div>
            </section>

            <section className="orbit-section dark">
                <div className="orbit-wrap">
                    <p className="orbit-kicker">EXTERNAL TRAFFIC</p>
                    <h2>외부유입 문안은 발행글을 기준으로 만들고, 채널별 톤에 맞게 분리합니다</h2>
                    <p className="section-lead">
                        무리한 자동 게시가 아니라, 사용자가 복사해 자연스럽게 활용할 수 있는 유입 문안을 만드는 데 초점을 둡니다.
                    </p>
                    <Shot title="External Traffic" src="/images/orbit/orbit-external-traffic.png" alt="외부유입 글 생성 모드 전체 화면" wide />
                    <div className="screen-grid compact">
                        {TRAFFIC_SHOTS.map(([title, src, desc]) => (
                            <Shot key={title} title={title} src={src} alt={`${title} 화면`} desc={desc} />
                        ))}
                    </div>
                </div>
            </section>

            <section className="orbit-section light">
                <div className="orbit-wrap">
                    <p className="orbit-kicker">LEADERS PRO ECOSYSTEM</p>
                    <h2>Leaders Orbit은 리더스 프로 올인원 흐름 안에서 더 강해집니다</h2>
                    <p className="section-lead">
                        LEWORD로 키워드를 찾고, 네이버 자동화로 핵심 채널을 운영하고, Leaders Orbit으로 블로그스팟·워드프레스·티스토리 보조 동선을 만듭니다. 기간제 구매자는 올인원 코드 1개로 세 제품을 함께 이용합니다.
                    </p>
                    <div className="logo-wall">
                        <article><img src="/images/orbit/leword-logo.svg" alt="LEWORD 로고" /><b>LEWORD</b><p>검색량, 문서수, 경쟁비율을 보고 키워드 후보를 발굴합니다.</p></article>
                        <article><img src="/images/orbit/leaders-pro-logo.png" alt="리더스 프로 로고" /><b>네이버 자동화</b><p>계정별 대기열, 발행 간격, 콘텐츠 모드를 관리합니다.</p></article>
                        <article><img src="/images/orbit/orbit-logo.png" alt="Leaders Orbit 로고" /><b>Leaders Orbit</b><p>블로그스팟, 워드프레스, 티스토리로 외부유입 보조 글을 발행합니다.</p></article>
                    </div>
                    <div className="split-gallery">
                        <Shot title="LEWORD Keywords" src="/images/orbit/orbit-leword-keywords.png" alt="LEWORD 최신 키워드 발굴 화면" desc="키워드 출발점은 LEWORD에서 잡고" />
                        <Shot title="Naver Automation" src="/images/orbit/orbit-naver-full-auto.png" alt="네이버 자동화 풀오토 발행 화면" desc="네이버 자동화와 Orbit 발행 흐름을 함께 운영" />
                    </div>
                </div>
            </section>

            <section className="orbit-section dark">
                <div className="orbit-wrap">
                    <p className="orbit-kicker">USE CASE</p>
                    <h2>예시 키워드 하나가 종합글, 하위글, 외부유입 글로 확장됩니다</h2>
                    <div className="scenario">
                        <div className="scenario-keyword">
                            <span>예시 중심 키워드</span>
                            <b>다이어트 식단</b>
                            <p>목표: 검색 의도가 다른 글을 역할별로 나누고 서로 연결하기</p>
                        </div>
                        <ol>
                            <li><b>종합글</b><span>다이어트 식단 시작 전 알아야 할 구성 원칙</span></li>
                            <li><b>하위글</b><span>직장인 식단, 저녁 식단, 도시락 식단처럼 세부 글 분리</span></li>
                            <li><b>내부링크</b><span>종합글에서 하위글로, 하위글에서 다시 종합글로 이동</span></li>
                            <li><b>외부유입</b><span>블로그스팟·워드프레스·티스토리 보조 글로 메인 콘텐츠 진입 보완</span></li>
                        </ol>
                    </div>
                </div>
            </section>

            <section className="orbit-section light">
                <div className="orbit-wrap two-col">
                    <div>
                        <p className="orbit-kicker">GOOD FIT</p>
                        <h2>이런 운영자에게 특히 잘 맞습니다</h2>
                        <div className="persona-grid">
                            {PERSONAS.map((persona) => <article key={persona}>{persona}</article>)}
                        </div>
                    </div>
                    <div className="not-fit">
                        <p className="orbit-kicker">NOT FOR</p>
                        <h2>이런 목적에는 맞지 않습니다</h2>
                        <ul>
                            <li>플랫폼 정책을 벗어난 자동 게시를 원하는 경우</li>
                            <li>검색 순위, 방문자 수, 수익을 보장받고 싶은 경우</li>
                            <li>콘텐츠 품질 검토 없이 대량 생산만 원하는 경우</li>
                            <li>운영 주제와 계정 상태를 고려하지 않고 결과만 기대하는 경우</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="orbit-section dark">
                <div className="orbit-wrap">
                    <p className="orbit-kicker">FAQ</p>
                    <h2>자세히 보기 페이지에서 바로 풀어줘야 할 질문들</h2>
                    <div className="faq-grid">
                        {FAQS.map(([q, a]) => (
                            <article key={q}><b>{q}</b><p>{a}</p></article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="orbit-final">
                <div className="orbit-wrap">
                    <p className="orbit-kicker">LEADERS ORBIT</p>
                    <h2>블로그스팟·워드프레스·티스토리를 보조 채널이 아니라 운영 동선으로 쓰고 싶다면</h2>
                    <p>
                        운영 중인 블로그 플랫폼, 연결하려는 계정 수, 필요한 자동화 범위를 보내주세요.
                        Leaders Pro 올인원 흐름 안에서 어떤 방식으로 쓰는 것이 맞는지 안내할 수 있습니다. 개별 구매가 필요하면 영구제만 별도 문의로 가능합니다.
                    </p>
                    <Link className="orbit-btn primary" to="/pricing">올인원 가격표 보기</Link>
                    <p className="safe-note">
                        Leaders Orbit은 플랫폼 정책을 준수하는 범위에서 콘텐츠 운영 흐름을 체계화하는 제품입니다.
                        검색 노출, 방문자 수, 수익, 애드센스 승인은 보장하지 않습니다.
                    </p>
                </div>
            </section>

            <style>{`
                .orbit-page {
                    --ink: #0f172a;
                    --muted: #526273;
                    --line: #d7e1eb;
                    --paper: #ffffff;
                    --bg: #f4f8fb;
                    --dark: #0a1322;
                    --dark2: #172338;
                    --teal: #0f9f8f;
                    --sky: #0ea5e9;
                    --green: #34d399;
                    --amber: #f5c451;
                    background: var(--bg);
                    color: var(--ink);
                }
                .orbit-page * {
                    box-sizing: border-box;
                    letter-spacing: 0;
                    word-break: keep-all;
                    overflow-wrap: anywhere;
                }
                .orbit-wrap {
                    width: min(1180px, calc(100% - 40px));
                    margin: 0 auto;
                }
                .orbit-hero {
                    padding: 104px 0 84px;
                    color: #ffffff;
                    background:
                        linear-gradient(130deg, rgba(15,159,143,.28) 0 16%, transparent 16% 48%, rgba(245,158,11,.16) 48% 64%, transparent 64%),
                        linear-gradient(145deg, #0a1322 0%, #133149 52%, #0f766e 100%);
                }
                .hero-grid, .two-col {
                    display: grid;
                    grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr);
                    gap: 42px;
                    align-items: center;
                }
                .two-col.reverse {
                    grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr);
                }
                .orbit-kicker {
                    display: inline-flex;
                    align-items: center;
                    min-height: 32px;
                    margin: 0 0 18px;
                    padding: 5px 12px;
                    border: 1px solid rgba(14,165,233,.36);
                    border-radius: 999px;
                    background: rgba(14,165,233,.12);
                    color: #bae6fd;
                    font-size: 13px;
                    font-weight: 900;
                }
                .light .orbit-kicker {
                    border-color: rgba(15,159,143,.36);
                    background: rgba(15,159,143,.1);
                    color: #0f766e;
                }
                .orbit-page h1, .orbit-page h2, .orbit-page h3 {
                    margin: 0;
                    line-height: 1.16;
                    font-weight: 900;
                }
                .orbit-page h1 {
                    font-size: 62px;
                }
                .orbit-page h2 {
                    max-width: 920px;
                    font-size: 42px;
                }
                .hero-subtitle {
                    margin: 18px 0 0;
                    color: #e0f2fe;
                    font-size: 26px;
                    line-height: 1.36;
                    font-weight: 900;
                }
                .hero-copy, .dark p, .dark li, .orbit-final p {
                    color: #dbe7f3;
                }
                .hero-copy {
                    max-width: 710px;
                    margin: 24px 0 0;
                    font-size: 18px;
                    line-height: 1.75;
                }
                .section-lead, .light p, .orbit-card p {
                    color: var(--muted);
                    font-size: 18px;
                    line-height: 1.7;
                }
                .orbit-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-top: 28px;
                }
                .orbit-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 48px;
                    padding: 11px 18px;
                    border: 1px solid transparent;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 900;
                    text-decoration: none;
                }
                .orbit-btn.primary {
                    color: #07111f;
                    background: linear-gradient(90deg, var(--green), var(--amber));
                }
                .orbit-btn.secondary {
                    color: #f8fafc;
                    border-color: rgba(255,255,255,.28);
                    background: rgba(255,255,255,.08);
                }
                .orbit-shot {
                    margin: 0;
                    overflow: hidden;
                    border: 1px solid rgba(148,163,184,.28);
                    border-radius: 8px;
                    background: #08111f;
                    box-shadow: 0 18px 46px rgba(15,23,42,.13);
                }
                .orbit-shot-bar {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-height: 42px;
                    padding: 0 14px;
                    background: #111827;
                    color: #cbd5e1;
                    font-size: 13px;
                }
                .dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                }
                .dot.red { background: #ef4444; }
                .dot.yellow { background: #f59e0b; }
                .dot.green { background: #10b981; }
                .orbit-shot img {
                    display: block;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    object-position: top center;
                    aspect-ratio: 16 / 10;
                    transition: transform .24s ease, filter .24s ease;
                }
                .orbit-zoom-trigger {
                    overflow: hidden;
                }
                .orbit-zoom-trigger:hover img,
                .orbit-zoom-trigger:focus-visible img {
                    transform: scale(1.025);
                    filter: brightness(1.08);
                }
                .orbit-shot-wide img {
                    aspect-ratio: 16 / 7;
                }
                .orbit-shot-contain .orbit-zoom-trigger {
                    background: #020617;
                }
                .orbit-shot-contain img,
                .orbit-shot-wide.orbit-shot-contain img {
                    aspect-ratio: 4 / 3;
                    object-fit: contain;
                    object-position: center;
                }
                .orbit-shot figcaption {
                    padding: 14px 16px;
                    color: #e5edf7;
                    background: #111827;
                    font-size: 15px;
                    font-weight: 800;
                }
                .metric-row {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 14px;
                    margin-top: 46px;
                }
                .metric-row article {
                    min-height: 104px;
                    padding: 18px;
                    border: 1px solid rgba(255,255,255,.18);
                    border-radius: 8px;
                    background: rgba(255,255,255,.08);
                }
                .metric-row b {
                    display: block;
                    font-size: 20px;
                }
                .metric-row span {
                    display: block;
                    margin-top: 8px;
                    color: #cfe8f5;
                    font-size: 14px;
                }
                .orbit-section {
                    padding: 92px 0;
                }
                .orbit-section.light {
                    background: var(--bg);
                }
                .orbit-section.dark {
                    color: #ffffff;
                    background:
                        linear-gradient(130deg, rgba(14,165,233,.12) 0 18%, transparent 18% 62%, rgba(245,158,11,.1) 62% 74%, transparent 74%),
                        linear-gradient(150deg, var(--dark), var(--dark2));
                }
                .feature-grid, .screen-grid, .flow-grid, .split-gallery, .logo-wall, .persona-grid, .faq-grid, .mini-gallery {
                    display: grid;
                    gap: 18px;
                    margin-top: 36px;
                }
                .feature-grid {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                }
                .orbit-card, .flow-card, .logo-wall article, .persona-grid article, .faq-grid article, .not-fit {
                    border: 1px solid var(--line);
                    border-radius: 8px;
                    background: var(--paper);
                }
                .orbit-card {
                    min-height: 190px;
                    padding: 24px;
                }
                .orbit-card h3 {
                    font-size: 20px;
                    margin-bottom: 10px;
                }
                .flow-grid {
                    grid-template-columns: repeat(6, minmax(0, 1fr));
                }
                .flow-card {
                    min-height: 210px;
                    padding: 22px 18px;
                    background: rgba(255,255,255,.06);
                    border-color: rgba(148,163,184,.22);
                }
                .flow-card span {
                    display: inline-flex;
                    margin-bottom: 18px;
                    color: #67e8f9;
                    font-size: 14px;
                    font-weight: 900;
                }
                .flow-card b {
                    display: block;
                    color: #ffffff;
                    font-size: 22px;
                }
                .flow-card p {
                    margin: 12px 0 0;
                    color: #dbe7f3;
                    font-size: 15px;
                }
                .check-list, .not-fit ul {
                    display: grid;
                    gap: 12px;
                    margin: 24px 0 0;
                    padding: 0;
                    list-style: none;
                }
                .check-list li, .not-fit li {
                    position: relative;
                    padding-left: 24px;
                    color: var(--muted);
                    font-weight: 800;
                }
                .check-list li::before, .not-fit li::before {
                    content: "";
                    position: absolute;
                    top: 12px;
                    left: 0;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--teal);
                }
                .split-gallery {
                    grid-template-columns: 1.05fr .95fr;
                }
                .screen-grid {
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                }
                .screen-grid.compact {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                }
                .mini-gallery {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                .logo-wall {
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                }
                .logo-wall article {
                    min-height: 300px;
                    padding: 28px 22px;
                    text-align: center;
                }
                .logo-wall img {
                    display: block;
                    width: 132px;
                    height: 132px;
                    margin: 0 auto 20px;
                    object-fit: contain;
                    border: 1px solid var(--line);
                    border-radius: 8px;
                    background: #f8fafc;
                }
                .logo-wall b {
                    display: block;
                    color: var(--ink);
                    font-size: 24px;
                    font-weight: 900;
                }
                .scenario {
                    display: grid;
                    grid-template-columns: .78fr 1.22fr;
                    gap: 22px;
                    margin-top: 38px;
                }
                .scenario-keyword, .scenario ol {
                    margin: 0;
                    border: 1px solid rgba(148,163,184,.24);
                    border-radius: 8px;
                    background: rgba(255,255,255,.06);
                }
                .scenario-keyword {
                    padding: 30px;
                }
                .scenario-keyword span {
                    color: #bae6fd;
                    font-size: 15px;
                    font-weight: 900;
                }
                .scenario-keyword b {
                    display: block;
                    margin-top: 12px;
                    color: #ffffff;
                    font-size: 42px;
                    line-height: 1.15;
                }
                .scenario ol {
                    display: grid;
                    padding: 0;
                    list-style: none;
                }
                .scenario li {
                    display: grid;
                    grid-template-columns: 140px 1fr;
                    gap: 16px;
                    padding: 22px 24px;
                    border-bottom: 1px solid rgba(148,163,184,.2);
                }
                .scenario li:last-child {
                    border-bottom: 0;
                }
                .scenario li b {
                    color: #ffffff;
                }
                .persona-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                .persona-grid article {
                    min-height: 92px;
                    display: flex;
                    align-items: center;
                    padding: 20px;
                    color: var(--ink);
                    font-weight: 900;
                }
                .not-fit {
                    padding: 28px;
                    background: #ffffff;
                }
                .not-fit .orbit-kicker {
                    color: #0f766e;
                    border-color: rgba(15,159,143,.36);
                    background: rgba(15,159,143,.1);
                }
                .not-fit h2 {
                    font-size: 34px;
                }
                .not-fit li::before {
                    background: #f59e0b;
                }
                .faq-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                .faq-grid article {
                    min-height: 170px;
                    padding: 24px;
                    background: rgba(255,255,255,.06);
                    border-color: rgba(148,163,184,.22);
                }
                .faq-grid b {
                    display: block;
                    color: #ffffff;
                    font-size: 20px;
                    line-height: 1.35;
                }
                .faq-grid p {
                    margin: 10px 0 0;
                    color: #dbe7f3;
                    font-size: 15px;
                }
                .orbit-final {
                    padding: 92px 0;
                    color: #ffffff;
                    background:
                        linear-gradient(135deg, rgba(245,158,11,.18), transparent 34%),
                        linear-gradient(135deg, #0a1322 0%, #0f766e 100%);
                }
                .orbit-final h2 {
                    max-width: 980px;
                    font-size: 42px;
                }
                .orbit-final p {
                    max-width: 900px;
                    font-size: 18px;
                    line-height: 1.72;
                }
                .safe-note {
                    margin-top: 28px;
                    color: #cfe8f5;
                    font-size: 14px !important;
                }
                @media (max-width: 1100px) {
                    .flow-grid {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }
                    .feature-grid, .screen-grid, .screen-grid.compact {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (max-width: 900px) {
                    .hero-grid, .two-col, .two-col.reverse, .split-gallery, .scenario {
                        grid-template-columns: 1fr;
                    }
                    .metric-row, .logo-wall {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (max-width: 680px) {
                    .orbit-wrap {
                        width: min(100% - 28px, 1180px);
                    }
                    .orbit-hero, .orbit-section, .orbit-final {
                        padding: 58px 0;
                    }
                    .orbit-page h1 {
                        font-size: 38px;
                    }
                    .orbit-page h2, .orbit-final h2 {
                        font-size: 30px;
                    }
                    .hero-subtitle {
                        font-size: 21px;
                    }
                    .hero-copy, .section-lead, .light p, .orbit-final p {
                        font-size: 16px;
                    }
                    .metric-row, .feature-grid, .flow-grid, .screen-grid, .screen-grid.compact, .logo-wall, .persona-grid, .faq-grid, .mini-gallery {
                        grid-template-columns: 1fr;
                    }
                    .orbit-actions {
                        flex-direction: column;
                    }
                    .orbit-btn {
                        width: 100%;
                    }
                    .scenario li {
                        grid-template-columns: 1fr;
                        gap: 6px;
                    }
                    .orbit-shot img, .orbit-shot-wide img {
                        aspect-ratio: 4 / 3;
                    }
                }
            `}</style>
        </div>
    );
}

export default OrbitPage;
