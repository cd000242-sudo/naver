/**
 * 제품 정보(/products) 전용 부품 — 공용 부품(ProductBlocks)의 띠 · 가격 모양을 그대로 쓰고,
 * 이 페이지에만 필요한 것 두 가지를 더한다.
 *   1) ProductBand — 공용 FeatureBand 와 같은 띠에 '화면 바꿔 보기' 단추 + 실제 영상 작은 창(관리자 media 영상).
 *   2) PriceTable — 네 제품의 기간별 값을 한 표로(상점과 같은 카탈로그 + 관리자 저장값).
 * 스타일은 .pp 범위 안에만 둔다.
 */
import { useState, type ReactNode } from 'react';
import { TERMS, isTaxIncludedPrice, won, type Product } from '../../lib/productCatalog';

export function ProductsExtrasStyles() {
    return (
        <style>{`
.pp-pb .pp-pb-frame { position:relative; }
.pp-pb .pp-pb-frame > picture { display:block; }
.pp-pb .pp-pb-frame > picture > img { display:block; width:100%; aspect-ratio:4 / 3; object-fit:cover; object-position:top center; background:#0d0d14; }
.pp-pb .pp-pb-frame > picture > img.left { object-position:left top; }
.pp-pb-clip { position:absolute; right:14px; bottom:14px; width:30%; max-width:230px; display:block; border-radius:10px; border:1px solid var(--pp-line-strong); background:#000;
  box-shadow:0 18px 40px -16px rgba(0,0,0,.95); }
.pp-switch { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 24px; }
.pp-switch button { font:inherit; cursor:pointer; min-height:40px; padding:7px 14px; border-radius:999px; border:1px solid var(--pp-line-strong); background:rgba(255,255,255,.03);
  color:var(--pp-ink-2); font-size:14.5px; font-weight:600; transition:color .18s, border-color .18s, background .18s; }
.pp-switch button:hover { color:var(--pp-ink); border-color:rgba(255,198,26,.45); }
.pp-switch button[aria-pressed="true"] { color:var(--pp-gold); border-color:var(--pp-gold); background:rgba(255,198,26,.08); }
.pp-band p.pp-pb-price { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 18px; margin:0 0 24px; color:var(--pp-ink-2); font-size:16px; }
.pp-pb-price b { color:var(--pp-ink); font-weight:800; }
.pp-pb-price small { margin-left:6px; color:var(--pp-ink-3); font-size:13px; font-weight:600; }
.pp-pb-price .pp-pb-vat { color:var(--pp-ink-3); font-size:13.5px; }
.pp-pb-links { display:flex; flex-wrap:wrap; align-items:center; gap:10px 22px; }
.pp-pb-links .pp-btn { min-height:52px; padding:0 22px; font-size:16.5px; }
.pp-pb-link { display:inline-flex; align-items:center; gap:6px; color:var(--pp-gold); font-weight:700; font-size:16px; }
.pp-pb-link svg { width:17px; height:17px; transition:transform .18s cubic-bezier(.2,.8,.2,1); }
.pp-pb-link:hover svg { transform:translateX(3px); }

.pp-plist { margin:44px 0 0; padding:0; list-style:none; border:1px solid var(--pp-line-strong); border-radius:20px; overflow:hidden; }
.pp-plist li { display:grid; grid-template-columns:minmax(0,1.4fr) repeat(3, minmax(0,1fr)); gap:16px; align-items:center; padding:24px 30px; border-top:1px solid var(--pp-line); }
.pp-plist li:first-child { border-top:0; }
.pp-plist li.pp-plist-head { padding:14px 30px; background:rgba(255,255,255,.02); color:var(--pp-ink-3); font-size:14px; font-weight:700; }
.pp-plist li.ours { background:rgba(255,198,26,.045); }
.pp-plist-name b { display:block; font-size:19px; font-weight:800; letter-spacing:-.02em; }
.pp-plist li.ours .pp-plist-name b { color:var(--pp-gold); }
.pp-plist-name span { color:var(--pp-ink-3); font-size:14.5px; }
.pp-plist-cell { font-size:19px; font-weight:800; letter-spacing:-.01em; }
.pp-plist-cell small { display:block; margin-top:2px; color:var(--pp-ink-3); font-size:13px; font-weight:600; }
.pp-plist-cell.none { color:var(--pp-ink-3); font-size:15px; font-weight:600; }
.pp-plist-term { display:none; }

@media (max-width: 720px) {
  .pp-switch button { min-height:44px; }
  .pp-pb-clip { right:10px; bottom:10px; width:34%; }
  .pp-plist li { grid-template-columns:repeat(3, minmax(0,1fr)); gap:12px 10px; padding:20px 18px; align-items:start; }
  .pp-plist li.pp-plist-head { display:none; }
  .pp-plist-name { grid-column:1 / -1; }
  .pp-plist-term { display:block; color:var(--pp-ink-3); font-size:12.5px; font-weight:600; }
  .pp-plist-cell { font-size:15.5px; }
  .pp-plist-cell.none { font-size:14px; }
}
`}</style>
    );
}

