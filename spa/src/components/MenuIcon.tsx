import community from '../assets/menu-icons/community.svg';
import download from '../assets/menu-icons/download.svg';
import leword from '../assets/menu-icons/leword.svg';
import logout from '../assets/menu-icons/logout.svg';
import orderSearch from '../assets/menu-icons/order-search.svg';
import products from '../assets/menu-icons/products.svg';
import profile from '../assets/menu-icons/profile.svg';
import trialPurchase from '../assets/menu-icons/trial-purchase.svg';

/** The eight menu icons (24px line drawings, no background); the golden square behind them is drawn by CSS. */
export const MENU_ICONS = Object.freeze({
    'trial-purchase': trialPurchase,
    'order-search': orderSearch,
    products,
    download,
    community,
    profile,
    leword,
    logout,
});

export type MenuIconName = keyof typeof MENU_ICONS;

/**
 * One menu icon. The words sit right next to it, so it is hidden from screen readers (alt="" + aria-hidden)
 * and never makes the row's name read twice. `small` is the phone-list size.
 */
export function MenuIcon({ name, small = false }: { name: string | undefined; small?: boolean }) {
    if (!name || !Object.prototype.hasOwnProperty.call(MENU_ICONS, name)) return null;
    return (
        <span className={small ? 'site-nav-icon site-nav-icon-sm' : 'site-nav-icon'} aria-hidden="true">
            <img src={MENU_ICONS[name as MenuIconName]} alt="" width={small ? 20 : 24} height={small ? 20 : 24} draggable={false} />
        </span>
    );
}

export default MenuIcon;
