import { describe, it, expect, vi } from 'vitest';
import { createLdbDestinations } from '../main/ldb-destinations.js';
const account = { id: 'a', name: '계정', blogId: 'blog', naverPassword: 'SECRET', naverId: 'PRIVATE', settings: { proxyPassword: 'SECRET' } };
function fixture() {
  const deliver = vi.fn(async () => 1);
  const deps = { accounts: () => [account], active: () => account, fetchCategories: vi.fn(async () => ({ success: true, categories: [{ id: '2', name: '실제 카테고리', password: 'SECRET' }] })), deliver };
  return { service: createLdbDestinations(deps), deps, deliver };
}
describe('LDB destination bridge', () => {
  it('returns only public account and real category fields', async () => {
    const { service } = fixture();
    expect(service.accounts()).toEqual({ accounts: [{ id: 'a', label: '계정', blogId: 'blog' }], activeAccountId: 'a' });
    expect(await service.categories('a')).toEqual({ accountId: 'a', categories: [{ id: '2', name: '실제 카테고리' }] });
  });
  it('uses the same saved login ID as the app when blogId contains a display label', async () => {
    const { service, deps } = fixture();
    deps.accounts = () => [{ ...account, blogId: '연예 이슈', naverId: ' saved_login ' }];
    await service.categories('a');
    expect(deps.fetchCategories).toHaveBeenCalledWith('saved_login');
    expect(service.accounts().accounts[0]).toEqual({ id: 'a', label: '계정', blogId: '연예 이슈' });
    expect(JSON.stringify(service.accounts())).not.toContain('saved_login');
  });
  it('keeps legacy blog ID lookup for accounts without a saved login ID', async () => {
    const { service, deps } = fixture();
    deps.accounts = () => [{ ...account, blogId: ' legacy_blog ', naverId: ' ' }];
    await service.categories('a');
    expect(deps.fetchCategories).toHaveBeenCalledWith('legacy_blog');
  });
  it('rejects a login ID changed in place while its categories are loading', async () => {
    const { service, deps, deliver } = fixture();
    const mutable = { ...account, blogId: '표시 이름', naverId: 'before_login' };
    deps.accounts = () => [mutable];
    deps.fetchCategories.mockImplementation(async () => {
      mutable.naverId = 'after_login';
      return { success: true, categories: [{ id: '2', name: '실제', password: '' }] };
    });
    await expect(service.select({ accountId: 'a', categoryId: '2' })).rejects.toThrow();
    expect(deliver).not.toHaveBeenCalled();
  });
  it('rejects unknown accounts, missing categories, and synthetic fallback', async () => {
    const { service, deps, deliver } = fixture();
    await expect(service.select({ accountId: 'wrong', categoryId: '2' })).rejects.toThrow();
    await expect(service.send([{}], { accountId: 'a', categoryId: '3' })).rejects.toThrow();
    deps.fetchCategories.mockResolvedValue({ success: true, categories: [{ id: '0', name: '전체', password: '' }] });
    await expect(service.categories('a')).rejects.toThrow();
    expect(deliver).not.toHaveBeenCalled();
  });
  it('passes freshly validated selection in the same delivery and awaits acknowledgement', async () => {
    const { service, deliver } = fixture();
    await expect(service.send([{ title: '원고' }], { accountId: 'a', categoryId: '2' })).resolves.toEqual({ imported: 1, selection: { accountId: 'a', categoryId: '2' } });
    expect(deliver).toHaveBeenCalledWith([{ title: '원고' }], { accountId: 'a', categoryId: '2', categoryName: '실제 카테고리', categories: [{ id: '2', name: '실제 카테고리' }] });
    deliver.mockRejectedValue(new Error('ACK missing'));
    await expect(service.select({ accountId: 'a', categoryId: '2' })).rejects.toThrow('ACK missing');
  });
  it('serializes selection and delivery and preserves legacy payloads', async () => {
    const { service, deliver } = fixture();
    const order: string[] = [];
    deliver.mockImplementation(async (_posts: any, destination: any) => { order.push(destination?.categoryId || 'legacy'); await Promise.resolve(); return 1; });
    await Promise.all([service.select({ accountId: 'a', categoryId: '2' }), service.send([{}])]);
    expect(order).toEqual(['2', 'legacy']);
  });
  it('rejects category names the legacy publisher cannot distinguish', async () => {
    const { service, deps, deliver } = fixture();
    deps.fetchCategories.mockResolvedValue({ success: true, categories: [{ id: '2', name: 'A-B', password: '' }, { id: '3', name: ' └ AB', password: '' }] });
    await expect(service.select({ accountId: 'a', categoryId: '2' })).rejects.toThrow();
    expect(deliver).not.toHaveBeenCalled();
  });
  it('rechecks account existence after category fetch', async () => {
    const { service, deps, deliver } = fixture();
    deps.fetchCategories.mockImplementation(async () => { deps.accounts = () => []; return { success: true, categories: [{ id: '2', name: '실제', password: '' }] }; });
    await expect(service.select({ accountId: 'a', categoryId: '2' })).rejects.toThrow();
    expect(deliver).not.toHaveBeenCalled();
  });
});

it('queries a configured blog ID when it differs from the login ID', async () => {
 const {service,deps}=fixture(); await service.categories('a');
 expect(deps.fetchCategories).toHaveBeenCalledWith('blog');
});
