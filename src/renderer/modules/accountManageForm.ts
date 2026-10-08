// src/renderer/modules/accountManageForm.ts
// Edit form inside the account management window (별명 / 블로그 주소 / 네이버 아이디 / 새 비밀번호).
// It saves with the same two calls the multi-account edit form makes: updateBlogAccount, then
// updateAccountCredentials. A blank password keeps the saved one; the explicit checkbox clears it.
//
// NOTE: inline bundle = single scope. Every top-level identifier here is prefixed accountManage* /
// AccountManage* / ACCOUNT_MANAGE_* (see memory: identifier clash). The app never types a password into Naver.

export type AccountManageAccount = { id: string; name?: string; blogId?: string; naverId?: string };
export type AccountManageSaved = { name: string; naverId: string; password: string; clearedPassword: boolean };
type AccountManageReply = { success: boolean; message?: string };
type AccountManageFormApi = {
  updateBlogAccount?: (id: string, updates: { name: string; blogId: string }) => Promise<AccountManageReply>;
  updateAccountCredentials?: (id: string, naverId: string, password: string, clearPassword?: boolean) => Promise<AccountManageReply>;
};

const ACCOUNT_MANAGE_BLOG_ID_PATTERN = /^[a-z0-9_-]{1,100}$/i;
// A pasted Naver blog address; the main process extracts the bare id from it (this only screens out nonsense early).
const ACCOUNT_MANAGE_BLOG_URL_PATTERN = /^(?:https?:\/\/)?(?:m\.)?blog\.naver\.com\/[^\s/?#]\S*$/i;
const ACCOUNT_MANAGE_PASSWORD_NOTE = '앱은 비밀번호를 자동으로 입력하지 않습니다. 비밀번호를 바꾸셨다면 다음 발행 때 열리는 네이버 창에서 한 번 직접 로그인해 주세요.';
const ACCOUNT_MANAGE_INPUT_CSS = 'width:100%;box-sizing:border-box;padding:0.6rem 0.75rem;border-radius:8px;border:1px solid var(--border-medium,rgba(148,163,184,0.4));background:var(--bg-primary,#0f172a);color:var(--text-strong,#f1f5f9);font-size:0.9rem;';
const ACCOUNT_MANAGE_LABEL_CSS = 'display:block;font-size:0.82rem;font-weight:600;margin-bottom:0.3rem;color:var(--text-muted,#cbd5e1);';
const ACCOUNT_MANAGE_HINT_CSS = 'font-size:0.78rem;line-height:1.5;margin-top:0.3rem;color:var(--text-muted,#94a3b8);';

/** The saved blog id when it is a real one; '' for a missing value or an old display label (not a blog address). */
export function accountManageBlogIdOf(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return ACCOUNT_MANAGE_BLOG_ID_PATTERN.test(text) ? text : '';
}

function accountManageFormApi(): AccountManageFormApi | undefined {
  return (window as unknown as { api?: AccountManageFormApi }).api;
}

function accountManageControl(id: string, type: string, value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.id = id; input.type = type; input.value = value; input.style.cssText = ACCOUNT_MANAGE_INPUT_CSS;
  return input;
}

function accountManageFieldRow(control: HTMLInputElement, label: string, hint?: string, hintId?: string): HTMLElement {
  const row = document.createElement('div'); row.style.cssText = 'margin-bottom:0.85rem;';
  const caption = document.createElement('label'); caption.htmlFor = control.id; caption.textContent = label; caption.style.cssText = ACCOUNT_MANAGE_LABEL_CSS;
  row.append(caption, control);
  if (hint) {
    const note = document.createElement('div'); note.textContent = hint; note.style.cssText = ACCOUNT_MANAGE_HINT_CSS;
    if (hintId) { note.id = hintId; control.setAttribute('aria-describedby', hintId); }
    row.append(note);
  }
  return row;
}

function accountManageFormButton(action: string, text: string, primary: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.action = action; button.textContent = text;
  button.style.cssText = primary
    ? 'padding:0.55rem 1.2rem;border-radius:8px;border:none;background:#16834a;color:#fff;font-weight:600;cursor:pointer;'
    : 'padding:0.55rem 1.2rem;border-radius:8px;border:1px solid rgba(148,163,184,0.4);background:transparent;color:inherit;cursor:pointer;';
  return button;
}

/** Korean reason the typed values cannot be saved, or '' when they can. */
function accountManageProblemWith(name: string, naverId: string, blog: string): string {
  if (!name) return '별명을 입력해 주세요.';
  if (!naverId) return '네이버 아이디를 입력해 주세요.';
  if (blog && !ACCOUNT_MANAGE_BLOG_ID_PATTERN.test(blog) && !ACCOUNT_MANAGE_BLOG_URL_PATTERN.test(blog)) {
    return '블로그 주소를 확인해 주세요. 블로그 아이디나 https://blog.naver.com/아이디 형태로 입력하면 됩니다.';
  }
  return '';
}

export function accountManageBuildForm(account: AccountManageAccount, handlers: { onSaved: (saved: AccountManageSaved) => void; onCancel: () => void }): HTMLFormElement {
  const form = document.createElement('form');
  form.id = 'account-manage-form'; form.noValidate = true;
  form.addEventListener('submit', event => event.preventDefault());

  const initialBlog = accountManageBlogIdOf(account.blogId);
  const name = accountManageControl('account-manage-name', 'text', account.name ?? '');
  const blog = accountManageControl('account-manage-blog', 'text', initialBlog);
  blog.placeholder = 'https://blog.naver.com/내블로그아이디';
  const naverId = accountManageControl('account-manage-naver-id', 'text', account.naverId ?? '');
  naverId.autocomplete = 'off'; naverId.setAttribute('autocapitalize', 'off'); naverId.spellcheck = false;
  const password = accountManageControl('account-manage-password', 'password', '');
  password.setAttribute('autocomplete', 'new-password'); password.placeholder = '비워 두면 기존 비밀번호를 그대로 씁니다';
  const clear = accountManageControl('account-manage-clear-pw', 'checkbox', '');
  clear.style.cssText = 'width:1rem;height:1rem;margin:0;accent-color:#8b5cf6;cursor:pointer;';
  const clearRow = document.createElement('div'); clearRow.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.85rem;';
  const clearLabel = document.createElement('label'); clearLabel.htmlFor = clear.id; clearLabel.textContent = '저장된 비밀번호 지우기';
  clearLabel.style.cssText = 'font-size:0.85rem;cursor:pointer;';
  clearRow.append(clear, clearLabel);

  const problem = document.createElement('div');
  problem.id = 'account-manage-form-error'; problem.setAttribute('role', 'alert');
  problem.style.cssText = 'min-height:1.2rem;font-size:0.85rem;line-height:1.5;margin-bottom:0.6rem;color:#fca5a5;';
  const save = accountManageFormButton('save', '저장', true);
  const cancel = accountManageFormButton('cancel', '취소', false);
  const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end;';
  actions.append(cancel, save);
  form.append(
    accountManageFieldRow(name, '별명'),
    accountManageFieldRow(blog, '블로그 주소', '주소를 그대로 붙여 넣어도 됩니다. 비워 두면 첫 발행 때 자동으로 확인합니다.'),
    accountManageFieldRow(naverId, '네이버 아이디'),
    accountManageFieldRow(password, '새 비밀번호', ACCOUNT_MANAGE_PASSWORD_NOTE, 'account-manage-password-note'),
    clearRow, problem, actions,
  );

  const setBusy = (busy: boolean) => { for (const control of [name, blog, naverId, clear, save, cancel]) control.disabled = busy; password.disabled = busy || clear.checked; };
  clear.addEventListener('change', () => { password.disabled = clear.checked; });
  cancel.addEventListener('click', () => handlers.onCancel());

  let saving = false;
  const run = async () => {
    if (saving) return;
    const nameText = name.value.trim(); const idText = naverId.value.trim(); const typedBlog = blog.value.trim();
    const message = accountManageProblemWith(nameText, idText, typedBlog);
    problem.textContent = message;
    if (message) return;
    saving = true; setBusy(true);
    try {
      const api = accountManageFormApi();
      if (!api?.updateBlogAccount || !api.updateAccountCredentials) throw new Error('앱 업데이트 후 다시 시도해 주세요.');
      // An untouched field keeps the stored value exactly as it was (an old label must not be overwritten by '').
      const blogId = typedBlog === initialBlog ? (account.blogId ?? '') : typedBlog;
      const updated = await api.updateBlogAccount(account.id, { name: nameText, blogId });
      if (!updated?.success) { problem.textContent = updated?.message || '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'; return; }
      const cleared = clear.checked; const typedPassword = cleared ? '' : password.value;
      const credentials = await api.updateAccountCredentials(account.id, idText, typedPassword, cleared);
      if (!credentials?.success) {
        problem.textContent = `별명·블로그 주소는 저장했지만 네이버 아이디·비밀번호는 저장하지 못했습니다.${credentials?.message ? ` ${credentials.message}` : ''}`;
        return;
      }
      handlers.onSaved({ name: nameText, naverId: idText, password: typedPassword, clearedPassword: cleared });
    } catch {
      problem.textContent = '저장 중 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.';
    } finally { saving = false; setBusy(false); }
  };
  save.addEventListener('click', () => { void run(); });
  form.addEventListener('keydown', (event) => {
    const target = event.target as HTMLInputElement;
    if (event.key === 'Enter' && target?.tagName === 'INPUT' && target.type !== 'checkbox') { event.preventDefault(); void run(); }
  });
  return form;
}
