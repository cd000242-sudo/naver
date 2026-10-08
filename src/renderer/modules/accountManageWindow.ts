// src/renderer/modules/accountManageWindow.ts
// "⚙️ 계정 관리" window: every saved publishing account with 별명, 네이버 아이디, 블로그 주소 and its safety status,
// plus [수정] / [삭제] and, for a stopped account, [풀기] (the in-place pause panel). Saved accounts could only be
// added from the publish screen before; a changed Naver password now has a place to be dealt with.
//
// Reuses the existing IPC only (getAllBlogAccounts / removeBlogAccount / accountSafety status; the form adds the two
// update calls). Local state only: nothing here contacts Naver, and the app never types a password.
// NOTE: inline bundle = single scope. Every top-level identifier here is prefixed accountManage* / ACCOUNT_MANAGE_*.

import { accountManageBlogIdOf, accountManageBuildForm } from './accountManageForm.js';
import type { AccountManageAccount, AccountManageSaved } from './accountManageForm.js';
import { showAccountPauseModal } from './accountPauseModal.js';

type AccountManageState = { paused: boolean; busy: boolean; version: number; code?: string; label?: string; journalUnreadable?: boolean; storageError?: boolean };
type AccountManageSafetyReply = { success: boolean; state?: AccountManageState; message?: string };
type AccountManageApi = {
  getAllBlogAccounts?: () => Promise<{ success: boolean; accounts?: AccountManageAccount[]; message?: string }>;
  removeBlogAccount?: (id: string) => Promise<{ success: boolean; message?: string }>;
  accountSafety?: (id: string, action: string) => Promise<AccountManageSafetyReply>;
};
type AccountManageGlobals = { api?: AccountManageApi; refreshAllAccountLists?: () => unknown; loadMainAccountList?: () => unknown; renderInlineAccountList?: () => unknown; openAccountManageWindow?: () => Promise<void> };
type AccountManageStatus = { text: string; tone: 'ok' | 'stop' | 'unknown'; code?: string };

const ACCOUNT_MANAGE_WINDOW_ID = 'account-manage-window';
const ACCOUNT_MANAGE_PAUSE_ID = 'account-pause-modal';
const ACCOUNT_MANAGE_STATUS_TIMEOUT_MS = 5_000;
// The stop codes the in-place pause panel can resolve (its own copy table); any other stop gets no [풀기].
const ACCOUNT_MANAGE_STOP_CODES = new Set(['LOGIN_REQUIRED', 'LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN']);
const ACCOUNT_MANAGE_BUTTON_IDS = ['main-manage-accounts-btn', 'ma-manage-accounts-inline'];
const ACCOUNT_MANAGE_TONES = { ok: 'color:#6ee7b7;background:rgba(16,185,129,0.15);', stop: 'color:#fcd34d;background:rgba(245,158,11,0.18);', unknown: 'color:#cbd5e1;background:rgba(148,163,184,0.18);' };
const ACCOUNT_MANAGE_FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href]';

let accountManageCloseCurrent: (() => void) | null = null;

function accountManageGlobals(): AccountManageGlobals { return window as unknown as AccountManageGlobals; }

function accountManageElement<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.style.cssText = css;
  if (text !== undefined) element.textContent = text;
  return element;
}

function accountManageActionButton(action: string, text: string, tone: 'edit' | 'delete' | 'resolve'): HTMLButtonElement {
  const colors = { edit: '#60a5fa', delete: '#f87171', resolve: '#fbbf24' }[tone];
  const button = accountManageElement('button', `padding:0.4rem 0.8rem;border-radius:8px;border:1px solid ${colors};background:transparent;color:${colors};font-size:0.82rem;font-weight:600;cursor:pointer;`, text);
  button.type = 'button'; button.dataset.action = action;
  return button;
}

/** Local safety status of one account; undefined when it cannot be read in time (never reported as 정상). */
async function accountManageReadStatus(id: string): Promise<AccountManageSafetyReply | undefined> {
  const api = accountManageGlobals().api;
  if (!api?.accountSafety) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      api.accountSafety(id, 'status'),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ACCOUNT_MANAGE_STATUS_TIMEOUT_MS); }),
    ]);
  } catch { return undefined; } finally { if (timer) clearTimeout(timer); }
}

