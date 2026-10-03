import { markRealBlogCategoryOption } from '../utils/realBlogCategoryPolicy.js';
interface Selection { accountId: string; categoryId: string; categoryName: string; categories: { id: string; name: string }[] }
/** 앱의 실제 선택기와 자격증명 처리 경로를 사용한다. 자격증명은 렌더러 밖으로 반환하지 않는다. */
export async function applyLdbDestination(selected: Selection, doc: Document, view: { applyLdbMainAccount?: (id: string) => Promise<void> }): Promise<void> {
  const accounts = doc.getElementById('main-account-selector') as HTMLSelectElement | null;
  const category = doc.getElementById('real-blog-category-select') as HTMLSelectElement | null;
  if (!accounts || !category || !view.applyLdbMainAccount) throw new Error('계정·카테고리 화면이 준비되지 않았습니다.');
  const match = selected.categories?.find(item => item.id === selected.categoryId && item.name === selected.categoryName);
  if (!match) throw new Error('실제 카테고리를 확인하지 못했습니다.');
  const wasDisabled = accounts.disabled;
  accounts.disabled = true;
  try {
    await view.applyLdbMainAccount(selected.accountId);
    if (accounts.value !== selected.accountId) throw new Error('앱의 계정 선택이 변경되었습니다.');
    const options = selected.categories.map(item => {
      const option = doc.createElement('option'); option.value = item.name; option.textContent = item.name;
      markRealBlogCategoryOption(option, item.id); return option;
    });
    category.replaceChildren(...options);
    category.selectedIndex = selected.categories.findIndex(item => item.id === selected.categoryId);
    category.dataset.ldbAccountId = selected.accountId;
    const container = doc.getElementById('real-category-dropdown-container');
    if (container) container.style.display = 'block';
    category.dispatchEvent(new Event('change', { bubbles: true }));
    verifyLdbDestination(selected, doc);
  } finally { accounts.disabled = wasDisabled; }
}

/** 비동기 이미지 분석 중 앱에서 선택이 바뀌면 성공 응답을 보내지 않는다. */
export function verifyLdbDestination(selected: Selection, doc: Document): void {
  const account = doc.getElementById('main-account-selector') as HTMLSelectElement | null;
  const category = doc.getElementById('real-blog-category-select') as HTMLSelectElement | null;
  if (account?.value !== selected.accountId || category?.dataset.ldbAccountId !== selected.accountId
    || category?.selectedOptions[0]?.dataset.realBlogCategoryId !== selected.categoryId
    || category?.selectedOptions[0]?.textContent !== selected.categoryName) throw new Error('앱의 계정·카테고리가 변경되었습니다. 다시 선택해주세요.');
}
