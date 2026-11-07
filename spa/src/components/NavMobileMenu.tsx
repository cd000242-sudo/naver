import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { NAV_CTA, NAV_MOBILE_SECTIONS, isNavPathActive } from '../lib/navMenu.mjs';
import NewBadge from './NewBadge';
import { NavSheetAccount, NavSheetWho, type NavAccountApi } from './NavAccount';

type Props = {
    open: boolean;
    pathname: string;
    unseenNotices: number;
    account: NavAccountApi;
    /** Close the sheet (every row and button calls this, even when the page does not change). */
    onClose: () => void;
};

/**
 * Full-height list for phones and narrow windows: login and free trial on top, then every page under short
 * headings — nothing collapsed. It is `position: fixed` (see navbar.css), so none of its ancestors may use
 * filter / backdrop-filter / transform, which would clip it to the bar's box.
 */
function NavMobileMenu({ open, pathname, unseenNotices, account, onClose }: Props) {
    return (
        <nav className="site-nav-sheet" id="site-nav-sheet" aria-label="전체 메뉴" hidden={!open}>
            <div className="site-nav-sheet-in">
                <NavSheetWho who={account.who} />
                <div className="site-nav-sheet-actions">
                    <NavSheetAccount account={account} onDone={onClose} />
                    <Link className="site-nav-btn site-nav-btn-cta" to={NAV_CTA.to} onClick={onClose}>{NAV_CTA.label}</Link>
                </div>
                {account.who?.community ? (
                    <Link className="site-nav-sheet-item" to="/me" aria-current={isNavPathActive('/me', pathname) ? 'page' : undefined} onClick={onClose}>
                        <span>내 정보</span>
                    </Link>
                ) : null}
                {NAV_MOBILE_SECTIONS.map((section) => (
                    <Fragment key={section.title ?? 'top'}>
                        {section.title && <p className="site-nav-sheet-group">{section.title}</p>}
                        {section.items.map((row) => (
                            <Link
                                key={row.key}
                                className="site-nav-sheet-item"
                                to={row.to}
                                aria-current={isNavPathActive(row.to, pathname) ? 'page' : undefined}
                                onClick={onClose}
                            >
                                <span>{row.label}</span>
                                {row.small && <small>{row.small}</small>}
                                {row.badge && <NewBadge count={unseenNotices} size="md" />}
                            </Link>
                        ))}
                    </Fragment>
                ))}
            </div>
        </nav>
    );
}

export default NavMobileMenu;
