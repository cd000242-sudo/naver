/**
 * Dropshot result-picture ranking, "already seen" protection and download (Node side).
 *
 * The board used to show a finished job as a direct address
 *   https://img.aistudio.dropshot.io/.../public/jobs/prod/<job>/output/output_0.jpg?w=1920&q=75
 * Since the 2026-11 site build every <img> goes through the site's resizing endpoint instead (measured 2026-11-12 on the
 * sister app):
 *   https://aistudio.dropshot.io/api/media/image?src=<encoded cdn address>&w=384
 * where the real picture address sits in the `src` query value. Logos, banners and samples use the same endpoint, so the
 * decision has to look at the embedded address. A fetch of the proxy address from inside the page can fail with
 * "Failed to fetch" while the embedded cdn address answers 200 with the original PNG, so downloads go to the real
 * address first and fall back to a browser-context request (no CORS involved).
 */

/** One visible picture source as listed by the page (see dropshotCapture.ts). */
export type DropshotRawCandidate = {
  key: string;
  src: string;
  kind: string;
  width: number;
  height: number;
};

const DROPSHOT_HOST = /(^|\.)dropshot\.io$/i;
const MEDIA_PROXY_PATH = '/api/media/image';
// Baseline keys look like "img:<address>", "source:<address>", "background:<address>", "link:<address>".
const KIND_PREFIX = /^(?:img|source|background|link):/;
const CONTEXT_REQUEST_TIMEOUT_MS = 30_000;

function parseAddress(value: string, base?: string): URL | null {
  try {
    return base ? new URL(value, base) : new URL(value);
  } catch {
    return null;
  }
}

function isProxyAddress(url: URL | null): url is URL {
  return !!url && DROPSHOT_HOST.test(url.hostname) && url.pathname === MEDIA_PROXY_PATH;
}

/** The real picture address behind a proxy address; every other address is returned unchanged. */
export function resolveDropshotImageAddress(src: string): string {
  const url = parseAddress(src);
  if (!isProxyAddress(url)) return src;
  const embedded = url.searchParams.get('src');
  if (!embedded) return src;
  const inner = parseAddress(embedded, url.origin);
  return inner ? inner.href : src;
}

/**
 * Proxy addresses count only when the embedded address is a generated job result (logos, banners and samples go through the
 * same endpoint). Every other address keeps the earlier rule (the in-page filter for icons/samples/logos and the size check).
 */
export function isDropshotResultSourceAccepted(src: string): boolean {
  const url = parseAddress(src);
  if (!isProxyAddress(url)) return true;
  const inner = parseAddress(url.searchParams.get('src') || '', url.origin);
  return !!inner && DROPSHOT_HOST.test(inner.hostname) && /\/jobs\//.test(inner.pathname);
}

function score(candidate: DropshotRawCandidate): number {
  const source = resolveDropshotImageAddress(candidate.src).toLowerCase();
  let value = candidate.width * candidate.height;
  if (source.startsWith('data:image/')) value += 1_000_000;
  if (source.startsWith('blob:')) value += 900_000;
  if (source.includes('cdn.aistudio.dropshot.io')) value += 800_000;
  if (candidate.kind === 'canvas') value += 700_000;
  return value;
}

/**
 * New candidates only, best first. "Seen" is judged by key, by address and by the real picture address, so a picture that was
 * on the board before the click does not turn into a "new result" when the site shows it at another proxy width.
 */
export function rankNewDropshotCandidates(
  candidates: readonly DropshotRawCandidate[],
  beforeKeys: readonly string[],
): DropshotRawCandidate[] {
  const seen = new Set<string>();
  for (const key of beforeKeys) {
    const bare = key.replace(KIND_PREFIX, '');
    seen.add(key);
    seen.add(bare);
    seen.add(resolveDropshotImageAddress(bare));
  }
  return candidates
    .filter((candidate) => !seen.has(candidate.key)
      && !seen.has(candidate.src)
      && !seen.has(resolveDropshotImageAddress(candidate.src))
      && isDropshotResultSourceAccepted(candidate.src))
    .sort((a, b) => score(b) - score(a));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readInPage(page: any, address: string): Promise<string | null> {
  try {
    const value = await page.evaluate(async (target: string) => {
      try {
        const response = await fetch(target);
        if (!response.ok) return null;
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) return null;
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('blob read failed'));
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    }, address);
    return typeof value === 'string' && value.startsWith('data:image/') ? value : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readViaContext(page: any, address: string): Promise<string | null> {
  try {
    const request = page?.context?.()?.request;
    if (!request?.get) return null;
    const response = await request.get(address, { timeout: CONTEXT_REQUEST_TIMEOUT_MS });
    if (!response.ok()) return null;
    const type = String(response.headers()['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/')) return null;
    const body: Buffer = await response.body();
    return body.length > 0 ? `data:${type};base64,${body.toString('base64')}` : null;
  } catch {
    return null;
  }
}

/** One candidate as a data address: data stays, blob: is read inside the page, http(s) goes real address first. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function downloadDropshotCandidate(page: any, src: string): Promise<string | null> {
  if (src.startsWith('data:image/')) return src;
  if (src.startsWith('blob:')) return await readInPage(page, src);
  if (!/^https?:\/\//i.test(src)) return null;
  const real = resolveDropshotImageAddress(src);
  for (const address of real === src ? [src] : [real, src]) {
    const viaPage = await readInPage(page, address);
    if (viaPage) return viaPage;
    const viaContext = await readViaContext(page, address);
    if (viaContext) return viaContext;
  }
  return null;
}

/** The best new candidate that can actually be downloaded, or null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pickDropshotResultDataUrl(
  page: any,
  candidates: readonly DropshotRawCandidate[],
  beforeKeys: readonly string[],
): Promise<string | null> {
  for (const candidate of rankNewDropshotCandidates(candidates, beforeKeys)) {
    const dataUrl = await downloadDropshotCandidate(page, candidate.src);
    if (dataUrl) return dataUrl;
  }
  return null;
}
