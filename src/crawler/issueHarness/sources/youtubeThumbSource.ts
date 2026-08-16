// src/crawler/issueHarness/sources/youtubeThumbSource.ts
// YouTube thumbnail adapter for the issue harness. Scrapes the public
// search results page for video IDs (no API key required) and derives
// thumbnail URLs directly from the `i.ytimg.com` CDN convention.
// A later pipeline stage validates actual thumbnail resolution, so this
// adapter does not issue HEAD requests per video.

import type { IssueCandidateImage, IssueSourceAdapter } from '../types.js';

const LOG = '[IssueSource:youtube]';
const TIMEOUT_MS = 10_000;
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const VIDEO_ID_RE = /"videoId":"([\w-]{11})"/g;

/** Pure helper: pull deduped video IDs out of a YouTube search results page. */
export function extractYoutubeVideoIds(html: string, cap: number): string[] {
  if (!html || cap <= 0) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const match of html.matchAll(VIDEO_ID_RE)) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= cap) break;
  }
  return ids;
}

async function fetchSearchHtml(query: string): Promise<string> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': DESKTOP_UA,
        'Accept-Language': 'ko',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export const youtubeThumbSource: IssueSourceAdapter = {
  name: 'youtube',
  async search(query: string, maxImages: number): Promise<IssueCandidateImage[]> {
    if (!query || !query.trim()) return [];
    const trimmed = query.trim();
    try {
      const html = await fetchSearchHtml(trimmed);
      const ids = extractYoutubeVideoIds(html, maxImages);
      const candidates: IssueCandidateImage[] = ids.map((id) => ({
        url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        sourceName: 'youtube',
        query: trimmed,
      }));
      console.log(`${LOG} "${trimmed}" → ${candidates.length}개`);
      return candidates;
    } catch (error) {
      console.warn(`${LOG} 실패: ${(error as Error).message}`);
      return [];
    }
  },
};
