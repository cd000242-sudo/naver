// src/main/accountConnection.ts
// "네이버 계정 연결" panel backend: shows whether this account's own Chrome is logged in, checks on request, and notices
// when a person finishes logging in. It never types a password, never pauses or resumes an account, and never moves a
// window the person may be typing in (the watch only peeks; a check moves a window only when the person pressed the button).
import { promises as fs } from 'fs';
import { getCookieFilePath } from '../sessionPersistence.js';
import { LOGIN_AUTO_RESUME_CODES, type LoginWindowPeek } from './loginAutoResume.js';

export type ConnectionState = 'connected' | 'login-required' | 'challenge' | 'protected' | 'mismatch' | 'unavailable';
export interface ConnectionResult { state: ConnectionState; blogId?: string; checkedAt: number }
/** Only whether login cookies are saved and when the earliest one lapses (ms). Never a cookie value. */
export interface SavedLogin { saved: boolean; expiresAt?: number }
interface Verdict { status: string; reason?: string; identityMismatch?: boolean; blogId?: string }

export interface ConnectionCheckDeps {
  status(id: string): { paused: boolean; code?: string; busy: boolean };
  ensureSession(id: string): Promise<void>;
  verify(id: string, options: { allowRelearn: boolean }): Promise<Verdict>;
  openWindow(id: string): Promise<void>;
  now?(): number;
}
export interface ConnectWatchDeps extends ConnectionCheckDeps {
  peek(id: string): Promise<LoginWindowPeek>;
  log?(message: string): void;
}
export interface ConnectionCheckReply { success: boolean; result?: ConnectionResult; message?: string }

export const CONNECT_WATCH_INTERVAL_MS = 4_000;
export const CONNECT_WATCH_MAX_MS = 15 * 60_000;
const BUSY_TEXT = '이 계정의 작업이 끝난 뒤 다시 확인해주세요.';
const OPEN_FAILED = '네이버 창을 열지 못했습니다. 크롬이 설치돼 있는지, 같은 계정의 다른 작업이 끝났는지 확인한 뒤 다시 눌러주세요.';
const PAUSED_NOTE = ' 이 계정은 멈춤 상태입니다. 계정 관리의 [풀기]로 재개해야 발행됩니다.';
const MESSAGES: Record<Exclude<ConnectionState, 'connected'>, string> = {
  'login-required': '네이버 로그인이 아직 되어 있지 않습니다. 열린 네이버 창에서 직접 로그인하세요(비밀번호는 앱이 입력하지 않습니다).',
  challenge: '네이버 창에 본인확인 화면이 있습니다. 그 창에서 직접 마쳐주세요.',
  protected: '네이버에서 보호조치 안내가 나왔습니다. 열린 창의 안내에 따라 해제해주세요.',
  mismatch: '선택한 계정과 다른 네이버 계정이 로그인돼 있을 수 있습니다. 열린 창에서 이 계정으로 로그인했는지 확인해주세요.',
  unavailable: '지금은 연결을 확인하지 못했습니다. 잠시 뒤 다시 눌러주세요.',
};
const WINDOW_STATES: readonly ConnectionState[] = ['login-required', 'challenge', 'protected', 'mismatch'];

const connections = new Map<string, ConnectionResult>();
const keyOf = (id: string) => String(id || '').trim().toLowerCase();
/** The last check this app run made for the account (memory only; nothing is persisted). */
export const getConnection = (id: string): ConnectionResult | undefined => connections.get(keyOf(id));
export function clearConnectionsForTest(): void { connections.clear(); }

export function mapVerdictToConnection(verdict: Verdict): ConnectionState {
  if (verdict.status === 'ready') return 'connected';
  if (verdict.status === 'login-required' || verdict.status === 'challenge' || verdict.status === 'protected') return verdict.status;
  if (verdict.identityMismatch === true || verdict.reason === 'account-identity-unverified') return 'mismatch';
  return 'unavailable';
}

/**
 * One check of the account's own Chrome. It only reads the stop state (never pause/resume), refuses while the account is busy,
 * and brings the window forward only when a person has to act and `bringWindow` allows it.
 */
export async function connectionCheck(id: string, deps: ConnectionCheckDeps,
  options: { bringWindow?: boolean; allowRelearn?: boolean } = {}): Promise<ConnectionCheckReply> {
  const { bringWindow = true, allowRelearn = true } = options;
  const before = deps.status(id);
  if (before.busy) return { success: false, message: BUSY_TEXT };
  const record = (state: ConnectionState, blogId?: string): ConnectionResult => {
    const result: ConnectionResult = { state, ...(blogId ? { blogId } : {}), checkedAt: (deps.now ?? Date.now)() };
    connections.set(keyOf(id), result); return result;
  };
  try { await deps.ensureSession(id); } catch { return { success: false, result: record('unavailable'), message: OPEN_FAILED }; }
  let verdict: Verdict;
  try { verdict = await deps.verify(id, { allowRelearn }); } catch { verdict = { status: 'unavailable' }; }
  const state = mapVerdictToConnection(verdict);
  const result = record(state, state === 'connected' ? verdict.blogId?.toLowerCase() : undefined);
  if (bringWindow && WINDOW_STATES.includes(state)) await deps.openWindow(id).catch(() => undefined);
  const text = state === 'connected' ? `연결을 확인했습니다${result.blogId ? ` (블로그: ${result.blogId})` : ''}.` : MESSAGES[state];
  return { success: true, result, message: before.paused ? text + PAUSED_NOTE : text };
}

