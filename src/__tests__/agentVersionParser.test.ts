import { describe, expect, it } from 'vitest';
import {
  agentVersionFallbackLabel,
  parseAgentVersionOutput,
} from '../agentCli/version';
import { formatAgentVersionLabel } from '../renderer/utils/agentProductPolicyUi';

describe('agent CLI version parser', () => {
  it.each([
    ['codex', 'codex-cli 0.141.0', 'Codex CLI 0.141.0'],
    ['codex', 'codex 1.2.3-beta.1', 'Codex CLI 1.2.3-beta.1'],
    ['codex', '2.1.0', 'Codex CLI 2.1.0'],
    ['claude', '2.1.0 (Claude Code)', 'Claude Code 2.1.0'],
    ['claude', 'claude 2.2.0', 'Claude Code 2.2.0'],
    ['claude', 'Claude Code v3.0.1+build.4', 'Claude Code 3.0.1+build.4'],
  ] as const)('extracts only a canonical %s version from %s', (provider, raw, expected) => {
    expect(parseAgentVersionOutput(provider, raw, '')).toBe(expected);
  });

  it('strips ANSI and finds the one valid version line across stdout and stderr', () => {
    const stdout = [
      '\u001b[31m[Startup-Async] exposurePoller started\u001b[0m',
      'token=must-not-leak',
    ].join('\n');
    const stderr = [
      'Proxy https://alice:secret@proxy.example failed once',
      '\u001b[32mclaude 2.3.4\u001b[0m',
    ].join('\n');

    const parsed = parseAgentVersionOutput('claude', stdout, stderr);

    expect(parsed).toBe('Claude Code 2.3.4');
    expect(parsed).not.toContain('Startup-Async');
    expect(parsed).not.toContain('secret');
    expect(parsed).not.toContain('\n');
  });

  it('rejects cross-provider and arbitrary log lines instead of forwarding them', () => {
    expect(parseAgentVersionOutput('codex', 'claude 2.1.0', '')).toBeUndefined();
    expect(parseAgentVersionOutput('claude', 'codex-cli 0.141.0', '')).toBeUndefined();
    expect(parseAgentVersionOutput(
      'codex',
      '[Main] login required\nhttps://auth.openai.com/oauth/authorize?token=secret',
      'debug output',
    )).toBeUndefined();
    expect(agentVersionFallbackLabel('codex')).toBe('Codex CLI');
    expect(agentVersionFallbackLabel('claude')).toBe('Claude Code');
  });
});

describe('renderer agent version label', () => {
  it('preserves canonical labels but bounds arbitrary legacy status values', () => {
    expect(formatAgentVersionLabel('codex', 'Codex CLI 0.141.0')).toBe('Codex CLI 0.141.0');
    expect(formatAgentVersionLabel('claude', 'Claude Code 2.3.4')).toBe('Claude Code 2.3.4');
    const safe = formatAgentVersionLabel(
      'codex',
      '[Startup-Async] exposurePoller\nhttps://alice:secret@example.test/?token=secret',
    );
    expect(safe).toBe('Codex CLI');
    expect(safe.length).toBeLessThanOrEqual(32);
    expect(safe).not.toContain('secret');
    expect(safe).not.toContain('\n');
  });
});
