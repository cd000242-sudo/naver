import { describe, expect, it } from 'vitest';
import {
  normalizeAgentGenerateOptions,
  requireAgentProvider,
} from '../agentCli/validation.js';

describe('agent CLI boundary validation', () => {
  it('accepts supported providers and ordinary model IDs', () => {
    expect(requireAgentProvider('codex')).toBe('codex');
    expect(requireAgentProvider('claude')).toBe('claude');
    expect(normalizeAgentGenerateOptions({
      provider: 'codex',
      prompt: 'write a post',
      model: 'gpt-5.6-terra',
      timeoutMs: 120_000,
    })).toMatchObject({ model: 'gpt-5.6-terra', timeoutMs: 120_000 });
  });

  it('rejects providers and model IDs that could change the spawned command', () => {
    expect(() => requireAgentProvider('codex & calc.exe')).toThrow(/provider/i);
    expect(() => normalizeAgentGenerateOptions({
      provider: 'claude',
      prompt: 'write a post',
      model: 'sonnet & calc.exe',
    })).toThrow(/model/i);
  });

  it('rejects empty prompts and unreasonable timeouts', () => {
    expect(() => normalizeAgentGenerateOptions({ provider: 'codex', prompt: '   ' }))
      .toThrow(/prompt/i);
    expect(() => normalizeAgentGenerateOptions({
      provider: 'codex',
      prompt: 'ok',
      timeoutMs: 999_999_999,
    })).toThrow(/timeout/i);
  });
});
