import { describe, expect, it, vi } from 'vitest';
import {
  formatAgentPlanLabel,
  parseAgyAccountsFile,
  parseClaudeAuthStatus,
  parseCodexAuthFile,
  readClaudeAccountIdentity,
  readCodexAccountIdentity,
} from '../agentCli/accounts/accountIdentity';

function jwt(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part(payload)}.signature-not-verified`;
}

const SECRET_ACCESS = 'ACCESS-TOKEN-SECRET-123';
const SECRET_REFRESH = 'REFRESH-TOKEN-SECRET-456';

function codexAuth(claims: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    OPENAI_API_KEY: null,
    tokens: { id_token: jwt(claims), access_token: SECRET_ACCESS, refresh_token: SECRET_REFRESH, account_id: 'acc-1' },
    ...extra,
  });
}

describe('Codex identity from auth.json (decode only, no verification)', () => {
  it('reads the email and ChatGPT plan claims', () => {
    const identity = parseCodexAuthFile(codexAuth({
      email: 'me@example.com',
      'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' },
    }));
    expect(identity).toEqual({ state: 'ok', email: 'me@example.com', plan: 'Plus' });
  });

  it('never returns any token or raw claim', () => {
    const identity = parseCodexAuthFile(codexAuth({
      email: 'me@example.com',
      sub: 'user-secret-sub',
      'https://api.openai.com/auth': { chatgpt_plan_type: 'pro', chatgpt_account_id: 'org-secret' },
    }));
    const text = JSON.stringify(identity);
    for (const secret of [SECRET_ACCESS, SECRET_REFRESH, 'user-secret-sub', 'org-secret', 'signature-not-verified']) {
      expect(text).not.toContain(secret);
    }
  });

  it('shows the account as unknown when the claims are missing or malformed', () => {
    expect(parseCodexAuthFile(codexAuth({}))).toEqual({ state: 'ok' });
    expect(parseCodexAuthFile('{not json').state).toBe('unknown');
    expect(parseCodexAuthFile(JSON.stringify({ tokens: { id_token: 'only-one-part' } })).state).toBe('unknown');
    expect(parseCodexAuthFile(codexAuth({ email: 'line\nbreak@example.com' })).email).toBeUndefined();
    expect(parseCodexAuthFile(codexAuth({ email: 'Bearer abc' })).email).toBeUndefined();
  });

  it('reports an API-key login without echoing the key', () => {
    const identity = parseCodexAuthFile(JSON.stringify({ OPENAI_API_KEY: 'sk-live-secret-key-value-0000' }));
    expect(identity.state).toBe('api_key');
    expect(JSON.stringify(identity)).not.toContain('sk-live');
  });

  it('reads the file from the given home and reports a missing file as not logged in', async () => {
    const reader = vi.fn().mockResolvedValueOnce(codexAuth({ email: 'a@b.co' })).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ENOENT' }));
    expect((await readCodexAccountIdentity('C:\\homes\\one', reader)).email).toBe('a@b.co');
    expect(reader.mock.calls[0][0].replace(/\\/g, '/')).toMatch(/homes\/one\/auth\.json$/);
    expect(await readCodexAccountIdentity('C:\\homes\\two', reader)).toEqual({ state: 'not_logged_in' });
  });
});

describe('Claude identity from the CLI status command', () => {
  const status = JSON.stringify({
    loggedIn: true, authMethod: 'claude.ai', email: 'owner@example.com',
    orgId: 'org-secret-id', orgName: "owner's Organization", subscriptionType: 'max', planTier: 'max_20x',
    configDirectory: 'C:\\x',
  });

  it('keeps only the email and the plan', () => {
    const identity = parseClaudeAuthStatus(status);
    expect(identity).toEqual({ state: 'ok', email: 'owner@example.com', plan: 'Max 20x' });
    expect(JSON.stringify(identity)).not.toContain('org-secret-id');
  });

  it('falls back to the subscription type and handles logged-out and garbage output', () => {
    expect(parseClaudeAuthStatus(JSON.stringify({ loggedIn: true, email: 'a@b.co', subscriptionType: 'pro' })).plan).toBe('Pro');
    expect(parseClaudeAuthStatus(JSON.stringify({ loggedIn: false })).state).toBe('not_logged_in');
    expect(parseClaudeAuthStatus('Welcome to Claude').state).toBe('unknown');
  });

  it('runs the status command with the environment of the requested account', async () => {
    const spawn = vi.fn().mockResolvedValue({ code: 0, stdout: status, stderr: '' });
    const env = vi.fn().mockReturnValue({ CLAUDE_CONFIG_DIR: 'C:\\acct' });
    const identity = await readClaudeAccountIdentity('acct-0123456789ab', { spawn, env });
    expect(identity.email).toBe('owner@example.com');
    expect(env).toHaveBeenCalledWith('acct-0123456789ab');
    expect(spawn.mock.calls[0][0]).toMatchObject({ command: 'claude', args: ['auth', 'status'], env: { CLAUDE_CONFIG_DIR: 'C:\\acct' } });
  });

  it('degrades to unknown when the command cannot run', async () => {
    const spawn = vi.fn().mockRejectedValue(new Error('spawn failed: secret path'));
    const identity = await readClaudeAccountIdentity('default', { spawn, env: () => ({}) });
    expect(identity).toEqual({ state: 'unknown' });
  });
});

describe('Antigravity identity from the local account list', () => {
  it('reads the active Google account and no plan', () => {
    expect(parseAgyAccountsFile(JSON.stringify({ active: 'me@gmail.com', old: ['x@gmail.com'] })))
      .toEqual({ state: 'ok', email: 'me@gmail.com' });
  });

  it('treats an empty active entry as logged out and bad data as unknown', () => {
    expect(parseAgyAccountsFile(JSON.stringify({ active: '', old: [] })).state).toBe('not_logged_in');
    expect(parseAgyAccountsFile('nope').state).toBe('unknown');
  });
});

describe('plan labels', () => {
  it('turns raw plan names into short readable labels', () => {
    expect(formatAgentPlanLabel('plus')).toBe('Plus');
    expect(formatAgentPlanLabel('prolite')).toBe('Pro Lite');
    expect(formatAgentPlanLabel('max', 'max_5x')).toBe('Max 5x');
    expect(formatAgentPlanLabel('team')).toBe('Team');
    expect(formatAgentPlanLabel('enterprise_plus')).toBe('Enterprise Plus');
    expect(formatAgentPlanLabel(undefined)).toBeUndefined();
    expect(formatAgentPlanLabel('x'.repeat(80))).toBeUndefined();
    expect(formatAgentPlanLabel('sk-secret-value')).toBeUndefined();
  });
});
