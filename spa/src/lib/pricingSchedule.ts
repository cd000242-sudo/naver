export const PRICING_SWITCH_AT_MS = Date.UTC(2026, 6, 31, 15, 0, 0); // 2026-08-01 00:00 KST

export function isNormalPricingActive(nowMs: number = Date.now()) {
    return nowMs >= PRICING_SWITCH_AT_MS;
}

export function getScheduledAmount(eventAmount: number, normalAmount?: number, nowMs: number = Date.now()) {
    if (normalAmount && isNormalPricingActive(nowMs)) return normalAmount;
    return eventAmount;
}
