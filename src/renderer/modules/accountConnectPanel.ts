// src/renderer/modules/accountConnectPanel.ts
// "네이버 계정 연결" line for ONE account: a status chip + [네이버 로그인 창 열기] + [연결 확인].
// The login happens in the account's own real Chrome window (never inside this app, never typed by the app). Opening the panel only
// READS the status; Chrome is started only by the buttons. After [로그인 창 열기] the chip follows the window until it is connected,
// the window is closed, the panel leaves the page, or 15 minutes pass.
// NOTE: inline bundle = single scope. Every top-level identifier here is prefixed accountConnect* / ACCOUNT_CONNECT_*.

export type AccountConnectLookup = 'account' | 'naver-id';
type AccountConnectTone = 'ok' | 'warn' | 'unknown';
type AccountConnectResult = { state: string; blogId?: string; checkedAt?: number };
export type AccountConnectView = { busy?: boolean; windowOpen?: boolean; connection?: AccountConnectResult; savedLogin?: { saved: boolean; expiresAt?: number } };
type AccountConnectReply = { success: boolean; state?: AccountConnectView; message?: string };
type AccountConnectApi = { accountSafety?: (id: string, action: string, version?: number, outcome?: string, token?: string, lookup?: string) => Promise<AccountConnectReply> };
export interface AccountConnectOptions { lookup: AccountConnectLookup; getKey: () => string }

const ACCOUNT_CONNECT_POLL_MS = 4_000;
const ACCOUNT_CONNECT_POLL_MAX_MS = 15 * 60_000;
const ACCOUNT_CONNECT_STATUS_TIMEOUT_MS = 5_000;
const ACCOUNT_CONNECT_GUIDE = '비밀번호는 앱이 입력하지 않습니다. 열린 크롬 창에서 직접 로그인하세요. 로그인은 이 PC의 계정 전용 크롬에 저장돼 다음 발행 때 그대로 씁니다.';
const ACCOUNT_CONNECT_EMPTY_KEY = '네이버 아이디를 먼저 입력해주세요.';
const ACCOUNT_CONNECT_TONES: Record<AccountConnectTone, string> = {
  ok: 'color:#6ee7b7;background:rgba(16,185,129,0.15);', warn: 'color:#fcd34d;background:rgba(245,158,11,0.18);', unknown: 'color:#cbd5e1;background:rgba(148,163,184,0.18);',
};
const ACCOUNT_CONNECT_LABELS: Record<string, { text: string; tone: AccountConnectTone }> = {
  'login-required': { text: '로그인 필요', tone: 'warn' }, challenge: { text: '본인확인 필요', tone: 'warn' },
  protected: { text: '보호조치 확인 필요', tone: 'warn' }, mismatch: { text: '다른 계정 로그인됨', tone: 'warn' },
  unavailable: { text: '확인하지 못함 — 다시 눌러주세요', tone: 'unknown' },
};

const accountConnectPad = (value: number) => String(value).padStart(2, '0');
function accountConnectClock(ms?: number): string {
  if (typeof ms !== 'number') return '';
  const date = new Date(ms);
  return `${accountConnectPad(date.getHours())}:${accountConnectPad(date.getMinutes())}`;
}
function accountConnectDay(ms?: number): string {
  if (typeof ms !== 'number') return '';
  const date = new Date(ms);
  return `${accountConnectPad(date.getMonth() + 1)}/${accountConnectPad(date.getDate())}`;
}

/** The chip text for what the main process reported (the last check of this app run, else the saved-login hint). */
export function accountConnectChip(view?: AccountConnectView): { text: string; tone: AccountConnectTone } {
  const connection = view?.connection;
  if (connection?.state === 'connected') {
    const at = accountConnectClock(connection.checkedAt);
    return { text: `연결됨${connection.blogId ? ` · 블로그 ${connection.blogId}` : ''}${at ? ` (${at} 확인)` : ''}`, tone: 'ok' };
  }
  const known = connection ? ACCOUNT_CONNECT_LABELS[connection.state] : undefined;
  if (known) return known;
  const saved = view?.savedLogin;
  if (!saved) return { text: '확인 전', tone: 'unknown' };
  if (!saved.saved) return { text: '확인 전 — 저장된 로그인 없음', tone: 'unknown' };
  const until = accountConnectDay(saved.expiresAt);
  return { text: `확인 전 — 저장된 로그인 있음${until ? `(~${until} 유지 표시)` : ''}`, tone: 'unknown' };
}

