import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AffiliateTab from '../components/leword/AffiliateTab';
import AnalyzeTab from '../components/leword/AnalyzeTab';
import GoldenTab from '../components/leword/GoldenTab';
import KeysTab from '../components/leword/KeysTab';
import LewordStyles from '../components/leword/LewordStyles';
import RankTab from '../components/leword/RankTab';
import YoutubeTab from '../components/leword/YoutubeTab';

/**
 * /leword — 좌측 사이드탭으로 기능을 하나씩 쓰는 화면.
 *
 * 이전에는 "앱 받으세요" 배너 한 장뿐이라 광고만 보였다. 방문자가 여기서
 * 실제로 뭔가를 해 볼 수 있어야 앱을 받을 이유가 생긴다.
 *
 * 탭 상태는 URL 쿼리(`?tab=`)에 둔다. 새로고침이나 공유했을 때 같은 화면이
 * 열려야 하고, 뒤로가기가 탭 전환으로 동작해야 하기 때문이다.
 */

const TABS = [
    { id: 'golden', label: '리더남 전용 황금키워드', short: '황금키워드', icon: '◆' },
    { id: 'analyze', label: '키워드 분석', short: '키워드 분석', icon: '◎' },
    { id: 'affiliate', label: '제휴 황금키워드', short: '제휴', icon: '◇' },
    { id: 'youtube', label: '유튜브 실시간·급상승', short: '유튜브', icon: '▶' },
    { id: 'rank', label: '노출 추적', short: '노출 추적', icon: '↗' },
    { id: 'keys', label: '내 API 키', short: 'API 키', icon: '⚿' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isTabId(value: string): value is TabId {
    return TABS.some((tab) => tab.id === value);
}

function LewordPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab') || '';
    const activeTab: TabId = isTabId(tabParam) ? tabParam : 'golden';
    /** 탭 사이로 키워드를 넘긴다 — 황금보드에서 고른 걸 분석 탭이 이어받는다. */
    const [handoffKeyword, setHandoffKeyword] = useState(searchParams.get('keyword') || '');

    useEffect(() => {
        const previous = document.title;
        document.title = 'LEWORD 키워드 도구 | Leaders Pro';
        return () => { document.title = previous; };
    }, []);

    const selectTab = (tab: TabId, keyword?: string) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', tab);
        if (keyword) next.set('keyword', keyword);
        else next.delete('keyword');
        setSearchParams(next, { replace: false });
        if (keyword !== undefined) setHandoffKeyword(keyword || '');
    };

    const sendToAnalyze = (keyword: string) => selectTab('analyze', keyword);

    return (
        // <main> 이 아니라 <div> 다. 이유가 둘이다:
        //  ① Layout 이 이미 <main> 을 렌더한다 — 중첩되면 잘못된 마크업이다.
        //  ② global.css 의 `main { background: transparent !important }` 가
        //     이 화면의 어두운 바탕을 지워서, 관리자 배경 사진이 카드 뒤로 비쳤다.
        <div className="lw-app">
            <LewordStyles />

            <aside className="lw-side" aria-label="LEWORD 기능">
                <div className="lw-brand">
                    <span className="lw-logo" aria-hidden="true">L</span>
                    <b>LEWORD</b>
                </div>

                <nav className="lw-nav">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`lw-navi${activeTab === tab.id ? ' on' : ''}`}
                            aria-current={activeTab === tab.id ? 'page' : undefined}
                            onClick={() => selectTab(tab.id)}
                        >
                            <span aria-hidden="true">{tab.icon}</span>
                            <em>{tab.label}</em>
                        </button>
                    ))}
                </nav>

                <div className="lw-side-foot">
                    <p>더 많은 발굴 결과와 자동 추적은 프로그램에서 씁니다.</p>
                    <Link to="/download">LEWORD 다운로드</Link>
                    <Link to="/pricing" className="lw-ghost">요금제 보기</Link>
                </div>
            </aside>

            <section className="lw-main">
                {activeTab === 'golden' && <GoldenTab onAnalyze={sendToAnalyze} />}
                {activeTab === 'analyze' && <AnalyzeTab initialKeyword={handoffKeyword} />}
                {activeTab === 'affiliate' && <AffiliateTab initialKeyword={handoffKeyword} onAnalyze={sendToAnalyze} />}
                {activeTab === 'youtube' && <YoutubeTab onAnalyze={sendToAnalyze} />}
                {activeTab === 'rank' && <RankTab initialKeyword={handoffKeyword} />}
                {activeTab === 'keys' && <KeysTab />}
            </section>
        </div>
    );
}

export default LewordPage;
