/**
 * [2026-10-09 사장님 승인] 무인 작업의 NETWORK_WAIT 자동 재확인(2·5·10분, 최대 3번). 실제 AccountExecutionGuard(임시 폴더)와 가짜 시계를 쓴다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountExecutionGuard } from '../automation/accountExecutionGuard';
import { forgetNetworkWaitRecheck, recheckNetworkWaitStop, type NetworkWaitRecheckDeps } from '../main/networkWaitRecheck';

const MIN = 60_000;
let dir: string; let guard: AccountExecutionGuard; let clock: number;
const ID = 'owner-id';

function makeDeps(over: Partial<NetworkWaitRecheckDeps> & { verdict?: string; blocked?: () => boolean } = {}) {
  const { verdict, blocked, ...depsOver } = over;
  const verify = vi.fn(async () => ({ status: verdict ?? 'ready' }));
  const ensureSession = vi.fn(async () => {});
  const recordStop = vi.fn((id: string, code: 'LOGIN_CHALLENGE' | 'ACCOUNT_PROTECTED') => { guard.pause(id, code); });
  const deps: NetworkWaitRecheckDeps = {
    status: id => guard.getStatus(id), journalBlocked: () => blocked?.() ?? false, ensureSession, verify,
    resumeNetworkWait: (id, v) => guard.resumeNetworkWait(id, v), recordStop, now: () => clock, ...depsOver,
  };
  return { deps, verify, ensureSession, recordStop };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nw-recheck-')); guard = new AccountExecutionGuard({ storageDir: dir });
  forgetNetworkWaitRecheck(); clock = Date.now();
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); vi.useRealTimers(); });

describe('networkWaitRecheck', () => {
  it('확인 시각(멈춘 지 2분) 전이면 wait 이고 확인하지 않는다', async () => {
    guard.pause(ID, 'NETWORK_WAIT'); clock = Date.parse(guard.getStatus(ID).pausedAt!) + 1 * MIN;
    const { deps, verify, ensureSession } = makeDeps();
    const r = await recheckNetworkWaitStop(ID, deps);
    expect(r).toMatchObject({ kind: 'wait', attempt: 1 });
    expect((r as { nextAt: number }).nextAt).toBe(Date.parse(guard.getStatus(ID).pausedAt!) + 2 * MIN);
    expect(verify).not.toHaveBeenCalled(); expect(ensureSession).not.toHaveBeenCalled();
    expect(guard.getStatus(ID).paused).toBe(true);
  });

  it('2분에 ready 면 멈춤을 풀고 resumed', async () => {
    guard.pause(ID, 'NETWORK_WAIT'); clock = Date.parse(guard.getStatus(ID).pausedAt!) + 2 * MIN;
    const { deps, verify } = makeDeps();
    expect(await recheckNetworkWaitStop(ID, deps)).toEqual({ kind: 'resumed', attempt: 1 });
    expect(verify).toHaveBeenCalledTimes(1); expect(guard.getStatus(ID).paused).toBe(false);
    expect(await recheckNetworkWaitStop(ID, deps)).toEqual({ kind: 'not-paused' });
  });

  it('2·5·10분 세 번 실패하면 exhausted, 네 번째는 확인 없이 manual', async () => {
    guard.pause(ID, 'NETWORK_WAIT'); const t0 = Date.parse(guard.getStatus(ID).pausedAt!);
    const { deps, verify } = makeDeps({ verdict: 'unknown' });
    clock = t0 + 2 * MIN; expect(await recheckNetworkWaitStop(ID, deps)).toMatchObject({ kind: 'wait', attempt: 2, nextAt: clock + 5 * MIN });
    clock += 4 * MIN; expect(await recheckNetworkWaitStop(ID, deps)).toMatchObject({ kind: 'wait', attempt: 2 });
    expect(verify).toHaveBeenCalledTimes(1);
    clock += 1 * MIN; expect(await recheckNetworkWaitStop(ID, deps)).toMatchObject({ kind: 'wait', attempt: 3, nextAt: clock + 10 * MIN });
    clock += 10 * MIN; expect(await recheckNetworkWaitStop(ID, deps)).toEqual({ kind: 'manual', code: 'NETWORK_WAIT', reason: 'exhausted' });
    expect(verify).toHaveBeenCalledTimes(3);
    clock += 60 * MIN; expect(await recheckNetworkWaitStop(ID, deps)).toEqual({ kind: 'manual', code: 'NETWORK_WAIT', reason: 'exhausted' });
    expect(verify).toHaveBeenCalledTimes(3); expect(guard.getStatus(ID)).toMatchObject({ paused: true, code: 'NETWORK_WAIT' });
  });

  it.each(['LOGIN_REQUIRED', 'PUBLISH_OUTCOME_UNKNOWN', 'LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'ACCOUNT_MISMATCH'] as const)('%s 는 확인 없이 manual(other-stop)', async (code) => {
    guard.pause(ID, code); clock += 60 * MIN;
    const { deps, verify, ensureSession } = makeDeps();
    expect(await recheckNetworkWaitStop(ID, deps)).toEqual({ kind: 'manual', code, reason: 'other-stop' });
    expect(verify).not.toHaveBeenCalled(); expect(ensureSession).not.toHaveBeenCalled();
  });

  it('상태 저장소 오류(storageError)는 확인 없이 manual', async () => {
    guard.pause(ID, 'NETWORK_WAIT'); writeFileSync(join(dir, readdirSync(dir).find(f => f.endsWith('.json'))!), '{bad');
    const broken = new AccountExecutionGuard({ storageDir: dir }); clock += 60 * MIN;
    const { deps, verify } = makeDeps({ status: id => broken.getStatus(id), resumeNetworkWait: (id, v) => broken.resumeNetworkWait(id, v) });
    expect(await recheckNetworkWaitStop(ID, deps)).toMatchObject({ kind: 'manual', reason: 'other-stop' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('발행 기록이 미확정이면 확인 없이 manual', async () => {
    guard.pause(ID, 'NETWORK_WAIT'); clock += 60 * MIN;
    const { deps, verify } = makeDeps({ blocked: () => true });
    expect(await recheckNetworkWaitStop(ID, deps)).toMatchObject({ kind: 'manual', reason: 'other-stop' });
    expect(verify).not.toHaveBeenCalled(); expect(guard.getStatus(ID).paused).toBe(true);
  });

  it('확인 도중 발행 기록이 미확정으로 바뀌면 풀지 않는다', async () => {
    guard.pause(ID, 'NETWORK_WAIT'); clock += 60 * MIN; let calls = 0;
    const { deps } = makeDeps({ blocked: () => ++calls > 1 });
    expect((await recheckNetworkWaitStop(ID, deps)).kind).toBe('wait');
    expect(guard.getStatus(ID).paused).toBe(true);
  });

  it('login-required 판정은 needs-user 이고 멈춤 코드는 그대로다', async () => {
    guard.pause(ID, 'NETWORK_WAIT'); clock += 60 * MIN;
    const { deps, recordStop } = makeDeps({ verdict: 'login-required' });
    expect(await recheckNetworkWaitStop(ID, deps)).toEqual({ kind: 'manual', code: 'NETWORK_WAIT', reason: 'needs-user' });
    expect(recordStop).not.toHaveBeenCalled(); expect(guard.getStatus(ID).code).toBe('NETWORK_WAIT');
    const again = makeDeps({ verdict: 'ready' });
    expect(await recheckNetworkWaitStop(ID, again.deps)).toMatchObject({ kind: 'manual', reason: 'needs-user' });
    expect(again.verify).not.toHaveBeenCalled();
  });

  it.each([['challenge', 'LOGIN_CHALLENGE'], ['protected', 'ACCOUNT_PROTECTED']] as const)('%s 판정은 %s 로 저장하고 사람에게 넘긴다', async (status, code) => {
    guard.pause(ID, 'NETWORK_WAIT'); clock += 60 * MIN;
    const { deps, recordStop } = makeDeps({ verdict: status });
    expect(await recheckNetworkWaitStop(ID, deps)).toMatchObject({ kind: 'manual', reason: 'needs-user' });
    expect(recordStop).toHaveBeenCalledWith(ID, code); expect(guard.getStatus(ID).code).toBe(code);
  });

  it('사람이 재개했다가 다시 멈추면 처음부터 센다', async () => {
    guard.pause(ID, 'NETWORK_WAIT'); const t0 = Date.parse(guard.getStatus(ID).pausedAt!);
    const { deps, verify } = makeDeps({ verdict: 'unknown' });
    clock = t0 + 2 * MIN; await recheckNetworkWaitStop(ID, deps);
    expect(await guard.resume(ID, async () => true)).toBe(true);
    guard.pause(ID, 'NETWORK_WAIT'); const t1 = Date.parse(guard.getStatus(ID).pausedAt!); clock = Math.max(clock, t1);
    const r = await recheckNetworkWaitStop(ID, deps);
    expect(r).toMatchObject({ kind: 'wait', attempt: 1 });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('같은 계정의 동시 호출은 한 번만 확인한다', async () => {
    guard.pause(ID, 'NETWORK_WAIT'); clock += 60 * MIN;
    let release!: () => void;
    const { deps, verify } = makeDeps({ ensureSession: () => new Promise<void>(r => { release = r; }) });
    const first = recheckNetworkWaitStop(ID, deps); const second = recheckNetworkWaitStop(ID, deps);
    release(); const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b); expect(verify).toHaveBeenCalledTimes(1);
  });

  it('다른 작업이 계정을 쓰는 중이면 확인하지 않고 30초 이상 뒤로 미룬다', async () => {
    guard.pause(ID, 'NETWORK_WAIT'); clock += 60 * MIN;
    const { deps, verify } = makeDeps({ status: id => ({ ...guard.getStatus(id), busy: true }) });
    const r = await recheckNetworkWaitStop(ID, deps);
    expect(r).toMatchObject({ kind: 'wait', attempt: 1 }); expect((r as { nextAt: number }).nextAt).toBeGreaterThanOrEqual(clock + 30_000);
    expect(verify).not.toHaveBeenCalled();
  });
});
