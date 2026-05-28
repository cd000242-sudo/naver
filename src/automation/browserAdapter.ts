/**
 * Playwright-based browser adapter — drop-in replacement for the legacy
 * `src/crawler/utils/browserFactory.ts` (Puppeteer + stealth).
 *
 * SPEC-MIGRATION-2026 M2 P3 — first concrete migration step.
 *
 * Public API (intentionally mirrors browserFactory):
 *   - launchAdaptedBrowser(opts?)         → AdaptedBrowser
 *   - createOptimizedAdaptedPage(browser) → AdaptedPage
 *
 * Differences from Puppeteer that callers must know:
 *   - `browser.pages()` is replaced by `browser.contexts()[0].pages()` —
 *     the adapter exposes `.pages()` as a convenience method.
 *   - Request interception uses `page.route('**\/*', ...)` instead of
 *     `page.setRequestInterception(true)` + `page.on('request', ...)`.
 *
 * The legacy `browserFactory.ts` continues to exist for compatibility while
 * call sites migrate one at a time (browserFactory consumers: googleImageSearch,
 * sourceCollector). This file is the canonical new path forward.
 */

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext, Page } from 'playwright';
import { getChromiumExecutablePath } from '../browserUtils.js';
import { getProxyUrl } from '../crawler/utils/proxyManager.js';

// Apply stealth once at module load — same pattern as CoupangProvider.
chromium.use(stealth());

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AdaptedBrowser {
  readonly raw: Browser;
  readonly context: BrowserContext;
  /** Convenience: list pages in the default context (Puppeteer parity). */
  pages(): Page[];
  /** Convenience: open a new page in the default context. */
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

export type AdaptedPage = Page;

// ---------------------------------------------------------------------------
// Configuration shared with the legacy factory
// ---------------------------------------------------------------------------

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const VIEWPORT = { width: 1920, height: 1080 };

const COMMON_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--js-flags=--max-old-space-size=256',
  '--disable-extensions',
  '--mute-audio',
];

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

/**
 * Boots a Playwright chromium browser with the same stealth + proxy + args
 * configuration the legacy Puppeteer factory uses.
 *
 * Returns an AdaptedBrowser that exposes Puppeteer-parity convenience methods
 * (pages/newPage) so callers can switch with minimal churn.
 */
export async function launchAdaptedBrowser(opts?: {
  headless?: boolean;
}): Promise<AdaptedBrowser> {
  const executablePath = await getChromiumExecutablePath();
  const proxyUrl = await getProxyUrl();

  const args = [...COMMON_ARGS];
  if (proxyUrl) {
    args.push(`--proxy-server=${proxyUrl}`);
    console.log(`[BrowserAdapter] 🌐 프록시 적용: ${proxyUrl}`);
  }

  const browser = await chromium.launch({
    headless: opts?.headless !== undefined ? opts.headless : true,
    executablePath,
    args,
  });

  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    viewport: VIEWPORT,
  });

  // Replicate Puppeteer's evaluateOnNewDocument — anti-detect script injected
  // into every new page in this context.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // @ts-expect-error legacy chrome shim
    window.chrome = { runtime: {} };
  });

  return {
    raw: browser,
    context,
    pages: () => context.pages(),
    newPage: () => context.newPage(),
    close: () => browser.close(),
  };
}

// ---------------------------------------------------------------------------
// Page hardening (resource blocking + viewport)
// ---------------------------------------------------------------------------

/**
 * Opens a new page in the adapted browser's default context and applies the
 * same resource-blocking and viewport rules the legacy factory does.
 *
 * Resource interception uses Playwright's route() instead of Puppeteer's
 * setRequestInterception, but the user-visible behavior is identical.
 */
export async function createOptimizedAdaptedPage(
  browser: AdaptedBrowser,
): Promise<AdaptedPage> {
  const page = await browser.newPage();

  await page.route('**/*', (route) => {
    const request = route.request();
    const type = request.resourceType();
    const url = request.url();

    if (
      type === 'font' ||
      type === 'media' ||
      url.includes('google-analytics') ||
      url.includes('facebook') ||
      url.includes('tracking')
    ) {
      route.abort();
      return;
    }
    route.continue();
  });

  // Viewport was set on the context but Playwright also accepts per-page sizing.
  await page.setViewportSize(VIEWPORT);

  return page;
}

// ---------------------------------------------------------------------------
// Pure helpers — exposed for tests
// ---------------------------------------------------------------------------

/**
 * Returns true when the URL or resource type should be aborted by the
 * resource-blocking router. Pure function so the policy can be unit-tested
 * without a live browser.
 */
export function shouldBlockResource(
  resourceType: string,
  url: string,
): boolean {
  if (resourceType === 'font' || resourceType === 'media') return true;
  if (url.includes('google-analytics')) return true;
  if (url.includes('facebook')) return true;
  if (url.includes('tracking')) return true;
  return false;
}

/**
 * Returns the canonical user-agent string the adapter applies to every new
 * page. Exposed so tests can assert parity with the legacy factory.
 */
export function getDefaultUserAgent(): string {
  return DEFAULT_USER_AGENT;
}

/**
 * Returns the canonical viewport size shared between context and per-page.
 */
export function getDefaultViewport(): { width: number; height: number } {
  return { ...VIEWPORT };
}
