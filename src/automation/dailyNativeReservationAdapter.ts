import type { Page } from 'puppeteer';
import { parseNativeReservationTime, type NativeReservationAdapter, type NativeReservationRequest, type NativeReservationRow, type NativeReservationSnapshot } from './dailyNativeReservation.js';

type Action = 'list' | 'open-list' | 'open-row' | 'open-publish' | 'editor' | 'open-categories' | 'category';
interface UiResult {
  readonly ready?: boolean;
  readonly error?: string;
  readonly rows?: readonly NativeReservationRow[];
  readonly title?: string;
  readonly scheduledAt?: string;
  readonly categoryName?: string;
  readonly categoryId?: string;
}
interface UiInput { action: Action; title?: string; scheduledAt?: string; categoryName?: string }
const fail = (suffix: string): never => { throw new Error(`DAILY_NATIVE_RESERVATION_${suffix}`); };
const normalize = (value: string): string => value.normalize('NFC').replace(/\s+/gu, ' ').trim();

/** DOM-only inspection. No application internals, network endpoints, cookies or requested category IDs. */
function reservationUi(input: UiInput): UiResult {
  const text = (element: Element): string => ((element as HTMLElement).innerText || element.textContent || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
  const visible = (element: Element): boolean => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  };
  const trusted = (element: Element): boolean => !element.closest('.se-main-container, .se-component, [contenteditable="true"], article');
  const elements = (selector: string, root: ParentNode = document): Element[] => Array.from(root.querySelectorAll(selector)).filter(element => visible(element) && trusted(element));
  const click = (matches: Element[]): UiResult => {
    if (matches.length > 1) return { error: 'AMBIGUOUS_CONTROL' };
    if (!matches.length) return {};
    const control = matches[0] as HTMLButtonElement;
    if (control.disabled || control.getAttribute('aria-disabled') === 'true') return {};
    control.click();
    return { ready: true };
  };
  if (input.action === 'open-list') return click(elements('button').filter(element => /^예약\s*발행\s*\d+\s*건$/u.test(text(element))));
  if (input.action === 'open-publish') return click(elements('button[data-click-area="tpb.publish"], button.publish_btn__m9KHH'));
  const categoryButtons = elements('[data-click-area="tpb*i.category"], button[aria-label="카테고리 목록 버튼"], [data-testid="seOneCategoryBtn"]');
  if (input.action === 'open-categories') return click(categoryButtons);
  if (input.action === 'category') {
    const matches = elements('[data-testid^="categoryItemText_"]').filter(element => text(element) === input.categoryName);
    if (matches.length > 1) return { error: 'AMBIGUOUS_CATEGORY' };
    const categoryId = /^categoryItemText_([1-9]\d*)$/u.exec(matches[0]?.getAttribute('data-testid') || '')?.[1];
    return categoryId ? { ready: true, categoryId } : {};
  }
  if (input.action === 'editor') {
    const titles = Array.from(document.querySelectorAll('.se-title-text')).filter(visible);
    const dates = elements('input[class*="input_date"], input[type="date"]');
    const hours = elements('select[class*="hour_option"], select[class*="hour"]');
    const minutes = elements('select[class*="minute_option"], select[class*="minute"]');
    const scheduleRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input#radio_time2, input[name="radio_time"][value="pre"]'))
      .filter(element => element.checked && trusted(element) && (visible(element) || elements('label').some(label => label.getAttribute('for') === element.id)));
    if ([titles, dates, hours, minutes, categoryButtons, scheduleRadios].some(items => items.length > 1)) return { error: 'AMBIGUOUS_EDITOR' };
    if ([titles, dates, hours, minutes, categoryButtons, scheduleRadios].some(items => items.length !== 1)) return {};
    const date = (dates[0] as HTMLInputElement).value.trim().replace(/\.$/u, '');
    const hour = (hours[0] as HTMLSelectElement).value;
    const minute = (minutes[0] as HTMLSelectElement).value;
    if (!/^\d{4}[.-]\s*\d{1,2}[.-]\s*\d{1,2}$/u.test(date) || !/^\d{1,2}$/u.test(hour) || !/^\d{1,2}$/u.test(minute)) return {};
    return { ready: true, title: text(titles[0]), scheduledAt: `${date} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`, categoryName: text(categoryButtons[0]) };
  }
  // Observed NAVER UI: "예약 발행 글" heading, a content list of buttons, and "팝업닫기".
  const headings = elements('h1,h2,h3,h4,div,span,strong,p').filter(element => text(element) === '예약 발행 글' && !Array.from(element.children).some(child => text(child) === '예약 발행 글'));
  const panels: Element[] = [];
  for (const heading of headings) {
    for (let parent = heading.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (elements('button', parent).some(button => text(button) === '팝업닫기') && parent.querySelector('ul,ol,[role="list"]')) {
        panels.push(parent); break;
      }
    }
  }
  if (panels.length > 1) return { error: 'AMBIGUOUS_LIST' };
  if (panels.length !== 1) return {};
  const lists = elements('ul,ol,[role="list"]', panels[0]);
  if (lists.length > 1) return { error: 'AMBIGUOUS_LIST' };
  if (lists.length !== 1) return { ready: true, rows: [] };
  const buttons = elements('button', lists[0]);
  if (buttons.length > 500) return { error: 'AMBIGUOUS_LIST' };
  const parsed = buttons.map(button => {
    const match = /^(.*?)\s+(\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?\s+(?:(?:오전|오후)\s*)?\d{1,2}:\d{2})$/u.exec(text(button));
    return { button, row: match ? { title: match[1], scheduledAt: match[2], state: 'scheduled' as const } : undefined };
  });
  if (parsed.some(item => !item.row)) return { error: 'UNOBSERVED_ROW' };
  if (input.action === 'open-row') return click(parsed.filter(item => item.row?.title === input.title && item.row?.scheduledAt === input.scheduledAt).map(item => item.button));
  return { ready: true, rows: parsed.map(item => item.row!) };
}

