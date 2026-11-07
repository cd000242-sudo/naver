import type { Dispatch } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOutAll } from '../lib/communityAuth';
import { daysLeft, type LewordSession } from '../lib/lewordAuth';
import { resolveLoginAction, type MenuAction } from '../lib/navMenu.mjs';
import { useSiteSession, type SiteSession } from '../lib/useSiteSession';
import { NavDropdownShell } from './NavDropdown';

/** Who the menu shows: the id and one short line under it. */
export type NavWho = {
    userId: string;
    line: string;
    /** The site (community) login exists, so the community entry is offered. */
    community: boolean;
};

export type NavAccountApi = {
    /** The logged-in person (either login), or null when logged out / expired. */
    who: NavWho | null;
    login: () => void;
    logout: () => void;
};

function planLine(session: LewordSession): string {
    const left = daysLeft(session);
    const plan = session.licenseType ? `${session.licenseType} · ` : '';
    return typeof left === 'number' ? `${plan}${left}일 남음` : `${plan}기간 제한 없음`;
}

/** One short line under the id: the LEWORD plan when there is one, else what kind of member this is. */
export function describeWho(site: SiteSession): NavWho | null {
    if (!site.userId) return null;
    const { community, leword } = site;
    let line = '커뮤니티 회원';
    if (leword) line = planLine(leword);
    else if (community?.role === 'owner') line = '운영자';
    else if (community?.role === 'licensed') line = '이용권 회원';
    return { userId: site.userId, line, community: Boolean(community) };
}

/**
 * Login state for the menu. [Login] opens the one site login window (/login) and carries the current page so a
 * finished login comes back to it. Logging out forgets the site login and the LEWORD login together
 * (`signOutAll`, which also frees the server-side web session so another browser can sign in right away).
 */
export function useNavAccount(pathname: string): NavAccountApi {
    const navigate = useNavigate();
    const location = useLocation();
    const site = useSiteSession(pathname);

    const login = () => navigate(resolveLoginAction(pathname, location.search).to);
    const logout = () => { void signOutAll(); };

    return { who: describeWho(site), login, logout };
}

type BarProps = {
    account: NavAccountApi;
    open: boolean;
    dispatch: Dispatch<MenuAction>;
};

/** Right side of the desktop bar: [Login] when logged out, id + account menu when logged in. */
export function NavAccountBar({ account, open, dispatch }: BarProps) {
    const { who } = account;
    if (!who) {
        return (
            <button type="button" className="site-nav-btn site-nav-btn-line site-nav-login" onClick={account.login}>로그인</button>
        );
    }
    return (
        <NavDropdownShell
            dropKey="account"
            open={open}
            dispatch={dispatch}
            className="site-nav-account"
            triggerClassName="site-nav-account-btn"
            triggerContent={(
                <>
                    <span className="site-nav-avatar" aria-hidden="true">{who.userId.slice(0, 1).toUpperCase()}</span>
                    <span className="site-nav-account-id">{who.userId}</span>
                </>
            )}
            panelClassName="site-nav-drop-account"
        >
            {who.community ? (
                <Link className="site-nav-drop-item" to="/community" onClick={() => dispatch({ type: 'close-all' })}>
                    <span className="site-nav-drop-icon" aria-hidden="true">C</span>
                    <span><b>커뮤니티 가기</b></span>
                </Link>
            ) : null}
            <Link className="site-nav-drop-item" to="/leword" onClick={() => dispatch({ type: 'close-all' })}>
                <span className="site-nav-drop-icon" aria-hidden="true">L</span>
                <span>
                    <b>LEWORD 열기</b>
                    <small>{who.line}</small>
                </span>
            </Link>
            <button type="button" className="site-nav-drop-item" onClick={() => { dispatch({ type: 'close-all' }); account.logout(); }}>
                <span className="site-nav-drop-icon" aria-hidden="true">↩</span>
                <span><b>로그아웃</b></span>
            </button>
        </NavDropdownShell>
    );
}

type SheetProps = {
    account: NavAccountApi;
    onDone: () => void;
};

/** Top-left cell of the phone list: [Login], or who is logged in with [Logout]. */
export function NavSheetAccount({ account, onDone }: SheetProps) {
    const { who } = account;
    if (!who) {
        return (
            <button type="button" className="site-nav-btn site-nav-btn-line site-nav-sheet-login" onClick={() => { onDone(); account.login(); }}>로그인</button>
        );
    }
    return (
        <button type="button" className="site-nav-btn site-nav-btn-line site-nav-sheet-logout" onClick={() => { onDone(); account.logout(); }}>로그아웃</button>
    );
}

/** "leader01 님" line above the two buttons when logged in. */
export function NavSheetWho({ who }: { who: NavWho | null }) {
    if (!who) return null;
    return <p className="site-nav-sheet-who"><b>{who.userId}</b> 님 · {who.line}</p>;
}
