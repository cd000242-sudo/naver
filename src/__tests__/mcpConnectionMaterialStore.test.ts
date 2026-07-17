import { promises as fs } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  McpConnectionMaterialStoreError,
  createMcpConnectionMaterialStore,
} from '../generation/mcp/connectionMaterialStore';

const roots: string[] = [];

async function tempFile(): Promise<string> {
  const root = await fs.mkdtemp(path.join(process.cwd(), 'tmp', 'mcp-vault-test-'));
  roots.push(root);
  return path.join(root, 'connections.secure.json');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const codec = Object.freeze({
  encryptString: (plain: string) => `enc:test:${Buffer.from(plain).toString('base64')}`,
  decryptString: (stored: string) => Buffer.from(stored.slice('enc:test:'.length), 'base64').toString('utf8'),
  isEncrypted: (stored: string) => stored.startsWith('enc:test:'),
});

describe('encrypted MCP connection material store', () => {
  it('round-trips runtime material while never writing commands, URLs, or tokens in plaintext', async () => {
    const filePath = await tempFile();
    const store = createMcpConnectionMaterialStore({ filePath, codec });
    await store.saveAll([
      {
        profileId: 'local-writer',
        transport: 'stdio',
        command: 'node',
        args: ['writer-server.mjs'],
        env: { PRIVATE_TOKEN: 'top-secret' },
      },
      {
        profileId: 'remote-images',
        transport: 'streamable-http',
        url: 'https://mcp.example.test/rpc',
        headers: { Authorization: 'Bearer hidden' },
      },
    ]);

    const disk = await fs.readFile(filePath, 'utf8');
    expect(disk).toContain('encryptedPayload');
    expect(disk).not.toContain('writer-server.mjs');
    expect(disk).not.toContain('top-secret');
    expect(disk).not.toContain('Bearer hidden');
    expect(await store.loadAll()).toEqual([
      {
        profileId: 'local-writer',
        transport: 'stdio',
        command: 'node',
        args: ['writer-server.mjs'],
        cwd: undefined,
        env: { PRIVATE_TOKEN: 'top-secret' },
      },
      {
        profileId: 'remote-images',
        transport: 'streamable-http',
        url: 'https://mcp.example.test/rpc',
        headers: { Authorization: 'Bearer hidden' },
      },
    ]);
  });

  it('rejects a plaintext or structurally corrupt vault instead of treating it as legacy data', async () => {
    const filePath = await tempFile();
    const store = createMcpConnectionMaterialStore({ filePath, codec });
    await fs.writeFile(filePath, JSON.stringify({ version: 1, encryptedPayload: '{"token":"plaintext"}' }));

    await expect(store.loadAll()).rejects.toMatchObject({ code: 'MCP_VAULT_NOT_ENCRYPTED' });
  });

  it('rejects duplicate profiles and unsafe runtime material before touching the existing vault', async () => {
    const filePath = await tempFile();
    const store = createMcpConnectionMaterialStore({ filePath, codec });
    const unsafe = {
      profileId: 'same-profile',
      transport: 'stdio' as const,
      command: 'node && calc.exe',
    };

    await expect(store.saveAll([unsafe])).rejects.toBeInstanceOf(Error);
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });

    await expect(store.saveAll([
      { profileId: 'same-profile', transport: 'stdio', command: 'node' },
      { profileId: 'same-profile', transport: 'stdio', command: 'node' },
    ])).rejects.toBeInstanceOf(McpConnectionMaterialStoreError);
  });

  it('removes a selected profile without mutating caller-owned material', async () => {
    const filePath = await tempFile();
    const store = createMcpConnectionMaterialStore({ filePath, codec });
    const material = { profileId: 'one', transport: 'stdio' as const, command: 'node', args: ['a.mjs'] };
    await store.saveAll([material, { profileId: 'two', transport: 'stdio', command: 'node', args: ['b.mjs'] }]);

    await store.remove('one');

    expect(material.args).toEqual(['a.mjs']);
    expect(await store.get('one')).toBeUndefined();
    expect((await store.get('two'))?.profileId).toBe('two');
  });
});
