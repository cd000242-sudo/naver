/**
 * /leword 화면 스타일.
 *
 * 인라인 스타일을 쓰는 프로젝트지만 이 화면은 사이드바 + 그리드 + 표라서
 * 인라인으로 쓰면 같은 값을 수십 번 반복하게 된다. 한 곳에 모아 두면
 * 카드 하나를 고칠 때 다섯 군데를 찾아다니지 않아도 된다.
 *
 * 2026-11 light pass: every colour is a --lw-* variable (lewordTheme.ts, values from tokens.ts).
 */
import { LEWORD_MOTION_CSS, LEWORD_THEME_VARS } from './lewordTheme';

function LewordStyles() {
    return (
        <style>{`
            .lw-app { ${LEWORD_THEME_VARS} }
            /* hidden creates a body scroll container and detaches sticky navigation
             * from the document scroll. Clip horizontal overflow only on LEWORD. */
            html:has(.lw-app), body:has(.lw-app) { overflow-x: clip; }

            .lw-app {
                display: grid;
                grid-template-columns: 248px minmax(0, 1fr);
                min-height: calc(100vh - 72px);
                padding-top: 72px;
                /* Light page, no colour bloom (2026-11 light pass). */
                background: var(--lw-page);
                color: var(--lw-text);
            }

            /* ── 사이드바 ── */
            .lw-side {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 24px 12px 20px;
                border-right: 1px solid var(--lw-line);
                background: var(--lw-surface);
                position: sticky;
                top: 72px;
                height: calc(100vh - 72px);
                overflow-y: auto;
            }

            .lw-brand { display: flex; align-items: center; gap: 12px; padding: 4px 12px 20px; }
            .lw-logo {
                display: grid;
                place-items: center;
                width: 30px; height: 30px;
                border-radius: 10px;
                background: var(--lw-btn);
                color: var(--lw-on-btn); font-weight: 600;
                box-shadow: none;
            }
            .lw-brand b { font-size: 17px; letter-spacing: -.3px; color: var(--lw-text); }

            .lw-nav { display: flex; flex-direction: column; gap: 3px; }
            .lw-navi {
                display: flex; align-items: center; gap: 12px;
                width: 100%;
                padding: 12px 12px;
                border: 1px solid transparent;
                border-radius: 10px;
                background: transparent;
                color: var(--lw-text-secondary);
                font-size: 15px; font-weight: 600; text-align: left;
                cursor: pointer;
                transition: background .16s, color .16s, border-color .16s;
            }
            .lw-navi span { width: 18px; text-align: center; opacity: .85; font-size: 13px; }
            .lw-navi em { font-style: normal; }
            /* 데스크톱은 전체 라벨, 모바일은 짧은 라벨 — 미디어쿼리가 토글한다. */
            .lw-navi-short { display: none; }
            /* 모바일 햄버거 — 데스크톱에서는 존재하지 않는다. */
            .lw-mobile-toggle, .lw-mobile-menu { display: none; }
            .lw-navi:hover { background: var(--lw-raised); color: var(--lw-text); }
            /*
             * 탭별 고유색(사장님 지정 2026-08-20)은 2026-11 밝은 화면에서 아이콘 글자에만 남긴다(작은 표시).
             * 글자·테두리는 중립, 고른 탭은 옅은 금색 면과 옆의 금색 막대(LewordNavInk)로 표시한다.
             */
            .lw-navi-golden { --tabc: var(--lw-tab-golden); }
            .lw-navi-issue { --tabc: var(--lw-tab-issue); }
            .lw-navi-homefeed { --tabc: var(--lw-tab-homefeed); }
            .lw-navi-adsense { --tabc: var(--lw-tab-adsense); }
            .lw-navi-analyze { --tabc: var(--lw-tab-analyze); }
            .lw-navi-plan { --tabc: var(--lw-tab-plan); }
            .lw-navi-kin { --tabc: var(--lw-tab-kin); }
            .lw-navi-affiliate { --tabc: var(--lw-tab-affiliate); }
            .lw-navi-youtube { --tabc: var(--lw-tab-youtube); }
            .lw-navi-radar { --tabc: var(--lw-tab-radar); }
            .lw-navi-rank { --tabc: var(--lw-tab-rank); }
            .lw-navi-keys { --tabc: var(--lw-tab-keys); }
            .lw-navi span { color: var(--tabc, var(--lw-text-muted)); }
            .lw-navi.on {
                background: var(--lw-accent-soft);
                border-color: transparent;
                color: var(--lw-text);
            }
            
            .lw-side-foot {
                margin-top: auto;
                padding: 16px;
                border: 1px solid var(--lw-line);
                border-radius: 14px;
                background: var(--lw-surface);
            }
            .lw-side-foot p { margin: 0 0 12px; color: var(--lw-text-secondary); font-size: 13px; line-height: 1.55; }
            .lw-side-foot a {
                display: block;
                padding: 8px;
                border-radius: 10px;
                background: var(--lw-btn);
                color: var(--lw-on-btn);
                font-size: 13px; font-weight: 600; text-align: center; text-decoration: none;
            }
            .lw-side-foot a.lw-ghost {
                margin-top: 8px;
                background: transparent;
                border: 1px solid var(--lw-line);
                color: var(--lw-text-secondary);
            }

            /* ── 본문 ── */
            .lw-main { padding: clamp(20px, 3vw, 36px) clamp(16px, 3vw, 36px) 72px; min-width: 0; }
            /* 비서 띠 — 상단 메뉴(72px) 밑에 붙는다. 본문 좌우 여백만큼 넓혀 내용이 띠 밑으로 깔끔히 지나간다. */
            .lw-assist-bar { position: sticky; top: 72px; z-index: 60; display: flex; justify-content: flex-end; align-items: center; height: 54px; margin: calc(-1 * clamp(20px, 3vw, 36px)) calc(-1 * clamp(16px, 3vw, 36px)) 12px; padding: 0 clamp(16px, 3vw, 36px); background: var(--lw-page); backdrop-filter: none; border-bottom: 1px solid var(--lw-line); }

            .lw-intro { margin-bottom: 20px; }
            .lw-intro h1 { margin: 0 0 8px; color: var(--lw-text); font-size: clamp(22px, 3vw, 30px); font-weight: 600; }
            .lw-intro p { margin: 0 0 8px; color: var(--lw-text-secondary); font-size: 15px; line-height: 1.65; max-width: 720px; }
            .lw-source { color: var(--lw-text-muted); font-size: 13px; font-weight: 600; }

            /* ── 검색·도구 줄 ── */
            .lw-search, .lw-toolbar {
                display: flex; align-items: center; flex-wrap: wrap; gap: 12px;
                margin-bottom: 16px;
            }
            .lw-search input, .lw-toolbar input {
                flex: 1; min-width: 200px;
                padding: 12px 16px;
                border: 1px solid var(--lw-line);
                border-radius: 10px;
                background: var(--lw-surface);
                color: var(--lw-text); font-size: 15px;
            }
            .lw-search input:focus, .lw-toolbar input:focus { outline: 2px solid var(--lw-accent-line); outline-offset: 1px; }
            .lw-search-two input:nth-of-type(2) { flex: 1.4; }
            .lw-search button[type="submit"] {
                padding: 12px 24px;
                border: none; border-radius: 10px;
                background: var(--lw-btn);
                color: var(--lw-on-btn); font-size: 15px; font-weight: 600; cursor: pointer;
            }
            .lw-search button[type="submit"]:disabled { opacity: .5; cursor: not-allowed; }

            .lw-segment { display: flex; gap: 8px; }
            .lw-segment-wrap { flex-wrap: wrap; }
            .lw-segment button {
                padding: 8px 16px;
                border: 1px solid var(--lw-line);
                border-radius: 999px;
                background: var(--lw-surface);
                color: var(--lw-text-secondary);
                font-size: 13px; font-weight: 600; cursor: pointer;
            }
            /*
             * 활성 칩은 반전이다(taste: selection via inversion — 한 화면에
             * 반전 하나가 어떤 액센트 테두리보다 강한 앵커가 된다).
             */
            .lw-segment button.on { background: var(--lw-accent); border-color: var(--lw-accent-line); color: var(--lw-on-accent); }
            .lw-count { margin-left: auto; color: var(--lw-text-muted); font-size: 13px; font-weight: 600; }

            /* ── 사용량 ── */
            .lw-usage {
                display: flex; flex-wrap: wrap; gap: 8px 20px;
                margin-bottom: 16px; padding: 12px 16px;
                border: 1px solid var(--lw-line);
                border-radius: 10px;
                background: var(--lw-surface);
                color: var(--lw-text-secondary);
                font-size: 13px; font-weight: 600;
            }
            .lw-usage.warn { border-color: var(--lw-accent-line); background: var(--lw-surface); color: var(--lw-accent-ink); }

            /* ── 안내·오류 ── */
            .lw-note {
                margin-bottom: 16px; padding: 16px 20px;
                border: 1px solid var(--lw-line);
                border-radius: 14px;
                background: var(--lw-surface);
                color: var(--lw-text-secondary);
                font-size: 15px; line-height: 1.7;
            }
            .lw-note strong { display: block; margin-bottom: 4px; color: var(--lw-text); font-size: 15px; }
            .lw-note p { margin: 0; }
            .lw-note-detail { margin-top: 8px !important; color: var(--lw-text-muted); font-size: 13px; font-family: ui-monospace, monospace; }
            .lw-note-plain { font-size: 13px; }
            .lw-note-setup { border-color: var(--lw-line); background: var(--lw-surface); }
            .lw-note-limit { border-color: var(--lw-accent-line); background: var(--lw-surface); }
            .lw-more-btn {
                display: block; width: 100%; margin: 16px 0 4px; padding: 12px 16px;
                border: 1px dashed var(--lw-accent-line); border-radius: 14px;
                background: var(--lw-surface); color: var(--lw-accent-ink);
                font-size: 15px; font-weight: 600; cursor: pointer;
                transition: background .2s ease, border-color .2s ease;
            }
            .lw-more-btn:hover { background: var(--lw-raised); border-color: var(--lw-accent-line); }
            .lw-spark { display: flex; flex-direction: column; gap: 4px; padding: 8px 8px; border: 1px solid var(--lw-line); border-radius: 10px; background: var(--lw-surface); }
            /* 스파크라인 클릭 래퍼 — 버튼 기본 껍데기를 벗기고 그래프가 곧 버튼이 된다. */
            .lw-spark-open { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; text-align: inherit; color: inherit; font: inherit; }
            .lw-spark-open:hover .lw-spark { border-color: var(--lw-line); }
            .lw-spark-open:focus-visible { outline: 2px solid var(--lw-accent-line); outline-offset: 2px; border-radius: 10px; }

            /* ── 수요 그래프 모달 — 중립 격자·정점 한 점 강조·글로우 없음 ── */
            .lw-chart-backdrop { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 4vh 3vw; background: var(--lw-scrim); }
            .lw-chart-modal { width: min(860px, 96vw); border: 1px solid var(--lw-line); border-radius: 14px; background: var(--lw-surface); padding: 20px 20px 16px; }
            .lw-chart-modal header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
            .lw-chart-modal h3 { margin: 0; font-size: 20px; font-weight: 600; color: var(--lw-text); }
            .lw-chart-modal header p { margin: 4px 0 0; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-chart-modal header button { flex: none; width: 34px; height: 34px; border: 1px solid var(--lw-line); border-radius: 10px; background: none; color: var(--lw-text-secondary); font-size: 15px; cursor: pointer; }
            .lw-chart-modal svg { width: 100%; height: auto; display: block; }
            .lw-chart-tick { font-size: 13px; fill: var(--lw-text-muted); }
            .lw-chart-peak { font-size: 13px; font-weight: 600; fill: var(--lw-accent-ink); }
            .lw-chart-modal footer { margin-top: 12px; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-spark svg { width: 100%; height: 56px; display: block; }
            /* 11px 미만 기능 텍스트 금지(impeccable) — 10.5px 가 검문에 걸렸다. */
            .lw-spark-foot { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-spark-foot em { font-style: normal; color: var(--lw-text-secondary); font-weight: 600; }
            .lw-spark-foot .lw-spark-hot { color: var(--lw-positive); font-weight: 600; }
            .lw-why { margin: 8px 0 0; padding: 8px 12px; border-left: 2px solid var(--lw-accent-line); background: var(--lw-surface); border-radius: 0 10px 10px 0; font-size: 13px; line-height: 1.5; color: var(--lw-text-secondary); }
            .lw-why em { font-style: normal; color: var(--lw-accent-ink); font-weight: 600; margin-right: 4px; }
            .lw-why small { display: block; margin-top: 3px; font-size: 13px; color: var(--lw-text-muted); }
            .lw-kin { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; padding: 8px 12px; border: 1px dashed var(--lw-line); border-radius: 10px; background: var(--lw-surface); }
            .lw-board-list .lw-kin { grid-column: 1 / -1; }
            .lw-kin em { font-style: normal; color: var(--lw-text); font-size: 13px; font-weight: 600; }
            .lw-kin a { font-size: 13px; color: var(--lw-text-secondary); text-decoration: none; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--lw-line); }
            .lw-kin a:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            /* 조회수 실측 — 어느 질문이 실제로 읽히는지가 글감 우선순위다. */
            .lw-kin-views { margin-left: 8px; font-size: 13px; color: var(--lw-text); font-weight: 600; white-space: nowrap; }
            /* 번호 목록(사장님 지시: "1. 2. 3. 이런식으로") — 칩 무더기보다 서열이 읽힌다. */
            .lw-kin-list { margin: 0; padding: 0; list-style: none; counter-reset: kin; width: 100%; display: flex; flex-direction: column; gap: 4px; }
            .lw-kin-list li { counter-increment: kin; display: flex; align-items: baseline; gap: 8px; min-width: 0; }
            .lw-kin-list li::before { content: counter(kin); flex: none; font-size: 13px; font-weight: 600; color: var(--lw-positive); min-width: 14px; }
            .lw-kin-list a { border: 0; padding: 0; border-radius: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .lw-kin-list a:hover { text-decoration: underline; color: var(--lw-text); }

            /* ── 지식인 황금질문 탭(좌측 메뉴 독립 탭) — 실시간·급상승·숨은 3레인 ── */
            .lw-kg-list { margin: 16px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px; }
            .lw-kg-list li { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 16px; align-items: start; padding: 16px 16px; border: 1px solid var(--lw-line); border-radius: 14px; background: var(--lw-surface); }
            .lw-kg-rank { font-family: Consolas, monospace; font-size: 15px; font-weight: 600; color: var(--lw-positive); text-align: center; padding-top: 2px; }
            .lw-kg-body { min-width: 0; }
            /*
             * 전문은 다 보이되 **읽는 폭은 본문 규격(약 74자)** — 화면 전체 폭으로
             * 퍼진 200자짜리 줄이 가독성을 죽였다(사장님 지적 2026-08-20).
             */
            .lw-kg-body a { display: block; max-width: 74ch; font-size: 15px; font-weight: 600; color: var(--lw-text); text-decoration: none; word-break: keep-all; line-height: 1.5; }
            .lw-kg-body a:hover { color: var(--lw-text); text-decoration: underline; }
            .lw-kg-body p { margin: 8px 0 0; max-width: 74ch; font-size: 13px; color: var(--lw-text-secondary); word-break: keep-all; line-height: 1.68; }
            .lw-kg-body small { display: block; margin-top: 8px; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-kg-body small b { color: var(--lw-text); font-weight: 600; }
            .lw-kg-up { font-style: normal; color: var(--lw-positive); font-weight: 600; }
            /* 이미 작업한 질문 표시 — 중복 작업을 막는다. */
            .lw-kg-worked { font-style: normal; color: var(--lw-accent-ink); font-weight: 600; }
            .lw-engine-usage { grid-column: 1 / -1; margin: 8px 0 0; font-size: 13px; color: var(--lw-text-muted); }
            .lw-engine-usage b { color: var(--lw-text-secondary); font-weight: 600; }
            .lw-usage { margin: 12px 0 0; padding: 12px 12px; border: 1px solid var(--lw-line); border-radius: 10px; background: var(--lw-surface); }
            .lw-usage-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
            .lw-usage-plan { padding: 2px 8px; border-radius: 999px; background: var(--lw-surface); color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; letter-spacing: .2px; }
            .lw-usage-who { color: var(--lw-text-muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .lw-usage-head button { margin-left: auto; padding: 4px 12px; border: 1px solid var(--lw-line); border-radius: 7px; background: transparent; color: var(--lw-text-secondary); font-size: 13px; cursor: pointer; white-space: nowrap; }
            .lw-usage-head button:hover:not(:disabled) { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-usage-head button:disabled { opacity: .5; cursor: not-allowed; }
            .lw-usage-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; }
            .lw-usage-label { width: 56px; color: var(--lw-text-secondary); flex: none; }
            .lw-usage-reset { color: var(--lw-text-muted); white-space: nowrap; flex: none; }
            /*
             * 유튜브 빈자리 — 영상 / 실측 / 글감 3단(사장님 지정 배치 2026-08-20).
             * lw-card 클래스를 쓰지 않는다. 그게 세로 쌓기라 grid 를 덮어써서
             * 카드가 가운데로 무너졌다(실측). 이 줄은 자기 배경을 직접 갖는다.
             */
            /* ── 로그인 ─────────────────────────────────────────── */
            .lw-acct {
                display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
                padding: 12px 16px; margin-bottom: 16px;
                border: 1px solid var(--lw-line); border-radius: 10px; background: var(--lw-surface);
            }
            .lw-acct-face {
                width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; flex: none;
                background: var(--lw-surface); border: 1px solid var(--lw-line);
                color: var(--lw-text-secondary); font-weight: 600; font-size: 13px;
            }
            .lw-acct-id { font-weight: 600; font-size: 15px; color: var(--lw-text); }
            .lw-acct-meta { color: var(--lw-text-muted); font-size: 13px; font-family: ui-monospace, monospace; }
            .lw-acct-left {
                display: inline-flex; align-items: center; gap: 8px; padding: 3px 12px; border-radius: 999px;
                font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums;
                background: var(--lw-surface); color: var(--lw-positive);
            }
            .lw-acct-left.soon { background: var(--lw-surface); color: var(--lw-accent-ink); }
            .lw-acct-left.out { background: var(--lw-surface); color: var(--lw-negative); }
            .lw-acct-left i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
            .lw-acct-btn {
                margin-left: auto; padding: 8px 12px; border-radius: 10px; cursor: pointer;
                border: 1px solid var(--lw-line); background: transparent; color: var(--lw-text-secondary); font-size: 13px;
            }
            .lw-acct-btn:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-acct-btn.on { border-color: var(--lw-accent-line); background: var(--lw-raised); color: var(--lw-accent-ink); font-weight: 600; }

            .lw-navi.locked { opacity: .55; }
            .lw-navi-lock { margin-left: auto; font-size: 13px; font-weight: 400; }

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
                background: var(--lw-scrim); backdrop-filter: none;
            }
            .lw-auth { width: 100%; max-width: 400px; position: relative; z-index: 1; }
            .lw-auth-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
            .lw-auth-logo {
                width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; flex: none;
                background: var(--lw-accent); color: var(--lw-on-accent); font-weight: 600; font-size: 15px;
            }
            .lw-auth-brand b { font-size: 17px; color: var(--lw-text); }
            .lw-auth-brand span { color: var(--lw-text-muted); font-size: 13px; }
            .lw-auth h3 { margin: 0 0 8px; font-size: 20px; color: var(--lw-text); }
            .lw-auth-sub { margin: 0 0 20px; color: var(--lw-text-muted); font-size: 13px; }
            .lw-auth-msg {
                display: flex; gap: 8px; padding: 12px 12px; border-radius: 10px; font-size: 13px;
                line-height: 1.55; margin-bottom: 16px;
            }
            .lw-auth-msg.bad { background: var(--lw-surface); border: 1px solid var(--lw-line); color: var(--lw-text-secondary); }
            .lw-auth-msg.good { background: var(--lw-surface); border: 1px solid var(--lw-line); color: var(--lw-positive); }
            .lw-auth-msg b { color: var(--lw-text); }
            /* 본인인증·비밀번호 변경 진입 버튼 — 로그인 폼 아래 두 갈래. */
            .lw-auth-tools { display: flex; gap: 8px; margin-top: 16px; }
            .lw-auth-tools button {
                flex: 1; padding: 12px; border-radius: 10px; cursor: pointer; font-family: inherit;
                font-size: 13px; font-weight: 600; color: var(--lw-text);
                border: 1px solid var(--lw-line); background: var(--lw-surface);
            }
            .lw-auth-tools button:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-auth-field { display: block; margin-bottom: 12px; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-auth-field em { font-style: normal; color: var(--lw-text-muted); font-size: 13px; }
            .lw-auth-field input {
                display: block; width: 100%; margin-top: 8px; padding: 12px 12px; border-radius: 10px;
                border: 1px solid var(--lw-line); background: var(--lw-surface);
                color: var(--lw-text); font-size: 15px; font-family: inherit;
            }
            .lw-auth-field input.mono { font-family: ui-monospace, monospace; letter-spacing: .06em; }
            .lw-auth-field input:focus { outline: 2px solid var(--lw-accent-line); outline-offset: 1px; border-color: var(--lw-accent-line); }
            .lw-auth-cta {
                width: 100%; margin-top: 8px; padding: 12px; border-radius: 10px; border: 0; cursor: pointer;
                background: var(--lw-btn); color: var(--lw-on-btn); font-size: 15px; font-weight: 600; font-family: inherit;
            }
            .lw-auth-cta.gold { background: var(--lw-accent); color: var(--lw-on-accent); }
            .lw-auth-cta:disabled { opacity: .6; cursor: not-allowed; }
            .lw-auth-switch { margin: 16px 0 0; text-align: center; font-size: 13px; color: var(--lw-text-muted); }
            .lw-auth-switch button {
                padding: 0; border: 0; background: none; cursor: pointer; font-family: inherit; font-size: 13px;
                color: var(--lw-text-secondary); border-bottom: 1px solid var(--lw-line);
            }
            .lw-metric-verdict { padding: 3px 12px; border-radius: 10px; font-weight: 600; font-size: 13px; }
            .lw-linktag {
                padding: 2px 8px; border-radius: 999px; font-size: 13px; font-weight: 600;
                background: var(--lw-raised); color: var(--lw-text-secondary);
            }
            .lw-linktag.on { background: var(--lw-raised); color: var(--lw-positive); }
            .lw-linktag.ready { background: var(--lw-surface); color: var(--lw-accent-ink); }
            /* 빈자리 판정 근거 — 무엇을 기준으로 셌는지 눈에 보이게. */
            /* 수요 그래프 기간 고르개 — 월별과 30일은 다른 자료다. */
            .lw-chart-ranges { display: flex; gap: 8px; margin: 2px 0 12px; }
            .lw-chart-ranges button {
                padding: 4px 12px; border-radius: 10px; cursor: pointer; font-family: inherit;
                border: 1px solid var(--lw-line); background: transparent;
                color: var(--lw-text-secondary); font-size: 13px; font-weight: 600;
            }
            .lw-chart-ranges button:hover { color: var(--lw-text); border-color: var(--lw-line); }
            .lw-chart-ranges button.on {
                border-color: var(--lw-accent-line); background: var(--lw-raised); color: var(--lw-positive);
            }

            .lw-slot-basis {
                margin-left: 4px; font-style: normal; font-size: 13px; font-weight: 600;
                color: var(--lw-text-muted);
            }
            .lw-slots { margin: 12px 0 0; }
            .lw-slots summary {
                cursor: pointer; color: var(--lw-text-secondary); font-size: 13px; font-weight: 600;
                padding: 4px 0;
            }
            .lw-slots summary:hover { color: var(--lw-text-secondary); }
            .lw-slots ol { margin: 8px 0 0; padding: 0 0 0 4px; list-style: none; display: grid; gap: 4px; }
            .lw-slots li { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
            .lw-slots li b { width: 16px; color: var(--lw-text-muted); font-variant-numeric: tabular-nums; }
            .lw-slots li em {
                flex: 1; min-width: 0; font-style: normal; color: var(--lw-text-secondary);
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .lw-slots li i { font-style: normal; font-size: 13px; font-weight: 600; color: var(--lw-text-muted); }
            .lw-slots li.open i { color: var(--lw-positive); }
            .lw-slots li.open em { color: var(--lw-text); }
            .lw-slots p { margin: 8px 0 0; color: var(--lw-text-muted); font-size: 13px; }

            /* 제휴 제목 만들기 — 세 레인(쿠팡·토스·브랜드커넥트)이 같은 모양을 쓴다. */
            /*
             * 카드(.lw-product)가 4칸 grid 라 이 블록이 5번째 칸으로 밀려
             * 26px 짜리 첫 칸에 들어갔다 — 버튼 글자가 세로로 눌렸다
             * (사장님 실측 2026-08-20). 한 줄을 통째로 쓰게 못박는다.
             */
            .lw-aff-titles { grid-column: 1 / -1; margin-top: 12px; min-width: 0; }
            .lw-aff-make {
                display: inline-flex; align-items: baseline; gap: 8px; padding: 8px 12px;
                border: 1px solid var(--lw-accent-line); border-radius: 10px; background: var(--lw-surface);
                color: var(--lw-accent-ink); font-size: 13px; font-weight: 600; cursor: pointer;
                white-space: nowrap;
            }
            .lw-aff-make:hover:not(:disabled) { background: var(--lw-raised); color: var(--lw-text); }
            .lw-aff-make:disabled { opacity: .6; cursor: not-allowed; }
            .lw-aff-make span { font-weight: 400; font-size: 13px; color: var(--lw-text-muted); }
            .lw-aff-err { margin: 8px 0 0; color: var(--lw-negative); font-size: 13px; }
            .lw-aff-ideas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
            .lw-aff-ideas li { padding: 8px 12px; border-radius: 10px; background: var(--lw-surface); }
            /* 공식을 다 갖춘 하나 — 테두리 하나로만 말한다. 여러 개를 강조하면 고를 값이 없다. */
            .lw-aff-ideas li.on, .lw-yt-ideas li.on { background: var(--lw-raised); box-shadow: none; }
            .lw-pick {
                display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 999px;
                background: var(--lw-surface); color: var(--lw-accent-ink); font-size: 13px; font-weight: 600;
                letter-spacing: .02em; vertical-align: 1px;
            }
            .lw-aff-ideakey { padding: 0; border: 0; background: none; color: var(--lw-accent-ink); font-size: 13px; font-weight: 600; cursor: pointer; text-align: left; }
            .lw-aff-ideas button.lw-aff-ideakey:hover { text-decoration: underline; }
            .lw-aff-ideas p { margin: 4px 0 0; font-size: 13px; line-height: 1.5; color: var(--lw-text-secondary); overflow-wrap: anywhere; }
            .lw-aff-ideas em { display: inline-block; min-width: 30px; margin-right: 4px; color: var(--lw-text-muted); font-style: normal; font-size: 13px; }
            .lw-yt-meta { margin-left: auto; color: var(--lw-text-muted); font-size: 13px; }
            .lw-yt-filters { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: center; margin-top: 12px; }
            .lw-yt-forms, .lw-yt-cats { display: flex; flex-wrap: wrap; gap: 8px; }
            .lw-yt-forms button, .lw-yt-cats button {
                padding: 8px 12px; border: 1px solid var(--lw-line); border-radius: 999px;
                background: transparent; color: var(--lw-text-secondary); font-size: 13px; cursor: pointer;
            }
            .lw-yt-forms button em, .lw-yt-cats button em { font-style: normal; color: var(--lw-text-muted); margin-left: 3px; font-size: 13px; }
            .lw-yt-forms button:hover, .lw-yt-cats button:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-yt-forms button.on, .lw-yt-cats button.on { border-color: var(--lw-accent-line); background: var(--lw-raised); color: var(--lw-text); font-weight: 600; }
            .lw-yt-forms button.on em, .lw-yt-cats button.on em { color: var(--lw-text-secondary); }
            /* 형식 고르개는 카테고리보다 위계가 위다 — 세로 구분선으로 갈라 둔다. */
            .lw-yt-cats { padding-left: 16px; border-left: 1px solid var(--lw-line); }
            .lw-yt-tags { display: flex; gap: 8px; margin: 8px 0 0; }
            .lw-yt-form, .lw-yt-cat { padding: 2px 8px; border-radius: 999px; font-size: 13px; font-weight: 600; }
            .lw-yt-form-short { background: var(--lw-surface); color: var(--lw-negative); }
            .lw-yt-form-long { background: var(--lw-surface); color: var(--lw-text-secondary); }
            .lw-yt-cat { background: var(--lw-raised); color: var(--lw-text-secondary); font-weight: 400; }
            /* 글감 주제 배지 — 쇼핑각 금색·복지 초록·AI 청록. 근거는 title 툴팁에. */
            .lw-yt-topic { padding: 2px 8px; border-radius: 999px; font-size: 13px; font-weight: 600; }
            .lw-yt-topic-shopping { background: var(--lw-surface); color: var(--lw-accent-ink); }
            .lw-yt-topic-policy { background: var(--lw-surface); color: var(--lw-positive); }
            .lw-yt-topic-ai { background: var(--lw-surface); color: var(--lw-positive); }
            .lw-yt-topics button.on { border-color: var(--lw-accent-line); background: var(--lw-raised); }
            @media (max-width: 680px) {
                .lw-yt-cats { padding-left: 0; border-left: 0; }
            }
            .lw-yt-gap { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
            .lw-yt-row {
                display: grid; grid-template-columns: 260px minmax(0, 1fr) minmax(0, 320px);
                gap: 20px; align-items: start; padding: 16px;
                border: 1px solid var(--lw-line); border-radius: 14px; background: var(--lw-surface);
            }
            .lw-yt-video { width: 100%; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: var(--lw-surface); }
            .lw-yt-video iframe { width: 100%; height: 100%; border: 0; display: block; }
            .lw-yt-video > button { position: relative; display: block; width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: pointer; }
            .lw-yt-video img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .lw-yt-play {
                position: absolute; inset: 0; margin: auto; width: 46px; height: 46px; border-radius: 50%;
                display: grid; place-items: center; background: var(--lw-surface); color: var(--lw-text); font-size: 17px; box-shadow: var(--lw-shadow-float);
                transition: transform var(--lw-fast) var(--lw-ease), background var(--lw-fast) var(--lw-ease);
            }
            .lw-yt-video > button:hover .lw-yt-play { background: var(--lw-raised); transform: scale(1.04); }

            .lw-yt-body { min-width: 0; }
            .lw-yt-body h3 { margin: 0 0 8px; font-size: 17px; color: var(--lw-text); overflow-wrap: anywhere; }
            .lw-yt-metrics { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-yt-metrics strong { color: var(--lw-text); font-variant-numeric: tabular-nums; }
            .lw-yt-ratio strong { color: var(--lw-accent-ink); }
            .lw-yt-from { margin: 8px 0 0; color: var(--lw-text-muted); font-size: 13px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
            .lw-yt-date { margin: 4px 0 0; color: var(--lw-text-muted); font-size: 13px; }
            .lw-yt-date span { color: var(--lw-text-muted); }
            .lw-yt-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
            .lw-yt-analyze { padding: 8px 12px; border: 1px solid var(--lw-line); border-radius: 10px; background: var(--lw-surface); color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; }
            .lw-yt-act {
                padding: 8px 12px; border: 1px solid var(--lw-line); border-radius: 10px;
                background: transparent; color: var(--lw-text-secondary); font-size: 13px; font-weight: 600;
                cursor: pointer; text-decoration: none; display: inline-flex; align-items: center;
            }
            .lw-yt-act:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-yt-analyze:hover { background: var(--lw-raised); color: var(--lw-text); }

            .lw-yt-write { min-width: 0; padding-left: 16px; border-left: 1px solid var(--lw-line); }
            .lw-yt-write h4 { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--lw-text-secondary); }
            .lw-yt-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
            .lw-yt-chips button { padding: 4px 8px; border: 1px solid var(--lw-line); border-radius: 999px; background: transparent; color: var(--lw-text-secondary); font-size: 13px; cursor: pointer; }
            .lw-yt-chips button:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-yt-make { padding: 8px 12px; border: 1px solid var(--lw-accent-line); border-radius: 10px; background: var(--lw-surface); color: var(--lw-accent-ink); font-size: 13px; font-weight: 600; cursor: pointer; }
            .lw-yt-make:hover { background: var(--lw-raised); color: var(--lw-text); }
            .lw-yt-hint { margin: 0; color: var(--lw-text-muted); font-size: 13px; }
            .lw-yt-err { margin: 0 0 8px; color: var(--lw-negative); font-size: 13px; }
            .lw-yt-ideas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
            .lw-yt-ideas li { padding: 8px 12px; border-radius: 10px; background: var(--lw-surface); }
            .lw-yt-ideakey { padding: 0; border: 0; background: none; color: var(--lw-accent-ink); font-size: 13px; font-weight: 600; cursor: pointer; text-align: left; }
            .lw-yt-ideakey:hover { text-decoration: underline; }
            .lw-yt-ideas p { margin: 4px 0 0; font-size: 13px; line-height: 1.5; color: var(--lw-text-secondary); overflow-wrap: anywhere; }
            .lw-yt-ideas em { display: inline-block; min-width: 30px; margin-right: 4px; color: var(--lw-text-muted); font-style: normal; font-size: 13px; }

            @media (max-width: 1180px) {
                .lw-yt-row { grid-template-columns: 220px minmax(0, 1fr); }
                .lw-yt-write { grid-column: 1 / -1; padding-left: 0; padding-top: 12px; border-left: 0; border-top: 1px solid var(--lw-line); }
            }
            @media (max-width: 680px) {
                .lw-yt-row { grid-template-columns: 1fr; }
                .lw-yt-meta { margin-left: 0; flex-basis: 100%; }
            }
            .lw-usage-err { margin: 4px 0 0; color: var(--lw-negative); font-size: 13px; }
            .lw-usage-foot { margin: 8px 0 0; color: var(--lw-text-muted); font-size: 13px; }
            .lw-usage-foot b { color: var(--lw-text-secondary); font-weight: 600; }
            @media (max-width: 560px) {
                .lw-usage-reset { display: none; }
            }
            .lw-kg-recent { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--lw-text-secondary); white-space: nowrap; }
            .lw-kg-recent input { accent-color: var(--lw-accent-ink); width: 15px; height: 15px; }
            .lw-kg-kw { border: 0; background: none; padding: 0; font-size: 13px; color: var(--lw-text); cursor: pointer; text-decoration: underline; }
            .lw-kg-copy { flex: none; border: 1px solid var(--lw-line); border-radius: 10px; background: none; color: var(--lw-text-secondary); font-size: 13px; padding: 8px 12px; cursor: pointer; white-space: nowrap; }
            .lw-kg-copy:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-kg-row-actions { display: flex; gap: 8px; }
            .lw-kg-answer { flex: none; border: 0; border-radius: 10px; background: var(--lw-accent); color: var(--lw-on-accent); font-size: 13px; font-weight: 600; padding: 8px 12px; cursor: pointer; white-space: nowrap; }
            .lw-kg-answer:hover { filter: brightness(1.06); }
            @media (max-width: 640px) { .lw-kg-list li { grid-template-columns: 24px minmax(0, 1fr); } .lw-kg-row-actions { display: none; } }

            /* ── 답변 작업대 ── */
            .lw-kg-work-meta { display: block; margin-top: 3px; color: var(--lw-text-secondary); font-size: 13px; }
            .lw-kg-work-body { margin: 0; white-space: pre-wrap; color: var(--lw-text); font-size: 13px; line-height: 1.7; word-break: keep-all; max-height: 220px; overflow-y: auto; padding: 12px 12px; border: 1px solid var(--lw-line); border-radius: 10px; background: var(--lw-surface); }
            .lw-kg-draft { width: 100%; resize: vertical; padding: 12px 16px; border: 1px solid var(--lw-line); border-radius: 10px; background: var(--lw-surface); color: var(--lw-text); font: inherit; font-size: 15px; line-height: 1.7; }
            .lw-kg-draft:focus { outline: none; border-color: var(--lw-accent-line); }
            .lw-kg-work-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; }
            .lw-kg-work-actions button, .lw-kg-open { padding: 8px 16px; border-radius: 10px; border: 1px solid var(--lw-line); background: none; color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; }
            .lw-kg-work-actions button:hover, .lw-kg-open:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-kg-work-actions button:disabled { opacity: .5; cursor: default; }
            .lw-kg-generate { background: var(--lw-accent) !important; border-color: var(--lw-accent-line) !important; color: var(--lw-on-accent) !important; }
            .lw-kg-linkbox { display: flex; align-items: center; gap: 8px; margin-left: auto; font-size: 13px; color: var(--lw-text-secondary); cursor: pointer; }
            .lw-kg-linkbox input { accent-color: var(--lw-accent-ink); width: 15px; height: 15px; }
            .lw-kg-linkbox.off { opacity: .45; cursor: not-allowed; }
            .lw-kg-bloginput { width: 100%; margin-top: 8px; padding: 8px 12px; border: 1px solid var(--lw-line); border-radius: 10px; background: var(--lw-surface); color: var(--lw-text); font-size: 13px; }
            /* 글감 드롭다운 — 키워드 하나에 SEO·홈판 제목이 접혀 있다. */
            .lw-ideas { display: flex; flex-direction: column; gap: 8px; }
            .lw-idea { border: 1px solid var(--lw-line); border-radius: 10px; background: var(--lw-surface); overflow: hidden; }
            .lw-idea.on { border-color: var(--lw-accent-line); }
            .lw-idea-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 12px; border: 0; background: none; color: var(--lw-text); font-size: 15px; font-weight: 600; cursor: pointer; text-align: left; }
            .lw-idea-head span { color: var(--lw-text-muted); font-size: 13px; }
            .lw-idea-body { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
            .lw-idea-why { margin: 0 0 3px; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-idea-click { margin: 0 0 4px; font-size: 13px; color: var(--lw-accent-ink); }
            .lw-idea-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
            .lw-idea-title span { flex: none; font-size: 13px; font-weight: 600; color: var(--lw-accent-ink); border: 1px solid var(--lw-accent-line); border-radius: 6px; padding: 2px 8px; }
            .lw-idea-title em { flex: 1; min-width: 0; font-style: normal; font-size: 13px; color: var(--lw-text); font-weight: 600; }
            .lw-idea-title button { flex: none; border: 1px solid var(--lw-line); border-radius: 7px; background: none; color: var(--lw-text-secondary); font-size: 13px; padding: 3px 8px; cursor: pointer; }
            .lw-idea-title button:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }

            /* 엔진 선택 목록 — 하나 골라 연동하고 그것으로 쓴다. */
            .lw-engines-list { display: flex; flex-direction: column; gap: 8px; }
            .lw-engine-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 12px 16px; border: 1px solid var(--lw-line); border-radius: 14px; background: var(--lw-surface); }
            .lw-engine-row.on { border-color: var(--lw-accent-line); background: var(--lw-raised); }
            .lw-engine-name b { display: block; font-size: 15px; color: var(--lw-text); }
            .lw-engine-name small { display: block; margin-top: 2px; font-size: 13px; color: var(--lw-text-muted); }
            /* 상태 문구가 길어졌다 — "앱에만 연동"과 "사이트까지 연동"을 구분해야 해서다.
               좁은 화면에서 줄바꿈되도록 nowrap 을 풀고 오른쪽 정렬로 붙인다. */
            .lw-engine-state { font-size: 13px; font-weight: 600; color: var(--lw-text-secondary); text-align: right; max-width: 230px; line-height: 1.45; }
            .lw-engine-state.ok { color: var(--lw-positive); }

            /* 연동 순서 — 무엇을 먼저 해야 하는지가 화면에 없어서 생긴 혼선을 없앤다. */
            .lw-connect-steps { margin: 0 0 12px; padding: 16px 16px 16px 36px; border: 1px solid var(--lw-accent-line); border-radius: 14px; background: var(--lw-surface); display: grid; gap: 8px; }
            .lw-connect-steps li { font-size: 13px; line-height: 1.6; color: var(--lw-text-secondary); }
            .lw-connect-steps li b { color: var(--lw-text); }
            /* 끝난 단계는 힘을 빼고, 지금 할 단계만 눈에 들어오게 한다. */
            .lw-connect-steps li.done { color: var(--lw-text-muted); }
            .lw-connect-steps li.done b { color: var(--lw-text-secondary); font-weight: 600; }
            .lw-connect-steps li.now { color: var(--lw-text); }
            .lw-connect-steps li.now b { color: var(--lw-accent-ink); }
            .lw-connect-steps .lw-step-ok { color: var(--lw-positive); font-weight: 600; }
            .lw-connect-steps li em { display: block; margin-top: 3px; font-style: normal; font-size: 13px; color: var(--lw-text-muted); }
            .lw-connect-steps .lw-step-cta {
                display: inline-block; margin-top: 8px; padding: 8px 16px; border-radius: 10px;
                background: var(--lw-accent); color: var(--lw-on-accent); font-weight: 600; font-size: 13px; text-decoration: none;
            }
            .lw-connect-steps .lw-step-cta:hover { background: var(--lw-accent); }

            /* 재는 중 표시 — 글자만으로는 멈춘 건지 도는 건지 알 수 없다. */
            .lw-usage-spin {
                display: inline-block; width: 11px; height: 11px; margin-right: 8px; vertical-align: -1px;
                border: 2px solid var(--lw-line); border-top-color: var(--lw-accent-line); border-radius: 50%;
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
            .lw-engine-actions { display: flex; gap: 8px; position: relative; z-index: 10002; }
            @media (max-width: 720px) {
                .lw-engine-row { grid-template-columns: minmax(0, 1fr); }
                .lw-engine-actions { justify-content: flex-start; }
            }

            /* 폴백 체인 상태 — 어느 CLI 가 실제로 살아 있는지 한눈에. */
            .lw-agents-block { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--lw-line); }
            .lw-agents-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
            .lw-agents-head b { font-size: 13px; font-weight: 600; color: var(--lw-text-secondary); }
            .lw-agents { display: flex; flex-wrap: wrap; gap: 8px; }
            .lw-agent { font-size: 13px; font-weight: 600; padding: 4px 12px; border-radius: 999px; border: 1px solid var(--lw-line); color: var(--lw-text-secondary); white-space: nowrap; }
            .lw-agent-ok { border-color: var(--lw-line); color: var(--lw-positive); background: var(--lw-surface); }
            .lw-agent-warn { border-color: var(--lw-accent-line); color: var(--lw-accent-ink); }
            .lw-agent-login { margin-left: 8px; padding: 2px 8px; border: 1px solid var(--lw-line); border-radius: 6px; background: none; color: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
            .lw-agent-login:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-agent-login:disabled { opacity: .5; cursor: default; }

            .lw-kg-bridge { margin: 8px 0 12px; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-kg-bridge.ok { color: var(--lw-positive); }
            .lw-kg-work-note { margin: 8px 0 0; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-kg-work-note a { color: var(--lw-text); }
            .lw-kg-ledger p { margin: 0; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-kg-ledger b { color: var(--lw-accent-ink); }

            /* 키워드 옆 복사 — 액션 줄에서 홀로 밀려나던 버튼의 새 자리. */
            .lw-copy-mini { flex: none; margin-left: 2px; padding: 2px 8px; border: 1px solid var(--lw-line); border-radius: 7px; background: none; color: var(--lw-text-secondary); font-size: 13px; cursor: pointer; }
            .lw-copy-mini:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }

            /* ── 노출 추적: 발행 글 전체 감사 표 ── */
            .lw-audit-badge { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; }
            .lw-audit-in { background: var(--lw-surface); color: var(--lw-positive); border: 1px solid var(--lw-line); }
            .lw-audit-out { background: var(--lw-surface); color: var(--lw-negative); border: 1px solid var(--lw-line-strong); }
            /* 색인은 됐는데 순위만 밖 — 빨강(색인 실패)과 구분해야 할 일이 달라진다. */
            .lw-audit-half { background: var(--lw-surface); color: var(--lw-accent-ink); border: 1px solid var(--lw-accent-line); }

            /* 노출 여부로 나눠 보기 — 200건을 한 판에 두면 손볼 것이 안 보인다. */
            .lw-audit-filters { display: flex; gap: 8px; margin: 12px 0 4px; flex-wrap: wrap; }
            .lw-audit-filters button {
                padding: 8px 16px; border-radius: 999px; cursor: pointer; font: inherit;
                font-size: 13px; font-weight: 600; border: 1px solid var(--lw-line);
                background: transparent; color: var(--lw-text-secondary);
            }
            .lw-audit-filters button.on { background: var(--lw-accent); border-color: var(--lw-accent-line); color: var(--lw-on-accent); font-weight: 600; }
            .lw-audit-filters em { font-style: normal; margin-left: 4px; opacity: .75; font-variant-numeric: tabular-nums; }

            /* 노출된 자리는 눌러서 그 검색결과로 간다. */
            .lw-rank-go { color: inherit; text-decoration: none; border-bottom: 1px dashed currentColor; }
            .lw-rank-go:hover { opacity: .8; }

            /* 키워드 분석의 글감·제목 — 숫자만 보여 주면 "그래서 뭘 쓰지"가 남는다. */
            .lw-analyze-ideas { margin-top: 16px; padding: 16px 16px; border-radius: 14px; border: 1px solid var(--lw-accent-line); background: var(--lw-surface); }
            .lw-analyze-ideas-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
            .lw-analyze-ideas-head b { font-size: 15px; color: var(--lw-accent-ink); }
            .lw-analyze-ideas-head span { flex: 1; min-width: 200px; font-size: 13px; color: var(--lw-text-muted); }
            .lw-analyze-ideas-head button {
                padding: 8px 20px; border-radius: 10px; border: 0; cursor: pointer;
                background: var(--lw-accent); color: var(--lw-on-accent); font: inherit; font-size: 13px; font-weight: 600;
            }
            .lw-analyze-ideas-head button:disabled { opacity: .6; cursor: not-allowed; }
            .lw-analyze-ideas-err { margin: 12px 0 0; font-size: 13px; color: var(--lw-negative); line-height: 1.6; }
            .lw-idea-list { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 12px; }
            .lw-idea-list li { padding: 12px 16px; border-radius: 10px; background: var(--lw-surface); border: 1px solid var(--lw-line); }
            .lw-idea-list b { display: block; font-size: 13px; color: var(--lw-text); margin-bottom: 4px; }
            .lw-idea-list em { display: block; font-style: normal; font-size: 13px; color: var(--lw-text-muted); line-height: 1.6; }
            .lw-idea-list .lw-idea-click { color: var(--lw-accent-ink); }
            .lw-idea-list p { margin: 8px 0 0; font-size: 13px; color: var(--lw-text-secondary); line-height: 1.6; }
            .lw-idea-list p span {
                display: inline-block; min-width: 44px; margin-right: 8px; padding: 2px 8px; border-radius: 6px;
                background: var(--lw-raised); color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; text-align: center;
            }

            /* 탭별 자리 — 같은 글도 탭마다 순위가 다르다. 한 줄로 나란히 보여 준다. */
            .lw-tabrank { margin: 12px 0 20px; padding: 16px 16px; border-radius: 14px; border: 1px solid var(--lw-line); background: var(--lw-surface); }
            .lw-tabrank-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
            .lw-tabrank-head b { font-size: 15px; color: var(--lw-accent-ink); }
            .lw-tabrank-head a { flex: 1; min-width: 160px; font-size: 13px; color: var(--lw-text-muted); text-decoration: none; word-break: break-all; }
            .lw-tabrank-head a:hover { color: var(--lw-text-secondary); }
            .lw-tabrank-head button {
                border: 1px solid var(--lw-line); background: transparent; color: var(--lw-text-secondary);
                border-radius: 10px; padding: 8px 12px; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600;
            }
            .lw-tabrank-head button:hover:not(:disabled) { border-color: var(--lw-accent-line); color: var(--lw-accent-ink); }
            .lw-tabrank-head button:disabled { opacity: .55; cursor: not-allowed; }
            .lw-tabrank-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
            .lw-tabrank-card {
                display: flex; flex-direction: column; gap: 3px; text-decoration: none;
                padding: 12px 16px; border-radius: 10px;
                border: 1px solid var(--lw-line); background: var(--lw-surface);
            }
            .lw-tabrank-card.on { border-color: var(--lw-accent-line); background: var(--lw-raised); }
            .lw-tabrank-card span { font-size: 13px; color: var(--lw-text-secondary); font-weight: 600; }
            .lw-tabrank-card b { font-size: 20px; font-weight: 600; color: var(--lw-text-muted); font-variant-numeric: tabular-nums; }
            .lw-tabrank-card.on b { color: var(--lw-positive); }
            .lw-tabrank-card em { font-style: normal; font-size: 13px; color: var(--lw-text-muted); }

            /* 유튜브 지금 갱신 — 스냅샷과 별개라는 것이 눈에 보여야 한다. */
            .lw-yt-live-btn {
                margin-left: auto; padding: 8px 16px; border-radius: 10px; border: 0; cursor: pointer;
                background: var(--lw-negative-soft); color: var(--lw-text); font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap;
            }
            .lw-yt-live-btn:disabled { opacity: .6; cursor: not-allowed; }
            .lw-live-panel {
                margin: 16px 0 20px; padding: 16px 20px; border-radius: 14px;
                border: 1px solid var(--lw-line);
                background: transparent;
            }
            .lw-live-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
            .lw-live-head b { font-size: 15px; color: var(--lw-negative); }
            .lw-live-head span { flex: 1; min-width: 240px; font-size: 13px; color: var(--lw-text-muted); line-height: 1.55; }
            .lw-live-head button {
                border: 1px solid var(--lw-line); background: transparent; color: var(--lw-text-secondary);
                border-radius: 10px; padding: 4px 12px; cursor: pointer; font: inherit; font-size: 13px;
            }
            .lw-live-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
            .lw-live-card {
                display: flex; flex-direction: column; gap: 4px; text-decoration: none;
                padding: 8px; border-radius: 10px; background: var(--lw-surface);
                border: 1px solid var(--lw-line);
            }
            .lw-live-card:hover { border-color: var(--lw-accent-line); }
            .lw-live-card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 7px; }
            .lw-live-card b {
                font-size: 13px; font-weight: 600; color: var(--lw-text); line-height: 1.45;
                display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
            }
            .lw-live-card em { font-style: normal; font-size: 13px; color: var(--lw-text-muted); }
            .lw-note-err { border-color: var(--lw-line-strong); color: var(--lw-negative); }

            /* 제휴 — 막힌 니즈 옆에 실제로 뚫리는 자리. 초록은 "여기로 쓰면 된다"는 뜻이다. */
            .lw-product-slots {
                display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
                font-size: 13px; font-weight: 600; color: var(--lw-positive);
            }
            .lw-product-slots a {
                display: inline-flex; align-items: baseline; gap: 4px;
                padding: 3px 8px; border-radius: 7px; text-decoration: none;
                background: var(--lw-surface); border: 1px solid var(--lw-line); color: var(--lw-positive);
            }
            .lw-product-slots a:hover { background: var(--lw-raised); }
            .lw-product-slots em { font-style: normal; font-weight: 500; font-size: 13px; opacity: .72; }

            /* 밀면 되는 자리 — 할 일이 구간마다 다르니 색으로 가른다. */
            .lw-band-keep { background: var(--lw-surface); color: var(--lw-positive); border: 1px solid var(--lw-line); }
            .lw-band-push { background: var(--lw-surface); color: var(--lw-accent-ink); border: 1px solid var(--lw-accent-line); }
            .lw-band-far  { background: var(--lw-surface); color: var(--lw-text-muted); border: 1px solid var(--lw-line); }
            .lw-push-head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin: 16px 0 8px; }
            .lw-push-head p { margin: 0; flex: 1; min-width: 260px; font-size: 13px; line-height: 1.65; color: var(--lw-text-secondary); }
            .lw-push-head p b { color: var(--lw-text); }
            .lw-push-head button {
                padding: 8px 20px; border-radius: 10px; border: 0; cursor: pointer;
                background: var(--lw-accent); color: var(--lw-on-accent); font: inherit; font-size: 13px; font-weight: 600;
            }
            .lw-push-head button:disabled { opacity: .6; cursor: not-allowed; }
            .lw-push-note { margin: 2px 0 8px; font-size: 13px; color: var(--lw-positive); }
            .lw-push-note.error { color: var(--lw-negative); }

            /* 중단된 점검을 이어서 — 남은 건수를 그대로 적는다. */
            .lw-audit-resume {
                display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
                margin: 12px 0 0; padding: 12px 16px; border-radius: 10px;
                border: 1px solid var(--lw-accent-line); background: var(--lw-surface);
                font-size: 13px; color: var(--lw-text-secondary);
            }
            .lw-audit-resume b { color: var(--lw-accent-ink); }
            .lw-audit-resume button {
                margin-left: auto; padding: 8px 16px; border-radius: 10px; border: 0; cursor: pointer;
                background: var(--lw-accent); color: var(--lw-on-accent); font: inherit; font-size: 13px; font-weight: 600;
            }
            .lw-audit-wait { background: var(--lw-surface); color: var(--lw-text-secondary); border: 1px solid var(--lw-line); }
            .lw-audit-why { display: block; margin-top: 4px; font-size: 13px; color: var(--lw-negative); }
            /* 실제 사용한 검색어 — 순위의 기준이 눈에 보여야 신뢰가 생긴다. */
            .lw-audit-q { display: block; margin-top: 3px; font-size: 13px; font-weight: 400; color: var(--lw-text-muted); white-space: nowrap; }
            .lw-audit-q-btn { border: 0; background: none; padding: 0; cursor: pointer; text-align: left; text-decoration: underline dotted; }
            .lw-audit-q-btn:hover { color: var(--lw-text); }
            /* 다른 검색엔진 칩 — 누르면 그 엔진 검색이 열린다(자동 판정의 수동 검증문). */
            .lw-engines { display: flex; gap: 4px; flex-wrap: wrap; }
            .lw-engine { font-size: 13px; font-weight: 600; padding: 3px 8px; border-radius: 7px; border: 1px solid var(--lw-line); color: var(--lw-text-secondary); text-decoration: none; white-space: nowrap; }
            .lw-engine-found { border-color: var(--lw-line); color: var(--lw-positive); }
            .lw-engine-blocked { border-color: var(--lw-accent-line); color: var(--lw-accent-ink); }
            .lw-engine:hover { color: var(--lw-text); }
            /* AI 평가 점수 — 실측이 아님을 라벨이 말한다. */
            .lw-score-row { display: flex; gap: 12px; flex-wrap: wrap; }
            .lw-score { flex: 1; min-width: 200px; padding: 12px 12px; border: 1px solid var(--lw-line); border-radius: 10px; background: var(--lw-surface); }
            .lw-score em { font-style: normal; font-size: 22px; font-weight: 600; color: var(--lw-accent-ink); margin-right: 8px; }
            .lw-score span { font-size: 13px; font-weight: 600; color: var(--lw-text-secondary); }
            .lw-score small { display: block; margin-top: 4px; font-size: 13px; color: var(--lw-text-secondary); line-height: 1.5; }
            .lw-audit-table td { vertical-align: top; }

            /* ── 글 RPM(애드센스 실측) 판정 배지 ─────────────────────────
               내 평균 RPM 과의 비교다 — 밖에서 가져온 잣대가 아니라 내 글끼리 견준다.
               숫자만 보면 어느 글을 밀지 못 고른다. 색으로 한눈에 갈라 준다. */
            .lw-rpm-hot, .lw-rpm-ok, .lw-rpm-low, .lw-rpm-na {
                display: inline-block; border-radius: 999px; padding: 3px 8px;
                font-size: 13px; font-weight: 600; font-style: normal;
                border: 1px solid; white-space: nowrap;
            }
            .lw-rpm-hot { color: var(--lw-positive); border-color: var(--lw-line); background: var(--lw-surface); }
            .lw-rpm-ok { color: var(--lw-text-secondary); border-color: var(--lw-line); }
            .lw-rpm-low { color: var(--lw-negative); border-color: var(--lw-line-strong); background: var(--lw-surface); }
            .lw-rpm-na { color: var(--lw-text-muted); border-color: var(--lw-line); }
            /* 사용법 — 접힌 채로 늘 그 자리에 있는다. 연결이 끝나도 지우지 않는다. */
            .lw-rpm-help {
                margin-top: 16px; border: 1px solid var(--lw-line);
                border-radius: 14px; background: var(--lw-surface);
            }
            .lw-rpm-help > summary {
                cursor: pointer; padding: 12px 16px; font-weight: 600;
                color: var(--lw-text-secondary); font-size: 13px; list-style: none;
            }
            .lw-rpm-help > summary::-webkit-details-marker { display: none; }
            .lw-rpm-help > summary::before { content: '▸ '; color: var(--lw-accent-ink); }
            .lw-rpm-help[open] > summary::before { content: '▾ '; }
            .lw-rpm-help-body { padding: 0 16px 16px; color: var(--lw-text-secondary); font-size: 13px; line-height: 1.7; }
            .lw-rpm-help-body h4 {
                margin: 16px 0 4px; color: var(--lw-text); font-size: 13px; font-weight: 600;
            }
            .lw-rpm-help-body p { margin: 0 0 8px; }
            .lw-rpm-help-body ul { margin: 4px 0 0; padding-left: 20px; }
            .lw-rpm-help-body li { margin-bottom: 4px; }
            .lw-rpm-help-body code {
                background: var(--lw-raised); border-radius: 4px;
                padding: 1px 4px; font-size: 13px; color: var(--lw-accent-ink);
            }
            .lw-rpm-warn {
                display: inline-block; margin-left: 8px; border-radius: 999px;
                padding: 1px 8px; font-size: 13px; font-weight: 600;
                color: var(--lw-negative); border: 1px solid var(--lw-line-strong); background: var(--lw-surface);
            }
            /* 자격증명 받는 3단계 — 순서가 있는 일이라 번호를 그대로 쓴다. */
            .lw-rpm-steps { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
            .lw-rpm-steps .lw-mini { text-decoration: none; cursor: pointer; }
            /* 자동 갱신 토글 — 지켜보는 판이라 마지막으로 잰 시각이 같이 보여야 한다. */
            .lw-rpm-auto {
                display: inline-flex; align-items: center; gap: 8px;
                color: var(--lw-text-secondary); font-size: 13px; cursor: pointer;
            }
            .lw-rpm-auto b { color: var(--lw-accent-ink); font-weight: 600; }
            /* 돈·조회수는 자릿수가 맞아야 비교가 된다. RPM 표에만 준다. */
            .lw-rpm-table td { font-variant-numeric: tabular-nums; }

            /* 차트 호버 십자선 값 — 가리킨 점의 기간·상대값. */
            .lw-chart-hover { font-size: 13px; font-weight: 600; fill: var(--lw-text); }
            .lw-spark-hover { color: var(--lw-text); font-weight: 600; }
            .lw-note-error { border-color: var(--lw-line-strong); background: var(--lw-surface); }
            /* ── 외부유입 레이더 ───────────────────────────── */
            .lw-radar-progress {
                display: flex; gap: 8px; margin: 16px 0; flex-wrap: wrap;
            }
            .lw-radar-progress span {
                padding: 8px 12px; border-radius: 999px; font-size: 13px; font-weight: 600;
                border: 1px solid var(--lw-line); color: var(--lw-text-muted); background: var(--lw-surface);
            }
            .lw-radar-progress span.on {
                border-color: var(--lw-accent-line); color: var(--lw-positive); background: var(--lw-raised);
                animation: lwRadarPulse 1.2s ease-in-out infinite;
            }
            .lw-radar-progress span.ok { border-color: var(--lw-line); color: var(--lw-positive); }
            @keyframes lwRadarPulse { 50% { opacity: .55; } }
            @media (prefers-reduced-motion: reduce) { .lw-radar-progress span.on { animation: none; } }

            .lw-radar-brief { border-color: var(--lw-line); }
            .lw-radar-kws { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 2px; }
            .lw-radar-kw {
                display: inline-flex; align-items: baseline; gap: 8px;
                padding: 8px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; color: var(--lw-text);
                border: 1px solid var(--lw-line); background: var(--lw-surface);
            }
            .lw-radar-kw b { color: var(--lw-positive); font-size: 13px; font-variant-numeric: tabular-nums; }
            .lw-radar-kw b.doc { color: var(--lw-text); }
            .lw-radar-money { margin: 12px 0 0; color: var(--lw-accent-ink); font-size: 13px; font-weight: 600; }
            .lw-radar-needkey {
                margin: 12px 0 0; padding: 12px 12px; border-radius: 10px;
                background: var(--lw-surface); border: 1px solid var(--lw-line);
                color: var(--lw-text-secondary); font-size: 13px; line-height: 1.6;
            }
            .lw-radar-needkey b { color: var(--lw-positive); }
            .lw-radar-needkey a { color: var(--lw-positive); font-weight: 600; }

            .lw-radar-partial { margin: 12px 0 0; color: var(--lw-accent-ink); font-size: 13px; }

            .lw-radar-group .lw-panel-head h2 em {
                margin-left: 4px; font-style: normal; font-size: 15px; color: var(--lw-text-muted);
                font-variant-numeric: tabular-nums;
            }
            .lw-radar-now { border-color: var(--lw-line); }
            .lw-radar-empty { margin: 0; color: var(--lw-text-muted); font-size: 13px; }
            .lw-radar-cards { display: grid; gap: 12px; }
            .lw-radar-card {
                padding: 16px 16px; border-radius: 14px;
                border: 1px solid var(--lw-line); background: var(--lw-surface);
            }
            .lw-radar-card.is-done { opacity: .55; }
            .lw-radar-card.is-dismissed { opacity: .4; }
            .lw-radar-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
            .lw-radar-src {
                padding: 3px 8px; border-radius: 6px; font-size: 13px; font-weight: 600;
                border: 1px solid var(--lw-line); color: var(--lw-text-secondary);
            }
            .lw-radar-src.src-kin { color: var(--lw-accent-ink); border-color: var(--lw-accent-line); }
            .lw-radar-src.src-cafearticle { color: var(--lw-positive); border-color: var(--lw-line); }
            .lw-radar-src.src-blog { color: var(--lw-text); border-color: var(--lw-line); }
            .lw-radar-src.src-community { color: var(--lw-text); border-color: var(--lw-line); }
            /* 링크 정책 — 막힌 판은 눈에 띄어야 헛수고를 막는다. */
            .lw-radar-policy {
                padding: 3px 8px; border-radius: 6px; font-size: 13px; font-weight: 600;
                border: 1px solid transparent;
            }
            .lw-radar-policy.pol-ok { background: var(--lw-surface); color: var(--lw-positive); }
            .lw-radar-policy.pol-careful { background: var(--lw-surface); color: var(--lw-accent-ink); }
            .lw-radar-policy.pol-banned { background: var(--lw-surface); color: var(--lw-negative); }
            .lw-radar-policy.pol-unknown { background: var(--lw-surface); color: var(--lw-text-secondary); }
            .lw-radar-gate {
                padding: 3px 8px; border-radius: 6px; font-size: 13px; font-weight: 600;
                background: var(--lw-surface); color: var(--lw-positive);
            }
            .lw-radar-audience { margin: 12px 0 0; color: var(--lw-text-secondary); font-size: 13px; line-height: 1.6; }
            /* 글 해부 — 답변 각도를 짤 때 꺼내 보는 재료. */
            .lw-radar-anatomy { margin: 12px 0 0; }
            .lw-radar-anatomy summary { cursor: pointer; color: var(--lw-positive); font-size: 13px; font-weight: 600; padding: 4px 0; }
            .lw-radar-anatomy ul { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
            .lw-radar-anatomy li { border-left: 2px solid var(--lw-line); padding-left: 12px; }
            .lw-radar-anatomy li b { display: block; color: var(--lw-text); font-size: 13px; font-weight: 600; margin-bottom: 3px; }
            .lw-radar-anatomy li span { color: var(--lw-text-secondary); font-size: 13px; line-height: 1.6; }
            .lw-radar-gap {
                margin-top: 12px; padding: 12px 12px; border-radius: 10px;
                background: var(--lw-surface); border: 1px solid var(--lw-accent-line);
            }
            .lw-radar-gap b { display: block; color: var(--lw-accent-ink); font-size: 13px; margin-bottom: 4px; }
            .lw-radar-gap p { margin: 0; color: var(--lw-text-secondary); font-size: 13px; line-height: 1.6; }
            .lw-radar-gap em { display: block; margin-top: 4px; font-style: normal; color: var(--lw-text-muted); font-size: 13px; }
            .lw-radar-score { color: var(--lw-positive); font-size: 15px; font-variant-numeric: tabular-nums; }
            .lw-radar-state { font-style: normal; font-size: 13px; color: var(--lw-positive); font-weight: 600; }
            .lw-radar-card h3 { margin: 0 0 8px; font-size: 15px; line-height: 1.4; }
            .lw-radar-card h3 a { color: var(--lw-text); text-decoration: none; }
            .lw-radar-card h3 a:hover { color: var(--lw-positive); }
            .lw-radar-excerpt { margin: 0 0 8px; color: var(--lw-text-secondary); font-size: 13px; line-height: 1.55; }
            .lw-radar-reason { margin: 0 0 4px; color: var(--lw-text-secondary); font-size: 13px; }
            .lw-radar-angle { margin: 0 0 4px; color: var(--lw-positive); font-size: 13px; }
            .lw-radar-meta { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 12px; color: var(--lw-text-muted); font-size: 13px; }
            .lw-radar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
            .lw-radar-actions a, .lw-radar-actions button {
                padding: 8px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
                border: 1px solid var(--lw-line); background: transparent; color: var(--lw-text-secondary);
                text-decoration: none;
            }
            .lw-radar-actions a:hover, .lw-radar-actions button:hover { border-color: var(--lw-accent-line); color: var(--lw-positive); }
            .lw-radar-actions button.pri { border-color: var(--lw-line); background: var(--lw-surface); color: var(--lw-positive); }
            .lw-radar-rest { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
            .lw-radar-rest li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
            .lw-radar-rest a { color: var(--lw-text-secondary); text-decoration: none; }
            .lw-radar-rest a:hover { color: var(--lw-positive); }
            /* 훑지 않은 판 — 기다리면 열리는 곳과 영영 막힌 곳을 갈라 적는다. */
            .lw-audit-progress {
                margin-left: 12px; font-size: 13px; font-weight: 600; color: var(--lw-positive);
                font-variant-numeric: tabular-nums;
            }

            /* 엔진별 칸 — 상태 하나만 담는다. 칩을 뭉치지 않는다. */
            .lw-engine-cell { white-space: nowrap; }
            .lw-engine-cell .lw-engine {
                display: inline-block; padding: 3px 8px; border-radius: 7px;
                font-size: 13px; font-weight: 600; text-decoration: none;
            }
            .lw-engine-cell .lw-engine-found { background: var(--lw-surface); color: var(--lw-positive); }
            .lw-engine-cell .lw-engine-blocked { background: var(--lw-surface); color: var(--lw-accent-ink); }
            .lw-engine-cell .lw-engine-none { background: var(--lw-surface); color: var(--lw-negative); }
            .lw-engine-cell .lw-engine:hover { filter: brightness(1.2); }

            .lw-radar-gated ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
            .lw-radar-gated li { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 13px; }
            .lw-radar-gated li a { color: var(--lw-text); font-weight: 600; text-decoration: none; }
            .lw-radar-gated li a:hover { color: var(--lw-positive); }
            .lw-radar-gated li i {
                font-style: normal; font-size: 13px; font-weight: 600;
                padding: 2px 8px; border-radius: 6px;
            }
            .lw-radar-gated li.delayed i { background: var(--lw-surface); color: var(--lw-accent-ink); }
            .lw-radar-gated li.closed i { background: var(--lw-surface); color: var(--lw-text-secondary); }
            .lw-radar-gated li span { flex: 1; min-width: 220px; color: var(--lw-text-secondary); line-height: 1.55; }

            .lw-radar-dismissed { color: var(--lw-text-muted); font-size: 13px; }
            .lw-radar-dismissed button {
                border: 0; background: none; color: var(--lw-positive); font-weight: 600; cursor: pointer; font-size: 13px;
            }

            .lw-note button {
                margin-top: 12px; padding: 8px 16px;
                border: none; border-radius: 10px;
                background: var(--lw-accent);
                color: var(--lw-on-accent); font-size: 13px; font-weight: 600; cursor: pointer;
            }

            .lw-license {
                margin-bottom: 16px; padding: 16px 16px;
                border: 1px solid var(--lw-line); border-radius: 14px;
                background: var(--lw-surface);
            }
            .lw-license label { display: block; margin-bottom: 8px; color: var(--lw-text); font-size: 13px; font-weight: 600; }
            .lw-license div { display: flex; gap: 8px; }
            .lw-license input {
                flex: 1; padding: 12px 12px;
                border: 1px solid var(--lw-line); border-radius: 10px;
                background: var(--lw-raised); color: var(--lw-text); font-size: 15px;
            }
            .lw-license button {
                padding: 12px 20px; border: none; border-radius: 10px;
                background: var(--lw-accent);
                color: var(--lw-on-accent); font-size: 13px; font-weight: 600; cursor: pointer;
            }
            .lw-license small { display: block; margin-top: 8px; color: var(--lw-text-muted); font-size: 13px; }

            /* ── 패널·지표 ── */
            .lw-panel {
                margin-bottom: 20px; padding: 20px 20px;
                border: 1px solid var(--lw-line); border-radius: 18px;
                background: var(--lw-surface);
            }
            .lw-panel-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
            .lw-panel-head h2 { margin: 0; color: var(--lw-text); font-size: 20px; font-weight: 600; }
            .lw-panel-head span { color: var(--lw-text-muted); font-size: 13px; font-weight: 600; }
            .lw-panel-foot { margin: 12px 0 0; color: var(--lw-text-muted); font-size: 13px; }
            /* 분석 결과 헤더의 복사·네이버 검색 — 오른쪽으로 민다. */
            .lw-analyze-head-actions { margin-left: auto; display: inline-flex; gap: 8px; align-items: center; }
            .lw-analyze-head-actions button,
            .lw-analyze-head-actions a {
                padding: 8px 12px; border-radius: 10px; cursor: pointer; font-family: inherit;
                font-size: 13px; font-weight: 600; text-decoration: none;
                border: 1px solid var(--lw-line); background: var(--lw-surface); color: var(--lw-text);
            }
            .lw-analyze-head-actions a { border-color: var(--lw-line); color: var(--lw-positive); }
            .lw-analyze-head-actions button:hover,
            .lw-analyze-head-actions a:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }

            .lw-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 12px; }
            .lw-metric {
                padding: 12px 16px;
                border: 1px solid var(--lw-line); border-radius: 14px;
                background: var(--lw-surface);
            }
            .lw-metric span { display: block; color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; }
            .lw-metric strong { display: block; margin-top: 4px; color: var(--lw-text); font-size: 22px; font-weight: 600; }
            .lw-metric small { display: block; margin-top: 3px; color: var(--lw-text-muted); font-size: 13px; }

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
                gap: 16px 20px;
                padding: 20px 20px;
                border-radius: 18px;
                transition: border-color .15s ease, background .15s ease;
            }
            .lw-board-list .lw-card-pre:hover {
                border-color: var(--lw-accent-line);
                background: var(--lw-raised);
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
            .lw-card-head { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
            /*
             * 배지는 조용해야 한다(taste: 초점은 한 곳 — 이 카드의 주인공은
             * 키워드다). 4색 배지가 제목과 경쟁하던 것을 크기·무게로 눌러
             * 메타데이터 층위로 내린다. 변형별 색 의미는 그대로 산다.
             */
            .lw-card-tags span { font-size: 13px; padding: 3px 8px; font-weight: 600; }
            .lw-board-list .lw-card-metrics {
                grid-template-columns: repeat(2, minmax(0, 1fr));
                margin-top: 0; row-gap: 12px; column-gap: 12px;
            }
            /* 세로 목록에서는 숫자가 카드 높이를 끌지 않게 조금 줄인다. */
            .lw-board-list .lw-card-metrics strong { font-size: 17px; }
            .lw-board-list .lw-evidence li { font-size: 13px; }
            /*
             * 액션은 컴팩트 그리드다. 세로 풀폭 스택(예전)은 버튼 7개가 카드
             * 절반을 먹었다. 첫 버튼(어떻게 쓸까)만 골드 프라이머리 — 눌러야
             * 할 것이 하나로 보여야 손이 간다.
             */
            .lw-board-list .lw-card-actions {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 8px;
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
                display: flex; align-items: center; gap: 8px;
                font-size: 22px; line-height: 1.3; -webkit-line-clamp: 3;
            }
            .lw-rank {
                flex: none; min-width: 30px; padding: 3px 8px;
                border-radius: 10px; border: 1px solid var(--lw-line);
                background: var(--lw-surface);
                color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; text-align: center;
            }
            /*
             * 광고가 많이 붙은 자리는 광고주들이 돈을 넣는다는 뜻이다(사장님 기준).
             * 초황금 금색과 겹치지 않게 청록 계열로 둔다 — 예전 '약함' 노랑이 금색과
             * 겹쳐 구분이 안 된다는 지적을 받았다.
             */
            .lw-card-metrics .money strong { color: var(--lw-text); }
            /*
             * 네이버 광고 3위 입찰가 줄(2026-09-24) — 광고수 '돈' 표시와 같은 파란 계열. 지표 격자 안에서
             * 가로 전체를 쓴다(목록 보기는 2열, 카드 보기는 3열). 고단가만 색을 올리고 나머지는 조용히 둔다.
             */
            .lw-card-metrics .lw-card-money {
                grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px;
                padding: 8px 12px; border-radius: 10px;
                border: 1px solid var(--lw-line); background: var(--lw-surface);
            }
            .lw-card-metrics .lw-card-money span { display: inline; color: var(--lw-text); font-size: 13px; font-weight: 600; }
            .lw-card-metrics .lw-card-money strong {
                display: inline; margin-top: 0; color: var(--lw-text); font-size: 13px; font-weight: 600;
                white-space: normal; overflow: visible;
            }
            .lw-card-metrics .lw-card-money.is-high { border-color: var(--lw-line); background: var(--lw-surface); }
            .lw-card-metrics .lw-card-money.is-high strong { color: var(--lw-text); }
            .lw-card-metrics .lw-card-money.is-low,
            .lw-card-metrics .lw-card-money.is-none { border-color: var(--lw-line); background: transparent; }
            .lw-card-metrics .lw-card-money.is-low span,
            .lw-card-metrics .lw-card-money.is-none span { color: var(--lw-text-muted); }
            .lw-card-metrics .lw-card-money.is-none strong { color: var(--lw-text-secondary); font-weight: 600; }

            /*
             * 주제 서브탭. 칩(둥근 버튼)에서 밑줄 탭으로 바꿨다 — 사장님 지시.
             * 주제가 29종까지 나오므로 한 줄로 두고 가로 스크롤한다.
             */
            .lw-topic-tabs {
                display: flex; gap: 2px; margin: 16px 0 12px;
                overflow-x: auto; scrollbar-width: thin;
                border-bottom: 1px solid var(--lw-line);
            }
            .lw-topic-tabs button {
                flex: none; padding: 8px 12px;
                border: 0; border-bottom: 2px solid transparent; background: none;
                color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; white-space: nowrap;
                cursor: pointer;
            }
            .lw-topic-tabs button em { font-style: normal; opacity: .6; margin-left: 4px; }
            .lw-topic-tabs button:hover { color: var(--lw-text-secondary); }
            .lw-topic-tabs button.on { color: var(--lw-text); border-bottom-color: var(--lw-accent-line); }

            /*
             * 등급 색. 사장님 지적 — 예전 '약함' 노랑이 '초황금' 금색과 겹쳐 구분이
             * 안 됐다. 네 단계를 서로 먼 색으로 벌린다: 금색 · 청록 · 회청 · 회색.
             */
            .lw-index {
                flex: none; padding: 3px 8px; border-radius: 10px;
                font-size: 13px; font-weight: 600; white-space: nowrap;
            }
            .lw-index-ultra { background: var(--lw-surface); color: var(--lw-accent-ink); }
            .lw-index-golden { background: var(--lw-surface); color: var(--lw-positive); }
            .lw-index-fair { background: var(--lw-surface); color: var(--lw-text-secondary); }
            .lw-index-weak { background: var(--lw-surface); color: var(--lw-text-muted); }

            /*
             * 2군(외부 유입용). 1군과 시각적으로 확실히 갈라 놔야 한다 —
             * 섞여 보이면 "이것도 황금, 저것도 황금"이 되어 보드의 값어치가 사라진다.
             * 그래서 접어 두고, 펼쳐도 테두리와 색으로 다른 칸임을 알린다.
             */
            .lw-external { margin-top: 28px; }
            .lw-external-head {
                display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
                width: 100%; padding: 16px 16px;
                border: 1px dashed var(--lw-line); border-radius: 14px;
                background: var(--lw-surface);
                text-align: left; cursor: pointer;
            }
            .lw-external-title { color: var(--lw-text); font-size: 15px; font-weight: 600; }
            .lw-external-desc { color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; }
            .lw-external-toggle { margin-left: auto; color: var(--lw-text); font-size: 13px; font-weight: 600; }
            .lw-external-list { margin-top: 12px; }
            .lw-external-list .lw-card-pre { border-style: dashed; background: var(--lw-surface); }
            .lw-ext-tag {
                padding: 4px 8px; border-radius: 999px;
                border: 1px solid var(--lw-line); background: var(--lw-surface);
                color: var(--lw-text-secondary); font-size: 13px; font-weight: 600;
            }
            .lw-card-actions small {
                display: block; margin-top: 2px;
                font-size: 13px; font-weight: 600; opacity: .62;
            }

            .lw-card {
                display: flex; flex-direction: column; gap: 12px;
                padding: 16px 16px;
                border: 1px solid var(--lw-line); border-radius: 14px;
                background: var(--lw-surface);
            }
            .lw-card h3 {
                margin: 0; color: var(--lw-text); font-size: 15px; font-weight: 600; line-height: 1.4;
                word-break: keep-all;
                display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
            }
            .lw-card-note { margin: 0; color: var(--lw-text-muted); font-size: 13px; line-height: 1.5; }
            .lw-card-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: auto; }
            .lw-card-metrics > div { min-width: 0; }
            .lw-card-metrics span { display: block; color: var(--lw-text-muted); font-size: 13px; font-weight: 600; }
            .lw-card-metrics strong {
                display: block; margin-top: 3px; color: var(--lw-text); font-size: 15px; font-weight: 600;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .lw-card-metrics .hot strong { color: var(--lw-positive); }

            .lw-card-actions { display: flex; gap: 8px; }
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
                padding: 8px 12px;
                border: 1px solid var(--lw-line); border-radius: 10px;
                background: var(--lw-surface);
                color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; text-align: center; text-decoration: none;
                cursor: pointer;
                transition: background .12s ease, border-color .12s ease, color .12s ease;
            }
            .lw-card-actions button:hover, .lw-card-actions a:hover {
                background: var(--lw-raised);
                border-color: var(--lw-accent-line);
                color: var(--lw-text);
            }
            .lw-card-actions button:first-child {
                border-color: var(--lw-accent-line);
                background: var(--lw-accent-soft);
                color: var(--lw-accent-ink);
            }
            .lw-card-actions button:first-child:hover {
                background: var(--lw-accent-soft);
                color: var(--lw-accent-ink);
            }
            .lw-card-actions button:disabled { opacity: .55; cursor: wait; }

            /* ── 유튜브 카드 ── */
            .lw-card-video { padding: 0; overflow: hidden; }
            .lw-card-video h3, .lw-card-video .lw-card-note, .lw-card-video .lw-card-metrics, .lw-card-video .lw-card-actions {
                margin-left: 16px; margin-right: 16px;
            }
            .lw-card-video .lw-card-actions { margin-bottom: 16px; }
            .lw-video-thumb { position: relative; display: block; aspect-ratio: 16 / 9; background: var(--lw-surface); }
            .lw-video-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .lw-video-noimg { display: block; width: 100%; height: 100%; }
            .lw-video-rank {
                position: absolute; left: 10px; top: 10px;
                min-width: 26px; padding: 3px 8px;
                border-radius: 10px; background: var(--lw-page);
                color: var(--lw-text); font-size: 13px; font-weight: 600; text-align: center;
            }

            /* ── 표 ── */
            .lw-table-scroll { overflow-x: auto; }
            .lw-table { width: 100%; border-collapse: collapse; font-size: 13px; }
            .lw-table th, .lw-table td { padding: 12px 12px; text-align: left; border-bottom: 1px solid var(--lw-line); }
            .lw-table thead th { color: var(--lw-text-muted); font-size: 13px; font-weight: 600; white-space: nowrap; }
            .lw-table .lw-intent-row th { color: var(--lw-accent-ink); font-size: 13px; font-weight: 600; background: var(--lw-surface); border-top: 1px solid var(--lw-accent-line); }
            .lw-table .lw-intent-row small { color: var(--lw-text-muted); font-weight: 600; margin-left: 8px; }
            .lw-table tbody th { color: var(--lw-text); font-weight: 600; }
            .lw-table tbody th small { display: block; margin-top: 3px; color: var(--lw-text-muted); font-size: 13px; font-weight: 600; }
            .lw-table td { color: var(--lw-text-secondary); white-space: nowrap; }
            .lw-rank-in { color: var(--lw-positive) !important; font-weight: 600; }
            .lw-rank-out { color: var(--lw-text-secondary) !important; }
            .lw-rank-title { max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
            .lw-rank-title a { color: var(--lw-text-secondary); }
            .lw-row-actions { display: flex; gap: 8px; }

            .lw-mini {
                padding: 8px 12px;
                border: 1px solid var(--lw-line); border-radius: 10px;
                background: var(--lw-surface);
                color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; cursor: pointer;
                min-height: 44px;
            }
            .lw-mini-ghost { border-color: var(--lw-line); background: transparent; color: var(--lw-text-secondary); }

            /* ── 제휴 바로가기 ── */
            .lw-affiliate-links { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 16px; }
            .lw-affiliate-links a {
                padding: 12px 16px;
                border: 1px solid var(--lw-line); border-radius: 14px;
                background: var(--lw-surface);
                text-decoration: none;
            }
            .lw-affiliate-links strong { display: block; color: var(--lw-text); font-size: 15px; font-weight: 600; }
            .lw-affiliate-links span { display: block; margin-top: 4px; color: var(--lw-text-muted); font-size: 13px; }
            .lw-affiliate-links a:hover { background: var(--lw-raised); border-color: var(--lw-line); }

            /* ── 선점 카드 ── */
            .lw-topic-chips button em { font-style: normal; opacity: .6; margin-left: 3px; }
            .lw-topic-tag {
                align-self: flex-start;
                padding: 3px 8px; border-radius: 999px;
                background: var(--lw-surface); border: 1px solid var(--lw-line);
                color: var(--lw-text-secondary); font-size: 13px; font-weight: 600;
            }
            .lw-card-pre { position: relative; }
            .lw-intent-tag, .lw-trend-tag, .lw-warn-tag {
                padding: 3px 8px; border-radius: 999px;
                font-size: 13px; font-weight: 600; border: 1px solid;
            }
            .lw-intent-tag { background: var(--lw-surface); border-color: var(--lw-line); color: var(--lw-positive); }
            .lw-trend-tag  { background: var(--lw-surface); border-color: var(--lw-line); color: var(--lw-text-secondary); }
            /* 경고는 눈에 띄되 카드를 지배하지 않게. 버리라는 뜻이 아니라 알려주는 것이다. */
            .lw-warn-tag   { background: var(--lw-surface); border-color: var(--lw-accent-line); color: var(--lw-accent-ink); }

            /* 순위가 위에서 아래로 이어지는 목록. 좁은 화면에서도 가로 스크롤 없이 읽는다. */
            .lw-realtime-strip {
                margin: 12px 0 16px; padding: 16px;
                background: var(--lw-surface);
                border: 1px solid var(--lw-line); border-radius: 14px;
            }
            .lw-realtime-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 12px; margin-bottom: 12px; }
            .lw-realtime-head strong { font-size: 15px; color: var(--lw-text); letter-spacing: -.2px; }
            .lw-realtime-meta { font-size: 13px; color: var(--lw-text-secondary); }
            .lw-realtime-items { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
            .lw-realtime-items > li { min-width: 0; }
            .lw-realtime-item {
                display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 12px;
                width: 100%; box-sizing: border-box; min-height: 48px; padding: 12px 12px; border-radius: 10px; text-align: left;
                background: var(--lw-surface); border: 1px solid var(--lw-line);
                color: var(--lw-text); font: inherit; font-size: 15px; font-weight: 600;
            }
            button.lw-realtime-item { cursor: pointer; }
            button.lw-realtime-item:hover { background: var(--lw-raised); }
            button.lw-realtime-item:focus-visible { outline: 2px solid var(--lw-accent-line); outline-offset: 2px; }
            .lw-realtime-item.measured { border-color: var(--lw-accent-line); }
            .lw-realtime-rank { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 7px; background: var(--lw-surface); color: var(--lw-text-secondary); font-variant-numeric: tabular-nums; }
            .lw-realtime-word { min-width: 0; color: var(--lw-text); overflow-wrap: anywhere; line-height: 1.5; }
            .lw-realtime-badges { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px 12px; font-size: 13px; }
            .lw-realtime-delta { font-size: 13px; font-weight: 600; }
            .lw-realtime-delta.up { color: var(--lw-positive); }
            .lw-realtime-delta.down { color: var(--lw-text-secondary); }
            .lw-realtime-new { font-weight: 600; color: var(--lw-accent-ink); }
            .lw-realtime-measured { font-weight: 600; color: var(--lw-accent-ink); }
            @media (max-width: 600px) {
                .lw-realtime-strip { padding: 12px; }
                .lw-realtime-item { grid-template-columns: 28px minmax(0, 1fr); gap: 4px 12px; padding: 12px; }
                .lw-realtime-rank { grid-row: 1 / span 2; }
                .lw-realtime-badges { grid-column: 2; justify-content: flex-start; }
                .lw-realtime-badges:empty { display: none; }
            }
            /*
             * 황금지수 판. 사장님 지정 색: 약함 노랑 · 적당 초록 · 황금 적색 · 초황금 금색.
             * 색만 바꾸고 구조는 같게 둔다 — 단계가 달라도 눈이 같은 자리를 읽는다.
             */
            .lw-gold {
                display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 20px;
                align-items: center; margin: 0 0 16px; padding: 16px 20px;
                border-radius: 14px; border: 1px solid var(--gold-line);
                background: var(--lw-surface);
            }
            /* 열을 명시한다. grid-row 만 주면 자동배치가 숫자를 1열로 끌어와 좌우가 뒤집힌다. */
            .lw-gold-head { grid-column: 1; grid-row: 1; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
            .lw-gold-label {
                padding: 4px 12px; border-radius: 999px;
                border: 1px solid var(--gold-line); background: var(--gold-chip);
                color: var(--gold-ink); font-size: 13px; font-weight: 600; letter-spacing: .02em;
            }
            /* 키워드도 단계 색으로. 지수만 색을 주면 무엇이 초황금인지 눈에 안 걸린다. */
            .lw-gold-keyword { color: var(--gold-ink); font-size: 17px; font-weight: 600; word-break: keep-all; }
            .lw-gold-figure { grid-column: 2; grid-row: 1 / span 2; text-align: right; }
            .lw-gold-figure em {
                display: block; font-style: normal; font-size: 30px; font-weight: 600;
                line-height: 1; color: var(--gold-ink);
            }
            .lw-gold-figure span { display: block; margin-top: 4px; color: var(--lw-text-muted); font-size: 13px; font-weight: 600; }
            .lw-gold-reason { grid-column: 1; grid-row: 2; margin: 0; color: var(--lw-text-secondary); font-size: 13px; word-break: keep-all; }

            /* 카드 제목에 붙는 축소판. 목록에서 초황금이 눈에 바로 걸려야 한다. */
            .lw-card-gold { display: flex; flex-direction: column; gap: 4px; color: var(--gold-ink) !important; }
            .lw-gold-mini {
                align-self: flex-start; padding: 2px 8px; border-radius: 999px;
                border: 1px solid var(--gold-line); background: var(--gold-chip);
                color: var(--gold-ink); font-size: 13px; font-weight: 600; letter-spacing: .02em;
            }
            /* 제휴 3열. 좁아지면 한 열씩 내려간다 — 카드가 눌리면 상품명이 안 읽힌다. */
            /* 라이선스 잠금 안내. 광고처럼 보이지 않게 톤을 낮춘다 — 이미 쓰는 사람에게도 뜬다. */
            .lw-write-lanes { margin-bottom: 8px; }
            .lw-write-lanes button { font-weight: 600; }
            .lw-write-hint {
                margin: 0 0 12px; padding: 8px 12px; border-radius: 10px;
                background: var(--lw-surface); border: 1px solid var(--lw-line);
                color: var(--lw-text-secondary); font-size: 13px; word-break: keep-all;
            }
            .lw-write-hint-link {
                padding: 0; border: 0; background: none; cursor: pointer;
                color: var(--lw-text-secondary); font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 3px;
            }
            .lw-write-hint-link:hover { color: var(--lw-text); }
            .lw-gate {
                display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
                margin: 0 0 16px; padding: 16px 20px; border-radius: 14px;
                border: 1px solid var(--lw-line);
                background: var(--lw-surface);
            }
            .lw-gate-body strong { display: block; margin-bottom: 4px; color: var(--lw-text); font-size: 15px; font-weight: 600; }
            .lw-gate-body p { margin: 0; color: var(--lw-text-secondary); font-size: 13px; line-height: 1.55; word-break: keep-all; }
            .lw-gate-body b { color: var(--lw-text-secondary); }
            .lw-gate-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
            .lw-gate-form { display: flex; gap: 8px; }
            .lw-gate-form input {
                width: 190px; padding: 8px 12px; border-radius: 10px;
                border: 1px solid var(--lw-line); background: var(--lw-raised);
                color: var(--lw-text); font-size: 13px;
            }
            .lw-gate-login, .lw-gate-form button, .lw-gate-buy {
                padding: 8px 16px; border-radius: 10px; white-space: nowrap; cursor: pointer;
                font-size: 13px; font-weight: 600; text-decoration: none;
                border: 1px solid var(--lw-line); background: var(--lw-surface); color: var(--lw-text-secondary);
            }
            .lw-gate-buy { border-color: var(--lw-line); background: var(--lw-surface); color: var(--lw-text-secondary); }
            .lw-gate-login:hover, .lw-gate-form button:hover { background: var(--lw-raised); }
            .lw-lane-list-wide { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; padding: 0; }
            /* 상품 보드 — 그림이 커야 무슨 물건인지 한눈에 들어온다. */
            .lw-product-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px; }
            .lw-product {
                display: grid; grid-template-columns: 26px 72px minmax(0, 1fr) 178px; gap: 12px; align-items: start;
                padding: 12px; border: 1px solid var(--lw-line); border-radius: 14px;
                background: var(--lw-surface);
            }
            .lw-product-rank { color: var(--lw-text); font-size: 13px; font-weight: 600; padding-top: 3px; }
            .lw-product img { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; background: var(--lw-surface); }
            .lw-product-body { min-width: 0; }
            .lw-product-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
            .lw-discount, .lw-rocket, .lw-goldbox {
                padding: 2px 8px; border-radius: 999px; font-size: 13px; font-weight: 600;
                border: 1px solid var(--lw-line); background: var(--lw-surface); color: var(--lw-text-secondary);
            }
            .lw-discount { border-color: var(--lw-line-strong); background: var(--lw-surface); color: var(--lw-negative); }
            .lw-rocket { border-color: var(--lw-line); background: var(--lw-surface); color: var(--lw-text); }
            .lw-product-name { display: block; margin-bottom: 8px; color: var(--lw-text); font-size: 13px; font-weight: 600; line-height: 1.45; text-decoration: none; word-break: keep-all; }
            .lw-product-name:hover { color: var(--lw-text-secondary); }
            /* 링크 없는 상품명(토스) — 링크인 척하지 않는 복사 버튼. */
            button.lw-product-name {
                border: 0; background: none; padding: 0; text-align: left;
                cursor: pointer; font-family: inherit; width: 100%;
            }
            .lw-product-name-copy em {
                margin-left: 8px; font-style: normal; font-size: 13px; font-weight: 600;
                color: var(--lw-text-muted); white-space: nowrap;
            }
            .lw-product-name-copy:hover em { color: var(--lw-text-secondary); }
            /*
             * 지표줄 한 규격(사장님 지적 2026-08-21 "박스들이 너무 엉성하잖아").
             * 예전엔 판정 상자·니즈 알약·민짜 글씨가 제각각 키와 모양이라
             * 줄이 울퉁불퉁했다. 규칙: 칩(판정·니즈)은 같은 높이·같은 8px
             * 모서리·테두리 없는 옅은 바탕, 나머지 수치는 같은 12px 민짜.
             */
            .lw-product-metrics {
                display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap;
                margin-bottom: 8px; font-variant-numeric: tabular-nums;
            }
            .lw-product-metrics span { color: var(--lw-text-secondary); font-size: 13px; line-height: 1.5; }
            .lw-product-metrics .lw-product-price strong { color: var(--lw-accent-ink); font-size: 15px; margin-left: 0; }
            .lw-product-metrics .lw-metric-verdict,
            .lw-product-metrics .lw-product-need {
                padding: 3px 12px; border-radius: 10px; border: 0;
            }
            .lw-product-metrics .lw-product-need { background: var(--lw-surface); color: var(--lw-text-secondary); }
            .lw-product-metrics .lw-product-need strong { color: var(--lw-positive); }
            .lw-product-metrics .lw-product-persale strong { color: var(--lw-accent-ink); font-size: 13px; }
            .lw-product-metrics strong { color: var(--lw-text); font-size: 13px; font-weight: 600; margin-left: 3px; }
            /* 카드 우측 버튼 열 — 사장님 지시: 우측 세로 정렬, 테두리, 기능별 색. */
            .lw-product-actions { display: flex; flex-direction: column; gap: 8px; justify-content: center; }
            .lw-product-actions .lw-act {
                display: block; width: 100%; text-align: center; padding: 8px 12px;
                border-radius: 10px; font-size: 13px; font-weight: 600; line-height: 1.3;
                text-decoration: none; cursor: pointer; border: 1px solid; background: transparent;
                transition: filter .15s ease;
            }
            .lw-product-actions .lw-act:hover { filter: brightness(1.25); }
            .lw-act-gold { color: var(--lw-accent-ink); border-color: var(--lw-accent-line); background: var(--lw-surface); }
            .lw-act-blue { color: var(--lw-text); border-color: var(--lw-line); background: var(--lw-surface); }
            .lw-act-orange { color: var(--lw-negative); border-color: var(--lw-line-strong); background: var(--lw-surface); }
            .lw-act-green { color: var(--lw-positive); border-color: var(--lw-line); background: var(--lw-surface); }
            .lw-act-sub { display: block; font-size: 13px; font-weight: 600; opacity: .75; margin-top: 2px; }
            @media (max-width: 620px) {
                .lw-product { grid-template-columns: 22px minmax(0, 1fr); }
                .lw-product img { display: none; }
                /* 좁은 화면에선 버튼을 2×2 로 접는다. */
                .lw-product-actions { grid-column: 1 / -1; flex-direction: row; flex-wrap: wrap; }
                .lw-product-actions .lw-act { flex: 1 1 45%; width: auto; }
            }
            .lw-lanes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: start; }
            @media (max-width: 1180px) { .lw-lanes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
            @media (max-width: 780px) { .lw-lanes { grid-template-columns: minmax(0, 1fr); } }
            .lw-lane {
                border: 1px solid var(--lw-line); border-radius: 14px;
                background: var(--lw-surface); overflow: hidden;
            }
            .lw-lane-head { padding: 16px 16px 16px; border-bottom: 1px solid var(--lw-line); }
            .lw-lane-head h2 { margin: 0 0 8px; color: var(--lw-text); font-size: 15px; font-weight: 600; }
            .lw-lane-head p { margin: 0 0 4px; color: var(--lw-text-secondary); font-size: 13px; line-height: 1.5; word-break: keep-all; }
            .lw-lane-status { color: var(--lw-accent-ink) !important; font-size: 13px !important; }
            .lw-lane-head a { color: var(--lw-text); font-size: 13px; font-weight: 600; text-decoration: none; }
            .lw-lane-list { margin: 0; padding: 12px; list-style: none; display: flex; flex-direction: column; gap: 8px; }
            .lw-lane-card {
                display: flex; gap: 12px; padding: 12px;
                border: 1px solid var(--lw-line); border-radius: 10px;
                background: var(--lw-surface);
            }
            .lw-lane-rank {
                flex: 0 0 auto; width: 22px; height: 22px; border-radius: 7px;
                display: flex; align-items: center; justify-content: center;
                background: var(--lw-surface); color: var(--lw-text); font-size: 13px; font-weight: 600;
            }
            .lw-lane-body { min-width: 0; flex: 1 1 auto; }
            .lw-lane-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
            .lw-lane-body h3 { margin: 0 0 4px; color: var(--lw-text); font-size: 15px; font-weight: 600; word-break: keep-all; }
            .lw-lane-product { margin: 0 0 8px; color: var(--lw-text-secondary); font-size: 13px; line-height: 1.45; word-break: keep-all; }
            .lw-lane-metrics { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
            .lw-lane-metrics span { color: var(--lw-text-muted); font-size: 13px; }
            .lw-lane-metrics strong { color: var(--lw-text); font-size: 13px; font-weight: 600; margin-left: 3px; }
            .lw-lane-hint { margin: 8px 0 0; color: var(--lw-accent-ink); font-size: 13px; line-height: 1.45; word-break: keep-all; }
            .lw-coupang { margin: 12px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
            .lw-coupang li { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
            .lw-coupang img { width: 38px; height: 38px; object-fit: cover; border-radius: 7px; background: var(--lw-surface); }
            .lw-coupang a { color: var(--lw-text-secondary); font-size: 13px; line-height: 1.35; text-decoration: none; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
            .lw-coupang a:hover { color: var(--lw-text-secondary); }
            .lw-coupang strong { color: var(--lw-accent-ink); font-size: 13px; font-weight: 600; white-space: nowrap; }
            .lw-lane-empty { margin: 0; padding: 20px 16px 24px; color: var(--lw-text-muted); font-size: 13px; text-align: center; }
            .lw-lane-actions { display: flex; gap: 8px; }
            .lw-lane-actions button, .lw-lane-actions a {
                flex: 1 1 0; padding: 8px 8px; border-radius: 10px; text-align: center;
                font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; white-space: nowrap;
                border: 1px solid var(--lw-line); background: var(--lw-surface); color: var(--lw-text-secondary);
            }
            .lw-lane-actions button:hover, .lw-lane-actions a:hover { background: var(--lw-raised); color: var(--lw-text-secondary); }
            .lw-gold-ultra  { --gold-ink: var(--lw-accent-ink); --gold-line: var(--lw-accent-line); --gold-chip: var(--lw-accent-soft); }
            .lw-gold-golden { --gold-ink: var(--lw-accent-ink); --gold-line: var(--lw-accent-line); --gold-chip: var(--lw-surface); }
            .lw-gold-fair   { --gold-ink: var(--lw-positive); --gold-line: var(--lw-line); --gold-chip: var(--lw-positive-soft); }
            .lw-gold-weak   { --gold-ink: var(--lw-text-secondary); --gold-line: var(--lw-line); --gold-chip: var(--lw-raised); }

            @media (max-width: 560px) {
                .lw-gold { grid-template-columns: minmax(0, 1fr); }
                .lw-gold-head, .lw-gold-reason, .lw-gold-figure { grid-column: 1; grid-row: auto; }
                .lw-gold-figure { text-align: left; }
            }
            .lw-surface-tag {
                padding: 3px 8px; border-radius: 999px; font-size: 13px; font-weight: 600;
                border: 1px solid var(--lw-line); background: var(--lw-surface);
                color: var(--lw-text-secondary);
            }
            .lw-surface-tag.surface-naver-blog { border-color: var(--lw-line); color: var(--lw-positive); background: var(--lw-surface); }
            .lw-surface-tag.surface-wordpress { border-color: var(--lw-line); color: var(--lw-text); background: var(--lw-surface); }
            .lw-surface-tag.surface-kin { border-color: var(--lw-line); color: var(--lw-text); background: var(--lw-surface); }
            .lw-surface-tag.surface-shopping { border-color: var(--lw-accent-line); color: var(--lw-accent-ink); background: var(--lw-surface); }
            /* 시기 그룹 배지 — "언제 쓸 것"(실측 산술). 지금 적기가 가장 뜨겁다. */
            .lw-timing-tag {
                padding: 3px 8px; border-radius: 999px; font-size: 13px; font-weight: 600;
                border: 1px solid var(--lw-line); background: var(--lw-surface);
                color: var(--lw-text-secondary);
            }
            .lw-timing-tag.timing-now { border-color: var(--lw-line); color: var(--lw-positive); background: var(--lw-surface); }
            .lw-timing-tag.timing-prep { border-color: var(--lw-line); color: var(--lw-text); background: var(--lw-surface); }
            .lw-timing-tag.timing-rising { border-color: var(--lw-line-strong); color: var(--lw-negative); background: var(--lw-surface); }
            .lw-timing-tag.timing-evergreen { border-color: var(--lw-line-strong); color: var(--lw-text); background: var(--lw-surface); }
            .lw-timing-tag.timing-passed { border-color: var(--lw-accent-line); color: var(--lw-accent-ink); background: var(--lw-surface); }
            /* 애드센스 적합 배지 — 의도·CPC 실측 판정. 미판정(null)은 배지 없음. */
            .lw-adsense-tag {
                padding: 3px 8px; border-radius: 999px; font-size: 13px; font-weight: 600;
                border: 1px solid var(--lw-line); color: var(--lw-text); background: var(--lw-surface);
            }
            /* 대장간 산출물 — 제목 2종 + 문제해결 서브 */
            /* 장식은 하나만(taste: over-decoration 금지) — 좌측 골드 바 + 옅은 바탕. */
            .lw-forge {
                margin: 2px 0; padding: 12px 16px; border-radius: 14px;
                background: var(--lw-surface);
                border-left: 3px solid var(--lw-accent-line);
                display: flex; flex-direction: column; gap: 8px;
            }
            .lw-forge-title { font-size: 13px; color: var(--lw-text); line-height: 1.5; word-break: keep-all; }
            .lw-forge-title span, .lw-forge-subs span {
                display: inline-block; margin-right: 8px; padding: 1px 8px; border-radius: 6px;
                background: var(--lw-raised); color: var(--lw-text-secondary);
                font-size: 13px; font-weight: 600; vertical-align: 1px;
            }
            .lw-forge-subs { font-size: 13px; color: var(--lw-text-secondary); line-height: 1.7; }
            .lw-forge-subs em { font-style: normal; margin-right: 12px; color: var(--lw-accent-ink); }
            /* 마인드맵 — 중심 키워드에서 실측 확장어가 갈라진다.
               AI 가 찾아 실측으로 확인된 가지는 색으로 구분한다. */
            .lw-mindmap {
                margin-top: 12px;
                padding: 16px 16px;
                border: 1px solid var(--lw-line);
                border-radius: 14px;
                background: var(--lw-surface);
            }
            .lw-mindmap-core {
                display: inline-block;
                padding: 8px 16px;
                margin-bottom: 12px;
                border-radius: 999px;
                background: var(--lw-surface);
                border: 1px solid var(--lw-accent-line);
                color: var(--lw-accent-ink);
                font-weight: 600;
                font-size: 15px;
            }
            .lw-mindmap-why { margin: 0 0 12px; padding-left: 20px; }
            .lw-mindmap-why li {
                margin-bottom: 8px;
                color: var(--lw-text-secondary);
                font-size: 13px;
                line-height: 1.65;
                word-break: keep-all;
            }
            .lw-mindmap-why em {
                margin-left: 8px;
                padding: 1px 8px;
                border-radius: 4px;
                background: var(--lw-surface);
                color: var(--lw-text);
                font-size: 13px;
                font-style: normal;
                font-weight: 600;
            }
            .lw-mindmap-branches { display: flex; flex-wrap: wrap; gap: 8px; }
            /* 칩이 <a>(검색행)에서 <button>(분석기행)으로 바뀌었다 — 겉모습은 동일하게. */
            .lw-mindmap-branches a, .lw-mindmap-branches button {
                display: inline-flex;
                align-items: baseline;
                gap: 8px;
                padding: 8px 12px;
                border-radius: 999px;
                border: 1px solid var(--lw-line);
                background: var(--lw-surface);
                color: var(--lw-text);
                font-size: 13px;
                font-weight: 600;
                text-decoration: none;
                font-family: inherit;
                cursor: pointer;
            }
            .lw-mindmap-branches a span, .lw-mindmap-branches button span { font-weight: 400; opacity: .62; font-size: 13px; }
            .lw-mindmap-branches a:hover, .lw-mindmap-branches button:hover { background: var(--lw-raised); color: var(--lw-text); }
            .lw-mindmap-branches a.lw-mindmap-ai, .lw-mindmap-branches button.lw-mindmap-ai {
                border-color: var(--lw-line);
                background: var(--lw-surface);
                color: var(--lw-text);
            }

            /* 30일 트렌드 미니 차트 — 앱 그래프와 같은 실측을 막대로. */
            .lw-trend {
                margin-top: 12px;
                padding: 12px 16px;
                border: 1px solid var(--lw-line);
                border-radius: 14px;
                background: var(--lw-surface);
            }
            .lw-trend-head {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 12px;
                color: var(--lw-text);
                font-size: 13px;
                font-weight: 600;
            }
            .lw-trend-head strong { color: var(--lw-accent-ink); }
            .lw-trend-bars {
                display: flex;
                align-items: flex-end;
                gap: 2px;
                height: 96px;
                padding: 8px 4px;
                border-radius: 10px;
                background: var(--lw-raised);
            }
            .lw-trend-bars span {
                flex: 1;
                min-width: 2px;
                border-radius: 2px 2px 0 0;
                background: var(--lw-accent);
            }
            .lw-trend-note {
                margin: 8px 0 0;
                color: var(--lw-accent-ink);
                font-size: 13px;
                line-height: 1.6;
            }

            /* 자동 연쇄 분석 — 본 분석 아래 조용히 쌓인다(taste: 층위 분리). */
            .lw-mindmap-chain { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--lw-line); }
            .lw-mindmap-chain-head { margin-bottom: 8px; color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; }
            .lw-mindmap-chain-item { margin-bottom: 12px; font-size: 13px; }
            .lw-mindmap-chain-item strong { color: var(--lw-accent-ink); font-size: 13px; }
            .lw-chain-wait { margin-left: 8px; color: var(--lw-text-secondary); font-size: 13px; }
            .lw-chain-verdict { margin-left: 8px; font-style: normal; font-size: 13px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
            .lw-chain-good { background: var(--lw-surface); color: var(--lw-positive); }
            .lw-chain-bad { background: var(--lw-surface); color: var(--lw-negative); }
            .lw-chain-mixed { background: var(--lw-surface); color: var(--lw-accent-ink); }
            .lw-mindmap-chain-item ul { margin: 8px 0 0 16px; padding: 0; color: var(--lw-text-secondary); }
            .lw-mindmap-chain-item li { margin-bottom: 4px; line-height: 1.6; word-break: keep-all; }

            /* 수익 관점 결론 — 판정색으로 한눈에. */
            .lw-mindmap-money {
                margin-top: 12px;
                padding: 12px 16px;
                border-radius: 10px;
                border: 1px solid var(--lw-line);
                background: var(--lw-surface);
            }
            .lw-mindmap-money-good { border-color: var(--lw-line); }
            .lw-mindmap-money-bad { border-color: var(--lw-line-strong); }
            .lw-mindmap-money-mixed { border-color: var(--lw-accent-line); }
            /* 판정 자체를 못 한 행 — 초록도 빨강도 아니다. 중립으로 둔다. */
            .lw-mindmap-money-unknown { border-color: var(--lw-line); }
            .lw-mindmap-money-head {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 8px;
                color: var(--lw-text);
                font-size: 13px;
                font-weight: 600;
            }
            .lw-mindmap-money-good .lw-mindmap-money-head strong { color: var(--lw-positive); }
            .lw-mindmap-money-bad .lw-mindmap-money-head strong { color: var(--lw-negative); }
            .lw-mindmap-money-mixed .lw-mindmap-money-head strong { color: var(--lw-accent-ink); }
            .lw-mindmap-money-unknown .lw-mindmap-money-head strong { color: var(--lw-text-secondary); }
            .lw-mindmap-money ul { margin: 0 0 8px; padding-left: 20px; }
            .lw-mindmap-money li {
                margin-bottom: 4px;
                color: var(--lw-text-secondary);
                font-size: 13px;
                line-height: 1.6;
                word-break: keep-all;
            }
            .lw-mindmap-money p {
                margin: 0;
                padding: 8px 12px;
                border-radius: 10px;
                background: var(--lw-surface);
                border: 1px solid var(--lw-line);
                color: var(--lw-text);
                font-size: 13px;
                line-height: 1.6;
            }

            .lw-forge-ai { border-left-color: var(--lw-line); }
            .lw-forge-ai a { color: var(--lw-text); text-decoration: none; }
            .lw-forge-ai a:hover { text-decoration: underline; }
            .lw-plan-surface p { margin: 0 0 8px; color: var(--lw-text-secondary); font-size: 13px; line-height: 1.6; word-break: keep-all; }
            .lw-surface-rank { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
            .lw-surface-rank li { display: flex; gap: 8px; align-items: baseline; color: var(--lw-text-secondary); font-size: 13px; }
            .lw-surface-rank span {
                flex: 0 0 auto; min-width: 74px; padding: 2px 8px; border-radius: 7px;
                background: var(--lw-surface); color: var(--lw-text-secondary);
                font-size: 13px; font-weight: 600;
            }
            .lw-surface-note { margin-top: 8px !important; color: var(--lw-accent-ink) !important; font-size: 13px !important; }
            .lw-early-tag {
                padding: 3px 8px; border-radius: 999px;
                background: var(--lw-accent-soft);
                border: 1px solid var(--lw-accent-line);
                color: var(--lw-accent-ink); font-size: 13px; font-weight: 600;
            }
            .lw-evidence-early { color: var(--lw-accent-ink) !important; }
            .lw-plan-early {
                margin: 0 24px; padding: 12px 16px; border-radius: 14px;
                border: 1px solid var(--lw-accent-line);
                background: var(--lw-accent-soft);
            }
            .lw-plan-early strong { display: block; margin-bottom: 8px; color: var(--lw-accent-ink); font-size: 13px; font-weight: 600; }
            .lw-plan-early ul { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 8px; }
            .lw-plan-early li { color: var(--lw-accent-ink); font-size: 13px; line-height: 1.55; word-break: keep-all; }
            .lw-plan-backdrop {
                position: fixed; inset: 0; z-index: 90;
                display: flex; align-items: center; justify-content: center;
                padding: 24px;
                background: var(--lw-scrim); backdrop-filter: none;
            }
            .lw-plan-modal {
                width: min(680px, 100%); max-height: min(84vh, 860px);
                display: flex; flex-direction: column;
                border: 1px solid var(--lw-line); border-radius: 18px;
                background: var(--lw-surface); box-shadow: var(--lw-shadow-float);
                overflow: hidden;
            }
            .lw-plan-head {
                display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
                padding: 20px 24px 16px;
                border-bottom: 1px solid var(--lw-line);
            }
            .lw-plan-head h3 {
                margin: 8px 0 0; color: var(--lw-text); font-size: 20px; font-weight: 600;
                word-break: keep-all; line-height: 1.35;
            }
            .lw-plan-tier {
                display: inline-block; margin-left: 8px; padding: 3px 8px; border-radius: 999px;
                background: var(--lw-surface); color: var(--lw-positive); font-size: 13px; font-weight: 600;
            }
            .lw-plan-close {
                flex: 0 0 auto; width: 32px; height: 32px; border-radius: 10px;
                border: 1px solid var(--lw-line); background: var(--lw-surface);
                color: var(--lw-text-secondary); cursor: pointer; font-size: 13px;
            }
            .lw-plan-close:hover { background: var(--lw-raised); color: var(--lw-text); }
            .lw-plan-metrics {
                display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;
                padding: 16px 24px;
            }
            .lw-plan-metrics div { display: flex; flex-direction: column; gap: 3px; }
            .lw-plan-metrics span { color: var(--lw-text-muted); font-size: 13px; font-weight: 600; }
            .lw-plan-metrics strong { color: var(--lw-text); font-size: 17px; font-weight: 600; }
            .lw-plan-metrics .hot strong { color: var(--lw-positive); }
            .lw-plan-when {
                margin: 0 24px 4px; padding: 12px 12px; border-radius: 10px;
                background: var(--lw-surface); color: var(--lw-positive);
                font-size: 13px; font-weight: 600; word-break: keep-all;
            }
            .lw-plan-body {
                flex: 1 1 auto; overflow-y: auto;
                display: flex; flex-direction: column; gap: 20px;
                padding: 16px 24px 20px;
            }
            .lw-plan-body section strong {
                display: block; margin-bottom: 8px;
                color: var(--lw-text); font-size: 13px; font-weight: 600;
            }
            .lw-plan-body ul, .lw-plan-rivals {
                margin: 0; padding-left: 16px;
                display: flex; flex-direction: column; gap: 8px;
            }
            .lw-plan-body li {
                color: var(--lw-text-secondary); font-size: 13px; line-height: 1.62;
                word-break: keep-all;
            }
            .lw-plan-rivals li { color: var(--lw-text-secondary); font-size: 13px; }
            .lw-plan-rivals a { color: var(--lw-text-secondary); text-decoration: none; }
            .lw-plan-rivals a:hover { color: var(--lw-text); text-decoration: underline; }
            .lw-plan-rivals small { margin-left: 8px; font-size: 13px; color: var(--lw-text); }
            .lw-plan-caution strong { color: var(--lw-accent-ink); }

            /* ── 집필 브리핑 재구성(2026-08-19) — 카드와 안 겹치는 것만 남긴 창 ── */
            /* 트래픽 만드는 법 — 이 창의 첫 섹션. 초록 계열로 "실행" 성격을 준다. */
            .lw-plan-traffic { padding: 12px 16px; border-radius: 10px; background: var(--lw-surface); border: 1px solid var(--lw-line); margin-bottom: 4px; }
            .lw-plan-traffic > strong { display: block; font-size: 15px; color: var(--lw-positive); margin-bottom: 8px; }
            .lw-plan-traffic ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
            .lw-plan-traffic li { display: block; }
            .lw-plan-traffic li b { display: block; font-size: 13px; color: var(--lw-text); margin-bottom: 2px; }
            .lw-plan-traffic li span { display: block; font-size: 13px; line-height: 1.62; color: var(--lw-text-secondary); word-break: keep-all; }
            .lw-plan-why { padding: 12px 12px; border-radius: 10px; background: var(--lw-surface); border: 1px solid var(--lw-line); }
            .lw-plan-why p { margin: 0; color: var(--lw-text); font-size: 13px; line-height: 1.6; word-break: keep-all; }
            .lw-plan-why small { display: block; margin-top: 4px; font-size: 13px; color: var(--lw-text-muted); }
            .lw-plan-title-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; min-width: 0; }
            .lw-plan-title-row span { flex: none; font-size: 13px; font-weight: 600; color: var(--lw-accent-ink); border: 1px solid var(--lw-accent-line); border-radius: 6px; padding: 2px 8px; }
            .lw-plan-title-row em { font-style: normal; color: var(--lw-text); font-size: 15px; font-weight: 600; min-width: 0; }
            .lw-plan-title-row button { flex: none; margin-left: auto; padding: 4px 12px; border: 1px solid var(--lw-line); border-radius: 7px; background: none; color: var(--lw-text-secondary); font-size: 13px; cursor: pointer; }
            .lw-plan-title-row button:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-plan-subs { display: flex; flex-wrap: wrap; gap: 8px; }
            .lw-plan-subs em { font-style: normal; font-size: 13px; color: var(--lw-text-secondary); border: 1px solid var(--lw-line); border-radius: 999px; padding: 3px 12px; }
            .lw-plan-subs .lw-plan-pool { color: var(--lw-text-secondary); border-style: dashed; }

            /* 분석 탭 — 보드 회차 실측 결합 패널 */
            .lw-analyze-why { margin-top: 12px; padding: 12px 12px; border-radius: 10px; background: var(--lw-surface); border: 1px solid var(--lw-line); }
            .lw-analyze-why strong { display: block; margin-bottom: 4px; font-size: 13px; font-weight: 600; color: var(--lw-text); }
            .lw-analyze-why p { margin: 0; color: var(--lw-text); font-size: 13px; line-height: 1.6; word-break: keep-all; }
            .lw-analyze-why small { display: block; margin-top: 4px; font-size: 13px; color: var(--lw-text-muted); }
            /*
             * 분석 머리 — 지표 두 줄(왼쪽) + 추이 그래프(오른쪽).
             * 그래프를 아래에 두면 숫자를 다 지나친 뒤에야 보인다(사장님 지적).
             * 좁은 화면에서는 자연스럽게 위아래로 쌓인다.
             */
            .lw-analyze-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(260px, 1fr); gap: 16px; align-items: start; }
            .lw-metrics-2row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
            .lw-analyze-grid .lw-analyze-spark { margin: 0; padding: 12px 16px; border: 1px solid var(--lw-line); border-radius: 14px; background: var(--lw-surface); }
            @media (max-width: 980px) {
              .lw-analyze-grid { grid-template-columns: 1fr; }
              .lw-metrics-2row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }
            .lw-analyze-spark-btn { display: block; width: 100%; text-align: left; border: 1px solid var(--lw-line); cursor: pointer; position: relative; }
            .lw-analyze-spark-btn:hover { border-color: var(--lw-accent-line); }
            .lw-spark-more { position: absolute; top: 8px; right: 10px; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-snip-open { margin-left: 8px; padding: 2px 8px; border: 1px solid var(--lw-line); border-radius: 999px; background: none; color: var(--lw-text-secondary); font-size: 13px; cursor: pointer; }
            .lw-snip-open:hover { border-color: var(--lw-accent-line); }
            .lw-snip-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
            .lw-snip-tabs button { padding: 4px 16px; border: 1px solid var(--lw-line); border-radius: 999px; background: none; color: var(--lw-text-secondary); font-size: 13px; cursor: pointer; }
            .lw-snip-tabs button.on { border-color: var(--lw-accent-line); background: var(--lw-raised); color: var(--lw-text); }
            .lw-snip-modal { max-width: 780px; }
            .lw-snip-code { margin: 0 0 12px; padding: 16px; border: 1px solid var(--lw-line); border-radius: 10px; background: var(--lw-raised); color: var(--lw-text); font-size: 13px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; max-height: 52vh; overflow: auto; }
            .lw-snip-copy { padding: 8px 16px; border: 1px solid var(--lw-line); border-radius: 10px; background: var(--lw-surface); color: var(--lw-text); font-size: 13px; cursor: pointer; }
            .lw-seo-check { margin-bottom: 16px; padding: 16px; border: 1px solid var(--lw-line); border-radius: 14px; background: var(--lw-surface); }
            .lw-seo-check-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
            .lw-seo-check-head strong { font-size: 22px; }
            .lw-seo-check-head span { font-size: 13px; color: var(--lw-text-secondary); }
            .lw-seo-good { color: var(--lw-positive); } .lw-seo-mid { color: var(--lw-accent-ink); } .lw-seo-bad { color: var(--lw-negative); }
            .lw-seo-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
            .lw-seo-items li { display: flex; gap: 12px; align-items: flex-start; }
            .lw-seo-items i { flex: 0 0 auto; padding: 2px 8px; border-radius: 6px; font-size: 13px; font-style: normal; }
            .lw-seo-items li.pass i { background: var(--lw-surface); color: var(--lw-positive); }
            .lw-seo-items li.fail i { background: var(--lw-surface); color: var(--lw-negative); }
            .lw-seo-items b { display: block; font-size: 13px; color: var(--lw-text); }
            .lw-seo-items span { display: block; font-size: 13px; color: var(--lw-text-secondary); line-height: 1.6; }
            .lw-tabrank-cands { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--lw-line); }
            .lw-tabrank-cands-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; font-size: 13px; }
            .lw-tabrank-cands-head span { color: var(--lw-positive); }
            .lw-cand-hit { background: var(--lw-surface); }
            .lw-cand-rank { color: var(--lw-positive); }
            /* 통합검색 구획 배치(위→아래). AI브리핑만 보라 — 그 구획이 클릭을 가져간다. */
            .lw-serp-order { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-serp-order b { color: var(--lw-text); font-weight: 600; margin-right: 4px; }
            .lw-serp-order i { padding: 2px 8px; border-radius: 999px; border: 1px solid var(--lw-line); background: var(--lw-surface); color: var(--lw-text); font-style: normal; white-space: nowrap; }
            .lw-serp-order i.ai { border-color: var(--lw-line); background: var(--lw-surface); color: var(--lw-text-secondary); }
            .lw-serp-order em { color: var(--lw-text-muted); font-style: normal; }
            .lw-serp-order-cell { white-space: nowrap; font-size: 13px; color: var(--lw-text); }
            .lw-serp-order-cell i.ai { color: var(--lw-text-secondary); font-style: normal; }
            .lw-branch-new { margin-left: 8px; padding: 1px 8px; border: 1px solid var(--lw-line); border-radius: 999px; color: var(--lw-text-secondary); font-size: 13px; }
            /* 확장 표의 구역 제목 줄 — 층(주제 그대로 → 새 가지)이 바뀌는 자리. */
            .lw-tier-row td { padding: 12px 12px 8px; color: var(--lw-text); font-weight: 600; font-size: 13px; border-top: 1px solid var(--lw-line); background: var(--lw-surface); }
            .lw-tier-row td em { margin-left: 8px; color: var(--lw-text-secondary); font-style: normal; font-weight: 400; font-size: 13px; }
            .lw-frontal-hot { color: var(--lw-accent-ink); font-weight: 600; }
            /* 확장 키워드 자리 판정 — 색은 사실 셋(있음·좁음·없음)만 가른다. */
            .lw-slot-open { color: var(--lw-positive); font-weight: 600; }
            .lw-slot-tight { color: var(--lw-accent-ink); }
            .lw-slot-none { color: var(--lw-text-secondary); }
            .lw-slot-unknown { color: var(--lw-text-muted); }
            .lw-dig { min-height: 44px; padding: 4px 12px; border: 1px solid var(--lw-line); border-radius: 7px; background: none; color: var(--lw-text); font-size: 13px; cursor: pointer; white-space: nowrap; }
            .lw-dig:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-picks-btn, .lw-picks-topic-btn, .lw-kg-answer, .lw-kg-copy, .lw-product-actions .lw-act { min-height: 44px; }
            /* 파고든 경로 — 어디서 여기까지 왔는지 되짚어 간다. */
            .lw-analyze-trail { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-analyze-trail button { padding: 3px 8px; border: 1px solid var(--lw-line); border-radius: 999px; background: none; color: var(--lw-text); font-size: 13px; cursor: pointer; }
            .lw-analyze-pool { display: flex; flex-wrap: wrap; gap: 8px; }
            .lw-analyze-pool button { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--lw-line); border-radius: 999px; background: none; color: var(--lw-text); font-size: 13px; cursor: pointer; }
            .lw-analyze-pool button:hover { border-color: var(--lw-accent-line); color: var(--lw-text); }
            .lw-analyze-pool button span { font-size: 13px; color: var(--lw-text-secondary); }
            .lw-plan-caution li { color: var(--lw-accent-ink); }
            .lw-plan-foot {
                display: flex; gap: 8px; padding: 16px 24px 20px;
                border-top: 1px solid var(--lw-line);
            }
            .lw-plan-foot button, .lw-plan-foot a {
                flex: 1 1 0; padding: 12px 12px; border-radius: 10px; text-align: center;
                font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none;
                border: 1px solid var(--lw-line); background: var(--lw-surface); color: var(--lw-text-secondary);
            }
            .lw-plan-foot a {
                border-color: var(--lw-line); background: var(--lw-surface);
                color: var(--lw-text-secondary);
            }
            .lw-plan-foot button:hover { background: var(--lw-raised); }
            .lw-copy {
                min-width: 52px;
                background: var(--lw-surface) !important;
                border-color: var(--lw-line) !important;
            }
            .lw-timing {
                margin: 0; padding: 8px 12px;
                border-radius: 10px; background: var(--lw-surface);
                color: var(--lw-positive); font-size: 13px; font-weight: 600;
            }
            .lw-card-tags { display: flex; flex-wrap: wrap; gap: 4px; }
            .lw-tier-tag {
                padding: 3px 8px; border-radius: 999px;
                font-size: 13px; font-weight: 600; border: 1px solid;
            }
            /* 확실한 층일수록 색이 진하다. 아래 층을 위 층처럼 보이게 칠하지 않는다. */
            .lw-tier-tag.tier-a { background: var(--lw-surface); border-color: var(--lw-line); color: var(--lw-positive); }
            .lw-tier-tag.tier-b { background: var(--lw-surface); border-color: var(--lw-line); color: var(--lw-positive); }
            .lw-tier-tag.tier-c { background: var(--lw-surface); border-color: var(--lw-line); color: var(--lw-text-secondary); }
            .lw-tier-tag.tier-d { background: var(--lw-surface); border-color: var(--lw-accent-line); color: var(--lw-accent-ink); }
            .lw-evidence { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
            .lw-evidence li {
                display: flex; align-items: flex-start; gap: 8px;
                color: var(--lw-text-secondary); font-size: 13px; line-height: 1.5;
            }
            .lw-evidence li span { flex: 0 0 auto; width: 13px; color: var(--lw-positive); font-size: 13px; line-height: 1.6; }
            .lw-card-pre.locked > *:not(.lw-lock) { filter: blur(5px); opacity: .5; pointer-events: none; user-select: none; }
            .lw-lock {
                position: absolute; inset: 0;
                display: grid; place-items: center;
                border-radius: 14px; background: var(--lw-raised);
            }
            .lw-lock span { font-size: 22px; }

            /* ── 실검 틈새 · 이슈 흐름(왜 뜨나 · 몰린 말 · 다음 물결) ── */
            /* 카드 머리 '이슈 ·' 태그가 버튼이다 — 눌러서 그 이슈의 흐름으로 뛴다. */
            .lw-issue-jump { all: unset; cursor: pointer; }
            .lw-issue-jump:hover { color: var(--lw-text); }
            .lw-issue-flow-list { display: grid; gap: 12px; }
            .lw-issue-flow {
                position: relative; padding: 16px 16px;
                border: 1px solid var(--lw-line); border-radius: 14px;
                background: var(--lw-surface);
            }
            .lw-issue-flow.hot { border-color: var(--lw-accent-line); }
            .lw-issue-flow-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
            .lw-issue-flow-head h3 {
                display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
                margin: 0; color: var(--lw-text); font-size: 17px; font-weight: 600; flex: 1;
            }
            .lw-issue-flow-head a { color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; text-decoration: none; }
            .lw-issue-flow-head a:hover { color: var(--lw-text); }
            .lw-why-empty { border-left-color: var(--lw-line); background: var(--lw-surface); }
            .lw-why-empty em { color: var(--lw-text-secondary); }
            .lw-issue-flow-heads { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 3px; }
            .lw-issue-flow-heads li { display: flex; gap: 8px; align-items: baseline; font-size: 13px; color: var(--lw-text-secondary); }
            .lw-issue-flow-heads li::before { content: '·'; color: var(--lw-text-muted); }
            .lw-issue-flow-heads a { color: var(--lw-text-secondary); text-decoration: none; }
            .lw-issue-flow-heads a:hover { color: var(--lw-text); text-decoration: underline; }
            .lw-issue-flow-heads small { color: var(--lw-text-muted); font-size: 13px; white-space: nowrap; }
            .lw-issue-flow-row { position: relative; margin-top: 12px; }
            .lw-issue-flow-row > em {
                display: block; margin-bottom: 8px;
                font-style: normal; color: var(--lw-text-secondary); font-size: 13px; font-weight: 600;
            }
            .lw-issue-flow-row > em small { font-weight: 600; opacity: .7; margin-left: 4px; }
            .lw-issue-flow-chips { display: flex; flex-wrap: wrap; gap: 8px; }
            .lw-issue-flow-chips button {
                display: inline-flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
                padding: 8px 12px; border-radius: 999px;
                border: 1px solid var(--lw-line); background: var(--lw-surface);
                color: var(--lw-text); font-size: 13px; font-weight: 600; cursor: pointer;
                font-family: inherit;
            }
            .lw-issue-flow-chips button:hover { background: var(--lw-raised); color: var(--lw-text); }
            .lw-issue-flow-chips button b { font-weight: 600; color: var(--lw-accent-ink); font-size: 13px; }
            .lw-issue-flow-chips button i { font-style: normal; font-size: 13px; }
            .lw-issue-flow-chips button small { flex-basis: 100%; font-size: 13px; font-weight: 500; color: var(--lw-text-muted); }
            .lw-issue-flow-wave .lw-issue-flow-chips button { border-color: var(--lw-line); background: var(--lw-surface); color: var(--lw-text); }
            .lw-issue-flow-wave .lw-issue-flow-chips button:hover { background: var(--lw-raised); color: var(--lw-text); }
            .lw-issue-flow-wave .lw-issue-flow-chips button.on-board.niche { border-color: var(--lw-accent-line); }
            .lw-issue-flow-wave .lw-issue-flow-chips button.on-board.preemption { border-color: var(--lw-accent-line); }
            /* 비로그인은 다음 물결만 가린다 — 왜 뜨나·몰린 말은 열어 둔다. */
            .lw-issue-flow-wave.locked > *:not(.lw-lock) { filter: blur(5px); opacity: .5; pointer-events: none; user-select: none; }
            .lw-issue-flow-wave.locked .lw-lock { border-radius: 10px; }

            /* ── 내 API 키 ── */
            .lw-key-on { color: var(--lw-positive) !important; font-weight: 600; }
            .lw-key-issue { margin-left: auto; color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; }
            .lw-key-issue:hover { color: var(--lw-text-secondary); }
            .lw-key-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
            .lw-key-field span { display: block; margin-bottom: 8px; color: var(--lw-text-secondary); font-size: 13px; font-weight: 600; }
            .lw-key-field div { display: flex; gap: 8px; }
            .lw-key-field input {
                flex: 1; min-width: 0; padding: 12px 12px;
                border: 1px solid var(--lw-line); border-radius: 10px;
                background: var(--lw-raised); color: var(--lw-text); font-size: 13px;
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            }
            .lw-key-field input:focus { outline: 2px solid var(--lw-accent-line); outline-offset: 1px; }
            .lw-key-actions { display: flex; align-items: center; gap: 12px; }
            .lw-key-save {
                padding: 12px 28px; border: none; border-radius: 10px;
                background: var(--lw-btn);
                color: var(--lw-on-btn); font-size: 15px; font-weight: 600; cursor: pointer;
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
                    border-right: none; border-bottom: 1px solid var(--lw-line);
                    padding: 16px 16px;
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
                    padding: 12px 16px;
                    border: 1px solid var(--lw-line);
                    border-radius: 14px;
                    background: var(--lw-surface);
                    color: var(--lw-text); font-size: 15px; font-weight: 600;
                    cursor: pointer;
                }
                .lw-mobile-current { display: flex; align-items: center; gap: 8px; }
                .lw-mobile-current span { opacity: .9; }
                .lw-burger { font-size: 17px; color: var(--lw-text); line-height: 1; }
                .lw-mobile-menu {
                    display: flex; flex-direction: column;
                    position: absolute; left: 14px; right: 14px; top: calc(100% - 6px);
                    z-index: 60;
                    padding: 8px;
                    border: 1px solid var(--lw-line);
                    border-radius: 14px;
                    background: var(--lw-surface);
                    box-shadow: none;
                }
                .lw-mobile-item {
                    display: flex; align-items: center; gap: 12px;
                    width: 100%;
                    padding: 12px 16px;
                    border: none; border-radius: 10px;
                    background: transparent;
                    color: var(--lw-text-secondary); font-size: 15px; font-weight: 600; text-align: left;
                    cursor: pointer;
                }
                .lw-mobile-item span { width: 20px; text-align: center; opacity: .85; color: var(--tabc, currentColor); }
                .lw-mobile-item em { font-style: normal; flex: 1; }
                .lw-mobile-item b { color: var(--tabc, var(--lw-text)); font-size: 13px; }
                .lw-mobile-item.on {
                    color: var(--lw-text);
                    background: var(--lw-raised);
                }
                .lw-mobile-item:active { background: var(--lw-surface); }
                .lw-navi span { display: none; }
                .lw-navi-full { display: none; }
                .lw-navi-short { display: inline; }
                .lw-side-foot { display: none; }
                .lw-card-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            }

            /* 오늘의 네이버 추천키워드 — 실검 틈새 아래 표(2026-09-08). 테마 무관하게 currentColor 로 선을 긋는다. */
            .lw-picks { margin-top: 32px; padding-top: 20px; border-top: 1px solid color-mix(in srgb, currentColor 14%, transparent); }
            .lw-picks-head h2 { font-size: 17px; margin: 0 0 4px; letter-spacing: -0.01em; }
            .lw-picks-head p { margin: 0 0 12px; opacity: 0.72; font-size: 13px; }
            .lw-picks-tab { margin-top: 0; padding-top: 0; border-top: 0; }
            /* 실검 틈새 밑에 딸린 하위 항목(사장님 2026-09-08 "사이에 서브탭") — 들여쓰기 + 연결선, 글자 한 단계 작게 */
            .lw-navi.lw-navi-sub { margin-left: 24px; width: calc(100% - 22px); padding: 8px 12px; font-size: 13px; position: relative; }
            .lw-navi.lw-navi-sub::before { content: ''; position: absolute; left: -12px; top: -6px; bottom: 50%; width: 10px; border-left: 1px solid color-mix(in srgb, currentColor 28%, transparent); border-bottom: 1px solid color-mix(in srgb, currentColor 28%, transparent); border-bottom-left-radius: 6px; }
            .lw-navi.lw-navi-sub .lw-navi-naver { width: 16px; height: 16px; font-size: 13px; }
            .lw-navi.lw-navi-topic { padding: 8px 12px; font-size: 13px; gap: 8px; }
            .lw-navi.lw-navi-topic .lw-navi-count { margin-left: auto; font-size: 13px; font-weight: 600; opacity: 0.55; font-variant-numeric: tabular-nums; }
            .lw-navi.lw-navi-topic.on .lw-navi-count { opacity: 0.95; }
            .lw-navi-wrap { position: relative; }
            .lw-navi-wrap.has-fold .lw-navi { padding-right: 52px; }
            .lw-navi-wrap.has-fold .lw-navi em { min-width: 0; word-break: keep-all; overflow-wrap: break-word; }
            .lw-navi-wrap .lw-navi-naver { flex-shrink: 0; }
            .lw-navi-fold { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--lw-line); background: var(--lw-surface); color: var(--lw-text); cursor: pointer; padding: 0; }
            .lw-navi-fold svg { flex-shrink: 0; }
            .lw-navi-fold:hover { background: var(--lw-raised); border-color: var(--lw-line-strong); }
            .lw-navi-fold:focus-visible { outline: 2px solid var(--lw-accent-line); outline-offset: 1px; }
            .lw-navi-naver { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; background: var(--lw-positive-soft); color: var(--lw-text); font-weight: 600; font-size: 13px; line-height: 1; font-family: Arial, Helvetica, sans-serif; vertical-align: -3px; }
            .lw-picks-topics { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 16px; }
            /* 모바일 전용 주제 칩 — PC(사이드 메뉴 하위 항목 있음)에서는 숨긴다 */
            .lw-picks-topics-mobile { display: none; }
            @media (max-width: 860px) { .lw-picks-topics-mobile { display: flex; overflow-x: auto; flex-wrap: nowrap; padding-bottom: 8px; -webkit-overflow-scrolling: touch; } .lw-picks-topics-mobile .lw-picks-topic-btn { white-space: nowrap; flex: none; } }
            .lw-picks-topic-btn { font: inherit; font-size: 13px; padding: 4px 12px; border-radius: 999px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); background: transparent; color: inherit; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; }
            .lw-picks-topic-btn b { font-weight: 600; font-size: 13px; opacity: 0.6; }
            .lw-picks-topic-btn:hover { background: color-mix(in srgb, currentColor 7%, transparent); }
            .lw-picks-topic-btn.is-active { background: var(--lw-positive-soft); border-color: var(--lw-line); color: var(--lw-text); }
            .lw-picks-topic-btn.is-active b { opacity: 0.85; }
            .lw-picks-topic-btn:focus-visible { outline: 2px solid var(--lw-accent-line); outline-offset: 2px; }
            .lw-picks-panel { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 10px; background: color-mix(in srgb, currentColor 3%, transparent); }
            .lw-picks-panel-head { display: flex; gap: 12px; align-items: baseline; padding: 12px 16px 4px; }
            .lw-picks-panel-head strong { font-size: 15px; }
            .lw-picks-panel-head span { font-size: 13px; opacity: 0.65; }
            .lw-picks-season { background: var(--lw-raised); color: var(--lw-text); }
            /* 초황금 · 연관 황금 펼치기(2026-10-20) */
            .lw-picks-ultra { background: var(--lw-accent); color: var(--lw-accent-ink); font-weight: 600; }
            .lw-picks-related { margin-top: 4px; font-size: 13px; }
            .lw-picks-related summary { cursor: pointer; color: var(--lw-accent-ink); width: max-content; }
            .lw-picks-related ul { list-style: none; margin: 8px 0 2px; padding: 8px 12px; display: grid; gap: 8px; border: 1px solid color-mix(in srgb, var(--lw-accent-line) 30%, transparent); border-radius: 10px; background: var(--lw-accent-soft); min-width: 320px; }
            .lw-picks-related li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
            .lw-picks-related-num { color: var(--lw-muted, var(--lw-text-secondary)); font-variant-numeric: tabular-nums; }
            .lw-picks-grid { display: grid; gap: 8px; margin-top: 12px; }
            .lw-picks-topic { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 10px; background: color-mix(in srgb, currentColor 3%, transparent); }
            .lw-picks-topic summary { cursor: pointer; padding: 12px 16px; display: flex; gap: 12px; align-items: baseline; list-style: none; }
            .lw-picks-topic summary::-webkit-details-marker { display: none; }
            .lw-picks-topic summary:focus-visible { outline: 2px solid var(--lw-accent-line); outline-offset: 2px; border-radius: 10px; }
            .lw-picks-topic-name { font-weight: 600; }
            .lw-picks-topic summary b { font-weight: 500; opacity: 0.6; font-size: 13px; }
            .lw-picks-tease { margin-left: auto; font-size: 13px; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
            .lw-picks-scroll { overflow-x: auto; padding: 0 8px 12px; }
            .lw-picks-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 13px; }
            .lw-picks-table th, .lw-picks-table td { padding: 8px 8px; border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent); text-align: left; white-space: nowrap; }
            .lw-picks-table th { font-size: 13px; opacity: 0.65; font-weight: 500; letter-spacing: 0.02em; }
            .lw-picks-table .n { text-align: right; }
            .lw-picks-table a { color: inherit; text-decoration: none; border-bottom: 1px dotted color-mix(in srgb, currentColor 40%, transparent); }
            .lw-picks-src { opacity: 0.65; font-size: 13px; }
            .lw-picks-gold { color: var(--lw-accent-ink); font-weight: 600; }
            /* 네이버 광고 3위 입찰가(2026-09-24) — 보드 카드와 같은 파란 계열. 70원(경쟁 없음)은 흐리게. */
            /* 바로 아래 .lw-picks-chip(주황)이 같은 무게로 뒤에 선언돼 있어 두 클래스로 잡는다. */
            .lw-picks-chip.lw-picks-money { background: var(--lw-raised); color: var(--lw-text); }
            .lw-picks-bid-high { color: var(--lw-text); font-weight: 600; }
            .lw-picks-bid-none { opacity: 0.55; }
            .lw-picks-chip { display: inline-block; margin-left: 8px; font-size: 13px; padding: 1px 8px; border-radius: 999px; background: var(--lw-accent-soft); color: var(--lw-accent-ink); font-weight: 500; }
            .lw-picks-btn { font: inherit; font-size: 13px; padding: 3px 8px; border-radius: 6px; border: 1px solid color-mix(in srgb, currentColor 22%, transparent); background: transparent; color: inherit; cursor: pointer; }
            .lw-picks-btn:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
            .lw-picks-more { margin: 8px 8px 0; font-size: 13px; opacity: 0.65; }
            /* 이용권 없이 주소로 들어온 유료 탭 */
            .lw-locked { padding: 28px 24px; border: 1px dashed color-mix(in srgb, currentColor 22%, transparent); border-radius: 14px; text-align: center; max-width: 560px; margin: 24px auto; }
            .lw-locked h1 { font-size: 20px; margin: 0 0 8px; }
            .lw-locked p { margin: 0 0 16px; opacity: 0.75; font-size: 15px; line-height: 1.5; }
            /* 내 API 키 — 계정 동기화 패널 */
            .lw-keys-sync { display: flex; flex-direction: column; gap: 12px; padding: 4px 0 2px; }
            .lw-keys-sync-form { display: flex; gap: 8px; flex-wrap: wrap; }
            .lw-keys-sync-form input { flex: 1 1 280px; font: inherit; font-size: 13px; padding: 8px 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, currentColor 22%, transparent); background: color-mix(in srgb, currentColor 4%, transparent); color: inherit; }
            .lw-keys-sync-actions { display: flex; gap: 8px; flex-wrap: wrap; }
            /* 오늘의 글감 — NOW/NEXT/ALWAYS 브리프 카드 */
            /* 제휴 상품 카드 안 브리프 — 상품 그리드에서 풀폭 */
            .lw-product-brief { grid-column: 1 / -1; margin-top: 4px; }
            /* 황금키워드 카드 안 글감 브리프(사장님 2026-09-09) — 오늘의 글감과 같은 dl 스타일을 쓴다 */
            .lw-card-brief { margin-top: 12px; padding: 12px 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--lw-accent-line) 28%, transparent); background: var(--lw-accent-soft); }
            .lw-card-brief-head { display: flex; gap: 8px; align-items: baseline; }
            /* 세로 목록에서는 상단 행(근거|스파크|지표) 아래 풀폭 — 좁은 스파크 열에 있으면 글이 세로로 길게 늘어진다(사장님 2026-09-09). */
            .lw-board-list .lw-card-brief { grid-column: 1 / -1; margin-top: 0; }
            .lw-board-list .lw-card-brief .lw-briefs-dl { grid-template-columns: 110px 1fr; font-size: 13px; }
            .lw-card-brief-head span { font-size: 13px; opacity: 0.65; }
            .lw-card-brief .lw-briefs-dl { margin-top: 8px; font-size: 13px; }
            .lw-card-brief-facts { margin: 8px 0 0; font-size: 13px; opacity: 0.85; }
            .lw-card-brief-facts a { color: inherit; text-decoration: none; border-bottom: 1px dotted color-mix(in srgb, currentColor 40%, transparent); margin-left: 8px; }
            .lw-briefs-rounds { display: flex; gap: 8px; margin: 2px 0 12px; flex-wrap: wrap; }
            .lw-briefs-round { font: inherit; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 120px; padding: 8px 16px; border-radius: 10px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); background: transparent; color: inherit; cursor: pointer; text-align: left; }
            .lw-briefs-round strong { font-size: 15px; }
            .lw-briefs-round span { font-size: 13px; opacity: 0.65; }
            .lw-briefs-round:hover:not(:disabled) { background: color-mix(in srgb, currentColor 7%, transparent); }
            .lw-briefs-round.is-active { border-color: var(--lw-accent-line); background: var(--lw-accent-soft); }
            .lw-briefs-round.is-active strong { color: var(--lw-accent-ink); }
            .lw-briefs-round.is-pending { opacity: 0.45; cursor: default; }
            .lw-briefs-round:focus-visible { outline: 2px solid var(--lw-accent-line); outline-offset: 2px; }
            .lw-briefs-group { margin-top: 20px; }
            .lw-briefs-group-head { display: flex; gap: 12px; align-items: baseline; margin: 0 0 8px; }
            .lw-briefs-group-head span { font-size: 13px; opacity: 0.68; }
            .lw-briefs-timing { font-size: 13px; letter-spacing: 0.08em; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
            .lw-briefs-timing.is-now { background: var(--lw-negative-soft); color: var(--lw-negative); }
            .lw-briefs-timing.is-next { background: var(--lw-raised); color: var(--lw-text); }
            .lw-briefs-timing.is-always { background: var(--lw-positive-soft); color: var(--lw-positive); }
            .lw-briefs-card { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 10px; background: color-mix(in srgb, currentColor 3%, transparent); padding: 12px 16px; margin-bottom: 8px; }
            .lw-briefs-card-head { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: baseline; justify-content: space-between; }
            .lw-briefs-card-head h3 { margin: 0; font-size: 15px; letter-spacing: -0.01em; text-wrap: balance; }
            .lw-briefs-star { color: var(--lw-accent-ink); margin-right: 8px; }
            .lw-briefs-chips { display: flex; flex-wrap: wrap; gap: 4px; }
            .lw-briefs-chips .lw-picks-chip { margin-left: 0; }
            .lw-briefs-field { background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; opacity: 0.8; }
            .lw-briefs-type { background: var(--lw-raised); color: var(--lw-text); }
            .lw-briefs-fit.is-높음 { background: var(--lw-positive-soft); color: var(--lw-positive); }
            .lw-briefs-fit.is-보통 { background: var(--lw-accent-soft); color: var(--lw-accent-ink); }
            .lw-briefs-fit.is-낮음 { background: var(--lw-negative-soft); color: var(--lw-negative); }
            .lw-briefs-fit.is-미측정 { background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; opacity: 0.7; }
            .lw-briefs-dl { display: grid; grid-template-columns: 96px 1fr; gap: 4px 12px; margin: 12px 0 0; font-size: 13px; line-height: 1.5; }
            .lw-briefs-dl dt { font-size: 13px; opacity: 0.6; letter-spacing: 0.02em; padding-top: 2px; }
            .lw-briefs-dl dd { margin: 0; }
            /* 대안 검색어 — 핵심이 낮음/보통일 때 좁은 검색어 자리 실측 결과 */
            .lw-briefs-alt { margin: 12px 0 0; padding: 8px 12px; border-radius: 10px; font-size: 13px; line-height: 1.5; background: color-mix(in srgb, currentColor 5%, transparent); border: 1px dashed color-mix(in srgb, currentColor 20%, transparent); }
            .lw-briefs-alt.is-open { background: var(--lw-positive-soft); border-color: color-mix(in srgb, var(--lw-line) 45%, transparent); }
            .lw-briefs-alt em { font-style: normal; font-weight: 600; }
            .lw-briefs-alt.is-open em { color: var(--lw-positive); }
            .lw-briefs-alt a { color: inherit; font-weight: 600; text-decoration: none; border-bottom: 1px dotted color-mix(in srgb, currentColor 40%, transparent); }
            /* 제목 후보 — 유형이 다른 여러 개. 글을 고르는 자리라 알약이 아니라 목록으로 읽힌다. */
            .lw-briefs-titles { margin: 12px 0 0; }
            .lw-briefs-titles em { font-style: normal; font-weight: 600; opacity: .7; font-size: 13px; }
            .lw-briefs-titles ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 4px; }
            .lw-briefs-titles li { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 1.5; }
            .lw-briefs-ttype {
                flex: none; min-width: 44px; text-align: center; padding: 1px 8px; border-radius: 999px;
                font-size: 13px; font-weight: 600; opacity: .75;
                background: color-mix(in srgb, currentColor 8%, transparent);
            }
            .lw-briefs-ttarget {
                flex: none; padding: 1px 8px; border-radius: 999px;
                font-size: 13px; font-weight: 600; letter-spacing: .01em;
            }
            .lw-briefs-ttarget.is-seo { background: var(--lw-positive-soft); color: var(--lw-positive); }
            .lw-briefs-ttarget.is-aeo { background: var(--lw-raised); color: var(--lw-text); }
            .lw-briefs-ttarget.is-geo { background: var(--lw-raised); color: var(--lw-text); }
            .lw-briefs-ttext { flex: 1; }
            .lw-briefs-tcopy {
                flex: none; padding: 2px 8px; border-radius: 999px; font-size: 13px; cursor: pointer;
                color: inherit; background: transparent; border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
                opacity: 0; transition: opacity .12s;
            }
            .lw-briefs-titles li:hover .lw-briefs-tcopy, .lw-briefs-tcopy:focus-visible { opacity: 1; }
            @media (hover: none) { .lw-briefs-tcopy { opacity: 1; } }
            /* 같이 넣을 말 — 본문에 함께 담을 좁은 검색어. 말과 검색량을 붙여 한 알로 읽는다. */
            .lw-briefs-related { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0 0; font-size: 13px; }
            .lw-briefs-related em { font-style: normal; font-weight: 600; opacity: .7; margin-right: 2px; }
            .lw-briefs-related a {
                display: inline-flex; align-items: center; gap: 8px; padding: 3px 8px; border-radius: 999px;
                color: inherit; text-decoration: none; font-weight: 600;
                background: color-mix(in srgb, currentColor 6%, transparent);
                border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
            }
            .lw-briefs-related a:hover { border-color: color-mix(in srgb, var(--lw-accent-line) 55%, transparent); }
            .lw-briefs-related a b { font-weight: 500; font-variant-numeric: tabular-nums; opacity: .6; font-size: 13px; }
            /* 지금 들어갈 만한 말 — 자리를 실제로 재서 정면 글이 거의 없던 것. 초록 점 하나로만 구분한다. */
            .lw-briefs-related a.is-open { background: var(--lw-positive-soft); border-color: color-mix(in srgb, var(--lw-line) 50%, transparent); }
            .lw-briefs-related a i { font-style: normal; color: var(--lw-positive); font-size: 13px; line-height: 1; }
            .lw-briefs-related small { opacity: .55; font-size: 13px; }
            .lw-briefs-foot { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin-top: 12px; font-size: 13px; opacity: 0.85; }
            .lw-briefs-foot a { color: inherit; text-decoration: none; border-bottom: 1px dotted color-mix(in srgb, currentColor 40%, transparent); }
            .lw-briefs-facts a { margin-left: 8px; }
            .lw-briefs-foot .lw-picks-btn { margin-left: auto; }
            @media (max-width: 640px) { .lw-briefs-dl { grid-template-columns: 1fr; gap: 2px; } .lw-briefs-dl dt { margin-top: 8px; } }
            ${LEWORD_MOTION_CSS}
        `}</style>
    );
}

export default LewordStyles;
