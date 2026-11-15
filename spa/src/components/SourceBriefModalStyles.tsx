import { light, lightRadius, motion, type } from '../styles/tokens';

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
                background: rgba(20, 24, 28, 0.45);
                animation: briefModalFade ${motion.fast} ${motion.ease};
            }

            @keyframes briefModalFade { from { opacity: 0 } to { opacity: 1 } }

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
                border: 1px solid ${light.line};
                border-radius: ${lightRadius.panel}px;
                background: ${light.surface};
                color: ${light.text};
                box-shadow: ${light.shadowFloat};
                overflow: hidden;
            }

            @media (prefers-reduced-motion: reduce) {
                .brief-modal-backdrop { animation: none; }
            }

            .brief-modal a:focus-visible,
            .brief-modal button:focus-visible,
            .brief-modal summary:focus-visible { outline: 2px solid ${light.accentInk}; outline-offset: 2px; }

            .brief-modal-head {
                display: flex;
                align-items: flex-start;
                gap: 16px;
                padding: 24px 24px 20px;
                border-bottom: 1px solid ${light.line};
            }

            /* 제목 쪽이 남는 폭을 다 먹어야 닫기 버튼이 오른쪽 끝으로 간다.
               안 그러면 닫기 단추가 제목 바로 옆에 붙어서 화면 한가운데 뜬다. */
            .brief-modal-head > div { flex: 1; min-width: 0; }

            /* Source lane: one small dot keeps the lane color, the text stays neutral. */
            .brief-modal-lane {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                color: ${light.textSecondary};
                font-size: ${type.meta}px;
                font-weight: 500;
                font-variant-numeric: tabular-nums;
            }
            .brief-modal-lane i { width: 8px; height: 8px; border-radius: 50%; flex: none; }

            .brief-modal-head h2 {
                margin: 0;
                color: ${light.text};
                font-size: clamp(${type.h3}px, 3vw, ${type.h2}px);
                font-weight: 600;
                line-height: 1.25;
                word-break: keep-all;
            }

            .brief-modal-head p {
                margin: 8px 0 0;
                max-width: 80ch;
                color: ${light.textSecondary};
                font-size: ${type.body}px;
                line-height: 1.6;
            }

            .brief-modal-head button {
                flex: 0 0 auto;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 44px;
                height: 44px;
                border: 1px solid ${light.line};
                border-radius: ${lightRadius.control}px;
                background: ${light.surface};
                color: ${light.text};
                cursor: pointer;
            }

            .brief-modal-head button:hover { background: ${light.raised}; }

            .brief-modal-body {
                display: grid;
                grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
                gap: 0;
                overflow: hidden;
                min-height: 0;
                flex: 1; /* 모달이 세로로 커진 만큼 본문 두 칼럼이 그 높이를 다 쓴다 */
            }

            .brief-modal-facts {
                padding: 24px;
                overflow-y: auto;
                min-height: 0;
            }

            .brief-modal-side {
                display: flex;
                flex-direction: column;
                gap: 24px;
                padding: 24px;
                border-left: 1px solid ${light.line};
                background: ${light.raised};
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

            .brief-modal-section-head strong { color: ${light.text}; font-size: ${type.body}px; font-weight: 600; }
            .brief-modal-intent-group { margin-bottom: 12px; }
            .brief-modal-intent-label { display: block; font-style: normal; color: ${light.textSecondary}; font-size: ${type.meta}px; font-weight: 600; margin: 8px 0; }
            .brief-modal-section-head small { color: ${light.textMuted}; font-size: ${type.meta}px; }

            /* cover 로 자르면 안 된다. 대표 이미지가 사진이 아니라 공지문 캡처인
               경우가 많은데, 그때 문장 한가운데가 잘려서 읽을 수 없게 된다. */
            .brief-modal-facts img {
                display: block;
                width: 100%;
                /* 안 짤리게 — height 를 고정하지 않고 원본 비율대로 편다(사장님 2026-09-06). */
                height: auto;
                max-height: none;
                margin-bottom: 16px;
                border-radius: ${lightRadius.card}px;
                object-fit: contain;
                background: ${light.raised};
            }

            /* 우측 핵심 요약 — 기사 원문 문장 목록. */
            .brief-modal-summary-list {
                display: flex; flex-direction: column; gap: 12px;
                margin: 0; padding: 0; list-style: none;
            }
            .brief-modal-summary-list li {
                position: relative; padding-left: 16px;
                color: ${light.text}; font-size: ${type.body}px; line-height: 1.7; word-break: keep-all;
            }
            .brief-modal-summary-list li::before {
                content: ''; position: absolute; left: 0; top: 12px;
                width: 6px; height: 6px; border-radius: 50%; background: ${light.lineStrong};
            }

            /* 접이식 섹션(출처·추출 키워드) — 기본 닫힘. */
            .brief-modal-fold { border: 1px solid ${light.line}; border-radius: ${lightRadius.card}px; background: ${light.surface}; }
            .brief-modal-fold > summary {
                display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
                min-height: 44px; padding: 12px 16px; cursor: pointer; list-style: none;
            }
            .brief-modal-fold > summary::-webkit-details-marker { display: none; }
            .brief-modal-fold > summary::after { content: '▾'; margin-left: auto; color: ${light.textMuted}; font-size: ${type.meta}px; }
            .brief-modal-fold[open] > summary::after { content: '▴'; }
            .brief-modal-fold > summary strong { color: ${light.text}; font-size: ${type.body}px; font-weight: 600; }
            .brief-modal-fold > summary small { color: ${light.textMuted}; font-size: ${type.meta}px; }
            .brief-modal-fold > ul,
            .brief-modal-fold > .brief-modal-chips { padding: 0 16px 16px; }
            .brief-modal-fold > ul { list-style: none; margin: 0; }

            /* 요약이 먼저 읽히도록 사진 위에 한 덩어리로. */
            .brief-modal-summary {
                margin: 0 0 16px;
                padding: 16px;
                border-radius: ${lightRadius.card}px;
                background: ${light.raised};
                color: ${light.text};
                font-size: ${type.body}px;
                font-weight: 500;
                line-height: 1.65;
                word-break: keep-all;
            }

            .brief-modal-empty p {
                margin: 0;
                color: ${light.textSecondary};
                font-size: ${type.body}px;
                line-height: 1.7;
            }

            .brief-modal-side .app-brief-titles { margin-top: 0; }

            .brief-modal-links { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
            .brief-modal-links a {
                display: flex;
                align-items: center;
                min-height: 44px;
                padding: 8px 16px;
                border: 1px solid ${light.line};
                border-radius: ${lightRadius.control}px;
                color: ${light.text};
                font-size: ${type.small}px;
                font-weight: 500;
                text-decoration: none;
            }
            .brief-modal-links a:hover { background: ${light.raised}; }
            .brief-modal-links a small { margin-left: 8px; color: ${light.textMuted}; font-size: ${type.meta}px; font-weight: 400; }
            .brief-modal-links p { margin: 4px 0 0; color: ${light.textSecondary}; font-size: ${type.small}px; line-height: 1.6; }

            .brief-modal-chips { display: flex; flex-wrap: wrap; gap: 8px; }
            .brief-modal-chips a {
                display: inline-flex;
                align-items: center;
                min-height: 36px;
                padding: 4px 12px;
                border: 1px solid ${light.line};
                border-radius: ${lightRadius.pill}px;
                background: ${light.surface};
                color: ${light.text};
                font-size: ${type.small}px;
                text-decoration: none;
            }
            .brief-modal-chips a:hover { border-color: ${light.lineStrong}; background: ${light.raised}; }
            .brief-modal-chips a b,
            .brief-modal-flow-wave a b { margin-left: 8px; color: ${light.textMuted}; font-size: ${type.meta}px; font-weight: 500; font-variant-numeric: tabular-nums; }

            /* ── 이슈 흐름(실검 틈새 회차) — 왜 뜨나 · 몰린 말 · 다음 물결 ── */
            .brief-modal-flow { padding-bottom: 24px; border-bottom: 1px solid ${light.line}; }
            .brief-modal-flow-issue {
                display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
                margin: 0 0 12px; color: ${light.text}; font-size: ${type.body}px; font-weight: 600; word-break: keep-all;
            }
            .brief-modal-flow-issue em {
                padding: 2px 8px; border-radius: ${lightRadius.pill}px; border: 1px solid ${light.line}; background: ${light.surface};
                color: ${light.textSecondary}; font-style: normal; font-size: ${type.meta}px; font-weight: 500;
            }
            .brief-modal-flow-issue em.hot { border-color: ${light.accentLine}; background: ${light.accentSoft}; color: ${light.accentInk}; }
            .brief-modal-flow-why {
                margin: 0 0 12px; padding: 12px 16px;
                border-left: 3px solid ${light.accent}; border-radius: 0 ${lightRadius.control}px ${lightRadius.control}px 0;
                background: ${light.accentSoft};
                color: ${light.text}; font-size: ${type.body}px; line-height: 1.6; word-break: keep-all;
            }
            .brief-modal-flow-why b { display: inline-block; margin-right: 8px; color: ${light.accentInk}; font-size: ${type.meta}px; font-weight: 600; }
            .brief-modal-flow-why small { display: block; margin-top: 4px; color: ${light.textMuted}; font-size: ${type.meta}px; }
            .brief-modal-flow-why.muted { border-left-color: ${light.lineStrong}; background: ${light.surface}; color: ${light.textSecondary}; }
            .brief-modal-flow-why.muted b { color: ${light.textMuted}; }
            .brief-modal-flow-row { margin-bottom: 12px; }
            .brief-modal-flow-row .brief-modal-intent-label small { margin-left: 4px; color: ${light.textMuted}; font-weight: 400; }
            .brief-modal-flow-wave { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
            .brief-modal-flow-wave li {
                padding: 12px 16px; border: 1px solid ${light.line}; border-radius: ${lightRadius.control}px;
                background: ${light.surface};
            }
            .brief-modal-flow-wave a { color: ${light.text}; font-size: ${type.small}px; font-weight: 600; text-decoration: none; }
            .brief-modal-flow-wave a:hover { text-decoration: underline; }
            .brief-modal-flow-wave span { display: block; margin-top: 4px; color: ${light.textSecondary}; font-size: ${type.small}px; line-height: 1.5; word-break: keep-all; }
            .brief-modal-flow-more { display: inline-block; margin-top: 8px; color: ${light.accentInk}; font-size: ${type.small}px; font-weight: 600; text-decoration: none; }
            .brief-modal-flow-more:hover { text-decoration: underline; }

            .brief-modal-foot {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                flex-wrap: wrap;
                gap: 8px;
                padding: 16px 24px;
                border-top: 1px solid ${light.line};
            }

            /* One gold button (the article), the rest are quiet outline buttons. */
            .brief-modal-foot a,
            .brief-modal-foot button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 44px;
                padding: 0 20px;
                border: 1px solid ${light.line};
                border-radius: ${lightRadius.control}px;
                background: ${light.surface};
                color: ${light.text};
                font: inherit;
                font-size: ${type.small}px;
                font-weight: 600;
                text-decoration: none;
                cursor: pointer;
            }
            .brief-modal-foot a:hover,
            .brief-modal-foot button:hover { background: ${light.raised}; }
            .brief-modal-foot a.primary,
            .brief-modal-foot a.primary:hover { border-color: ${light.accent}; background: ${light.accent}; color: ${light.onAccent}; }

            @media (max-width: 860px) {
                .brief-modal { max-height: 92vh; }
                /* 모바일에서 grid 를 유지하면 엔진이 두 행을 반반 높이로 잡고,
                   overflow: visible 인 내용이 상자 밖으로 그려져 아래 섹션 글자
                   위에 겹쳐 보였다(실기기 재현). 일반 흐름으로 쌓으면 각 섹션이
                   내용만큼 늘어나고 본문 전체가 스크롤되어 글이 전부 보인다. */
                .brief-modal-body { display: block; overflow-y: auto; }
                .brief-modal-facts, .brief-modal-side { overflow: visible; height: auto; }
                .brief-modal-facts, .brief-modal-side, .brief-modal-head { padding: 16px; }
                .brief-modal-side { border-left: none; border-top: 1px solid ${light.line}; }
                .brief-modal-facts img { max-height: 220px; }
                .brief-modal-chips a { min-height: 44px; }
                .brief-modal-foot { padding: 12px 16px; }
                .brief-modal-foot a, .brief-modal-foot button { flex: 1 1 auto; }
            }
        `}</style>
    );
}

export default SourceBriefModalStyles;
