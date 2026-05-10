// Single MutationObserver for #shopping-connect-settings style changes.
// Dispatches 'sc-visibility-change' CustomEvent so all subscribers react
// through addEventListener rather than separate observers.
//
// v2.10.82 PERF: 이전엔 동일 element에 5개의 동일한 MutationObserver가 등록되어
// style 변경마다 5번 callback 발동. 단일 observer + event dispatch로 통합 →
// 메모리 5x ↓ + 실행 순서 *spec*상 명시 보장 (이전: 엔진 구현 의존).

let _initialized = false;

export type ShoppingConnectVisibilityDetail = { visible: boolean };

export function initShoppingConnectObserver(): void {
    if (_initialized) return;

    const el = document.getElementById('shopping-connect-settings');
    if (!el) return;

    _initialized = true;

    const observer = new MutationObserver(() => {
        const visible = el.style.display !== 'none';
        document.dispatchEvent(
            new CustomEvent<ShoppingConnectVisibilityDetail>('sc-visibility-change', {
                detail: { visible },
            }),
        );
    });

    observer.observe(el, { attributes: true, attributeFilter: ['style'] });
}
