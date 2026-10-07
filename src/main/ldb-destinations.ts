import { resolveExpectedBlogId } from '../automation/expectedBlogIdentity.js';
export interface LdbDestination { accountId: string; categoryId: string }
export interface LdbResolvedDestination extends LdbDestination { categoryName: string; categories: { id: string; name: string }[] }
interface Dependencies {
  safety?: (accountId: string) => { paused: boolean; busy: boolean; version: number; code?: string; label: string };
  accounts: () => { id: string; name: string; blogId: string; naverId?: string }[];
  active: () => { id: string } | null;
  fetchCategories: (blogId: string) => Promise<{ success: boolean; categories?: { id: string; name: string }[] }>;
  deliver: (posts: unknown[], destination?: LdbResolvedDestination) => Promise<number>;
}
export function parseLdbDestination(value: unknown): LdbDestination {
  const item = value as LdbDestination;
  if (!item || typeof item.accountId !== 'string' || !/^[\w-]{1,120}$/.test(item.accountId)
    || typeof item.categoryId !== 'string' || !/^[1-9]\d{0,15}$/.test(item.categoryId)) throw new Error('계정과 실제 카테고리를 다시 선택해주세요.');
  return { accountId: item.accountId, categoryId: item.categoryId };
}
/** 계정 정보는 허용된 공개 필드만 반환하며 실제 카테고리 조회와 전달을 직렬화한다. */
export function createLdbDestinations(deps: Dependencies) {
  let tail: Promise<unknown> = Promise.resolve();
  function queued<T>(run: () => Promise<T>): Promise<T> { const result = tail.then(run); tail = result.catch(() => undefined); return result; }
  function account(id: string) { const found = deps.accounts().find(value => value.id === id); if (!found) throw new Error('앱에 등록된 계정이 아닙니다.'); return found; }
  async function categories(accountId: string) {
    // 기존 앱의 실제 카테고리 분석과 같은 로그인 ID를 사용한다.
    // blogId는 구형 계정 편집 화면에서 표시명으로 저장될 수 있으므로 보조값으로만 쓴다.
    const lookupId = (value: ReturnType<typeof account>) => resolveExpectedBlogId(value.naverId?.trim() || value.blogId.trim(), [value]);
    const safety = deps.safety?.(accountId);
    if (safety?.paused || safety?.busy) throw new Error('네이버 계정 작업이 중단되었거나 실행 중입니다. 앱 계정 관리에서 상태를 확인해주세요.');
    const beforeId = lookupId(account(accountId));
    const result = await deps.fetchCategories(beforeId);
    if (lookupId(account(accountId)) !== beforeId) throw new Error('계정이 변경되었습니다. 다시 불러와주세요.');
    const values = (result.categories || []).filter(value => /^[1-9]\d{0,15}$/.test(String(value.id)) && String(value.name || '').trim())
      .map(value => ({ id: String(value.id), name: String(value.name).trim() }));
    if (!result.success || !values.length || new Set(values.map(value => value.id)).size !== values.length) throw new Error('실제 발행 카테고리를 확인하지 못했습니다.');
    return { accountId, categories: values };
  }
  // 발행기가 카테고리를 이름으로 비교할 때 사용하는 장식 제거 규칙과 동일하다.
  const publishName = (name: string) => name.replace(/[└├│─]+/g, '').replace(/하위\s*카테고리/g, '').replace(/[\s·_\-\/\\,]+/g, '').toLowerCase();
  async function resolve(value: unknown): Promise<LdbResolvedDestination> {
    const selected = parseLdbDestination(value);
    const list = await categories(selected.accountId);
    const category = list.categories.find(item => item.id === selected.categoryId);
    if (!category) throw new Error('삭제되거나 다른 계정의 카테고리입니다. 다시 불러와주세요.');
    if (list.categories.filter(item => publishName(item.name) === publishName(category.name)).length !== 1) throw new Error('같은 이름의 카테고리가 여러 개입니다. 앱에서 이름을 구분한 뒤 다시 선택해주세요.');
    return { ...selected, categoryName: category.name, categories: list.categories };
  }
  return {
    accounts: () => ({ accounts: deps.accounts().map(value => ({ id: value.id, label: value.name, blogId: value.blogId, ...(deps.safety ? { sessionSafety: deps.safety(value.id) } : {}) })), activeAccountId: deps.active()?.id || null }),
    categories,
    select: (value: unknown) => queued(async () => { const selected = await resolve(value); await deps.deliver([], selected); return { accountId: selected.accountId, categoryId: selected.categoryId }; }),
    send: (posts: unknown[], value?: unknown) => queued(async () => {
      const selected = value === undefined ? undefined : await resolve(value);
      const imported = await deps.deliver(posts, selected);
      return { imported, ...(selected ? { selection: { accountId: selected.accountId, categoryId: selected.categoryId } } : {}) };
    }),
  };
}
