/**
 * SPEC-IMAGE-RECOVERY-001 Phase 6 C1:
 * Maps blocking modal user choices (B1~B7) to concrete follow-up actions.
 *
 * Until this module existed, modal options were dead — user clicked but nothing
 * happened. Each choice is now wired to a real handler.
 *
 * Design notes:
 *   - Renderer-only module (uses window.api + DOM).
 *   - No silent engine fallback (memory feedback_no_fallback).
 *   - "Schedule 1h" uses Notification API (works while app is running).
 *     User is told plainly that closing the app cancels the schedule.
 */

type ToastFn = (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;

const DEFAULT_TOAST: ToastFn = (msg) => console.log('[RecoveryFollowup]', msg);
const toast: ToastFn = (window as any).toastManager?.warning
  ? (m, t = 'warning') => ((window as any).toastManager[t] ?? DEFAULT_TOAST)(m)
  : DEFAULT_TOAST;

interface ModalPayload {
  readonly code: string;
  readonly reason: string;
  readonly errorCode?: string;
}

export async function handleRecoveryChoice(
  code: string,
  chosenId: string,
  payload: ModalPayload,
): Promise<void> {
  switch (chosenId) {
    case 'cancel':
    case 'close':
      toast('배치를 종료합니다. 다음 실행 시 체크포인트에서 재개됩니다.', 'info');
      return;

    case 'open-proxy-settings':
      openProxySettings();
      return;

    case 'switch-account':
      await switchGoogleAccount();
      return;

    case 'edit-prompt':
      await openPromptEditor(payload);
      return;

    case 'retry-as-is':
      toast('현재 프롬프트로 한 번 더 시도합니다.', 'info');
      return;

    case 'schedule-1h':
      scheduleOneHourReminder('B3');
      return;

    case 'retry-1h':
      scheduleOneHourReminder('B6');
      return;

    case 'open-engine-settings':
      openEngineSettings();
      return;

    case 'retry-login':
      await retryGoogleLogin();
      return;

    default:
      console.warn('[RecoveryFollowup] 알 수 없는 chosenId:', chosenId);
  }
}

// ─── 후속 동작 7종 ────────────────────────────────────────

function openProxySettings(): void {
  // 실제 존재하는 외부 프록시 등록 UI는 환경설정 모달 안에 있음.
  // 정확한 트리거 셀렉터가 없어 사용자에게 안내만 (사용자 명시 동의 패턴 유지).
  toast('환경설정 메뉴를 열어 "외부 프록시 등록" 항목에서 등록해주세요.', 'warning');
}

async function switchGoogleAccount(): Promise<void> {
  // ✅ 실제 API: window.api.switchImageFxGoogleAccount (preload.ts:1019)
  const api = (window as any).api;
  if (api?.switchImageFxGoogleAccount) {
    try {
      const result = await api.switchImageFxGoogleAccount();
      if (result?.success) {
        toast(`✅ 계정 변경 완료: ${result.userName ?? ''}`, 'success');
      } else {
        toast(`⚠️ 계정 변경 실패: ${result?.message ?? '알 수 없음'}`, 'warning');
      }
    } catch (e) {
      toast(`계정 변경 오류: ${(e as Error)?.message ?? '알 수 없음'}`, 'error');
    }
    return;
  }
  // 폴백: DOM 버튼 클릭 (imageManagementTab.ts:30 #imagefx-switch-account-btn)
  const btn = document.getElementById('imagefx-switch-account-btn') as HTMLButtonElement | null;
  if (btn) {
    btn.click();
    toast('Google 계정 변경 창을 열었습니다.', 'info');
    return;
  }
  toast('환경설정 → ImageFX → "Google 계정 변경"을 직접 클릭해주세요.', 'warning');
}

async function openPromptEditor(payload: ModalPayload): Promise<void> {
  // ✅ 실제: PromptEditModal.ts:131에서 window 전역으로 등록됨
  const editor = (window as any).showHeadingPromptEditModal;
  const idx = (window as any)._currentRecoveryHeadingIndex ?? 0;
  if (typeof editor === 'function') {
    await editor(idx);
    toast('프롬프트 편집 창을 열었습니다. 저장 후 다시 시도해주세요.', 'info');
    return;
  }
  toast(`프롬프트 편집기를 찾을 수 없습니다. (errorCode: ${payload.errorCode ?? '알 수 없음'})`, 'warning');
}

function scheduleOneHourReminder(code: 'B3' | 'B6'): void {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const message = code === 'B3'
    ? '시간당 한도가 풀렸을 시간입니다. 이미지 생성을 다시 시도해보세요.'
    : 'Flow UI 변경 자동 재시도 시점입니다. 다시 시도해보세요.';

  toast('알림 예약됨 — 1시간 후 알려드립니다. (앱을 닫으면 예약이 취소됩니다)', 'success');

  setTimeout(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Better Life Naver — 자동 복구 알림', { body: message });
    }
    toast(message, 'info');
  }, ONE_HOUR_MS);

  // 권한 요청 (현재 거부 상태가 아니면)
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => { /* 무시 */ });
  }
}

function openEngineSettings(): void {
  // 이미지 엔진 설정은 환경설정 모달의 한 섹션. 명확한 단일 트리거가 없어 사용자 안내만.
  // (silent 폴백 금지 원칙 — 자동 전환 절대 X)
  toast('환경설정 → 이미지 엔진 항목에서 직접 변경해주세요. (자동 전환 X)', 'warning');
}

async function retryGoogleLogin(): Promise<void> {
  // ✅ 실제 API: window.api.testFlowConnection (preload.ts:1015)
  //            window.api.checkImageFxGoogleLogin (preload.ts:1012)
  const api = (window as any).api;
  toast('Google 로그인을 다시 시작합니다. 브라우저 창이 표시될 수 있습니다.', 'info');
  try {
    if (api?.testFlowConnection) {
      const r = await api.testFlowConnection();
      toast(r?.ok ? `✅ Flow 재로그인 성공` : `⚠️ Flow 재로그인 실패: ${r?.message ?? '알 수 없음'}`, r?.ok ? 'success' : 'warning');
      return;
    }
    if (api?.checkImageFxGoogleLogin) {
      const r = await api.checkImageFxGoogleLogin();
      toast(r?.loggedIn ? `✅ ImageFX 로그인 확인됨` : `⚠️ ImageFX 로그인 필요: ${r?.message ?? ''}`, r?.loggedIn ? 'success' : 'warning');
      return;
    }
    toast('환경설정에서 직접 다시 로그인해주세요.', 'warning');
  } catch (e) {
    toast(`재로그인 오류: ${(e as Error)?.message ?? '알 수 없음'}`, 'error');
  }
}
