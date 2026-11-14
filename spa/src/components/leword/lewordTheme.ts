import { light, motion } from '../../styles/tokens';

/**
 * LEWORD console theme (2026-11 light pass, step 1).
 *
 * Every colour the console stylesheet uses is one of these `--lw-*` variables. The values are
 * generated from `light` in styles/tokens.ts, so the console can never drift from the site:
 * `light.accentInk` becomes `--lw-accent-ink`, `light.textSecondary` becomes `--lw-text-secondary`.
 * The one extra value, `--lw-scrim`, is `light.text` at 40% for modal backdrops.
 */
const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/**
 * Side-tab marks (the owner's per-tab colours, 2026-08-20), now only on the small icon glyph.
 * Most reuse the light ramp; four have no token and are darkened so they read on white.
 */
const TAB_INKS: Record<string, string> = {
    golden: light.accentInk, issue: light.negative, homefeed: '#7651c4', adsense: light.accentInk, analyze: '#2f6db5',
    plan: light.accentInk, kin: light.positive, affiliate: '#b55a17', youtube: light.negative,
    radar: light.positive, rank: '#b23c78', keys: light.textMuted,
};

export const LEWORD_THEME_VARS = [
    ...Object.entries(light).map(([key, value]) => `--lw-${kebab(key)}: ${value};`),
    ...Object.entries(TAB_INKS).map(([tab, value]) => `--lw-tab-${tab}: ${value};`),
    '--lw-scrim: rgba(28, 32, 36, 0.4);',
    `--lw-ease: ${motion.ease};`,
    `--lw-fast: ${motion.fast};`,
    `--lw-enter: ${motion.enter};`,
].join('\n');

/**
 * Console motion (calm, work-screen pace). Only transform and opacity move, and all of it is
 * switched off under prefers-reduced-motion. The skeleton sweep is the only repeating motion.
 */
export const LEWORD_MOTION_CSS = `
    /* Sliding gold bar beside the active side tab (LewordNavInk). */
    .lw-nav { position: relative; }
    .lw-nav-ink {
        position: absolute; left: 0; top: 0; width: 3px; height: 100px;
        border-radius: 2px; background: var(--lw-accent); transform-origin: 50% 0; pointer-events: none;
        transition: transform var(--lw-enter) var(--lw-ease), opacity var(--lw-fast) ease;
    }

    /* Tab content enters with a short fade and a small rise. */
    .lw-pane { min-width: 0; animation: lw-pane-in 200ms var(--lw-ease); }
    @keyframes lw-pane-in { from { opacity: 0; transform: translate3d(0, 8px, 0); } }

    /* Loading placeholder: a soft light passes over neutral bars. */
    .lw-skel { display: flex; flex-direction: column; gap: 12px; margin: 12px 0 0; }
    .lw-skel i {
        position: relative; display: block; height: 96px; overflow: hidden;
        border: 1px solid var(--lw-line); border-radius: 14px; background: var(--lw-raised);
    }
    .lw-skel i::after {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0));
        transform: translate3d(-100%, 0, 0);
        animation: lw-skel-sweep 1.4s var(--lw-ease) infinite;
    }
    @keyframes lw-skel-sweep { to { transform: translate3d(100%, 0, 0); } }

    /* Selection is a gold line on a soft gold face, not a gold fill (the fill is kept for one primary button). */
    .lw-segment button.on { background: var(--lw-accent-soft); border-color: var(--lw-accent); color: var(--lw-text); }
    .lw-topic-tabs button.on { border-bottom-color: var(--lw-accent); }

    /* Touch targets: 44px for the shared filter chips, account buttons and card controls. */
    .lw-segment button, .lw-topic-tabs button, .lw-acct-btn,
    .lw-mindmap-branches a, .lw-mindmap-branches button { min-height: 44px; }
    .lw-acct-btn, .lw-write-hint-link { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; }
    .lw-copy-mini { min-width: 44px; min-height: 44px; }

    /* Counters inside the metric grid keep the number's own look (the grid styles every span as a label). */
    .lw-card-metrics .lp-count { display: inline-grid; margin: 0; color: inherit; font-size: inherit; font-weight: inherit; }
    .lw-card-metrics .lp-count span { display: block; margin: 0; color: inherit; font-size: inherit; font-weight: inherit; }

    /* Result cards: a quiet border and shadow on hover, 1px lift at most. */
    .lw-board-list .lw-card-pre {
        transition: border-color var(--lw-fast) var(--lw-ease), box-shadow var(--lw-fast) var(--lw-ease),
            transform var(--lw-fast) var(--lw-ease);
    }
    @media (hover: hover) {
        .lw-board-list .lw-card-pre:hover {
            border-color: var(--lw-line-strong); background: var(--lw-surface);
            box-shadow: var(--lw-shadow-float); transform: translate3d(0, -1px, 0);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .lw-pane, .lw-skel i::after { animation: none; }
        .lw-nav-ink, .lw-board-list .lw-card-pre { transition: none; }
        .lw-board-list .lw-card-pre:hover { transform: none; }
    }
`;
