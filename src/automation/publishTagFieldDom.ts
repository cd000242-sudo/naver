// src/automation/publishTagFieldDom.ts
// [2026-11-04] Browser-facing half of publishTagField: reads the publish-dialog tag field and the editor body,
// and performs the clicks / keys the orchestration asks for. Everything live-measured on 2026-11-04 (no publish).
import type { Frame, Page } from 'puppeteer';
import { extractHashtagNames, hasOnlyHashtagPayload } from './bodyHashtagCleanup.js';
import type { BodyHashtagParagraph, PublishTagFieldDeps } from './publishTagField.js';

/** Class hashes (tag_area__wxLec, tag__ME42L) change between NAVER builds, so match by prefix. */
export const TAG_ITEM_SELECTOR = '[class*="tag_area__"] [class^="tag__"], [class*="tag_area__"] [class*=" tag__"]';
/** `tag_input_wrap__` does not contain `tag_input__`, so the wrapper div is not matched. */
export const TAG_INPUT_SELECTOR = 'input[class*="tag_input__"]';
const PUBLISH_TOGGLE_SELECTORS = ['button[data-click-area="tpb.publish"]', 'button.publish_btn__m9KHH'] as const;
/** Visible only while the layer is up; it is only looked at, never used. */
const LAYER_MARKER_SELECTOR = 'button[data-testid="seOnePublishBtn"]';
const BODY_PARAGRAPH_SELECTOR = '.se-text-paragraph';
const NOT_BODY_SELECTOR = '.se-documentTitle, .se-document-title, .se-caption, .se-oglink, .se-module-oglink';

export function normalizeTagName(raw: string): string {
  return String(raw).replace(/[​-‍﻿]/g, '').replace(/^\s*#+/, '').trim().normalize('NFC');
}

/** #-less, trimmed, case-insensitively de-duplicated, order kept. */
export function normalizeTagNames(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of raw) {
    const name = normalizeTagName(item);
    if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); names.push(name); }
  }
  return names;
}

/** Zero-width characters and NBSP (the editor keeps them in empty-looking lines) must not hide a hashtag-only line. */
export const cleanParagraphText = (text: string): string =>
  text.replace(/[​-‍﻿]/g, '').replace(/ /g, ' ').trim();

/** The same hashtag-only rule the body cleanup uses (bodyHashtagCleanup.hasOnlyHashtagPayload). */
export const isHashtagOnlyText = (text: string): boolean => hasOnlyHashtagPayload(cleanParagraphText(text));

export function selectHashtagParagraphs(paragraphs: ReadonlyArray<{ index: number; text: string }>): BodyHashtagParagraph[] {
  return paragraphs
    .filter((paragraph) => isHashtagOnlyText(paragraph.text))
    .map((paragraph) => ({
      index: paragraph.index,
      text: paragraph.text,
      tags: normalizeTagNames(extractHashtagNames(cleanParagraphText(paragraph.text))),
    }));
}

/** Tags shown in the publish dialog's tag field (without '#'); [] when the dialog or field is not readable. */
export async function readPublishDialogTags(frame: Frame): Promise<string[]> {
  try {
    const raw = await frame.evaluate((selector: string) => Array.from(document.querySelectorAll(selector))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.textContent || ''), TAG_ITEM_SELECTOR);
    return normalizeTagNames(raw);
  } catch {
    return [];
  }
}

/** Paragraph index = position among ALL `.se-text-paragraph` (title included), so it can be measured again later. */
async function readBodyParagraphs(frame: Frame): Promise<Array<{ index: number; text: string }>> {
  try {
    return await frame.evaluate((selector: string, skip: string) => Array.from(document.querySelectorAll(selector))
      .map((el, index) => ({ el, index }))
      .filter(({ el }) => !el.closest(skip))
      .map(({ el, index }) => ({ index, text: (el.textContent || '').trim() })), BODY_PARAGRAPH_SELECTOR, NOT_BODY_SELECTOR);
  } catch {
    return [];
  }
}

export async function findBodyHashtagParagraphs(frame: Frame): Promise<BodyHashtagParagraph[]> {
  return selectHashtagParagraphs(await readBodyParagraphs(frame));
}

/** The layer is up while its tag input or its final button is on screen. */
export async function isPublishDialogOpen(frame: Frame): Promise<boolean> {
  try {
    return await frame.evaluate((selectors: string[]) => selectors.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some((el) => el.getClientRects().length > 0)), [TAG_INPUT_SELECTOR, LAYER_MARKER_SELECTOR]);
  } catch {
    return false;
  }
}

