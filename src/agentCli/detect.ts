// Install and authentication detection for subscription-backed agents.
// Status checks are deliberately metadata-only: they must never spend a model turn.
import {
  classifyExit,
  isSubscriptionInactiveMessage,
  tryExtractJson,
} from './parse.js';
import { sanitizeUserVisibleError } from '../runtime/userVisibleError.js';
import { spawnCollect } from './spawnHelper.js';
import {
  buildClaudeSubscriptionEnv,
  buildCodexSubscriptionEnv,
} from './subscriptionEnv.js';
import type {
  AgentCliStatus,
  AgentErrorCode,
  AgentProvider,
} from './types.js';
import {
  agentVersionFallbackLabel,
  parseAgentVersionOutput,
} from './version.js';

const DETECT_TIMEOUT_MS = 8_000;
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
  if (provider) {
    statusCache.delete(provider);
    advanceDetectionRevision(provider);
    return;
  }

  statusCache.clear();
  advanceDetectionRevision('codex');
  advanceDetectionRevision('claude');
}

function cacheStatus(status: AgentCliStatus, revision: number): AgentCliStatus {
  const immutableStatus = { ...status };
  if (detectionRevisions.get(status.provider) === revision) {
    statusCache.set(status.provider, { checkedAt: Date.now(), status: immutableStatus });
  }
  return immutableStatus;
}

function getCachedStatus(provider: AgentProvider): AgentCliStatus | undefined {
  const entry = statusCache.get(provider);
  if (!entry || Date.now() - entry.checkedAt >= STATUS_CACHE_TTL_MS) return undefined;
  return { ...entry.status };
}

/** Probe `<cli> --version`; ENOENT (or any error) means not installed. */
async function probeVersion(provider: AgentProvider): Promise<string | undefined> {
  try {
    const res = await spawnCollect({
      command: provider,
      args: ['--version'],
      provider,
      timeoutMs: DETECT_TIMEOUT_MS,
      env: provider === 'codex' ? buildCodexSubscriptionEnv() : buildClaudeSubscriptionEnv(),
    });
    if (res.code === 0) {
      return parseAgentVersionOutput(provider, res.stdout, res.stderr)
        ?? agentVersionFallbackLabel(provider);
    }
  } catch {
    // Missing binary or an unusable shim.
  }
  return undefined;
}

/** Codex exposes `codex login status` (for example, "Logged in using ChatGPT"). */
async function probeCodexLogin(): Promise<LoginProbe> {
  try {
    const res = await spawnCollect({
      command: 'codex',
      args: ['login', 'status'],
      provider: 'codex',
      timeoutMs: DETECT_TIMEOUT_MS,
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
  } catch {
    return { loggedIn: false, errorCode: 'not_logged_in' };
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
      timeoutMs: DETECT_TIMEOUT_MS,
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
  } catch {
    return { loggedIn: false, errorCode: 'not_logged_in' };
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

  const version = await probeVersion(provider);
  if (!version) {
    return cacheStatus({
      provider,
      installed: false,
      loggedIn: false,
      available: false,
      errorCode: 'not_installed',
    }, detectionRevision);
  }

  const login = provider === 'codex' ? await probeCodexLogin() : await probeClaudeLogin();
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

  if (provider === 'codex') {
    return cacheStatus({
      provider,
      installed: true,
      version,
      loggedIn: true,
      available: true,
      availabilityCheck: 'authentication',
      detail: login.detail,
    }, detectionRevision);
  }

  return cacheStatus({
    provider,
    installed: true,
    version,
    loggedIn: true,
    available: true,
    availabilityCheck: 'authentication',
    detail: login.detail,
  }, detectionRevision);
}
