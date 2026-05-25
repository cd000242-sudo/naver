import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import MusicPlayer from './MusicPlayer';
import SummerEffect from './SummerEffect';
import FloatStack from './FloatStack';

/**
 * 모든 페이지 공통 레이아웃.
 * Layout 자체는 라우트 전환 시 unmount 되지 않음 → MusicPlayer 끊김 0.
 * <Outlet /> 안만 페이지별 내용 교체.
 */
function Layout() {
    return (
        <>
            <Navbar />
            <main style={{ minHeight: '100vh' }}>
                <Outlet />
            </main>
            <Footer />
            <SummerEffect />
            <MusicPlayer />
            <FloatStack />
        </>
    );
}

export default Layout;
