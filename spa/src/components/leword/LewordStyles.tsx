/**
 * /leword 화면 스타일.
 *
 * 인라인 스타일을 쓰는 프로젝트지만 이 화면은 사이드바 + 그리드 + 표라서
 * 인라인으로 쓰면 같은 값을 수십 번 반복하게 된다. 한 곳에 모아 두면
 * 카드 하나를 고칠 때 다섯 군데를 찾아다니지 않아도 된다.
 */
function LewordStyles() {
    return (
        <style>{`
            .lw-app {
                display: grid;
                grid-template-columns: 248px minmax(0, 1fr);
                min-height: calc(100vh - 72px);
                padding-top: 72px;
                background:
                    radial-gradient(900px 500px at 82% -8%, rgba(124,92,255,.15), transparent 60%),
                    radial-gradient(700px 500px at -8% 108%, rgba(0,224,198,.08), transparent 55%),
                    #07090d;
                color: #ebedf2;
            }

            /* ── 사이드바 ── */
            .lw-side {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 22px 14px 20px;
                border-right: 1px solid rgba(255,255,255,.08);
                background: linear-gradient(180deg, rgba(255,255,255,.022), transparent);
                position: sticky;
                top: 72px;
                height: calc(100vh - 72px);
                overflow-y: auto;
            }

            .lw-brand { display: flex; align-items: center; gap: 10px; padding: 4px 10px 18px; }
            .lw-logo {
                display: grid;
                place-items: center;
                width: 30px; height: 30px;
                border-radius: 9px;
                background: linear-gradient(135deg, #7c5cff, #b14cff);
                color: #fff; font-weight: 900;
                box-shadow: 0 0 0 1px rgba(124,92,255,.35), 0 8px 30px rgba(124,92,255,.18);
            }
            .lw-brand b { font-size: 17px; letter-spacing: -.3px; color: #fff; }

            .lw-nav { display: flex; flex-direction: column; gap: 3px; }
            .lw-navi {
                display: flex; align-items: center; gap: 11px;
                width: 100%;
                padding: 11px 12px;
                border: 1px solid transparent;
                border-radius: 10px;
                background: transparent;
                color: #9aa1b2;
                font-size: 14px; font-weight: 700; text-align: left;
                cursor: pointer;
                transition: background .16s, color .16s, border-color .16s;
            }
            .lw-navi span { width: 18px; text-align: center; opacity: .85; font-size: 13px; }
            .lw-navi em { font-style: normal; }
            .lw-navi:hover { background: rgba(255,255,255,.045); color: #ebedf2; }
            .lw-navi.on {
                background: linear-gradient(135deg, rgba(124,92,255,.20), rgba(124,92,255,.06));
                border-color: rgba(124,92,255,.32);
                color: #fff;
            }

            .lw-side-foot {
                margin-top: auto;
                padding: 14px;
                border: 1px solid rgba(255,255,255,.08);
                border-radius: 14px;
                background: rgba(255,255,255,.032);
            }
            .lw-side-foot p { margin: 0 0 10px; color: #9aa1b2; font-size: 12.5px; line-height: 1.55; }
            .lw-side-foot a {
                display: block;
                padding: 9px;
                border-radius: 10px;
                background: linear-gradient(135deg, #a78bfa, #6d5ce8);
                color: #07090d;
                font-size: 13px; font-weight: 900; text-align: center; text-decoration: none;
            }
            .lw-side-foot a.lw-ghost {
                margin-top: 7px;
                background: transparent;
                border: 1px solid rgba(255,255,255,.14);
                color: rgba(235,242,250,.8);
            }

            /* ── 본문 ── */
            .lw-main { padding: clamp(20px, 3vw, 34px) clamp(16px, 3vw, 34px) 72px; min-width: 0; }

            .lw-intro { margin-bottom: 20px; }
            .lw-intro h1 { margin: 0 0 8px; color: #fff; font-size: clamp(23px, 3vw, 30px); font-weight: 900; }
            .lw-intro p { margin: 0 0 8px; color: rgba(235,242,250,.7); font-size: 14.5px; line-height: 1.65; max-width: 720px; }
            .lw-source { color: #646b7d; font-size: 12px; font-weight: 700; }

            /* ── 검색·도구 줄 ── */
            .lw-search, .lw-toolbar {
                display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
                margin-bottom: 16px;
            }
            .lw-search input, .lw-toolbar input {
                flex: 1; min-width: 200px;
                padding: 12px 14px;
                border: 1px solid rgba(255,255,255,.11);
                border-radius: 11px;
                background: rgba(255,255,255,.04);
                color: #fff; font-size: 14.5px;
            }
            .lw-search input:focus, .lw-toolbar input:focus { outline: 2px solid rgba(124,92,255,.5); outline-offset: 1px; }
            .lw-search-two input:nth-of-type(2) { flex: 1.4; }
            .lw-search button[type="submit"] {
                padding: 12px 22px;
                border: none; border-radius: 11px;
                background: linear-gradient(135deg, #a78bfa, #6d5ce8);
                color: #07090d; font-size: 14.5px; font-weight: 900; cursor: pointer;
            }
            .lw-search button[type="submit"]:disabled { opacity: .5; cursor: not-allowed; }

            .lw-segment { display: flex; gap: 6px; }
            .lw-segment-wrap { flex-wrap: wrap; }
            .lw-segment button {
                padding: 9px 14px;
                border: 1px solid rgba(255,255,255,.11);
                border-radius: 999px;
                background: rgba(255,255,255,.035);
                color: rgba(235,242,250,.72);
                font-size: 13px; font-weight: 800; cursor: pointer;
            }
            .lw-segment button.on { background: rgba(124,92,255,.2); border-color: rgba(124,92,255,.42); color: #fff; }
            .lw-count { margin-left: auto; color: #646b7d; font-size: 13px; font-weight: 800; }

            /* ── 사용량 ── */
            .lw-usage {
                display: flex; flex-wrap: wrap; gap: 6px 18px;
                margin-bottom: 14px; padding: 10px 14px;
                border: 1px solid rgba(255,255,255,.08);
                border-radius: 11px;
                background: rgba(255,255,255,.025);
                color: rgba(235,242,250,.62);
                font-size: 12.5px; font-weight: 700;
            }
            .lw-usage.warn { border-color: rgba(245,197,24,.35); background: rgba(245,197,24,.07); color: #f5c518; }

            /* ── 안내·오류 ── */
            .lw-note {
                margin-bottom: 16px; padding: 16px 18px;
                border: 1px solid rgba(255,255,255,.09);
                border-radius: 13px;
                background: rgba(255,255,255,.028);
                color: rgba(235,242,250,.72);
                font-size: 14px; line-height: 1.7;
            }
            .lw-note strong { display: block; margin-bottom: 5px; color: #fff; font-size: 15px; }
            .lw-note p { margin: 0; }
            .lw-note-detail { margin-top: 7px !important; color: #646b7d; font-size: 12.5px; font-family: ui-monospace, monospace; }
            .lw-note-plain { font-size: 13px; }
            .lw-note-setup { border-color: rgba(124,92,255,.3); background: rgba(124,92,255,.08); }
            .lw-note-limit { border-color: rgba(245,197,24,.32); background: rgba(245,197,24,.07); }
            .lw-note-error { border-color: rgba(255,107,129,.32); background: rgba(255,107,129,.07); }
            .lw-note button {
                margin-top: 10px; padding: 9px 16px;
                border: none; border-radius: 10px;
                background: linear-gradient(135deg, #FFD700, #FFA500);
                color: #1a1205; font-size: 13px; font-weight: 900; cursor: pointer;
            }

            .lw-license {
                margin-bottom: 16px; padding: 14px 16px;
                border: 1px solid rgba(255,255,255,.1); border-radius: 13px;
                background: rgba(255,255,255,.03);
            }
            .lw-license label { display: block; margin-bottom: 8px; color: #fff; font-size: 13px; font-weight: 800; }
            .lw-license div { display: flex; gap: 8px; }
            .lw-license input {
                flex: 1; padding: 10px 13px;
                border: 1px solid rgba(255,255,255,.12); border-radius: 10px;
                background: rgba(0,0,0,.28); color: #fff; font-size: 14px;
            }
            .lw-license button {
                padding: 10px 18px; border: none; border-radius: 10px;
                background: linear-gradient(135deg, #FFD700, #FFA500);
                color: #1a1205; font-size: 13px; font-weight: 900; cursor: pointer;
            }
            .lw-license small { display: block; margin-top: 8px; color: #646b7d; font-size: 12px; }

            /* ── 패널·지표 ── */
            .lw-panel {
                margin-bottom: 20px; padding: 18px 20px;
                border: 1px solid rgba(255,255,255,.09); border-radius: 16px;
                background: rgba(255,255,255,.028);
            }
            .lw-panel-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
            .lw-panel-head h2 { margin: 0; color: #fff; font-size: 19px; font-weight: 900; }
            .lw-panel-head span { color: #646b7d; font-size: 12.5px; font-weight: 700; }
            .lw-panel-foot { margin: 12px 0 0; color: #646b7d; font-size: 12px; }

            .lw-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 10px; }
            .lw-metric {
                padding: 13px 14px;
                border: 1px solid rgba(255,255,255,.08); border-radius: 12px;
                background: rgba(255,255,255,.028);
            }
            .lw-metric span { display: block; color: #9aa1b2; font-size: 12px; font-weight: 700; }
            .lw-metric strong { display: block; margin-top: 5px; color: #fff; font-size: 21px; font-weight: 900; }
            .lw-metric small { display: block; margin-top: 3px; color: #646b7d; font-size: 11.5px; }

            /* ── 카드 그리드 ── */
            .lw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(306px, 1fr)); gap: 12px; }
            .lw-grid-video { grid-template-columns: repeat(auto-fill, minmax(292px, 1fr)); }

            .lw-card {
                display: flex; flex-direction: column; gap: 10px;
                padding: 15px 16px;
                border: 1px solid rgba(255,255,255,.085); border-radius: 14px;
                background: rgba(255,255,255,.03);
            }
            .lw-card h3 {
                margin: 0; color: #fff; font-size: 15.5px; font-weight: 800; line-height: 1.4;
                word-break: keep-all;
                display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
            }
            .lw-card-note { margin: 0; color: #646b7d; font-size: 12px; line-height: 1.5; }
            .lw-card-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: auto; }
            .lw-card-metrics > div { min-width: 0; }
            .lw-card-metrics span { display: block; color: #646b7d; font-size: 11px; font-weight: 700; }
            .lw-card-metrics strong {
                display: block; margin-top: 3px; color: #ebedf2; font-size: 15px; font-weight: 900;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .lw-card-metrics .hot strong { color: #00e0c6; }

            .lw-card-actions { display: flex; gap: 7px; }
            /* 좁은 칸에서 '검색결과 확 인' 처럼 두 줄로 깨지던 것을 막는다. */
            .lw-card-actions button, .lw-card-actions a { white-space: nowrap; }
            .lw-card-actions button, .lw-card-actions a {
                flex: 1;
                padding: 9px 10px;
                border: 1px solid rgba(124,92,255,.32); border-radius: 10px;
                background: rgba(124,92,255,.14);
                color: #c9bcff; font-size: 12.5px; font-weight: 800; text-align: center; text-decoration: none;
                cursor: pointer;
            }
            .lw-card-actions a { border-color: rgba(255,255,255,.11); background: rgba(255,255,255,.04); color: rgba(235,242,250,.74); }
            .lw-card-actions button:hover { background: rgba(124,92,255,.24); }

            /* ── 유튜브 카드 ── */
            .lw-card-video { padding: 0; overflow: hidden; }
            .lw-card-video h3, .lw-card-video .lw-card-note, .lw-card-video .lw-card-metrics, .lw-card-video .lw-card-actions {
                margin-left: 15px; margin-right: 15px;
            }
            .lw-card-video .lw-card-actions { margin-bottom: 15px; }
            .lw-video-thumb { position: relative; display: block; aspect-ratio: 16 / 9; background: rgba(255,255,255,.05); }
            .lw-video-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .lw-video-noimg { display: block; width: 100%; height: 100%; }
            .lw-video-rank {
                position: absolute; left: 10px; top: 10px;
                min-width: 26px; padding: 3px 8px;
                border-radius: 8px; background: rgba(7,9,13,.82);
                color: #fff; font-size: 12px; font-weight: 900; text-align: center;
            }

            /* ── 표 ── */
            .lw-table-scroll { overflow-x: auto; }
            .lw-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
            .lw-table th, .lw-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,.07); }
            .lw-table thead th { color: #646b7d; font-size: 12px; font-weight: 800; white-space: nowrap; }
            .lw-table tbody th { color: #fff; font-weight: 800; }
            .lw-table tbody th small { display: block; margin-top: 3px; color: #646b7d; font-size: 11.5px; font-weight: 600; }
            .lw-table td { color: rgba(235,242,250,.78); white-space: nowrap; }
            .lw-rank-in { color: #00e0c6 !important; font-weight: 900; }
            .lw-rank-out { color: #9aa1b2 !important; }
            .lw-rank-title { max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
            .lw-rank-title a { color: rgba(235,242,250,.82); }
            .lw-row-actions { display: flex; gap: 6px; }

            .lw-mini {
                padding: 6px 12px;
                border: 1px solid rgba(124,92,255,.32); border-radius: 8px;
                background: rgba(124,92,255,.14);
                color: #c9bcff; font-size: 12px; font-weight: 800; cursor: pointer;
            }
            .lw-mini-ghost { border-color: rgba(255,255,255,.12); background: transparent; color: rgba(235,242,250,.6); }

            /* ── 제휴 바로가기 ── */
            .lw-affiliate-links { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-top: 14px; }
            .lw-affiliate-links a {
                padding: 13px 15px;
                border: 1px solid rgba(255,255,255,.1); border-radius: 12px;
                background: rgba(255,255,255,.035);
                text-decoration: none;
            }
            .lw-affiliate-links strong { display: block; color: #fff; font-size: 14px; font-weight: 900; }
            .lw-affiliate-links span { display: block; margin-top: 4px; color: #646b7d; font-size: 12px; }
            .lw-affiliate-links a:hover { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.18); }

            /* ── 선점 카드 ── */
            .lw-topic-chips button em { font-style: normal; opacity: .6; margin-left: 3px; }
            .lw-topic-tag {
                align-self: flex-start;
                padding: 3px 9px; border-radius: 999px;
                background: rgba(124,92,255,.16); border: 1px solid rgba(124,92,255,.3);
                color: #c9bcff; font-size: 11.5px; font-weight: 800;
            }
            .lw-card-pre { position: relative; }
            .lw-intent-tag, .lw-trend-tag, .lw-warn-tag {
                padding: 3px 9px; border-radius: 999px;
                font-size: 11.5px; font-weight: 800; border: 1px solid;
            }
            .lw-intent-tag { background: rgba(0,224,198,.10); border-color: rgba(0,224,198,.30); color: #7fded1; }
            .lw-trend-tag  { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.16); color: #9aa1b2; }
            /* 경고는 눈에 띄되 카드를 지배하지 않게. 버리라는 뜻이 아니라 알려주는 것이다. */
            .lw-warn-tag   { background: rgba(245,197,24,.10); border-color: rgba(245,197,24,.32); color: #f5c518; }
            /*
             * 황금지수 판. 사장님 지정 색: 약함 노랑 · 적당 초록 · 황금 적색 · 초황금 금색.
             * 색만 바꾸고 구조는 같게 둔다 — 단계가 달라도 눈이 같은 자리를 읽는다.
             */
            .lw-gold {
                display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 18px;
                align-items: center; margin: 0 0 16px; padding: 16px 20px;
                border-radius: 14px; border: 1px solid var(--gold-line);
                background: linear-gradient(135deg, var(--gold-bg-a), var(--gold-bg-b));
            }
            /* 열을 명시한다. grid-row 만 주면 자동배치가 숫자를 1열로 끌어와 좌우가 뒤집힌다. */
            .lw-gold-head { grid-column: 1; grid-row: 1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
            .lw-gold-label {
                padding: 4px 11px; border-radius: 999px;
                border: 1px solid var(--gold-line); background: var(--gold-chip);
                color: var(--gold-ink); font-size: 12px; font-weight: 900; letter-spacing: .02em;
            }
            /* 키워드도 단계 색으로. 지수만 색을 주면 무엇이 초황금인지 눈에 안 걸린다. */
            .lw-gold-keyword { color: var(--gold-ink); font-size: 18px; font-weight: 900; word-break: keep-all; }
            .lw-gold-figure { grid-column: 2; grid-row: 1 / span 2; text-align: right; }
            .lw-gold-figure em {
                display: block; font-style: normal; font-size: 34px; font-weight: 900;
                line-height: 1; color: var(--gold-ink);
            }
            .lw-gold-figure span { display: block; margin-top: 5px; color: rgba(235,242,250,.5); font-size: 11px; font-weight: 700; }
            .lw-gold-reason { grid-column: 1; grid-row: 2; margin: 0; color: rgba(235,242,250,.72); font-size: 12.5px; word-break: keep-all; }

            /* 카드 제목에 붙는 축소판. 목록에서 초황금이 눈에 바로 걸려야 한다. */
            .lw-card-gold { display: flex; flex-direction: column; gap: 5px; color: var(--gold-ink) !important; }
            .lw-gold-mini {
                align-self: flex-start; padding: 2px 8px; border-radius: 999px;
                border: 1px solid var(--gold-line); background: var(--gold-chip);
                color: var(--gold-ink); font-size: 10.5px; font-weight: 900; letter-spacing: .02em;
            }
            /* 제휴 3열. 좁아지면 한 열씩 내려간다 — 카드가 눌리면 상품명이 안 읽힌다. */
            /* 라이선스 잠금 안내. 광고처럼 보이지 않게 톤을 낮춘다 — 이미 쓰는 사람에게도 뜬다. */
            .lw-write-lanes { margin-bottom: 8px; }
            .lw-write-lanes button { font-weight: 800; }
            .lw-write-hint {
                margin: 0 0 12px; padding: 9px 13px; border-radius: 9px;
                background: rgba(124,92,255,.1); border: 1px solid rgba(124,92,255,.2);
                color: rgba(207,196,255,.9); font-size: 12.5px; word-break: keep-all;
            }
            .lw-gate {
                display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
                margin: 0 0 14px; padding: 16px 20px; border-radius: 13px;
                border: 1px solid rgba(124,92,255,.3);
                background: linear-gradient(135deg, rgba(124,92,255,.13), rgba(124,92,255,.05));
            }
            .lw-gate-body strong { display: block; margin-bottom: 5px; color: #fff; font-size: 14px; font-weight: 900; }
            .lw-gate-body p { margin: 0; color: rgba(235,242,250,.72); font-size: 12.5px; line-height: 1.55; word-break: keep-all; }
            .lw-gate-body b { color: #cfc4ff; }
            .lw-gate-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
            .lw-gate-form { display: flex; gap: 6px; }
            .lw-gate-form input {
                width: 190px; padding: 9px 11px; border-radius: 9px;
                border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.94);
                color: #10131d; font-size: 13px;
            }
            .lw-gate-login, .lw-gate-form button, .lw-gate-buy {
                padding: 9px 14px; border-radius: 9px; white-space: nowrap; cursor: pointer;
                font-size: 12.5px; font-weight: 800; text-decoration: none;
                border: 1px solid rgba(124,92,255,.45); background: rgba(124,92,255,.24); color: #cfc4ff;
            }
            .lw-gate-buy { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: rgba(235,242,250,.8); }
            .lw-gate-login:hover, .lw-gate-form button:hover { background: rgba(124,92,255,.34); }
            .lw-lane-list-wide { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; padding: 0; }
            /* 상품 보드 — 그림이 커야 무슨 물건인지 한눈에 들어온다. */
            .lw-product-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
            .lw-product {
                display: grid; grid-template-columns: 26px 72px minmax(0, 1fr); gap: 12px; align-items: start;
                padding: 13px; border: 1px solid rgba(255,255,255,.08); border-radius: 12px;
                background: rgba(255,255,255,.03);
            }
            .lw-product-rank { color: #b8a6ff; font-size: 13px; font-weight: 900; padding-top: 3px; }
            .lw-product img { width: 72px; height: 72px; object-fit: cover; border-radius: 9px; background: rgba(255,255,255,.05); }
            .lw-product-body { min-width: 0; }
            .lw-product-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 7px; }
            .lw-discount, .lw-rocket, .lw-goldbox {
                padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 900;
                border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: rgba(235,242,250,.78);
            }
            .lw-discount { border-color: rgba(255,107,107,.45); background: rgba(255,107,107,.14); color: #ff8f8f; }
            .lw-rocket { border-color: rgba(90,169,255,.45); background: rgba(90,169,255,.13); color: #8ec5ff; }
            .lw-product-name { display: block; margin-bottom: 8px; color: #fff; font-size: 13.5px; font-weight: 800; line-height: 1.45; text-decoration: none; word-break: keep-all; }
            .lw-product-name:hover { color: #cfc4ff; }
            .lw-product-metrics { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 9px; }
            .lw-product-metrics span { color: rgba(235,242,250,.5); font-size: 11px; }
            .lw-product-metrics strong { color: #fff; font-size: 12px; font-weight: 800; margin-left: 3px; }
            @media (max-width: 620px) { .lw-product { grid-template-columns: 22px minmax(0, 1fr); } .lw-product img { display: none; } }
            .lw-lanes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
            @media (max-width: 1180px) { .lw-lanes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
            @media (max-width: 780px) { .lw-lanes { grid-template-columns: minmax(0, 1fr); } }
            .lw-lane {
                border: 1px solid rgba(255,255,255,.08); border-radius: 14px;
                background: rgba(255,255,255,.02); overflow: hidden;
            }
            .lw-lane-head { padding: 16px 16px 14px; border-bottom: 1px solid rgba(255,255,255,.07); }
            .lw-lane-head h2 { margin: 0 0 6px; color: #fff; font-size: 15px; font-weight: 900; }
            .lw-lane-head p { margin: 0 0 5px; color: rgba(235,242,250,.62); font-size: 12px; line-height: 1.5; word-break: keep-all; }
            .lw-lane-status { color: rgba(250,204,21,.82) !important; font-size: 11.5px !important; }
            .lw-lane-head a { color: #b8a6ff; font-size: 12px; font-weight: 800; text-decoration: none; }
            .lw-lane-list { margin: 0; padding: 10px; list-style: none; display: flex; flex-direction: column; gap: 9px; }
            .lw-lane-card {
                display: flex; gap: 10px; padding: 12px;
                border: 1px solid rgba(255,255,255,.07); border-radius: 11px;
                background: rgba(255,255,255,.03);
            }
            .lw-lane-rank {
                flex: 0 0 auto; width: 22px; height: 22px; border-radius: 7px;
                display: flex; align-items: center; justify-content: center;
                background: rgba(124,92,255,.18); color: #b8a6ff; font-size: 11px; font-weight: 900;
            }
            .lw-lane-body { min-width: 0; flex: 1 1 auto; }
            .lw-lane-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 7px; }
            .lw-lane-body h3 { margin: 0 0 5px; color: #fff; font-size: 14px; font-weight: 900; word-break: keep-all; }
            .lw-lane-product { margin: 0 0 8px; color: rgba(235,242,250,.6); font-size: 11.5px; line-height: 1.45; word-break: keep-all; }
            .lw-lane-metrics { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 9px; }
            .lw-lane-metrics span { color: rgba(235,242,250,.5); font-size: 11px; }
            .lw-lane-metrics strong { color: #fff; font-size: 12.5px; font-weight: 800; margin-left: 3px; }
            .lw-lane-hint { margin: 9px 0 0; color: rgba(250,204,21,.8); font-size: 11.5px; line-height: 1.45; word-break: keep-all; }
            .lw-coupang { margin: 10px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
            .lw-coupang li { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
            .lw-coupang img { width: 38px; height: 38px; object-fit: cover; border-radius: 7px; background: rgba(255,255,255,.05); }
            .lw-coupang a { color: rgba(235,242,250,.82); font-size: 11.5px; line-height: 1.35; text-decoration: none; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
            .lw-coupang a:hover { color: #cfc4ff; }
            .lw-coupang strong { color: #ffb765; font-size: 12px; font-weight: 900; white-space: nowrap; }
            .lw-lane-empty { margin: 0; padding: 18px 16px 22px; color: rgba(235,242,250,.42); font-size: 12px; text-align: center; }
            .lw-lane-actions { display: flex; gap: 6px; }
            .lw-lane-actions button, .lw-lane-actions a {
                flex: 1 1 0; padding: 7px 6px; border-radius: 8px; text-align: center;
                font-size: 11.5px; font-weight: 800; cursor: pointer; text-decoration: none; white-space: nowrap;
                border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); color: rgba(235,242,250,.8);
            }
            .lw-lane-actions button:hover, .lw-lane-actions a:hover { background: rgba(124,92,255,.2); color: #cfc4ff; }
            .lw-gold-ultra  { --gold-ink: #ffd700; --gold-line: rgba(255,215,0,.5);  --gold-chip: rgba(255,215,0,.16);  --gold-bg-a: rgba(255,215,0,.13);  --gold-bg-b: rgba(255,165,0,.06); }
            .lw-gold-golden { --gold-ink: #ff6b6b; --gold-line: rgba(255,107,107,.45); --gold-chip: rgba(255,107,107,.15); --gold-bg-a: rgba(255,107,107,.11); --gold-bg-b: rgba(255,64,64,.05); }
            .lw-gold-fair   { --gold-ink: #4ade80; --gold-line: rgba(74,222,128,.4);  --gold-chip: rgba(74,222,128,.14);  --gold-bg-a: rgba(74,222,128,.1);   --gold-bg-b: rgba(16,185,129,.05); }
            .lw-gold-weak   { --gold-ink: #facc15; --gold-line: rgba(250,204,21,.34); --gold-chip: rgba(250,204,21,.12); --gold-bg-a: rgba(250,204,21,.08);  --gold-bg-b: rgba(202,138,4,.04); }

            @media (max-width: 560px) {
                .lw-gold { grid-template-columns: minmax(0, 1fr); }
                .lw-gold-head, .lw-gold-reason, .lw-gold-figure { grid-column: 1; grid-row: auto; }
                .lw-gold-figure { text-align: left; }
            }
            .lw-surface-tag {
                padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 800;
                border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05);
                color: rgba(235,242,250,.78);
            }
            .lw-surface-tag.surface-naver-blog { border-color: rgba(3,199,90,.45); color: #6ee7a0; background: rgba(3,199,90,.12); }
            .lw-surface-tag.surface-wordpress { border-color: rgba(90,169,255,.45); color: #8ec5ff; background: rgba(90,169,255,.12); }
            .lw-surface-tag.surface-kin { border-color: rgba(124,92,255,.5); color: #b8a6ff; background: rgba(124,92,255,.14); }
            .lw-surface-tag.surface-shopping { border-color: rgba(255,138,0,.45); color: #ffb765; background: rgba(255,138,0,.12); }
            .lw-plan-surface p { margin: 0 0 9px; color: rgba(235,242,250,.86); font-size: 13.5px; line-height: 1.6; word-break: keep-all; }
            .lw-surface-rank { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
            .lw-surface-rank li { display: flex; gap: 9px; align-items: baseline; color: rgba(235,242,250,.8); font-size: 13px; }
            .lw-surface-rank span {
                flex: 0 0 auto; min-width: 74px; padding: 2px 8px; border-radius: 7px;
                background: rgba(255,255,255,.06); color: rgba(235,242,250,.58);
                font-size: 11px; font-weight: 800;
            }
            .lw-surface-note { margin-top: 9px !important; color: #ffb765 !important; font-size: 12.5px !important; }
            .lw-early-tag {
                padding: 3px 9px; border-radius: 999px;
                background: linear-gradient(135deg, rgba(255,138,0,.24), rgba(255,64,129,.22));
                border: 1px solid rgba(255,138,0,.45);
                color: #ffb765; font-size: 11px; font-weight: 900;
            }
            .lw-evidence-early { color: #ffb765 !important; }
            .lw-plan-early {
                margin: 0 22px; padding: 13px 15px; border-radius: 12px;
                border: 1px solid rgba(255,138,0,.35);
                background: linear-gradient(135deg, rgba(255,138,0,.12), rgba(255,64,129,.08));
            }
            .lw-plan-early strong { display: block; margin-bottom: 7px; color: #ffb765; font-size: 13px; font-weight: 900; }
            .lw-plan-early ul { margin: 0; padding-left: 17px; display: flex; flex-direction: column; gap: 6px; }
            .lw-plan-early li { color: rgba(255,183,101,.9); font-size: 13px; line-height: 1.55; word-break: keep-all; }
            .lw-plan-backdrop {
                position: fixed; inset: 0; z-index: 90;
                display: flex; align-items: center; justify-content: center;
                padding: 24px;
                background: rgba(6,8,15,.72); backdrop-filter: blur(4px);
            }
            .lw-plan-modal {
                width: min(680px, 100%); max-height: min(84vh, 860px);
                display: flex; flex-direction: column;
                border: 1px solid rgba(124,92,255,.32); border-radius: 18px;
                background: #10131d; box-shadow: 0 28px 70px rgba(0,0,0,.6);
                overflow: hidden;
            }
            .lw-plan-head {
                display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
                padding: 20px 22px 14px;
                border-bottom: 1px solid rgba(255,255,255,.07);
            }
            .lw-plan-head h3 {
                margin: 9px 0 0; color: #fff; font-size: 20px; font-weight: 900;
                word-break: keep-all; line-height: 1.35;
            }
            .lw-plan-tier {
                display: inline-block; margin-left: 6px; padding: 3px 9px; border-radius: 999px;
                background: rgba(0,224,198,.14); color: #7fded1; font-size: 11px; font-weight: 800;
            }
            .lw-plan-close {
                flex: 0 0 auto; width: 32px; height: 32px; border-radius: 9px;
                border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04);
                color: rgba(235,242,250,.7); cursor: pointer; font-size: 13px;
            }
            .lw-plan-close:hover { background: rgba(255,255,255,.09); color: #fff; }
            .lw-plan-metrics {
                display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px;
                padding: 14px 22px;
            }
            .lw-plan-metrics div { display: flex; flex-direction: column; gap: 3px; }
            .lw-plan-metrics span { color: rgba(235,242,250,.5); font-size: 11px; font-weight: 700; }
            .lw-plan-metrics strong { color: #fff; font-size: 17px; font-weight: 900; }
            .lw-plan-metrics .hot strong { color: #00e0c6; }
            .lw-plan-when {
                margin: 0 22px 4px; padding: 10px 13px; border-radius: 10px;
                background: rgba(0,224,198,.12); color: #7fded1;
                font-size: 13px; font-weight: 800; word-break: keep-all;
            }
            .lw-plan-body {
                flex: 1 1 auto; overflow-y: auto;
                display: flex; flex-direction: column; gap: 18px;
                padding: 16px 22px 20px;
            }
            .lw-plan-body section strong {
                display: block; margin-bottom: 8px;
                color: #fff; font-size: 13px; font-weight: 900;
            }
            .lw-plan-body ul, .lw-plan-rivals {
                margin: 0; padding-left: 17px;
                display: flex; flex-direction: column; gap: 7px;
            }
            .lw-plan-body li {
                color: rgba(235,242,250,.84); font-size: 13.5px; line-height: 1.62;
                word-break: keep-all;
            }
            .lw-plan-rivals li { color: rgba(235,242,250,.6); font-size: 13px; }
            .lw-plan-caution strong { color: #f5c518; }
            .lw-plan-caution li { color: rgba(245,197,24,.86); }
            .lw-plan-foot {
                display: flex; gap: 9px; padding: 14px 22px 18px;
                border-top: 1px solid rgba(255,255,255,.07);
            }
            .lw-plan-foot button, .lw-plan-foot a {
                flex: 1 1 0; padding: 11px 12px; border-radius: 10px; text-align: center;
                font-size: 13px; font-weight: 800; cursor: pointer; text-decoration: none;
                border: 1px solid rgba(124,92,255,.4); background: rgba(124,92,255,.2); color: #cfc4ff;
            }
            .lw-plan-foot a {
                border-color: rgba(255,255,255,.11); background: rgba(255,255,255,.04);
                color: rgba(235,242,250,.74);
            }
            .lw-plan-foot button:hover { background: rgba(124,92,255,.3); }
            .lw-copy {
                min-width: 52px;
                background: rgba(255,255,255,.05) !important;
                border-color: rgba(255,255,255,.12) !important;
            }
            .lw-timing {
                margin: 0; padding: 8px 11px;
                border-radius: 9px; background: rgba(0,224,198,.08);
                color: #7fded1; font-size: 12.5px; font-weight: 700;
            }
            .lw-card-tags { display: flex; flex-wrap: wrap; gap: 5px; }
            .lw-tier-tag {
                padding: 3px 9px; border-radius: 999px;
                font-size: 11.5px; font-weight: 800; border: 1px solid;
            }
            /* 확실한 층일수록 색이 진하다. 아래 층을 위 층처럼 보이게 칠하지 않는다. */
            .lw-tier-tag.tier-a { background: rgba(0,224,198,.18); border-color: rgba(0,224,198,.45); color: #00e0c6; }
            .lw-tier-tag.tier-b { background: rgba(0,224,198,.09); border-color: rgba(0,224,198,.26); color: #7fded1; }
            .lw-tier-tag.tier-c { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.16); color: #9aa1b2; }
            .lw-tier-tag.tier-d { background: rgba(245,197,24,.10); border-color: rgba(245,197,24,.32); color: #f5c518; }
            .lw-evidence { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
            .lw-evidence li {
                display: flex; align-items: flex-start; gap: 7px;
                color: rgba(235,242,250,.82); font-size: 12.5px; line-height: 1.5;
            }
            .lw-evidence li span { flex: 0 0 auto; width: 13px; color: #00e0c6; font-size: 11px; line-height: 1.6; }
            .lw-card-pre.locked > *:not(.lw-lock) { filter: blur(5px); opacity: .5; pointer-events: none; user-select: none; }
            .lw-lock {
                position: absolute; inset: 0;
                display: grid; place-items: center;
                border-radius: 14px; background: rgba(7,9,13,.35);
            }
            .lw-lock span { font-size: 22px; }

            /* ── 내 API 키 ── */
            .lw-key-on { color: #00e0c6 !important; font-weight: 900; }
            .lw-key-issue { margin-left: auto; color: #9aa1b2; font-size: 12.5px; font-weight: 700; }
            .lw-key-issue:hover { color: #c9bcff; }
            .lw-key-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
            .lw-key-field span { display: block; margin-bottom: 6px; color: #9aa1b2; font-size: 12px; font-weight: 700; }
            .lw-key-field div { display: flex; gap: 6px; }
            .lw-key-field input {
                flex: 1; min-width: 0; padding: 10px 13px;
                border: 1px solid rgba(255,255,255,.12); border-radius: 10px;
                background: rgba(0,0,0,.28); color: #fff; font-size: 13.5px;
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            }
            .lw-key-field input:focus { outline: 2px solid rgba(124,92,255,.5); outline-offset: 1px; }
            .lw-key-actions { display: flex; align-items: center; gap: 10px; }
            .lw-key-save {
                padding: 12px 26px; border: none; border-radius: 11px;
                background: linear-gradient(135deg, #a78bfa, #6d5ce8);
                color: #07090d; font-size: 14.5px; font-weight: 900; cursor: pointer;
            }

            /* ── 모바일 ── */
            @media (max-width: 900px) {
                .lw-app { grid-template-columns: minmax(0, 1fr); }
                .lw-side {
                    position: static; height: auto;
                    border-right: none; border-bottom: 1px solid rgba(255,255,255,.08);
                    padding: 16px 14px;
                }
                .lw-nav { flex-direction: row; overflow-x: auto; gap: 6px; scrollbar-width: none; }
                .lw-nav::-webkit-scrollbar { display: none; }
                .lw-navi { flex: 0 0 auto; padding: 9px 13px; font-size: 13px; }
                .lw-navi span { display: none; }
                .lw-side-foot { display: none; }
                .lw-card-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            }
        `}</style>
    );
}

export default LewordStyles;
