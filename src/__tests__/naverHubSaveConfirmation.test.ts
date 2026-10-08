import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// [2026-10-09] The owner could not tell whether the API HUB key was saved: every other key logs "저장됨" on save,
// the HUB key logged nothing, and a key wiped by the 2.11.306 update stayed gone unnoticed.
const handlers = new Map<string, (...args: any[]) => Promise<any>>();
const config = {
  loadConfig: vi.fn(async () => ({})),
  saveConfig: vi.fn(async (value: any) => value),
  applyConfigToEnv: vi.fn(),
  validateApiKeyFormat: vi.fn(() => ({ valid: true })),
};
const code = ts.transpileModule(readFileSync('src/main/ipc/configHandlers.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleExports: Record<string, any> = {};
runInNewContext(code, {
  exports: moduleExports, console, process,
  require: (id: string) => id === 'electron'
    ? { ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) } }
    : id.includes('configManager') ? config : { setDailyLimit: vi.fn() },
});

function save(payload: Record<string, unknown>): Promise<string[]> {
  const sendLog = vi.fn();
  moduleExports.registerConfigHandlers({ getAppConfig: () => ({}), setAppConfig: vi.fn(), sendLog });
  return handlers.get('config:set')!({}, payload).then(() => sendLog.mock.calls.map((call) => String(call[0])));
}

it('confirms a saved API HUB key without printing it', async () => {
  const logs = await save({ naverHubClientId: 'hub-id-123', naverHubClientSecret: 'hub-secret-456' });
  const line = logs.find((message) => message.includes('API HUB 키 저장됨'));
  expect(line).toBeDefined();
  expect(line).not.toContain('hub-id-123');
  expect(line).not.toContain('hub-secret-456');
});

it('says nothing about the HUB key when it is not saved', async () => {
  const logs = await save({ naverClientId: 'legacy-only' });
  expect(logs.some((message) => message.includes('API HUB'))).toBe(false);
});
