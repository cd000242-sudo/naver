import type { IssueCandidateImage, IssueCollectPayload, IssueHarnessScope } from '../../crawler/issueHarness/types.js';
import { hammingDistance } from '../../crawler/issueHarness/candidateFetcher.js';
import { dailyImageSourceTier } from './dailyImageSourcePolicy.js';
import type { DailyRefillItem } from './dailyImageRefill.js';

/**
 * Real-photo slots for a daily post (2026-10-29 사장님 "수집이 실패하지 않게 — 면책 동의했으면 그 사람 책임").
 * One run of the issue collector, then every empty slot takes the best photo left: its own heading's candidates
 * first, then any unused photo of the post, official sources before news before search before personal pages.
 */
export interface DailyCollectedImage {
  filePath: string; heading: string; isThumbnail: boolean; provider: 'collected';
  sourceUrl?: string; caption?: string;
}
export interface DailyCollectDeps {
  collect(payload: IssueCollectPayload): Promise<{ images: Record<string, string[]>; candidates: Record<string, IssueCandidateImage[]> }>;
  /** Downloads and decodes; null when the photo cannot be used (dead link, too small, not an image). */
  fetch(candidate: IssueCandidateImage): Promise<{ buffer: Buffer; dhash: bigint } | null>;
  save(buffer: Buffer, slot: DailyRefillItem): Promise<string>;
  /** Optional publisher name for the source line (og:site_name); the page host is used when it returns nothing. */
  describeSource?(candidate: IssueCandidateImage): Promise<string | undefined>;
  log?(message: string): void;
  signal?: AbortSignal;
}
/**
 * Narrowing used by the "관련 사진 찾기" engine only; the daily post passes none. `ownHeadingOnly` leaves a slot empty
 * when its own heading found nothing (no borrowing from other headings).
 */
export interface DailyCollectScope { ownHeadingOnly?: boolean }
export interface DailyCollectInput {
  title: string; headings: readonly string[]; intro?: string; mainKeyword?: string; slots: readonly DailyRefillItem[]; scope?: DailyCollectScope;
  /** Each heading's own paragraph (heading to text) so the search plan reads the body, not just the heading text. */
  headingBodies?: Readonly<Record<string, string>>;
}

/** Near-identical photos (resized or re-encoded copies) differ by only a few dHash bits. */
const SAME_PHOTO_BITS = 8;
/** Bounded downloads per slot so one bad heading cannot eat the preparation hour. */
const TRIES_PER_SLOT = 10;

