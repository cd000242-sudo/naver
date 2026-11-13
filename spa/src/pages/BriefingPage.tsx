import { useEffect } from 'react';
import SplitWords from '../components/motion/SplitWords';
import HomeOperationsBoard from '../components/HomeOperationsBoard';
import { ShellIcon } from '../components/ShellIcons';
import { light, lightRadius, motion, type } from '../styles/tokens';

/**
 * 무료 선정 황금키워드 전용 페이지.
 *
 * 홈 안의 탭이었던 것을 별도 주소로 뺐다. 목록이 길어 홈 탭 안에서는 답답했고,
 * 별도 주소여야 페이지 전환이 생겨 구글 자체 전면광고(Vignette)가 뜰 자리가 생긴다.
 * 광고 시청을 열람 조건으로 걸지는 않는다 — AdSense 는 보상형 유도를 금지하며
 * 위반 시 광고 게재 중단·계정 정지까지 간다.
 */
function BriefingPage() {
    useEffect(() => {
        const prevTitle = document.title;
        document.title = '무료 선정 황금키워드 | 리더스프로';
        return () => {
            document.title = prevTitle;
        };
    }, []);

    return (
        <section className="briefing-page" aria-labelledby="briefing-page-title">
            <style>{`
                /* Top padding clears the fixed nav bar (72px) so the title is never covered. */
                .briefing-page { padding: 120px 16px 64px; max-width: 1180px; margin: 0 auto; }
                .briefing-page-head { margin-bottom: 24px; }
                .briefing-page-head h1 {
                    margin: 0 0 12px; color: ${light.text};
                    font-size: clamp(${type.h1Mobile}px, 5vw, ${type.h1}px); font-weight: 700; line-height: 1.25;
                }
                .briefing-page-head p {
                    margin: 0; max-width: 720px; color: ${light.textSecondary};
                    font-size: ${type.body}px; line-height: 1.7;
                }
                .briefing-page-back {
                    display: inline-flex; align-items: center; gap: 4px; margin-top: 16px;
                    min-height: 44px; padding: 0 16px;
                    border: 1px solid ${light.line}; border-radius: ${lightRadius.control}px;
                    background: ${light.surface}; color: ${light.text};
                    font-size: ${type.small}px; font-weight: 500; text-decoration: none;
                    transition: background-color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease};
                }
                .briefing-page-back:hover { background: ${light.raised}; border-color: ${light.lineStrong}; }
                .briefing-page-back:focus-visible { outline: 2px solid ${light.text}; outline-offset: 2px; }
                /* The shared board carries the home page's own top offset and side padding; this page already has both. */
                .briefing-page .home-ops { margin-bottom: 0; padding: 0; }
                /* Rank bars on this page: no track, a thin bar, gold for rank 1 only and neutral for the rest.
                   Scoped here so the shared board itself stays untouched. */
                .briefing-page .home-ops-chart-track { height: 4px; background: transparent; }
                .briefing-page .home-ops-chart-track span { background: ${light.lineStrong}; }
                .briefing-page .home-ops-chart-row:first-child .home-ops-chart-track span { background: ${light.accent}; }
                @media (max-width: 720px) {
                    .briefing-page { padding: 96px 16px 48px; }
                }
            `}</style>

            <header className="briefing-page-head">
                <h1 id="briefing-page-title"><SplitWords text="무료 선정 황금키워드" /></h1>
                <p>매일 검토해 올린 고정 키워드 전체 목록입니다. 실시간 값이 아니라 검토 시점의 고정 스냅샷이며, 기회지수는 검색량 ÷ (문서수 + 1) 로 계산합니다.</p>
                {/* Going back is a real page load too, so the home page also gets an ad slot on return. */}
                <a className="briefing-page-back" href="/">
                    <ShellIcon name="chevronLeft" size={16} />
                    홈으로 돌아가기
                </a>
            </header>

            <HomeOperationsBoard briefingOnly />
        </section>
    );
}

export default BriefingPage;
