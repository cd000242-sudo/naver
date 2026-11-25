import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { NAV_CTA, NAV_MOBILE_SECTIONS, isNavPathActive } from '../lib/navMenu.mjs';
import type { BoardNewMap } from '../lib/boardNew.mjs';
import MenuIcon from './MenuIcon';
import NewBadge from './NewBadge';
import NewMark from './NewMark';
import { NavSheetAccount, NavSheetWho, type NavAccountApi } from './NavAccount';

type Props = {
    open: boolean;
    pathname: string;
    search: string;
    unseenNotices: number;
    /** Boards with a post the reader has not seen: their rows wear the yellow NEW! mark. */
    newBoards?: BoardNewMap;
    account: NavAccountApi;
    /** Close the sheet (every row and button calls this, even when the page does not change). */
    onClose: () => void;
};

/**
 * Full-height list for phones and narrow windows: login and free trial on top, then every page under short
 * headings — nothing collapsed. It is `position: fixed` (see navbar.css), so none of its ancestors may use
 * filter / backdrop-filter / transform, which would clip it to the bar's box.
 */
function NavMobileMenu({ open, pathname, search, unseenNotices, newBoards = {}, account, onClose }: Props) {
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
                        <MenuIcon name="profile" small />
                        <span>내 정보</span>
                    </Link>
                ) : null}
                {NAV_MOBILE_SECTIONS.map((section) => (
                    <Fragment key={section.title ?? 'top'}>
                        {section.title && <p className="site-nav-sheet-group">{section.title}{section.badge ? <NewBadge count={unseenNotices} size="md" /> : null}</p>}
                        {section.items.map((row) => (
                            <Link
                                key={row.key}
                                className={`site-nav-sheet-item${row.featured ? ' site-nav-sheet-item-featured' : ''}${row.accent ? ` site-nav-sheet-item-${row.accent}` : ''}${row.silver ? ' site-nav-sheet-item-silver' : ''}`}
                                to={row.to}
                                aria-current={isNavPathActive(row.to, pathname, search) ? 'page' : undefined}
                                onClick={onClose}
                            >
                                <MenuIcon name={row.icon} small />
                                <span>{row.label}</span>
                                {row.small && <small>{row.small}</small>}
                                {row.boardId && newBoards[row.boardId] ? <NewMark /> : null}
                            </Link>
                        ))}
                    </Fragment>
                ))}
            </div>
        </nav>
    );
}

export default NavMobileMenu;
