// @vitest-environment happy-dom
/**
 * One-button agent connection (check -> install -> login -> real answer).
 * Contract: finished steps are skipped, the first failing step stops the flow with its own
 * reason, and nothing ever falls back to another engine.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const loginRunner = vi.hoisted(() => vi.fn());
vi.mock('../renderer/utils/agentLoginCodePrompt', () => ({ runAgentLoginWithCodeFallback: loginRunner }));

import {
  agentConnectBuildPrompt,
  agentConnectClassify,
  agentConnectCreateMarker,
  agentConnectEnsureLog,
  agentConnectFailureLine,
  agentConnectProgressLine,
  agentConnectProviderLabel,
  agentConnectReplyHasMarker,
  agentConnectRun,
  agentConnectSuccessLine,
  agentConnectWriteLog,
} from '../renderer/modules/agentConnectFlow';

const READY = { installed: true, loggedIn: true, available: true };
const MARKER = 'BLN-AB12cd';

function makeApi(parts: Record<string, unknown> = {}) {
  const unsubscribe = vi.fn();
  const api = {
    agentStatus: vi.fn(async () => ({ success: true, status: READY })),
    agentInstall: vi.fn(async () => ({ success: true })),
    agentLogin: vi.fn(async () => ({ success: true, status: READY })),
    agentGenerate: vi.fn(async () => ({ success: true, text: MARKER })),
    onAgentInstallProgress: vi.fn(() => unsubscribe),
    ...parts,
  };
  return { api, unsubscribe };
}

function run(api: unknown, extra: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const promise = agentConnectRun({
    provider: 'codex',
    api: api as never,
    mountElement: document.createElement('div'),
    statusElement: document.createElement('div'),
    report: (line: string) => lines.push(line),
    createMarker: () => MARKER,
    ...extra,
  } as never);
  return { lines, promise };
}

afterEach(() => { loginRunner.mockReset(); document.body.innerHTML = ''; });

describe('agentConnect pure helpers', () => {
  it('labels the three providers for the screen', () => {
    expect(agentConnectProviderLabel('codex')).toBe('Codex');
    expect(agentConnectProviderLabel('claude')).toBe('Claude Code');
    expect(agentConnectProviderLabel('gemini')).toBe('Antigravity');
  });

  it('formats step progress, failure and success lines', () => {
    expect(agentConnectProgressLine(2, '공식 npm 패키지를 설치합니다…')).toBe('[2/4 설치] 공식 npm 패키지를 설치합니다…');
    expect(agentConnectProgressLine(1, '확인')).toContain('[1/4 준비 확인]');
    expect(agentConnectProgressLine(4, '확인')).toContain('[4/4 실제 답 확인]');
    expect(agentConnectFailureLine(3, '구독 만료')).toBe('❌ [3/4 로그인]에서 멈춤: 구독 만료');
    expect(agentConnectSuccessLine(12_000)).toBe('✅ 연결 완료 — 실제 답 확인됨 (12초)');
  });

  it('creates a BLN- marker with six alphanumerics', () => {
    expect(agentConnectCreateMarker()).toMatch(/^BLN-[A-Za-z0-9]{6}$/);
    expect(agentConnectCreateMarker(() => 0)).toMatch(/^BLN-[A-Za-z0-9]{6}$/);
    expect(agentConnectCreateMarker(() => 0.999999)).toMatch(/^BLN-[A-Za-z0-9]{6}$/);
  });

  it('puts the marker into the prompt and judges the reply by containment', () => {
    expect(agentConnectBuildPrompt(MARKER)).toContain(MARKER);
    expect(agentConnectReplyHasMarker(`  ${MARKER}\n`, MARKER)).toBe(true);
    expect(agentConnectReplyHasMarker(`네, ${MARKER} 입니다`, MARKER)).toBe(true);
    expect(agentConnectReplyHasMarker('BLN-ZZZZZZ', MARKER)).toBe(false);
    expect(agentConnectReplyHasMarker('', MARKER)).toBe(false);
    expect(agentConnectReplyHasMarker(undefined, MARKER)).toBe(false);
  });

  it('classifies a status without reading a transient probe as "not installed"', () => {
    expect(agentConnectClassify({ installed: false, loggedIn: false, available: false, errorCode: 'timeout' })).toBe('delayed');
    expect(agentConnectClassify({ installed: false, errorCode: 'aborted' })).toBe('delayed');
    expect(agentConnectClassify({ installed: false, errorCode: 'spawn_failed' })).toBe('delayed');
    expect(agentConnectClassify({ installed: false, loggedIn: false, available: false })).toBe('install');
    expect(agentConnectClassify({ installed: true, loggedIn: false, available: false })).toBe('login');
    expect(agentConnectClassify({ installed: true, loggedIn: true, available: false })).toBe('unavailable');
    expect(agentConnectClassify(READY)).toBe('ready');
    expect(agentConnectClassify(undefined)).toBe('delayed');
  });
});

describe('agentConnectRun', () => {
  it('(1) already ready: only the real-answer step runs and the flow succeeds', async () => {
    const { api } = makeApi();
    const ticks = [1_000, 13_000];
    const { promise, lines } = run(api, { now: () => ticks.shift() ?? 13_000 });
    const result = await promise;
    expect(result).toMatchObject({ ok: true, step: 4, elapsedMs: 12_000 });
    expect(result.message).toBe('✅ 연결 완료 — 실제 답 확인됨 (12초)');
    expect(api.agentStatus).toHaveBeenCalledWith('codex', { forceRefresh: true });
    expect(api.agentInstall).not.toHaveBeenCalled();
    expect(api.agentLogin).not.toHaveBeenCalled();
    expect(loginRunner).not.toHaveBeenCalled();
    expect(api.agentGenerate).toHaveBeenCalledTimes(1);
    const payload = api.agentGenerate.mock.calls[0][0] as { provider: string; prompt: string; timeoutMs: number };
    expect(payload.provider).toBe('codex');
    expect(payload.timeoutMs).toBe(120_000);
    expect(payload.prompt).toContain(MARKER);
    expect(lines.some((line) => line.startsWith('[4/4 실제 답 확인]'))).toBe(true);
    expect(lines.some((line) => line.startsWith('[2/4 설치]'))).toBe(false);
  });

  it('(2) not installed and the install fails: stops at 2/4 without login or generate', async () => {
    const { api, unsubscribe } = makeApi({
      agentStatus: vi.fn(async () => ({ success: true, status: { installed: false, loggedIn: false, available: false } })),
      agentInstall: vi.fn(async () => ({ success: false, message: '네트워크 오류로 보입니다' })),
    });
    const { promise, lines } = run(api);
    const result = await promise;
    expect(result).toMatchObject({ ok: false, step: 2 });
    expect(result.message).toBe('❌ [2/4 설치]에서 멈춤: 네트워크 오류로 보입니다');
    expect(api.agentInstall).toHaveBeenCalledWith('codex');
    expect(loginRunner).not.toHaveBeenCalled();
    expect(api.agentLogin).not.toHaveBeenCalled();
    expect(api.agentGenerate).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(lines.some((line) => line.startsWith('[2/4 설치] 공식 npm 패키지를 설치합니다'))).toBe(true);
  });

  it('shows install progress messages and detaches the listener', async () => {
    let emit!: (progress: { provider: string; message: string }) => void;
    const unsubscribe = vi.fn();
    const statuses = [
      { success: true, status: { installed: false, loggedIn: false, available: false } },
      { success: true, status: READY },
    ];
    const { api } = makeApi({
      agentStatus: vi.fn(async () => statuses.shift() ?? { success: true, status: READY }),
      agentInstall: vi.fn(async () => {
        emit({ provider: 'claude', message: '다른 공급자' });
        emit({ provider: 'codex', message: '공식 파일 검증 중' });
        return { success: true };
      }),
      onAgentInstallProgress: vi.fn((listener: typeof emit) => { emit = listener; return unsubscribe; }),
    });
    const { promise, lines } = run(api);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(lines).toContain('[2/4 설치] 공식 파일 검증 중');
    expect(lines.join('\n')).not.toContain('다른 공급자');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('installs, then logs in, then verifies when nothing is ready (full chain)', async () => {
    const statuses = [
      { success: true, status: { installed: false, loggedIn: false, available: false } },
      { success: true, status: { installed: true, loggedIn: false, available: false } },
    ];
    const { api } = makeApi({ agentStatus: vi.fn(async () => statuses.shift() ?? { success: true, status: READY }) });
    loginRunner.mockImplementation(async (options: { startLogin: () => Promise<unknown> }) => options.startLogin());
    const { promise } = run(api);
    const result = await promise;
    expect(result).toMatchObject({ ok: true, step: 4 });
    expect(api.agentInstall).toHaveBeenCalledTimes(1);
    expect(loginRunner).toHaveBeenCalledTimes(1);
    expect(loginRunner.mock.calls[0][0]).toMatchObject({ provider: 'codex', api });
    expect(api.agentLogin).toHaveBeenCalledWith('codex');
    expect(api.agentGenerate).toHaveBeenCalledTimes(1);
  });

  it('(3) login succeeds but the account is unusable: stops at 3/4 with that reason', async () => {
    const { api } = makeApi({
      agentStatus: vi.fn(async () => ({ success: true, status: { installed: true, loggedIn: false, available: false } })),
      agentLogin: vi.fn(async () => ({
        success: true,
        status: { installed: true, loggedIn: true, available: false, errorCode: 'subscription_inactive', detail: 'plan inactive' },
      })),
    });
    loginRunner.mockImplementation(async (options: { startLogin: () => Promise<unknown> }) => options.startLogin());
    const result = await run(api).promise;
    expect(result).toMatchObject({ ok: false, step: 3 });
    expect(result.message).toContain('❌ [3/4 로그인]에서 멈춤:');
    expect(result.message).toContain('구독');
    expect(api.agentGenerate).not.toHaveBeenCalled();
  });

  it('stops at 3/4 when the login itself fails', async () => {
    const { api } = makeApi({
      agentStatus: vi.fn(async () => ({ success: true, status: { installed: true, loggedIn: false, available: false } })),
      agentLogin: vi.fn(async () => ({ success: false, message: '로그인이 취소되었습니다' })),
    });
    loginRunner.mockImplementation(async (options: { startLogin: () => Promise<unknown> }) => options.startLogin());
    const result = await run(api).promise;
    expect(result).toMatchObject({ ok: false, step: 3 });
    expect(result.message).toBe('❌ [3/4 로그인]에서 멈춤: 로그인이 취소되었습니다');
    expect(api.agentGenerate).not.toHaveBeenCalled();
  });

  it('stops at 3/4 when logged in already but the subscription cannot be used (no login retry)', async () => {
    const { api } = makeApi({
      agentStatus: vi.fn(async () => ({
        success: true,
        status: { installed: true, loggedIn: true, available: false, errorCode: 'rate_limited' },
      })),
    });
    const result = await run(api).promise;
    expect(result).toMatchObject({ ok: false, step: 3 });
    expect(result.message).toContain('한도');
    expect(loginRunner).not.toHaveBeenCalled();
    expect(api.agentGenerate).not.toHaveBeenCalled();
  });

  it('(4) reply without the marker fails at 4/4', async () => {
    const { api } = makeApi({ agentGenerate: vi.fn(async () => ({ success: true, text: '안녕하세요, 무엇을 도와드릴까요?' })) });
    const result = await run(api).promise;
    expect(result).toMatchObject({ ok: false, step: 4 });
    expect(result.message).toContain('❌ [4/4 실제 답 확인]에서 멈춤:');
  });

  it('fails at 4/4 with the generate error message', async () => {
    const { api } = makeApi({ agentGenerate: vi.fn(async () => ({ success: false, message: '120초 내 응답이 없어 중단했습니다.' })) });
    const result = await run(api).promise;
    expect(result).toMatchObject({ ok: false, step: 4 });
    expect(result.message).toContain('120초 내 응답이 없어 중단했습니다.');
  });

  it('(5) status timeout stops at 1/4 and never tries to install', async () => {
    const { api } = makeApi({
      agentStatus: vi.fn(async () => ({ success: true, status: { installed: false, loggedIn: false, available: false, errorCode: 'timeout' } })),
    });
    const result = await run(api).promise;
    expect(result).toMatchObject({ ok: false, step: 1 });
    expect(result.message).toContain('상태 확인 지연');
    expect(api.agentInstall).not.toHaveBeenCalled();
    expect(loginRunner).not.toHaveBeenCalled();
    expect(api.agentGenerate).not.toHaveBeenCalled();
  });

  it('stops at 1/4 when the status call itself fails', async () => {
    const { api } = makeApi({ agentStatus: vi.fn(async () => ({ success: false, message: 'ipc down' })) });
    const result = await run(api).promise;
    expect(result).toMatchObject({ ok: false, step: 1 });
    expect(api.agentInstall).not.toHaveBeenCalled();
  });

  it('turns a thrown api error into a stop at the current step instead of throwing', async () => {
    const { api } = makeApi({ agentGenerate: vi.fn(async () => { throw new Error('boom'); }) });
    const result = await run(api).promise;
    expect(result).toMatchObject({ ok: false, step: 4 });
    expect(result.message).toContain('boom');
  });
});

describe('agentConnect log line', () => {
  it('creates one log div right below the status line and reuses it', () => {
    document.body.innerHTML = '<div id="wrap"><div id="agent-codex-status"></div><div id="after"></div></div>';
    const status = document.getElementById('agent-codex-status') as HTMLElement;
    const log = agentConnectEnsureLog(status, 'codex');
    expect(log.id).toBe('agent-codex-connect-log');
    expect(status.nextElementSibling).toBe(log);
    expect(agentConnectEnsureLog(status, 'codex')).toBe(log);
    expect(document.querySelectorAll('#agent-codex-connect-log').length).toBe(1);
  });

  it('writes text and tone colour without touching the status line', () => {
    document.body.innerHTML = '<div id="agent-claude-status">상태</div>';
    const status = document.getElementById('agent-claude-status') as HTMLElement;
    const log = agentConnectEnsureLog(status, 'claude');
    agentConnectWriteLog(log, '❌ [2/4 설치]에서 멈춤: 실패', 'error');
    expect(log.textContent).toBe('❌ [2/4 설치]에서 멈춤: 실패');
    expect(log.style.color).not.toBe('');
    expect(status.textContent).toBe('상태');
  });
});
