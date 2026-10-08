import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  classifyPublishFailure,
  describeAccountStop,
  extractAccountStopCode,
  requiresAccountStop,
  stopsAllAccounts,
} from '../automation/publishFailureClassifier';

// A challenge or protection notice means the PC/IP itself is flagged: everything stops. The other stops belong to
// one account: only that account is skipped (audit 2026-10-09 item 2).
const stopEverythingCodes = ['LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED'];
const accountOnlyCodes = ['LOGIN_REQUIRED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN'];
const compile = (source: string, bindings: Record<string, unknown>) => {
  const js = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  return new Function(...Object.keys(bindings), `return (async () => { ${js} })();`)(...Object.values(bindings));
};
const classifierBindings = { classifyPublishFailure, describeAccountStop, extractAccountStopCode, requiresAccountStop, stopsAllAccounts };

// Execute the real loop tails without loading Electron or initializing the renderer.
async function runMain(code: string, throws = false, extra: Record<string, unknown> = {}) {
  const source = readFileSync('src/main.ts', 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('        let result = await executeWithContentPolicyManualReview(payload as any, {', source.indexOf("ipcMain.handle('multiAccount:publish'"));
  const end = source.indexOf('    const successCount = results.filter', start);
  expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
  const execute = vi.fn(async () => {
    if (throws) throw Object.assign(new Error('작업 실패'), { code });
    return { success: false, message: '작업 실패', failureCode: code, ...extra };
  });
  const rollback = vi.fn(async () => {}); const releaseOwner = vi.fn(async () => {});
  const run = `const results = []; for (const accountId of ['a', 'b']) {
    const account = { name: accountId }; const payload = {}; const accountQuotaLease = { rollback, commit() {} };
    const contentQualityV3PublishOwnerKey = accountId;
    try { ${source.slice(start, end)} return results;`;
  const results = await compile(run, { ...classifierBindings, executeWithContentPolicyManualReview: execute,
    AutomationService: { executePostCycle() {} }, confirmContentPolicyManualReview() {}, assertImmediatePublishResultUrl() {},
    sendLog() {}, rollback, contentQualityV3PublishHandoffStore: { releaseOwner } });
  return { results, execute, rollback, releaseOwner };
}

async function runRenderer(code: string, extra: Record<string, unknown> = {}) {
  const source = readFileSync('src/renderer/modules/multiAccountManager.ts', 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('                    const result = await window.api.multiAccountPublish([queueItem.accountId], publishOptions);');
  const end = source.indexOf('                if (i < queueSnapshot.length - 1 && !stopRequested', start);
  expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
  const publish = vi.fn(async () => ({ success: true, results: [{ success: false, message: '작업 실패', failureCode: code, ...extra }] }));
  const rotate = vi.fn();
  const run = `let stopRequested = false, safetyStopped = false, totalFail = 0, totalSuccess = 0;
    const queueSnapshot = [{ accountId: 'a', accountName: 'a' }, { accountId: 'b', accountName: 'b' }];
    const totalItems = queueSnapshot.length;
    for (let i = 0; i < totalItems && !stopRequested && !window.stopFullAutoPublish; i++) {
      const queueItem = queueSnapshot[i], publishOptions = {}; let publishStarted = true, publishConfirmed = false;
      try { ${source.slice(start, end)}
      if (!stopRequested && !window.stopFullAutoPublish) rotate();
    }
    return { stopRequested, safetyStopped, totalFail, queueSnapshot };`;
  const result = await compile(run, { ...classifierBindings, window: { stopFullAutoPublish: false, api: { multiAccountPublish: publish } },
    addMALog() {}, addProgressItem() {}, updateMAStep() {}, resolveInterruptedPublishStatus: (started: boolean, fallback: string) => started ? 'uncertain' : fallback,
    console: { log() {} }, rotate });
  return { result, publish, rotate };
}

describe('multi-account batches react to account stops', () => {
  it.each(stopEverythingCodes)('main stops at %s and still releases quota/owner', async code => {
    const { results, execute, rollback, releaseOwner } = await runMain(code);
    expect(execute).toHaveBeenCalledTimes(1); expect(results).toHaveLength(1);
    expect(rollback).toHaveBeenCalledTimes(1); expect(releaseOwner).toHaveBeenCalledTimes(1);
  });
  it.each(accountOnlyCodes)('main skips only the account that stopped at %s and continues with the next', async code => {
    const { results, execute, rollback, releaseOwner } = await runMain(code);
    expect(execute).toHaveBeenCalledTimes(2); expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ accountId: 'a', success: false, failureCode: code });
    expect(rollback).toHaveBeenCalledTimes(2); expect(releaseOwner).toHaveBeenCalledTimes(2);
  });
  it('main stops on a thrown typed protection error and still cleans up', async () => {
    const { execute, rollback, releaseOwner } = await runMain('ACCOUNT_PROTECTED', true);
    expect(execute).toHaveBeenCalledTimes(1); expect(rollback).toHaveBeenCalledTimes(1); expect(releaseOwner).toHaveBeenCalledTimes(1);
  });
  it('main continues after a thrown account-only stop and still cleans up', async () => {
    const { execute, rollback, releaseOwner } = await runMain('NETWORK_WAIT', true);
    expect(execute).toHaveBeenCalledTimes(2); expect(rollback).toHaveBeenCalledTimes(2); expect(releaseOwner).toHaveBeenCalledTimes(2);
  });
  it('main tells the renderer which results were refused before any browser opened', async () => {
    const { results } = await runMain('PUBLISH_OUTCOME_UNKNOWN', false, { refusedBeforeStart: true });
    expect(results[0].refusedBeforeStart).toBe(true);
    const plain = await runMain('NETWORK_WAIT');
    expect(plain.results[0].refusedBeforeStart).toBeUndefined();
  });
  it.each(stopEverythingCodes)('renderer preserves %s and skips next account and IP rotation', async code => {
    const { result, publish, rotate } = await runRenderer(code);
    expect(result.stopRequested).toBe(true); expect(result.safetyStopped).toBe(true); expect(result.totalFail).toBe(1);
    expect(publish).toHaveBeenCalledTimes(1); expect(rotate).not.toHaveBeenCalled();
    expect(result.queueSnapshot[1].pipelineStatus).toBeUndefined();
    expect(result.queueSnapshot[0]).toMatchObject({ pipelineStatus: 'failed', failureCode: code });
  });
  it.each(accountOnlyCodes)('renderer keeps going after %s on one account', async code => {
    const { result, publish } = await runRenderer(code);
    expect(result.stopRequested).toBe(false); expect(result.safetyStopped).toBe(false);
    expect(publish).toHaveBeenCalledTimes(2); expect(result.totalFail).toBe(2);
    expect(result.queueSnapshot[0].failureCode).toBe(code);
  });
  it.each(['LOGIN_REQUIRED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH'])('renderer keeps %s retryable (failed), as before', async code => {
    const { result } = await runRenderer(code);
    expect(result.queueSnapshot[0].pipelineStatus).toBe('failed');
  });
  it('renderer keeps an unknown outcome uncertain so it is never re-sent', async () => {
    const { result } = await runRenderer('PUBLISH_OUTCOME_UNKNOWN');
    expect(result.queueSnapshot[0].pipelineStatus).toBe('uncertain');
  });
  it('renderer does not mark a post uncertain when main refused it before opening any browser', async () => {
    const { result } = await runRenderer('PUBLISH_OUTCOME_UNKNOWN', { refusedBeforeStart: true });
    expect(result.queueSnapshot[0].pipelineStatus).toBe('failed');
    expect(result.queueSnapshot[0].pipelineStatus).not.toBe('uncertain');
  });
  it('main keeps unrelated generation/UI failures isolated to their account', async () => {
    const { execute, rollback, releaseOwner } = await runMain('UNKNOWN_UI_CHANGE');
    expect(execute).toHaveBeenCalledTimes(2); expect(rollback).toHaveBeenCalledTimes(2); expect(releaseOwner).toHaveBeenCalledTimes(2);
  });
  it('renderer does not mark an unrelated failure as an account safety stop', async () => {
    const { result, publish } = await runRenderer('UNKNOWN_UI_CHANGE');
    expect(result.stopRequested).toBe(false); expect(publish).toHaveBeenCalledTimes(2);
  });
});
