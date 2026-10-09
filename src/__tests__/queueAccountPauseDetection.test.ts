/**
 * Audit 2026-10-09 item 1: the continuous queue never noticed a paused account.
 * executeUnifiedAutomation swallows the error, so the queue threw a generic "not confirmed" error without a code,
 * marked the item uncertain, waited 5-8 minutes and generated the next post before main refused it again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ts from 'typescript';
import { AccountExecutionGuard, AccountExecutionGuardError } from '../automation/accountExecutionGuard';
import { executePublishing, injectDependencies } from '../main/services/BlogExecutor';
import {
  buildPublishFailureReport,
  createQueuePublishError,
  describeAccountStop,
  extractAccountStopCode,
  requiresAccountStop,
  stopsAllAccounts,
} from '../automation/publishFailureClassifier';

const read = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8').replace(/\r\n/g, '\n');
const compile = (source: string, bindings: Record<string, unknown>) => {
  const js = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  return new Function(...Object.keys(bindings), `return (async () => { ${js} })();`)(...Object.values(bindings));
};

describe('guard refusal before the run starts', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-refusal-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('flags a paused-account refusal as refused before start', async () => {
    const guard = new AccountExecutionGuard({ storageDir: dir });
    guard.pause('paused-user', 'NETWORK_WAIT');
    const operation = vi.fn(async () => 'ran');
    const error = await guard.runExclusive('paused-user', operation).catch((e) => e);
    expect(error).toBeInstanceOf(AccountExecutionGuardError);
    expect(error.code).toBe('NETWORK_WAIT');
    expect(error.refusedBeforeStart).toBe(true);
    expect(operation).not.toHaveBeenCalled();
  });

  it('flags a busy account as refused before start', async () => {
    const guard = new AccountExecutionGuard({ storageDir: dir });
    let release: () => void = () => undefined;
    const first = guard.runExclusive('busy-user', () => new Promise<void>((resolve) => { release = resolve; }));
    const error = await guard.runExclusive('busy-user', async () => 'second').catch((e) => e);
    release();
    await first;
    expect(error.code).toBe('ACCOUNT_BUSY');
    expect(error.refusedBeforeStart).toBe(true);
  });

  it('does not flag a stop raised by the run itself', async () => {
    const guard = new AccountExecutionGuard({ storageDir: dir });
    const error = await guard.runExclusive('mid-run', async () => { throw new AccountExecutionGuardError('NETWORK_WAIT'); }).catch((e) => e);
    expect(error.code).toBe('NETWORK_WAIT');
    expect(error.refusedBeforeStart).toBe(false);
  });

  it('executePublishing reports the refusal to the renderer', async () => {
    injectDependencies({} as any);
    const guard = new AccountExecutionGuard({ storageDir: dir });
    guard.pause('result-user', 'PUBLISH_OUTCOME_UNKNOWN');
    const run = () => guard.runExclusive('result-user', async () => ({ success: true }));
    const result = await executePublishing({ run } as any, { naverId: 'result-user', title: 't', content: 'c', publishMode: 'publish' } as any, []);
    expect(result).toMatchObject({ success: false, failureCode: 'PUBLISH_OUTCOME_UNKNOWN', refusedBeforeStart: true });
  });

  it('executePublishing does not claim a refusal for a stop raised mid-run', async () => {
    injectDependencies({} as any);
    const run = async () => { throw new AccountExecutionGuardError('NETWORK_WAIT'); };
    const result = await executePublishing({ run } as any, { naverId: 'mid-user', title: 't', content: 'c', publishMode: 'publish' } as any, []);
    expect(result.failureCode).toBe('NETWORK_WAIT');
    expect(result.refusedBeforeStart).not.toBe(true);
  });
});

describe('account stop helpers', () => {
  it('extracts only explicit stop codes', () => {
    expect(extractAccountStopCode({ code: 'NETWORK_WAIT' })).toBe('NETWORK_WAIT');
    expect(extractAccountStopCode(new Error('[LOGIN_REQUIRED] 중단'))).toBe('LOGIN_REQUIRED');
    expect(extractAccountStopCode('Error invoking remote method: [ACCOUNT_PROTECTED] x')).toBe('ACCOUNT_PROTECTED');
    expect(extractAccountStopCode(new Error('코덱스 로그인이 필요합니다'))).toBeUndefined();
    expect(extractAccountStopCode({ code: 'ACCOUNT_BUSY' })).toBeUndefined();
    expect(requiresAccountStop({ code: 'LOGIN_CHALLENGE' })).toBe(true);
  });

  it('only login challenge and account protection stop every account', () => {
    expect(stopsAllAccounts({ code: 'LOGIN_CHALLENGE' })).toBe(true);
    expect(stopsAllAccounts(new Error('[ACCOUNT_PROTECTED] 보호조치'))).toBe(true);
    for (const code of ['LOGIN_REQUIRED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN']) {
      expect(stopsAllAccounts({ code })).toBe(false);
      expect(requiresAccountStop({ code })).toBe(true);
    }
    expect(stopsAllAccounts({ code: 'EDITOR_NOT_READY' })).toBe(false);
  });

  it('describes the stop in Korean and names the account', () => {
    const text = describeAccountStop('NETWORK_WAIT', 'blog-owner');
    expect(text).toContain('[NETWORK_WAIT]');
    expect(text).toContain('blog-owner');
    expect(text).toMatch(/[가-힣]/);
    expect(describeAccountStop('PUBLISH_OUTCOME_UNKNOWN')).toContain('발행 결과');
    expect(requiresAccountStop(new Error(describeAccountStop('LOGIN_REQUIRED', 'a')))).toBe(true);
  });

  it('builds the failure report from the main result', () => {
    expect(buildPublishFailureReport({ message: '[NETWORK_WAIT] x', failureCode: 'NETWORK_WAIT', refusedBeforeStart: true }, 'acct', true))
      .toEqual({ code: 'NETWORK_WAIT', message: '[NETWORK_WAIT] x', refusedBeforeStart: true, accountId: 'acct' });
    // The code survives IPC only as text when the call itself threw.
    expect(buildPublishFailureReport({ message: "Error invoking remote method 'automation:run': Error: [LOGIN_REQUIRED] x" }, 'a', true).code).toBe('LOGIN_REQUIRED');
    // Text that merely mentions a login is not an account stop.
    expect(buildPublishFailureReport({ message: '네이버 로그인 화면이 느립니다' }, 'a', true).code).toBe('UNKNOWN');
    expect(buildPublishFailureReport({}, 'a', true).message).toBe('블로그 발행 실패');
  });

  it('never claims a refusal for a rerun after an earlier attempt was dispatched', () => {
    const report = buildPublishFailureReport({ message: 'x', failureCode: 'PUBLISH_OUTCOME_UNKNOWN', refusedBeforeStart: true }, 'a', false);
    expect(report.refusedBeforeStart).toBe(false);
    expect(report.code).toBe('PUBLISH_OUTCOME_UNKNOWN');
  });

  it('turns a recorded stop into an error the queue recognises', () => {
    const error = createQueuePublishError({ code: 'NETWORK_WAIT', message: 'm', refusedBeforeStart: true, accountId: 'blog-owner' }) as Error & Record<string, unknown>;
    expect(requiresAccountStop(error)).toBe(true);
    expect(error.code).toBe('NETWORK_WAIT');
    expect(error.refusedBeforeStart).toBe(true);
    expect(error.message).toContain('blog-owner');
  });

  it('keeps the generic message for a failure that does not pause the account', () => {
    const error = createQueuePublishError({ code: 'EDITOR_NOT_READY', message: '에디터 로딩 실패', refusedBeforeStart: false, accountId: 'a' }) as Error & Record<string, unknown>;
    expect(requiresAccountStop(error)).toBe(false);
    expect(error.message).toContain('발행 완료가 확인되지 않았습니다');
    expect(error.code).toBe('EDITOR_NOT_READY');
    expect((createQueuePublishError(null) as Error & Record<string, unknown>).code).toBeUndefined();
  });
});

describe('continuous queue wiring (executed from the real source)', () => {
  const source = read('src', 'renderer', 'modules', 'continuousPublishing.ts');

  async function buildError(failure: unknown) {
    const start = source.indexOf("if ((window as any)._lastPublishOutcome !== 'success') {");
    const end = source.indexOf("      }\n\n      item.status = 'completed';", start);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    const win: Record<string, unknown> = { _lastPublishOutcome: null, _lastPublishFailure: failure };
    try { await compile(source.slice(start, end), { window: win, createQueuePublishError }); } catch (error) { return error as Error & Record<string, unknown>; }
    throw new Error('expected the unconfirmed publish to throw');
  }

  async function runFailure(error: Error, flags: { dispatched: boolean; started: boolean }) {
    const stopIdx = source.indexOf('if (requiresAccountStop(error)) {');
    const start = source.lastIndexOf("const errMsg = (error as Error).message || '';", stopIdx);
    const end = source.indexOf('// Sent to Naver but the result is unknown', stopIdx);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    const logs: string[] = [];
    const item: Record<string, unknown> = { status: 'processing', _publishStarted: flags.started };
    const stopContinuousMode = vi.fn();
    const showAccountPauseModal = vi.fn();
    const code = `let failCount = 0; let reachedAfterStop = true;
      for (let pass = 0; pass < 1; pass++) {
        try { throw theError; } catch (error) { ${source.slice(start, end)} }
        reachedAfterStop = true;
      }
      return { failCount, reachedAfterStop };`;
    const result = await compile(code, {
      theError: error, item, currentIdx: 1, totalCount: 3, isContinuousMode: true, stopContinuousMode, requiresAccountStop, extractAccountStopCode, showAccountPauseModal,
      window: { _publishAutomationDispatched: flags.dispatched, stopFullAutoPublish: false },
      resolveInterruptedPublishStatus: (started: boolean, fallback: string) => (started ? 'uncertain' : fallback),
      appendLog: (message: string) => logs.push(message), updateContinuousProgressModal: vi.fn(), console: { log() {}, warn() {} },
      UserCancelledError: class UserCancelledError extends Error {}, ImageManager: undefined,
      revokeAllImageDataUrls() {}, clearImageGenerationLocks() {},
    });
    return { result, item, logs, stopContinuousMode, showAccountPauseModal };
  }

  it('throws an error with the recorded code instead of a codeless generic one', async () => {
    const error = await buildError({ code: 'NETWORK_WAIT', message: '[NETWORK_WAIT] x', refusedBeforeStart: false, accountId: 'blog-owner' });
    expect(error.code).toBe('NETWORK_WAIT');
    expect(requiresAccountStop(error)).toBe(true);
    expect(error.message).toContain('blog-owner');
  });

  it('still throws the generic error when nothing was recorded', async () => {
    const error = await buildError(null);
    expect(error.message).toContain('발행 완료가 확인되지 않았습니다');
    expect(requiresAccountStop(error)).toBe(false);
  });

  it('stops the queue at once and names the account when main reports a paused account', async () => {
    // [2026-10-09] NETWORK_WAIT 는 자동 재확인 대상이라 대기열을 세우지 않는다(queueNetworkWaitRecheck.test.ts). 사람이 풀어야 하는 코드로 확인한다.
    const error = createQueuePublishError({ code: 'LOGIN_REQUIRED', message: 'x', refusedBeforeStart: false, accountId: 'blog-owner' });
    const { item, logs, stopContinuousMode, result, showAccountPauseModal } = await runFailure(error, { dispatched: true, started: true });
    expect(stopContinuousMode).toHaveBeenCalledWith('manual');
    // The stop is cleared in place: the pause panel is asked for with the coded error.
    expect(showAccountPauseModal).toHaveBeenCalledWith(error);
    expect(result.failCount).toBe(1);
    expect(logs.join('\n')).toContain('blog-owner');
    // The run stopped mid-publish: the outcome stays unknown.
    expect(item.status).toBe('uncertain');
  });

  it('keeps an item that main refused before opening any browser retryable, not uncertain', async () => {
    const error = createQueuePublishError({ code: 'PUBLISH_OUTCOME_UNKNOWN', message: 'x', refusedBeforeStart: true, accountId: 'blog-owner' });
    // The renderer clears the dispatch marker when main refuses; see recordPublishFailureForQueue.
    const { item, stopContinuousMode } = await runFailure(error, { dispatched: false, started: true });
    expect(stopContinuousMode).toHaveBeenCalledWith('manual');
    expect(item.status).toBe('failed');
    expect(item.status).not.toBe('uncertain');
  });
});

describe('renderer failure recording (executed from the real source)', () => {
  const flow = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');

  function loadRecorder() {
    const start = flow.indexOf('function recordPublishFailureForQueue(');
    expect(start).toBeGreaterThan(-1);
    const end = flow.indexOf('\n}\n', start) + 3;
    const win: Record<string, unknown> = { _publishAutomationDispatched: true };
    const record = compile(`${flow.slice(start, end)}\nreturn recordPublishFailureForQueue;`, { window: win, buildPublishFailureReport });
    return { win, record: record as Promise<(...args: unknown[]) => unknown> };
  }

  it('stores the main failure and clears the dispatch marker for a refusal', async () => {
    const { win, record } = loadRecorder();
    (await record)({ success: true, data: { success: false, message: '[NETWORK_WAIT] x', failureCode: 'NETWORK_WAIT', refusedBeforeStart: true } }, '[NETWORK_WAIT] x', 'acct', true);
    expect(win._lastPublishFailure).toMatchObject({ code: 'NETWORK_WAIT', refusedBeforeStart: true, accountId: 'acct' });
    expect(win._publishAutomationDispatched).toBe(false);
  });

  it('keeps the dispatch marker when the run itself failed', async () => {
    const { win, record } = loadRecorder();
    (await record)({ success: true, data: { success: false, message: 'm', failureCode: 'NETWORK_WAIT' } }, 'm', 'acct', true);
    expect(win._publishAutomationDispatched).toBe(true);
    expect((win._lastPublishFailure as { code: string }).code).toBe('NETWORK_WAIT');
  });

  it('records the failure of an IPC error that only carries the code as text', async () => {
    const { win, record } = loadRecorder();
    (await record)({ success: false, error: "Error invoking remote method 'automation:run': Error: [LOGIN_REQUIRED] x" }, "Error invoking remote method 'automation:run': Error: [LOGIN_REQUIRED] x", 'acct', true);
    expect((win._lastPublishFailure as { code: string }).code).toBe('LOGIN_REQUIRED');
  });

  it('records every failure branch of executeBlogPublishing and the session-recovery rerun', () => {
    const publishing = flow.slice(flow.indexOf('async function executeBlogPublishing('));
    expect(publishing.match(/recordPublishFailureForQueue\(apiResponse, errorMsg, naverId, true\)/g)?.length).toBe(2);
    expect(flow).toContain('recordPublishFailureForQueue(retryResponse, retryErrorMsg, getPublishRetryNaverId(payload), false)');
    expect(publishing).toMatch(/window\._lastPublishOutcome = 'success';/);
  });

  it('resets the recorded failure before each run', () => {
    const renderer = read('src', 'renderer', 'renderer.ts');
    expect(renderer).toMatch(/_lastPublishOutcome = null;\s*\(window as any\)\._lastPipelineError = null;\s*\(window as any\)\._lastPublishFailure = null;/);
  });
});