function observedBlogId(page: Page, expected: string): string {
  let url: URL;
  try { url = new URL(page.url()); } catch { return fail('ACCOUNT_UNOBSERVED'); }
  if (url.protocol !== 'https:' || url.hostname !== 'blog.naver.com' || url.port || url.username || url.password) return fail('ACCOUNT_UNOBSERVED');
  const ids = url.searchParams.getAll('blogId');
  const blogId = ids.length === 1 ? ids[0] : ids.length === 0 && !url.pathname.endsWith('.naver') ? url.pathname.split('/').filter(Boolean)[0] : '';
  if (!blogId || blogId.toLowerCase() !== expected.toLowerCase()) return fail('ACCOUNT_UNOBSERVED');
  return blogId.toLowerCase();
}

function guard(signal: AbortSignal | undefined, deadline: number): void {
  if (signal?.aborted) fail('ABORTED');
  if (Date.now() >= deadline) fail('UNOBSERVED_TIMEOUT');
}

async function bounded<T>(work: Promise<T>, signal: AbortSignal | undefined, deadline: number): Promise<T> {
  guard(signal, deadline);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      abort = () => reject(new Error('DAILY_NATIVE_RESERVATION_ABORTED'));
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => reject(new Error('DAILY_NATIVE_RESERVATION_UNOBSERVED_TIMEOUT')), Math.max(1, deadline - Date.now()));
    })]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  }
}

async function poll(page: Page, request: NativeReservationRequest, input: UiInput, signal: AbortSignal | undefined, deadline: number,
  accepts: (result: UiResult) => boolean = result => Boolean(result.ready)): Promise<UiResult> {
  for (;;) {
    guard(signal, deadline); observedBlogId(page, request.blogId);
    const result = await bounded(page.evaluate(reservationUi, input), signal, deadline);
    guard(signal, deadline); observedBlogId(page, request.blogId);
    if (result.error) fail(result.error);
    if (accepts(result)) return result;
    await bounded(new Promise(resolve => setTimeout(resolve, 50)), signal, deadline);
  }
}

function matching(rows: readonly NativeReservationRow[], request: NativeReservationRequest): NativeReservationRow[] {
  return rows.filter(row => {
    try { return normalize(row.title) === normalize(request.title) && parseNativeReservationTime(row.scheduledAt) === request.scheduledFor; }
    catch { return false; }
  });
}

