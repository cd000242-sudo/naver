/**
 * Audit 2026-10-09 item 2: the multi-account queue generated content (minutes of AI time and money) for an account
 * that main would refuse anyway. A paused account is now found and reported before anything is generated, and only
 * that account is skipped (a challenge or protection notice still stops everything).
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { findPausedQueueAccounts, readAccountPause } from '../automation/publishFailureClassifier';
import * as classifier from '../automation/publishFailureClassifier';

const read = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8').replace(/\r\n/g, '\n');
const compile = (source: string, bindings: Record<string, unknown>) => {
  const js = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  return new Function(...Object.keys(bindings), `return (async () => { ${js} })();`)(...Object.values(bindings));
};
const safetyReply = (state: Record<string, unknown>) => vi.fn(async () => ({ success: true, state }));

describe('readAccountPause', () => {
  it('returns the stop code and the Korean label of a paused account', async () => {
    const api = safetyReply({ paused: true, code: 'NETWORK_WAIT', label: '연결 또는 화면 확인 필요', busy: false });
    expect(await readAccountPause(api, 'acct')).toEqual({ code: 'NETWORK_WAIT', label: '연결 또는 화면 확인 필요' });
    expect(api).toHaveBeenCalledWith('acct', 'status');
  });

  it('treats an unreadable publication record as an unknown outcome', async () => {
    const api = safetyReply({ paused: false, journalUnreadable: true, label: '발행 기록 파일 확인 필요' });
    expect((await readAccountPause(api, 'acct'))?.code).toBe('PUBLISH_OUTCOME_UNKNOWN');
  });

  it('does not treat a running or healthy account as paused', async () => {
    expect(await readAccountPause(safetyReply({ paused: false, busy: true }), 'acct')).toBeNull();
    expect(await readAccountPause(safetyReply({ paused: false, busy: false }), 'acct')).toBeNull();
  });

  it('proceeds when the state cannot be read (main still refuses a paused account)', async () => {
    expect(await readAccountPause(undefined, 'acct')).toBeNull();
    expect(await readAccountPause(vi.fn(async () => ({ success: false, message: 'x' })), 'acct')).toBeNull();
    expect(await readAccountPause(vi.fn(async () => { throw new Error('ipc'); }), 'acct')).toBeNull();
    expect(await readAccountPause(safetyReply({ paused: true, code: 'SOMETHING_ELSE' }), 'acct')).toBeNull();
  });
});

describe('findPausedQueueAccounts', () => {
  it('lists each paused account once, with its name, in queue order', async () => {
    const states: Record<string, Record<string, unknown>> = {
      a: { paused: true, code: 'LOGIN_REQUIRED', label: '네이버 로그인 필요' },
      b: { paused: false },
      c: { paused: true, code: 'LOGIN_CHALLENGE', label: '본인확인 필요' },
    };
    const api = vi.fn(async (id: string) => ({ success: true, state: states[id] }));
    const found = await findPausedQueueAccounts(api, [
      { accountId: 'a', accountName: '계정A' }, { accountId: 'b', accountName: '계정B' },
      { accountId: 'a', accountName: '계정A' }, { accountId: 'c', accountName: '계정C' },
    ]);
    expect(found).toEqual([
      { accountId: 'a', accountName: '계정A', code: 'LOGIN_REQUIRED', label: '네이버 로그인 필요' },
      { accountId: 'c', accountName: '계정C', code: 'LOGIN_CHALLENGE', label: '본인확인 필요' },
    ]);
    expect(api).toHaveBeenCalledTimes(3);
  });
});

describe('multi-account manager (executed from the real source)', () => {
  const source = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
  const bindings = {
    findPausedQueueAccounts: classifier.findPausedQueueAccounts, readAccountPause: classifier.readAccountPause,
    describeAccountStop: classifier.describeAccountStop, stopsAllAccounts: classifier.stopsAllAccounts,
  };

  async function runStartScan(states: Record<string, Record<string, unknown>>) {
    const start = source.indexOf('// [2026-10-09] Pause scan:');
    const end = source.indexOf("const startBtn = document.getElementById('ma-start-publish-btn');", start);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    const toastManager = { warning: vi.fn(), error: vi.fn() };
    const accountSafety = vi.fn(async (id: string) => ({ success: true, state: states[id] }));
    const outcome = { isPublishing: true, proceeded: false };
    const run = `let isPublishing = true; let proceeded = false;
      const publishQueue = [{ accountId: 'a', accountName: '계정A', pipelineStatus: 'pending' }, { accountId: 'b', accountName: '계정B', pipelineStatus: 'failed' },
        { accountId: 'done', accountName: '끝난계정', pipelineStatus: 'completed' }, { accountId: 'unk', accountName: '미확정계정', pipelineStatus: 'uncertain' }];
      try {
        ${source.slice(start, end)}
        proceeded = true;
      } finally { outcome.isPublishing = isPublishing; outcome.proceeded = proceeded; }`;
    await compile(run, { ...bindings, outcome, window: { api: { accountSafety } }, toastManager, console: { log() {} } });
    return { result: outcome, toastManager, accountSafety };
  }

  it('starts normally and reads nothing for finished or uncertain items', async () => {
    const { result, accountSafety, toastManager } = await runStartScan({ a: { paused: false }, b: { paused: false } });
    expect(result.proceeded).toBe(true);
    expect(accountSafety.mock.calls.map((call) => call[0])).toEqual(['a', 'b']);
    expect(toastManager.warning).not.toHaveBeenCalled(); expect(toastManager.error).not.toHaveBeenCalled();
  });

  it('reports a paused account with its reason and still starts the others', async () => {
    const { result, toastManager } = await runStartScan({ a: { paused: true, code: 'NETWORK_WAIT', label: '연결 또는 화면 확인 필요' }, b: { paused: false } });
    expect(result.proceeded).toBe(true);
    expect(toastManager.warning).toHaveBeenCalledTimes(1);
    const text = String(toastManager.warning.mock.calls[0][0]);
    expect(text).toContain('계정A'); expect(text).toContain('연결 또는 화면 확인 필요');
  });

  it('refuses to start while an account is under a challenge or protection notice', async () => {
    const { result, toastManager } = await runStartScan({ a: { paused: false }, b: { paused: true, code: 'ACCOUNT_PROTECTED', label: '보호조치' } });
    expect(result.proceeded).toBe(false);
    expect(result.isPublishing).toBe(false);
    expect(toastManager.error).toHaveBeenCalledTimes(1);
    expect(String(toastManager.error.mock.calls[0][0])).toContain('계정B');
  });

  async function runItemCheck(state: Record<string, unknown>) {
    const start = source.indexOf('const queueItem = queueSnapshot[i];\n                // [2026-10-09] A paused account');
    const end = source.indexOf('// [Phase 7.1-c] Per-item snapshot', start);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    const accountSafety = vi.fn(async () => ({ success: true, state }));
    const generated: number[] = [];
    const logs: string[] = [];
    const run = `let stopRequested = false, safetyStopped = false, totalFail = 0;
      const queueSnapshot = [{ accountId: 'a', accountName: '계정A' }, { accountId: 'b', accountName: '계정B' }];
      const totalItems = queueSnapshot.length;
      for (let i = 0; i < totalItems && !stopRequested; i++) {
        ${source.slice(start, end)}
        generated.push(i);
      }
      return { stopRequested, safetyStopped, totalFail, queueSnapshot };`;
    const result = await compile(run, { ...bindings, window: { api: { accountSafety } }, generated,
      addMALog: (message: string) => logs.push(message), addProgressItem: (message: string) => logs.push(message) });
    return { result, generated, logs };
  }

  it('generates nothing for a paused account and moves on to the next one', async () => {
    const { result, generated, logs } = await runItemCheck({ paused: true, code: 'LOGIN_REQUIRED', label: '네이버 로그인 필요' });
    expect(generated).toEqual([]);
    expect(result.totalFail).toBe(2);
    expect(result.stopRequested).toBe(false);
    expect(result.queueSnapshot[0]).toMatchObject({ pipelineStatus: 'failed', failureCode: 'LOGIN_REQUIRED' });
    expect(logs.join('\n')).toContain('계정A');
  });

  it('stops everything at a challenge or protection notice before generating', async () => {
    const { result, generated } = await runItemCheck({ paused: true, code: 'LOGIN_CHALLENGE', label: '본인확인 필요' });
    expect(generated).toEqual([]);
    expect(result.stopRequested).toBe(true); expect(result.safetyStopped).toBe(true);
    expect(result.totalFail).toBe(1);
    expect(result.queueSnapshot[1].pipelineStatus).toBeUndefined();
  });

  it('generates for an account that is not paused', async () => {
    const { result, generated } = await runItemCheck({ paused: false });
    expect(generated).toEqual([0, 1]);
    expect(result.totalFail).toBe(0);
  });
});

describe('sequential multi-account publishing (executed from the real source)', () => {
  const source = read('src', 'renderer', 'modules', 'publishingHandlers.ts');

  async function runSequential(failure: Record<string, unknown>) {
    const start = source.indexOf('const accountResult = (result as');
    const end = source.indexOf('// 다음 계정 발행 전 대기', start);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    const run = `let successCount = 0, failCount = 0, iterations = 0, reachedWait = 0;
      for (const i of [0, 1]) {
        iterations++;
        const account = { name: '계정' + i }; const selectedAccountIds = ['a', 'b'];
        ${source.slice(start, end)}
        reachedWait++;
      }
      return { failCount, iterations, reachedWait };`;
    return compile(run, { ...classifier, result: { success: true, results: [{ success: false, message: '작업 실패', ...failure }] }, appendLog() {} });
  }

  it.each(['LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED'])('stops before the next account at %s', async (code) => {
    const outcome = await runSequential({ failureCode: code });
    expect(outcome.iterations).toBe(1); expect(outcome.failCount).toBe(1);
  });

  it.each(['LOGIN_REQUIRED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN'])('skips only the stopped account at %s', async (code) => {
    const outcome = await runSequential({ failureCode: code });
    expect(outcome.iterations).toBe(2); expect(outcome.failCount).toBe(2);
    expect(outcome.reachedWait).toBe(2);
  });

  it('does not wait the account interval after a refusal that touched nothing', async () => {
    const outcome = await runSequential({ failureCode: 'PUBLISH_OUTCOME_UNKNOWN', refusedBeforeStart: true });
    expect(outcome.iterations).toBe(2); expect(outcome.reachedWait).toBe(0);
  });
});
