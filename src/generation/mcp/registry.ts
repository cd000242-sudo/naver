import type {
  McpBillingKind,
  McpConnectionProfile,
  McpConnectionRegistry,
  McpRouteSelection,
  McpToolBinding,
  McpToolCapability,
  McpToolConfig,
  McpTransport,
} from './contracts.js';
import { McpConnectionValidationError } from './contracts.js';

const MAX_PROFILES = 64;
const MAX_TOOLS_PER_PROFILE = 128;
const PUBLIC_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const VALID_TRANSPORTS = new Set<McpTransport>(['stdio', 'streamable-http']);
const MCP_TOOL_CAPABILITIES = [
  'text.generate',
  'image.generate.text',
  'image.generate.reference',
  'image.edit',
  'vision.analyze',
] as const satisfies readonly McpToolCapability[];
const MCP_BILLING_KINDS = [
  'subscription',
  'server-credits',
  'local-compute',
  'metered-api',
  'free-quota',
  'unknown',
] as const satisfies readonly McpBillingKind[];
type AssertNever<Value extends never> = Value;
type _AllMcpToolCapabilitiesAreRegistered = AssertNever<
  Exclude<McpToolCapability, (typeof MCP_TOOL_CAPABILITIES)[number]>
>;
type _AllMcpBillingKindsAreRegistered = AssertNever<
  Exclude<McpBillingKind, (typeof MCP_BILLING_KINDS)[number]>
>;
const VALID_CAPABILITIES = new Set<McpToolCapability>(MCP_TOOL_CAPABILITIES);
const VALID_BILLING_KINDS = new Set<McpBillingKind>(MCP_BILLING_KINDS);
const PROFILE_FIELDS = new Set([
  'profileId',
  'connectorId',
  'transport',
  'fallbackPolicy',
  'tools',
]);
const TOOL_FIELDS = new Set(['routeId', 'toolId', 'capability', 'billingKind']);
const EMPTY_BINDINGS: readonly McpToolBinding[] = Object.freeze([]);

function invalidConfiguration(): never {
  throw new McpConnectionValidationError('MCP_CONNECTION_CONFIGURATION_INVALID');
}

function getDataRecord(
  value: unknown,
  allowedFields: ReadonlySet<string>,
): Record<string, unknown> {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return invalidConfiguration();
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalidConfiguration();
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      return invalidConfiguration();
    }

    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const field of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!allowedFields.has(field)
        || !descriptor?.enumerable
        || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return invalidConfiguration();
      }
      copy[field] = descriptor.value;
    }
    return copy;
  } catch {
    return invalidConfiguration();
  }
}

function requirePublicIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !PUBLIC_IDENTIFIER_PATTERN.test(value)) {
    return invalidConfiguration();
  }
  return value;
}

function requireArray(value: unknown, maximumLength: number): readonly unknown[] {
  try {
    if (!Array.isArray(value) || value.length > maximumLength) {
      return invalidConfiguration();
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Array.prototype && prototype !== null) {
      return invalidConfiguration();
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      return invalidConfiguration();
    }

    const values: unknown[] = [];
    const expectedIndexes = new Set<string>();
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return invalidConfiguration();
      }
      expectedIndexes.add(key);
      values.push(descriptor.value);
    }
    for (const key of Object.getOwnPropertyNames(value)) {
      if (key !== 'length' && !expectedIndexes.has(key)) {
        return invalidConfiguration();
      }
    }
    return values;
  } catch {
    return invalidConfiguration();
  }
}

function requireCapability(value: unknown): McpToolCapability {
  if (typeof value !== 'string' || !VALID_CAPABILITIES.has(value as McpToolCapability)) {
    return invalidConfiguration();
  }
  return value as McpToolCapability;
}

function requireBillingKind(value: unknown): McpBillingKind {
  if (typeof value !== 'string' || !VALID_BILLING_KINDS.has(value as McpBillingKind)) {
    return invalidConfiguration();
  }
  return value as McpBillingKind;
}

function cloneTool(value: unknown): McpToolConfig {
  const record = getDataRecord(value, TOOL_FIELDS);
  const routeId = requirePublicIdentifier(record.routeId);
  const toolId = requirePublicIdentifier(record.toolId);
  const capability = requireCapability(record.capability);
  const billingKind = requireBillingKind(record.billingKind);
  return Object.freeze({ routeId, toolId, capability, billingKind });
}