function ordered(list: readonly IssueCandidateImage[]): IssueCandidateImage[] {
  // Most photos carry no page address; the image server then says what kind of site it came from.
  return list.map((candidate, index) => ({ candidate, index, tier: dailyImageSourceTier(candidate.pageUrl || candidate.url) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index).map(entry => entry.candidate);
}
function hostOf(url: string | undefined): string {
  try { return new URL(String(url)).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/**
 * The app's real collector, downloader and image store. Paid vision is never switched on here: an unattended
 * run cannot ask, and collecting must not cost the owner money. Photos are re-encoded as JPEG because the
 * Naver editor rejects some formats the web serves (.avif was refused in the 10-24 diagnostic report).
 */
export function createDailyCollectDeps(context: { title: string; postId?: string; log?: (message: string) => void; signal?: AbortSignal; scope?: IssueHarnessScope }): DailyCollectDeps {
  return {
    log: context.log, signal: context.signal,
    async collect(payload) {
      const { loadConfig, applyConfigToEnv } = await import('../../configManager.js');
      const { resolveIssueCollectRoutes } = await import('../ipc/issueCollectHandlers.js');
      const { collectIssueImages } = await import('../../crawler/issueHarness/harness.js');
      const config = await loadConfig();
      applyConfigToEnv(config);
      const { planCaller, planEngineLabel, visionRoute } = resolveIssueCollectRoutes(config, false);
      return collectIssueImages(payload, { planCaller, planEngineLabel, visionRoute, log: context.log, ...(context.scope ? { scope: context.scope } : {}) });
    },
    async fetch(candidate) {
      const { fetchAndValidateCandidate } = await import('../../crawler/issueHarness/candidateFetcher.js');
      const fetched = await fetchAndValidateCandidate(candidate);
      return fetched ? { buffer: fetched.buffer, dhash: fetched.dhash } : null;
    },
    async save(buffer, slot) {
      const { default: sharp } = await import('sharp');
      const { writeImageFile } = await import('../../image/imageUtils.js');
      const jpeg = await sharp(buffer).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
      return (await writeImageFile(jpeg, 'jpg', slot.heading, context.title, context.postId, { keepAspect: true })).filePath;
    },
  };
}

export async function collectDailyImages(input: DailyCollectInput, deps: DailyCollectDeps): Promise<DailyCollectedImage[]> {
  if (!input.slots.length) return [];
  // 2026-10-29 실측: the collector keeps about one clean photo per heading, so a post of N headings came back
  //   with N photos for N+1 slots and the thumbnail stayed empty. The title gets its own search.
  const wantsThumbnail = input.slots.some(slot => slot.isThumbnail) && !input.headings.includes(input.title);
  const searched = wantsThumbnail ? [input.title, ...input.headings] : [...input.headings];
  const ownOnly = input.scope?.ownHeadingOnly === true;
  const result = await deps.collect({
    title: input.title, headings: searched.map(title => ({ title, ...(input.headingBodies?.[title] ? { body: input.headingBodies[title] } : {}) })),
    ...(input.intro ? { intro: input.intro } : {}), ...(input.mainKeyword ? { mainKeyword: input.mainKeyword } : {}),
  });
  const byHeading = new Map(searched.map(heading => {
    const pool = result.candidates?.[heading] || [];
    // The collector's own placed picks lead, then the rest of that heading's pool.
    const placed = (result.images?.[heading] || []).map(url => pool.find(c => c.url === url) || { url, sourceName: 'collected', query: heading });
    return [heading, ordered([...placed, ...pool])];
  }));
  const everything = ownOnly ? [] : ordered(searched.flatMap(heading => byHeading.get(heading) || []));
  const triedUrls = new Set<string>();
  const usedHashes: bigint[] = [];
  const filled: DailyCollectedImage[] = [];
  for (const slot of input.slots) {
    if (deps.signal?.aborted) throw new Error('PUBLISH_CANCELLED');
    const cover = byHeading.get(searched[0]) || [];
    // A scoped run has no catch-all pool, so its cover may also take the first heading's photo.
    const own = !slot.isThumbnail ? byHeading.get(slot.heading) || []
      : ownOnly ? [...cover, ...(byHeading.get(input.headings[0]) || [])] : cover;
    let tries = 0;
    for (const candidate of [...own, ...everything]) {
      if (tries >= TRIES_PER_SLOT) break;
      if (!candidate.url || triedUrls.has(candidate.url)) continue;
      triedUrls.add(candidate.url);
      tries += 1;
      const fetched = await deps.fetch(candidate).catch(() => null);
      if (!fetched || usedHashes.some(hash => hammingDistance(hash, fetched.dhash) <= SAME_PHOTO_BITS)) continue;
      const filePath = await deps.save(fetched.buffer, slot).catch(() => '');
      if (!filePath) continue;
      usedHashes.push(fetched.dhash);
      const source = candidate.pageUrl || candidate.url;
      const siteName = await Promise.resolve(deps.describeSource?.(candidate)).catch(() => undefined);
      filled.push({ filePath, heading: slot.heading, isThumbnail: slot.isThumbnail, provider: 'collected',
        sourceUrl: source, caption: `출처: ${siteName || hostOf(source) || candidate.sourceName}` });
      break;
    }
  }
  deps.log?.(`   📷 실제 사진 수집: ${filled.length}/${input.slots.length}자리 채움`);
  return filled;
}
