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
                /*
                 * 배경 블룸을 브랜드 골드로(taste: atmospheric bloom — 저채도
                 * 라디얼이 분위기를 만든다. 보라 블룸은 골드 정체성과 싸웠다).
                 */
                background:
                    radial-gradient(900px 500px at 82% -8%, rgba(255,165,0,.09), transparent 60%),
                    radial-gradient(700px 500px at -8% 108%, rgba(0,224,198,.06), transparent 55%),
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
            /* 데스크톱은 전체 라벨, 모바일은 짧은 라벨 — 미디어쿼리가 토글한다. */
            .lw-navi-short { display: none; }
            /* 모바일 햄버거 — 데스크톱에서는 존재하지 않는다. */
            .lw-mobile-toggle, .lw-mobile-menu { display: none; }
            .lw-navi:hover { background: rgba(255,255,255,.045); color: #ebedf2; }
            /*
             * 탭별 고유색(사장님 지정 2026-08-20): 황금키워드 금 · 분석 파랑 ·
             * 지식인 초록 · 제휴 주황 · 유튜브 빨강 · 노출추적 분홍 · API 키 은색.
             * 아이콘은 항상 제 색이고, 활성 탭은 그 색으로 물든다.
             */
            .lw-navi-golden { --tabc: #ffd700; --tabc-soft: rgba(255,215,0,.14); --tabc-line: rgba(255,215,0,.4); }
            .lw-navi-analyze { --tabc: #69b7ff; --tabc-soft: rgba(105,183,255,.14); --tabc-line: rgba(105,183,255,.4); }
            .lw-navi-kin { --tabc: #2ecc71; --tabc-soft: rgba(46,204,113,.14); --tabc-line: rgba(46,204,113,.4); }
            .lw-navi-affiliate { --tabc: #ff8a3d; --tabc-soft: rgba(255,138,61,.14); --tabc-line: rgba(255,138,61,.4); }
            .lw-navi-youtube { --tabc: #ff5b5b; --tabc-soft: rgba(255,91,91,.14); --tabc-line: rgba(255,91,91,.4); }
            .lw-navi-radar { --tabc: #35d0ba; --tabc-soft: rgba(53,208,186,.14); --tabc-line: rgba(53,208,186,.4); }
            .lw-navi-rank { --tabc: #ff6bb3; --tabc-soft: rgba(255,107,179,.14); --tabc-line: rgba(255,107,179,.4); }
            .lw-navi-keys { --tabc: #c0c8d4; --tabc-soft: rgba(192,200,212,.12); --tabc-line: rgba(192,200,212,.36); }
            .lw-navi span { color: var(--tabc, currentColor); }
            .lw-navi.on {
                background: linear-gradient(135deg, var(--tabc-soft, rgba(124,92,255,.20)), transparent);
                border-color: var(--tabc-line, rgba(124,92,255,.32));
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
            /*
             * 활성 칩은 반전이다(taste: selection via inversion — 한 화면에
             * 반전 하나가 어떤 액센트 테두리보다 강한 앵커가 된다).
             */
            .lw-segment button.on { background: #FFA500; border-color: #FFA500; color: #1a1206; }
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
            .lw-more-btn {
                display: block; width: 100%; margin: 14px 0 4px; padding: 12px 16px;
                border: 1px dashed rgba(255,215,0,.4); border-radius: 12px;
                background: rgba(255,215,0,.06); color: #ffd700;
                font-size: 14px; font-weight: 700; cursor: pointer;
                transition: background .2s ease, border-color .2s ease;
            }
            .lw-more-btn:hover { background: rgba(255,215,0,.12); border-color: rgba(255,215,0,.65); }
            .lw-spark { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid rgba(255,255,255,.07); border-radius: 10px; background: rgba(255,255,255,.02); }
            /* 스파크라인 클릭 래퍼 — 버튼 기본 껍데기를 벗기고 그래프가 곧 버튼이 된다. */
            .lw-spark-open { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; text-align: inherit; color: inherit; font: inherit; }
            .lw-spark-open:hover .lw-spark { border-color: rgba(255,255,255,.18); }
            .lw-spark-open:focus-visible { outline: 2px solid rgba(124,92,255,.6); outline-offset: 2px; border-radius: 10px; }

            /* ── 수요 그래프 모달 — 중립 격자·정점 한 점 강조·글로우 없음 ── */
            .lw-chart-backdrop { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 4vh 3vw; background: rgba(4,6,10,.72); }
            .lw-chart-modal { width: min(860px, 96vw); border: 1px solid rgba(255,255,255,.14); border-radius: 14px; background: #0d1118; padding: 18px 20px 16px; }
            .lw-chart-modal header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
            .lw-chart-modal h3 { margin: 0; font-size: 19px; font-weight: 800; color: #fff; }
            .lw-chart-modal header p { margin: 4px 0 0; font-size: 12.5px; color: rgba(235,242,250,.6); }
            .lw-chart-modal header button { flex: none; width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; background: none; color: rgba(235,242,250,.7); font-size: 14px; cursor: pointer; }
            .lw-chart-modal svg { width: 100%; height: auto; display: block; }
            .lw-chart-tick { font-size: 11px; fill: rgba(235,242,250,.5); }
            .lw-chart-peak { font-size: 12px; font-weight: 700; fill: #00e0c6; }
            .lw-chart-modal footer { margin-top: 10px; font-size: 13px; color: rgba(235,242,250,.75); }
            .lw-spark svg { width: 100%; height: 56px; display: block; }
            /* 11px 미만 기능 텍스트 금지(impeccable) — 10.5px 가 검문에 걸렸다. */
            .lw-spark-foot { display: flex; gap: 8px; align-items: center; font-size: 11.5px; color: rgba(235,242,250,.55); }
            .lw-spark-foot em { font-style: normal; color: rgba(235,242,250,.7); font-weight: 700; }
            .lw-spark-foot .lw-spark-hot { color: #2ecc71; font-weight: 800; }
            .lw-why { margin: 8px 0 0; padding: 8px 10px; border-left: 2px solid rgba(255,165,0,.5); background: rgba(255,165,0,.05); border-radius: 0 8px 8px 0; font-size: 12px; line-height: 1.5; color: rgba(235,242,250,.85); }
            .lw-why em { font-style: normal; color: #ffa500; font-weight: 800; margin-right: 4px; }
            .lw-why small { display: block; margin-top: 3px; font-size: 10px; color: rgba(235,242,250,.4); }
            .lw-kin { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 8px 10px; border: 1px dashed rgba(105,183,255,.25); border-radius: 10px; background: rgba(105,183,255,.04); }
            .lw-board-list .lw-kin { grid-column: 1 / -1; }
            .lw-kin em { font-style: normal; color: #69b7ff; font-size: 11px; font-weight: 800; }
            .lw-kin a { font-size: 12px; color: rgba(235,242,250,.8); text-decoration: none; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,.1); }
            .lw-kin a:hover { border-color: rgba(105,183,255,.5); color: #fff; }
            /* 조회수 실측 — 어느 질문이 실제로 읽히는지가 글감 우선순위다. */
            .lw-kin-views { margin-left: 6px; font-size: 11px; color: #69b7ff; font-weight: 700; white-space: nowrap; }
            /* 번호 목록(사장님 지시: "1. 2. 3. 이런식으로") — 칩 무더기보다 서열이 읽힌다. */
            .lw-kin-list { margin: 0; padding: 0; list-style: none; counter-reset: kin; width: 100%; display: flex; flex-direction: column; gap: 5px; }
            .lw-kin-list li { counter-increment: kin; display: flex; align-items: baseline; gap: 8px; min-width: 0; }
            .lw-kin-list li::before { content: counter(kin); flex: none; font-size: 11.5px; font-weight: 800; color: #2ecc71; min-width: 14px; }
            .lw-kin-list a { border: 0; padding: 0; border-radius: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .lw-kin-list a:hover { text-decoration: underline; color: #fff; }

            /* ── 지식인 황금질문 탭(좌측 메뉴 독립 탭) — 실시간·급상승·숨은 3레인 ── */
            .lw-kg-list { margin: 14px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
            .lw-kg-list li { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 14px; align-items: start; padding: 14px 16px; border: 1px solid rgba(255,255,255,.09); border-radius: 12px; background: rgba(255,255,255,.025); }
            .lw-kg-rank { font-family: Consolas, monospace; font-size: 14px; font-weight: 700; color: #2ecc71; text-align: center; padding-top: 2px; }
            .lw-kg-body { min-width: 0; }
            /*
             * 전문은 다 보이되 **읽는 폭은 본문 규격(약 74자)** — 화면 전체 폭으로
             * 퍼진 200자짜리 줄이 가독성을 죽였다(사장님 지적 2026-08-20).
             */
            .lw-kg-body a { display: block; max-width: 74ch; font-size: 15.5px; font-weight: 700; color: #ebf2fa; text-decoration: none; word-break: keep-all; line-height: 1.5; }
            .lw-kg-body a:hover { color: #fff; text-decoration: underline; }
            .lw-kg-body p { margin: 6px 0 0; max-width: 74ch; font-size: 13px; color: rgba(235,242,250,.62); word-break: keep-all; line-height: 1.68; }
            .lw-kg-body small { display: block; margin-top: 7px; font-size: 12px; color: rgba(235,242,250,.6); }
            .lw-kg-body small b { color: #69b7ff; font-weight: 700; }
            .lw-kg-up { font-style: normal; color: #2ecc71; font-weight: 700; }
            /* 이미 작업한 질문 표시 — 중복 작업을 막는다. */
            .lw-kg-worked { font-style: normal; color: #ffa500; font-weight: 700; }
            .lw-engine-usage { grid-column: 1 / -1; margin: 6px 0 0; font-size: 12px; color: #646b7d; }
            .lw-engine-usage b { color: rgba(235,242,250,.8); font-weight: 700; }
            .lw-usage { margin: 10px 0 0; padding: 11px 13px; border: 1px solid rgba(124,92,255,.22); border-radius: 10px; background: rgba(124,92,255,.05); }
            .lw-usage-head { display: flex; align-items: center; gap: 9px; margin-bottom: 9px; }
            .lw-usage-plan { padding: 2px 9px; border-radius: 999px; background: rgba(124,92,255,.2); color: #cfc2ff; font-size: 12px; font-weight: 700; letter-spacing: .2px; }
            .lw-usage-who { color: #646b7d; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .lw-usage-head button { margin-left: auto; padding: 4px 10px; border: 1px solid rgba(255,255,255,.14); border-radius: 7px; background: transparent; color: rgba(235,242,250,.72); font-size: 12px; cursor: pointer; white-space: nowrap; }
            .lw-usage-head button:hover:not(:disabled) { border-color: rgba(124,92,255,.5); color: #fff; }
            .lw-usage-head button:disabled { opacity: .5; cursor: not-allowed; }
            .lw-usage-row { display: flex; align-items: center; gap: 9px; margin-top: 6px; font-size: 12.5px; }
            .lw-usage-label { width: 38px; color: rgba(235,242,250,.66); flex: none; }
            .lw-usage-bar { flex: 1; height: 7px; min-width: 60px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; }
            /* 채움은 transform 으로 늘린다 — width 를 애니메이션하면 매 프레임 레이아웃을 다시 잰다.
               둥근 끝은 트랙이 overflow:hidden 으로 깎아 주므로 채움엔 radius 를 두지 않는다. */
            .lw-usage-bar i { display: block; width: 100%; height: 100%; transform-origin: left center; transition: transform .3s ease; }
            .lw-usage-pct { width: 42px; text-align: right; color: #fff; font-weight: 700; font-variant-numeric: tabular-nums; flex: none; }
            .lw-usage-reset { color: #646b7d; white-space: nowrap; flex: none; }
            /*
             * 유튜브 빈자리 — 영상 / 실측 / 글감 3단(사장님 지정 배치 2026-08-20).
             * lw-card 클래스를 쓰지 않는다. 그게 세로 쌓기라 grid 를 덮어써서
             * 카드가 가운데로 무너졌다(실측). 이 줄은 자기 배경을 직접 갖는다.
             */
            /* ── 로그인 ─────────────────────────────────────────── */
            .lw-acct {
                display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
                padding: 10px 14px; margin-bottom: 14px;
                border: 1px solid rgba(255,255,255,.09); border-radius: 11px; background: rgba(255,255,255,.035);
            }
            .lw-acct-face {
                width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; flex: none;
                background: rgba(124,92,255,.18); border: 1px solid rgba(124,92,255,.35);
                color: #cfc2ff; font-weight: 700; font-size: 13px;
            }
            .lw-acct-id { font-weight: 700; font-size: 14.5px; color: #fff; }
            .lw-acct-meta { color: #646b7d; font-size: 12.5px; font-family: ui-monospace, monospace; }
            .lw-acct-left {
                display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px;
                font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
                background: rgba(46,204,113,.13); color: #2ecc71;
            }
            .lw-acct-left.soon { background: rgba(255,165,0,.13); color: #ffd27a; }
            .lw-acct-left.out { background: rgba(255,107,129,.13); color: #ff6b81; }
            .lw-acct-left i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
            .lw-acct-btn {
                margin-left: auto; padding: 6px 13px; border-radius: 8px; cursor: pointer;
                border: 1px solid rgba(255,255,255,.16); background: transparent; color: rgba(235,242,250,.72); font-size: 12.5px;
            }
            .lw-acct-btn:hover { border-color: rgba(124,92,255,.5); color: #fff; }
            .lw-acct-btn.on { border-color: rgba(255,165,0,.45); background: rgba(255,165,0,.1); color: #ffd27a; font-weight: 700; }

            .lw-navi.locked { opacity: .55; }
            .lw-navi-lock { margin-left: auto; font-size: 11px; font-weight: 400; }

            /*
             * 로그인은 **덮개 위에** 뜬다.
             *
             * 예전엔 position 이 없어서 페이지 흐름 안에 그냥 끼워 넣은 블록이었다.
             * 그래서 로그인 화면인데 그 아래로 보드가 통째로 다 보였다(사장님 실측
             * 2026-08-23 "왜 아래에 모자이크 없이 다 보이니?"). 요금제 창
             * (.lw-plan-backdrop)은 진작 이렇게 돼 있었는데 로그인만 빠져 있었다.
             */
            .lw-auth-wrap {
                position: fixed; inset: 0; z-index: 95;
                display: grid; place-items: center;
                padding: 24px; overflow-y: auto;
                background: rgba(6,8,15,.82); backdrop-filter: blur(6px);
            }
            .lw-auth { width: 100%; max-width: 400px; position: relative; z-index: 1; }
            .lw-auth-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; }
            .lw-auth-logo {
                width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; flex: none;
                background: linear-gradient(135deg, #ffa500, #ffd700); color: #1a1206; font-weight: 700; font-size: 15px;
            }
            .lw-auth-brand b { font-size: 17px; color: #fff; }
            .lw-auth-brand span { color: #646b7d; font-size: 13px; }
            .lw-auth h3 { margin: 0 0 6px; font-size: 20px; color: #fff; }
            .lw-auth-sub { margin: 0 0 20px; color: #646b7d; font-size: 13.5px; }
            .lw-auth-msg {
                display: flex; gap: 9px; padding: 11px 13px; border-radius: 9px; font-size: 13px;
                line-height: 1.55; margin-bottom: 16px;
            }
            .lw-auth-msg.bad { background: rgba(255,107,129,.09); border: 1px solid rgba(255,107,129,.3); color: #ffc2cb; }
            .lw-auth-msg b { color: #fff; }
            .lw-auth-field { display: block; margin-bottom: 13px; font-size: 12.5px; color: rgba(235,242,250,.68); }
            .lw-auth-field em { font-style: normal; color: #646b7d; font-size: 11.5px; }
            .lw-auth-field input {
                display: block; width: 100%; margin-top: 6px; padding: 11px 13px; border-radius: 9px;
                border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.04);
                color: #ebf2fa; font-size: 14px; font-family: inherit;
            }
            .lw-auth-field input.mono { font-family: ui-monospace, monospace; letter-spacing: .06em; }
            .lw-auth-field input:focus { outline: 2px solid rgba(124,92,255,.5); outline-offset: 1px; border-color: rgba(124,92,255,.6); }
            .lw-auth-cta {
                width: 100%; margin-top: 8px; padding: 12px; border-radius: 9px; border: 0; cursor: pointer;
                background: #7c5cff; color: #fff; font-size: 14.5px; font-weight: 700; font-family: inherit;
            }
            .lw-auth-cta.gold { background: linear-gradient(135deg, #ffa500, #ffc247); color: #1a1206; }
            .lw-auth-cta:disabled { opacity: .6; cursor: not-allowed; }
            .lw-auth-switch { margin: 16px 0 0; text-align: center; font-size: 13px; color: #646b7d; }
            .lw-auth-switch button {
                padding: 0; border: 0; background: none; cursor: pointer; font-family: inherit; font-size: 13px;
                color: #cfc2ff; border-bottom: 1px solid rgba(207,194,255,.35);
            }
            .lw-metric-verdict { padding: 3px 10px; border-radius: 8px; font-weight: 800; font-size: 12px; }
            .lw-reconnect-back { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 4vh 4vw; background: rgba(4,6,10,.78); }
            .lw-reconnect { width: 100%; max-width: 420px; padding: 22px; border: 1px solid rgba(255,165,0,.35); border-radius: 15px; background: #10131a; box-shadow: 0 24px 60px rgba(0,0,0,.5); }
            .lw-reconnect h3 { margin: 0 0 8px; font-size: 18px; color: #fff; }
            .lw-reconnect p { margin: 0 0 14px; font-size: 13.5px; color: rgba(235,242,250,.7); line-height: 1.6; }
            .lw-reconnect-why { display: block; margin-top: 7px; font-style: normal; font-size: 12px; color: #646b7d; font-family: ui-monospace, monospace; }
            .lw-reconnect ol { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 11px; }
            .lw-reconnect li span { display: block; margin-bottom: 6px; font-size: 13px; color: rgba(235,242,250,.8); }
            .lw-reconnect input { width: 100%; padding: 11px 13px; border-radius: 9px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.04); color: #ebf2fa; font-family: ui-monospace, monospace; font-size: 13px; }
            .lw-reconnect-err { color: #ff6b81 !important; }
            .lw-reconnect-row { display: flex; gap: 9px; }
            .lw-reconnect-cta { padding: 11px 18px; border: 0; border-radius: 9px; background: linear-gradient(135deg, #ffa500, #ffc247); color: #1a1206; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
            .lw-reconnect-cta:disabled { opacity: .55; cursor: not-allowed; }
            .lw-reconnect-ghost { padding: 11px 16px; border: 1px solid rgba(255,255,255,.16); border-radius: 9px; background: transparent; color: rgba(235,242,250,.7); font-size: 13.5px; cursor: pointer; font-family: inherit; }
            .lw-linktag {
                padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700;
                background: rgba(255,255,255,.07); color: rgba(235,242,250,.6);
            }
            .lw-linktag.on { background: rgba(46,204,113,.15); color: #2ecc71; }
            .lw-linktag.ready { background: rgba(255,215,0,.13); color: #ffd700; }
            /* 빈자리 판정 근거 — 무엇을 기준으로 셌는지 눈에 보이게. */
            /* 수요 그래프 기간 고르개 — 월별과 30일은 다른 자료다. */
            .lw-chart-ranges { display: flex; gap: 6px; margin: 2px 0 10px; }
            .lw-chart-ranges button {
                padding: 5px 12px; border-radius: 8px; cursor: pointer; font-family: inherit;
                border: 1px solid rgba(255,255,255,.12); background: transparent;
                color: rgba(235,242,250,.6); font-size: 12px; font-weight: 800;
            }
            .lw-chart-ranges button:hover { color: #fff; border-color: rgba(255,255,255,.24); }
            .lw-chart-ranges button.on {
                border-color: rgba(53,208,186,.55); background: rgba(53,208,186,.12); color: #6fe0d0;
            }

            .lw-slot-basis {
                margin-left: 4px; font-style: normal; font-size: 9.5px; font-weight: 700;
                color: rgba(235,242,250,.4);
            }
            .lw-slots { margin: 10px 0 0; }
            .lw-slots summary {
                cursor: pointer; color: #9aa1b2; font-size: 12px; font-weight: 700;
                padding: 5px 0;
            }
            .lw-slots summary:hover { color: #cfc4ff; }
            .lw-slots ol { margin: 6px 0 0; padding: 0 0 0 4px; list-style: none; display: grid; gap: 5px; }
            .lw-slots li { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
            .lw-slots li b { width: 16px; color: #646b7d; font-variant-numeric: tabular-nums; }
            .lw-slots li em {
                flex: 1; min-width: 0; font-style: normal; color: rgba(235,242,250,.75);
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .lw-slots li i { font-style: normal; font-size: 11px; font-weight: 800; color: #646b7d; }
            .lw-slots li.open i { color: #2ecc71; }
            .lw-slots li.open em { color: #fff; }
            .lw-slots p { margin: 8px 0 0; color: #646b7d; font-size: 11.5px; }

            /* 제휴 제목 만들기 — 세 레인(쿠팡·토스·브랜드커넥트)이 같은 모양을 쓴다. */
            /*
             * 카드(.lw-product)가 4칸 grid 라 이 블록이 5번째 칸으로 밀려
             * 26px 짜리 첫 칸에 들어갔다 — 버튼 글자가 세로로 눌렸다
             * (사장님 실측 2026-08-20). 한 줄을 통째로 쓰게 못박는다.
             */
            .lw-aff-titles { grid-column: 1 / -1; margin-top: 10px; min-width: 0; }
            .lw-aff-make {
                display: inline-flex; align-items: baseline; gap: 7px; padding: 7px 13px;
                border: 1px solid rgba(255,165,0,.4); border-radius: 8px; background: rgba(255,165,0,.1);
                color: #ffc966; font-size: 12.5px; font-weight: 700; cursor: pointer;
                white-space: nowrap;
            }
            .lw-aff-make:hover:not(:disabled) { background: rgba(255,165,0,.2); color: #fff; }
            .lw-aff-make:disabled { opacity: .6; cursor: not-allowed; }
            .lw-aff-make span { font-weight: 400; font-size: 11.5px; color: #646b7d; }
            .lw-aff-err { margin: 6px 0 0; color: #ff6b81; font-size: 12.5px; }
            .lw-aff-ideas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
            .lw-aff-ideas li { padding: 9px 11px; border-radius: 8px; background: rgba(255,255,255,.04); }
            /* 공식을 다 갖춘 하나 — 테두리 하나로만 말한다. 여러 개를 강조하면 고를 값이 없다. */
            .lw-aff-ideas li.on, .lw-yt-ideas li.on { background: rgba(255,165,0,.07); box-shadow: inset 0 0 0 1px rgba(255,165,0,.35); }
            .lw-pick {
                display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 999px;
                background: rgba(255,165,0,.18); color: #ffd27a; font-size: 10.5px; font-weight: 700;
                letter-spacing: .02em; vertical-align: 1px;
            }
            .lw-aff-ideakey { padding: 0; border: 0; background: none; color: #ffd27a; font-size: 13px; font-weight: 700; cursor: pointer; text-align: left; }
            .lw-aff-ideas button.lw-aff-ideakey:hover { text-decoration: underline; }
            .lw-aff-ideas p { margin: 5px 0 0; font-size: 12.5px; line-height: 1.5; color: rgba(235,242,250,.84); overflow-wrap: anywhere; }
            .lw-aff-ideas em { display: inline-block; min-width: 30px; margin-right: 5px; color: #646b7d; font-style: normal; font-size: 11px; }
            .lw-yt-meta { margin-left: auto; color: #646b7d; font-size: 12px; }
            .lw-yt-filters { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; margin-top: 12px; }
            .lw-yt-forms, .lw-yt-cats { display: flex; flex-wrap: wrap; gap: 6px; }
            .lw-yt-forms button, .lw-yt-cats button {
                padding: 6px 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 999px;
                background: transparent; color: rgba(235,242,250,.72); font-size: 12.5px; cursor: pointer;
            }
            .lw-yt-forms button em, .lw-yt-cats button em { font-style: normal; color: #646b7d; margin-left: 3px; font-size: 11.5px; }
            .lw-yt-forms button:hover, .lw-yt-cats button:hover { border-color: rgba(124,92,255,.45); color: #fff; }
            .lw-yt-forms button.on, .lw-yt-cats button.on { border-color: rgba(124,92,255,.6); background: rgba(124,92,255,.16); color: #fff; font-weight: 700; }
            .lw-yt-forms button.on em, .lw-yt-cats button.on em { color: #cfc2ff; }
            /* 형식 고르개는 카테고리보다 위계가 위다 — 세로 구분선으로 갈라 둔다. */
            .lw-yt-cats { padding-left: 16px; border-left: 1px solid rgba(255,255,255,.09); }
            .lw-yt-tags { display: flex; gap: 6px; margin: 8px 0 0; }
            .lw-yt-form, .lw-yt-cat { padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
            .lw-yt-form-short { background: rgba(255,0,80,.16); color: #ff8fb0; }
            .lw-yt-form-long { background: rgba(124,92,255,.16); color: #cfc2ff; }
            .lw-yt-cat { background: rgba(255,255,255,.07); color: rgba(235,242,250,.7); font-weight: 400; }
            /* 글감 주제 배지 — 쇼핑각 금색·복지 초록·AI 청록. 근거는 title 툴팁에. */
            .lw-yt-topic { padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 800; }
            .lw-yt-topic-shopping { background: rgba(255,165,0,.16); color: #ffc966; }
            .lw-yt-topic-policy { background: rgba(46,204,113,.14); color: #7dd87d; }
            .lw-yt-topic-ai { background: rgba(53,208,186,.14); color: #6fe0d0; }
            .lw-yt-topics button.on { border-color: rgba(255,165,0,.6); background: rgba(255,165,0,.14); }
            @media (max-width: 680px) {
                .lw-yt-cats { padding-left: 0; border-left: 0; }
            }
            .lw-yt-gap { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
            .lw-yt-row {
                display: grid; grid-template-columns: 260px minmax(0, 1fr) minmax(0, 320px);
                gap: 18px; align-items: start; padding: 14px;
                border: 1px solid rgba(255,255,255,.09); border-radius: 12px; background: rgba(255,255,255,.025);
            }
            .lw-yt-video { width: 100%; aspect-ratio: 16 / 9; border-radius: 9px; overflow: hidden; background: rgba(255,255,255,.06); }
            .lw-yt-video iframe { width: 100%; height: 100%; border: 0; display: block; }
            .lw-yt-video > button { position: relative; display: block; width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: pointer; }
            .lw-yt-video img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .lw-yt-play {
                position: absolute; inset: 0; margin: auto; width: 46px; height: 46px; border-radius: 50%;
                display: grid; place-items: center; background: rgba(0,0,0,.62); color: #fff; font-size: 17px;
                transition: transform .15s ease, background .15s ease;
            }
            .lw-yt-video > button:hover .lw-yt-play { background: rgba(255,0,0,.85); transform: scale(1.08); }

            .lw-yt-body { min-width: 0; }
            .lw-yt-body h3 { margin: 0 0 8px; font-size: 18px; color: #fff; overflow-wrap: anywhere; }
            .lw-yt-metrics { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: rgba(235,242,250,.66); }
            .lw-yt-metrics strong { color: #fff; font-variant-numeric: tabular-nums; }
            .lw-yt-ratio strong { color: #ffa500; }
            .lw-yt-from { margin: 9px 0 0; color: #646b7d; font-size: 12.5px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
            .lw-yt-date { margin: 5px 0 0; color: #646b7d; font-size: 12px; }
            .lw-yt-date span { color: rgba(235,242,250,.5); }
            .lw-yt-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 11px; }
            .lw-yt-analyze { padding: 7px 13px; border: 1px solid rgba(124,92,255,.4); border-radius: 8px; background: rgba(124,92,255,.12); color: #cfc2ff; font-size: 12.5px; font-weight: 700; cursor: pointer; }
            .lw-yt-act {
                padding: 7px 13px; border: 1px solid rgba(255,255,255,.14); border-radius: 8px;
                background: transparent; color: #c0c8d4; font-size: 12.5px; font-weight: 700;
                cursor: pointer; text-decoration: none; display: inline-flex; align-items: center;
            }
            .lw-yt-act:hover { border-color: rgba(124,92,255,.5); color: #fff; }
            .lw-yt-analyze:hover { background: rgba(124,92,255,.22); color: #fff; }

            .lw-yt-write { min-width: 0; padding-left: 16px; border-left: 1px solid rgba(255,255,255,.07); }
            .lw-yt-write h4 { margin: 0 0 9px; font-size: 12.5px; font-weight: 700; color: rgba(235,242,250,.62); }
            .lw-yt-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
            .lw-yt-chips button { padding: 4px 9px; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; background: transparent; color: rgba(235,242,250,.78); font-size: 12px; cursor: pointer; }
            .lw-yt-chips button:hover { border-color: rgba(124,92,255,.5); color: #fff; }
            .lw-yt-make { padding: 7px 13px; border: 1px solid rgba(255,165,0,.4); border-radius: 8px; background: rgba(255,165,0,.1); color: #ffc966; font-size: 12.5px; font-weight: 700; cursor: pointer; }
            .lw-yt-make:hover { background: rgba(255,165,0,.2); color: #fff; }
            .lw-yt-hint { margin: 0; color: #646b7d; font-size: 12.5px; }
            .lw-yt-err { margin: 0 0 6px; color: #ff6b81; font-size: 12.5px; }
            .lw-yt-ideas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
            .lw-yt-ideas li { padding: 9px 10px; border-radius: 8px; background: rgba(255,255,255,.04); }
            .lw-yt-ideakey { padding: 0; border: 0; background: none; color: #ffd27a; font-size: 13px; font-weight: 700; cursor: pointer; text-align: left; }
            .lw-yt-ideakey:hover { text-decoration: underline; }
            .lw-yt-ideas p { margin: 5px 0 0; font-size: 12.5px; line-height: 1.5; color: rgba(235,242,250,.84); overflow-wrap: anywhere; }
            .lw-yt-ideas em { display: inline-block; min-width: 30px; margin-right: 5px; color: #646b7d; font-style: normal; font-size: 11px; }

            @media (max-width: 1180px) {
                .lw-yt-row { grid-template-columns: 220px minmax(0, 1fr); }
                .lw-yt-write { grid-column: 1 / -1; padding-left: 0; padding-top: 12px; border-left: 0; border-top: 1px solid rgba(255,255,255,.07); }
            }
            @media (max-width: 680px) {
                .lw-yt-row { grid-template-columns: 1fr; }
                .lw-yt-meta { margin-left: 0; flex-basis: 100%; }
            }
            .lw-usage-err { margin: 4px 0 0; color: #ff6b81; font-size: 12.5px; }
            .lw-usage-warn { margin: 9px 0 0; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(245,197,24,.32); background: rgba(245,197,24,.07); color: rgba(235,242,250,.82); font-size: 12.5px; line-height: 1.55; }
            .lw-usage-warn.hard { border-color: rgba(255,107,129,.36); background: rgba(255,107,129,.08); }
            .lw-usage-warn b { color: #fff; }
            .lw-usage-foot { margin: 9px 0 0; color: #646b7d; font-size: 11.5px; }
            .lw-usage-foot b { color: rgba(235,242,250,.75); font-weight: 700; }
            @media (max-width: 560px) {
                .lw-usage-reset { display: none; }
            }
            .lw-kg-recent { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: rgba(235,242,250,.7); white-space: nowrap; }
            .lw-kg-recent input { accent-color: #ffa500; width: 15px; height: 15px; }
            .lw-kg-kw { border: 0; background: none; padding: 0; font-size: 12px; color: #69b7ff; cursor: pointer; text-decoration: underline; }
            .lw-kg-copy { flex: none; border: 1px solid rgba(255,255,255,.16); border-radius: 8px; background: none; color: rgba(235,242,250,.65); font-size: 11.5px; padding: 6px 10px; cursor: pointer; white-space: nowrap; }
            .lw-kg-copy:hover { border-color: rgba(255,215,0,.5); color: #fff; }
            .lw-kg-row-actions { display: flex; gap: 6px; }
            .lw-kg-answer { flex: none; border: 0; border-radius: 8px; background: #ffa500; color: #14100a; font-size: 11.5px; font-weight: 800; padding: 6px 12px; cursor: pointer; white-space: nowrap; }
            .lw-kg-answer:hover { filter: brightness(1.06); }
            @media (max-width: 640px) { .lw-kg-list li { grid-template-columns: 24px minmax(0, 1fr); } .lw-kg-row-actions { display: none; } }

            /* ── 답변 작업대 ── */
            .lw-kg-work-meta { display: block; margin-top: 3px; color: rgba(235,242,250,.55); font-size: 12px; }
            .lw-kg-work-body { margin: 0; white-space: pre-wrap; color: rgba(235,242,250,.88); font-size: 13.5px; line-height: 1.7; word-break: keep-all; max-height: 220px; overflow-y: auto; padding: 11px 13px; border: 1px solid rgba(255,255,255,.09); border-radius: 10px; background: rgba(255,255,255,.03); }
            .lw-kg-draft { width: 100%; resize: vertical; padding: 12px 14px; border: 1px solid rgba(255,255,255,.16); border-radius: 10px; background: rgba(255,255,255,.03); color: #ebf2fa; font: inherit; font-size: 14px; line-height: 1.7; }
            .lw-kg-draft:focus { outline: none; border-color: rgba(255,165,0,.5); }
            .lw-kg-work-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
            .lw-kg-work-actions button, .lw-kg-open { padding: 9px 14px; border-radius: 9px; border: 1px solid rgba(255,255,255,.16); background: none; color: rgba(235,242,250,.8); font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; }
            .lw-kg-work-actions button:hover, .lw-kg-open:hover { border-color: rgba(255,165,0,.45); color: #fff; }
            .lw-kg-work-actions button:disabled { opacity: .5; cursor: default; }
            .lw-kg-generate { background: #ffa500 !important; border-color: #ffa500 !important; color: #14100a !important; }
            .lw-kg-linkbox { display: flex; align-items: center; gap: 7px; margin-left: auto; font-size: 13px; color: rgba(235,242,250,.8); cursor: pointer; }
            .lw-kg-linkbox input { accent-color: #ffa500; width: 15px; height: 15px; }
            .lw-kg-linkbox.off { opacity: .45; cursor: not-allowed; }
            .lw-kg-bloginput { width: 100%; margin-top: 8px; padding: 9px 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 9px; background: rgba(255,255,255,.03); color: #ebf2fa; font-size: 12.5px; }
            /* 글감 드롭다운 — 키워드 하나에 SEO·홈판 제목이 접혀 있다. */
            .lw-ideas { display: flex; flex-direction: column; gap: 7px; }
            .lw-idea { border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: rgba(255,255,255,.025); overflow: hidden; }
            .lw-idea.on { border-color: rgba(255,165,0,.42); }
            .lw-idea-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 13px; border: 0; background: none; color: #ebf2fa; font-size: 14px; font-weight: 700; cursor: pointer; text-align: left; }
            .lw-idea-head span { color: rgba(235,242,250,.45); font-size: 11px; }
            .lw-idea-body { padding: 0 13px 12px; display: flex; flex-direction: column; gap: 7px; }
            .lw-idea-why { margin: 0 0 3px; font-size: 12px; color: rgba(235,242,250,.55); }
            .lw-idea-click { margin: 0 0 5px; font-size: 12px; color: #ffc169; }
            .lw-idea-title { display: flex; align-items: center; gap: 9px; min-width: 0; }
            .lw-idea-title span { flex: none; font-size: 11px; font-weight: 800; color: rgba(255,165,0,.9); border: 1px solid rgba(255,165,0,.35); border-radius: 6px; padding: 2px 7px; }
            .lw-idea-title em { flex: 1; min-width: 0; font-style: normal; font-size: 13.5px; color: #fff; font-weight: 600; }
            .lw-idea-title button { flex: none; border: 1px solid rgba(255,255,255,.16); border-radius: 7px; background: none; color: rgba(235,242,250,.7); font-size: 11.5px; padding: 3px 9px; cursor: pointer; }
            .lw-idea-title button:hover { border-color: rgba(255,165,0,.5); color: #fff; }

            /* 엔진 선택 목록 — 하나 골라 연동하고 그것으로 쓴다. */
            .lw-engines-list { display: flex; flex-direction: column; gap: 8px; }
            .lw-engine-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 12px 14px; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; background: rgba(255,255,255,.025); }
            .lw-engine-row.on { border-color: rgba(255,165,0,.5); background: rgba(255,165,0,.07); }
            .lw-engine-name b { display: block; font-size: 14.5px; color: #ebf2fa; }
            .lw-engine-name small { display: block; margin-top: 2px; font-size: 11.5px; color: rgba(235,242,250,.5); }
            /* 상태 문구가 길어졌다 — "앱에만 연동"과 "사이트까지 연동"을 구분해야 해서다.
               좁은 화면에서 줄바꿈되도록 nowrap 을 풀고 오른쪽 정렬로 붙인다. */
            .lw-engine-state { font-size: 12px; font-weight: 700; color: rgba(235,242,250,.55); text-align: right; max-width: 230px; line-height: 1.45; }
            .lw-engine-state.ok { color: #2ecc71; }
            /* 앱에만 연동된 상태 — 초록이 아니라 "할 일이 남았다"는 색으로 구분한다. */
            .lw-engine-state.half { color: #f0b53f; }

            /* 연동 순서 — 무엇을 먼저 해야 하는지가 화면에 없어서 생긴 혼선을 없앤다. */
            .lw-connect-steps { margin: 0 0 12px; padding: 14px 16px 14px 34px; border: 1px solid rgba(255,165,0,.28); border-radius: 12px; background: rgba(255,165,0,.05); display: grid; gap: 7px; }
            .lw-connect-steps li { font-size: 12.5px; line-height: 1.6; color: rgba(235,242,250,.72); }
            .lw-connect-steps li b { color: #ebf2fa; }
            /* 끝난 단계는 힘을 빼고, 지금 할 단계만 눈에 들어오게 한다. */
            .lw-connect-steps li.done { color: rgba(235,242,250,.4); }
            .lw-connect-steps li.done b { color: rgba(235,242,250,.55); font-weight: 600; }
            .lw-connect-steps li.now { color: #ebf2fa; }
            .lw-connect-steps li.now b { color: #ffa500; }
            .lw-connect-steps .lw-step-ok { color: #2ecc71; font-weight: 700; }
            .lw-connect-steps li em { display: block; margin-top: 3px; font-style: normal; font-size: 11.5px; color: rgba(235,242,250,.45); }
            .lw-connect-steps .lw-step-cta {
                display: inline-block; margin-top: 6px; padding: 7px 15px; border-radius: 8px;
                background: #ffa500; color: #1a1200; font-weight: 800; font-size: 12.5px; text-decoration: none;
            }
            .lw-connect-steps .lw-step-cta:hover { background: #ffb733; }

            /* 재는 중 표시 — 글자만으로는 멈춘 건지 도는 건지 알 수 없다. */
            .lw-usage-spin {
                display: inline-block; width: 11px; height: 11px; margin-right: 6px; vertical-align: -1px;
                border: 2px solid rgba(255,255,255,.25); border-top-color: #ffa500; border-radius: 50%;
                animation: lwSpin .7s linear infinite;
            }
            @keyframes lwSpin { to { transform: rotate(360deg); } }
            @media (prefers-reduced-motion: reduce) { .lw-usage-spin { animation-duration: 2.4s; } }
            /*
             * 연동 버튼이 실제로 눌리게(사장님 지적 2026-08-22 "연동이 안 된다").
             *
             * 우측 플로팅 스택(단톡방·유튜브·1:1 문의 등, z-index 10001)이 화면에
             * 고정돼 있어 이 줄의 버튼 위를 덮고 있었다. 실측: 제미나이·그록은
             * [연동]·[사용] 둘 다, 코덱스는 [사용]이 클릭을 못 받았다
             * (elementFromPoint 로 확인 — 그 좌표에서 잡히는 건 lp-float-link 였다).
             * 화면엔 버튼이 보이는데 눌러도 아무 일이 없으니 "연동이 안 되는" 것으로만 보인다.
             * 이 줄의 버튼을 플로팅보다 위로 올려 클릭을 되찾는다.
             */
            .lw-engine-actions { display: flex; gap: 6px; position: relative; z-index: 10002; }
            .lw-engine-key { grid-column: 1 / -1; display: flex; align-items: flex-end; gap: 10px; margin-top: 4px; }
            .lw-engine-key label { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: rgba(235,242,250,.6); }
            .lw-engine-key input { width: 100%; padding: 8px 11px; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; background: rgba(255,255,255,.03); color: #ebf2fa; font-size: 12.5px; font-family: Consolas, monospace; }
            .lw-engine-key input:focus { outline: none; border-color: rgba(255,165,0,.5); }
            .lw-engine-key a { flex: none; font-size: 11.5px; color: #69b7ff; text-decoration: none; padding-bottom: 9px; }
            @media (max-width: 720px) {
                .lw-engine-row { grid-template-columns: minmax(0, 1fr); }
                .lw-engine-actions { justify-content: flex-start; }
            }

            /* 폴백 체인 상태 — 어느 CLI 가 실제로 살아 있는지 한눈에. */
            .lw-agents-block { margin-top: 14px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,.08); }
            .lw-agents-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 9px; flex-wrap: wrap; }
            .lw-agents-head b { font-size: 12.5px; font-weight: 800; color: rgba(235,242,250,.75); }
            .lw-agents { display: flex; flex-wrap: wrap; gap: 7px; }
            .lw-agent { font-size: 12px; font-weight: 700; padding: 5px 11px; border-radius: 999px; border: 1px solid rgba(255,255,255,.12); color: rgba(235,242,250,.55); white-space: nowrap; }
            .lw-agent-ok { border-color: rgba(46,204,113,.45); color: #2ecc71; background: rgba(46,204,113,.08); }
            .lw-agent-warn { border-color: rgba(255,193,7,.4); color: #ffc107; }
            .lw-agent-login { margin-left: 7px; padding: 2px 8px; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; background: none; color: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
            .lw-agent-login:hover { border-color: rgba(255,165,0,.55); color: #fff; }
            .lw-agent-login:disabled { opacity: .5; cursor: default; }

            /* 클로드 구독 연결(버튼 한 번) */
            .lw-claude-connect { display: flex; flex-direction: column; gap: 9px; margin-bottom: 12px; }
            .lw-claude-steps { padding: 12px 14px; border: 1px solid rgba(255,165,0,.32); border-radius: 11px; background: rgba(255,165,0,.06); }
            .lw-claude-steps p { margin: 0 0 9px; font-size: 13px; color: #ebf2fa; line-height: 1.6; }
            .lw-claude-steps b { color: #ffa500; }
            .lw-claude-code { display: flex; gap: 8px; }
            .lw-claude-code input { flex: 1; min-width: 0; padding: 9px 12px; border: 1px solid rgba(255,255,255,.14); border-radius: 9px; background: rgba(255,255,255,.03); color: #ebf2fa; font-size: 13px; }
            .lw-claude-code input:focus { outline: none; border-color: rgba(255,165,0,.5); }

            .lw-kg-bridge { margin: 6px 0 10px; font-size: 12.5px; color: rgba(235,242,250,.6); }
            .lw-kg-bridge.ok { color: #2ecc71; }
            .lw-kg-work-note { margin: 8px 0 0; font-size: 12.5px; color: rgba(235,242,250,.6); }
            .lw-kg-work-note a { color: #69b7ff; }
            .lw-kg-ledger p { margin: 0; font-size: 13px; color: rgba(235,242,250,.75); }
            .lw-kg-ledger b { color: #ffa500; }

            /* 키워드 옆 복사 — 액션 줄에서 홀로 밀려나던 버튼의 새 자리. */
            .lw-copy-mini { flex: none; margin-left: 2px; padding: 2px 8px; border: 1px solid rgba(255,255,255,.14); border-radius: 7px; background: none; color: rgba(235,242,250,.65); font-size: 11.5px; cursor: pointer; }
            .lw-copy-mini:hover { border-color: rgba(255,215,0,.5); color: #fff; }

            /* ── 노출 추적: 발행 글 전체 감사 표 ── */
            .lw-audit-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 800; }
            .lw-audit-in { background: rgba(46,204,113,.15); color: #2ecc71; border: 1px solid rgba(46,204,113,.4); }
            .lw-audit-out { background: rgba(255,91,91,.14); color: #ff7b7b; border: 1px solid rgba(255,91,91,.4); }
            /* 색인은 됐는데 순위만 밖 — 빨강(색인 실패)과 구분해야 할 일이 달라진다. */
            .lw-audit-half { background: rgba(240,181,63,.14); color: #f0b53f; border: 1px solid rgba(240,181,63,.4); }

            /* 노출 여부로 나눠 보기 — 200건을 한 판에 두면 손볼 것이 안 보인다. */
            .lw-audit-filters { display: flex; gap: 7px; margin: 12px 0 4px; flex-wrap: wrap; }
            .lw-audit-filters button {
                padding: 7px 15px; border-radius: 999px; cursor: pointer; font: inherit;
                font-size: 12.5px; font-weight: 700; border: 1px solid rgba(255,255,255,.12);
                background: transparent; color: rgba(235,242,250,.6);
            }
            .lw-audit-filters button.on { background: #ffa500; border-color: #ffa500; color: #1a1200; font-weight: 900; }
            .lw-audit-filters em { font-style: normal; margin-left: 5px; opacity: .75; font-variant-numeric: tabular-nums; }

            /* 노출된 자리는 눌러서 그 검색결과로 간다. */
            .lw-rank-go { color: inherit; text-decoration: none; border-bottom: 1px dashed currentColor; }
            .lw-rank-go:hover { opacity: .8; }

            /* 키워드 분석의 글감·제목 — 숫자만 보여 주면 "그래서 뭘 쓰지"가 남는다. */
            .lw-analyze-ideas { margin-top: 16px; padding: 15px 17px; border-radius: 13px; border: 1px solid rgba(255,165,0,.24); background: rgba(255,165,0,.04); }
            .lw-analyze-ideas-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
            .lw-analyze-ideas-head b { font-size: 14.5px; color: #ffa500; }
            .lw-analyze-ideas-head span { flex: 1; min-width: 200px; font-size: 11.5px; color: rgba(235,242,250,.5); }
            .lw-analyze-ideas-head button {
                padding: 9px 18px; border-radius: 9px; border: 0; cursor: pointer;
                background: #ffa500; color: #1a1200; font: inherit; font-size: 12.5px; font-weight: 800;
            }
            .lw-analyze-ideas-head button:disabled { opacity: .6; cursor: not-allowed; }
            .lw-analyze-ideas-err { margin: 10px 0 0; font-size: 12px; color: #ff8fa0; line-height: 1.6; }
            .lw-idea-list { list-style: none; margin: 13px 0 0; padding: 0; display: grid; gap: 10px; }
            .lw-idea-list li { padding: 12px 14px; border-radius: 11px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07); }
            .lw-idea-list b { display: block; font-size: 13.5px; color: #ebf2fa; margin-bottom: 4px; }
            .lw-idea-list em { display: block; font-style: normal; font-size: 11.5px; color: rgba(235,242,250,.5); line-height: 1.6; }
            .lw-idea-list .lw-idea-click { color: rgba(255,165,0,.75); }
            .lw-idea-list p { margin: 7px 0 0; font-size: 12.5px; color: rgba(235,242,250,.82); line-height: 1.6; }
            .lw-idea-list p span {
                display: inline-block; min-width: 44px; margin-right: 7px; padding: 2px 7px; border-radius: 6px;
                background: rgba(255,255,255,.07); color: rgba(235,242,250,.55); font-size: 10.5px; font-weight: 800; text-align: center;
            }

            /* 탭별 자리 — 같은 글도 탭마다 순위가 다르다. 한 줄로 나란히 보여 준다. */
            .lw-tabrank { margin: 12px 0 18px; padding: 14px 16px; border-radius: 13px; border: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.03); }
            .lw-tabrank-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
            .lw-tabrank-head b { font-size: 14px; color: #ffa500; }
            .lw-tabrank-head a { flex: 1; min-width: 160px; font-size: 11.5px; color: rgba(235,242,250,.45); text-decoration: none; word-break: break-all; }
            .lw-tabrank-head a:hover { color: rgba(235,242,250,.7); }
            .lw-tabrank-head button {
                border: 1px solid rgba(255,255,255,.14); background: transparent; color: rgba(235,242,250,.65);
                border-radius: 8px; padding: 6px 13px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 700;
            }
            .lw-tabrank-head button:hover:not(:disabled) { border-color: rgba(255,165,0,.5); color: #ffa500; }
            .lw-tabrank-head button:disabled { opacity: .55; cursor: not-allowed; }
            .lw-tabrank-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
            .lw-tabrank-card {
                display: flex; flex-direction: column; gap: 3px; text-decoration: none;
                padding: 12px 14px; border-radius: 11px;
                border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.025);
            }
            .lw-tabrank-card.on { border-color: rgba(46,204,113,.42); background: rgba(46,204,113,.08); }
            .lw-tabrank-card span { font-size: 11.5px; color: rgba(235,242,250,.55); font-weight: 700; }
            .lw-tabrank-card b { font-size: 20px; font-weight: 900; color: rgba(235,242,250,.5); font-variant-numeric: tabular-nums; }
            .lw-tabrank-card.on b { color: #2ecc71; }
            .lw-tabrank-card em { font-style: normal; font-size: 10.5px; color: rgba(235,242,250,.38); }

            /* 유튜브 지금 갱신 — 스냅샷과 별개라는 것이 눈에 보여야 한다. */
            .lw-yt-live-btn {
                margin-left: auto; padding: 8px 16px; border-radius: 9px; border: 0; cursor: pointer;
                background: #ff4d4d; color: #fff; font: inherit; font-size: 12.5px; font-weight: 800; white-space: nowrap;
            }
            .lw-yt-live-btn:disabled { opacity: .6; cursor: not-allowed; }
            .lw-live-panel {
                margin: 14px 0 20px; padding: 16px 18px; border-radius: 14px;
                border: 1px solid rgba(255,77,77,.3);
                background: radial-gradient(420px 200px at 8% 0%, rgba(255,77,77,.09), transparent 70%), rgba(255,255,255,.03);
            }
            .lw-live-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
            .lw-live-head b { font-size: 15px; color: #ff8f8f; }
            .lw-live-head span { flex: 1; min-width: 240px; font-size: 11.5px; color: rgba(235,242,250,.5); line-height: 1.55; }
            .lw-live-head button {
                border: 1px solid rgba(255,255,255,.14); background: transparent; color: rgba(235,242,250,.6);
                border-radius: 8px; padding: 5px 12px; cursor: pointer; font: inherit; font-size: 12px;
            }
            .lw-live-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
            .lw-live-card {
                display: flex; flex-direction: column; gap: 5px; text-decoration: none;
                padding: 9px; border-radius: 11px; background: rgba(255,255,255,.035);
                border: 1px solid rgba(255,255,255,.07);
            }
            .lw-live-card:hover { border-color: rgba(255,77,77,.42); }
            .lw-live-card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 7px; }
            .lw-live-card b {
                font-size: 12.5px; font-weight: 700; color: #ebf2fa; line-height: 1.45;
                display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
            }
            .lw-live-card em { font-style: normal; font-size: 11px; color: rgba(235,242,250,.45); }
            .lw-note-err { border-color: rgba(255,143,160,.35); color: #ff8fa0; }

            /* 제휴 — 막힌 니즈 옆에 실제로 뚫리는 자리. 초록은 "여기로 쓰면 된다"는 뜻이다. */
            .lw-product-slots {
                display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
                font-size: 11.5px; font-weight: 700; color: #5ee3ac;
            }
            .lw-product-slots a {
                display: inline-flex; align-items: baseline; gap: 5px;
                padding: 3px 9px; border-radius: 7px; text-decoration: none;
                background: rgba(46,204,113,.12); border: 1px solid rgba(46,204,113,.32); color: #5ee3ac;
            }
            .lw-product-slots a:hover { background: rgba(46,204,113,.2); }
            .lw-product-slots em { font-style: normal; font-weight: 500; font-size: 10.5px; opacity: .72; }

            /* 밀면 되는 자리 — 할 일이 구간마다 다르니 색으로 가른다. */
            .lw-band-keep { background: rgba(46,204,113,.14); color: #2ecc71; border: 1px solid rgba(46,204,113,.4); }
            .lw-band-push { background: rgba(255,165,0,.16); color: #ffa500; border: 1px solid rgba(255,165,0,.45); }
            .lw-band-far  { background: rgba(255,255,255,.05); color: rgba(235,242,250,.5); border: 1px solid rgba(255,255,255,.12); }
            .lw-push-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin: 14px 0 6px; }
            .lw-push-head p { margin: 0; flex: 1; min-width: 260px; font-size: 12.5px; line-height: 1.65; color: rgba(235,242,250,.68); }
            .lw-push-head p b { color: #ebf2fa; }
            .lw-push-head button {
                padding: 9px 18px; border-radius: 9px; border: 0; cursor: pointer;
                background: #ffa500; color: #1a1200; font: inherit; font-size: 12.5px; font-weight: 800;
            }
            .lw-push-head button:disabled { opacity: .6; cursor: not-allowed; }
            .lw-push-note { margin: 2px 0 8px; font-size: 12px; color: rgba(46,204,113,.85); }
            .lw-push-note.error { color: #ff8fa0; }

            /* 중단된 점검을 이어서 — 남은 건수를 그대로 적는다. */
            .lw-audit-resume {
                display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
                margin: 12px 0 0; padding: 11px 14px; border-radius: 10px;
                border: 1px solid rgba(240,181,63,.3); background: rgba(240,181,63,.07);
                font-size: 12.5px; color: rgba(235,242,250,.78);
            }
            .lw-audit-resume b { color: #f0b53f; }
            .lw-audit-resume button {
                margin-left: auto; padding: 8px 16px; border-radius: 8px; border: 0; cursor: pointer;
                background: #f0b53f; color: #1a1200; font: inherit; font-size: 12.5px; font-weight: 800;
            }
            .lw-audit-wait { background: rgba(255,255,255,.05); color: rgba(235,242,250,.55); border: 1px solid rgba(255,255,255,.12); }
            .lw-audit-why { display: block; margin-top: 4px; font-size: 11px; color: rgba(255,123,123,.75); }
            /* 실제 사용한 검색어 — 순위의 기준이 눈에 보여야 신뢰가 생긴다. */
            .lw-audit-q { display: block; margin-top: 3px; font-size: 11px; font-weight: 400; color: rgba(235,242,250,.45); white-space: nowrap; }
            .lw-audit-q-btn { border: 0; background: none; padding: 0; cursor: pointer; text-align: left; text-decoration: underline dotted; }
            .lw-audit-q-btn:hover { color: #69b7ff; }
            /* 다른 검색엔진 칩 — 누르면 그 엔진 검색이 열린다(자동 판정의 수동 검증문). */
            .lw-engines { display: flex; gap: 5px; flex-wrap: wrap; }
            .lw-engine { font-size: 11.5px; font-weight: 700; padding: 3px 8px; border-radius: 7px; border: 1px solid rgba(255,255,255,.14); color: rgba(235,242,250,.55); text-decoration: none; white-space: nowrap; }
            .lw-engine-found { border-color: rgba(46,204,113,.45); color: #2ecc71; }
            .lw-engine-blocked { border-color: rgba(255,193,7,.4); color: #ffc107; }
            .lw-engine:hover { color: #fff; }
            /* AI 평가 점수 — 실측이 아님을 라벨이 말한다. */
            .lw-score-row { display: flex; gap: 12px; flex-wrap: wrap; }
            .lw-score { flex: 1; min-width: 200px; padding: 11px 13px; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: rgba(255,255,255,.03); }
            .lw-score em { font-style: normal; font-size: 22px; font-weight: 800; color: #ffa500; margin-right: 7px; }
            .lw-score span { font-size: 12.5px; font-weight: 700; color: rgba(235,242,250,.7); }
            .lw-score small { display: block; margin-top: 5px; font-size: 12px; color: rgba(235,242,250,.55); line-height: 1.5; }
            .lw-audit-table td { vertical-align: top; }

            /* ── 글 RPM(애드센스 실측) 판정 배지 ─────────────────────────
               내 평균 RPM 과의 비교다 — 밖에서 가져온 잣대가 아니라 내 글끼리 견준다.
               숫자만 보면 어느 글을 밀지 못 고른다. 색으로 한눈에 갈라 준다. */
            .lw-rpm-hot, .lw-rpm-ok, .lw-rpm-low, .lw-rpm-na {
                display: inline-block; border-radius: 999px; padding: 3px 9px;
                font-size: 11.5px; font-weight: 700; font-style: normal;
                border: 1px solid; white-space: nowrap;
            }
            .lw-rpm-hot { color: #44d7b6; border-color: rgba(68,215,182,.4); background: rgba(68,215,182,.08); }
            .lw-rpm-ok { color: rgba(235,242,250,.8); border-color: rgba(255,255,255,.14); }
            .lw-rpm-low { color: #ff6b6b; border-color: rgba(255,107,107,.34); background: rgba(255,107,107,.06); }
            .lw-rpm-na { color: #646b7d; border-color: rgba(255,255,255,.09); }
            /* 자동 갱신 토글 — 지켜보는 판이라 마지막으로 잰 시각이 같이 보여야 한다. */
            .lw-rpm-auto {
                display: inline-flex; align-items: center; gap: 7px;
                color: rgba(235,242,250,.72); font-size: 12.5px; cursor: pointer;
            }
            .lw-rpm-auto b { color: #f4c95d; font-weight: 700; }
            /* 돈·조회수는 자릿수가 맞아야 비교가 된다. RPM 표에만 준다. */
            .lw-rpm-table td { font-variant-numeric: tabular-nums; }

            /* 차트 호버 십자선 값 — 가리킨 점의 기간·상대값. */
            .lw-chart-hover { font-size: 12px; font-weight: 700; fill: #ebf2fa; }
            .lw-spark-hover { color: #ebf2fa; font-weight: 700; }
            .lw-note-error { border-color: rgba(255,107,129,.32); background: rgba(255,107,129,.07); }
            /* ── 외부유입 레이더 ───────────────────────────── */
            .lw-radar-progress {
                display: flex; gap: 8px; margin: 14px 0; flex-wrap: wrap;
            }
            .lw-radar-progress span {
                padding: 7px 13px; border-radius: 999px; font-size: 12.5px; font-weight: 800;
                border: 1px solid rgba(255,255,255,.1); color: #646b7d; background: rgba(255,255,255,.03);
            }
            .lw-radar-progress span.on {
                border-color: rgba(53,208,186,.5); color: #35d0ba; background: rgba(53,208,186,.1);
                animation: lwRadarPulse 1.2s ease-in-out infinite;
            }
            .lw-radar-progress span.ok { border-color: rgba(53,208,186,.28); color: #9be8dd; }
            @keyframes lwRadarPulse { 50% { opacity: .55; } }
            @media (prefers-reduced-motion: reduce) { .lw-radar-progress span.on { animation: none; } }

            .lw-radar-brief { border-color: rgba(53,208,186,.22); }
            .lw-radar-kws { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 2px; }
            .lw-radar-kw {
                display: inline-flex; align-items: baseline; gap: 7px;
                padding: 6px 11px; border-radius: 9px; font-size: 13px; font-weight: 800; color: #ebedf2;
                border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04);
            }
            .lw-radar-kw b { color: #35d0ba; font-size: 12px; font-variant-numeric: tabular-nums; }
            .lw-radar-money { margin: 10px 0 0; color: #f5c518; font-size: 13px; font-weight: 700; }
            .lw-radar-needkey {
                margin: 10px 0 0; padding: 10px 13px; border-radius: 9px;
                background: rgba(53,208,186,.07); border: 1px solid rgba(53,208,186,.2);
                color: rgba(235,242,250,.8); font-size: 12.5px; line-height: 1.6;
            }
            .lw-radar-needkey b { color: #35d0ba; }
            .lw-radar-needkey a { color: #35d0ba; font-weight: 800; }

            .lw-radar-partial { margin: 10px 0 0; color: #c9a34a; font-size: 12.5px; }

            .lw-radar-group .lw-panel-head h2 em {
                margin-left: 4px; font-style: normal; font-size: 14px; color: #646b7d;
                font-variant-numeric: tabular-nums;
            }
            .lw-radar-now { border-color: rgba(255,138,61,.3); }
            .lw-radar-empty { margin: 0; color: #646b7d; font-size: 13.5px; }
            .lw-radar-cards { display: grid; gap: 12px; }
            .lw-radar-card {
                padding: 14px 16px; border-radius: 12px;
                border: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.028);
            }
            .lw-radar-card.is-done { opacity: .55; }
            .lw-radar-card.is-dismissed { opacity: .4; }
            .lw-radar-card-head { display: flex; align-items: center; gap: 9px; margin-bottom: 7px; }
            .lw-radar-src {
                padding: 3px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 800;
                border: 1px solid rgba(255,255,255,.14); color: #aeb6c4;
            }
            .lw-radar-src.src-kin { color: #ffd15c; border-color: rgba(255,209,92,.35); }
            .lw-radar-src.src-cafearticle { color: #7dd87d; border-color: rgba(125,216,125,.35); }
            .lw-radar-src.src-blog { color: #69b7ff; border-color: rgba(105,183,255,.35); }
            .lw-radar-src.src-community { color: #c9a8ff; border-color: rgba(201,168,255,.4); }
            /* 링크 정책 — 막힌 판은 눈에 띄어야 헛수고를 막는다. */
            .lw-radar-policy {
                padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800;
                border: 1px solid transparent;
            }
            .lw-radar-policy.pol-ok { background: rgba(46,204,113,.14); color: #6fdc8c; }
            .lw-radar-policy.pol-careful { background: rgba(255,165,0,.14); color: #ffc966; }
            .lw-radar-policy.pol-banned { background: rgba(255,107,129,.14); color: #ff8fa0; }
            .lw-radar-policy.pol-unknown { background: rgba(255,255,255,.06); color: #9aa1b2; }
            .lw-radar-gate {
                padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800;
                background: rgba(53,208,186,.16); color: #6fe0d0;
            }
            .lw-radar-audience { margin: 10px 0 0; color: #c0c8d4; font-size: 13px; line-height: 1.6; }
            /* 글 해부 — 답변 각도를 짤 때 꺼내 보는 재료. */
            .lw-radar-anatomy { margin: 12px 0 0; }
            .lw-radar-anatomy summary { cursor: pointer; color: #9be8dd; font-size: 12.5px; font-weight: 800; padding: 4px 0; }
            .lw-radar-anatomy ul { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 9px; }
            .lw-radar-anatomy li { border-left: 2px solid rgba(53,208,186,.35); padding-left: 10px; }
            .lw-radar-anatomy li b { display: block; color: #fff; font-size: 13px; font-weight: 800; margin-bottom: 3px; }
            .lw-radar-anatomy li span { color: rgba(235,242,250,.72); font-size: 12.5px; line-height: 1.6; }
            .lw-radar-gap {
                margin-top: 11px; padding: 10px 12px; border-radius: 9px;
                background: rgba(255,165,0,.07); border: 1px solid rgba(255,165,0,.22);
            }
            .lw-radar-gap b { display: block; color: #ffc966; font-size: 12.5px; margin-bottom: 4px; }
            .lw-radar-gap p { margin: 0; color: rgba(235,242,250,.75); font-size: 12.5px; line-height: 1.6; }
            .lw-radar-gap em { display: block; margin-top: 5px; font-style: normal; color: #646b7d; font-size: 11.5px; }
            .lw-radar-score { color: #35d0ba; font-size: 14px; font-variant-numeric: tabular-nums; }
            .lw-radar-state { font-style: normal; font-size: 11.5px; color: #2ecc71; font-weight: 800; }
            .lw-radar-card h3 { margin: 0 0 6px; font-size: 15.5px; line-height: 1.4; }
            .lw-radar-card h3 a { color: #fff; text-decoration: none; }
            .lw-radar-card h3 a:hover { color: #35d0ba; }
            .lw-radar-excerpt { margin: 0 0 7px; color: #9aa1b0; font-size: 13px; line-height: 1.55; }
            .lw-radar-reason { margin: 0 0 4px; color: #c0c8d4; font-size: 12.5px; }
            .lw-radar-angle { margin: 0 0 4px; color: #9be8dd; font-size: 12.5px; }
            .lw-radar-meta { display: flex; flex-wrap: wrap; gap: 12px; margin: 7px 0 10px; color: #646b7d; font-size: 12px; }
            .lw-radar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
            .lw-radar-actions a, .lw-radar-actions button {
                padding: 7px 13px; border-radius: 8px; font-size: 12.5px; font-weight: 800; cursor: pointer;
                border: 1px solid rgba(255,255,255,.14); background: transparent; color: #c0c8d4;
                text-decoration: none;
            }
            .lw-radar-actions a:hover, .lw-radar-actions button:hover { border-color: rgba(53,208,186,.5); color: #35d0ba; }
            .lw-radar-actions button.pri { border-color: rgba(53,208,186,.5); background: rgba(53,208,186,.12); color: #35d0ba; }
            .lw-radar-rest { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; }
            .lw-radar-rest li { display: flex; align-items: center; gap: 9px; font-size: 13px; }
            .lw-radar-rest a { color: #aeb6c4; text-decoration: none; }
            .lw-radar-rest a:hover { color: #35d0ba; }
            /* 훑지 않은 판 — 기다리면 열리는 곳과 영영 막힌 곳을 갈라 적는다. */
            .lw-audit-progress {
                margin-left: 10px; font-size: 12.5px; font-weight: 700; color: #35d0ba;
                font-variant-numeric: tabular-nums;
            }

            /* 엔진별 칸 — 상태 하나만 담는다. 칩을 뭉치지 않는다. */
            .lw-engine-cell { white-space: nowrap; }
            .lw-engine-cell .lw-engine {
                display: inline-block; padding: 3px 9px; border-radius: 7px;
                font-size: 11.5px; font-weight: 800; text-decoration: none;
            }
            .lw-engine-cell .lw-engine-found { background: rgba(46,204,113,.14); color: #6fdc8c; }
            .lw-engine-cell .lw-engine-blocked { background: rgba(255,201,102,.13); color: #ffc966; }
            .lw-engine-cell .lw-engine-none { background: rgba(255,143,160,.12); color: #ff8fa0; }
            .lw-engine-cell .lw-engine:hover { filter: brightness(1.2); }

            .lw-radar-gated ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 9px; }
            .lw-radar-gated li { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; font-size: 12.5px; }
            .lw-radar-gated li a { color: #fff; font-weight: 800; text-decoration: none; }
            .lw-radar-gated li a:hover { color: #35d0ba; }
            .lw-radar-gated li i {
                font-style: normal; font-size: 11px; font-weight: 800;
                padding: 2px 8px; border-radius: 6px;
            }
            .lw-radar-gated li.delayed i { background: rgba(255,165,0,.14); color: #ffc966; }
            .lw-radar-gated li.closed i { background: rgba(255,255,255,.06); color: #9aa1b2; }
            .lw-radar-gated li span { flex: 1; min-width: 220px; color: rgba(235,242,250,.6); line-height: 1.55; }

            .lw-radar-dismissed { color: #646b7d; font-size: 12.5px; }
            .lw-radar-dismissed button {
                border: 0; background: none; color: #35d0ba; font-weight: 800; cursor: pointer; font-size: 12.5px;
            }

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

            /*
             * 선점 보드는 격자가 아니라 **세로 목록**이다 — 사장님 지시(2026-08-11):
             * "그리드 형식일 필요 없이 세로로 정렬시켜서 보여주면 된다."
             * 순위대로 읽는 목록이라 좌우로 흩어 놓으면 순서가 눈에 안 들어온다.
             *
             * 한 줄 = [근거] [지표 4] [액션 6]. 좁은 화면에서는 아래로 접는다.
             */
            .lw-board-list { display: flex; flex-direction: column; gap: 12px; }
            .lw-board-list .lw-card-pre {
                display: grid;
                /*
                 * [2026-08-18 재편] 상단 = [근거 1fr | 지표 230px] 두 칸.
                 * 제목 대장간·키워드 풀·수익 판정·액션은 하단 풀폭이다 — 예전엔
                 * 188px 세 번째 열에 제목이 낑겨 갑갑했고, 액션 7개가 세로
                 * 풀폭 바로 쌓여 카드 하나가 화면 절반을 먹었다(실측 스크린샷).
                 */
                /* [2026-08-19] 3열 — 가운데가 30일 실측 스파크라인 자리다(빨간 네모). */
                grid-template-columns: minmax(0, 1fr) minmax(200px, 260px) 230px;
                align-items: start;
                gap: 14px 20px;
                padding: 18px 20px;
                border-radius: 16px;
                transition: border-color .15s ease, background .15s ease;
            }
            .lw-board-list .lw-card-pre:hover {
                border-color: rgba(255,165,0,.28);
                background: rgba(255,255,255,.045);
            }
            /* 하단 풀폭 블록들 — 대장간·풀 칩·수익 판정·트렌드·마인드맵·액션 */
            .lw-board-list .lw-forge,
            .lw-board-list .lw-forge-ai,
            .lw-board-list .lw-mindmap,
            .lw-board-list .lw-mindmap-branches,
            .lw-board-list .lw-mindmap-money,
            .lw-board-list .lw-trend,
            .lw-board-list .lw-card-actions { grid-column: 1 / -1; }
            /* 배지·제목·근거는 한 칸에 세로로 쌓인다(BoardCardHead 가 한 덩어리로 낸다). */
            .lw-card-head { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
            /*
             * 배지는 조용해야 한다(taste: 초점은 한 곳 — 이 카드의 주인공은
             * 키워드다). 4색 배지가 제목과 경쟁하던 것을 크기·무게로 눌러
             * 메타데이터 층위로 내린다. 변형별 색 의미는 그대로 산다.
             */
            .lw-card-tags span { font-size: 10.5px; padding: 3px 8px; font-weight: 800; }
            .lw-board-list .lw-card-metrics {
                grid-template-columns: repeat(2, minmax(0, 1fr));
                margin-top: 0; row-gap: 12px; column-gap: 10px;
            }
            /* 세로 목록에서는 숫자가 카드 높이를 끌지 않게 조금 줄인다. */
            .lw-board-list .lw-card-metrics strong { font-size: 16px; }
            .lw-board-list .lw-evidence li { font-size: 12.5px; }
            /*
             * 액션은 컴팩트 그리드다. 세로 풀폭 스택(예전)은 버튼 7개가 카드
             * 절반을 먹었다. 첫 버튼(어떻게 쓸까)만 골드 프라이머리 — 눌러야
             * 할 것이 하나로 보여야 손이 간다.
             */
            .lw-board-list .lw-card-actions {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 7px;
                margin-top: 2px;
            }
            .lw-board-list .lw-card-actions button,
            .lw-board-list .lw-card-actions a { flex: none; width: 100%; padding: 8px 8px; }
            @media (max-width: 860px) {
                .lw-board-list .lw-card-pre { grid-template-columns: minmax(0, 1fr); gap: 12px; }
                .lw-card-spark { max-width: 320px; }
                .lw-board-list .lw-card-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }

            /*
             * 키워드는 이 카드의 주인공이다 — 사장님: "글자 크기 좀 키워서 보여 달라."
             * 앞의 순위는 목록에서의 자리이지 우리가 매긴 점수가 아니다.
             */
            .lw-board-list .lw-card-keyword {
                display: flex; align-items: center; gap: 9px;
                font-size: 21px; line-height: 1.3; -webkit-line-clamp: 3;
            }
            .lw-rank {
                flex: none; min-width: 30px; padding: 3px 8px;
                border-radius: 8px; border: 1px solid rgba(255,255,255,.14);
                background: rgba(255,255,255,.05);
                color: #9aa3b5; font-size: 13px; font-weight: 900; text-align: center;
            }
            /*
             * 광고가 많이 붙은 자리는 광고주들이 돈을 넣는다는 뜻이다(사장님 기준).
             * 초황금 금색과 겹치지 않게 청록 계열로 둔다 — 예전 '약함' 노랑이 금색과
             * 겹쳐 구분이 안 된다는 지적을 받았다.
             */
            .lw-card-metrics .money strong { color: #4ea8ff; }

            /*
             * 주제 서브탭. 칩(둥근 버튼)에서 밑줄 탭으로 바꿨다 — 사장님 지시.
             * 주제가 29종까지 나오므로 한 줄로 두고 가로 스크롤한다.
             */
            .lw-topic-tabs {
                display: flex; gap: 2px; margin: 14px 0 12px;
                overflow-x: auto; scrollbar-width: thin;
                border-bottom: 1px solid rgba(255,255,255,.09);
            }
            .lw-topic-tabs button {
                flex: none; padding: 9px 13px;
                border: 0; border-bottom: 2px solid transparent; background: none;
                color: #7c8598; font-size: 12.5px; font-weight: 700; white-space: nowrap;
                cursor: pointer;
            }
            .lw-topic-tabs button em { font-style: normal; opacity: .6; margin-left: 4px; }
            .lw-topic-tabs button:hover { color: #b9c2d4; }
            .lw-topic-tabs button.on { color: #fff; border-bottom-color: #FFA500; }

            /*
             * 등급 색. 사장님 지적 — 예전 '약함' 노랑이 '초황금' 금색과 겹쳐 구분이
             * 안 됐다. 네 단계를 서로 먼 색으로 벌린다: 금색 · 청록 · 회청 · 회색.
             */
            .lw-index {
                flex: none; padding: 3px 8px; border-radius: 8px;
                font-size: 12px; font-weight: 900; white-space: nowrap;
            }
            .lw-index-ultra { background: rgba(255,196,0,.16); color: #ffc400; }
            .lw-index-golden { background: rgba(0,224,198,.14); color: #00e0c6; }
            .lw-index-fair { background: rgba(122,150,190,.14); color: #8ea6c8; }
            .lw-index-weak { background: rgba(255,255,255,.05); color: #6f7787; }

            /*
             * 2군(외부 유입용). 1군과 시각적으로 확실히 갈라 놔야 한다 —
             * 섞여 보이면 "이것도 황금, 저것도 황금"이 되어 보드의 값어치가 사라진다.
             * 그래서 접어 두고, 펼쳐도 테두리와 색으로 다른 칸임을 알린다.
             */
            .lw-external { margin-top: 26px; }
            .lw-external-head {
                display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
                width: 100%; padding: 14px 16px;
                border: 1px dashed rgba(255,255,255,.16); border-radius: 13px;
                background: rgba(255,255,255,.022);
                text-align: left; cursor: pointer;
            }
            .lw-external-title { color: #fff; font-size: 15px; font-weight: 900; }
            .lw-external-desc { color: #7c8598; font-size: 12.5px; font-weight: 700; }
            .lw-external-toggle { margin-left: auto; color: #a78bfa; font-size: 12.5px; font-weight: 900; }
            .lw-external-list { margin-top: 10px; }
            .lw-external-list .lw-card-pre { border-style: dashed; background: rgba(255,255,255,.018); }
            .lw-ext-tag {
                padding: 4px 9px; border-radius: 999px;
                border: 1px solid rgba(167,139,250,.35); background: rgba(167,139,250,.12);
                color: #c4b5fd; font-size: 11.5px; font-weight: 800;
            }
            .lw-card-actions small {
                display: block; margin-top: 2px;
                font-size: 10px; font-weight: 700; opacity: .62;
            }

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
            /*
             * 액션 위계(2026-08-18, 브랜드 골드 #FFA500 — tokens.ts 단일출처):
             *   프라이머리(첫 버튼) = 골드, 나머지 = 중립 고스트.
             * 예전엔 버튼 전부가 보라 계열 같은 무게라 무엇을 눌러야 할지
             * 화면이 말해 주지 않았다.
             */
            .lw-card-actions button, .lw-card-actions a {
                flex: 1;
                padding: 9px 10px;
                border: 1px solid rgba(255,255,255,.11); border-radius: 10px;
                background: rgba(255,255,255,.04);
                color: rgba(235,242,250,.78); font-size: 12.5px; font-weight: 800; text-align: center; text-decoration: none;
                cursor: pointer;
                transition: background .12s ease, border-color .12s ease, color .12s ease;
            }
            .lw-card-actions button:hover, .lw-card-actions a:hover {
                background: rgba(255,255,255,.09);
                border-color: rgba(255,165,0,.35);
                color: #fff;
            }
            .lw-card-actions button:first-child {
                border-color: rgba(255,165,0,.5);
                background: linear-gradient(180deg, rgba(255,165,0,.2), rgba(255,165,0,.12));
                color: #ffc46e;
            }
            .lw-card-actions button:first-child:hover {
                background: linear-gradient(180deg, rgba(255,165,0,.3), rgba(255,165,0,.18));
                color: #ffd79a;
            }
            .lw-card-actions button:disabled { opacity: .55; cursor: wait; }

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
            .lw-table .lw-intent-row th { color: #ffd700; font-size: 12px; font-weight: 800; background: rgba(255,215,0,.05); border-top: 1px solid rgba(255,215,0,.18); }
            .lw-table .lw-intent-row small { color: rgba(235,242,250,.45); font-weight: 600; margin-left: 6px; }
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
                display: grid; grid-template-columns: 26px 72px minmax(0, 1fr) 178px; gap: 12px; align-items: start;
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
            /* 링크 없는 상품명(토스) — 링크인 척하지 않는 복사 버튼. */
            button.lw-product-name {
                border: 0; background: none; padding: 0; text-align: left;
                cursor: pointer; font-family: inherit; width: 100%;
            }
            .lw-product-name-copy em {
                margin-left: 8px; font-style: normal; font-size: 11px; font-weight: 800;
                color: rgba(235,242,250,.45); white-space: nowrap;
            }
            .lw-product-name-copy:hover em { color: #cfc4ff; }
            /*
             * 지표줄 한 규격(사장님 지적 2026-08-21 "박스들이 너무 엉성하잖아").
             * 예전엔 판정 상자·니즈 알약·민짜 글씨가 제각각 키와 모양이라
             * 줄이 울퉁불퉁했다. 규칙: 칩(판정·니즈)은 같은 높이·같은 8px
             * 모서리·테두리 없는 옅은 바탕, 나머지 수치는 같은 12px 민짜.
             */
            .lw-product-metrics {
                display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap;
                margin-bottom: 9px; font-variant-numeric: tabular-nums;
            }
            .lw-product-metrics span { color: rgba(235,242,250,.55); font-size: 12px; line-height: 1.5; }
            .lw-product-metrics .lw-product-price strong { color: #ffd700; font-size: 14px; margin-left: 0; }
            .lw-product-metrics .lw-metric-verdict,
            .lw-product-metrics .lw-product-need {
                padding: 3px 10px; border-radius: 8px; border: 0;
            }
            .lw-product-metrics .lw-product-need { background: rgba(46,204,113,.1); color: rgba(235,242,250,.78); }
            .lw-product-metrics .lw-product-need strong { color: #2ecc71; }
            .lw-product-metrics .lw-product-persale strong { color: #ffa500; font-size: 13px; }
            .lw-product-metrics strong { color: #fff; font-size: 12px; font-weight: 800; margin-left: 3px; }
            /* 카드 우측 버튼 열 — 사장님 지시: 우측 세로 정렬, 테두리, 기능별 색. */
            .lw-product-actions { display: flex; flex-direction: column; gap: 7px; justify-content: center; }
            .lw-product-actions .lw-act {
                display: block; width: 100%; text-align: center; padding: 8px 10px;
                border-radius: 10px; font-size: 12px; font-weight: 800; line-height: 1.3;
                text-decoration: none; cursor: pointer; border: 1px solid; background: transparent;
                transition: filter .15s ease;
            }
            .lw-product-actions .lw-act:hover { filter: brightness(1.25); }
            .lw-act-gold { color: #ffd700; border-color: rgba(255,215,0,.55); background: rgba(255,215,0,.10); }
            .lw-act-blue { color: #7db4ff; border-color: rgba(90,169,255,.55); background: rgba(90,169,255,.10); }
            .lw-act-orange { color: #ff9a4d; border-color: rgba(255,122,26,.55); background: rgba(255,122,26,.10); }
            .lw-act-green { color: #57d364; border-color: rgba(45,180,0,.6); background: rgba(45,180,0,.12); }
            .lw-act-sub { display: block; font-size: 10px; font-weight: 600; opacity: .75; margin-top: 2px; }
            @media (max-width: 620px) {
                .lw-product { grid-template-columns: 22px minmax(0, 1fr); }
                .lw-product img { display: none; }
                /* 좁은 화면에선 버튼을 2×2 로 접는다. */
                .lw-product-actions { grid-column: 1 / -1; flex-direction: row; flex-wrap: wrap; }
                .lw-product-actions .lw-act { flex: 1 1 45%; width: auto; }
            }
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
            /* 시기 그룹 배지 — "언제 쓸 것"(실측 산술). 지금 적기가 가장 뜨겁다. */
            .lw-timing-tag {
                padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 800;
                border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05);
                color: rgba(235,242,250,.78);
            }
            .lw-timing-tag.timing-now { border-color: rgba(52,211,153,.55); color: #6ee7b7; background: rgba(52,211,153,.14); }
            .lw-timing-tag.timing-prep { border-color: rgba(96,165,250,.5); color: #93c5fd; background: rgba(96,165,250,.12); }
            .lw-timing-tag.timing-rising { border-color: rgba(248,113,113,.5); color: #fca5a5; background: rgba(248,113,113,.12); }
            .lw-timing-tag.timing-evergreen { border-color: rgba(148,163,184,.45); color: #cbd5e1; background: rgba(148,163,184,.1); }
            /* 애드센스 적합 배지 — 의도·CPC 실측 판정. 미판정(null)은 배지 없음. */
            .lw-adsense-tag {
                padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 800;
                border: 1px solid rgba(26,115,232,.55); color: #8ab4f8; background: rgba(26,115,232,.14);
            }
            /* 대장간 산출물 — 제목 2종 + 문제해결 서브 */
            /* 장식은 하나만(taste: over-decoration 금지) — 좌측 골드 바 + 옅은 바탕. */
            .lw-forge {
                margin: 2px 0; padding: 12px 15px; border-radius: 12px;
                background: rgba(255,165,0,.055);
                border-left: 3px solid rgba(255,165,0,.55);
                display: flex; flex-direction: column; gap: 6px;
            }
            .lw-forge-title { font-size: 13px; color: rgba(235,242,250,.9); line-height: 1.5; word-break: keep-all; }
            .lw-forge-title span, .lw-forge-subs span {
                display: inline-block; margin-right: 8px; padding: 1px 7px; border-radius: 6px;
                background: rgba(255,255,255,.07); color: rgba(235,242,250,.55);
                font-size: 10.5px; font-weight: 800; vertical-align: 1px;
            }
            .lw-forge-subs { font-size: 12.5px; color: rgba(235,242,250,.75); line-height: 1.7; }
            .lw-forge-subs em { font-style: normal; margin-right: 10px; color: #ffc46e; }
            /* 마인드맵 — 중심 키워드에서 실측 확장어가 갈라진다.
               AI 가 찾아 실측으로 확인된 가지는 색으로 구분한다. */
            .lw-mindmap {
                margin-top: 10px;
                padding: 14px 16px;
                border: 1px solid rgba(255,255,255,.10);
                border-radius: 12px;
                background: rgba(255,255,255,.03);
            }
            .lw-mindmap-core {
                display: inline-block;
                padding: 7px 14px;
                margin-bottom: 12px;
                border-radius: 999px;
                background: rgba(255,215,0,.14);
                border: 1px solid rgba(255,215,0,.35);
                color: #ffd700;
                font-weight: 900;
                font-size: 14px;
            }
            .lw-mindmap-why { margin: 0 0 12px; padding-left: 18px; }
            .lw-mindmap-why li {
                margin-bottom: 6px;
                color: rgba(235,242,250,.86);
                font-size: 13px;
                line-height: 1.65;
                word-break: keep-all;
            }
            .lw-mindmap-why em {
                margin-left: 6px;
                padding: 1px 6px;
                border-radius: 4px;
                background: rgba(90,169,255,.14);
                color: #8ec5ff;
                font-size: 11px;
                font-style: normal;
                font-weight: 700;
            }
            .lw-mindmap-branches { display: flex; flex-wrap: wrap; gap: 7px; }
            /* 칩이 <a>(검색행)에서 <button>(분석기행)으로 바뀌었다 — 겉모습은 동일하게. */
            .lw-mindmap-branches a, .lw-mindmap-branches button {
                display: inline-flex;
                align-items: baseline;
                gap: 6px;
                padding: 6px 12px;
                border-radius: 999px;
                border: 1px solid rgba(255,255,255,.12);
                background: rgba(255,255,255,.04);
                color: rgba(235,242,250,.88);
                font-size: 12.5px;
                font-weight: 700;
                text-decoration: none;
                font-family: inherit;
                cursor: pointer;
            }
            .lw-mindmap-branches a span, .lw-mindmap-branches button span { font-weight: 400; opacity: .62; font-size: 11px; }
            .lw-mindmap-branches a:hover, .lw-mindmap-branches button:hover { background: rgba(255,255,255,.09); color: #fff; }
            .lw-mindmap-branches a.lw-mindmap-ai, .lw-mindmap-branches button.lw-mindmap-ai {
                border-color: rgba(90,169,255,.42);
                background: rgba(90,169,255,.10);
                color: #bcdcff;
            }

            /* 30일 트렌드 미니 차트 — 앱 그래프와 같은 실측을 막대로. */
            .lw-trend {
                margin-top: 10px;
                padding: 12px 14px;
                border: 1px solid rgba(255,255,255,.10);
                border-radius: 12px;
                background: rgba(255,255,255,.03);
            }
            .lw-trend-head {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 10px;
                color: rgba(235,242,250,.88);
                font-size: 12.5px;
                font-weight: 800;
            }
            .lw-trend-head strong { color: #ffd700; }
            .lw-trend-bars {
                display: flex;
                align-items: flex-end;
                gap: 2px;
                height: 96px;
                padding: 6px 4px;
                border-radius: 8px;
                background: rgba(0,0,0,.28);
            }
            .lw-trend-bars span {
                flex: 1;
                min-width: 2px;
                border-radius: 2px 2px 0 0;
                background: linear-gradient(180deg, #ffd700, rgba(255,165,0,.55));
            }
            .lw-trend-note {
                margin: 9px 0 0;
                color: rgba(252,211,77,.9);
                font-size: 12px;
                line-height: 1.6;
            }

            /* 자동 연쇄 분석 — 본 분석 아래 조용히 쌓인다(taste: 층위 분리). */
            .lw-mindmap-chain { margin-top: 12px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,.12); }
            .lw-mindmap-chain-head { margin-bottom: 8px; color: rgba(235,242,250,.85); font-size: 12.5px; font-weight: 800; }
            .lw-mindmap-chain-item { margin-bottom: 10px; font-size: 12.5px; }
            .lw-mindmap-chain-item strong { color: #ffd79a; font-size: 13px; }
            .lw-chain-wait { margin-left: 8px; color: #7c8598; font-size: 12px; }
            .lw-chain-verdict { margin-left: 8px; font-style: normal; font-size: 11px; font-weight: 800; padding: 2px 7px; border-radius: 999px; }
            .lw-chain-good { background: rgba(74,222,128,.14); color: #4ade80; }
            .lw-chain-bad { background: rgba(248,113,113,.16); color: #f87171; }
            .lw-chain-mixed { background: rgba(250,204,21,.14); color: #facc15; }
            .lw-mindmap-chain-item ul { margin: 6px 0 0 16px; padding: 0; color: rgba(235,242,250,.78); }
            .lw-mindmap-chain-item li { margin-bottom: 4px; line-height: 1.6; word-break: keep-all; }

            /* 수익 관점 결론 — 판정색으로 한눈에. */
            .lw-mindmap-money {
                margin-top: 12px;
                padding: 12px 14px;
                border-radius: 10px;
                border: 1px solid rgba(255,255,255,.10);
                background: rgba(255,255,255,.03);
            }
            .lw-mindmap-money-good { border-color: rgba(74,222,128,.35); }
            .lw-mindmap-money-bad { border-color: rgba(248,113,113,.4); }
            .lw-mindmap-money-mixed { border-color: rgba(250,204,21,.35); }
            /* 판정 자체를 못 한 행 — 초록도 빨강도 아니다. 중립으로 둔다. */
            .lw-mindmap-money-unknown { border-color: rgba(255,255,255,.14); }
            .lw-mindmap-money-head {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 8px;
                color: rgba(235,242,250,.9);
                font-size: 12.5px;
                font-weight: 800;
            }
            .lw-mindmap-money-good .lw-mindmap-money-head strong { color: #4ade80; }
            .lw-mindmap-money-bad .lw-mindmap-money-head strong { color: #f87171; }
            .lw-mindmap-money-mixed .lw-mindmap-money-head strong { color: #facc15; }
            .lw-mindmap-money-unknown .lw-mindmap-money-head strong { color: rgba(235,242,250,.6); }
            .lw-mindmap-money ul { margin: 0 0 8px; padding-left: 18px; }
            .lw-mindmap-money li {
                margin-bottom: 5px;
                color: rgba(235,242,250,.84);
                font-size: 12.5px;
                line-height: 1.6;
                word-break: keep-all;
            }
            .lw-mindmap-money p {
                margin: 0;
                padding: 8px 11px;
                border-radius: 8px;
                background: rgba(74,222,128,.08);
                border: 1px solid rgba(74,222,128,.25);
                color: #bbf7d0;
                font-size: 12.5px;
                line-height: 1.6;
            }

            .lw-forge-ai { border-left-color: rgba(90,169,255,.45); }
            .lw-forge-ai a { color: #8ec5ff; text-decoration: none; }
            .lw-forge-ai a:hover { text-decoration: underline; }
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
            .lw-plan-rivals a { color: rgba(235,242,250,.8); text-decoration: none; }
            .lw-plan-rivals a:hover { color: #fff; text-decoration: underline; }
            .lw-plan-rivals small { margin-left: 6px; font-size: 11.5px; color: #69b7ff; }
            .lw-plan-caution strong { color: #f5c518; }

            /* ── 집필 브리핑 재구성(2026-08-19) — 카드와 안 겹치는 것만 남긴 창 ── */
            .lw-plan-why { padding: 11px 13px; border-radius: 10px; background: rgba(124,92,255,.1); border: 1px solid rgba(124,92,255,.25); }
            .lw-plan-why p { margin: 0; color: #ebf2fa; font-size: 13.5px; line-height: 1.6; word-break: keep-all; }
            .lw-plan-why small { display: block; margin-top: 5px; font-size: 11px; color: rgba(235,242,250,.5); }
            .lw-plan-title-row { display: flex; align-items: center; gap: 9px; padding: 7px 0; min-width: 0; }
            .lw-plan-title-row span { flex: none; font-size: 11px; font-weight: 800; color: rgba(255,215,0,.85); border: 1px solid rgba(255,215,0,.35); border-radius: 6px; padding: 2px 7px; }
            .lw-plan-title-row em { font-style: normal; color: #fff; font-size: 14px; font-weight: 700; min-width: 0; }
            .lw-plan-title-row button { flex: none; margin-left: auto; padding: 4px 10px; border: 1px solid rgba(255,255,255,.16); border-radius: 7px; background: none; color: rgba(235,242,250,.75); font-size: 11.5px; cursor: pointer; }
            .lw-plan-title-row button:hover { border-color: rgba(255,215,0,.5); color: #fff; }
            .lw-plan-subs { display: flex; flex-wrap: wrap; gap: 6px; }
            .lw-plan-subs em { font-style: normal; font-size: 12.5px; color: rgba(235,242,250,.85); border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: 3px 10px; }
            .lw-plan-subs .lw-plan-pool { color: rgba(235,242,250,.6); border-style: dashed; }

            /* 분석 탭 — 보드 회차 실측 결합 패널 */
            .lw-analyze-why { margin-top: 12px; padding: 11px 13px; border-radius: 10px; background: rgba(124,92,255,.1); border: 1px solid rgba(124,92,255,.25); }
            .lw-analyze-why strong { display: block; margin-bottom: 5px; font-size: 12px; font-weight: 900; color: #b9a6ff; }
            .lw-analyze-why p { margin: 0; color: #ebf2fa; font-size: 13.5px; line-height: 1.6; word-break: keep-all; }
            .lw-analyze-why small { display: block; margin-top: 5px; font-size: 11px; color: rgba(235,242,250,.5); }
            /*
             * 분석 머리 — 지표 두 줄(왼쪽) + 추이 그래프(오른쪽).
             * 그래프를 아래에 두면 숫자를 다 지나친 뒤에야 보인다(사장님 지적).
             * 좁은 화면에서는 자연스럽게 위아래로 쌓인다.
             */
            .lw-analyze-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(260px, 1fr); gap: 14px; align-items: start; }
            .lw-metrics-2row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
            .lw-analyze-grid .lw-analyze-spark { margin: 0; padding: 12px 14px; border: 1px solid rgba(255,255,255,.09); border-radius: 12px; background: rgba(255,255,255,.02); }
            @media (max-width: 980px) {
              .lw-analyze-grid { grid-template-columns: 1fr; }
              .lw-metrics-2row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }
            .lw-analyze-spark-btn { display: block; width: 100%; text-align: left; border: 1px solid rgba(255,255,255,.09); cursor: pointer; position: relative; }
            .lw-analyze-spark-btn:hover { border-color: rgba(167,139,250,.5); }
            .lw-spark-more { position: absolute; top: 8px; right: 10px; font-size: 11px; color: #8a94a6; }
            .lw-snip-open { margin-left: 8px; padding: 2px 9px; border: 1px solid rgba(167,139,250,.4); border-radius: 999px; background: none; color: #c4b5fd; font-size: 11px; cursor: pointer; }
            .lw-snip-open:hover { border-color: rgba(167,139,250,.8); }
            .lw-snip-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
            .lw-snip-tabs button { padding: 5px 14px; border: 1px solid rgba(255,255,255,.12); border-radius: 999px; background: none; color: #8a94a6; font-size: 12.5px; cursor: pointer; }
            .lw-snip-tabs button.on { border-color: rgba(167,139,250,.55); background: rgba(167,139,250,.14); color: #ede9fe; }
            .lw-snip-modal { max-width: 780px; }
            .lw-snip-code { margin: 0 0 12px; padding: 14px; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: rgba(0,0,0,.35); color: #ebf2fa; font-size: 12.5px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; max-height: 52vh; overflow: auto; }
            .lw-snip-copy { padding: 8px 16px; border: 1px solid rgba(167,139,250,.5); border-radius: 8px; background: rgba(167,139,250,.14); color: #ede9fe; font-size: 13px; cursor: pointer; }
            .lw-seo-check { margin-bottom: 16px; padding: 14px; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; background: rgba(255,255,255,.02); }
            .lw-seo-check-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
            .lw-seo-check-head strong { font-size: 22px; }
            .lw-seo-check-head span { font-size: 12px; color: #8a94a6; }
            .lw-seo-good { color: #34d399; } .lw-seo-mid { color: #fbbf24; } .lw-seo-bad { color: #f87171; }
            .lw-seo-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
            .lw-seo-items li { display: flex; gap: 10px; align-items: flex-start; }
            .lw-seo-items i { flex: 0 0 auto; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-style: normal; }
            .lw-seo-items li.pass i { background: rgba(52,211,153,.14); color: #34d399; }
            .lw-seo-items li.fail i { background: rgba(248,113,113,.14); color: #f87171; }
            .lw-seo-items b { display: block; font-size: 13px; color: #ebf2fa; }
            .lw-seo-items span { display: block; font-size: 12px; color: #8a94a6; line-height: 1.6; }
            .lw-tabrank-cands { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.08); }
            .lw-tabrank-cands-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; font-size: 13px; }
            .lw-tabrank-cands-head span { color: #34d399; }
            .lw-cand-hit { background: rgba(52,211,153,.06); }
            .lw-cand-rank { color: #34d399; }
            .lw-branch-new { margin-left: 7px; padding: 1px 7px; border: 1px solid rgba(167,139,250,.4); border-radius: 999px; color: #c4b5fd; font-size: 11px; }
            /* 확장 키워드 자리 판정 — 색은 사실 셋(있음·좁음·없음)만 가른다. */
            .lw-slot-open { color: #34d399; font-weight: 600; }
            .lw-slot-tight { color: #fbbf24; }
            .lw-slot-none { color: #8a94a6; }
            .lw-slot-unknown { color: #64748b; }
            .lw-dig { padding: 4px 10px; border: 1px solid rgba(255,255,255,.16); border-radius: 7px; background: none; color: #c9d6e6; font-size: 12px; cursor: pointer; white-space: nowrap; }
            .lw-dig:hover { border-color: rgba(167,139,250,.55); color: #ede9fe; }
            /* 파고든 경로 — 어디서 여기까지 왔는지 되짚어 간다. */
            .lw-analyze-trail { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 10px; font-size: 12px; color: #8a94a6; }
            .lw-analyze-trail button { padding: 3px 9px; border: 1px solid rgba(255,255,255,.12); border-radius: 999px; background: none; color: #c9d6e6; font-size: 12px; cursor: pointer; }
            .lw-analyze-pool { display: flex; flex-wrap: wrap; gap: 7px; }
            .lw-analyze-pool button { display: inline-flex; align-items: center; gap: 7px; padding: 6px 11px; border: 1px solid rgba(255,255,255,.13); border-radius: 999px; background: none; color: #ebf2fa; font-size: 13px; cursor: pointer; }
            .lw-analyze-pool button:hover { border-color: rgba(0,224,198,.5); color: #fff; }
            .lw-analyze-pool button span { font-size: 11.5px; color: rgba(235,242,250,.55); }
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
                /*
                 * padding-top 72px 는 데스크톱의 고정 헤더 높이만큼 내리는 값이다.
                 * 모바일에서는 헤더가 static(문서 흐름 안)이라 이 패딩이 유령 여백
                 * 72px 로 남는다(실측 스크린샷: 헤더와 LEWORD 사이 빈 띠).
                 */
                .lw-app { grid-template-columns: minmax(0, 1fr); padding-top: 0; min-height: auto; }
                .lw-side {
                    position: static; height: auto;
                    border-right: none; border-bottom: 1px solid rgba(255,255,255,.08);
                    padding: 16px 14px;
                }
                /*
                 * 모바일 내비 = 햄버거(사장님 지시: 알약은 대충이다).
                 * 세로 사이드탭은 숨기고, [현재 탭명 · ☰] 버튼 하나 + 펼침 메뉴만 쓴다.
                 */
                .lw-nav { display: none; }
                .lw-brand { padding: 0 2px 12px; }
                /*
                 * overflow 를 visible 로 되돌려야 한다 — 데스크톱 사이드바의
                 * overflow-y:auto 가 남으면 절대배치 메뉴가 이 박스 안에서
                 * 클리핑된다(실측: 좌표는 정상인데 픽셀이 안 그려지고, 첫 항목
                 * 조각이 토글 위로 비어져 나왔다).
                 */
                /*
                 * top:auto 필수 — 기본 스타일의 sticky top:72px 가 relative 에서도
                 * 살아나 사이드 전체를 72px 내려앉혀 본문 제목과 겹쳤다(실측:
                 * 그리드 행은 맞는데 aside 만 +72 로 그려짐). 유령 텍스트의 진범.
                 */
                .lw-side { position: relative; top: auto; overflow: visible; }
                .lw-mobile-toggle {
                    display: flex; align-items: center; justify-content: space-between;
                    width: 100%;
                    padding: 13px 16px;
                    border: 1px solid rgba(124,92,255,.30);
                    border-radius: 13px;
                    background: linear-gradient(135deg, rgba(124,92,255,.14), rgba(255,255,255,.02));
                    color: #fff; font-size: 14.5px; font-weight: 800;
                    cursor: pointer;
                }
                .lw-mobile-current { display: flex; align-items: center; gap: 9px; }
                .lw-mobile-current span { opacity: .9; }
                .lw-burger { font-size: 17px; color: #b8a6ff; line-height: 1; }
                .lw-mobile-menu {
                    display: flex; flex-direction: column;
                    position: absolute; left: 14px; right: 14px; top: calc(100% - 6px);
                    z-index: 60;
                    padding: 8px;
                    border: 1px solid rgba(124,92,255,.28);
                    border-radius: 15px;
                    background: #0c0f16;
                    box-shadow: 0 18px 50px rgba(0,0,0,.55), 0 0 0 1px rgba(124,92,255,.10);
                }
                .lw-mobile-item {
                    display: flex; align-items: center; gap: 12px;
                    width: 100%;
                    padding: 13px 14px;
                    border: none; border-radius: 11px;
                    background: transparent;
                    color: #c6ccd9; font-size: 14.5px; font-weight: 700; text-align: left;
                    cursor: pointer;
                }
                .lw-mobile-item span { width: 20px; text-align: center; opacity: .85; color: var(--tabc, currentColor); }
                .lw-mobile-item em { font-style: normal; flex: 1; }
                .lw-mobile-item b { color: var(--tabc, #b14cff); font-size: 9px; }
                .lw-mobile-item.on {
                    color: #fff;
                    background: linear-gradient(135deg, var(--tabc-soft, rgba(124,92,255,.26)), transparent);
                }
                .lw-mobile-item:active { background: rgba(255,255,255,.06); }
                .lw-navi span { display: none; }
                .lw-navi-full { display: none; }
                .lw-navi-short { display: inline; }
                .lw-side-foot { display: none; }
                .lw-card-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            }
        `}</style>
    );
}

export default LewordStyles;
