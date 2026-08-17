// src/crawler/docCapture/pageCapturer.ts
// Stage 2: visit each official page with a real browser and capture viewport
// segments top-to-bottom. Uses a RAW page (not createOptimizedAdaptedPage)
// because that helper blocks font resources — acceptable for image scraping,
// fatal for document capture where the text IS the content.

import { launchAdaptedBrowser } from '../../automation/browserAdapter.js';
import type { CapturedSegment, OfficialPage } from './types.js';

const LOG = '[DocPageCapturer]';
const VIEWPORT = { width: 1280, height: 1000 };
const PAGE_TIMEOUT_MS = 25_000;
const SETTLE_MS = 1_200;

/** Pure: plan scroll offsets covering the page without overlapping wastefully. */
export function planScrollOffsets(
  scrollHeight: number,
  viewportHeight: number,
  maxSegments: number,
): number[] {
  const height = Math.max(0, Math.floor(scrollHeight));
  const vh = Math.max(1, Math.floor(viewportHeight));
  if (height <= vh) return [0];
  const step = Math.floor(vh * 0.85); // 15% overlap so table rows are never cut on both sides
  const offsets: number[] = [];
  for (let y = 0; y < height - vh * 0.3 && offsets.length < maxSegments; y += step) {
    offsets.push(Math.min(y, height - vh));
  }
  return [...new Set(offsets)];
}

/**
 * Capture up to maxSegments viewport slices per page.
 * Every failure is per-page contained — one dead page never kills the run.
 */
export async function captureOfficialPages(
  pages: OfficialPage[],
  maxSegmentsPerPage: number,
  onPage?: (pageIndex: number, url: string) => void,
): Promise<CapturedSegment[]> {
  if (pages.length === 0) return [];
  const segments: CapturedSegment[] = [];
  let browser;
  try {
    browser = await launchAdaptedBrowser();
    for (let pi = 0; pi < pages.length; pi++) {
      const official = pages[pi];
      onPage?.(pi, official.url);
      let page;
      try {
        page = await browser.newPage();
        await page.setViewportSize(VIEWPORT);
        await page.goto(official.url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
        await page.waitForTimeout(SETTLE_MS);

        const scrollHeight = await page.evaluate(() => document.body?.scrollHeight || 0);
        const offsets = planScrollOffsets(scrollHeight, VIEWPORT.height, maxSegmentsPerPage);
        for (let si = 0; si < offsets.length; si++) {
          await page.evaluate((y: number) => window.scrollTo(0, y), offsets[si]);
          await page.waitForTimeout(450); // lazy content + sticky header settle
          const buffer = (await page.screenshot({ type: 'png' })) as Buffer;
          segments.push({
            buffer,
            sourceUrl: official.url,
            pageTitle: official.title,
            segmentIndex: si,
          });
        }
        console.log(`${LOG} 📸 ${official.url.slice(0, 70)} → ${offsets.length}컷 (전체높이 ${scrollHeight}px)`);
      } catch (error) {
        console.warn(`${LOG} ⚠️ 페이지 캡처 실패 (건너뜀): ${official.url.slice(0, 70)} — ${(error as Error).message}`);
      } finally {
        try { await page?.close(); } catch { /* ignore */ }
      }
    }
  } catch (error) {
    console.warn(`${LOG} ❌ 브라우저 세션 실패: ${(error as Error).message}`);
  } finally {
    try { await browser?.close(); } catch { /* ignore */ }
  }
  console.log(`${LOG} ✅ 총 ${segments.length}컷 캡처`);
  return segments;
}
