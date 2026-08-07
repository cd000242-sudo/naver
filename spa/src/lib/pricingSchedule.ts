/**
 * 정상가 전환 시각. **관리자 콘텐츠(GAS site-content)의 공지 문구와 반드시 일치해야 한다.**
 *
 * 2026-08-01 로 박혀 있던 탓에 8/1~8/7 동안 사이트가 "9월 30일까지 이벤트가"라고
 * 안내하면서 실제로는 정상가(이벤트가의 2배)를 표시·청구했다. 이 상수를 바꿀 때는
 * site-content 의 안내 문구('N월 N일부터 정상가')를 같이 바꿔야 한다.
 */
export const PRICING_SWITCH_AT_MS = Date.UTC(2026, 8, 30, 15, 0, 0); // 2026-10-01 00:00 KST

export function isNormalPricingActive(nowMs: number = Date.now()) {
    return nowMs >= PRICING_SWITCH_AT_MS;
}

export function getScheduledAmount(eventAmount: number, normalAmount?: number, nowMs: number = Date.now()) {
    if (normalAmount && isNormalPricingActive(nowMs)) return normalAmount;
    return eventAmount;
}