/**
 * Read-only UI adapter. Selectors are grounded in prior editor/list observations; a changed UI fails closed.
 * Presence of this adapter is NOT a claim that the current logged-in NAVER UI has been verified.
 */
export function createDailyNativeReservationAdapter(options: { timeoutMs?: number } = {}): NativeReservationAdapter {
  const timeoutMs = Math.max(100, Math.min(12_000, options.timeoutMs || 10_000));
  const opened = new WeakMap<Page, string>();
  const identity = (request: NativeReservationRequest): string => JSON.stringify([request.blogId, request.title, request.scheduledFor, request.categoryId]);
  const editorUrl = (request: NativeReservationRequest): string => `https://blog.naver.com/PostWriteForm.naver?blogId=${encodeURIComponent(request.blogId)}&Redirect=Write`;
  const navigate = async (page: Page, request: NativeReservationRequest, signal: AbortSignal | undefined, deadline: number): Promise<void> => {
    guard(signal, deadline); observedBlogId(page, request.blogId);
    await bounded(page.goto(editorUrl(request), { waitUntil: 'domcontentloaded', timeout: Math.max(1, deadline - Date.now()) }), signal, deadline);
    guard(signal, deadline); observedBlogId(page, request.blogId);
  };
  const openList = async (page: Page, request: NativeReservationRequest, signal: AbortSignal | undefined, deadline: number): Promise<void> => {
    guard(signal, deadline); observedBlogId(page, request.blogId);
    const existing = await bounded(page.evaluate(reservationUi, { action: 'list' as const }), signal, deadline);
    if (existing.error) fail(existing.error);
    if (!existing.ready) await poll(page, request, { action: 'open-list' }, signal, deadline);
    await poll(page, request, { action: 'list' }, signal, deadline);
  };
  return Object.freeze({
    async open(page: Page, request: NativeReservationRequest, signal?: AbortSignal): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      opened.delete(page);
      guard(signal, deadline); observedBlogId(page, request.blogId);
      // Start from a fresh editor so stale settings from a previous article cannot attest this row.
      await navigate(page, request, signal, deadline);
      await openList(page, request, signal, deadline);
      opened.set(page, identity(request));
    },
    async read(page: Page, request: NativeReservationRequest, signal?: AbortSignal): Promise<NativeReservationSnapshot> {
      const deadline = Date.now() + timeoutMs;
      guard(signal, deadline);
      if (opened.get(page) !== identity(request)) return fail('OPEN_REQUIRED');
      opened.delete(page);
      const before = await poll(page, request, { action: 'list' }, signal, deadline);
      const candidates = matching(before.rows || [], request);
      if (candidates.length > 1) return fail('AMBIGUOUS_ROW');
      if (candidates.length !== 1) return fail('UNOBSERVED_ROW');
      const row = candidates[0];
      await poll(page, request, { action: 'open-row', title: row.title, scheduledAt: row.scheduledAt }, signal, deadline);
      await poll(page, request, { action: 'open-publish' }, signal, deadline);
      const editor = await poll(page, request, { action: 'editor' }, signal, deadline, result => {
        try { return Boolean(result.ready && normalize(result.title || '') === normalize(row.title) && parseNativeReservationTime(result.scheduledAt || '') === request.scheduledFor && result.categoryName); }
        catch { return false; }
      });
      await poll(page, request, { action: 'open-categories' }, signal, deadline);
      const category = await poll(page, request, { action: 'category', categoryName: editor.categoryName }, signal, deadline);
      // No dropdown item, confirm/publish, text field, or scheduling control is ever changed.
      await navigate(page, request, signal, deadline);
      await openList(page, request, signal, deadline);
      const after = await poll(page, request, { action: 'list' }, signal, deadline);
      const finalCandidates = matching(after.rows || [], request);
      if (finalCandidates.length !== 1 || finalCandidates[0].title !== row.title || finalCandidates[0].scheduledAt !== row.scheduledAt) return fail('LIST_CHANGED');
      guard(signal, deadline);
      return Object.freeze({ url: page.url(), blogId: observedBlogId(page, request.blogId), listVisible: true,
        rows: Object.freeze((after.rows || []).map(item => Object.freeze(item === finalCandidates[0] ? { ...item, categoryId: category.categoryId } : { ...item }))) });
    },
  });
}
