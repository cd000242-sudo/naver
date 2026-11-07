export const NAV_BREAKPOINT: number;
export const NAV_CTA: Readonly<{ label: string; shortLabel: string; to: string }>;
export const NAV_LOGIN_PATH: string;
export const LOGIN_EVENT: string;

export type NavChild = Readonly<{ key: string; label: string; to: string; icon: string; desc: string; short?: string }>;
export type NavLinkItem = Readonly<{ type: 'link'; key: string; label: string; to: string; badge?: boolean }>;
export type NavGroupItem = Readonly<{ type: 'group'; key: string; label: string; items: readonly NavChild[] }>;
export type NavItem = NavLinkItem | NavGroupItem;
export type NavSheetRow = Readonly<{ key: string; label: string; to: string; small?: string; badge?: boolean }>;
export type NavSheetSection = Readonly<{ title: string | null; items: readonly NavSheetRow[] }>;

export const NAV_ITEMS: readonly NavItem[];
export const NAV_MOBILE_SECTIONS: readonly NavSheetSection[];

export function navDestinations(): string[];
export function normalizeNavPath(pathname: string): string;
export function isNavPathActive(to: string, pathname: string): boolean;
export function isNavGroupActive(item: NavItem, pathname: string): boolean;

export type MenuState = Readonly<{ dropdown: string | null; pinned: boolean; mobileOpen: boolean }>;
export type MenuAction =
    | { type: 'toggle-dropdown' | 'hover-open' | 'hover-leave' | 'focus-out'; key: string }
    | { type: 'outside-click' | 'toggle-mobile' | 'close-mobile' | 'resize-wide' | 'escape' | 'route-change' | 'close-all' };

export const INITIAL_MENU_STATE: MenuState;
export function menuReducer(state: MenuState, action: MenuAction): MenuState;

export type LoginAction = { kind: 'navigate'; to: string };
export function resolveLoginAction(pathname: string, search?: string): LoginAction;
