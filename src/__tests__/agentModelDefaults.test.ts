import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeFile } from 'fs/promises';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
}));

import { runClaude } from '../agentCli/claudeRunner';
import { runCodex } from '../agentCli/codexRunner';
import { AGENT_DEFAULT_MODELS, describeAgentModelLine, resolveAgentRunModel } from '../agentCli/agentModelDefaults';
import { classifyExit } from '../agentCli/parse';
import { AgentCliError } from '../agentCli/types';

const CODEX_REFUSAL = "The 'gpt-6.1-terra' model is not supported when using Codex with a ChatGPT account.";
const CLAUDE_REFUSAL = "There's an issue with the selected model (claude-sonnet-5-5). It may not exist or you may not have access to it.";

function codexOk(): void {
  spawnMock.mockImplementation(async (...call: unknown[]) => {
    const opts = call[0] as { args: string[] } | undefined;
    if (!opts?.args) return { code: 0, stdout: '', stderr: '' };
    await writeFile(opts.args[opts.args.indexOf('-o') + 1], '완성', 'utf8');
    return { code: 0, stdout: '', stderr: '' };
  });
}
const claudeOk = () => spawnMock.mockResolvedValue({ code: 0, stdout: JSON.stringify({ is_error: false, result: '완성' }), stderr: '' });
const lastArgs = (): string[] => {
  const withOpts = spawnMock.mock.calls.filter((call) => call[0]?.args);
  return withOpts[withOpts.length - 1][0].args;
};

describe('agent default models (2026-11-03)', () => {
  beforeEach(() => spawnMock.mockReset());

  it('claude = claude-sonnet-5-5, codex = gpt-6.1-terra, gemini has none', () => {
    expect(AGENT_DEFAULT_MODELS.claude).toBe('claude-sonnet-5-5');
    expect(AGENT_DEFAULT_MODELS.codex).toBe('gpt-6.1-terra');
    expect(resolveAgentRunModel('gemini', '')).toBeUndefined();
  });

  it('a named model wins over the default; blank falls to the default', () => {
    expect(resolveAgentRunModel('codex', 'gpt-6-astra')).toBe('gpt-6-astra');
    expect(resolveAgentRunModel('claude', '  opus ')).toBe('opus');
    expect(resolveAgentRunModel('codex', '   ')).toBe('gpt-6.1-terra');
    expect(resolveAgentRunModel('claude', undefined)).toBe('claude-sonnet-5-5');
  });

  it('runClaude passes the default, and an explicit model instead of it', async () => {
    claudeOk();
    await runClaude('p');
    expect(lastArgs()).toEqual(expect.arrayContaining(['--model', 'claude-sonnet-5-5']));
    await runClaude('p', { model: 'opus' });
    expect(lastArgs()).toEqual(expect.arrayContaining(['--model', 'opus']));
    expect(lastArgs()).not.toContain('claude-sonnet-5-5');
  });

  it('runCodex passes the default, and an explicit model instead of it', async () => {
    codexOk();
    await runCodex('p');
    expect(lastArgs()).toEqual(expect.arrayContaining(['-m', 'gpt-6.1-terra']));
    await runCodex('p', { model: 'gpt-6-astra' });
    expect(lastArgs()).toEqual(expect.arrayContaining(['-m', 'gpt-6-astra']));
    expect(lastArgs()).not.toContain('gpt-6.1-terra');
  });

  it('codex model refusal: explicit Korean error, one CLI call, no other model tried', async () => {
    spawnMock.mockResolvedValue({ code: 1, stdout: '', stderr: CODEX_REFUSAL });
    const error = await runCodex('p').catch((e) => e);
    expect(error).toBeInstanceOf(AgentCliError);
    expect(error.code).toBe('model_unavailable');
    expect(error.message).toContain('Codex 구독에서 gpt-6.1-terra 를 쓸 수 없습니다');
    expect(error.message).toContain('자동 전환하지 않았');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('claude model refusal (non-zero exit and exit-0 envelope) is explicit too, one call each', async () => {
    spawnMock.mockResolvedValue({ code: 1, stdout: JSON.stringify({ is_error: true, result: CLAUDE_REFUSAL }), stderr: '' });
    const a = await runClaude('p').catch((e) => e);
    expect(a.code).toBe('model_unavailable');
    expect(a.message).toContain('Claude Code 구독에서 claude-sonnet-5-5 를 쓸 수 없습니다');
    spawnMock.mockReset().mockResolvedValue({ code: 0, stdout: JSON.stringify({ is_error: true, result: CLAUDE_REFUSAL }), stderr: '' });
    const b = await runClaude('p', { model: 'sonnet' }).catch((e) => e);
    expect(b.code).toBe('model_unavailable');
    expect(b.message).toContain('구독에서 sonnet 를 쓸 수 없습니다');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('classifyExit: refusals are model_unavailable, limits and logouts keep their codes', () => {
    expect(classifyExit('codex', CODEX_REFUSAL)).toBe('model_unavailable');
    expect(classifyExit('claude', '', CLAUDE_REFUSAL)).toBe('model_unavailable');
    expect(classifyExit('codex', "You've hit your usage limit. try again at Nov 4th")).toBe('rate_limited');
    expect(classifyExit('claude', 'Not logged in')).toBe('not_logged_in');
  });

  it('status-line text: saved model, app default, nothing for gemini', () => {
    expect(describeAgentModelLine('claude', '')).toBe('기본 모델: Sonnet 5.5');
    expect(describeAgentModelLine('codex', undefined)).toBe('기본 모델: GPT-6.1 Terra');
    expect(describeAgentModelLine('codex', 'gpt-6-astra')).toBe('모델: gpt-6-astra');
    expect(describeAgentModelLine('gemini', '')).toBe('');
  });

  it('renderer wiring: card status line, inline registration, fingerprint', () => {
    const read = (p: string) => readFileSync(resolve(__dirname, '..', '..', p), 'utf8');
    expect(read('src/renderer/modules/priceInfoModal.ts')).toContain('describeAgentModelLine(t.provider');
    expect(read('scripts/copy-static.mjs')).toContain("'agentCli/agentModelDefaults.js'");
    expect(read('src/contentQualityV3/candidateRuntimeFingerprint.ts')).toContain("'src/agentCli/agentModelDefaults.ts'");
  });
});
