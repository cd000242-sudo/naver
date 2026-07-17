import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('official MCP SDK runtime factory', () => {
  it('uses official stdio and Streamable HTTP transports with reconnect retries disabled', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/generation/mcp/sdkClientFactory.ts'),
      'utf8',
    );

    expect(source).toContain("from '@modelcontextprotocol/sdk/client/index.js'");
    expect(source).toContain('new StdioClientTransport');
    expect(source).toContain('new StreamableHTTPClientTransport');
    expect(source).toContain('maxRetries: 0');
    expect(source).toContain('maxTotalTimeout: options.timeoutMs');
    expect(source).not.toContain('console.');
  });
});
