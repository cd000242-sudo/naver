/**
 * A daily post needs a thumbnail and one image per heading (see assertDailyPublishingImages). When the chosen
 * engine leaves slots empty, only those slots are generated again with the free engines in turn, so one engine
 * hiccup does not cost the whole post. Paid engines are never used here: students already paid for the course.
 * ImageFX is not listed: Google closed it (2026-10-29, its page redirects to Flow and its auth endpoint returns 410).
 * Each of these engines fails fast when logged out instead of opening a login window.
 */
export const DAILY_FREE_IMAGE_ENGINES = Object.freeze(['flow', 'genspark', 'dropshot']);

export interface DailyRefillImage { heading?: string; isThumbnail?: boolean; filePath?: string; url?: string }
export interface DailyRefillItem {
  heading: string; prompt: string; englishPrompt: string; isThumbnail: boolean; imageRatio: string; imageStyle?: string;
}
type DailyHeading = string | { title?: unknown; imagePrompt?: unknown };
export interface DailyRefillInput<T extends DailyRefillImage> {
  title: string;
  headings: readonly DailyHeading[];
  images: readonly T[];
  /** The engine that already produced (or failed) this post's images; it is not asked again. */
  primaryProvider?: string;
  imageRatio?: string;
  imageStyle?: string;
  generate: (provider: string, items: DailyRefillItem[]) => Promise<T[]>;
  log?: (message: string) => void;
}

const text = (value: unknown): string => String(value ?? '').trim();
const headingTitle = (heading: DailyHeading): string => text(typeof heading === 'string' ? heading : heading?.title);
const hasFile = (image: DailyRefillImage): boolean => Boolean(text(image.filePath) || text(image.url));
const isCancel = (error: unknown): boolean => (error as Error)?.name === 'AbortError' || (error as Error)?.message === 'PUBLISH_CANCELLED';

/** The slots that still have no usable image, in article order (thumbnail first). */
export function missingDailyImageItems(input: Omit<DailyRefillInput<DailyRefillImage>, 'generate' | 'log' | 'primaryProvider'>): DailyRefillItem[] {
  const usable = input.images.filter(hasFile);
  const covered = new Set(usable.filter(image => !image.isThumbnail).map(image => text(image.heading)));
  const imageRatio = input.imageRatio || '1:1';
  const item = (heading: string, prompt: string, isThumbnail: boolean): DailyRefillItem =>
    ({ heading, prompt, englishPrompt: prompt, isThumbnail, imageRatio, ...(input.imageStyle ? { imageStyle: input.imageStyle } : {}) });
  const thumbnail = usable.some(image => image.isThumbnail) ? [] : [item(text(input.title) || '썸네일', text(input.title) || '블로그 대표 이미지', true)];
  const headings = input.headings
    .map(heading => ({ title: headingTitle(heading), prompt: typeof heading === 'string' ? '' : text(heading?.imagePrompt) }))
    .filter(heading => heading.title && !covered.has(heading.title))
    .map(heading => item(heading.title, heading.prompt || heading.title, false));
  return [...thumbnail, ...headings];
}

function label<T extends DailyRefillImage>(refilled: readonly T[], missing: readonly DailyRefillItem[]): T[] {
  return refilled.filter(hasFile).map((image, index) => {
    const slot = missing.find(item => item.heading === text(image.heading)) || missing[index];
    return slot ? { ...image, heading: slot.heading, isThumbnail: slot.isThumbnail } : image;
  });
}

export interface DailyCompleteInput<T extends DailyRefillImage> extends DailyRefillInput<T> {
  mode: 'ai-generated' | 'ai-first' | 'collect-first';
  /** Real photos for the given empty slots (collect modes only). */
  collect?: (missing: DailyRefillItem[]) => Promise<T[]>;
  /** The cover through the thumbnail director: composes `photos` when given, else one AI cover with `provider`. */
  makeThumbnail?: (provider: string, photos: T[]) => Promise<T | null>;
}

/**
 * Fills the post in the plan's order. The thumbnail is its own step (2026-10-29 사장님 "홈판은 썸네일이 굉장히 중요"):
 * collected photos are composed into the cover by the thumbnail director (square, pair, short phrase — no AI),
 * otherwise the director draws one AI cover from the card promise, trying the chosen engine then the free ones.
 * Headings — collect-first: photos → chosen AI engine → free engines. ai-first (the chosen engine already drew
 * the headings): photos → free engines. ai-generated: free engines. The collector runs once per post.
 */
