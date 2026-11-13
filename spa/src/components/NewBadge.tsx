import { light, lightRadius, type } from '../styles/tokens';

/**
 * 새 소식 배지. 개수가 있으면 숫자(9개 초과는 9+), 개수를 모르면 N 을 띄운다.
 * 어디에 붙어도 레이아웃을 밀지 않도록 inline-flex + 고정 높이를 쓴다.
 */
type NewBadgeProps = {
    count?: number;
    /** count 를 모르거나 0 이어도 강제로 N 을 띄우고 싶을 때 */
    force?: boolean;
    size?: 'sm' | 'md';
    title?: string;
};

function NewBadge({ count = 0, force = false, size = 'sm', title }: NewBadgeProps) {
    const visible = force || count > 0;
    if (!visible) return null;

    const label = count > 0 ? (count > 9 ? '9+' : String(count)) : 'N';
    // 13px is the smallest text on the site, so the badge is at least 20px tall.
    const dim = size === 'md' ? 22 : 20;
    const accessible = title || (count > 0 ? `새 소식 ${count}건` : '새 소식 있음');

    return (
        <span
            role="status"
            aria-label={accessible}
            title={accessible}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: dim,
                height: dim,
                padding: '0 6px',
                marginLeft: 6,
                borderRadius: lightRadius.pill,
                background: light.btn,
                color: light.onBtn,
                fontSize: type.meta,
                fontWeight: 600,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                verticalAlign: 'middle',
            }}
        >
            {label}
        </span>
    );
}

export default NewBadge;
