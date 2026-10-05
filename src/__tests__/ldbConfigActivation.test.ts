import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const handlers = new Map<string, (...args: any[]) => Promise<any>>();
const config = { loadConfig: vi.fn(async () => ({})), saveConfig: vi.fn(async (value: any) => value), applyConfigToEnv: vi.fn(), validateApiKeyFormat: vi.fn(() => ({ valid: true })) };
const code = ts.transpileModule(readFileSync('src/main/ipc/configHandlers.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleExports: Record<string, any> = {};
runInNewContext(code, { exports: moduleExports, console, process, require: (id: string) => id === 'electron' ? { ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) } } : id.includes('configManager') ? config : { setDailyLimit: vi.fn() } });
const registerConfigHandlers = moduleExports.registerConfigHandlers;
it('refreshes bridge lifecycle through the actual preload saveConfig channel for enable and disable', async () => {
 const refresh = vi.fn(); registerConfigHandlers({ getAppConfig: () => ({}), setAppConfig: vi.fn(), sendLog: vi.fn(), onAccountActivated: refresh });
 const preload = readFileSync('src/preload.ts', 'utf8');
 const channel = preload.match(/saveConfig:[\s\S]*?ipcRenderer.invoke\('([^']+)'/)?.[1];
 expect(channel).toBe('config:set');
 await handlers.get(channel!)!({}, { ldbBridgeEnabled: true }); expect(refresh).toHaveBeenCalledTimes(1);
 await handlers.get(channel!)!({}, { ldbBridgeEnabled: false }); expect(refresh).toHaveBeenCalledTimes(2);
 await handlers.get(channel!)!({}, { unrelated: true }); expect(refresh).toHaveBeenCalledTimes(2);
});
