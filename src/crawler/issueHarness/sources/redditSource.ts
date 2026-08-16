// src/crawler/issueHarness/sources/redditSource.ts
// Reddit search adapter for the issue harness. Uses the public
// (unauthenticated) search.json endpoint — no API key required.

import type { IssueCandidateImage, IssueSourceAdapter } from '../types.js';

const LOG = '[IssueSource:reddit]';
const TIMEOUT_MS = 10_000;
const DIRECT_IMAGE_RE = /\.(jpg|jpeg|png|webp)$/i;

interface RedditPreviewSource {
  url?: string;
  width?: number;
  height?: number;
}

interface RedditPostData {
  over_18?: boolean;
  is_video?: boolean;
  is_gallery?: boolean;
  url_overridden_by_dest?: string;
  preview?: { images?: Array<{ source?: RedditPreviewSource }> };
}

interface RedditChild {
  data?: RedditPostData;
}

/** Reddit escapes `&` as `&amp;` in preview URLs — restore it for real requests. */
function unescapeRedditUrl(url: string): string {
  return url.replace(/&amp;/g, '&');
}

function isDirectImageHost(url: string): boolean {
  return DIRECT_IMAGE_RE.test(url) || /(^|\.)i\.redd\.it$/i.test(new URL(url).hostname);
}

/** Pure helper: map Reddit search.json `children` posts to candidate images. */
export function mapRedditPosts(children: RedditChild[], query: string): IssueCandidateImage[] {
  const out: IssueCandidateImage[] = [];
  for (const child of children || []) {
    const post = child?.data;
    if (!post) continue;
    if (post.over_18 === true) continue;
    if (post.is_video === true) continue;
    if (post.is_gallery === true) continue;

    const previewSource = post.preview?.images?.[0]?.source;
    if (previewSource?.url) {
      out.push({
        url: unescapeRedditUrl(previewSource.url),
        sourceName: 'reddit',
        query,
        width: previewSource.width,
        height: previewSource.height,
      });
      continue;
    }

    const direct = post.url_overridden_by_dest;
    if (direct) {
      try {
        if (isDirectImageHost(direct)) {
          out.push({ url: direct, sourceName: 'reddit', query });
        }
      } catch {
        // invalid URL — skip
      }
    }
  }
  return out;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': 'better-life-collector/1.0' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const redditSource: IssueSourceAdapter = {
  name: 'reddit',
  async search(query: string, maxImages: number): Promise<IssueCandidateImage[]> {
    if (!query || !query.trim()) return [];
    const trimmed = query.trim();
    try {
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(trimmed)}&sort=new&limit=40&type=link`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { data?: { children?: RedditChild[] } };
      const candidates = mapRedditPosts(data.data?.children || [], trimmed).slice(0, maxImages);
      console.log(`${LOG} "${trimmed}" → ${candidates.length}개`);
      return candidates;
    } catch (error) {
      console.warn(`${LOG} 실패: ${(error as Error).message}`);
      return [];
    }
  },
};
