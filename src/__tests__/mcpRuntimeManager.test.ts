import { describe, expect, it, vi } from 'vitest';
import {
  McpRuntimeError,
  createMcpConnectionRegistry,
  createMcpRuntimeManager,
  type McpRuntimeClient,
  type McpRuntimeClientFactory,
  type McpRuntimeConnectionMaterial,
} from '../generation/mcp';

function profiles() {
  return [
    {
      profileId: 'primary-local',
      connectorId: 'mcp-primary',
      transport: 'stdio' as const,
      fallbackPolicy: 'manual-only' as const,
      tools: [
        {
          routeId: 'mcp-primary-text',
          toolId: 'write_post',
          capability: 'text.generate' as const,
          billingKind: 'local-compute' as const,
        },
        {
          routeId: 'mcp-primary-image',
          toolId: 'create_image',
          capability: 'image.generate.text' as const,
          billingKind: 'local-compute' as const,
        },
      ],
    },
    {
      profileId: 'unused-secondary',
      connectorId: 'mcp-secondary',
      transport: 'streamable-http' as const,
      fallbackPolicy: 'manual-only' as const,
      tools: [{
        routeId: 'mcp-secondary-text',
        toolId: 'other_writer',
        capability: 'text.generate' as const,
        billingKind: 'server-credits' as const,
      }],
    },
  ];
}

function textRoute() {
  return {
    routeId: 'mcp-primary-text',
    mode: 'mcp' as const,
    connectorId: 'mcp-primary',
    capability: 'text.generate' as const,
    toolOrModelId: 'write_post',
    billingKind: 'local-compute' as const,
  };
}

function fakeFactory(client: McpRuntimeClient): McpRuntimeClientFactory & {
  create: ReturnType<typeof vi.fn>;
} {
  return {
    create: vi.fn().mockResolvedValue(client),
  };
}

