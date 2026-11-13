import { type } from '../../styles/tokens';

/**
 * Orbit 상세 전용 스타일 — 공용 .pp-* 위에 이 페이지만 필요한 것.
 * Orbit 실제 화면 캡처는 세로로 긴 것이 많아(1312×1888 등) 띠 높이를 잡아 위쪽부터 보여 준다.
 */
export default function OrbitExtras() {
    return (
        <style>{`
.pp-orbit .pp-shot img { max-height:640px; object-fit:cover; object-position:top center; }
.pp-orbit-pair { display:grid; grid-template-columns:minmax(0,5fr) minmax(0,7fr); gap:64px; align-items:start; margin-top:40px; padding-top:40px; border-top:1px solid var(--pp-line); }
.pp-orbit-pair h3 { margin:0 0 12px; font-size:${type.h3}px; line-height:1.35; letter-spacing:-.02em; font-weight:600; }
.pp-orbit-pair p { margin:0; color:var(--pp-ink-2); max-width:46ch; }
.pp-orbit-roles { margin:0; padding:0; list-style:none; border-top:1px solid var(--pp-line); }
.pp-orbit-roles li { display:grid; grid-template-columns:152px 1fr; gap:4px 20px; padding:16px 0; border-bottom:1px solid var(--pp-line); }
.pp-orbit-roles b { font-size:${type.body}px; font-weight:600; letter-spacing:-.01em; }
.pp-orbit-roles li.ours b { color:var(--pp-gold); }
.pp-orbit-roles span { color:var(--pp-ink-2); font-size:${type.small}px; }
@media (max-width: 1080px) {
  .pp-orbit-pair { grid-template-columns:1fr; gap:24px; }
}
@media (max-width: 720px) {
  .pp-orbit .pp-shot img { max-height:460px; }
  .pp-orbit-pair h3 { font-size:${type.lead}px; }
  .pp-orbit-roles li { grid-template-columns:1fr; }
}
`}</style>
    );
}
