import { Outlet } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import MusicPlayer, { isMusicSuppressed } from './MusicPlayer';
import SummerEffect from './SummerEffect';
import FloatStack from './FloatStack';
import ScrollToTop from './ScrollToTop';
import NoticeModal from './NoticeModal';

/**
 * 모든 페이지 공통 레이아웃.
 * Layout 자체는 라우트 전환 시 unmount 되지 않음 → MusicPlayer 끊김 0.
 * <Outlet /> 안만 페이지별 내용 교체.
 */
function Layout() {
    const location = useLocation();
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
    // 관리자 미리보기 iframe 등 무음 컨텍스트에서는 음악 플레이어를 아예 렌더하지 않는다.
    const musicOff = isLewordConsole || isMusicSuppressed();

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
            {!musicOff && <MusicPlayer />}
            {!isLewordConsole && <FloatStack />}
            {isHome && <NoticeModal />}
        </>
    );
}

export default Layout;
