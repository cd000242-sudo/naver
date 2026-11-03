import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFile } from 'fs/promises';
import { getAgentGlobalPrefix } from '../agentCli/agentRuntime';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
}));

import { runClaude } from '../agentCli/claudeRunner';
import { runCodex } from '../agentCli/codexRunner';
import { generateWithAgent } from '../agentCli';
import { clearAgentDetectionCache, detectAgent } from '../agentCli/detect';
import { buildCodexSubscriptionEnv } from '../agentCli/subscriptionEnv';
import { AGENT_TIER_PROFILES, resolveAgentRunProfile } from '../agentCli/agentModelDefaults';
import { AGENT_MIN_VERSIONS, isAgentVersionBelowMinimum } from '../agentCli/agentMinVersion';
import { parseAbsoluteResetAt } from '../agentCli/rateLimitReset';
import { parseRateLimitReset } from '../agentCli/usageTracker';
import { AGENT_NPM_PACKAGE_VERSIONS } from '../agentCli/installer';
import { classifyExit } from '../agentCli/parse';
import { agentConnectClassify, agentConnectRun } from '../renderer/modules/agentConnectFlow';
import { agentConnectChipLabel, agentConnectGateNeedsConnect } from '../renderer/modules/agentConnectGate';

const LIMIT_TEXT = 'You\u2019ve hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Nov 4th, 2026 3:42 PM.';
const codexArgs = (): string[] => {
  const calls = spawnMock.mock.calls.filter((c) => c[0]?.args?.[0] === 'exec');
  return calls[calls.length - 1][0].args;
};
function codexOk(): void {
  spawnMock.mockImplementation(async (opts: { args: string[] }) => {
    if (!opts?.args) return { code: 0, stdout: '', stderr: '' };
    await writeFile(opts.args[opts.args.indexOf('-o') + 1], '완성', 'utf8');
    return { code: 0, stdout: '', stderr: '' };
  });
}

describe('tier profiles (codex main/light, claude both sonnet)', () => {
  beforeEach(() => spawnMock.mockReset());

  it('constants: codex gpt-6.1-terra medium/low, claude claude-sonnet-5-5 for both tiers', () => {
    expect(AGENT_TIER_PROFILES.codex.main).toEqual({ model: 'gpt-6.1-terra', effort: 'medium' });
    expect(AGENT_TIER_PROFILES.codex.light).toEqual({ model: 'gpt-6.1-terra', effort: 'low' });
    expect(AGENT_TIER_PROFILES.claude.main.model).toBe('claude-sonnet-5-5');
    expect(AGENT_TIER_PROFILES.claude.light.model).toBe('claude-sonnet-5-5');
    expect(resolveAgentRunProfile('gemini', { tier: 'light' })).toEqual({ tier: 'light' });
  });

  it('runCodex passes the model and effort itself, ignoring the user config; default tier is main', async () => {
    codexOk();
    await runCodex('p');
    expect(codexArgs()).toEqual(expect.arrayContaining(['--ignore-user-config', '-m', 'gpt-6.1-terra', '-c', 'model_reasoning_effort=medium']));
    await runCodex('p', { tier: 'light' });
    expect(codexArgs()).toEqual(expect.arrayContaining(['-m', 'gpt-6.1-terra', '-c', 'model_reasoning_effort=low']));
    await runCodex('p', { tier: 'light', model: 'gpt-6-astra' });
    expect(codexArgs()).toEqual(expect.arrayContaining(['-m', 'gpt-6-astra', '-c', 'model_reasoning_effort=low']));
  });

  it('runClaude uses sonnet for light calls too (no Haiku)', async () => {
    spawnMock.mockResolvedValue({ code: 0, stdout: JSON.stringify({ is_error: false, result: 'ok' }), stderr: '' });
    await runClaude('p', { tier: 'light' });
    const args = spawnMock.mock.calls[0][0].args as string[];
    expect(args).toEqual(expect.arrayContaining(['--model', 'claude-sonnet-5-5']));
  });
});

