import { describe, expect, it, vi } from 'vitest';
import {
  createAgentLoginCodePromptObserver,
  createAgentLoginUrlObserver,
  isAllowedAgentLoginUrl,
} from '../agentCli/loginUrl';

describe('agent OAuth URL validation', () => {
  it.each([
    ['codex', 'https://auth.openai.com/oauth/authorize?state=one'],
    ['claude', 'https://claude.com/cai/oauth/authorize?state=two'],
  ] as const)('allows a provider-owned HTTPS URL for %s', (provider, url) => {
    expect(isAllowedAgentLoginUrl(provider, url)).toBe(true);
  });

  it.each([
    ['codex', 'http://auth.openai.com/oauth/authorize'],
    ['codex', 'https://auth.openai.com.evil.example/oauth/authorize'],
    ['codex', 'https://evil.auth.openai.com/oauth/authorize'],
    ['codex', 'https://auth.openai.com/cai/oauth/authorize'],
    ['codex', 'https://auth.openai.com/oauth/authorize/'],
    ['codex', 'https://alice:secret@auth.openai.com/oauth/authorize'],
    ['codex', 'https://:secret@auth.openai.com/oauth/authorize'],
    ['codex', 'https://auth.openai.com:444/oauth/authorize'],
    ['codex', 'https://auth.openai.com/oauth/authorize#one-time-secret'],
    ['claude', 'https://claude.ai/oauth/authorize'],
    ['claude', 'https://console.anthropic.com/oauth/authorize'],
    ['claude', 'https://api.anthropic.com/cai/oauth/authorize'],
    ['claude', 'https://claude.com/oauth/authorize'],
    ['claude', 'https://claude.com/cai/oauth/authorize/'],
    ['claude', 'https://claude.ai.evil.example/oauth/authorize'],
    ['claude', 'https://subdomain.claude.ai/oauth/authorize'],
    ['claude', 'javascript:alert(1)'],
  ] as const)('rejects an unsafe or lookalike URL for %s', (provider, url) => {
    expect(isAllowedAgentLoginUrl(provider, url)).toBe(false);
  });

  it('extracts one ANSI-wrapped Codex URL across output chunk boundaries', () => {
    const onUrl = vi.fn();
    const observe = createAgentLoginUrlObserver('codex', onUrl);

    observe('\u001b[36mIf the browser did not open, visit https://auth.open');
    observe('ai.com/oauth/authorize?state=opaque-value\u001b[0m\r\n');
    observe('duplicate https://auth.openai.com/oauth/authorize?state=other');

    expect(onUrl).toHaveBeenCalledOnce();
    expect(onUrl).toHaveBeenCalledWith(
      'https://auth.openai.com/oauth/authorize?state=opaque-value',
    );
  });

  it('ignores URLs owned by another provider or embedded in OSC-8 labels', () => {
    const onUrl = vi.fn();
    const observe = createAgentLoginUrlObserver('claude', onUrl);

    observe('https://auth.openai.com/oauth/authorize?state=wrong-provider\n');
    observe('\u001b]8;;https://evil.example/steal\u0007click\u001b]8;;\u0007');

    expect(onUrl).not.toHaveBeenCalled();
  });

  it('emits a new monotonic attempt for the initial prompt and each invalid-code response', () => {
    const onCodeRequired = vi.fn();
    const observe = createAgentLoginCodePromptObserver(onCodeRequired);

    observe('');
    observe(null as unknown as string);
    observe('\u001b[33mPaste code here if pro');
    observe('mpted\u001b[0m\r\n');
    observe('unrelated output');
    observe('Invalid code. Please make sure the full code was cop');
    observe('ied.\r\n');
    observe('Invalid code. Please make sure the full code was copied.\r\n');

    expect(onCodeRequired.mock.calls).toEqual([[1], [2], [3]]);
  });
});
