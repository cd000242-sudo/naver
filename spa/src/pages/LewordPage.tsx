import { useEffect, useState } from 'react';
import ClaudeReconnect from '../components/leword/ClaudeReconnect';
import LewordAuth from '../components/leword/LewordAuth';
import { clearSession, daysLeft, loadSession, type LewordSession } from '../lib/lewordAuth';
import { Link, useSearchParams } from 'react-router-dom';
import AffiliateTab from '../components/leword/AffiliateTab';
import AnalyzeTab from '../components/leword/AnalyzeTab';
import GoldenTab from '../components/leword/GoldenTab';
import KeysTab from '../components/leword/KeysTab';
import KinGoldenTab from '../components/leword/KinGoldenTab';
import LewordStyles from '../components/leword/LewordStyles';
import RadarTab from '../components/leword/RadarTab';
import RankTab from '../components/leword/RankTab';
import RpmTab from '../components/leword/RpmTab';
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
    { id: 'kin', label: '지식인 황금질문', short: '황금질문', icon: '✦' },
    { id: 'affiliate', label: '제휴 황금키워드', short: '제휴', icon: '◇' },
    { id: 'youtube', label: '유튜브 급상승 글감', short: '유튜브 글감', icon: '▶' },
    { id: 'radar', label: '외부유입 레이더', short: '레이더', icon: '⊚' },
    { id: 'rank', label: '노출 추적', short: '노출 추적', icon: '↗' },
    { id: 'rpm', label: '글 RPM 확인', short: 'RPM', icon: '$' },
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
    /** 모바일 햄버거 메뉴 열림 상태. 탭을 고르면 닫힌다. */
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    /*
     * 로그인 — 저장된 세션은 만료가 지나면 loadSession 이 스스로 지운다.
     * 비로그인도 화면은 열어 둔다: 황금키워드 상위 5건만 맛보기로 보이고
     * 나머지 탭은 잠긴다(사장님 사양 2026-08-20).
     */
    const [session, setSession] = useState<LewordSession | null>(loadSession);
    const [authOpen, setAuthOpen] = useState(false);
    const left = session ? daysLeft(session) : null;
    const activeMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

    // 보드 안쪽 잠금 안내가 로그인을 부를 때 — 소품을 길게 넘기지 않는다.
    useEffect(() => {
        const open = () => setAuthOpen(true);
        window.addEventListener('leword:login', open);
        return () => window.removeEventListener('leword:login', open);
    }, []);

    /*
     * 로그인 창이 덮개 위로 올라오면서 생긴 두 가지 — Esc 로 닫기, 뒤 배경 스크롤 잠금.
     * 덮개가 화면을 가리는데 뒤가 따라 움직이면 어디를 보고 있었는지 잃는다.
     */
    useEffect(() => {
        if (!authOpen || session) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setAuthOpen(false); };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKey);
        };
    }, [authOpen, session]);

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
    /*
     * RPM 을 보고 "이 글에 사람을 데려올까"를 정한 다음 레이더로 넘어간다
     * (사장님 지시 2026-08-28). 주소를 다시 붙여넣게 두지 않는다.
     */
    const [handoffPostUrl, setHandoffPostUrl] = useState('');
    const sendToRadar = (pageUrl: string) => { setHandoffPostUrl(pageUrl); selectTab('radar'); };

    return (
        // <main> 이 아니라 <div> 다. 이유가 둘이다:
        //  ① Layout 이 이미 <main> 을 렌더한다 — 중첩되면 잘못된 마크업이다.
        //  ② global.css 의 `main { background: transparent !important }` 가
        //     이 화면의 어두운 바탕을 지워서, 관리자 배경 사진이 카드 뒤로 비쳤다.
        <div className="lw-app">
            <LewordStyles />
            {/* 토큰이 죽는 순간 어느 탭에서든 뜨는 재연동 창. */}
            <ClaudeReconnect />

            <aside className="lw-side" aria-label="LEWORD 기능">
                <div className="lw-brand">
                    <span className="lw-logo" aria-hidden="true">L</span>
                    <b>LEWORD</b>
                </div>

                {/*
                  * 모바일 햄버거(사장님 지시 2026-08-17: "알약은 대충이다 —
                  * 햄버거처럼 깔끔하게"). 현재 탭명 + ☰ 버튼 하나만 두고,
                  * 누르면 전체 탭이 카드 메뉴로 펼쳐진다. 데스크톱에서는 CSS 가
                  * 이 버튼·메뉴를 숨기고 기존 세로 사이드탭을 그대로 쓴다.
                  */}
                <button
                    type="button"
                    className="lw-mobile-toggle"
                    aria-expanded={mobileNavOpen}
                    aria-controls="lw-mobile-menu"
                    onClick={() => setMobileNavOpen((open) => !open)}
                >
                    <span className="lw-mobile-current">
                        <span aria-hidden="true">{activeMeta.icon}</span> {activeMeta.short}
                    </span>
                    <span className="lw-burger" aria-hidden="true">{mobileNavOpen ? '✕' : '☰'}</span>
                </button>
                {mobileNavOpen && (
                    <div className="lw-mobile-menu" id="lw-mobile-menu" role="menu">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="menuitem"
                                className={`lw-mobile-item lw-navi-${tab.id}${activeTab === tab.id ? ' on' : ''}`}
                                onClick={() => { selectTab(tab.id); setMobileNavOpen(false); }}
                            >
                                <span aria-hidden="true">{tab.icon}</span>
                                <em>{tab.label}</em>
                                {activeTab === tab.id && <b aria-hidden="true">●</b>}
                            </button>
                        ))}
                    </div>
                )}

                <nav className="lw-nav">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            // 탭별 고유색(사장님 지정 2026-08-20: 금·파랑·초록·주황·빨강·분홍·은색).
                            className={`lw-navi lw-navi-${tab.id}${activeTab === tab.id ? ' on' : ''}${!session && tab.id !== 'golden' ? ' locked' : ''}`}
                            aria-current={activeTab === tab.id ? 'page' : undefined}
                            onClick={() => {
                                if (!session && tab.id !== 'golden') { setAuthOpen(true); return; }
                                selectTab(tab.id);
                            }}
                        >
                            <span aria-hidden="true">{tab.icon}</span>
                            {/*
                              * 모바일 실측(2026-08-17, iPhone 뷰포트): 긴 라벨 하나가 가로줄
                              * 폭을 다 먹고 나머지 탭은 화면 밖 + 스크롤바 숨김이라
                              * "탭이 하나뿐"으로 보였다. short 는 정의만 되고 안 쓰이고
                              * 있었다 — 모바일에서는 short 를 쓴다(CSS 가 토글).
                              */}
                            <em className="lw-navi-full">{tab.label}</em>
                            <em className="lw-navi-short">{tab.short}</em>
                            {!session && tab.id !== 'golden' && <b className="lw-navi-lock" aria-label="로그인 필요">🔒</b>}
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
                {/*
                  * 계정 줄 — 아이디와 **언제까지 쓸 수 있는지**가 늘 보여야 한다.
                  * 30일 이하부터 노랑, 7일 이하부터 빨강. 만료 당일에 알면 늦다.
                  */}
                <div className="lw-acct">
                    {session ? (
                        <>
                            <span className="lw-acct-face" aria-hidden="true">{session.userId.slice(0, 1).toUpperCase()}</span>
                            <span className="lw-acct-id">{session.userId}</span>
                            <span className="lw-acct-meta">
                                {session.licenseType ? `${session.licenseType} · ` : ''}
                                {session.expiresAt
                                    ? `${new Date(session.expiresAt).toLocaleDateString('ko-KR')}까지`
                                    : '기간 제한 없음'}
                            </span>
                            {typeof left === 'number' && (
                                <span className={`lw-acct-left${left <= 7 ? ' out' : left <= 30 ? ' soon' : ''}`}>
                                    <i aria-hidden="true" />{left}일 남음
                                </span>
                            )}
                            <button
                                type="button"
                                className="lw-acct-btn"
                                onClick={() => { clearSession(); setSession(null); selectTab('golden'); }}
                            >로그아웃</button>
                        </>
                    ) : (
                        <>
                            <span className="lw-acct-meta">로그인하면 모든 기능이 열립니다 — 지금은 황금키워드 상위 5건만 보입니다.</span>
                            <button type="button" className="lw-acct-btn on" onClick={() => setAuthOpen(true)}>
                                로그인 · 계정 만들기
                            </button>
                        </>
                    )}
                </div>

                {authOpen && !session && (
                    <div
                        className="lw-auth-wrap"
                        role="dialog"
                        aria-modal="true"
                        aria-label="LEWORD 로그인"
                        onClick={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}
                    >
                        <LewordAuth
                            onDone={(next) => { setSession(next); setAuthOpen(false); }}
                            onCancel={() => setAuthOpen(false)}
                        />
                    </div>
                )}

                {activeTab === 'golden' && <GoldenTab key={session ? session.userId : 'guest'} onAnalyze={sendToAnalyze} />}
                {activeTab === 'kin' && <KinGoldenTab onAnalyze={sendToAnalyze} />}
                {activeTab === 'analyze' && <AnalyzeTab initialKeyword={handoffKeyword} />}
                {activeTab === 'affiliate' && <AffiliateTab onAnalyze={sendToAnalyze} />}
                {activeTab === 'youtube' && <YoutubeTab onAnalyze={sendToAnalyze} />}
                {activeTab === 'radar' && <RadarTab initialUrl={handoffPostUrl} />}
                {activeTab === 'rank' && <RankTab initialKeyword={handoffKeyword} onAnalyze={sendToAnalyze} />}
                {activeTab === 'rpm' && <RpmTab onRadar={sendToRadar} />}
                {activeTab === 'keys' && <KeysTab />}
            </section>
        </div>
    );
}

export default LewordPage;
