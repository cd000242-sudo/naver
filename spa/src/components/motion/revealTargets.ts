/**
 * What the page-wide scroll reveal (RevealScope.ts) animates on the public pages.
 *
 * Class names here belong to the page style blocks; inline-styled markup opts in with `data-rv`.
 * A selector that matches nothing is harmless (that element simply appears without motion).
 * Never list an element that needs its own `transform` to sit in place (centred chips, fixed bars).
 */
const ITEMS = [
    '[data-rv]',
    // Product pages (components/products/ProductPageStyles.tsx)
    '.pp-hero-sub', '.pp-hero .pp-actions', '.pp-vs', '.pp-proof > a',
    '.pp-h2', '.pp-lead', '.pp-band-copy', '.pp-shot', '.pp-all > li',
    '.pp-bar', '.pp-source', '.pp-price', '.pp-price-cta', '.pp-plist > li',
    '.pp-quotes > blockquote', '.pp-more', '.pp-faq > details',
    '.pp-proofs > h3', '.pp-proofs > p', '.pp-proofs-row > li', '.pp-companion',
    '.pp-close .pp-actions', '.pp-pb-links',
    // Store (components/store/StoreStyles.tsx) and the pricing page
    '.st-sub', '.st-terms', '.st-dday', '.st-grid > .st-card', '.st-notes',
    '.st-faq > *', '.purchase-video-rotor',
    // Reviews
    '.reviews-page-head > div > p', '.rv-sec', '.rv-proofs > figure', '.rv-feat', '.rv-card', '.rv-empty',
    '.reviews-contact-grid > *',
    // Download
    '.download-product-grid > *',
    // Briefing, briefing archive, keyword detail
    '.briefing-page-head > p', '.briefing-archive-panel > p', '.briefing-archive-table tbody tr',
    '.kw-detail-panel', '.kw-metric', '.kw-related li',
];

/** Product screen captures: they rise a little further and settle a little slower. */
const SHOTS = ['.pp-shot', '.pp-proofs-row > li', '.rv-proofs > figure', '[data-rv="shot"]'];

export const REVEAL_ITEM_SELECTOR = ITEMS.join(', ');
export const REVEAL_SHOT_SELECTOR = SHOTS.join(', ');
