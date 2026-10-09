/**
 * [2026-10-09] 진입 뒤 프레임 재획득 실패가 임시저장 성공 뒤 계정을 멈추던 문제.
 * 실측: 임시저장 완료 → detached Frame → NETWORK_WAIT 멈춤 즉시 저장 → "모든 과정 성공" → 다음 발행이 시작에서 거절.
 *
 * RED 근거(수정 전): switchToMainFrame 이 NETWORK_WAIT 를 pauseEntry 로 즉시 저장했고(①④), activateEditorForEditing 이
 * 닫힌 창에서도 getAttachedFrame 을 불렀으며(②), retry 가 멈춤 코드를 일반 Error 로 바꿨다(⑤). 소스 단언(⑥)도 0/3 이었다.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ journal: undefined as any, guard: undefined as any }));
vi.mock('../automation/publicationCommitJournal.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../automation/publicationCommitJournal.js')>()),
  getPublicationCommitJournal: () => holder.journal,
}));
vi.mock('../automation/accountExecutionGuard.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../automation/accountExecutionGuard.js')>()),
  getAccountExecutionGuard: () => holder.guard,
}));

let NaverBlogAutomation: any;
let PublicationCommitJournal: any;
let AccountExecutionGuard: any;
let tempDir = '';
const editorUrl = 'https://blog.naver.com/acc1?Redirect=Write&';

beforeAll(async () => {
  ({ NaverBlogAutomation } = await import('../naverBlogAutomation'));
  ({ PublicationCommitJournal } = await import('../automation/publicationCommitJournal.js'));
  ({ AccountExecutionGuard } = await import('../automation/accountExecutionGuard.js'));
}, 240_000);
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'frame-reacquire-'));
  holder.journal = new PublicationCommitJournal({ storageDir: join(tempDir, 'journal') });
  holder.guard = new AccountExecutionGuard({ storageDir: join(tempDir, 'guard') });
});
afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

function make(page: any) {
  const automation: any = Object.create(NaverBlogAutomation.prototype);
  Object.assign(automation, { options: { naverId: 'acc1' }, logger: () => undefined, page, browser: { connected: true }, accountWorkId: '' });
  return automation;
}
/** 닫힌 창: 프레임 탐색은 EditorFrameSelectionError 로 실패한다. */
const closedPage = () => ({ isClosed: () => true, url: () => editorUrl, frames: () => [] });
/** 임시저장은 성공했고 그 뒤 mainFrame.evaluate 가 detached Frame 을 던지며 창이 닫힌다. */
function detachedAfterSave() {
  const page = { closed: false, isClosed() { return this.closed; }, url: () => editorUrl, frames: () => [] as any[] };
  const automation = make(page);
  automation.mainFrame = { evaluate: async () => { page.closed = true; throw new Error('Attempted to use detached Frame'); } };
  return automation;
}
const paused = () => holder.guard.getStatus('acc1');

describe('진입 뒤 프레임 재획득', () => {
  it('① 임시저장 성공 뒤 detached 여도 계정은 멈추지 않고 실행은 성공으로 끝난다', async () => {
    const automation = detachedAfterSave();
    const result = await automation.withAccountExecution(async () => { await automation.activateEditorAfterRun('draft'); return { success: true }; });
    expect(result).toEqual({ success: true });
    expect(paused().paused).toBe(false);
  });

  it('② page 가 닫혀 있으면 getAttachedFrame 을 부르지 않는다', async () => {
    const automation = make(closedPage());
    automation.getAttachedFrame = vi.fn(async () => { throw new Error('호출되면 안 된다'); });
    await automation.activateEditorForEditing();
    expect(automation.getAttachedFrame).not.toHaveBeenCalled();
    expect(paused().paused).toBe(false);
  });

  it('② 브라우저 연결이 끊겨도 건너뛴다', async () => {
    const automation = make({ isClosed: () => false, url: () => editorUrl });
    automation.browser = { connected: false };
    automation.getAttachedFrame = vi.fn();
    await automation.activateEditorForEditing();
    expect(automation.getAttachedFrame).not.toHaveBeenCalled();
  });

  it('③ 같은 상황에서 getAttachedFrame 오류가 올라오면 NETWORK_WAIT 를 한 번 저장한다', async () => {
    const automation = detachedAfterSave();
    await expect(automation.withAccountExecution(() => automation.getAttachedFrame())).rejects.toMatchObject({ code: 'NETWORK_WAIT' });
    expect(paused()).toMatchObject({ paused: true, code: 'NETWORK_WAIT' });
    expect(paused().version).toBe(1);
  });

  it('④ afterEntry 는 NETWORK_WAIT 를 던지되 저장하지 않고, 옵션이 없으면 지금처럼 저장한다', async () => {
    const a = make(closedPage());
    await expect(a.switchToMainFrame({ afterEntry: true })).rejects.toMatchObject({ code: 'NETWORK_WAIT' });
    expect(paused().paused).toBe(false);
    const b = make(closedPage());
    await expect(b.switchToMainFrame()).rejects.toMatchObject({ code: 'NETWORK_WAIT' });
    expect(paused()).toMatchObject({ paused: true, code: 'NETWORK_WAIT' });
  });

  it('④ afterEntry 여도 로그인 확인 주소는 바로 저장한다(창을 남겨야 한다)', async () => {
    const automation = make({ isClosed: () => false, url: () => 'https://nid.naver.com/nidlogin.login?url=x', frames: () => [] });
    await expect(automation.switchToMainFrame({ afterEntry: true })).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
    expect(paused()).toMatchObject({ paused: true, code: 'LOGIN_REQUIRED' });
  });

  it('⑤ retry 의 프레임 복구가 실패해도 멈춤 코드를 잃지 않는다', async () => {
    const automation = make(closedPage());
    await expect(automation.retry(async () => { throw new Error('detached Frame'); }, 3, '시험 작업')).rejects.toMatchObject({ code: 'NETWORK_WAIT' });
    expect(paused().paused).toBe(false); // 저장은 withAccountExecution 몫
  });
});

