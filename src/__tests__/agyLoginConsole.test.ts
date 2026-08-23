import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * [2026-08-23] 사용자 보고: "연동만 되라니까 터미널이 채팅 화면인 채로 끝난다".
 *
 * 실측(agy 1.1.19):
 *  - `agy --help` 서브커맨드 = install/update/models/mcp/plugin/agent/changelog 뿐.
 *    로그인 전용 명령이 없어 로그인은 "인자 없이 실행 = 대화형 TUI 진입"으로만 된다.
 *  - `tasklist /V` 상 agy 의 Window Title 은 `N/A` → start 가 준 제목으로는 창을 못 닫는다.
 *  - PID 로 종료하면 콘솔이 정상적으로 닫힌다.
 * 따라서 자격 증명이 확인된 뒤 앱이 그 콘솔을 PID 로 닫는다.
 */
describe('agy 로그인 콘솔 정리', () => {
  const source = readFileSync(resolve(__dirname, '../agentCli/agyLogin.ts'), 'utf8');

  it('제목이 아니라 PID 로 닫는다 (창 제목은 N/A라 필터가 안 먹는다)', () => {
    expect(source).toContain("execFile('taskkill', ['/PID', String(pid), '/T', '/F']");
    expect(source).not.toContain('WINDOWTITLE');
  });

  it('콘솔 PID 탐색이 탐지 폴링보다 먼저 끝난다', () => {
    // detectAgent 가 `agy --version` / `agy models` 를 띄우므로, 폴링 이후에 PID를
    // 재수집하면 그 단명 프로세스가 diff에 섞여 엉뚱한 프로세스를 죽인다.
    const discoverAt = source.indexOf('const openedPids = await discoverOpenedAgyPids(pidsBefore)');
    const pollAt = source.indexOf('await sleep(POLL_INTERVAL_MS)');
    expect(source).toContain('const pidsBefore = await listAgyPids();');
    expect(discoverAt).toBeGreaterThan(-1);
    expect(pollAt).toBeGreaterThan(-1);
    expect(discoverAt).toBeLessThan(pollAt);
  });

  it('로그인 확인된 뒤에만 닫는다 — 타임아웃 시엔 창을 남긴다', () => {
    const successAt = source.indexOf('await closeAgyLoginConsole(openedPids);');
    const loggedInAt = source.indexOf('if (status?.loggedIn)');
    expect(loggedInAt).toBeGreaterThan(-1);
    expect(successAt).toBeGreaterThan(loggedInAt);
    // 종료 경로는 성공 분기 하나뿐이어야 한다.
    expect(source.split('closeAgyLoginConsole(').length - 1).toBe(2); // 정의 1 + 호출 1
  });

  it('윈도우 외 플랫폼에서는 프로세스를 건드리지 않는다', () => {
    expect(source).toContain("if (process.platform !== 'win32') return new Set();");
    expect(source).toContain("if (process.platform !== 'win32') return [];");
    expect(source).toContain("if (process.platform !== 'win32' || pids.length === 0) return;");
  });
});
