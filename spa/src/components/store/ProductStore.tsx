import { useEffect, useMemo, useState } from 'react';
import { isNormalPricingActive, PRICING_SWITCH_AT_MS } from '../../lib/pricingSchedule';
import {
    individualTotal, normalPriceOf, perMonth, sellableProducts, TERMS, won,
    type Product, type TermId,
} from '../../lib/productCatalog';
import StoreStyles from './StoreStyles';

/**
 * 제품 진열대 — 담고, 합계를 본다.
 *
 * 예전 가격표는 무료체험·1개월·3개월·1년·영구가 한 줄에 있었다. 한 화면에서
 * 결정을 다섯 개 요구하니 고르기를 포기하게 됐다(사장님: "너무 정신사나워").
 * 지금은 기간을 위에서 **한 번만** 정하고, 카드에서는 담기만 한다.
 *
 * 제품은 productCatalog 가 쥔다 — 여기에 제품 이름을 적지 않는다.
 */

/** 10월 1일까지 며칠 남았나. 지나면 null 이라 띠가 사라진다. */
function daysToSwitch(): number | null {
    const left = PRICING_SWITCH_AT_MS - Date.now();
    return left > 0 ? Math.ceil(left / 86400000) : null;
}

/** 담은 결과를 바깥(결제 구역)에 알려 준다. 아무것도 안 담았으면 null. */
export type StorePick = { id: string; name: string; amount: number; desc: string };

