/**
 * Settings-only: saved accounts inside each agent card (Codex / Claude Code / Antigravity).
 * Codex and Claude Code keep one folder per account, so the list switches instantly. Antigravity
 * keeps a single OS login, so it only offers "log in with another account".
 * The bridge never carries tokens: only an email, a plan label and this app's own usage count.
 *
 * Renderer bundle note: copy-static joins renderer files into one scope, so every top-level
 * identifier here carries the settingsAgentAcct prefix.
 */
import { runAgentLoginWithCodeFallback } from './agentLoginCodePrompt.js';
import { getActivePipelineRun } from './pipelineRunCoordinator.js';

type SettingsAgentAcctProvider = 'codex' | 'claude' | 'gemini';
interface SettingsAgentAcctSummary {
  id: string;
  isDefault: boolean;
  active: boolean;
  state: 'ok' | 'not_logged_in' | 'api_key' | 'unknown';
  email?: string;
  plan?: string;
  usage?: { callsInWindow?: number; rateLimitResetAt?: number };
}

interface SettingsAgentAcctLoginResult { success?: boolean; message?: string }

const SETTINGS_AGENT_ACCT_PROVIDERS: readonly SettingsAgentAcctProvider[] = ['codex', 'claude', 'gemini'];
const settingsAgentAcctBusy = new Set<string>();
const settingsAgentAcctVersions = new Map<string, number>();

function settingsAgentAcctApi(): any { return (window as any).api; }

function settingsAgentAcctNode<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

function settingsAgentAcctButton(text: string): HTMLButtonElement {
  const button = settingsAgentAcctNode('button', text);
  button.type = 'button';
  button.style.cssText = 'padding:8px 12px;border:1px solid var(--border-gold,#6b7280);border-radius:8px;background:var(--bg-secondary,#20232b);color:var(--text-strong,#f5f5f5);cursor:pointer;font:inherit;font-size:0.82rem;margin-right:8px;';
  return button;
}

/** One short line per account. Anything unreadable is shown as "확인 불가", never guessed. */
export function settingsAgentAcctText(account: SettingsAgentAcctSummary, now = Date.now()): string {
  const parts = [account.isDefault ? '기본 계정' : (account.email || '새 계정')];
  if (account.isDefault && account.email) parts.push(account.email);
  if (account.state === 'not_logged_in') parts.push('로그인 안 됨');
  else if (account.state === 'api_key') parts.push('API 키 로그인(구독 아님)');
  else if (account.state === 'unknown' && !account.email) parts.push('확인 불가');
  else parts.push(account.plan || '플랜 확인 불가');
  const calls = account.usage?.callsInWindow;
  if (typeof calls === 'number' && calls > 0) parts.push(`최근 5시간 ${calls}회`);
  const reset = account.usage?.rateLimitResetAt;
  if (typeof reset === 'number' && reset > now) parts.push('한도 도달');
  return parts.join(' · ');
}

