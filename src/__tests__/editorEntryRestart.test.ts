/**
 * [2026-10-09 고객 신고·사장님 선택] 로그인을 못 알아보거나 글쓰기 창을 못 찾으면 크롬을 다시 띄워 한 번만 더 들어간다.
 * 보호조치·본인확인·계정 불일치는 재시작하지 않고, 비밀번호는 어느 경우에도 입력하지 않는다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { AccountExecutionGuardError, ACCOUNT_PAUSE_CODES } from '../automation/accountExecutionGuard.js';
import { isRestartRecoverableEntryError, waitForLoginRedirectToSettle, describeUrlForLog } from '../automation/editorEntryRecovery.js';
import { classifyBlogWriteNavigationUrl } from '../automation/editorNavigationUrlPolicy.js';
import { isLoginChallengeUrl } from '../automation/loginPageNavigationPolicy.js';
import { InitialEditorReadinessError } from '../automation/initialEditorReadiness.js';

const engineText = readFileSync(resolve('src/naverBlogAutomation.ts'), 'utf8');
const source = ts.createSourceFile('automation.ts', engineText, ts.ScriptTarget.Latest, true);
function method(name: string, dependencies: Record<string, unknown>) {
  let selected: ts.MethodDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) selected = node; ts.forEachChild(node, visit); };
  visit(source);
  if (!selected) throw new Error(`Missing production method ${name}`);
  const compiled = ts.transpileModule(`class Harness { ${selected.getText(source)} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}; return Harness.prototype.${name};`)(...Object.values(dependencies));
}

function wrapperHarness(failures: unknown[], options: { paused?: boolean } = {}) {
  const attempts: boolean[] = [];
  const guard = { paused: options.paused === true, pause: vi.fn((_id: string, _code: string) => { guard.paused = true; }), getStatus: () => ({ paused: guard.paused }) };
  const state: any = {
    options: { naverId: 'acct' }, log: vi.fn(), ensureNotCancelled: vi.fn(),
    restartBrowserForEditorEntry: vi.fn(async () => undefined),
  };
  const run = method('enterEditorWithOneRestart', { isRestartRecoverableEntryError, AccountExecutionGuardError, ACCOUNT_PAUSE_CODES, getAccountExecutionGuard: () => guard });
  const entry = async (deferPause: boolean) => {
    attempts.push(deferPause);
    const failure = failures.shift();
    if (failure) throw failure;
  };
  return { state, attempts, guard, execute: () => run.call(state, entry) };
}

describe('글쓰기 진입 크롬 재시작 1회', () => {
  it('첫 시도가 되면 재시작 없이 끝나고, 첫 시도는 멈춤 저장을 미룬다', async () => {
    const h = wrapperHarness([]);
    await h.execute();
    expect(h.attempts).toEqual([true]);
    expect(h.state.restartBrowserForEditorEntry).not.toHaveBeenCalled();
  });

  it.each([
    ['로그인 필요', new AccountExecutionGuardError('LOGIN_REQUIRED')],
    ['네트워크 대기', new AccountExecutionGuardError('NETWORK_WAIT')],
    ['에디터 프레임 없음', new Error('메인 프레임을 찾을 수 없습니다.\n페이지 URL: x')],
  ])('%s 이면 크롬을 다시 띄워 한 번 더(두 번째는 멈춤 저장) 들어간다', async (_label, failure) => {
    const h = wrapperHarness([failure]);
    await h.execute();
    expect(h.attempts).toEqual([true, false]);
    expect(h.state.restartBrowserForEditorEntry).toHaveBeenCalledTimes(1);
    expect(h.state.log.mock.calls.map((c: unknown[]) => c[0]).join('\n')).toMatch(/크롬을 다시 띄워 한 번 더 들어갑니다\(비밀번호는 입력하지 않습니다\)/);
  });

  it('재시작 뒤에도 실패하면 그 오류로 멈추고 세 번째는 없다', async () => {
    const second = new AccountExecutionGuardError('LOGIN_REQUIRED');
    const h = wrapperHarness([new AccountExecutionGuardError('LOGIN_REQUIRED'), second]);
    await expect(h.execute()).rejects.toBe(second);
    expect(h.attempts).toEqual([true, false]);
    expect(h.state.restartBrowserForEditorEntry).toHaveBeenCalledTimes(1);
  });

  // [회귀 검토 결함 1] 미룬 멈춤을 던지기 전에 저장해야 finally 가 보호조치·본인확인 창을 닫지 않는다.
  it.each(['LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN'] as const)('%s 는 재시작 없이 던지기 전에 멈춤을 저장한다', async (code) => {
    const failure = new AccountExecutionGuardError(code);
    const h = wrapperHarness([failure]);
    await expect(h.execute()).rejects.toBe(failure);
    expect(h.attempts).toEqual([true]);
    expect(h.state.restartBrowserForEditorEntry).not.toHaveBeenCalled();
    expect(h.guard.pause).toHaveBeenCalledWith('acct', code);
  });

  it('[결함 4] 실행 중 이미 멈춘 계정은 재시작하지 않는다', async () => {
    const failure = new AccountExecutionGuardError('LOGIN_REQUIRED');
    const h = wrapperHarness([failure], { paused: true });
    await expect(h.execute()).rejects.toBe(failure);
    expect(h.state.restartBrowserForEditorEntry).not.toHaveBeenCalled();
    expect(h.guard.pause).not.toHaveBeenCalled();
  });

  it('[결함 5] 크롬 재시작이 실패하면 원래 오류로 멈춤을 저장하고 던진다', async () => {
    const failure = new AccountExecutionGuardError('LOGIN_REQUIRED');
    const h = wrapperHarness([failure]);
    h.state.restartBrowserForEditorEntry = vi.fn(async () => { throw new Error('크롬을 띄우지 못함'); });
    await expect(h.execute()).rejects.toBe(failure);
    expect(h.attempts).toEqual([true]);
    expect(h.guard.pause).toHaveBeenCalledWith('acct', 'LOGIN_REQUIRED');
  });

  it('작업 중(ACCOUNT_BUSY)·시작 전 거절은 멈춤을 새로 저장하지 않는다', async () => {
    for (const failure of [new AccountExecutionGuardError('ACCOUNT_BUSY'), new AccountExecutionGuardError('LOGIN_REQUIRED', undefined, true)]) {
      const h = wrapperHarness([failure]);
      await expect(h.execute()).rejects.toBe(failure);
      expect(h.guard.pause).not.toHaveBeenCalled();
      expect(h.state.restartBrowserForEditorEntry).not.toHaveBeenCalled();
    }
  });

  it('취소는 재시작하지 않는다', async () => {
    const cancel = new Error('사용자가 자동화를 취소했습니다.');
    const h = wrapperHarness([cancel]);
    await expect(h.execute()).rejects.toBe(cancel);
    expect(h.state.restartBrowserForEditorEntry).not.toHaveBeenCalled();
  });

  it('재시작 직전에 취소되면 크롬을 다시 띄우지 않는다', async () => {
    const h = wrapperHarness([new AccountExecutionGuardError('NETWORK_WAIT')]);
    h.state.ensureNotCancelled = () => { throw new Error('사용자가 자동화를 취소했습니다.'); };
    await expect(h.execute()).rejects.toThrow('취소');
    expect(h.state.restartBrowserForEditorEntry).not.toHaveBeenCalled();
  });
});

describe('크롬 재시작 함수', () => {
  it('세션을 강제로 닫고 같은 계정으로 다시 띄운다 — 페이지 이동·입력은 하지 않는다', async () => {
    const order: string[] = [];
    const manager = {
      markPublishing: vi.fn(() => order.push('mark-off')),
      closeSession: vi.fn(async () => { order.push('close'); return true; }),
    };
    const state: any = {
      options: { naverId: 'acct' }, browser: {}, page: {}, mainFrame: {}, cursor: {},
      delay: vi.fn(async () => { order.push('wait'); }), ensureNotCancelled: vi.fn(),
      setupBrowser: vi.fn(async () => { order.push('setup'); }), ensureDialogHandler: vi.fn(() => order.push('dialogs')),
    };
    await method('restartBrowserForEditorEntry', { browserSessionManager: manager }).call(state);
    expect(manager.closeSession).toHaveBeenCalledWith('acct', true);
    expect(order).toEqual(['mark-off', 'close', 'wait', 'setup', 'dialogs']);
    const body = engineText.slice(engineText.indexOf('private async restartBrowserForEditorEntry('), engineText.indexOf('async navigateToBlogWrite('));
    expect(body.length).toBeGreaterThan(100);
    expect(/\.goto\(|\.type\(|\.click\(|naverPassword|loginToNaver/.test(body)).toBe(false);
  });
});

describe('글쓰기 이동: 첫 시도는 멈춤 저장을 미루고, 잠깐 보인 로그인 주소는 기다린다', () => {
  class GuardError extends Error { constructor(public code: string) { super(code); } }
  function navigateHarness(urls: string[], readinessFails = false) {
    let at = 0; const pause = vi.fn();
    const page = { url: () => urls[Math.min(at, urls.length - 1)], isClosed: () => false,
      goto: vi.fn(async () => ({ status: () => 200 })) };
    const state: any = { page, options: { naverId: 'acct' }, ensurePage: () => page, ensureNotCancelled: vi.fn(), log: vi.fn(),
      delay: vi.fn(async () => { at++; }) };
    const dependencies = {
      classifyBlogWriteNavigationUrl, isLoginChallengeUrl, AccountExecutionGuardError: GuardError, InitialEditorReadinessError,
      waitForInitialEditorReadiness: vi.fn(async () => { if (readinessFails) throw new InitialEditorReadinessError('timeout'); }),
      getAccountExecutionGuard: () => ({ pause }), NAVER_TIMEOUTS: { PAGE_LOAD: 30000 },
      waitForLoginRedirectToSettle, describeUrlForLog,
    };
    state.pauseEntry = method('pauseEntry', dependencies);
    const navigate = method('navigateToBlogWrite', dependencies);
    return { state, pause, run: (options?: { deferPause?: boolean }) => navigate.call(state, options) };
  }
  const LOGIN = 'https://nid.naver.com/nidlogin.login?mode=form&url=https%3A%2F%2Fblog.naver.com';

  it('로그인 주소가 잠깐 보였다가 블로그로 돌아오면 멈추지 않고 진행한다', async () => {
    const h = navigateHarness(['about:blank', LOGIN, LOGIN, 'https://blog.naver.com/acct?Redirect=Write&']);
    h.state.page.url = (() => { const seq = [LOGIN, LOGIN, 'https://blog.naver.com/acct?Redirect=Write&']; let i = 0; h.state.delay = vi.fn(async () => { i = Math.min(i + 1, seq.length - 1); }); return () => seq[i]; })();
    await h.run();
    expect(h.pause).not.toHaveBeenCalled();
    expect(h.state.log.mock.calls.map((c: unknown[]) => c[0]).join('\n')).toContain('네이버가 로그인을 확인하고 글쓰기로 다시 보냈습니다');
  });

  it('첫 시도(deferPause)는 로그인 필요로 던지되 멈춤을 저장하지 않고, 기록에는 도메인·경로만 남긴다', async () => {
    const h = navigateHarness([LOGIN]);
    h.state.page.url = () => LOGIN;
    await expect(h.run({ deferPause: true })).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
    expect(h.pause).not.toHaveBeenCalled();
    const logs = h.state.log.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(logs).toContain('(화면: nid.naver.com/nidlogin.login)');
    expect(logs).not.toContain('mode=form');
  });

  it('최종 시도는 지금처럼 멈춤을 저장한다', async () => {
    const h = navigateHarness([LOGIN]);
    h.state.page.url = () => LOGIN;
    await expect(h.run()).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
    expect(h.pause).toHaveBeenCalledWith('acct', 'LOGIN_REQUIRED');
  });
});

// [2026-10-09 고객 진단 파일 08-49] 이전 글을 쓰던 글쓰기 화면(이미지 5개 남음)이 열린 채 다음 글이 시작되자
//   "이미 글쓰기 주소"라며 새로 열지 않고 그 위에 이어 써서 이미지가 3번 다 안 들어갔다(IMAGE_INSERTION_FAILED 1/1).
describe('새 글은 새 글쓰기 화면에서 쓴다', () => {
  class GuardError extends Error { constructor(public code: string) { super(code); } }
  function freshHarness(url: string, enteredThisRun?: boolean) {
    const page = { url: () => url, isClosed: () => false, goto: vi.fn(async () => { url = 'https://blog.naver.com/acct?Redirect=Write&'; return { status: () => 200 }; }) };
    const state: any = { page, options: { naverId: 'acct' }, ensurePage: () => page, ensureNotCancelled: vi.fn(), log: vi.fn(), delay: vi.fn(async () => undefined),
      editorEnteredThisRun: enteredThisRun };
    const dependencies = {
      classifyBlogWriteNavigationUrl, isLoginChallengeUrl, AccountExecutionGuardError: GuardError, InitialEditorReadinessError,
      waitForInitialEditorReadiness: vi.fn(async () => undefined), getAccountExecutionGuard: () => ({ pause: vi.fn() }), NAVER_TIMEOUTS: { PAGE_LOAD: 30000 },
      waitForLoginRedirectToSettle, describeUrlForLog,
    };
    state.pauseEntry = method('pauseEntry', dependencies);
    return { state, page, run: () => method('navigateToBlogWrite', dependencies).call(state) };
  }

  it('이전 글이 남긴 글쓰기 화면이면 새 글쓰기 화면을 연다', async () => {
    const h = freshHarness('https://blog.naver.com/acct?Redirect=Write&');
    await h.run();
    expect(h.page.goto).toHaveBeenCalledTimes(1);
    expect(h.state.editorEnteredThisRun).toBe(true);
    expect(h.state.log.mock.calls.map((c: unknown[]) => c[0]).join('\n')).toContain('이전 글의 글쓰기 화면이 열려 있어 새 글쓰기 화면을 엽니다');
  });

  it('이번 글에서 이미 새로 들어간 글쓰기 화면이면 다시 열지 않는다(글 1편 = 진입 1회)', async () => {
    const h = freshHarness('https://blog.naver.com/acct?Redirect=Write&', true);
    await h.run();
    expect(h.page.goto).not.toHaveBeenCalled();
  });

  it('두 발행 경로 모두 글을 시작할 때 "이번 글 진입" 표시를 지운다', () => {
    expect((engineText.match(/this\.editorEnteredThisRun = false;\r?\n\s*\/\/ \[2026-10-09 사장님 선택\]/g) || []).length).toBe(2);
  });
});

describe('연결 확인', () => {
  it('두 발행 경로 모두 진입 구간을 재시작 감싸개로 묶고, 첫 시도 선택값을 세 단계에 넘긴다', () => {
    expect((engineText.match(/await this\.enterEditorWithOneRestart\(async \(deferPause\) => \{/g) || []).length).toBe(2);
    expect((engineText.match(/this\.navigateToBlogWrite\(\{ deferPause \}\)/g) || []).length).toBe(4);
    expect((engineText.match(/this\.switchToMainFrame\(\{ deferPause \}\)/g) || []).length).toBe(2);
    expect((engineText.match(/ensureServerSession\(this\.options\.naverId, \{ deferPause \}\)/g) || []).length).toBe(2);
  });

  it('쿠키 복원은 프로필에 살아 있는 로그인 쿠키가 있으면 덮어쓰지 않는다', () => {
    const persistence = readFileSync(resolve('src/sessionPersistence.ts'), 'utf8');
    const restore = persistence.slice(persistence.indexOf('export async function restoreCookies('));
    expect(restore.indexOf('shouldKeepProfileCookies(profileCookies)')).toBeGreaterThan(-1);
    expect(restore.indexOf('shouldKeepProfileCookies(profileCookies)')).toBeLessThan(restore.indexOf('await page.setCookie('));
  });
});
