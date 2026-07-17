import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpConnectionProfile } from './contracts.js';
import type {
  McpRuntimeClient,
  McpRuntimeClientFactory,
  McpRuntimeConnectionMaterial,
  McpRuntimeRequestOptions,
} from './runtime.js';

const CLIENT_NAME = 'better-life-naver';
const CLIENT_VERSION = '1.0.0';
const CONNECT_TIMEOUT_MS = 30_000;

function requestOptions(options: McpRuntimeRequestOptions) {
  return {
    signal: options.signal,
    timeout: options.timeoutMs,
    maxTotalTimeout: options.timeoutMs,
    resetTimeoutOnProgress: false,
  };
}

function createTransport(material: McpRuntimeConnectionMaterial): Transport {
  if (material.transport === 'stdio') {
    return new StdioClientTransport({
      command: material.command,
      args: material.args ? [...material.args] : [],
      cwd: material.cwd,
      env: material.env
        ? { ...getDefaultEnvironment(), ...material.env }
        : getDefaultEnvironment(),
      // Do not leak an MCP server's stderr into end-user logs. Diagnostics are
      // surfaced through the manager's fixed, redacted error contract.
      stderr: 'pipe',
    });
  }

  return new StreamableHTTPClientTransport(new URL(material.url), {
    requestInit: material.headers ? { headers: { ...material.headers } } : undefined,
    reconnectionOptions: {
      maxReconnectionDelay: 1_000,
      initialReconnectionDelay: 1_000,
      reconnectionDelayGrowFactor: 1,
      // A user-selected route gets one connection attempt. The app never
      // resubmits a generation because an HTTP/SSE connection disappeared.
      maxRetries: 0,
    },
  });
}

class OfficialMcpRuntimeClient implements McpRuntimeClient {
  constructor(private readonly client: Client) {}

  async listTools(options: McpRuntimeRequestOptions): Promise<readonly string[]> {
    const result = await this.client.listTools(undefined, requestOptions(options));
    return Object.freeze(result.tools.map((tool) => tool.name));
  }

  async callTool(
    toolName: string,
    args: Readonly<Record<string, unknown>>,
    options: McpRuntimeRequestOptions,
  ): Promise<unknown> {
    return this.client.callTool(
      { name: toolName, arguments: { ...args } },
      undefined,
      requestOptions(options),
    );
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

/** Main-process-only official MCP SDK factory. */
export function createOfficialMcpRuntimeClientFactory(): McpRuntimeClientFactory {
  return Object.freeze({
    create: async (
      material: McpRuntimeConnectionMaterial,
      _profile: McpConnectionProfile,
    ): Promise<McpRuntimeClient> => {
      const client = new Client(
        { name: CLIENT_NAME, version: CLIENT_VERSION },
        { capabilities: {} },
      );
      const transport = createTransport(material);
      try {
        await client.connect(transport, {
          timeout: CONNECT_TIMEOUT_MS,
          maxTotalTimeout: CONNECT_TIMEOUT_MS,
        });
        return new OfficialMcpRuntimeClient(client);
      } catch (error) {
        await client.close().catch(() => undefined);
        throw error;
      }
    },
  });
}
