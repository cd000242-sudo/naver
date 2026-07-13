// [SPEC-STABILITY-2026 Phase 7.1] Single resolution point for publish-pipeline
// settings. Each flow entry calls resolvePipelineConfig() ONCE per publish item
// and passes the object down — downstream/shared code must not read
// localStorage directly (pipeline-map §5-1). Key names and defaults are
// defined HERE and nowhere else; three flows must never interpret the same
// key with different defaults again.

import { isShoppingReferenceImageEngine } from '../../image/shoppingReferenceGeneration.js';

export type PipelineFlow = 'full-auto' | 'continuous' | 'multi-account';
export type ShoppingSubImageMode = 'ai' | 'collected';

export interface ImagePipelineConfig {
  headingImageMode: string;
  thumbnailTextInclude: boolean;
  textOnlyPublish: boolean;
  imageSource: string;
  imageStyle: string;
  imageRatio: string;
  thumbnailImageRatio: string;
  subheadingImageRatio: string;
  fallbackPolicy: string;
}

export interface ShoppingConnectPipelineConfig {
  subImageMode: ShoppingSubImageMode;
  aiImageEngine: string;
  autoThumbnail: boolean;
}

export interface DisclosurePipelineConfig {
  enabledSetting: boolean | null;
  text: string;
  defaultText: string;
}

export interface SafetyPipelineConfig {
  adbIpChangeEnabled: boolean;
  adbIpChangeEvery: number;
}

export interface PipelineConfig {
  flow: PipelineFlow;
  resolvedAt: number;
  image: ImagePipelineConfig;
  shopping: ShoppingConnectPipelineConfig;
  disclosure: DisclosurePipelineConfig;
  safety: SafetyPipelineConfig;
}

export interface PipelineFormDataSnapshot extends Record<string, unknown> {
  pipelineConfigSnapshot: PipelineConfig;
  headingImageMode: string;
  includeThumbnailText: boolean;
  skipImages: boolean;
  imageSource: string;
  imageStyle: string;
  imageRatio: string;
  thumbnailImageRatio: string;
  subheadingImageRatio: string;
  imageFallbackPolicy: string;
  scSubImageMode: ShoppingSubImageMode;
  scAIImageEngine: string;
  scAutoThumbnailSetting: boolean;
}

