import type { ReactNode } from 'react';

/**
 * Line icons for the shared shell (notice bar, floating buttons, music, legal page).
 * One set: 24px grid, stroke 1.5, round caps, colour follows the surrounding text (currentColor).
 * They are decorative: the control next to them carries the label, so they stay aria-hidden.
 */
export type ShellIconName =
    | 'chat'
    | 'people'
    | 'play'
    | 'megaphone'
    | 'music'
    | 'close'
    | 'chevronLeft'
    | 'chevronRight'
    | 'chevronDown'
    | 'key'
    | 'phone';

const PATHS: Record<ShellIconName, ReactNode> = {
    chat: <path d="M20 12a7.5 7.5 0 0 1-7.5 7.5H5l1.6-3A7.5 7.5 0 1 1 20 12Z" />,
    people: (
        <>
            <circle cx="9" cy="8.5" r="3" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
            <path d="M15.5 5.8a3 3 0 0 1 0 5.4" />
            <path d="M17.5 14.2a5.5 5.5 0 0 1 3 4.8" />
        </>
    ),
    play: (
        <>
            <rect x="3" y="5.5" width="18" height="13" rx="3.5" />
            <path d="M10.5 9.5v5l4-2.5-4-2.5Z" />
        </>
    ),
    megaphone: (
        <>
            <path d="M4 10v4h3l8 4V6l-8 4H4Z" />
            <path d="M18 9.5a3.5 3.5 0 0 1 0 5" />
            <path d="M8 14.5V18" />
        </>
    ),
    music: (
        <>
            <path d="M9 17.5V6l10-2v11.5" />
            <circle cx="6.5" cy="17.5" r="2.5" />
            <circle cx="16.5" cy="15.5" r="2.5" />
        </>
    ),
    close: <path d="M6 6l12 12M18 6 6 18" />,
    chevronLeft: <path d="M14.5 6 8.5 12l6 6" />,
    chevronRight: <path d="m9.5 6 6 6-6 6" />,
    chevronDown: <path d="m6 9.5 6 6 6-6" />,
    key: (
        <>
            <circle cx="8" cy="15" r="3.5" />
            <path d="M10.6 12.4 19 4" />
            <path d="m15.5 7.5 2.5 2.5" />
        </>
    ),
    phone: (
        <>
            <rect x="7" y="3" width="10" height="18" rx="2.5" />
            <path d="M11 17.5h2" />
        </>
    ),
};

export function ShellIcon({ name, size = 18 }: { name: ShellIconName; size?: number }) {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'block', flex: 'none' }}
        >
            {PATHS[name]}
        </svg>
    );
}

export default ShellIcon;
