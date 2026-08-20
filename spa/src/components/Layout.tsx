import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import MusicPlayer, { isMusicSuppressed } from './MusicPlayer';
import SummerEffect from './SummerEffect';
import FloatStack from './FloatStack';
import ScrollToTop from './ScrollToTop';
import NoticeModal from './NoticeModal';
import { loadFloatOpen, saveFloatOpen } from '../lib/floatStack';

/**
 * 모든 페이지 공통 레이아웃.
 * Layout 자체는 라우트 전환 시 unmount 되지 않음 → MusicPlayer 끊김 0.
 * <Outlet /> 안만 페이지별 내용 교체.
 */
function Layout() {
    const location = useLocation();
    // 우하단(문의 버튼 + 음악)은 하나로 접힌다 — 상태를 여기서 들고 둘에게 넘긴다.
    const [floatOpen, setFloatOpen] = useState(loadFloatOpen);
    const toggleFloat = () => setFloatOpen((was) => { saveFloatOpen(!was); return !was; });
    const pathname = location.pathname.replace(/\/$/, '') || '/';
    const isLewordConsole = pathname === '/leword' || pathname === '/leword.html';
    // 여름 이펙트가 계절 조건 없이 항상 떠서 겨울에도 태양 입자가 날렸다(잠복 결함).
    // KST 기준 6~9월에만 렌더한다.
    const isSummerSeason = () => {
        const kstMonth = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCMonth() + 1;
        return kstMonth >= 6 && kstMonth <= 9;
    };
    // 공지 모달은 홈에서만 띄운다(다른 페이지 작업을 가리지 않게).
    const isHome = pathname === '/';
    /*
     * 관리자 미리보기 iframe 등 무음 컨텍스트에서만 음악 플레이어를 끈다.
     * 예전엔 LEWORD 콘솔도 함께 껐는데, 콘솔에서 오래 작업하는 사람이야말로
     * 틀어 놓고 싶어 한다(사장님 2026-08-20 "노래 재생 버튼은 어따 팔아먹었냐").
     */
    const musicOff = isMusicSuppressed();

    return (
        <>
            <ScrollToTop />
            <Navbar />
            <main style={{
                minHeight: '100vh',
                paddingTop: isLewordConsole ? 72 : 0,
                background: isLewordConsole ? '#07090d' : undefined,
            }}>
                <Outlet />
            </main>
            {!isLewordConsole && <Footer />}
            {!isLewordConsole && isSummerSeason() && <SummerEffect />}
            {!musicOff && <MusicPlayer hidden={!floatOpen} />}
            {/*
              * 문의·단톡방·유튜브 버튼은 콘솔에서도 보인다(사장님 지시 2026-08-20
              * "우측 하단에 있던 버튼들이 다 어디 갔나요?"). 콘솔이라고 문의 경로를
              * 없애면 여기서 막힌 사람이 물어볼 데가 사라진다.
              */}
            <FloatStack open={floatOpen} onToggle={toggleFloat} />
            {isHome && <NoticeModal />}
        </>
    );
}

export default Layout;
