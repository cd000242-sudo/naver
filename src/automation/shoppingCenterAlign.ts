// src/automation/shoppingCenterAlign.ts
// Shopping-mode posts: photos, link cards and the banner block (divider, hook line, link line) go to the centre.
// Owner request 2026-11-25. The body paragraphs stay left (owner decision 2026-09-02).
// Same route as previousPostCardAlign: the editor ignores scripted clicks on its align buttons, so the alignment is
// written into the editor's own document data and read back. Nothing here can stop a publish: when the editor API is
// missing, the data and the screen disagree, or the read-back fails, the post simply stays as it was.

/** A text line is part of the banner block when it starts with one of these (typed by ctaHelpers / the tail blocks). */
export const SHOPPING_CENTER_LINE_STARTS: readonly string[] = ['📎', '👉', '🔗'];

export interface ShoppingCenterAlignResult {
  readonly status: 'aligned' | 'unchanged' | 'no-api' | 'nothing' | 'unsafe' | 'error';
  /** Photos / link cards / text lines that belong in the centre. */
  readonly images: number;
  readonly cards: number;
  readonly lines: number;
  /** How many of them were written this time. */
  readonly changed: number;
  readonly message?: string;
}

/**
 * Runs INSIDE the editor frame (serialized by evaluate): it must not use anything from the outer scope.
 * `hookLines` are the exact one-line texts that sit above the previous-post cards.
 */
export function shoppingCenterAlignInPage(hookLines: readonly string[]): ShoppingCenterAlignResult {
  const empty = { images: 0, cards: 0, lines: 0, changed: 0 };
  try {
    type Block = Record<string, unknown>;
    const starts = ['📎', '👉', '🔗'];
    const hooks = new Set(hookLines.map((line) => String(line || '').trim()).filter(Boolean));
    const host = (window as unknown as { SmartEditor?: { _editors?: Record<string, unknown>; editors?: Record<string, unknown> } }).SmartEditor;
    const editors = host && (host._editors || host.editors);
    const editor = editors && (editors[Object.keys(editors)[0]] as {
      getDocumentData?: () => { document?: { components?: Block[] } };
      setDocumentData?: (data: unknown) => void;
    } | undefined);
    if (!editor || typeof editor.getDocumentData !== 'function' || typeof editor.setDocumentData !== 'function') {
      return { status: 'no-api', ...empty };
    }
    const lineOf = (paragraph: Block): string => ((paragraph?.nodes as Block[]) || [])
      .map((node) => String(node?.value ?? '')).join('').replace(/[​﻿]/g, '').trim();
    const isBannerLine = (paragraph: Block): boolean => {
      const line = lineOf(paragraph);
      if (!line) return false;
      return /^[━─]{8,}$/.test(line) || starts.some((start) => line.startsWith(start)) || hooks.has(line);
    };
    const alignOf = (paragraph: Block): unknown => (paragraph?.style as Block | undefined)?.align;
    const collect = (components: Block[]) => {
      const blocks = components.filter((component) => component?.['@ctype'] === 'image' || component?.['@ctype'] === 'oglink');
      const paragraphs: Block[] = [];
      for (const component of components) {
        if (component?.['@ctype'] !== 'text' || !Array.isArray(component.value)) continue;
        for (const paragraph of component.value as Block[]) if (isBannerLine(paragraph)) paragraphs.push(paragraph);
      }
      return { blocks, paragraphs };
    };
    const data = editor.getDocumentData();
    const components = (data?.document?.components || []) as Block[];
    const found = collect(components);
    const images = found.blocks.filter((component) => component['@ctype'] === 'image').length;
    const cards = found.blocks.length - images;
    const counts = { images, cards, lines: found.paragraphs.length };
    if (found.blocks.length + found.paragraphs.length === 0) return { status: 'nothing', ...counts, changed: 0 };
    // Writing the document back redraws the editor from this data. Only do it when the data and the screen hold the
    // same photos, cards and text blocks, so a redraw cannot drop anything that exists on the screen only.
    const inData = (type: string): number => components.filter((component) => component?.['@ctype'] === type).length;
    const onScreen = (name: string): number => document.querySelectorAll(`.se-component.se-${name}`).length;
    if (inData('image') !== onScreen('image') || inData('oglink') !== onScreen('oglink') || inData('text') !== onScreen('text')) {
      return {
        status: 'unsafe', ...counts, changed: 0,
        message: `문서/화면 사진 ${inData('image')}/${onScreen('image')} · 카드 ${inData('oglink')}/${onScreen('oglink')} · 글 ${inData('text')}/${onScreen('text')}`,
      };
    }
    const pendingBlocks = found.blocks.filter((component) => component.align !== 'center');
    const pendingLines = found.paragraphs.filter((paragraph) => alignOf(paragraph) !== 'center');
    const changed = pendingBlocks.length + pendingLines.length;
    if (changed === 0) return { status: 'unchanged', ...counts, changed: 0 };
    for (const component of pendingBlocks) component.align = 'center';
    for (const paragraph of pendingLines) {
      const style = paragraph.style && typeof paragraph.style === 'object' ? (paragraph.style as Block) : { '@ctype': 'paragraphStyle' };
      paragraph.style = { ...style, align: 'center' };
    }
    editor.setDocumentData(data);
    const after = collect((editor.getDocumentData()?.document?.components || []) as Block[]);
    const kept = after.blocks.filter((component) => component.align === 'center').length
      + after.paragraphs.filter((paragraph) => alignOf(paragraph) === 'center').length;
    const wanted = found.blocks.length + found.paragraphs.length;
    return kept >= wanted
      ? { status: 'aligned', ...counts, changed }
      : { status: 'error', ...counts, changed, message: `align not kept by the editor (${kept}/${wanted})` };
  } catch (error) {
    return { status: 'error', ...empty, message: String((error as Error)?.message || error).slice(0, 160) };
  }
}

