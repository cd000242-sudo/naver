/**
 * 홈판 신호 탭 스타일(lw-hf-*) — /leword 어두운 판 · 골드 액션 · 반투명 패널 규칙을 그대로 따른다.
 * 창(WINDOW) 색은 의미색이다: 열림 청록 · 열리는 중 금 · 좁아짐 주황 · 닫힘 분홍 · 판정 불가 회색.
 */
function HomefeedStyles() {
    return (
        <style>{`
            .lw-hf {
                --hf-open: #35d0ba; --hf-opening: #ffd27a; --hf-narrow: #ff9f43; --hf-closed: #ff6b81; --hf-unknown: #9aa1b2;
                --hf-accent: #b48cff; --hf-gold: #FFA500; --hf-panel: rgba(255,255,255,.028); --hf-panel-2: rgba(255,255,255,.045);
                --hf-line: rgba(255,255,255,.08); --hf-line-2: rgba(255,255,255,.14); --hf-text: #ebedf2; --hf-muted: #9aa1b2; --hf-dim: #646b7d;
                display: flex; flex-direction: column; gap: 14px; min-width: 0;
            }
            .lw-hf a { color: #9fc6ff; text-decoration: none; }
            .lw-hf a:hover { text-decoration: underline; }
            .lw-hf .hint, .lw-hf-editorial-pending { color: var(--hf-muted); font-size: 13px; line-height: 1.7; }
            .lw-hf-editorial-toolbar { display: flex; gap: 16px; justify-content: space-between; align-items: center; flex-wrap: wrap; padding: 20px 0 8px; }
            .lw-hf-editorial-toolbar strong { font-size: 20px; }
            .lw-hf-editorial-toolbar p { color: var(--hf-muted); font-size: 13px; margin: 7px 0 0; }
            .lw-hf-eyebrow { color: var(--hf-muted); font-size: 12px; margin: 14px 0 0; }
            .lw-hf-section .lw-hf-editorial-summary { font-size: 21px; font-weight: 700; line-height: 1.6; word-break: keep-all; color: var(--hf-text); }
            .lw-hf-collection > summary { cursor: pointer; font-size: 12px; line-height: 1.6; color: var(--hf-muted); padding: 8px 0; }
            .lw-hf .lw-hf-editorial-form { grid-template-columns: minmax(0, 1fr); }
            .lw-hf-editorial-stack { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
            .lw-hf-editorial-fieldset { border: 0; padding: 0; margin: 0; }
            .lw-hf-editorial-pitch { display: grid; gap: 8px; border-left: 2px solid var(--hf-accent); padding: 3px 0 3px 14px; margin: 16px 0; }
            .lw-hf-editorial-pitch p { margin: 0; font-size: 14px; line-height: 1.6; }
            .lw-hf-editorial-pitch b { display: inline-block; min-width: 90px; color: var(--hf-muted); font-size: 12px; }
            .lw-hf-editorial-angles { display: grid; gap: 10px; }
            .lw-hf-angle { display: flex; flex-direction: column; gap: 9px; padding: 17px; border-radius: 12px; text-align: left; background: var(--hf-panel); border: 1px solid var(--hf-line-2); color: var(--hf-text); cursor: pointer; line-height: 1.6; }
            .lw-hf-angle.selected { border-color: var(--hf-accent); background: rgba(180,140,255,.07); }
            .lw-hf-angle small, .lw-hf-facts small, .lw-hf-outline small { display: block; color: var(--hf-muted); line-height: 1.6; }
            .lw-hf-facts { display: grid; gap: 18px; }
            .lw-hf-facts article { background: var(--hf-panel); padding: 16px; border-radius: 10px; line-height: 1.7; }
            .lw-hf-facts blockquote { margin: 12px 0 6px; padding-left: 12px; border-left: 2px solid var(--hf-line-2); color: #c4c8d1; font-size: 13px; }
            .lw-hf-facts a { font-size: 12px; }
            .lw-hf-outline { padding-left: 24px; line-height: 1.7; }
            .lw-hf-outline li { margin: 16px 0; }
            .lw-hf-outline p { margin: 6px 0; }
            .lw-hf-editorial-preview { display: block; width: 100%; max-width: 320px; max-height: 220px; object-fit: contain; border-radius: 8px; margin: 10px 0; }
            .lw-hf button:disabled { cursor: not-allowed; opacity: .5; }
            .lw-hf button:focus-visible, .lw-hf select:focus-visible, .lw-hf input:focus-visible, .lw-hf textarea:focus-visible {
                outline: 2px solid rgba(180,140,255,.7); outline-offset: 2px;
            }

            /* ── 수집 상태 줄 ── */
            .lw-hf-status {
                display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 16px; align-items: center;
                padding: 14px 16px; border: 1px solid var(--hf-line); border-radius: 14px; background: var(--hf-panel);
            }
            .lw-hf-status-main { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
            .lw-hf-status-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; font-size: 13px; color: var(--hf-muted); }
            .lw-hf-status-line b { color: var(--hf-text); font-weight: 800; }
            .lw-hf-state { display: inline-flex; align-items: center; gap: 7px; font-weight: 800; color: var(--hf-text); }
            .lw-hf-state i { width: 8px; height: 8px; border-radius: 50%; background: var(--hf-dim); }
            .lw-hf-state.on i { background: var(--hf-open); box-shadow: 0 0 0 3px rgba(53,208,186,.18); }
            .lw-hf-state.run i { background: var(--hf-opening); }
            .lw-hf-sources { display: flex; flex-wrap: wrap; gap: 5px; }
            .lw-hf-source {
                display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px;
                border: 1px solid var(--hf-line); font-size: 11.5px; color: var(--hf-muted);
            }
            .lw-hf-source i { width: 6px; height: 6px; border-radius: 50%; background: var(--hf-open); }
            .lw-hf-source.error i { background: var(--hf-closed); }
            .lw-hf-source.skipped i { background: var(--hf-dim); }
            .lw-hf-source.error { color: #ffb3c0; border-color: rgba(255,107,129,.3); }
            .lw-hf-status-actions { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; }
            .lw-hf-counts { display: flex; flex-wrap: wrap; gap: 6px; }
            .lw-hf-count { padding: 3px 10px; border-radius: 999px; background: var(--hf-panel-2); font-size: 12px; font-weight: 800; color: var(--hf-muted); font-variant-numeric: tabular-nums; }
            .lw-hf-count b { color: var(--hf-text); margin-left: 4px; }

            /* ── 버튼 ── */
            .lw-hf-btn {
                display: inline-flex; align-items: center; justify-content: center; gap: 6px;
                padding: 8px 13px; border-radius: 9px; border: 1px solid var(--hf-line-2); background: transparent;
                color: rgba(235,242,250,.85); font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap;
            }
            .lw-hf-btn:hover { border-color: rgba(180,140,255,.5); color: #fff; }
            .lw-hf-btn:disabled { opacity: .45; cursor: not-allowed; }
            .lw-hf-btn.primary { background: var(--hf-gold); border-color: var(--hf-gold); color: #1a1206; font-weight: 900; }
            .lw-hf-btn.primary:hover { background: #ffb733; color: #1a1206; }
            .lw-hf-btn.small { padding: 5px 9px; font-size: 11.5px; }

            /* ── 필터 ── */
            .lw-hf-filters { display: flex; flex-direction: column; gap: 9px; }
            .lw-hf-filter-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
            .lw-hf-select, .lw-hf-search {
                padding: 8px 10px; border-radius: 9px; border: 1px solid var(--hf-line-2); background: #0d1017; color: var(--hf-text); font-size: 12.5px;
            }
            .lw-hf-search { flex: 1 1 180px; min-width: 0; }
            .lw-hf-toggle {
                padding: 6px 11px; border-radius: 999px; border: 1px solid var(--hf-line-2); background: transparent;
                color: var(--hf-muted); font-size: 12px; font-weight: 700; cursor: pointer;
            }
            .lw-hf-toggle[aria-pressed="true"] { border-color: rgba(180,140,255,.6); background: rgba(180,140,255,.14); color: #e3d6ff; }

            /* ── 칩 ── */
            .lw-hf-chip {
                display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;
                border: 1px solid var(--hf-line-2); font-size: 11.5px; font-weight: 800; color: var(--hf-muted); white-space: nowrap;
            }
            .lw-hf-chip.w-OPEN { color: var(--hf-open); border-color: rgba(53,208,186,.45); background: rgba(53,208,186,.1); }
            .lw-hf-chip.w-OPENING { color: var(--hf-opening); border-color: rgba(255,210,122,.45); background: rgba(255,210,122,.08); }
            .lw-hf-chip.w-NARROWING { color: var(--hf-narrow); border-color: rgba(255,159,67,.45); background: rgba(255,159,67,.08); }
            .lw-hf-chip.w-CLOSED { color: var(--hf-closed); border-color: rgba(255,107,129,.4); background: rgba(255,107,129,.07); }
            .lw-hf-chip.w-UNKNOWN { color: var(--hf-unknown); }
            .lw-hf-chip.s-NOW { background: var(--hf-gold); border-color: var(--hf-gold); color: #1a1206; }
            .lw-hf-chip.s-EARLY { color: var(--hf-open); border-color: rgba(53,208,186,.45); }
            .lw-hf-chip.s-WATCH { color: var(--hf-text); }
            .lw-hf-chip.s-LATE { color: var(--hf-narrow); border-color: rgba(255,159,67,.4); }
            .lw-hf-chip.s-DROP { color: var(--hf-dim); border-style: dashed; }
            .lw-hf-chip.warn { color: #f5c518; border-color: rgba(245,197,24,.35); background: rgba(245,197,24,.07); }
            .lw-hf-chip.good { color: var(--hf-open); border-color: rgba(53,208,186,.35); }
            .lw-hf-chip.bad { color: #ffb3c0; border-color: rgba(255,107,129,.35); }
            .lw-hf-chip.ai { color: #e3d6ff; border-color: rgba(180,140,255,.45); background: rgba(180,140,255,.1); }

            /* ── 스토리 카드 ── */
            .lw-hf-list { display: flex; flex-direction: column; gap: 12px; }
            .lw-hf-card {
                display: flex; flex-direction: column; gap: 11px; padding: 15px 16px; min-width: 0;
                border: 1px solid var(--hf-line); border-radius: 14px; background: var(--hf-panel);
                transition: border-color .15s ease, background .15s ease;
            }
            .lw-hf-card:hover { border-color: rgba(180,140,255,.3); background: var(--hf-panel-2); }
            .lw-hf-card.is-NOW { border-color: rgba(255,165,0,.38); }
            .lw-hf-card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
            .lw-hf-card-head .lw-hf-rank { margin-left: auto; font-size: 12px; font-weight: 800; color: var(--hf-muted); font-variant-numeric: tabular-nums; }
            .lw-hf-keyword { margin: 0; font-size: 19px; font-weight: 900; color: #fff; line-height: 1.35; word-break: keep-all; }
            .lw-hf-keyword small { margin-left: 8px; font-size: 12px; font-weight: 700; color: var(--hf-dim); }
            .lw-hf-delta { margin: 0; font-size: 13.5px; color: rgba(235,242,250,.86); line-height: 1.55; word-break: keep-all; }
            .lw-hf-delta b { color: var(--hf-opening); font-weight: 900; }
            .lw-hf-delta .src { color: var(--hf-dim); font-size: 12px; margin-left: 6px; }
            .lw-hf-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
            .lw-hf-metric { display: flex; flex-direction: column; gap: 3px; padding: 9px 10px; border-radius: 10px; background: rgba(255,255,255,.022); border: 1px solid rgba(255,255,255,.05); min-width: 0; }
            .lw-hf-metric span { font-size: 11px; font-weight: 800; color: var(--hf-dim); letter-spacing: .02em; }
            .lw-hf-metric strong { font-size: 14.5px; font-weight: 900; color: var(--hf-text); font-variant-numeric: tabular-nums; word-break: keep-all; }
            .lw-hf-metric small { font-size: 11px; color: var(--hf-muted); }
            .lw-hf-metric.unmeasured strong { color: var(--hf-dim); font-weight: 700; }
            .lw-hf-tags { display: flex; flex-wrap: wrap; gap: 5px; }
            .lw-hf-card-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
            .lw-hf-card-foot .lw-hf-progress { margin-right: auto; font-size: 11.5px; color: var(--hf-dim); }

            /* ── 상세 창 ── */
            .lw-hf-modal {
                width: min(1060px, 100%); max-height: min(92vh, 1000px); display: flex; flex-direction: column;
                border: 1px solid rgba(180,140,255,.3); border-radius: 18px; background: #10131d; box-shadow: 0 28px 70px rgba(0,0,0,.6);
            }
            .lw-hf-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid var(--hf-line); }
            .lw-hf-modal-head h3 { margin: 6px 0 0; font-size: 20px; font-weight: 900; color: #fff; word-break: keep-all; }
            .lw-hf-tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 20px; border-bottom: 1px solid var(--hf-line); }
            .lw-hf-tabs button { padding: 7px 12px; border-radius: 999px; border: 1px solid var(--hf-line-2); background: transparent; color: var(--hf-muted); font-size: 12.5px; font-weight: 800; cursor: pointer; }
            .lw-hf-tabs button[aria-selected="true"] { background: var(--hf-gold); border-color: var(--hf-gold); color: #1a1206; }
            .lw-hf-modal-body { flex: 1 1 auto; overflow-y: auto; padding: 16px 20px 22px; display: flex; flex-direction: column; gap: 16px; }
            .lw-hf-section { display: flex; flex-direction: column; gap: 9px; padding: 13px 14px; border: 1px solid var(--hf-line); border-radius: 12px; background: rgba(255,255,255,.02); min-width: 0; }
            .lw-hf-section h4 { margin: 0; font-size: 14px; font-weight: 900; color: #fff; }
            .lw-hf-section p { margin: 0; font-size: 13px; line-height: 1.6; color: rgba(235,242,250,.82); word-break: keep-all; }
            .lw-hf-section .hint { font-size: 12px; color: var(--hf-dim); }
            .lw-hf-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
            .lw-hf-evidence { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
            .lw-hf-evidence li { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 12.5px; line-height: 1.5; color: rgba(235,242,250,.85); }
            .lw-hf-evidence li small { color: var(--hf-dim); }
            .lw-hf-checks { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
            .lw-hf-checks li { display: flex; gap: 8px; font-size: 12.5px; color: rgba(235,242,250,.85); }
            .lw-hf-checks li b { flex: none; width: 18px; text-align: center; }
            .lw-hf-checks li.pass b { color: var(--hf-open); }
            .lw-hf-checks li.fail b { color: var(--hf-closed); }
            .lw-hf-table-wrap { overflow-x: auto; }
            .lw-hf-table { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }
            .lw-hf-table th, .lw-hf-table td { padding: 6px 8px; border-bottom: 1px solid var(--hf-line); text-align: left; white-space: nowrap; }
            .lw-hf-table th { color: var(--hf-dim); font-weight: 800; font-size: 11.5px; }
            .lw-hf-table td.muted { color: var(--hf-dim); }

            /* ── 첫 카드 미리보기(중립 피드 카드 — 특정 서비스 화면을 흉내 내지 않는다) ── */
            .lw-hf-feedcards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
            .lw-hf-feedcard { display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: #171b26; border: 1px solid var(--hf-line-2); }
            .lw-hf-feedcard.chosen { border-color: var(--hf-gold); }
            .lw-hf-feedcard-media { position: relative; aspect-ratio: 16 / 9; max-width: 100%; background: #0c0f16; overflow: hidden; }
            .lw-hf-feedcard-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .lw-hf-feedcard-text { position: absolute; left: 10px; right: 10px; bottom: 9px; display: flex; flex-direction: column; gap: 2px; }
            .lw-hf-feedcard-text b { font-size: 17px; font-weight: 900; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,.85); word-break: keep-all; }
            .lw-hf-feedcard-text span { font-size: 13px; font-weight: 800; color: #ffe2a3; text-shadow: 0 1px 6px rgba(0,0,0,.85); }
            .lw-hf-feedcard-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px 10px; font-size: 11.5px; color: var(--hf-muted); }
            .lw-hf-ph {
                width: 100%; height: 100%; display: grid; place-items: center; padding: 10px; text-align: center; color: var(--hf-muted); font-size: 12px; font-weight: 800;
                background: repeating-linear-gradient(135deg, rgba(255,255,255,.035) 0 10px, rgba(255,255,255,.015) 10px 20px);
            }
            .lw-hf-ph.ai { color: #e3d6ff; background: repeating-linear-gradient(135deg, rgba(180,140,255,.12) 0 10px, rgba(180,140,255,.05) 10px 20px); }
            .lw-hf-ai-label { position: absolute; top: 7px; left: 7px; padding: 2px 7px; border-radius: 6px; background: rgba(16,19,29,.85); color: #e3d6ff; font-size: 10.5px; font-weight: 800; }
            .lw-hf-feedcard .lw-hf-card-foot { padding: 0 10px 10px; }
            .lw-hf-feedcard .lw-hf-form { padding: 0 10px 8px; grid-template-columns: minmax(0, 1fr); }

            /* ── 이미지 · 프롬프트 ── */
            .lw-hf-images { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
            .lw-hf-image { display: flex; flex-direction: column; gap: 6px; padding: 9px; border: 1px solid var(--hf-line); border-radius: 11px; background: rgba(255,255,255,.02); min-width: 0; }
            .lw-hf-image-media { aspect-ratio: 16 / 9; max-width: 100%; border-radius: 8px; overflow: hidden; background: #0c0f16; }
            .lw-hf-image-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .lw-hf-kv { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 3px 9px; font-size: 12px; }
            .lw-hf-kv dt { color: var(--hf-dim); font-weight: 800; white-space: nowrap; }
            .lw-hf-kv dd { margin: 0; color: rgba(235,242,250,.85); word-break: break-word; }
            .lw-hf-prompt { display: flex; flex-direction: column; gap: 7px; }
            .lw-hf-prompt textarea, .lw-hf-draft textarea {
                width: 100%; min-height: 110px; resize: vertical; padding: 10px 11px; border-radius: 10px; border: 1px solid var(--hf-line-2);
                background: #0b0e14; color: var(--hf-text); font-size: 12.5px; line-height: 1.6; font-family: inherit;
            }
            .lw-hf-draft textarea { min-height: 380px; font-size: 13.5px; }
            .lw-hf-crops { display: grid; grid-template-columns: 2fr 1fr 1.4fr; gap: 10px; align-items: start; }
            .lw-hf-crop { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
            .lw-hf-crop div { position: relative; max-width: 100%; border-radius: 8px; overflow: hidden; background: #0c0f16; }
            .lw-hf-crop img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .lw-hf-crop span { font-size: 11px; color: var(--hf-dim); font-weight: 800; }
            .lw-hf-crop .lw-hf-crop-square { aspect-ratio: 1 / 1; }
            .lw-hf-crop .lw-hf-crop-wide { aspect-ratio: 16 / 9; }
            .lw-hf-crop .lw-hf-crop-orig img { height: auto; object-fit: contain; }
            .lw-hf-crop .lw-hf-ai-label { font-size: 10px; }

            /* ── 제목 ── */
            .lw-hf-titles { display: flex; flex-direction: column; gap: 8px; }
            .lw-hf-title { display: flex; flex-direction: column; gap: 6px; padding: 11px 12px; border: 1px solid var(--hf-line); border-radius: 11px; background: rgba(255,255,255,.02); }
            .lw-hf-title.chosen { border-color: var(--hf-gold); background: rgba(255,165,0,.06); }
            .lw-hf-title strong { font-size: 15px; font-weight: 900; color: #fff; word-break: keep-all; }
            .lw-hf-title-meta { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; font-size: 11.5px; color: var(--hf-muted); }
            .lw-hf-chip.v-STOP { color: var(--hf-open); border-color: rgba(53,208,186,.45); }
            .lw-hf-chip.v-FLAT { color: var(--hf-muted); }
            .lw-hf-chip.v-OVER { color: var(--hf-closed); border-color: rgba(255,107,129,.4); }
            .lw-hf-fold summary { cursor: pointer; font-size: 12.5px; font-weight: 800; color: var(--hf-muted); }

            /* ── 폼 ── */
            .lw-hf-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
            .lw-hf-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
            .lw-hf-field label { font-size: 11.5px; font-weight: 800; color: var(--hf-muted); }
            .lw-hf-field input, .lw-hf-field select {
                padding: 8px 10px; border-radius: 9px; border: 1px solid var(--hf-line-2); background: #0b0e14; color: var(--hf-text); font-size: 13px; min-width: 0;
            }
            .lw-hf-field small { font-size: 11px; color: var(--hf-dim); }
            .lw-hf-check { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: rgba(235,242,250,.85); }
            .lw-hf-busy { font-size: 12.5px; color: var(--hf-opening); font-weight: 800; }
            .lw-hf-error { font-size: 12.5px; color: #ffb3c0; font-weight: 700; word-break: break-word; }

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
