// @vitest-environment happy-dom
/**
 * The edit form inside the account management window: same two calls the multi-account edit form makes
 * (updateBlogAccount, then updateAccountCredentials), a blank password keeps the saved one, and the app
 * never types a password into Naver by itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountManageBuildForm } from '../renderer/modules/accountManageForm';

const account = { id: 'a1', name: '메인 블로그', blogId: 'leader_248', naverId: 'main-id' };
const api = { updateBlogAccount: vi.fn(), updateAccountCredentials: vi.fn() };
const onSaved = vi.fn();
const onCancel = vi.fn();
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const press = async (action: string) => { document.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!.click(); await settle(); };
const errorText = () => document.getElementById('account-manage-form-error')?.textContent || '';

function mount(source: Record<string, unknown> = account) {
  document.body.append(accountManageBuildForm(source as typeof account, { onSaved, onCancel }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  api.updateBlogAccount.mockReset().mockResolvedValue({ success: true });
  api.updateAccountCredentials.mockReset().mockResolvedValue({ success: true });
  onSaved.mockReset(); onCancel.mockReset();
  (window as unknown as { api: typeof api }).api = api;
});

describe('accountManageBuildForm layout', () => {
  it('pre-fills 별명, 블로그 주소 and 네이버 아이디 and leaves the password empty', () => {
    mount();
    expect(field('account-manage-name').value).toBe('메인 블로그');
    expect(field('account-manage-blog').value).toBe('leader_248');
    expect(field('account-manage-naver-id').value).toBe('main-id');
    expect(field('account-manage-password').value).toBe('');
    expect(field('account-manage-password').type).toBe('password');
    expect(field('account-manage-password').getAttribute('autocomplete')).toBe('new-password');
  });

  it('labels every field and explains the password rules', () => {
    mount();
    for (const id of ['account-manage-name', 'account-manage-blog', 'account-manage-naver-id', 'account-manage-password', 'account-manage-clear-pw']) {
      expect(document.querySelector(`label[for="${id}"]`), id).not.toBeNull();
    }
    expect(document.body.textContent).toContain('앱은 비밀번호를 자동으로 입력하지 않습니다. 비밀번호를 바꾸셨다면 다음 발행 때 열리는 네이버 창에서 한 번 직접 로그인해 주세요.');
    expect(document.querySelector('label[for="account-manage-clear-pw"]')!.textContent).toContain('저장된 비밀번호 지우기');
    expect(field('account-manage-password').placeholder).toContain('비워 두면');
  });

  it('shows an empty blog address when the saved value is only a legacy label or missing', () => {
    mount({ ...account, blogId: '별명 호환 검사' });
    expect(field('account-manage-blog').value).toBe('');
    document.body.innerHTML = '';
    mount({ ...account, blogId: undefined });
    expect(field('account-manage-blog').value).toBe('');
  });
});

describe('accountManageBuildForm save', () => {
  it('saves name + blog first, then the Naver ID; a blank password keeps the saved one', async () => {
    mount();
    field('account-manage-name').value = '  새 별명 ';
    field('account-manage-blog').value = ' https://blog.naver.com/New_Blog ';
    field('account-manage-naver-id').value = ' main-id ';
    await press('save');
    expect(api.updateBlogAccount).toHaveBeenCalledWith('a1', { name: '새 별명', blogId: 'https://blog.naver.com/New_Blog' });
    expect(api.updateAccountCredentials).toHaveBeenCalledWith('a1', 'main-id', '', false);
    expect(api.updateBlogAccount.mock.invocationCallOrder[0]).toBeLessThan(api.updateAccountCredentials.mock.invocationCallOrder[0]);
    expect(onSaved).toHaveBeenCalledWith({ name: '새 별명', naverId: 'main-id', password: '', clearedPassword: false });
  });

  it('sends a newly typed password as typed (no trimming) and never clears', async () => {
    mount();
    field('account-manage-password').value = ' new pass ';
    await press('save');
    expect(api.updateAccountCredentials).toHaveBeenCalledWith('a1', 'main-id', ' new pass ', false);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ password: ' new pass ', clearedPassword: false }));
  });

  it('"저장된 비밀번호 지우기" clears the saved password and ignores anything typed', async () => {
    mount();
    field('account-manage-password').value = 'typed';
    const clear = field('account-manage-clear-pw');
    clear.checked = true; clear.dispatchEvent(new Event('change', { bubbles: true }));
    expect(field('account-manage-password').disabled).toBe(true);
    await press('save');
    expect(api.updateAccountCredentials).toHaveBeenCalledWith('a1', 'main-id', '', true);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ password: '', clearedPassword: true }));
  });

  it('keeps an unchanged legacy blog value as it was instead of overwriting it with an empty one', async () => {
    mount({ ...account, blogId: '별명 호환 검사' });
    await press('save');
    expect(api.updateBlogAccount).toHaveBeenCalledWith('a1', { name: '메인 블로그', blogId: '별명 호환 검사' });
  });

  it('lets the owner clear the blog address on purpose', async () => {
    mount();
    field('account-manage-blog').value = '   ';
    await press('save');
    expect(api.updateBlogAccount).toHaveBeenCalledWith('a1', { name: '메인 블로그', blogId: '' });
  });

  it('accepts a bare blog id, a blog.naver.com address and a mobile address', async () => {
    for (const value of ['abc_12-x', 'blog.naver.com/abc', 'https://m.blog.naver.com/abc/223344', 'https://blog.naver.com/PostView.naver?blogId=abc']) {
      document.body.innerHTML = ''; api.updateBlogAccount.mockClear();
      mount(); field('account-manage-blog').value = value; await press('save');
      expect(api.updateBlogAccount, value).toHaveBeenCalledWith('a1', { name: '메인 블로그', blogId: value });
    }
  });

  it.each([
    ['name', '', '별명을 입력해 주세요.'],
    ['naver-id', '   ', '네이버 아이디를 입력해 주세요.'],
    ['blog', 'https://example.com/abc', '블로그 주소를 확인해 주세요.'],
    ['blog', '한글 주소', '블로그 주소를 확인해 주세요.'],
  ])('refuses to save when %s is %j', async (key, value, message) => {
    mount(); field(`account-manage-${key}`).value = value;
    await press('save');
    expect(errorText()).toContain(message);
    expect(api.updateBlogAccount).not.toHaveBeenCalled();
    expect(api.updateAccountCredentials).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('stops at the first failed call, shows its reason and keeps the form open', async () => {
    api.updateBlogAccount.mockResolvedValue({ success: false, message: '업데이트 실패: 디스크 오류' });
    mount(); await press('save');
    expect(errorText()).toContain('디스크 오류');
    expect(api.updateAccountCredentials).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.getElementById('account-manage-form')).not.toBeNull();
  });

  it('reports a credentials failure and a thrown error in Korean', async () => {
    api.updateAccountCredentials.mockResolvedValue({ success: false });
    mount(); await press('save');
    expect(errorText()).toContain('저장하지 못했습니다');
    api.updateAccountCredentials.mockRejectedValue(new Error('ipc down'));
    await press('save');
    expect(errorText()).toContain('저장 중 오류가 발생했습니다');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('ignores a second click while a save is running', async () => {
    let release: (value: { success: boolean }) => void = () => undefined;
    api.updateBlogAccount.mockReturnValue(new Promise(resolve => { release = resolve; }));
    mount();
    document.querySelector<HTMLButtonElement>('button[data-action="save"]')!.click();
    document.querySelector<HTMLButtonElement>('button[data-action="save"]')!.click();
    expect(api.updateBlogAccount).toHaveBeenCalledTimes(1);
    release({ success: true }); await settle();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('saves with Enter in a text field and cancels with the cancel button', async () => {
    mount();
    field('account-manage-name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
    expect(api.updateBlogAccount).toHaveBeenCalledTimes(1);
    await press('cancel');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
