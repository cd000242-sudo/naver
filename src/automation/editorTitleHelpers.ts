import type { ElementHandle, Frame, Page } from 'puppeteer';
import { SELECTORS, getSelectorStrings, waitForElement } from './selectors';
import {
  collectEditorReadinessSnapshot,
  formatEditorReadinessDiagnostics,
} from './editorReadinessDiagnostics.js';

export async function findEditorTitleInputElement(
  frame: Frame,
  page: Page,
  timeoutMs = 20000,
  log?: (message: string) => void
): Promise<ElementHandle<Element> | null> {
  const titleTextElement = await waitForElement(frame, SELECTORS.editor.titleText, 'editor.titleText', {
    visible: true,
    timeout: Math.max(5000, Math.floor(timeoutMs / 2)),
  });
  if (titleTextElement) return titleTextElement as ElementHandle<Element>;

  const titleSectionElement = await waitForElement(frame, SELECTORS.editor.documentTitle, 'editor.documentTitle', {
    visible: true,
    timeout: Math.max(5000, Math.floor(timeoutMs / 2)),
  });
  if (titleSectionElement) return titleSectionElement as ElementHandle<Element>;

  const heuristicHandle = await frame.evaluateHandle(() => {
    const isVisible = (el: Element): boolean => {
      const html = el as HTMLElement;
      const rect = html.getBoundingClientRect();
      const style = window.getComputedStyle(html);
      return rect.width > 80
        && rect.height > 16
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && html.offsetParent !== null;
    };

    const scoreCandidate = (el: Element): number => {
      const html = el as HTMLElement;
      const text = `${html.className || ''} ${html.id || ''} ${html.getAttribute('data-name') || ''} ${html.getAttribute('aria-label') || ''} ${html.getAttribute('placeholder') || ''} ${html.getAttribute('data-placeholder') || ''}`;
      const lower = text.toLowerCase();
      let score = 0;
      if (lower.includes('documenttitle')) score += 90;
      if (lower.includes('title')) score += 50;
      if (text.includes('?쒕ぉ')) score += 70;
      if (html.getAttribute('contenteditable') === 'true') score += 30;
      if (html.tagName === 'INPUT' || html.tagName === 'TEXTAREA') score += 25;
      const rect = html.getBoundingClientRect();
      if (rect.top < Math.max(window.innerHeight * 0.45, 360)) score += 15;
      if (rect.height > 24 && rect.height < 180) score += 10;
      if (lower.includes('section-text') || lower.includes('module-text') || lower.includes('paragraph')) score -= 80;
      return score;
    };

    const selectors = [
      '.se-section-documentTitle',
      '.se-documentTitle',
      '[data-name="documentTitle"]',
      '[class*="documentTitle"]',
      '[class*="DocumentTitle"]',
      '[contenteditable="true"][aria-label*="?쒕ぉ"]',
      '[contenteditable="true"][data-placeholder*="?쒕ぉ"]',
      '[placeholder*="?쒕ぉ"]',
      'input[aria-label*="?쒕ぉ"]',
      'textarea[aria-label*="?쒕ぉ"]',
      '[contenteditable="true"]',
    ];

    const candidates = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((el, index, list) => list.indexOf(el) === index)
      .filter(isVisible)
      .map((el) => ({ el, score: scoreCandidate(el) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.el || null;
  }).catch(() => null);

  const heuristicElement = heuristicHandle?.asElement() as ElementHandle<Element> | null;
  if (heuristicElement) {
    log?.('   ???쒕ぉ ?낅젰 ?곸뿭???대━?ㅽ떛 fallback?쇰줈 李얠븯?듬땲??');
    return heuristicElement;
  }
  await heuristicHandle?.dispose().catch(() => undefined);

  const pageFallback = await waitForElement(page, SELECTORS.editor.documentTitle, 'page.editor.documentTitle', {
    visible: true,
    timeout: 3000,
  });
  return pageFallback as ElementHandle<Element> | null;
}

export async function readEditorTitleText(frame: Frame): Promise<string> {
  const selectors = [
    ...getSelectorStrings(SELECTORS.editor.titleText),
    ...getSelectorStrings(SELECTORS.editor.documentTitle),
  ];

  return await frame.evaluate((candidateSelectors) => {
    for (const selector of candidateSelectors) {
      const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
      if (!el) continue;
      const value = 'value' in el ? String(el.value || '') : String(el.innerText || el.textContent || '');
      if (value.trim()) return value.trim();
    }
    return '';
  }, selectors).catch(() => '');
}

export async function setTitleByDomEvent(
  titleElement: ElementHandle<Element>,
  titleText: string
): Promise<string> {
  return await titleElement.evaluate((element, value) => {
    const root = element as HTMLElement;
    const target = (
      root.matches('input, textarea, [contenteditable="true"]')
        ? root
        : root.querySelector('input, textarea, [contenteditable="true"], .se-title-text')
    ) as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
    if (!target) return '';

    target.focus();
    if ('value' in target) {
      target.value = value;
    } else {
      target.textContent = value;
    }

    target.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
    target.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return 'value' in target ? String(target.value || '') : String(target.innerText || target.textContent || '');
  }, titleText).catch(() => '');
}

export async function collectEditorTitleDiagnostics(frame: Frame, page: Page): Promise<string> {
  return formatEditorReadinessDiagnostics(
    await collectEditorReadinessSnapshot(frame, page)
  );
}
