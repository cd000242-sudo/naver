/**
 * 홈판 신호 탭 스타일(lw-hf-*). Light pass (2026-11 step 2): colours are --lw-* variables from lewordTheme.ts.
 * 창(WINDOW) 색은 의미색이다: 열림 청록 · 열리는 중 금 · 좁아짐 주황 · 닫힘 분홍 · 판정 불가 회색.
 * 액센트는 녹색 — 같은 탭의 "채널 벤치마크 추천"(보라·하늘)과 한눈에 구분되게(사장님 2026-09-30).
 */
function HomefeedStyles() {
    return (
        <style>{`
            .lw-hf {
                --hf-open: var(--lw-positive); --hf-opening: var(--lw-accent-ink); --hf-narrow: var(--lw-negative); --hf-closed: var(--lw-negative); --hf-unknown: var(--lw-text-muted);
                --hf-accent: var(--lw-positive); --hf-gold: var(--lw-accent); --hf-panel: var(--lw-surface); --hf-panel-2: var(--lw-raised);
                --hf-line: var(--lw-line); --hf-line-2: var(--lw-line-strong); --hf-text: var(--lw-text); --hf-muted: var(--lw-text-secondary); --hf-dim: var(--lw-text-muted);
                display: flex; flex-direction: column; gap: 16px; min-width: 0;
            }
            .lw-hf a { color: var(--lw-accent-ink); text-decoration: none; }
            .lw-hf a:hover { text-decoration: underline; }
            .lw-hf .hint, .lw-hf-editorial-pending { color: var(--hf-muted); font-size: 13px; line-height: 1.7; }
            .lw-hf-editorial-toolbar { display: flex; gap: 16px; justify-content: space-between; align-items: center; flex-wrap: wrap; padding: 20px 0 8px; }
            .lw-hf-editorial-toolbar strong { font-size: 20px; }
            .lw-hf-editorial-toolbar p { color: var(--hf-muted); font-size: 13px; margin: 7px 0 0; }
            .lw-hf-eyebrow { color: var(--hf-muted); font-size: 13px; margin: 14px 0 0; }
            .lw-hf-section .lw-hf-editorial-summary { font-size: 22px; font-weight: 600; line-height: 1.6; word-break: keep-all; color: var(--hf-text); }
            .lw-hf-collection > summary { cursor: pointer; font-size: 13px; line-height: 1.6; color: var(--hf-muted); padding: 8px 0; }
            .lw-hf .lw-hf-editorial-form { grid-template-columns: minmax(0, 1fr); }
            .lw-hf-editorial-stack { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
            .lw-hf-editorial-fieldset { border: 0; padding: 0; margin: 0; }
            .lw-hf-editorial-pitch { display: grid; gap: 8px; border-left: 2px solid var(--hf-accent); padding: 3px 0 3px 14px; margin: 16px 0; }
            .lw-hf-editorial-pitch p { margin: 0; font-size: 15px; line-height: 1.6; }
            .lw-hf-editorial-pitch b { display: inline-block; min-width: 90px; color: var(--hf-muted); font-size: 13px; }
            .lw-hf-editorial-angles { display: grid; gap: 10px; }
            .lw-hf-angle { display: flex; flex-direction: column; gap: 9px; padding: 17px; border-radius: 12px; text-align: left; background: var(--hf-panel); border: 1px solid var(--hf-line-2); color: var(--hf-text); cursor: pointer; line-height: 1.6; }
            .lw-hf-angle.selected { border-color: var(--hf-accent); background: var(--lw-positive-soft); }
            .lw-hf-angle small, .lw-hf-facts small, .lw-hf-outline small { display: block; color: var(--hf-muted); line-height: 1.6; }
            .lw-hf-facts { display: grid; gap: 18px; }
            .lw-hf-facts article { background: var(--hf-panel); padding: 16px; border-radius: 10px; line-height: 1.7; }
            .lw-hf-facts blockquote { margin: 12px 0 6px; padding-left: 12px; border-left: 2px solid var(--hf-line-2); color: var(--lw-text-secondary); font-size: 13px; }
            .lw-hf-facts a { font-size: 13px; }
            .lw-hf-outline { padding-left: 24px; line-height: 1.7; }
            .lw-hf-outline li { margin: 16px 0; }
            .lw-hf-outline p { margin: 6px 0; }
            .lw-hf-editorial-preview { display: block; width: 100%; max-width: 320px; max-height: 220px; object-fit: contain; border-radius: 8px; margin: 10px 0; }
            .lw-hf button:disabled { cursor: not-allowed; opacity: .5; }
            .lw-hf button:focus-visible, .lw-hf select:focus-visible, .lw-hf input:focus-visible, .lw-hf textarea:focus-visible {
                outline: 2px solid var(--lw-accent); outline-offset: 2px;
            }

            /* ── 수집 상태 줄 ── */
            .lw-hf-status {
                display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 16px; align-items: center;
                padding: 14px 16px; border: 1px solid var(--hf-line); border-radius: 14px; background: var(--hf-panel);
            }
            .lw-hf-status-main { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
            .lw-hf-status-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; font-size: 13px; color: var(--hf-muted); }
            .lw-hf-status-line b { color: var(--hf-text); font-weight: 600; }
            .lw-hf-state { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; color: var(--hf-text); }
            .lw-hf-state i { width: 8px; height: 8px; border-radius: 50%; background: var(--hf-dim); }
            .lw-hf-state.on i { background: var(--hf-open); box-shadow: 0 0 0 3px var(--lw-positive-soft); }
            .lw-hf-state.run i { background: var(--hf-opening); }
            .lw-hf-sources { display: flex; flex-wrap: wrap; gap: 5px; }
            .lw-hf-source {
                display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px;
                border: 1px solid var(--hf-line); font-size: 13px; color: var(--hf-muted);
            }
            .lw-hf-source i { width: 6px; height: 6px; border-radius: 50%; background: var(--hf-open); }
            .lw-hf-source.error i { background: var(--hf-closed); }
            .lw-hf-source.skipped i { background: var(--hf-dim); }
            .lw-hf-source.error { color: var(--lw-negative); border-color: var(--lw-line); }
            .lw-hf-status-actions { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; }
            .lw-hf-counts { display: flex; flex-wrap: wrap; gap: 6px; }
            .lw-hf-count { padding: 3px 10px; border-radius: 999px; background: var(--hf-panel-2); font-size: 13px; font-weight: 600; color: var(--hf-muted); font-variant-numeric: tabular-nums; }
            .lw-hf-count b { color: var(--hf-text); margin-left: 4px; }

            /* ── 버튼 ── */
            .lw-hf-btn {
                display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px;
                padding: 8px 12px; border-radius: 10px; border: 1px solid var(--hf-line-2); background: transparent;
                color: var(--lw-text); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
            }
            .lw-hf-btn:hover { border-color: var(--lw-line-strong); color: var(--lw-text); }
            .lw-hf-btn:disabled { opacity: .45; cursor: not-allowed; }
            .lw-hf-btn.primary { background: var(--hf-gold); border-color: var(--hf-gold); color: var(--lw-on-accent); font-weight: 600; }
            .lw-hf-btn.primary:hover { background: var(--lw-accent); color: var(--lw-on-accent); }
            .lw-hf-btn.small { padding: 4px 8px; font-size: 13px; }

            /* ── 필터 ── */
            .lw-hf-filters { display: flex; flex-direction: column; gap: 9px; }
            .lw-hf-filter-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
            .lw-hf-select, .lw-hf-search {
                min-height: 44px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--hf-line-2); background: var(--lw-surface); color: var(--hf-text); font-size: 13px;
            }
            .lw-hf-search { flex: 1 1 180px; min-width: 0; }
            .lw-hf-toggle {
                min-height: 44px; padding: 4px 12px; border-radius: 999px; border: 1px solid var(--hf-line-2); background: transparent;
                color: var(--hf-muted); font-size: 13px; font-weight: 600; cursor: pointer;
            }
            .lw-hf-toggle[aria-pressed="true"] { border-color: var(--lw-positive); background: var(--lw-positive-soft); color: var(--lw-positive); }

            /* ── 칩 ── */
            .lw-hf-chip {
                display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;
                border: 1px solid var(--hf-line-2); font-size: 13px; font-weight: 600; color: var(--hf-muted); white-space: nowrap;
            }
            .lw-hf-chip.w-OPEN { color: var(--hf-open); border-color: var(--lw-line); background: var(--lw-positive-soft); }
            .lw-hf-chip.w-OPENING { color: var(--hf-opening); border-color: var(--lw-accent-line); background: var(--lw-accent-soft); }
            .lw-hf-chip.w-NARROWING { color: var(--hf-narrow); border-color: var(--lw-line); background: var(--lw-negative-soft); }
            .lw-hf-chip.w-CLOSED { color: var(--hf-closed); border-color: var(--lw-line); background: var(--lw-negative-soft); }
            .lw-hf-chip.w-UNKNOWN { color: var(--hf-unknown); }
            .lw-hf-chip.s-NOW { background: var(--hf-gold); border-color: var(--hf-gold); color: var(--lw-on-accent); }
            .lw-hf-chip.s-EARLY { color: var(--hf-open); border-color: var(--lw-line); }
            .lw-hf-chip.s-WATCH { color: var(--hf-text); }
            .lw-hf-chip.s-LATE { color: var(--hf-narrow); border-color: var(--lw-line); }
            .lw-hf-chip.s-DROP { color: var(--hf-dim); border-style: dashed; }
            .lw-hf-chip.warn { color: var(--lw-accent-ink); border-color: var(--lw-accent-line); background: var(--lw-accent-soft); }
            .lw-hf-chip.good { color: var(--hf-open); border-color: var(--lw-line); }
            .lw-hf-chip.bad { color: var(--lw-negative); border-color: var(--lw-line); }
            .lw-hf-chip.ai { color: var(--lw-positive); border-color: var(--lw-line); background: var(--lw-positive-soft); }

            /* ── 스토리 카드 ── */
            .lw-hf-list { display: flex; flex-direction: column; gap: 12px; }
            .lw-hf-card {
                display: flex; flex-direction: column; gap: 11px; padding: 15px 16px; min-width: 0;
                border: 1px solid var(--hf-line); border-radius: 14px; background: var(--hf-panel);
                transition: border-color var(--lw-fast) var(--lw-ease), background-color var(--lw-fast) var(--lw-ease);
            }
            .lw-hf-card:hover { border-color: var(--lw-line-strong); background: var(--hf-panel-2); }
            .lw-hf-card.is-NOW { border-color: var(--lw-accent-line); }
            .lw-hf-card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
            .lw-hf-card-head .lw-hf-rank { margin-left: auto; font-size: 13px; font-weight: 600; color: var(--hf-muted); font-variant-numeric: tabular-nums; }
            .lw-hf-keyword { margin: 0; font-size: 20px; font-weight: 600; color: var(--lw-text); line-height: 1.35; word-break: keep-all; }
            .lw-hf-keyword small { margin-left: 8px; font-size: 13px; font-weight: 600; color: var(--hf-dim); }
            .lw-hf-delta { margin: 0; font-size: 13px; color: var(--lw-text); line-height: 1.55; word-break: keep-all; }
            .lw-hf-delta b { color: var(--hf-opening); font-weight: 600; }
            .lw-hf-delta .src { color: var(--hf-dim); font-size: 13px; margin-left: 6px; }
            .lw-hf-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
            .lw-hf-metric { display: flex; flex-direction: column; gap: 3px; padding: 9px 10px; border-radius: 10px; background: var(--lw-raised); border: 1px solid var(--lw-line); min-width: 0; }
            .lw-hf-metric span { font-size: 13px; font-weight: 600; color: var(--hf-dim); letter-spacing: .02em; }
            .lw-hf-metric strong { font-size: 15px; font-weight: 600; color: var(--hf-text); font-variant-numeric: tabular-nums; word-break: keep-all; }
            .lw-hf-metric small { font-size: 13px; color: var(--hf-muted); }
            .lw-hf-metric.unmeasured strong { color: var(--hf-dim); font-weight: 600; }
            .lw-hf-tags { display: flex; flex-wrap: wrap; gap: 5px; }
            .lw-hf-card-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
            .lw-hf-card-foot .lw-hf-progress { margin-right: auto; font-size: 13px; color: var(--hf-dim); }

            /* ── 상세 창 ── */
            .lw-hf-modal {
                width: min(1060px, 100%); max-height: min(92vh, 1000px); display: flex; flex-direction: column;
                border: 1px solid var(--lw-line-strong); border-radius: 18px; background: var(--lw-surface); box-shadow: var(--lw-shadow-float);
            }
            .lw-hf-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid var(--hf-line); }
            .lw-hf-modal-head h3 { margin: 6px 0 0; font-size: 20px; font-weight: 600; color: var(--lw-text); word-break: keep-all; }
            .lw-hf-tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 20px; border-bottom: 1px solid var(--hf-line); }
            .lw-hf-tabs button { min-height: 44px; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--hf-line-2); background: transparent; color: var(--hf-muted); font-size: 13px; font-weight: 600; cursor: pointer; }
            .lw-hf-tabs button[aria-selected="true"] { background: var(--hf-gold); border-color: var(--hf-gold); color: var(--lw-on-accent); }
            .lw-hf-modal-body { flex: 1 1 auto; overflow-y: auto; padding: 16px 20px 22px; display: flex; flex-direction: column; gap: 16px; }
            .lw-hf-section { display: flex; flex-direction: column; gap: 9px; padding: 13px 14px; border: 1px solid var(--hf-line); border-radius: 12px; background: var(--lw-raised); min-width: 0; }
            .lw-hf-section h4 { margin: 0; font-size: 15px; font-weight: 600; color: var(--lw-text); }
            .lw-hf-section p { margin: 0; font-size: 13px; line-height: 1.6; color: var(--lw-text); word-break: keep-all; }
            .lw-hf-section .hint { font-size: 13px; color: var(--hf-dim); }
            .lw-hf-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
            .lw-hf-evidence { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
            .lw-hf-evidence li { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 13px; line-height: 1.5; color: var(--lw-text); }
            .lw-hf-evidence li small { color: var(--hf-dim); }
            .lw-hf-checks { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
            .lw-hf-checks li { display: flex; gap: 8px; font-size: 13px; color: var(--lw-text); }
            .lw-hf-checks li b { flex: none; width: 18px; text-align: center; }
            .lw-hf-checks li.pass b { color: var(--hf-open); }
            .lw-hf-checks li.fail b { color: var(--hf-closed); }
            .lw-hf-table-wrap { overflow-x: auto; }
            .lw-hf-table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
            .lw-hf-table th, .lw-hf-table td { padding: 6px 8px; border-bottom: 1px solid var(--hf-line); text-align: left; white-space: nowrap; }
            .lw-hf-table th { color: var(--hf-dim); font-weight: 600; font-size: 13px; }
            .lw-hf-table td.muted { color: var(--hf-dim); }

            /* ── 첫 카드 미리보기(중립 피드 카드 — 특정 서비스 화면을 흉내 내지 않는다) ── */
            .lw-hf-feedcards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
            .lw-hf-feedcard { display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: var(--lw-surface); border: 1px solid var(--hf-line-2); }
            .lw-hf-feedcard.chosen { border-color: var(--hf-gold); }
            .lw-hf-feedcard-media { position: relative; aspect-ratio: 16 / 9; max-width: 100%; background: var(--lw-raised); overflow: hidden; }
            .lw-hf-feedcard-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .lw-hf-feedcard-text { position: absolute; left: 10px; right: 10px; bottom: 9px; display: flex; flex-direction: column; gap: 2px; }
            .lw-hf-feedcard-text b { font-size: 17px; font-weight: 600; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,.85); word-break: keep-all; }
            .lw-hf-feedcard-text span { font-size: 13px; font-weight: 600; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,.85); }
            .lw-hf-feedcard-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px 10px; font-size: 13px; color: var(--hf-muted); }
            .lw-hf-ph {
                width: 100%; height: 100%; display: grid; place-items: center; padding: 10px; text-align: center; color: var(--hf-muted); font-size: 13px; font-weight: 600;
                background: var(--lw-raised);
            }
            .lw-hf-ph.ai { color: var(--lw-positive); background: var(--lw-positive-soft); }
            .lw-hf-ai-label { position: absolute; top: 7px; left: 7px; padding: 2px 7px; border-radius: 6px; background: var(--lw-surface); color: var(--lw-positive); font-size: 13px; font-weight: 600; }
            .lw-hf-feedcard .lw-hf-card-foot { padding: 0 10px 10px; }
            .lw-hf-feedcard .lw-hf-form { padding: 0 10px 8px; grid-template-columns: minmax(0, 1fr); }

            /* ── 이미지 · 프롬프트 ── */
            .lw-hf-images { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
            .lw-hf-image { display: flex; flex-direction: column; gap: 6px; padding: 9px; border: 1px solid var(--hf-line); border-radius: 11px; background: var(--lw-raised); min-width: 0; }
            .lw-hf-image-media { aspect-ratio: 16 / 9; max-width: 100%; border-radius: 8px; overflow: hidden; background: var(--lw-raised); }
            .lw-hf-image-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .lw-hf-kv { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 3px 9px; font-size: 13px; }
            .lw-hf-kv dt { color: var(--hf-dim); font-weight: 600; white-space: nowrap; }
            .lw-hf-kv dd { margin: 0; color: var(--lw-text); word-break: break-word; }
            .lw-hf-prompt { display: flex; flex-direction: column; gap: 7px; }
            .lw-hf-prompt textarea, .lw-hf-draft textarea {
                width: 100%; min-height: 110px; resize: vertical; padding: 10px 11px; border-radius: 10px; border: 1px solid var(--hf-line-2);
                background: var(--lw-surface); color: var(--hf-text); font-size: 13px; line-height: 1.6; font-family: inherit;
            }
            .lw-hf-draft textarea { min-height: 380px; font-size: 13px; }
            .lw-hf-crops { display: grid; grid-template-columns: 2fr 1fr 1.4fr; gap: 10px; align-items: start; }
            .lw-hf-crop { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
            .lw-hf-crop div { position: relative; max-width: 100%; border-radius: 8px; overflow: hidden; background: var(--lw-raised); }
            .lw-hf-crop img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .lw-hf-crop span { font-size: 13px; color: var(--hf-dim); font-weight: 600; }
            .lw-hf-crop .lw-hf-crop-square { aspect-ratio: 1 / 1; }
            .lw-hf-crop .lw-hf-crop-wide { aspect-ratio: 16 / 9; }
            .lw-hf-crop .lw-hf-crop-orig img { height: auto; object-fit: contain; }
            .lw-hf-crop .lw-hf-ai-label { font-size: 13px; }

            /* ── 제목 ── */
            .lw-hf-titles { display: flex; flex-direction: column; gap: 8px; }
            .lw-hf-title { display: flex; flex-direction: column; gap: 6px; padding: 11px 12px; border: 1px solid var(--hf-line); border-radius: 11px; background: var(--lw-raised); }
            .lw-hf-title.chosen { border-color: var(--hf-gold); background: var(--lw-accent-soft); }
            .lw-hf-title strong { font-size: 15px; font-weight: 600; color: var(--lw-text); word-break: keep-all; }
            .lw-hf-title-meta { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; font-size: 13px; color: var(--hf-muted); }
            .lw-hf-chip.v-STOP { color: var(--hf-open); border-color: var(--lw-line); }
            .lw-hf-chip.v-FLAT { color: var(--hf-muted); }
            .lw-hf-chip.v-OVER { color: var(--hf-closed); border-color: var(--lw-line); }
            .lw-hf-fold summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--hf-muted); }

            /* ── 폼 ── */
            .lw-hf-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
            .lw-hf-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
            .lw-hf-field label { font-size: 13px; font-weight: 600; color: var(--hf-muted); }
            .lw-hf-field input, .lw-hf-field select {
                min-height: 44px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--hf-line-2); background: var(--lw-surface); color: var(--hf-text); font-size: 13px; min-width: 0;
            }
            .lw-hf-field small { font-size: 13px; color: var(--hf-dim); }
            .lw-hf-check { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--lw-text); }
            .lw-hf-busy { font-size: 13px; color: var(--hf-opening); font-weight: 600; }
            .lw-hf-error { font-size: 13px; color: var(--lw-negative); font-weight: 600; word-break: break-word; }

            @media (max-width: 860px) {
                .lw-hf-status { grid-template-columns: minmax(0, 1fr); }
                .lw-hf-status-actions { justify-content: flex-start; }
                .lw-hf-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .lw-hf-grid2, .lw-hf-form { grid-template-columns: minmax(0, 1fr); }
                .lw-hf-feedcards { grid-template-columns: minmax(0, 1fr); }
                .lw-hf-crops { grid-template-columns: minmax(0, 1fr); }
                .lw-hf-modal { max-height: 100vh; border-radius: 14px; }
                .lw-hf-modal-head, .lw-hf-tabs, .lw-hf-modal-body { padding-left: 14px; padding-right: 14px; }
            }
            @media (prefers-reduced-motion: reduce) {
                .lw-hf-card { transition: none; }
            }
        `}</style>
    );
}

export default HomefeedStyles;
