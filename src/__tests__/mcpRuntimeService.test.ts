import { describe, expect, it, vi } from 'vitest';
import { createMcpRuntimeService } from '../generation/mcp/runtimeService';
import type { McpRuntimeClient } from '../generation/mcp/runtime';

const profile = Object.freeze({
  profileId: 'local',
  connectorId: 'local-mcp',
  transport: 'stdio' as const,
  fallbackPolicy: 'manual-only' as const,
  tools: Object.freeze([{
    routeId: 'local-text',
    toolId: 'write_post',
    capability: 'text.generate' as const,
    billingKind: 'local-compute' as const,
  }]),
});

describe('MCP runtime service', () => {
  it('reuses one runtime for unchanged public metadata and closes sessions on invalidation', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const client: McpRuntimeClient = {
      listTools: vi.fn().mockResolvedValue(['write_post']),
      callTool: vi.fn(),
      close,
    };
    const service = createMcpRuntimeService({
      materialStore: {
        loadAll: vi.fn(), saveAll: vi.fn(), set: vi.fn(), remove: vi.fn(),
        get: vi.fn().mockResolvedValue({ profileId: 'local', transport: 'stdio', command: 'node' }),
      },
      clientFactory: { create: vi.fn().mockResolvedValue(client) },
    });

    const first = await service.getRuntime([profile]);
    const second = await service.getRuntime([profile]);
    expect(second).toBe(first);

    await first.checkRoute({
      routeId: 'local-text', mode: 'mcp', connectorId: 'local-mcp',
      capability: 'text.generate', toolOrModelId: 'write_post', billingKind: 'local-compute',
    });
    await service.invalidate();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
