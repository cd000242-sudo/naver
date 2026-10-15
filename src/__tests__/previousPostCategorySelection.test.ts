import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { selectCategoryInPublishModal } from '../automation/publishHelpers.js';

function fixture(categoryId: string | undefined, options: Record<string, unknown> = {}, fallbackOnly = false) {
  const window = new Window();
  window.document.body.innerHTML = '<button data-click-area="tpb*i.category" data-testid="seOneCategoryBtn">기본</button><ul class="option_list_layer"><li class="item"><span data-testid="categoryItemText_7">여행</span></li><li class="item"><span data-testid="categoryItemText_8">해외여행</span></li></ul>';
  if (fallbackOnly) {
    const categoryButton = window.document.querySelector('button')!;
    categoryButton.removeAttribute('data-click-area');
    categoryButton.removeAttribute('data-testid');
    categoryButton.className = 'category_selector';
    const confirm = window.document.createElement('button');
    confirm.setAttribute('data-testid', 'seOnePublishBtn');
    window.document.body.appendChild(confirm);
  }
  vi.stubGlobal('document', window.document);
  const button = window.document.querySelector('button')!;
  const handle = (el: any) => ({ el, click: async () => { if (el.tagName !== 'BUTTON') button.textContent = el.textContent; } });
  const frame = {
    $: async (selector: string) => { const el = window.document.querySelector(selector); return el ? handle(el) : null; },
    $$: async (selector: string) => [...window.document.querySelectorAll(selector)].map(handle),
    evaluate: async (fn: (...args: any[]) => any, ...args: any[]) => fn(...args.map(arg => arg?.el || arg)),
    click: async () => undefined,
  };
  const self = { options: { categoryName: '여행', categoryId, ...options }, log: vi.fn(), delay: async () => undefined, debugCategoryElements: vi.fn(), __verifiedPublicationCategoryId: 'old', __strictCategoryForPreviousPost: false };
  return { self, frame, button };
}
afterEach(() => vi.unstubAllGlobals());
describe('verified publication category selection', () => {
  it('returns only the clicked DOM ID after selected label verification', async () => {
    const { self, frame } = fixture('7');
    await selectCategoryInPublishModal(self, frame as any, frame as any);
    expect(self.__verifiedPublicationCategoryId).toBe('7');
  });
  it('verifies a fallback-only category button after selection', async () => {
    const { self, frame } = fixture('7', {}, true);
    await selectCategoryInPublishModal(self, frame as any, frame as any);
    expect(self.__verifiedPublicationCategoryId).toBe('7');
  });
  it('rejects an ID mismatch even when a fallback-only category button is found', async () => {
    const { self, frame } = fixture('8', {}, true);
    await expect(selectCategoryInPublishModal(self, frame as any, frame as any)).rejects.toThrow('CATEGORY_NOT_FOUND');
    expect(self.__verifiedPublicationCategoryId).toBeUndefined();
  });
  it('keeps name-only publication working and learns the DOM ID', async () => {
    const { self, frame } = fixture(undefined);
    await selectCategoryInPublishModal(self, frame as any, frame as any);
    expect(self.__verifiedPublicationCategoryId).toBe('7');
  });
  it('cannot silently fall back when the previous link requires the requested category', async () => {
    const { self, frame } = fixture('8', { allowCategoryFallback: true });
    self.__strictCategoryForPreviousPost = true;
    await expect(selectCategoryInPublishModal(self, frame as any, frame as any)).rejects.toThrow('CATEGORY_NOT_FOUND');
    expect(self.__verifiedPublicationCategoryId).toBeUndefined();
  });
  it('does not stamp metadata when category selection is absent or falls back', async () => {
    const { self, frame } = fixture('99', { allowCategoryFallback: true });
    await selectCategoryInPublishModal(self, frame as any, frame as any);
    expect(self.__verifiedPublicationCategoryId).toBeUndefined();
  });
});
