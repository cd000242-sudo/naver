import type { Frame } from 'puppeteer';
import type { EditorCommitVisibleSnapshot } from './publishCommitHook.js';

interface IsolatedRealmEvaluator {
  evaluate<Result>(pageFunction: () => Result): Promise<Awaited<Result>>;
}

interface FrameWithIsolatedRealm extends Frame {
  isolatedRealm(): IsolatedRealmEvaluator;
}

function requireIsolatedRealm(frame: Frame): IsolatedRealmEvaluator {
  const candidate = frame as FrameWithIsolatedRealm;
  if (typeof candidate.isolatedRealm !== 'function') {
    throw new Error('V3_VISIBLE_SNAPSHOT_ISOLATED_REALM_UNAVAILABLE');
  }
  return candidate.isolatedRealm();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Fails closed if the editor changes while the trusted commit hook performs
 * its final validation and durable handoff consume.
 */
export function assertEditorVisibleSnapshotUnchanged(
  expected: EditorCommitVisibleSnapshot,
  actual: EditorCommitVisibleSnapshot,
): void {
  const sameCards = expected.linkCards.length === actual.linkCards.length
    && expected.linkCards.every((card, index) => {
      const candidate = actual.linkCards[index];
      return candidate !== undefined
        && card.text === candidate.text
        && card.transformed === candidate.transformed
        && sameStrings(card.urls, candidate.urls);
    });
  if (
    expected.title !== actual.title
    || expected.bodyText !== actual.bodyText
    || expected.opaqueVisualCount !== actual.opaqueVisualCount
    || !sameCards
    || !sameStrings(expected.bareUrls, actual.bareUrls)
    || !sameStrings(expected.externalAnchorUrls, actual.externalAnchorUrls)
  ) {
    throw new Error('V3_VISIBLE_SNAPSHOT_CHANGED_BEFORE_COMMIT');
  }
}

/**
 * Reads the final user-visible SmartEditor surface. This is V3-only and is
 * deliberately independent from the legacy pre-publish observer.
 */
export async function collectEditorVisibleSnapshot(
  frame: Frame,
): Promise<EditorCommitVisibleSnapshot> {
  // The page main world may patch DOM prototypes/getters. Puppeteer's isolated
  // realm has pristine intrinsics while observing the same rendered document.
  return await requireIsolatedRealm(frame).evaluate(() => {
    const MAX_TITLE = 64 * 1024;
    const MAX_BODY = 4 * 1024 * 1024;
    const MAX_CARDS = 64;
    const MAX_CARD_TEXT = 64 * 1024;
    const MAX_URLS = 64;
    const MAX_URL = 8 * 1024;
    const MAX_VISUALS = 10_000;
    const cardSelector = [
      '.se-oglink',
      '.se-module-oglink',
      '.se-oembed',
      '.se-module-oembed',
      '.se-link-preview',
      '[data-module="oglink"]',
      '.se-section-oglink',
    ].join(',');
    const visible = (element: Element): boolean => {
      const html = element as HTMLElement;
      const style = window.getComputedStyle(html);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && html.getClientRects().length > 0;
    };
    const textOf = (element: Element | null): string => {
      if (!element) return '';
      return ((element as HTMLElement).innerText || element.textContent || '').trim();
    };
    const firstVisible = (selectors: readonly string[]): Element | null => {
      for (const selector of selectors) {
        const found = [...document.querySelectorAll(selector)].find(visible);
        if (found) return found;
      }
      return null;
    };
    const title = textOf(firstVisible([
      '.se-documentTitle .se-text-paragraph',
      '.se-document-title .se-text-paragraph',
      '.se-title-text',
      '.se-title-input',
      '[data-placeholder="제목"]',
    ]));
    const bodyRoot = firstVisible([
      'article.se-components-wrap',
      '.se-canvas > article.se-components-wrap',
      '.se-content article.se-components-wrap',
      '.se-components-wrap',
      '.se-main-container',
    ]);
    const bodyText = textOf(bodyRoot);
    if (!title || title.length > MAX_TITLE || !bodyText || bodyText.length > MAX_BODY) {
      throw new Error('V3_VISIBLE_SNAPSHOT_UNREADABLE');
    }

    // Text-only V3 must reject serialized editor visuals even when CSS hides
    // them in the current viewport. Collapse nested SmartEditor wrappers so a
    // component and its child <img> count as one opaque surface.
    const visualSelector = [
      'img',
      'picture',
      'svg',
      'canvas',
      'video',
      'audio',
      'iframe',
      'object',
      'embed',
      '.se-component.se-image',
      '.se-component.se-imageStrip',
      '.se-component.se-placesMap',
      '.se-component-image',
      '.se-section-image',
      '.se-module-image',
      '.se-module-map-image',
    ].join(',');
    const visualCandidates = bodyRoot
      ? [...bodyRoot.querySelectorAll(visualSelector)]
      : [];
    const visualRoots = [...new Set(visualCandidates)].filter(candidate => (
      !visualCandidates.some(other => other !== candidate && other.contains(candidate))
    ));
    const opaqueVisualCount = visualRoots.length;
    if (opaqueVisualCount > MAX_VISUALS) throw new Error('V3_VISIBLE_SNAPSHOT_TOO_LARGE');

    const cardCandidates = bodyRoot
      ? [...bodyRoot.querySelectorAll(cardSelector)].filter(visible)
      : [];
    const cardRoots = [...new Set(cardCandidates)].filter(candidate => (
      !cardCandidates.some(other => other !== candidate && other.contains(candidate))
    ));
    if (cardRoots.length > MAX_CARDS) throw new Error('V3_VISIBLE_SNAPSHOT_TOO_LARGE');
    const urlPattern = /https?:\/\/[^\s<>"']+/giu;
    const linkCards = cardRoots.map(card => {
      const text = textOf(card);
      if (!text || text.length > MAX_CARD_TEXT) throw new Error('V3_VISIBLE_CARD_UNREADABLE');
      const urls = new Set<string>();
      const urlElements = [card, ...card.querySelectorAll('a,[href],[data-url],[data-link]')];
      for (const element of urlElements) {
        for (const attribute of ['href', 'data-url', 'data-link']) {
          const value = element.getAttribute(attribute)?.trim();
          if (value && /^https?:\/\//iu.test(value)) urls.add(value);
        }
      }
      for (const match of text.match(urlPattern) ?? []) urls.add(match);
      const values = [...urls];
      if (values.length > 16 || values.some(url => url.length > MAX_URL)) {
        throw new Error('V3_VISIBLE_CARD_UNREADABLE');
      }
      const metadataText = values.reduce(
        (current, url) => current.split(url).join(' '),
        text,
      ).replace(/\s+/gu, ' ').trim();
      return {
        text,
        urls: values,
        transformed: values.length > 0 && metadataText.length >= 2,
      };
    });

    const bareUrls = new Set<string>();
    if (bodyRoot) {
      const walker = document.createTreeWalker(bodyRoot, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        if (parent && !parent.closest(cardSelector) && visible(parent)) {
          for (const match of (node.nodeValue || '').match(urlPattern) ?? []) {
            bareUrls.add(match.replace(/[),.;!?]+$/u, ''));
          }
        }
        node = walker.nextNode();
      }
    }
    const bareUrlValues = [...bareUrls];
    if (bareUrlValues.length > MAX_URLS || bareUrlValues.some(url => url.length > MAX_URL)) {
      throw new Error('V3_VISIBLE_SNAPSHOT_TOO_LARGE');
    }

    // A label-only anchor has no URL in innerText, so scan link-bearing DOM
    // attributes outside recognized cards. Only same-document #fragments are
    // presentation-only and therefore allowed by the strict text contract.
    const externalAnchorUrls = new Set<string>();
    if (bodyRoot) {
      const linkedElements = bodyRoot.querySelectorAll('a[href],[data-url],[data-link]');
      for (const element of linkedElements) {
        if (element.closest(cardSelector)) continue;
        for (const attribute of ['href', 'data-url', 'data-link']) {
          const rawValue = element.getAttribute(attribute);
          if (rawValue === null) continue;
          const value = rawValue.trim();
          if (value.startsWith('#')) continue;
          externalAnchorUrls.add(value || `<empty-${attribute}>`);
        }
      }
    }
    const externalAnchorValues = [...externalAnchorUrls];
    if (
      externalAnchorValues.length > MAX_URLS
      || externalAnchorValues.some(url => url.length > MAX_URL)
    ) throw new Error('V3_VISIBLE_SNAPSHOT_TOO_LARGE');

    return {
      title,
      bodyText,
      linkCards,
      bareUrls: bareUrlValues,
      externalAnchorUrls: externalAnchorValues,
      opaqueVisualCount,
    };
  });
}
