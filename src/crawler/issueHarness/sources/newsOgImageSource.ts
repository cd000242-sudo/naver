// src/crawler/issueHarness/sources/newsOgImageSource.ts
// News og:image adapter — two stages:
//   1) Naver News Open API to find recent article URLs for the query
//   2) fetch each article's HTML and extract its og:image meta tag
// Stage 1 goes through the single Naver gateway (src/naver): HUB/legacy keys,
// failover and quota rotation are handled there, not here.

import { callNaverSearch, resolveAllNaverCredentials } from '../../../naver/index.js';
import type { IssueCandidateImage, IssueSourceAdapter } from '../types.js';

const LOG = '[IssueSource:news-og]';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_ARTICLES = 8;
const MAX_BODY_BYTES = 200 * 1024;
const ARTICLE_TIMEOUT_MS = 8000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPause(minMs: number, maxMs: number): Promise<void> {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

/** Unescape the handful of HTML entities that show up in meta content attributes. */
function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Extract the og:image URL from an HTML document.
 * Accepts double-quote and single-quote attribute variants, and both
 * `property="og:image"` and `name="og:image"` forms. Pure function for tests.
 */
export function extractOgImage(html: string): string | null {
  if (!html) return null;
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["'][^>]*>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const url = unescapeHtml(m[1].trim());
      if (url) return url;
    }
  }
  return null;
}

function isLikelyLogo(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('logo') || lower.includes('default');
}

interface NewsApiItem { originallink?: string; link?: string }

async function searchNewsArticles(query: string): Promise<string[]> {
  const credentials = resolveAllNaverCredentials();
  const result = await callNaverSearch<{ items?: NewsApiItem[] }>(
    'news',
    { query, display: 10, sort: 'date' },
    { credentials, maxAttempts: Math.max(2, credentials.length), rotateOnQuota: true },
  );
  if (!result.ok) throw new Error(result.error ?? `HTTP ${result.status}`);
  const data = result.data ?? {};
  const seen = new Set<string>();
  const links: string[] = [];
  for (const item of data.items || []) {
    const raw = item.originallink || item.link;
    if (!raw || !/^https?:\/\//i.test(raw)) continue;
    let key: string;
    try {
      const parsed = new URL(raw);
      key = `${parsed.hostname}${parsed.pathname}`;
    } catch {
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(raw);
  }
  return links;
}

/** Read at most `limitBytes` of a response body as text, then stop the stream. */
async function readLimitedText(res: Response, limitBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
      if (total >= limitBytes) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore cancel errors
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

async function fetchArticleOgImage(articleUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ARTICLE_TIMEOUT_MS);
  try {
    const res = await fetch(articleUrl, {
      headers: { 'User-Agent': DESKTOP_UA },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const html = await readLimitedText(res, MAX_BODY_BYTES);
    const image = extractOgImage(html);
    if (!image || isLikelyLogo(image)) return null;
    return image;
  } finally {
    clearTimeout(timer);
  }
}

export const newsOgImageSource: IssueSourceAdapter = {
  name: 'news-og',
  async search(query: string, maxImages: number): Promise<IssueCandidateImage[]> {
    if (!query || !query.trim()) return [];
    const trimmed = query.trim();
    try {
      const credentials = resolveAllNaverCredentials();
      if (credentials.length === 0) {
        console.warn(`${LOG} API 키 없음 — 뉴스 og:image 소스 건너뜀`);
        return [];
      }

      let articleUrls: string[] = [];
      try {
        articleUrls = await searchNewsArticles(trimmed);
      } catch (error) {
        console.warn(`${LOG} 뉴스 검색 실패: ${(error as Error).message}`);
      }
      if (articleUrls.length === 0) return [];

      const targets = articleUrls.slice(0, MAX_ARTICLES);
      const results: IssueCandidateImage[] = [];
      for (const articleUrl of targets) {
        if (results.length >= maxImages) break;
        try {
          const image = await fetchArticleOgImage(articleUrl);
          if (image) {
            results.push({
              url: image,
              thumbnailUrl: image,
              sourceName: 'news-og',
              query: trimmed,
            });
          }
        } catch (error) {
          console.warn(`${LOG} 기사 파싱 실패 (${articleUrl}): ${(error as Error).message}`);
        }
        await randomPause(150, 400);
      }

      console.log(`${LOG} "${trimmed}" → ${results.length}개`);
      return results;
    } catch (error) {
      console.warn(`${LOG} 실패: ${(error as Error).message}`);
      return [];
    }
  },
};
