/**
 * Shopping-link image collection shared by two screens:
 *   - full-auto publish (publishingHandlers) after `image:collectFromShopping`
 *   - image tab "URL only collect" button (headingImageGen)
 * so that both end up with the same pool: representative marked, saved locally,
 * and mirrored into currentStructuredContent.collectedImages (Codex/AI reference material).
 *
 * Decisions are pure functions (inputs are never mutated); the async helpers at the
 * bottom are thin wrappers that call the IPC bridge and the local-save util.
 */
import { resolveShoppingRepresentativeReference } from '../../image/shoppingReferenceGeneration.js';
import { saveCollectedShoppingImagesToLocal } from './shoppingImageLocalSave.js';

// ── Shopping address detection ─────────────────────────────────────────────
// MUST stay identical to the main collector (src/main/ipc/imageCollectShoppingHandlers.ts:
// SHORT_URL_PATTERNS + the brand/smartstore/brandconnect/coupang platform checks).
// A vitest pins both lists against that file, so edit them together.
export const SHOPPING_COLLECT_SHORT_URL_PATTERN = /naver\.me\/|brandconnect\.naver\.com\/|link\.coupang\.com\/|coupa\.ng\/|bit\.ly\/|goo\.gl\/|t\.ly\/|tinyurl\.com\//;

export const SHOPPING_COLLECT_HOST_MARKERS: readonly string[] = [
  'brand.naver.com',
  'smartstore.naver.com',
  'brandconnect.naver.com',
  'coupang.com',
  'coupa.ng',
];

export function isShoppingCollectUrl(url: unknown): boolean {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value) return false;
  return SHOPPING_COLLECT_SHORT_URL_PATTERN.test(value)
    || SHOPPING_COLLECT_HOST_MARKERS.some((marker) => value.includes(marker));
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/** How the `images` list of the post content is updated: put collected first, empty it, or leave it. */
export type ShoppingImagesPolicy = 'prepend' | 'clear' | 'keep';

export interface ShoppingPoolContent {
  images?: any[];
  collectedImages?: any[];
  [key: string]: any;
}

/** Turn collected image URLs into pool entries; index 0 is the representative product photo. */
export function buildShoppingCollectedImages(urls: readonly string[]): any[] {
  return (urls || []).map((imgUrl: string, idx: number) => ({
    url: imgUrl,
    filePath: imgUrl,
    heading: `제품 이미지 ${idx + 1}`,
    provider: 'collected',
    source: idx === 0 ? 'product-main' : 'product-gallery',
    isRepresentative: idx === 0,
  }));
}

/** Prefer the locally saved copies when the save produced any; always returns a new array. */
export function pickShoppingLocalSavedImages<T>(original: readonly T[], saved: readonly T[] | null | undefined): T[] {
  return saved && saved.length > 0 ? [...saved] : [...original];
}

/** Compute the new `images` / `collectedImages` for a post (dedupes, representative first). */
export function mergeShoppingCollectedIntoContent(
  content: ShoppingPoolContent | null | undefined,
  collected: readonly any[],
  policy: ShoppingImagesPolicy,
): { images: any[]; collectedImages: any[] } {
  const existingImages = content?.images || [];
  const images = policy === 'clear'
    ? []
    : policy === 'prepend'
      ? [...collected, ...existingImages]
      : [...existingImages];
  const collectedImages = resolveShoppingRepresentativeReference([
    ...collected,
    ...(content?.collectedImages || []),
  ]).images;
  return { images, collectedImages };
}

// ── Thin helpers (IPC / local save / content write) ────────────────────────

/** Apply the merge onto the live content object in place (identity is kept on purpose: window.currentStructuredContent). */
export function applyShoppingCollectedToContent(
  content: ShoppingPoolContent,
  collected: readonly any[],
  policy: ShoppingImagesPolicy,
): ShoppingPoolContent {
  const merged = mergeShoppingCollectedIntoContent(content, collected, policy);
  if (policy !== 'keep') content.images = merged.images;
  content.collectedImages = merged.collectedImages;
  return content;
}

/** Build pool entries from collected URLs and save them locally (falls back to remote URLs inside the save util). */
export async function prepareShoppingCollectedImages(
  urls: readonly string[],
  title: string,
): Promise<{ images: any[]; folderPath?: string; savedCount: number }> {
  const built = buildShoppingCollectedImages(urls);
  const localSaveResult = await saveCollectedShoppingImagesToLocal(built, title, { headingPrefix: '상품 이미지' });
  return {
    images: pickShoppingLocalSavedImages(built, localSaveResult.images),
    folderPath: localSaveResult.folderPath,
    savedCount: localSaveResult.savedCount,
  };
}

export interface ShoppingCollectApi {
  collectImagesFromShopping: (url: string) => Promise<{
    success: boolean;
    images?: string[];
    title?: string;
    message?: string;
    productInfo?: any;
    /** A shopping page that is blocked (e.g. Coupang Access Denied): a real shop, so never handed to the generic crawler. */
    isErrorPage?: boolean;
    requiresCoupangApi?: boolean;
    /** Final address after the main collector resolved short links. */
    resolvedUrl?: string;
  } | undefined>;
  crawlImagesFromUrl: (url: string) => Promise<{
    success: boolean;
    images?: string[];
    title?: string;
    message?: string;
  } | undefined>;
}

