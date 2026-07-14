import { describe, expect, it } from 'vitest';
import {
  buildSameEngineRecoveryInstruction,
  isTerminalContentGenerationError,
} from '../contentGenerationFailurePolicy.js';
import { AgentCliError } from '../agentCli/types.js';

describe('content generation failure policy', () => {
  it('treats credential, billing, and safety failures as terminal', () => {
    expect(isTerminalContentGenerationError(new Error('invalid API key'))).toBe(true);
    expect(isTerminalContentGenerationError(new Error('billing account required'))).toBe(true);
    expect(isTerminalContentGenerationError(new Error('content policy violation'))).toBe(true);
  });

  it('keeps transient provider pressure repairable by the selected engine', () => {
    expect(isTerminalContentGenerationError(new Error('429 RESOURCE_EXHAUSTED: RPM/TPM rate limit'))).toBe(false);
    expect(isTerminalContentGenerationError(new Error('request timeout while waiting for response'))).toBe(false);
    expect(isTerminalContentGenerationError(new Error('Connection error'))).toBe(false);
  });

  it('stops immediately for agent subscription state that cannot recover by retrying', () => {
    expect(isTerminalContentGenerationError(new AgentCliError(
      'subscription_inactive',
      'claude',
      'Claude 구독 기간이 만료되었습니다.',
    ))).toBe(true);
    expect(isTerminalContentGenerationError(new AgentCliError(
      'rate_limited',
      'claude',
      'Claude 구독 사용 한도가 소진되었습니다.',
    ))).toBe(true);
  });

  it('builds a compact same-engine recovery prompt without cross-engine fallback language', () => {
    const instruction = buildSameEngineRecoveryInstruction(
      'openai',
      'Connection error\n\nwhile waiting for chat completion '.repeat(20),
    );

    expect(instruction).toContain('[SAME_ENGINE_RECOVERY]');
    expect(instruction).toContain('이전 openai 응답은 복구 가능한 생성 오류로 실패했습니다');
    expect(instruction).toContain('다른 AI 엔진으로 전환하지 않습니다');
    expect(instruction).toContain('순수 JSON 객체 하나만 반환하세요');
    expect(instruction.length).toBeLessThan(700);
  });
});
