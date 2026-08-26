// Install and authentication detection for subscription-backed agents.
// Status checks are deliberately metadata-only: they must never spend a model turn.
import {
  classifyExit,
  isSubscriptionInactiveMessage,
  tryExtractJson,
} from './parse.js';
import { sanitizeUserVisibleError } from '../runtime/userVisibleError.js';
import { spawnCollect } from './spawnHelper.js';
import { agentCommandName } from './commandName.js';
import {
  buildClaudeSubscriptionEnv,
  buildCodexSubscriptionEnv,
  buildGeminiSubscriptionEnv,
} from './subscriptionEnv.js';
import {
  forgetVerifiedStatus,
  rememberVerifiedStatus,
  transientErrorCode,
  transientProbeCode,
  transientProbeDetail,
  transientProbeStatus,
} from './detectResilience.js';
import type {
  AgentCliStatus,
  AgentErrorCode,
  AgentProvider,
} from './types.js';
import {
  agentVersionFallbackLabel,
  parseAgentVersionOutput,
} from './version.js';

// [2026-08-23] Budgets sized from the user's own log, not from the dev machine: an idle
// `agent:status` already measured 5.1-7.6s there (13.8s worst) because the Windows npm shim has
// no adjacent node.exe, so every probe boots Electron-as-node before the native binary. The old
// shared 8s deadline turned a healthy login into "log in again" whenever a post's browser and
// image work was still running.
const DETECT_TIMEOUT_MS = 12_000;
const LOGIN_PROBE_TIMEOUT_MS = 20_000;
// agy's login probe boots a local backend and refreshes the keyring token before answering.
// Measured at 3.2-3.6s on the dev machine against 78ms for `agy --version`, so the shared 8s
// budget leaves almost no headroom on a slower user PC. Only this probe gets the wider window.
const AGY_LOGIN_PROBE_TIMEOUT_MS = 30_000;
const STATUS_CACHE_TTL_MS = 30_000;

interface LoginProbe {
  loggedIn: boolean;
  detail?: string;
  subscriptionType?: string;
  authMethod?: string;
  errorCode?: AgentErrorCode;
}

export interface AgentDetectionOptions {
  /** Ignore the short UI cache. Generation paths must set this to true. */
  forceRefresh?: boolean;
}

const statusCache = new Map<AgentProvider, { checkedAt: number; status: AgentCliStatus }>();
const detectionRevisions = new Map<AgentProvider, number>();

function advanceDetectionRevision(provider: AgentProvider): number {
  const next = (detectionRevisions.get(provider) ?? 0) + 1;
  detectionRevisions.set(provider, next);
  return next;
}

export function clearAgentDetectionCache(provider?: AgentProvider): void {
  // Logout/install/logout-like resets must also drop the remembered verified status, or a
  // transient probe failure right after a logout could still be answered with "available".
  forgetVerifiedStatus(provider);
  if (provider) {
    statusCache.delete(provider);
    advanceDetectionRevision(provider);
    return;
  }

  statusCache.clear();
  advanceDetectionRevision('codex');
  advanceDetectionRevision('claude');
  advanceDetectionRevision('gemini');
}

function isCurrentDetection(provider: AgentProvider, revision: number): boolean {
  return detectionRevisions.get(provider) === revision;
}

function cacheStatus(status: AgentCliStatus, revision: number): AgentCliStatus {
  const immutableStatus = { ...status };
  if (isCurrentDetection(status.provider, revision)) {
    statusCache.set(status.provider, { checkedAt: Date.now(), status: immutableStatus });
  }
  return immutableStatus;
}

function getCachedStatus(provider: AgentProvider): AgentCliStatus | undefined {
  const entry = statusCache.get(provider);
  if (!entry || Date.now() - entry.checkedAt >= STATUS_CACHE_TTL_MS) return undefined;
  return { ...entry.status };
}

/** Build the allowlisted subprocess env for a given provider's CLI invocations. */
function buildAgentSubscriptionEnv(provider: AgentProvider): NodeJS.ProcessEnv {
  if (provider === 'codex') return buildCodexSubscriptionEnv();
  if (provider === 'gemini') return buildGeminiSubscriptionEnv();
  return buildClaudeSubscriptionEnv();
}

