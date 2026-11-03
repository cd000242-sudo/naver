import type { GeneratedImage, GenerateImagesOptions, ImageRequestItem } from '../../image/types.js';
import type { IssueCandidateImage, IssueHarnessScope } from '../../crawler/issueHarness/types.js';
import { isPressAgencyHost } from '../../crawler/issueHarness/pressHosts.js';
import { COLLECT_CONSENT_REQUIRED_MESSAGE, COLLECT_PHOTOS_ENGINE, isImageCollectConsentValid } from '../../runtime/collectPhotosPolicy.js';
import { dailyImageSourceTier } from './dailyImageSourcePolicy.js';
import { collectDailyImages, createDailyCollectDeps, type DailyCollectDeps, type DailyCollectInput, type DailyCollectedImage } from './dailyImageCollect.js';
import type { DailyRefillItem } from './dailyImageRefill.js';
import { createSiteNameResolver } from './collectPhotosSiteName.js';

/**
 * The "관련 사진 찾기" image engine: instead of drawing an image it collects a real news/article photo per heading
 * with the same free collector the daily post uses (no paid vision, photos re-encoded as JPEG). A heading with no
 * suitable photo stays empty — no other engine is asked (no silent fallback) — and the log says how many were left.
 * Only news, official and press-agency pages count; community, SNS, shop and overseas image-search results do not.
 */
export const COLLECT_PHOTOS_SOURCES: readonly string[] = ['naver', 'naver-date', 'news-og', 'daum'];

export function isNewsOrOfficialPhoto(candidate: IssueCandidateImage): boolean {
  const tier = dailyImageSourceTier(candidate.pageUrl || candidate.url);
  return tier <= 1 || (tier === 2 && isPressAgencyHost(candidate.pageUrl, candidate.url));
}

export const COLLECT_PHOTOS_SCOPE: IssueHarnessScope = { allowedSources: COLLECT_PHOTOS_SOURCES, candidateFilter: isNewsOrOfficialPhoto };

export interface CollectPhotosRuntime {
  loadConsent(): Promise<unknown>;
  buildDeps(context: { title: string; postId?: string; log: (message: string) => void; signal: AbortSignal }): DailyCollectDeps;
  collect(input: DailyCollectInput, deps: DailyCollectDeps): Promise<DailyCollectedImage[]>;
  readPreview(filePath: string): Promise<string>;
  log(message: string): void;
}

let collectPhotosLogSink: ((message: string) => void) | null = null;
/** main registers its renderer log sender here, so "N칸은 맞는 사진을 못 찾아 비워 둠" reaches the progress log. */
export function setCollectPhotosLogSink(sink: ((message: string) => void) | null): void { collectPhotosLogSink = sink; }
export function emitCollectPhotosLog(message: string): void {
  console.log(message);
  try { collectPhotosLogSink?.(message); } catch { /* the progress log is display only */ }
}

function defaultRuntime(): CollectPhotosRuntime {
  return {
    async loadConsent() { return (await (await import('../../configManager.js')).loadConfig()).imageCollectConsent; },
    buildDeps(context) {
      const siteName = createSiteNameResolver();
      return { ...createDailyCollectDeps({ ...context, scope: COLLECT_PHOTOS_SCOPE }), describeSource: candidate => siteName(candidate.pageUrl) };
    },
    collect: collectDailyImages,
    async readPreview(filePath) {
      try { return `data:image/jpeg;base64,${(await (await import('node:fs/promises')).readFile(filePath)).toString('base64')}`; } catch { return ''; }
    },
    log: emitCollectPhotosLog,
  };
}

function toSlot(item: ImageRequestItem): DailyRefillItem {
  const prompt = String(item.prompt || item.heading || '');
  return { heading: item.heading, prompt, englishPrompt: String(item.englishPrompt || prompt), isThumbnail: item.isThumbnail === true,
    imageRatio: String((item as { imageRatio?: string }).imageRatio || '1:1') };
}

function toGeneratedImage(photo: DailyCollectedImage, preview: string, items: readonly ImageRequestItem[]): GeneratedImage {
  const source = items.find(item => item.heading === photo.heading && (item.isThumbnail === true) === photo.isThumbnail);
  return {
    heading: photo.heading, filePath: photo.filePath, previewDataUrl: preview, provider: 'collected' as GeneratedImage['provider'],
    isThumbnail: photo.isThumbnail, sourceUrl: photo.sourceUrl, caption: photo.caption, isCollected: true,
    // A real photo: no Korean copy is drawn on it and the AI mark must not attach (the provider is not on that list).
    disableTextOverlay: true, requestedProvider: COLLECT_PHOTOS_ENGINE, actualProvider: 'collected',
    ...((source as { originalIndex?: number } | undefined)?.originalIndex !== undefined ? { originalIndex: (source as { originalIndex?: number }).originalIndex } : {}),
  };
}

export async function generateCollectedPhotos(
  options: GenerateImagesOptions,
  onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,
  runtime: CollectPhotosRuntime = defaultRuntime(),
): Promise<GeneratedImage[]> {
  if (!isImageCollectConsentValid(await runtime.loadConsent())) throw new Error(COLLECT_CONSENT_REQUIRED_MESSAGE);
  if (options.isShoppingConnect) throw new Error('쇼핑커넥트 상품 이미지에는 관련 사진 찾기를 쓸 수 없어요. 다른 이미지 엔진을 골라 주세요.');
  if (!options.items.length || options.stopCheck?.()) return [];
  const slots = options.items.map(toSlot);
  const headings = slots.filter(slot => !slot.isThumbnail).map(slot => slot.heading);
  const title = String(options.articleTitle || options.postTitle || slots.find(slot => slot.isThumbnail)?.heading || headings[0] || '').trim();
  if (!title) throw new Error('글 제목이 없어 관련 사진을 찾을 수 없어요.');
  // Each section image item carries its paragraph (sectionContent); the search plan reads it with the title and intro.
  const headingBodies = Object.fromEntries(options.items
    .filter(item => !item.isThumbnail && String(item.sectionContent || '').trim())
    .map(item => [item.heading, String(item.sectionContent).trim()]));
  const abort = new AbortController();
  const watcher = setInterval(() => { if (options.stopCheck?.()) abort.abort(); }, 1000);
  try {
    const deps = runtime.buildDeps({ title, postId: options.postId, log: runtime.log, signal: abort.signal });
    const photos = await runtime.collect({
      title, headings, slots, scope: { ownHeadingOnly: true },
      ...(options.articleContext ? { intro: options.articleContext.slice(0, 1200) } : {}),
      ...(Object.keys(headingBodies).length ? { headingBodies } : {}),
    }, deps);
    const empty = slots.filter(slot => !photos.some(photo => photo.heading === slot.heading && photo.isThumbnail === slot.isThumbnail));
    runtime.log(`[이미지생성] 📷 관련 사진 찾기: ${slots.length}칸 중 ${photos.length}칸 채움${empty.length ? ` · ${empty.length}칸은 맞는 사진을 못 찾아 비워 둠 (${empty.map(slot => slot.heading).join(', ')})` : ''}`);
    const images: GeneratedImage[] = [];
    for (const photo of photos) {
      const image = toGeneratedImage(photo, await runtime.readPreview(photo.filePath), options.items);
      images.push(image);
      onImageGenerated?.(image, images.length - 1, slots.length);
    }
    return images;
  } finally {
    clearInterval(watcher);
  }
}
