/**
 * [2026-10-09] 전수조사 9번 — 실행 끝·계정 멈춤을 기록에 1줄씩 남긴다.
 * 기록 줄은 계정 아이디 앞 3자만 싣고, PC 사용자 이름·경로·쿼리는 싣지 않으며, 화면 진행 로그로 두 번 새지 않아야 한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AccountExecutionGuard, AccountExecutionGuardError } from '../automation/accountExecutionGuard';
import {
  describePauseCaller,
  describePauseScreen,
  formatAccountPauseLine,
  setPausePageUrlReader,
} from '../automation/accountPauseLog';
import { executePublishing, injectDependencies } from '../main/services/BlogExecutor';

const BS = String.fromCharCode(92);
const readSrc = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const ID = 'tjdgus1234';

describe('BlogExecutor: 발행 끝 기록', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { injectDependencies({} as any); warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => { warn.mockRestore(); });

  it('실패 결과는 [RunEnd] 1줄 — 코드·앞 3자만, 전체 아이디와 사용자 이름은 없다', async () => {
    const message = `사진 업로드 실패: open 'C:${BS}Users${BS}홍길동${BS}Downloads${BS}a.jpg' (${ID})`;
    const run = async () => ({ success: false, message });
    await executePublishing({ run } as any, { naverId: ID, title: 't', content: 'c', publishMode: 'publish' } as any, []);
    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[RunEnd]'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('발행 실패(');
    expect(lines[0]).toContain('tjd***');
    expect(lines[0]).not.toContain(ID);
    expect(lines[0]).not.toContain('홍길동');
  });

  it('가드 거절 예외는 [RunEnd] 1줄 — 코드와 "시작 전 거절"', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runend-'));
    try {
      const guard = new AccountExecutionGuard({ storageDir: dir });
      guard.pause(ID, 'NETWORK_WAIT');
      warn.mockClear();
      const run = () => guard.runExclusive(ID, async () => ({ success: true }));
      await executePublishing({ run } as any, { naverId: ID, title: 't', content: 'c', publishMode: 'publish' } as any, []);
      const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[RunEnd]'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('발행 오류(NETWORK_WAIT, 시작 전 거절)');
      expect(lines[0]).toContain('tjd***');
      expect(lines[0]).not.toContain(ID);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('main.ts: 실행 끝 기록 원문', () => {
  const main = readSrc('src/main.ts');
  it('else 분기의 [RunEnd] 기록이 sendStatus 보다 앞에 있다', () => {
    const warnAt = main.indexOf('console.warn(`[RunEnd]');
    const sendAt = main.indexOf('sendStatus({ success: false, message: (result as any).message, failureCode });');
    expect(warnAt).toBeGreaterThan(0);
    expect(sendAt).toBeGreaterThan(warnAt);
  });
  it('LOG_FORWARD_PREFIXES 중 [RunEnd]·[AccountGuard] 앞에 붙는 접두어가 없다(화면 이중 출력 방지)', () => {
    const block = main.slice(main.indexOf('const LOG_FORWARD_PREFIXES = ['));
    const body = block.slice(0, block.indexOf('];'));
    const prefixes = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(prefixes.length).toBeGreaterThan(10);
    for (const tag of ['[RunEnd]', '[AccountGuard]']) {
      expect(prefixes.filter((p) => tag.startsWith(p))).toEqual([]);
    }
  });
});

describe('accountPauseLog: 줄 모양', () => {
  it('쿼리 제거·blog.naver.com 첫 칸 가림·호출 위치는 파일 이름:줄만', () => {
    const stack = [
      'Error',
      `    at AccountExecutionGuard.pause (C:${BS}Users${BS}홍길동${BS}app${BS}accountExecutionGuard.js:90:20)`,
      `    at BrowserSessionManager.ensureServerSession (C:${BS}Users${BS}홍길동${BS}app${BS}browserSessionManager.js:1096:12)`,
      `    at async NaverBlogAutomation.loginToNaver (C:/Users/홍길동/app/naverBlogAutomation.js:1992:5)`,
    ].join('\n');
    const line = formatAccountPauseLine({ accountId: ID, code: 'LOGIN_REQUIRED', saved: true, url: 'https://blog.naver.com/tjdgus1234/postwrite?Redirect=Write&token=abc#x', stack });
    expect(line.startsWith('[AccountGuard] ⚠️ 계정 멈춤 저장: LOGIN_REQUIRED · tjd***')).toBe(true);
    expect(line).toContain('화면 blog.naver.com/*/postwrite');
    expect(line).not.toContain('Redirect');
    expect(line).not.toContain('token');
    expect(line).toContain('호출 BrowserSessionManager.ensureServerSession@browserSessionManager.js:1096 <- NaverBlogAutomation.loginToNaver@naverBlogAutomation.js:1992');
    expect(line).not.toContain('Users');
    expect(line).not.toContain(ID);
  });
  it('못 읽는 스택은 ?, 빈 주소는 화면 없음', () => {
    expect(describePauseCaller(undefined)).toBe('?');
    expect(describePauseCaller('Error\n   이상한 줄')).toBe('?');
    expect(describePauseScreen('', ID)).toBe('(화면 없음)');
    expect(describePauseScreen('https://nid.naver.com/nidlogin.login?mode=form', ID)).toBe('nid.naver.com/nidlogin.login');
  });
  it('저장 실패면 "저장 실패" 로 표시한다', () => {
    expect(formatAccountPauseLine({ accountId: ID, code: 'NETWORK_WAIT', saved: false })).toContain('계정 멈춤 저장 실패: NETWORK_WAIT');
  });
});

describe('실제 AccountExecutionGuard.pause 기록', () => {
  let dir: string;
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pauselog-')); warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => { warn.mockRestore(); setPausePageUrlReader(null); fs.rmSync(dir, { recursive: true, force: true }); });
  const guardLines = () => warn.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[AccountGuard]'));

  it('멈추면 경고 1줄(화면 주소 포함)을 남기고 반환은 그대로다', () => {
    setPausePageUrlReader(() => 'https://nid.naver.com/nidlogin.login?x=1');
    const status = new AccountExecutionGuard({ storageDir: dir }).pause(ID, 'LOGIN_REQUIRED');
    expect(status).toMatchObject({ paused: true, code: 'LOGIN_REQUIRED' });
    expect(guardLines()).toHaveLength(1);
    expect(guardLines()[0]).toContain('계정 멈춤 저장: LOGIN_REQUIRED · tjd***');
    expect(guardLines()[0]).toContain('화면 nid.naver.com/nidlogin.login');
    expect(guardLines()[0]).not.toContain(ID);
  });

  it('저장이 실패하면 throw 와 함께 "저장 실패" 줄을 남긴다', () => {
    const blocker = path.join(dir, 'file-not-dir');
    fs.writeFileSync(blocker, 'x');
    const guard = new AccountExecutionGuard({ storageDir: blocker });
    expect(() => guard.pause(ID, 'NETWORK_WAIT')).toThrow(AccountExecutionGuardError);
    expect(guardLines()).toHaveLength(1);
    expect(guardLines()[0]).toContain('저장 실패');
  });

  it('주소 읽기 함수가 throw 해도 멈춤은 정상 처리된다', () => {
    setPausePageUrlReader(() => { throw new Error('page closed'); });
    const guard = new AccountExecutionGuard({ storageDir: dir });
    expect(guard.pause(ID, 'NETWORK_WAIT').paused).toBe(true);
    expect(guardLines()).toHaveLength(1);
  });
});
