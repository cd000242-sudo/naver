// src/renderer/modules/accountPauseModal.ts
// In-place panel for an account stop raised by a publish started from the main screen
// (single / semi-auto / full-auto / continuous). The main screen publishes with the typed or saved Naver ID,
// not a registered account, so the account-card panels never appear there: before this, the user only got a
// toast that named buttons they could not reach.
//
// NOTE: inline bundle = single scope. Every top-level identifier here is prefixed accountPauseModal* /
// AccountPauseModal* to avoid collisions (see memory: identifier clash). Credentials are never typed by the app.

type AccountPauseModalState = { paused: boolean; busy: boolean; version: number; code?: string; label?: string; pendingToken?: string };
type AccountPauseModalReply = { success: boolean; state?: AccountPauseModalState; message?: string };
type AccountPauseModalApi = {
  accountSafety?: (id: string, action: string, version?: number, outcome?: string, token?: string, lookup?: string) => Promise<AccountPauseModalReply>;
  getConfig?: () => Promise<{ savedNaverId?: string } | undefined>;
};

const ACCOUNT_PAUSE_MODAL_ID = 'account-pause-modal';
const ACCOUNT_PAUSE_MODAL_TIMEOUT_MS = 120_000; // opening Chrome + checking the editor can take a minute
const ACCOUNT_PAUSE_MODAL_STATUS_TIMEOUT_MS = 5_000;
const ACCOUNT_PAUSE_MODAL_TITLES_KEY = 'accountPauseModalTitles.v1';
const ACCOUNT_PAUSE_MODAL_TITLES_MAX = 20;
const ACCOUNT_PAUSE_MODAL_CODE_PATTERN = /\[(LOGIN_REQUIRED|LOGIN_CHALLENGE|ACCOUNT_PROTECTED|NETWORK_WAIT|ACCOUNT_MISMATCH|PUBLISH_OUTCOME_UNKNOWN)\]/;
const ACCOUNT_PAUSE_MODAL_LABELS: Record<string, string> = {
  open: '네이버 창 열기',
  'open-posts': '네이버 글 목록 열기',
  resume: '확인 후 재개',
  'confirm-published': '올라갔어요 — 발행됨 확인',
  'confirm-not-published': '안 올라갔어요 — 다시 발행 가능하게',
};
const ACCOUNT_PAUSE_MODAL_COPY: Record<string, { heading: string; reason: string }> = {
  LOGIN_REQUIRED: { heading: '네이버 로그인이 필요합니다', reason: '네이버 로그인이 풀려 발행을 멈췄습니다. [네이버 창 열기]로 열리는 창에서 직접 로그인한 뒤 [확인 후 재개]를 눌러주세요. 비밀번호는 앱이 대신 입력하지 않습니다.' },
  LOGIN_CHALLENGE: { heading: '네이버 본인확인이 필요합니다', reason: '네이버가 본인확인(보안 문자 등)을 요구해 발행을 멈췄습니다. [네이버 창 열기]로 열리는 창에서 직접 마친 뒤 [확인 후 재개]를 눌러주세요.' },
  ACCOUNT_PROTECTED: { heading: '네이버 보호조치 안내가 있습니다', reason: '계정 보호조치 화면이 감지돼 작업을 멈췄습니다. [네이버 창 열기]로 열리는 창의 안내에 따라 직접 해제한 뒤 [확인 후 재개]를 눌러주세요.' },
  NETWORK_WAIT: { heading: '연결 또는 화면 확인이 필요합니다', reason: '인터넷 연결이 불안정하거나 네이버 글쓰기 화면을 확인하지 못해 발행을 멈췄습니다. 연결을 확인하고 [확인 후 재개]를 눌러주세요. 화면이 궁금하면 [네이버 창 열기]로 직접 보세요.' },
  ACCOUNT_MISMATCH: { heading: '로그인된 계정이 다릅니다', reason: '이 아이디와 다른 네이버 계정이 로그인돼 있어 발행을 멈췄습니다. [네이버 창 열기]로 열리는 창에서 이 아이디로 다시 로그인한 뒤 [확인 후 재개]를 눌러주세요.' },
  PUBLISH_OUTCOME_UNKNOWN: { heading: '직전 글의 발행 결과 확인이 필요합니다', reason: '직전 글이 발행됐는지 확인되지 않아, 중복 발행을 막으려고 확인 전까지 발행을 멈췄습니다. 네이버 글 목록(예약 발행이었다면 예약 목록도)을 보고 알려주세요.' },
};
const ACCOUNT_PAUSE_MODAL_CONFIRM_TEXT: Record<string, string> = {
  published: '네이버 글 목록에서 게시 또는 예약 완료를 확인했나요? 이 작업은 재발행하지 않습니다.',
  'not-published': '네이버 글 목록과 예약 목록 모두에서 해당 글이 없는 것을 확인했나요? 불확실하면 취소해주세요.',
};