/** align 'left' — 넓은 화면을 4:3 칸에 넣을 때 왼쪽 위(로고 · 메뉴)부터 보이게.
 *  mobileSrc — 폰(≤720px)에서 쓸 확대 잘라낸 화면. 전체 화면을 폰 폭으로 줄이면 글씨가 무늬가 된다. */
export type BandShot = { label: string; src: string; alt: string; caption: string; align?: 'left'; mobileSrc?: string };
export type BandClip = { src: string; alt: string };

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 제품 띠 — 글 한쪽 · 실제 화면 한쪽. 화면 이름을 누르면 같은 자리에서 실제 화면이 바뀐다. */
export function ProductBand({ id, title, body, shots, clip, flip, children }: {
    id: string; title: string; body: string; shots: BandShot[]; clip?: BandClip | null; flip?: boolean; children?: ReactNode;
}) {
    const [index, setIndex] = useState(0);
    const [reduceMotion] = useState(prefersReducedMotion);
    const shot = shots[index] || shots[0];
    return (
        <div id={id} tabIndex={-1} className={`pp-band pp-pb${flip ? ' flip' : ''}`}>
            <div className="pp-band-copy">
                <h3>{title}</h3>
                <p>{body}</p>
                {shots.length > 1 && (
                    <div className="pp-switch" role="group" aria-label="실제 화면 바꿔 보기">
                        {shots.map((item, i) => (
                            <button key={item.src} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}>{item.label}</button>
                        ))}
                    </div>
                )}
                {children}
            </div>
            <figure className="pp-shot">
                <div className="pp-pb-frame">
                    <picture key={shot.src}>
                        {shot.mobileSrc && <source media="(max-width: 720px)" srcSet={shot.mobileSrc} />}
                        <img className={shot.align === 'left' ? 'left' : undefined} src={shot.src} alt={shot.alt} loading="lazy" decoding="async" />
                    </picture>
                    {clip && (
                        <video className="pp-pb-clip" src={clip.src} aria-label={clip.alt} muted loop playsInline preload="metadata"
                            autoPlay={!reduceMotion} controls={reduceMotion} />
                    )}
                </div>
                <figcaption>{clip ? `${shot.caption} · 작은 창은 실제 영상` : shot.caption}</figcaption>
            </figure>
        </div>
    );
}

/** 띠 안 한 줄 가격 — 팔지 않는 기간은 빼고, 부가세 포함인 칸만 따로 표시한다. */
export function BandPrice({ product }: { product: Product }) {
    const cells = TERMS.map((term) => ({ term, price: product.prices[term.id] || 0 })).filter((cell) => cell.price > 0);
    if (cells.length === 0) return null;
    const anyIncluded = cells.some(({ term }) => isTaxIncludedPrice(product, term.id));
    return (
        <p className="pp-pb-price pp-num">
            {cells.map(({ term, price }) => (
                <span key={term.id}>
                    {term.label} <b>{won(price)}원</b>
                    {isTaxIncludedPrice(product, term.id) && <small>부가세 포함</small>}
                </span>
            ))}
            <span className="pp-pb-vat">{anyIncluded ? '그 밖은 부가세 별도' : '모두 부가세 별도'}</span>
        </p>
    );
}

/** 네 제품 기간별 값 한 표 — 상점과 같은 순서 · 같은 값. 없는 기간은 '없음'. */
export function PriceTable({ products }: { products: Product[] }) {
    return (
        <ul className="pp-plist pp-num" role="list">
            <li className="pp-plist-head" aria-hidden>
                <span>제품</span>
                {TERMS.map((term) => <span key={term.id}>{term.label}</span>)}
            </li>
            {products.map((product) => (
                <li key={product.id} className={product.bundle ? 'ours' : undefined}>
                    <span className="pp-plist-name"><b>{product.name}</b><span>{product.tagline}</span></span>
                    {TERMS.map((term) => {
                        const price = product.prices[term.id] || 0;
                        if (price <= 0) {
                            return <span key={term.id} className="pp-plist-cell none"><span className="pp-plist-term">{term.label}</span>없음</span>;
                        }
                        return (
                            <span key={term.id} className="pp-plist-cell">
                                <span className="pp-plist-term">{term.label}</span>
                                {won(price)}원
                                {isTaxIncludedPrice(product, term.id) && <small>부가세 포함{product.id === 'leword' && term.id === 'monthly' ? ' · 30일 자동결제' : ''}</small>}
                            </span>
                        );
                    })}
                </li>
            ))}
        </ul>
    );
}
