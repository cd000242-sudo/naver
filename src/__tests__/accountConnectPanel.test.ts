// @vitest-environment happy-dom
/**
 * "네이버 계정 연결" panel: chip wording, no automatic check when the panel opens (Chrome would start), 'open'/'check' only on a
 * click, and the post-open polling stopping on connected / window closed / removed from the page / time limit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { accountConnectBuild, accountConnectChip, accountConnectInstallMain } from '../renderer/modules/accountConnectPanel';

const api = { accountSafety: vi.fn() };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const calls = (action: string) => api.accountSafety.mock.calls.filter(call => call[1] === action);
const chip = (root: HTMLElement) => root.querySelector('[data-role="connect-chip"]')!.textContent;
const note = (root: HTMLElement) => root.querySelector('[data-role="connect-note"]')!.textContent;
const button = (root: HTMLElement, action: string) => root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!;

function mount(getKey: () => string = () => 'a1', lookup: 'account' | 'naver-id' = 'account') {
  const panel = accountConnectBuild({ lookup, getKey });
  document.body.append(panel.element);
  return panel;
}

beforeEach(() => { document.body.innerHTML = ''; api.accountSafety.mockReset().mockResolvedValue({ success: true, state: { busy: false, windowOpen: false } }); Object.assign(window, { api }); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('accountConnectChip wording', () => {
  const at = new Date(2026, 10, 3, 9, 5).getTime();
  it.each([
    [{ connection: { state: 'connected', blogId: 'my_blog', checkedAt: at } }, `연결됨 · 블로그 my_blog (09:05 확인)`, 'ok'],
    [{ connection: { state: 'connected', checkedAt: at } }, '연결됨 (09:05 확인)', 'ok'],
    [{ connection: { state: 'login-required', checkedAt: at } }, '로그인 필요', 'warn'],
    [{ connection: { state: 'challenge', checkedAt: at } }, '본인확인 필요', 'warn'],
    [{ connection: { state: 'protected', checkedAt: at } }, '보호조치 확인 필요', 'warn'],
    [{ connection: { state: 'mismatch', checkedAt: at } }, '다른 계정 로그인됨', 'warn'],
    [{ savedLogin: { saved: true, expiresAt: new Date(2026, 11, 7, 12, 0).getTime() } }, '확인 전 — 저장된 로그인 있음(~12/07 유지 표시)', 'unknown'],
    [{ savedLogin: { saved: true } }, '확인 전 — 저장된 로그인 있음', 'unknown'],
    [{ savedLogin: { saved: false } }, '확인 전 — 저장된 로그인 없음', 'unknown'],
    [{}, '확인 전', 'unknown'],
    [undefined, '확인 전', 'unknown'],
  ])('%j -> %s', (view, text, tone) => {
    expect(accountConnectChip(view as never)).toEqual({ text, tone });
  });

  it('a last check wins over the saved-login hint', () => {
    expect(accountConnectChip({ connection: { state: 'login-required', checkedAt: 1 }, savedLogin: { saved: true } }).text).toBe('로그인 필요');
  });
});

describe('opening the panel', () => {
  it('only reads the status (never check/open), and shows the saved-login hint', async () => {
    api.accountSafety.mockResolvedValue({ success: true, state: { savedLogin: { saved: true, expiresAt: new Date(2026, 11, 7).getTime() } } });
    const { element } = mount(); await flush();
    expect(api.accountSafety.mock.calls).toEqual([['a1', 'status']]);
    expect(calls('check')).toHaveLength(0);
    expect(calls('open')).toHaveLength(0);
    expect(chip(element)).toBe('확인 전 — 저장된 로그인 있음(~12/07 유지 표시)');
  });

  it('uses the Naver-ID lookup when asked', async () => {
    mount(() => 'my-naver', 'naver-id'); await flush();
    expect(api.accountSafety).toHaveBeenCalledWith('my-naver', 'status', undefined, undefined, undefined, 'naver-id');
  });

  it('shows the one-line guide: the app never types the password', async () => {
    const { element } = mount(); await flush();
    expect(element.textContent).toContain('비밀번호는 앱이 입력하지 않습니다. 열린 크롬 창에서 직접 로그인하세요.');
    expect(element.textContent).toContain('이 PC의 계정 전용 크롬에 저장돼 다음 발행 때 그대로 씁니다');
  });

  it('asks for the Naver ID first when the field is empty, and calls nothing even on a click', async () => {
    const { element } = mount(() => '  ', 'naver-id'); await flush();
    button(element, 'connect-open').click(); button(element, 'connect-check').click(); await flush();
    expect(api.accountSafety).not.toHaveBeenCalled();
    expect(note(element)).toContain('아이디를 먼저 입력');
  });

  it('survives a missing or failing API without throwing', async () => {
    api.accountSafety.mockRejectedValue(new Error('ipc down'));
    const { element } = mount(); await flush();
    expect(chip(element)).toBe('확인 전');
    delete (window as { api?: unknown }).api;
    const second = mount(); await flush();
    expect(chip(second.element)).toBe('확인 전');
  });

  it('disables both buttons while the account is busy', async () => {
    api.accountSafety.mockResolvedValue({ success: true, state: { busy: true } });
    const { element } = mount(); await flush();
    expect(button(element, 'connect-open').disabled).toBe(true);
    expect(button(element, 'connect-check').disabled).toBe(true);
    expect(note(element)).toContain('작업 중');
  });
});

describe('buttons', () => {
  it('[연결 확인] runs one check and shows the connected chip with the blog and time', async () => {
    const checkedAt = new Date(2026, 10, 3, 14, 7).getTime();
    api.accountSafety.mockImplementation(async (_id: string, action: string) => action === 'check'
      ? { success: true, state: { connection: { state: 'connected', blogId: 'my_blog', checkedAt } }, message: '연결을 확인했습니다 (블로그: my_blog).' }
      : { success: true, state: {} });
    const { element } = mount(); await flush();
    button(element, 'connect-check').click(); await flush();
    expect(calls('check')).toHaveLength(1);
    expect(calls('open')).toHaveLength(0);
    expect(chip(element)).toBe('연결됨 · 블로그 my_blog (14:07 확인)');
    expect(note(element)).toContain('연결을 확인했습니다');
    expect(button(element, 'connect-check').disabled).toBe(false);
  });

  it('shows the refusal text from the main process (busy) and keeps the chip', async () => {
    api.accountSafety.mockImplementation(async (_id: string, action: string) => action === 'check'
      ? { success: false, state: { busy: true }, message: '이 계정의 작업이 끝난 뒤 다시 확인해주세요.' } : { success: true, state: {} });
    const { element } = mount(); await flush();
    button(element, 'connect-check').click(); await flush();
    expect(note(element)).toContain('작업이 끝난 뒤');
  });

  it('[네이버 로그인 창 열기] sends one open and nothing else on its own', async () => {
    const { element } = mount(); await flush();
    api.accountSafety.mockClear();
    button(element, 'connect-open').click(); await flush();
    expect(api.accountSafety.mock.calls).toEqual([['a1', 'open']]);
  });
});

describe('polling after [네이버 로그인 창 열기]', () => {
  const POLL = 4_000;
  async function openedPanel(statusReply: (n: number) => unknown) {
    vi.useFakeTimers();
    let statusCalls = 0;
    api.accountSafety.mockImplementation(async (_id: string, action: string) => {
      if (action === 'open') return { success: true, state: { windowOpen: true }, message: '열린 네이버 창에서 직접 로그인·본인확인을 완료해주세요.' };
      return statusReply(++statusCalls);
    });
    const panel = mount(); await flush();
    api.accountSafety.mockClear();
    button(panel.element, 'connect-open').click(); await flush();
    return panel;
  }
  const statusCount = () => calls('status').length;

  it('reads the status every 4 seconds while the window is open without a result', async () => {
    const { element } = await openedPanel(() => ({ success: true, state: { windowOpen: true } }));
    expect(statusCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(POLL); expect(statusCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(POLL); expect(statusCount()).toBe(2);
    expect(calls('check')).toHaveLength(0);
    expect(chip(element)).toBe('확인 전');
  });

  it('stops once the main process reports connected (and updates the chip)', async () => {
    const { element } = await openedPanel(() => ({ success: true, state: { windowOpen: true, connection: { state: 'connected', blogId: 'b1', checkedAt: Date.now() } } }));
    await vi.advanceTimersByTimeAsync(POLL);
    expect(chip(element)).toContain('연결됨 · 블로그 b1');
    expect(note(element)).toContain('연결됐습니다');
    await vi.advanceTimersByTimeAsync(POLL * 5);
    expect(statusCount()).toBe(1);
  });

  it('does not stop for a connected result older than the click', async () => {
    await openedPanel(() => ({ success: true, state: { windowOpen: true, connection: { state: 'connected', blogId: 'b1', checkedAt: 1 } } }));
    await vi.advanceTimersByTimeAsync(POLL * 3);
    expect(statusCount()).toBe(3);
  });

  it('stops when the login window was closed', async () => {
    const { element } = await openedPanel(() => ({ success: true, state: { windowOpen: false } }));
    await vi.advanceTimersByTimeAsync(POLL * 4);
    expect(statusCount()).toBe(1);
    expect(note(element)).toContain('로그인 창이 닫혔습니다');
  });

  it('stops when the panel leaves the page', async () => {
    const { element } = await openedPanel(() => ({ success: true, state: { windowOpen: true } }));
    await vi.advanceTimersByTimeAsync(POLL); expect(statusCount()).toBe(1);
    element.remove();
    await vi.advanceTimersByTimeAsync(POLL * 5);
    expect(statusCount()).toBe(1);
  });

  it('stops after 15 minutes', async () => {
    await openedPanel(() => ({ success: true, state: { windowOpen: true } }));
    await vi.advanceTimersByTimeAsync(15 * 60_000 + POLL * 2);
    const settled = statusCount();
    await vi.advanceTimersByTimeAsync(POLL * 10);
    expect(statusCount()).toBe(settled);
    expect(settled).toBeLessThanOrEqual(15 * 15 + 1);
  });

  it('keeps going through a status read that gets no answer', async () => {
    const { element } = await openedPanel(n => (n === 1 ? undefined : { success: true, state: { windowOpen: true, connection: { state: 'connected', checkedAt: Date.now() } } }));
    await vi.advanceTimersByTimeAsync(POLL * 2);
    expect(chip(element)).toContain('연결됨');
  });
});

describe('main publish screen placement', () => {
  it('mounts under the Naver ID field with the value typed there, and refreshes when the ID changes', async () => {
    document.body.innerHTML = '<div id="grid"><input id="naver-id" value="typed-id"></div><div id="naver-connect-slot"></div>';
    accountConnectInstallMain(document); accountConnectInstallMain(document);
    await flush();
    expect(document.querySelectorAll('[data-role="account-connect"]')).toHaveLength(1);
    expect(api.accountSafety).toHaveBeenCalledTimes(1);
    expect(api.accountSafety).toHaveBeenCalledWith('typed-id', 'status', undefined, undefined, undefined, 'naver-id');
    const input = document.getElementById('naver-id') as HTMLInputElement;
    input.value = 'other-id'; input.dispatchEvent(new Event('change')); await flush();
    expect(api.accountSafety).toHaveBeenLastCalledWith('other-id', 'status', undefined, undefined, undefined, 'naver-id');
    expect(calls('check')).toHaveLength(0);
  });

  it('does nothing when the slot or the ID field is missing', () => {
    document.body.innerHTML = '<input id="naver-id">';
    accountConnectInstallMain(document);
    expect(document.querySelector('[data-role="account-connect"]')).toBeNull();
  });
});

describe('wiring', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
  const copyStatic = read('scripts', 'copy-static.mjs');
  const manifest = read('src', 'contentQualityV3', 'candidateRuntimeFingerprint.ts');
  const panelSource = read('src', 'renderer', 'modules', 'accountConnectPanel.ts');
  const html = read('public', 'index.html');

  it('is inlined before the account manage window that imports it', () => {
    const at = (name: string) => copyStatic.indexOf(`'${name}'`);
    expect(at('accountConnectPanel.js')).toBeGreaterThan(0);
    expect(at('accountConnectPanel.js')).toBeLessThan(at('accountManageWindow.js'));
  });

  it('is in the runtime closure manifest in alphabetical position', () => {
    const entry = "'src/renderer/modules/accountConnectPanel.ts'";
    expect(manifest).toContain(entry);
    expect(manifest.indexOf(entry)).toBeLessThan(manifest.indexOf("'src/renderer/modules/accountManageForm.ts'"));
  });

  it('keeps every top-level identifier prefixed so the single-scope bundle cannot collide', () => {
    const names = [...panelSource.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|const|let|class|type|interface)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    expect(names.length).toBeGreaterThan(8);
    expect(names.every(name => /^(accountConnect|AccountConnect|ACCOUNT_CONNECT)/.test(name))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has the slot right under the Naver ID field row of the publish screen', () => {
    const slot = html.indexOf('id="naver-connect-slot"');
    expect(slot).toBeGreaterThan(html.indexOf('id="naver-id"'));
    expect(slot - html.indexOf('id="naver-id"')).toBeLessThan(2500);
    expect(html.match(/id="naver-connect-slot"/g)).toHaveLength(1);
  });

  it('is shown on each account row of the account manage window (accounts with a Naver ID)', () => {
    const windowSource = read('src', 'renderer', 'modules', 'accountManageWindow.ts');
    expect(windowSource).toContain("from './accountConnectPanel.js'");
    expect(windowSource).toMatch(/accountConnectBuild\(\{ lookup: 'account'/);
  });
});
