import { light, lightRadius, motion, type } from '../../styles/tokens';

/**
 * Shared styles for the four product pages, light theme (2026-11).
 * Layout and section order are unchanged from the 2026-10-07 redesign; only colour, type, radius and depth moved to tokens.
 * One neutral ramp, three text roles, one accent: gold is a fill on the primary button only and ink (accentInk) everywhere else.
 * Real screenshots keep their own colours; only the frame around them is a light surface with a thin line.
 */
export default function ProductPageStyles() {
    const ease = `${motion.fast} ${motion.ease}`;
    return (
        <style>{`
.pp { --pp-ground:${light.page}; --pp-panel:${light.surface}; --pp-raised:${light.raised}; --pp-line:${light.line}; --pp-line-strong:${light.lineStrong};
  --pp-ink:${light.text}; --pp-ink-2:${light.textSecondary}; --pp-ink-3:${light.textMuted}; --pp-gold:${light.accentInk};
  background:transparent; color:var(--pp-ink); font-family:'Pretendard Variable',Pretendard,system-ui,-apple-system,'Segoe UI',sans-serif; font-size:${type.body}px; line-height:1.65; -webkit-font-smoothing:antialiased; word-break:keep-all; overflow-wrap:break-word; }
/* The page colour comes from <body> (same value as --pp-ground), so the ambient light layer behind the content stays visible. */
.pp ::selection { background:${light.accentSoft}; color:${light.text}; }
:where(.pp) a { color:inherit; text-decoration:none; }
.pp :focus-visible { outline:2px solid ${light.text}; outline-offset:2px; border-radius:${lightRadius.control}px; }
.pp-wrap { width:min(1360px, 100% - 64px); margin:0 auto; }
.pp-num { font-variant-numeric:tabular-nums; }

/* First screen: promise on the left, comparison panel on the right. The fixed menu bar covers the top. */
.pp-hero { padding:144px 0 48px; }
.pp-hero-grid { display:grid; grid-template-columns:minmax(0,5fr) minmax(0,7fr); gap:64px; align-items:center; }
.pp-hero h1 { font-size:${type.h1}px; line-height:1.25; letter-spacing:-.02em; font-weight:700; margin:0 0 24px; text-wrap:balance; }
.pp-hero h1 em { font-style:normal; color:var(--pp-gold); }
.pp-hero-sub { color:var(--pp-ink-2); font-size:${type.lead}px; line-height:1.65; margin:0 0 32px; max-width:34ch; text-wrap:balance; }
.pp-actions { display:grid; gap:12px; max-width:420px; }
.pp-btn { display:flex; align-items:center; justify-content:center; gap:8px; min-height:52px; padding:0 24px; border:1px solid transparent; border-radius:${lightRadius.control}px; font-size:${type.body}px; font-weight:600; letter-spacing:-.01em;
  transition:background-color ${ease}, border-color ${ease}, color ${ease}; }
.pp-btn svg { width:18px; height:18px; transition:transform ${ease}; }
.pp-btn:hover svg { transform:translateX(2px); }
.pp-btn-gold { background:${light.accent}; border-color:${light.accent}; color:${light.onAccent}; }
.pp-btn-gold:hover { background:#e6a800; border-color:#e6a800; }
.pp-btn-line { border-color:var(--pp-line-strong); color:var(--pp-ink); background:var(--pp-panel); }
.pp-btn-line:hover { background:var(--pp-raised); border-color:var(--pp-ink-3); }

.pp-vs { position:relative; border:1px solid var(--pp-line); border-radius:${lightRadius.panel}px; background:var(--pp-panel); box-shadow:${light.shadowFloat}; padding:40px 32px 32px; }
.pp-vs-chip { position:absolute; top:0; left:50%; transform:translate(-50%,-50%); display:flex; gap:12px; align-items:center; white-space:nowrap; padding:8px 20px; border-radius:${lightRadius.control}px;
  background:var(--pp-panel); border:1px solid var(--pp-line); color:var(--pp-ink-2); font-size:${type.small}px; font-weight:500; }
.pp-vs-chip b { color:var(--pp-ink); font-weight:600; }
.pp-vs-chip i { width:3px; height:3px; border-radius:50%; background:var(--pp-line-strong); }
.pp-vs-cols { display:grid; grid-template-columns:1fr 64px 1fr; align-items:stretch; }
.pp-vs-col h3 { margin:4px 0 16px; text-align:center; font-size:${type.lead}px; font-weight:600; letter-spacing:-.02em; color:var(--pp-ink-3); }
.pp-vs-col.ours h3 { color:var(--pp-gold); }
.pp-vs-list { display:grid; gap:12px; margin:0; padding:0; list-style:none; }
.pp-vs-row { min-height:108px; display:flex; flex-direction:column; justify-content:center; padding:16px 20px; border-radius:${lightRadius.control}px; border:1px solid var(--pp-line); font-size:${type.body}px; }
.pp-vs-col.theirs .pp-vs-row { background:var(--pp-raised); color:var(--pp-ink-3); }
.pp-vs-col.ours .pp-vs-row { background:var(--pp-panel); border-color:var(--pp-line-strong); color:var(--pp-ink); font-weight:600; line-height:1.5; }
.pp-vs-edge { display:flex; gap:8px; margin-top:8px; color:var(--pp-gold); font-size:${type.small}px; font-weight:500; line-height:1.45; }
.pp-nw { white-space:nowrap; }
.pp-vs-cols.unpaired .pp-vs-list { align-content:start; }
.pp-vs-cols.unpaired .pp-vs-row { min-height:0; }
.pp-vs-edge svg { flex:none; width:16px; height:16px; margin-top:3px; }
.pp-vs-mid { position:relative; display:flex; align-items:center; justify-content:center; }
.pp-vs-mid::before { content:''; position:absolute; top:52px; bottom:8px; left:50%; width:1px; background:var(--pp-line); }
.pp-vs-badge { position:relative; width:44px; height:44px; border-radius:50%; display:grid; place-items:center; background:var(--pp-panel); border:1px solid var(--pp-line-strong); color:var(--pp-ink-2); font-weight:600; font-size:${type.small}px; }
.pp-vs-foot { margin:16px 0 0; color:var(--pp-ink-3); font-size:${type.meta}px; text-align:right; }

.pp-proof { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:16px; margin-top:64px; }
.pp-proof a { display:flex; align-items:center; gap:16px; padding:20px 24px; border-radius:${lightRadius.card}px; border:1px solid var(--pp-line); background:var(--pp-panel); transition:border-color ${ease}, background-color ${ease}; }
.pp-proof a:hover { border-color:var(--pp-line-strong); background:var(--pp-raised); }
.pp-proof-icon { flex:none; width:44px; height:44px; border-radius:50%; display:grid; place-items:center; background:var(--pp-raised); border:1px solid var(--pp-line); color:var(--pp-ink-2); }
.pp-proof-icon svg { width:18px; height:18px; }
.pp-proof strong { display:block; font-size:${type.body}px; font-weight:600; letter-spacing:-.01em; }
.pp-proof span { color:var(--pp-ink-2); font-size:${type.small}px; }
.pp-proof .pp-chev { margin-left:auto; color:var(--pp-ink-3); width:18px; height:18px; }

/* Body sections */
.pp-section { padding:96px 0 0; }
.pp-section:last-of-type { padding-bottom:96px; }
.pp-section:has(> .pp-wrap:empty) { display:none; }
.pp-h2 { font-size:${type.h2}px; line-height:1.3; letter-spacing:-.02em; font-weight:600; margin:0 0 16px; text-wrap:balance; }
.pp-lead { color:var(--pp-ink-2); font-size:${type.body}px; max-width:58ch; margin:0; }
.pp-band { display:grid; grid-template-columns:minmax(0,4fr) minmax(0,7fr); gap:64px; align-items:center; padding:64px 0; border-top:1px solid var(--pp-line); }
.pp-band:first-of-type { border-top:0; }
.pp-band.flip { grid-template-columns:minmax(0,7fr) minmax(0,4fr); }
.pp-band.flip .pp-band-copy { order:2; }
.pp-band h3 { font-size:${type.h3}px; line-height:1.35; letter-spacing:-.02em; font-weight:600; margin:0 0 16px; text-wrap:balance; }
.pp-band p { color:var(--pp-ink-2); margin:0 0 24px; max-width:46ch; }
.pp-tabs { display:flex; flex-wrap:wrap; gap:8px; margin:0; padding:0; list-style:none; }
.pp-tabs li { padding:4px 12px; border-radius:${lightRadius.pill}px; border:1px solid var(--pp-line); color:var(--pp-ink-2); font-size:${type.small}px; font-weight:500; background:var(--pp-raised); }
/* Screenshot frame: the capture is the loud part, the frame stays quiet. */
.pp-shot { margin:0; border-radius:${lightRadius.card}px; overflow:hidden; border:1px solid var(--pp-line); background:var(--pp-panel); box-shadow:${light.shadowFloat}; }
.pp-shot img { display:block; width:100%; height:auto; }
.pp-shot figcaption { padding:12px 16px; border-top:1px solid var(--pp-line); background:var(--pp-panel); color:var(--pp-ink-3); font-size:${type.meta}px; }

/* Full feature list: a two-column list, not cards */
.pp-all { columns:2; column-gap:64px; margin:40px 0 0; padding:0; list-style:none; }
.pp-all li { break-inside:avoid; display:grid; grid-template-columns:auto 1fr; gap:4px 12px; padding:16px 0; border-bottom:1px solid var(--pp-line); }
.pp-all b { font-size:${type.body}px; font-weight:600; letter-spacing:-.01em; }
.pp-all span { grid-column:1 / -1; color:var(--pp-ink-2); font-size:${type.small}px; }

/* Price ladder bars */
.pp-compare { margin-top:40px; display:grid; gap:16px; max-width:980px; }
.pp-bar { display:grid; grid-template-columns:220px 1fr 200px; align-items:center; gap:20px; }
.pp-bar-name { font-weight:600; color:var(--pp-ink-2); }
.pp-bar-name small { display:block; margin-top:4px; color:var(--pp-ink-3); font-size:${type.meta}px; font-weight:400; }
.pp-bar-track { height:12px; border-radius:${lightRadius.pill}px; background:var(--pp-line); overflow:hidden; }
.pp-bar-fill { display:block; height:100%; border-radius:${lightRadius.pill}px; background:var(--pp-ink-3); }
.pp-bar.ours .pp-bar-name { color:var(--pp-gold); }
.pp-bar.ours .pp-bar-fill { background:var(--pp-gold); }
.pp-bar-price { text-align:right; white-space:nowrap; font-weight:600; font-size:${type.body}px; }
.pp-bar.ours .pp-bar-price { color:var(--pp-gold); }
.pp-source { margin:16px 0 0; color:var(--pp-ink-3); font-size:${type.meta}px; }

/* Price */
.pp-price { margin-top:40px; display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); border:1px solid var(--pp-line); border-radius:${lightRadius.panel}px; background:var(--pp-panel); box-shadow:${light.shadowSm}; overflow:hidden; }
.pp-price > div { padding:32px; border-left:1px solid var(--pp-line); }
.pp-price > div:first-child { border-left:0; }
.pp-price small { display:block; color:var(--pp-ink-2); font-size:${type.small}px; font-weight:500; }
.pp-price strong { display:block; margin:8px 0 4px; font-size:${type.h2}px; letter-spacing:-.02em; font-weight:600; }
.pp-price strong span { font-size:${type.small}px; color:var(--pp-ink-2); font-weight:500; letter-spacing:0; margin-left:4px; }
.pp-price p { margin:0; color:var(--pp-ink-2); font-size:${type.small}px; }
.pp-price-cta { display:flex; flex-wrap:wrap; gap:12px; margin-top:24px; }

/* Reviews */
.pp-quotes { margin-top:40px; display:grid; grid-template-columns:repeat(var(--pp-qcols, 3), minmax(0,1fr)); gap:0; border-top:1px solid var(--pp-line); }
.pp-quotes blockquote { margin:0; padding:32px 24px 24px 0; border-right:1px solid var(--pp-line); }
.pp-quotes blockquote + blockquote { padding-left:24px; }
.pp-quotes blockquote:last-child { border-right:0; }
.pp-quotes p { margin:0 0 16px; color:var(--pp-ink); font-size:${type.body}px; line-height:1.7; display:-webkit-box; -webkit-line-clamp:6; -webkit-box-orient:vertical; overflow:hidden; }
.pp-quotes cite { font-style:normal; color:var(--pp-ink-3); font-size:${type.meta}px; font-variant-numeric:tabular-nums; }
.pp-more { display:inline-flex; align-items:center; gap:8px; min-height:44px; margin-top:16px; color:var(--pp-gold); font-weight:600; }
.pp-more svg { width:18px; height:18px; }

/* FAQ */
.pp-faq { margin-top:32px; border-top:1px solid var(--pp-line); max-width:980px; }
.pp-faq details { border-bottom:1px solid var(--pp-line); }
.pp-faq summary { cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; gap:20px; padding:20px 0; font-size:${type.body}px; font-weight:600; letter-spacing:-.01em; }
.pp-faq summary::-webkit-details-marker { display:none; }
.pp-faq summary svg { flex:none; width:18px; height:18px; color:var(--pp-ink-3); transition:transform ${ease}; }
.pp-faq details[open] summary svg { transform:rotate(45deg); color:var(--pp-ink); }
.pp-faq details p { margin:0; padding:0 0 24px; color:var(--pp-ink-2); max-width:70ch; }

/* Closing action */
.pp-close { margin-top:96px; padding:64px 0 48px; border-top:1px solid var(--pp-line); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:24px; }
.pp-close h2 { margin:0; }
.pp-close .pp-actions { grid-auto-flow:column; max-width:none; }

@media (max-width: 1080px) {
  .pp-hero-grid, .pp-band, .pp-band.flip { grid-template-columns:1fr; gap:40px; }
  .pp-band.flip .pp-band-copy { order:0; }
  .pp-quotes { grid-template-columns:1fr; }
  .pp-quotes blockquote, .pp-quotes blockquote + blockquote { padding:24px 0; border-right:0; border-bottom:1px solid var(--pp-line); }
}
@media (max-width: 720px) {
  .pp-wrap { width:calc(100% - 32px); }
  .pp-hero { padding:104px 0 32px; }
  .pp-hero h1 { font-size:${type.h1Mobile}px; }
  /* The wrapped chip (two lines) sits half above the panel; keep it clear of the buttons. */
  .pp-hero-grid { row-gap:64px; }
  .pp-hero-sub { font-size:${type.body}px; }
  .pp-vs { padding:32px 12px 16px; }
  .pp-vs-chip { font-size:${type.meta}px; gap:4px; white-space:normal; flex-wrap:wrap; justify-content:center; width:max-content; max-width:calc(100% - 24px); text-align:center; }
  /* When wrapped, a separator dot would be left alone at a line end; each item becomes a small pill instead. */
  .pp-vs-chip i { display:none; }
  .pp-vs-chip { border-color:transparent; background:transparent; padding:4px; }
  .pp-vs-chip > span { padding:2px 8px; border-radius:${lightRadius.pill}px; background:var(--pp-panel); border:1px solid var(--pp-line); }
  .pp-vs-cols { grid-template-columns:1fr; gap:24px; }
  .pp-vs-mid { display:none; }
  .pp-vs-row { min-height:0; }
  .pp-proof { grid-template-columns:1fr; margin-top:40px; }
  .pp-section { padding-top:80px; }
  .pp-h2 { font-size:${type.h3}px; }
  .pp-band { padding:48px 0; }
  .pp-band h3 { font-size:${type.lead}px; }
  .pp-all { columns:1; }
  .pp-bar { grid-template-columns:1fr auto; }
  .pp-bar-track { grid-column:1 / -1; grid-row:2; }
  .pp-price > div { padding:24px; border-left:0; border-top:1px solid var(--pp-line); }
  .pp-price > div:first-child { border-top:0; }
  .pp-close .pp-actions { grid-auto-flow:row; width:100%; }
}
@media (prefers-reduced-motion: reduce) { .pp * { transition:none !important; } }
`}</style>
    );
}
