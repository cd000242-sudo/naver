/**
 * [2026-11-07 owner] Animated GIF ("움짤") from GPT Image 2.6.
 *
 * Pure policy, no I/O. The 2.6 models (sunburst / flare) accept output_format "gif" on v1/images/generations;
 * nothing else in the app can draw one. Rules:
 *  - 2.6 only. A saved 2.5 choice is never swapped silently: the request stops with a short notice.
 *  - Other engines (Flow, Codex subscription image, ...) never get a GIF request; an explicit card request is refused.
 *  - The thumbnail always stays a still image.
 *  - A GIF is saved as the exact bytes the API returned. Over the Naver 20MB limit it is refused, never recoded to JPEG.
 */
import { NAVER_SINGLE_IMAGE_MAX_BYTES, NAVER_SINGLE_IMAGE_MAX_MB } from '../automation/naverImagePolicy.js';
import { normalizeOpenaiImageModel } from '../runtime/modelRegistry.js';

export const GIF_CAPABLE_OPENAI_MODELS: readonly string[] = ['gpt-image-2.6-sunburst', 'gpt-image-2.6-flare'];

/** Official range: frame_count 2-16, frame_duration_ms 20-2000. Docs recommend 9 frames x 200ms. */
export const GIF_FRAME_COUNT_DEFAULT = 9;
export const GIF_FRAME_COUNT_MIN = 2;
export const GIF_FRAME_COUNT_MAX = 16;
export const GIF_FRAME_DURATION_DEFAULT_MS = 200;
export const GIF_FRAME_DURATION_MIN_MS = 20;
export const GIF_FRAME_DURATION_MAX_MS = 2000;

/** A GIF call renders every frame: allow far more than the 2 minutes a still image gets. */
export const GIF_REQUEST_TIMEOUT_MS = 300_000;

export const GIF_MAX_BYTES = NAVER_SINGLE_IMAGE_MAX_BYTES;

export const GIF_ONLY_26_MESSAGE = '움짤은 GPT 이미지 2.6 에서만 됩니다.';
export const GIF_NO_SHOPPING_MESSAGE = '쇼핑 글 이미지는 움짤로 만들 수 없습니다.';

/** Error message prefixes. A GIF_ error is final: retrying only pays for the same result again. */
export const GIF_NOT_RETURNED_TAG = 'GIF_NOT_RETURNED';
export const GIF_TOO_LARGE_TAG = 'GIF_TOO_LARGE';
const GIF_FATAL_PATTERN = /^GIF_[A-Z_]+/u;

