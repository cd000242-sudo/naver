// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { applyLdbDestination, verifyLdbDestination } from '../renderer/modules/ldbDestinationSelection.js';
import { getVerifiedRealBlogCategoryName } from '../renderer/utils/realBlogCategoryPolicy.js';
import { createLdbDraftReceiver } from '../renderer/modules/ldbDraftImport.js';
const destination = { accountId: 'a', categoryId: '2', categoryName: '실제 카테고리', categories: [{ id: '2', name: '실제 카테고리' }, { id: '3', name: '실제 카테고리' }] };
function dom() { document.body.innerHTML = '<select id="main-account-selector"><option value="a">계정</option></select><div id="real-category-dropdown-container" style="display:none"><select id="real-blog-category-select"></select></div>'; }
describe('LDB renderer destination', () => {
  it('awaits actual account application and selects actual category ID even if names match', async () => {
    dom(); const apply = vi.fn(async () => {});
    await applyLdbDestination({ ...destination, categoryId: '3' }, document, { applyLdbMainAccount: apply });
    const select = document.querySelector('#real-blog-category-select') as HTMLSelectElement;
    expect(apply).toHaveBeenCalledWith('a');
    expect(select.selectedOptions[0].dataset.realBlogCategoryId).toBe('3');
    expect(getVerifiedRealBlogCategoryName(select)).toBe('실제 카테고리');
    expect((document.querySelector('#main-account-selector') as HTMLSelectElement).disabled).toBe(false);
  });
  it('fails closed if selector or account callback is unavailable and on account mismatch', async () => {
    dom(); await expect(applyLdbDestination(destination, document, {})).rejects.toThrow();
    await expect(applyLdbDestination(destination, document, { applyLdbMainAccount: async () => { (document.querySelector('#main-account-selector') as HTMLSelectElement).value = ''; } })).rejects.toThrow();
    expect((document.querySelector('#real-blog-category-select') as HTMLSelectElement).options).toHaveLength(0);
  });
  it('rejects ACK when account changes during awaited article display', async () => {
    dom();
    const receive = createLdbDraftReceiver({ read: () => [], write: vi.fn(),
      applyDestination: value => applyLdbDestination(value, document, { applyLdbMainAccount: async () => {} }),
      verifyDestination: value => verifyLdbDestination(value, document),
      display: async () => { await Promise.resolve(); (document.querySelector('#main-account-selector') as HTMLSelectElement).value = ''; },
    });
    await expect(receive([{ id: 'ldb_test', title: '제목', content: '본문', publishMode: 'draft' }], destination)).rejects.toThrow();
  });
  it('does not modify article data on selection-only and validates drafts before changing account', async () => {
    const write = vi.fn(); const display = vi.fn(); const applyDestination = vi.fn(async () => {});
    const receive = createLdbDraftReceiver({ read: () => [], write, display, applyDestination });
    expect(await receive([], destination)).toBe(0);
    expect(write).not.toHaveBeenCalled(); expect(display).not.toHaveBeenCalled();
    await expect(receive([{ id: 'bad' }], destination)).rejects.toThrow();
    expect(applyDestination).toHaveBeenCalledTimes(1);
  });
});
