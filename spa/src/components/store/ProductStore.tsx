import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isNormalPricingActive, PRICING_SWITCH_AT_MS } from '../../lib/pricingSchedule';
import { fetchSiteContent } from '../../lib/siteOps';
import {
    applyStoreOverrides, individualTotal, isTaxIncludedPrice, productCardAmount, normalPriceOf, perDay, perMonth, sellableProducts, TERMS, won,
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
export type StorePick = { id: string; name: string; amount: number; amountCard: number; desc: string };

function ProductStore({ onPick, onCardPay, proof, bundleMedia, notes, trust }: {
    onPick?: (pick: StorePick | null) => void;
    /** 결제창에서 카드를 고르면 이메일과 함께 부른다 — 결제 실행은 바깥이 맡는다. */
    onCardPay?: (email: string) => void;
    /*
     * 판 하나에 다 담는다(사장님 지시 2026-08-21 "한눈에 잘 보이면 좋겠어").
     *   proof — 값을 보기 **전에** 놓는 증거(발행 영상·성과). 진열대 위.
     *   notes — 값을 본 **뒤** 남는 물음(FAQ·환불·계좌이체). 진열대 아래.
     * 둘 다 바깥에서 넣는다. 상점은 무엇을 파는지만 알면 되고, 증거와 약관은
     * 페이지의 몫이다.
     */
    proof?: ReactNode;
    /*
     * 올인원 카드 본문의 **빈 구멍**에 들어가는 것(사장님 지적 2026-08-23).
     * 기능 목록과 값 사이가 크게 비어 있었다 — 영상을 왼쪽 성과 칸에 끼워
     * 넣었더니 그 칸이 반토막 나고 오른쪽 구멍은 그대로였다. 구멍이 자리다.
     */
    bundleMedia?: ReactNode;
    notes?: ReactNode;
    /** 별점·사용자 수·환불 보장 — 값 바로 옆에 선다. 결정하는 순간에 필요한 재료다. */
    trust?: ReactNode;
}) {
    const [term, setTerm] = useState<TermId>('monthly');
    const [cart, setCart] = useState<string[]>([]);
    const dday = daysToSwitch();
    const normalActive = isNormalPricingActive();
    /*
     * 어드민 [상점 제품] 저장값을 얹는다. 오기 전까지는 카탈로그 기본값으로
     * 그린다 — 저장값이 없는 보통의 경우 화면이 한 번도 안 바뀐다.
     */
    const [catalog, setCatalog] = useState<Product[]>(() => applyStoreOverrides(null));
    useEffect(() => {
        let cancelled = false;
        fetchSiteContent().then((content) => {
            if (!cancelled && content?.store?.products) setCatalog(applyStoreOverrides(content.store.products));
        }).catch(() => { /* 못 읽으면 기본값 그대로 */ });
        return () => { cancelled = true; };
    }, []);
    const products = useMemo(() => sellableProducts(catalog), [catalog]);

    const toggle = (product: Product) => {
        setCart((was) => {
            // 올인원을 담으면 개별은 비운다 — 둘 다 사는 사람은 없다.
            if (product.bundle) return was.includes(product.id) ? [] : [product.id];
            if (term === 'monthly' && product.id === 'leword') return was.includes(product.id) ? [] : ['leword'];
            const withoutBundle = was.filter((id) => !products.find((item) => item.id === id)?.bundle && !(term === 'monthly' && id === 'leword'));
            return withoutBundle.includes(product.id)
                ? withoutBundle.filter((id) => id !== product.id)
                : [...withoutBundle, product.id];
        });
    };

    /** 담은 값의 합. 화면에서 만드는 숫자는 이 덧셈 하나뿐이다. */
    // 고른 기간에 가격이 없는 제품은 뺀다(2026-10-07 LEWORD 영구제 판매 중지) — 담은 채 기간을 바꾸면 카드는 숨는데 주문에 남아 서버가 거절했다.
    const picked = useMemo(
        () => (cart.map((id) => products.find((item) => item.id === id)).filter(Boolean) as Product[]).filter((product) => priceOf(product, term, normalActive) > 0),
        [cart, products, term, normalActive],
    );
    const total = picked.reduce((sum, product) => sum + priceOf(product, term, normalActive), 0);

    const totalCard = picked.reduce((sum, product) => sum + productCardAmount(product, term, priceOf(product, term, normalActive)), 0);
    const includesTaxIncludedPrice = picked.some((product) => isTaxIncludedPrice(product, term));
    const bankTaxNote = picked.every((product) => isTaxIncludedPrice(product, term)) ? '부가세 포함' : includesTaxIncludedPrice ? 'LEWORD 월 구독 부가세 포함 · 나머지 별도' : '부가세 별도';

    /*
     * 결제 구역은 예전부터 "고른 플랜 하나"를 받는 구조다. 여러 개를 담을 수 있게
     * 되었으니 담은 것들을 하나로 묶어 그 모양대로 넘긴다 — 결제 코드를 건드리지
     * 않는다. 값은 위의 덧셈 그대로다.
     */
    const termLabel = TERMS.find((item) => item.id === term)?.label || '';
    /*
     * 결제수단 고르기 모달(사장님 지시 2026-08-21). 예전엔 [결제하기]가 곧장
     * 계좌이체 페이지로 갔다 — 카드로 내고 싶은 사람이 길을 잃는다.
     * 카드/계좌이체 둘 다 보여주고 고르게 한다.
     */
    const [payOpen, setPayOpen] = useState(false);
    /** 라이선스를 받을 이메일 — 로그인이 없으니 이 주소가 유일한 통로다. */
    const [email, setEmail] = useState('');
    const [mailWarn, setMailWarn] = useState(false);
    const [recurringConsent, setRecurringConsent] = useState(false);
    const lewordSubscription = term === 'monthly' && picked.length === 1 && picked[0].id === 'leword';
    useEffect(() => { setRecurringConsent(false); }, [term, totalCard, cart.join(',')]);
    useEffect(() => {
        if (!payOpen) return;
        const previousFocus = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.querySelector<HTMLInputElement>('.st-pay-mail input')?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); setPayOpen(false); }
            if (event.key !== 'Tab') return;
            const focusable = document.querySelector('.st-pay')?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)');
            if (!focusable?.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
            previousFocus?.focus();
        };
    }, [payOpen]);
    useEffect(() => {
        if (!onPick) return;
        onPick(picked.length === 0 ? null : {
            id: `${picked.map((product) => product.id).join('+')}-${term}`,
            name: `${picked.map((product) => product.name).join(' · ')} ${termLabel}`,
            amount: total,
            amountCard: totalCard,
            desc: `${picked.length}개 제품 · ${termLabel}`,
        });
    }, [onPick, picked, term, total, totalCard, termLabel]);

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
                            onClick={() => {
                                setTerm(item.id);
                                if (item.id === 'monthly') setCart((was) => was.includes('leword') ? ['leword'] : was);
                            }}
                        >
                            {item.label}{item.note && <em>{item.note}</em>}
                        </button>
                    ))}
                </div>
            </header>

            {dday !== null && (
                <div className="st-dday">
                    <span className="st-dday-tag">이벤트가</span>
                    {/* 폭·시점을 못 박지 않는다(사장님 2026-09-06) — "두 배" 안내 폐기. */}
                    <span>10월 1일부터 <b>금액이 인상</b>될 예정입니다</span>
                    <span className="st-dday-count">D-{dday}</span>
                </div>
            )}

            <div className="st-grid">
                {/*
                 * 올인원이 맨 앞이다(사장님 지시 2026-08-21 "올인원을 3개 제품 위에").
                 * 전 제품을 묶어 파는 자리라 진열대의 초점이 여기여야 하고,
                 * 발행 영상도 이 카드 안에서 돈다 — 올인원이 곧 전 제품이라
                 * 전 제품 영상이 놓일 자리가 여기다. 목록 순서(어드민)는 그대로
                 * 두고 그리는 순서만 바꾼다.
                 */}
                {[...products].sort((a, b) => Number(Boolean(b.bundle)) - Number(Boolean(a.bundle))).map((product) => {
                    const price = priceOf(product, term, normalActive);
                    if (!price) return null;
                    const inCart = cart.includes(product.id);
                    const monthly = perMonth(price, term);
                    return (
                        <article
                            key={product.id}
                            className={`st-card${product.bundle ? ' st-bundle' : ''}${inCart ? ' on' : ''}`}
                        >
                            {product.bundle && proof && (
                                <div className="st-bundle-proof">{proof}</div>
                            )}
                            {!product.bundle && (
                                <div className="st-shot" style={{ ['--accent' as string]: product.accent }}>
                                    {/* 어드민이 새로 만든 제품은 그림이 없다 — 기호로 채운다. 빈 src 는 깨진 그림이 된다. */}
                                    {product.image
                                        ? <img src={product.image} alt="" loading="lazy" />
                                        : <span className="st-shot-glyph" style={{ color: product.accent }} aria-hidden="true">{product.glyph}</span>}
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

                                {product.bundle && bundleMedia && (
                                    <div className="st-bundle-media">{bundleMedia}</div>
                                )}

                                {/*
                                  * 큰 자리는 **하루 값**이다(사장님 지시 2026-08-21
                                  * "하루에 얼마 꼴이 더 크게 보여야 싸게 보이지").
                                  * 30만·40만이 먼저 눈에 박히면 비싸 보인다 — 사람이 체감하는
                                  * 단위는 하루치다. 실제 청구액을 숨기지는 않는다: 바로 아래
                                  * 줄에 연·월 금액을 그대로 적는다.
                                  * 영구제는 기간이 없어 하루로 나눌 수 없으므로 총액이 큰 자리다.
                                  */}
                                {/*
                                  * 올인원은 값·신뢰지표·담기를 **한 덩어리로** 묶는다(2026-08-23).
                                  * 따로 두면 격자에서 각자 다른 줄에 놓여, 왼쪽의 긴
                                  * 영상 줄에 끌려가 사이가 크게 벌어졌다(화면으로 확인).
                                  */}
                                <div className={product.bundle ? 'st-bundle-side' : 'st-plain-side'}>
                                {(() => {
                                    const daily = perDay(price, term);
                                    const termUnit = term === 'lifetime' ? '' : term === 'yearly' ? '년' : '월';
                                    if (isTaxIncludedPrice(product, term)) {
                                        return <>
                                            <div className="st-price"><b>{won(price)}</b><i>원 / 월</i></div>
                                            <p className="st-permo">부가세 포함 · 카드 30일마다 자동결제</p>
                                            <p style={{ fontSize: 12, color: '#f0b53f', margin: '0 0 8px' }}>LEWORD는 개별 구독으로 결제합니다.</p>
                                            <p style={{ fontSize: 12, lineHeight: 1.6, color: '#cbd5e1', margin: '0 0 14px' }}>계좌이체는 30일 이용 후 수동 갱신 · 자동출금 없음</p>
                                        </>;
                                    }
                                    if (!daily) {
                                        return (
                                            <>
                                                <div className="st-price">
                                                    {!normalActive && normalPriceOf(price) > price && <s>{won(normalPriceOf(price))}</s>}
                                                    <b>{won(price)}</b>
                                                    <i>원{termUnit ? ` / ${termUnit}` : ''}</i>
                                                </div>
                                                <p className="st-permo">
                                                    {product.bundle ? `따로 사면 ${won(individualTotal(term, catalog))}원` : ' '}
                                                </p>
                                            </>
                                        );
                                    }
                                    return (
                                        <>
                                            <div className="st-price">
                                                <b>{won(daily)}</b>
                                                <i>원 / 하루</i>
                                            </div>
                                            <p className="st-permo">
                                                {!normalActive && normalPriceOf(price) > price && <s>{won(normalPriceOf(price))}</s>}
                                                <strong>{won(price)}원</strong>
                                                {termUnit ? ` / ${termUnit}` : ''}
                                                {term !== 'monthly' && monthly ? ` · 월 ${won(monthly)}원` : ''}
                                                {product.bundle && ` · 따로 사면 ${won(individualTotal(term, catalog))}원`}
                                            </p>
                                        </>
                                    );
                                })()}

                                {product.bundle && trust}

                                <button
                                    type="button"
                                    className={`st-buy${inCart ? ' on' : ''}`}
                                    onClick={() => toggle(product)}
                                    aria-pressed={inCart}
                                >
                                    {inCart ? '담았습니다 ✓' : product.bundle ? 'All in one 담기' : '담기'}
                                </button>
                                </div>
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
                            <em>{picked.length}개 · {bankTaxNote}</em>
                            <strong>{won(total)}원</strong>
                        </div>
                        <button type="button" className="st-cart-go" onClick={() => setPayOpen(true)}>결제하기</button>
                    </div>

                    {payOpen && typeof document !== 'undefined' && createPortal(
                        /*
                         * 담기부터 결제까지 **한 자리에서** 끝낸다(사장님 지적 2026-08-21
                         * "가격표랑 아래 이메일이랑 합쳐야 되지 않니").
                         *
                         * 예전에는 [결제하기] → 이 창에서 수단 고르기 → **아래로 스크롤** →
                         * 이메일 입력 → 다시 결제였다. 로그인이 없는 구조라 이메일이
                         * 라이선스를 받는 유일한 통로인데, 그게 흐름 밖에 떨어져 있었다.
                         * 창 안에서 담은 내역·이메일·수단을 다 보이게 두고 여기서 끝낸다.
                         */
                        <div className="st st-pay-backdrop" role="dialog" aria-modal="true" aria-label="결제" onClick={() => setPayOpen(false)}>
                            <div className="st-pay" onClick={(event) => event.stopPropagation()}>
                                <div className="st-pay-head">
                                    <b>결제</b>
                                    <span>{picked.map((product) => product.name).join(' · ')} {termLabel}</span>
                                    <button type="button" className="st-pay-close" aria-label="닫기" onClick={() => setPayOpen(false)}>✕</button>
                                </div>

                                <div className="st-pay-sum">
                                    <span>{picked.length}개 제품 · {bankTaxNote}</span>
                                    <b>{won(total)}원</b>
                                </div>

                                <label className="st-pay-mail">
                                    <span>라이선스를 받을 이메일</span>
                                    <input
                                        type="email"
                                        value={email}
                                        placeholder="example@email.com"
                                        onChange={(event) => { setEmail(event.target.value); setMailWarn(false); }}
                                        className={mailWarn ? 'warn' : ''}
                                        autoComplete="email"
                                    />
                                    <em>{mailWarn ? '이메일을 정확히 적어 주세요 — 여기로만 코드가 갑니다.' : '결제가 끝나면 이 주소로 라이선스 코드가 갑니다. 따로 로그인이 없어 이 주소가 유일한 통로입니다.'}</em>
                                </label>

                                {lewordSubscription && <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '16px 0', padding: 14, borderRadius: 10, background: 'rgba(240,181,63,0.08)', color: '#e2e8f0', fontSize: 13, lineHeight: 1.7 }}>
                                    <input type="checkbox" checked={recurringConsent} onChange={(event) => setRecurringConsent(event.target.checked)} style={{ marginTop: 5, flexShrink: 0 }} />
                                    <span>첫 결제는 즉시 {won(totalCard)}원(부가세 포함), 이후 해지 전까지 30일마다 같은 금액으로 자동결제되는 것에 동의합니다. 갱신일 전 <a href="/lookup" style={{ color: '#f0b53f' }}>구독 조회·해지</a>에서 해지할 수 있습니다.</span>
                                </label>}
                                <button
                                    type="button"
                                    className="st-pay-opt"
                                    disabled={lewordSubscription && !recurringConsent}
                                    style={lewordSubscription && !recurringConsent ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                                    onClick={() => {
                                        if (lewordSubscription && !recurringConsent) return;
                                        const mail = email.trim();
                                        if (!mail || !mail.includes('@')) { setMailWarn(true); return; }
                                        setPayOpen(false);
                                        onCardPay?.(mail);
                                    }}
                                >
                                    <span className="st-pay-ico" aria-hidden="true">💳</span>
                                    <span className="st-pay-body">
                                        <b>카드결제</b>
                                        <em>{won(totalCard)}원 (부가세 포함){term === 'monthly' ? ' · 30일마다 자동결제' : ' · 토스페이먼츠 보안 결제'}</em>
                                    </span>
                                    <i aria-hidden="true">→</i>
                                </button>
                                <a
                                    className="st-pay-opt"
                                    href={`/bank-order?items=${cart.join(',')}&term=${term}${email.trim() ? `&email=${encodeURIComponent(email.trim())}` : ''}`}
                                >
                                    <span className="st-pay-ico" aria-hidden="true">🏦</span>
                                    <span className="st-pay-body">
                                        <b>계좌이체</b>
                                        <em>{won(total)}원 · {term === 'monthly' ? '30일 이용 · 수동 갱신 · 자동출금 없음' : '본인 이름으로 입금 · 확인 후 코드 안내'}</em>
                                    </span>
                                    <i aria-hidden="true">→</i>
                                </a>

                                {term === 'monthly' && <p style={{ margin: '14px 0', color: '#cbd5e1', fontSize: 13, lineHeight: 1.7 }}>카드 구독은 해지 전까지 30일마다 갱신됩니다. 다음 결제를 원하지 않으면 갱신일 전에 구독을 해지해 주세요. 계좌이체는 매 회차 직접 입금하고 확인 후 새 이용권을 받습니다.</p>}
                                <p className="st-pay-foot">
                                    코드 발급 후 7일 이내 미사용이면 전액 환불됩니다 · 결제 진행 시 이용약관과 개인정보처리방침에 동의하는 것으로 봅니다.
                                </p>
                            </div>
                        </div>,
                        document.body,
                    )}
                    {showSwap && savedByBundle > 0 && (
                        <div className="st-swap">
                            <b>All in one {TERMS.find((item) => item.id === term)?.label}은 {won(bundlePrice)}원입니다.</b>
                            {' '}전 제품을 다 쓰면서 <b>{won(savedByBundle)}원 더 쌉니다</b>.
                            <button type="button" onClick={() => bundle && toggle(bundle)}>All in one 으로 바꾸기 →</button>
                        </div>
                    )}
                </>
            )}

            {notes && <div className="st-notes">{notes}</div>}
        </div>
    );
}

/** 지금 받을 값. 자동 인상은 껐다(배수 1) — 배수를 되살리면 여기서 전환된다. */
function priceOf(product: Product, term: TermId, normalActive: boolean): number {
    const event = product.prices[term] || 0;
    if (!event) return 0;
    return normalActive ? normalPriceOf(event) : event;
}

export default ProductStore;
