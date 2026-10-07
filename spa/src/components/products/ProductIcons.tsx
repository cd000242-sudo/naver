/** 제품 페이지 아이콘 — 한 가지 선 굵기(1.8)로 직접 그린 SVG. 이모지 · 기호를 아이콘 대신 쓰지 않는다. */
type IconProps = { className?: string };
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const ArrowRight = ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" className={className} {...base}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const ArrowUp = ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" className={className} {...base}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const Chevron = ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" className={className} {...base}><path d="M9 6l6 6-6 6" /></svg>
);
export const Plus = ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" className={className} {...base}><path d="M12 5v14M5 12h14" /></svg>
);
/** 구매 후기 — 말풍선 안 별 */
export const ReviewIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" className={className} {...base}><path d="M4 5h16v11H9l-5 4z" /><path d="M12 7.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" /></svg>
);
/** 수익 인증 — 오르는 막대 */
export const IncomeIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" className={className} {...base}><path d="M5 19v-4M10 19v-7M15 19v-5M20 19V9" /><path d="M4 10l5-4 4 3 7-5" /></svg>
);
/** 웹 · PC 앱 — 모니터와 폰 */
export const DevicesIcon = ({ className }: IconProps) => (
    <svg viewBox="0 0 24 24" className={className} {...base}><rect x="2.5" y="4" width="14" height="10" rx="1.5" /><path d="M7 18h5M9.5 14v4" /><rect x="17" y="9" width="4.5" height="9" rx="1" /></svg>
);
