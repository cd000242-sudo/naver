// src/automation/subtitleRecovery.ts
// When a heading (quotation block) was typed but the DOM check cannot find the text, the caret had slipped
// out of the quotation — live 2026-10-11 02:46: the text never landed, the caret sat in Naver's hidden
// `#input_buffer` iframe, and the post published with that section heading missing ("소제목을 빼먹는다").
// The quotation block itself is inserted through the toolbar, so it exists; this module clicks into it
// (live DOM 2026-10-13: `.se-component.se-quotation` → `.se-section-quotation` → `.se-quotation-container`,
// 45px high) and types the heading once more, then re-verifies. Never throws — the caller decides.

import { safeKeyboardType } from './typingUtils.js';

export const QUOTATION_COMPONENT_SELECTOR = '.se-component.se-quotation';
export const QUOTATION_INNER_SELECTORS = ['.se-quotation-container', '.se-section-quotation', '.se-quote'];

export interface QuotationTarget {
  readonly found: boolean;
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

/** Runs inside the editor frame (self-contained): the last quotation block's inner box and current text. */
export function locateLastQuotationInPage(args: { componentSelector: string; innerSelectors: string[] }): QuotationTarget {
  const miss = { found: false, x: 0, y: 0, text: '' };
  const components = document.querySelectorAll(args.componentSelector);
  const component = components[components.length - 1] as HTMLElement | undefined;
  if (!component) return miss;
  const text = String(component.innerText || component.textContent || '').replace(/\s+/g, ' ').trim();
  for (const selector of args.innerSelectors) {
    const node = component.querySelector(selector) as HTMLElement | null;
    if (!node) continue;
    node.scrollIntoView({ block: 'center' });
    const rect = node.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    return { found: true, x: rect.left + Math.min(rect.width / 2, 160), y: rect.top + rect.height / 2, text };
  }
  return { ...miss, text };
}

async function resolveFrameOffset(page: any): Promise<{ x: number; y: number }> {
  try {
    const frameElement = await page.$('iframe#mainFrame, iframe.se-iframe, iframe[name="mainFrame"]');
    if (!frameElement) return { x: 0, y: 0 };
    const rect = await frameElement.boundingBox();
    return rect ? { x: rect.x, y: rect.y } : { x: 0, y: 0 };
  } catch {
    return { x: 0, y: 0 };
  }
}

export interface SubtitleRecoveryDeps {
  log(message: string): void;
  delay(ms: number): Promise<void>;
  verify(): Promise<boolean>;
}

/**
 * Clicks into the last quotation block and types `expectedText` again. Returns the re-verification
 * result; false when the block cannot be found, already holds the text, or the retype still fails.
 */
export async function recoverSubtitleTyping(page: any, frame: any, expectedText: string, deps: SubtitleRecoveryDeps): Promise<boolean> {
  const text = String(expectedText || '').trim();
  if (!text) return false;
  try {
    const target: QuotationTarget = await frame.evaluate(locateLastQuotationInPage, {
      componentSelector: QUOTATION_COMPONENT_SELECTOR,
      innerSelectors: [...QUOTATION_INNER_SELECTORS],
    }).catch(() => ({ found: false, x: 0, y: 0, text: '' }));
    if (!target.found) {
      deps.log('   ⚠️ 소제목 재입력 — 인용구 블록을 찾지 못해 건너뜁니다.');
      return false;
    }
    if (target.text.includes(text)) {
      deps.log('   ℹ️ 소제목 재입력 — 인용구 안에 이미 글자가 있어 건너뜁니다.');
      return deps.verify();
    }
    const offset = await resolveFrameOffset(page);
    deps.log(`   🔁 소제목이 인용구에 들어가지 않아 블록을 눌러 다시 입력합니다: "${text}"`);
    await page.mouse.click(offset.x + target.x, offset.y + target.y);
    await deps.delay(300);
    await page.keyboard.press('End');
    await safeKeyboardType(page, text, { delay: 30 });
    await deps.delay(400);
    const verified = await deps.verify();
    deps.log(verified ? '   ✅ 소제목 재입력 확인' : '   ⚠️ 소제목 재입력도 확인되지 않았습니다 (계속 진행)');
    return verified;
  } catch (error) {
    deps.log(`   ⚠️ 소제목 재입력 실패 (계속 진행): ${(error as Error)?.message || error}`);
    return false;
  }
}