export type ImageTabCollectResult =
  | {
      ok: true;
      kind: 'shopping' | 'crawl';
      imageUrls: string[];
      title: string;
      /** Shopping only: pool entries (representative marked, locally saved). Empty for the generic crawler. */
      pooledImages: any[];
      /** True when currentStructuredContent.collectedImages was updated. */
      poolSynced: boolean;
      folderPath?: string;
      savedCount?: number;
      /** Said to the user when a short link turned out not to be a shopping address. */
      notice?: string;
    }
  | { ok: false; kind: 'shopping' | 'crawl'; message: string; /** Same as above; kept so a failed generic collection still says why it went generic. */ notice?: string };

const SHOPPING_COLLECT_EMPTY_MESSAGE = '쇼핑몰에서 상품 이미지를 찾지 못했습니다';
const SHOPPING_COLLECT_CRAWL_EMPTY_MESSAGE = '페이지에서 이미지를 찾지 못했습니다';
export const SHOPPING_COLLECT_NOT_SHOP_NOTICE = '쇼핑몰 상품 주소가 아닌 것 같아 일반 수집으로 진행합니다';

// Short links that could lead anywhere (a blog or an article is as likely as a shop). brandconnect / link.coupang.com /
// coupa.ng are shopping addresses by themselves, so they are NOT in this list.
const SHOPPING_COLLECT_UNKNOWN_SHORT_PATTERN = /naver\.me\/|bit\.ly\/|goo\.gl\/|t\.ly\/|tinyurl\.com\//;

function hasShoppingCollectHost(url: string): boolean {
  return SHOPPING_COLLECT_HOST_MARKERS.some((marker) => url.includes(marker));
}

export function isUnknownDestinationShortUrl(url: unknown): boolean {
  const value = typeof url === 'string' ? url.trim() : '';
  return SHOPPING_COLLECT_UNKNOWN_SHORT_PATTERN.test(value) && !hasShoppingCollectHost(value);
}

/** The main collector resolved the short link and the final address is clearly not a shop (and not a blocked shop page). */
function resolvedToNonShopping(result: Awaited<ReturnType<ShoppingCollectApi['collectImagesFromShopping']>>): boolean {
  if (!result || result.isErrorPage || result.requiresCoupangApi) return false;
  const resolved = typeof result.resolvedUrl === 'string' ? result.resolvedUrl.trim() : '';
  return resolved !== '' && !hasShoppingCollectHost(resolved);
}

async function crawlCollect(api: ShoppingCollectApi, url: string, notice?: string): Promise<ImageTabCollectResult> {
  const crawl = await api.crawlImagesFromUrl(url);
  if (!crawl?.success || !Array.isArray(crawl.images) || crawl.images.length === 0) {
    return { ok: false, kind: 'crawl', message: crawl?.message || SHOPPING_COLLECT_CRAWL_EMPTY_MESSAGE, ...(notice ? { notice } : {}) };
  }
  return {
    ok: true,
    kind: 'crawl',
    imageUrls: crawl.images,
    title: String(crawl.title || ''),
    pooledImages: [],
    poolSynced: false,
    ...(notice ? { notice } : {}),
  };
}

/**
 * Image tab "URL only collect": a shopping address goes through the same collector as full-auto
 * and fills the pool; anything else uses the generic page crawler. A failed shopping collection
 * is reported as-is and NEVER retried on the generic crawler — with one exception that is about the kind of
 * address, not about engines: a short link (naver.me, bit.ly ...) that the collector resolved to a non-shopping
 * page (blog, article) is collected the generic way, and the user is told so.
 */
export async function collectImageTabUrlImages(
  api: ShoppingCollectApi,
  url: string,
  opts: { title: string; content: ShoppingPoolContent | null | undefined },
): Promise<ImageTabCollectResult> {
  if (!isShoppingCollectUrl(url)) return crawlCollect(api, url);

  try {
    const result = await api.collectImagesFromShopping(url);
    if (isUnknownDestinationShortUrl(url) && resolvedToNonShopping(result)) {
      return crawlCollect(api, url, SHOPPING_COLLECT_NOT_SHOP_NOTICE);
    }
    if (!result?.success || !Array.isArray(result.images) || result.images.length === 0) {
      return { ok: false, kind: 'shopping', message: result?.message || SHOPPING_COLLECT_EMPTY_MESSAGE };
    }
    const productName = String(result.productInfo?.name || result.title || '');
    const prepared = await prepareShoppingCollectedImages(
      result.images,
      opts.title || productName || 'shopping-connect-images',
    );
    let poolSynced = false;
    if (opts.content) {
      applyShoppingCollectedToContent(opts.content, prepared.images, 'keep');
      poolSynced = true;
    }
    return {
      ok: true,
      kind: 'shopping',
      imageUrls: result.images,
      title: productName,
      pooledImages: prepared.images,
      poolSynced,
      folderPath: prepared.folderPath,
      savedCount: prepared.savedCount,
    };
  } catch (error) {
    return { ok: false, kind: 'shopping', message: `쇼핑몰 수집 중 오류: ${(error as Error)?.message || error}` };
  }
}
