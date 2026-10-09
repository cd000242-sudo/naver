/**
 * [2026-10-09 사장님 승인] 연속발행 대기열의 NETWORK_WAIT 처리(실제 소스 조각 실행):
 *  - 실행 중 NETWORK_WAIT 는 대기열을 세우지 않고 실패로 남긴 뒤 다음 반복으로 간다.
 *  - 다음 글 시작 전 사전 확인이 NETWORK_WAIT 만 자동 재확인을 기다리고, 다른 멈춤은 생성 전에 바로 멈춘다.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import * as classifier from '../automation/publishFailureClassifier';

const source = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'modules', 'continuousPublishing.ts'), 'utf8').replace(/\r\n/g, '\n');
const compile = (code: string, bindings: Record<string, unknown>) => {
  const js = ts.transpile(code, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  return new Function(...Object.keys(bindings), `return (async () => { ${js} })();`)(...Object.values(bindings));
};

describe('실행 중 NETWORK_WAIT', () => {
  async function runFailure(error: Error, consecutiveFailCount = 0) {
    const stopIdx = source.indexOf("if (extractAccountStopCode(error) === 'NETWORK_WAIT') {");
    const start = source.lastIndexOf("const errMsg = (error as Error).message || '';", stopIdx);
    const end = source.indexOf('// Sent to Naver but the result is unknown', stopIdx);
    expect(stopIdx).toBeGreaterThan(-1); expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(stopIdx);
    const item: Record<string, unknown> = { status: 'processing', _publishStarted: false };
    const stopContinuousMode = vi.fn();
    const logs: string[] = [];
    const code = `let failCount = 0; let reachedAfterStop = false;
      for (let pass = 0; pass < 1; pass++) {
        try { throw theError; } catch (error) { ${source.slice(start, end)} }
        reachedAfterStop = true;
      }
      return { failCount, reachedAfterStop, consecutive: _consecutiveFailCount };`;
    const result = await compile(code, {
      theError: error, item, currentIdx: 1, totalCount: 3, isContinuousMode: true, stopContinuousMode, ...classifier,
      _consecutiveFailCount: consecutiveFailCount,
      showAccountPauseModal: vi.fn(), window: { _publishAutomationDispatched: false, stopFullAutoPublish: false },
      resolveInterruptedPublishStatus: (started: boolean, fallback: string) => (started ? 'uncertain' : fallback),
      appendLog: (m: string) => logs.push(m), updateContinuousProgressModal: vi.fn(), console: { log() {}, warn() {} },
      UserCancelledError: class UserCancelledError extends Error {}, ImageManager: undefined,
      revokeAllImageDataUrls() {}, clearImageGenerationLocks() {},
    });
    return { result, item, stopContinuousMode, logs };
  }

  it('NETWORK_WAIT 는 대기열을 멈추지 않고 실패 1건으로 세며 다음 반복으로 넘어간다(continue)', async () => {
    const { result, item, stopContinuousMode } = await runFailure(classifier.createQueuePublishError({ code: 'NETWORK_WAIT', message: 'x', refusedBeforeStart: true, accountId: 'owner' }));
    expect(stopContinuousMode).not.toHaveBeenCalled();
    expect(result.failCount).toBe(1);
    expect(result.reachedAfterStop).toBe(false);
    expect(item.status).toBe('failed');
    expect(result.consecutive).toBe(1);
  });

  it('직전 글도 실패했으면(연속 두 번째) 유료 생성 낭비를 막으려 지금처럼 대기열을 멈춘다', async () => {
    const { stopContinuousMode } = await runFailure(classifier.createQueuePublishError({ code: 'NETWORK_WAIT', message: 'x', refusedBeforeStart: true, accountId: 'owner' }), 1);
    expect(stopContinuousMode).toHaveBeenCalledWith('manual');
  });

  it('LOGIN_REQUIRED 는 지금처럼 대기열을 멈춘다', async () => {
    const { stopContinuousMode } = await runFailure(classifier.createQueuePublishError({ code: 'LOGIN_REQUIRED', message: 'x', refusedBeforeStart: true, accountId: 'owner' }));
    expect(stopContinuousMode).toHaveBeenCalledWith('manual');
  });

  it('새 블록은 requiresAccountStop 단언 창보다 앞에 있다', () => {
    expect(source.indexOf("extractAccountStopCode(error) === 'NETWORK_WAIT'")).toBeLessThan(source.indexOf('if (requiresAccountStop(error)) {'));
  });
});

describe('다음 글 시작 전 사전 확인', () => {
  async function runPreflight(opts: { status: Record<string, unknown>; replies?: Array<Record<string, unknown>> }) {
    const start = source.indexOf('// [2026-10-09 사장님 승인] 계정이 멈춰 있으면 유료 생성 전에 먼저 본다.');
    const end = source.indexOf('// [Phase 7.1-b] Per-item snapshot', start);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    const replies = [...(opts.replies ?? [])];
    const calls: Array<[string, string, unknown]> = [];
    const accountSafety = async (id: string, action: string, _v?: unknown, _o?: unknown, _t?: unknown, lookup?: unknown) => {
      calls.push([id, action, lookup]);
      return action === 'status' ? { success: true, state: opts.status } : { success: true, recheck: replies.shift() };
    };
    const stopContinuousMode = vi.fn(); const showAccountPauseModal = vi.fn();
    const generated: number[] = [];
    const item = { status: 'pending' };
    const run = `for (let i = 0; i < 1; i++) {
        ${source.slice(start, end)}
        item.status = 'processing'; generated.push(i);
      }
      return item.status;`;
    const finalStatus = await compile(run, { ...classifier, item, generated, stopContinuousMode, showAccountPauseModal,
      appendLog() {}, cancellableSleep: async () => false,
      document: { getElementById: () => ({ value: 'Owner-Id' }) },
      window: { api: { getConfig: async () => ({}), accountSafety } } });
    return { finalStatus, generated, stopContinuousMode, showAccountPauseModal, calls };
  }

  it('NETWORK_WAIT 가 풀리면 생성으로 진행한다', async () => {
    const r = await runPreflight({ status: { paused: true, code: 'NETWORK_WAIT', label: 'x' }, replies: [{ kind: 'resumed', attempt: 1 }] });
    expect(r.generated).toEqual([0]); expect(r.stopContinuousMode).not.toHaveBeenCalled();
    expect(r.calls.every(c => c[0] === 'owner-id' && c[2] === 'naver-id')).toBe(true);
  });

  it('LOGIN_REQUIRED 는 기다리지 않고 생성 전에 멈추며 항목은 pending 으로 남는다', async () => {
    const r = await runPreflight({ status: { paused: true, code: 'LOGIN_REQUIRED', label: '네이버 로그인 필요' } });
    expect(r.generated).toEqual([]); expect(r.finalStatus).toBe('pending');
    expect(r.stopContinuousMode).toHaveBeenCalledWith('manual');
    expect(r.showAccountPauseModal).toHaveBeenCalledWith({ code: 'LOGIN_REQUIRED' }, { naverId: 'owner-id' });
    expect(r.calls.some(c => c[1] === 'auto-recheck')).toBe(false);
  });

  it('재확인이 포기(manual)하면 지금처럼 멈춘다', async () => {
    const r = await runPreflight({ status: { paused: true, code: 'NETWORK_WAIT', label: 'x' }, replies: [{ kind: 'manual', code: 'NETWORK_WAIT', reason: 'exhausted' }] });
    expect(r.generated).toEqual([]); expect(r.stopContinuousMode).toHaveBeenCalledWith('manual');
  });

  it('멈춘 계정이 아니면 아무 일 없이 진행한다', async () => {
    const r = await runPreflight({ status: { paused: false } });
    expect(r.generated).toEqual([0]); expect(r.stopContinuousMode).not.toHaveBeenCalled();
  });
});
