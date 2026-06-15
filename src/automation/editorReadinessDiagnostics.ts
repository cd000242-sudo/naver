import {
  isChromeErrorUrl,
  isNaverBlogDomainUrl,
  isNaverLoginUrl,
  isNaverWriteEditorUrl,
} from './editorUrlState.js';
import type { Frame, Page } from 'puppeteer';

export const EDITOR_TITLE_DIAGNOSTIC_SELECTORS = [
  '.se-section-documentTitle',
  '.se-documentTitle',
  '[data-name="documentTitle"]',
  '[class*="documentTitle"]',
  '[contenteditable="true"]',
  '.se-section-text',
  '.se-main-container',
] as const;

export type EditorUrlState =
  | 'browser-error'
  | 'login'
  | 'writer'
  | 'blog-home'
  | 'other';

export interface EditorReadinessSnapshot {
  pageUrl: string;
  pageTitle?: string;
  frameUrl: string;
  selectorCounts: Record<string, number>;
}

export interface EditorReadinessSummary {
  urlState: EditorUrlState;
  titleReady: boolean;
  bodyReady: boolean;
}

function classifyEditorUrlState(pageUrl: string, frameUrl: string): EditorUrlState {
  const combined = `${pageUrl}\n${frameUrl}`;
  if (isChromeErrorUrl(pageUrl) || isChromeErrorUrl(frameUrl)) return 'browser-error';
  if (isNaverLoginUrl(pageUrl) || isNaverLoginUrl(frameUrl)) return 'login';
  if (isNaverWriteEditorUrl(combined)) return 'writer';
  if (isNaverBlogDomainUrl(pageUrl) || isNaverBlogDomainUrl(frameUrl)) return 'blog-home';
  return 'other';
}

function countAny(selectorCounts: Record<string, number>, selectors: readonly string[]): boolean {
  return selectors.some((selector) => (selectorCounts[selector] || 0) > 0);
}

export function summarizeEditorReadiness(snapshot: EditorReadinessSnapshot): EditorReadinessSummary {
  return {
    urlState: classifyEditorUrlState(snapshot.pageUrl, snapshot.frameUrl),
    titleReady: countAny(snapshot.selectorCounts, [
      '.se-section-documentTitle',
      '.se-documentTitle',
      '[data-name="documentTitle"]',
      '[class*="documentTitle"]',
    ]),
    bodyReady: countAny(snapshot.selectorCounts, ['.se-section-text', '.se-main-container']),
  };
}

export function shouldRetryEditorReadiness(snapshot: EditorReadinessSnapshot): boolean {
  const summary = summarizeEditorReadiness(snapshot);

  return (
    (summary.urlState === 'writer' || summary.urlState === 'blog-home') &&
    !summary.titleReady &&
    !summary.bodyReady
  );
}

export async function collectEditorReadinessSnapshot(
  frame: Frame,
  page: Page
): Promise<EditorReadinessSnapshot> {
  const frameUrl = frame.url?.() || '(frame url unavailable)';
  const pageUrl = page.url();
  const pageTitle = await page.title().catch(() => '');
  const selectorCounts = await frame.evaluate((selectors) => {
    return Object.fromEntries(selectors.map((selector) => {
      const count = document.querySelectorAll(selector).length;
      return [selector, count];
    }));
  }, EDITOR_TITLE_DIAGNOSTIC_SELECTORS).catch((error) => ({
    'diagnostics failed': 1,
    [(error as Error).message]: 1,
  }));

  return {
    pageUrl,
    pageTitle,
    frameUrl,
    selectorCounts,
  };
}

export function formatEditorReadinessDiagnostics(snapshot: EditorReadinessSnapshot): string {
  const summary = summarizeEditorReadiness(snapshot);
  const selectors = EDITOR_TITLE_DIAGNOSTIC_SELECTORS
    .map((selector) => `${selector}=${snapshot.selectorCounts[selector] || 0}`)
    .join(', ');

  return [
    `pageUrl=${snapshot.pageUrl}`,
    `pageTitle=${snapshot.pageTitle || ''}`,
    `frameUrl=${snapshot.frameUrl}`,
    `urlState=${summary.urlState}`,
    `titleReady=${summary.titleReady}`,
    `bodyReady=${summary.bodyReady}`,
    `selectors=[${selectors}]`,
  ].join(', ');
}
