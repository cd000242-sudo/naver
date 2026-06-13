// [SPEC-STABILITY-2026 Phase 7.1] Single resolution point for publish-pipeline
// settings. Each flow entry calls resolvePipelineConfig() ONCE per publish item
// and passes the object down — downstream/shared code must not read
// localStorage directly (pipeline-map §5-1). Key names and defaults are
// defined HERE and nowhere else; three flows must never interpret the same
// key with different defaults again.

export type PipelineFlow = 'full-auto' | 'continuous' | 'multi-account';
export type ShoppingSubImageMode = 'ai' | 'collected';

export interface ImagePipelineConfig {
  headingImageMode: string;
  thumbnailTextInclude: boolean;
  textOnlyPublish: boolean;
  imageStyle: string;
  imageRatio: string;
  thumbnailImageRatio: string;
  subheadingImageRatio: string;
}

export interface ShoppingConnectPipelineConfig {
  subImageMode: ShoppingSubImageMode;
  aiImageEngine: string;
  autoThumbnail: boolean;
}

export interface PipelineConfig {
  flow: PipelineFlow;
  resolvedAt: number;
  image: ImagePipelineConfig;
  shopping: ShoppingConnectPipelineConfig;
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
  };
}

const SHOPPING_AI_ENGINE_NAMES = new Set([
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

function normalizeShoppingSubImageMode(raw: RawPipelineSettings): ShoppingSubImageMode {
  const explicit = raw.scSubImageMode;
  if (explicit === 'ai' || explicit === 'collected') return explicit;

  const legacy = raw.scSubImageSource;
  if (legacy === 'ai' || legacy === 'collected') return legacy;
  if (legacy && SHOPPING_AI_ENGINE_NAMES.has(legacy)) return 'ai';

  return 'collected';
}

export function resolvePipelineConfig(flow: PipelineFlow): PipelineConfig {
  const raw = readRawPipelineSettings();
  return {
    flow,
    resolvedAt: Date.now(),
    image: {
      headingImageMode: pipelineReadString('headingImageMode', 'all'),
      thumbnailTextInclude: pipelineReadBool('thumbnailTextInclude'),
      textOnlyPublish: pipelineReadBool('textOnlyPublish'),
      imageStyle: pipelineReadString('imageStyle', 'realistic'),
      imageRatio: pipelineReadString('imageRatio', '1:1'),
      thumbnailImageRatio: pipelineReadString('thumbnailImageRatio', '1:1'),
      subheadingImageRatio: pipelineReadString('subheadingImageRatio', '1:1'),
    },
    shopping: {
      subImageMode: normalizeShoppingSubImageMode(raw),
      aiImageEngine: raw.scAIImageEngine || 'nano-banana-pro',
      autoThumbnail: raw.scAutoThumbnailSetting === 'true',
    },
  };
}
