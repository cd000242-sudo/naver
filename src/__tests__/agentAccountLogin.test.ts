import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({
  root: '', start: vi.fn(), detect: vi.fn(), clear: vi.fn(), identity: vi.fn(),
}));
vi.mock('electron', () => ({ app: { getPath: () => holder.root } }));
vi.mock('./mocks/electron', () => ({ app: { getPath: () => holder.root } }));
vi.mock('../agentCli/spawnHelper', () => ({ spawnCollect: vi.fn(), startSpawnSession: (...a: unknown[]) => holder.start(...a) }));
vi.mock('../agentCli/detect', () => ({
  clearAgentDetectionCache: (...a: unknown[]) => holder.clear(...a),
  detectAgent: (...a: unknown[]) => holder.detect(...a),
}));
vi.mock('../agentCli/accounts/accountService', () => ({
  readAgentAccountIdentity: (...a: unknown[]) => holder.identity(...a),
  invalidateAgentIdentityCache: vi.fn(),
}));

import { createAgentAccountRecord, getActiveAgentAccountId, getAgentAccountDir, resetAgentAccountRegistryCache } from '../agentCli/accounts/accountRegistry';
import { loginAgent } from '../agentCli/installer';

beforeEach(() => {
  holder.root = mkdtempSync(join(tmpdir(), 'bln-acct-login-'));
  for (const mock of [holder.start, holder.detect, holder.clear, holder.identity]) mock.mockReset();
  resetAgentAccountRegistryCache();
  holder.start.mockImplementation(() => ({
    result: Promise.resolve({ code: 0, stdout: '', stderr: '' }),
    writeLine: vi.fn().mockResolvedValue('accepted'),
    closeInput: vi.fn(),
    cancel: vi.fn(),
  }));
  // The active (default) account is logged in: a shortcut on it must never be mistaken for the new login.
  holder.detect.mockResolvedValue({ provider: 'codex', installed: true, loggedIn: true, available: true });
});
afterEach(() => {
  resetAgentAccountRegistryCache();
  rmSync(holder.root, { recursive: true, force: true });
});

describe('logging in to a saved account that is not active yet', () => {
  it('runs the login command inside that account folder and ignores the active account status', async () => {
    const account = createAgentAccountRecord('codex');
    holder.identity.mockResolvedValue({ state: 'ok', email: 'new@example.com', plan: 'Plus' });
    const status = await loginAgent('codex', {}, { accountId: account.id });
    expect(holder.start).toHaveBeenCalledTimes(1);
    expect(holder.start.mock.calls[0][0]).toMatchObject({ command: 'codex', args: ['login'] });
    expect(holder.start.mock.calls[0][0].env.CODEX_HOME).toBe(getAgentAccountDir('codex', account.id));
    expect(holder.detect).not.toHaveBeenCalled();
    expect(status).toMatchObject({ provider: 'codex', loggedIn: true, available: true, loginAction: 'authenticated' });
    expect(holder.identity).toHaveBeenCalledWith('codex', account.id);
  });

  it('does not make the new account active by itself', async () => {
    const account = createAgentAccountRecord('claude');
    holder.identity.mockResolvedValue({ state: 'ok', email: 'a@b.co' });
    await loginAgent('claude', {}, { accountId: account.id });
    expect(getActiveAgentAccountId('claude')).toBe('default');
    expect(holder.start.mock.calls[0][0].env.CLAUDE_CONFIG_DIR).toBe(getAgentAccountDir('claude', account.id));
  });

  it('fails when the command succeeded but that folder still holds no login', async () => {
    const account = createAgentAccountRecord('codex');
    holder.identity.mockResolvedValue({ state: 'not_logged_in' });
    await expect(loginAgent('codex', {}, { accountId: account.id })).rejects.toMatchObject({ code: 'not_logged_in' });
  });

  it('refuses an unknown account and refuses Antigravity (no folder to log in to)', async () => {
    await expect(loginAgent('codex', {}, { accountId: 'acct-aaaaaaaaaaaa' })).rejects.toBeTruthy();
    const account = createAgentAccountRecord('codex');
    await expect(loginAgent('gemini', {}, { accountId: account.id })).rejects.toBeTruthy();
    expect(holder.start).not.toHaveBeenCalled();
  });

  it('keeps the existing behaviour when no account is given', async () => {
    const status = await loginAgent('codex');
    expect(status).toMatchObject({ loginAction: 'already_authenticated' });
    expect(holder.start).not.toHaveBeenCalled();
  });
});
