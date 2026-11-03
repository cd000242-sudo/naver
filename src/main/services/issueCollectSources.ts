import { createSiteNameResolver } from './collectPhotosSiteName.js';

/**
 * Source line for photos the image tab's "AI 자동 수집" places: the same wording and lookup as the "관련 사진 찾기"
 * engine (og:site_name of the article page, else its host). A candidate without an article page gets no entry, so the
 * caption never falls back to the image server's domain.
 */
export interface IssueCollectSource {
  readonly sourceUrl: string;
  readonly caption: string;
}

interface PlacedCandidate {
  readonly url: string;
  readonly pageUrl?: string;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export async function buildIssueCollectSources(
  images: Readonly<Record<string, readonly string[]>>,
  candidates: Readonly<Record<string, readonly PlacedCandidate[]>>,
  resolveSiteName: (pageUrl: string | undefined) => Promise<string | undefined> = createSiteNameResolver(),
): Promise<Record<string, IssueCollectSource>> {
  const pageByImage = new Map<string, string>();
  for (const list of Object.values(candidates || {})) {
    for (const candidate of list || []) {
      if (candidate?.url && candidate.pageUrl && /^https?:\/\//i.test(candidate.pageUrl) && !pageByImage.has(candidate.url)) {
        pageByImage.set(candidate.url, candidate.pageUrl);
      }
    }
  }
  const sources: Record<string, IssueCollectSource> = {};
  for (const urls of Object.values(images || {})) {
    for (const url of urls || []) {
      const pageUrl = pageByImage.get(url);
      if (!pageUrl || sources[url]) continue;
      const name = (await resolveSiteName(pageUrl).catch(() => undefined)) || hostOf(pageUrl);
      if (name) sources[url] = { sourceUrl: pageUrl, caption: `출처: ${name}` };
    }
  }
  return sources;
}
