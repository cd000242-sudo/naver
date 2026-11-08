import { useRef, type Dispatch, type KeyboardEvent, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isNavPathActive, isNavGroupActive, type MenuAction, type NavGroupItem } from '../lib/navMenu.mjs';
import MenuIcon from './MenuIcon';
import NewBadge from './NewBadge';

function Chevron() {
    return (
        <svg className="site-nav-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}

type ShellProps = {
    dropKey: string;
    open: boolean;
    dispatch: Dispatch<MenuAction>;
    /** Extra class on the wrapper. */
    className?: string;
    triggerClassName: string;
    triggerContent: ReactNode;
    /** Marks the trigger as "current section" (a page inside this dropdown is open). */
    active?: boolean;
    panelClassName?: string;
    children: ReactNode;
};

/**
 * Disclosure button + panel shared by the menu groups and the account menu.
 * Mouse: hover opens, a click pins it. Keyboard: Enter/Space toggles, Tab walks the items, Esc closes and
 * returns to the button, and Tab leaving the whole thing closes it.
 */
export function NavDropdownShell({ dropKey, open, dispatch, className, triggerClassName, triggerContent, active, panelClassName, children }: ShellProps) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelId = `site-nav-drop-${dropKey}`;
    // Hover only for a real mouse: touch taps also fire pointerenter and would race with the tap's own click.
    const onPointerEnter = (event: PointerEvent) => { if (event.pointerType === 'mouse') dispatch({ type: 'hover-open', key: dropKey }); };
    const onPointerLeave = (event: PointerEvent) => { if (event.pointerType === 'mouse') dispatch({ type: 'hover-leave', key: dropKey }); };
    const onBlur = (event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dispatch({ type: 'focus-out', key: dropKey });
    };
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || !open) return;
        dispatch({ type: 'escape' });
        triggerRef.current?.focus();
    };

    return (
        <div
            className={`site-nav-item has-drop${open ? ' open' : ''}${className ? ` ${className}` : ''}`}
            data-group={dropKey}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
        >
            <button
                ref={triggerRef}
                type="button"
                className={`${triggerClassName}${active ? ' is-active' : ''}`}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => dispatch({ type: 'toggle-dropdown', key: dropKey })}
            >
                {triggerContent}
                <Chevron />
            </button>
            <div className={`site-nav-drop${panelClassName ? ` ${panelClassName}` : ''}`} id={panelId} hidden={!open}>
                {children}
            </div>
        </div>
    );
}

type GroupProps = { item: NavGroupItem; pathname: string; search: string; unseenNotices: number; open: boolean; dispatch: Dispatch<MenuAction> };

/** A "Product ▾" / "Price·Buy ▾" / "Community ▾" group of the desktop bar. */
function NavDropdown({ item, pathname, search, unseenNotices, open, dispatch }: GroupProps) {
    return (
        <NavDropdownShell
            dropKey={item.key}
            open={open}
            dispatch={dispatch}
            triggerClassName="site-nav-link site-nav-trigger"
            triggerContent={<>{item.label}{item.badge ? <NewBadge count={unseenNotices} size="md" /> : null}</>}
            active={isNavGroupActive(item, pathname)}
        >
            {item.items.map((child) => {
                const current = isNavPathActive(child.to, pathname, search);
                return (
                    <Link
                        key={child.key}
                        className="site-nav-drop-item"
                        to={child.to}
                        aria-current={current ? 'page' : undefined}
                        onClick={() => dispatch({ type: 'close-all' })}
                    >
                        <MenuIcon name={child.icon} />
                        <span>
                            <b>{child.label}</b>
                            <small>{child.desc}</small>
                        </span>
                    </Link>
                );
            })}
        </NavDropdownShell>
    );
}

export default NavDropdown;
