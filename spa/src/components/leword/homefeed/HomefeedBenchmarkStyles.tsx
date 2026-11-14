/*
 * Benchmark board styles (hfb-* / hfu-* / hfb-src-*), shared by the homefeed and AdSense boards.
 * Light pass (2026-11 step 2): every colour is a --lw-* variable from lewordTheme.ts, text is 13px or larger,
 * weights stop at 600 (700 for the board title), controls are 44px tall, and only colour, border, shadow,
 * opacity and transform move.
 */
export default function HomefeedBenchmarkStyles() {return <style>{`
.hf-benchmark{--hfb-line:var(--lw-line);color:var(--lw-text);font-size:15px;line-height:1.65}.hf-benchmark *{box-sizing:border-box}
.hf-benchmark button,.hfb-mode button{font:inherit;cursor:pointer}.hf-benchmark button:disabled{opacity:.65;cursor:wait}
.hf-benchmark button:focus-visible,.hf-benchmark a:focus-visible,.hf-benchmark summary:focus-visible,.hf-benchmark input:focus-visible,.hfb-mode button:focus-visible{outline:3px solid var(--lw-accent);outline-offset:3px}
.hf-benchmark a{color:var(--lw-accent-ink);text-decoration:none}.hf-benchmark a:hover{text-decoration:underline}.hf-benchmark p{margin:0}
.hfb-header{padding:24px 28px;border:1px solid var(--lw-line);border-radius:18px;background:var(--lw-surface);box-shadow:var(--lw-shadow-sm);display:flex;justify-content:space-between;gap:20px;align-items:center}
.hfb-eyebrow{font-size:13px;color:var(--lw-text-muted);font-weight:500}
.hfb-header h2{font-size:30px;line-height:1.3;letter-spacing:-.5px;font-weight:700;color:var(--lw-text);margin:4px 0 8px}.hfb-header h2 span{color:var(--lw-accent-ink)}
.hfb-header p{color:var(--lw-text-secondary);font-size:15px}
.hfb-count{min-width:84px;display:grid;text-align:center;color:var(--lw-text-secondary)}.hfb-count strong{font-size:30px;line-height:1.2;font-weight:600;color:var(--lw-text);font-variant-numeric:tabular-nums}.hfb-count span{font-size:13px}.hfb-count strong .lp-count,.hfb-count strong .lp-count span{font-size:inherit;color:inherit}
.hfb-meta{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:12px 0;color:var(--lw-text-muted);font-size:13px}
.hfb-meta button,.hfb-empty button,.hfb-more,.hfb-shuffle button,.hfb-src-more{min-height:44px;padding:0 16px;border:1px solid var(--lw-line);border-radius:10px;background:var(--lw-surface);color:var(--lw-text);font-size:15px;transition:border-color var(--lw-fast) var(--lw-ease),background-color var(--lw-fast) var(--lw-ease)}
.hfb-meta button:hover,.hfb-empty button:hover,.hfb-more:hover,.hfb-shuffle button:hover,.hfb-src-more:hover{border-color:var(--lw-line-strong);background:var(--lw-raised)}
.hfb-alert{border:1px solid var(--lw-accent-line);background:var(--lw-accent-soft);color:var(--lw-text);padding:12px 16px;border-radius:10px;margin:12px 0}
.hfb-coverage{border:1px solid var(--lw-line);border-radius:14px;background:var(--lw-surface);padding:0 16px;margin:12px 0}
.hfb-coverage summary,.hfb-reference summary{cursor:pointer;font-weight:600}.hfb-coverage summary{padding:10px 0}
.hfb-coverage summary>span{color:var(--lw-accent-ink)}.hfb-coverage summary small{float:right;color:var(--lw-text-muted);font-size:13px;font-weight:500}
.hfb-coverage>p{margin:8px 0 12px;color:var(--lw-text-secondary);font-size:13px}
.hfb-source-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;padding-bottom:16px}
.hfb-channel{display:flex;flex-direction:column;background:var(--lw-raised);padding:12px;border-radius:10px;font-size:13px;overflow-wrap:anywhere}
.hfb-channel>span[data-state=ok]{color:var(--lw-positive)}.hfb-channel>span:not([data-state=ok]){color:var(--lw-accent-ink)}.hfb-channel small{color:var(--lw-text-secondary);font-size:13px}
.hfb-filters{padding:12px 0 8px}.hfb-filter-row,.hfb-categories{display:flex;flex-wrap:wrap;gap:8px}
.hfb-filter-row button{min-height:44px;border:1px solid var(--lw-line);background:var(--lw-surface);color:var(--lw-text-secondary);border-radius:10px;padding:0 12px;font-size:15px;transition:border-color var(--lw-fast) var(--lw-ease),background-color var(--lw-fast) var(--lw-ease)}
.hfb-filter-row button span{font-size:13px;margin-left:4px;color:var(--lw-text-muted);font-variant-numeric:tabular-nums}
.hfb-filter-row button:hover{border-color:var(--lw-line-strong)}
.hfb-filter-row button[aria-pressed=true]{border-color:var(--lw-accent);color:var(--lw-text);background:var(--lw-accent-soft)}
.hfb-filter-bottom{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px}
.hfb-categories button{min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--lw-line);background:var(--lw-surface);color:var(--lw-text-secondary);font-size:15px;transition:border-color var(--lw-fast) var(--lw-ease),background-color var(--lw-fast) var(--lw-ease)}
.hfb-categories button:hover{border-color:var(--lw-line-strong)}
.hfb-categories button[aria-pressed=true]{color:var(--lw-text);border-color:var(--lw-accent);background:var(--lw-accent-soft)}
.hfb-filter-bottom input{min-height:44px;border:1px solid var(--lw-line);color:var(--lw-text);background:var(--lw-surface);border-radius:10px;padding:0 12px;width:220px;font:inherit;font-size:15px}
.hfu-panel{margin:16px 0 20px;padding:20px;border:1px solid var(--lw-line);border-radius:18px;background:var(--lw-surface)}
.hfu-toggle{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;width:100%;min-height:44px;text-align:left;background:none;border:0;padding:0;color:inherit}
.hfu-toggle-title{font-size:17px;font-weight:600;color:var(--lw-text);letter-spacing:-.3px}.hfu-toggle-title small{font-size:13px;color:var(--lw-text-secondary);font-weight:500;margin-left:8px}
.hfu-toggle-action{margin-left:auto;font-size:13px;color:var(--lw-text);border:1px solid var(--lw-line);border-radius:10px;padding:8px 12px;transition:background-color var(--lw-fast) var(--lw-ease)}
.hfu-toggle:hover .hfu-toggle-action{background:var(--lw-raised)}.hfu-panel{padding:12px 20px!important}.hfu-panel.is-open{padding:20px!important}
.hfu-intro{font-size:13px;color:var(--lw-text-secondary);margin-top:12px!important}.hfu-intro b{color:var(--lw-text);font-weight:600}
.hfu-list{display:grid;gap:12px;margin-top:16px}.hfu-card{border:1px solid var(--lw-line);border-radius:14px;padding:16px;background:var(--lw-surface)}
.hfu-card-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}
.hfu-when-badge{background:var(--lw-positive-soft);color:var(--lw-positive);border-radius:6px;padding:2px 8px;font-weight:600}
.hfu-league{color:var(--lw-text-secondary)}.hfu-articles{color:var(--lw-text-muted);margin-left:auto}
.hfu-card h3{font-size:17px;font-weight:600;color:var(--lw-text);margin:8px 0}
.hfu-watch-list{list-style:none;padding:0;margin:0;display:grid;gap:12px}.hfu-watch{border-top:1px solid var(--lw-line);padding-top:12px}
.hfu-watch-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.hfu-watch-head strong{font-size:15px;font-weight:600;color:var(--lw-text)}
.hfu-signal{background:var(--lw-accent-soft);color:var(--lw-accent-ink);border-radius:6px;padding:0 8px;font-size:13px;font-weight:600}
.hfu-metrics{font-size:13px;color:var(--lw-text-secondary);margin-top:4px!important;font-variant-numeric:tabular-nums}.hfu-metrics b{color:var(--lw-text);font-weight:600}.hfu-metrics em{color:var(--lw-positive);font-style:normal}
.hfu-watch blockquote{margin:8px 0;padding:8px 12px;border-left:2px solid var(--lw-line-strong);background:var(--lw-raised);color:var(--lw-text-secondary);font-size:13px}
.hfu-angles{display:flex;gap:12px;font-size:13px;margin-top:4px}
.hfu-angles>span,.hfu-when>span,.hfu-suggest>span{color:var(--lw-text-secondary);font-weight:600;flex:none;margin-right:8px}
.hfu-angles ul{margin:0;padding-left:16px;color:var(--lw-text)}.hfu-when,.hfu-suggest{font-size:13px;color:var(--lw-text);margin-top:4px!important}
.hfu-titles{margin-top:8px}.hfu-titles-head{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--lw-text-secondary);margin-bottom:4px}
.hfu-title{display:flex;align-items:center;gap:8px;padding:4px 4px 4px 12px;border:1px solid var(--lw-line);border-radius:10px;background:var(--lw-surface);margin-bottom:4px}
.hfu-title p{flex:1;color:var(--lw-text);font-size:15px}.hfu-copy{display:inline-flex;align-items:center;gap:4px}
.hfu-copy button,.hfu-more{min-height:44px;border:1px solid var(--lw-line);background:var(--lw-surface);color:var(--lw-text);border-radius:10px;padding:0 12px;font-size:13px}
.hfu-copy button:hover,.hfu-more:hover{border-color:var(--lw-line-strong);background:var(--lw-raised)}
.hfu-copy small{color:var(--lw-accent-ink);font-size:13px}.hfu-copy small:empty{display:none}.hfu-more{display:block;width:100%;border-style:dashed;margin-top:4px}
.hfu-sources{margin-top:8px;font-size:13px}.hfu-sources summary{cursor:pointer;color:var(--lw-text-secondary);padding:12px 0}.hfu-sources ul{margin:4px 0 0;padding-left:16px}
.hfb-shuffle{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin:4px 0 8px}.hfb-shuffle small{color:var(--lw-text-muted);font-size:13px}
.hfb-legend{color:var(--lw-text-muted);font-size:13px;margin:4px 0 16px!important}.hfb-list{display:grid;gap:16px}
.hfb-card{border:1px solid var(--lw-line);border-radius:14px;padding:20px 24px;background:var(--lw-surface);overflow:hidden;transition:border-color var(--lw-fast) var(--lw-ease),box-shadow var(--lw-fast) var(--lw-ease)}
@media (hover:hover){.hfb-card:hover{border-color:var(--lw-line-strong);box-shadow:var(--lw-shadow-float)}}
.hfb-card.recommended{box-shadow:inset 3px 0 var(--lw-accent)}@media (hover:hover){.hfb-card.recommended:hover{box-shadow:inset 3px 0 var(--lw-accent),var(--lw-shadow-float)}}
.hfb-card-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px}.hfb-status{border-radius:6px;padding:2px 8px;font-weight:600}
.hfb-status.review-now{color:var(--lw-positive);background:var(--lw-positive-soft)}.hfb-status.verify{color:var(--lw-accent-ink);background:var(--lw-accent-soft)}.hfb-status.stale{color:var(--lw-text-secondary);background:var(--lw-raised)}
.hfb-star{color:var(--lw-accent-ink);font-weight:600}.hfb-proof{border-radius:6px;padding:2px 8px;font-weight:600}
.hfb-proof.same-post{color:var(--lw-positive);background:var(--lw-positive-soft)}.hfb-proof.similar{color:var(--lw-positive);background:var(--lw-raised)}.hfb-proof.mine{color:var(--lw-accent-ink);background:var(--lw-accent-soft)}
.hfb-proof-box{margin-top:12px;padding:12px;border:1px solid var(--lw-line);background:var(--lw-positive-soft);border-radius:10px;font-size:13px;display:grid;gap:4px;color:var(--lw-text)}
.hfb-proof-box b{color:var(--lw-positive);margin-right:8px}.hfb-proof-box small{color:var(--lw-text-secondary);font-size:13px}
.hfb-growth{color:var(--lw-positive);font-weight:600}.hfb-proof-summary{color:var(--lw-text-secondary);font-size:13px;margin:4px 0!important}
.hfb-filter-row button.proof{color:var(--lw-positive)}.hfb-filter-row button.proof[aria-pressed=true]{background:var(--lw-positive-soft);border-color:var(--lw-positive);color:var(--lw-text)}
.hfb-category{color:var(--lw-text-secondary)}.hfb-timing{color:var(--lw-text-secondary);margin-left:auto}
.hfb-card h3{font-size:20px;line-height:1.45;letter-spacing:-.3px;font-weight:600;color:var(--lw-text);margin:12px 0}
.hfb-headline{display:flex;align-items:flex-start;gap:12px}.hfb-headline h3{flex:1;min-width:0}
.hfb-headline-copy{display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-top:8px;flex:none}
.hfb-headline-copy button,.hfb-title-head button{min-height:44px;border:1px solid var(--lw-line);background:var(--lw-surface);color:var(--lw-text);border-radius:10px;padding:0 12px;font-size:13px}
.hfb-headline-copy button:hover,.hfb-title-head button:hover{border-color:var(--lw-line-strong);background:var(--lw-raised)}
.hfb-headline-copy small{color:var(--lw-accent-ink);font-size:13px}.hfb-headline-copy small:empty{display:none}
.hfb-keyword{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;font-variant-numeric:tabular-nums}.hfb-keyword>strong{font-size:15px;font-weight:600;color:var(--lw-text)}
.hfb-keyword>span{color:var(--lw-text-secondary)}.hfb-keyword b{font-weight:500;color:var(--lw-text);margin-left:4px}
.hfb-alternatives{color:var(--lw-positive);font-size:13px;margin-top:4px!important}.hfb-alternatives>span{color:var(--lw-text-secondary);margin-right:8px}
.hfb-summary{margin-top:12px!important;color:var(--lw-text)}.hfb-attribution{font-size:13px;color:var(--lw-text-muted);margin-top:4px!important}
.hfb-why{margin-top:12px;display:flex;gap:16px;padding:12px;background:var(--lw-raised);border-left:2px solid var(--lw-line-strong);border-radius:0 10px 10px 0;font-size:13px}
.hfb-why>span{flex:none;color:var(--lw-text);font-weight:600}.hfb-why ul{margin:0;padding:0 0 0 16px;color:var(--lw-text)}
.hfb-card h4{font-size:13px;font-weight:600;color:var(--lw-text-secondary);margin:0 0 8px}.hfb-title-box{margin-top:16px}
.hfb-title-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:4px 4px 4px 12px;border:1px solid var(--lw-line);border-radius:10px;background:var(--lw-surface);margin-bottom:8px}
.hfb-title-row>span{color:var(--lw-text-secondary);font-size:13px;background:var(--lw-raised);border-radius:6px;padding:0 8px;min-width:0;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}
.hfb-title-row.editor>span{color:var(--lw-accent-ink);background:var(--lw-accent-soft)}
.hfb-title-head{display:flex;align-items:center;gap:12px;margin-bottom:8px}.hfb-title-head h4{margin:0}.hfb-title-head h4 span{color:var(--lw-accent-ink);margin-left:4px}
.hfb-title-head small{color:var(--lw-accent-ink);font-size:13px}.hfb-title-head small:empty{display:none}
.hfb-title-more{display:block;width:100%;min-height:44px;border:1px dashed var(--lw-line-strong);background:none;color:var(--lw-text-secondary);border-radius:10px;padding:0 12px;font-size:13px;margin-top:4px}
.hfb-title-more:hover{background:var(--lw-raised)}
.hfb-title-empty{color:var(--lw-text-secondary);font-size:13px;padding:12px;border:1px dashed var(--lw-line-strong);border-radius:10px;display:grid;gap:8px;justify-items:start}
.hfb-title-make{min-height:44px;color:var(--lw-on-btn);background:var(--lw-btn);border:0;border-radius:10px;padding:0 16px;font-size:15px;font-weight:600;transition:box-shadow var(--lw-fast) var(--lw-ease)}
.hfb-title-make:hover{box-shadow:var(--lw-shadow-float)}.hfb-title-empty small{color:var(--lw-accent-ink);font-size:13px}
.hfb-title-row>p{flex:1;min-width:140px;color:var(--lw-text);font-size:15px}
.hfb-title-row button{min-height:44px;min-width:56px;border:1px solid var(--lw-line);border-radius:10px;background:var(--lw-surface);color:var(--lw-text-secondary);font-size:13px;padding:0 12px}
.hfb-title-row button:hover{color:var(--lw-text);border-color:var(--lw-line-strong)}
.hfb-title-row small{color:var(--lw-accent-ink);font-size:13px}.hfb-title-row small:empty{display:none}.hfb-caption{color:var(--lw-text-muted);font-size:13px}
.hfb-direction{margin-top:16px;padding:12px 16px;background:var(--lw-raised);border-radius:10px}.hfb-direction h4{color:var(--lw-text-secondary)}.hfb-direction p{font-size:15px;color:var(--lw-text)}
.hfb-writing-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}.hfb-points h4{color:var(--lw-positive)}.hfb-points.avoid h4{color:var(--lw-negative)}
.hfb-points ul{font-size:13px;margin:0;padding-left:16px;color:var(--lw-text)}.hfb-points li+li{margin-top:4px}.hfb-points p{font-size:13px;color:var(--lw-text-secondary)}
.hfb-direction .hfb-guide-empty,.hfb-points .hfb-guide-empty{color:var(--lw-text-muted);font-size:13px;margin:0}
.hfb-verify{margin-top:12px;font-size:13px;color:var(--lw-text-secondary)}.hfb-verify b{color:var(--lw-accent-ink);margin-right:8px}
.hfb-reference{border-top:1px solid var(--lw-line);margin-top:16px;padding-top:4px;font-size:13px}.hfb-reference summary{color:var(--lw-text-secondary);padding:12px 0}.hfb-reference summary span{font-weight:400;color:var(--lw-text-muted)}
.hfb-image-guide{background:var(--lw-raised);border:1px solid var(--lw-line);border-radius:10px;padding:12px;margin-top:12px}.hfb-image-guide h4{color:var(--lw-text-secondary)}.hfb-image-guide p{color:var(--lw-text-secondary);margin-bottom:8px}
.hfb-source-list{list-style:none;padding:0;margin:12px 0}.hfb-source-list li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--lw-line)}.hfb-source-list small{display:block;color:var(--lw-text-muted)}
.hfb-reactions{display:flex;gap:8px;flex-wrap:wrap;align-content:center;flex-shrink:0;color:var(--lw-text-secondary);font-size:13px;font-variant-numeric:tabular-nums}
.hfb-card-footer{display:flex;flex-wrap:wrap;gap:4px 16px;border-top:1px solid var(--lw-line);margin-top:12px;padding-top:12px;color:var(--lw-text-muted);font-size:13px}
.hfb-empty{padding:32px 16px;text-align:center;color:var(--lw-text-secondary);background:var(--lw-raised);border-radius:14px;display:grid;justify-items:center;gap:12px}
.hfb-more{display:block;margin:20px auto 0;padding:0 24px}
.hfb-mode{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.hfb-mode button{min-height:44px;border:1px solid var(--lw-line);padding:0 16px;border-radius:10px;background:var(--lw-surface);color:var(--lw-text-secondary);font-size:15px;transition:border-color var(--lw-fast) var(--lw-ease),background-color var(--lw-fast) var(--lw-ease)}
.hfb-mode button:hover{border-color:var(--lw-line-strong)}
.hfb-mode button[aria-pressed=true]{background:var(--lw-accent-soft);border-color:var(--lw-accent);color:var(--lw-text)}
.hfb-mode button.tools[aria-pressed=true]{background:var(--lw-positive-soft);border-color:var(--lw-positive);color:var(--lw-text)}
@media(max-width:640px){.hfb-header{padding:20px 16px;gap:12px}.hfb-header h2{font-size:22px}.hfb-header h2 span{display:block}.hfb-count{min-width:56px}.hfb-count strong{font-size:22px}.hfb-card{padding:16px}.hfb-card h3{font-size:17px}.hfb-timing{margin-left:0;flex-basis:100%}.hfb-writing-grid{grid-template-columns:1fr;gap:12px}.hfb-filter-bottom{align-items:stretch;flex-direction:column}.hfb-filter-bottom input{width:100%}.hfb-filter-row button{padding:0 8px;font-size:13px}.hfb-coverage summary small{display:none}.hfb-source-list li{flex-direction:column;gap:4px}.hfb-why{gap:8px}}
.hfb-src{margin-top:16px;padding:16px;border:1px solid var(--lw-line);border-radius:14px;background:var(--lw-raised)}
.hfb-src-head h4{margin:0;font-size:15px;font-weight:600;color:var(--lw-text)}.hfb-src-head h4 span{margin-left:8px;font-size:13px;font-weight:500;color:var(--lw-text-muted)}
.hfb-src-head p{margin:4px 0 0;font-size:13px;line-height:1.55;color:var(--lw-text-secondary)}
.hfb-src-grid{list-style:none;margin:12px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:12px}
.hfb-src-grid>li{display:flex;min-width:0}
.hf-benchmark a.hfb-src-tile,.hfb-src-tile{flex:1;display:flex;flex-direction:column;min-width:0;border:1px solid var(--lw-line);border-radius:14px;overflow:hidden;background:var(--lw-surface);color:inherit;transition:border-color var(--lw-fast) var(--lw-ease),transform var(--lw-fast) var(--lw-ease),box-shadow var(--lw-fast) var(--lw-ease)}
.hf-benchmark a.hfb-src-tile:hover{text-decoration:none;border-color:var(--lw-line-strong);transform:translateY(-1px);box-shadow:var(--lw-shadow-float)}
.hfb-src-thumb{position:relative;display:block;aspect-ratio:16/9;background:var(--lw-raised);overflow:hidden}
.hfb-src-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.hfb-src-fallback{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--lw-text-muted)}
.hfb-src-fallback b{font-size:30px;line-height:1;font-weight:600;color:var(--lw-text-secondary)}.hfb-src-fallback small{font-size:13px}
.hfb-src-platform{position:absolute;left:8px;bottom:8px;padding:0 8px;border-radius:999px;background:var(--lw-surface);color:var(--lw-text);box-shadow:var(--lw-shadow-sm);font-size:13px;font-weight:500}
.hfb-src-body{display:flex;flex-direction:column;gap:8px;flex:1;padding:12px}
.hfb-src-meta{font-size:13px;color:var(--lw-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hfb-src-title{font-size:15px;font-weight:600;line-height:1.45;color:var(--lw-text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hfb-src-chips{display:flex;flex-wrap:wrap;gap:4px}.hfb-src-chips span{padding:0 8px;border-radius:6px;background:var(--lw-raised);color:var(--lw-text-secondary);font-size:13px;font-variant-numeric:tabular-nums}
.hfb-src-chips .up{background:var(--lw-positive-soft);color:var(--lw-positive)}.hfb-src-chips .hf{background:var(--lw-accent-soft);color:var(--lw-accent-ink);font-weight:600}
.hfb-src-open{margin-top:auto;display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border-radius:10px;border:1px solid var(--lw-line);background:var(--lw-surface);color:var(--lw-text);font-size:15px;font-weight:600;transition:background-color var(--lw-fast) var(--lw-ease)}
.hf-benchmark a.hfb-src-tile:hover .hfb-src-open{background:var(--lw-raised)}.hfb-src-open.off{border-style:dashed;color:var(--lw-text-muted);font-weight:500}
.hfb-src-more{display:block;width:100%;margin-top:12px}
.hfb-src .hfb-caption{margin:12px 0 0}
@media(max-width:640px){.hfb-src{padding:12px}.hf-benchmark a.hfb-src-tile,.hfb-src-tile{display:grid;grid-template-columns:112px minmax(0,1fr)}.hfb-src-thumb{aspect-ratio:auto;min-height:100%}.hfb-src-body{padding:12px}}
@media(prefers-reduced-motion:reduce){.hf-benchmark a.hfb-src-tile,.hfb-card,.hfb-filter-row button,.hfb-categories button,.hfb-mode button{transition:none}.hf-benchmark a.hfb-src-tile:hover{transform:none}}
`}</style>;}
