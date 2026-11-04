/**
 * [2026-11-04] 사장님 목표 "글쓰기 2분대". 조화 모드 본문 호출 실측: 생각 깊이 기본값 487.7초 · 출력 71,900 토큰(보이는 답
 * 5,951자)이고 답이 넘쳐 꼬리만 돌아왔다. --effort 로 생각 깊이를 정하면 같은 프롬프트가 140~176초, 출력 20~25k 토큰.
 * 이 시험은 runClaude 가 --effort 를 싣는지, 옛 CLI 가 그 옵션을 모르면 같은 모델로 옵션만 빼고 한 번 다시 도는지 잠근다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
}));

import { claudeRejectedEffortFlag, runClaude } from '../agentCli/claudeRunner';
import { AGENT_TIER_PROFILES } from '../agentCli/agentModelDefaults';

const ok = { code: 0, stdout: JSON.stringify({ is_error: false, result: '완성', num_turns: 1 }), stderr: '' };
const argsOf = (n: number): string[] => spawnMock.mock.calls[n][0].args;

describe('runClaude --effort (thinking depth)', () => {
  beforeEach(() => spawnMock.mockReset());

  it('both tiers carry a thinking depth for claude', () => {
    expect(AGENT_TIER_PROFILES.claude.main.effort).toMatch(/^(low|medium)$/);
    expect(AGENT_TIER_PROFILES.claude.light.effort).toBe('low');
  });

  it('passes the tier profile effort, and an explicit effort instead of it', async () => {
    spawnMock.mockResolvedValue(ok);
    await runClaude('p', { tier: 'main' });
    expect(argsOf(0)).toEqual(expect.arrayContaining(['--effort', AGENT_TIER_PROFILES.claude.main.effort!]));
    await runClaude('p', { tier: 'main', effort: 'high' });
    expect(argsOf(1)).toEqual(expect.arrayContaining(['--effort', 'high']));
    await runClaude('p', { tier: 'light' });
    expect(argsOf(2)).toEqual(expect.arrayContaining(['--effort', 'low']));
  });

  it('an older CLI that does not know --effort: one retry, same model, only the flag dropped', async () => {
    spawnMock
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: "error: unknown option '--effort'" })
      .mockResolvedValueOnce(ok);
    await expect(runClaude('p', { tier: 'main', model: 'opus' })).resolves.toBe('완성');
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(argsOf(0)).toContain('--effort');
    expect(argsOf(1)).not.toContain('--effort');
    expect(argsOf(1)).toEqual(expect.arrayContaining(['--model', 'opus']));
  });

  it('any other failure is not retried (no hidden second run)', async () => {
    spawnMock.mockResolvedValue({ code: 1, stdout: '', stderr: 'rate limit reached' });
    await expect(runClaude('p', { tier: 'main' })).rejects.toBeTruthy();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('claudeRejectedEffortFlag only matches the flag being refused', () => {
    expect(claudeRejectedEffortFlag("error: unknown option '--effort'")).toBe(true);
    expect(claudeRejectedEffortFlag('Unrecognized argument: --effort low')).toBe(true);
    expect(claudeRejectedEffortFlag("There's an issue with the selected model (claude-sonnet-5-5).")).toBe(false);
    expect(claudeRejectedEffortFlag('rate limit reached')).toBe(false);
    expect(claudeRejectedEffortFlag('')).toBe(false);
  });
});