/** The stop code carried by a publish failure: only an explicit "[CODE]" or `.code`, never a text guess. */
export function accountPauseModalCodeOf(input: unknown): string | undefined {
  const code = input && typeof input === 'object' ? (input as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && code in ACCOUNT_PAUSE_MODAL_COPY) return code;
  const text = typeof input === 'string' ? input : input && typeof input === 'object' ? String((input as { message?: unknown }).message ?? '') : '';
  return ACCOUNT_PAUSE_MODAL_CODE_PATTERN.exec(text)?.[1];
}

function accountPauseModalApi(): AccountPauseModalApi | undefined {
  return (window as unknown as { api?: AccountPauseModalApi }).api;
}

/** One local-state or action call for the main-screen Naver ID (the id never leaves the app except to Naver's own window). */
async function accountPauseModalCall(id: string, action: string, state?: AccountPauseModalState, outcome?: string, timeoutMs = ACCOUNT_PAUSE_MODAL_TIMEOUT_MS): Promise<AccountPauseModalReply> {
  const api = accountPauseModalApi();
  if (!api?.accountSafety) throw new Error('앱 업데이트 후 계정 상태를 확인해주세요.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      api.accountSafety(id, action, state?.version, outcome, action === 'confirm' ? state?.pendingToken : undefined, 'naver-id'),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('응답이 지연됩니다. 잠시 뒤 다시 눌러주세요.')), timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function accountPauseModalResolveId(explicit?: string): Promise<string> {
  const typed = explicit ?? (document.getElementById('naver-id') as HTMLInputElement | null)?.value;
  let id = String(typed || '').trim();
  if (!id) {
    try { id = String((await accountPauseModalApi()?.getConfig?.())?.savedNaverId || '').trim(); } catch { /* No saved ID. */ }
  }
  return id.toLowerCase();
}

/*
 * Which post is "the previous post"? The publish record only keeps a hash, so the title is remembered here:
 * at dispatch we note the pending token that existed BEFORE this attempt. A different token afterwards means this
 * attempt left it pending (its title applies); the same token means an older record (use what we remembered then,
 * or say nothing). An unreadable "before" never gets a guessed title.
 */
const accountPauseModalNotes = new Map<string, { title: string; before: Promise<string | null | undefined> }>();

export function noteAccountPauseDispatch(naverId: string, title: string): void {
  const id = String(naverId || '').trim().toLowerCase();
  if (!id) return;
  const before = (async () => {
    try {
      const reply = await accountPauseModalCall(id, 'status', undefined, undefined, 2_000);
      return reply?.success && reply.state ? reply.state.pendingToken : null;
    } catch { return null; }
  })();
  accountPauseModalNotes.set(id, { title: String(title || '').trim().slice(0, 80), before });
}

function accountPauseModalReadTitles(): Record<string, string> {
  try { const parsed = JSON.parse(localStorage.getItem(ACCOUNT_PAUSE_MODAL_TITLES_KEY) || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

async function accountPauseModalTitleFor(id: string, token: string): Promise<string> {
  const note = accountPauseModalNotes.get(id);
  if (note?.title) {
    const before = await note.before;
    if (before !== null && before !== token) {
      accountPauseModalNotes.delete(id);
      try {
        const kept = Object.entries(accountPauseModalReadTitles()).slice(-(ACCOUNT_PAUSE_MODAL_TITLES_MAX - 1));
        localStorage.setItem(ACCOUNT_PAUSE_MODAL_TITLES_KEY, JSON.stringify(Object.fromEntries([...kept, [token, note.title]])));
      } catch { /* Remembering is best effort. */ }
      return note.title;
    }
  }
  const remembered = accountPauseModalReadTitles()[token];
  return typeof remembered === 'string' ? remembered : '';
}

let accountPauseModalClose: (() => void) | null = null;

function accountPauseModalElement<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.style.cssText = css;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Show the panel for a main-screen publish failure. Resolves true when a panel is on screen. */
export async function showAccountPauseModal(input: unknown, context: { naverId?: string } = {}): Promise<boolean> {
  const reported = accountPauseModalCodeOf(input);
  if (!reported) return false;
  const naverId = await accountPauseModalResolveId(context.naverId);
  if (!naverId) return false;
  const existing = document.getElementById(ACCOUNT_PAUSE_MODAL_ID);
  if (existing?.dataset.naverId === naverId && existing.dataset.code === reported) return true;
  accountPauseModalClose?.();

  let code = reported; let state: AccountPauseModalState | undefined; let resolved = false; let serial = 0; let title = '';
  const overlay = accountPauseModalElement('div', 'position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;');
  overlay.id = ACCOUNT_PAUSE_MODAL_ID; overlay.dataset.naverId = naverId; overlay.dataset.code = code;
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'account-pause-modal-heading');
  const panel = accountPauseModalElement('div', 'max-width:520px;width:92%;background:var(--bg-card,#1e293b);color:var(--text-strong,#f1f5f9);border:1px solid rgba(245,158,11,0.55);border-radius:14px;padding:1.4rem;box-shadow:0 20px 60px rgba(0,0,0,0.5);');
  const heading = accountPauseModalElement('div', 'font-size:1.05rem;font-weight:700;margin-bottom:0.6rem;');
  heading.id = 'account-pause-modal-heading';
  const reason = accountPauseModalElement('div', 'font-size:0.88rem;line-height:1.6;color:var(--text-muted,#cbd5e1);margin-bottom:0.7rem;');
  const question = accountPauseModalElement('div', 'font-size:0.95rem;font-weight:700;line-height:1.5;margin-bottom:0.7rem;color:#fbbf24;');
  const statusLine = accountPauseModalElement('div', 'font-size:0.85rem;line-height:1.5;min-height:1.2rem;margin-bottom:0.8rem;color:#93c5fd;', '계정 상태를 확인하는 중입니다…');
  statusLine.setAttribute('role', 'status');
  const actions = accountPauseModalElement('div', 'display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:flex-end;');
  panel.append(heading, reason, question, statusLine, actions); overlay.append(panel);

  const draw = () => {
    if (state?.paused && state.code && state.code in ACCOUNT_PAUSE_MODAL_COPY) { code = state.code; overlay.dataset.code = code; }
    const live = Boolean(state?.paused) && !resolved;
    heading.textContent = `${ACCOUNT_PAUSE_MODAL_COPY[code].heading} (계정: ${naverId})`;
    reason.textContent = ACCOUNT_PAUSE_MODAL_COPY[code].reason; reason.hidden = !live && state !== undefined;
    const asking = live && code === 'PUBLISH_OUTCOME_UNKNOWN' && Boolean(state?.pendingToken);
    question.hidden = !asking; question.textContent = asking ? `직전 글${title ? `(${title})` : ''}이 네이버에 올라갔나요?` : '';
    const names = !live ? [] : asking ? ['open-posts', 'confirm-published', 'confirm-not-published'] : ['open', 'resume'];
    actions.textContent = '';
    for (const name of [...names, 'close']) {
      const button = accountPauseModalElement('button', name === 'close'
        ? 'padding:0.5rem 1rem;border-radius:8px;border:1px solid rgba(148,163,184,0.4);background:transparent;color:inherit;cursor:pointer;'
        : `padding:0.5rem 1rem;border-radius:8px;border:none;background:${name === 'confirm-not-published' ? '#b45309' : '#16834a'};color:#fff;font-weight:600;cursor:pointer;`,
      name === 'close' ? '닫기' : ACCOUNT_PAUSE_MODAL_LABELS[name]);
      button.type = 'button'; button.dataset.action = name;
      button.addEventListener('click', () => {
        if (name === 'close') return accountPauseModalClose?.();
        if (name === 'confirm-published' || name === 'confirm-not-published') {
          const outcome = name === 'confirm-published' ? 'published' : 'not-published';
          if (!window.confirm(ACCOUNT_PAUSE_MODAL_CONFIRM_TEXT[outcome])) return;
          return void run('confirm', outcome);
        }
        void run(name);
      });
      actions.append(button);
    }
  };
  const finishText = (action: string, outcome: string | undefined, message?: string) => {
    const follow = action === 'resume' ? '발행 버튼을 다시 눌러주세요. 앱이 자동으로 다시 발행하지는 않습니다.'
      : outcome === 'published' ? '이미 네이버에 올라간 글이니 같은 글을 다시 발행하지 마세요.'
        : '이제 발행 버튼을 다시 눌러 발행할 수 있습니다. 앱이 자동으로 다시 발행하지는 않습니다.';
    return `${message || '처리했습니다.'} ${follow}`;
  };
  const run = async (action: string, outcome?: string) => {
    const mine = ++serial;
    actions.querySelectorAll('button').forEach(b => { b.disabled = true; });
    statusLine.textContent = action === 'open' || action === 'open-posts' ? '네이버 창을 여는 중입니다…' : '네이버 창을 열어 확인하는 중입니다(최대 1~2분)…';
    try {
      const reply = await accountPauseModalCall(naverId, action, state, outcome);
      if (!overlay.isConnected || mine !== serial) return;
      if (reply.state && (!state || reply.state.version >= state.version)) state = reply.state;
      resolved = reply.success && (action === 'resume' || action === 'confirm');
      statusLine.textContent = resolved ? finishText(action, outcome, reply.message) : (reply.message || state?.label || '상태를 확인하지 못했습니다.');
    } catch (error) {
      if (mine === serial) statusLine.textContent = error instanceof Error ? error.message : '상태 확인 실패';
    } finally { if (mine === serial && overlay.isConnected) draw(); }
  };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') accountPauseModalClose?.(); };
  const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); if (accountPauseModalClose === close) accountPauseModalClose = null; };
  accountPauseModalClose = close;
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  draw(); document.body.append(overlay);

  try {
    const reply = await accountPauseModalCall(naverId, 'status', undefined, undefined, ACCOUNT_PAUSE_MODAL_STATUS_TIMEOUT_MS);
    if (!overlay.isConnected) return true;
    if (!reply.success || !reply.state) throw new Error(reply.message || '계정 상태를 확인하지 못했습니다.');
    state = reply.state;
    if (state.paused && code === 'PUBLISH_OUTCOME_UNKNOWN' && state.pendingToken) title = await accountPauseModalTitleFor(naverId, state.pendingToken);
    statusLine.textContent = state.paused ? ''
      : '현재 이 계정에 걸린 멈춤이 없습니다. 직전 글이 불확실하면 네이버 글 목록을 먼저 확인한 뒤, 필요하면 발행 버튼을 다시 눌러주세요.';
  } catch (error) {
    if (overlay.isConnected) statusLine.textContent = error instanceof Error ? error.message : '계정 상태를 확인하지 못했습니다.';
  }
  if (overlay.isConnected) draw();
  return true;
}
