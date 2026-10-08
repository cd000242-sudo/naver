// @vitest-environment happy-dom
/**
 * The account management window: one list of every saved publishing account (별명, 네이버 아이디, 블로그 주소,
 * safety status) with [수정] / [삭제] and, for a stopped account, [풀기]. Saving or deleting refreshes the account
 * dropdown and lists through the app's existing refresh functions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountManageInstallButtons, accountManageOpen } from '../renderer/modules/accountManageWindow';

const main = { id: 'a1', name: '메인 블로그', blogId: 'leader_248', naverId: 'main-id', naverPassword: 'encrypted' };
const sub = { id: 'a2', name: '서브 계정', blogId: '', naverId: 'sub-id' };
const legacy = { id: 'a3', name: '옛 계정', blogId: '별명 호환 검사', naverId: 'old-id' };
const noId = { id: 'a4', name: '아이디 없음', blogId: 'x_blog' };
const ready = { paused: false, busy: false, version: 3, label: '중단 없음 · 로그인은 실행 시 확인' };
const stopped = { paused: true, busy: false, version: 9, code: 'LOGIN_REQUIRED', label: '네이버 로그인 필요' };

let store: Array<Record<string, unknown>>;
let states: Record<string, unknown>;
const api = {
  getAllBlogAccounts: vi.fn(), updateBlogAccount: vi.fn(), updateAccountCredentials: vi.fn(),
  removeBlogAccount: vi.fn(), accountSafety: vi.fn(),
};
const refreshAll = vi.fn();
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const dialog = () => document.getElementById('account-manage-window');
const rows = () => [...document.querySelectorAll<HTMLElement>('#account-manage-window [data-account-id]')];
const row = (id: string) => document.querySelector<HTMLElement>(`#account-manage-window [data-account-id="${id}"]`)!;
const act = (id: string, action: string) => row(id).querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
const notice = () => document.getElementById('account-manage-notice')?.textContent || '';
const open = async () => { await accountManageOpen(); await settle(); };

beforeEach(() => {
  document.body.innerHTML = '';
  store = [{ ...main }, { ...sub }];
  states = { 'sub-id': stopped };
  api.getAllBlogAccounts.mockReset().mockImplementation(async () => ({ success: true, accounts: store.map(a => ({ ...a })) }));
  api.updateBlogAccount.mockReset().mockImplementation(async (id: string, updates: Record<string, unknown>) => {
    store = store.map(a => (a.id === id ? { ...a, ...updates } : a)); return { success: true };
  });
  api.updateAccountCredentials.mockReset().mockImplementation(async (id: string, naverId: string) => {
    store = store.map(a => (a.id === id ? { ...a, naverId } : a)); return { success: true };
  });
  api.removeBlogAccount.mockReset().mockImplementation(async (id: string) => { store = store.filter(a => a.id !== id); return { success: true }; });
  api.accountSafety.mockReset().mockImplementation(async (id: string, _action: string, _v?: number, _o?: string, _t?: string, lookup?: string) => {
    const key = lookup === 'naver-id' ? id : (store.find(a => a.id === id)?.naverId as string);
    return { success: true, state: states[key] ?? ready };
  });
  refreshAll.mockReset().mockResolvedValue(undefined);
  Object.assign(window, { api, refreshAllAccountLists: refreshAll });
  window.confirm = vi.fn().mockReturnValue(true);
});
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('list', () => {
  it('opens an accessible dialog with one row per saved account', async () => {
    await open();
    expect(dialog()!.getAttribute('role')).toBe('dialog');
    expect(dialog()!.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog()!.getAttribute('aria-labelledby')!)!.textContent).toContain('계정 관리');
    expect(rows().map(r => r.dataset.accountId)).toEqual(['a1', 'a2']);
    const first = row('a1').textContent!;
    expect(first).toContain('메인 블로그'); expect(first).toContain('main-id'); expect(first).toContain('leader_248');
    expect(first).not.toContain('encrypted');
  });

  it('says the blog is confirmed on the first publish when the account has none (or only an old label)', async () => {
    store = [{ ...sub }, { ...legacy }];
    await open();
    expect(row('a2').textContent).toContain('첫 발행 때 자동 확인');
    expect(row('a3').textContent).toContain('첫 발행 때 자동 확인');
    expect(row('a3').textContent).not.toContain('별명 호환 검사');
    expect(row('a2').textContent).toContain('sub-id');
  });

  it('shows the safety status of each account: 정상, or 멈춤 with the reason in Korean', async () => {
    await open();
    expect(api.accountSafety).toHaveBeenCalledWith('a1', 'status');
    expect(api.accountSafety).toHaveBeenCalledWith('a2', 'status');
    expect(row('a1').querySelector('[data-role="status"]')!.textContent).toBe('정상');
    expect(row('a2').querySelector('[data-role="status"]')!.textContent).toBe('멈춤 · 네이버 로그인 필요');
  });

  it.each([
    ['a failed reply', async () => ({ success: false, message: 'x' })],
    ['a thrown error', async () => { throw new Error('ipc down'); }],
  ])('shows 확인 불가 (not 정상) for %s', async (_name, impl) => {
    api.accountSafety.mockImplementation(impl);
    await open();
    expect(row('a1').querySelector('[data-role="status"]')!.textContent).toContain('확인 불가');
    expect(act('a1', 'resolve')).toBeNull();
  });

  it('does not ask for a status when the account has no Naver ID', async () => {
    store = [{ ...noId }];
    await open();
    expect(api.accountSafety).not.toHaveBeenCalled();
    expect(row('a4').textContent).toContain('네이버 아이디를 저장하면');
  });

  it('shows the empty state with the way to add the first account', async () => {
    store = [];
    await open();
    expect(rows()).toHaveLength(0);
    expect(dialog()!.textContent).toContain('저장된 계정이 없습니다. [➕ 계정 추가]로 먼저 추가해 주세요.');
  });

  it('says so when the account list cannot be read', async () => {
    api.getAllBlogAccounts.mockResolvedValue({ success: false, message: '조회 실패' });
    await open();
    expect(rows()).toHaveLength(0);
    expect(dialog()!.textContent).toContain('계정 목록을 불러오지 못했습니다.');
  });
});

describe('open and close', () => {
  it('opens only one window however often the button is pressed', async () => {
    await open(); await open();
    expect(document.querySelectorAll('#account-manage-window')).toHaveLength(1);
  });

  it('closes with ×, Escape and a click outside the panel, and hands the focus back', async () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    await open();
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    dialog()!.querySelector<HTMLButtonElement>('button[data-action="close"]')!.click();
    expect(dialog()).toBeNull(); expect(document.activeElement).toBe(opener);
    await open(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dialog()).toBeNull();
    await open(); dialog()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog()).toBeNull();
  });

  it('keeps the window when the click lands inside the panel', async () => {
    await open();
    row('a1').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog()).not.toBeNull();
  });

  it('keeps Tab inside the window', async () => {
    await open();
    const focusable = [...dialog()!.querySelectorAll<HTMLElement>('button:not([disabled])')];
    focusable.at(-1)!.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusable[0]);
  });
});

describe('edit', () => {
  it('opens the form for the chosen account and saves through the two existing calls', async () => {
    await open();
    act('a1', 'edit')!.click(); await settle();
    expect((document.getElementById('account-manage-name') as HTMLInputElement).value).toBe('메인 블로그');
    expect(rows()).toHaveLength(0);
    (document.getElementById('account-manage-name') as HTMLInputElement).value = '새 별명';
    (document.getElementById('account-manage-blog') as HTMLInputElement).value = 'https://blog.naver.com/new_blog';
    document.querySelector<HTMLButtonElement>('button[data-action="save"]')!.click(); await settle();
    expect(api.updateBlogAccount).toHaveBeenCalledWith('a1', { name: '새 별명', blogId: 'https://blog.naver.com/new_blog' });
    expect(api.updateAccountCredentials).toHaveBeenCalledWith('a1', 'main-id', '', false);
    expect(document.getElementById('account-manage-form')).toBeNull();
    expect(row('a1').textContent).toContain('새 별명');
    expect(notice()).toContain('저장했습니다');
  });

  it('refreshes the existing account dropdown and lists after a save', async () => {
    await open();
    act('a1', 'edit')!.click(); await settle();
    document.querySelector<HTMLButtonElement>('button[data-action="save"]')!.click(); await settle();
    expect(refreshAll).toHaveBeenCalledTimes(1);
  });

  it('falls back to the single refresh functions when refreshAllAccountLists is missing', async () => {
    delete (window as unknown as Record<string, unknown>).refreshAllAccountLists;
    const main$ = vi.fn().mockResolvedValue(undefined); const inline = vi.fn().mockResolvedValue(undefined);
    Object.assign(window, { loadMainAccountList: main$, renderInlineAccountList: inline });
    await open();
    act('a1', 'edit')!.click(); await settle();
    document.querySelector<HTMLButtonElement>('button[data-action="save"]')!.click(); await settle();
    expect(main$).toHaveBeenCalledTimes(1); expect(inline).toHaveBeenCalledTimes(1);
  });

  it('keeps the main screen Naver ID in step when the selected account is the one edited', async () => {
    document.body.innerHTML = '<select id="main-account-selector"><option value="">직접 입력</option><option value="a1">메인</option></select><input id="naver-id" value="main-id"><input id="naver-password" value="old-pass"><span id="selected-account-name">메인 블로그</span>';
    (document.getElementById('main-account-selector') as HTMLSelectElement).value = 'a1';
    await open();
    act('a1', 'edit')!.click(); await settle();
    (document.getElementById('account-manage-name') as HTMLInputElement).value = '새 별명';
    (document.getElementById('account-manage-naver-id') as HTMLInputElement).value = 'changed-id';
    (document.getElementById('account-manage-password') as HTMLInputElement).value = 'new-pass';
    document.querySelector<HTMLButtonElement>('button[data-action="save"]')!.click(); await settle();
    expect((document.getElementById('naver-id') as HTMLInputElement).value).toBe('changed-id');
    expect((document.getElementById('naver-password') as HTMLInputElement).value).toBe('new-pass');
    expect(document.getElementById('selected-account-name')!.textContent).toBe('새 별명');
  });

  it('leaves the main screen alone when another account is selected there', async () => {
    document.body.innerHTML = '<select id="main-account-selector"><option value="">직접 입력</option><option value="a2">서브</option></select><input id="naver-id" value="sub-id"><input id="naver-password" value="p">';
    (document.getElementById('main-account-selector') as HTMLSelectElement).value = 'a2';
    await open();
    act('a1', 'edit')!.click(); await settle();
    (document.getElementById('account-manage-naver-id') as HTMLInputElement).value = 'changed-id';
    document.querySelector<HTMLButtonElement>('button[data-action="save"]')!.click(); await settle();
    expect((document.getElementById('naver-id') as HTMLInputElement).value).toBe('sub-id');
    expect((document.getElementById('naver-password') as HTMLInputElement).value).toBe('p');
  });

  it('goes back to the list without saving when the form is cancelled', async () => {
    await open();
    act('a1', 'edit')!.click(); await settle();
    document.querySelector<HTMLButtonElement>('button[data-action="cancel"]')!.click(); await settle();
    expect(rows()).toHaveLength(2);
    expect(api.updateBlogAccount).not.toHaveBeenCalled();
    expect(refreshAll).not.toHaveBeenCalled();
  });

  it('Escape in the form closes the whole window', async () => {
    await open();
    act('a1', 'edit')!.click(); await settle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dialog()).toBeNull();
  });
});

describe('delete', () => {
  it('asks first and does nothing when the owner says no', async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    await open();
    act('a1', 'delete')!.click(); await settle();
    expect(window.confirm).toHaveBeenCalledWith('이 계정을 삭제할까요? 발행 기록은 지워지지 않습니다.');
    expect(api.removeBlogAccount).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(2);
  });

  it('removes the account, refreshes the app lists and shows the empty state after the last one', async () => {
    store = [{ ...main }];
    await open();
    act('a1', 'delete')!.click(); await settle();
    expect(api.removeBlogAccount).toHaveBeenCalledWith('a1');
    expect(refreshAll).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(0);
    expect(notice()).toContain('삭제했습니다');
    expect(dialog()!.textContent).toContain('저장된 계정이 없습니다.');
  });

  it('keeps the row and says why when the removal fails', async () => {
    api.removeBlogAccount.mockResolvedValue({ success: false, message: '삭제 실패: 잠금' });
    await open();
    act('a1', 'delete')!.click(); await settle();
    expect(rows()).toHaveLength(2);
    expect(notice()).toContain('삭제 실패: 잠금');
    expect(refreshAll).not.toHaveBeenCalled();
  });
});

describe('stopped account', () => {
  it('offers [풀기] only for a stopped account and opens the in-place pause panel for its Naver ID', async () => {
    await open();
    expect(act('a1', 'resolve')).toBeNull();
    expect(act('a2', 'resolve')!.textContent).toBe('풀기');
    act('a2', 'resolve')!.click(); await settle();
    const panel = document.getElementById('account-pause-modal')!;
    expect(panel).not.toBeNull();
    expect(panel.dataset.naverId).toBe('sub-id');
    expect(panel.dataset.code).toBe('LOGIN_REQUIRED');
    expect(api.accountSafety).toHaveBeenCalledWith('sub-id', 'status', undefined, undefined, undefined, 'naver-id');
  });

  it('re-reads the statuses once the pause panel is closed', async () => {
    await open();
    act('a2', 'resolve')!.click(); await settle();
    states['sub-id'] = ready;
    document.querySelector<HTMLButtonElement>('#account-pause-modal button[data-action="close"]')!.click(); await settle();
    expect(row('a2').querySelector('[data-role="status"]')!.textContent).toBe('정상');
    expect(act('a2', 'resolve')).toBeNull();
  });

  it('Escape closes only the pause panel while it is on top', async () => {
    await open();
    act('a2', 'resolve')!.click(); await settle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('account-pause-modal')).toBeNull();
    expect(dialog()).not.toBeNull();
  });
});

describe('manage buttons', () => {
  it('opens the window from both buttons, and binding twice does not double up', async () => {
    document.body.innerHTML = '<button id="main-manage-accounts-btn">a</button><button id="ma-manage-accounts-inline">b</button>';
    accountManageInstallButtons(); accountManageInstallButtons();
    document.getElementById('main-manage-accounts-btn')!.click(); await settle();
    expect(dialog()).not.toBeNull();
    expect(api.getAllBlogAccounts).toHaveBeenCalledTimes(1);
    dialog()!.querySelector<HTMLButtonElement>('button[data-action="close"]')!.click();
    document.getElementById('ma-manage-accounts-inline')!.click(); await settle();
    expect(dialog()).not.toBeNull();
    expect(api.getAllBlogAccounts).toHaveBeenCalledTimes(2);
  });
});
