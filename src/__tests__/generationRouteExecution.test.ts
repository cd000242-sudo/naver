import { describe, expect, it } from 'vitest';
import {
  GenerationRouteExecutionError,
  resolveContentProviderForTextRoute,
} from '../generation/routeExecution';

const base = {
  routeId: 'text-route',
  capability: 'text.generate' as const,
  billingKind: 'unknown' as const,
};

describe('generation route execution', () => {
  it.each([
    [{ ...base, mode: 'mcp', connectorId: 'local-mcp', toolOrModelId: 'write_post' }, 'mcp'],
    [{ ...base, mode: 'agent', connectorId: 'agent-codex', toolOrModelId: 'codex' }, 'agent-codex'],
    [{ ...base, mode: 'agent', connectorId: 'agent-claude', toolOrModelId: 'claude' }, 'agent-claude'],
    [{ ...base, mode: 'api', connectorId: 'gemini-api', toolOrModelId: 'gemini-3.1-flash-lite' }, 'gemini'],
    [{ ...base, mode: 'api', connectorId: 'openai-api', toolOrModelId: 'gpt-5.6-terra' }, 'openai'],
  ] as const)('maps only the exact selected route %o', (route, expected) => {
    expect(resolveContentProviderForTextRoute(route)).toBe(expected);
  });

  it('does not default an unknown connector to Gemini or any other provider', () => {
    expect(() => resolveContentProviderForTextRoute({
      ...base,
      mode: 'api',
      connectorId: 'unknown-api',
      toolOrModelId: 'unknown',
    })).toThrow(GenerationRouteExecutionError);
  });
});
