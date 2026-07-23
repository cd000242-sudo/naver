import { useEffect } from 'react';
import HomeOperationsBoard from '../components/HomeOperationsBoard';

/**
 * 부방장 선정 황금키워드 전용 페이지.
 *
 * 홈 안의 탭이었던 것을 별도 주소로 뺐다. 목록이 길어 홈 탭 안에서는 답답했고,
 * 별도 주소여야 페이지 전환이 생겨 구글 자체 전면광고(Vignette)가 뜰 자리가 생긴다.
 * 광고 시청을 열람 조건으로 걸지는 않는다 — AdSense 는 보상형 유도를 금지하며
 * 위반 시 광고 게재 중단·계정 정지까지 간다.
 */
function BriefingPage() {
    useEffect(() => {
        const prevTitle = document.title;
        document.title = '부방장 선정 황금키워드 | 리더스프로';
        return () => {
            document.title = prevTitle;
        };
    }, []);

    return (
        <section className="briefing-page" aria-labelledby="briefing-page-title">
            <style>{`
                .briefing-page { padding: 28px 16px 56px; max-width: 1180px; margin: 0 auto; }
                .briefing-page-head { margin-bottom: 18px; }
                .briefing-page-kicker {
                    display: inline-block; font-size: 12px; font-weight: 800; letter-spacing: .12em;
                    color: #69b7ff; margin-bottom: 8px;
                }
                .briefing-page-head h1 { font-size: 26px; line-height: 1.32; margin: 0 0 8px; }
                .briefing-page-head p { margin: 0; font-size: 14px; line-height: 1.6; opacity: .82; }
                .briefing-page-back {
                    display: inline-flex; align-items: center; gap: 6px; margin-top: 14px;
                    font-size: 13px; font-weight: 700; text-decoration: none;
                    padding: 8px 14px; border-radius: 999px;
                    border: 1px solid rgba(255, 255, 255, .18);
                }
                .briefing-page-back:hover { border-color: rgba(105, 183, 255, .55); }
                @media (max-width: 720px) {
                    .briefing-page { padding: 20px 10px 44px; }
                    .briefing-page-head h1 { font-size: 21px; }
                }
            `}</style>

            <header className="briefing-page-head">
                <span className="briefing-page-kicker">DEPUTY GOLDEN KEYWORDS</span>
                <h1 id="briefing-page-title">부방장 선정 황금키워드</h1>
                <p>매일 검토해 올린 고정 키워드 전체 목록입니다. 실시간 값이 아니라 검토 시점의 고정 스냅샷이며, 기회지수는 검색량 ÷ (문서수 + 1) 로 계산합니다.</p>
                {/* 돌아갈 때도 실제 페이지 로드로 둔다 — 홈 복귀 시에도 광고 자리가 생긴다. */}
                <a className="briefing-page-back" href="/">← 홈으로 돌아가기</a>
            </header>

            <HomeOperationsBoard briefingOnly />
        </section>
    );
}

export default BriefingPage;
