// [2026-10-09 사장님 승인] 무인 작업의 NETWORK_WAIT 멈춤만 2·5·10분 간격으로 최대 3번 다시 확인한다.
// 읽기 전용 확인이며 비밀번호는 입력하지 않는다. 다른 멈춤 코드는 사람이 [확인 후 재개]해야 한다.
// 타이머는 두지 않는다: 무인 작업이 그 계정을 다시 쓰려는 순간에만 1회 확인하고, 기다림은 작업 쪽이 맡는다.

/** 확인 간격(2분 → 5분 → 10분). 길이가 곧 최대 시도 횟수다. */
export const NETWORK_WAIT_RECHECK_DELAYS_MS: readonly number[] = Object.freeze([2, 5, 10].map(m => m * 60_000));
/** 다른 작업이 계정을 쓰는 중이면 이만큼 뒤에 다시 본다. */
const BUSY_RETRY_MS = 30_000;

export type NetworkWaitRecheck =
  | { kind: 'not-paused' }
  | { kind: 'resumed'; attempt: number }
  | { kind: 'wait'; attempt: number; nextAt: number }
  | { kind: 'manual'; code?: string; reason: 'other-stop' | 'exhausted' | 'needs-user' };

/** guard.getStatus 가 돌려주는 필드 중 필요한 것만. */
export interface RecheckGuardStatus { paused: boolean; code?: string; version: number; pausedAt?: string; storageError?: boolean; busy: boolean }
/** verifyAccountForUser 판정 중 필요한 것만(status: ready/login-required/challenge/protected/unknown …). */
export interface RecheckVerdict { status: string }

export interface NetworkWaitRecheckDeps {
  status(id: string): RecheckGuardStatus;
  /** 발행 기록이 미확정이거나 읽을 수 없으면 true — 이 경우 절대 풀지 않는다. */
  journalBlocked(id: string): boolean;
  ensureSession(id: string): Promise<void>;
  verify(id: string): Promise<RecheckVerdict>;
  resumeNetworkWait(id: string, verify: () => Promise<boolean>): Promise<boolean>;
  /** 확인 중 본인확인·보호조치 화면이 드러났을 때 해당 멈춤 코드로 저장한다. */
  recordStop(id: string, code: 'LOGIN_CHALLENGE' | 'ACCOUNT_PROTECTED'): void;
  now?: () => number;
}

interface Budget { version: number; attempts: number; nextAt: number; needsUser: boolean }
const budgets = new Map<string, Budget>();
const inflight = new Map<string, Promise<NetworkWaitRecheck>>();

const manual = (reason: 'exhausted' | 'needs-user'): NetworkWaitRecheck => ({ kind: 'manual', code: 'NETWORK_WAIT', reason });

async function attemptOnce(key: string, id: string, d: NetworkWaitRecheckDeps): Promise<NetworkWaitRecheck> {
  const now = d.now ?? Date.now;
  const s = d.status(id);
  if (!s.paused) { budgets.delete(key); return { kind: 'not-paused' }; }
  if (s.code !== 'NETWORK_WAIT' || s.storageError || d.journalBlocked(id)) return { kind: 'manual', code: s.code, reason: 'other-stop' };
  let b = budgets.get(key);
  if (!b || b.version !== s.version) {
    // 새 멈춤이거나 사람이 재개했다 다시 멈춘 경우: 처음부터 센다.
    const at = Date.parse(s.pausedAt ?? '');
    b = { version: s.version, attempts: 0, nextAt: (Number.isFinite(at) ? at : now()) + NETWORK_WAIT_RECHECK_DELAYS_MS[0], needsUser: false };
    budgets.set(key, b);
  }
  if (b.needsUser || b.attempts >= NETWORK_WAIT_RECHECK_DELAYS_MS.length) return manual(b.needsUser ? 'needs-user' : 'exhausted');
  if (s.busy || now() < b.nextAt) {
    return { kind: 'wait', attempt: b.attempts + 1, nextAt: s.busy ? Math.max(b.nextAt, now() + BUSY_RETRY_MS) : b.nextAt };
  }
  b.attempts += 1;
  let verdict: RecheckVerdict = { status: 'unknown' };
  let resumed = false;
  try {
    await d.ensureSession(id);
    resumed = await d.resumeNetworkWait(id, async () => {
      verdict = await d.verify(id);
      return verdict.status === 'ready' && !d.journalBlocked(id);
    });
  } catch { /* 이번 시도는 실패로 치고 다음 간격에 다시 본다. */ }
  if (resumed) { budgets.delete(key); return { kind: 'resumed', attempt: b.attempts }; }
  if (verdict.status === 'challenge' || verdict.status === 'protected') {
    try { d.recordStop(id, verdict.status === 'challenge' ? 'LOGIN_CHALLENGE' : 'ACCOUNT_PROTECTED'); } catch { /* 저장 실패여도 사람 확인으로 넘긴다. */ }
    b.needsUser = true;
  }
  if (verdict.status === 'login-required') b.needsUser = true; // 코드는 그대로 둔다(사람이 로그인하면 재개).
  if (b.needsUser || b.attempts >= NETWORK_WAIT_RECHECK_DELAYS_MS.length) return manual(b.needsUser ? 'needs-user' : 'exhausted');
  b.nextAt = now() + NETWORK_WAIT_RECHECK_DELAYS_MS[b.attempts];
  return { kind: 'wait', attempt: b.attempts + 1, nextAt: b.nextAt };
}

/** 같은 계정에 대한 동시 호출은 한 번만 확인하고 결과를 공유한다. */
export function recheckNetworkWaitStop(id: string, deps: NetworkWaitRecheckDeps): Promise<NetworkWaitRecheck> {
  const key = String(id || '').trim().toLowerCase();
  const running = inflight.get(key);
  if (running) return running;
  const task = attemptOnce(key, key, deps).finally(() => { inflight.delete(key); });
  inflight.set(key, task);
  return task;
}

/** 계정 하나(또는 전부)의 재확인 기록을 지운다(시험·계정 삭제용). */
export function forgetNetworkWaitRecheck(id?: string): void {
  if (id === undefined) { budgets.clear(); return; }
  budgets.delete(String(id).trim().toLowerCase());
}
