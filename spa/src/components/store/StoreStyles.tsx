import { light, lightRadius, motion, type } from '../../styles/tokens';

/**
 * Store styles, light theme.
 *
 * The price is the first thing to read on a card. It uses the body typeface with tabular-nums
 * (a monospace stack falls back to Consolas on Windows). Gold is used as a fill in one place only:
 * the "All in one" add button. Every other control is neutral.
 */
function StoreStyles() {
    const ease = `${motion.fast} ${motion.ease}`;
    return (
        <style>{`
            .st {
                --st-line: ${light.line};
                --st-line-2: ${light.lineStrong};
                --st-card: ${light.surface};
                --st-raised: ${light.raised};
                --st-ink: ${light.text};
                --st-dim: ${light.textSecondary};
                --st-mute: ${light.textMuted};
                --st-gold-ink: ${light.accentInk};
                color: var(--st-ink);
                font-size: ${type.small}px;
                line-height: 1.65;
            }
            .st *, .st *::before, .st *::after { box-sizing: border-box; }
            .st :focus-visible { outline: 2px solid ${light.text}; outline-offset: 2px; }

            .st-head { text-align: center; margin-bottom: 32px; }
            .st-kicker { margin: 0 0 8px; font-size: ${type.meta}px; color: var(--st-mute); }
            .st-head h1, .st-head h2 {
                margin: 0 0 12px; font-size: ${type.h1}px; font-weight: 700; letter-spacing: -.02em; line-height: 1.25;
                color: var(--st-ink);
            }
            /* Korean must not break inside a word: keep-all keeps words whole, balance evens the two lines. */
            .st-sub {
                margin: 0 auto; max-width: 36em; color: var(--st-dim); font-size: ${type.body}px;
                word-break: keep-all; overflow-wrap: break-word; text-wrap: balance;
            }

            .st-terms {
                position: relative; display: inline-flex; margin-top: 24px; padding: 4px; gap: 4px; flex-wrap: wrap; justify-content: center;
                border: 1px solid var(--st-line); border-radius: ${lightRadius.card}px; background: var(--st-raised);
            }
            /* A minimum width keeps the three segments even; the note sits on its own line. */
            .st-terms button {
                display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 0;
                min-width: 96px; min-height: 48px; padding: 4px 16px; border: 0; border-radius: ${lightRadius.control}px;
                background: transparent; color: var(--st-dim); font-family: inherit; font-size: ${type.small}px; font-weight: 500;
                position: relative; z-index: 1; cursor: pointer; white-space: nowrap; line-height: 1.3;
                transition: color ${ease};
            }
            .st-terms button:hover { color: var(--st-ink); }
            /* The dark fill is the sliding .lp-seg-ink pill (motion.css), not the button itself. */
            .st-terms button.on { color: ${light.onBtn}; font-weight: 600; }
            .st-terms em { font-style: normal; font-size: ${type.meta}px; font-weight: 400; margin: 0; color: var(--st-mute); }
            .st-terms button.on em { color: rgba(255, 255, 255, .82); }

            .st-dday {
                display: flex; width: fit-content; max-width: 100%;
                align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center;
                margin: 0 auto 20px; padding: 12px 20px; border-radius: ${lightRadius.control}px;
                border: 1px solid var(--st-line); background: var(--st-card);
                font-size: ${type.small}px; color: var(--st-dim);
            }
            .st-dday b { color: var(--st-ink); font-weight: 600; }
            .st-dday-tag { padding: 4px 12px; border-radius: ${lightRadius.pill}px; background: ${light.accentSoft}; color: var(--st-gold-ink); font-size: ${type.meta}px; font-weight: 600; }
            .st-dday-count { font-weight: 600; color: var(--st-ink); font-variant-numeric: tabular-nums; }

            /* The column count is fixed: auto-fit left an empty fourth track on wide screens. */
            .st-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
            @media (max-width: 980px) { .st-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
            @media (max-width: 640px) { .st-grid { grid-template-columns: minmax(0, 1fr); gap: 16px; } }
            /* Two single-product cards: two columns, no empty third cell. */
            .st-grid.st-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            @media (max-width: 640px) { .st-grid.st-grid-2 { grid-template-columns: minmax(0, 1fr); } }

            .st-card {
                position: relative; border: 1px solid var(--st-line); border-radius: ${lightRadius.card}px; overflow: hidden;
                background: var(--st-card); box-shadow: ${light.shadowSm};
                display: flex; flex-direction: column;
                /* transform: the 2px hover lift shared with the home page (rule in motion.css). */
                transition: border-color ${ease}, transform 240ms ${motion.ease};
            }
            /* Selected state: one gold line. */
            .st-card.on { border-color: ${light.accent}; box-shadow: 0 0 0 1px ${light.accent}; }

            .st-shot { position: relative; aspect-ratio: 16 / 9.6; overflow: hidden; background: var(--st-raised); border-bottom: 1px solid var(--st-line); }
            .st-shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .st-shot-glyph { display: grid; place-items: center; width: 100%; height: 100%; font-size: 44px; color: var(--st-mute); }
            .st-flag {
                position: absolute; left: 12px; top: 12px; z-index: 2; padding: 4px 12px; border-radius: ${lightRadius.pill}px;
                font-size: ${type.meta}px; font-weight: 600;
                background: var(--st-card); color: var(--st-ink); border: 1px solid var(--st-line);
            }

            .st-body { padding: 20px; display: flex; flex-direction: column; flex: 1; }
            .st-card h3 { margin: 0 0 4px; font-size: ${type.lead}px; font-weight: 600; letter-spacing: -.01em; line-height: 1.35; color: var(--st-ink); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
            .st-glyph { color: var(--st-mute); }
            .st-evt { font-style: normal; padding: 4px 12px; border-radius: ${lightRadius.pill}px; font-size: ${type.meta}px; font-weight: 600; background: ${light.accentSoft}; color: var(--st-gold-ink); }
            .st-tag { margin: 0 0 12px; font-size: ${type.meta}px; color: var(--st-mute); }
            .st-what { margin: 0 0 16px; font-size: ${type.small}px; color: var(--st-dim); flex: 1; word-break: keep-all; overflow-wrap: break-word; }
            .st-incl { list-style: none; margin: 0 0 16px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; flex: 1; align-content: flex-start; }
            .st-incl li { padding: 4px 12px; border-radius: ${lightRadius.pill}px; background: var(--st-raised); border: 1px solid var(--st-line); font-size: ${type.small}px; color: var(--st-dim); }

            .st-price { display: flex; align-items: baseline; gap: 8px; border-top: 1px solid var(--st-line); padding-top: 16px; }
            .st-price s { color: var(--st-mute); font-size: ${type.meta}px; font-variant-numeric: tabular-nums; }
            .st-price b {
                font-size: ${type.h2}px; font-weight: 600; letter-spacing: -.02em; line-height: 1.2;
                font-variant-numeric: tabular-nums; color: var(--st-ink);
            }
            .st-price i { font-style: normal; font-size: ${type.small}px; color: var(--st-mute); }
            /* The big slot shows the per-day figure, so this line states what is actually charged. */
            .st-permo {
                margin: 4px 0 0; min-height: 24px; font-size: ${type.small}px;
                color: var(--st-dim); font-variant-numeric: tabular-nums;
            }
            .st-permo strong { color: var(--st-ink); font-weight: 600; }
            .st-permo s { margin-right: 4px; color: var(--st-mute); }
            .st-fine { margin: 4px 0 0; font-size: ${type.small}px; line-height: 1.6; color: var(--st-dim); }

            /* Add button: neutral dark fill on product cards, gold fill on the bundle only. */
            .st-buy {
                display: flex; align-items: center; justify-content: center; gap: 8px;
                margin-top: 16px; min-height: 48px; padding: 0 16px; border: 1px solid ${light.btn}; border-radius: ${lightRadius.control}px;
                background: ${light.btn}; color: ${light.onBtn};
                font-family: inherit; font-size: ${type.body}px; font-weight: 600; cursor: pointer;
                transition: background-color ${ease}, border-color ${ease}, color ${ease};
            }
            .st-buy:hover { background: #2b3036; border-color: #2b3036; }
            .st-bundle .st-buy { background: ${light.accent}; border-color: ${light.accent}; color: ${light.onAccent}; }
            .st-bundle .st-buy:hover { background: #e6a800; border-color: #e6a800; }
            /* Already added: a quiet state. Pressing again removes it, so it stays a button. */
            .st-buy.on, .st-bundle .st-buy.on { background: var(--st-card); color: var(--st-ink); border-color: ${light.accent}; }
            .st-buy.on:hover, .st-bundle .st-buy.on:hover { background: var(--st-raised); border-color: ${light.accent}; }

            /* The bundle is the face of the shelf: first, full width, stacked (media, then price and button). */
            .st-bundle {
                grid-column: 1 / -1;
                width: 100%; margin: 0 0 4px;
                display: grid; grid-template-columns: minmax(0, 1fr);
                align-items: stretch;
            }
            .st-bundle-proof {
                padding: 20px; border-right: 1px solid var(--st-line);
                display: flex; align-items: center; min-width: 0;
            }
            .st-bundle-proof > * { width: 100%; }
            .st-bundle .st-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
            .st-bundle .st-body > h3, .st-bundle .st-body > .st-tag { margin: 0; }
            .st-bundle .st-incl { margin: 0; }
            .st-bundle-media { margin: 0; }
            .st-bundle-side { display: flex; flex-direction: column; gap: 12px; }
            .st-bundle-side .st-price, .st-bundle-side .st-permo,
            .st-bundle-side .st-trust, .st-bundle-side .st-buy { margin: 0; }
            .st-plain-side { display: contents; }

            .st-trust {
                display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 8px; margin: 0; padding: 12px 8px;
                border-radius: ${lightRadius.control}px; background: var(--st-raised);
            }
            .st-trust div { text-align: center; min-width: 0; }
            .st-trust b { display: flex; align-items: center; justify-content: center; gap: 4px; color: var(--st-ink); font-size: ${type.small}px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
            .st-trust b svg { color: var(--st-mute); }
            .st-trust span { display: block; margin-top: 4px; color: var(--st-mute); font-size: ${type.meta}px; line-height: 1.4; word-break: keep-all; }
            .st-bundle h3 { font-size: ${type.h3}px; }
            .st-bundle-media .purchase-video-frame video { max-height: 340px; }

            .st-cart {
                margin-top: 24px; border: 1px solid var(--st-line); border-radius: ${lightRadius.card}px;
                background: var(--st-card); box-shadow: ${light.shadowFloat};
                padding: 16px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
            }
            .st-cart-items { display: flex; gap: 8px; flex-wrap: wrap; }
            .st-cart-items span { padding: 4px 12px; border-radius: ${lightRadius.pill}px; background: var(--st-raised); border: 1px solid var(--st-line); font-size: ${type.small}px; color: var(--st-ink); }
            .st-cart-items b { color: var(--st-mute); font-weight: 400; margin-left: 4px; }
            .st-cart-total { margin-left: auto; text-align: right; }
            .st-cart-total em { display: block; font-style: normal; font-size: ${type.meta}px; color: var(--st-mute); }
            .st-cart-total strong { font-size: ${type.h3}px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -.02em; color: var(--st-ink); }
            .st-cart-go {
                display: inline-flex; align-items: center; justify-content: center;
                min-height: 48px; padding: 0 28px; border: 0; border-radius: ${lightRadius.control}px; text-decoration: none; white-space: nowrap;
                background: ${light.btn}; color: ${light.onBtn}; cursor: pointer; font-family: inherit;
                font-size: ${type.body}px; font-weight: 600;
                transition: background-color ${ease};
            }
            .st-cart-go:hover { background: #2b3036; }

            .st-proof { margin: 0 0 24px; }

            /* Questions that remain after seeing the price. Quiet until opened. */
            .st-notes { margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--st-line); }
            .st-faq { margin-bottom: 12px; }
            .st-faq summary {
                cursor: pointer; min-height: 44px; padding: 8px 0; color: var(--st-ink);
                font-size: ${type.body}px; font-weight: 600;
            }
            .st-faq summary:hover { color: var(--st-dim); }
            .st-faq > div { padding: 4px 0 8px; display: grid; gap: 16px; max-width: 46em; }
            .st-faq p { margin: 0; color: var(--st-dim); font-size: ${type.small}px; line-height: 1.7; }
            .st-faq b { color: var(--st-ink); font-weight: 600; }
            .st-note-line { margin: 8px 0 0; color: var(--st-dim); font-size: ${type.small}px; line-height: 1.6; }
            .st-note-line a { color: var(--st-gold-ink); text-decoration: underline; text-underline-offset: 3px; font-weight: 500; }

            /* ── Payment method dialog ─────────────────────── */
            .st-pay-backdrop {
                position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center;
                background: rgba(20, 24, 28, .45); padding: 16px;
            }
            .st-pay {
                width: min(460px, 100%); border-radius: ${lightRadius.panel}px; padding: 24px;
                max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px); overflow-y: auto; overscroll-behavior: contain;
                background: var(--st-card); border: 1px solid var(--st-line);
                box-shadow: ${light.shadowFloat};
            }
            .st-pay-head { position: relative; margin-bottom: 16px; padding-right: 44px; }
            .st-pay-head b { display: block; color: var(--st-ink); font-size: ${type.lead}px; font-weight: 600; }
            .st-pay-head span { color: var(--st-dim); font-size: ${type.small}px; }
            .st-pay-close {
                position: absolute; top: -8px; right: -8px; width: 44px; height: 44px;
                display: grid; place-items: center; border: 0; border-radius: ${lightRadius.control}px; background: none;
                color: var(--st-dim); cursor: pointer; padding: 0;
                transition: background-color ${ease}, color ${ease};
            }
            .st-pay-close:hover { color: var(--st-ink); background: var(--st-raised); }
            /* Order summary: the amount must be visible inside the dialog. */
            .st-pay-sum {
                display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
                padding: 12px 16px; border-radius: ${lightRadius.control}px; margin-bottom: 16px;
                background: var(--st-raised);
            }
            .st-pay-sum span { color: var(--st-dim); font-size: ${type.small}px; }
            .st-pay-sum b { color: var(--st-ink); font-size: ${type.h3}px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

            /* The email that receives the licence. There is no login, so this is the only channel. */
            .st-pay-mail { display: block; margin-bottom: 16px; }
            .st-pay-mail > span { display: block; margin-bottom: 8px; color: var(--st-ink); font-size: ${type.small}px; font-weight: 600; }
            .st-pay-mail input {
                width: 100%; box-sizing: border-box; min-height: 48px; padding: 0 16px; border-radius: ${lightRadius.control}px;
                border: 1px solid var(--st-line-2); background: var(--st-card);
                color: var(--st-ink); font: inherit; font-size: ${type.body}px;
            }
            .st-pay-mail input::placeholder { color: var(--st-mute); }
            .st-pay-mail input:focus { outline: 2px solid ${light.text}; outline-offset: 1px; }
            .st-pay-mail input.warn { border-color: ${light.negative}; }
            .st-pay-mail em {
                display: block; margin-top: 8px; font-style: normal;
                color: var(--st-dim); font-size: ${type.meta}px; line-height: 1.55;
            }
            .st-pay-mail input.warn + em { color: ${light.negative}; }

            .st-pay-consent {
                display: flex; gap: 12px; align-items: flex-start; margin: 16px 0; padding: 16px;
                border-radius: ${lightRadius.control}px; background: var(--st-raised);
                color: var(--st-ink); font-size: ${type.small}px; line-height: 1.7;
            }
            .st-pay-consent input { width: 20px; height: 20px; margin: 2px 0 0; flex-shrink: 0; accent-color: ${light.btn}; }
            .st-pay-consent a { color: var(--st-gold-ink); text-decoration: underline; text-underline-offset: 3px; }
            .st-pay-term { margin: 16px 0 0; color: var(--st-dim); font-size: ${type.small}px; line-height: 1.7; }
            .st-pay-foot { margin: 12px 0 0; color: var(--st-mute); font-size: ${type.meta}px; line-height: 1.6; }

            .st-pay-opt {
                display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box;
                min-height: 64px; padding: 12px 16px; margin-top: 8px; border-radius: ${lightRadius.control}px; text-align: left;
                border: 1px solid var(--st-line-2); background: var(--st-card);
                color: var(--st-ink); text-decoration: none; cursor: pointer; font-family: inherit;
                transition: background-color ${ease}, border-color ${ease};
            }
            .st-pay-opt:hover { border-color: var(--st-ink); background: var(--st-raised); }
            .st-pay-ico { display: grid; place-items: center; color: var(--st-dim); }
            .st-pay-body { flex: 1; min-width: 0; }
            .st-pay-body b { display: block; color: var(--st-ink); font-size: ${type.body}px; font-weight: 600; }
            .st-pay-body em { font-style: normal; color: var(--st-dim); font-size: ${type.meta}px; line-height: 1.5; font-variant-numeric: tabular-nums; }
            .st-pay-opt i { display: grid; place-items: center; color: var(--st-mute); font-style: normal; }

            .st-swap { margin-top: 12px; padding: 16px 20px; border: 1px solid var(--st-line); background: var(--st-raised); border-radius: ${lightRadius.control}px; font-size: ${type.small}px; line-height: 1.6; color: var(--st-dim); font-variant-numeric: tabular-nums; }
            .st-swap b { color: var(--st-ink); font-weight: 600; }
            .st-swap button { display: inline-flex; align-items: center; min-height: 44px; margin-left: 8px; padding: 0; border: 0; background: none; cursor: pointer; font-family: inherit; font-size: ${type.small}px; font-weight: 500; color: var(--st-gold-ink); text-decoration: underline; text-underline-offset: 3px; }

            @media (max-width: 720px) {
                .st-head h1, .st-head h2 { font-size: ${type.h1Mobile}px; }
                .st-sub { font-size: ${type.small}px; }
                .st-cart-total { margin-left: 0; text-align: left; }
                .st-cart-go { width: 100%; }
            }
            @media (max-width: 640px) {
                .st-bundle .st-body { padding: 16px; }
                .st-terms button { min-width: 88px; padding: 4px 12px; }
            }
        `}</style>
    );
}

export default StoreStyles;