interface VersionProbe {
  version?: string;
  /** Set when the probe itself failed to answer; says nothing about the installation. */
  transientCode?: AgentErrorCode;
}

/**
 * Probe `<cli> --version`. ENOENT and a non-zero exit mean not installed; a timeout or a
 * failed spawn only means this attempt could not answer and must not print install copy.
 */
async function probeVersion(provider: AgentProvider): Promise<VersionProbe> {
  try {
    const res = await spawnCollect({
      command: agentCommandName(provider),
      args: ['--version'],
      provider,
      timeoutMs: DETECT_TIMEOUT_MS,
      env: buildAgentSubscriptionEnv(provider),
    });
    if (res.code === 0) {
      return {
        version: parseAgentVersionOutput(provider, res.stdout, res.stderr)
          ?? agentVersionFallbackLabel(provider),
      };
    }
  } catch (error) {
    const transientCode = transientProbeCode(error);
    if (transientCode) return { transientCode };
    // Missing binary or an unusable shim.
  }
  return {};
}

/**
 * A probe that timed out, was aborted, or failed to spawn proves nothing about the account.
 * Keeping its own code is what stops the UI from telling a logged-in user to log in again.
 */
function transientLoginProbe(provider: AgentProvider, error: unknown): LoginProbe {
  const code = transientProbeCode(error);
  if (!code) return { loggedIn: false, errorCode: 'not_logged_in' };
  return { loggedIn: false, errorCode: code, detail: transientProbeDetail(provider, code) };
}

/** Codex exposes `codex login status` (for example, "Logged in using ChatGPT"). */
async function probeCodexLogin(): Promise<LoginProbe> {
  try {
    const res = await spawnCollect({
      command: 'codex',
      args: ['login', 'status'],
      provider: 'codex',
      timeoutMs: LOGIN_PROBE_TIMEOUT_MS,
      env: buildCodexSubscriptionEnv(),
    });
    const out = `${res.stdout}\n${res.stderr}`.trim();
    const safeOut = out ? sanitizeUserVisibleError(out) : undefined;
    const statusLines = out
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const explicitlyLoggedOut = statusLines.some((line) => /\bnot\s+logged\s+in\b/i.test(line));
    const subscriptionLogin = res.code === 0
      && !explicitlyLoggedOut
      && statusLines.some((line) => /^logged in using chatgpt[.!]?$/i.test(line));
    const anyLogin = res.code === 0
      && !explicitlyLoggedOut
      && statusLines.some((line) => /^logged in(?: using .+)?[.!]?$/i.test(line));
    if (subscriptionLogin) {
      return { loggedIn: true, detail: safeOut };
    }
    if (anyLogin) {
      return {
        loggedIn: true,
        detail: 'Codex is using a non-ChatGPT billing route. Sign out and log in with ChatGPT.',
        errorCode: 'subscription_inactive',
      };
    }
    return {
      loggedIn: false,
      detail: safeOut,
      errorCode: 'not_logged_in',
    };
  } catch (error) {
    return transientLoginProbe('codex', error);
  }
}

function isExplicitlyInactiveSubscription(subscriptionType: string | undefined): boolean {
  const normalized = String(subscriptionType ?? '').trim().toLowerCase();
  return /^(?:free|none|null|inactive|expired|cancelled|canceled|lapsed|ended)$/.test(normalized);
}

function hasNonSubscriptionAuthSource(status: Record<string, unknown>, raw: string): boolean {
  const authMethod = String(status.authMethod ?? '').trim().toLowerCase();
  const apiProvider = String(status.apiProvider ?? '').trim().toLowerCase();
  const apiKeySource = String(status.apiKeySource ?? '').trim().toLowerCase();
  const subscriptionAuth = authMethod === 'claude.ai' || authMethod === 'oauth_token';

  if (!subscriptionAuth) return true;
  if (apiProvider && apiProvider !== 'firstparty' && apiProvider !== 'first_party') return true;
  if (apiKeySource
      && /api.?key.?helper|anthropic_api_key|environment|console|gateway|bedrock|vertex|foundry/.test(apiKeySource)) {
    return true;
  }
  return /api.?key.?helper|apps?.?gateway|bedrock|vertex|foundry|pay.?as.?you.?go/i.test(raw);
}

