import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import ParticlesCanvas from '../components/ParticlesCanvas';

type Chatbot = {
    category: string;
    title: string;
    subtitle: string;
    desc: string;
    bestFor: string[];
    url: string;
    accent: 'gold' | 'blue' | 'green' | 'purple' | 'rose';
};

const CHATBOTS: Chatbot[] = [
    {
        category: '초안 작성',
        title: 'ALL OVER GOD GPTS',
        subtitle: '리더남 블로그 초안 프롬프트',
        desc: '블로그 초안 작성에 초점을 맞춘 아이디어 확장형 챗봇입니다. 주제를 넓히고 글의 방향을 잡을 때 사용하기 좋습니다.',
        bestFor: ['블로그 글 초안', '아이디어 확장', '정보성 글 구성'],
        url: 'https://chatgpt.com/g/g-6898187006ec8191b8e3617a94efe0ba-sangwi-1-all-over-god-gpts-leadernam',
        accent: 'gold',
    },
    {
        category: '애드센스',
        title: '애드센스 키워드 도우미',
        subtitle: '카테고리별 키워드 발굴',
        desc: '애드센스 승인 글을 준비할 때 카테고리 기준으로 키워드 후보를 넓게 뽑아보는 챗봇입니다.',
        bestFor: ['승인 글 카테고리 선정', '키워드 후보 100개 이상 발굴', '주제 방향 정리'],
        url: 'https://chatgpt.com/g/g-682528d677908191a1c9b7e71c181709-edeusenseu-kiweodeu-doumi',
        accent: 'green',
    },
    {
        category: '애드센스',
        title: '애드센스 승인 글쓰기 전문가',
        subtitle: '승인용 글 작성 보조',
        desc: '키워드를 넣고 승인용 글 초안을 만드는 챗봇입니다. 영어 초안이 먼저 나오면 안내에 따라 진행하면 됩니다.',
        bestFor: ['애드센스 승인 글 초안', '키워드 기반 글쓰기', '구조화된 정보 글'],
        url: 'https://chatgpt.com/g/g-68075a10c7c08191841f0d4255fd2a07-seungin-geulsseugi-jeonmunga',
        accent: 'green',
    },
    {
        category: '애드센스',
        title: '사람처럼 경험글 변환기',
        subtitle: 'AI 느낌 줄이는 경험형 문장 변환',
        desc: '작성한 글을 사람의 경험이 들어간 문장처럼 다듬는 챗봇입니다. 승인 여부를 보장하지는 않지만 글의 자연스러움을 높이는 데 도움됩니다.',
        bestFor: ['AI 문장 자연화', '경험형 문장 보강', '승인 글 최종 다듬기'],
        url: 'https://chatgpt.com/g/g-67fdb02274d88191ab9c4ed51b909b91-seungin-haegsim-saramceoreom-gyeongheomgeul-byeonhwangi',
        accent: 'rose',
    },
    {
        category: '글로벌 블로그',
        title: 'LEADERNAM TOP BLOG GPTS',
        subtitle: '워드프레스·티스토리·블로그스팟 글쓰기',
        desc: '워드프레스, 티스토리, 블로그스팟에 붙여 넣기 좋은 HTML 기반 글을 만들 때 사용하는 챗봇입니다.',
        bestFor: ['워드프레스 글', '티스토리 글', '블로그스팟 HTML 글'],
        url: 'https://chatgpt.com/g/g-67f61d189538819186d7d3606ba7a484-leadernam-top-blog-gpts',
        accent: 'blue',
    },
    {
        category: '네이버',
        title: '네이버 SEO 노출 글쓰기',
        subtitle: '네이버 검색 노출형 글 작성',
        desc: '뉴스 기사나 상위노출 글의 구조를 참고해 네이버 SEO에 맞춘 제목과 글 방향을 잡는 챗봇입니다.',
        bestFor: ['네이버 SEO 글', '제목 후보 3개', '정보성 글 재구성'],
        url: 'https://chatgpt.com/g/g-68229c4ff3fc8191a8a6cdc75e965197-rideonam-neibeo-hompideu-nocul-geulsseugi-ggeutpanwang',
        accent: 'purple',
    },
    {
        category: '네이버',
        title: '네이버 홈판 노출글 마스터',
        subtitle: '홈피드·홈판 노출형 글 작성',
        desc: '네이버 홈피드 흐름에 맞춰 글을 재구성하고 제목을 다듬는 챗봇입니다. 자동화 앱과 함께 쓰면 초안 품질을 더 빠르게 끌어올릴 수 있습니다.',
        bestFor: ['홈피드용 글', '클릭되는 제목', '상위 글 재구성'],
        url: 'https://chatgpt.com/g/g-690e9d56e48081918978d24af5fd3445-neibeo-hompan-noculgeul-maseuteo',
        accent: 'purple',
    },
    {
        category: '외부유입',
        title: '외부유입 전용글 생성기',
        subtitle: '외부 채널용 보조 글 작성',
        desc: '작성한 글 링크를 넣으면 외부유입용 보조 글의 방향을 잡아줍니다. 하단에는 본인 링크를 자연스럽게 연결해 사용하세요.',
        bestFor: ['외부유입 글', '보조 채널 문안', '링크 연결용 글'],
        url: 'https://chatgpt.com/g/g-690c2f9764408191b9048cda1144c221-oebuyuib-jeonyonggeul-saengseonggi',
        accent: 'blue',
    },
    {
        category: '지식인',
        title: '전문 지식인 답변봇',
        subtitle: '질문 맞춤형 답변 작성',
        desc: '질문 내용을 붙여 넣으면 답변 초안을 만들어줍니다. 홍보성 답변은 피하고, 질문자에게 실제로 도움이 되는 내용 중심으로 사용하세요.',
        bestFor: ['질문 답변 초안', '전문형 답변', '블로그 링크 보조'],
        url: 'https://chatgpt.com/g/g-67f45a6b3990819193c23bc4636d68ba-jeonmun-jisigin-dabbyeonbos',
        accent: 'gold',
    },
];

