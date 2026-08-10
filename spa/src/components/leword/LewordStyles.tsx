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
            .lw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 12px; }
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
