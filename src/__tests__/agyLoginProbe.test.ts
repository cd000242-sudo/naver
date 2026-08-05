import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
}));

import { clearAgentDetectionCache, detectAgent } from '../agentCli/detect';

/**
 * [2026-08-05] agy(Antigravity) 로그인 프로브 회귀 테스트.
 *
 * v2.11.145에서 gemini provider의 실행 파일이 `gemini` → `agy`로 바뀌었다.
 * Google이 2026-06-18부터 개인 계정의 Gemini CLI 요청을 끊어 `gemini`는 아예
 * 인증이 안 된다. 로그인 판정은 `agy models`로 하는데, 이 명령은 생성 쿼터를
 * 쓰지 않으면서 인증 체인을 전부 통과한다.
 *
 * 여기서 잠그는 계약은 세 가지다.
 *   1. 상태 감지가 **생성 쿼터를 쓰지 않는다** (models 외 명령을 던지지 않는다)
 *   2. 죽은 `gemini` 실행 파일로 되돌아가지 않는다
 *   3. 빈 출력·비정상 종료를 "로그인됨"으로 오판하지 않는다
 *
 * 프로브는 의도적으로 휴리스틱이다(주석 참조) — 인증 없이도 정적 목록을 뱉을
 * 여지가 남는다. 그 잔여분은 생성 시점에 걸러지므로 여기서 단언하지 않는다.
 */

const VERSION_OK = { code: 0, stdout: '1.4.0', stderr: '' };

/** detectAgent가 실제로 spawn한 명령 목록 */
function spawnedCommands(): Array<{ command: string; args: string[] }> {
  return spawnMock.mock.calls.map(([opts]: [{ command: string; args: string[] }]) => ({
    command: opts.command,
    args: opts.args,
  }));
}

describe('agy 로그인 프로브', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    clearAgentDetectionCache();
  });

  it('models 출력이 있으면 로그인으로 본다', async () => {
    spawnMock
      .mockResolvedValueOnce(VERSION_OK)
      .mockResolvedValueOnce({ code: 0, stdout: 'gemini-3-pro\ngemini-3-flash\n', stderr: '' });

    const status = await detectAgent('gemini', { forceRefresh: true });

    expect(status.installed).toBe(true);
    expect(status.loggedIn).toBe(true);
  });

  it('죽은 gemini 실행 파일이 아니라 agy를 호출한다', async () => {
    spawnMock
      .mockResolvedValueOnce(VERSION_OK)
      .mockResolvedValueOnce({ code: 0, stdout: 'gemini-3-pro\n', stderr: '' });

    await detectAgent('gemini', { forceRefresh: true });

    const commands = spawnedCommands();
    expect(commands.length).toBeGreaterThan(0);
    for (const { command } of commands) {
      expect(command, 'gemini CLI는 2026-06-18부터 개인 계정 인증이 불가하다').not.toBe('gemini');
    }
    expect(commands.some((c) => c.command === 'agy')).toBe(true);
  });

  it('상태 감지가 생성 쿼터를 쓰지 않는다', async () => {
    spawnMock
      .mockResolvedValueOnce(VERSION_OK)
      .mockResolvedValueOnce({ code: 0, stdout: 'gemini-3-pro\n', stderr: '' });

    await detectAgent('gemini', { forceRefresh: true });

    for (const { args } of spawnedCommands()) {
      // 생성 계열 하위 명령이 섞이면 상태 확인만으로 과금된다.
      expect(args).not.toContain('generate');
      expect(args).not.toContain('prompt');
      expect(args).not.toContain('chat');
    }
  });

  it('종료 코드가 0이어도 출력이 비면 로그인으로 보지 않는다', async () => {
    spawnMock
      .mockResolvedValueOnce(VERSION_OK)
      .mockResolvedValueOnce({ code: 0, stdout: '   \n\n', stderr: '' });

    const status = await detectAgent('gemini', { forceRefresh: true });

    expect(status.loggedIn).toBe(false);
  });

  it('비정상 종료면 로그인으로 보지 않고 사유를 남긴다', async () => {
    spawnMock
      .mockResolvedValueOnce(VERSION_OK)
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'not authenticated' });

    const status = await detectAgent('gemini', { forceRefresh: true });

    expect(status.loggedIn).toBe(false);
    expect(status.detail ?? '').toContain('not authenticated');
  });

  it('프로브가 던져도 감지는 실패하지 않는다', async () => {
    spawnMock
      .mockResolvedValueOnce(VERSION_OK)
      .mockRejectedValueOnce(new Error('spawn ENOENT'));

    const status = await detectAgent('gemini', { forceRefresh: true });

    expect(status.loggedIn).toBe(false);
    expect(status.installed).toBe(true);
  });
});
