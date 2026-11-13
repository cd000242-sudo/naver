import type { ReactNode } from 'react';

/**
 * Line icons for the purchase screens (store dialog, bank order, lookup).
 * Same drawing rules as ShellIcons: 24px grid, stroke 1.5, round caps, currentColor.
 * Decorative only: the label next to each icon carries the meaning, so they stay aria-hidden.
 */
export type StoreIconName = 'card' | 'bank' | 'check' | 'cross' | 'clock' | 'star' | 'shield' | 'chevron';

const PATHS: Record<StoreIconName, ReactNode> = {
    card: (
        <>
            <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
            <path d="M3 10h18" />
            <path d="M7 14.5h3.5" />
        </>
    ),
    bank: (
        <>
            <path d="M4 9.5 12 5l8 4.5" />
            <path d="M5 9.5h14" />
            <path d="M7 12.5v4M12 12.5v4M17 12.5v4" />
            <path d="M4.5 19h15" />
        </>
    ),
    check: <path d="m6 12.5 4 4 8-9" />,
    cross: <path d="M7 7l10 10M17 7 7 17" />,
    clock: (
        <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4.5l3 1.5" />
        </>
    ),
    star: <path d="m12 4.5 2.3 4.7 5.2.7-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.8-3.6 5.2-.7Z" />,
    shield: (
        <>
            <path d="M12 4 5.5 6.5v5c0 4 2.7 7 6.5 8.5 3.8-1.5 6.5-4.5 6.5-8.5v-5Z" />
            <path d="m9.2 12.2 2 2 3.6-4" />
        </>
    ),
    chevron: <path d="m9.5 6 6 6-6 6" />,
};

export function StoreIcon({ name, size = 18 }: { name: StoreIconName; size?: number }) {
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

export default StoreIcon;