describe('MCP main-process runtime manager', () => {
  it('checks discovery without invoking the potentially billable tool', async () => {
    const client: McpRuntimeClient = {
      listTools: vi.fn().mockResolvedValue(['write_post']),
      callTool: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const manager = createMcpRuntimeManager({
      registry: createMcpConnectionRegistry(profiles()),
      clientFactory: fakeFactory(client),
      getConnectionMaterial: () => ({
        profileId: 'primary-local', transport: 'stdio', command: 'node', args: ['server.mjs'],
      }),
    });

    await expect(manager.checkRoute(textRoute())).resolves.toEqual({
      profileId: 'primary-local',
      toolId: 'write_post',
    });
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it('calls only the explicitly selected tool exactly once and never probes a fallback profile', async () => {
    const callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"selectedTitle":"제목"}' }],
      structuredContent: { selectedTitle: '제목' },
    });
    const client: McpRuntimeClient = {
      listTools: vi.fn().mockResolvedValue(['write_post', 'create_image']),
      callTool,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const factory = fakeFactory(client);
    const registry = createMcpConnectionRegistry(profiles());
    const material: McpRuntimeConnectionMaterial = {
      profileId: 'primary-local',
      transport: 'stdio',
      command: 'node',
      args: ['server.mjs'],
    };
    const manager = createMcpRuntimeManager({
      registry,
      clientFactory: factory,
      getConnectionMaterial: (profileId) => profileId === material.profileId ? material : undefined,
    });

    const result = await manager.invokeRoute(textRoute(), {
      arguments: { prompt: '같은 프롬프트' },
    });

    expect(factory.create).toHaveBeenCalledTimes(1);
    expect(factory.create).toHaveBeenCalledWith(material, expect.objectContaining({
      profileId: 'primary-local',
    }));
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith(
      'write_post',
      { prompt: '같은 프롬프트' },
      expect.objectContaining({ timeoutMs: 120_000 }),
    );
    expect(result.text).toEqual(['{"selectedTitle":"제목"}']);
    expect(result.structuredContent).toEqual({ selectedTitle: '제목' });
  });

  it('normalizes official MCP image, embedded image resource, and resource-link results', async () => {
    const png = Buffer.from('small-png').toString('base64');
    const client: McpRuntimeClient = {
      listTools: vi.fn().mockResolvedValue(['create_image']),
      callTool: vi.fn().mockResolvedValue({
        content: [
          { type: 'image', data: png, mimeType: 'image/png' },
          { type: 'resource', resource: { uri: 'mcp://image/2', blob: png, mimeType: 'image/webp' } },
          { type: 'resource_link', uri: 'https://example.test/image.png', name: 'image.png', mimeType: 'image/png' },
        ],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const registry = createMcpConnectionRegistry(profiles());
    const manager = createMcpRuntimeManager({
      registry,
      clientFactory: fakeFactory(client),
      getConnectionMaterial: () => ({
        profileId: 'primary-local', transport: 'stdio', command: 'node', args: ['server.mjs'],
      }),
    });

    const result = await manager.invokeRoute({
      routeId: 'mcp-primary-image',
      mode: 'mcp',
      connectorId: 'mcp-primary',
      capability: 'image.generate.text',
      toolOrModelId: 'create_image',
      billingKind: 'local-compute',
    }, { arguments: { prompt: 'product image' } });

    expect(result.images).toEqual([
      { data: png, mimeType: 'image/png' },
      { data: png, mimeType: 'image/webp', uri: 'mcp://image/2' },
    ]);
    expect(result.resourceLinks).toEqual([
      { uri: 'https://example.test/image.png', name: 'image.png', mimeType: 'image/png' },
    ]);
  });

  it('ends an unknown-outcome timeout after one submission without trying another tool', async () => {
    const callTool = vi.fn().mockRejectedValue(new Error('socket timeout token=secret-value'));
    const client: McpRuntimeClient = {
      listTools: vi.fn().mockResolvedValue(['write_post']),
      callTool,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const manager = createMcpRuntimeManager({
      registry: createMcpConnectionRegistry(profiles()),
      clientFactory: fakeFactory(client),
      getConnectionMaterial: () => ({
        profileId: 'primary-local', transport: 'stdio', command: 'node', args: ['server.mjs'],
      }),
    });

    await expect(manager.invokeRoute(textRoute(), { arguments: { prompt: 'one click' } }))
      .rejects.toMatchObject({ code: 'MCP_INVOCATION_UNKNOWN_OUTCOME' });
    expect(callTool).toHaveBeenCalledTimes(1);

    try {
      await manager.invokeRoute(textRoute(), { arguments: { prompt: 'new user action' } });
    } catch (error) {
      expect(error).toBeInstanceOf(McpRuntimeError);
      expect((error as Error).message).not.toContain('secret-value');
    }
  });

  it('refuses a configured-but-undiscovered tool before any paid submission', async () => {
    const callTool = vi.fn();
    const client: McpRuntimeClient = {
      listTools: vi.fn().mockResolvedValue(['different_tool']),
      callTool,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const manager = createMcpRuntimeManager({
      registry: createMcpConnectionRegistry(profiles()),
      clientFactory: fakeFactory(client),
      getConnectionMaterial: () => ({
        profileId: 'primary-local', transport: 'stdio', command: 'node', args: ['server.mjs'],
      }),
    });

    await expect(manager.invokeRoute(textRoute(), { arguments: {} }))
      .rejects.toMatchObject({ code: 'MCP_TOOL_NOT_DISCOVERED' });
    expect(callTool).not.toHaveBeenCalled();
  });

  it('rejects unsafe HTTP and shell-shaped runtime material with static redacted errors', async () => {
    const client: McpRuntimeClient = {
      listTools: vi.fn(), callTool: vi.fn(), close: vi.fn(),
    };
    const registry = createMcpConnectionRegistry(profiles());

    const unsafeHttp = createMcpRuntimeManager({
      registry,
      clientFactory: fakeFactory(client),
      getConnectionMaterial: () => ({
        profileId: 'primary-local',
        transport: 'streamable-http',
        url: 'http://attacker.example/mcp?token=secret-value',
      }),
    });
    await expect(unsafeHttp.invokeRoute(textRoute(), { arguments: {} }))
      .rejects.toMatchObject({ code: 'MCP_RUNTIME_CONFIGURATION_INVALID' });

    const unsafeCommand = createMcpRuntimeManager({
      registry,
      clientFactory: fakeFactory(client),
      getConnectionMaterial: () => ({
        profileId: 'primary-local',
        transport: 'stdio',
        command: 'node && calc.exe',
      }),
    });
    try {
      await unsafeCommand.invokeRoute(textRoute(), { arguments: {} });
      throw new Error('expected validation error');
    } catch (error) {
      expect(error).toMatchObject({ code: 'MCP_RUNTIME_CONFIGURATION_INVALID' });
      expect((error as Error).message).not.toContain('calc.exe');
      expect((error as Error).message).not.toContain('secret-value');
    }
  });
});
