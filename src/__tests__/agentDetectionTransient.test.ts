import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
}));

import { clearAgentDetectionCache, detectAgent } from '../agentCli/detect';
import { AgentCliError } from '../agentCli/types';

function codexVersion() {
  return { code: 0, stdout: 'codex-cli 0.142.2', stderr: '' };
}

function codexLoggedIn() {
  return { code: 0, stdout: 'Logged in using ChatGPT', stderr: '' };
}

function timeoutError(provider: 'codex' | 'claude' | 'gemini') {
  return new AgentCliError('timeout', provider, '8초 내 응답이 없어 중단했습니다.');
}

/**
 * Regression: a probe that could not answer used to be reported as a logout, so a correctly
 * logged-in user was told to log in again right after generating a post (the probe chain is
 * slowest exactly then). Timeouts must keep their own code forever.
 */
describe('detectAgent transient probe failures', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    clearAgentDetectionCache();
  });

  it('reports a codex login probe timeout as timeout, never as a logout', async () => {
    spawnMock
      .mockResolvedValueOnce(codexVersion())
      .mockRejectedValueOnce(timeoutError('codex'));

    const status = await detectAgent('codex');

    expect(status.errorCode).toBe('timeout');
    expect(status.errorCode).not.toBe('not_logged_in');
    expect(status.installed).toBe(true);
    expect(status.available).toBe(false);
    expect(status.detail).not.toMatch(/로그인이 필요|로그인해주세요/);
  });

  it('reports a version probe timeout as timeout, never as a missing install', async () => {
    spawnMock.mockRejectedValueOnce(timeoutError('codex'));

    const status = await detectAgent('codex');

    expect(status.errorCode).toBe('timeout');
    expect(status.errorCode).not.toBe('not_installed');
    expect(status.detail).not.toMatch(/설치/);
  });

  it('reports a claude login probe timeout as timeout, never as a logout', async () => {
    spawnMock
      .mockResolvedValueOnce({ code: 0, stdout: '2.1.0', stderr: '' })
      .mockRejectedValueOnce(timeoutError('claude'));

    const status = await detectAgent('claude');

    expect(status.errorCode).toBe('timeout');
    expect(status.errorCode).not.toBe('not_logged_in');
  });

  it('keeps a recently verified login when a later probe cannot answer', async () => {
    spawnMock
      .mockResolvedValueOnce(codexVersion())
      .mockResolvedValueOnce(codexLoggedIn())
      .mockResolvedValueOnce(codexVersion())
      .mockRejectedValueOnce(timeoutError('codex'));

    await expect(detectAgent('codex')).resolves.toMatchObject({ available: true });
    const afterTimeout = await detectAgent('codex', { forceRefresh: true });

    expect(afterTimeout).toMatchObject({ loggedIn: true, available: true });
    expect(afterTimeout.errorCode).toBeUndefined();
  });

  it('drops the remembered login when the detection cache is reset', async () => {
    spawnMock
      .mockResolvedValueOnce(codexVersion())
      .mockResolvedValueOnce(codexLoggedIn())
      .mockResolvedValueOnce(codexVersion())
      .mockRejectedValueOnce(timeoutError('codex'));

    await expect(detectAgent('codex')).resolves.toMatchObject({ available: true });
    clearAgentDetectionCache('codex');

    await expect(detectAgent('codex', { forceRefresh: true })).resolves.toMatchObject({
      available: false,
      errorCode: 'timeout',
    });
  });

  it('still reports a real logout as not_logged_in', async () => {
    spawnMock
      .mockResolvedValueOnce(codexVersion())
      .mockResolvedValueOnce(codexLoggedIn())
      .mockResolvedValueOnce(codexVersion())
      .mockResolvedValueOnce({ code: 1, stdout: 'Not logged in', stderr: '' });

    await expect(detectAgent('codex')).resolves.toMatchObject({ available: true });

    await expect(detectAgent('codex', { forceRefresh: true })).resolves.toMatchObject({
      loggedIn: false,
      available: false,
      errorCode: 'not_logged_in',
    });
  });
});
