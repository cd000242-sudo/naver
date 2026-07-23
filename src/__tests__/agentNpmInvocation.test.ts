/**
 * resolveNpmInvocation — how the app runs npm for an agent install.
 *
 * Guards the property the whole fix rests on: install must be driven by the app's own
 * Node runtime, so it works on a PC where `npm` is nowhere on PATH.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { delimiter } from 'path';

const ensureBootstrappedNpmMock = vi.hoisted(() => vi.fn());
vi.mock('../agentCli/npmBootstrap', () => ({
  ensureBootstrappedNpm: (...args: unknown[]) => ensureBootstrappedNpmMock(...args),
}));

const MANAGED_ROOT = '/mock/userData/agent-runtime';
const BUNDLED_NPM_CLI = `${MANAGED_ROOT}/npm/bin/npm-cli.js`;

import { resolveNpmInvocation } from '../agentCli/npmInvocation';
import { AGENT_RUNTIME_NODE_ENV_KEY } from '../agentCli/agentRuntime';

beforeEach(() => {
  ensureBootstrappedNpmMock.mockReset();
  ensureBootstrappedNpmMock.mockResolvedValue(BUNDLED_NPM_CLI);
  process.env.NAVER_PASSWORD = 'must-not-reach-npm';
  process.env.GEMINI_API_KEY = 'must-not-reach-npm';
  process.env.NPM_CONFIG_PREFIX = 'C:\\Users\\tester\\npm-global';
});

afterEach(() => {
  delete process.env.NAVER_PASSWORD;
  delete process.env.GEMINI_API_KEY;
  delete process.env.NPM_CONFIG_PREFIX;
});

describe('resolveNpmInvocation (bundled runtime)', () => {
  it('runs the bootstrapped npm on the app executable, not a PATH-resolved npm', async () => {
    const invocation = await resolveNpmInvocation();
    expect(invocation.source).toBe('bundled');
    expect(invocation.command).toBe(process.execPath);
    expect(invocation.prefixArgs).toEqual([BUNDLED_NPM_CLI]);
  });

  it('runs Electron in Node mode and publishes the runtime path for the shim', async () => {
    const invocation = await resolveNpmInvocation();
    expect(invocation.env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(invocation.env[AGENT_RUNTIME_NODE_ENV_KEY]).toBe(process.execPath);
  });

  it('puts the shim directory on PATH so npm lifecycle scripts can call `node`', async () => {
    const invocation = await resolveNpmInvocation();
    const key = Object.keys(invocation.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
    const first = String(invocation.env[key]).split(delimiter)[0];
    expect(first.replace(/\\/g, '/')).toContain('agent-runtime/bin');
  });

  it('targets an app-owned prefix and cache instead of the user global folder', async () => {
    const invocation = await resolveNpmInvocation();
    expect(String(invocation.prefix).replace(/\\/g, '/')).toContain('agent-runtime/global');
    expect(String(invocation.cache).replace(/\\/g, '/')).toContain('agent-runtime/npm-cache');
    // A leftover user override would make the install location ambiguous.
    expect(invocation.env.NPM_CONFIG_PREFIX).toBeUndefined();
  });

  it('does not forward application secrets to npm', async () => {
    const invocation = await resolveNpmInvocation();
    expect(invocation.env.NAVER_PASSWORD).toBeUndefined();
    expect(invocation.env.GEMINI_API_KEY).toBeUndefined();
  });
});

describe('resolveNpmInvocation (fallback)', () => {
  it('falls back to the system npm and reports why', async () => {
    ensureBootstrappedNpmMock.mockRejectedValue(new Error('npm 다운로드 실패 (HTTP 503)'));
    const invocation = await resolveNpmInvocation();
    expect(invocation.source).toBe('system');
    expect(invocation.command).toBe('npm');
    expect(invocation.prefixArgs).toEqual([]);
    expect(invocation.bootstrapError).toContain('HTTP 503');
  });

  it('still targets the app-owned prefix on the fallback path', async () => {
    ensureBootstrappedNpmMock.mockRejectedValue(new Error('offline'));
    const invocation = await resolveNpmInvocation();
    expect(String(invocation.prefix).replace(/\\/g, '/')).toContain('agent-runtime/global');
  });
});