export interface GifRequestFields {
  readonly output_format: 'gif';
  readonly frame_count: number;
  readonly frame_duration_ms: number;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function isGifCapableOpenaiModel(model: unknown): boolean {
  return typeof model === 'string' && GIF_CAPABLE_OPENAI_MODELS.includes(model.trim());
}

export function buildGifRequestFields(options: { frameCount?: number; frameDurationMs?: number } = {}): GifRequestFields {
  return {
    output_format: 'gif',
    frame_count: clampInt(options.frameCount, GIF_FRAME_COUNT_MIN, GIF_FRAME_COUNT_MAX, GIF_FRAME_COUNT_DEFAULT),
    frame_duration_ms: clampInt(options.frameDurationMs, GIF_FRAME_DURATION_MIN_MS, GIF_FRAME_DURATION_MAX_MS, GIF_FRAME_DURATION_DEFAULT_MS),
  };
}

export function isGifBuffer(buffer: Buffer | null | undefined): boolean {
  if (!buffer || buffer.length < 6) return false;
  const head = buffer.subarray(0, 6).toString('latin1');
  return head === 'GIF87a' || head === 'GIF89a';
}

/** One frame's size from the logical screen descriptor (little-endian), or null when it is not a GIF. */
export function readGifSize(buffer: Buffer): { width: number; height: number } | null {
  if (!isGifBuffer(buffer) || buffer.length < 10) return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

/** Throws before anything is written: not a GIF (the API ignored the format) or over Naver's single-image limit. */
export function assertGifSavable(buffer: Buffer): void {
  if (!isGifBuffer(buffer)) {
    throw new Error(`${GIF_NOT_RETURNED_TAG}: 움짤 요청인데 GIF 가 아닌 이미지가 왔습니다. 저장하지 않았습니다.`);
  }
  if (buffer.length > GIF_MAX_BYTES) {
    const mb = (buffer.length / (1024 * 1024)).toFixed(1);
    throw new Error(`${GIF_TOO_LARGE_TAG}: 움짤이 ${mb}MB 로 네이버 한도 ${NAVER_SINGLE_IMAGE_MAX_MB}MB 를 넘습니다. JPEG 로 바꾸지 않고 저장하지 않았습니다.`);
  }
}

export function isGifFatalError(error: unknown): boolean {
  return GIF_FATAL_PATTERN.test(String((error as { message?: unknown } | null | undefined)?.message ?? ''));
}

/** A generated image that is (or carries) a GIF: by extension, MIME type or preview data URL. */
export function isAnimatedGifImage(image: unknown): boolean {
  const img = image as { filePath?: unknown; savedToLocal?: unknown; mimeType?: unknown; previewDataUrl?: unknown } | null | undefined;
  if (!img || typeof img !== 'object') return false;
  if (/\.gif$/iu.test(String(img.filePath ?? '').split(/[?#]/u)[0])) return true;
  if (/\.gif$/iu.test(String(img.savedToLocal ?? '').split(/[?#]/u)[0])) return true;
  if (String(img.mimeType ?? '').toLowerCase() === 'image/gif') return true;
  return /^data:image\/gif[;,]/iu.test(String(img.previewDataUrl ?? ''));
}

interface GifPlanItem {
  readonly heading?: string;
  readonly isThumbnail?: boolean;
  readonly animatedGif?: boolean;
}

export interface AnimatedGifPlanInput<T extends GifPlanItem> {
  readonly provider: string;
  /** The model the OpenAI engine will use (request value or saved config); normalized here like the generator does. */
  readonly model: unknown;
  readonly items: readonly T[];
  /** config.headingImageAnimated ("움짤로 만들기"). */
  readonly settingOn: boolean;
  /** true for the article publish paths only; the image studio and tools never turn into GIFs by setting. */
  readonly articleSectionImages: boolean;
  readonly isShoppingConnect: boolean;
}

function isThumbnailItem(item: GifPlanItem): boolean {
  const heading = String(item.heading ?? '').toLowerCase();
  return item.isThumbnail === true || heading.includes('썸네일') || heading.includes('thumbnail');
}

/**
 * Which items become GIFs. Throws a short Korean notice when a GIF was asked for but cannot be made —
 * the caller stops the whole call before any paid request goes out.
 */
export function planAnimatedGif<T extends GifPlanItem>(input: AnimatedGifPlanInput<T>): ReadonlySet<T> {
  const sections = input.items.filter((item) => !isThumbnailItem(item));
  const explicit = sections.filter((item) => item.animatedGif === true);

  if (input.isShoppingConnect) {
    if (explicit.length > 0) throw new Error(GIF_NO_SHOPPING_MESSAGE);
    return new Set<T>();
  }

  const viaSetting = input.settingOn && input.articleSectionImages ? sections : [];

  if (input.provider !== 'openai-image') {
    // A saved checkbox must not break another engine; an explicit card request must not be silently ignored.
    if (explicit.length > 0) throw new Error(GIF_ONLY_26_MESSAGE);
    return new Set<T>();
  }

  const wanted = new Set<T>([...explicit, ...viaSetting]);
  // dall-e-3 is a caller-forced model the generator never normalizes; every other value follows the app's own rule.
  const requested = String(input.model ?? '').trim();
  const model = requested === 'dall-e-3' ? requested : normalizeOpenaiImageModel(requested);
  if (wanted.size > 0 && !isGifCapableOpenaiModel(model)) {
    throw new Error(GIF_ONLY_26_MESSAGE);
  }
  return wanted;
}
