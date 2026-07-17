/**
 * dropshotLoginUi.ts
 *
 * Shared 로그인 / 로그인 확인 button wiring for the "🍌 리더스 나노바나나 무제한"
 * (dropshot) engine, which uses UI automation and therefore needs an explicit
 * dropshot.io login. Used by the image-gen studio, the 이미지 관리 탭 source
 * select, and the 메인 풀오토 이미지 설정 modal.
 *
 * NOTE: identifiers are prefixed (ds / dropshot) — the renderer is shipped as a
 * single concatenated scope, so top-level names must be globally unique.
 */

interface DropshotLoginIds {
  readonly loginBtnId: string;
  readonly checkBtnId: string;
  readonly statusId: string;
}

interface DropshotUiStatus {
  readonly loggedIn: boolean;
  readonly message: string;
  readonly phase?: string;
  readonly ready?: boolean;
}

const dsBindings = new Map<string, DropshotLoginIds>();
let dsLastStatus: DropshotUiStatus | null = null;
let dsRefreshPromise: Promise<DropshotUiStatus> | null = null;
let dsLoginAnnounced = false;
let dsAuthRevision = 0;
let dsLoginInProgress = false;

function dsSetStatus(statusId: string, text: string, kind: 'info' | 'ok' | 'error'): void {
  const el = document.getElementById(statusId);
  if (!el) return;
  el.textContent = text;
  el.style.color = kind === 'ok' ? '#10b981' : kind === 'error' ? '#ef4444' : 'var(--text-muted)';
}

function dsApplyStatus(ids: DropshotLoginIds, status: DropshotUiStatus): void {
  const loginBtn = document.getElementById(ids.loginBtnId) as HTMLButtonElement | null;
  const checkBtn = document.getElementById(ids.checkBtnId) as HTMLButtonElement | null;
  const checking = status.phase === 'checking' || dsLoginInProgress;
  const busy = status.phase === 'busy';

  if (loginBtn) {
    loginBtn.textContent = status.loggedIn ? '✅ 로그인됨' : '🔗 로그인';
    loginBtn.disabled = status.loggedIn || checking;
  }
  if (checkBtn) checkBtn.disabled = checking;

  dsSetStatus(
    ids.statusId,
    checking || busy ? `⏳ ${status.message}` : status.loggedIn ? `✅ ${status.message}` : `⚠️ ${status.message}`,
    checking || busy ? 'info' : status.loggedIn ? 'ok' : 'error',
  );
}

function dsPublishStatus(status: DropshotUiStatus): void {
  dsLastStatus = status;
  for (const ids of dsBindings.values()) dsApplyStatus(ids, status);

  if (!status.loggedIn && status.phase !== 'checking') dsLoginAnnounced = false;
  if (status.loggedIn && !dsLoginAnnounced) {
    dsLoginAnnounced = true;
    (window as any).toastManager?.success?.('✅ 리더스 나노바나나 로그인 계정을 자동으로 인식했습니다.');
  }
}

function dsNormalizeCompletedStatus(
  receivedStatus: DropshotUiStatus,
  retainedAuthenticatedStatus: DropshotUiStatus | null,
): DropshotUiStatus {
  if (receivedStatus.phase !== 'checking') return receivedStatus;
  return retainedAuthenticatedStatus
    ? { ...retainedAuthenticatedStatus, message: receivedStatus.message }
    : { ...receivedStatus, phase: 'busy' };
}

/** Hidden status probe only. It never invokes the interactive login IPC. */
export async function refreshDropshotLoginStatus(ids?: DropshotLoginIds): Promise<DropshotUiStatus> {
  if (ids) dsBindings.set(ids.statusId, ids);
  if (dsRefreshPromise) return dsRefreshPromise;

  const authRevisionAtStart = dsAuthRevision;
  const retainedAuthenticatedStatus = dsLastStatus?.loggedIn ? dsLastStatus : null;
  dsPublishStatus(retainedAuthenticatedStatus
    ? {
        ...retainedAuthenticatedStatus,
        message: '저장된 로그인 상태를 다시 확인하는 중…',
        phase: 'checking',
      }
    : { loggedIn: false, message: '저장된 로그인 확인 중…', phase: 'checking', ready: false });
  const api = (window as any).api;
  dsRefreshPromise = (async () => {
    try {
      const result = await api?.checkDropshotLogin?.();
      const receivedStatus: DropshotUiStatus = result ?? {
        loggedIn: false,
        message: '로그인 확인 API를 사용할 수 없습니다.',
        phase: 'error',
        ready: false,
      };
      // A busy response means the profile is temporarily owned by generation
      // or login; it is not evidence that an already authenticated session was
      // logged out. Restore the stable state so the UI cannot remain disabled in
      // a permanent "checking" state after the one-shot IPC has completed.
      const status = dsNormalizeCompletedStatus(receivedStatus, retainedAuthenticatedStatus);
      if (authRevisionAtStart !== dsAuthRevision) return dsLastStatus ?? status;
      dsPublishStatus(status);
      return status;
    } catch (error) {
      const status: DropshotUiStatus = {
        loggedIn: false,
        message: `로그인 확인 오류: ${(error as Error)?.message ?? error}`,
        phase: 'error',
        ready: false,
      };
      if (authRevisionAtStart !== dsAuthRevision) return dsLastStatus ?? status;
      dsPublishStatus(status);
      return status;
    } finally {
      dsRefreshPromise = null;
    }
  })();
  return dsRefreshPromise;
}