function claudeAuthenticationFailureDetail(errorCode: AgentErrorCode, raw: string): string {
  if (errorCode === 'subscription_inactive') {
    return 'Claude 로그인은 남아 있지만 현재 계정의 유료 구독을 확인하지 못했습니다.';
  }
  if (errorCode === 'not_logged_in') return 'Claude 로그인이 필요합니다.';
  if (errorCode === 'timeout') return 'Claude 로그인 상태 확인 시간이 초과되었습니다.';
  return raw.trim()
    ? sanitizeUserVisibleError(raw)
    : 'Claude 로그인 상태를 확인하지 못했습니다.';
}

/**
 * Read Claude OAuth state. Readiness requires structured auth provenance from a current CLI;
 * credential-file presence and an unstructured "Logged in" message are never sufficient.
 */
async function probeClaudeLogin(): Promise<LoginProbe> {
  try {
    const res = await spawnCollect({
      command: 'claude',
      args: ['auth', 'status'],
      provider: 'claude',
      timeoutMs: LOGIN_PROBE_TIMEOUT_MS,
      env: buildClaudeSubscriptionEnv(),
    });
    const out = `${res.stdout}\n${res.stderr}`.trim();
    if (res.code !== 0) {
      const errorCode = classifyExit('claude', res.stderr, res.stdout);
      return {
        loggedIn: errorCode === 'subscription_inactive',
        errorCode,
        detail: claudeAuthenticationFailureDetail(errorCode, out),
      };
    }
    const parsed = tryExtractJson(out);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const status = parsed as Record<string, unknown>;
      const loggedIn = status.loggedIn === true;
      const subscriptionType = typeof status.subscriptionType === 'string'
        ? status.subscriptionType
        : undefined;
      const authMethod = typeof status.authMethod === 'string' ? status.authMethod : undefined;

      if (!loggedIn) return { loggedIn: false, errorCode: 'not_logged_in' };
      if (!subscriptionType) {
        return {
          loggedIn: false,
          errorCode: 'subscription_inactive',
          detail: 'Claude 구독 유형을 확인할 수 없습니다. 최신 Claude Code로 업데이트한 뒤 Claude.ai 유료 구독 계정으로 다시 로그인해주세요.',
        };
      }
      if (isSubscriptionInactiveMessage(out) || isExplicitlyInactiveSubscription(subscriptionType)) {
        return {
          loggedIn: true,
          subscriptionType,
          authMethod,
          errorCode: 'subscription_inactive',
          detail: 'Claude 로그인은 유지되어 있지만 활성 유료 구독이 없습니다.',
        };
      }
      if (hasNonSubscriptionAuthSource(status, out)) {
        return {
          loggedIn: true,
          subscriptionType,
          authMethod,
          errorCode: 'subscription_inactive',
          detail: 'Claude API 키, Console, 클라우드 또는 게이트웨이 인증이 감지되었습니다. 구독 모드는 Claude.ai 유료 구독 로그인만 사용합니다.',
        };
      }

      const detail = subscriptionType
        ? `${authMethod || 'claude.ai'} · ${subscriptionType}`
        : (authMethod || 'Claude OAuth 로그인 확인');
      // [2026-08-26] 확인된 구독 유형을 사용량 파일에 남긴다 — 배찌가 플랜을 표시한다.
      //   여기 말고는 렌더러가 플랜을 알 방법이 없다(AgentCliStatus 에 실려 있지 않다).
      try {
        void import('./usageTracker.js').then((m) => m.recordAgentPlan('claude', subscriptionType));
      } catch { /* 표시용이다 — 실패해도 로그인 판정과 무관하다. */ }
      return { loggedIn: true, subscriptionType, authMethod, detail };
    }

    if (isSubscriptionInactiveMessage(out)) {
      return {
        loggedIn: true,
        errorCode: 'subscription_inactive',
        detail: 'Claude 구독 기간이 만료되었거나 활성 구독이 없습니다.',
      };
    }

    return {
      loggedIn: false,
      errorCode: 'subscription_inactive',
      detail: 'Claude 인증 출처를 안전하게 확인할 수 없습니다. 최신 Claude Code로 업데이트한 뒤 Claude.ai 유료 구독 계정으로 다시 로그인해주세요.',
    };
  } catch (error) {
    return transientLoginProbe('claude', error);
  }
}

