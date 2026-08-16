// src/crawler/issueHarness/sources/dcinsideSource.ts
// DCinside adapter — two stages:
//   1) site search to find gallery post URLs for the query
//   2) fetch each post's HTML and extract viewimage.php image URLs
// DCinside frequently blocks plain fetches (403) — every network call is
// caught individually so a block on one stage never throws out of search().

import type { IssueCandidateImage, IssueSourceAdapter } from '../types.js';

const LOG = '[IssueSource:dcinside]';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REFERER = 'https://www.dcinside.com/';
const SEARCH_TIMEOUT_MS = 10000;
const POST_TIMEOUT_MS = 8000;
const MAX_POSTS = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPause(minMs: number, maxMs: number): Promise<void> {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Extract post view links from a DCinside search results page, deduped and
 * capped. Matches gall.dcinside.com board/view URLs including the
 * mgallery/mini gallery variants. Pure function for tests.
 */
export function extractDcPostLinks(html: string, cap: number): string[] {
  if (!html) return [];
  const re = /https:\/\/gall\.dcinside\.com\/(?:mgallery\/|mini\/)?board\/view\/[^"'\s<>]*/g;
  const seen = new Set<string>();
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const url = unescapeHtml(match[0]);
    if (seen.has(url)) continue;
    seen.add(url);
    links.push(url);
    if (links.length >= cap) break;
  }
  return links;
}

/**
 * Extract dcimg viewimage.php image URLs from a DCinside post page,
 * deduped. Pure function for tests.
 */
export function extractDcImageUrls(html: string): string[] {
  if (!html) return [];
  const re = /https:\/\/dcimg[0-9]*\.dcinside\.(?:com|co\.kr)\/viewimage\.php[^"'\s<>]+/g;
  const seen = new Set<string>();
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const url = unescapeHtml(match[0]);
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': DESKTOP_UA, Referer: REFERER },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (error) {
    console.warn(`${LOG} 요청 실패 (${url}): ${(error as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const dcinsideSource: IssueSourceAdapter = {
  name: 'dcinside',
  async search(query: string, maxImages: number): Promise<IssueCandidateImage[]> {
    if (!query || !query.trim()) return [];
    const trimmed = query.trim();
    try {
      const searchUrl = `https://search.dcinside.com/post/q/${encodeURIComponent(trimmed)}`;
      const searchHtml = await fetchText(searchUrl, SEARCH_TIMEOUT_MS);
      if (!searchHtml) {
        console.warn(`${LOG} 검색 실패 또는 차단됨 — 건너뜀`);
        return [];
      }

      const postUrls = extractDcPostLinks(searchHtml, MAX_POSTS);
      if (postUrls.length === 0) return [];

      const results: IssueCandidateImage[] = [];
      for (const postUrl of postUrls) {
        if (results.length >= maxImages) break;
        const postHtml = await fetchText(postUrl, POST_TIMEOUT_MS);
        if (postHtml) {
          const imageUrls = extractDcImageUrls(postHtml);
          for (const imageUrl of imageUrls) {
            if (results.length >= maxImages) break;
            results.push({
              url: imageUrl,
              thumbnailUrl: imageUrl,
              sourceName: 'dcinside',
              query: trimmed,
            });
          }
        }
        await randomPause(200, 500);
      }

      console.log(`${LOG} "${trimmed}" → ${results.length}개`);
      return results;
    } catch (error) {
      console.warn(`${LOG} 실패: ${(error as Error).message}`);
      return [];
    }
  },
};