function cloneProfile(value: unknown): McpConnectionProfile {
  const record = getDataRecord(value, PROFILE_FIELDS);
  const profileId = requirePublicIdentifier(record.profileId);
  const connectorId = requirePublicIdentifier(record.connectorId);
  const transport = record.transport;
  if (typeof transport !== 'string' || !VALID_TRANSPORTS.has(transport as McpTransport)) {
    return invalidConfiguration();
  }
  if (record.fallbackPolicy !== 'manual-only') return invalidConfiguration();

  const sourceTools = requireArray(record.tools, MAX_TOOLS_PER_PROFILE);
  if (sourceTools.length === 0) return invalidConfiguration();
  const toolRouteKeys = new Set<string>();
  const tools = sourceTools.map((tool) => {
    const cloned = cloneTool(tool);
    const routeKey = `${cloned.toolId}\u0000${cloned.capability}`;
    if (toolRouteKeys.has(routeKey)) return invalidConfiguration();
    toolRouteKeys.add(routeKey);
    return cloned;
  });

  return Object.freeze({
    profileId,
    connectorId,
    transport: transport as McpTransport,
    fallbackPolicy: 'manual-only',
    tools: Object.freeze(tools),
  });
}

function cloneProfiles(input: unknown): readonly McpConnectionProfile[] {
  const source = requireArray(input, MAX_PROFILES);
  const profileIds = new Set<string>();
  const connectorIds = new Set<string>();
  const routeIds = new Set<string>();
  const profiles = source.map((profile) => {
    const cloned = cloneProfile(profile);
    if (profileIds.has(cloned.profileId) || connectorIds.has(cloned.connectorId)) {
      return invalidConfiguration();
    }
    for (const tool of cloned.tools) {
      if (routeIds.has(tool.routeId)) return invalidConfiguration();
      routeIds.add(tool.routeId);
    }
    profileIds.add(cloned.profileId);
    connectorIds.add(cloned.connectorId);
    return cloned;
  });
  return Object.freeze(profiles);
}

function readRoute(route: McpRouteSelection): {
  routeId: string;
  connectorId: string;
  capability: McpToolCapability;
  toolId: string;
  billingKind: McpBillingKind;
} | undefined {
  try {
    const candidate = route as unknown;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
    const record = candidate as Record<string, unknown>;
    if (record.mode !== 'mcp'
      || typeof record.routeId !== 'string'
      || !PUBLIC_IDENTIFIER_PATTERN.test(record.routeId)
      || typeof record.connectorId !== 'string'
      || !PUBLIC_IDENTIFIER_PATTERN.test(record.connectorId)
      || typeof record.toolOrModelId !== 'string'
      || !PUBLIC_IDENTIFIER_PATTERN.test(record.toolOrModelId)
      || typeof record.capability !== 'string'
      || !VALID_CAPABILITIES.has(record.capability as McpToolCapability)
      || typeof record.billingKind !== 'string'
      || !VALID_BILLING_KINDS.has(record.billingKind as McpBillingKind)) {
      return undefined;
    }
    return {
      routeId: record.routeId,
      connectorId: record.connectorId as string,
      capability: record.capability as McpToolCapability,
      toolId: record.toolOrModelId as string,
      billingKind: record.billingKind as McpBillingKind,
    };
  } catch {
    return undefined;
  }
}

/**
 * Validates public MCP profile metadata and builds an immutable lookup table.
 * It never starts a process, resolves an endpoint, reads credentials, or logs
 * configuration. A missing explicit route is deliberately not a fallback.
 */
export function createMcpConnectionRegistry(
  input: unknown,
): McpConnectionRegistry {
  const profiles = cloneProfiles(input);
  const bindingsByCapability = new Map<McpToolCapability, McpToolBinding[]>();
  const bindingsBySelection = new Map<string, McpToolBinding>();

  for (const profile of profiles) {
    for (const tool of profile.tools) {
      const binding = Object.freeze({ profile, tool });
      const capabilityBindings = bindingsByCapability.get(tool.capability) ?? [];
      capabilityBindings.push(binding);
      bindingsByCapability.set(tool.capability, capabilityBindings);
      bindingsBySelection.set(
        `${profile.connectorId}\u0000${tool.routeId}\u0000${tool.toolId}\u0000${tool.capability}\u0000${tool.billingKind}`,
        binding,
      );
    }
  }

  const frozenBindingsByCapability = new Map<McpToolCapability, readonly McpToolBinding[]>();
  for (const [capability, bindings] of bindingsByCapability) {
    frozenBindingsByCapability.set(capability, Object.freeze([...bindings]));
  }

  const resolveRoute = (route: McpRouteSelection): McpToolBinding | undefined => {
    const selection = readRoute(route);
    if (!selection) return undefined;
    return bindingsBySelection.get(
      `${selection.connectorId}\u0000${selection.routeId}\u0000${selection.toolId}\u0000${selection.capability}\u0000${selection.billingKind}`,
    );
  };

  const registry: McpConnectionRegistry = {
    fallbackPolicy: 'manual-only',
    profiles,
    findTools: (capability) => frozenBindingsByCapability.get(capability) ?? EMPTY_BINDINGS,
    resolveRoute,
    assertRouteIsConfigured: (route) => {
      const binding = resolveRoute(route);
      if (!binding) throw new McpConnectionValidationError('MCP_ROUTE_NOT_CONFIGURED');
      return binding;
    },
  };
  return Object.freeze(registry);
}
