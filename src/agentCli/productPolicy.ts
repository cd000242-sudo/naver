import {
  AgentCliError,
  type AgentCliStatus,
  type AgentProvider,
} from './types.js';

/**
 * Anthropic requires third-party products to use API-key authentication instead of
 * offering Claude.ai login or routing Free/Pro/Max subscription credentials.
 * https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use
 */
export interface AgentProductPolicyOptions {
  /** Development/test escape hatch. Packaged applications must leave this false. */
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

export const CLAUDE_SUBSCRIPTION_DISABLED_MESSAGE =
  '배포 앱에서는 Claude 구독 로그인 및 구독 자격증명 기반 요청을 지원하지 않습니다. 환경설정에서 Claude API 키를 등록해 사용해주세요.';

const CODEX_ENABLED = Object.freeze({ provider: 'codex', enabled: true } as const);
const CLAUDE_ENABLED = Object.freeze({ provider: 'claude', enabled: true } as const);
const CLAUDE_DISABLED = Object.freeze({
  provider: 'claude',
  enabled: false,
  code: 'provider_disabled',
  message: CLAUDE_SUBSCRIPTION_DISABLED_MESSAGE,
} as const);
const CLAUDE_DISABLED_STATUS = Object.freeze({
  provider: 'claude',
  installed: false,
  loggedIn: false,
  available: false,
  errorCode: 'provider_disabled',
  detail: CLAUDE_SUBSCRIPTION_DISABLED_MESSAGE,
} as const satisfies AgentCliStatus);
const trustedProductPolicyContexts = new WeakSet<object>();

export function resolveAgentProviderPolicy(
  provider: AgentProvider,
  options: AgentProductPolicyOptions = {},
): AgentProviderPolicyDecision {
  if (provider === 'codex') return CODEX_ENABLED;
  return options.allowClaudeSubscription === true ? CLAUDE_ENABLED : CLAUDE_DISABLED;
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
  }
}

/**
 * Create an opaque context for trusted main-process calls. A renderer-supplied plain
 * object with the same fields is deliberately not accepted by the resolved-provider guard.
 */
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

/** Return a stable status without probing the disabled CLI or its credentials. */
export function getDisabledAgentStatus(
  provider: AgentProvider,
  options: AgentProductPolicyOptions = {},
): AgentCliStatus | undefined {
  return resolveAgentProviderPolicy(provider, options).enabled
    ? undefined
    : CLAUDE_DISABLED_STATUS;
}
