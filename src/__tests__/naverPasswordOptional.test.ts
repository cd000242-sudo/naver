/**
 * The Naver password is optional: automatic jobs never type it (the user logs in on the Naver window), so an
 * account identified by its Naver ID must publish, schedule and switch without a saved password — and must
 * never be swapped for another account because its password is missing.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BlogAccountManager } from '../account/blogAccountManager';
import { injectDependencies, resolveAccount } from '../main/services/BlogExecutor';
import { resolveScheduledAccountCredentials } from '../scheduler/scheduledAccountResolver';

const read = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');

describe('account manager', () => {
  it('returns the Naver ID for an account without a saved password', () => {
    const manager = new BlogAccountManager();
    const account = manager.addAccount('별명', 'blog-a', 'naver-a');
    expect(manager.getAccountCredentials(account.id)).toEqual({ naverId: 'naver-a', naverPassword: '' });
  });

  it('still returns null for an account without a Naver ID', () => {
    const manager = new BlogAccountManager();
    const account = manager.addAccount('별명', 'blog-a');
    expect(manager.getAccountCredentials(account.id)).toBeNull();
  });

  it('an empty password field keeps the saved password; only the explicit clear option removes it', () => {
    const manager = new BlogAccountManager();
    const account = manager.addAccount('별명', 'blog-a', 'naver-a', 'secret-1');
    manager.updateAccountCredentials(account.id, 'naver-a', '');
    expect(manager.getAccountCredentials(account.id)?.naverPassword).toBe('secret-1');
    manager.updateAccountCredentials(account.id, 'naver-a', 'secret-2');
    expect(manager.getAccountCredentials(account.id)?.naverPassword).toBe('secret-2');
    manager.updateAccountCredentials(account.id, 'naver-a', '', true);
    expect(manager.getAccountCredentials(account.id)).toEqual({ naverId: 'naver-a', naverPassword: '' });
  });
});

describe('publish account resolution', () => {
  it('keeps the chosen Naver ID instead of rotating to another account when no password is given', async () => {
    const getNextAccountForPublish = vi.fn(() => ({ id: 'other', name: '다른 계정' }));
    injectDependencies({ blogAccountManager: { getNextAccountForPublish, getAccountCredentials: vi.fn(() => ({ naverId: 'other-id', naverPassword: 'x' })), getActiveAccount: vi.fn() } } as any);
    expect(await resolveAccount({ naverId: 'chosen-id' } as any, {} as any)).toEqual({ naverId: 'chosen-id', naverPassword: '' });
    expect(await resolveAccount({} as any, { naverId: 'ctx-id', accountId: 'acc-1' } as any)).toEqual({ naverId: 'ctx-id', naverPassword: '', accountId: 'acc-1' });
    expect(getNextAccountForPublish).not.toHaveBeenCalled();
  });
});

describe('scheduled account resolution', () => {
  const accounts = [{ id: 'account-a', naverId: 'naver-a', blogId: 'blog-a' }];

  it('publishes a queued account that has no saved password', () => {
    expect(resolveScheduledAccountCredentials({
      scheduledAccountId: 'account-a', scheduledNaverId: 'naver-a', accounts,
      getCredentials: () => ({ naverId: 'naver-a', naverPassword: '' }),
    })).toEqual({ accountId: 'account-a', naverId: 'naver-a', naverPassword: '', source: 'account-manager' });
  });

  it('a legacy schedule uses the configured ID alone', () => {
    expect(resolveScheduledAccountCredentials({ configuredNaverId: 'naver-a', accounts, getCredentials: () => null }))
      .toEqual({ naverId: 'naver-a', naverPassword: '', source: 'legacy-config' });
  });

  it('still fails closed for a different account', () => {
    expect(() => resolveScheduledAccountCredentials({
      scheduledAccountId: 'missing', scheduledNaverId: 'naver-b', configuredNaverId: 'naver-a', accounts, getCredentials: () => null,
    })).toThrow(/SCHEDULED_ACCOUNT_UNAVAILABLE/);
  });
});

describe('renderer and main gates no longer require the password', () => {
  it.each([
    ['src/renderer/modules/formAndAutomation.ts', '네이버 아이디와 비밀번호를 입력해주세요.'],
    ['src/renderer/modules/fullAutoFlow.ts', '네이버 아이디와 비밀번호가 설정되지 않았습니다.'],
    ['src/renderer/renderer.ts', '네이버 아이디와 비밀번호를 먼저 입력하거나 저장해주세요.'],
    ['src/renderer/modules/multiAccountManager.ts', '필수 항목(별명, 네이버 ID, 비밀번호)을 모두 입력해주세요.'],
    ['src/renderer/modules/multiAccountManager.ts', '!credentials.credentials?.naverPassword'],
    ['src/main/services/BlogExecutor.ts', '네이버 아이디와 비밀번호를 입력해주세요.'],
    ['src/main.ts', "if (!naverId || !naverPassword) {\n      throw new Error('네이버 계정 정보가 설정되지 않았습니다.');"],
  ])('%s drops the old password gate', (file, oldGate) => {
    expect(read(...file.split('/')).replace(/\r\n/g, '\n')).not.toContain(oldGate);
  });

  it('the edit form offers "저장된 비밀번호 지우기" only when editing and sends the explicit flag', () => {
    const ui = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    expect(ui).toContain("await window.api.updateAccountCredentials(accountId, naverId, clearPassword ? '' : naverPw, clearPassword);");
    expect(ui).toMatch(/setEditClearPasswordOption\(true\)/);
    expect(ui).toMatch(/setEditClearPasswordOption\(false\)/);
    expect(read('public', 'index.html')).toContain('id="ma-edit-clear-pw"');
    expect(read('src', 'preload.ts')).toContain("ipcRenderer.invoke('account:updateCredentials', accountId, naverId, naverPassword, clearPassword === true)");
  });

  it('the settings sync keeps sending only accounts that have a saved password', () => {
    expect(read('src', 'renderer', 'modules', 'accountSettingsManager.ts')).toContain('credResult.credentials?.naverPassword');
  });

  it('the FAQ no longer claims nothing is sent to the server', () => {
    const faq = read('src', 'agents', 'knowledge', 'faq.ts');
    expect(faq).not.toContain('서버로 개인정보가 전송되지 않음');
    expect(faq).not.toContain('네이버 비밀번호는 저장되지 않음');
    expect(faq).toContain('라이선스 서버에 전송될 수 있습니다');
  });
});
