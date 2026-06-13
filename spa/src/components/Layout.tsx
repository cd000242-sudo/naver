import { Outlet } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import MusicPlayer from './MusicPlayer';
import SummerEffect from './SummerEffect';
import FloatStack from './FloatStack';
import ScrollToTop from './ScrollToTop';

/**
 * 모든 페이지 공통 레이아웃.
 * Layout 자체는 라우트 전환 시 unmount 되지 않음 → MusicPlayer 끊김 0.
 * <Outlet /> 안만 페이지별 내용 교체.
 */
function Layout() {
    const location = useLocation();
    const pathname = location.pathname.replace(/\/$/, '') || '/';
    const isLewordConsole = pathname === '/leword' || pathname === '/leword.html';

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
            {!isLewordConsole && <SummerEffect />}
            <MusicPlayer />
            {!isLewordConsole && <FloatStack />}
        </>
    );
}

export default Layout;
