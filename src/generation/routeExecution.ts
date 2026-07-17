import type { ContentGeneratorProvider } from '../contentGenerator.js';
import type { GenerationRoute } from './routeSnapshot.js';

export class GenerationRouteExecutionError extends Error {
  readonly code = 'GENERATION_ROUTE_EXECUTION_INVALID' as const;

  constructor() {
    super('선택한 글 생성 경로가 올바르지 않습니다. 다른 경로로 자동 전환하지 않습니다.');
    this.name = 'GenerationRouteExecutionError';
  }
}

const API_CONNECTORS: Readonly<Record<string, ContentGeneratorProvider>> = Object.freeze({
  'gemini-api': 'gemini',
  'openai-api': 'openai',
  'claude-api': 'claude',
  'perplexity-api': 'perplexity',
});

/** Maps one immutable text route to one provider. It never supplies a default. */
export function resolveContentProviderForTextRoute(route: GenerationRoute): ContentGeneratorProvider {
  if (!route || route.capability !== 'text.generate') throw new GenerationRouteExecutionError();
  if (route.mode === 'mcp') return 'mcp';
  if (route.mode === 'agent') {
    if (route.connectorId === 'agent-codex' && route.toolOrModelId === 'codex') return 'agent-codex';
    if (route.connectorId === 'agent-claude' && route.toolOrModelId === 'claude') return 'agent-claude';
    throw new GenerationRouteExecutionError();
  }
  const provider = API_CONNECTORS[route.connectorId];
  if (!provider) throw new GenerationRouteExecutionError();
  return provider;
}
