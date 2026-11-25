import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from 'react';
import { ShellIcon } from './ShellIcons';
import { CHAT_ROOMS, roomMenuTarget } from '../lib/floatRooms';
import { light, lightRadius, type } from '../styles/tokens';

const MENU_ID = 'lp-float-room-menu';

/**
 * The box sits in the same fixed wrapper as the button, so it follows the button's width: on the left of it,
 * bottom-aligned, never wider than the screen. Phone width (button shrinks to an icon) only moves the wrapper in.
 */
const CSS = `
    .lp-float-room-wrap { position: fixed; right: 24px; z-index: 10001; }
    .lp-float-room-wrap .lp-float-room { position: relative; cursor: pointer; }
    .lp-float-room[aria-expanded="true"] { background: ${light.raised} !important; border-color: ${light.lineStrong} !important; }
    .lp-float-room-menu { position: absolute; right: calc(100% + 8px); bottom: 0; box-sizing: border-box; max-width: calc(100vw - 96px); display: grid; gap: 4px; padding: 6px; background: ${light.surface}; border: 1px solid ${light.line}; border-radius: ${lightRadius.card}px; box-shadow: ${light.shadowFloat}; }
    .lp-float-room-menu[hidden] { display: none; }
    .lp-float-room-item { display: flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: ${lightRadius.control}px; color: ${light.text}; font-size: ${type.small}px; font-weight: 500; line-height: 1.2; white-space: nowrap; text-decoration: none; }
    .lp-float-room-item:hover { background: ${light.raised}; }
    .lp-float-room-item:focus-visible { outline: 2px solid ${light.text}; outline-offset: 2px; }
    @media (max-width: 768px) { .lp-float-room-wrap { right: 12px; } }
`;

type Props = {
    /** Look of the other floating buttons (everything except where they sit). */
    faceStyle: CSSProperties;
    /** CSS `bottom` of this slot. */
    bottom: string;
};

/** "단톡방 바로가기": opens a small box beside the button with one new-tab link per room. */
function FloatRoomPicker({ faceStyle, bottom }: Props) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);

    // Open: the first room takes the focus. Outside click or Esc closes (Esc also hands the focus back to the button).
    useEffect(() => {
        if (!open) return undefined;
        itemRefs.current[0]?.focus();
        const onPointerDown = (event: PointerEvent) => {
            if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: globalThis.KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            triggerRef.current?.focus();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    // Tabbing out to another element closes it (a click elsewhere is the pointerdown case above).
    const onBlur = (event: FocusEvent<HTMLDivElement>) => {
        const next = event.relatedTarget as Node | null;
        if (next && !event.currentTarget.contains(next)) setOpen(false);
    };
    const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const current = itemRefs.current.findIndex((node) => node === document.activeElement);
        const next = roomMenuTarget(Math.max(current, 0), event.key, CHAT_ROOMS.length);
        if (next === null) return;
        event.preventDefault();
        itemRefs.current[next]?.focus();
    };
    const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
        event.preventDefault();
        setOpen(true);
    };

    return (
        <>
            <style>{CSS}</style>
            <div ref={wrapRef} className="lp-float-room-wrap" style={{ bottom }} onBlur={onBlur}>
                <button
                    ref={triggerRef}
                    type="button"
                    className="lp-float-link lp-float-room"
                    title="단톡방 바로가기"
                    aria-label="단톡방 바로가기"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-controls={MENU_ID}
                    onClick={() => setOpen(!open)}
                    onKeyDown={onTriggerKeyDown}
                    style={faceStyle}
                >
                    <ShellIcon name="people" />
                    <span className="lp-float-label">단톡방 바로가기</span>
                </button>
                <div id={MENU_ID} role="menu" aria-label="단톡방 고르기" className="lp-float-room-menu" hidden={!open} onKeyDown={onMenuKeyDown}>
                    {CHAT_ROOMS.map((room, index) => (
                        <a
                            key={room.key}
                            ref={(node) => { itemRefs.current[index] = node; }}
                            role="menuitem"
                            className="lp-float-room-item"
                            href={room.href}
                            target="_blank"
                            rel="noopener"
                            onClick={() => setOpen(false)}
                        >
                            {room.label}
                        </a>
                    ))}
                </div>
            </div>
        </>
    );
}

export default FloatRoomPicker;