/** Binds the 로그인 / 로그인 확인 buttons to the dropshot IPC (idempotent). */
export function bindDropshotLogin(ids: DropshotLoginIds): void {
  dsBindings.set(ids.statusId, ids);
  const api = (window as any).api;
  const loginBtn = document.getElementById(ids.loginBtnId) as HTMLButtonElement | null;
  const checkBtn = document.getElementById(ids.checkBtnId) as HTMLButtonElement | null;

  if (loginBtn && !loginBtn.dataset.dsBound) {
    loginBtn.dataset.dsBound = '1';
    loginBtn.addEventListener('click', async () => {
      if (loginBtn.disabled) return;
      const retainedAuthenticatedStatus = dsLastStatus?.loggedIn ? dsLastStatus : null;
      dsAuthRevision += 1;
      dsLoginInProgress = true;
      loginBtn.disabled = true;
      dsPublishStatus({
        loggedIn: retainedAuthenticatedStatus?.loggedIn ?? false,
        message: '로그인 진행 중… 필요 시 브라우저 창이 열립니다 (최대 5분).',
        phase: 'checking',
        ready: retainedAuthenticatedStatus?.ready ?? false,
      });
      try {
        const receivedStatus: DropshotUiStatus = await api?.dropshotLogin?.() ?? {
          loggedIn: false,
          message: '로그인 실패',
          phase: 'error',
          ready: false,
        };
        dsAuthRevision += 1;
        dsLoginInProgress = false;
        dsPublishStatus(dsNormalizeCompletedStatus(receivedStatus, retainedAuthenticatedStatus));
      } catch (e) {
        dsAuthRevision += 1;
        dsLoginInProgress = false;
        dsPublishStatus({ loggedIn: false, message: `로그인 오류: ${(e as Error)?.message ?? e}`, phase: 'error', ready: false });
      } finally {
        dsLoginInProgress = false;
        loginBtn.disabled = dsLastStatus?.loggedIn === true;
      }
    });
  }

  if (checkBtn && !checkBtn.dataset.dsBound) {
    checkBtn.dataset.dsBound = '1';
    checkBtn.addEventListener('click', async () => {
      if (checkBtn.disabled) return;
      checkBtn.disabled = true;
      dsSetStatus(ids.statusId, '⏳ 로그인 상태 확인 중…', 'info');
      try {
        await refreshDropshotLoginStatus(ids);
      } catch (e) {
        dsSetStatus(ids.statusId, `⚠️ 확인 오류: ${(e as Error)?.message ?? e}`, 'error');
      } finally {
        checkBtn.disabled = false;
      }
    });
  }

  if (dsLastStatus) dsApplyStatus(ids, dsLastStatus);
}

/** Binds the login/check buttons to the Flow IPC (idempotent). */
export function bindFlowLogin(ids: DropshotLoginIds): void {
  const api = (window as any).api;
  const loginBtn = document.getElementById(ids.loginBtnId) as HTMLButtonElement | null;
  const checkBtn = document.getElementById(ids.checkBtnId) as HTMLButtonElement | null;

  if (loginBtn && !loginBtn.dataset.flowBound) {
    loginBtn.dataset.flowBound = '1';
    loginBtn.addEventListener('click', async () => {
      dsSetStatus(ids.statusId, 'Flow 로그인 창을 여는 중입니다. Google 로그인 후 자동으로 확인합니다.', 'info');
      try {
        const r = await api?.flowLogin?.();
        dsSetStatus(ids.statusId, r?.loggedIn ? `✅ ${r.message}` : `⚠️ ${r?.message ?? 'Flow 로그인 실패'}`, r?.loggedIn ? 'ok' : 'error');
      } catch (e) {
        dsSetStatus(ids.statusId, `⚠️ Flow 로그인 오류: ${(e as Error)?.message ?? e}`, 'error');
      }
    });
  }

  if (checkBtn && !checkBtn.dataset.flowBound) {
    checkBtn.dataset.flowBound = '1';
    checkBtn.addEventListener('click', async () => {
      dsSetStatus(ids.statusId, 'Flow 로그인 세션 확인 중...', 'info');
      try {
        const r = await api?.checkFlowLogin?.();
        dsSetStatus(ids.statusId, r?.loggedIn ? `✅ ${r.message}` : `⚠️ ${r?.message ?? 'Flow 미로그인'}`, r?.loggedIn ? 'ok' : 'error');
      } catch (e) {
        dsSetStatus(ids.statusId, `⚠️ Flow 확인 오류: ${(e as Error)?.message ?? e}`, 'error');
      }
    });
  }
}

/** Shows/hides the login row. */
export function toggleDropshotRow(rowId: string, show: boolean): void {
  const row = document.getElementById(rowId);
  if (row) row.style.display = show ? 'block' : 'none';
}

/**
 * Wires a <select>-based engine picker: binds the buttons and toggles the row
 * whenever the selected value is 'dropshot'.
 */
export function wireSelectDropshotRow(opts: {
  selectId: string;
  rowId: string;
  loginBtnId: string;
  checkBtnId: string;
  statusId: string;
}): void {
  bindDropshotLogin(opts);
  const sel = document.getElementById(opts.selectId) as HTMLSelectElement | null;
  if (!sel) return;
  const sync = (): void => {
    const selected = sel.value === 'dropshot';
    toggleDropshotRow(opts.rowId, selected);
    if (selected) void refreshDropshotLoginStatus(opts);
  };
  if (!sel.dataset.dsRowBound) {
    sel.dataset.dsRowBound = '1';
    sel.addEventListener('change', sync);
  }
  sync();
}

export function wireSelectFlowRow(opts: {
  selectId: string;
  rowId: string;
  loginBtnId: string;
  checkBtnId: string;
  statusId: string;
}): void {
  bindFlowLogin(opts);
  const sel = document.getElementById(opts.selectId) as HTMLSelectElement | null;
  if (!sel) return;
  const sync = (): void => toggleDropshotRow(opts.rowId, sel.value === 'flow');
  sel.addEventListener('change', sync);
  sync();
}
