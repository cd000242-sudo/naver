/**
 * SPEC-NAVER-IMAGE-2026 — main-process entry for the thumbnail director.
 *
 * main.ts calls this instead of generateImages. Anything that is not a lone thumbnail item on a
 * generative engine passes straight through, unchanged. The generator and the title-overlay step are
 * injected by the caller so this module never imports imageGenerator (no cycle).
 */
import fs from 'fs';
import type { GenerateImagesOptions, GeneratedImage, ImageRequestItem, ThumbnailDirectorRequest } from '../types.js';
import { shouldApplyContextualPromptForProvider } from '../contextualImagePrompt.js';
import { getImageSaveBasePath } from '../imageUtils.js';
import { resolveIssueVisionRoute } from '../../crawler/issueHarness/visionRoute.js';
import { judgeImagesWithRoute } from '../../crawler/issueHarness/visionJudges.js';
import { toVisionJpegBase64 } from '../../crawler/issueHarness/candidateFetcher.js';
import { composeHookCard800, composeSquare800, composeTightCrop800 } from './thumbnailComposer.js';
import { MIN_REAL_PHOTO_SIDE, composePair800, readOrientedSize } from './thumbnailPairComposer.js';
import { judgeThumbnailCandidates } from './thumbnailJudge.js';
import { runThumbnailDirector, type ThumbnailDirectorResult } from './thumbnailDirector.js';
import { isRealAssetPriorityTopic, resolveRealAssets, summarizeInventory, type AssetEntry } from './realAssetResolver.js';
import { inferArticleVisualKind } from './sectionRolePlanner.js';
import { normalizeThumbnailTextMode, resolveThumbnailOverlayText } from './thumbnailText.js';
import { checkThumbnailPlan } from './imageQualityCheck.js';
import { withTextInImage, withTextNotInImage, withTextNotWanted } from './thumbnailTextState.js';
import { drawsKoreanTextItself } from './koreanTextEngines.js';

type OnImage = (image: GeneratedImage, index: number, total: number) => void;
type GenerateFn = (options: GenerateImagesOptions, apiKeys?: any, onImageGenerated?: OnImage) => Promise<GeneratedImage[]>;
type OverlayFn = (
  images: GeneratedImage[],
  provider: string,
  postTitle?: string,
  include?: boolean,
  items?: ImageRequestItem[],
) => Promise<GeneratedImage[]>;

export interface ThumbnailDirectorContext {
  readonly config?: unknown;
  readonly generate: GenerateFn;
  readonly applyTitleOverlay: OverlayFn;
}

const LOG = '[ThumbnailDirector]';

/** The lone thumbnail item this call is about, or null to pass straight through. */
export function resolveThumbnailDirectorTarget(options: GenerateImagesOptions, config?: unknown): ImageRequestItem | null {
  if (process.env.BLN_THUMBNAIL_DIRECTOR === 'off') return null;
  if ((config as { thumbnailDirectorEnabled?: unknown } | undefined)?.thumbnailDirectorEnabled === false) return null;
  // Opt-in only: the renderer marks article-thumbnail requests and the main multi-account path passes {}.
  // The manual thumbnail tools and the image studio send their own complete prompts — never rewrite those.
  if (!options.thumbnailDirector || typeof options.thumbnailDirector !== 'object') return null;
  if (options.isShoppingConnect) return null;
  const items = Array.isArray(options.items) ? options.items : [];
  if (items.length !== 1) return null;
  const item = items[0];
  const heading = String(item?.heading || '').toLowerCase();
  if (item?.isThumbnail !== true && !heading.includes('썸네일') && !heading.includes('thumbnail')) return null;
  const provider = String(options.provider || '').trim().toLowerCase();
  if (!provider || provider === 'skip' || !shouldApplyContextualPromptForProvider(provider)) return null;
  return item;
}

export function isLocalImageFile(filePath: string | undefined): boolean {
  const value = String(filePath || '').trim();
  if (!value || /^(?:https?:|data:|blob:)/iu.test(value)) return false;
  try {
    return fs.existsSync(value) && fs.statSync(value).isFile();
  } catch {
    return false;
  }
}