/** Runs INSIDE the editor frame: how many photos and cards the screen shows (to notice a redraw that lost one). */
export function shoppingCenterAlignReadScreen(): { photos: number; cards: number } {
  return {
    photos: document.querySelectorAll('.se-component.se-image').length,
    cards: document.querySelectorAll('.se-component.se-oglink').length,
  };
}

interface ShoppingCenterAlignFrame {
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
}

export interface ShoppingCenterAlignOptions {
  readonly log?: (message: string) => void;
  readonly delay?: (ms: number) => Promise<void>;
  /** How long the screen may take to draw the photos again after the write. */
  readonly screenWaitMs?: number;
}

/** Centres the shopping blocks and compares the screen before and after. Never throws; returns what really happened. */
export async function alignShoppingPostCenterInEditor(
  frame: ShoppingCenterAlignFrame,
  hookLines: readonly string[],
  options: ShoppingCenterAlignOptions = {},
): Promise<ShoppingCenterAlignResult> {
  const log = options.log ?? (() => undefined);
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const readScreen = async (): Promise<{ photos: number; cards: number } | null> => {
    try { return await frame.evaluate(shoppingCenterAlignReadScreen as unknown as (arg: undefined) => { photos: number; cards: number }, undefined); }
    catch { return null; }
  };
  const before = await readScreen();
  let result: ShoppingCenterAlignResult;
  try { result = await frame.evaluate(shoppingCenterAlignInPage, hookLines); }
  catch (error) {
    result = { status: 'error', images: 0, cards: 0, lines: 0, changed: 0, message: String((error as Error)?.message || error).slice(0, 160) };
  }
  if (result.status === 'aligned') {
    const deadline = Date.now() + (options.screenWaitMs ?? 4000);
    let after = await readScreen();
    while (before && after && (after.photos < before.photos || after.cards < before.cards) && Date.now() < deadline) {
      await delay(250);
      after = await readScreen();
    }
    if (before && after && (after.photos < before.photos || after.cards < before.cards)) {
      log(`   ⚠️ 가운데 정렬 뒤 사진·카드 수가 줄었습니다 (사진 ${before.photos} → ${after.photos}, 카드 ${before.cards} → ${after.cards}). 발행 전에 글을 확인해 주세요.`);
    }
    log(`   🎯 쇼핑 글 가운데 정렬: 사진 ${result.images}장 · 링크 카드 ${result.cards}개 · 배너 문구 ${result.lines}줄`);
  } else if (result.status === 'unchanged' || result.status === 'nothing') {
    log(`   ℹ️ 쇼핑 글 가운데 정렬: 바꿀 것이 없습니다 (사진 ${result.images} · 카드 ${result.cards} · 문구 ${result.lines}).`);
  } else {
    log(`   ⚠️ 쇼핑 글 가운데 정렬을 확인하지 못했습니다 (상태 ${result.status}${result.message ? ` · ${result.message}` : ''}). 글은 그대로 둡니다.`);
  }
  return result;
}
