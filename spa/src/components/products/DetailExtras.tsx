/**
 * Better Life Naver 상세 전용 조각 — 공용 부품(ProductBlocks)에 없는 두 가지.
 * 1) 사용자가 보내 온 네이버 통계 화면(이미 사이트에 있는 실제 인증 이미지만)
 * 2) 키워드를 고르는 짝 제품 LEWORD 안내(단품 구매 · /leword-detail)
 * 스타일은 .pp 범위 안에서만 쓴다.
 */
import { Link } from 'react-router-dom';
import { ArrowRight } from './ProductIcons';

const PROOF_SHOTS = [
    { src: '/images/proof-user/fast/KakaoTalk_20260305_004700252_07-fast.jpg', alt: '네이버 블로그 통계 일간현황 — 방문횟수 9,177', caption: '방문횟수 9,177 · 블로그 통계 화면' },
    { src: '/images/proof-user/fast/KakaoTalk_20260310_002438127-fast.jpg', alt: '네이버 블로그 글 통계 — 조회수 19,896 · 공감수 213', caption: '글 한 편 조회수 19,896' },
    { src: '/images/proof-user/fast/KakaoTalk_20260309_163736774-fast.jpg', alt: '실시간 조회수 10,003 화면을 공유한 대화', caption: '실시간 조회수 10,003' },
];

export function DetailExtrasStyles() {
    return (
        <style>{`
.pp-proofs { margin-top:72px; padding-top:40px; border-top:1px solid var(--pp-line); }
.pp-proofs h3 { margin:0 0 8px; font-size:24px; font-weight:800; letter-spacing:-.02em; }
.pp-proofs > p { margin:0; color:var(--pp-ink-3); font-size:15px; }
.pp-proofs-row { margin:28px 0 0; padding:0; list-style:none; display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:18px; }
.pp-proofs-row figure { margin:0; border-radius:14px; overflow:hidden; border:1px solid var(--pp-line-strong); background:#0d0d14; }
.pp-proofs-row img { display:block; width:100%; aspect-ratio:4 / 3; object-fit:cover; object-position:top; background:#f4f5f7; }
.pp-proofs-row figcaption { padding:12px 16px; border-top:1px solid var(--pp-line); color:var(--pp-mint); font-size:14.5px; font-weight:700; font-variant-numeric:tabular-nums; }
.pp-companion { margin-top:56px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:20px 32px; padding:28px 32px; border-radius:16px; border:1px solid var(--pp-line-strong); background:rgba(18,18,26,.6); }
.pp-companion h3 { margin:0 0 6px; font-size:21px; font-weight:800; letter-spacing:-.02em; }
.pp-companion p { margin:0; color:var(--pp-ink-2); font-size:16px; max-width:62ch; }
.pp-companion a { display:inline-flex; align-items:center; gap:8px; color:var(--pp-gold); font-weight:800; white-space:nowrap; }
.pp-companion a svg { width:18px; height:18px; }
@media (max-width: 720px) {
  .pp-proofs-row { grid-template-columns:1fr; }
  .pp-companion { padding:22px 20px; }
}
`}</style>
    );
}

/** 사용자가 보내 온 네이버 통계 — 화면 그대로, 결과를 약속하지 않는다. */
export function NaverProofShots() {
    return (
        <div className="pp-proofs">
            <h3>사용자가 보내 온 네이버 통계</h3>
            <p>받은 화면을 그대로 실었습니다. 결과는 블로그와 주제마다 다릅니다.</p>
            <ul className="pp-proofs-row" role="list">
                {PROOF_SHOTS.map((shot) => (
                    <li key={shot.src}>
                        <figure>
                            <img src={shot.src} alt={shot.alt} loading="lazy" decoding="async" />
                            <figcaption>{shot.caption}</figcaption>
                        </figure>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** 키워드를 고르는 일은 LEWORD — 따로 사는 단품이다. */
export function LewordCompanion() {
    return (
        <aside className="pp-companion" aria-label="함께 쓰면 좋은 제품">
            <div>
                <h3>무엇을 쓸지는 LEWORD가 찾습니다</h3>
                <p>Better Life Naver는 넣은 키워드로 글을 씁니다. 검색량은 붙고 글은 적은 키워드를 고르는 일은 키워드 도구 LEWORD가 맡습니다. LEWORD는 상점에서 따로 살 수 있습니다.</p>
            </div>
            <Link to="/leword-detail">LEWORD 알아보기<ArrowRight /></Link>
        </aside>
    );
}
