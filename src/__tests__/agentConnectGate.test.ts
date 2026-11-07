// @vitest-environment happy-dom
/** Pure helpers behind the startup engine gate: ordering, chips, default agent, 10s status limit. */
import { describe, expect, it, vi } from 'vitest';
import {
  agentConnectChipLabel,
  agentConnectDefaultFirst,
  agentConnectFetchKind,
  agentConnectGateNeedsConnect,
  agentConnectIsAgentValue,
  agentConnectOrderGateOptions,
  agentConnectPickDefault,
  agentConnectProviderFromValue,
} from '../renderer/modules/agentConnectGate';

const READY = { installed: true, loggedIn: true, available: true };

describe('agentConnectGate — ordering', () => {
  it('moves agent- options to the top and keeps every other order untouched', () => {
    const options = ['gemini-3.1-flash-lite', 'agent-codex', 'gemini-3.6-flash', 'agent-claude', 'agent-gemini', 'openai-gpt41']
      .map((value) => ({ value }));
    expect(agentConnectOrderGateOptions(options).map((o) => o.value)).toEqual([
      'agent-codex', 'agent-claude', 'agent-gemini', 'gemini-3.1-flash-lite', 'gemini-3.6-flash', 'openai-gpt41',
    ]);
    expect(options.map((o) => o.value)[0]).toBe('gemini-3.1-flash-lite'); // input is not mutated
  });

  it('maps agent values to providers', () => {
    expect(agentConnectIsAgentValue('agent-codex')).toBe(true);
    expect(agentConnectIsAgentValue('openai-gpt41')).toBe(false);
    expect(agentConnectProviderFromValue('agent-codex')).toBe('codex');
    expect(agentConnectProviderFromValue('agent-claude')).toBe('claude');
    expect(agentConnectProviderFromValue('agent-gemini')).toBe('gemini');
    expect(agentConnectProviderFromValue('agent-unknown')).toBeUndefined();
    expect(agentConnectProviderFromValue('gemini-3.6-flash')).toBeUndefined();
  });
});

describe('agentConnectGate — chip labels', () => {
  it('uses the exact Korean chip texts', () => {
    expect(agentConnectChipLabel('checking')).toBe('⏳ 확인 중');
    expect(agentConnectChipLabel('ready')).toBe('준비됨');
    expect(agentConnectChipLabel('install')).toBe('설치 필요');
    expect(agentConnectChipLabel('login')).toBe('로그인 필요');
    expect(agentConnectChipLabel('unavailable')).toBe('사용 불가');
    expect(agentConnectChipLabel('delayed')).toBe('확인 지연');
  });
});

describe('agentConnectGate — default agent', () => {
  const values = ['agent-codex', 'agent-claude', 'agent-gemini'];
  it('puts Claude Code first in the pre-selection order and keeps the others in their order', () => {
    expect(agentConnectDefaultFirst(values)).toEqual(['agent-claude', 'agent-codex', 'agent-gemini']);
    expect(values[0]).toBe('agent-codex'); // input is not mutated
    expect(agentConnectDefaultFirst(['agent-codex', 'agent-gemini'])).toEqual(['agent-codex', 'agent-gemini']);
    expect(agentConnectDefaultFirst([])).toEqual([]);
  });
  it('waits while the default agent itself is still being checked', () => {
    const kinds = new Map<string, any>([['agent-codex', 'ready'], ['agent-claude', 'checking'], ['agent-gemini', 'checking']]);
    expect(agentConnectPickDefault(values, kinds).settled).toBe(false);
  });
  it('picks Claude Code as soon as it is ready, without waiting for the other agents', () => {
    const kinds = new Map<string, any>([['agent-codex', 'checking'], ['agent-claude', 'ready'], ['agent-gemini', 'checking']]);
    expect(agentConnectPickDefault(values, kinds)).toEqual({ value: 'agent-claude', settled: true });
  });
  it('moves to the first other ready agent only when Claude Code is not ready', () => {
    const kinds = new Map<string, any>([['agent-codex', 'ready'], ['agent-claude', 'login'], ['agent-gemini', 'checking']]);
    expect(agentConnectPickDefault(values, kinds)).toEqual({ value: 'agent-codex', settled: true });
  });
  it('falls back to Claude Code (not the first card) when none is ready', () => {
    const kinds = new Map<string, any>([['agent-codex', 'install'], ['agent-claude', 'delayed'], ['agent-gemini', 'unavailable']]);
    expect(agentConnectPickDefault(values, kinds)).toEqual({ value: 'agent-claude', settled: true });
  });
  it('falls back to the first agent when the Claude card does not exist', () => {
    const kinds = new Map<string, any>([['agent-codex', 'install'], ['agent-gemini', 'install']]);
    expect(agentConnectPickDefault(['agent-codex', 'agent-gemini'], kinds)).toEqual({ value: 'agent-codex', settled: true });
  });
  it('has nothing to pick without agents', () => {
    expect(agentConnectPickDefault([], new Map())).toEqual({ value: '', settled: true });
  });
});

describe('agentConnectGate — status fetch with a time limit', () => {
  it('classifies the status and calls agentStatus without forceRefresh', async () => {
    const agentStatus = vi.fn(async () => ({ success: true, status: { installed: true, loggedIn: false, available: false } }));
    await expect(agentConnectFetchKind({ agentStatus } as never, 'codex')).resolves.toBe('login');
    expect(agentStatus).toHaveBeenCalledWith('codex');
    const ready = vi.fn(async () => ({ success: true, status: READY }));
    await expect(agentConnectFetchKind({ agentStatus: ready } as never, 'claude')).resolves.toBe('ready');
  });

  it('gives up after the limit instead of blocking, and never calls that "not installed"', async () => {
    const agentStatus = vi.fn(() => new Promise(() => undefined));
    const started = Date.now();
    await expect(agentConnectFetchKind({ agentStatus } as never, 'codex', 30)).resolves.toBe('delayed');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('treats a rejected call, a failed call and a missing bridge as delayed', async () => {
    await expect(agentConnectFetchKind({ agentStatus: vi.fn(async () => { throw new Error('x'); }) } as never, 'codex')).resolves.toBe('delayed');
    await expect(agentConnectFetchKind({ agentStatus: vi.fn(async () => ({ success: false })) } as never, 'codex')).resolves.toBe('delayed');
    await expect(agentConnectFetchKind(undefined, 'codex')).resolves.toBe('delayed');
  });

  it('게이트 안 연결은 설치·로그인이 없을 때만 — 지연·사용 불가·준비됨은 선택을 그대로 쓴다', () => {
    expect(agentConnectGateNeedsConnect('install')).toBe(true);
    expect(agentConnectGateNeedsConnect('login')).toBe(true);
    for (const kind of ['ready', 'delayed', 'unavailable', 'checking', undefined] as const) {
      expect(agentConnectGateNeedsConnect(kind)).toBe(false);
    }
  });
});
