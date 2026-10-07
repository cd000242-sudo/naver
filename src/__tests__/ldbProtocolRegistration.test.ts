import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
it('registers installed app URI only for normal use, never isolated E2E or self-test packages', () => {
 const source = readFileSync('src/main.ts', 'utf8');
 const line = source.split(/\r?\n/).find(value => value.includes('app.setAsDefaultProtocolClient(LDB_CONNECT_SCHEME)'));
 expect(line).toBeTruthy();
 for (const state of [
  { packaged: true, e2e: false, selfTest: undefined, expected: 1 },
  { packaged: false, e2e: false, selfTest: undefined, expected: 0 },
  { packaged: true, e2e: true, selfTest: undefined, expected: 0 },
  { packaged: true, e2e: false, selfTest: '1', expected: 0 },
  { packaged: true, e2e: true, selfTest: '1', expected: 0 },
 ]) {
  const register = vi.fn();
  runInNewContext(line!, { app: { isPackaged: state.packaged, setAsDefaultProtocolClient: register }, isE2ETestMode: () => state.e2e, process: { env: { SELF_TEST: state.selfTest } }, LDB_CONNECT_SCHEME: 'better-life-naver' });
  expect(register).toHaveBeenCalledTimes(state.expected);
 }
});