const FLOWS = [
    ['애드센스 승인 준비', '키워드 도우미 → 승인 글쓰기 전문가 → 경험글 변환기'],
    ['네이버 글 작성', '상위 글 내용 참고 → SEO/홈판 챗봇 → 제목 선택 후 본문 작성'],
    ['외부유입 운영', '원본 글 작성 → 외부유입 전용글 생성기 → 채널별 문안 배포'],
];

const accentMap: Record<Chatbot['accent'], string> = {
    gold: 'linear-gradient(135deg, #f4c95d, #d4a012)',
    blue: 'linear-gradient(135deg, #38bdf8, #2563eb)',
    green: 'linear-gradient(135deg, #44d7b6, #16a34a)',
    purple: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
    rose: 'linear-gradient(135deg, #fb7185, #e11d48)',
};

function ChatbotsPage() {
    useEffect(() => {
        const prev = document.title;
        document.title = '무료 챗봇 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });
        document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    return (
        <>
            <ParticlesCanvas />
            <main className="chatbots-page">
                <section className="chatbots-hero">
                    <div className="chatbots-wrap chatbots-hero-grid">
                        <div>
                            <span className="chatbots-kicker">FREE CHATBOTS</span>
                            <h1>무료 챗봇 모음</h1>
                            <p>
                                블로그 초안, 애드센스 승인 글, 네이버 노출 글, 외부유입 글까지 바로 사용할 수 있는
                                리더남 GPTs를 한곳에 정리했습니다.
                            </p>
                            <div className="chatbots-actions">
                                <a className="chatbots-btn primary" href="#chatbots-list">챗봇 바로가기</a>
                                <Link className="chatbots-btn secondary" to="/pricing">자동화 툴 보기</Link>
                            </div>
                        </div>
                        <aside className="chatbots-notice" aria-label="사용 전 안내">
                            <b>사용 전 꼭 확인하세요</b>
                            <ul>
                                <li>아래 링크와 프롬프트 구성은 무단 복제 및 재배포를 금지합니다.</li>
                                <li>구매자 전용 오픈채팅방과 사용법 영상은 공지사항에서 확인해주세요.</li>
                                <li>초안이나 키워드를 넣을 때 마지막에 “100% 지침대로 해줘”라고 요청하면 결과가 더 안정적입니다.</li>
                                <li>문제가 있으면 단톡방에서 리더남을 찾거나 1:1 문의를 이용해주세요.</li>
                            </ul>
                        </aside>
                    </div>
                </section>

                <section className="chatbots-section light">
                    <div className="chatbots-wrap">
                        <div className="chatbots-section-head fade-in">
                            <span className="chatbots-kicker">RECOMMENDED FLOW</span>
                            <h2>이 순서대로 쓰면 더 편합니다</h2>
                            <p>처음 쓰는 분들도 목적에 맞게 바로 시작할 수 있도록 추천 흐름을 정리했습니다.</p>
                        </div>
                        <div className="flow-grid">
                            {FLOWS.map(([title, desc]) => (
                                <article className="flow-card fade-in" key={title}>
                                    <strong>{title}</strong>
                                    <p>{desc}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="chatbots-list" className="chatbots-section dark">
                    <div className="chatbots-wrap">
                        <div className="chatbots-section-head fade-in">
                            <span className="chatbots-kicker">GPTS LINKS</span>
                            <h2>원하는 챗봇을 바로 실행하세요</h2>
                            <p>각 버튼을 누르면 ChatGPT의 해당 GPTs 페이지가 새 창으로 열립니다.</p>
                        </div>
                        <div className="chatbot-grid">
                            {CHATBOTS.map((bot) => (
                                <article className="chatbot-card fade-in" key={bot.url}>
                                    <div className="chatbot-card-top">
                                        <span style={{ background: accentMap[bot.accent] }}>{bot.category}</span>
                                        <small>무료 GPTs</small>
                                    </div>
                                    <h3>{bot.title}</h3>
                                    <strong>{bot.subtitle}</strong>
                                    <p>{bot.desc}</p>
                                    <div className="chatbot-tags">
                                        {bot.bestFor.map((item) => <em key={item}>{item}</em>)}
                                    </div>
                                    <a className="chatbots-btn launch" href={bot.url} target="_blank" rel="noopener noreferrer">
                                        챗봇 사용하기
                                    </a>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="chatbots-section light">
                    <div className="chatbots-wrap">
                        <div className="chatbots-section-head fade-in">
                            <span className="chatbots-kicker">SAFE USE</span>
                            <h2>답변은 그대로 쓰기보다 한 번 더 확인하세요</h2>
                            <p>GPTs는 글쓰기 보조 도구입니다. 승인, 노출, 수익을 보장하지 않으며 최종 판단과 수정은 사용자에게 있습니다.</p>
                        </div>
                        <div className="guide-panel fade-in">
                            <div>
                                <b>좋은 사용법</b>
                                <p>키워드, 대상 독자, 글 목적, 원하는 톤을 함께 넣고 마지막에 “100% 지침대로 해줘”를 붙여주세요.</p>
                            </div>
                            <div>
                                <b>주의할 점</b>
                                <p>외부 채널이나 지식인 답변에는 과도한 홍보를 피하고, 질문자에게 도움이 되는 내용 중심으로 사용해주세요.</p>
                            </div>
                            <div>
                                <b>문의 위치</b>
                                <p>문제가 생기면 구매자 단톡방 또는 1:1 문의가 가장 빠릅니다. 사이트 문의는 확인이 늦을 수 있습니다.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="chatbots-final">
                    <div className="chatbots-wrap">
                        <span className="chatbots-kicker">SPECIAL EVENT</span>
                        <h2>LEWORD 키워드 마스터와 네이버 자동화 툴도 함께 써보세요</h2>
                        <p>챗봇으로 초안을 잡고, Leaders Pro 자동화 툴로 키워드 발굴과 발행 흐름을 더 빠르게 이어갈 수 있습니다.</p>
                        <div className="chatbots-actions center">
                            <Link className="chatbots-btn primary" to="/products">제품정보 보기</Link>
                            <Link className="chatbots-btn secondary" to="/download">다운로드</Link>
                        </div>
                    </div>
                </section>
            </main>

            <style>{`
                .chatbots-page {
                    position: relative;
                    z-index: 1;
                    color: #f8fafc;
                    background: rgba(5, 8, 12, 0.58);
                }

                .chatbots-wrap {
                    width: min(1180px, calc(100% - 48px));
                    margin: 0 auto;
                }

                .chatbots-hero {
                    min-height: 700px;
                    display: flex;
                    align-items: center;
                    padding: 118px 0 70px;
                    background: linear-gradient(135deg, rgba(8, 13, 18, 0.88), rgba(17, 54, 67, 0.80) 54%, rgba(55, 43, 17, 0.76));
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }

                .chatbots-hero-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 0.98fr) minmax(360px, 0.82fr);
                    gap: 46px;
                    align-items: center;
                }

                .chatbots-kicker {
                    display: inline-flex;
                    align-items: center;
                    min-height: 28px;
                    padding: 5px 12px;
                    border: 1px solid rgba(244, 201, 93, 0.45);
                    border-radius: 8px;
                    background: rgba(244, 201, 93, 0.10);
                    color: #f4c95d;
                    font-size: 12px;
                    font-weight: 900;
                    letter-spacing: 0;
                }

                .chatbots-hero h1 {
                    margin: 18px 0;
                    font-size: 52px;
                    line-height: 1.1;
                    letter-spacing: 0;
                }

                .chatbots-hero p,
                .chatbots-section-head p,
                .chatbots-final p {
                    color: rgba(255,255,255,0.76);
                    font-size: 17px;
                    line-height: 1.75;
                }

                .chatbots-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-top: 30px;
                }

                .chatbots-actions.center {
                    justify-content: center;
                }

                .chatbots-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 46px;
                    padding: 12px 20px;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 900;
                    text-decoration: none;
                    transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
                }

                .chatbots-btn:hover {
                    transform: translateY(-2px);
                }

                .chatbots-btn.primary,
                .chatbots-btn.launch {
                    border: 1px solid rgba(244, 201, 93, 0.7);
                    background: #f4c95d;
                    color: #071018;
                }

                .chatbots-btn.secondary {
                    border: 1px solid rgba(255,255,255,0.20);
                    background: rgba(255,255,255,0.08);
                    color: #ffffff;
                }

                .chatbots-notice {
                    padding: 24px;
                    border: 1px solid rgba(255,255,255,0.14);
                    border-radius: 8px;
                    background: rgba(8, 13, 18, 0.72);
                    box-shadow: 0 24px 70px rgba(0,0,0,0.32);
                    backdrop-filter: blur(12px);
                }

                .chatbots-notice b {
                    display: block;
                    font-size: 20px;
                    margin-bottom: 16px;
                    color: #ffffff;
                }

                .chatbots-notice ul,
                .chatbot-card ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }

                .chatbots-notice li {
                    position: relative;
                    padding-left: 18px;
                    color: rgba(255,255,255,0.72);
                    font-size: 14px;
                    line-height: 1.7;
                    margin-bottom: 10px;
                }

                .chatbots-notice li::before,
                .chatbot-card p::before {
                    content: "";
                    position: absolute;
                    left: 0;
                    top: 11px;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #44d7b6;
                }

                .chatbots-section {
                    padding: 86px 0;
                }

                .chatbots-section.light {
                    background: rgba(248, 250, 252, 0.96);
                    color: #0f172a;
                }

                .chatbots-section.dark {
                    background: rgba(7, 16, 24, 0.94);
                    color: #f8fafc;
                }

                .chatbots-section-head {
                    text-align: center;
                    max-width: 760px;
                    margin: 0 auto 42px;
                }

                .chatbots-section-head h2,
                .chatbots-final h2 {
                    margin: 14px 0 12px;
                    font-size: 38px;
                    line-height: 1.2;
                    letter-spacing: 0;
                }

                .chatbots-section.light .chatbots-section-head p,
                .chatbots-section.light .flow-card p,
                .chatbots-section.light .guide-panel p {
                    color: #526173;
                }

                .flow-grid,
                .guide-panel {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 18px;
                }

                .flow-card,
                .guide-panel > div {
                    min-height: 180px;
                    padding: 24px;
                    border-radius: 8px;
                    border: 1px solid rgba(15, 23, 42, 0.10);
                    background: #ffffff;
                    box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
                }

                .flow-card strong,
                .guide-panel b {
                    display: block;
                    font-size: 20px;
                    color: #0f172a;
                    margin-bottom: 10px;
                }

                .flow-card p,
                .guide-panel p {
                    font-size: 14px;
                    line-height: 1.75;
                }

                .chatbot-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 18px;
                }

                .chatbot-card {
                    display: flex;
                    flex-direction: column;
                    min-height: 430px;
                    padding: 22px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(255,255,255,0.06);
                }

                .chatbot-card-top {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    margin-bottom: 16px;
                }

                .chatbot-card-top span {
                    display: inline-flex;
                    min-height: 26px;
                    align-items: center;
                    padding: 5px 10px;
                    border-radius: 8px;
                    color: #071018;
                    font-size: 12px;
                    font-weight: 900;
                }

                .chatbot-card-top small {
                    color: rgba(255,255,255,0.52);
                    font-size: 12px;
                }

                .chatbot-card h3 {
                    color: #ffffff;
                    font-size: 24px;
                    line-height: 1.25;
                    margin-bottom: 8px;
                    letter-spacing: 0;
                }

                .chatbot-card > strong {
                    display: block;
                    color: #f4c95d;
                    font-size: 15px;
                    margin-bottom: 12px;
                }

                .chatbot-card p {
                    position: relative;
                    padding-left: 18px;
                    color: rgba(255,255,255,0.72);
                    font-size: 14px;
                    line-height: 1.7;
                    margin-bottom: 18px;
                }

                .chatbot-tags {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                    margin: auto 0 20px;
                }

                .chatbot-tags em {
                    display: inline-flex;
                    padding: 6px 9px;
                    border-radius: 8px;
                    background: rgba(255,255,255,0.08);
                    color: rgba(255,255,255,0.72);
                    font-size: 12px;
                    font-style: normal;
                }

                .chatbots-btn.launch {
                    width: 100%;
                }

                .chatbots-final {
                    padding: 84px 0 96px;
                    text-align: center;
                    background: linear-gradient(135deg, rgba(6, 95, 70, 0.94), rgba(10, 16, 24, 0.96) 58%, rgba(87, 66, 18, 0.90));
                    border-top: 1px solid rgba(255,255,255,0.10);
                }

                .chatbots-final .chatbots-wrap {
                    max-width: 780px;
                }

                @media (max-width: 980px) {
                    .chatbots-hero-grid,
                    .flow-grid,
                    .guide-panel,
                    .chatbot-grid {
                        grid-template-columns: 1fr 1fr;
                    }

                    .chatbots-hero-grid {
                        align-items: stretch;
                    }
                }

                @media (max-width: 640px) {
                    .chatbots-wrap {
                        width: min(100% - 28px, 1180px);
                    }

                    .chatbots-hero {
                        min-height: auto;
                        padding: 96px 0 48px;
                    }

                    .chatbots-hero-grid,
                    .flow-grid,
                    .guide-panel,
                    .chatbot-grid {
                        grid-template-columns: 1fr;
                    }

                    .chatbots-hero h1 {
                        font-size: 36px;
                    }

                    .chatbots-section {
                        padding: 62px 0;
                    }

                    .chatbots-section-head h2,
                    .chatbots-final h2 {
                        font-size: 28px;
                    }

                    .chatbots-hero p,
                    .chatbots-section-head p,
                    .chatbots-final p {
                        font-size: 15px;
                    }

                    .chatbots-actions,
                    .chatbots-actions.center {
                        display: grid;
                        grid-template-columns: 1fr;
                    }

                    .chatbots-btn {
                        width: 100%;
                    }
                }
            `}</style>
        </>
    );
}

export default ChatbotsPage;