/**
 * agy has no `login status` subcommand (verified against agy 1.1.5 --help) and keeps credentials
 * in the OS keyring, so there is no credential file to stat the way the retired gemini CLI's was.
 *
 * [v2.11.145] `agy models` is the cheapest command that still goes through the full auth chain:
 * it spends no generation quota but cannot answer for an account that fails to authenticate.
 *
 * This is deliberately a heuristic — an unauthenticated `agy models` could in principle still
 * print a static list. That residual case is caught downstream rather than here: the generation
 * run's own auth error is classified and surfaced, so a false "logged in" degrades into a clear
 * failure message instead of a silent wrong result.
 */
async function probeAgyLogin(): Promise<LoginProbe> {
  try {
    const res = await spawnCollect({
      command: agentCommandName('gemini'),
      args: ['models'],
      provider: 'gemini',
      timeoutMs: AGY_LOGIN_PROBE_TIMEOUT_MS,
      env: buildGeminiSubscriptionEnv(),
    });
    const models = (res.stdout ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (res.code === 0 && models.length > 0) {
      return { loggedIn: true, detail: 'Antigravity CLI 로그인 확인됨 (구독 계정)' };
    }
    const out = `${res.stdout}\n${res.stderr}`.trim();
    return {
      loggedIn: false,
      detail: out ? sanitizeUserVisibleError(out) : undefined,
      errorCode: 'not_logged_in',
    };
  } catch (error) {
    return transientLoginProbe('gemini', error);
  }
}

/** Detect installation and authentication without issuing a model request. Never rejects. */
export async function detectAgent(
  provider: AgentProvider,
  options: AgentDetectionOptions = {},
): Promise<AgentCliStatus> {
  if (!options.forceRefresh) {
    const cached = getCachedStatus(provider);
    if (cached) return cached;
  }
  const detectionRevision = advanceDetectionRevision(provider);

  const { version, transientCode: versionTransientCode } = await probeVersion(provider);
  if (versionTransientCode) {
    return cacheStatus(
      transientProbeStatus(provider, versionTransientCode, false),
      detectionRevision,
    );
  }
  if (!version) {
    return cacheStatus({
      provider,
      installed: false,
      loggedIn: false,
      available: false,
      errorCode: 'not_installed',
    }, detectionRevision);
  }

  const login = provider === 'codex'
    ? await probeCodexLogin()
    : provider === 'gemini'
      ? await probeAgyLogin()
      : await probeClaudeLogin();
  const loginTransientCode = login.loggedIn ? undefined : transientErrorCode(login.errorCode);
  if (loginTransientCode) {
    return cacheStatus(
      transientProbeStatus(provider, loginTransientCode, true, version),
      detectionRevision,
    );
  }
  if (!login.loggedIn) {
    return cacheStatus({
      provider,
      installed: true,
      version,
      loggedIn: false,
      available: false,
      errorCode: login.errorCode ?? 'not_logged_in',
      detail: login.detail,
    }, detectionRevision);
  }

  if (login.errorCode) {
    return cacheStatus({
      provider,
      installed: true,
      version,
      loggedIn: true,
      available: false,
      errorCode: login.errorCode,
      detail: login.detail,
    }, detectionRevision);
  }

  // Only a live, fully verified probe may seed the fallback used when a later probe cannot
  // answer — a reused status must never refresh its own grace window.
  const verified: AgentCliStatus = {
    provider,
    installed: true,
    version,
    loggedIn: true,
    available: true,
    availabilityCheck: 'authentication',
    detail: login.detail,
  };
  // A detection superseded by a logout/install reset must not re-seed the fallback.
  if (isCurrentDetection(provider, detectionRevision)) rememberVerifiedStatus(verified);
  return cacheStatus(verified, detectionRevision);
}