function settingsAgentAcctBox(provider: SettingsAgentAcctProvider): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-settings-agent-accounts="${provider}"]`);
}

function settingsAgentAcctSay(provider: SettingsAgentAcctProvider, text: string): void {
  const status = settingsAgentAcctBox(provider)?.querySelector('[role="status"]');
  if (status) status.textContent = text;
}

/** Only short plain text from the main process is shown; anything else becomes the fallback. */
function settingsAgentAcctSafe(message: unknown, fallback: string): string {
  return typeof message === 'string' && message.length > 0 && message.length <= 140 && !/[\r\n]/.test(message) ? message : fallback;
}

function settingsAgentAcctAnnounce(provider: SettingsAgentAcctProvider): void {
  try { window.dispatchEvent(new CustomEvent('agent-account-changed', { detail: { provider } })); } catch { /* UI refresh is best-effort */ }
}

function settingsAgentAcctRender(provider: SettingsAgentAcctProvider, accounts: readonly SettingsAgentAcctSummary[], separable: boolean): void {
  const box = settingsAgentAcctBox(provider);
  const list = box?.querySelector<HTMLElement>('[data-settings-agent-account-list]');
  if (!box || !list) return;
  list.replaceChildren();
  for (const account of accounts) {
    const row = settingsAgentAcctNode('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;font-size:0.85rem;';
    if (separable) {
      const radio = settingsAgentAcctNode('input');
      radio.type = 'radio'; radio.name = `settings-agent-account-${provider}`; radio.value = account.id; radio.checked = account.active;
      radio.addEventListener('change', () => { void settingsAgentAcctSwitch(provider, account.id); });
      row.append(radio);
    }
    row.append(settingsAgentAcctNode('span', settingsAgentAcctText(account)));
    list.append(row);
  }
  const remove = box.querySelector<HTMLButtonElement>('[data-settings-agent-account-remove]');
  const current = accounts.find((account) => account.active);
  if (remove) remove.disabled = !current || current.isDefault;
}

function settingsAgentAcctUnknown(provider: SettingsAgentAcctProvider): void {
  const list = settingsAgentAcctBox(provider)?.querySelector<HTMLElement>('[data-settings-agent-account-list]');
  if (list) list.replaceChildren(settingsAgentAcctNode('span', '계정 확인 불가'));
}

export async function refreshSettingsAgentAccounts(providers: readonly SettingsAgentAcctProvider[] = SETTINGS_AGENT_ACCT_PROVIDERS): Promise<void> {
  await Promise.all(providers.map(async (provider) => {
    if (!settingsAgentAcctBox(provider)) return;
    const version = (settingsAgentAcctVersions.get(provider) ?? 0) + 1;
    settingsAgentAcctVersions.set(provider, version);
    try {
      const response = await settingsAgentAcctApi()?.agentAccountList?.(provider);
      if (settingsAgentAcctVersions.get(provider) !== version) return;
      if (!response?.success || !Array.isArray(response.listing?.accounts)) throw new Error('unavailable');
      settingsAgentAcctRender(provider, response.listing.accounts, response.listing.separable === true);
    } catch {
      if (settingsAgentAcctVersions.get(provider) === version) settingsAgentAcctUnknown(provider);
    }
  }));
}

async function settingsAgentAcctSwitch(provider: SettingsAgentAcctProvider, accountId: string): Promise<boolean> {
  let message = '';
  let switched = false;
  try {
    const result = await settingsAgentAcctApi()?.agentAccountSwitch?.(provider, accountId);
    switched = result?.success === true;
    message = switched ? '계정을 바꿨습니다.' : settingsAgentAcctSafe(result?.message, '계정을 바꾸지 못했습니다.');
  } catch { message = '계정을 바꾸지 못했습니다.'; }
  if (switched) settingsAgentAcctAnnounce(provider);
  await refreshSettingsAgentAccounts([provider]);
  settingsAgentAcctSay(provider, message);
  return switched;
}

/** Adding = make a folder, log in inside it, then use it. A failed login leaves nothing behind. */
async function settingsAgentAcctAdd(provider: SettingsAgentAcctProvider): Promise<void> {
  const api = settingsAgentAcctApi();
  const box = settingsAgentAcctBox(provider);
  if (!api || !box || settingsAgentAcctBusy.has(provider)) return;
  settingsAgentAcctBusy.add(provider);
  let accountId = '';
  try {
    const created = await api.agentAccountCreate?.(provider);
    if (!created?.success || typeof created.accountId !== 'string') {
      settingsAgentAcctSay(provider, settingsAgentAcctSafe(created?.message, '계정을 추가하지 못했습니다.'));
      return;
    }
    accountId = created.accountId;
    settingsAgentAcctSay(provider, '로그인 창에서 추가할 계정으로 로그인하세요.');
    const login = await runAgentLoginWithCodeFallback<SettingsAgentAcctLoginResult>({
      provider, mountElement: box, statusElement: box.querySelector('[role="status"]') as HTMLElement, api,
      startLogin: () => api.agentLogin(provider, { accountId }),
    });
    if (!login?.success) {
      try { await api.agentAccountRemove?.(provider, accountId); } catch { /* an empty folder is harmless */ }
      await refreshSettingsAgentAccounts([provider]);
      settingsAgentAcctSay(provider, settingsAgentAcctSafe(login?.message, '로그인하지 못해 추가하지 않았습니다.'));
      return;
    }
    if (getActivePipelineRun()) {
      await refreshSettingsAgentAccounts([provider]);
      settingsAgentAcctSay(provider, '추가했습니다. 작업이 끝나면 목록에서 고르세요.');
      return;
    }
    if (!(await settingsAgentAcctSwitch(provider, accountId))) return;
    settingsAgentAcctSay(provider, '추가하고 바로 바꿨습니다.');
  } catch {
    settingsAgentAcctSay(provider, '계정을 추가하지 못했습니다.');
  } finally {
    settingsAgentAcctBusy.delete(provider);
  }
}

async function settingsAgentAcctRemove(provider: SettingsAgentAcctProvider): Promise<void> {
  const box = settingsAgentAcctBox(provider);
  const checked = box?.querySelector<HTMLInputElement>('input[type="radio"]:checked');
  if (!checked || checked.value === 'default') return;
  if (!confirm('이 계정을 앱에서 뺄까요? 서비스 계정은 지워지지 않습니다.')) return;
  let message = '';
  let removedActive = false;
  try {
    const result = await settingsAgentAcctApi()?.agentAccountRemove?.(provider, checked.value);
    removedActive = result?.removedActive === true;
    message = result?.success ? (removedActive ? '뺐습니다. 기본 계정으로 돌아갑니다.' : '뺐습니다.') : settingsAgentAcctSafe(result?.message, '계정을 빼지 못했습니다.');
  } catch { message = '계정을 빼지 못했습니다.'; }
  if (removedActive) settingsAgentAcctAnnounce(provider);
  await refreshSettingsAgentAccounts([provider]);
  settingsAgentAcctSay(provider, message);
}

/** Antigravity: one login only. Log out, then log in with the other Google account. */
async function settingsAgentAcctRelogin(provider: SettingsAgentAcctProvider): Promise<void> {
  const api = settingsAgentAcctApi();
  const box = settingsAgentAcctBox(provider);
  if (!api || !box || settingsAgentAcctBusy.has(provider)) return;
  if (!confirm('지금 계정에서 로그아웃하고 다른 계정으로 로그인할까요?')) return;
  settingsAgentAcctBusy.add(provider);
  try {
    const out = await api.agentLogout?.(provider);
    if (!out?.success) { settingsAgentAcctSay(provider, settingsAgentAcctSafe(out?.message, '로그아웃하지 못했습니다.')); return; }
    settingsAgentAcctSay(provider, '로그인 창에서 다른 계정으로 로그인하세요.');
    const login = await runAgentLoginWithCodeFallback<SettingsAgentAcctLoginResult>({
      provider, mountElement: box, statusElement: box.querySelector('[role="status"]') as HTMLElement, api,
      startLogin: () => api.agentLogin(provider),
    });
    settingsAgentAcctAnnounce(provider);
    await refreshSettingsAgentAccounts([provider]);
    settingsAgentAcctSay(provider, login?.success ? '다른 계정으로 로그인했습니다.' : settingsAgentAcctSafe(login?.message, '로그인하지 못했습니다.'));
  } catch {
    settingsAgentAcctSay(provider, '로그인하지 못했습니다.');
  } finally {
    settingsAgentAcctBusy.delete(provider);
  }
}

export function setupSettingsAgentAccounts(provider: SettingsAgentAcctProvider, parent: HTMLElement): void {
  if (parent.querySelector(`[data-settings-agent-accounts="${provider}"]`)) return;
  const box = settingsAgentAcctNode('div');
  box.dataset.settingsAgentAccounts = provider;
  box.style.cssText = 'padding:12px;border:1px solid var(--nv-line,#6b7280);border-radius:10px;background:var(--bg-secondary);';
  const list = settingsAgentAcctNode('div');
  list.dataset.settingsAgentAccountList = 'true';
  list.setAttribute('role', provider === 'gemini' ? 'group' : 'radiogroup');
  list.append(settingsAgentAcctNode('span', '계정을 확인하고 있습니다.'));
  const status = settingsAgentAcctNode('p');
  status.setAttribute('role', 'status');
  status.style.cssText = 'font-size:0.8rem;color:var(--text-muted);line-height:1.5;margin:6px 0;';
  box.append(settingsAgentAcctNode('strong', '계정'), list, status);
  if (provider === 'gemini') {
    box.append(settingsAgentAcctNode('p', '한 번에 한 계정만 로그인됩니다.'));
    const relogin = settingsAgentAcctButton('다른 계정으로 로그인');
    relogin.addEventListener('click', () => { void settingsAgentAcctRelogin(provider); });
    box.append(relogin);
  } else {
    const add = settingsAgentAcctButton('+ 계정 추가');
    add.addEventListener('click', () => { void settingsAgentAcctAdd(provider); });
    const remove = settingsAgentAcctButton('이 계정 빼기');
    remove.dataset.settingsAgentAccountRemove = 'true'; remove.disabled = true;
    remove.addEventListener('click', () => { void settingsAgentAcctRemove(provider); });
    box.append(add, remove);
  }
  parent.append(box);
}
