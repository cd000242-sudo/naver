// src/crawler/issueHarness/sources/daumImageSource.ts
// Daum image search adapter for the issue harness — browser-based scraper.
// Follows the launch/page/try-finally lifecycle used by googleImageSearch.ts.
// Daum's thumbnail CDN (kakaocdn) often keeps the original image URL
// URL-encoded in a `fname=` query param; we decode it when present.

import type { IssueCandidateImage, IssueSourceAdapter } from '../types.js';
import { launchAdaptedBrowser, createOptimizedAdaptedPage } from '../../../automation/browserAdapter.js';

const LOG = '[IssueSource:daum]';

interface RawDaumImage {
  url: string;
  thumbnailUrl?: string;
}

/**
 * Extracts candidate image URLs from the currently loaded Daum image search
 * page. Runs inside page.evaluate — must stay self-contained (no closures
 * over outer scope beyond its own parameters).
 */
function extractDaumImages(): RawDaumImage[] {
  const results: RawDaumImage[] = [];
  const seen = new Set<string>();

  const imgElements = document.querySelectorAll('img');
  for (const img of Array.from(imgElements)) {
    const src = img.getAttribute('src') || '';
    const dataOriginal = img.getAttribute('data-original-src') || '';
    const dataSrc = img.getAttribute('data-src') || '';
    const rawSrc = dataOriginal || dataSrc || src;

    if (!rawSrc || rawSrc.startsWith('data:')) continue;
    if (!/^https?:\/\//i.test(rawSrc)) continue;
    if (rawSrc.length < 20) continue;

    let candidateUrl = rawSrc;
    let thumbnailUrl: string | undefined;

    // kakaocdn proxy thumbnails carry the original URL in `fname=`.
    try {
      const parsed = new URL(rawSrc);
      const fname = parsed.searchParams.get('fname');
      if (fname) {
        const decoded = decodeURIComponent(fname);
        if (/^https?:\/\//i.test(decoded)) {
          candidateUrl = decoded;
          thumbnailUrl = rawSrc;
        }
      }
    } catch {
      // Malformed URL — keep the raw src as-is.
    }

    const dedupeKey = candidateUrl.split('?')[0];
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push({ url: candidateUrl, thumbnailUrl });
  }

  return results;
}

export const daumImageSource: IssueSourceAdapter = {
  name: 'daum',
  async search(query: string, maxImages: number): Promise<IssueCandidateImage[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];

    let browser;
    try {
      browser = await launchAdaptedBrowser();
      const page = await createOptimizedAdaptedPage(browser);

      const searchUrl = `https://search.daum.net/search?w=img&q=${encodeURIComponent(trimmed)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // Scroll twice to trigger lazy-loaded thumbnails.
      await page.evaluate(async () => {
        window.scrollBy(0, 600);
        await new Promise((r) => setTimeout(r, 700));
        window.scrollBy(0, 600);
        await new Promise((r) => setTimeout(r, 500));
      });

      const raw = await page.evaluate(extractDaumImages);

      const results: IssueCandidateImage[] = raw.slice(0, maxImages).map((item) => ({
        url: item.url,
        thumbnailUrl: item.thumbnailUrl,
        sourceName: 'daum',
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
