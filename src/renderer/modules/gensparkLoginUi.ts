/**
 * gensparkLoginUi.ts
 *
 * [2026-10-10] 젠스파크 이미지 엔진의 화면 연결: 로그인 창 열기·상태 확인 버튼, 상태 문구,
 * 모델 고르기(15개, 크레딧 차감 모델은 확인창). 관리 탭·이미지 스튜디오·소제목 이미지 설정
 * 서브모달 세 화면이 같은 상태를 공유한다. 비밀번호는 입력받지 않는다(사람이 전용 창에서 직접 로그인).
 *
 * 주의: 렌더러는 하나의 스코프로 이어 붙여 출고되므로 최상위 이름은 gs 접두로 전역 유일하게 둔다.
 */
import {
  gensparkListModels,
  gensparkDefaultModel,
  gensparkFindModelById,
  gensparkModelDisplayLabel,
  GENSPARK_CREDIT_SUFFIX,
} from '../../image/genspark/gensparkModels.js';

interface GsLoginIds {
  readonly loginBtnId: string;
  readonly checkBtnId: string;
  readonly statusId: string;
}

interface GsUiStatus {
  readonly loggedIn: boolean;
  readonly message: string;
  readonly phase?: string;
}

const GS_MODEL_STORAGE_KEY = 'gensparkImageModel';
const gsBindings = new Map<string, GsLoginIds>();
const gsModelSelectIds = new Set<string>();
let gsLastStatus: GsUiStatus | null = null;
let gsBusy = false;

/** 세 화면의 요소 id 묶음(접두: mgmt / imgstudio / hsettings). */
export function gsIdsFor(prefix: string): GsLoginIds & { readonly rowId: string; readonly modelId: string } {
  return {
    rowId: `${prefix}-genspark-row`,
    loginBtnId: `${prefix}-gs-login-btn`,
    checkBtnId: `${prefix}-gs-check-btn`,
    statusId: `${prefix}-gs-status`,
    modelId: `${prefix}-genspark-model`,
  };
}

function gsSetStatus(statusId: string, text: string, kind: 'info' | 'ok' | 'error'): void {
  const el = document.getElementById(statusId);
  if (!el) return;
  el.textContent = text;
  el.style.color = kind === 'ok' ? '#10b981' : kind === 'error' ? '#ef4444' : 'var(--text-muted)';
}

function gsApplyStatus(ids: GsLoginIds, status: GsUiStatus, working: boolean): void {
  const checkBtn = document.getElementById(ids.checkBtnId) as HTMLButtonElement | null;
  const loginBtn = document.getElementById(ids.loginBtnId) as HTMLButtonElement | null;
  if (loginBtn) loginBtn.disabled = working;
  if (checkBtn) checkBtn.disabled = working;
  if (working) return gsSetStatus(ids.statusId, `⏳ ${status.message}`, 'info');
  gsSetStatus(
    ids.statusId,
    status.loggedIn ? `✅ ${status.message}` : `⚠️ ${status.message}`,
    status.loggedIn ? 'ok' : status.phase === 'unknown' ? 'info' : 'error',
  );
}

function gsPublish(status: GsUiStatus, working: boolean): void {
  gsLastStatus = status;
  gsBusy = working;
  for (const ids of gsBindings.values()) gsApplyStatus(ids, status, working);
}

/** 로그인 상태만 조용히 확인(로그인 창은 열지 않는다). */
export async function gsRefreshLoginStatus(ids?: GsLoginIds): Promise<GsUiStatus> {
  if (ids) gsBindings.set(ids.statusId, ids);
  gsPublish({ loggedIn: false, message: '젠스파크 로그인 상태 확인 중…', phase: 'checking' }, true);
  try {
    const result = await (window as any).api?.checkGensparkLogin?.();
    const status: GsUiStatus = result ?? { loggedIn: false, message: '로그인 확인 API를 사용할 수 없습니다.', phase: 'error' };
    gsPublish(status, false);
    return status;
  } catch (e) {
    const status: GsUiStatus = { loggedIn: false, message: `로그인 확인 오류: ${(e as Error)?.message ?? e}`, phase: 'error' };
    gsPublish(status, false);
    return status;
  }
}

