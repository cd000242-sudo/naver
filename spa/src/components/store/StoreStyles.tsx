/**
 * 상점 스타일 — 어두운 진열장 위의 금.
 *
 * 값이 카드에서 제일 먼저 눈에 들어와야 한다. 값도 본문과 같은 Pretendard 다 —
 * 모노스페이스를 걸면 Windows 에서 Consolas 로 떨어져 촌스럽다(사장님 지적).
 * 대신 tabular-nums 로 자릿수를 맞추고 금속 그라데이션만 입힌다. 화려함을 여러 군데
 * 뿌리면 어디를 봐야 할지 몰라 지금 가격표처럼 정신사나워진다.
 */
function StoreStyles() {
    return (
        <style>{`
            .st {
                --st-line: rgba(255,255,255,.08);
                --st-line-2: rgba(255,255,255,.15);
                --st-card: #101319;
                --st-card-2: #151922;
                --st-ink: #f1f4f9;
                --st-dim: rgba(241,244,249,.66);
                --st-mute: #707888;
                --st-gold: #f0b53f;
                --st-gold-lit: #ffd88a;
                color: var(--st-ink);
                font-size: 15px;
                line-height: 1.65;
            }
            .st *, .st *::before, .st *::after { box-sizing: border-box; }

            .st-head { text-align: center; margin-bottom: 28px; }
            .st-kicker { margin: 0 0 10px; font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: #a97b1c; }
            .st-head h2 {
                margin: 0 0 10px; font-size: 34px; font-weight: 700; letter-spacing: -.032em; line-height: 1.22;
                background: linear-gradient(176deg, #ffffff 24%, #cbb18a 100%);
                -webkit-background-clip: text; background-clip: text; color: transparent;
            }
            .st-sub { margin: 0 auto; max-width: 48ch; color: var(--st-dim); font-size: 14.5px; }
            .st-rule { display: block; width: 54px; height: 1px; margin: 18px auto 0; background: linear-gradient(90deg, transparent, var(--st-gold), transparent); }

            .st-terms { display: inline-flex; margin-top: 22px; padding: 4px; border: 1px solid var(--st-line-2); border-radius: 14px; background: rgba(255,255,255,.03); gap: 3px; flex-wrap: wrap; justify-content: center; }
            .st-terms button {
                padding: 8px 17px; border: 0; border-radius: 11px; background: transparent;
                color: var(--st-dim); font-family: inherit; font-size: 13px; cursor: pointer; white-space: nowrap;
            }
            .st-terms button:hover { color: #fff; }
            .st-terms button.on { background: linear-gradient(180deg, #f7c455, var(--st-gold)); color: #171003; font-weight: 700; box-shadow: 0 3px 14px rgba(240,181,63,.3); }
            .st-terms em { font-style: normal; font-size: 11px; opacity: .78; margin-left: 5px; }

            .st-dday {
                display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center;
                margin: 0 0 20px; padding: 11px 18px; border-radius: 12px;
                border: 1px solid rgba(251,113,133,.3);
                background: linear-gradient(90deg, rgba(251,113,133,.1), rgba(240,181,63,.08));
                font-size: 13.3px; color: var(--st-dim);
            }
            .st-dday b { color: #ffb3bf; }
            .st-dday-tag { padding: 3px 10px; border-radius: 999px; background: rgba(251,113,133,.18); color: #ffb3bf; font-size: 11.5px; font-weight: 700; }
            .st-dday-count { font-weight: 700; color: #ffb3bf; }

            /*
             * auto-fit 은 넓은 화면에서 4번째 빈 트랙을 만들어 카드 셋이 왼쪽으로
             * 쏠렸다(사장님 실측 2026-08-20). 열 수를 못박는다 — 한 줄에 셋.
             */
            .st-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
            @media (max-width: 980px) { .st-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
            @media (max-width: 640px) { .st-grid { grid-template-columns: minmax(0, 1fr); } }

            .st-card {
                position: relative; border: 1px solid var(--st-line); border-radius: 17px; overflow: hidden;
                background: linear-gradient(180deg, var(--st-card-2), var(--st-card) 46%);
                display: flex; flex-direction: column;
            }
            /* 유리판에 닿는 빛 한 줄. */
            .st-card::before { content: ''; position: absolute; inset: 0 0 auto; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent); }
            .st-card.on { border-color: rgba(240,181,63,.5); box-shadow: 0 0 0 1px rgba(240,181,63,.2), 0 18px 44px rgba(0,0,0,.5); }

            .st-shot { position: relative; aspect-ratio: 16 / 9.6; overflow: hidden; background: rgba(255,255,255,.04); }
            .st-shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .st-shot-glyph { display: grid; place-items: center; width: 100%; height: 100%; font-size: 44px; opacity: .55; }
            .st-shot::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 46%, var(--st-card-2)); }
            .st-flag {
                position: absolute; left: 13px; top: 13px; z-index: 2; padding: 3px 11px; border-radius: 999px;
                font-size: 11px; font-weight: 700;
                background: linear-gradient(180deg, #f7c455, var(--st-gold)); color: #171003;
                box-shadow: 0 3px 12px rgba(240,181,63,.34);
            }
            .st-flag-web { background: rgba(52,211,153,.9); color: #06241a; box-shadow: none; }

            .st-body { padding: 8px 18px 19px; display: flex; flex-direction: column; flex: 1; }
            .st-card h3 { margin: 0 0 2px; font-size: 17px; font-weight: 700; letter-spacing: -.014em; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
            .st-evt { font-style: normal; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: rgba(251,113,133,.16); color: #ffb3bf; border: 1px solid rgba(251,113,133,.3); }
            .st-tag { margin: 0 0 10px; font-size: 12px; color: var(--st-mute); }
            .st-what { margin: 0 0 15px; font-size: 13.2px; color: var(--st-dim); flex: 1; }
            .st-incl { list-style: none; margin: 0 0 15px; padding: 0; display: flex; flex-wrap: wrap; gap: 7px; flex: 1; align-content: flex-start; }
            .st-incl li { padding: 4px 11px; border-radius: 8px; background: rgba(255,255,255,.055); font-size: 12px; color: var(--st-dim); }

            .st-price { display: flex; align-items: baseline; gap: 8px; border-top: 1px solid var(--st-line); padding-top: 13px; }
            .st-price s { color: var(--st-mute); font-size: 12.5px; }
            .st-price b {
                font-size: 25px; font-weight: 700; letter-spacing: -.03em;
                font-variant-numeric: tabular-nums;
                background: linear-gradient(176deg, #ffffff 20%, var(--st-gold-lit) 100%);
                -webkit-background-clip: text; background-clip: text; color: transparent;
            }
            .st-price i { font-style: normal; font-size: 12.5px; color: var(--st-mute); }
            /*
             * 큰 자리를 하루 값에 내줬으니, 이 줄이 실제 청구액을 말한다.
             * 작지만 흐리지 않게 — 숨기는 것이 아니라 위계를 바꾼 것이다.
             */
            .st-permo {
                margin: 5px 0 0; min-height: 17px; font-size: 12.5px;
                color: var(--st-dim); font-variant-numeric: tabular-nums;
            }
            .st-permo strong { color: var(--st-ink); font-weight: 800; }
            .st-permo s { margin-right: 5px; color: var(--st-mute); }

            .st-buy {
                margin-top: 14px; padding: 12px; border: 1px solid var(--st-line-2); border-radius: 11px;
                background: rgba(255,255,255,.03); color: var(--st-ink);
                font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
            }
            .st-buy:hover { border-color: rgba(240,181,63,.45); }
            .st-buy.on { background: linear-gradient(180deg, #f7c455, var(--st-gold)); border-color: transparent; color: #171003; box-shadow: 0 6px 20px rgba(240,181,63,.26); }

            /* 올인원은 줄 전체를 쓰고 가운데 선다(사장님 지정) — span 2 는 3열에서 왼쪽으로 쏠렸다. */
            /*
             * 올인원은 진열대의 얼굴이다 — 맨 앞, 전체 폭.
             * 안에서 왼쪽은 발행 영상, 오른쪽은 값과 담기다. 값만 있는 카드보다
             * 영상이 도는 카드가 먼저 눈에 들고, 올인원이 곧 전 제품이라
             * 전 제품 영상이 놓일 자리도 여기다(사장님 지시 2026-08-21).
             */
            .st-bundle {
                grid-column: 1 / -1;
                width: 100%; margin: 0 0 8px;
                display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
                align-items: stretch;
                border-color: rgba(240,181,63,.42);
                background:
                    radial-gradient(620px 300px at 10% 0%, rgba(240,181,63,.16), transparent 66%),
                    linear-gradient(180deg, var(--st-card-2), var(--st-card) 55%);
            }
            .st-bundle-proof {
                padding: 20px; border-right: 1px solid var(--st-line);
                display: flex; align-items: center; min-width: 0;
            }
            .st-bundle-proof > * { width: 100%; }
            .st-bundle .st-body { padding: 22px; display: flex; flex-direction: column; }
            /* 담기 버튼은 카드 바닥에 붙는다 — 두 칸 높이가 달라도 줄이 맞는다. */
            .st-bundle .st-buy { margin-top: auto; }
            @media (max-width: 860px) {
                .st-bundle { grid-template-columns: minmax(0, 1fr); }
                .st-bundle-proof { border-right: 0; border-bottom: 1px solid var(--st-line); }
            }
            .st-bundle h3 { font-size: 21px; }
            .st-bundle .st-price b { font-size: 30px; }

            .st-cart {
                margin-top: 22px; border: 1px solid rgba(240,181,63,.3); border-radius: 15px;
                background: linear-gradient(180deg, rgba(240,181,63,.09), rgba(240,181,63,.028));
                padding: 16px 20px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
            }
            .st-cart-items { display: flex; gap: 7px; flex-wrap: wrap; }
            .st-cart-items span { padding: 5px 12px; border-radius: 999px; background: rgba(255,255,255,.06); font-size: 12.5px; }
            .st-cart-items b { color: var(--st-mute); font-weight: 400; margin-left: 5px; }
            .st-cart-total { margin-left: auto; text-align: right; }
            .st-cart-total em { display: block; font-style: normal; font-size: 11.5px; color: var(--st-mute); }
            .st-cart-total strong { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
            .st-cart-go {
                padding: 13px 28px; border-radius: 11px; text-decoration: none; white-space: nowrap;
                background: linear-gradient(180deg, #f7c455, var(--st-gold)); color: #171003;
                font-size: 14.5px; font-weight: 700; box-shadow: 0 8px 26px rgba(240,181,63,.28);
            }

            /*
             * 좌측 액센트 바를 뺐다. 이미 금색을 값과 담기 버튼에 쓰고 있어
             * 여기까지 칠하면 어디를 봐야 할지 모르게 된다. 테두리 하나로 두고
             * 강조는 문장 안의 숫자에만 남긴다.
             */
            .st-cart-go { border: 0; cursor: pointer; font-family: inherit; }

            /* 증거 — 진열대 위. 값을 보기 전에 눈에 들어와야 한다. */
            .st-proof { margin: 0 0 22px; }

            /* 값을 본 뒤 남는 물음 — 진열대 아래. 조용히 있다가 필요할 때 열린다. */
            .st-notes { margin-top: 26px; padding-top: 20px; border-top: 1px solid var(--st-line); }
            .st-faq { margin-bottom: 12px; }
            .st-faq summary {
                cursor: pointer; padding: 10px 0; color: var(--st-ink);
                font-size: 13.5px; font-weight: 800;
            }
            .st-faq summary:hover { color: var(--st-gold-lit); }
            .st-faq > div { padding: 4px 0 6px; display: grid; gap: 12px; }
            .st-faq p { margin: 0; color: var(--st-dim); font-size: 13px; line-height: 1.7; }
            .st-faq b { color: var(--st-ink); font-weight: 800; }
            .st-note-line { margin: 8px 0 0; color: var(--st-mute); font-size: 12.5px; line-height: 1.6; }
            .st-note-line a { color: var(--st-gold-lit); text-decoration: none; font-weight: 700; }
            .st-note-line a:hover { text-decoration: underline; }

            /* ── 결제수단 고르기 모달 ─────────────────────── */
            .st-pay-backdrop {
                position: fixed; inset: 0; z-index: 80; display: grid; place-items: center;
                background: rgba(4, 6, 12, .68); backdrop-filter: blur(6px); padding: 18px;
            }
            .st-pay {
                width: min(440px, 100%); border-radius: 18px; padding: 22px;
                background: #10131c; border: 1px solid rgba(255,255,255,.1);
                box-shadow: 0 24px 70px rgba(0,0,0,.5);
            }
            .st-pay-head { position: relative; margin-bottom: 16px; }
            .st-pay-head b { display: block; color: #fff; font-size: 17px; font-weight: 900; }
            .st-pay-head span { color: var(--st-dim); font-size: 13px; }
            .st-pay-close {
                position: absolute; top: -4px; right: -4px; border: 0; background: none;
                color: var(--st-dim); font-size: 15px; cursor: pointer; padding: 6px;
            }
            .st-pay-close:hover { color: #fff; }
            /* 담은 내역 요약 — 얼마를 내는지가 창에서 바로 보여야 한다. */
            .st-pay-sum {
                display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
                padding: 12px 14px; border-radius: 11px; margin-bottom: 14px;
                background: rgba(255,255,255,.04);
            }
            .st-pay-sum span { color: var(--st-dim); font-size: 12.5px; }
            .st-pay-sum b { color: var(--st-gold-lit); font-size: 19px; font-weight: 900; font-variant-numeric: tabular-nums; }

            /* 라이선스를 받을 이메일 — 로그인이 없으니 이 칸이 유일한 통로다. */
            .st-pay-mail { display: block; margin-bottom: 14px; }
            .st-pay-mail > span { display: block; margin-bottom: 6px; color: var(--st-ink); font-size: 13px; font-weight: 800; }
            .st-pay-mail input {
                width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 10px;
                border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.32);
                color: var(--st-ink); font: inherit; font-size: 14px;
            }
            .st-pay-mail input:focus { outline: 2px solid rgba(240,181,63,.5); outline-offset: 1px; }
            .st-pay-mail input.warn { border-color: rgba(255,107,129,.6); }
            .st-pay-mail em {
                display: block; margin-top: 6px; font-style: normal;
                color: var(--st-dim); font-size: 11.5px; line-height: 1.55;
            }
            .st-pay-mail input.warn + em { color: #ff8fa0; }

            .st-pay-foot { margin: 14px 0 0; color: var(--st-mute); font-size: 11.5px; line-height: 1.6; }

            .st-pay-opt {
                display: flex; align-items: center; gap: 13px; width: 100%; box-sizing: border-box;
                padding: 15px 16px; margin-top: 10px; border-radius: 13px; text-align: left;
                border: 1px solid rgba(255,255,255,.11); background: rgba(255,255,255,.03);
                color: inherit; text-decoration: none; cursor: pointer; font-family: inherit;
            }
            .st-pay-opt:hover { border-color: rgba(240,181,63,.5); background: rgba(240,181,63,.06); }
            .st-pay-ico { font-size: 22px; }
            .st-pay-body { flex: 1; min-width: 0; }
            .st-pay-body b { display: block; color: #fff; font-size: 15px; font-weight: 800; }
            .st-pay-body em { font-style: normal; color: var(--st-dim); font-size: 12.5px; line-height: 1.5; }
            .st-pay-opt i { color: var(--st-gold-lit); font-style: normal; font-weight: 800; }

            .st-swap { margin-top: 13px; padding: 14px 17px; border: 1px solid rgba(240,181,63,.22); background: rgba(240,181,63,.05); border-radius: 12px; font-size: 13.6px; line-height: 1.62; color: var(--st-dim); }
            .st-swap b { color: var(--st-gold-lit); }
            .st-swap button { margin-left: 6px; padding: 0; border: 0; background: none; cursor: pointer; font-family: inherit; font-size: 13.6px; color: var(--st-gold-lit); border-bottom: 1px solid rgba(255,216,138,.45); }

            @media (max-width: 720px) {
                .st-head h2 { font-size: 26px; }
                .st-cart-total { margin-left: 0; text-align: left; }
            }
        `}</style>
    );
}

export default StoreStyles;