function accountManageStatusOf(reply: AccountManageSafetyReply | undefined): AccountManageStatus {
  const state = reply?.success ? reply.state : undefined;
  if (!state) return { text: '확인 불가', tone: 'unknown' };
  if (state.paused || state.journalUnreadable || state.storageError) {
    return { text: `멈춤 · ${state.label || '확인 필요'}`, tone: 'stop', code: state.paused && state.code && ACCOUNT_MANAGE_STOP_CODES.has(state.code) ? state.code : undefined };
  }
  return { text: '정상', tone: 'ok' };
}

/** Re-read the dropdown and lists the rest of the app draws from the same saved accounts. */
async function accountManageRefreshApp(): Promise<void> {
  const app = accountManageGlobals();
  try {
    if (typeof app.refreshAllAccountLists === 'function') await app.refreshAllAccountLists();
    else { await app.loadMainAccountList?.(); await app.renderInlineAccountList?.(); }
  } catch { /* The window re-reads its own list next; a failed dropdown refresh must not block that. */ }
}

/** The publish screen keeps a copy of the selected account's Naver ID/password; keep it in step with what was just saved. */
function accountManageSyncMainScreen(accountId: string, saved: AccountManageSaved): void {
  const selector = document.getElementById('main-account-selector') as HTMLSelectElement | null;
  if (!selector || selector.value !== accountId) return;
  const idInput = document.getElementById('naver-id') as HTMLInputElement | null;
  const passwordInput = document.getElementById('naver-password') as HTMLInputElement | null;
  const nameLabel = document.getElementById('selected-account-name');
  if (idInput) idInput.value = saved.naverId;
  if (passwordInput && (saved.clearedPassword || saved.password)) passwordInput.value = saved.password;
  if (nameLabel) nameLabel.textContent = saved.name;
}

/** Run `callback` once the in-place pause panel is gone (immediately when it is not on screen). */
function accountManageWhenPauseClosed(callback: () => void): void {
  if (!document.getElementById(ACCOUNT_MANAGE_PAUSE_ID)) return callback();
  const observer = new MutationObserver(() => {
    if (document.getElementById(ACCOUNT_MANAGE_PAUSE_ID)) return;
    observer.disconnect(); callback();
  });
  observer.observe(document.body, { childList: true });
}

function accountManageBuildRow(account: AccountManageAccount, handlers: { edit: () => void; remove: (row: HTMLElement) => void; resolve: (code: string) => void }) {
  const row = accountManageElement('li', 'display:flex;flex-wrap:wrap;align-items:center;gap:0.6rem 1rem;padding:0.8rem 0.9rem;margin-bottom:0.6rem;border:1px solid rgba(148,163,184,0.25);border-radius:10px;background:rgba(15,23,42,0.45);');
  row.dataset.accountId = account.id;
  const info = accountManageElement('div', 'flex:1 1 240px;min-width:0;');
  const head = accountManageElement('div', 'display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin-bottom:0.3rem;');
  const badge = accountManageElement('span', '', '상태 확인 중…'); badge.dataset.role = 'status';
  head.append(accountManageElement('strong', 'font-size:0.98rem;word-break:break-all;', `👤 ${account.name || '(이름 없음)'}`), badge);
  const blog = accountManageBlogIdOf(account.blogId);
  const detail = (text: string) => accountManageElement('div', 'font-size:0.82rem;line-height:1.6;color:var(--text-muted,#cbd5e1);word-break:break-all;', text);
  info.append(head, detail(`네이버 아이디: ${account.naverId?.trim() || '미입력'}`), detail(`블로그 주소: ${blog ? `blog.naver.com/${blog}` : '첫 발행 때 자동 확인'}`));
  const actions = accountManageElement('div', 'display:flex;gap:0.4rem;flex-wrap:wrap;');
  const edit = accountManageActionButton('edit', '수정', 'edit'); const remove = accountManageActionButton('delete', '삭제', 'delete');
  edit.addEventListener('click', handlers.edit); remove.addEventListener('click', () => handlers.remove(row));
  actions.append(edit, remove); row.append(info, actions);

  /** Show the status in the badge; a stop the pause panel can resolve also gets a [풀기] button. */
  const showStatus = (status: AccountManageStatus, hint = '') => {
    badge.textContent = hint ? `${status.text} · ${hint}` : status.text; badge.dataset.tone = status.tone;
    badge.style.cssText = `padding:0.15rem 0.55rem;border-radius:999px;font-size:0.76rem;font-weight:700;${ACCOUNT_MANAGE_TONES[status.tone]}`;
    actions.querySelector('button[data-action="resolve"]')?.remove();
    if (!status.code) return;
    const resolve = accountManageActionButton('resolve', '풀기', 'resolve');
    resolve.addEventListener('click', () => handlers.resolve(status.code!));
    actions.prepend(resolve);
  };
  return { row, showStatus };
}

