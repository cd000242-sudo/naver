export type CardCheckoutMode = 'subscription' | 'once';
export function cardCheckoutMode(productId: string): CardCheckoutMode;
export function oneTimePaymentRequest(input: { origin: string; productId: string; amount: number; orderId: string; orderName: string; email: string }): {
    method: 'CARD';
    amount: { currency: 'KRW'; value: number };
    orderId: string;
    orderName: string;
    customerEmail: string;
    successUrl: string;
    failUrl: string;
    card: { useEscrow: boolean; flowMode: 'DEFAULT'; useCardPoint: boolean; useAppCardOnly: boolean };
};
