import { describe, expect, it, vi, afterEach } from 'vitest';
import { agentSetupPlatform } from '../agentCli/setupPlatform.js';
import { AGENT_NODE_SHIM_POSIX, withAgentRuntimePath, getAgentGlobalPrefix } from '../agentCli/agentRuntime.js';
import { delimiter, join } from 'node:path';

afterEach(() => vi.unstubAllGlobals());
describe('explicit one-click platform contract', () => {
  it.each(['win32', 'darwin', 'linux'] as const)('supports %s only for 64-bit targets', platform => {
    for (const arch of ['x64', 'arm64']) expect(agentSetupPlatform(platform, arch, platform === 'darwin' ? '22.0.0' : '10.0.22631')).toMatchObject({ platform, arch });
    expect(() => agentSetupPlatform(platform, 'ia32', '10.0.22631')).toThrow(/64|지원/);
  });
  it('fails closed on unsupported or obsolete platforms', () => {
    for (const args of [['freebsd', 'x64', '14'], ['win32', 'x64', '6.1.7601'], ['darwin', 'arm64', '19.0.0']] as const) expect(() => agentSetupPlatform(...args)).toThrow(/지원/);
  });
  it('has an ASCII POSIX shim using quoted environment values and forwarded arguments', () => {
    expect(AGENT_NODE_SHIM_POSIX).toMatch(/^[\x00-\x7f]*$/);
    expect(AGENT_NODE_SHIM_POSIX).toContain('"$AGENT_RUNTIME_NODE" "$@"');
    expect(AGENT_NODE_SHIM_POSIX).toContain('ELECTRON_RUN_AS_NODE=1');
  });
  it('makes npm prefix/bin visible on POSIX without changing the parent environment', () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      const original = { PATH: '/usr/bin' }; const env = withAgentRuntimePath(original);
      expect(env.PATH?.split(delimiter)).toContain(join(getAgentGlobalPrefix(), 'bin'));
      expect(env.AGENT_RUNTIME_NODE).toBe(process.execPath); expect(original).toEqual({ PATH: '/usr/bin' });
    } finally { Object.defineProperty(process, 'platform', platform); }
  });
});
