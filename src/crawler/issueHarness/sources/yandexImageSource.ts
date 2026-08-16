// src/crawler/issueHarness/sources/yandexImageSource.ts
// Yandex image search adapter for the issue harness — browser-based scraper.
// Follows the launch/page/try-finally lifecycle used by googleImageSearch.ts.
// Yandex frequently serves a captcha/robot-check page; we detect it and
// bail out gracefully rather than trying to solve or retry it.

import type { IssueCandidateImage, IssueSourceAdapter } from '../types.js';
import { launchAdaptedBrowser, createOptimizedAdaptedPage } from '../../../automation/browserAdapter.js';

const LOG = '[IssueSource:yandex]';

interface RawYandexImage {
  url: string;
  thumbnailUrl?: string;
}

/**
 * Extracts candidate image URLs from the currently loaded Yandex image
 * search page. Runs inside page.evaluate — must stay self-contained.
 * Prefers `img_href` parsed out of `serp-item` data-bem JSON attributes,
 * falling back to visible thumbnail <img> src values.
 */
function extractYandexImages(): RawYandexImage[] {
  const results: RawYandexImage[] = [];
  const seen = new Set<string>();

  const addCandidate = (url: string, thumbnailUrl?: string) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    const dedupeKey = url.split('?')[0];
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    results.push({ url, thumbnailUrl });
  };

  // Preferred: serp-item elements carry a data-bem JSON blob with img_href.
  const serpItems = document.querySelectorAll('[class*="serp-item"]');
  for (const el of Array.from(serpItems)) {
    for (const attr of Array.from(el.attributes)) {
      if (!attr.value || !attr.value.includes('img_href')) continue;
      const match = attr.value.match(/"img_href"\s*:\s*"([^"]+)"/);
      if (!match || !match[1]) continue;
      const decoded = match[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      const thumbEl = el.querySelector('img');
      const thumbSrc = thumbEl?.getAttribute('src') || '';
      const thumbnailUrl = thumbSrc.startsWith('//') ? `https:${thumbSrc}` : thumbSrc || undefined;
      addCandidate(decoded, thumbnailUrl);
    }
  }

  // Fallback: raw thumbnail <img> elements when no data-bem match was found.
  if (results.length === 0) {
    const thumbs = document.querySelectorAll('img.serp-item__thumb, img[class*="thumb"]');
    for (const img of Array.from(thumbs)) {
      let src = img.getAttribute('src') || '';
      if (src.startsWith('//')) src = `https:${src}`;
      addCandidate(src, src);
    }
  }

  return results;
}

/** True when the loaded page is a Yandex captcha/robot-check wall. */
function isCaptchaPage(html: string): boolean {
  return /captcha/i.test(html) || /SmartCaptcha/i.test(html) || /checkbox-captcha-form/i.test(html);
}

export const yandexImageSource: IssueSourceAdapter = {
  name: 'yandex',
  async search(query: string, maxImages: number): Promise<IssueCandidateImage[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];

    let browser;
    try {
      browser = await launchAdaptedBrowser();
      const page = await createOptimizedAdaptedPage(browser);

      const searchUrl = `https://yandex.com/images/search?text=${encodeURIComponent(trimmed)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

      const html = await page.content();
      if (isCaptchaPage(html)) {
        console.log(`${LOG} 캡차 감지 — 건너뜀`);
        return [];
      }

      // Scroll twice to trigger lazy-loaded thumbnails.
      await page.evaluate(async () => {
        window.scrollBy(0, 600);
        await new Promise((r) => setTimeout(r, 700));
        window.scrollBy(0, 600);
        await new Promise((r) => setTimeout(r, 500));
      });

      const raw = await page.evaluate(extractYandexImages);

      const results: IssueCandidateImage[] = raw.slice(0, maxImages).map((item) => ({
        url: item.url,
        thumbnailUrl: item.thumbnailUrl,
        sourceName: 'yandex',
        query: trimmed,
      }));

      console.log(`${LOG} "${trimmed}" → ${results.length}개`);
      return results;
    } catch (error) {
      console.warn(`${LOG} 실패: ${(error as Error).message}`);
      return [];
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Ignore close failures.
        }
      }
    }
  },
};