export async function completeDailyImages<T extends DailyRefillImage>(input: DailyCompleteInput<T>): Promise<T[]> {
  let images: T[] = [...input.images];
  const fail = (name: string, error: unknown): void => {
    if (isCancel(error)) throw error;
    input.log?.(`   ⚠️ ${name} 실패 → 다음 방법으로: ${(error as Error)?.message || error}`);
  };
  let photos: T[] = [];
  const wanted = missingDailyImageItems({ ...input, images });
  if (input.mode !== 'ai-generated' && input.collect && wanted.length) {
    try { photos = label(await input.collect(wanted), wanted); } catch (error) { fail('실제 사진 수집', error); }
  }
  const primary = text(input.primaryProvider) === 'imagefx' ? 'flow' : text(input.primaryProvider);
  if (input.makeThumbnail && !images.some(image => image.isThumbnail && hasFile(image))) {
    // The photo found for the title leads; a heading photo can make a pair.
    const cover = [...photos.filter(photo => photo.isThumbnail), ...photos.filter(photo => !photo.isThumbnail)].slice(0, 2);
    for (const engine of [...new Set([primary, ...DAILY_FREE_IMAGE_ENGINES].filter(Boolean))]) {
      try {
        const made = await input.makeThumbnail(engine, cover);
        if (made && hasFile(made)) { images = [...images, { ...made, heading: text(input.title) || made.heading, isThumbnail: true }]; break; }
      } catch (error) { fail(`썸네일(${engine})`, error); }
      if (cover.length) break; // a composed real cover needs no engine — trying more engines would only redo it
    }
  }
  const headingPhotos = photos.filter(photo => !photo.isThumbnail);
  const fillWith = (extra: readonly T[]): void => {
    const open = new Set(missingDailyImageItems({ ...input, images }).filter(item => !item.isThumbnail).map(item => item.heading));
    images = [...images, ...extra.filter(photo => open.delete(text(photo.heading)))];
  };
  if (input.mode !== 'ai-generated') fillWith(headingPhotos);
  if (input.mode === 'collect-first' && primary) {
    const missing = missingDailyImageItems({ ...input, images }).filter(item => !item.isThumbnail);
    if (missing.length) {
      try { images = [...images, ...label(await input.generate(primary, missing), missing)]; } catch (error) { fail(`AI 이미지(${primary})`, error); }
    }
  }
  // Last resort for the cover: the plain photo found for the title.
  if (!images.some(image => image.isThumbnail && hasFile(image))) images = [...images, ...photos.filter(photo => photo.isThumbnail).slice(0, 1)];
  return refillDailyImages({ ...input, images });
}

/** Returns the original images plus whatever the free engines produced, thumbnail first. A failing engine passes to the next. */
export async function refillDailyImages<T extends DailyRefillImage>(input: DailyRefillInput<T>): Promise<T[]> {
  const primary = text(input.primaryProvider) === 'imagefx' ? 'flow' : text(input.primaryProvider);
  let images: T[] = [...input.images];
  for (const engine of DAILY_FREE_IMAGE_ENGINES.filter(name => name !== primary)) {
    const missing = missingDailyImageItems({ ...input, images });
    if (!missing.length) break;
    input.log?.(`   🔁 빈 이미지 ${missing.length}자리를 무료 엔진(${engine})으로 채웁니다.`);
    try {
      const filled = label(await input.generate(engine, missing), missing);
      input.log?.(`   ${filled.length ? '✅' : '⚠️'} ${engine}: ${filled.length}/${missing.length}자리 채움`);
      images = [...images, ...filled];
    } catch (error) {
      if (isCancel(error)) throw error;
      input.log?.(`   ⚠️ ${engine} 실패 → 다음 무료 엔진으로: ${(error as Error)?.message || error}`);
    }
  }
  const thumbnail = images.find(image => image.isThumbnail && hasFile(image));
  return [...(thumbnail ? [thumbnail] : []), ...images.filter(image => image !== thumbnail)];
}
