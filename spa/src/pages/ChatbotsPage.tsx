import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ParticlesCanvas from '../components/ParticlesCanvas';
import { fetchSiteContent, type SiteContent } from '../lib/siteOps';

const FLOWS = [
    ['글쓰기 준비', '주제와 키워드 선택 → 대상 독자와 글의 목적 정리'],
    ['제미나이로 시작', '글쓰기 프롬프트 선택 → 초안 작성 → 사실 확인 후 내 글로 다듬기'],
];

/** 관리자 설정이 없을 때 사용하는 제미나이 기본 안내 */
const GEMINI_DEFAULTS = {
    title: '무료 제미나이 챗봇',
    desc: '부티크 인포의 글쓰기 프롬프트 탭에서 제미나이 전용 챗봇을 바로 사용합니다.',
    url: 'https://www.boutique-info.com/?page=prompt',
    cta: '사용하러 가기',
};

function ChatbotsPage() {
    const [siteContent, setSiteContent] = useState<SiteContent | null>(null);

    useEffect(() => {
        fetchSiteContent().then(setSiteContent).catch(() => { /* 폴백으로 충분 */ });
    }, []);

    useEffect(() => {
        const prev = document.title;
        document.title = '무료 제미나이 챗봇 — Leaders Pro';
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

    const tGemini = { ...GEMINI_DEFAULTS, ...siteContent?.chatbots?.gemini };

    return (
        <>
            <ParticlesCanvas />
            <main className="chatbots-page">
                <section className="chatbots-hero">
                    <div className="chatbots-wrap chatbots-hero-grid">
                        <div>
                            <span className="chatbots-kicker">FREE GEMINI CHATBOT</span>
                            <h1>무료 제미나이 챗봇</h1>
                            <p>
                                글쓰기의 시작을 도와줄 제미나이 챗봇을 만나보세요.
                                부티크 인포에서 글쓰기 프롬프트를 선택해 바로 시작할 수 있습니다.
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
                                <li>주제와 키워드, 대상 독자, 원하는 글의 방향을 함께 입력해주세요.</li>
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
                            <span className="chatbots-kicker">GEMINI</span>
                            <h2>제미나이로 글쓰기를 시작하세요</h2>
                            <p>아래 카드를 누르면 부티크 인포의 글쓰기 프롬프트 페이지로 이동합니다.</p>
                        </div>

                        <div className="hub-grid">
                            <a className="hub-tile fade-in" href={tGemini.url} target="_blank" rel="noopener noreferrer">
                                <div className="hub-tile-top">
                                    <span className="hub-emoji">✨</span>
                                    <span className="hub-badge purple">바로 사용</span>
                                </div>
                                <h3>{tGemini.title}</h3>
                                <p>{tGemini.desc}</p>
                                <span className="hub-cta">{tGemini.cta} →</span>
                            </a>

                        </div>
                    </div>
                </section>

                <section className="chatbots-section light">
                    <div className="chatbots-wrap">
                        <div className="chatbots-section-head fade-in">
                            <span className="chatbots-kicker">SAFE USE</span>
                            <h2>답변은 그대로 쓰기보다 한 번 더 확인하세요</h2>
                            <p>제미나이 챗봇은 글쓰기 보조 도구입니다. 승인, 노출, 수익을 보장하지 않으며 최종 판단과 수정은 사용자에게 있습니다.</p>
                        </div>
                        <div className="guide-panel fade-in">
                            <div>
                                <b>좋은 사용법</b>
                                <p>키워드, 대상 독자, 글 목적, 원하는 톤을 함께 넣어 요청해주세요.</p>
                            </div>
                            <div>
                                <b>주의할 점</b>
                                <p>초안에 담긴 수치와 출처를 확인하고, 직접 경험하지 않은 일을 경험담으로 쓰지 않도록 다듬어주세요.</p>
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

                .hub-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr);
                    max-width: 720px;
                    margin: 0 auto;
                }
                .hub-tile {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 10px;
                    padding: 30px 30px 26px;
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(255, 255, 255, 0.10);
                    border-radius: 18px;
                    text-align: left;
                    text-decoration: none;
                    color: inherit;
                    cursor: pointer;
                    font: inherit;
                    transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
                }
                .hub-tile:hover {
                    transform: translateY(-4px);
                    border-color: rgba(244, 201, 93, 0.45);
                    box-shadow: 0 14px 44px rgba(0, 0, 0, 0.45);
                }
                .hub-tile-top {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    width: 100%;
                }
                .hub-emoji { font-size: 2.1rem; line-height: 1; }
                .hub-badge {
                    padding: 5px 12px;
                    border-radius: 999px;
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: #f4c95d;
                    background: rgba(244, 201, 93, 0.12);
                    border: 1px solid rgba(244, 201, 93, 0.35);
                }
                .hub-badge.purple { color: #c4b5fd; background: rgba(139, 92, 246, 0.14); border-color: rgba(167, 139, 250, 0.4); }
                .hub-tile h3 { margin: 6px 0 0; font-size: 1.3rem; font-weight: 800; color: #f8fafc; }
                .hub-tile p { margin: 0; color: rgba(255, 255, 255, 0.72); font-size: 0.92rem; line-height: 1.65; }
                .hub-cta { margin-top: 10px; color: #f4c95d; font-weight: 800; font-size: 0.92rem; }

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

                .chatbots-btn.primary {
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

                .chatbots-notice li::before {
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

                .flow-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }

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
                    .guide-panel {
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
                    .guide-panel {
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
