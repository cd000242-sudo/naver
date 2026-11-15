import { useEffect, useState } from 'react';
import SplitWords from '../components/motion/SplitWords';
import { Link } from 'react-router-dom';
import ChatbotTiles from '../components/chatbots/ChatbotTiles';
import { fetchSiteContent, type SiteContent } from '../lib/siteOps';
import { color, light, lightRadius, motion, type as typeScale } from '../styles/tokens';

const FLOWS = [
    ['글쓰기 준비', '주제와 키워드 선택 → 대상 독자와 글의 목적 정리'],
    ['제미나이로 시작', '글쓰기 프롬프트 선택 → 초안 작성 → 사실 확인 후 내 글로 다듬기'],
];

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

    return (
        <>
            <main className="chatbots-page">
                <section className="chatbots-hero">
                    <div className="chatbots-wrap chatbots-hero-grid">
                        <div>
                            <h1><SplitWords text="무료 챗봇·프롬프트" /></h1>
                            <p>
                                글쓰기를 도와줄 무료 챗봇과 프롬프트를 모았습니다.
                                아래 버튼을 누르면 바로 열립니다.
                            </p>
                            <div className="chatbots-actions">
                                <a className="chatbots-btn primary lp-sheen" href="#chatbots-list">챗봇 바로가기</a>
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

                <section id="chatbots-list" className="chatbots-section">
                    <div className="chatbots-wrap">
                        <div className="chatbots-section-head fade-in">
                            <h2>바로 쓰는 무료 챗봇·프롬프트</h2>
                            <p>버튼을 누르면 새 창에서 열립니다.</p>
                        </div>

                        <div className="hub-grid">
                            <ChatbotTiles chatbots={siteContent?.chatbots} />
                        </div>
                    </div>
                </section>

                <section className="chatbots-section">
                    <div className="chatbots-wrap">
                        <div className="chatbots-section-head fade-in">
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

                <section className="chatbots-section">
                    <div className="chatbots-wrap">
                        <div className="chatbots-section-head fade-in">
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
                        <div className="chatbots-final-panel">
                            <h2>LEWORD 키워드 마스터와 네이버 자동화 툴도 함께 써보세요</h2>
                            <p>챗봇으로 초안을 잡고, Leaders Pro 자동화 툴로 키워드 발굴과 발행 흐름을 더 빠르게 이어갈 수 있습니다.</p>
                            <div className="chatbots-actions">
                                <Link className="chatbots-btn solid" to="/products">제품 정보 보기</Link>
                                <Link className="chatbots-btn secondary" to="/download">다운로드</Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <style>{`
                /* Chatbots page, light theme. Values come from styles/tokens (light, type, lightRadius, motion).
                   Tile markup lives in components/chatbots; the lock form styles itself there. */
                .chatbots-page {
                    position: relative;
                    z-index: 1;
                    color: ${light.text};
                }

                .chatbots-wrap {
                    width: min(1152px, calc(100% - 48px));
                    margin: 0 auto;
                }

                .chatbots-hero {
                    padding: 120px 0 40px;
                }

                .chatbots-hero-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) minmax(320px, 440px);
                    gap: 48px;
                    align-items: start;
                }

                .chatbots-hero h1 {
                    margin: 0 0 12px;
                    font-size: ${typeScale.h1}px;
                    line-height: 1.2;
                    font-weight: 700;
                    letter-spacing: 0;
                    color: ${light.text};
                }

                .chatbots-hero p,
                .chatbots-section-head p,
                .chatbots-final p {
                    margin: 0;
                    color: ${light.textSecondary};
                    font-size: ${typeScale.body}px;
                    line-height: 1.7;
                    word-break: keep-all;
                }

                .chatbots-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-top: 24px;
                }

                .chatbots-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 48px;
                    padding: 12px 24px;
                    border-radius: ${lightRadius.control}px;
                    border: 1px solid transparent;
                    font-size: ${typeScale.body}px;
                    font-weight: 600;
                    text-decoration: none;
                    transition: background-color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease};
                }

                /* The one gold fill on this page. */
                .chatbots-btn.primary {
                    background: ${light.accent};
                    color: ${light.onAccent};
                }

                .chatbots-btn.solid {
                    background: ${light.btn};
                    color: ${light.onBtn};
                }

                .chatbots-btn.secondary {
                    border-color: ${light.lineStrong};
                    background: ${light.surface};
                    color: ${light.text};
                }

                .chatbots-btn.secondary:hover {
                    background: ${light.raised};
                }

                .chatbots-notice {
                    padding: 24px;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.card}px;
                    background: ${light.surface};
                }

                .chatbots-notice b {
                    display: block;
                    margin-bottom: 12px;
                    font-size: ${typeScale.body}px;
                    font-weight: 600;
                    color: ${light.text};
                }

                .chatbots-notice ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }

                .chatbots-notice li {
                    position: relative;
                    padding-left: 16px;
                    margin-bottom: 8px;
                    color: ${light.textSecondary};
                    font-size: ${typeScale.small}px;
                    line-height: 1.7;
                    word-break: keep-all;
                }

                .chatbots-notice li:last-child {
                    margin-bottom: 0;
                }

                .chatbots-notice li::before {
                    content: "";
                    position: absolute;
                    left: 0;
                    top: 11px;
                    width: 4px;
                    height: 4px;
                    border-radius: 50%;
                    background: ${light.textMuted};
                }

                .chatbots-section {
                    padding: 48px 0;
                }

                #chatbots-list {
                    padding-top: 24px;
                    scroll-margin-top: 80px;
                }

                .chatbots-section-head {
                    max-width: 760px;
                    margin: 0 0 24px;
                }

                .chatbots-section-head h2,
                .chatbots-final h2 {
                    margin: 0 0 8px;
                    font-size: ${typeScale.h2}px;
                    line-height: 1.3;
                    font-weight: 600;
                    letter-spacing: 0;
                    color: ${light.text};
                    word-break: keep-all;
                }

                /* ── Tiles (markup in components/chatbots) ── */
                .hub-grid {
                    display: grid;
                    /* [2026-11-07] Three buttons side by side on wide screens so all show at once. */
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 16px;
                }

                .hub-tile {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 8px;
                    padding: 24px;
                    background: ${light.surface};
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.card}px;
                    box-shadow: ${light.shadowSm};
                    text-align: left;
                    text-decoration: none;
                    color: inherit;
                    cursor: pointer;
                    font: inherit;
                    transition: border-color ${motion.fast} ${motion.ease};
                }

                .hub-tile:hover {
                    border-color: ${light.lineStrong};
                }

                .hub-tile-top {
                    display: flex;
                    align-items: center;
                    width: 100%;
                    margin-bottom: 4px;
                }

                /* Category colour survives as one small dot. Text, face and border stay neutral. */
                .hub-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 12px;
                    border-radius: ${lightRadius.pill}px;
                    border: 1px solid ${light.line};
                    background: ${light.raised};
                    color: ${light.textSecondary};
                    font-size: ${typeScale.meta}px;
                    font-weight: 500;
                }

                .hub-badge::before {
                    content: "";
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: ${light.accent};
                }

                .hub-badge.purple::before { background: ${color.purpleDeep}; }

                .hub-tile h3 {
                    margin: 0;
                    font-size: ${typeScale.lead}px;
                    line-height: 1.4;
                    font-weight: 600;
                    color: ${light.text};
                }

                .hub-tile p {
                    margin: 0;
                    color: ${light.textSecondary};
                    font-size: ${typeScale.small}px;
                    line-height: 1.7;
                    word-break: keep-all;
                }

                .hub-cta {
                    margin-top: auto;
                    padding-top: 12px;
                    color: ${light.accentInk};
                    font-size: ${typeScale.small}px;
                    font-weight: 600;
                }

                /* ── Recommended flow, safe use ── */
                .flow-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 16px;
                }

                .flow-card {
                    padding: 24px;
                    border-radius: ${lightRadius.card}px;
                    border: 1px solid ${light.line};
                    background: ${light.surface};
                }

                .flow-card strong,
                .guide-panel b {
                    display: block;
                    margin-bottom: 8px;
                    font-size: ${typeScale.lead}px;
                    font-weight: 600;
                    color: ${light.text};
                }

                .flow-card p,
                .guide-panel p {
                    margin: 0;
                    color: ${light.textSecondary};
                    font-size: ${typeScale.small}px;
                    line-height: 1.7;
                    word-break: keep-all;
                }

                /* One panel, three columns split by quiet rules. */
                .guide-panel {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    border-radius: ${lightRadius.card}px;
                    border: 1px solid ${light.line};
                    background: ${light.surface};
                }

                .guide-panel > div {
                    padding: 24px;
                    border-left: 1px solid ${light.line};
                }

                .guide-panel > div:first-child {
                    border-left: none;
                }

                .chatbots-final {
                    padding: 16px 0 96px;
                }

                .chatbots-final-panel {
                    padding: 40px;
                    border-radius: ${lightRadius.panel}px;
                    border: 1px solid ${light.line};
                    background: ${light.raised};
                }

                .chatbots-final-panel h2,
                .chatbots-final-panel p {
                    max-width: 760px;
                }

                @media (max-width: 980px) {
                    .chatbots-hero-grid {
                        grid-template-columns: 1fr;
                        gap: 32px;
                    }
                }

                @media (max-width: 640px) {
                    .chatbots-wrap {
                        width: min(100% - 32px, 1152px);
                    }

                    .chatbots-hero {
                        padding: 96px 0 32px;
                    }

                    .chatbots-hero h1 {
                        font-size: ${typeScale.h1Mobile}px;
                    }

                    .chatbots-section {
                        padding: 32px 0;
                    }

                    #chatbots-list {
                        padding-top: 16px;
                    }

                    .chatbots-section-head h2,
                    .chatbots-final h2 {
                        font-size: ${typeScale.h3}px;
                    }

                    .flow-grid,
                    .guide-panel {
                        grid-template-columns: 1fr;
                    }

                    .guide-panel > div {
                        border-left: none;
                        border-top: 1px solid ${light.line};
                    }

                    .guide-panel > div:first-child {
                        border-top: none;
                    }

                    .chatbots-final {
                        padding: 8px 0 64px;
                    }

                    .chatbots-final-panel {
                        padding: 24px;
                    }

                    .chatbots-actions {
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
