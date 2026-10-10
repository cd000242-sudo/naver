// src/main/loginAutoResume.ts
// [2026-10-11 사장님 승인] "확인 후 재개를 안 눌러도 자동으로" — 로그인 필요·다른 계정 멈춤만 해당한다.
//   열린 네이버 창을 4초마다 읽기만 하다가(창 이동·클릭·입력·비밀번호 없음), 창이 로그인 화면을 벗어나고 직전 확인 때와
//   달라졌으면 [확인 후 재개]와 같은 확인을 한 번 한다. 실패하면 창이 다시 바뀔 때까지 기다린다(같은 창으로 반복 확인 금지).
//   본인확인·보호조치·연결 확인·발행 결과 확인 멈춤은 네이버가 따로 요구한 것이므로 지금처럼 사람이 [확인 후 재개]를 누른다.

export const LOGIN_AUTO_RESUME_CODES: readonly string[] = Object.freeze(['LOGIN_REQUIRED', 'ACCOUNT_MISMATCH']);
export const LOGIN_WATCH_INTERVAL_MS = 4_000;
export const LOGIN_WATCH_MAX_MS = 15 * 60_000;

/** 열린 창을 읽은 결과. fingerprint = 주소 + 로그인 쿠키 해시(값 자체는 담지 않는다). */
export interface LoginWindowPeek { open: boolean; onLoginPage: boolean; fingerprint: string }

export interface LoginAutoResumeDeps {
  status(id: string): { paused: boolean; code?: string; busy: boolean };
  peek(id: string): Promise<LoginWindowPeek>;
  /** [확인 후 재개]와 같은 확인. 실패해도 창을 로그인 화면으로 옮기지 않는다. 풀렸으면 true. */
  resume(id: string): Promise<boolean>;
  log?(message: string): void;
  now?(): number;
}

interface LoginWatch { startedAt: number; lastTried: string }

/** 한 번 본다. resumed = 풀었다, continue = 계속 지켜본다, stop = 그만 본다. */
export async function loginAutoResumeTick(
  id: string,
  deps: LoginAutoResumeDeps,
  watch: LoginWatch,
): Promise<'resumed' | 'continue' | 'stop'> {
  const now = deps.now ?? Date.now;
  const state = deps.status(id);
  if (!state.paused || !LOGIN_AUTO_RESUME_CODES.includes(String(state.code))) return 'stop';
  if (now() - watch.startedAt > LOGIN_WATCH_MAX_MS) return 'stop';
  if (state.busy) return 'continue';
  let peek: LoginWindowPeek;
  try { peek = await deps.peek(id); } catch { return 'continue'; }
  if (!peek.open) return 'stop';
  if (peek.onLoginPage || peek.fingerprint === watch.lastTried) return 'continue';
  watch.lastTried = peek.fingerprint;
  let resumed = false;
  try { resumed = await deps.resume(id); } catch { resumed = false; }
  deps.log?.(`[AccountGuard] 🔓 로그인 자동 확인: ${resumed ? '재개함' : '아직 아님(창이 바뀌면 다시 확인)'} · ${id.substring(0, 3)}***`);
  return resumed ? 'resumed' : 'continue';
}

const watches = new Map<string, { watch: LoginWatch; timer: ReturnType<typeof setTimeout> | null }>();

/** 지켜보기를 시작한다. 같은 계정을 이미 지켜보고 있으면 그대로 둔다. */
export function watchLoginForAutoResume(id: string, deps: LoginAutoResumeDeps): void {
  const key = String(id || '').trim().toLowerCase();
  if (!key || watches.has(key)) return;
  const entry = { watch: { startedAt: (deps.now ?? Date.now)(), lastTried: '' }, timer: null as ReturnType<typeof setTimeout> | null };
  watches.set(key, entry);
  const run = async (): Promise<void> => {
    if (watches.get(key) !== entry) return;
    const result = await loginAutoResumeTick(key, deps, entry.watch).catch(() => 'continue' as const);
    if (watches.get(key) !== entry) return;
    if (result === 'continue') entry.timer = setTimeout(() => { void run(); }, LOGIN_WATCH_INTERVAL_MS);
    else watches.delete(key);
  };
  entry.timer = setTimeout(() => { void run(); }, LOGIN_WATCH_INTERVAL_MS);
}

export function isWatchingLoginForAutoResume(id: string): boolean {
  return watches.has(String(id || '').trim().toLowerCase());
}

/** 지켜보기를 멈춘다(아이디 없으면 전부 — 앱 종료·시험 정리용). */
export function stopLoginAutoResumeWatch(id?: string): void {
  const keys = id ? [String(id).trim().toLowerCase()] : [...watches.keys()];
  for (const key of keys) {
    const entry = watches.get(key);
    if (entry?.timer) clearTimeout(entry.timer);
    watches.delete(key);
  }
}
