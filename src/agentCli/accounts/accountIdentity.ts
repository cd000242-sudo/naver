// Read "who is logged in" locally. Only an email and a plan label ever leave this module.
//
//   Codex        auth.json -> tokens.id_token (a JWT): the payload is decoded, never verified, never returned.
//   Claude Code  `claude auth status` JSON (the CLI's own answer, local only).
//   Antigravity  ~/.gemini/google_accounts.json {active, old}. agy exposes no plan locally.
//
// Nothing here logs, caches a token, or returns a raw claim. A value that does not look like a
// plain label is dropped, so "확인 불가" is shown instead of something sensitive.
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import type { SpawnArgs, SpawnResult } from '../spawnHelper.js';
import { cleanAccountLabel } from '../officialQuotaFormat.js';
import { tryExtractJson } from '../parse.js';

export interface AgentAccountIdentity {
  readonly state: 'ok' | 'not_logged_in' | 'api_key' | 'unknown';
  readonly email?: string;
  readonly plan?: string;
}

const MAX_PLAN_LENGTH = 40;

/** "prolite" -> "Pro Lite", "max" + "max_20x" -> "Max 20x". Unknown or odd values are dropped. */
export function formatAgentPlanLabel(raw: unknown, tier?: unknown): string | undefined {
  const pick = (value: unknown): string | undefined => {
    const clean = cleanAccountLabel(value);
    return clean && clean.length <= MAX_PLAN_LENGTH && /^[A-Za-z0-9 _-]+$/.test(clean) ? clean : undefined;
  };
  const base = pick(tier) ?? pick(raw);
  if (!base) return undefined;
  const lowered = base.toLowerCase();
  if (lowered === 'prolite') return 'Pro Lite';
  return lowered.split(/[_\s-]+/).filter(Boolean)
    .map((word) => (/^\d/.test(word) ? word : `${word[0].toUpperCase()}${word.slice(1)}`))
    .join(' ');
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function decodeJwtPayload(token: unknown): Record<string, unknown> | undefined {
  if (typeof token !== 'string') return undefined;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export function parseCodexAuthFile(text: string): AgentAccountIdentity {
  let auth: Record<string, unknown>;
  try { auth = record(JSON.parse(text)); } catch { return { state: 'unknown' }; }
  const tokens = record(auth.tokens);
  if (tokens.id_token === undefined) {
    return typeof auth.OPENAI_API_KEY === 'string' && auth.OPENAI_API_KEY ? { state: 'api_key' } : { state: 'unknown' };
  }
  const claims = decodeJwtPayload(tokens.id_token);
  if (!claims) return { state: 'unknown' };
  const email = cleanAccountLabel(claims.email);
  const plan = formatAgentPlanLabel(record(claims['https://api.openai.com/auth']).chatgpt_plan_type);
  return { state: 'ok', ...(email ? { email } : {}), ...(plan ? { plan } : {}) };
}

type TextReader = (path: string, encoding: 'utf8') => Promise<string>;

export async function readCodexAccountIdentity(
  codexHome: string,
  reader: TextReader = readFile,
): Promise<AgentAccountIdentity> {
  try {
    return parseCodexAuthFile(await reader(join(codexHome, 'auth.json'), 'utf8'));
  } catch (error) {
    return (error as { code?: string })?.code === 'ENOENT' ? { state: 'not_logged_in' } : { state: 'unknown' };
  }
}

export function parseClaudeAuthStatus(stdout: string): AgentAccountIdentity {
  const parsed = tryExtractJson(stdout);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { state: 'unknown' };
  const status = parsed as Record<string, unknown>;
  if (status.loggedIn !== true) return status.loggedIn === false ? { state: 'not_logged_in' } : { state: 'unknown' };
  const email = cleanAccountLabel(status.email);
  const plan = formatAgentPlanLabel(status.subscriptionType, status.planTier);
  return { state: 'ok', ...(email ? { email } : {}), ...(plan ? { plan } : {}) };
}

export interface ClaudeIdentityDeps {
  readonly spawn: (args: SpawnArgs) => Promise<SpawnResult>;
  readonly env: (accountId: string) => NodeJS.ProcessEnv;
}

export async function readClaudeAccountIdentity(
  accountId: string,
  deps: ClaudeIdentityDeps,
): Promise<AgentAccountIdentity> {
  try {
    const result = await deps.spawn({
      command: 'claude', args: ['auth', 'status'], provider: 'claude',
      timeoutMs: 20_000, env: deps.env(accountId),
    });
    return result.code === 0 ? parseClaudeAuthStatus(result.stdout) : { state: 'unknown' };
  } catch {
    return { state: 'unknown' };
  }
}

export function parseAgyAccountsFile(text: string): AgentAccountIdentity {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { state: 'unknown' };
    const active = (parsed as Record<string, unknown>).active;
    if (typeof active !== 'string') return { state: 'unknown' };
    const email = cleanAccountLabel(active);
    return email ? { state: 'ok', email } : { state: active.trim() ? 'unknown' : 'not_logged_in' };
  } catch {
    return { state: 'unknown' };
  }
}

export async function readAgyAccountIdentity(reader: TextReader = readFile): Promise<AgentAccountIdentity> {
  try {
    return parseAgyAccountsFile(await reader(join(homedir(), '.gemini', 'google_accounts.json'), 'utf8'));
  } catch (error) {
    return (error as { code?: string })?.code === 'ENOENT' ? { state: 'not_logged_in' } : { state: 'unknown' };
  }
}