describe('usage-limit notice with the reset moment', () => {
  beforeEach(() => spawnMock.mockReset());

  it('parses the absolute local time, with either apostrophe', () => {
    const at = new Date(parseAbsoluteResetAt(LIMIT_TEXT) as number);
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2026, 10, 4, 15, 42]);
    expect(parseAbsoluteResetAt("You've hit your usage limit ... try again at Nov 4th, 2026 3:42 PM.")).toBe(parseAbsoluteResetAt(LIMIT_TEXT));
    expect(parseRateLimitReset(LIMIT_TEXT)).toBe(parseAbsoluteResetAt(LIMIT_TEXT));
    expect(parseAbsoluteResetAt('no date here')).toBeUndefined();
  });

  it('a long echoed prompt before the ERROR line still yields rate_limited with a Korean dated notice', async () => {
    const stderr = `OpenAI Codex v0.166.0\nmodel: gpt-6.1-terra\nuser\n${'긴 프롬프트 '.repeat(400)}\nERROR: ${LIMIT_TEXT}\nERROR: ${LIMIT_TEXT}`;
    spawnMock.mockResolvedValue({ code: 1, stdout: '', stderr });
    const error = await runCodex('p').catch((e) => e);
    expect(error.code).toBe('rate_limited');
    expect(error.message).toContain('Codex 구독 한도 소진 — 11월 4일 15시 42분 이후 다시 시도');
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(classifyExit('codex', stderr)).toBe('rate_limited');
  });

  it('an exit-0 run that ended on the limit is rate_limited, not empty_output', async () => {
    spawnMock.mockResolvedValue({ code: 0, stdout: '', stderr: `ERROR: ${LIMIT_TEXT}` });
    const error = await runCodex('p').catch((e) => e);
    expect(error.code).toBe('rate_limited');
    expect(error.message).toContain('11월 4일 15시 42분');
  });
});

describe('Codex minimum version 0.159.0', () => {
  beforeEach(() => { spawnMock.mockReset(); clearAgentDetectionCache('codex'); });

  it('version comparison; unreadable versions never block; only codex has a minimum', () => {
    expect(AGENT_MIN_VERSIONS.codex).toBe('0.159.0');
    expect(isAgentVersionBelowMinimum('codex', 'Codex CLI 0.158.9')).toBe(true);
    expect(isAgentVersionBelowMinimum('codex', 'Codex CLI 0.144.1')).toBe(true);
    expect(isAgentVersionBelowMinimum('codex', 'Codex CLI 0.159.0')).toBe(false);
    expect(isAgentVersionBelowMinimum('codex', 'Codex CLI 0.166.0')).toBe(false);
    expect(isAgentVersionBelowMinimum('codex', 'Codex CLI')).toBe(false);
    expect(isAgentVersionBelowMinimum('claude', 'Claude Code 1.0.0')).toBe(false);
  });

  it('the installer pin is 0.166.0 and satisfies the minimum', () => {
    expect(AGENT_NPM_PACKAGE_VERSIONS.codex).toBe('0.166.0');
    expect(isAgentVersionBelowMinimum('codex', AGENT_NPM_PACKAGE_VERSIONS.codex)).toBe(false);
  });

  const versionSpawn = (version: string) => spawnMock.mockImplementation(async (opts: { args: string[] }) => (
    opts.args[0] === '--version'
      ? { code: 0, stdout: `codex-cli ${version}\n`, stderr: '' }
      : { code: 0, stdout: 'Logged in using ChatGPT\n', stderr: '' }));

  it('detect: an old install is update_required (installed, not logged-in-probed), a new one is available', async () => {
    versionSpawn('0.144.1');
    const old = await detectAgent('codex', { forceRefresh: true });
    expect(old).toMatchObject({ installed: true, available: false, errorCode: 'update_required' });
    expect(old.detail).toContain('0.159.0');
    expect(spawnMock.mock.calls.some((c) => c[0].args[0] === 'login')).toBe(false);
    clearAgentDetectionCache('codex');
    versionSpawn('0.166.0');
    expect(await detectAgent('codex', { forceRefresh: true })).toMatchObject({ installed: true, loggedIn: true, available: true });
  });

  it('generateWithAgent stops with update_required and never launches exec', async () => {
    versionSpawn('0.144.1');
    const error = await generateWithAgent({ provider: 'codex', prompt: '글' }).catch((e) => e);
    expect(error.code).toBe('update_required');
    expect(spawnMock.mock.calls.some((c) => c[0].args[0] === 'exec')).toBe(false);
  });

  it.skipIf(process.platform !== 'win32')('PATH order: the app-owned folder comes before the user npm folder and older copies', () => {
    const saved = process.env.APPDATA;
    process.env.APPDATA = 'C:\\Users\\u\\AppData\\Roaming';
    try {
      const env = buildCodexSubscriptionEnv({ Path: 'C:\\Old\\Global;C:\\Windows' } as NodeJS.ProcessEnv);
      const entries = String(env.Path ?? env.PATH).split(';');
      const appFolder = getAgentGlobalPrefix();
      expect(entries[0]).toBe(appFolder);
      expect(entries.indexOf(appFolder)).toBeLessThan(entries.indexOf('C:\\Users\\u\\AppData\\Roaming\\npm'));
      expect(entries.indexOf(appFolder)).toBeLessThan(entries.indexOf('C:\\Old\\Global'));
    } finally {
      if (saved === undefined) delete process.env.APPDATA; else process.env.APPDATA = saved;
    }
  });
});

