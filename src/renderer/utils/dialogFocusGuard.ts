// src/renderer/utils/dialogFocusGuard.ts
// [2026-08-17] 네이티브 팝업 포커스 가드 — Windows Electron의 고질병 대응.
//
// 증상(사용자 실측): alert/confirm 팝업이 닫힌 뒤 버튼·입력이 반응하지 않고,
// 바탕화면을 한 번 클릭해 창 포커스를 잃었다 되찾아야 정상화된다. 원인은
// 네이티브 다이얼로그가 닫힐 때 Electron이 입력 라우팅을 창에 되돌려주지
// 않는 버그. 렌더러에 alert/confirm 호출이 329곳이라 호출부 수정 대신
// 전역 래핑 한 곳에서 해결한다 — 팝업이 닫히는 즉시 메인 프로세스에
// blur→focus 리셋(window:refocus)을 요청해 "바탕화면 클릭"을 자동화한다.
//
// 메인 프로세스 쪽 파일 다이얼로그(showOpenDialog 등)는
// main/ipc/windowFocusHandlers.ts 의 patchNativeDialogsForFocus()가 같은
// 방식으로 덮는다. 두 층이 함께 있어야 전 트리거가 커버된다.

const GUARD_LOG = '[DialogFocusGuard]';
const REFOCUS_DEBOUNCE_MS = 50;

let dialogFocusGuardInstalled = false;
let refocusTimer: ReturnType<typeof setTimeout> | null = null;

function requestWindowRefocus(): void {
    if (refocusTimer) return; // 연속 팝업은 마지막 한 번만 리셋
    refocusTimer = setTimeout(() => {
        refocusTimer = null;
        try {
            (window as any).api?.refocusWindow?.();
        } catch { /* IPC 미배선 환경(테스트 등)에서는 조용히 무시 */ }
    }, REFOCUS_DEBOUNCE_MS);
}

/**
 * window.alert / confirm / prompt를 원본 동작 그대로 유지하며 감싼다.
 * 팝업이 닫힌 직후(finally) 포커스 리셋을 요청 — 반환값·예외 전파 불변.
 */
export function installDialogFocusGuard(): void {
    if (dialogFocusGuardInstalled) return;
    dialogFocusGuardInstalled = true;

    const nativeAlert = window.alert.bind(window);
    const nativeConfirm = window.confirm.bind(window);
    const nativePrompt = window.prompt.bind(window);

    window.alert = (message?: any): void => {
        try { nativeAlert(message); } finally { requestWindowRefocus(); }
    };
    window.confirm = (message?: any): boolean => {
        try { return nativeConfirm(message); } finally { requestWindowRefocus(); }
    };
    window.prompt = (message?: any, defaultValue?: any): string | null => {
        try { return nativePrompt(message, defaultValue); } finally { requestWindowRefocus(); }
    };

    console.log(`${GUARD_LOG} ✅ alert/confirm/prompt 포커스 가드 설치 완료`);
}