export async function accountManageOpen(): Promise<void> {
  const existing = document.getElementById(ACCOUNT_MANAGE_WINDOW_ID);
  if (existing) { existing.querySelector<HTMLElement>(ACCOUNT_MANAGE_FOCUSABLE)?.focus(); return; }
  const opener = document.activeElement as HTMLElement | null;
  const overlay = accountManageElement('div', 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;');
  overlay.id = ACCOUNT_MANAGE_WINDOW_ID;
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'account-manage-title');
  const panel = accountManageElement('div', 'width:min(680px,94vw);max-height:88vh;overflow:auto;background:var(--bg-card,#1e293b);color:var(--text-strong,#f1f5f9);border:1px solid rgba(139,92,246,0.55);border-radius:14px;padding:1.3rem;box-shadow:0 20px 60px rgba(0,0,0,0.5);');
  const focusStyle = accountManageElement('style', '', `#${ACCOUNT_MANAGE_WINDOW_ID} button:focus-visible,#${ACCOUNT_MANAGE_WINDOW_ID} input:focus-visible{outline:2px solid #a78bfa;outline-offset:2px;}`);
  const header = accountManageElement('div', 'display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:0.4rem;');
  const title = accountManageElement('h2', 'margin:0;font-size:1.1rem;font-weight:700;', '⚙️ 계정 관리'); title.id = 'account-manage-title';
  const closeButton = accountManageElement('button', 'width:2rem;height:2rem;border-radius:8px;border:1px solid rgba(148,163,184,0.4);background:transparent;color:inherit;font-size:1.2rem;line-height:1;cursor:pointer;', '×');
  closeButton.type = 'button'; closeButton.dataset.action = 'close'; closeButton.setAttribute('aria-label', '닫기');
  header.append(title, closeButton);
  const intro = accountManageElement('div', 'font-size:0.84rem;line-height:1.6;color:var(--text-muted,#cbd5e1);margin-bottom:0.7rem;', '저장된 발행 계정의 별명, 블로그 주소, 네이버 아이디, 비밀번호를 고치거나 계정을 삭제합니다.');
  const notice = accountManageElement('div', 'font-size:0.85rem;line-height:1.5;min-height:1.2rem;margin-bottom:0.6rem;color:#93c5fd;'); notice.id = 'account-manage-notice'; notice.setAttribute('role', 'status');
  const body = accountManageElement('div', '');
  panel.append(focusStyle, header, intro, notice, body); overlay.append(panel);

  const say = (text: string, failed = false) => { notice.textContent = text; notice.style.color = failed ? '#fca5a5' : '#93c5fd'; };
  const note = (text: string) => accountManageElement('div', 'padding:1.2rem 0.5rem;text-align:center;font-size:0.9rem;color:var(--text-muted,#cbd5e1);', text);
  const focusFirst = () => (body.querySelector<HTMLElement>(ACCOUNT_MANAGE_FOCUSABLE) ?? closeButton).focus();
  let serial = 0;
  let rows: Array<{ account: AccountManageAccount; showStatus: (status: AccountManageStatus, hint?: string) => void }> = [];

  const readStatuses = async (mine: number) => {
    await Promise.all(rows.map(async ({ account, showStatus }) => {
      if (!account.naverId?.trim()) return showStatus({ text: '확인 불가', tone: 'unknown' }, '네이버 아이디를 저장하면 상태를 확인할 수 있습니다.');
      const status = accountManageStatusOf(await accountManageReadStatus(account.id));
      if (overlay.isConnected && mine === serial) showStatus(status);
    }));
  };
  const showList = async () => {
    const mine = ++serial; rows = [];
    title.textContent = '⚙️ 계정 관리'; body.replaceChildren(note('저장된 계정을 불러오는 중입니다…'));
    let accounts: AccountManageAccount[] = [];
    try {
      const reply = await accountManageGlobals().api?.getAllBlogAccounts?.();
      if (!reply?.success || !Array.isArray(reply.accounts)) throw new Error('unreadable');
      accounts = reply.accounts;
    } catch {
      if (overlay.isConnected && mine === serial) body.replaceChildren(note('계정 목록을 불러오지 못했습니다. 창을 닫고 다시 열어 주세요.'));
      return;
    }
    if (!overlay.isConnected || mine !== serial) return;
    if (!accounts.length) { body.replaceChildren(note('저장된 계정이 없습니다. [➕ 계정 추가]로 먼저 추가해 주세요.')); focusFirst(); return; }
    const list = accountManageElement('ul', 'list-style:none;margin:0;padding:0;'); list.setAttribute('role', 'list');
    rows = accounts.map(account => {
      const built = accountManageBuildRow(account, {
        edit: () => showForm(account), remove: row => void removeAccount(account, row),
        resolve: code => void resolveStop(account, code),
      });
      list.append(built.row); return { account, showStatus: built.showStatus };
    });
    body.replaceChildren(list); focusFirst();
    await readStatuses(mine);
  };
  const showForm = (account: AccountManageAccount) => {
    ++serial; say(''); title.textContent = `⚙️ 계정 수정 — ${account.name || ''}`;
    body.replaceChildren(accountManageBuildForm(account, {
      onCancel: () => { say(''); void showList(); },
      onSaved: (saved) => { void (async () => {
        accountManageSyncMainScreen(account.id, saved);
        await accountManageRefreshApp();
        if (!overlay.isConnected) return;
        say('계정 정보를 저장했습니다.'); await showList();
      })(); },
    }));
    document.getElementById('account-manage-name')?.focus();
  };
  const removeAccount = async (account: AccountManageAccount, row: HTMLElement) => {
    if (!window.confirm('이 계정을 삭제할까요? 발행 기록은 지워지지 않습니다.')) return;
    const buttons = [...row.querySelectorAll('button')]; buttons.forEach(b => { b.disabled = true; });
    say('');
    try {
      const reply = await accountManageGlobals().api?.removeBlogAccount?.(account.id);
      if (!reply?.success) { say(reply?.message || '삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요.', true); buttons.forEach(b => { b.disabled = false; }); return; }
    } catch { say('삭제 중 오류가 발생했습니다.', true); buttons.forEach(b => { b.disabled = false; }); return; }
    await accountManageRefreshApp();
    if (!overlay.isConnected) return;
    say(`'${account.name || '이름 없음'}' 계정을 삭제했습니다.`); await showList();
  };
  const resolveStop = async (account: AccountManageAccount, code: string) => {
    if (!(await showAccountPauseModal({ code }, { naverId: account.naverId }))) { say('이 계정의 멈춤 상태를 열지 못했습니다.', true); return; }
    accountManageWhenPauseClosed(() => { if (overlay.isConnected && rows.length) void readStatuses(++serial); });
  };

  const onKey = (event: KeyboardEvent) => {
    if (document.getElementById(ACCOUNT_MANAGE_PAUSE_ID)) return; // the pause panel on top handles its own keys first
    if (event.key === 'Escape') { close(); return; }
    if (event.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll<HTMLElement>(ACCOUNT_MANAGE_FOCUSABLE)];
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1]; const active = document.activeElement;
    if (!overlay.contains(active) || (event.shiftKey && active === first)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true); overlay.remove(); serial += 1;
    if (accountManageCloseCurrent === close) accountManageCloseCurrent = null;
    if (opener?.isConnected) opener.focus();
  };
  accountManageCloseCurrent?.();
  accountManageCloseCurrent = close;
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  await showList();
}

/** Bind both "⚙️ 계정 관리" buttons (publish screen and multi-account tab); safe to call again. */
export function accountManageInstallButtons(root: Document = document): void {
  for (const id of ACCOUNT_MANAGE_BUTTON_IDS) {
    const button = root.getElementById(id);
    if (!button || button.dataset.accountManageBound === '1') continue;
    button.dataset.accountManageBound = '1';
    button.addEventListener('click', () => { void accountManageOpen(); });
  }
}

if (typeof document !== 'undefined') {
  accountManageGlobals().openAccountManageWindow = accountManageOpen;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => accountManageInstallButtons(), { once: true });
  else accountManageInstallButtons();
}