/** 로그인 창 열기·상태 확인 버튼 배선(중복 호출 안전). */
export function gsBindLogin(ids: GsLoginIds): void {
  gsBindings.set(ids.statusId, ids);
  const loginBtn = document.getElementById(ids.loginBtnId) as HTMLButtonElement | null;
  const checkBtn = document.getElementById(ids.checkBtnId) as HTMLButtonElement | null;
  if (loginBtn && !loginBtn.dataset.gsBound) {
    loginBtn.dataset.gsBound = '1';
    loginBtn.addEventListener('click', async () => {
      if (gsBusy) return;
      gsPublish({ loggedIn: false, message: '젠스파크 로그인 창을 여는 중… 창에서 직접 로그인하세요.', phase: 'checking' }, true);
      try {
        const result = await (window as any).api?.openGensparkLogin?.();
        gsPublish(result ?? { loggedIn: false, message: '로그인 창을 열 수 없습니다.', phase: 'error' }, false);
      } catch (e) {
        gsPublish({ loggedIn: false, message: `로그인 오류: ${(e as Error)?.message ?? e}`, phase: 'error' }, false);
      }
    });
  }
  if (checkBtn && !checkBtn.dataset.gsBound) {
    checkBtn.dataset.gsBound = '1';
    checkBtn.addEventListener('click', () => {
      if (gsBusy) return;
      void gsRefreshLoginStatus(ids);
    });
  }
  if (gsLastStatus) gsApplyStatus(ids, gsLastStatus, gsBusy);
}

/** 저장된 모델 id (localStorage 미러). 목록에 없으면 기본 모델. */
export function gsGetSavedModelId(): string {
  let saved: string | null = null;
  try { saved = localStorage.getItem(GS_MODEL_STORAGE_KEY); } catch { /* 저장소 접근 불가는 무시 */ }
  return (gensparkFindModelById(saved) ?? gensparkDefaultModel()).id;
}

/** 모델 select 를 15개 옵션으로 채운다(표시 라벨, 크레딧 모델은 접미사). */
export function gsPopulateModelSelect(selectId: string, selectedId?: string): void {
  const sel = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = '';
  for (const model of gensparkListModels()) {
    const opt = document.createElement('option');
    opt.value = model.id;
    opt.textContent = gensparkModelDisplayLabel(model);
    sel.appendChild(opt);
  }
  sel.value = selectedId ?? gsGetSavedModelId();
}

function gsSyncAllModelSelects(modelId: string): void {
  for (const id of gsModelSelectIds) {
    const el = document.getElementById(id) as HTMLSelectElement | null;
    if (el && el.value !== modelId) el.value = modelId;
  }
}

/** 모델 select 배선: 크레딧 차감 모델은 확인창, 거절하면 이전 값으로 되돌린다. */
export function gsBindModelSelect(selectId: string): void {
  const sel = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!sel) return;
  gsModelSelectIds.add(selectId);
  gsPopulateModelSelect(selectId);
  if (sel.dataset.gsModelBound) return;
  sel.dataset.gsModelBound = '1';
  let previous = sel.value;
  sel.addEventListener('change', () => {
    const picked = gensparkFindModelById(sel.value);
    if (!picked) { sel.value = previous; return; }
    if (!picked.creditFree) {
      const ok = window.confirm(
        `'${picked.menuLabel}' 모델은 젠스파크 크레딧이 차감됩니다${GENSPARK_CREDIT_SUFFIX.trim()}.\n정말 이 모델로 바꿀까요?`,
      );
      if (!ok) { sel.value = previous; return; }
    }
    previous = picked.id;
    try { localStorage.setItem(GS_MODEL_STORAGE_KEY, picked.id); } catch { /* 무시 */ }
    void (window as any).api?.saveConfig?.({ gensparkImageModel: picked.id });
    gsSyncAllModelSelects(picked.id);
  });
}