/** Real photos that can carry a thumbnail: readable and not so small that 800px would blur them. */
export async function keepUsableRealPhotos(files: readonly string[], log: (message: string) => void): Promise<string[]> {
  const usable: string[] = [];
  for (const file of files) {
    const size = await readOrientedSize(file);
    if (!size) {
      log(`${LOG} ⚠️ 실제 사진을 읽을 수 없어 합성에서 뺐습니다: ${file}`);
    } else if (Math.min(size.width, size.height) < MIN_REAL_PHOTO_SIDE) {
      log(`${LOG} ⚠️ 실제 사진이 너무 작아(${size.width}x${size.height}) 합성에서 뺐습니다`);
    } else {
      usable.push(file);
    }
  }
  return usable;
}

/** 'high' only when the user turned on 고품질 썸네일 (image management tab). */
export function resolveThumbnailQualityMode(config?: unknown): 'standard' | 'high' {
  return (config as { thumbnailQualityMode?: unknown } | undefined)?.thumbnailQualityMode === 'high' ? 'high' : 'standard';
}

function toDataUrl(filePath: string): string | undefined {
  try {
    return `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
  } catch {
    return undefined;
  }
}

/** Map the winner back to the image shape every flow already handles. */
/** [NAVER FULL AUTO] Asset label of the winning candidate, for slot records and preview badges. */
export function directorAssetKind(winner: ThumbnailDirectorResult['winner']): 'real-pair' | 'real' | 'ai' {
  if (!winner.real) return 'ai';
  return String(winner.kind).startsWith('real-pair') ? 'real-pair' : 'real';
}

export function toDirectorImage(
  result: ThumbnailDirectorResult,
  item: ImageRequestItem,
  requestedProvider: string,
  dataUrl: (filePath: string) => string | undefined = toDataUrl,
): GeneratedImage {
  const { base, winner } = result;
  const flags = winner.bakedText ? { disableTextOverlay: true, textRendered: true } : {};
  const assetKind = directorAssetKind(winner);
  if (base && winner.kind === 'ai-full') {
    return { ...base, heading: item.heading, isThumbnail: item.isThumbnail, assetKind };
  }
  const file = {
    filePath: winner.filePath,
    savedToLocal: winner.filePath,
    url: winner.filePath,
    previewDataUrl: dataUrl(winner.filePath) || base?.previewDataUrl || '',
    width: 800,
    height: 800,
    mimeType: 'image/png',
  };
  if (base) {
    // Variant of the AI base: same provider (AI mark stays on), new file; blob ids no longer match.
    return { ...base, ...file, ...flags, blobId: undefined, sha256: undefined, byteSize: undefined, heading: item.heading, isThumbnail: item.isThumbnail, assetKind };
  }
  return {
    ...file,
    ...flags,
    heading: item.heading,
    isThumbnail: item.isThumbnail,
    originalIndex: (item as { originalIndex?: number }).originalIndex,
    provider: winner.bakedText ? 'collected-image-with-text' : 'collected-image',
    requestedProvider,
    actualProvider: 'collected-image',
    isCollected: true,
    assetKind,
  } as GeneratedImage;
}

export async function generateImagesWithThumbnailDirector(
  options: GenerateImagesOptions,
  apiKeys: any,
  onImageGenerated: OnImage | undefined,
  context: ThumbnailDirectorContext,
): Promise<GeneratedImage[]> {
  const item = resolveThumbnailDirectorTarget(options, context.config);
  if (!item) return context.generate(options, apiKeys, onImageGenerated);

  const provider = String(options.provider || '').trim().toLowerCase();
  const request: ThumbnailDirectorRequest = options.thumbnailDirector || {};
  const title = String(options.postTitle || options.articleTitle || item.heading || '').trim();
  const kind = inferArticleVisualKind(options.category, title);
  const qualityMode = resolveThumbnailQualityMode(context.config);
  // Flows without an explicit mode keep their own checkbox: include / exclude (no AUTO there).
  const textMode = request.textMode
    ? normalizeThumbnailTextMode(request.textMode)
    : (options.thumbnailTextInclude === true ? 'include' : 'exclude');
  const inventory = resolveRealAssets(
    {
      placed: (request.realImages || []) as AssetEntry[],
      // URL mode stores objects here despite the string[] type — accept both.
      sourceUrls: (options.collectedImages || []).map((entry: any) => (typeof entry === 'string' ? entry : String(entry?.url || entry?.filePath || ''))),
    },
    isLocalImageFile,
  );
  const realPriority = isRealAssetPriorityTopic(title, options.category);
  const route = qualityMode === 'high' ? resolveIssueVisionRoute(context.config) : null;
  const log = (message: string) => console.log(message);
  const realImages = await keepUsableRealPhotos(inventory.composable, log);
  log(`${LOG} 🖼️ 썸네일 설계 · 자산: ${summarizeInventory(inventory)} · 실제 사진 우선 주제=${realPriority}`
    + ` · 심사: ${qualityMode === 'high' ? (route ? `${route.label}${route.free ? ' (구독, 추가 과금 0)' : ' (유료 API, 최저가 모델)'}` : '경로 없음(1번 유지)') : '없음(표준 모드)'}`);

  const result = await runThumbnailDirector({
    title,
    cardPromise: String(request.cardPromise || '').trim(),
    item,
    textMode,
    qualityMode,
    kind,
    allowBakedText: request.allowBakedText === true,
    keepPrompt: request.keepPrompt === true,
    // The engine draws the copy itself whenever the director decides there is copy (사장님 2026-09-23).
    engineDrawsText: drawsKoreanTextItself(provider),
    realImages,
    realWorkDir: `${await getImageSaveBasePath()}/thumbnail-candidates`,
  }, {
    generateBase: async (coverItem) => {
      const images = await context.generate({ ...options, items: [coverItem], thumbnailTextInclude: false, thumbnailDirector: undefined }, apiKeys);
      return images?.[0] || null;
    },
    composeSquare: composeSquare800,
    composeTight: (input, output) => composeTightCrop800(input, output),
    composeHook: (input, output, hook) => composeHookCard800(input, output, hook),
    composePair: (left, right, output, hook) => composePair800(left, right, output, hook),
    toJudgeImage: async (filePath) => ({ base64: await toVisionJpegBase64(fs.readFileSync(filePath)) }),
    judge: (images, ctx, candidates) => judgeThumbnailCandidates(
      images, ctx, candidates, route ? (imgs, prompt) => judgeImagesWithRoute(imgs, prompt, route) : null, log,
    ),
    isLocalFile: isLocalImageFile,
    log,
    isCancelled: () => options.stopCheck?.() === true,
  });
  if (!result) return [];

  let image = toDirectorImage(result, item, provider);
  if (result.engineDrewText) {
    // [2026-09-23 사장님] The engine drew the copy itself — no app overlay on top of it.
    image = withTextInImage(image);
  } else if (!result.winner.bakedText) {
    // Same overlay generateImages would have applied, same conditions (the item's allowText included) —
    // but a short phrase, never the title.
    [image] = await context.applyTitleOverlay(
      [image], result.winner.real ? String(image.provider) : provider, resolveThumbnailOverlayText(title), options.thumbnailTextInclude, [item],
    );
  }
  if (image.textRendered !== true) {
    // FINAL §3: AUTO decided "no text" → none at publish either; otherwise the publish overlay may add it once.
    image = textMode === 'auto' && !result.text.include ? withTextNotWanted(image) : withTextNotInImage(image);
  }
  const notice = realPriority && realImages.length === 0
    ? `실제 인물·제품·장소 글입니다. 실제 사진이 있으면 이미지 관리 탭에서 먼저 넣어 주세요 — 이번 썸네일은 닮은 인물 없이 상황·사물로 만들었습니다${inventory.counts.REFERENCE_ONLY > 0 ? ` (참고용 ${inventory.counts.REFERENCE_ONLY}장은 사용 권한 미확인이라 합성하지 않음)` : ''}.`
    : undefined;
  const check = checkThumbnailPlan({
    title,
    text: result.winner.bakedText || result.engineDrewText ? result.text.text : (options.thumbnailTextInclude === true ? resolveThumbnailOverlayText(title) : null),
    width: 800,
    height: 800,
    realAssetPriority: realPriority,
    realAssetAvailable: realImages.length > 0,
    usedRealAsset: result.winner.real,
    aiDepictsRealPerson: false,
  });
  log(`${LOG} 🏁 선택: ${result.winner.label} (${result.verdict ? result.verdict.source : '단일'}) · 후보 ${result.candidates.length}개 · 점검 ${check.verdict}${check.reasons.length ? ` — ${check.reasons.join(' / ')}` : ''}`);
  if (notice) log(`${LOG} 💡 ${notice}`);
  const final = notice ? { ...image, directorNotice: notice } : image;
  onImageGenerated?.(final, 0, 1);
  return [final];
}
