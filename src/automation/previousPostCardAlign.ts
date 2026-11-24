// src/automation/previousPostCardAlign.ts
// Centers the previous-post link cards at the end of the post.
// The editor ignores scripted clicks on its align buttons, so the alignment is written into the editor's own document
// data (the same route the LDB extension uses for paragraphs) and then read back from the screen. Nothing here can stop
// a publish: when the editor API is missing or the read-back fails, the cards simply stay where they were.

export interface PreviousPostCardAlignResult {
  readonly status: 'aligned' | 'unchanged' | 'no-api' | 'no-cards' | 'unsafe' | 'error';
  /** Cards of this post found in the document data. */
  readonly matched: number;
  /** Cards whose alignment was written this time. */
  readonly changed: number;
  readonly centeredInData: number;
  /** Field names of a card component (names only, never values): tells us what the editor really stores. */
  readonly keys: readonly string[];
  readonly message?: string;
}

/**
 * Runs INSIDE the editor frame (serialized by evaluate): it must not use anything from the outer scope.
 * Writes align = 'center' on the oglink components whose link is one of `urls`.
 */
export function previousPostCardAlignInPage(urls: readonly string[]): PreviousPostCardAlignResult {
  const cardKey = (value: unknown): string => {
    const text = String(value || '').trim();
    const path = /blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/i.exec(text);
    if (path) return `${path[1].toLowerCase()}/${path[2]}`;
    const blogId = /[?&]blogId=([A-Za-z0-9_-]+)/i.exec(text);
    const logNo = /[?&]logNo=(\d+)/i.exec(text);
    if (blogId && logNo) return `${blogId[1].toLowerCase()}/${logNo[1]}`;
    return text.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  };
  const empty = { matched: 0, changed: 0, centeredInData: 0, keys: [] as string[] };
  try {
    const wanted = new Set(urls.map(cardKey).filter(Boolean));
    if (wanted.size === 0) return { status: 'no-cards', ...empty };
    const host = (window as unknown as { SmartEditor?: { _editors?: Record<string, unknown>; editors?: Record<string, unknown> } }).SmartEditor;
    const editors = host && (host._editors || host.editors);
    const editor = editors && (editors[Object.keys(editors)[0]] as {
      getDocumentData?: () => { document?: { components?: Array<Record<string, unknown>> } };
      setDocumentData?: (data: unknown) => void;
    } | undefined);
    if (!editor || typeof editor.getDocumentData !== 'function' || typeof editor.setDocumentData !== 'function') {
      return { status: 'no-api', ...empty };
    }
    const isCard = (component: Record<string, unknown>): boolean =>
      component?.['@ctype'] === 'oglink' && wanted.has(cardKey(component.link || component.url));
    const data = editor.getDocumentData();
    const cards = (data?.document?.components || []).filter(isCard);
    if (cards.length === 0) return { status: 'no-cards', ...empty };
    const keys = Object.keys(cards[0]).sort();
    // Writing the document back redraws the editor from this data. Only do it when the data and the screen hold the
    // same photos, cards and text blocks, so a redraw cannot drop anything that exists on the screen only.
    const inData = (type: string): number => (data?.document?.components || []).filter((component) => component?.['@ctype'] === type).length;
    const onScreen = (name: string): number => document.querySelectorAll(`.se-component.se-${name}`).length;
    const counts = `사진 ${inData('image')}/${onScreen('image')} · 카드 ${inData('oglink')}/${onScreen('oglink')} · 글 ${inData('text')}/${onScreen('text')}`;
    if (inData('image') !== onScreen('image') || inData('oglink') !== onScreen('oglink') || inData('text') !== onScreen('text')) {
      return { status: 'unsafe', matched: cards.length, changed: 0, centeredInData: 0, keys, message: `문서/화면 ${counts}` };
    }
    const pending = cards.filter((component) => component.align !== 'center');
    for (const component of pending) component.align = 'center';
    if (pending.length > 0) editor.setDocumentData(data);
    const after = (editor.getDocumentData()?.document?.components || []).filter(isCard);
    const centeredInData = after.filter((component) => component.align === 'center').length;
    return {
      status: centeredInData === cards.length ? (pending.length > 0 ? 'aligned' : 'unchanged') : 'error',
      matched: cards.length, changed: pending.length, centeredInData, keys,
      ...(centeredInData === cards.length ? {} : { message: 'align not kept by the editor' }),
    };
  } catch (error) {
    return { status: 'error', ...empty, message: String((error as Error)?.message || error).slice(0, 160) };
  }
}

