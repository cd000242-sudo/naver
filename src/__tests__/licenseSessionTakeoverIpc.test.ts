import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(__dirname, '../main/ipc/authHandlers.ts'), 'utf8');
const ast = ts.createSourceFile('authHandlers.ts', source, ts.ScriptTarget.Latest, true);
const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'registerLicenseHandlers')!;
const javascript = ts.transpileModule(node.getText(ast).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const handlers = new Map<string, Function>();
  const verify = vi.fn().mockResolvedValue({ valid: false, code: 'ALREADY_LOGGED_IN', takeoverAvailable: true });
  const getDeviceId = vi.fn().mockResolvedValue('actual-main-device');
  new Function('ipcMain', 'verifyLicenseWithCredentials', 'getDeviceId', `${javascript}; registerLicenseHandlers({});`)(
    { handle: (channel: string, handler: Function) => handlers.set(channel, handler) }, verify, getDeviceId,
  );
  return { invoke: handlers.get('license:verifyWithCredentials')!, verify, getDeviceId };
}

describe('device takeover IPC boundary', () => {
  it('uses the main-process device identity for an explicit takeover and returns the conflict contract', async () => {
    const run = fixture();
    expect(await run.invoke({}, 'member', 'password', 'renderer-spoof', { takeoverSession: true }))
      .toMatchObject({ code: 'ALREADY_LOGGED_IN', takeoverAvailable: true });
    expect(run.verify).toHaveBeenCalledExactlyOnceWith('member', 'password', 'actual-main-device', expect.any(String), { takeoverSession: true });
  });
  it.each([undefined, {}, { takeoverSession: 'true' }, { takeoverSession: 1 }, { takeoverSession: false }])('keeps a normal login for option %j', async options => {
    const run = fixture();
    await run.invoke({}, 'member', 'password', 'existing-device', options);
    expect(run.getDeviceId).not.toHaveBeenCalled();
    expect(run.verify).toHaveBeenCalledExactlyOnceWith('member', 'password', 'existing-device', expect.any(String), undefined);
  });
});
