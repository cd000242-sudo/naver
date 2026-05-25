import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';

const NAV_LINKS = [
    { to: '/', label: '홈' },
    { to: '/products', label: '제품정보' },
    { to: '/pricing', label: '구매' },
    { to: '/reviews', label: '후기' },
    { to: '/community', label: '커뮤니티' },
    { to: '/download', label: '다운로드' },
    { to: '/lookup', label: '주문조회' },
];

function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

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
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #f5c842, #d4a012)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#1a1a2e' }}>👑</span>
                    <span>Leaders Pro</span>
                </NavLink>
                <button
                    aria-label="메뉴 열기"
                    onClick={() => setMobileOpen(o => !o)}
                    style={{ display: 'none', background: 'transparent', border: 'none', cursor: 'pointer', flexDirection: 'column', gap: 5, padding: 6 }}
                    className="nav-hamburger"
                >
                    <span style={{ display: 'block', width: 20, height: 2, background: '#fff' }} />
                    <span style={{ display: 'block', width: 20, height: 2, background: '#fff' }} />
                    <span style={{ display: 'block', width: 20, height: 2, background: '#fff' }} />
                </button>
                <div className={mobileOpen ? 'nav-links mobile-open' : 'nav-links'} style={{ display: 'flex', gap: 8 }}>
                    {NAV_LINKS.map(link => (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            onClick={() => setMobileOpen(false)}
                            style={({ isActive }) => ({
                                padding: '8px 16px',
                                color: isActive ? '#A78BFA' : '#a0a0b0',
                                background: isActive ? 'rgba(124,58,237,0.1)' : 'transparent',
                                fontSize: 14, fontWeight: 500,
                                borderRadius: 8, transition: 'all 0.2s',
                            })}
                        >
                            {link.label}
                        </NavLink>
                    ))}
                </div>
            </div>
        </nav>
    );
}

export default Navbar;
