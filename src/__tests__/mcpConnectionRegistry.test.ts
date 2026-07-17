import { describe, expect, it } from 'vitest';
import {
  McpConnectionValidationError,
  createMcpConnectionRegistry,
} from '../generation/mcp';

const validProfiles = () => ([
  {
    profileId: 'local-generation',
    connectorId: 'mcp-local-generation',
    transport: 'stdio',
    fallbackPolicy: 'manual-only',
    tools: [
      {
        routeId: 'mcp-local-text',
        toolId: 'write_post',
        capability: 'text.generate',
        billingKind: 'local-compute',
      },
      {
        routeId: 'mcp-local-image',
        toolId: 'create_image',
        capability: 'image.generate.text',
        billingKind: 'local-compute',
      },
      {
        routeId: 'mcp-local-reference-image',
        toolId: 'create_image',
        capability: 'image.generate.reference',
        billingKind: 'local-compute',
      },
      {
        routeId: 'mcp-local-edit',
        toolId: 'create_image',
        capability: 'image.edit',
        billingKind: 'local-compute',
      },
      {
        routeId: 'mcp-local-vision',
        toolId: 'inspect_image',
        capability: 'vision.analyze',
        billingKind: 'local-compute',
      },
    ],
  },
]);

describe('MCP connection capability registry', () => {
  it('registers explicit text, image, and vision tool capabilities', () => {
    const registry = createMcpConnectionRegistry(validProfiles());

    expect(registry.findTools('text.generate')).toMatchObject([
      {
        profile: { profileId: 'local-generation', connectorId: 'mcp-local-generation' },
        tool: {
          routeId: 'mcp-local-text',
          toolId: 'write_post',
          capability: 'text.generate',
          billingKind: 'local-compute',
        },
      },
    ]);
    expect(registry.findTools('image.generate.text')).toMatchObject([
      {
        tool: { toolId: 'create_image' },
      },
    ]);
    expect(registry.findTools('image.generate.reference')).toMatchObject([
      {
        tool: { routeId: 'mcp-local-reference-image', toolId: 'create_image' },
      },
    ]);
    expect(registry.findTools('vision.analyze')).toMatchObject([
      {
        tool: { toolId: 'inspect_image' },
      },
    ]);

    expect(registry.resolveRoute({
      routeId: 'mcp-local-edit',
      mode: 'mcp',
      connectorId: 'mcp-local-generation',
      capability: 'image.edit',
      toolOrModelId: 'create_image',
      billingKind: 'local-compute',
    })).toMatchObject({
      profile: { profileId: 'local-generation', transport: 'stdio' },
      tool: {
        routeId: 'mcp-local-edit',
        toolId: 'create_image',
        capability: 'image.edit',
      },
    });
  });

  it('creates a deep immutable copy of validated profile and tool configuration', () => {
    const source = validProfiles();
    const registry = createMcpConnectionRegistry(source);
    const registered = registry.profiles[0];

    source[0].connectorId = 'changed-after-validation';
    source[0].tools[0].capability = 'vision.analyze';

    expect(registered.connectorId).toBe('mcp-local-generation');
    expect(registered.tools[0].capability).toBe('text.generate');
    expect(Object.isFrozen(registry.profiles)).toBe(true);
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered.tools)).toBe(true);
    expect(Object.isFrozen(registered.tools[0])).toBe(true);
  });

  it('requires an explicit manual-only policy and rejects executable or secret-bearing fields safely', () => {
    expect(() => createMcpConnectionRegistry([
      {
        ...validProfiles()[0],
        fallbackPolicy: 'automatic',
      },
    ])).toThrow(McpConnectionValidationError);

    const secret = 'token_should_never_reach_an_error_message';
    const unsafeProfile = {
      ...validProfiles()[0],
      command: 'npx',
      apiKey: secret,
    };

    try {
      createMcpConnectionRegistry([unsafeProfile]);
      throw new Error('expected unsafe profile validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(McpConnectionValidationError);
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).not.toContain('npx');
      expect((error as Error).message).toBe('MCP connection configuration is invalid');
    }
  });

  it('rejects sparse configuration and never coerces malformed route identifiers', () => {
    const sparseTools = new Array(1);
    expect(() => createMcpConnectionRegistry([
      {
        ...validProfiles()[0],
        tools: sparseTools,
      },
    ])).toThrow(McpConnectionValidationError);

    const registry = createMcpConnectionRegistry([
      {
        ...validProfiles()[0],
        connectorId: '42',
      },
    ]);
    expect(registry.resolveRoute({
      routeId: 'mcp-malformed-id',
      mode: 'mcp',
      connectorId: 42 as unknown as string,
      capability: 'text.generate',
      toolOrModelId: 'write_post',
      billingKind: 'local-compute',
    })).toBeUndefined();
  });

  it('never substitutes another profile or tool when an explicit MCP route is unavailable', () => {
    const registry = createMcpConnectionRegistry([
      ...validProfiles(),
      {
        profileId: 'secondary-text',
        connectorId: 'mcp-secondary-text',
        transport: 'streamable-http',
        fallbackPolicy: 'manual-only',
        tools: [{
          routeId: 'mcp-secondary-text',
          toolId: 'secondary_write',
          capability: 'text.generate',
          billingKind: 'local-compute',
        }],
      },
    ]);

    const unavailableRoute = {
      routeId: 'mcp-local-text',
      mode: 'mcp' as const,
      connectorId: 'mcp-local-generation',
      capability: 'text.generate' as const,
      toolOrModelId: 'secondary_write',
      billingKind: 'local-compute' as const,
    };

    expect(registry.resolveRoute(unavailableRoute)).toBeUndefined();
    expect(() => registry.assertRouteIsConfigured(unavailableRoute)).toThrow(
      'MCP route is not configured',
    );
    expect(registry.resolveRoute({ ...unavailableRoute, mode: 'agent' })).toBeUndefined();
  });

  it('rejects routes whose route ID or billing kind differs from the explicit tool configuration', () => {
    const registry = createMcpConnectionRegistry(validProfiles());
    const configuredRoute = {
      routeId: 'mcp-local-text',
      mode: 'mcp' as const,
      connectorId: 'mcp-local-generation',
      capability: 'text.generate' as const,
      toolOrModelId: 'write_post',
      billingKind: 'local-compute' as const,
    };

    expect(registry.resolveRoute(configuredRoute)).toBeDefined();
    expect(registry.assertRouteIsConfigured(configuredRoute)).toMatchObject({
      tool: { routeId: 'mcp-local-text', billingKind: 'local-compute' },
    });
    expect(registry.resolveRoute({
      ...configuredRoute,
      routeId: 'mcp-tampered-route',
    })).toBeUndefined();
    expect(registry.resolveRoute({
      ...configuredRoute,
      billingKind: 'subscription',
    })).toBeUndefined();
  });

  it('rejects invalid transport, billing, and duplicate identifiers without evaluating malformed routes', () => {
    expect(() => createMcpConnectionRegistry([
      { ...validProfiles()[0], transport: 'untrusted-remote' },
    ])).toThrow(McpConnectionValidationError);
    expect(() => createMcpConnectionRegistry([
      {
        ...validProfiles()[0],
        tools: [{
          ...validProfiles()[0].tools[0],
          billingKind: 'unrecognized-billing-kind',
        }],
      },
    ])).toThrow(McpConnectionValidationError);
    expect(() => createMcpConnectionRegistry([
      ...validProfiles(),
      {
        ...validProfiles()[0],
        profileId: 'another-profile',
      },
    ])).toThrow(McpConnectionValidationError);

    const registry = createMcpConnectionRegistry(validProfiles());
    const malformedRoute = new Proxy({}, {
      get: () => {
        throw new Error('route values must not be evaluated after a getter throws');
      },
    });
    expect(registry.resolveRoute(malformedRoute as never)).toBeUndefined();
  });
});
