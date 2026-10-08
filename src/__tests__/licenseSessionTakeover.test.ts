import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(__dirname, '../licenseManager.ts'), 'utf8');
const ast = ts.createSourceFile('licenseManager.ts', source, ts.ScriptTarget.Latest, true);
const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'verifyLicenseWithCredentials')!;
const javascript = ts.transpileModule(node.getText(ast).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function runtime(response: any) {
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(response) });
  const saveLicense = vi.fn().mockResolvedValue(undefined);
  const logs: unknown[][] = [];
  const console = Object.fromEntries(['log', 'warn', 'error'].map(name => [name, (...args: unknown[]) => logs.push(args)]));
  const deps = {
    app: { getVersion: () => 'test' }, BrowserWindow: { getAllWindows: () => [] }, fetch, saveLicense, console,
    getLicenseAppPayload: () => ({ appId: 'com.betterlife.naver', platform: 'NAVER' }),
    hasPositiveAuthSignal: (value: any) => value?.valid === true || value?.ok === true,
    isServerPlaceholderResponse: () => false,
    getServerErrorMessage: (value: any, fallback: string) => value.error || fallback,
    translateErrorMessage: (value: string) => value,
    startSessionValidation: vi.fn(), LICENSE_REQUEST_TIMEOUT_MS: 20000, TRANSIENT_AUTH_MESSAGE: '일시적인 인증 오류',
  };
  const verify = new Function(...Object.keys(deps), `let currentSessionId = ''; ${javascript}; return verifyLicenseWithCredentials;`)(...Object.values(deps));
  return { verify, fetch, saveLicense, logs, body: () => JSON.parse(fetch.mock.calls[0][1].body) };
}

describe('explicit authenticated device-session takeover', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('preserves the conflict code and strict server capability without persisting a license', async () => {
    const run = runtime({ ok: false, valid: false, code: 'ALREADY_LOGGED_IN', takeoverAvailable: true });
    const result = await run.verify(' member ', ' password ', 'device-b', 'https://fixture.invalid');
    expect(result).toMatchObject({ valid: false, code: 'ALREADY_LOGGED_IN', takeoverAvailable: true });
    expect(run.body()).not.toHaveProperty('takeoverSession');
    expect(run.saveLicense).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends takeover only for an explicit boolean true and accepts an authenticated new session', async () => {
    const run = runtime({ ok: true, valid: true, sessionToken: 'private-new-session', previousSessionTerminated: true });
    const result = await run.verify('member', 'private-password', 'device-b', 'https://fixture.invalid', { takeoverSession: true });
    expect(run.body()).toMatchObject({ action: 'verify-credentials', userId: 'member', userPassword: 'private-password', deviceId: 'device-b', takeoverSession: true });
    expect(result).toMatchObject({ valid: true, previousSessionTerminated: true });
    expect(run.saveLicense).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sessionToken: 'private-new-session', deviceId: 'device-b' }));
    expect(JSON.stringify(run.logs)).not.toContain('private-new-session');
    expect(JSON.stringify(run.logs)).not.toContain('private-password');
    expect(JSON.stringify(result.debugInfo)).not.toContain('private-new-session');
  });

  it.each(['true', 1, false, undefined])('does not promote a truthy option %s into takeover', async value => {
    const run = runtime({ ok: false, valid: false, code: 'ALREADY_LOGGED_IN', takeoverAvailable: 'true' });
    const result = await run.verify('member', 'password', 'device-b', 'https://fixture.invalid', { takeoverSession: value });
    expect(run.body()).not.toHaveProperty('takeoverSession');
    expect(result.takeoverAvailable).toBe(false);
  });

  it.each([{ ok: true, valid: true }, { ok: true, valid: true, sessionToken: ' ' }, { ok: true, sessionToken: 'token' }])('rejects an unconfirmed takeover success %j', async response => {
    const run = runtime(response);
    const result = await run.verify('member', 'password', 'device-b', 'https://fixture.invalid', { takeoverSession: true });
    expect(result.valid).toBe(false);
    expect(run.saveLicense).not.toHaveBeenCalled();
  });

  it('does not bypass credential errors and rejects takeover with no device identity', async () => {
    const run = runtime({ ok: false, valid: false, code: 'INVALID_CREDENTIALS', error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    expect((await run.verify('member', 'wrong', 'device-b', 'https://fixture.invalid', { takeoverSession: true })).valid).toBe(false);
    expect(run.saveLicense).not.toHaveBeenCalled();
    run.fetch.mockClear();
    expect((await run.verify('member', 'password', ' ', 'https://fixture.invalid', { takeoverSession: true })).valid).toBe(false);
    expect(run.fetch).not.toHaveBeenCalled();
  });

  it('clears the request timeout after a transport failure without deleting or replacing local state', async () => {
    const run = runtime({});
    run.fetch.mockRejectedValue(new Error('fixture connection failed'));
    expect((await run.verify('member', 'password', 'device-b', 'https://fixture.invalid', { takeoverSession: true })).valid).toBe(false);
    expect(run.saveLicense).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not log response snippets or transport error objects containing credentials', async () => {
    const malformed = runtime({});
    const serializeLogs = (logs: unknown) => JSON.stringify(logs, (_key, value) => value instanceof Error ? { ...value, message: value.message, stack: value.stack } : value);
    malformed.fetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', text: async () => 'secretXYZ-invalid-json' });
    expect((await malformed.verify('member', 'password', 'device-b', 'https://fixture.invalid')).valid).toBe(false);
    expect(serializeLogs(malformed.logs)).not.toContain('secretXYZ');
    const transport = runtime({});
    transport.fetch.mockRejectedValue(Object.assign(new Error('fixture failed'), { request: { userPassword: 'private-error-password', sessionToken: 'private-error-token' } }));
    expect((await transport.verify('member', 'password', 'device-b', 'https://fixture.invalid')).valid).toBe(false);
    expect(serializeLogs(transport.logs)).not.toContain('private-error-password');
    expect(serializeLogs(transport.logs)).not.toContain('private-error-token');
  });
});
