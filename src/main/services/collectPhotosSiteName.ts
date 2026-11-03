/**
 * Publisher name for the photo source line of the "관련 사진 찾기" engine.
 * Reads og:site_name from the first part of the article page; any failure returns undefined so the caller falls back
 * to the page host. One lookup per host per run — a post of eight photos from three outlets costs three requests.
 */
const FETCH_TIMEOUT_MS = 5000;
const MAX_HEAD_CHARS = 120_000;
const MAX_NAME_LENGTH = 40;

const META_SITE_NAME = [
  /<meta[^>]+(?:property|name)=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:site_name["'][^>]*>/i,
];

/** Pure parser (exported for tests). */
export function extractOgSiteName(html: string): string | undefined {
  for (const pattern of META_SITE_NAME) {
    const found = String(html || '').match(pattern)?.[1];
    const name = found?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
    if (name && name.length <= MAX_NAME_LENGTH) return name;
  }
  return undefined;
}

async function fetchHead(pageUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(pageUrl, { signal: controller.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36' } });
    return response.ok ? (await response.text()).slice(0, MAX_HEAD_CHARS) : '';
  } finally {
    clearTimeout(timer);
  }
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function createSiteNameResolver(fetchPage: (pageUrl: string) => Promise<string> = fetchHead): (pageUrl: string | undefined) => Promise<string | undefined> {
  const byHost = new Map<string, string | undefined>();
  return async (pageUrl) => {
    if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return undefined;
    const host = hostOf(pageUrl);
    if (!host) return undefined;
    if (byHost.has(host)) return byHost.get(host);
    let name: string | undefined;
    try { name = extractOgSiteName(await fetchPage(pageUrl)); } catch { name = undefined; }
    byHost.set(host, name);
    return name;
  };
}
