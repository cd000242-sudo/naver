import type {
  GenerationCapability,
  GenerationRouteInput,
} from '../routeSnapshot.js';

/**
 * Transport identity only. Runtime endpoints, commands, arguments, and
 * credentials are deliberately outside this configuration boundary.
 */
export type McpTransport = 'stdio' | 'streamable-http';

export type McpFallbackPolicy = 'manual-only';
export type McpToolCapability = GenerationCapability;
export type McpBillingKind = GenerationRouteInput['billingKind'];

export interface McpToolConfigInput {
  routeId: string;
  toolId: string;
  capability: McpToolCapability;
  billingKind: McpBillingKind;
}

/**
 * Public, non-secret configuration for one trusted MCP connection profile.
 * Connection material belongs in a main-process secret store, never here.
 */
export interface McpConnectionProfileInput {
  profileId: string;
  connectorId: string;
  transport: McpTransport;
  fallbackPolicy: McpFallbackPolicy;
  tools: readonly McpToolConfigInput[];
}

export interface McpToolConfig {
  readonly routeId: string;
  readonly toolId: string;
  readonly capability: McpToolCapability;
  readonly billingKind: McpBillingKind;
}

export interface McpConnectionProfile {
  readonly profileId: string;
  readonly connectorId: string;
  readonly transport: McpTransport;
  readonly fallbackPolicy: McpFallbackPolicy;
  readonly tools: readonly McpToolConfig[];
}

export interface McpToolBinding {
  readonly profile: McpConnectionProfile;
  readonly tool: McpToolConfig;
}

/** The full immutable route snapshot required to bind a generation run to an MCP tool. */
export type McpRouteSelection = GenerationRouteInput;

export interface McpConnectionRegistry {
  readonly fallbackPolicy: McpFallbackPolicy;
  readonly profiles: readonly McpConnectionProfile[];
  /** Discovery only. Callers must still choose a profile and tool explicitly. */
  findTools(capability: McpToolCapability): readonly McpToolBinding[];
  /** Returns only the exact selected binding; it never picks an alternative. */
  resolveRoute(route: McpRouteSelection): McpToolBinding | undefined;
  /** Throws a redacted error instead of attempting another profile or tool. */
  assertRouteIsConfigured(route: McpRouteSelection): McpToolBinding;
}

/**
 * Main-process boundary for a future MCP SDK adapter. This foundation neither
 * launches commands nor opens network connections, and must not be exposed to
 * renderer code.
 */
export interface McpMainProcessToolInvoker {
  invoke(binding: McpToolBinding, request: unknown): Promise<unknown>;
}

export type McpConnectionErrorCode =
  | 'MCP_CONNECTION_CONFIGURATION_INVALID'
  | 'MCP_ROUTE_NOT_CONFIGURED';

/**
 * Messages are intentionally static so malformed configuration can never
 * disclose tokens, command strings, URLs, or other caller-provided values.
 */
export class McpConnectionValidationError extends Error {
  readonly code: McpConnectionErrorCode;

  constructor(code: McpConnectionErrorCode) {
    super(code === 'MCP_ROUTE_NOT_CONFIGURED'
      ? 'MCP route is not configured'
      : 'MCP connection configuration is invalid');
    this.name = 'McpConnectionValidationError';
    this.code = code;
  }
}