// Page-side helpers (serialized into the frame: they must not reference anything outside themselves).
function measureParagraph(selector: string, index: number) {
  const el = document.querySelectorAll(selector)[index];
  if (!el) return null;
  el.scrollIntoView({ block: 'center', behavior: 'instant' as any });
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}
function readParagraphText(selector: string, index: number): string | null {
  const el = document.querySelectorAll(selector)[index];
  return el ? el.textContent || '' : null;
}
function readParagraphTexts(selector: string): string[] {
  return Array.from(document.querySelectorAll(selector)).map((el) => el.textContent || '');
}
function readMainFrameOffset() {
  const iframe = document.querySelector('iframe#mainFrame');
  const rect = iframe ? iframe.getBoundingClientRect() : null;
  return { x: rect ? rect.x : 0, y: rect ? rect.y : 0 };
}

export interface PublishTagFieldEnv {
  readonly page: Page;
  readonly getFrame: () => Promise<Frame>;
  readonly delay: (ms: number) => Promise<void>;
  readonly log: (message: string) => void;
}

/**
 * Click near the right end of the paragraph's last line, End, Shift+Home, Backspace (and once more for the empty line).
 * Backspace is pressed only when the selection really is hashtag-only text, so a missed click can never eat prose.
 */
async function deleteBodyParagraph(env: PublishTagFieldEnv, paragraph: BodyHashtagParagraph): Promise<boolean> {
  const { page, delay } = env;
  const frame = await env.getFrame();
  const rect = await frame.evaluate(measureParagraph, BODY_PARAGRAPH_SELECTOR, paragraph.index);
  if (!rect) return false;
  const offset = await page.evaluate(readMainFrameOffset);
  await page.mouse.click(offset.x + rect.right - 6, offset.y + Math.max(rect.top + 2, rect.bottom - 6));
  await delay(250);
  // [2026-11-04 live] SmartEditor draws its own selection: window.getSelection() reads '' there, so a "selected text is
  //   hashtag-only" check refused every deletion. Guard by outcome instead: every non-hashtag paragraph (title included)
  //   must read exactly the same after the keys, otherwise Ctrl+Z restores the body and nothing is reported as deleted.
  const before = proseParagraphs(await frame.evaluate(readParagraphTexts, BODY_PARAGRAPH_SELECTOR));
  await page.keyboard.press('End');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Home');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Backspace');
  await delay(200);
  if (!(await proseUnchanged(env, before))) return false;
  const remaining = await frame.evaluate(readParagraphText, BODY_PARAGRAPH_SELECTOR, paragraph.index);
  if (remaining !== null && cleanParagraphText(remaining) === '') {
    await page.keyboard.press('Backspace'); // the emptied line itself
    await delay(200);
    if (!(await proseUnchanged(env, before))) return false;
  }
  return true; // a wrapped paragraph keeps its other lines: the caller finds it again and deletes the next line
}

/** Non-empty paragraphs that are not hashtag-only, in order — the prose the deletion must never touch. */
function proseParagraphs(texts: readonly string[]): string[] {
  return texts.map(cleanParagraphText).filter((text) => text !== '' && !isHashtagOnlyText(text));
}

/** Prose still identical? If not, undo the last keystroke (Ctrl+Z) and report false. */
async function proseUnchanged(env: PublishTagFieldEnv, before: readonly string[]): Promise<boolean> {
  const frame = await env.getFrame();
  const after = proseParagraphs(await frame.evaluate(readParagraphTexts, BODY_PARAGRAPH_SELECTOR));
  if (after.length === before.length && after.every((text, i) => text === before[i])) return true;
  await env.page.keyboard.down('Control');
  await env.page.keyboard.press('KeyZ');
  await env.page.keyboard.up('Control');
  await env.delay(300);
  env.log('⚠️ [태그칸] 본문 문장이 바뀌어 되돌렸습니다 — 해시태그 줄만 지웁니다.');
  return false;
}

export function createPublishTagFieldDeps(env: PublishTagFieldEnv): PublishTagFieldDeps {
  const { page, getFrame } = env;
  return {
    findBodyHashtagParagraphs: async () => findBodyHashtagParagraphs(await getFrame()),
    readDialogTags: async () => readPublishDialogTags(await getFrame()),
    isDialogOpen: async () => isPublishDialogOpen(await getFrame()),
    clickPublishToggle: async () => {
      const frame = await getFrame();
      for (const selector of PUBLISH_TOGGLE_SELECTORS) {
        const toolbarButton = await frame.$(selector).catch(() => null);
        if (!toolbarButton) continue;
        try { await toolbarButton.click(); return true; } catch { return false; }
      }
      return false;
    },
    pressEscape: async () => { await page.keyboard.press('Escape'); },
    deleteParagraph: (paragraph) => deleteBodyParagraph(env, paragraph),
    typeTag: async (tag) => {
      const input = await (await getFrame()).$(TAG_INPUT_SELECTOR).catch(() => null);
      if (!input) return false;
      await input.click();
      await page.keyboard.type(tag, { delay: 40 });
      await page.keyboard.press('Enter');
      return true;
    },
    delay: env.delay,
    log: env.log,
  };
}
