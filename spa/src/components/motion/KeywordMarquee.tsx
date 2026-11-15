import { useRef, type CSSProperties } from 'react';
import { useOnScreen } from './useMotionHooks';

export type MarqueeItem = { key: string; label: string; href: string };

type KeywordMarqueeProps = {
    items: MarqueeItem[];
    title: string;
    /** Seconds one item takes to travel; total loop time scales with the item count. */
    secondsPerItem?: number;
};

/**
 * A single slow ribbon of real keywords moving sideways. Pauses on hover/focus and while
 * off-screen. Renders nothing when there are no items. Reduced motion turns it into a
 * plain horizontally scrollable row.
 */
function KeywordMarquee({ items, title, secondsPerItem = 3.2 }: KeywordMarqueeProps) {
    const ref = useRef<HTMLDivElement>(null);
    const onScreen = useOnScreen(ref);
    if (items.length === 0) return null;
    const style = { '--lp-marquee-dur': `${Math.max(24, items.length * secondsPerItem)}s` } as CSSProperties;
    const renderList = (copy: boolean) => (
        <ul className="lp-marquee-list" aria-hidden={copy || undefined}>
            {items.map((item) => (
                <li key={`${copy ? 'b' : 'a'}-${item.key}`}>
                    <a href={item.href} target="_blank" rel="noreferrer" tabIndex={copy ? -1 : undefined}>{item.label}</a>
                </li>
            ))}
        </ul>
    );
    return (
        <div ref={ref} className={`lp-marquee${onScreen ? '' : ' is-offscreen'}`} style={style}>
            <span className="lp-marquee-title">{title}</span>
            <div className="lp-marquee-viewport">
                <div className="lp-marquee-track">
                    {renderList(false)}
                    {renderList(true)}
                </div>
            </div>
        </div>
    );
}

export default KeywordMarquee;