describe('connect flow: update_required goes to the install step', () => {
  const ready = { installed: true, loggedIn: true, available: true };
  const stale = { installed: true, loggedIn: false, available: false, errorCode: 'update_required' as const };
  function makeApi(statuses: unknown[]) {
    const agentStatus = vi.fn(async () => ({ success: true, status: statuses.shift() }));
    const agentInstall = vi.fn(async () => ({ success: true }));
    const agentGenerate = vi.fn(async () => ({ success: true, text: 'BLN-abc123' }));
    return { api: { agentStatus, agentInstall, agentGenerate } as never, agentInstall, agentGenerate };
  }

  it('classification, chip label and gate', () => {
    expect(agentConnectClassify(stale)).toBe('update');
    expect(agentConnectChipLabel('update')).toBe('업데이트 필요');
    expect(agentConnectGateNeedsConnect('update')).toBe(true);
    expect(agentConnectChipLabel('install')).toBe('설치 필요');
  });

  it('1/4 sees the old version, 2/4 installs, 4/4 asks with the light tier', async () => {
    const { api, agentInstall, agentGenerate } = makeApi([stale, ready]);
    const lines: string[] = [];
    const result = await agentConnectRun({
      provider: 'codex', api, mountElement: {} as HTMLElement, statusElement: {} as HTMLElement,
      report: (line) => lines.push(line), createMarker: () => 'BLN-abc123',
    });
    expect(result.ok).toBe(true);
    expect(agentInstall).toHaveBeenCalledTimes(1);
    expect(lines.some((l) => l.includes('[2/4') && l.includes('업데이트'))).toBe(true);
    expect(agentGenerate.mock.calls[0][0]).toMatchObject({ provider: 'codex', tier: 'light' });
  });

  it('still old after the install: stops at 2/4 instead of claiming success', async () => {
    const { api } = makeApi([stale, stale]);
    const result = await agentConnectRun({
      provider: 'codex', api, mountElement: {} as HTMLElement, statusElement: {} as HTMLElement, report: () => undefined,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe(2);
    expect(result.message).toContain('아직 낮습니다');
  });
});
