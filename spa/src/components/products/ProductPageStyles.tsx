/**
 * 제품 페이지 공용 스타일(2026-10-07 제품 페이지 리디자인 — 시안 1 "고수보다 한 수 위, 비교로 증명").
 * 세계는 Leaders Pro 그대로: 검정 바닥 · 금색 하나(행동) · 민트(실측 숫자) · 슬레이트 판 1px 테두리 · Pretendard.
 * 같은 크기 카드 나열 · 영어 눈썹 라벨 · 그라디언트 글자 · 배경 사진은 쓰지 않는다.
 */
export default function ProductPageStyles() {
    return (
        <style>{`
.pp { --pp-ground:#0a0a0f; --pp-panel:#12121a; --pp-panel-2:#161622; --pp-line:rgba(255,255,255,.09); --pp-line-strong:rgba(255,255,255,.16);
  --pp-ink:#f4f6fb; --pp-ink-2:#aab2c2; --pp-ink-3:#7c8597; --pp-gold:#ffc61a; --pp-gold-a:#ffd700; --pp-gold-b:#ffa500; --pp-mint:#44d7b6; --pp-mint-ink:#7be9cf;
  background:var(--pp-ground); color:var(--pp-ink); font-family:'Pretendard Variable',Pretendard,system-ui,-apple-system,'Segoe UI',sans-serif; font-size:17px; line-height:1.65; -webkit-font-smoothing:antialiased; word-break:keep-all; overflow-wrap:break-word; }
/* global.css 의 'main, .page-wrapper { background: transparent !important }' 가 하늘 사진을 비치게 한다 — 시안은 검정 바닥이라 제품 페이지만 되칠한다. */
main.pp { background:var(--pp-ground) !important; }
.pp ::selection { background:rgba(255,198,26,.32); color:#fff; }
:where(.pp) a { color:inherit; text-decoration:none; }
.pp :focus-visible { outline:2px solid var(--pp-gold); outline-offset:3px; border-radius:8px; }
.pp-wrap { width:min(1360px, 100% - 64px); margin:0 auto; }
.pp-num { font-variant-numeric:tabular-nums; }

/* 첫 화면 — 왼쪽 약속 · 오른쪽 비교 판 */
/* 메뉴 줄(고정)이 위를 덮는다 — 시안처럼 비교판 칩이 메뉴 아래로 충분히 떨어지게. */
.pp-hero { padding:168px 0 56px; }
.pp-hero-grid { display:grid; grid-template-columns:minmax(0,5fr) minmax(0,7fr); gap:56px; align-items:center; }
.pp-hero h1 { font-size:clamp(40px, 4.6vw, 66px); line-height:1.16; letter-spacing:-.035em; font-weight:800; margin:0 0 26px; text-wrap:balance; }
.pp-hero h1 em { font-style:normal; color:var(--pp-gold); }
.pp-hero-sub { color:var(--pp-ink-2); font-size:19px; line-height:1.7; margin:0 0 36px; max-width:34ch; text-wrap:balance; }
.pp-actions { display:grid; gap:14px; max-width:420px; }
.pp-btn { display:flex; align-items:center; justify-content:center; gap:10px; min-height:62px; padding:0 26px; border-radius:12px; font-size:19px; font-weight:800; letter-spacing:-.01em;
  transition:transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s, background .18s, border-color .18s; }
.pp-btn svg { width:20px; height:20px; transition:transform .18s cubic-bezier(.2,.8,.2,1); }
.pp-btn:hover svg { transform:translateX(3px); }
.pp-btn-gold { background:linear-gradient(135deg, var(--pp-gold-a), var(--pp-gold-b)); color:#1d1500; box-shadow:0 10px 30px -12px rgba(255,170,0,.55); }
.pp-btn-gold:hover { transform:translateY(-1px); box-shadow:0 16px 36px -14px rgba(255,170,0,.7); }
.pp-btn-line { border:1.5px solid rgba(255,198,26,.7); color:var(--pp-gold); background:transparent; }
.pp-btn-line:hover { background:rgba(255,198,26,.07); border-color:var(--pp-gold); }

.pp-vs { position:relative; border:1px solid var(--pp-line-strong); border-radius:20px; background:rgba(18,18,26,.72); padding:38px 30px 30px; }
.pp-vs-chip { position:absolute; top:0; left:50%; transform:translate(-50%,-50%); display:flex; gap:14px; align-items:center; white-space:nowrap; padding:11px 22px; border-radius:12px;
  background:#0d0d14; border:1px solid var(--pp-line-strong); color:var(--pp-mint); font-size:16px; font-weight:600; }
.pp-vs-chip b { color:var(--pp-mint-ink); font-weight:800; }
.pp-vs-chip i { width:3px; height:3px; border-radius:50%; background:var(--pp-ink-3); }
.pp-vs-cols { display:grid; grid-template-columns:1fr 64px 1fr; align-items:stretch; }
.pp-vs-col h3 { margin:6px 0 18px; text-align:center; font-size:21px; font-weight:800; letter-spacing:-.02em; color:var(--pp-ink-2); }
.pp-vs-col.ours h3 { color:var(--pp-gold); }
.pp-vs-list { display:grid; gap:12px; }
.pp-vs-row { min-height:108px; display:flex; flex-direction:column; justify-content:center; padding:16px 20px; border-radius:12px; border:1px solid var(--pp-line); }
.pp-vs-col.theirs .pp-vs-row { background:rgba(255,255,255,.025); color:var(--pp-ink-3); font-size:17px; }
.pp-vs-col.ours .pp-vs-row { background:#0f0f17; border-color:var(--pp-line-strong); color:var(--pp-ink); font-size:18px; font-weight:700; line-height:1.5; }
.pp-vs-edge { display:flex; gap:6px; margin-top:8px; color:var(--pp-gold); font-size:14.5px; font-weight:600; line-height:1.45; }
.pp-nw { white-space:nowrap; }
.pp-vs-cols.unpaired .pp-vs-list { align-content:start; }
.pp-vs-cols.unpaired .pp-vs-row { min-height:0; }
.pp-vs-edge svg { flex:none; width:15px; height:15px; margin-top:2px; }
.pp-vs-mid { position:relative; display:flex; align-items:center; justify-content:center; }
.pp-vs-mid::before { content:''; position:absolute; top:52px; bottom:8px; left:50%; width:1px; background:linear-gradient(var(--pp-gold), rgba(255,198,26,.35)); }
.pp-vs-badge { position:relative; width:52px; height:52px; border-radius:50%; display:grid; place-items:center; background:#0d0d14; border:1.5px solid var(--pp-gold); color:var(--pp-gold); font-weight:800; font-size:17px; }
.pp-vs-foot { margin-top:16px; color:var(--pp-ink-3); font-size:13.5px; text-align:right; }

.pp-proof { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:18px; margin-top:64px; }
.pp-proof a { display:flex; align-items:center; gap:18px; padding:22px 24px; border-radius:16px; border:1px solid var(--pp-line); background:rgba(18,18,26,.6); transition:border-color .18s, background .18s; }
.pp-proof a:hover { border-color:rgba(255,198,26,.45); background:rgba(22,22,34,.8); }
.pp-proof-icon { flex:none; width:58px; height:58px; border-radius:50%; display:grid; place-items:center; border:1px solid rgba(255,198,26,.35); color:var(--pp-gold); }
.pp-proof-icon.mint { border-color:rgba(68,215,182,.4); color:var(--pp-mint); }
.pp-proof-icon svg { width:26px; height:26px; }
.pp-proof strong { display:block; font-size:19px; font-weight:800; letter-spacing:-.02em; }
.pp-proof span { color:var(--pp-ink-2); font-size:15px; }
.pp-proof .pp-chev { margin-left:auto; color:var(--pp-ink-3); width:20px; height:20px; }

/* 본문 띠 */
.pp-section { padding:120px 0 0; }
.pp-section:last-of-type { padding-bottom:120px; }
.pp-section:has(> .pp-wrap:empty) { display:none; }
.pp-h2 { font-size:clamp(30px, 3.2vw, 44px); line-height:1.22; letter-spacing:-.03em; font-weight:800; margin:0 0 16px; text-wrap:balance; }
.pp-lead { color:var(--pp-ink-2); font-size:19px; max-width:58ch; margin:0; }
.pp-band { display:grid; grid-template-columns:minmax(0,4fr) minmax(0,7fr); gap:64px; align-items:center; padding:72px 0; border-top:1px solid var(--pp-line); }
.pp-band:first-of-type { border-top:0; }
.pp-band.flip { grid-template-columns:minmax(0,7fr) minmax(0,4fr); }
.pp-band.flip .pp-band-copy { order:2; }
.pp-band h3 { font-size:clamp(26px, 2.4vw, 34px); line-height:1.25; letter-spacing:-.03em; font-weight:800; margin:0 0 16px; text-wrap:balance; }
.pp-band p { color:var(--pp-ink-2); margin:0 0 22px; max-width:46ch; }
.pp-tabs { display:flex; flex-wrap:wrap; gap:8px; margin:0; padding:0; list-style:none; }
.pp-tabs li { padding:7px 13px; border-radius:999px; border:1px solid var(--pp-line-strong); color:var(--pp-ink); font-size:14.5px; font-weight:600; background:rgba(255,255,255,.03); }
.pp-shot { margin:0; border-radius:16px; overflow:hidden; border:1px solid var(--pp-line-strong); background:#0d0d14; box-shadow:0 30px 60px -30px rgba(0,0,0,.8), 0 0 0 1px rgba(255,198,26,.04); }
.pp-shot img { display:block; width:100%; height:auto; }
.pp-shot figcaption { padding:12px 16px; border-top:1px solid var(--pp-line); color:var(--pp-ink-3); font-size:13.5px; }

/* 전 기능 목록 — 카드가 아니라 두 단 목록 */
.pp-all { columns:2; column-gap:56px; margin:40px 0 0; padding:0; list-style:none; }
.pp-all li { break-inside:avoid; display:grid; grid-template-columns:auto 1fr; gap:4px 14px; padding:16px 0; border-bottom:1px solid var(--pp-line); }
.pp-all b { font-size:17.5px; font-weight:800; letter-spacing:-.02em; }
.pp-all span { grid-column:1 / -1; color:var(--pp-ink-2); font-size:15.5px; }

/* 같은 값에 더 많이 — 가격 막대 */
.pp-compare { margin-top:44px; display:grid; gap:14px; max-width:980px; }
.pp-bar { display:grid; grid-template-columns:220px 1fr 200px; align-items:center; gap:20px; }
.pp-bar-name { font-weight:700; color:var(--pp-ink-2); }
.pp-bar-name small { display:block; margin-top:2px; color:var(--pp-ink-3); font-size:13px; font-weight:500; }
.pp-bar-track { height:14px; border-radius:999px; background:rgba(255,255,255,.05); overflow:hidden; }
.pp-bar-fill { display:block; height:100%; border-radius:999px; background:rgba(255,255,255,.22); }
.pp-bar.ours .pp-bar-name { color:var(--pp-gold); }
.pp-bar.ours .pp-bar-fill { background:linear-gradient(90deg, var(--pp-gold-a), var(--pp-gold-b)); }
.pp-bar-price { text-align:right; white-space:nowrap; font-weight:800; font-size:18px; }
.pp-bar.ours .pp-bar-price { color:var(--pp-gold); }
.pp-source { margin-top:18px; color:var(--pp-ink-3); font-size:13.5px; }

/* 가격 */
.pp-price { margin-top:44px; display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); border:1px solid var(--pp-line-strong); border-radius:20px; overflow:hidden; }
.pp-price > div { padding:34px 32px; border-left:1px solid var(--pp-line); }
.pp-price > div:first-child { border-left:0; }
.pp-price small { display:block; color:var(--pp-ink-2); font-size:15px; font-weight:700; }
.pp-price strong { display:block; margin:10px 0 6px; font-size:40px; letter-spacing:-.03em; font-weight:800; }
.pp-price strong span { font-size:18px; color:var(--pp-ink-2); font-weight:700; margin-left:4px; }
.pp-price p { margin:0; color:var(--pp-ink-3); font-size:14.5px; }
.pp-price-cta { display:flex; flex-wrap:wrap; gap:14px; margin-top:28px; }
.pp-price-cta .pp-btn { min-height:56px; font-size:17px; }

/* 후기 */
.pp-quotes { margin-top:44px; display:grid; grid-template-columns:repeat(var(--pp-qcols, 3), minmax(0,1fr)); gap:0; border-top:1px solid var(--pp-line); }
.pp-quotes blockquote { margin:0; padding:30px 28px 26px 0; border-right:1px solid var(--pp-line); }
.pp-quotes blockquote + blockquote { padding-left:28px; }
.pp-quotes blockquote:last-child { border-right:0; }
.pp-quotes p { margin:0 0 16px; color:var(--pp-ink); font-size:17px; line-height:1.7; display:-webkit-box; -webkit-line-clamp:6; -webkit-box-orient:vertical; overflow:hidden; }
.pp-quotes cite { font-style:normal; color:var(--pp-ink-3); font-size:14px; }
.pp-more { display:inline-flex; align-items:center; gap:8px; margin-top:22px; color:var(--pp-gold); font-weight:700; }
.pp-more svg { width:18px; height:18px; }

/* 자주 묻는 질문 */
.pp-faq { margin-top:36px; border-top:1px solid var(--pp-line); max-width:980px; }
.pp-faq details { border-bottom:1px solid var(--pp-line); }
.pp-faq summary { cursor:pointer; list-style:none; display:flex; justify-content:space-between; gap:20px; padding:24px 0; font-size:19px; font-weight:700; letter-spacing:-.02em; }
.pp-faq summary::-webkit-details-marker { display:none; }
.pp-faq summary svg { flex:none; width:22px; height:22px; color:var(--pp-ink-3); transition:transform .2s; }
.pp-faq details[open] summary svg { transform:rotate(45deg); color:var(--pp-gold); }
.pp-faq details p { margin:0; padding:0 0 26px; color:var(--pp-ink-2); max-width:70ch; }

/* 끝 행동 */
.pp-close { margin-top:120px; padding:72px 0 48px; border-top:1px solid var(--pp-line); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:28px; }
.pp-close h2 { margin:0; }
.pp-close .pp-actions { grid-auto-flow:column; max-width:none; }

@media (max-width: 1080px) {
  .pp-hero-grid, .pp-band, .pp-band.flip { grid-template-columns:1fr; gap:40px; }
  .pp-band.flip .pp-band-copy { order:0; }
  .pp-quotes { grid-template-columns:1fr; }
  .pp-quotes blockquote, .pp-quotes blockquote + blockquote { padding:24px 0; border-right:0; border-bottom:1px solid var(--pp-line); }
}
@media (max-width: 720px) {
  .pp { font-size:16px; }
  .pp-wrap { width:calc(100% - 32px); }
  .pp-hero { padding:104px 0 32px; }
  /* 접힌 칩(두 줄)이 판 위로 반쯤 올라온다 — 버튼과 닿지 않게 사이를 넓힌다. */
  .pp-hero-grid { row-gap:72px; }
  .pp-hero-sub { font-size:17px; }
  .pp-vs { padding:34px 14px 18px; }
  .pp-vs-chip { font-size:13px; gap:6px; padding:8px 10px; white-space:normal; flex-wrap:wrap; justify-content:center; width:max-content; max-width:calc(100% - 24px); text-align:center; }
  /* 접히면 구분점이 줄 끝에 홀로 남는다 — 점 대신 항목마다 작은 알약으로 나눈다. */
  .pp-vs-chip i { display:none; }
  .pp-vs-chip { border-color:transparent; padding:4px; } /* 상자 테두리는 빼고 바탕만 남겨 판 테두리선을 가린다 — 알약만 보이게(이중 상자 방지) */
  .pp-vs-chip > span { padding:2px 8px; border-radius:999px; background:rgba(68,215,182,.08); }
  .pp-vs-cols { grid-template-columns:1fr; gap:22px; }
  .pp-vs-mid { display:none; }
  .pp-vs-row { min-height:0; }
  .pp-proof { grid-template-columns:1fr; margin-top:40px; }
  .pp-section { padding-top:80px; }
  .pp-band { padding:48px 0; }
  .pp-all { columns:1; }
  .pp-bar { grid-template-columns:1fr auto; }
  .pp-bar-track { grid-column:1 / -1; grid-row:2; }
  .pp-price > div { border-left:0; border-top:1px solid var(--pp-line); }
  .pp-price > div:first-child { border-top:0; }
  .pp-close .pp-actions { grid-auto-flow:row; width:100%; }
}
@media (prefers-reduced-motion: reduce) { .pp * { transition:none !important; } }
`}</style>
    );
}
