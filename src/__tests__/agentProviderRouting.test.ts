/**
 * Agent-mode provider routing — SSOT helpers (modelRegistry).
 *
 * These guard the single source of truth that the renderer engine map, the main-process
 * narrative split, and the contentGenerator dispatch all rely on to recognize agent mode.
 */

import { describe, it, expect } from 'vitest';
import {
  AGENT_TEXT_PROVIDERS,
  isAgentTextProvider,
  agentTextProviderToCli,
} from '../runtime/modelRegistry';

describe('isAgentTextProvider', () => {
  it('recognizes the three agent providers', () => {
    expect(isAgentTextProvider('agent-codex')).toBe(true);
    expect(isAgentTextProvider('agent-claude')).toBe(true);
    expect(isAgentTextProvider('agent-gemini')).toBe(true);
  });

  it('rejects API providers and junk', () => {
    for (const v of ['gemini', 'openai', 'claude', 'perplexity', 'claude-sonnet', '', undefined, null, 42]) {
      expect(isAgentTextProvider(v)).toBe(false);
    }
  });

  it('AGENT_TEXT_PROVIDERS contains exactly the agent values', () => {
    expect([...AGENT_TEXT_PROVIDERS]).toEqual(['agent-codex', 'agent-claude', 'agent-gemini']);
  });
});

describe('agentTextProviderToCli', () => {
  it('maps agent provider → agentCli provider', () => {
    expect(agentTextProviderToCli('agent-codex')).toBe('codex');
    expect(agentTextProviderToCli('agent-claude')).toBe('claude');
    expect(agentTextProviderToCli('agent-gemini')).toBe('gemini');
  });
});
