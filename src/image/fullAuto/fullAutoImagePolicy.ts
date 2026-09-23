/**
 * NAVER FULL AUTO — image strategy, kept separate from the content writing mode.
 *
 * contentMode (seo / homefeed / mate / business / custom / affiliate) decides how the ARTICLE is
 * written. The image strategy decides how its IMAGES are made. FULL AUTO defaults to the Naver
 * homefeed image strategy for every writing mode: one 800x800 thumbnail plus one 800x800 image per
 * final H2 (within the heading scope), real assets first. Nothing here reads contentMode.
 *
 * Pure module: no DOM, no storage, no Node APIs. It is inlined into the renderer bundle
 * (scripts/copy-static.mjs), so every top-level name carries a fullAuto prefix.
 */

export type FullAutoImageStrategy = 'naver-homefeed' | 'user-settings';
export type FullAutoHeadingScope = 'all' | 'odd' | 'even' | 'none';
export type FullAutoThumbnailTextMode = 'auto' | 'include' | 'none';

export const FULL_AUTO_DEFAULT_IMAGE_STRATEGY: FullAutoImageStrategy = 'naver-homefeed';
/** Naver homefeed card size used for the thumbnail and every H2 image. */
export const FULL_AUTO_HOMEFEED_IMAGE_SIZE = 800;

export const FULL_AUTO_IMAGE_STRATEGY_LABELS: Readonly<Record<FullAutoImageStrategy, string>> = Object.freeze({
  'naver-homefeed': '홈판/피드 최적화',
  'user-settings': '내 이미지 설정 그대로',
});

export const FULL_AUTO_HEADING_SCOPE_LABELS: Readonly<Record<FullAutoHeadingScope, string>> = Object.freeze({
  all: '전체',
  odd: '홀수',
  even: '짝수',
  none: '없음',
});

export const FULL_AUTO_THUMBNAIL_TEXT_LABELS: Readonly<Record<FullAutoThumbnailTextMode, string>> = Object.freeze({
  auto: 'AUTO',
  include: '포함',
  none: '미포함',
});

export function normalizeFullAutoImageStrategy(value: unknown): FullAutoImageStrategy {
  return String(value ?? '').trim() === 'user-settings' ? 'user-settings' : FULL_AUTO_DEFAULT_IMAGE_STRATEGY;
}

/** Accepts the scope names and the app's legacy headingImageMode values; null when unknown. */
export function parseFullAutoHeadingScope(value: unknown): FullAutoHeadingScope | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'all') return 'all';
  if (raw === 'odd' || raw === 'odd-only') return 'odd';
  if (raw === 'even' || raw === 'even-only') return 'even';
  // The spec's NONE is "no H2 images" — the thumbnail is separate — which is the app's 'thumbnail-only'.
  if (raw === 'none' || raw === 'thumbnail-only') return 'none';
  return null;
}

/** The app-wide headingImageMode value for a scope ('none' keeps the thumbnail). */
export function fullAutoScopeToHeadingImageMode(scope: FullAutoHeadingScope): string {
  if (scope === 'odd') return 'odd-only';
  if (scope === 'even') return 'even-only';
  if (scope === 'none') return 'thumbnail-only';
  return 'all';
}

export function normalizeFullAutoThumbnailTextMode(value: unknown): FullAutoThumbnailTextMode | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'auto') return 'auto';
  if (raw === 'include' || raw === 'true') return 'include';
  if (raw === 'none' || raw === 'exclude' || raw === 'false') return 'none';
  return null;
}

