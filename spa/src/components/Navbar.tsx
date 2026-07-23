import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const NAV_LINKS = [
    { to: '/', label: '홈' },
    { to: '/leword', label: 'LEWORD' },
    { to: '/chatbots', label: '무료 챗봇' },
    { to: '/products', label: '제품정보' },
    { to: '/pricing', label: '무료체험 및 구매' },
    { to: '/reviews', label: '후기' },
    { to: '/community', label: '커뮤니티' },
    { to: '/download', label: '다운로드' },
    { to: '/lookup', label: '주문조회' },
];

function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const location = useLocation();

    const normalizedPath = (() => {
        if (location.pathname === '/index.html') return '/';
        return location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    })();

    const isActiveLink = (to: string) => to === '/' ? normalizedPath === '/' : normalizedPath === to;

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <nav
            className={scrolled ? 'navbar scrolled' : 'navbar'}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
                background: scrolled ? 'rgba(10,10,15,0.96)' : 'rgba(10,10,15,0.85)',
                backdropFilter: 'blur(16px)',
                borderBottom: scrolled ? '1px solid rgba(124,58,237,0.15)' : '1px solid rgba(255,255,255,0.04)',
                transition: 'all 0.3s',
            }}
        >
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 18, color: '#fff' }}>
                    <img src="/favicon-32x32.png" alt="" aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 8, display: 'block' }} />
                    <span>Leaders Pro</span>
                </NavLink>
                <button
                    aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
                    aria-expanded={mobileOpen}
                    onClick={() => setMobileOpen(o => !o)}
                    style={{ display: 'none', background: 'transparent', border: 'none', cursor: 'pointer', flexDirection: 'column', gap: 5, padding: 6 }}
                    className="nav-hamburger"
                >
                    <span style={{ display: 'block', width: 20, height: 2, background: '#fff' }} />
                    <span style={{ display: 'block', width: 20, height: 2, background: '#fff' }} />
                    <span style={{ display: 'block', width: 20, height: 2, background: '#fff' }} />
                </button>
                <div className={mobileOpen ? 'nav-links mobile-open' : 'nav-links'} style={{ display: 'flex', gap: 8 }}>
                    {NAV_LINKS.map(link => {
                        const active = isActiveLink(link.to);
                        return (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                className={active ? 'nav-link-active' : undefined}
                                aria-current={active ? 'page' : undefined}
                                onClick={() => setMobileOpen(false)}
                                style={() => ({
                                padding: '8px 16px',
                                color: mobileOpen ? (active ? '#F4D03F' : 'rgba(255,255,255,0.92)') : (active ? '#A78BFA' : '#a0a0b0'),
                                background: mobileOpen && active ? 'rgba(244,208,63,0.14)' : active ? 'rgba(124,58,237,0.1)' : 'transparent',
                                fontSize: 14, fontWeight: mobileOpen ? 800 : 500,
                                borderRadius: 8, transition: 'all 0.2s',
                            })}
                            >
                                {link.label}
                            </NavLink>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
}

export default Navbar;