interface ConnectWatch { startedAt: number; lastChecked: string }

/** One look at the open window. Quiet on purpose: a check from here never moves the window or replaces a learned blog. */
export async function connectWatchTick(id: string, deps: ConnectWatchDeps, watch: ConnectWatch): Promise<'connected' | 'continue' | 'stop'> {
  const state = deps.status(id);
  // A stop the auto-resume watcher owns is checked there; checking here too would verify the same window twice.
  if (state.paused && LOGIN_AUTO_RESUME_CODES.includes(String(state.code))) return 'stop';
  if ((deps.now ?? Date.now)() - watch.startedAt > CONNECT_WATCH_MAX_MS) return 'stop';
  if (state.busy) return 'continue';
  let peek: LoginWindowPeek;
  try { peek = await deps.peek(id); } catch { return 'continue'; }
  if (!peek.open) return 'stop';
  if (peek.onLoginPage || peek.fingerprint === watch.lastChecked) return 'continue';
  watch.lastChecked = peek.fingerprint;
  const reply = await connectionCheck(id, deps, { bringWindow: false, allowRelearn: false }).catch(() => undefined);
  const connected = reply?.result?.state === 'connected';
  deps.log?.(`[AccountConnect] 🔗 로그인 후 연결 확인: ${connected ? '연결됨' : '아직 아님(창이 바뀌면 다시 확인)'} · ${id.substring(0, 3)}***`);
  return connected ? 'connected' : 'continue';
}

const watches = new Map<string, { watch: ConnectWatch; timer: ReturnType<typeof setTimeout> | null }>();

/** Start watching the opened login window. Does nothing for an account the auto-resume watcher owns, or one already watched. */
export function watchLoginForConnect(id: string, deps: ConnectWatchDeps): void {
  const key = keyOf(id);
  const stop = deps.status(key);
  if (!key || watches.has(key) || (stop.paused && LOGIN_AUTO_RESUME_CODES.includes(String(stop.code)))) return;
  const entry = { watch: { startedAt: (deps.now ?? Date.now)(), lastChecked: '' }, timer: null as ReturnType<typeof setTimeout> | null };
  watches.set(key, entry);
  const run = async (): Promise<void> => {
    if (watches.get(key) !== entry) return;
    const result = await connectWatchTick(key, deps, entry.watch).catch(() => 'continue' as const);
    if (watches.get(key) !== entry) return;
    if (result === 'continue') entry.timer = setTimeout(() => { void run(); }, CONNECT_WATCH_INTERVAL_MS);
    else watches.delete(key);
  };
  entry.timer = setTimeout(() => { void run(); }, CONNECT_WATCH_INTERVAL_MS);
}

export const isWatchingLoginForConnect = (id: string): boolean => watches.has(keyOf(id));

/** Stop watching (all accounts when no id is given: app quit / test cleanup). */
export function stopLoginConnectWatch(id?: string): void {
  for (const key of id ? [keyOf(id)] : [...watches.keys()]) {
    const entry = watches.get(key);
    if (entry?.timer) clearTimeout(entry.timer);
    watches.delete(key);
  }
}

const SAFE_ACCOUNT_ID = /^[A-Za-z0-9_-]{1,100}$/;
type RawCookie = { name?: unknown; expires?: unknown };

/** valid = at least one unexpired copy; expiresAt = the latest dated copy (absent for a session cookie). */
function loginCookieLife(cookies: RawCookie[], name: string, nowSec: number): { valid: boolean; expiresAt?: number } {
  let valid = false; let session = false; let latest = 0;
  for (const cookie of cookies) {
    if (cookie?.name !== name) continue;
    const expires = cookie.expires;
    if (expires === undefined || expires === -1) { valid = true; session = true; continue; }
    if (typeof expires !== 'number' || !Number.isFinite(expires) || expires <= nowSec) continue;
    valid = true; latest = Math.max(latest, expires);
  }
  return { valid, ...(valid && !session && latest ? { expiresAt: Math.round(latest * 1000) } : {}) };
}

/**
 * Whether this account's saved cookie backup holds both Naver login cookies and when the earliest one lapses.
 * Reads expiry timestamps only: no cookie value is returned, kept or logged.
 */
export async function readSavedLogin(id: string, resolvePath: (accountId: string) => string = getCookieFilePath): Promise<SavedLogin> {
  if (!SAFE_ACCOUNT_ID.test(id)) return { saved: false };
  try {
    const parsed = JSON.parse(await fs.readFile(resolvePath(id), 'utf-8')) as { cookies?: unknown };
    const cookies = (Array.isArray(parsed?.cookies) ? parsed.cookies : []) as RawCookie[];
    const nowSec = Date.now() / 1000;
    const lives = ['NID_AUT', 'NID_SES'].map(name => loginCookieLife(cookies, name, nowSec));
    if (!lives.every(life => life.valid)) return { saved: false };
    const dated = lives.map(life => life.expiresAt).filter((value): value is number => typeof value === 'number');
    return dated.length ? { saved: true, expiresAt: Math.min(...dated) } : { saved: true };
  } catch { return { saved: false }; }
}