function fullAutoFlagOn(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

export interface FullAutoImageSettingsInput {
  /** Stored strategy ('naver-homefeed' default). */
  readonly strategy?: unknown;
  /** Explicit per-job scope (queue item or this run); wins over the global mode. */
  readonly headingScope?: unknown;
  /** App-wide headingImageMode ('all' | 'odd-only' | 'even-only' | 'thumbnail-only' | 'none'). */
  readonly headingImageMode?: unknown;
  /** Explicit homefeed thumbnail text mode (AUTO / 포함 / 미포함). */
  readonly thumbnailTextMode?: unknown;
  /** Legacy "썸네일 텍스트 포함" checkbox. */
  readonly thumbnailTextInclude?: boolean;
  readonly textOnlyPublish?: boolean;
  readonly skipImages?: boolean;
  readonly realAssetFirst?: unknown;
  readonly realPair?: unknown;
  readonly thumbnailImageRatio?: unknown;
  readonly subheadingImageRatio?: unknown;
}

export interface FullAutoImagePolicy {
  readonly strategy: FullAutoImageStrategy;
  /** False only when the user chose text-only publishing ("이미지 없음"). */
  readonly imagesEnabled: boolean;
  readonly thumbnail: {
    readonly enabled: boolean;
    readonly ratio: string;
    readonly textMode: FullAutoThumbnailTextMode;
  };
  readonly sections: {
    readonly scope: FullAutoHeadingScope;
    /** Same scope in the app's headingImageMode vocabulary. */
    readonly headingImageMode: string;
    readonly ratio: string;
  };
  /** 800 under the homefeed strategy (every image is normalized to 800x800); null keeps the user ratio. */
  readonly squareSize: number | null;
  readonly realAssetFirst: boolean;
  readonly realPair: boolean;
}

function fullAutoRatioOrDefault(value: unknown): string {
  const raw = String(value ?? '').trim();
  return /^\d{1,2}:\d{1,2}$/u.test(raw) ? raw : '1:1';
}

function resolveFullAutoThumbnailTextMode(strategy: FullAutoImageStrategy, input: FullAutoImageSettingsInput): FullAutoThumbnailTextMode {
  const explicit = normalizeFullAutoThumbnailTextMode(input.thumbnailTextMode);
  if (strategy === 'naver-homefeed') {
    if (explicit) return explicit;
    // The legacy checkbox is ambiguous when off (it is the default) but explicit when on.
    return input.thumbnailTextInclude === true ? 'include' : 'auto';
  }
  return input.thumbnailTextInclude === true ? 'include' : 'none';
}

/**
 * The image policy for one FULL AUTO job. Content mode is deliberately not an input: an SEO article
 * and a homefeed article get the same homefeed images unless the user picked another strategy.
 */
export function resolveFullAutoImagePolicy(input: FullAutoImageSettingsInput = {}): FullAutoImagePolicy {
  const strategy = normalizeFullAutoImageStrategy(input.strategy);
  const globalMode = String(input.headingImageMode ?? '').trim();
  const imagesEnabled = input.textOnlyPublish !== true && input.skipImages !== true && globalMode !== 'none';
  const scope = parseFullAutoHeadingScope(input.headingScope) ?? parseFullAutoHeadingScope(globalMode) ?? 'all';
  const homefeed = strategy === 'naver-homefeed';
  return Object.freeze({
    strategy,
    imagesEnabled,
    thumbnail: Object.freeze({
      enabled: imagesEnabled,
      ratio: homefeed ? '1:1' : fullAutoRatioOrDefault(input.thumbnailImageRatio),
      textMode: resolveFullAutoThumbnailTextMode(strategy, input),
    }),
    sections: Object.freeze({
      scope,
      headingImageMode: fullAutoScopeToHeadingImageMode(scope),
      ratio: homefeed ? '1:1' : fullAutoRatioOrDefault(input.subheadingImageRatio),
    }),
    squareSize: homefeed ? FULL_AUTO_HOMEFEED_IMAGE_SIZE : null,
    realAssetFirst: fullAutoFlagOn(input.realAssetFirst, true),
    realPair: fullAutoFlagOn(input.realPair, true),
  });
}

/** Director text mode ('auto' | 'include' | 'exclude') for the policy's thumbnail. */
export function fullAutoDirectorTextMode(policy: Pick<FullAutoImagePolicy, 'thumbnail'>): 'auto' | 'include' | 'exclude' {
  const mode = policy.thumbnail.textMode;
  return mode === 'none' ? 'exclude' : mode;
}

/** One-line Korean summary shown next to the writing mode, e.g. in the queue and the publish panel. */
export function describeFullAutoImagePolicy(policy: FullAutoImagePolicy): string {
  const strategy = FULL_AUTO_IMAGE_STRATEGY_LABELS[policy.strategy];
  if (!policy.imagesEnabled) return `${strategy} · 이미지 없음(글만 발행)`;
  const sections = policy.sections.scope === 'none'
    ? '소제목 이미지 없음'
    : `소제목 ${FULL_AUTO_HEADING_SCOPE_LABELS[policy.sections.scope]}`;
  const size = policy.squareSize ? ` · ${policy.squareSize}x${policy.squareSize}` : '';
  return `${strategy} · 썸네일 1 + ${sections}${size} · 썸네일 문구 ${FULL_AUTO_THUMBNAIL_TEXT_LABELS[policy.thumbnail.textMode]}`;
}
