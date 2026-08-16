// src/crawler/issueHarness/sources/duckduckgoSource.ts
// DuckDuckGo image search adapter for the issue harness.
// DDG's image search API requires a short-lived "vqd" token that is
// embedded in the HTML of the regular search results page — fetch that
// page first, extract the token, then call the JSON image endpoint.

import type { IssueCandidateImage, IssueSourceAdapter } from '../types.js';

const LOG = '[IssueSource:duckduckgo]';
const TIMEOUT_MS = 10_000;
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Pure helper: extract the `vqd` token from a DDG results HTML page. */
export function extractDdgVqd(html: string): string | null {
  if (!html) return null;
  const patterns = [
    /vqd=([\d-]+)&/,
    /vqd="([\d-]+)"/,
    /vqd='([\d-]+)'/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface DdgImageResult {
  image?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  title?: string;
}

async function fetchVqd(query: string): Promise<string | null> {
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
  const res = await fetchWithTimeout(url, {
    'User-Agent': DESKTOP_UA,
  });
  if (!res.ok) throw new Error(`vqd HTTP ${res.status}`);
  const html = await res.text();
  return extractDdgVqd(html);
}

async function fetchImages(query: string, vqd: string): Promise<DdgImageResult[]> {
  const url = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,&p=1`;
  const res = await fetchWithTimeout(url, {
    'User-Agent': DESKTOP_UA,
    Referer: 'https://duckduckgo.com/',
  });
  if (!res.ok) throw new Error(`i.js HTTP ${res.status}`);
  const data = (await res.json()) as { results?: DdgImageResult[] };
  return data.results || [];
}

export const duckduckgoSource: IssueSourceAdapter = {
  name: 'duckduckgo',
  async search(query: string, maxImages: number): Promise<IssueCandidateImage[]> {
    if (!query || !query.trim()) return [];
    const trimmed = query.trim();
    try {
      const vqd = await fetchVqd(trimmed);
      if (!vqd) {
        console.warn(`${LOG} vqd 토큰을 찾지 못함 — 건너뜀`);
        return [];
      }
      const results = await fetchImages(trimmed, vqd);
      const candidates: IssueCandidateImage[] = results
        .filter((r) => r.image && /^https?:\/\//i.test(r.image))
        .slice(0, maxImages)
        .map((r) => ({
          url: r.image as string,
          thumbnailUrl: r.thumbnail,
          sourceName: 'duckduckgo',
          query: trimmed,
          width: r.width,
          height: r.height,
        }));
      console.log(`${LOG} "${trimmed}" → ${candidates.length}개`);
      return candidates;
    } catch (error) {
      console.warn(`${LOG} 실패: ${(error as Error).message}`);
      return [];
    }
  },
};