/** Runs INSIDE the editor frame: how many of this post's cards the screen shows centered, and how many it shows at all. */
export function previousPostCardAlignReadScreen(urls: readonly string[]): { shown: number; centered: number; photos: number } {
  const cardKey = (value: unknown): string => {
    const text = String(value || '').trim();
    const path = /blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/i.exec(text);
    if (path) return `${path[1].toLowerCase()}/${path[2]}`;
    const blogId = /[?&]blogId=([A-Za-z0-9_-]+)/i.exec(text);
    const logNo = /[?&]logNo=(\d+)/i.exec(text);
    if (blogId && logNo) return `${blogId[1].toLowerCase()}/${logNo[1]}`;
    return text.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  };
  const wanted = new Set(urls.map(cardKey).filter(Boolean));
  let shown = 0;
  let centered = 0;
  for (const card of Array.from(document.querySelectorAll('.se-component.se-oglink'))) {
    const links = Array.from(card.querySelectorAll('a[href]')).map((anchor) => cardKey(anchor.getAttribute('href')));
    if (!links.some((link) => wanted.has(link))) continue;
    shown += 1;
    const classes = [card, ...Array.from(card.querySelectorAll('.se-section, .se-component-content'))]
      .map((node) => String((node as Element).className || '')).join(' ');
    if (/align-center/.test(classes)) centered += 1;
  }
  return { shown, centered, photos: document.querySelectorAll('.se-component.se-image').length };
}

interface PreviousPostCardAlignFrame {
  evaluate<T>(fn: (urls: readonly string[]) => T, urls: readonly string[]): Promise<T>;
}

export interface PreviousPostCardAlignOptions {
  readonly log?: (message: string) => void;
  readonly delay?: (ms: number) => Promise<void>;
  /** How long the screen may take to show the new alignment. */
  readonly screenWaitMs?: number;
}

/** Centers the cards and confirms it on the screen. Never throws; returns what really happened. */
export async function alignPreviousPostCardsInEditor(
  frame: PreviousPostCardAlignFrame,
  urls: readonly string[],
  options: PreviousPostCardAlignOptions = {},
): Promise<PreviousPostCardAlignResult & { readonly centeredOnScreen: number; readonly shownOnScreen: number }> {
  const log = options.log ?? (() => undefined);
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const none = { centeredOnScreen: 0, shownOnScreen: 0 };
  if (urls.length === 0) return { status: 'no-cards', matched: 0, changed: 0, centeredInData: 0, keys: [], ...none };
  let result: PreviousPostCardAlignResult;
  try { result = await frame.evaluate(previousPostCardAlignInPage, urls); }
  catch (error) {
    result = { status: 'error', matched: 0, changed: 0, centeredInData: 0, keys: [], message: String((error as Error)?.message || error).slice(0, 160) };
  }
  let screen = { shown: 0, centered: 0, photos: 0 };
  let photosBefore = -1;
  try { photosBefore = (await frame.evaluate(previousPostCardAlignReadScreen, urls)).photos; } catch { /* unknown: no comparison */ }
  if (result.status === 'aligned' || result.status === 'unchanged') {
    const deadline = Date.now() + (options.screenWaitMs ?? 4000);
    do {
      try { screen = await frame.evaluate(previousPostCardAlignReadScreen, urls); } catch { /* the frame re-rendered: read again */ }
      if (screen.shown >= result.matched && screen.centered >= result.matched) break;
      await delay(250);
    } while (Date.now() < deadline);
  }
  const confirmed = result.matched > 0 && screen.centered >= result.matched;
  if (result.changed > 0 && photosBefore >= 0 && screen.photos < photosBefore) {
    log(`   ⚠️ 이전글 카드 정렬 뒤 사진 수가 줄었습니다 (${photosBefore} → ${screen.photos}). 발행 전에 글을 확인해 주세요.`);
  }
  log(confirmed
    ? `   🎯 이전글 카드 ${result.matched}개를 가운데로 맞췄습니다.`
    : `   ⚠️ 이전글 카드 가운데 정렬을 확인하지 못해 그대로 둡니다 (상태 ${result.status} · 문서 ${result.centeredInData}/${result.matched} · 화면 ${screen.centered}/${screen.shown} · 칸 ${result.keys.join(',') || '-'}${result.message ? ` · ${result.message}` : ''})`);
  return { ...result, centeredOnScreen: screen.centered, shownOnScreen: screen.shown };
}
