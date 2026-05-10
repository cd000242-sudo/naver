/**
 * sessionEventLogger.ts — Session health event logger
 *
 * Writes structured NDJSON to:
 *   userData/session-events/session-YYYYMMDD.log
 *
 * Each line is a self-contained JSON record for easy grep / tail -f / import.
 */

import { app } from 'electron';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';

// ── Types ─────────────────────────────────────────────────────

export type SessionEventKind =
  | 'create'       // new browser session started
  | 'login'        // login verified (setLoggedIn true)
  | 'logout'       // login cleared (setLoggedIn false)
  | 'lock'         // session locked post-login
  | 'unlock'       // session unlocked (re-login needed)
  | 'keepalive_ok' // ping succeeded, server TTL reset
  | 'keepalive_skip'  // ping deliberately skipped (idle sim)
  | 'keepalive_fail'  // ping failed (network / page error)
  | 'expire'       // server redirect to login detected
  | 'reconnect'    // cookie restore attempted
  | 'reconnect_ok' // cookie restore succeeded
  | 'reconnect_fail' // cookie restore failed
  | 'proxy_change' // proxy URL changed, session recycled
  | 'close'        // session closed
  | 'close_all';   // all sessions closed (app shutdown)

export interface SessionEvent {
  readonly ts: string;          // ISO-8601
  readonly epoch: number;       // Date.now() for easy math
  readonly kind: SessionEventKind;
  readonly accountKey: string;  // first 3 chars + *** (privacy)
  readonly sessionAgeMin: number;  // minutes since session.createdAt
  readonly extra?: Record<string, unknown>;
}

// ── Metrics accumulator (in-memory, reset on dump) ────────────

interface AccountMetrics {
  keepaliveOk: number;
  keepaliveFail: number;
  loginCount: number;
  logoutCount: number;
  reconnectOk: number;
  reconnectFail: number;
  lastEventAt: number;
  sessionStartEpoch: number;
}

// ── Module state ──────────────────────────────────────────────

const metricsMap = new Map<string, AccountMetrics>();

function getOrInitMetrics(accountKey: string): AccountMetrics {
  if (!metricsMap.has(accountKey)) {
    metricsMap.set(accountKey, {
      keepaliveOk: 0,
      keepaliveFail: 0,
      loginCount: 0,
      logoutCount: 0,
      reconnectOk: 0,
      reconnectFail: 0,
      lastEventAt: Date.now(),
      sessionStartEpoch: Date.now(),
    });
  }
  return metricsMap.get(accountKey)!;
}

function updateMetrics(key: string, kind: SessionEventKind): void {
  const m = getOrInitMetrics(key);
  m.lastEventAt = Date.now();
  if (kind === 'keepalive_ok') m.keepaliveOk++;
  if (kind === 'keepalive_fail') m.keepaliveFail++;
  if (kind === 'login') m.loginCount++;
  if (kind === 'logout') m.logoutCount++;
  if (kind === 'reconnect_ok') m.reconnectOk++;
  if (kind === 'reconnect_fail') m.reconnectFail++;
  if (kind === 'create') m.sessionStartEpoch = Date.now();
}

// ── File path helpers ─────────────────────────────────────────

function getLogDir(): string {
  try {
    if (app?.isReady()) {
      return path.join(app.getPath('userData'), 'session-events');
    }
  } catch { /* app not ready */ }
  return path.join(os.homedir(), '.naver-blog-automation', 'session-events');
}

function todayLogPath(): string {
  const d = new Date();
  const tag = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return path.join(getLogDir(), `session-${tag}.log`);
}

// ── Write ─────────────────────────────────────────────────────

/**
 * Append one NDJSON line to today's log file.
 * Fire-and-forget — never throws to caller.
 */
export function emitSessionEvent(
  kind: SessionEventKind,
  accountId: string,
  createdAt: number,
  extra?: Record<string, unknown>
): void {
  const accountKey = accountId.substring(0, 3) + '***';
  const epoch = Date.now();
  const event: SessionEvent = {
    ts: new Date(epoch).toISOString(),
    epoch,
    kind,
    accountKey,
    sessionAgeMin: Math.floor((epoch - createdAt) / 60_000),
    ...(extra ? { extra } : {}),
  };

  updateMetrics(accountKey, kind);

  // async write — suppress all errors
  (async () => {
    try {
      const logDir = getLogDir();
      await fs.mkdir(logDir, { recursive: true });
      const line = JSON.stringify(event) + '\n';
      await fs.appendFile(todayLogPath(), line, 'utf-8');
    } catch {
      // log write failure must never crash main flow
    }
  })();
}

// ── Dump / diagnostics ────────────────────────────────────────

export interface SessionDiagnosticsReport {
  readonly generatedAt: string;
  readonly logDir: string;
  readonly accounts: readonly AccountSummary[];
}

export interface AccountSummary {
  readonly accountKey: string;
  readonly sessionAgeMin: number;
  readonly keepaliveSuccessRate: string; // "88.2%"
  readonly loginCount: number;
  readonly logoutCount: number;
  readonly reconnectOk: number;
  readonly reconnectFail: number;
  readonly lastEventAt: string;
}

/**
 * Build a diagnostics report from the in-memory metrics.
 * Called by the IPC handler for the "Session Status Dump" button.
 */
export function buildDiagnosticsReport(): SessionDiagnosticsReport {
  const now = Date.now();
  const accounts: AccountSummary[] = [];

  for (const [accountKey, m] of metricsMap) {
    const totalKa = m.keepaliveOk + m.keepaliveFail;
    const rate = totalKa === 0
      ? 'N/A'
      : `${((m.keepaliveOk / totalKa) * 100).toFixed(1)}%`;

    accounts.push({
      accountKey,
      sessionAgeMin: Math.floor((now - m.sessionStartEpoch) / 60_000),
      keepaliveSuccessRate: rate,
      loginCount: m.loginCount,
      logoutCount: m.logoutCount,
      reconnectOk: m.reconnectOk,
      reconnectFail: m.reconnectFail,
      lastEventAt: new Date(m.lastEventAt).toISOString(),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    logDir: getLogDir(),
    accounts,
  };
}

/**
 * Read today's log file and return last N lines.
 * Used by IPC to surface recent events in the UI.
 */
export async function readRecentEvents(count = 50): Promise<SessionEvent[]> {
  try {
    const raw = await fs.readFile(todayLogPath(), 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const tail = lines.slice(-count);
    return tail.map((l) => JSON.parse(l) as SessionEvent);
  } catch {
    return [];
  }
}
