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
                max-height: 340px;
                margin-bottom: 16px;
                border-radius: 12px;
                object-fit: contain;
                object-position: top center;
                background: rgba(255,255,255,0.045);
            }

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
