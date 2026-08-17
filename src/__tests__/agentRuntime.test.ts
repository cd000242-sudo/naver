/**
 * agentRuntime — app-owned execution environment for the agent CLIs.
 *
 * These lock two failures that were observed live, not theorised:
 *  1) install resolved `npm` from the user's PATH and failed closed on any PC without it;
 *  2) the node shim baked an absolute path into a .cmd file, and cmd.exe reads .cmd in the
 *     OEM code page (949), so under C:\Users\박성현\... claude-code's postinstall died with
 *     "지정된 경로를 찾을 수 없습니다" and claude.exe was never produced.
 */
import { describe, it, expect } from 'vitest';
import { delimiter } from 'path';
import {
  AGENT_NODE_SHIM_CMD,
  AGENT_RUNTIME_NODE_ENV_KEY,
  getClaudeInstallDirs,
  getCodexInstallDirs,
  withPathEntries,
} from '../agentCli/agentRuntime';
import { readFileSync } from 'fs';

describe('agentRuntime node shim', () => {
  it('contains no non-ASCII byte, so the OEM code page cannot corrupt it', () => {
    expect(AGENT_NODE_SHIM_CMD).toMatch(/^[\x00-\x7F]*$/);
  });

  it('reads the runtime path from the environment instead of embedding it', () => {
    expect(AGENT_NODE_SHIM_CMD).toContain(`"%${AGENT_RUNTIME_NODE_ENV_KEY}%" %*`);
    // A drive-letter path in the file is exactly the bug this shim exists to avoid.
    expect(AGENT_NODE_SHIM_CMD).not.toMatch(/[A-Za-z]:\\/);
  });

  it('fails fast rather than running an empty command when the variable is unset', () => {
    expect(AGENT_NODE_SHIM_CMD).toContain(`IF NOT DEFINED ${AGENT_RUNTIME_NODE_ENV_KEY}`);
  });
});

/**
 * [2026-08-18 사용자 실측] 앱이 "claude CLI가 설치되어 있지 않습니다"를 띄웠다.
 * 원인은 미설치가 아니라 stale PATH — 설치기가 User PATH 레지스트리에만 경로를 쓰고,
 * 이미 실행 중이던 프로세스(및 그 부모 Explorer)는 옛 환경 블록을 유지하기 때문.
 * agy에만 있던 "알려진 설치 경로 명시" 조치를 claude/codex로 확장한 것을 잠근다.
 */
describe('CLI 설치 경로 명시 (stale PATH 대응)', () => {
  it('claude는 ~/.local/bin 을 후보로 낸다', () => {
    const dirs = getClaudeInstallDirs();
    expect(dirs.length).toBeGreaterThan(0);
    expect(dirs.some((d) => /[\\/]\.local[\\/]bin$/.test(d))).toBe(true);
  });

  it('codex는 npm 전역 prefix(%APPDATA%\\npm)를 후보로 낸다', () => {
    if (process.platform !== 'win32') return;
    const dirs = getCodexInstallDirs();
    expect(dirs.some((d) => /npm$/i.test(d))).toBe(true);
  });

  it('구독 env 빌더가 claude/codex 설치 경로를 PATH에 넣는다', () => {
    const src = readFileSync(new URL('../agentCli/subscriptionEnv.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/buildClaudeSubscriptionEnv[\s\S]{0,400}getClaudeInstallDirs\(\)/);
    expect(src).toMatch(/buildCodexSubscriptionEnv[\s\S]{0,400}getCodexInstallDirs\(\)/);
    // agy 경로는 기존대로 유지
    expect(src).toMatch(/getAgyInstallDirs\(\)/);
  });
});

describe('withPathEntries', () => {
  it('prepends directories to PATH', () => {
    const env = withPathEntries({ PATH: `C:${'\\'}Windows` }, ['C:\\managed']);
    expect(env.PATH).toBe(`C:\\managed${delimiter}C:\\Windows`);
  });

  it('writes back to the inherited key casing instead of adding a second PATH', () => {
    const env = withPathEntries({ Path: 'C:\\Windows' }, ['C:\\managed']);
    expect(env.Path).toBe(`C:\\managed${delimiter}C:\\Windows`);
    expect(env.PATH).toBeUndefined();
  });

  it('keeps the inherited entries so a user-installed CLI still resolves', () => {
    const env = withPathEntries({ Path: `C:\\Program Files\\nodejs${delimiter}C:\\Windows` }, ['C:\\managed']);
    expect(String(env.Path).split(delimiter)).toEqual([
      'C:\\managed',
      'C:\\Program Files\\nodejs',
      'C:\\Windows',
    ]);
  });

  it('deduplicates so repeated calls cannot grow PATH without bound', () => {
    const once = withPathEntries({ Path: 'C:\\Windows' }, ['C:\\managed']);
    const twice = withPathEntries(once, ['C:\\managed']);
    expect(twice.Path).toBe(once.Path);
  });

  it('ignores relative entries', () => {
    const env = withPathEntries({ Path: 'C:\\Windows' }, ['.', '']);
    expect(env.Path).toBe('C:\\Windows');
  });

  it('does not mutate the caller env', () => {
    const original = { Path: 'C:\\Windows' };
    withPathEntries(original, ['C:\\managed']);
    expect(original.Path).toBe('C:\\Windows');
  });
});
