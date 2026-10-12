// src/automation/bareUrlCleanupDom.ts
// Browser-context helper: after SmartEditor turns a bare URL into a link card, delete the leftover URL paragraph.
// Runs inside frame.evaluate(fn, targetUrl), so it must stay self-contained (no imports, only `document`).
// [2026-10-13] The previous in-page version removed the paragraph's whole `.se-component` and did so for EVERY
//   URL-only paragraph in the document. SmartEditor keeps many paragraphs in one text component, so inserting
//   the 2nd CTA wiped the 1st CTA's separator + label (and any URL whose card had not rendered yet) — the post
//   ended with only the last link card. Now: only paragraphs holding `targetUrl` (all URL-only paragraphs when
//   no target is given), paragraph-level removal, and the component goes only when nothing else is left in it.

export const BARE_URL_CARD_SELECTORS = [
  '.se-oglink',
  '.se-module-oglink',
  '.se-oembed',
  '.se-module-oembed',
  '.se-link-preview',
  '[data-module="oglink"]',
  '[class*="oglink"]',
  '[class*="oembed"]',
  '.se-section-oglink',
];

/** Returns how many leftover URL paragraphs were removed. */
export function removeBareUrlParagraphs(targetUrl?: string): number {
  const cardSelectors = [
    '.se-oglink', '.se-module-oglink', '.se-oembed', '.se-module-oembed', '.se-link-preview',
    '[data-module="oglink"]', '[class*="oglink"]', '[class*="oembed"]', '.se-section-oglink',
  ];
  const hasLinkCard = cardSelectors.some((selector) => document.querySelector(selector));
  if (!hasLinkCard) return 0;

  const comparable = (value: string): string => String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  const target = comparable(String(targetUrl || ''));
  const decoration = '(?:\\s|👉|▶|→|:|-|｜|\\||\\(|\\)|\\[|\\]|바로가기|보기|자세히|관련|공식|사이트|이전글|보러가기|더보기)*';
  const urlOnlyPattern = new RegExp(`^${decoration}https?:\\/\\/\\S+${decoration}$`, 'i');
  const paragraphs = Array.from(
    document.querySelectorAll('.se-text-paragraph, .se-module-text p, [contenteditable="true"] p'),
  ) as HTMLElement[];
  let removedCount = 0;

  for (const paragraph of paragraphs) {
    if (!paragraph.isConnected) continue;
    if (cardSelectors.some((selector) => paragraph.closest(selector))) continue;
    const text = (paragraph.innerText || paragraph.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || !/https?:\/\//i.test(text)) continue;
    if (!urlOnlyPattern.test(text)) continue;
    if (target) {
      const match = text.match(/https?:\/\/\S+/i);
      if (!match || comparable(match[0]) !== target) continue;
    }

    const component = paragraph.closest('.se-component') as HTMLElement | null;
    paragraph.remove();
    removedCount += 1;
    if (component && !cardSelectors.some((selector) => component.matches(selector) || component.closest(selector))) {
      const remaining = Array.from(component.querySelectorAll('.se-text-paragraph, p')) as HTMLElement[];
      const leftover = remaining.some((p) => (p.innerText || p.textContent || '').trim().length > 0);
      if (!leftover && remaining.length === 0) component.remove();
    }
  }

  if (removedCount > 0) {
    const editorRoot = document.querySelector('.se-main-container, .se-section-text, [contenteditable="true"]') as HTMLElement | null;
    if (editorRoot) {
      for (const eventType of ['input', 'change', 'keyup', 'blur']) {
        editorRoot.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
      }
    }
  }
  return removedCount;
}
