import type { Dispatch } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { daysLeft, logoutWeb, type LewordSession } from '../lib/lewordAuth';
import { resolveLoginAction, type MenuAction } from '../lib/navMenu.mjs';
import { useLewordSession } from '../lib/useLewordSession';
import { NavDropdownShell } from './NavDropdown';

export type NavAccountApi = {
    /** The stored LEWORD login, or null when logged out / expired. */
    session: LewordSession | null;
    login: () => void;
    logout: () => void;
};

/**
 * Login state for the menu. The login button reuses the existing LEWORD login (LewordAuth dialog):
 * on /leword it asks the open page, elsewhere it goes there with `?login=1`. Logging out goes through
 * `logoutWeb`, which also frees the server-side web session so another browser can sign in right away.
 */
export function useNavAccount(pathname: string): NavAccountApi {
    const navigate = useNavigate();
    const session = useLewordSession(pathname);

    const login = () => {
        const action = resolveLoginAction(pathname);
        if (action.kind === 'event') window.dispatchEvent(new CustomEvent(action.name));
        else navigate(action.to);
    };
    const logout = () => { void logoutWeb(session); };

    return { session, login, logout };
}

function planLine(session: LewordSession): string {
    const left = daysLeft(session);
    const plan = session.licenseType ? `${session.licenseType} · ` : '';
    return typeof left === 'number' ? `${plan}${left}일 남음` : `${plan}기간 제한 없음`;
}

type BarProps = {
    account: NavAccountApi;
    open: boolean;
    dispatch: Dispatch<MenuAction>;
};

/** Right side of the desktop bar: [Login] when logged out, id + account menu when logged in. */
export function NavAccountBar({ account, open, dispatch }: BarProps) {
    const { session } = account;
    if (!session) {
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
                    <span className="site-nav-avatar" aria-hidden="true">{session.userId.slice(0, 1).toUpperCase()}</span>
                    <span className="site-nav-account-id">{session.userId}</span>
                </>
            )}
            panelClassName="site-nav-drop-account"
        >
            <Link className="site-nav-drop-item" to="/leword" onClick={() => dispatch({ type: 'close-all' })}>
                <span className="site-nav-drop-icon" aria-hidden="true">L</span>
                <span>
                    <b>LEWORD 열기</b>
                    <small>{planLine(session)}</small>
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
    const { session } = account;
    if (!session) {
        return (
            <button type="button" className="site-nav-btn site-nav-btn-line site-nav-sheet-login" onClick={() => { onDone(); account.login(); }}>로그인</button>
        );
    }
    return (
        <button type="button" className="site-nav-btn site-nav-btn-line site-nav-sheet-logout" onClick={() => { onDone(); account.logout(); }}>로그아웃</button>
    );
}

/** "leader01 님" line above the two buttons when logged in. */
export function NavSheetWho({ session }: { session: LewordSession | null }) {
    if (!session) return null;
    return <p className="site-nav-sheet-who"><b>{session.userId}</b> 님 · {planLine(session)}</p>;
}