function pipelineReadString(key: string, fallback: string): string {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function pipelineReadBool(key: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export interface RawPipelineSettings {
  headingImageMode: string | null;
  thumbnailTextInclude: string | null;
  textOnlyPublish: string | null;
  imageStyle: string | null;
  imageRatio: string | null;
  thumbnailImageRatio: string | null;
  subheadingImageRatio: string | null;
  fullAutoImageSource: string | null;
  globalImageSource: string | null;
  imageFallbackPolicy: string | null;
  scSubImageMode: string | null;
  scSubImageSource: string | null;
  scAIImageEngine: string | null;
  scAutoThumbnailSetting: string | null;
  ftcDisclosureEnabled: string | null;
  ftcDisclosureText: string | null;
  adbIpChangeEnabled: string | null;
  adbIpChangeEvery: string | null;
}

function pipelineReadRaw(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Raw (null-preserving) reads for shared helpers that keep their own legacy
// fallback chains (e.g. thumbnailImageRatio || imageRatio || '1:1'). This is
// the ONLY other sanctioned localStorage touchpoint besides
// resolvePipelineConfig — chains stay at the call site until each one is
// deliberately normalized into the standard resolution above.
export function readRawPipelineSettings(): RawPipelineSettings {
  return {
    headingImageMode: pipelineReadRaw('headingImageMode'),
    thumbnailTextInclude: pipelineReadRaw('thumbnailTextInclude'),
    textOnlyPublish: pipelineReadRaw('textOnlyPublish'),
    imageStyle: pipelineReadRaw('imageStyle'),
    imageRatio: pipelineReadRaw('imageRatio'),
    thumbnailImageRatio: pipelineReadRaw('thumbnailImageRatio'),
    subheadingImageRatio: pipelineReadRaw('subheadingImageRatio'),
    fullAutoImageSource: pipelineReadRaw('fullAutoImageSource'),
    globalImageSource: pipelineReadRaw('globalImageSource'),
    imageFallbackPolicy: pipelineReadRaw('imageFallbackPolicy'),
    scSubImageMode: pipelineReadRaw('scSubImageMode'),
    scSubImageSource: pipelineReadRaw('scSubImageSource'),
    scAIImageEngine: pipelineReadRaw('scAIImageEngine'),
    scAutoThumbnailSetting: pipelineReadRaw('scAutoThumbnailSetting'),
    ftcDisclosureEnabled: pipelineReadRaw('ftcDisclosureEnabled'),
    ftcDisclosureText: pipelineReadRaw('ftcDisclosureText'),
    adbIpChangeEnabled: pipelineReadRaw('adbIpChangeEnabled'),
    adbIpChangeEvery: pipelineReadRaw('adbIpChangeEvery'),
  };
}

const DEFAULT_FTC_DISCLOSURE_TEXT =
  '이 포스팅은 쇼핑커넥트/제휴마케팅 활동의 일환으로, 링크를 통한 구매 시 작성자에게 일정 수수료가 지급될 수 있습니다.';

const SHOPPING_AI_ENGINE_NAMES = new Set([
  'nano-banana',
  'nano-banana-pro',
  'nano-banana-2',
  'openai-image',
  'gpt-image-2',
  'imagefx',
  'leonardoai',
  'deepinfra',
  'deepinfra-flux',
  'stability',
  'falai',
  'prodia',
  'pollinations',
  'flow',
  'dropshot',
]);

const DEFAULT_SHOPPING_REFERENCE_ENGINE = 'nano-banana-2';

const SHOPPING_ENGINE_ALIASES: Readonly<Record<string, string>> = {
  'gpt-image-2': 'openai-image',
};

function normalizeShoppingConnectAIEngineCandidate(value: unknown): string {
  const raw = String(value || '').trim();
  const normalized = SHOPPING_ENGINE_ALIASES[raw] || raw;
  return isShoppingReferenceImageEngine(normalized) ? normalized : '';
}

export function normalizeShoppingConnectAIEngine(value: unknown): string {
  return normalizeShoppingConnectAIEngineCandidate(value) || DEFAULT_SHOPPING_REFERENCE_ENGINE;
}

export function resolveShoppingConnectAIEngineFromRaw(
  raw: Pick<
    RawPipelineSettings,
    'scAIImageEngine' | 'scSubImageSource' | 'fullAutoImageSource' | 'globalImageSource'
  >,
): string {
  for (const candidate of [
    raw.scAIImageEngine,
    raw.scSubImageSource,
    raw.fullAutoImageSource,
    raw.globalImageSource,
  ]) {
    const normalized = normalizeShoppingConnectAIEngineCandidate(candidate);
    if (normalized) return normalized;
  }
  return DEFAULT_SHOPPING_REFERENCE_ENGINE;
}

function normalizeShoppingSubImageMode(raw: RawPipelineSettings): ShoppingSubImageMode {
  const explicit = raw.scSubImageMode;
  if (explicit === 'ai' || explicit === 'collected') return explicit;

  const legacy = raw.scSubImageSource;
  if (legacy === 'ai' || legacy === 'collected') return legacy;
  if (legacy && SHOPPING_AI_ENGINE_NAMES.has(legacy)) return 'ai';

  return 'collected';
}

function normalizePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
}

export function resolvePipelineConfig(flow: PipelineFlow): PipelineConfig {
  const raw = readRawPipelineSettings();
  const config: PipelineConfig = {
    flow,
    resolvedAt: Date.now(),
    image: {
      headingImageMode: pipelineReadString('headingImageMode', 'all'),
      thumbnailTextInclude: pipelineReadBool('thumbnailTextInclude'),
      textOnlyPublish: pipelineReadBool('textOnlyPublish'),
      imageSource: raw.fullAutoImageSource || raw.globalImageSource || 'nano-banana-pro',
      imageStyle: pipelineReadString('imageStyle', 'realistic'),
      imageRatio: pipelineReadString('imageRatio', '1:1'),
      thumbnailImageRatio: pipelineReadString('thumbnailImageRatio', '1:1'),
      subheadingImageRatio: pipelineReadString('subheadingImageRatio', '1:1'),
      fallbackPolicy: raw.imageFallbackPolicy || 'engine-only',
    },
    shopping: {
      subImageMode: normalizeShoppingSubImageMode(raw),
      aiImageEngine: resolveShoppingConnectAIEngineFromRaw(raw),
      autoThumbnail: raw.scAutoThumbnailSetting === 'true',
    },
    disclosure: {
      enabledSetting: raw.ftcDisclosureEnabled === null ? null : raw.ftcDisclosureEnabled === 'true',
      text: (raw.ftcDisclosureText || '').trim(),
      defaultText: DEFAULT_FTC_DISCLOSURE_TEXT,
    },
    safety: {
      adbIpChangeEnabled: raw.adbIpChangeEnabled === 'true',
      adbIpChangeEvery: normalizePositiveInt(raw.adbIpChangeEvery, 1),
    },
  };

  Object.freeze(config.image);
  Object.freeze(config.shopping);
  Object.freeze(config.disclosure);
  Object.freeze(config.safety);
  return Object.freeze(config);
}

function nonEmptyString(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function isPipelineConfigForFlow(value: unknown, flow: PipelineFlow): value is PipelineConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PipelineConfig>;
  return candidate.flow === flow
    && Boolean(candidate.image)
    && Boolean(candidate.shopping)
    && Boolean(candidate.disclosure)
    && Boolean(candidate.safety);
}

/** Captures every mutable publish setting once for a single pipeline item. */
export function createPipelineFormDataSnapshot<T extends Record<string, any>>(
  flow: PipelineFlow,
  input: T,
): T & PipelineFormDataSnapshot {
  const existing = input?.pipelineConfigSnapshot;
  const config = isPipelineConfigForFlow(existing, flow)
    ? existing
    : resolvePipelineConfig(flow);
  const headingImageMode = nonEmptyString(input?.headingImageMode, config.image.headingImageMode);
  const imageSource = nonEmptyString(input?.imageSource, config.image.imageSource);
  const explicitSubImageMode = input?.scSubImageMode;
  const scSubImageMode: ShoppingSubImageMode = explicitSubImageMode === 'ai' || explicitSubImageMode === 'collected'
    ? explicitSubImageMode
    : config.shopping.subImageMode;

  return {
    ...input,
    pipelineConfigSnapshot: config,
    headingImageMode,
    includeThumbnailText: typeof input?.includeThumbnailText === 'boolean'
      ? input.includeThumbnailText
      : config.image.thumbnailTextInclude,
    skipImages: input?.skipImages === true
      || config.image.textOnlyPublish
      || headingImageMode === 'none'
      || imageSource === 'skip',
    imageSource,
    imageStyle: nonEmptyString(input?.imageStyle, config.image.imageStyle),
    imageRatio: nonEmptyString(input?.imageRatio, config.image.imageRatio),
    thumbnailImageRatio: nonEmptyString(input?.thumbnailImageRatio, config.image.thumbnailImageRatio),
    subheadingImageRatio: nonEmptyString(input?.subheadingImageRatio, config.image.subheadingImageRatio),
    imageFallbackPolicy: nonEmptyString(input?.imageFallbackPolicy, config.image.fallbackPolicy),
    scSubImageMode,
    scAIImageEngine: normalizeShoppingConnectAIEngineCandidate(input?.scAIImageEngine)
      || config.shopping.aiImageEngine,
    scAutoThumbnailSetting: typeof input?.scAutoThumbnailSetting === 'boolean'
      ? input.scAutoThumbnailSetting
      : config.shopping.autoThumbnail,
  };
}
