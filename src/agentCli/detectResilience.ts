/**
 * detectResilience.ts — separates "the probe could not answer" from "the account is logged out".
 *
 * [2026-08-23] Every generate call re-probes with forceRefresh, and each probe is a cold
 * 3-stage process chain on Windows (Electron-as-node -> codex.js -> native exe) because the
 * npm shim has no adjacent node.exe. Measured `agent:status` durations in the user's own log
 * reach 2.9s / 5.1s / 6.6s / 7.5s / 7.6s / 13.8s while idle, against an 8s probe budget — so a
 * busy machine (Chromium + image pipeline right after a post) pushes a healthy login over the
 * deadline. The old probes mapped every thrown error, timeouts included, onto not_logged_in /
 * not_installed, which told a correctly logged-in user to log in again.
 *
 * Two rules live here:
 *  1. A transient failure keeps its own code so the UI never prints login/install copy for it.
 *  2. A recent verified-available status is reused when a probe goes transient. A genuine
 *     logout still fails loudly at generation time with its own classified auth error (the same
 *     reasoning the agy login heuristic already relies on), so reuse cannot mask a real logout
 *     for longer than one request.
 */
import { AgentCliError, type AgentCliStatus, type AgentErrorCode, type AgentProvider } from './types.js';

/** Probe outcomes that say nothing about the account, only about this attempt. */
const TRANSIENT_PROBE_CODES: readonly AgentErrorCode[] = ['timeout', 'aborted', 'spawn_failed'];

/** How long a previously verified status may stand in for a probe that could not answer. */
const VERIFIED_STATUS_GRACE_MS = 6 * 60 * 60 * 1000;

const verifiedStatuses = new Map<AgentProvider, { verifiedAt: number; status: AgentCliStatus }>();

/** Return the transient error code when the failure is about the attempt, not the account. */
export function transientProbeCode(error: unknown): AgentErrorCode | undefined {
  if (error instanceof AgentCliError && TRANSIENT_PROBE_CODES.includes(error.code)) return error.code;
  return undefined;
}

/** Return the code when an already-classified probe outcome is transient. */
export function transientErrorCode(code: AgentErrorCode | undefined): AgentErrorCode | undefined {
  return code && TRANSIENT_PROBE_CODES.includes(code) ? code : undefined;
}

/** Remember a status that proved the account usable. Anything else is ignored. */
export function rememberVerifiedStatus(status: AgentCliStatus): void {
  if (status.available !== true) return;
  verifiedStatuses.set(status.provider, { verifiedAt: Date.now(), status: { ...status } });
}

/**
 * Last status that proved the account usable, while it is still inside the grace window.
 * The stored timestamp is never refreshed by a recall, so repeated transient failures cannot
 * extend the window indefinitely.
 */
export function recallVerifiedStatus(provider: AgentProvider): AgentCliStatus | undefined {
  const entry = verifiedStatuses.get(provider);
  if (!entry || Date.now() - entry.verifiedAt >= VERIFIED_STATUS_GRACE_MS) return undefined;
  return { ...entry.status };
}

/** Drop the remembered status (logout, install, or an explicit cache reset). */
export function forgetVerifiedStatus(provider?: AgentProvider): void {
  if (provider) verifiedStatuses.delete(provider);
  else verifiedStatuses.clear();
}

const PROVIDER_LABELS: Readonly<Record<AgentProvider, string>> = Object.freeze({
  codex: 'Codex',
  claude: 'Claude',
  gemini: 'Antigravity',
});

/** User-facing copy for a probe that could not answer. Never says "log in" or "install". */
export function transientProbeDetail(provider: AgentProvider, code: AgentErrorCode): string {
  const label = PROVIDER_LABELS[provider];
  if (code === 'aborted') return `${label} 상태 확인이 취소되었습니다. 다시 시도해주세요.`;
  if (code === 'spawn_failed') return `${label} CLI를 실행하지 못했습니다. 잠시 후 다시 시도해주세요.`;
  return `${label} 상태 확인이 지연돼 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.`;
}

/**
 * Status for a probe that could not answer: the remembered verified status when one is still
 * valid, otherwise an explicitly transient status that no call site may read as a logout.
 */
export function transientProbeStatus(
  provider: AgentProvider,
  code: AgentErrorCode,
  installed: boolean,
  version?: string,
): AgentCliStatus {
  const remembered = recallVerifiedStatus(provider);
  if (remembered) {
    console.warn(`[AgentCli] ${provider} 상태 프로브 ${code} — 최근 확인된 로그인 상태를 유지합니다.`);
    return remembered;
  }
  console.warn(`[AgentCli] ${provider} 상태 프로브 ${code} — 확인 실패 (로그아웃으로 간주하지 않음).`);
  return {
    provider,
    installed,
    ...(version ? { version } : {}),
    loggedIn: false,
    available: false,
    errorCode: code,
    detail: transientProbeDetail(provider, code),
  };
}
