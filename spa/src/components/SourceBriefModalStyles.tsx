/**
 * 브리프 모달 스타일.
 *
 * 이 프로젝트는 CSS 클래스 파일을 쓰지 않고 인라인 <style> 로 붙이는 방식이라
 * 모달 스타일도 같은 방식을 따른다. 다만 IndexPage 의 style 블록은 이미
 * 1,500줄이 넘어서 거기에 더 얹으면 아무도 못 찾는다. 그래서 파일을 나눴다.
 */
function SourceBriefModalStyles() {
    return (
        <style>{`
            .brief-modal-backdrop {
                position: fixed;
                inset: 0;
                z-index: 1200;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: clamp(12px, 3vw, 40px);
                background: rgba(4, 7, 12, 0.74);
                backdrop-filter: blur(6px);
                animation: briefModalFade .16s ease-out;
            }

            @keyframes briefModalFade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes briefModalRise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }

            .brief-modal {
                /*
                 * 화면을 꽉 채운다 — 사장님(2026-08-19): "모달 한눈에 들어올 수 있게
                 * 크게 꽉 차게". 1080px 상자는 요약·제목·출처가 스크롤 밑으로 숨었다.
                 */
                width: min(1720px, 97vw);
                height: 94vh;
                max-height: 94vh;
                display: flex;
                flex-direction: column;
                border: 1px solid rgba(255,255,255,0.16);
                border-radius: 18px;
                background: linear-gradient(180deg, rgba(15,20,30,0.98), rgba(9,12,18,0.98));
                box-shadow: 0 40px 120px rgba(0,0,0,0.6);
                overflow: hidden;
                animation: briefModalRise .2s ease-out;
            }

            @media (prefers-reduced-motion: reduce) {
                .brief-modal-backdrop, .brief-modal { animation: none; }
            }

            .brief-modal-head {
                display: flex;
                align-items: flex-start;
                gap: 16px;
                padding: 22px 24px 18px;
                border-bottom: 1px solid rgba(255,255,255,0.09);
            }

            /* 제목 쪽이 남는 폭을 다 먹어야 닫기 버튼이 오른쪽 끝으로 간다.
               안 그러면 ✕ 가 제목 바로 옆에 붙어서 화면 한가운데 뜬다. */
            .brief-modal-head > div { flex: 1; min-width: 0; }

            .brief-modal-lane {
                display: inline-block;
                margin-bottom: 10px;
                padding: 5px 11px;
                border: 1px solid;
                border-radius: 999px;
                font-size: 12px;
                font-weight: 900;
                letter-spacing: 0.02em;
            }

            .brief-modal-head h2 {
                margin: 0;
                color: #fff;
                font-size: clamp(22px, 3vw, 32px);
                font-weight: 900;
                line-height: 1.2;
                word-break: keep-all;
            }

            .brief-modal-head p {
                margin: 8px 0 0;
                color: rgba(235,242,250,0.66);
                font-size: 14px;
                line-height: 1.6;
            }

            .brief-modal-head button {
                flex: 0 0 auto;
                width: 38px;
                height: 38px;
                border: 1px solid rgba(255,255,255,0.14);
                border-radius: 10px;
                background: rgba(255,255,255,0.05);
                color: rgba(255,255,255,0.8);
                font-size: 15px;
                cursor: pointer;
            }

            .brief-modal-head button:hover { background: rgba(255,255,255,0.11); color: #fff; }

            .brief-modal-body {
                display: grid;
                grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
                gap: 0;
                overflow: hidden;
                min-height: 0;
                flex: 1; /* 모달이 세로로 커진 만큼 본문 두 칼럼이 그 높이를 다 쓴다 */
            }

            .brief-modal-facts {
                padding: 20px 24px 24px;
                overflow-y: auto;
                min-height: 0;
            }

            .brief-modal-side {
                display: flex;
                flex-direction: column;
                gap: 22px;
                padding: 20px 24px 24px;
                border-left: 1px solid rgba(255,255,255,0.08);
                background: rgba(255,255,255,0.018);
                overflow-y: auto;
                min-height: 0;
            }

            .brief-modal-section-head {
                display: flex;
                align-items: baseline;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 12px;
            }

            .brief-modal-section-head strong { color: #fff; font-size: 15px; font-weight: 900; }
            .brief-modal-intent-group { margin-bottom: 10px; }
            .brief-modal-intent-label { display: block; font-style: normal; color: #ffd700; font-size: 12px; font-weight: 800; margin: 8px 0 6px; }
            .brief-modal-section-head small { color: rgba(235,242,250,0.5); font-size: 12px; }

            .brief-modal-topic {
                padding: 3px 9px;
                border-radius: 999px;
                background: rgba(255,255,255,0.07);
                color: rgba(235,242,250,0.82);
                font-size: 12px;
                font-weight: 800;
            }

            /* cover 로 자르면 안 된다. 대표 이미지가 사진이 아니라 공지문 캡처인
               경우가 많은데, 그때 문장 한가운데가 잘려서 읽을 수 없게 된다.
               contain 이면 여백은 생겨도 내용은 전부 남는다. */
            .brief-modal-facts img {
                display: block;
                width: 100%;
                /* 안 짤리게 — height 를 고정하지 않고 원본 비율대로 편다(사장님 2026-09-06).
                   자막·얼굴이 잘리지 않게 contain 을 넘어 아예 자르지 않는다. */
                height: auto;
                max-height: none;
                margin-bottom: 14px;
                border-radius: 12px;
                object-fit: contain;
                background: rgba(255,255,255,0.045);
            }

            /* 우측 핵심 요약 — 기사 원문 문장 목록. */
            .brief-modal-summary-list {
                display: flex; flex-direction: column; gap: 10px;
                margin: 0; padding: 0; list-style: none;
            }
            .brief-modal-summary-list li {
                position: relative; padding-left: 16px;
                color: rgba(240,246,252,0.9); font-size: 14px; line-height: 1.68; word-break: keep-all;
            }
            .brief-modal-summary-list li::before {
                content: ''; position: absolute; left: 2px; top: 9px;
                width: 5px; height: 5px; border-radius: 50%; background: rgba(255,215,0,0.7);
            }

            /* 접이식 섹션(출처·추출 키워드) — 기본 닫힘. */
            .brief-modal-fold { border: 1px solid rgba(255,255,255,0.09); border-radius: 12px; background: rgba(255,255,255,0.025); }
            .brief-modal-fold > summary {
                display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
                padding: 12px 14px; cursor: pointer; list-style: none;
            }
            .brief-modal-fold > summary::-webkit-details-marker { display: none; }
            .brief-modal-fold > summary::after { content: '▾'; margin-left: auto; color: rgba(235,242,250,0.5); font-size: 12px; }
            .brief-modal-fold[open] > summary::after { content: '▴'; }
            .brief-modal-fold > summary strong { color: #fff; font-size: 15px; font-weight: 900; }
            .brief-modal-fold > summary small { color: rgba(235,242,250,0.5); font-size: 12px; }
            .brief-modal-fold > ul,
            .brief-modal-fold > .brief-modal-chips { padding: 0 14px 14px; }
            .brief-modal-fold > ul { list-style: none; margin: 0; }

            /* 요약이 먼저 읽히도록 본문 문장보다 크고 밝게. */
            .brief-modal-summary {
                margin: 0 0 14px;
                padding: 12px 14px;
                border: 1px solid rgba(255,255,255,0.10);
                border-radius: 12px;
                background: rgba(255,255,255,0.045);
                color: #fff;
                font-size: 15px;
                font-weight: 700;
                line-height: 1.65;
                word-break: keep-all;
            }

            .brief-modal-facts ul {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin: 0;
                padding: 0;
                list-style: none;
            }

            .brief-modal-facts li {
                position: relative;
                padding-left: 18px;
                color: rgba(240,246,252,0.9);
                font-size: 15px;
                line-height: 1.72;
                word-break: keep-all;
            }

            .brief-modal-facts li::before {
                content: '';
                position: absolute;
                left: 2px;
                top: 11px;
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: rgba(255,255,255,0.4);
            }

            .brief-modal-empty p {
                margin: 0;
                color: rgba(235,242,250,0.66);
                font-size: 14px;
                line-height: 1.7;
            }

            .brief-modal-titles { display: flex; flex-direction: column; gap: 12px; margin: 0; }
            .brief-modal-titles > div {
                padding: 12px 14px;
                border: 1px solid rgba(255,255,255,0.09);
                border-radius: 12px;
                background: rgba(255,255,255,0.035);
            }
            .brief-modal-titles dt { color: rgba(235,242,250,0.52); font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }
            .brief-modal-titles dd { margin: 6px 0 0; color: #fff; font-size: 14px; font-weight: 700; line-height: 1.55; word-break: keep-all; }

            .brief-modal-links { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
            .brief-modal-links a {
                display: block;
                padding: 9px 12px;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 10px;
                color: rgba(235,242,250,0.86);
                font-size: 13px;
                font-weight: 700;
                text-decoration: none;
            }
            .brief-modal-links a:hover { background: rgba(255,255,255,0.08); color: #fff; }

            .brief-modal-chips { display: flex; flex-wrap: wrap; gap: 7px; }
            .brief-modal-chips a {
                padding: 6px 11px;
                border: 1px solid rgba(255,255,255,0.11);
                border-radius: 999px;
                color: rgba(235,242,250,0.8);
                font-size: 12.5px;
                font-weight: 700;
                text-decoration: none;
            }
            .brief-modal-chips a:hover { background: rgba(255,255,255,0.09); color: #fff; }
            .brief-modal-chips a b { margin-left: 5px; color: #ffa500; font-size: 11px; font-weight: 800; }

            /* ── 이슈 흐름(실검 틈새 회차) — 왜 뜨나 · 몰린 말 · 다음 물결 ── */
            .brief-modal-flow { margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.08); }
            .brief-modal-flow-issue {
                display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
                margin: 0 0 10px; color: #fff; font-size: 14px; font-weight: 800; word-break: keep-all;
            }
            .brief-modal-flow-issue em {
                padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14);
                color: rgba(235,242,250,0.7); font-style: normal; font-size: 11px; font-weight: 800;
            }
            .brief-modal-flow-issue em.hot { border-color: rgba(255,107,107,0.45); color: #ff8a8a; }
            .brief-modal-flow-why {
                margin: 0 0 12px; padding: 10px 12px;
                border-left: 3px solid #ffd700; border-radius: 0 10px 10px 0;
                background: rgba(255,215,0,0.06);
                color: rgba(240,246,252,0.92); font-size: 13.5px; line-height: 1.6; word-break: keep-all;
            }
            .brief-modal-flow-why b { display: inline-block; margin-right: 6px; color: #ffd700; font-size: 11.5px; font-weight: 900; }
            .brief-modal-flow-why small { display: block; margin-top: 5px; color: rgba(235,242,250,0.42); font-size: 11px; }
            .brief-modal-flow-why.muted { border-left-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.03); color: rgba(235,242,250,0.6); }
            .brief-modal-flow-why.muted b { color: rgba(235,242,250,0.55); }
            .brief-modal-flow-row { margin-bottom: 10px; }
            .brief-modal-flow-row .brief-modal-intent-label small { margin-left: 4px; font-weight: 600; opacity: 0.7; }
            .brief-modal-flow-wave { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
            .brief-modal-flow-wave li {
                padding: 8px 11px; border: 1px solid rgba(56,189,248,0.28); border-radius: 10px;
                background: rgba(56,189,248,0.07);
            }
            .brief-modal-flow-wave a { color: #bae6fd; font-size: 13px; font-weight: 800; text-decoration: none; }
            .brief-modal-flow-wave a:hover { color: #fff; text-decoration: underline; }
            .brief-modal-flow-wave a b { margin-left: 5px; color: #ffa500; font-size: 11px; }
            .brief-modal-flow-wave span { display: block; margin-top: 3px; color: rgba(235,242,250,0.58); font-size: 12px; line-height: 1.5; word-break: keep-all; }
            .brief-modal-flow-more { display: inline-block; margin-top: 6px; color: #ffd700; font-size: 12px; font-weight: 800; text-decoration: none; }
            .brief-modal-flow-more:hover { text-decoration: underline; }

            .brief-modal-foot {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 10px;
                padding: 14px 24px;
                border-top: 1px solid rgba(255,255,255,0.09);
            }

            .brief-modal-foot a {
                padding: 11px 18px;
                border-radius: 10px;
                color: #061018;
                font-size: 14px;
                font-weight: 900;
                text-decoration: none;
            }

            .brief-modal-foot button {
                padding: 11px 18px;
                border: 1px solid rgba(255,255,255,0.14);
                border-radius: 10px;
                background: transparent;
                color: rgba(235,242,250,0.8);
                font-size: 14px;
                font-weight: 800;
                cursor: pointer;
            }

            @media (max-width: 860px) {
                .brief-modal { max-height: 92vh; }
                /* 모바일에서 grid 를 유지하면 엔진이 두 행을 반반 높이로 잡고,
                   overflow: visible 인 내용이 상자 밖으로 그려져 아래 섹션 글자
                   위에 겹쳐 보였다(실기기 재현). 일반 흐름으로 쌓으면 각 섹션이
                   내용만큼 늘어나고 본문 전체가 스크롤되어 글이 전부 보인다. */
                .brief-modal-body { display: block; overflow-y: auto; }
                .brief-modal-facts, .brief-modal-side { overflow: visible; height: auto; }
                .brief-modal-side { border-left: none; border-top: 1px solid rgba(255,255,255,0.08); }
                .brief-modal-facts img { max-height: 220px; }
            }
        `}</style>
    );
}

export default SourceBriefModalStyles;