function ProductStore({ onPick }: { onPick?: (pick: StorePick | null) => void }) {
    const [term, setTerm] = useState<TermId>('yearly');
    const [cart, setCart] = useState<string[]>([]);
    const dday = daysToSwitch();
    const normalActive = isNormalPricingActive();
    const products = sellableProducts();

    const toggle = (product: Product) => {
        setCart((was) => {
            // 올인원을 담으면 개별은 비운다 — 둘 다 사는 사람은 없다.
            if (product.bundle) return was.includes(product.id) ? [] : [product.id];
            const withoutBundle = was.filter((id) => !products.find((item) => item.id === id)?.bundle);
            return withoutBundle.includes(product.id)
                ? withoutBundle.filter((id) => id !== product.id)
                : [...withoutBundle, product.id];
        });
    };

    /** 담은 값의 합. 화면에서 만드는 숫자는 이 덧셈 하나뿐이다. */
    const picked = useMemo(
        () => cart.map((id) => products.find((item) => item.id === id)).filter(Boolean) as Product[],
        [cart, products],
    );
    const total = picked.reduce((sum, product) => sum + priceOf(product, term, normalActive), 0);

    /*
     * 결제 구역은 예전부터 "고른 플랜 하나"를 받는 구조다. 여러 개를 담을 수 있게
     * 되었으니 담은 것들을 하나로 묶어 그 모양대로 넘긴다 — 결제 코드를 건드리지
     * 않는다. 값은 위의 덧셈 그대로다.
     */
    const termLabel = TERMS.find((item) => item.id === term)?.label || '';
    useEffect(() => {
        if (!onPick) return;
        onPick(picked.length === 0 ? null : {
            id: `${picked.map((product) => product.id).join('+')}-${term}`,
            name: `${picked.map((product) => product.name).join(' · ')} ${termLabel}`,
            amount: total,
            desc: `${picked.length}개 제품 · ${termLabel}`,
        });
    }, [onPick, picked, term, total, termLabel]);

    /** 개별을 둘 이상 담았을 때만 올인원과 견준다. */
    const bundle = products.find((product) => product.bundle);
    const bundlePrice = bundle ? priceOf(bundle, term, normalActive) : 0;
    const showSwap = picked.length >= 2 && !picked.some((product) => product.bundle) && bundlePrice > 0;
    const savedByBundle = total - bundlePrice;

    return (
        <div className="st">
            <StoreStyles />

            <header className="st-head">
                <p className="st-kicker">Leaders Pro</p>
                <h2>필요한 것만 고르세요</h2>
                <p className="st-sub">하나만 써도 되고 묶어서 써도 됩니다. 담아 보시면 어느 쪽이 싼지 바로 보입니다.</p>
                <span className="st-rule" aria-hidden="true" />

                <div className="st-terms" role="group" aria-label="이용 기간">
                    {TERMS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={term === item.id ? 'on' : ''}
                            onClick={() => setTerm(item.id)}
                        >
                            {item.label}{item.note && <em>{item.note}</em>}
                        </button>
                    ))}
                </div>
            </header>

            {dday !== null && (
                <div className="st-dday">
                    <span className="st-dday-tag">이벤트가</span>
                    <span>10월 1일 0시에 모든 값이 <b>두 배</b>가 됩니다</span>
                    <span className="st-dday-count">D-{dday}</span>
                </div>
            )}

            <div className="st-grid">
                {products.map((product) => {
                    const price = priceOf(product, term, normalActive);
                    if (!price) return null;
                    const inCart = cart.includes(product.id);
                    const monthly = perMonth(price, term);
                    return (
                        <article
                            key={product.id}
                            className={`st-card${product.bundle ? ' st-bundle' : ''}${inCart ? ' on' : ''}`}
                        >
                            {!product.bundle && (
                                <div className="st-shot" style={{ ['--accent' as string]: product.accent }}>
                                    <img src={product.image} alt="" loading="lazy" />
                                    {product.trial && <span className="st-flag">무료 체험 있음</span>}
                                    {product.id === 'leword' && <span className="st-flag st-flag-web">설치 없이 바로</span>}
                                </div>
                            )}

                            <div className="st-body">
                                <h3>
                                    <span aria-hidden="true" style={{ color: product.accent }}>{product.glyph}</span>
                                    {product.name}
                                    {product.bundle && <em className="st-evt">특별 이벤트가</em>}
                                </h3>
                                <p className="st-tag">{product.tagline}</p>

                                {product.bundle ? (
                                    <ul className="st-incl">
                                        {product.features.map((feature) => <li key={feature}>{feature}</li>)}
                                    </ul>
                                ) : (
                                    <p className="st-what">{product.summary}</p>
                                )}

                                <div className="st-price">
                                    {!normalActive && <s>{won(normalPriceOf(price))}</s>}
                                    <b>{won(price)}</b>
                                    <i>원{term === 'lifetime' ? '' : term === 'yearly' ? ' / 년' : ' / 월'}</i>
                                </div>
                                <p className="st-permo">
                                    {monthly && term !== 'monthly' ? `월 ${won(monthly)}원 꼴` : ' '}
                                    {product.bundle && ` · 따로 사면 ${won(individualTotal(term))}원`}
                                </p>

                                <button
                                    type="button"
                                    className={`st-buy${inCart ? ' on' : ''}`}
                                    onClick={() => toggle(product)}
                                    aria-pressed={inCart}
                                >
                                    {inCart ? '담았습니다 ✓' : product.bundle ? '올인원 담기' : '담기'}
                                </button>
                            </div>
                        </article>
                    );
                })}
            </div>

            {picked.length > 0 && (
                <>
                    <div className="st-cart">
                        <div className="st-cart-items">
                            {picked.map((product) => (
                                <span key={product.id}>{product.name}<b>{TERMS.find((item) => item.id === term)?.label}</b></span>
                            ))}
                        </div>
                        <div className="st-cart-total">
                            <em>{picked.length}개 · 부가세 별도</em>
                            <strong>{won(total)}원</strong>
                        </div>
                        <a className="st-cart-go" href={`/bank-order?items=${cart.join(',')}&term=${term}`}>결제하기</a>
                    </div>

                    {showSwap && savedByBundle > 0 && (
                        <div className="st-swap">
                            <b>올인원 {TERMS.find((item) => item.id === term)?.label}은 {won(bundlePrice)}원입니다.</b>
                            {' '}전 제품을 다 쓰면서 <b>{won(savedByBundle)}원 더 쌉니다</b>.
                            <button type="button" onClick={() => bundle && toggle(bundle)}>올인원으로 바꾸기 →</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/** 지금 받을 값. 10월 1일이 지나면 두 배가 된다 — 판단은 pricingSchedule 이 한다. */
function priceOf(product: Product, term: TermId, normalActive: boolean): number {
    const event = product.prices[term] || 0;
    if (!event) return 0;
    return normalActive ? normalPriceOf(event) : event;
}

export default ProductStore;