function accountConnectElement<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.style.cssText = css;
  if (text !== undefined) element.textContent = text;
  return element;
}

function accountConnectButton(action: string, text: string): HTMLButtonElement {
  const button = accountConnectElement('button', 'padding:0.3rem 0.7rem;border-radius:8px;border:1px solid #60a5fa;background:transparent;color:#60a5fa;font-size:0.8rem;font-weight:600;cursor:pointer;', text);
  button.type = 'button'; button.dataset.action = action;
  return button;
}

/** One IPC call. Undefined = no answer (never reported as a state); `timeoutMs` 0 = wait as long as Chrome needs. */
async function accountConnectCall(key: string, action: string, lookup: AccountConnectLookup, timeoutMs = 0): Promise<AccountConnectReply | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const api = (window as unknown as { api?: AccountConnectApi }).api;
    if (!api?.accountSafety) return undefined;
    const request = lookup === 'naver-id' ? api.accountSafety(key, action, undefined, undefined, undefined, 'naver-id') : api.accountSafety(key, action);
    if (!timeoutMs) return await request;
    return await Promise.race([request, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })]);
  } catch { return undefined; } finally { if (timer) clearTimeout(timer); }
}

export function accountConnectBuild(options: AccountConnectOptions): { element: HTMLElement; refresh: () => Promise<void>; refreshIfKeyChanged: () => void } {
  const element = accountConnectElement('div', 'margin-top:0.5rem;padding:0.5rem 0.65rem;border:1px dashed rgba(148,163,184,0.35);border-radius:8px;');
  element.dataset.role = 'account-connect';
  const chip = accountConnectElement('span', ''); chip.dataset.role = 'connect-chip';
  const openButton = accountConnectButton('connect-open', '네이버 로그인 창 열기');
  const checkButton = accountConnectButton('connect-check', '연결 확인');
  const line = accountConnectElement('div', 'display:flex;flex-wrap:wrap;align-items:center;gap:0.4rem 0.6rem;');
  const note = accountConnectElement('div', 'font-size:0.78rem;line-height:1.5;min-height:1rem;margin-top:0.3rem;color:#93c5fd;'); note.dataset.role = 'connect-note'; note.setAttribute('role', 'status');
  line.append(chip, openButton, checkButton);
  element.append(line, note, accountConnectElement('div', 'font-size:0.76rem;line-height:1.5;color:var(--text-muted,#94a3b8);margin-top:0.2rem;', ACCOUNT_CONNECT_GUIDE));
  let shownKey: string | undefined; let lastView: AccountConnectView | undefined;
  let serial = 0; let pollToken = 0; let working = false;
  const currentKey = () => String(options.getKey() ?? '').trim();
  const say = (text: string, failed = false) => { note.textContent = text; note.style.color = failed ? '#fca5a5' : '#93c5fd'; };
  const show = (text: string, tone: AccountConnectTone) => {
    chip.textContent = text; chip.dataset.tone = tone;
    chip.style.cssText = `padding:0.15rem 0.55rem;border-radius:999px;font-size:0.76rem;font-weight:700;${ACCOUNT_CONNECT_TONES[tone]}`;
    openButton.disabled = checkButton.disabled = working || lastView?.busy === true;
  };
  const render = (view?: AccountConnectView) => { lastView = view; const { text, tone } = accountConnectChip(view); show(text, tone); };
  const showEmptyKey = () => { lastView = undefined; show('아이디 필요', 'unknown'); say(ACCOUNT_CONNECT_EMPTY_KEY); };

  const refresh = async (): Promise<void> => {
    const key = currentKey(); const mine = ++serial; pollToken += 1; shownKey = key;
    if (!key) return showEmptyKey();
    const reply = await accountConnectCall(key, 'status', options.lookup, ACCOUNT_CONNECT_STATUS_TIMEOUT_MS);
    if (mine !== serial) return;
    render(reply?.success ? reply.state : undefined);
    say(reply?.success && reply.state?.busy ? '이 계정은 지금 작업 중입니다. 끝난 뒤 눌러주세요.' : '');
  };
  const refreshIfKeyChanged = () => { if (currentKey() !== shownKey) void refresh(); };

  /** Follow the opened login window with read-only status reads until it is connected, closed, removed or timed out. */
  const startPolling = () => {
    const mine = ++pollToken; const key = currentKey(); const startedAt = Date.now();
    const tick = async (): Promise<void> => {
      if (mine !== pollToken || !element.isConnected || Date.now() - startedAt > ACCOUNT_CONNECT_POLL_MAX_MS) return;
      const reply = await accountConnectCall(key, 'status', options.lookup, ACCOUNT_CONNECT_STATUS_TIMEOUT_MS);
      if (mine !== pollToken || !element.isConnected) return;
      const view = reply?.success ? reply.state : undefined;
      if (view) {
        render(view);
        const connection = view.connection;
        if (connection?.state === 'connected' && (connection.checkedAt ?? 0) >= startedAt) { say('로그인이 확인돼 연결됐습니다.'); return; }
        if (view.windowOpen === false) { say('로그인 창이 닫혔습니다. 로그인을 마쳤다면 [연결 확인]을 눌러주세요.'); return; }
      }
      setTimeout(() => { void tick(); }, ACCOUNT_CONNECT_POLL_MS);
    };
    setTimeout(() => { void tick(); }, ACCOUNT_CONNECT_POLL_MS);
  };

  const run = async (action: 'open' | 'check') => {
    const key = currentKey();
    if (!key) return showEmptyKey();
    working = true; shownKey = key; ++serial; pollToken += 1; render(lastView);
    say(action === 'open' ? '네이버 로그인 창을 여는 중입니다…' : '연결을 확인하는 중입니다… 크롬이 열릴 수 있습니다.');
    const reply = await accountConnectCall(key, action, options.lookup);
    working = false;
    if (key !== currentKey()) { void refresh(); return; }   // the Naver ID changed while Chrome was working
    render(reply?.state ?? lastView);
    say(reply?.message || (reply ? '' : '응답을 받지 못했습니다. 잠시 뒤 다시 눌러주세요.'), !reply?.success);
    if (action === 'open' && reply?.success) startPolling();
  };
  openButton.addEventListener('click', () => { void run('open'); });
  checkButton.addEventListener('click', () => { void run('check'); });
  element.addEventListener('mouseenter', refreshIfKeyChanged); element.addEventListener('focusin', refreshIfKeyChanged);
  void refresh();
  return { element, refresh, refreshIfKeyChanged };
}

/** Put the panel under the Naver ID field of the publish screen (needs #naver-connect-slot); safe to call again. */
export function accountConnectInstallMain(root: Document = document): void {
  const slot = root.getElementById('naver-connect-slot');
  const input = root.getElementById('naver-id') as HTMLInputElement | null;
  if (!slot || !input || slot.dataset.accountConnectBound === '1') return;
  slot.dataset.accountConnectBound = '1';
  const panel = accountConnectBuild({ lookup: 'naver-id', getKey: () => input.value });
  slot.append(panel.element);
  input.addEventListener('change', () => { void panel.refresh(); });
  // The account dropdown fills the ID field from its own handler; look again after that handler ran.
  root.getElementById('main-account-selector')?.addEventListener('change', () => { setTimeout(() => panel.refreshIfKeyChanged(), 0); });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => accountConnectInstallMain(), { once: true });
  else accountConnectInstallMain();
}
