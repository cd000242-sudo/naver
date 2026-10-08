// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(__dirname, '../renderer/modules/multiAccountManager.ts'), 'utf8');
const ast = ts.createSourceFile('multiAccountManager.ts', source, ts.ScriptTarget.Latest, true);
const init = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'initMainAccountSelector')!;
const javascript = ts.transpileModule(init.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const accounts = [{ id: 'a', name: '첫 계정' }, { id: 'b', name: '다음 계정' }];
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

function initialize(api: any) {
  document.body.innerHTML = '<select id="main-account-selector"><option value="a" selected>첫 계정</option><option value="b">다음 계정</option></select><input id="naver-id"><input id="naver-password"><input id="unified-generated-title" value="보존할 제목"><textarea id="unified-generated-content">보존할 본문</textarea>';
  const view: any = { api };
  new Function('window', 'document', 'console', 'toastManager', `${javascript}; initMainAccountSelector();`)(view, document, { log: vi.fn(), warn: vi.fn(), error: vi.fn() }, { info: vi.fn() });
  return view;
}

describe('main account refresh and extension selection order', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('waits for the initial account list before applying an early extension selection', async () => {
    const first = deferred<any>();
    const api = {
      getAllBlogAccounts: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ success: true, accounts }),
      getAccountCredentials: vi.fn().mockResolvedValue({ success: true, credentials: { naverId: 'fixture-b', naverPassword: 'fixture-password' } }),
      setActiveBlogAccount: vi.fn().mockResolvedValue({ success: true }),
    };
    const view = initialize(api);
    await Promise.resolve();
    const selection = view.applyLdbMainAccount('b').then(() => null, (error: Error) => error.message);
    first.resolve({ success: true, accounts });
    expect(await selection).toBeNull();
    expect((document.getElementById('main-account-selector') as HTMLSelectElement).value).toBe('b');
    expect((document.getElementById('naver-id') as HTMLInputElement).value).toBe('fixture-b');
    expect((document.getElementById('unified-generated-content') as HTMLTextAreaElement).value).toBe('보존할 본문');
  });

  it('does not let a refresh restore the previous selector while credentials are being applied', async () => {
    const credentials = deferred<any>();
    const api = {
      getAllBlogAccounts: vi.fn().mockResolvedValue({ success: true, accounts }),
      getAccountCredentials: vi.fn().mockReturnValue(credentials.promise),
      setActiveBlogAccount: vi.fn().mockResolvedValue({ success: true }),
    };
    const view = initialize(api);
    await view.loadMainAccountList();
    const selection = view.applyLdbMainAccount('b').then(() => null, (error: Error) => error.message);
    await vi.waitFor(() => expect(api.getAccountCredentials).toHaveBeenCalledOnce());
    const refresh = view.loadMainAccountList();
    credentials.resolve({ success: true, credentials: { naverId: 'fixture-b', naverPassword: '' } });
    expect(await selection).toBeNull();
    await refresh;
    expect((document.getElementById('main-account-selector') as HTMLSelectElement).value).toBe('b');
    expect(api.setActiveBlogAccount).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('still rejects a deleted account and allows a later valid selection', async () => {
    const api = {
      getAllBlogAccounts: vi.fn().mockResolvedValue({ success: true, accounts }),
      getAccountCredentials: vi.fn().mockResolvedValue({ success: true, credentials: { naverId: 'fixture-b' } }),
      setActiveBlogAccount: vi.fn().mockResolvedValue({ success: true }),
    };
    const view = initialize(api);
    await view.loadMainAccountList();
    await expect(view.applyLdbMainAccount('deleted')).rejects.toThrow('삭제');
    expect(api.setActiveBlogAccount).not.toHaveBeenCalled();
    await expect(view.applyLdbMainAccount('b')).resolves.toBeUndefined();
    expect((document.getElementById('main-account-selector') as HTMLSelectElement).value).toBe('b');
  });

  it('recovers after a failed refresh and applies the next selection', async () => {
    const api = {
      getAllBlogAccounts: vi.fn().mockRejectedValueOnce(new Error('fixture refresh failed')).mockResolvedValue({ success: true, accounts }),
      getAccountCredentials: vi.fn().mockResolvedValue({ success: true, credentials: { naverId: 'fixture-b' } }),
      setActiveBlogAccount: vi.fn().mockResolvedValue({ success: true }),
    };
    const view = initialize(api);
    await expect(view.applyLdbMainAccount('b')).resolves.toBeUndefined();
    expect((document.getElementById('main-account-selector') as HTMLSelectElement).value).toBe('b');
    expect(api.setActiveBlogAccount).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('keeps a queued manual selection and refreshes readiness after restoring its draft', async () => {
    const first = deferred<any>();
    const api = {
      getAllBlogAccounts: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ success: true, accounts }),
      getAccountCredentials: vi.fn().mockResolvedValue({ success: true, credentials: { naverId: 'fixture-b' } }),
      setActiveBlogAccount: vi.fn().mockResolvedValue({ success: true }),
    };
    const view = initialize(api);
    const readiness: boolean[] = [];
    view.updatePublishButtonVisibility = () => readiness.push(Boolean(
      (document.getElementById('unified-generated-title') as HTMLInputElement).value
      && (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value,
    ));
    await Promise.resolve();
    const selector = document.getElementById('main-account-selector') as HTMLSelectElement;
    selector.value = 'b';
    selector.dispatchEvent(new Event('change'));
    first.resolve({ success: true, accounts });
    await view.loadMainAccountList();
    expect.soft(selector.value).toBe('b');
    expect(api.setActiveBlogAccount).toHaveBeenCalledExactlyOnceWith('b');
    expect((document.getElementById('unified-generated-content') as HTMLTextAreaElement).value).toBe('보존할 본문');
    expect(readiness.at(-1)).toBe(true);
  });
});
