/**
 * ✅ [2026-04-18] 이미지 생성 스킵 여부 단일 진실 공급원 (SSOT)
 *
 * 배경: UI에 "이미지 없이 발행" 관련 설정이 3개 존재하여 파이프라인이 꼬임.
 *  - DOM `unified-skip-images` 체크박스 (발행 탭)
 *  - localStorage `textOnlyPublish` (이미지 관리 모달의 "텍스트만 발행")
 *  - localStorage `headingImageMode === 'none'` (소제목 이미지 모드 = '이미지 없음')
 *
 * 이전 버그: 10곳에서 각자 다른 걸 읽어서 한쪽만 체크한 사용자가 유료 이미지 API 호출 당함
 *  (예: 모달만 체크 → formData.skipImages=false → nano-banana 실행 → 650원 과금)
 *
 * 원칙: **어느 것 하나라도 켜져 있으면 이미지 생성 스킵**. 과금 방지가 최우선.
 */

/**
 * 이미지 생성 스킵 여부를 판정하는 유일한 소스.
 * 호출 시점: renderer 프로세스 내부에서만 (document/localStorage 접근 필요).
 */
export function isImageSkipEnabled(formDataSkipImages?: unknown): boolean {
    // 1. 명시적으로 전달된 formData.skipImages
    if (formDataSkipImages === true) return true;

    try {
        // 2. localStorage `textOnlyPublish` (이미지 관리 모달)
        if (localStorage.getItem('textOnlyPublish') === 'true') return true;

        // 3. localStorage `headingImageMode === 'none'` (소제목 이미지 모드)
        if (localStorage.getItem('headingImageMode') === 'none') return true;
    } catch { /* localStorage 접근 실패 시 무시 */ }

    try {
        // 4. DOM `unified-skip-images` 체크박스
        const domEl = document.getElementById('unified-skip-images') as HTMLInputElement | null;
        if (domEl?.checked === true) return true;
    } catch { /* DOM 접근 실패 시 무시 */ }

    return false;
}

/**
 * 양쪽 UI 체크박스를 동기화한다. 사용자가 한쪽만 체크해도 다른 쪽도 체크된 상태로 만들어 혼란 제거.
 * UI 이벤트 핸들러에서 호출.
 */
export function syncImageSkipUI(enabled: boolean): void {
    try {
        const domEl = document.getElementById('unified-skip-images') as HTMLInputElement | null;
        if (domEl && domEl.checked !== enabled) domEl.checked = enabled;
    } catch { /* ignore */ }
    try {
        const modalEl = document.getElementById('text-only-publish') as HTMLInputElement | null;
        if (modalEl && modalEl.checked !== enabled) modalEl.checked = enabled;
    } catch { /* ignore */ }
    try {
        localStorage.setItem('textOnlyPublish', String(enabled));
    } catch { /* ignore */ }
}

// ✅ 전역 노출 (기존 코드 호환성)
try {
    (window as any).isImageSkipEnabled = isImageSkipEnabled;
    (window as any).syncImageSkipUI = syncImageSkipUI;
} catch { /* ignore */ }
