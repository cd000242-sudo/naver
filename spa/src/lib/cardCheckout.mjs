/**
 * How a store pick is paid by card (2026-11-24).
 *
 * Every card payment used to register the card (billing key) and start a renewing subscription. That refused
 * 올인원 1년 · 영구제 on the server and left no way to pay in instalments. Now:
 *   - one product for one month  -> 'subscription': the card is registered and charged every 30 days
 *   - a year, a lifetime, a cart -> 'once': a plain card payment; the buyer chooses instalments in the Toss window
 * An id that is not a store id (the old all-in-one-* ids) keeps the old card registration.
 */
const STORE_ID = /^([a-z0-9_]+(?:\+[a-z0-9_]+)*)-(monthly|yearly|lifetime)$/;

export function cardCheckoutMode(productId) {
    const match = STORE_ID.exec(String(productId || ''));
    if (!match) return 'subscription';
    return match[2] === 'monthly' && !match[1].includes('+') ? 'subscription' : 'once';
}

/**
 * The request for payment.requestPayment() of the Toss SDK (v2). No instalment plan is fixed, so the Toss window
 * lets the buyer pick one. Toss adds paymentKey, orderId and amount to successUrl; they must not be sent from here,
 * or the success page would read our copy instead of the one Toss confirmed.
 */
export function oneTimePaymentRequest({ origin, productId, amount, orderId, orderName, email }) {
    const query = new URLSearchParams({ email, productId });
    return {
        method: 'CARD',
        amount: { currency: 'KRW', value: amount },
        orderId,
        orderName: String(orderName || '').slice(0, 100),
        customerEmail: email,
        successUrl: `${origin}/success.html?${query.toString()}`,
        failUrl: `${origin}/fail.html`,
        card: { useEscrow: false, flowMode: 'DEFAULT', useCardPoint: false, useAppCardOnly: false },
    };
}
