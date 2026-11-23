// Account operations the settings screen and the login flow need. No token ever passes through
// here: identities are reduced to an email and a plan label by accountIdentity.ts.
import { resolveCodexHome } from '../../image/codex/codexImageFiles.js';
import { clearAgentDetectionCache } from '../detect.js';
import { spawnCollect } from '../spawnHelper.js';
import { buildClaudeSubscriptionEnv, buildCodexSubscriptionEnv } from '../subscriptionEnv.js';
import type { AgentProvider } from '../types.js';
import { getAgentUsageWindow } from '../usageTracker.js';
import {
  readAgyAccountIdentity,
  readClaudeAccountIdentity,
  readCodexAccountIdentity,
  type AgentAccountIdentity,
} from './accountIdentity.js';
import {
  DEFAULT_ACCOUNT_ID,
  createAgentAccountRecord,
  getActiveAgentAccountId,
  isAccountScopedProvider,
  listAgentAccountRecords,
  removeAgentAccountRecord,
  setActiveAgentAccount,
  type AgentAccountRecord,
} from './accountRegistry.js';

export interface AgentAccountUsage {
  readonly callsInWindow: number;
  readonly rateLimitedAt?: number;
  readonly rateLimitResetAt?: number;
}

export interface AgentAccountSummary {
  readonly id: string;
  readonly isDefault: boolean;
  readonly active: boolean;
  readonly state: AgentAccountIdentity['state'];
  readonly email?: string;
  readonly plan?: string;
  readonly usage: AgentAccountUsage;
}

export interface AgentAccountListing {
  readonly provider: AgentProvider;
  /** False for Antigravity: one OS-keyring login, so accounts cannot be kept side by side. */
  readonly separable: boolean;
  readonly accounts: readonly AgentAccountSummary[];
}

const IDENTITY_TTL_MS = 30_000;
const identityCache = new Map<string, { at: number; identity: Promise<AgentAccountIdentity> }>();

export function invalidateAgentIdentityCache(provider?: AgentProvider): void {
  if (!provider) { identityCache.clear(); return; }
  for (const key of [...identityCache.keys()]) if (key.startsWith(`${provider}:`)) identityCache.delete(key);
}

/** Identity of one account (codex/claude: a saved or default account; gemini: the single login). */
export function readAgentAccountIdentity(provider: AgentProvider, accountId: string): Promise<AgentAccountIdentity> {
  if (provider === 'codex') return readCodexAccountIdentity(resolveCodexHome(buildCodexSubscriptionEnv(process.env, accountId)));
  if (provider === 'claude') {
    return readClaudeAccountIdentity(accountId, {
      spawn: spawnCollect,
      env: (id) => buildClaudeSubscriptionEnv(process.env, id),
    });
  }
  return readAgyAccountIdentity();
}

function cachedIdentity(provider: AgentProvider, accountId: string, now: number): Promise<AgentAccountIdentity> {
  const key = `${provider}:${accountId}`;
  const hit = identityCache.get(key);
  if (hit && now - hit.at < IDENTITY_TTL_MS) return hit.identity;
  const identity = readAgentAccountIdentity(provider, accountId);
  identityCache.set(key, { at: now, identity });
  return identity;
}

function summarize(
  provider: AgentProvider,
  id: string,
  active: boolean,
  identity: AgentAccountIdentity,
  now: number,
): AgentAccountSummary {
  const usage = getAgentUsageWindow(provider, now, id);
  return {
    id,
    isDefault: id === DEFAULT_ACCOUNT_ID,
    active,
    state: identity.state,
    ...(identity.email ? { email: identity.email } : {}),
    ...(identity.plan ? { plan: identity.plan } : {}),
    usage: {
      callsInWindow: usage.callsInWindow,
      ...(usage.rateLimitedAt ? { rateLimitedAt: usage.rateLimitedAt } : {}),
      ...(usage.rateLimitResetAt ? { rateLimitResetAt: usage.rateLimitResetAt } : {}),
    },
  };
}

export async function listAgentAccounts(provider: AgentProvider, now: number = Date.now()): Promise<AgentAccountListing> {
  if (!isAccountScopedProvider(provider)) {
    const identity = await cachedIdentity(provider, DEFAULT_ACCOUNT_ID, now);
    return { provider, separable: false, accounts: [summarize(provider, DEFAULT_ACCOUNT_ID, true, identity, now)] };
  }
  const active = getActiveAgentAccountId(provider);
  const ids = [DEFAULT_ACCOUNT_ID, ...listAgentAccountRecords(provider).map((record) => record.id)];
  const accounts = await Promise.all(ids.map(async (id) => (
    summarize(provider, id, id === active, await cachedIdentity(provider, id, now), now)
  )));
  return { provider, separable: true, accounts };
}

export function createAgentAccount(provider: AgentProvider): AgentAccountRecord {
  if (!isAccountScopedProvider(provider)) throw new Error('이 에이전트는 계정을 따로 저장할 수 없습니다.');
  return createAgentAccountRecord(provider);
}

/** Make a saved account the one every agent launch uses. Explicit user action only. */
export function switchAgentAccount(provider: AgentProvider, accountId: string): void {
  if (!isAccountScopedProvider(provider)) throw new Error('이 에이전트는 계정을 바꿀 수 없습니다.');
  setActiveAgentAccount(provider, accountId);
  invalidateAgentIdentityCache(provider);
  clearAgentDetectionCache(provider);
}

export function removeAgentAccount(provider: AgentProvider, accountId: string): { removedActive: boolean } {
  if (!isAccountScopedProvider(provider)) throw new Error('이 에이전트는 계정을 뺄 수 없습니다.');
  const result = removeAgentAccountRecord(provider, accountId);
  invalidateAgentIdentityCache(provider);
  if (result.removedActive) clearAgentDetectionCache(provider);
  return result;
}