describe('⑦ 중간에서 삼킨 재획득 실패 (2026-10-09 검토 지적)', () => {
  /** 재획득 실패를 호출한 쪽이 .catch 로 삼킨 뒤, 실행이 다른 이름의 오류로 끝나는 경우. */
  async function swallowThenFail(finalError: Error) {
    const automation = make(closedPage());
    await expect(automation.withAccountExecution(async () => {
      await automation.switchToMainFrame({ afterEntry: true }).catch(() => null);
      throw finalError;
    })).rejects.toBe(finalError);
    return automation;
  }

  it('실행이 일반 오류(에디터 준비 실패 등)로 끝나면 미뤄 둔 NETWORK_WAIT 를 한 번 저장한다', async () => {
    await swallowThenFail(new Error('에디터를 찾을 수 없습니다'));
    expect(paused()).toMatchObject({ paused: true, code: 'NETWORK_WAIT', version: 1 });
  });

  it('사용자가 크롬을 닫아 끝난 실행은 저장하지 않는다(10/9 사고 경로)', async () => {
    await swallowThenFail(new Error('Target closed: 브라우저가 닫혔습니다'));
    expect(paused().paused).toBe(false);
  });

  it('삼킨 뒤에도 실행이 성공하면 저장하지 않는다', async () => {
    const automation = make(closedPage());
    await automation.withAccountExecution(async () => { await automation.switchToMainFrame({ afterEntry: true }).catch(() => null); return { success: true }; });
    expect(paused().paused).toBe(false);
  });

  it('그 뒤 프레임을 다시 잡으면 표시를 지운다(소스 단언: 프레임 저장 직후 초기화)', () => {
    const main = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(main).toContain('    this.mainFrame = frame;\n    this.deferredFrameStop = false;\n');
    expect(main.match(/this\.deferredFrameStop = false;/g) ?? []).toHaveLength(3); // 프레임 회복 1 + 두 발행 경로 시작 2
  });
});

describe('⑥ 소스 단언', () => {
  const read = (f: string) => readFileSync(new URL(`../automation/${f}`, import.meta.url), 'utf8');
  const main = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');
  it('self.switchToMainFrame() 호출이 없고 afterEntry 가 보조 모듈 3곳에 있다', () => {
    const files = readdirSync(new URL('../automation/', import.meta.url)).filter((f) => f.endsWith('.ts'));
    const all = files.map(read).join('\n');
    expect(all.match(/self\.switchToMainFrame\(\)/g) ?? []).toHaveLength(0);
    expect(all.match(/switchToMainFrame\(\{ afterEntry: true \}\)/g) ?? []).toHaveLength(3);
  });
  it('getAttachedFrame 안의 재획득 2곳이 afterEntry 를 쓴다', () => {
    const body = main.slice(main.indexOf('private async getAttachedFrame()'), main.indexOf('private async getAttachedFrame()') + 900);
    expect(body.match(/switchToMainFrame\(\{ afterEntry: true \}\)/g) ?? []).toHaveLength(2);
  });
});
