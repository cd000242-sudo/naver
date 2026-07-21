import {
  AgentCliError,
  type AgentCliStatus,
  type AgentProvider,
} from './types.js';

/**
 * Product-level switches kept for IPC/API compatibility. Provider readiness is
 * determined by the local CLI installation, login, subscription, and quota checks.
 */
export interface AgentProductPolicyOptions {
  /** Deprecated compatibility field. Claude Code is available in packaged builds. */
  readonly allowClaudeSubscription?: boolean;
}

/** Runtime-branded context accepted by the content-generation boundary. */
export interface AgentProductPolicyContext extends AgentProductPolicyOptions {}

export type AgentProviderPolicyDecision = Readonly<
  | {
    provider: AgentProvider;
    enabled: true;
  }
  | {
    provider: AgentProvider;
    enabled: false;
    code: 'provider_disabled';
    message: string;
  }
>;

const CODEX_ENABLED = Object.freeze({ provider: 'codex', enabled: true } as const);
const CLAUDE_ENABLED = Object.freeze({ provider: 'claude', enabled: true } as const);
const GEMINI_ENABLED = Object.freeze({ provider: 'gemini', enabled: true } as const);
const trustedProductPolicyContexts = new WeakSet<object>();

export function resolveAgentProviderPolicy(
  provider: AgentProvider,
  _options: AgentProductPolicyOptions = {},
): AgentProviderPolicyDecision {
  if (provider === 'codex') return CODEX_ENABLED;
  if (provider === 'gemini') return GEMINI_ENABLED;
  return CLAUDE_ENABLED;
}

export function assertAgentProviderAllowed(
  provider: AgentProvider,
  options: AgentProductPolicyOptions = {},
): void {
  const decision = resolveAgentProviderPolicy(provider, options);
  if (!decision.enabled) {
    throw new AgentCliError(decision.code, provider, decision.message);
  }
}

/** Guard only subscription-backed generator IDs; `claude` remains the API-key route. */
export function assertContentGeneratorProviderAllowed(
  generator: unknown,
  options: AgentProductPolicyOptions = {},
): void {
  if (generator === 'agent-claude') {
    assertAgentProviderAllowed('claude', options);
  } else if (generator === 'agent-codex') {
    assertAgentProviderAllowed('codex', options);
  } else if (generator === 'agent-gemini') {
    assertAgentProviderAllowed('gemini', options);
  }
}

/** Create a branded context for compatibility with existing generation boundaries. */
export function createAgentProductPolicyContext(
  options: AgentProductPolicyOptions = {},
): AgentProductPolicyContext {
  const context: AgentProductPolicyContext = Object.freeze({
    allowClaudeSubscription: options.allowClaudeSubscription === true,
  });
  trustedProductPolicyContexts.add(context);
  return context;
}

export function assertResolvedContentGeneratorProviderAllowed(
  generator: unknown,
  context?: AgentProductPolicyContext,
): void {
  const trustedOptions = context && trustedProductPolicyContexts.has(context)
    ? context
    : undefined;
  assertContentGeneratorProviderAllowed(generator, trustedOptions);
}

/** No provider is product-disabled; normal CLI readiness checks always run. */
export function getDisabledAgentStatus(
  _provider: AgentProvider,
  _options: AgentProductPolicyOptions = {},
): AgentCliStatus | undefined {
  return undefined;
}
