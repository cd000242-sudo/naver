/**
 * [v2.11.135] generateWithAgent 재시도·사용량 기록 경로 커버리지.
 *
 * 차단 완화 배치에서 추가된 bad_json/empty_output/timeout 1회 재시도와
 * usageTracker 기록 훅이 릴리즈 게이트(에이전트 회귀 커버리지)의 사각으로
 * 남지 않도록 전 분기를 기능 테스트로 잠근다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const detectMock = vi.hoisted(() => vi.fn());
const claudeRunMock = vi.hoisted(() => vi.fn());
const codexRunMock = vi.hoisted(() => vi.fn());
const geminiRunMock = vi.hoisted(() => vi.fn());
const recordCallMock = vi.hoisted(() => vi.fn());
const recordRateLimitMock = vi.hoisted(() => vi.fn());

vi.mock('../agentCli/detect', () => ({
  detectAgent: (...args: unknown[]) => detectMock(...args),
  clearAgentDetectionCache: vi.fn(),
}));
vi.mock('../agentCli/claudeRunner', () => ({
  runClaude: (...args: unknown[]) => claudeRunMock(...args),
}));
vi.mock('../agentCli/codexRunner', () => ({
  runCodex: (...args: unknown[]) => codexRunMock(...args),
}));
vi.mock('../agentCli/geminiRunner', () => ({
  runGemini: (...args: unknown[]) => geminiRunMock(...args),
}));
vi.mock('../agentCli/usageTracker', () => ({
  recordAgentCall: (...args: unknown[]) => recordCallMock(...args),
  recordAgentRateLimit: (...args: unknown[]) => recordRateLimitMock(...args),
}));

import { generateWithAgent } from '../agentCli';
import { AgentCliError } from '../agentCli/types';

const READY = { installed: true, loggedIn: true, available: true };

describe('generateWithAgent — 일시 오류 1회 재시도', () => {
  beforeEach(() => {
    detectMock.mockReset().mockResolvedValue({ provider: 'claude', ...READY });
    claudeRunMock.mockReset();
    codexRunMock.mockReset();
    geminiRunMock.mockReset();
    recordCallMock.mockReset();
    recordRateLimitMock.mockReset();
  });

  it('bad_json(스키마 파싱 실패)은 1회 재시도 후 성공한다 — 쿼터는 2회 기록', async () => {
    claudeRunMock
      .mockResolvedValueOnce('JSON이 아닌 산문 응답')
      .mockResolvedValueOnce('{"title":"제목","body":"본문"}');

    const result = await generateWithAgent({
      provider: 'claude',
      prompt: '글',
      schema: { type: 'object' },
    });

    expect(result.json).toMatchObject({ title: '제목' });
    expect(claudeRunMock).toHaveBeenCalledTimes(2);
    expect(recordCallMock).toHaveBeenCalledTimes(2); // CLI가 응답했으면 파싱 실패여도 쿼터 소진
  });

  it('empty_output도 1회 재시도하고, 2회째도 실패하면 그 오류를 던진다', async () => {
    const emptyError = new AgentCliError('empty_output', 'claude', '빈 응답');
    claudeRunMock.mockRejectedValue(emptyError);

    await expect(generateWithAgent({ provider: 'claude', prompt: '글' }))
      .rejects.toMatchObject({ code: 'empty_output' });
    expect(claudeRunMock).toHaveBeenCalledTimes(2); // 1회 재시도 후 종결
  });

  it('timeout은 재시도 후 성공할 수 있다', async () => {
    claudeRunMock
      .mockRejectedValueOnce(new AgentCliError('timeout', 'claude', '시간 초과'))
      .mockResolvedValueOnce('두 번째 시도 성공');

    const result = await generateWithAgent({ provider: 'claude', prompt: '글' });
    expect(result.text).toBe('두 번째 시도 성공');
    expect(recordCallMock).toHaveBeenCalledTimes(1);
  });

  it('rate_limited는 재시도하지 않고 리셋 시각 기록 훅을 부른다', async () => {
    claudeRunMock.mockRejectedValue(
      new AgentCliError('rate_limited', 'claude', '한도 소진', 'resets 3pm'),
    );

    await expect(generateWithAgent({ provider: 'claude', prompt: '글' }))
      .rejects.toMatchObject({ code: 'rate_limited' });
    expect(claudeRunMock).toHaveBeenCalledTimes(1); // 무재시도 계약 유지
    expect(recordRateLimitMock).toHaveBeenCalledTimes(1);
    expect(String(recordRateLimitMock.mock.calls[0][1])).toContain('resets 3pm');
  });

  it('not_logged_in 같은 인증 오류도 무재시도로 즉시 던진다', async () => {
    claudeRunMock.mockRejectedValue(new AgentCliError('not_logged_in', 'claude', '로그인 필요'));

    await expect(generateWithAgent({ provider: 'claude', prompt: '글' }))
      .rejects.toMatchObject({ code: 'not_logged_in' });
    expect(claudeRunMock).toHaveBeenCalledTimes(1);
  });

  it('취소된 signal이면 재시도 가능한 오류도 즉시 던진다', async () => {
    const controller = new AbortController();
    controller.abort();
    claudeRunMock.mockRejectedValue(new AgentCliError('timeout', 'claude', '시간 초과'));

    await expect(generateWithAgent({
      provider: 'claude',
      prompt: '글',
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'timeout' });
    expect(claudeRunMock).toHaveBeenCalledTimes(1);
  });

  it('gemini 프로바이더도 동일 경로로 실행·기록된다', async () => {
    detectMock.mockResolvedValue({ provider: 'gemini', ...READY });
    geminiRunMock.mockResolvedValue('gemini 응답');

    const result = await generateWithAgent({ provider: 'gemini', prompt: '글' });
    expect(result).toMatchObject({ provider: 'gemini', text: 'gemini 응답' });
    expect(geminiRunMock).toHaveBeenCalledOnce();
    expect(recordCallMock).toHaveBeenCalledTimes(1);
  });

  it('codex 프로바이더 스키마 성공 경로 — 첫 시도에 유효 JSON', async () => {
    detectMock.mockResolvedValue({ provider: 'codex', ...READY });
    codexRunMock.mockResolvedValue('{"ok":true}');

    const result = await generateWithAgent({
      provider: 'codex',
      prompt: '글',
      schema: { type: 'object' },
    });
    expect(result.json).toEqual({ ok: true });
    expect(codexRunMock).toHaveBeenCalledTimes(1);
  });
});
