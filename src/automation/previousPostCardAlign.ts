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
  /** Address paragraphs (the text a card was typed from) taken out of the document. */
  readonly removedAddressLines: number;
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
  const empty = { matched: 0, changed: 0, centeredInData: 0, removedAddressLines: 0, keys: [] as string[] };
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
      return { status: 'unsafe', matched: cards.length, changed: 0, centeredInData: 0, removedAddressLines: 0, keys, message: `문서/화면 ${counts}` };
    }
    const pending = cards.filter((component) => component.align !== 'center');
    for (const component of pending) component.align = 'center';
    // The address a card was typed from sits in its own paragraph. The screen-only cleanup removes it from the screen,
    // but this document still holds it, and writing the document back would bring it back (live run 2026-11-24).
    // So it leaves the document here: only a paragraph that is nothing but the address of one of this post's cards.
    type Block = Record<string, unknown>;
    const lineOf = (paragraph: Block): string => ((paragraph?.nodes as Block[]) || []).map((node) => String(node?.value ?? '')).join('').trim();
    const isAddressLine = (paragraph: Block): boolean => { const line = lineOf(paragraph); return /^https?:\/\/\S+$/i.test(line) && wanted.has(cardKey(line)); };
    const components = (data?.document?.components || []) as Block[];
    let removedAddressLines = 0;
    for (let index = components.length - 1; index >= 0; index -= 1) {
      const component = components[index];
      if (component?.['@ctype'] !== 'text' || !Array.isArray(component.value)) continue;
      const paragraphs = component.value as Block[];
      const kept = paragraphs.filter((paragraph) => !isAddressLine(paragraph));
      if (kept.length === paragraphs.length) continue;
      removedAddressLines += paragraphs.length - kept.length;
      if (kept.length > 0) component.value = kept;
      else if (index < components.length - 1) components.splice(index, 1); // a block that held only the address
      else component.value = [{ ...paragraphs[0], nodes: [{ '@ctype': 'textNode', value: '' }] }]; // the last block stays as the typing line
    }
    const wrote = pending.length > 0 || removedAddressLines > 0;
    if (wrote) editor.setDocumentData(data);
    const after = (editor.getDocumentData()?.document?.components || []).filter(isCard);
    const centeredInData = after.filter((component) => component.align === 'center').length;
    return {
      status: centeredInData === cards.length ? (wrote ? 'aligned' : 'unchanged') : 'error',
      matched: cards.length, changed: pending.length, centeredInData, removedAddressLines, keys,
      ...(centeredInData === cards.length ? {} : { message: 'align not kept by the editor' }),
    };
  } catch (error) {
    return { status: 'error', ...empty, message: String((error as Error)?.message || error).slice(0, 160) };
  }
}

/** Runs INSIDE the editor frame: what the screen shows after the write (cards drawn, address lines left, photos). */
export function previousPostCardAlignReadScreen(urls: readonly string[]): { shown: number; centered: number; leftover: number; photos: number } {
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
  const cards = Array.from(document.querySelectorAll('.se-component.se-oglink'));
  // Informational only: the class the editor uses for a centered card was never confirmed; the document data is the proof.
  const centered = cards.filter((card) => /align-center/.test([card, ...Array.from(card.querySelectorAll('.se-section, .se-component-content'))]
    .map((node) => String((node as Element).className || '')).join(' '))).length;
  const leftover = Array.from(document.querySelectorAll('.se-component.se-text .se-text-paragraph')).filter((paragraph) => {
    const line = String((paragraph as HTMLElement).innerText || paragraph.textContent || '').trim();
    return /^https?:\/\/\S+$/i.test(line) && wanted.has(cardKey(line));
  }).length;
  return { shown: cards.length, centered, leftover, photos: document.querySelectorAll('.se-component.se-image').length };
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
): Promise<PreviousPostCardAlignResult & { readonly centeredOnScreen: number; readonly shownOnScreen: number; readonly leftoverOnScreen: number }> {
  const log = options.log ?? (() => undefined);
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const none = { centeredOnScreen: 0, shownOnScreen: 0, leftoverOnScreen: 0 };
  const nothing = { matched: 0, changed: 0, centeredInData: 0, removedAddressLines: 0, keys: [] as string[] };
  if (urls.length === 0) return { status: 'no-cards', ...nothing, ...none };
  let screen = { shown: 0, centered: 0, leftover: 0, photos: 0 };
  let photosBefore = -1;
  try { photosBefore = (await frame.evaluate(previousPostCardAlignReadScreen, urls)).photos; } catch { /* unknown: no comparison */ }
  let result: PreviousPostCardAlignResult;
  try { result = await frame.evaluate(previousPostCardAlignInPage, urls); }
  catch (error) {
    result = { status: 'error', ...nothing, message: String((error as Error)?.message || error).slice(0, 160) };
  }
  const written = result.status === 'aligned' || result.status === 'unchanged';
  if (written) {
    const deadline = Date.now() + (options.screenWaitMs ?? 4000);
    do {
      try { screen = await frame.evaluate(previousPostCardAlignReadScreen, urls); } catch { /* the frame re-rendered: read again */ }
      if (screen.shown >= result.matched && screen.leftover === 0) break;
      await delay(250);
    } while (Date.now() < deadline);
  }
  // Proof of the alignment is the editor's own document (read back in the page); the screen must show the cards and no address line.
  const confirmed = written && result.matched > 0 && result.centeredInData >= result.matched && screen.shown >= result.matched && screen.leftover === 0;
  if (written && photosBefore >= 0 && screen.photos < photosBefore) {
    log(`   ⚠️ 이전글 카드 정렬 뒤 사진 수가 줄었습니다 (${photosBefore} → ${screen.photos}). 발행 전에 글을 확인해 주세요.`);
  }
  log(confirmed
    ? `   🎯 이전글 카드 ${result.matched}개를 가운데로 맞췄습니다${result.removedAddressLines > 0 ? ` (주소 줄 ${result.removedAddressLines}개 정리)` : ''}.`
    : `   ⚠️ 이전글 카드 정리를 확인하지 못했습니다 (상태 ${result.status} · 문서 ${result.centeredInData}/${result.matched} · 화면 카드 ${screen.shown} · 남은 주소 ${screen.leftover} · 칸 ${result.keys.join(',') || '-'}${result.message ? ` · ${result.message}` : ''})`);
  return { ...result, centeredOnScreen: screen.centered, shownOnScreen: screen.shown, leftoverOnScreen: screen.leftover };
}
