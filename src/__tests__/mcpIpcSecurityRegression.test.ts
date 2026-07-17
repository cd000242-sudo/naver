import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const ipc = readFileSync(resolve(process.cwd(), 'src', 'main', 'ipc', 'mcpHandlers.ts'), 'utf8');
const host = readFileSync(resolve(process.cwd(), 'src', 'main', 'services', 'mcpRuntimeHost.ts'), 'utf8');

describe('MCP IPC security boundary', () => {
  it('keeps runtime material in the encrypted main-process vault', () => {
    expect(host).toMatch(/mcp-connections\.secure\.json/);
    expect(host).toMatch(/encryptString,\s*decryptString,\s*isEncrypted/);
    expect(ipc).not.toMatch(/return\s*\{\s*success:\s*true,[^}]*material/);
  });

  it('requires the trusted top-level local renderer for every MCP operation', () => {
    const handlerCount = (ipc.match(/ipcMain\.handle\('mcp:/g) ?? []).length;
    const trustCheckCount = (ipc.match(/assertTrustedSender\(event, trustedRendererPath\)/g) ?? []).length;
    expect(handlerCount).toBe(4);
    expect(trustCheckCount).toBe(handlerCount);
  });

  it('tests discovery without invoking a paid generation tool and blocks deletion of an active route', () => {
    expect(ipc).toMatch(/runtime\.checkRoute\(route\)/);
    expect(ipc).toContain('paidToolInvoked: false');
    expect(ipc).toContain('MCP_CONNECTION_IN_USE');
  });
});
