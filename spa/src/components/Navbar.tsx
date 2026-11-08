import { useEffect, useReducer, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    INITIAL_MENU_STATE, NAV_BREAKPOINT, NAV_CTA, NAV_ITEMS,
    isNavPathActive, menuReducer, type NavLinkItem,
} from '../lib/navMenu.mjs';
import { useUnseenNoticeCount } from '../lib/useNoticeAlerts';
import NavDropdown from './NavDropdown';
import NavMobileMenu from './NavMobileMenu';
import { NavAccountBar, useNavAccount } from './NavAccount';
import NewBadge from './NewBadge';
import '../styles/navbar.css';

/**
 * Site top menu (light bar, design 1 — agreed 2026-11-07).
 *
 * The bar itself must stay free of filter / backdrop-filter / transform: the phone list inside it is
 * `position: fixed`, and any of those would make the bar its containing block and clip the list to the
 * bar's height (the old bar blurred itself and cut the opened menu in half on phones).
 */
function Navbar() {
    const [state, dispatch] = useReducer(menuReducer, INITIAL_MENU_STATE);
    const [scrolled, setScrolled] = useState(false);
    const rootRef = useRef<HTMLElement>(null);
    const burgerRef = useRef<HTMLButtonElement>(null);
    const { pathname, search } = useLocation();
    const unseenNotices = useUnseenNoticeCount();
    const account = useNavAccount(pathname);

    useEffect(() => { dispatch({ type: 'route-change' }); }, [pathname]);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 50);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Widening the window past the breakpoint must not leave the phone list open.
    useEffect(() => {
        const wide = window.matchMedia(`(min-width: ${NAV_BREAKPOINT + 1}px)`);
        const onChange = () => { if (wide.matches) dispatch({ type: 'resize-wide' }); };
        wide.addEventListener('change', onChange);
        return () => wide.removeEventListener('change', onChange);
    }, []);

    const anythingOpen = state.mobileOpen || state.dropdown !== null;
    useEffect(() => {
        if (!anythingOpen) return undefined;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) dispatch({ type: 'outside-click' });
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            dispatch({ type: 'escape' });
            if (state.mobileOpen) burgerRef.current?.focus();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [anythingOpen, state.mobileOpen]);

    // The list covers the page, so the page behind it must not scroll.
    useEffect(() => {
        if (!state.mobileOpen) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [state.mobileOpen]);

    const closeAll = () => dispatch({ type: 'close-all' });
    const rootClass = `site-nav${scrolled ? ' is-scrolled' : ''}${state.mobileOpen ? ' is-menu-open' : ''}`;

    return (
        <header className={rootClass} id="site-nav" ref={rootRef}>
            <div className="site-nav-bar">
                <Link className="site-nav-brand" to="/" aria-label="Leaders Pro 홈으로" onClick={closeAll}>
                    <img src="/favicon-32x32.png" alt="" aria-hidden="true" width={40} height={40} />
                    <span className="site-nav-brand-text">Leaders Pro<small>블로그 수익 도구</small></span>
                </Link>

                <nav className="site-nav-menu" aria-label="주 메뉴">
                    <ul className="site-nav-list">
                        {NAV_ITEMS.map((item) => (
                            <li key={item.key}>
                                {item.type === 'group' ? (
                                    <NavDropdown item={item} pathname={pathname} search={search} unseenNotices={unseenNotices} open={state.dropdown === item.key} dispatch={dispatch} />
                                ) : (
                                    <NavBarLink item={item} pathname={pathname} unseenNotices={unseenNotices} onNavigate={closeAll} />
                                )}
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="site-nav-actions">
                    <NavAccountBar account={account} open={state.dropdown === 'account'} dispatch={dispatch} />
                    <Link className="site-nav-btn site-nav-btn-cta" to={NAV_CTA.to} onClick={closeAll}>
                        <span className="site-nav-cta-long">{NAV_CTA.label}</span>
                        <span className="site-nav-cta-short">{NAV_CTA.shortLabel}</span>
                    </Link>
                    <button
                        ref={burgerRef}
                        type="button"
                        className="site-nav-burger"
                        aria-expanded={state.mobileOpen}
                        aria-controls="site-nav-sheet"
                        aria-label={state.mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
                        onClick={() => dispatch({ type: 'toggle-mobile' })}
                    >
                        <span className="site-nav-burger-lines" aria-hidden="true"><i /><i /><i /></span>
                        <b>{state.mobileOpen ? '닫기' : '메뉴'}</b>
                    </button>
                </div>
            </div>

            <NavMobileMenu open={state.mobileOpen} pathname={pathname} search={search} unseenNotices={unseenNotices} account={account} onClose={closeAll} />
        </header>
    );
}

function NavBarLink({ item, pathname, unseenNotices, onNavigate }: { item: NavLinkItem; pathname: string; unseenNotices: number; onNavigate: () => void }) {
    const current = isNavPathActive(item.to, pathname);
    return (
        <Link className={`site-nav-link${item.featured ? ' site-nav-link-featured' : ''}`} to={item.to} aria-current={current ? 'page' : undefined} onClick={onNavigate}>
            {item.label}
            {item.badge && <NewBadge count={unseenNotices} size="md" />}
        </Link>
    );
}

export default Navbar;