/** 행 보이기/숨기기. */
export function gsToggleRow(rowId: string, show: boolean): void {
  const row = document.getElementById(rowId);
  if (row) row.style.display = show ? 'block' : 'none';
}

/** 저장된 모델을 설정 파일에서 읽어 모든 select 에 반영한다(앱 시작 시 1회). */
export async function gsLoadModelFromConfig(): Promise<void> {
  try {
    const cfg = await (window as any).api?.getConfig?.();
    const found = gensparkFindModelById(cfg?.gensparkImageModel);
    if (!found) return;
    try { localStorage.setItem(GS_MODEL_STORAGE_KEY, found.id); } catch { /* 무시 */ }
    gsSyncAllModelSelects(found.id);
  } catch { /* 설정 읽기 실패는 기본 모델 유지 */ }
}

/** 엔진 select 와 행을 묶는다: 'genspark' 선택 시 행 노출 + 상태 확인. */
export function gsWireSelectRow(opts: { selectId: string; prefix: string }): void {
  const ids = gsIdsFor(opts.prefix);
  gsBindLogin(ids);
  gsBindModelSelect(ids.modelId);
  const sel = document.getElementById(opts.selectId) as HTMLSelectElement | null;
  if (!sel) return;
  const sync = (): void => {
    const selected = sel.value === 'genspark';
    gsToggleRow(ids.rowId, selected);
    if (selected) void gsRefreshLoginStatus(ids);
  };
  if (!sel.dataset.gsRowBound) {
    sel.dataset.gsRowBound = '1';
    sel.addEventListener('change', sync);
  }
  sync();
}

/** 소제목 이미지 설정 서브모달: 현재 엔진에 따라 행 노출(동적 생성 DOM 용). */
export function gsApplyEngineToRow(prefix: string, engine: string): void {
  const ids = gsIdsFor(prefix);
  gsBindLogin(ids);
  gsBindModelSelect(ids.modelId);
  const show = engine === 'genspark';
  gsToggleRow(ids.rowId, show);
  if (show) void gsRefreshLoginStatus(ids);
}

/** 소제목 이미지 설정 모달에 끼워 넣을 행 HTML(동적 생성). */
export function gsRowHtml(prefix: string): string {
  const ids = gsIdsFor(prefix);
  return `<div id="${ids.rowId}" style="display:none; margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: #ede9fe; border: 1px solid #8b5cf6;">
  <div style="font-size: 12px; color: #5b21b6; margin-bottom: 6px;">✨ 젠스파크는 전용 창에서 직접 로그인해야 합니다(비밀번호는 앱이 받지 않습니다).</div>
  <div style="display:flex; gap: 6px; align-items: center; flex-wrap: wrap;">
    <button type="button" id="${ids.loginBtnId}" style="padding: 6px 12px; background: linear-gradient(135deg,#8b5cf6,#6d28d9); color: white; border: none; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer;">🔗 젠스파크 로그인 창 열기</button>
    <button type="button" id="${ids.checkBtnId}" style="padding: 6px 12px; background: #ffffff; color: #5b21b6; border: 1px solid #8b5cf6; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer;">✅ 상태 확인</button>
    <span id="${ids.statusId}" style="font-size: 11px; color: #5b21b6;"></span>
  </div>
  <div style="margin-top: 6px; font-size: 12px; color: #5b21b6;">모델
    <select id="${ids.modelId}" style="margin-left: 6px; padding: 4px 8px; border-radius: 6px; border: 1px solid #8b5cf6;"></select>
  </div>
</div>`;
}

/** index.html 의 정적 행(관리 탭·스튜디오) 배선. 요소가 없으면 건너뛴다. */
export function gsBindAllStaticUis(): void {
  for (const prefix of ['mgmt', 'imgstudio']) {
    const ids = gsIdsFor(prefix);
    if (!document.getElementById(ids.checkBtnId)) continue;
    gsBindLogin(ids);
    gsBindModelSelect(ids.modelId);
  }
}
